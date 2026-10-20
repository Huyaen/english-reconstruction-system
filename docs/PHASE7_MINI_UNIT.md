# Phase 7 — Mini Unit（跨学习日的主题学习引擎）

> Mini Unit 不是一个单元页，也不是一张三日任务表。
> 它是「一份真实材料 + 一组真实目标 + 2–4 个有效学习日 + 真实证据」的闭环：
> 建立理解 → 强化 → 脱离辅助 → 迁移 → 评估。

## 1. 为什么这样设计

| 反模式 | 本实现的处理 |
| --- | --- |
| 每天随机换一篇文章 | 单元绑定**一份** Anchor，Day 1/2 都围绕它；材料变了必须显式换 |
| 给今日计划贴个主题标签 | Unit 是独立领域对象（状态机 + 证据 + 完成判定），Planner 只是消费者 |
| AI 一次生成一套课程 | AI 只做强化材料；Anchor 必须是真实材料，AI 材料被状态机硬拒绝 |
| 三天固定清单 | 每天的重点/材料/辅助级别由**证据**决定；Day 2 提前完成与 Day 4 延长都有硬门槛 |
| 三天结束就宣称掌握 | 完成判定分 `completed_verified` / `completed_limited_evidence` / `user_ended` / `extended` / `abandoned`，缺真实迁移证据一律降级 |

## 2. 模块划分（IO / 逻辑 / UI 分离）

| 文件 | 职责 | 依赖 |
| --- | --- | --- |
| `src/miniUnit.ts` | 状态机、日推进规则、目标词预算、完成判定闸门、Anchor 适用性与来源映射（纯函数） | types |
| `src/miniUnitSelection.ts` | 主题推荐、Anchor 候选、目标词汇（复用 Learning Value）、目标语法（复用知识图谱 + 可观察性正则）、迁移材料候选 | grammar / pools / aiQuality |
| `src/miniUnitEvidence.ts` | 证据汇总（目标词独立回忆、语法、句子、阅读、计划、AI）、按学习日取证据、是否发生过真实学习 | types |
| `src/miniUnitProgression.ts` | 当日计划规格（重点/材料/辅助级别/证据目标/AI 可选）、AI 复用键、迁移证据构造 | miniUnit / evidence / selection |
| `src/miniUnitStore.ts` | IndexedDB 持久化：创建互斥、revision 乐观并发、幂等转换 | db |
| `src/miniUnitActions.ts` | 应用层编排（创建/绑定 Anchor/开始/完成/暂停/延长/结束/基线/迁移） | 以上全部 |
| `src/miniUnitView.ts` | 页面 HTML（创建页 / 单元页 / Anchor 选择器） | ui.esc |

`app.ts` 只做三件事：导航项、渲染分发、把按钮事件交给 actions；单元业务逻辑 0 行在 app.ts 里。

## 3. 状态机

```
draft ──attach-anchor──▶ draft ──set-targets──▶ ready ──start──▶ active
                                                             │  │  │
                                     complete-day 1 ─────────┘  │  │
                                     complete-day 2 ────────────┘  │
                                     complete-day 3 ───────────────┘
active ⇄ paused           active --extend(3 天后)--> plannedDays=4
active --finish--> completed（decision 由证据决定）
any    --abandon--> abandoned
```

- **Ready 硬条件**：真实 Anchor（非 AI）+ 至少 1 个目标词 + 至少 1 个目标语法。
- **顺序闸**：只能完成 `nextDay`，不能跳过；没完成 Day 1 不能进 Day 3。
- **幂等**：重复提交同一天返回 `noop`，`dayHistory` 不会重复。
- **证据闸**：`complete-day` 至少 1 条真实活动证据（作答/精读/阅读会话）；仅打开页面会被拒绝。
- **已结束保护**：completed/abandoned 之后任何推进都被拒绝（`unit-closed`）。
- **旧数据**：`status`（active/completed/extended/abandoned）保持不变；没有 `stage` 的旧记录由 `status + dayIndex` 推导，备份完全兼容。

## 4. 学习日语义（calendar day ≠ learning day ≠ unit day）

- **unit day**：单元内的第 N 个学习日，由 `dayHistory` 决定，跟自然日无关。
- **learning day**：只有产生真实活动证据的那一天才算；中断两天回来仍继续 Day 2，不会自动跳到 Day 3（浏览器验收 D 场景实测）。
- **calendar day**：只写进 `dayHistory.calendarDate` 作为记录，不参与推进判断。

## 5. 主题推荐（真实依据，不编造兴趣）

输入：阅读库真实材料、词库（含薄弱词）、语法概念证据、最近单元、可用时间。

- 按 `topic`（缺失时用标题实词）聚合真实材料；**AI/教学材料不参与**；
- 排序依据 = 材料数量 + 材料中的薄弱词数 + 可观察语法数 − 近期已用主题 − 超长材料惩罚；
- 每条推荐输出 `whyRecommended`（引用具体篇名/词/结构）、`basis`（材料、薄弱词、语法、难度、近期主题）、目标词与语法、难度估计与置信度；
- 最多 3 条，**不足就少给**（不凑数）；学情证据不足时标 `insufficientEvidence` 并写明「推荐主要基于材料与长度」；
- 阅读库没有真实材料 → 返回空 + 明确指引（粘贴/导入/截图 OCR/URL），绝不生成 AI 文章充当 Anchor。

## 6. Anchor

- 来源映射：导入/上传/OCR/库条目 → `user_imported_authentic`；URL/网页 → `authentic_external`；精选 → `curated_authentic`；AI → `ai_generated`（被拒绝）。
- `anchorSnapshotRef = passageId#contentHash`：材料内容变更后可检测。
- 适用性：AI 材料直接拒绝；>1200 词提示拆分；过难提示；comfort 建议 2 天。
- 缺失 Anchor 时只能停在 draft，UI 引导去阅读库选/导入，不会自动生成。

## 7. 目标词汇与语法

- **词汇**：从 Anchor 文本分词，取**词库中真实存在的词**，按 `learningValue × log(词频) + 薄弱词加成` 排序；数量 = `时间 × 0.35 ×(1.1−难度) ×(1−到期负荷) ×能量系数`，夹在 6–18（默认下限 3），**没有固定 30 个**；词库未覆盖的高频词单独报告（提示导入词书），不凭空造目标词。
- **语法**：只用知识图谱里**有可观察正则**的概念；在 Anchor 中真实出现 → `verified` 并附出现次数与例句片段；只有薄弱点、材料里没出现 → `candidate`（明说未核验）；最多 3 个。

## 8. Day 1 / 2 / 3 / 4

| 天 | 类型 | 辅助 | 材料 | 重点 | 完成标准 |
| --- | --- | --- | --- | --- | --- |
| 1 | build | 高（允许中文） | Anchor | 预览 → **冷测** → 目标词 → 基础语法 → 舒适阅读 → 少量句精读 → 复盘 | 真实冷测 + 目标词暴露 + 一条结构复述 |
| 2 | strengthen | 中（少量中文） | 同 Anchor（辅助减少） | 隔夜回忆 → 语法强化 → 较复杂句 → 成长阅读 → 复盘 | 隔夜回忆 + 语法独立作答 + 一次结构迁移 |
| 3 | transfer | 低（中文关闭） | **新的真实材料**（无则退回 Anchor 并明确警告） | 新材料独立冷读 → 独立理解 → 目标词迁移识别 → 结构辨认 → 一句话主旨 | 新材料独立理解 + 迁移识别 + 表达 |
| 4 | reinforce | 低 | Anchor 相关段落 | 残余弱词修复 → 残余结构修复 → 关键段落重读 → 收尾决定 | 残余弱词独立回忆 + 语法独立作答 |

分钟分配统一走 `allocate()`：权重 → 取整 → 从最大项削减直到 ≤ 预算（Time Budget First），任何一天都不会超时。

Day 1 的冷测位置是硬要求：`MiniUnitBaseline.source` 只接受 `cold_test`（真实冷测会话）或 `estimated`（明确标注，不冒充）；有真实基线后不会被估计值覆盖。

## 9. 迁移判定（最容易造假的地方）

`MiniUnitTransferRecord.materialKind`：

- `authentic`：**不同**的真实材料 + 无辅助 + 独立完成 + 有理解度；
- `ai_assisted`：AI 强化材料，或沿用了 Anchor（同材料重读），或用了辅助。

`guardDecision()` 是最后一道闸：`completed_verified` 必须同时满足「真实新材料 + 独立 + 理解度 ≥ 0.5」，否则一律降级为 `completed_limited_evidence` 并把原因写进 `reasons`。Day 2 提前完成还额外要求：独立回忆 ≥ 3 个目标词、语法有独立证据、支持后理解 ≥ 60%。

## 10. 完成评价

`evaluateUnit()` 只使用 `collectUnitEvidence()` 的真实记录，输出：

- `metrics`：目标词覆盖/独立回忆/遗忘词/语法证据/冷测/支持后/迁移/辅助减少/中文依赖/未解决障碍/学习日数；
- `decision`、`confidence`（无证据必然 low）、`reasons[]`、`evidenceRefs[]`、`nextActions[]`。

页面上直接展示这些内容，而不是「Day 2 Complete / 学习分 83」。

## 11. 证据口径（与 Phase 4/5 一致）

| 记录 | 算什么 | 不算什么 |
| --- | --- | --- |
| `ReviewRecord(reason='answer', correct)` 目标词、单元开始后 | 独立回忆证据 | 生成、预览、曝光 |
| `GrammarAttempt(independent, supportLevel=0)` | 独立语法证据 | 看解析后的作答 |
| `SentenceAttempt` 命中目标词/语法 | 练习证据 | 掌握 |
| `ReadingSession` on Anchor | 冷测/支持后阅读 | 迁移 |
| `ReadingSession` on **另一篇真实材料**（无 helps） | 迁移证据 | 熟悉度 |
| `AIGeneration` | 只有材料 | 任何掌握 |

## 12. AI 集成（复用 Phase 6，不新建 Provider）

- 生成入口仍是 `aiGenerate.ts`（`generateSentence` / `generateReading`）→ Provider → 校验 → 质量门；
- 单元只提供**可选**材料：Day 1 例句、Day 2 强化短文、Day 3 缺真实材料时的 AI 练习（标 `ai_assisted`）、Day 4 补救材料；
- **复用键** `unitReuseKey = unitId|dN|目标词|目标语法|promptVersion` 写入 `sourceMetadata`；生成前先查同键的合格记录，命中就复用，刷新/重规划不会重复扣费；
- 未配置 AI：单元完全可用（Vocabulary/Sentence/Reading 全部本地），页面不会出现假 AI 任务；浏览器验收实测 0 次请求。

## 13. Planner 集成

- Unit 只提供：当前阶段、目标词/语法、可用材料、弱词、辅助级别、时间偏好；
- `PlannerInput.miniUnit` 与 `DailyPlan.miniUnitId` 沿用既有字段，**Planner 未被重写**；
- 每天的阅读材料通过 `readingInput.passages` 收窄（Day 3 传新材料），Planner 仍决定具体任务与时长；
- 时间预算、到期复习优先、无假 Input/Output 任务都由既有 Planner 保证（测试覆盖）。

## 14. 持久化与并发

- `createUnit()`：单事务内检查是否已有未结束单元 → 有则抛 `ActiveUnitExistsError`（两个窗口不会各建一个）；
- `saveUnit(unit, expectedRevision)`：revision 不匹配抛 `StaleUnitError`，绝不静默覆盖；
- `applyTransition(id, fn)`：读-改-写在一个 readwrite 事务里，重复/并发晋级只有一次生效（浏览器验收 G 场景：两次并发只产生一条 Day 记录）；
- 单元可从任何一步刷新恢复（A 场景实测：Day 1 完成 → 刷新 → Day 2 待开始）。

## 15. 数据库

DB 仍为 **v5**：MiniUnit 新增字段全部可选，不需要新建 store 或索引，因此**没有迁移**，旧备份可直接读入。被保留的 store：Vocabulary Evidence / FSRS / Reading Sessions / Sentence Attempts / Grammar Evidence / Daily Plans / AI Generations。

## 16. UI

- 导航新增「主题单元」；没有单元时是主题推荐页（最多 3 张卡 + 自定义主题 + 上一单元入口）；
- 单元页：进度圆点、Anchor 卡、目标词/语法、今日重点（分钟 + 为什么）、材料、完成标准、已完成学习日、当前真实状态、未解决障碍、完成评价；
- 操作：进入今日 / 完成今天（需先填可选摘要）/ 提前结束并评估 / 暂停 / 继续 / 延长 Day 4 / 放弃；完成后仍可回看评价，再点「开始新的 Unit」。

## 17. 验收证据

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npx tsc --noEmit -p tsconfig.json` | 0 error |
| 单元/集成 | `npm test` | **208/208**（新增 32：状态机/推荐/证据/评价/持久化/Planner） |
| 生产构建 | `npm run build` | 通过；测试钩子命中 0 |
| 浏览器验收 | `SMOKE_PORT=9227 node scripts/phase7-smoke.mjs` | **33/33** |
| Phase 6 回归 | `phase6-smoke.mjs` | 31/31 |
| Phase 5.1 / 5 / 4 / 3 | 各自 smoke | 26/26 · 44/44 · 36/36 · 21/21 |

浏览器验收覆盖：A 正常 Unit（冷测 → 完成 Day 1 → 刷新恢复）；B Day 2 隔夜回忆与减少辅助；C Day 3 新真实材料 + 迁移 + 完成评价；D 跨天恢复不跳级；E 无 AI 全本地可用、0 请求；F AI 材料不出现在 Anchor 选择器；G 并发晋级只生效一次；H 旧格式 MiniUnit 兼容且旧数据完好、无 JS 异常。

## 18. 已知限制

- 真实 AI 供应商 E2E 仍未验收（无凭据）；Phase 7 复用了 Phase 6 的协议级 mock 结论，没有新的真实调用证据。
- 迁移必须有**另一篇真实材料**；只有一篇材料时只能做 AI-assisted 练习，完成判定会降级——这是设计约束，不是 bug。
- 语法「可观察性」仍是正则启发式，语义型概念只能是 `candidate`。
- 输出侧只有一句话自评（Phase 9 Output Lab 未实现），不冒充输出诊断。
- 主题推荐没有用户兴趣画像（Settings 里没有该字段），只能基于材料/薄弱词/语法/近期单元，证据不足时会明说。
- 单元页不做全表扫描：证据来自既有 store 的一次性读取；材料分析未做持久缓存（Phase 8 可加，需带失效规则）。
