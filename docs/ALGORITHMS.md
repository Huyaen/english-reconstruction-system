# 核心算法与数据字典

代码权威定义在 src/types.ts / core.ts / quiz.ts，本说明与交付版对应。

## 数据结构

- Word：id/bookId/en/zh/pos/phonetic/example/collocation/difficulty/tags/order，内嵌state/schedule/confusions。
- WordBook：id/name/created。
- MasteryState：total/correct/streak/errors/lapses/meanMs/lastMs/lastCorrect/level/directions。directions 分别累计en-zh与zh-en的total/correct/meanMs。
- ReviewSchedule：due/last/interval/step/spacedPasses，时间均为毫秒。
- ReviewRecord：唯一id、wordId、sessionId、at、direction、correct、ms、selectedId、reason、before、after、scheduled。
- StudySession：id/started/ended/mode/queue/index/answered/correct/retries/question。queue含本轮回插词；question保存目标、方向和选项ID，刷新可恢复。
- Settings：fast/normal/timeout/ratio/difficulty/feedback/theme/endpoint/model/key/rememberKey。
- AIAnalysis：id/at/text/model/sampleSize。

## 熟练度和速度

本次分类classify：错误或ms≥timeout → unknown；否则ms≤fast → fluent；否则ms≤normal → normal；其余vague。

累计level：错误unknown；较慢正确或连续正确不足2次vague；快速正确且双向各正确≥2、各正确率≥0.8、spacedPasses≥3、连续正确≥4 → fluent；其余normal。

lapses在“上次正确、本次错误”时增加。它包括早期强化的失败，不仅代表跨天遗忘。统计中“到期答错”单独使用record.scheduled判断。

## 调度

阶梯毫秒：[900000,14400000,86400000,259200000,604800000,1209600000,2592000000,5184000000,10368000000]。

- 新词正确使用step0。
- 只有当前作答时间≥原due且已有记录，才算scheduled并增加spacedPasses。
- 正常/秒答到期成功，step+1，最大8。模糊成功step-1，最小0。
- 速度倍率：模糊0.7；step≥3的秒答1.3；其他1。
- 遗忘倍率：1/(1+min(lapses,5)×0.12)。
- interval=max(10分钟, round(阶梯×速度×遗忘倍率))；due=now+interval。
- 提前正确只更新表现，不改变原due/interval/spacedPasses。
- 任意错误重置10分钟、step0、spacedPasses0。
- 每轮错词、超时、不知道、ms>normal的正确词，最多回插1次，尽量隔5题；队列尾部不足5题时提前出现。

该算法是透明的启发式调度，不是FSRS、SM-2或科学标定的个体遗忘预测模型。

## 优先级

状态基数：unknown80 / vague60 / normal20 / fluent0，新词固定45。

已学词再加：总错误率×15；较差方向错误率×10（未测试方向按0.5）；min(连续错误,4)×4；min(lapses,5)×2；min(5,lastMs/2000)；min(5,历史混淆总次数)；逾期比例×10上限20；减min(5,streak)。

S≥90、A≥65、B≥40、C≥15、其余D。到期与弱词队列按分数降序，快速/抽查随机。

## 选项

简单用随机候选。普通与困难：随机扰动+同词性2+同难度1+拼写字符相似度×3+中文字符相似度+词书距离权重+历史混淆最多5。

目标和候选英文相同或拆分释义有明确相同项则排除。选项间再排除重复/重叠，确保4或6项。最后Fisher-Yates洗牌正确答案位置。

超过1200词时抽约1100候选，并额外包含附近词/历史混淆，避免每题对整库排序。仍会扫描词库收集优先候选。字符相似度只是启发式，不理解完整语义。

## 统计口径

日期采用本地日历日。今日次数是记录数，覆盖词为wordId去重。同一英文在不同词书有不同wordId。
今日新增/消除弱词比较今天该词首次记录before和最后记录after。
有效掌握=state.level为fluent且未超过due的词数。历史“进入熟练次数”和“到期答错次数”是事件次数，不是日内净新增词数。

---

# Phase 2 起：FSRS 调度（ts-fsrs@5.4.2）

实际 API 与字段以安装版本为准（`node_modules/ts-fsrs/dist/index.d.ts`）。业务层只通过 `src/fsrs.ts` 使用。

## 状态与字段

- Word.fsrs：`stability / difficulty / state(New=0,Learning=1,Review=2,Relearning=3) / reps / lapses / due / lastReview / scheduledDays / learningSteps`（时间戳毫秒）
- 参数：`request_retention`（默认 0.9）、`maximum_interval=36500`、`enable_fuzz=false`（确定性）、`enable_short_term=true`（学习步 [1m,10m]）

## Rating 映射（多因素，禁止单因素）

| 条件 | Rating |
|---|---|
| 错误 / 超时 / 主动不知道 | Again |
| 正确但 ms > normalMs | Hard |
| 首次正式 Recall 的正确（防短期记忆高估） | Good（封顶） |
| 秒答 + streak≥4 +（跨间隔≥2 或 FSRS reps≥2） | Easy |
| 其余正确 | Good |

阈值集中在 `RatingConfig`（fastMs/normalMs/timeoutMs 来自设置；easyMinStreak=4；easyMinSpaced=2；easyMinReps=2）。

## 调度权威与过渡

- `settings.schedulingAuthority`：`fsrs`（默认）｜`legacy`（回滚）。每次作答**同时**更新两套状态（shadow）；队列/到期显示按权威取值（`effectiveDue()`；无 FSRS 历史的词回退旧 due）。
- 旧调度器字段（interval/step/spacedPasses/due）继续维护，保证可随时回滚。

## 证据与生命周期（src/evidence.ts）

- Exposure（preview/reading/input）≠ Recall Evidence（答题）≠ Production Evidence（Output，预留 API）。
- 三维分数 EWMA（α=0.2）：recognition（En→中）/ activeRecall（中→En）/ productive（产出证据）。
- 生命周期：unseen→previewed→learning→recognition→active→productive（由分数 + 证据计数推导；可回退）。recognition 需 score≥55 且 En→中 证据≥3；active 需再满足 activeRecall≥55 且 中→En 证据≥3；productive 需生产证据≥3 且 productiveScore≥40。
- forgotten（回流）：lapses≥1 且 total≥4 且当前 unknown/vague 且（跨间隔≥1 或 FSRS reps≥3）。

## 词池与价值（src/pools.ts）

- 比例：foundation 55% / miniUnit 25% / encountered 20%（空池自动重分配，绝不造假数据）；Forgotten 优先回流、不计入新词数（上限 ceil(count×0.5)）。
- Learning Value（确定性）：foundation 标签/词书顺序 + encountered + forgotten + 难度适配 − 专名启发式；返回 `{score, reasons[], components{}}`。
- 动态新词量 `recommendedNewWordCount()`：`base=(availableMinutes×0.35)/0.6` × retentionFactor（D7≥0.8→1.2；<0.6→0.6；D1<0.6 再封顶 0.7）× energyFactor（low 0.7 / good 1.1）× loadFactor（due>80→0.5，>40→0.7；weak>100→0.8；近正确率<0.6→0.8），钳制 [5,40]。

## AI 强化（Phase 6）

- **结构化降级**：`auto` 模式按 `json_object → json_schema → text` 顺序尝试；只有 “该模型不接受 response_format” 才换模式，鉴权/限流/超时立即结束，避免成倍扣费。
- **重试边界**：传输层只对 429/5xx/超时/网络错误退避重试（≤ maxRetries）；生成层最多 3 次“生成 → 校验 → 修正”，限流不再整轮重试。
- **严格校验**：缺字段/多字段/类型错/枚举错/长度越界/目标词或语法点不在允许集合/证据句不在正文 → 一律拒绝；JSON 只做围栏、平衡提取、尾逗号三类修复。
- **质量门**：词数窗口、目标词出现（允许词形派生但不越过左词边界）、语法可观察标记（语义型概念标 unverifiable）、难度带（本地启发式）、内容指纹去重、来源归属、HTML/脚本/控制字符。
- **证据纪律**：生成材料只产生 `generated material`；AI 结构 `ai_unverified`；掌握只来自用户独立作答（BKT/FSRS 不变）。
- **用量**：Provider 给 usage 就用真实值，否则按字符/4 估算并标 `estimated`；预算按 token 计，不换算货币。

## Mini Unit（Phase 7）

- **Ready 判定**：真实 Anchor（provenance ≠ ai_generated）+ ≥1 目标词 + ≥1 目标语法；缺一项只能停在 draft。
- **学习日推进**：只允许完成 `nextDay()`；完成事件需要 ≥1 条真实活动证据；同一天重复提交返回 noop（幂等）。
- **目标词预算**：`round(minutes × 0.35 × (1.1 − difficulty) × (1 − min(0.4, dueLoad/100)) × 能量系数)`，夹在 3–18；排序 `learningValue × (1+ln(词频)) + 12(薄弱词)`。
- **目标语法**：知识图谱中有可观察正则且命中 Anchor → verified（带次数与片段）；否则薄弱概念 → candidate（不假装核验）。
- **迁移判定**：materialKind = authentic 仅当「不同材料 + 真实来源 + 无辅助 + 独立」；AI 材料或同文重读 → ai_assisted。
- **完成判定**：verified 需要 独立回忆 ≥3、覆盖 ≥50%、真实迁移理解 ≥0.5、中文依赖 ≤0.6；任一不满足 → limited_evidence（confidence 至少降一级）；`guardDecision` 再做一次硬闸。
- **置信度**：无证据必然 low；verified 且回忆/语法都有多份证据才 high。
- **并发**：创建互斥（单事务扫描未结束单元）+ revision 乐观锁 + 读改写同事务，保证并发晋级只生效一次。

## 兴趣排序与理由（Phase 8）

- 行为信号 `activitySignals(data, now)`：按材料 topic 聚合近 30 天阅读（0.4）、导入（0.15）、完成单元（0.3），
  权重 `exp(-days/21)` 衰减、单主题封顶 1；**只读**，不写回 `Settings.interests`。
- 推荐分数：`材料×2 + 薄弱词×3 + 语法×2 + 兴趣(4+2w) + 当前单元2.5 + 1.5×行为 − 4×近14天完成数 − 4×最近用过 − 2×超长材料`。
- 理由四分类（互斥，按优先级）：`interests` → `unit` → `recent(≥0.25)` → `explore`。
- 探索位：画像非空时，若前 3 条无 explore 候选，则用最高分 explore 候选替换末位。
- 防重复：`repeat=true` 的候选整体排在未重复候选之后（14 天窗口），仍可见、可解释。

## 真实输入状态机与证据口径（Phase 8）

- 状态：`created → active → paused → reflection → completed`；非终态 → `abandoned`。`complete` 前置：`reflection` 已存在；`completed` 再 `complete` 返回 noop（幂等）。
- 并发：转换在单事务内 read → compare `expectedRevision` → write；旧 revision 返回 `stale`，不会出现两个标签页互相覆盖。
- 证据：`watching_exposure`（自报时长）、`self_report`（自评，confidence<1）、`transcript_reading`（阅读字幕）、`independent_comprehension`（保留，本阶段未产生）、`output_attempt`（总结/复述原文）。id = `sessionId:type`，重复写入 no-op。
- 观看时长上限：`min(自报, duration+5)` 或 600 分钟（无时长时），防止误填把统计拉爆。
- 难度：仅当存在英文 transcript 时，用词长/句长/生词比例启发式估计；否则 `null`，`difficultyBasis='none'`。
- 推荐：显式兴趣命中 > Mini Unit 主题 > 近期真实行为 > 探索位；兴趣只影响排序，不进入难度/能力路径；无候选返回解释。

## 表达任务选择与规模（Phase 9）

- 任务来源优先级：当前 Mini Unit → 最近完成真实输入（有英文总结）→ 最近阅读（stage≥3）→ 薄弱词（errors>0 或 level unknown/vague）→ 用户指定类型/自由表达。
- 规模由 `defaultTaskType` 决定：≤6 分钟或低状态 → 一句话；<20 分钟 → 3–5 句总结；≥20 分钟且状态好 → 短段落/观点。字数只是建议区间，不阻止提交。
- 兴趣只写入 `reasons` 并参与排序权重，不改变难度、目标词预算、掌握度与计划时长。

## 反馈契约与质量门（Phase 9）

1. 结构校验：必填字段、枚举、数量上限（priorityIssues ≤3、corrections ≤6、strengths 1–5）。
2. 定位校验：每条 correction 必须满足 `text.slice(start,end) === original`；`upgrade.original` 必须逐字存在。
3. 范围校验：`feedbackScope` 与调用方一致；`language_only` 下禁止"事实正确"类断言。
4. 升级校验：`singleDimension=true`，新语法/生词数量受限，`suggested` 相对原文长度不得暴涨。
5. 一致性：存在 blocking/major 时 `noCorrectionNeeded` 必须为 false；`ai_estimated` 置信度 ≤0.6。
6. 失败处理：连续契约失败 → 状态 `invalid`，原文与修改保留，允许稍后重试。

## 产出证据与独立性（Phase 9）

- 独立性：`classifyIndependence` 依据最高辅助级别、是否照抄模型答案、文本相似度；L4 或高相似度 → `copied`。
- 证据键：`attemptId:wordId`；`mergeEvidence` 去重，重复完成返回现状（幂等）。
- 增量：独立正确 +0.08、辅助 +0.02、迁移 +0.12、延迟 +0.10、错误 −0.06；`productiveScore` 上限 0.95，下限 0。
- 只有 `independent && !copied` 进入分数路径；assisted 仅记录；copied 不产生证据。
- 照抄而无反馈时 correctness 记为 `questionable`（无法验证是否真的会）。

## 迁移与延迟（Phase 9）

- 迁移：从语境池按 `hash(seed|topic|id)` 确定选择，要求主题与沟通目标都改变；否则 `strength='weak'`，证据权重降低（0.4/0）。
- 延迟：D1/D7 生成相关但不同的任务，不展示原答案；与迁移共用证据降级规则。
