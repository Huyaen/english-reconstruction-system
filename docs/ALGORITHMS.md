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
