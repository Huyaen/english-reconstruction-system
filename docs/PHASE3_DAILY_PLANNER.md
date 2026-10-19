# Phase 3 — Daily Planner / 工程交付规格

> 更新：2026-10-19。该文件是 Phase 3 的**执行层细则**，服从 `PROJECT_SPEC.md`、`AGENT_EXECUTION.md`。原始 28 条产品决策无变更。本文件不表示 Phase 3 已经实现。需要从本机 `STATE.json` + Git + 源码核实实际进度。

## 0. 启动前状态与约束

- 参考断点：`phase_3_daily_planner`，`phase3_daily_planner_007` 为 `planned`；DB v3；Phase 2 tag `phase2-vocabulary-v2`；上次文档验证 39/39、build passed。以上是快照，不是本次实测。
- Phase 2 已有 `src/fsrs.ts`、`src/pools.ts`、`src/evidence.ts`、`src/model.ts`；必须按**当前实际导出的接口**复用 `recommendedNewWordCount()`、`buildNewWordQueue()`、`effectiveDue()`、`model.dueWords()`。不臆造函数签名、不新增平行调度器。
- 优先实现纯函数领域引擎与可持久化操作层；原生 DOM UI 为消费层。不得将全部算法塞进 `src/app.ts`。不修改 FSRS/Preview 主干，除非有明确 bug 和回归测试。
- `dailyPlans`、`miniUnits` 等 store 已存在；如无必要，不提高 DB 版本；若提高则只加不删、串行 migration 回填 + v3 fixture + restore/backward compatibility。

## 1. 日启动流程

**可用时间 → 今日状态 → Yesterday Recall / Re-entry（若需要）→ 用真实结果校准 → 继续/选择 Mini Unit（当前如未实现，安全降级）→ Final Daily Plan → 执行和有限自由 → Closing Loop。**

时间档 20/30/45/60/custom。用户可输入自定义正数分钟，校验无效值与极端值；全局 `sum(estimatedMinutes)` 不超过当前预算，**Recall、Closing、Re-entry 必须包含在同一个预算内**，不能额外隐形占用时间。状态 `low/normal/high`（状态差/正常/状态好），可在任何一天自由选择，影响任务量和难度，不作为惩罚依据。

如果时间预算过短无法保留所有模块最低值，则优先 critical delayed memory 和短 Closing；记录为什么降级，不生成不可能完成的计划。完整五个模块功能上线后原则上每天都有接触，但当前未实现模块不得被显示成可点击并自动完成。

## 2. 领域类型与核心纯函数

建议但不强制的类型：

- `PlanRequest`: localDate、availableMinutes、energy、recentPlanHistory、dueWeakLoad、retention evidence、activeMiniUnit?、moduleCapabilities、continuation state。
- `DailyPlan`: id(date-key + stable local day)、version/revision、initialPlan、remainingTasks、taskActions、actualMinutes、yesterdayRecall、closingLoop、state、createdAt/updatedAt。
- `DailyTask`: stable task id、module、kind、estimatedMinutes、priority、critical/flexible、capabilityRequired、source/ref、status、reason、dependencies。
- `PlanAdjustment`: event id、timestamp、trigger、before/after、reason、boundedRatio、revisedRemainingMinutes。
- `RecoveryPlan`: gap days、reason、recall/re-entry diagnostic contract、available capability。

调度算法保持 deterministic（同样输入、同样时间/随机种子得到同样输出），权重集中配置，可生成机器可测的 `reasons[]`；缺失历史用 null/unknown，不用 0 冒充测过。索引化查询及必要缓存，不每次全表扫描。

## 3. Yesterday Recall（隔夜测验）

通常 2–4 分钟（包含在预算中）。无昨日真实记录就显示“暂无隔夜检测”，不伪造通过率。抽昨日新词、Hard/Again、少量 Easy 高价值、confusion 候选；在样本足够时做类型平衡，并避免同一单词/事件重复计入保留率。

对每次采样保存来源、方向、正确、反应时、过去间隔、是否有效隔夜证据。仅存在已测分母时才计算 overnight retention；样本不足时标注 low confidence / unavailable。若复用正式复习事件更新 FSRS，确保不**重复提交**相同 evidence 给调度器。评估只提供 Planner/熟练度的补充证据，不直接破坏 FSRS 的 Card 状态。

依当天结果校准：隔夜低或到期复习多 → 减新词、补弱词、降低 Growth Input；隔夜高 → 适度增量但不溢出时间预算。保留 before/after 和解释。不要依赖 AI 计算。

## 4. 统一五模块 Contract & Capability Gate

五模块为 Vocabulary、Sentence/Grammar、Reading、Real Input、Output，模块顺序动态，任务 metadata 保留“为何安排/为何调整”。注册 capability；未实现模块禁用 UI 和进度统计，不生成假任务。Phase 4–10 上线后通过稳定接口接入 Planner，而非每个模块重新开发计划器。

当前必须可真实执行：Vocabulary 的 due/weak/new Preview/Recall、Yesterday Recall、Closing Vocabulary。未来模块提供 typed interface；Mini Unit 为 nullable，由 Phase 7 完成主题、Anchor Material、Day1/2/3 状态机。Weekly Diagnostic 仅声明 schedule/capability contract，不做假的诊断报告。

## 5. 多来源词汇与时间分配

优先 `effectiveDue()` 确定到期，考虑 weak/forgotten、当前用户当天可用时长、低/高精力。今日新词使用 `recommendedNewWordCount()` 输出及 `buildNewWordQueue()` 原有逻辑；新词必须 Preview→Recall，不能通过 Planner 绕过。Critical memory 不等于每天把全部逾期一次做完：可在总时间内优先采样/排序，剩余记忆债继续到期等待，不能无限堆积任务时长。

计划明确保留未来 Sentence/Reading/Input/Output 最低覆盖规则：随着 capability 增加，动态分配并保证预算不溢出；短时间可采用 1–2 分钟微任务。模块排序不得固定为死板 Vocabulary→Sentence→Reading→Input→Output。

## 6. 学习过程中的微调与有限自由

支持 `Start/Skip/Delay/Replace`，记录真实结果和原因（可为空）；delay 只在今天计划内部，不能自动成为次日作业债。Replace 生成与原任务目标相近的真实可执行任务；有能力缺失或无候选则明确返回 unavailable。

调整触发：任务超时、提前完成、低保留、用户跳过/延迟/替换、难度异常。已完成任务不重建，已提交的 Recall/曝光记录不回滚。对剩余 *flexible* 配额通常调整不超过原配额 ±20–30%，总时间预算仍受约束；遇到严重溢出或强制保留的到期复习，可显示例外原因。提前完成可直接结束或建议高价值 micro task，不强制填满时间。

## 7. 不积学习债与中断重新进入

隔日不平移普通未做完的新词、文章、Sentence、Output；只保留 FSRS 到期复习、严重弱词、必要隔夜检查。日期差按**真实完成/学习记录**和用户本地日界计算，单纯打开 App 不算完成一天。跨日期时旧 plan 留作历史，不自动克隆其全部 remaining tasks。

- missed=1：正常恢复，适度增加 weak/due 优先级。
- missed=2–3：先 5 分钟 Re-entry Check（真实词汇，计入预算）→ 重生成今天。
- missed=4–6：至少执行 Re-entry Check，可依实际遗忘情况加长，但受预算约束。
- missed>=7：Mini Diagnostic contract（当前至少真实 Vocabulary 测试，未来扩展语法/阅读）再重算；不得声称完整语言诊断已经实现。
- 首次使用/无活动历史：不认为用户“断更”；按 normal baseline 安全建计划。

不用惩罚 streak，不因跳过/低能量/断更生成压迫性补作业。

## 8. Closing Loop

固定 3–5 分钟（含预算），不引入新知识。优先回忆今天 3–5 重点词及一个 weak/confusion，记录真实作答与“轻松/刚好/偏难”；保留 grammar/Unit one-sentence output contract 等后续扩展。结束时记录实际总分钟、任务完成、失败/跳过原因、主观难度，成为明日模型输入。

## 9. 持久化/刷新恢复/幂等

复用 `dailyPlans` 及现有 IndexedDB 一致性设计。新计划以本地日期为 key，跨时区/夏令时无重复日记录；修改有 revision/updatedAt；按单用户现有 Web Locks/事务机制确保多窗口安全。避免刷新后随机重生成、新词重新 Preview、Closing 双记账。`Regenerate Today` 仅调整**剩余**计划，保留既有 learning evidence 和完成任务。

写入失败时 UI 显式提示、允许安全重试，不能显示“已保存”。继续未完成的 Vocabulary StudySession 时要与已有单独恢复功能兼容。

## 10. UI 范围

Today 主页成为主入口：选择时长/状态、Yesterday Recall、当前 Mini Unit（存在时）、今日任务/原因、进度/剩余时间、Closing Loop。卡片支持 Start/Skip/Delay/Replace，尚不可用任务明确标记不可执行。保留现有高量刷词、今日复习、Preview、FSRS 开关、词库管理入口，不提前彻底重构全站 UI。

## 11. 测试与验收门

新增至少覆盖：

- 预算 20/30/45/60/custom；各状态 low/normal/high；总时长包含 Recall/Closing；极端与非法输入；无历史与 sparse history。
- 隔夜抽样、保留率证据、第一次没有昨天的降级、重复事件防双计分。
- FSRS `effectiveDue` 与原选词函数复用、多词池为空兜底、低保留减少新词、高到期负载压缩 flexible 任务。
- 能力门禁：未上线模块不可执行、不会假完成；全部上线后按 contract 覆盖五模块。
- 动态重规划：overrun、early、skip/delay/replace、原因记录、±20–30% 默认边界、critical memory 保留。
- No Learning Debt：柔性任务不滚存、到期记忆仍存在；首次使用、间断 1/2/3/4/6/7+ 天。
- DayPlan persistence、刷新恢复、未完成 StudySession 兼容、同日 Regenerate、重复点击/并发安全、学习事件不重写。
- Closing Loop evidence、低/好状态反馈，未来模块 contracts。
- Phase 0/1/2 全量 regression（原来上次文档 39/39），`npm run build`，本地 server HTTP 200。
- 独立测试浏览器 profile/CDP：45min→Yesterday Recall→ plan→真实词汇任务→Closing→刷新还原；低保留；skip/re-entry 3天；确认 IDB 状态。

**不得对用户真实浏览器的生产学习数据库做破坏性 E2E 注入或清空**；使用隔离 profile 和独立测试数据。真实浏览器 smoke 不能以仅 HTTP 200 替代。

最终：记录 tests count、构建、真实浏览器结果、DB schema 版本、性能、已知边界；文档与 `STATE.json`/`HANDOFF.md` 同步；稳定 commit/tag `phase3-daily-planner`，按 GitHub Remote Sync Protocol 推送并验证远端。只有全部验收通过才标记 `passed`。

## 12. 中断与范围边界

遇额度不足、413、GitHub API timeout、浏览器工具错误：优先写状态并完成 Emergency Checkpoint；GitHub 不可达不意味着本地开发失败，远程同步状态单独写出。

不要在此阶段提前完整实现 Sentence/Grammar/Reading/Input/Output/MiniUnit/Weekly Diagnostic；只建立最小接口与真实 capability gating。下阶段 Phase 4 才正式执行 Sentence & Grammar。
