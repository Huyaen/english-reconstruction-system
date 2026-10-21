# Phase 8 — Real Input Hub（真实输入中心）

> 状态：已交付（2026-10-21）。数据库版本 **v6**。上一阶段：Phase 8 补充 Dynamic Interest Profile。
> 定位：把用户**真正在看的英语内容**（视频、播客、讲座、访谈）接进系统。系统只保存用户真实提供的信息，不抓取平台内容、不猜标题/时长/语言，也不把“看过”当成“学会”。

## 1. 为什么需要它

词汇、句子、阅读三个模块都以“作者/用户提供的文本”为输入。真实输入（视频/播客）是更常见的英语来源，但有三类风险：

1. **伪造元数据**：抓不到标题就自动生成、抓不到字幕就假装有字幕。
2. **证据污染**：把“看了 20 分钟”写成“听力 80 分”，污染掌握度。
3. **黑箱推荐**：没有材料也硬推“为你精选”，或把兴趣当能力。

Phase 8 的答案是：**只收录可追溯的链接与用户自报信息 + 把“曝光”与“掌握”结构性分开 + 推荐必须给可核对理由**。

## 2. 长期规格（L1–L12）

| 编号 | 规格 |
| --- | --- |
| L1 | 只接受 `http/https` 链接；`javascript:` / `data:` / `file:` / `blob:` 一律拒绝。 |
| L2 | 标题、时长、语言、字幕**默认未知**；用户不填就留空，绝不从 URL 猜测。 |
| L3 | 新材料的 `verificationStatus` 恒为 `unverified`；没有英文 transcript 之前 `difficultyEstimate = null`。 |
| L4 | 字幕只解析用户提供的文件（SRT/VTT/TXT）；provenance 原样保留，`user_supplied` **永不**升级为 `official_subtitle`。 |
| L5 | 时间轴不可靠（缺时间戳、乱序、重叠）必须显式报错或警告，不猜。 |
| L6 | 会话状态机：`created → active → paused → reflection → completed`，任一非终态可 `abandoned`；非法转换返回错误，不静默。 |
| L7 | 每次成功转换 `revision + 1`；写入必须带 `expectedRevision`，两标签页并发只允许一个成功。 |
| L8 | 观看时长只有**自报**，属于 exposure，不是掌握证据；`inputEvidence` 不产生任何“听力分数”。 |
| L9 | 复盘分 Light / Standard / Deep；Standard 保存用户原文，不做无依据的“理解准确率”评分。 |
| L10 | 字幕 → Reading 复用 Phase 5 `Passage`；难句 → Phase 4 句库，结构标记 `none`（未验证），不伪造 gold parse。 |
| L11 | Planner 仍由 Phase 3 确定性排布，时间预算优先：只排装得进剩余时间的片段，不强求看完整个视频。 |
| L12 | 没有真实材料就不生成输入任务、不给个性化推荐；只能提示“先添加一个你真正想看的链接”。 |

## 3. 数据模型（DB v6，additive only）

新增 5 个 store：

| store | 内容 |
| --- | --- |
| `inputSources` | 用户保存的材料：URL、平台、标题、主题、时长、字幕引用、`verificationStatus`、`difficultyEstimate` |
| `inputSessions` | 一次输入会话：模式、状态、revision、冷测、复盘、自报观看时长、关联 Mini Unit |
| `libraryItems` | 材料库条目：收藏、最近打开、归档；**只管材料，不管兴趣** |
| `transcripts` | 解析后的字幕：cues、时间轴、语言、provenance、hash |
| `inputEvidence` | 证据账本：幂等键 `sessionId:type` |

`InputSource` 关键字段：

```ts
type InputProvenance = 'user_supplied' | 'official_subtitle' | 'manually_transcribed'
                    | 'machine_generated_unverified' | 'unknown';
interface InputSource {
  id: string; url: string; provider: 'youtube' | 'bilibili' | 'podcast' | 'other';
  title: string; topic: string; durationMinutes: number | null;
  transcriptRef: string | null;
  verificationStatus: 'unverified' | 'title_confirmed' | 'transcript_confirmed' | 'played';
  difficultyEstimate: number | null; difficultyBasis: 'none' | 'transcript_estimate' | 'user_rated';
}
```

## 4. 模块分层（每个文件只做一件事）

| 文件 | 职责 |
| --- | --- |
| `inputUrl.ts` | URL 校验 + 规范化（去追踪参数）+ 平台识别（只取 URL 可靠信息） |
| `transcript.ts` | SRT/VTT/TXT 解析；provenance 保留；时间轴可靠性检查 |
| `inputSource.ts` | 材料创建/更新；不变量：新记录 `unverified`、无字幕 `difficulty=null` |
| `inputLibrary.ts` | 收藏 / 最近打开 / 归档 / 过滤；与兴趣解耦 |
| `inputReflection.ts` | Light/Standard/Deep 复盘校验与完成度计算；证据类型映射 |
| `inputSession.ts` | 状态机与转换前置条件；`suggestMode()` |
| `inputEvidence.ts` | 证据写入（幂等、自评置信度 <1）+ `inputAnalytics()` |
| `inputRecommendation.ts` | 与 Mini Unit 共用兴趣画像；四类理由；探索位；难度不受兴趣影响 |
| `inputHandoff.ts` | transcript → `Passage`；难句候选 → 句库记录 |
| `inputDifficulty.ts` | 仅在有英文 transcript 时估难度，否则 `null` |
| `inputStore.ts` | 单事务读写：revision 比较、证据幂等、字幕按 hash 去重 |
| `inputActions.ts` | 应用层编排（所有写入经过 store） |
| `inputView.ts` | 纯 HTML 视图（材料库 / 添加链接 / 字幕 / 会话 / 复盘 / 推荐理由） |
| `inputPlanner.ts` | Time Budget First 的输入任务建议 |

## 5. 会话状态机

```
created ──start──▶ active ──pause──▶ paused ──resume──▶ active
                     │                  │
                     ├──reflect─────────┴──▶ reflection ──complete──▶ completed
                     └──abandon──▶ abandoned（任一非终态可进）
```

- `complete` 前置条件：**必须已有复盘**；否则 `illegal-transition`。
- 并发：`transitionSession(id, expectedRevision, fn)` 在同一事务里读→比 revision→写；旧 revision 返回 `stale`。
- 幂等：`complete` 对已完成会话返回 `noop`（不重复写证据、不重复累加时长）。

## 6. 冷测（baseline）与复盘

**冷测**在观看前记录：字幕模式、粗听理解（%）、计划分钟、最大障碍。它保存为 `recorded`，**不会**在复盘时被反填或"修正"。

**复盘**三档：

| 模式 | 要求 | 完成度上限 | 证据 |
| --- | --- | --- | --- |
| Light | 字幕模式 + 理解度 + 可选备注 | 0.6 | `self_report` |
| Standard | 3–5 句英文总结（保存原文，不评分） | 0.85 | `self_report` + `output_attempt` |
| Deep | 主旨 + 3 个要点 + 可选观点/复述 | 1.0 | `self_report` + `output_attempt` |

**没有**“听力分数”“理解准确率”这类字段：系统只保存用户自评与用户原文，把判断留给后续真实使用。

## 7. 证据口径

| 类型 | 含义 | 是否算掌握 |
| --- | --- | --- |
| `watching_exposure` | 用户自报观看时长 | ❌ 纯曝光 |
| `self_report` | 自评理解/难度（confidence < 1） | ❌ 自评 |
| `transcript_reading` | 阅读字幕文本 | ❌ 曝光 |
| `independent_comprehension` | 无字幕理解任务的可核对结果 | ✅ 但必须由任务产生（本阶段 UI 未生成，保留类型） |
| `output_attempt` | 总结/复述原文 | ❌ 产出记录，不是掌握证明 |

证据 ID = `sessionId:evidenceType`，重复写入是 no-op；因此并发完成、刷新重放都不会翻倍。

## 8. 字幕与交接

- 解析支持 SRT / VTT / TXT；TXT 无时间轴（`timed=false`）。
- 时间戳缺失、乱序、重叠：**报错或警告**，保留原始时间，不“修复”成看起来合理的值。
- 重复导入按内容 hash 去重。
- **送入 Reading Lab**：生成 `Passage`，保留 `inputSourceId` / `transcriptId` / caption 时间范围 / provenance；阅读侧看不到"平台自动字幕"这种假来源。
- **难句候选**：≥8 词的字幕行，启发式排序；送入句库后 `structureProvenance = 'none'`，句法练习会按“结构未验证”处理。

## 9. 推荐

与 Mini Unit 共用同一份兴趣画像（`interestProfile.ts`），理由四分类互斥优先：

1. `Based on your interests`（显式兴趣命中）
2. `Related to your Mini Unit`（当前单元主题/目标词）
3. `Based on your recent activity`（近期完成/打开的输入）
4. `Explore something new`（有真实来源、但不在画像内的探索位）

每条推荐附带**可核对事实**：平台、主题、时长、字幕状态、可用性（“仅保存链接，未验证播放”）、历史（"还没有完成过这次输入"）、难度依据。没有材料时 `candidates=[]` 并返回说明，不伪造卡片。

**兴趣不影响难度**：难度估计只读 transcript；`difficultyEstimate` 与画像完全解耦（Phase 8 补充的 AC9 同样在此生效）。

## 10. Planner 接入

- 有未完成会话 → 生成“继续上次真实输入”（剩余分钟数）。
- 有材料但未开始 → 生成片段级输入任务，时长取 `min(剩余预算, 建议片段)`，**不要求看完整个视频**。
- 没有材料 → 不产生任何输入任务。
- 输入任务与其余任务共享同一预算与排序；完成输入后才更新完成计数。

## 11. UI

导航新增 `真实输入`（Input Hub）：

- 顶部：今日建议（推荐卡片 + 理由标签 + 事实）
- 材料库：搜索 / 状态 / 字幕 / 类型过滤；收藏、最近打开、归档、删除
- 添加链接：URL、标题、主题、时长（都可留空）
- 会话页：冷测 → 外部打开 → 复盘（三档）→ 完成；字幕导入与交接
- 统计：完成次数、自报分钟、字幕模式分布、难度原因分布、理解度序列、按单元分钟数
- 兴趣未设置时明确显示“未设置”，不假装个性化

## 12. 验收标准（AC1–AC14）

| AC | 断言 | 覆盖 |
| --- | --- | --- |
| AC1 | 只接受 http/https，拒绝 `javascript:`/`data:`/`file:`/`blob:` | `inputCore.test.ts` |
| AC2 | 规范化去重（追踪参数不产生重复材料） | `inputCore.test.ts` |
| AC3 | 新记录 `unverified`，无字幕 `difficulty=null` | `inputCore.test.ts` + smoke A |
| AC4 | SRT/VTT 时间轴解析正确；TXT 无时间轴 | `inputCore.test.ts` + smoke E |
| AC5 | 时间轴不可靠时报错/警告，不猜 | `inputCore.test.ts` |
| AC6 | provenance 原样保留，`user_supplied` 不升级 | `inputCore.test.ts` |
| AC7 | 状态机非法转换被拒绝；revision 单调；并发只有一个成功 | `inputCore.test.ts` + smoke K |
| AC8 | 复盘三档的完成度上限与证据类型 | `inputCore.test.ts` + smoke C/D |
| AC9 | 观看时长=exposure；无“听力分数”字段 | `inputCore.test.ts` + smoke C |
| AC10 | 证据幂等（并发/重放不翻倍） | `inputCore.test.ts` + smoke K |
| AC11 | 字幕 → Reading 保留 inputSource/transcript/时间范围 | smoke E |
| AC12 | 难句 → 句库 `structureProvenance='none'` | smoke E |
| AC13 | Planner：有材料才排输入任务，且服从时间预算 | `planner.test.ts` + smoke G/H |
| AC14 | 推荐理由四分类；无数据不伪装；兴趣不影响难度 | `inputRecommendation.test.ts` + smoke A/B/I |

补充回归：`backupV6.test.ts` 锁住“自己导出的备份必须自己能恢复”（见 §14 缺陷 1）。

## 13. 测试与验收结果

| 层 | 结果 |
| --- | --- |
| 单元测试 | **275/275**（新增 `inputCore` 31、`inputRecommendation` 21、`backupV6` 2） |
| 类型 | `tsc --noEmit` 0 error |
| 构建 | `npm run build` 通过；生产包测试钩子命中 **0** |
| Phase 8 浏览器冒烟 | **34/34**（A–L + Z，真实 Edge + CDP + IndexedDB） |
| 回归 | Phase 7 33/33、6 31/31、5.1 26/26、5 44/44、4 36/36、3 21/21 |

## 14. 本阶段修掉的真实缺陷

1. **备份无法恢复自己**：`validateBackup` 用 `[a-zA-Z0-9_-]` 校验 model store 的 id，而默认句库 id 含 `.`（`sen.curated.*`）、输入证据幂等键含 `:`，导致导出→恢复必失败。已放宽为 `[a-zA-Z0-9._:-]`，并加 `backupV6.test.ts` 锁死。
2. **字幕行太短时没有难句候选**：UI 用默认 12 词阈值，2 行字幕全被过滤；改为 8 词并显示候选条数，避免"看起来有功能其实永远空"。
3. **DB 升 v6 打穿旧断言**：`plannerStore` 写死 v4、`plannerUi` 预算/能力断言、`phase3` 能力门控文案均需同步（历史规律：每次升版本都会打穿这三处）。
4. **冒烟脚本自身的时序假设**：`mark-open` 后立即填表单会被随后的重渲染清空；`完成` 点击早于复盘落库会被状态机正确拒绝。脚本已改为等待持久化信号，而不是等 UI 文案。

## 15. 诚实边界（本阶段不做）

- **不抓取平台内容**：没有 YouTube/Bilibili API 集成，标题、时长、字幕全部依赖用户提供；链接只做保存与外部打开。
- **不播放/不嵌入**：不提供站内播放器，避免版权与追踪问题；“已打开”是用户自报。
- **不做自动字幕识别**：音频转写不在本阶段范围（图片 OCR 属 Phase 5.1）。
- **不判断“听懂了”**：`independent_comprehension` 类型保留，但本阶段 UI 没有产生它的任务，因此不计入任何掌握路径。
- **推荐是规则排序，不是语义推荐**：基于主题关键词、真实行为与难度适配，不做 embedding 相似度；因此可能出现“同主题但不同角度”的重复感，这点在 Phase 8 补充的防重复规则里用排序窗口缓解，而非语义去重。
- **难度估计粗糙**：基于 transcript 的词汇/句长启发式，低置信度；它不是 CEFR 评级。
