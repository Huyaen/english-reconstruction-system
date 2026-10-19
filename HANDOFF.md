# HANDOFF — 换模型 / 换会话所需最小上下文

（更新：2026-10-19 · 最新提交见 git log；Phase 3 已完成并通过实测，下一个任务是 Phase 4）


## 2026-10-19 离线文档复核增补 —— 已在本机完成核验（不再是待办）

- 核验结果：合并前 HEAD=`92f8ec1`（clean），**当时无 origin remote**，Phase 3 未开工；`STATE.last_verified_commit=92fdab0` 为 Phase 2 功能提交，`92f8ec1` 是其上的状态 pin 提交。离线文档包内容与本地快照一致（差异全为新增/纠错），已整体合并。
- `infra_github_remote_001`：历史 secrets 扫描 0 命中 → 创建 GitHub **Private** 仓库 `Huyaen/english-reconstruction-system` → 关联 origin → push main + 阶段 tags → `git ls-remote`/API 双重复核 SHA 与 `private=true` → **passed**（`STATE.remote_sync` 为 verified）。
- `phase3_daily_planner_007`：**passed 2026-10-19**，验收见 `CHECKPOINT.md` §Phase 3、`docs/PHASE3_DAILY_PLANNER.md` §13、`docs/TEST_REPORT.md` §Phase 3。
- 学习数据仍在浏览器 IndexedDB，代码 push 不构成学习数据备份；不要上传真实学习数据库或 API Key。

## Current phase

Phase 4 — Sentence & Grammar（Phase 0 / 0.5 / 1 / 2 / 3 全部完成并通过）

## Current task_id

`phase4_sentence_grammar_008`（Phase 4 起步；接口为 Planner 的 typed capability，**不要重写计划器**）。Phase 3（`phase3_daily_planner_007`）已 passed：Time Budget First、状态三档、Yesterday Recall、任务合同 + Capability Gate、动态重规划、Closing Loop、中断恢复、持久化恢复 —— 证据见 `CHECKPOINT.md` §Phase 3。

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
- **Git 轨迹**：`6c1c625`（基线）→ `9dc0b8b` → `76716a6`（Phase 0.5）→ `8a74ba8`（Phase 1，tag `phase1-data-foundation`）→ Phase 2 提交（tag `phase2-vocabulary-v2`，见 git log）

## What is currently running

无后台任务；工作区 = 已验证状态。

## What remains

Phase 3（当前）→ Phase 4–13。

## Last verified build

`npm run build` @ Phase 3 工作树 → vite 成功；`dist/assets/index-DjucMzEh.js` 544.43 kB（gzip 187.93 kB）、`dist/assets/index-Ubj28ML1.css` 17.23 kB。

## Last verified tests

`npm test` @ 同上 → **69 pass / 0 fail**（Phase 2 原 39 + planner 22 + plannerStore 6 + plannerUi 2）；真实浏览器 smoke `scripts/phase3-smoke.mjs` 20/20。

## Known bugs

- 无阻断性 bug。
- 已知限制（记入 CHECKPOINT/STATE）：bundle >500KB 警告（Phase 13 处理）；fake-indexeddb 基准≠真实性能；Preview 不创建 StudySession（直接落盘，刷新安全）。
- Phase 3 限制：Planner 每词耗时为集中配置的启发式常量（0.35/0.4/0.6 分钟），非个性化测量；sentence/reading/input/output 仅声明 capability；Mini Diagnostic 当前只覆盖真实词汇测试。
- 未验收项（TODO P1）：真实供应商 AI 调用；真机移动端。

## Files currently being modified

无。

## Database migration status

- 当前 schema：**version 3**（DB 名仍为 `vocabulary-memory-v1`）。v1→v3 / v2→v3 迁移已实测（100% 保留 + 幂等）；`meta.migration` 记录最近一次真实升级。
- 后续任何 schema 变更走同一框架：`indexSpecs` 增索引 + `runBackfills` 追加回填函数（**串行链，勿并行游标**）+ fixture 测试。

## Next exact action

Phase 4 — Sentence & Grammar（`phase4_sentence_grammar_008`）：

1. 读 `PROJECT_SPEC.md` Phase 4 章节 + `AGENT_EXECUTION.md` 阶段门；确认 Sentence Lab（混合句源、拆句流程、Sentence Tree）、Grammar Knowledge Graph、Just-in-Time 知识卡、证据追踪的范围
2. 接入方式：Planner **不重写** —— 在 `moduleCapabilities()` 中把 `sentence` 由 `available: false` 改为 `available: true`，并新增 `sentence` 任务类型（走同一 `PlanItem` contract：kind/label/minutes/refs/reason/critical/flexible/dependencies）
3. 沿用既有纪律：DB 变更必须走 `indexSpecs` + `runBackfills` 串行链并带 fixture 测试；到期口径只用 `effectiveDue()`；测试用 `node --test`（新套件放到 `tests/*.test.ts`）
4. 验收门：`npm test`（不得低于 69 且全绿）→ `npm run build` → HTTP 200 → 真实浏览器 smoke（可复制 `scripts/phase3-smoke.mjs` 的 CDP 骨架）→ 更新 STATE/CHECKPOINT/HANDOFF/TODO/README/DEVELOPMENT_LOG → commit + tag + push + `git ls-remote` 核对

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
