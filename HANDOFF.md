
# HANDOFF — Phase 6 → Phase 7（2026-10-20）

**下一阶段：Phase 7 — Mini Unit（本阶段只做准备，不实现）**

## 1. 当前工程状态

| 项 | 值 |
| --- | --- |
| 根目录 | `D:\英语重构训练ocabulary-app` |
| 分支 | `main` |
| DB 版本 | **v5**（additive：`aiGenerations`；v4 的 `sentences` 与 v2 全部 store 原样保留） |
| 测试 | **176/176**（`npm test`） |
| 类型检查 | `tsc --noEmit` 0 error |
| 构建 | `npm run build` / `npm run build:test` 均通过；生产包测试钩子 0 |
| 浏览器验收 | Phase 6 **31/31**、Phase 5.1 OCR **26/26**、Phase 5 **44/44**、Phase 4 **36/36**、Phase 3 **21/21** |

## 2. AI Service API（Phase 7 直接复用）

```ts
// 配置
normalizeAIConfig(settings.ai): AIProviderConfig
validateAIConfig(cfg): AIErrorInfo | null      // 缺 key/model/endpoint 的明确原因
isConfigured(settings.ai): boolean

// 传输（唯一出口；模块不得自己 fetch Provider）
chat(cfg, { system, user, jsonSchema?, schemaName?, maxOutputTokens? }, deps?, signal?): Promise<ChatResult>
// ChatResult = { text, usage:{promptTokens,completionTokens,estimated}, mode, model, downgradedFrom? }

// 生成（含校验 + 质量门 + 有界重试）
generateSentence(input, cfg, deps?, signal?): Promise<GenResult<SentenceTarget>>
generateReading(input, cfg, deps?, signal?): Promise<GenResult<ReadingTarget>>
// GenResult.ok=false 时带 { error: AIErrorInfo, attempts, issues[] }，绝不返回半成品

// 记录与预算
buildGeneration(kind, output, meta, quality, now): AIGeneration
budgetState(generations, dailyTokenBudget, now): { allowed, usedTokens, limitTokens, dayStart }
contentHashes(generations, kind): Set<string>
```

失败码：`missing-key / missing-model / invalid-endpoint / auth / model-not-found / rate-limit / server / timeout / network / cors / aborted / invalid-response / unsupported-mode / budget-exceeded`。

## 3. Provider 能力

- 只依赖 OpenAI-compatible `POST {endpoint}/chat/completions`（`endpoint` 到 `/v1`）。
- 结构化方式：`json_object` → `json_schema` → `text`（auto 自动降级，`knownMode` 记忆）。
- 不假设 vision / tools / streaming / 大上下文；当前实现不使用它们。
- 超时默认 45s（3–180s 可调），重试默认 2（0–3），并发 1（串行）。

## 4. Prompt 版本（改提示词必须升 version）

| promptId | version | 文件 |
| --- | --- | --- |
| `sentence.generate` | 1.0.0 | `src/prompts/sentence.ts` |
| `reading.reinforce` | 1.0.0 | `src/prompts/reading.ts` |

指纹 = `promptId@version#fnv1a(模板)`，随每条 `AIGeneration` 落库。

## 5. 生成 Schema（Phase 7 复用契约）

- 句子：`{ sentence, targetWords[], grammarTargets[], difficultyNote, chinese|null, structure|null, provenance:"ai" }`，句子 8–320 字符、词数受窗口限制。
- 文章：`{ title, topic, passage, targetWords[], targetGrammar[], difficultyRationale, exercises[] }`，`exercises[].{type,question,options[4],answerIndex,explanation,evidenceQuote}`，**evidenceQuote 必须逐字来自 passage**。

## 6. Reinforcement 契约

- AI 句：`sourceType='ai'`、`structureProvenance='ai_unverified'`、`createdBy='ai'`；可用于有提示的探索，**不可**用于自动语法评分。
- AI 文章：`sourceType='ai_reinforcement'`、`sourceReliability='ai_generated'`、`extractionMethod='ai_generated'`；阅读页明示「AI 生成强化材料」。
- 生成与采纳**不写掌握证据**；掌握只来自用户独立作答。
- 内容指纹（`contentHash`）用于去重；`aiGenerations.contentHash` 已建索引。

## 7. Mini Unit 集成点（Phase 7 注意）

- Mini Unit 已有 store `miniUnits`（v2）与 `activeMiniUnit()`；AI 生成的句子/文章都应挂到 `miniUnitId`（写进 `sourceMetadata` 或 `SentenceRecord.notes`），以便 Unit 结束时统计。
- `AIGeneration.sourceMetadata` 已预留 `privacy / attempts / generatedAt`；Phase 7 可加 `miniUnitId`（additive，不动旧记录）。
- Planner 目前**没有** AI 任务类型：AI 材料经句库/阅读库被既有任务消费。若 Phase 7 需要「Unit 内 AI 句」任务，应新增 capability 并在**材料真实存在**时才排任务。
- 阅读侧 `Passage.sourceType='ai_reinforcement'` 已被 Phase 5 分析与库查询识别，Unit 统计时需把 AI 文章与真实语料分开。

## 8. 尚未验收 / 风险

- **真实 AI Provider E2E 未验收**（无凭据）：协议、校验链、质量门、降级已用真实浏览器 + 本地 mock 验证；真实供应商需用户自填 Key 后按 `docs/PHASE6_REINFORCEMENT_AI.md` §11 复验。
- 语法可观察性是正则启发式；语义型概念标 `unverifiable`。
- 难度估计为启发式，不是测量模型。
- 未做流式/批量/工具调用。

## 9. 下一条精确操作

1. 读取 `STATE.json`（`next_task_id=phase7_mini_unit_012`）与 `docs/PHASE6_REINFORCEMENT_AI.md`。
2. 先核验 HEAD == origin/main 与 CI 结论（run id 见 STATE.ci 或 `actions/runs?branch=main`）。
3. Phase 7 第一步：定义 Mini Unit 数据契约（复用 `miniUnits`，不新建平行表），再决定是否给 `AIGeneration.sourceMetadata` 加 `miniUnitId`。

# HANDOFF — 换模型 / 换会话所需最小上下文

（更新：2026-10-19 · 最新提交见 git log；Phase 3、Phase 4、Phase 5 已完成并通过实测，下一个任务是 Phase 6）


## 2026-10-19 离线文档复核增补 —— 已在本机完成核验（不再是待办）

- 核验结果：合并前 HEAD=`92f8ec1`（clean），**当时无 origin remote**，Phase 3 未开工；`STATE.last_verified_commit=92fdab0` 为 Phase 2 功能提交，`92f8ec1` 是其上的状态 pin 提交。离线文档包内容与本地快照一致（差异全为新增/纠错），已整体合并。
- `infra_github_remote_001`：历史 secrets 扫描 0 命中 → 创建 GitHub **Private** 仓库 `Huyaen/english-reconstruction-system` → 关联 origin → push main + 阶段 tags → `git ls-remote`/API 双重复核 SHA 与 `private=true` → **passed**（`STATE.remote_sync` 为 verified）。
- `phase3_daily_planner_007`：**passed 2026-10-19**，验收见 `CHECKPOINT.md` §Phase 3、`docs/PHASE3_DAILY_PLANNER.md` §13、`docs/TEST_REPORT.md` §Phase 3。
- 学习数据仍在浏览器 IndexedDB，代码 push 不构成学习数据备份；不要上传真实学习数据库或 API Key。

## Current phase

Phase 6 — Reinforcement AI（Phase 0 / 0.5 / 1 / 2 / 3 / 4 / 5 全部完成并通过）

## Current task_id

`phase6_reinforcement_ai_010`（Phase 6 Reinforcement AI：条件化句子生成 / 强化文章生成 / 严格 JSON schema / prompt 版本化；沿用现有 typed capability，**不要重写计划器**）。Phase 5（`phase5_reading_009`）已 passed：真实文章导入（来源+指纹可追溯）→ 逐段阅读（首读无辅助、不显示全文翻译）→ 生词标记与后置筛选入库（无释义不入库）→ 难句进 Phase 4 拆句（自动结构=只记接触，练完回原段落）→ 重读真实计时 → 全文理解 + 收尾证据幂等落库；无材料绝不生成阅读任务。Phase 4（`phase4_sentence_grammar_008`）已 passed：语法知识图谱（34 概念 + 先修边，禁循环）、句源契约（12 条 authored 教学句 + gold 结构 + 预教词）、引导式拆句 Lab（L0–L4 辅助 / 即时反馈 / JIT 知识卡）、证据分级（exposed 不计掌握；幂等=会话+句子）、自适应选句、Planner 真实句任务 —— 证据见 `CHECKPOINT.md` §Phase 4、`docs/PHASE4_SENTENCE_GRAMMAR.md`。

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

Phase 6（当前）→ Phase 7–13。

## Last verified build

`npm run build` @ Phase 4 工作树 → vite 成功（dist 与源码同步提交；bundle >500 kB 警告保留到 Phase 13 处理）。

## Last verified tests

`npm test` @ Phase 5 工作树 → **134 pass / 0 fail**（Phase 4 的 106 + readingCore 14 + readingSession 13 + readingUi 1 端到端）；真实浏览器 smoke：`scripts/phase5-smoke.mjs` **44/44**、`scripts/phase4-smoke.mjs` **36/36**、`scripts/phase3-smoke.mjs` **21/21**（dist-test + `?test=1`，独立 profile 无头 Edge/CDP）。

## Known bugs

- 无阻断性 bug。
- 已知限制（记入 CHECKPOINT/STATE）：bundle >500KB 警告（Phase 13 处理）；fake-indexeddb 基准≠真实性能；Preview 不创建 StudySession（直接落盘，刷新安全）。
- Phase 3 限制：Planner 每词耗时为集中配置的启发式常量（0.35/0.4/0.6 分钟），非个性化测量；reading/input/output 仅声明 capability；Mini Diagnostic 当前只覆盖真实词汇测试。
- Phase 4 限制：句源只有 12 条 authored 教学句（AI 生成与外部语料未接入，UI 明示不可用）；BKT-lite 参数为启发式起点未拟合；结构分析只对 gold/启发式结构负责，非 gold 结构一律标注 provenance/confidence。
- Phase 5 限制：截图导入在没有视觉模型/本地 OCR 时只能人工转录；PDF/DOCX/EPUB 不解析；难度与生词率是估算（explicit 与 estimated 分开、no-evidence 单列）；不做词形还原；阅读只记接触不提掌握；AI 强化文章（Phase 6）未接入。
- 未验收项（TODO P1）：真实供应商 AI 调用；真机移动端。

## Files currently being modified

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
