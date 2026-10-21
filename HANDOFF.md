
# HANDOFF — Phase 9 → Phase 10（2026-10-21）

**Phase 9（Output Lab）已交付并推送。下一阶段由用户指定（`STATE.next_task_id = await_user_phase10_directive`）。**

## 1. 当前工程状态

| 项 | 值 |
| --- | --- |
| 根目录 | `D:\英语重构训练\vocabulary-app` |
| 分支 | `main` |
| DB 版本 | **v6**（Phase 9 未新增 store；`outputAttempts` 只加可选字段） |
| 测试 | **308/308**（`npm test`） |
| 类型检查 | `tsc --noEmit` 0 error |
| 构建 | `npm run build` / `build:test` 通过；生产包测试钩子 0 |
| 浏览器验收 | Phase 9 **20/20**、Phase 8 34/34、兴趣 19/19、Phase 7 33/33、Phase 6 31/31、Phase 5.1 26/26、Phase 5 44/44、Phase 4 36/36、Phase 3 21/21 |
| 远程 | `Huyaen/english-reconstruction-system`（Private），HEAD 与 CI 见 §9 |

## 2. Mini Unit API（Phase 8 直接复用）

```ts
// 纯逻辑（src/miniUnit.ts）
stageOf(unit): 'draft'|'ready'|'active'|'paused'|'completed'|'abandoned'
readiness(unit): { ok, missing[] }              // 真实 Anchor + 目标词 + 目标语法
nextDay(unit), completedDays(unit), plannedDays(unit)
dayKind(day), supportLevelFor(day), dayLabel(day)
applyUnitEvent(unit, event): { ok, unit | error }   // attach-anchor/set-targets/start/complete-day/pause/resume/extend/finish/abandon
evaluateUnit(unit, evidence, now): UnitCompletionEvaluation
guardDecision(unit, evaluation): UnitCompletionEvaluation   // 缺真实迁移 → limited
earlyCompletionCheck(unit, evidence): { allowed, reasons }
anchorSuitability(passage, report), provenanceOf(passage), targetWordBudget(input)

// 推荐与目标（src/miniUnitSelection.ts）
recommendThemes({ passages, words, grammar, units, now, availableMinutes }): { themes, note }
selectTargetVocabulary({ passage, words, now, availableMinutes }): { words, uncovered, budget }
selectTargetGrammar({ passages, grammar }): MiniUnitGrammarTarget[]
transferCandidates(passages, unit): Passage[]

// 证据与推进（src/miniUnitEvidence.ts / miniUnitProgression.ts）
collectUnitEvidence(data, unit): UnitEvidenceSummary
dayEvidenceIds(data, unit, day): string[]
planDay({ unit, day, availableMinutes, energy, data }): DayPlanSpec
aiReuseKey(unit, day, promptVersion), findReusableGeneration(data, key)

// 持久化（src/miniUnitStore.ts）与动作（src/miniUnitActions.ts）
createUnit(unit)            // 未结束单元互斥，冲突抛 ActiveUnitExistsError
saveUnit(unit, expectedRev) // 冲突抛 StaleUnitError
applyTransition(id, fn)     // 读改写同事务，幂等
createFromTheme / createCustomDraft / attachAnchor / startToday / completeToday /
pauseUnit / resumeUnit / extendUnit / abandonUnit / finishUnit / recordBaseline / recordTransfer
```

## 3. 状态机（Phase 8 不要绕开）

- `draft → ready` 需要：真实 Anchor（provenance ≠ ai_generated）+ ≥1 目标词 + ≥1 目标语法。
- `complete-day` 只能完成 `nextDay()`，且必须有 ≥1 条真实活动证据；重复提交返回 `noop`。
- `finish` 的 decision 由 `evaluateUnit` + `guardDecision` 决定：**没有「真实新材料 + 独立 + 理解度 ≥0.5」就只能是 `completed_limited_evidence`**。
- `status` 保留旧四值（active/completed/extended/abandoned），`stage` 是细粒度状态；两者必须同步写。

## 4. Anchor 契约

- `anchorMaterialId` + `anchorProvenance`（authentic_external / user_imported_authentic / curated_authentic / ai_generated / authored_educational / unknown）+ `anchorSnapshotRef = passageId#contentHash`；
- AI 材料（`sourceType='ai' | 'ai_reinforcement'`）**永远不能**成为 Anchor，`applyUnitEvent('attach-anchor')` 会直接报错；
- Anchor 缺失时只能停在 draft；材料被删除时 `planDay` 会给出警告，不静默继续。

## 5. Day Progression

| 天 | kind | 材料 | 辅助 | 关键证据 |
| --- | --- | --- | --- | --- |
| 1 | build | Anchor | 高（中文可用） | 真实冷测（在预教前）+ 目标词暴露 |
| 2 | strengthen | Anchor（辅助减少） | 中 | 隔夜回忆 + 语法独立作答 |
| 3 | transfer | **新的真实材料**（没有则警告 + AI-assisted） | 低（中文关闭） | 新材料独立理解 |
| 4 | reinforce | Anchor 相关段落 | 低 | 残余弱词/语法修复 |

`planDay` 的分钟分配严格不超过预算（Time Budget First）；Planner 仍决定实际任务。

## 6. 证据规则（Phase 8 新增证据必须遵守）

- 只统计 `unit.startedAt` 之后的记录；预览、曝光、生成、阅读接触都不算掌握证据；
- 目标词独立回忆 = `ReviewRecord(reason='answer', correct)`；语法独立 = `GrammarAttempt(independent !== false && supportLevel === 0)`；
- 迁移 = 另一篇真实材料上的阅读会话且 `helps.length === 0`；
- AI 生成只产生材料，永久不产生掌握；
- 每个学习日的证据 id 写入 `dayHistory.evidenceIds`，重复完成同一天不会重复写。

## 7. Planner 集成点

- `PlannerInput.miniUnit` + `DailyPlan.miniUnitId`（Phase 3 已有），**不要重写 Planner**；
- 单元只提供：阶段、目标、材料（通过 `readingInput.passages` 收窄）、弱词、辅助级别、时间偏好；
- 尚未实现的能力（Input Hub / Output Lab）不得出现在计划里：`capabilities` 与 `capabilityRequired` 已保证，测试覆盖。

## 8. AI 集成点

- 唯一入口仍是 `src/aiGenerate.ts` → `aiProvider` → `aiValidate` → `aiQuality`；
- 单元材料必须带 `sourceMetadata.miniUnitId` 与 `unitReuseKey = unitId|dN|目标词|目标语法|promptVersion`；生成前查同键合格记录，命中复用（防刷新重复扣费）；
- AI 材料只能进「强化/迁移练习」，UI 必须标 AI，不得进入 Anchor 选择器。

## 9. Git / CI 现状

- 交付提交与 tag：见本次 Phase 7 交付报告（`feat(unit): ...` + `phase7-mini-unit`）；
- 远程核对方式：GitHub API + 代理（`git ls-remote` 在本机会 schannel 握手失败）；
- CI：Node 22/24 两路（tsc / npm test / build / dist 一致性 / 生产包无测试钩子）。

## 10.5 Phase 8 补充：兴趣画像接入点（已完成）

- 数据：`Settings.interests?: InterestProfile`（可选字段，DB 仍 v5、无迁移）。纯函数在 `src/interestProfile.ts`，写入走 `saveSettings`。
- 推荐：`recommendThemes({..., interest:{profile, signals}})`；每条结果带 `reasonKind / reasonTag / reasonZh / exploration / repeat`。
- 信号：`activitySignals(data, now)` 只读（阅读 0.4 / 导入 0.15 / 单元 0.3，21 天衰减）；**禁止写回 profile**。
- UI：单元创建页 `#interest-list`、`#interest-new`、`[data-interest-del]`、`[data-interest-suggest]`、`[data-interest-reset]`。
- 测试钩子：`window.__unitTest.profile() / recommendations() / saveProfile()`（仅 testhooks 构建）。
- 规格与验收：`docs/PHASE8_DYNAMIC_INTEREST.md`（L1–L10 / AC1–AC12）。**Input Hub 必须复用同一套理由分类，不得另造推荐逻辑。**

## 10. Phase 8（Real Input Hub）— 已交付

规格：`docs/PHASE8_REAL_INPUT_HUB.md`（L1–L12 + AC1–AC14）。

- 数据：DB v6，5 个新 store；旧 store 与旧数据不变。
- 纯逻辑模块：`inputUrl` / `transcript` / `inputSource` / `inputLibrary` / `inputReflection` / `inputSession` /
  `inputEvidence` / `inputRecommendation` / `inputHandoff` / `inputDifficulty` / `inputStore` / `inputActions` /
  `inputView` / `inputPlanner`。
- 不变量：新材料 `unverified`；无英文 transcript 时 `difficulty=null`；字幕 provenance 不升级；
  观看时长只算曝光；证据无“听力分数”；`complete` 必须先复盘；revision 并发保护；证据幂等键 `sessionId:type`。
- 与既有模块的边界：字幕 → Phase 5 `Passage`（保留来源/时间范围）；难句 → Phase 4 句库（`structureProvenance='none'`）；
  任务排布仍由 Phase 3 Planner 决定；推荐与 Mini Unit 共用一份兴趣画像。
- 已知边界：不抓取平台内容、不做站内播放、不做音频转写、推荐为规则排序而非语义推荐。
## 11. 下一条精确操作

1. 读 `STATE.json`：`current_phase=phase_8_real_input_hub`、`next_task_id=await_user_phase9_directive`；
2. 核对 `git log -1`、remote SHA 与 CI 结论（本阶段最后一次推送见交付报告）；
3. **等用户指定 Phase 9**。不要自动开始下一阶段；若要扩展输入域，先读
   `docs/PHASE8_REAL_INPUT_HUB.md` §15「诚实边界」，避免把“不抓取/不转写”当成已实现。

# HANDOFF — 换模型 / 换会话所需最小上下文

（更新：2026-10-19 · 最新提交见 git log；Phase 3、Phase 4、Phase 5 已完成并通过实测，下一个任务是 Phase 6）


## 2026-10-19 离线文档复核增补 —— 已在本机完成核验（不再是待办）

- 核验结果：合并前 HEAD=`92f8ec1`（clean），**当时无 origin remote**，Phase 3 未开工；`STATE.last_verified_commit=92fdab0` 为 Phase 2 功能提交，`92f8ec1` 是其上的状态 pin 提交。离线文档包内容与本地快照一致（差异全为新增/纠错），已整体合并。
- `infra_github_remote_001`：历史 secrets 扫描 0 命中 → 创建 GitHub **Private** 仓库 `Huyaen/english-reconstruction-system` → 关联 origin → push main + 阶段 tags → `git ls-remote`/API 双重复核 SHA 与 `private=true` → **passed**（`STATE.remote_sync` 为 verified）。
- `phase3_daily_planner_007`：**passed 2026-10-19**，验收见 `CHECKPOINT.md` §Phase 3、`docs/PHASE3_DAILY_PLANNER.md` §13、`docs/TEST_REPORT.md` §Phase 3。
- 学习数据仍在浏览器 IndexedDB，代码 push 不构成学习数据备份；不要上传真实学习数据库或 API Key。

## Current phase

phase_9_output_lab（passed）—— Phase 9 Output Lab 已交付：任务契约 / 分层辅助 / Repair / 反馈质量门 / 产出证据 / 修改分类 / 迁移与延迟 / Planner 接入。
Phase 0 / 0.5 / 1 / 2 / 3 / 4 / 5 / 5.1 / 6 / 7 / 8 / 9 全部完成并通过。

## Current task_id

`phase9_output_lab_014`（passed，spec：`docs/PHASE9_OUTPUT_LAB.md`）；下一任务 `await_user_phase10_directive`。
Phase 7（`phase7_mini_unit_012`）已 passed：跨学习日的 Mini Unit 状态机 / 主题选择 / Anchor / 证据 / 完成评估 / Planner 交接，见 `docs/PHASE7_MINI_UNIT.md`。

## What is done（累计）

- **Phase 0 审计 / Phase 0.5 调研（`REFERENCE_RESEARCH.md`）/ Phase 1 Data Foundation**：见 `CHECKPOINT.md`。
- **Phase 2 Vocabulary V2（本轮完成）**：
  - `ts-fsrs@5.4.2`（`--save-exact`，MIT）经 `src/fsrs.ts` 适配层接入；**默认调度权威 = fsrs**，legacy 完整保留（设置页可回滚）；每次作答 shadow 双算
  - DB **v3**：`Word.fsrs` + `previewResult` 回填、`fsrs.due` 索引、串行回填（幂等）；backup v3（兼容 v1/v2）
  - 多因素 Rating 映射（首次 Recall 封顶 Good；Easy 需秒答+streak+间隔证据）；`record.rating` 落库
  - **Preview → Recall 强制**：UNSEEN 词不进入正式测试；Preview 记录 previewedAt/previewResult/exposure（跳过不产生 exposure）
  - 三维证据（recognition/activeRecall/productive）+ exposure/production API；生命周期可升可降；forgotten 回流
  - 多词池（foundation/miniUnit/encountered/forgotten）+ 确定性 Learning Value + `recommendedNewWordCount()`（Phase 3 直接调用）
  - UI：首页「今日新词」面板、Preview 会话（1–4 键）、词库生命周期列、词详情（三维/生命周期/FSRS/可提取率）、设置页「调度引擎 / 目标保留率」
- **Phase 3 Daily Planner（本轮完成）**：
  - `src/planner.ts` 确定性领域引擎（预算分配 / Yesterday Recall 抽样与评估 / 保留率 d1·d7 / 恢复决策 / 五模块 Task Contract / Start·Skip·Delay·Replace·超时重排 ≤30% / 隔夜校准 / Regenerate 未完成部分）
  - `src/plannerStore.ts`（dailyPlans，id=本地日期，`savePlan(plan, expectedRevision)` + `StalePlanError` 并发保护）
  - `src/app.ts` Today 主入口（预算 20/30/45/60/自定义 + 状态三档 → 任务卡执行/微调 → Closing Loop 难度反馈 → 刷新恢复）；未上线模块只在 UI 声明 capability、不生成假任务
  - `src/types.ts` PlanItem 统一 Task Contract（字段全部可选 → 旧计划/旧备份继续可读，**DB 仍为 v3**）
- **验证证据（最新）**：`npm test` **69/69**；`npm run build` 成功（544.43 kB / gzip 187.93 kB）；HTTP `/` 200 / 缺失 404；**真实浏览器 smoke 20/20**（无头 Edge 128 + CDP 9224 独立 profile：导入→生成计划→顺序与预算→替换无候选拒绝→Preview→Recall→Closing+难度反馈→刷新恢复→昨日隔夜检测 100% 保留率并触发校准→断更 5 天 Re-entry→无控制台错误）
- **Phase 4 Sentence & Grammar（本轮完成）**：
  - `src/grammar.ts` 显式语法图谱（34 概念 / 6 类 / 先修边，成环即丢弃并报告）+ BKT-lite 掌握估算 + 弱项信号 + 概念知识卡
  - `src/sentenceStructure.ts` 结构表示与严格校验（越界/非法 head/自环/环/重复一律拒绝）；`sentenceSources.ts` 句源契约（12 条 authored 教学句 + gold 结构 + 中文预教词；AI/外部语料未接入只声明不可用）
  - `src/sentenceLab.ts` 引导式拆句（主语→谓语→宾语→修饰→从句→非谓语→逻辑→完整意；L0–L4 分层辅助；即时反馈 + 错误类型；迁移任务）
  - `src/sentenceEvidence.ts` 证据服务（幂等键 = 会话 + 句子；`independent/transfer/delayed/error` 进 BKT，`exposed/hint-assisted` 只计接触）+ JIT 知识卡
  - `src/sentenceSelection.ts` 自适应选句（生词/覆盖率/从句层级/长度/目标结构多维难度；先修不具备先补先修）+ Planner 句任务描述；`sentenceGraphMap.ts` / `sentenceStore.ts` 映射与持久化
  - DB **v4 additive**（`sentences` store + `grammarTags` multiEntry 索引；旧 v3 数据继续可读）；`src/app.ts` 句子页 / 拆句页 / 语法图谱页 / 计划内句任务接线
- **Phase 5 Reading 新增**：`src/readingText.ts`（无损规范化/段落句子词元切分）、`readingImport.ts`（导入流水线+来源边界+URL 安全+CORS/付费墙分类+OCR 能力诚实探测）、`readingDifficulty.ts`（四分类 known/uncertain/unknown/no-evidence，no-evidence 单列）、`readingEvidence.ts`（幂等键 = sessionId+type+key；自评置信度上限 medium）、`readingSession.ts`（preview→cold-test→reading→support→reread→whole-text→closing→completed 状态机）、`readingVocabulary.ts`（explicit/estimated 生词率带分母与覆盖；学习候选分桶）、`readingSentences.ts`（难句→拆句 handoff，非 gold 结构只记接触）、`readingAnalytics.ts`（首读/重读分开统计）、`readingStore.ts`（复用 Phase 1 store，DB 仍 v4）、`readingPlanner.ts`（无材料不排任务，时长服从预算）、`readingView.ts` + `src/app.ts` 阅读页接线 + `src/style.css` 阅读样式
- **验证证据（最新）**：`npx tsc --noEmit` 0 error；`npm test` **134/134**（Phase 5 新增 28 例）；`npm run build` / `build:test` 成功；`node scripts/phase5-smoke.mjs` **44/44**；回归 `phase4-smoke` **36/36**、`phase3-smoke` **21/21**
- **Git 轨迹**：`6c1c625`（基线）→ `9dc0b8b` → `76716a6`（Phase 0.5）→ `8a74ba8`（Phase 1，tag `phase1-data-foundation`）→ Phase 2 提交（tag `phase2-vocabulary-v2`，见 git log）

## What is currently running

无后台任务；工作区 = 已验证状态。

## What remains

Phase 10–13（尚未定义具体规格，等用户指示）。
Phase 9 已完成；若继续做表达域，必须复用 `outputTask/outputFeedback/outputEvidence`，不得另起一套评分或掌握度体系。
已知限制：本地检查不是语法引擎；Repair 判定为粗判；AI 反馈质量取决于 Provider。

## Last verified build

`npm run build` @ Phase 9 → vite 成功（2.42s）；生产包 `__outputTest` 与 `ERV2_TEST_HOOKS` 命中 0（bundle >500 kB 警告保留到 Phase 13）。

## Last verified tests

`npm test` @ Phase 8 兴趣画像工作树 → **221 pass / 0 fail**；真实浏览器 smoke：interest **19/19**、phase7 **33/33**、phase6 **31/31**、5.1 **26/26**、5 **44/44**、4 **36/36**、3 **21/21**（dist-test + `?test=1`，独立 profile 无头 Edge/CDP）。

## Known bugs

- 无阻断性 bug。
- 已知限制（记入 CHECKPOINT/STATE）：bundle >500KB 警告（Phase 13 处理）；fake-indexeddb 基准≠真实性能；Preview 不创建 StudySession（直接落盘，刷新安全）。
- Phase 3 限制：Planner 每词耗时为集中配置的启发式常量（0.35/0.4/0.6 分钟），非个性化测量；reading/input/output 仅声明 capability；Mini Diagnostic 当前只覆盖真实词汇测试。
- Phase 4 限制：句源只有 12 条 authored 教学句（AI 生成与外部语料未接入，UI 明示不可用）；BKT-lite 参数为启发式起点未拟合；结构分析只对 gold/启发式结构负责，非 gold 结构一律标注 provenance/confidence。
- Phase 5 限制：截图导入在没有视觉模型/本地 OCR 时只能人工转录；PDF/DOCX/EPUB 不解析；难度与生词率是估算（explicit 与 estimated 分开、no-evidence 单列）；不做词形还原；阅读只记接触不提掌握；AI 强化文章（Phase 6）未接入。
- 未验收项（TODO P1）：真实供应商 AI 调用；真机移动端。

## Files currently being modified

无（工作区待提交内容已随 Phase 8 交付提交）。

无。

## Database migration status

- 当前 schema：**version 4**（DB 名仍为 `vocabulary-memory-v1`）。v1→v3 / v2→v3 已实测（100% 保留 + 幂等）；v3→**v4 additive**（新增 `sentences` store + `grammarTags` multiEntry 索引，不改旧字段），旧计划/旧备份继续可读；`meta.migration` 记录最近一次真实升级。
- 后续任何 schema 变更走同一框架：`indexSpecs` 增索引 + `runBackfills` 追加回填函数（**串行链，勿并行游标**）+ fixture 测试。

## Next exact action

Phase 5 — Reading（`phase5_reading_009`）：

0. **CI 门禁已就位**（`infra_github_actions_ci_002` passed）：`.github/workflows/ci.yml` 在 GitHub Runner 上跑 Node 22/24（tsc + 全量测试 + build + dist 一致性 + 生产包无测试钩子）。任何 push 到 main 都会触发；阶段完成必须等它 `success`。浏览器验收必须用测试构建：`npm run build:test` → `node server.mjs --dir=dist-test --port=4173`（生产包没有 `__labTest`，这是安全要求）。
1. 读 `PROJECT_SPEC.md` Phase 5 章节 + `AGENT_EXECUTION.md` 阶段门；确认阅读材料的来源契约（与 Phase 4 的 `sentenceSources.ts` 同构：真实材料必须可追溯，未接入就声明 unavailable，不编造出处）
2. 接入方式：Planner **不重写** —— 把 `moduleCapabilities()` 的 `reading` 置为 available 并新增 reading 任务类型（走同一 `PlanItem` contract）；阅读中的难句应通过既有 `sentenceSources`/`sentenceLab` handoff 进入拆句，而不是另起一套
3. 沿用既有纪律：DB 变更必须走 `indexSpecs` + `runBackfills` 串行链并带 fixture 测试；到期口径只用 `effectiveDue()`；测试用 `node --test`（新套件放到 `tests/*.test.ts`）；`node docs/format-source.mjs` → `npm test` → `npm run build`
4. 验收门：`npm test`（不得低于 106 且全绿）→ `npm run build` → HTTP 200 → 真实浏览器 smoke（复制 `scripts/phase4-smoke.mjs` 的 CDP 骨架；钩子只在 `dist-test` 且 `?test=1` 时存在）→ GitHub Actions `success`→ 更新 STATE/CHECKPOINT/HANDOFF/TODO/README/DEVELOPMENT_LOG → commit + tag + push + `git ls-remote` 核对

## Important warnings

1. **迁移只加不删**；新回填必须走 `runBackfills` 串行链；DB 版本变更必须带 fixture 测试。
2. **ts-fsrs 已锁定 5.4.2**（shadow/rollback 均已验证）；不要升级版本或绕过 `src/fsrs.ts` 适配层。
3. 调度权威切换（fsrs/legacy）与 `effectiveDue()` 是唯一到期口径；新代码不要直接读 `w.schedule.due` 做队列。
4. `src/*.ts`、`tests/*.ts` 变更后跑 `node docs/format-source.mjs` → `npm test` → `npm run build`。
5. 浏览器验证用 CDP 无头 Edge（`--remote-debugging-port` + 独立 profile；参考 skill `sillytavern-live-ui-verification` 的 `cdp-st.mjs`；node 驱动必须前台运行）。
6. 不要把 API Key 写入日志/提交；备份始终剔除 Key。
7. 唯一根目录 `D:\英语重构训练\vocabulary-app`；禁止另起工程。
8. 阶段完成按 `AGENT_EXECUTION.md` §4：测试 → build → 更新状态文件 → commit + tag + push + `git ls-remote` 核对远端 SHA。
9. Phase 3 的 Today 计划是**当日唯一**（id=本地日期）：删改计划状态请用 UI 的「跳过/延后/替换」，不要手改 IndexedDB；O 大改动前先导出备份。
