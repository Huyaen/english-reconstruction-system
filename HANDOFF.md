# HANDOFF — 换模型 / 换会话所需最小上下文

（更新：2026-10-04 03:15 · 最新代码提交见 git log；基线 `6c1c625` / `v1.0.0-mvp-baseline`）

## Current phase

Phase 3 — Daily Planner（Phase 0 / 0.5 / 1 / 2 全部完成并通过）

## Current task_id

`phase3_daily_planner_007`（下一步开工）。Phase 2（`phase2_vocabulary_v2_006`）已 passed：ts-fsrs 调度、DB v3、Preview→Recall、三维证据、多词池/动态新词量、UI —— 证据见 `CHECKPOINT.md` §Phase 2。

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
- **验证证据（最新）**：`npm test` **39/39**；`npm run build` 成功（511.74 kB / gzip 176.27 kB）；**真实浏览器 smoke 通过**（无头 Edge + CDP：导入→拦截→Preview 8/8→Recall→恢复→IDB v3/FSRS/rating→reload 保留）
- **Git 轨迹**：`6c1c625`（基线）→ `9dc0b8b` → `76716a6`（Phase 0.5）→ `8a74ba8`（Phase 1，tag `phase1-data-foundation`）→ Phase 2 提交（tag `phase2-vocabulary-v2`，见 git log）

## What is currently running

无后台任务；工作区 = 已验证状态。

## What remains

Phase 3（当前）→ Phase 4–13。

## Last verified build

`npm run build` @ 本轮工作树 → vite 成功；`dist/assets/index-CRwhfoD-.js` 511.74 kB（gzip 176.27 kB）。

## Last verified tests

`npm test` @ 同上 → **39 pass / 0 fail**（fsrs 6 / vocab 7 / migration 6 / 原有 20+；含 v1→v3 与 v2→v3 fixture、Preview DOM 流程、索引查询）。

## Known bugs

- 无阻断性 bug。
- 已知限制（记入 CHECKPOINT）：bundle >500KB 警告（Phase 13 处理）；fake-indexeddb 基准≠真实性能；Preview 不创建 StudySession（直接落盘，刷新安全）。
- 未验收项（TODO P1）：真实供应商 AI 调用；真机移动端。

## Files currently being modified

无。

## Database migration status

- 当前 schema：**version 3**（DB 名仍为 `vocabulary-memory-v1`）。v1→v3 / v2→v3 迁移已实测（100% 保留 + 幂等）；`meta.migration` 记录最近一次真实升级。
- 后续任何 schema 变更走同一框架：`indexSpecs` 增索引 + `runBackfills` 追加回填函数（**串行链，勿并行游标**）+ fixture 测试。

## Next exact action

Phase 3 — Daily Planner 第一步（建议顺序）：

1. 实现 `src/planner.ts`（纯函数优先，UI 依赖最小）：输入 = `{availableMinutes, energyState, model}`；输出 = `DailyPlan`（initialPlan 的 PlanItem[]：review/newWords/sentence/reading/input/output/closing 的时间配额与顺序；顺序依据 PROJECT_SPEC §10 动态重排规则）
2. 复用已就绪 API：`recommendedNewWordCount()`（新词量）、`buildNewWordQueue()`（词池）、`effectiveDue()` + `model.dueWords()`（到期复习量→预计耗时）；Yesterday Recall 结果参与校准
3. Yesterday Recall 与 Closing Loop 的实现（新 store `dailyPlans` 已就绪；`dailyPlans` 用日期 id）
4. 动态调整：执行中允许 ±20–30% 重分配（PlanAdjustment 记录 reasons）；中断恢复（1 天 / 2–3 天 Re-entry Check / 7 天+ Mini Diagnostic）
5. UI：首页改为 Today's Plan 主视图（保留现有训练入口与「今日新词」面板）；Start Today's Training 串接
6. 测试：planner 纯函数单测（time budget、energy、yesterday recall 校准、无学习债、调整幅度约束）+ DOM 流程；更新状态文件并提交（tag 建议 `phase3-daily-planner`）

## Important warnings

1. **迁移只加不删**；新回填必须走 `runBackfills` 串行链；DB 版本变更必须带 fixture 测试。
2. **ts-fsrs 已锁定 5.4.2**（shadow/rollback 均已验证）；不要升级版本或绕过 `src/fsrs.ts` 适配层。
3. 调度权威切换（fsrs/legacy）与 `effectiveDue()` 是唯一到期口径；新代码不要直接读 `w.schedule.due` 做队列。
4. `src/*.ts`、`tests/*.ts` 变更后跑 `node docs/format-source.mjs` → `npm test` → `npm run build`。
5. 浏览器验证用 CDP 无头 Edge（`--remote-debugging-port` + 独立 profile；参考 skill `sillytavern-live-ui-verification` 的 `cdp-st.mjs`；node 驱动必须前台运行）。
6. 不要把 API Key 写入日志/提交；备份始终剔除 Key。
7. 唯一根目录 `D:\英语重构训练\vocabulary-app`；禁止另起工程。
8. 阶段完成按 `AGENT_EXECUTION.md` §4：测试 → build → 更新五个状态文件 → commit + tag。
