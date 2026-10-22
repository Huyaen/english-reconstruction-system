# Phase 10 · 能力诊断与学习分析（Learning Diagnostics）

> 目标：让学习者看见“哪里在进步、哪里卡住”，而不是得到一个虚高的英语分数。
> 本阶段只做诊断，不做新的课程体系，也不改变既有调度权威。

## 1. 设计纪律（L1–L12）

- **L1 不造统一总分。** 词汇、语法、阅读、输入、表达、翻译依赖分别陈述；不得把异质指标加权成一个“英语分数”。
- **L2 指标必须可解释。** 每个指标带定义、分子/分母、样本量、最少样本、可评估状态与证据质量；界面可展开查看。
- **L3 不可评估就留空。** 样本不足、分母为 0、字段缺失时 `value=null` + `evaluability='insufficient'`，绝不以 0 或估算值冒充。
- **L4 证据分层。** `verified`（可核对）/ `task-behavior`（真实行为）/ `self-report`（自评）/ `mixed`；只有自评时必须降低结论置信度。
- **L5 保持率按固定窗口。** D1/D7/D30 = 首次出现后第 1/7/30 个 24h 窗口内的复习正确率；错过不补算、不插值；每层最少 5 次。
- **L6 稳定词汇沿用既有生命周期。** `active + productive` 由 `lifecycleOf` 的证据阈值决定；`active` 与 `productive` 互斥，不重复计数。
- **L7 阅读未知词只认显式标记。** 没有标记就是“不可评估”，不用历史估算值替代；自评理解与可核对理解分开显示。
- **L8 输入不造听力分数。** 只报完成数、自报时长、自评理解、字幕条件分组；自报分钟不是平台真实进度。
- **L9 表达不评“作文分”。** 只报完成量、独立产出证据占比、辅助使用、修改与迁移；照抄与 L4 示范后的正确不计独立。
- **L10 变化必须可比。** 只有同一指标、同长度窗口、两侧都达到最少样本，才显示差值；否则明确“不可比”，不排名。
- **L11 短板是“先处理什么”，不是能力评级。** 规则固定、同分按固定顺序打破；证据不足时返回 `null` 或低置信，不硬凑结论。
- **L12 诊断不自动改学习计划。** 只有调用方显式传入瓶颈，计划器才会重排柔性任务；任务时长、关键记忆任务与 closing 不变。周诊断不自动调整权重。

## 2. 数据流

```
Data（words / records / exposures / grammar / sentences / reading / input / output）
        │
        ├─ diagnosticsCollect.ts   分域指标（纯函数，窗口由参数给定）
        ├─ diagnosticsInsight.ts   证据构成 / 短板 / 可比变化 / 行动计划
        ├─ diagnosticsModel.ts     比率、分位数、评估状态、窗口比较
        ├─ diagnosticsActions.ts   快照 / 周诊断（同日/同周幂等）
        ├─ diagnosticsStore.ts     只写 skillSnapshots / weeklyDiagnostics
        ├─ diagnosticsPlanner.ts   显式焦点 → 柔性任务排序
        └─ diagnosticsView.ts      纯 HTML 看板（无图表依赖）
```

## 3. 核心指标定义

| 指标 | 定义 | 最少样本 | 质量 |
| --- | --- | --- | --- |
| 稳定词汇 | `lifecycleOf` 为 active 或 productive 的词数 | 1 个词 | mixed |
| 主动词汇 | `active`（识别达标 + 中→英证据 ≥3 且达标） | 1 个词 | mixed |
| 产出词汇 | `productive`（独立产出证据 ≥3 且达标） | 1 个词 | mixed |
| 提取速度 | 窗口内测试反应时间中位数 | 3 次 | task-behavior |
| D1/D7/D30 | 首次出现后第 N 个 24h 窗口复习正确率 | 5 次 | task-behavior |
| 语法正确率 | 窗口内语法题正确数 / 全部作答 | 5 次 | task-behavior |
| 独立语法正确率 | `independent=true` 且正确 / 全部作答 | 5 次 | task-behavior |
| 句子结构正确率 | 结构可判定尝试中的正确比例 | 5 次 | task-behavior |
| 阅读未知词率 | unknown+guessed 标记 / 全部有效标记 | 5 个标记 | self-report |
| 可核对理解 | `verified-key` 且得分 ≥60 / 可核对条目 | 5 条 | verified |
| 阅读速度 | 词数 ÷ 分钟（≥60 秒的会话）中位数 | 3 场 | task-behavior |
| 输入完成数 / 时长 | 状态 completed 的会话；自报分钟求和 | 1 场 | task-behavior / self-report |
| 表达独立占比 | 独立且非照抄的产出证据 / 全部产出证据 | 5 条 | mixed |
| 翻译依赖均值 | A–E 换算 0–4 的均值 | 5 条 | self-report |

> 说明：`active` 与 `productive` 是互斥生命周期，所以“主动 0、产出 16”不是 bug，而是全部已达产出阶段。

## 4. 短板判定规则

按固定顺序计算严重度，取严重度最高者；同分按顺序：

1. D7 保持率 < 65% → 词汇保持；
2. 独立语法正确率 < 60% → 语法；
3. 阅读显式未知词率 > 15% → 阅读；
4. 可核对理解 < 60% → 阅读；
5. 表达独立占比 < 50% → 表达；
6. 翻译依赖均值 > 2.2 → 翻译。

证据来源单一或只有自评时，置信度降为 `low`；没有任何可评估项时返回 `null`，页面显示“暂不下结论”。

## 5. 快照与周诊断

- 快照 id：`snap-YYYY-MM-DD`；同一天重复生成覆盖同一条记录。
- 周诊断 id：`week-YYYY-MM-DD`（周一日期）；同一周重复生成覆盖。
- 两者都保存完整 `DiagnosticPayload`：窗口、指标、保持率、证据构成、短板、可比变化、行动计划、声明。
- 旧 `SkillSnapshot` 的平表字段继续填充，旧代码与旧备份无需迁移。
- 不升 DB 版本：只新增可选字段，`skillSnapshots` / `weeklyDiagnostics` 存储结构不变。

## 6. 计划接入

- `PlannerInput.diagnosticFocus` 可选；只有显式传入时才生效。
- `applyDiagnosticFocus` 只重排 `flexible && !critical` 任务；匹配领域任务 +20 优先级，其余保持不变。
- 关键记忆任务（隔夜检测、到期复习、closing）顺序与分钟数不变。
- 计划 `reasons` 增加 `diagnostic-focus-<domain>`，可追溯。
- 周行动计划只是建议入口，不自动写入每日计划。

## 7. 验收（AC1–AC14）

- **AC1** 无统一总分；payload 无 `score` 字段，页面无“英语总分”。
- **AC2** 每个指标有定义、分母/样本、最少样本、可评估状态、质量标签。
- **AC3** 样本不足时 `value=null`，页面显示原因，不显示 0。
- **AC4** D1/D7/D30 只认第 1/7/30 个 24h 窗口，错过不补算。
- **AC5** 稳定词汇使用 `lifecycleOf`，不另造阈值。
- **AC6** 阅读未知词率只认显式标记；无标记不可评估。
- **AC7** 可核对理解与自评理解分开，不合并。
- **AC8** 输入只报自报时长/自评理解，不生成听力分数。
- **AC9** 表达独立占比排除照抄；不评作文分。
- **AC10** 只有同长度窗口、两侧达标才显示差值；否则“不可比”。
- **AC11** 短板规则确定；证据不足返回 `null` 或低置信。
- **AC12** 同日快照、同周诊断幂等，不堆重复记录。
- **AC13** 诊断焦点只重排柔性任务，不改时长与关键任务；未显式传入时不生效。
- **AC14** 无 AI Key 时全部功能可用；备份往返保留诊断明细；生产包无测试钩子。

## 8. 测试与证据

| 层 | 结果 |
| --- | --- |
| 单元/性质测试 | `tests/diagnostics.test.ts` 11 例（含 2 个 fast-check 性质） |
| 集成 | `tests/diagnosticsIntegration.test.ts` 6 例（快照幂等、备份往返、计划焦点、无可比变化） |
| 全量测试 | `npm test` **325/325 pass** |
| 类型 | `npx tsc --noEmit` 0 error |
| 浏览器 | `scripts/phase10-smoke.mjs` **16/16 PASS**（真实 Edge + CDP + IndexedDB） |
| 回归 | phase3–phase9 smoke 全部 exit 0；phase9 20/20、phase8 34/34、phase7 33/33、phase6 31/31、phase5.1 26/26、phase5 44/44、interest 19/19 |
| 生产 | `npm run build` 通过；`__diagnosticsTest` / `ERV2_TEST_HOOKS` 命中 0 |

## 9. 已知边界

- D1/D7/D30 是“恰好落在窗口”的观察值，不是模型拟合的保持曲线；没有复习就没有数据。
- 语法“最弱概念”需要该概念 ≥5 次作答；少于 5 次不排名。
- 阅读速度受材料难度影响，不能跨材料直接比较。
- 翻译依赖为自评，不能当作能力测量。
- 诊断不推断因果；变化只描述两个窗口的差异。
- 未接入图表库；如需长期趋势图，应单独评估可访问性与依赖成本。
- 周诊断当前由用户点击生成，未做后台定时任务（local-first，应用未打开时不写数据）。
