# HANDOFF — 换模型 / 换会话所需最小上下文

（更新：2026-10-19 · 最新提交见 git log；Phase 3、Phase 4 已完成并通过实测，下一个任务是 Phase 5）


## 2026-10-19 离线文档复核增补 —— 已在本机完成核验（不再是待办）

- 核验结果：合并前 HEAD=`92f8ec1`（clean），**当时无 origin remote**，Phase 3 未开工；`STATE.last_verified_commit=92fdab0` 为 Phase 2 功能提交，`92f8ec1` 是其上的状态 pin 提交。离线文档包内容与本地快照一致（差异全为新增/纠错），已整体合并。
- `infra_github_remote_001`：历史 secrets 扫描 0 命中 → 创建 GitHub **Private** 仓库 `Huyaen/english-reconstruction-system` → 关联 origin → push main + 阶段 tags → `git ls-remote`/API 双重复核 SHA 与 `private=true` → **passed**（`STATE.remote_sync` 为 verified）。
- `phase3_daily_planner_007`：**passed 2026-10-19**，验收见 `CHECKPOINT.md` §Phase 3、`docs/PHASE3_DAILY_PLANNER.md` §13、`docs/TEST_REPORT.md` §Phase 3。
- 学习数据仍在浏览器 IndexedDB，代码 push 不构成学习数据备份；不要上传真实学习数据库或 API Key。

## Current phase

Phase 5 — Reading（Phase 0 / 0.5 / 1 / 2 / 3 / 4 全部完成并通过）

## Current task_id

`phase5_reading_009`（Phase 5 起步；沿用 Planner 的 typed capability，**不要重写计划器**）。Phase 4（`phase4_sentence_grammar_008`）已 passed：语法知识图谱（34 概念 + 先修边，禁循环）、句源契约（12 条 authored 教学句 + gold 结构 + 预教词）、引导式拆句 Lab（L0–L4 辅助 / 即时反馈 / JIT 知识卡）、证据分级（exposed 不计掌握；幂等=会话+句子）、自适应选句、Planner 真实句任务 —— 证据见 `CHECKPOINT.md` §Phase 4、`docs/PHASE4_SENTENCE_GRAMMAR.md`。

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
- **验证证据（最新）**：`npx tsc --noEmit` 0 error；`npm test` **106/106**；`npm run build` 成功；`node scripts/phase4-smoke.mjs` **36/36**；`node scripts/phase3-smoke.mjs` **21/21**（回归）
- **Git 轨迹**：`6c1c625`（基线）→ `9dc0b8b` → `76716a6`（Phase 0.5）→ `8a74ba8`（Phase 1，tag `phase1-data-foundation`）→ Phase 2 提交（tag `phase2-vocabulary-v2`，见 git log）

## What is currently running

无后台任务；工作区 = 已验证状态。

## What remains

Phase 5（当前）→ Phase 6–13。

## Last verified build

`npm run build` @ Phase 4 工作树 → vite 成功（dist 与源码同步提交；bundle >500 kB 警告保留到 Phase 13 处理）。

## Last verified tests

`npm test` @ 同上 → **106 pass / 0 fail**（Phase 3 的 69 + grammar 7 + sentenceStructure 6 + sentenceLab 11 + sentenceSources 6 + sentenceSelection 6 + sentenceUi 2）；真实浏览器 smoke：`scripts/phase4-smoke.mjs` **36/36**、`scripts/phase3-smoke.mjs` **21/21**。

## Known bugs

- 无阻断性 bug。
- 已知限制（记入 CHECKPOINT/STATE）：bundle >500KB 警告（Phase 13 处理）；fake-indexeddb 基准≠真实性能；Preview 不创建 StudySession（直接落盘，刷新安全）。
- Phase 3 限制：Planner 每词耗时为集中配置的启发式常量（0.35/0.4/0.6 分钟），非个性化测量；reading/input/output 仅声明 capability；Mini Diagnostic 当前只覆盖真实词汇测试。
- Phase 4 限制：句源只有 12 条 authored 教学句（AI 生成与外部语料未接入，UI 明示不可用）；BKT-lite 参数为启发式起点未拟合；结构分析只对 gold/启发式结构负责，非 gold 结构一律标注 provenance/confidence。
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
