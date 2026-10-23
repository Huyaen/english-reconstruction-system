# Phase 12 Full Integration — Today 计划任务的统一执行

**日期**：2026-10-23
**范围**：把 Today 首页的计划任务接到各训练模块的真实执行与真实证据上；不重写任何既有训练引擎，不提升数据库版本。
**结果**：`npm test` 360/360、`tsc` 0 error、生产构建通过且测试钩子 0、真实浏览器 smoke **18/18**，Phase 11 16/16、Phase 12 17/17 回归通过（Phase 12 的计数以脚本实际断言为准）。

## 1. 要解决的问题

在 Full Integration 之前，Today 的计划卡可以显示，但执行链路存在五类断点：

1. 计划任务的模块归属不清，非词汇任务可能被当成词汇任务打开；
2. 点「开始」只换页面，没有把**当前计划任务**与领域会话绑定，完成后无法写回；
3. 完成状态可能由按钮直接标记，而不是由真实领域证据推导；
4. 重新生成 Today 会重建同名任务，抹掉已经开始但未完成的进度；
5. 刷新或中断后，只能新建会话，不能恢复原来的 plan task / session。

本阶段的唯一契约层是 `src/taskExecutor.ts`。它回答三个问题：

- 这个任务属于哪个训练模块？
- 它现在能不能执行？不能执行时，明确原因是什么？
- 它是否已经有**本次任务开始之后**的真实证据，足以标记 done？

## 2. 模块与任务类型

| 模块 | 任务 kind | 执行入口 | 完成证据（必须满足） |
| --- | --- | --- | --- |
| vocabulary | `yesterday-recall` / `due-review` / `new-recall` / `new-preview` / `closing-recall` | 词汇训练 / Preview | 本次 `startedAt` 之后的 `ReviewRecord`（Preview 只认 `wordExposures`） |
| sentence | `sentence-basic-structure` / `sentence-weak-grammar` / `sentence-transfer` | Sentence Lab | 本 lab session 的 `SentenceAttempt` |
| reading | `reading-new` / `reading-reread` | Reading Lab | 目标 `ReadingSession.detail.state === 'completed'` |
| input | `input-session` / `input-continue` | Input Session | 目标输入会话 completed **且有复盘** |
| output | `output-task` | Output Lab | 绑定 `OutputAttempt` completed |
| exam | `exam-practice` | Exam Session | 绑定 `ExamSession` completed（提交并复盘） |

未知 kind / 未知 module 一律返回 `unsupported`，**不会回退成词汇任务**。这是本阶段的硬规则，防止自定义或旧计划把用户带到错误页面。

## 3. 执行绑定

新增可选字段（均为 additive，DB 仍为 v7）：

- `InputSession.dailyPlanTaskId`
- `OutputAttempt.dailyPlanTaskId`
- `ExamSession.dailyPlanTaskId`
- `ReadingSession.dailyPlanTaskId`
- `StudySession.planTaskId`
- `PlanItem.targetSessionId` / `plannedMinutes`

启动计划任务时：

1. `startPlanTask` 先做静态可用性检查（`taskUnavailableReason`）；
2. 标记该任务 `started`，写入 `startedAt`；同一时刻只允许一个启动流程（防止双击创建两个会话）；
3. 按模块创建或恢复领域会话，并把 `dailyPlanTaskId` / `planTaskId` 写进会话；
4. 把任务 ID 交给模块页面；页面完成后调用 `completePlanTask(exec)`。

`completePlanTask` 只做一件事：加载最新 `Data`，调用 `taskEvidence` 校验本次证据；通过才把任务写成 `done` 并记录 `completedAt`。失败就保留 `started`，并提示原因，**绝不让「点了按钮」等于「完成了学习」**。

## 4. 可用性与不可用

`todayTrainingBlock` 与任务卡会显式输出不可用原因，例如：

- 阅读库没有文章；
- Input Hub 没有真实材料；
- 考试任务默认关闭，或没有未做的新题；
- 句子任务没有真实句源；
- 未知模块。

不可用任务不显示可点击的「开始」，也不生成假的领域证据。计划本身仍保留，用户可以在补材料或开启考试后重新生成。

## 5. 重新生成与恢复

- `regenerateRemaining` 合并 `done` 与 `started`：已完成的保留 done，已开始未完成的保留 started 与原任务 ID；
- 不复制同 kind 的任务；
- 已开始任务的时间不重置；
- 刷新后 `todayPlan` 从 `dailyPlans` 读取，已完成/已开始状态原样恢复；
- 中断的 Input / Output / Exam / Reading / Vocabulary 会按会话字段恢复，不新建另一个绑定会话。

## 6. 真实浏览器验收（A–R，18 项）

脚本：`scripts/phase12-full-smoke.mjs`
环境：本地 `dist-test` + `?test=1`，无头 Edge CDP 9230，独立 profile。

| 编号 | 断言 |
| --- | --- |
| A | 用真实种子数据生成六类模块计划（vocabulary / sentence / reading / input / output / exam） |
| B | 任务卡显示模块标签，非词汇任务不显示「N 个词」 |
| C | Today 有统一「继续今天的训练」入口 |
| D | 输入任务路由到 Input Session，会话带当前 planTaskId |
| E | 输入完成（含复盘）后计划任务写回 done |
| F | 表达任务路由到 Output Lab 并创建绑定 attempt |
| G | 表达完成后计划任务写回 done |
| H | 考试任务路由到 Exam Session 并绑定 planTaskId |
| I | 考试提交/复盘完成后计划任务写回 done |
| J | 统一入口自动进入下一项，不回到词汇默认页 |
| K | 阅读任务路由到阅读页，不落到词汇页 |
| L | 句子任务路由到 Sentence Lab，不落到词汇页 |
| M | Regenerate 保留已完成任务，不重建证据 |
| N | Regenerate 保留已开始任务，不复制同类任务 |
| O | Regenerate 后总时长不超预算 |
| P | 刷新后计划、done、started 状态完整 |
| Q | 刷新后不出现重复的活动输入绑定会话 |
| R | 页面无未捕获 JavaScript 错误 |

补充回归：

- `node scripts/phase12-smoke.mjs`：**17/17 PASS**（A–Q；日志类别/分值/自评线索/导入导出）；
- `node scripts/phase11-smoke.mjs`：**16/16 PASS**（考试迁移、状态机、周测、计划）；
- `npm test`：**360/360 pass / 0 fail**；
- `npx tsc --noEmit -p tsconfig.json`：**0 error**；
- `npm run build`：生产构建成功；`grep __planTest|__examTest|__inputTest|__outputTest|ERV2_TEST_HOOKS dist/assets/*.js` = **0**；
- `npm run build:test`：测试构建成功，仅注入测试钩子。

## 7. 本轮真实修复

1. **输出提交 revision 竞争**：自动保存推进 revision 后，提交仍使用旧 revision，会把用户自己的保存误判成并发冲突。提交前重新读取最新 attempt。
2. **重复点击开始**：异步启动期间没有闸门，连续点击会创建两个会话。增加 `taskStarting` 互斥。
3. **历史证据误判**：同一 planTask 有多次历史 attempt/session 时，之前取第一条；现在按时间取本次开始之后的最新 completed 证据。
4. **输入冷测跳过后的视图残留**：跳过冷测后仍显示冷测表单。现在 skipped 与 recorded 都显示结果态。
5. **诊断对不完整阅读会话崩溃**：旧/种子数据缺少 `marks` 或 `comprehension` 时，诊断直接读 `.filter/.find` 抛异常；已加空数组保护。这是回归 smoke 暴露的真实兼容性问题。

## 8. 边界

- 本阶段没有新增 AI 调用，不把 AI 生成材料当完成证据；
- 没有改变 Phase 3 Planner 的时长/顺序规则；计划仍由确定性 Planner 生成；
- 考试任务仍默认关闭；未开启或没有新题时明确不可用；
- 输入/阅读/表达的完成只代表**接触或产出记录**，不等于词汇掌握；
- 不重写 Exam Transfer Lab；Phase 12 的考试记录与分值规则保持不变；
- DB 保持 v7；新增字段都是可选的，旧备份可读。
