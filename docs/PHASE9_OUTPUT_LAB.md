# Phase 9 — Output Lab（真实表达）

> 目标不是"写作文"，而是**把意思送出去**：先能沟通，再谈准确。
> 一句话也算完成；短而清楚不扣分。

## 1. 范围与边界

| 做 | 不做 |
| --- | --- |
| 六个真实表达任务类型（一句话 / 3–5 句总结 / 短段落 / 复述 / 观点 / 句式迁移 / 绕开不会的词） | 作文打分、雅思/托福 band、百分制 |
| 从真实阅读、真实输入、主题单元、薄弱词/语法生成任务 | 无材料时编造"你读过/看过"的任务 |
| 用户主动请求的分层辅助（L1–L4） | 系统默认塞范文 |
| 局部诊断：最多 1–3 个影响理解的问题 | 逐句改错、20 条 corrections |
| Communication Repair（用已有英语绕开不会的词） | 强制查词典才能继续 |
| 修改分类（自己改 / 提示后 / 照抄 / 看示范后） | 把照抄算成掌握 |
| 迁移（新语境）与延迟（D1/D7）接口 | 同一句话重复三次当迁移 |
| 产出证据（带独立性/辅助/照抄标记） | "写了 = 会了" |
| 本地确定性检查 + 可选 AI 语言反馈 | 无 Key 时伪造 AI 反馈 |

## 2. 长期规格（L1–L12）

**L1 意思优先。** 反馈第一行必须回答"意思有没有传到"，之后才是语言问题。
短句、简单词、非高级表达不构成失败。

**L2 无材料不编任务。** 自由表达是合法任务类型，但不得声称"基于你读过的文章"。
每个任务的 `reasons` 必须引用真实记录（单元 / 阅读 / 输入 / 薄弱词）。

**L3 范文门控。** 首次提交之前不展示任何完整示范；`canShowModelAnswer` 只在
`submitted / revised / completed` 或用户明确请求 L4 时为真。

**L4 分层辅助是用户主动的。** L1 关键词 → L2 句型骨架 → L3 部分示例 → L4 完整示范。
`SupportRecord.highestLevel` 只升不降；L4 之后的正确表达**不得**算独立证据。

**L5 Communication Repair。** 允许"我不知道那个词"，用已知英语描述。判定 `meaningPreserved`
必须有依据（用户自述 / 材料支持 / 已验证）；没有依据时为 `null`，不假装成功。
`evaluatorConfidence ≤ 0.5` 表示这是粗判，不是考试。

**L6 最小纠错。** 每次最多 3 条优先问题；能读懂就不改。`noCorrectionNeeded=true` 是合法结果。
没有问题时不得为了"有反馈"而编错误。

**L7 语言范围诚实。** 没有可靠材料内容证据时 `feedbackScope='language_only'`：
可以评语法/可读性，**不得**声称总结"事实正确"。有材料时才允许 `content_checked`。

**L8 AI 反馈是契约输出。** 所有 AI 走 Phase 6 `aiProvider`；JSON Schema → JSON Mode → 文本逐级降级；
重试有界（≤3，仅 429/5xx/超时/网络）。每次 correction 的 `original/start/end` 必须能在原文定位，
否则整条拒绝（`invalid`），原文与修改不丢。

**L9 修改分类。** `self`（自己改）> `after_hint`（提示后自己重写）> `after_model`（看示范后改写）>
`copied`（照抄建议）。只有 `self` / `after_hint` 能产生独立或半独立证据；`copied` 不产生掌握。

**L10 证据独立性与幂等。** 证据键 = `attemptId + wordId`；同一 attempt 重复完成不重复写。
分数提升有界（≤0.95）；辅助证据入库但不进 mastery；AI 反馈本身不产生掌握。

**L11 迁移与延迟。** 迁移必须换语境、换内容；仅换两个词不算。`transferIsGenuine` 为假时证据降级。
延迟任务（D1/D7）不复用原答案，不显示上次范文。

**L12 与单元/计划的边界。** Output 可以关联 Mini Unit（`miniUnitId`）并在单元视图可见，
但**绝不自动完成学习日或单元**；任务排布仍由 Phase 3 确定性 Planner 决定，容量不超预算。

## 3. 数据模型（全部为 v6 兼容的可选字段）

```ts
OutputTaskSpec      // 任务契约：类型/主题/沟通目标/来源/目标词法/时长/规模/理由
OutputAttempt       // 表达记录：草稿/原文/终稿/支持级别/反馈/修改史/证据/关联来源
OutputFeedback      // 契约反馈：meaningAssessment+basis+confidence / ≤3 issues / 可选单维升级
OutputErrorSpan     // 原文定位：type/original/start/end/explanation/severity/confidence
OutputRepairRecord  // Repair：本来想说什么/卡住的词/替代说法/是否有依据
ProductiveEvidence  // 产出证据：wordId/attemptId/independent/assisted/copied/correctness/confidence
```

第三方数据不新增 store：`outputAttempts` 自 Phase 3 就存在，本阶段只加可选字段；`DB_VERSION` 仍为 6。

## 4. 任务选择顺序

1. 当前 Mini Unit（Day 1–2 一句话；Day 3+ 复述）
2. 最近完成的真实输入（有英文总结/主旨）
3. 最近阅读（总结或观点）
4. 薄弱词 / 薄弱语法（在新语境里用出来）
5. 用户指定类型或自由表达（不过滤主题、不强制兴趣）

兴趣只影响 `reasons` 文案与选择倾向，**不进入**难度、目标词预算、掌握度或计划时长（兴趣 ≠ 能力）。

## 5. 确定性检查清单

| 检查 | 说明 | 权威性 |
| --- | --- | --- |
| 空文本 / 过短 | 仅提示规模，不阻止提交 | 确定 |
| 句末标点 | 缺 `.?!` | 确定 |
| 相邻重复词 | `the the` | 确定 |
| 句首小写 | 英文句首大写 | 确定 |
| 超长句（>45 词） | 可读性提醒 | 确定 |
| 括号/引号不配对 | 结构提示 | 确定 |
| 缺谓语 | 仅启发式，confidence ≤0.5 | 启发式 |

`localChecks` 永远 `authoritative=false`；它不是语法引擎，失败时不阻止保存与提交。

## 6. 反馈质量门

- 结构：必填字段、枚举、长度、数量上限（issues ≤3，corrections ≤6，strengths 1–5）。
- 定位：`text.slice(start,end) === original` 必须成立；`upgrade.original` 必须逐字存在。
- 范围：`feedbackScope` 必须与调用方判定一致；`language_only` 下出现"事实正确"类断言 → 拒绝。
- 升级：只能一个维度；不得一次引入多个新语法/生词；长度不得暴涨。
- 一致性：有 blocking/major 时 `noCorrectionNeeded` 必须为 false。
- 置信：`meaningBasis='ai_estimated'` 时 `meaningConfidence` 不得超过 0.6。

## 7. 验收标准（AC1–AC14）

| # | 标准 | 证据 |
| --- | --- | --- |
| AC1 | 一句话任务可提交、可完成；短文本不因长度被拒 | `outputCore` / smoke B |
| AC2 | 无 AI Key 时保存原文，反馈明确 `unavailable`，不伪造语法 | smoke B |
| AC3 | 首次提交前不可看范文 | `outputCore` / smoke C |
| AC4 | L4 示范后的正确表达不算独立掌握 | smoke D / D2 |
| AC5 | 独立产出写独立证据，分数有界，重复完成幂等 | smoke E / E2 / O |
| AC6 | AI 反馈通过契约校验且只评语言 | smoke F / F2 |
| AC7 | 编造 span 整条拒绝，原文不丢 | smoke G |
| AC8 | 照抄建议标 `copied`，不写独立证据 | smoke H |
| AC9 | 自己修改标 `self`，保留修订历史 | smoke I |
| AC10 | Repair 有依据才判定保留，无依据为 null | smoke J |
| AC11 | 真实输入可交接为表达任务，带入用户总结 | smoke K |
| AC12 | Planner 排入真实表达任务且不超预算 | smoke L / `outputIntegration` |
| AC13 | 无材料时不伪造来源任务 | `outputIntegration` |
| AC14 | 备份/恢复保留任务契约、修改史与证据 | smoke N / `outputIntegration` |

## 8. 已知限制

- 本地检查只覆盖少数可确定问题，不做完整语法分析。
- Repair 的"意思保留"是粗判（≤0.5 置信），不能作为考试或能力证明。
- AI 反馈质量取决于 Provider；mock 只验证协议与质量门，不代表真实模型效果。
- 迁移/延迟只提供接口与证据降级规则，尚未做长期调度实验。
- Output Analytics 只做描述统计；样本不足时明确显示 insufficient evidence。
