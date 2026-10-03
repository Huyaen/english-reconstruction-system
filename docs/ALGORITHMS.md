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
