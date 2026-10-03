# English Reconstruction System V2
## PROJECT_SPEC — 个人英语习得与能力重构系统完整产品规格


> 本文件是项目的长期固定产品真相（source of truth）。
> 除非用户明确修改需求，否则 Agent 不得在换模型、换会话、恢复任务或重构时擅自改变这里已经确认的产品原则。

---

# 0. 任务性质

这是一个长期、多阶段、可能跨多个模型额度周期和多个 Agent 会话完成的真实软件工程项目。

现有项目已经存在一个可正常运行的英语词汇学习 Web App。

本任务不是重新创建一个新的 Demo，也不是推翻现有项目，而是在现有词汇软件基础上进行 **V2 级别系统化扩展和架构升级**，最终将其从：

> 自适应背单词软件

升级为：

> **Personal English Learning System / English Reconstruction System**

核心目标不是只提高考试分数，而是帮助用户逐渐真正掌握英语，使英语成为：

- 获取知识的信息渠道
- 阅读真实英文资料的工具
- 观看英文媒体的工具
- 表达观点的语言
- 学习历史、CS、游戏、AI、科技等内容的第二信息系统

考试能力作为现实需求保留，但不是整个产品的中心。

---

# 1. 现有项目继承原则

## 1.1 不允许无理由推倒重写

现有词汇项目已有较完整基础能力，包括但不限于：

- TypeScript
- Vite
- 浏览器 Web App
- IndexedDB 本地持久化
- 词书导入
- 英文 → 中文测试
- 中文 → 英文测试
- 反应时间记录
- 熟练度判断
- 弱词系统
- 混淆词
- 每词独立复习调度
- 间隔重复
- 学习统计
- AI API 配置
- 数据备份/恢复

这些已经工作的功能默认保留。

除非经过实际代码审计后确认某个模块存在明确架构缺陷，否则：

> **优先扩展，而不是重写。**

任何重大重构之前必须先创建 Checkpoint。

---

# 2. 项目最终目标

系统最终应建立一个：

# Personal English Model

即：

> 系统长期理解“这个用户英语到底会什么、不会什么、为什么不会、下一步最值得练什么”。

系统不是简单记录：

> 学了多少词。

而是长期建模：

- 哪些词用户只是见过
- 哪些词能快速识别
- 哪些词能主动想到
- 哪些词真正能使用
- 哪些语法结构已经理解
- 哪些句法结构经常读错
- 阅读最大瓶颈是什么
- 阅读生词率变化
- 阅读速度变化
- 中文翻译依赖变化
- 真实英语媒体理解变化
- 输出中的语法问题
- 输出中的词汇问题
- 用户的遗忘速度
- 隔夜保留率
- 7 日保留率
- 30 日保留率
- 不同主题下的理解能力
- 用户目前能承受的学习强度

系统应该随着使用时间增长：

> **越来越了解这个用户。**

---

# 3. 当前用户初始画像

系统初始可使用以下信息进行启动，但以后必须逐渐由真实数据覆盖这些人工输入。

当前大致情况：

- 高中阶段
- 英语考试约 30～40 / 100
- 听力、阅读、语法、完形、写作均较弱
- 部分阅读文章中陌生词可能达到约 50%
- 英文字幕 + 画面辅助的英文媒体理解约 60%
- 已经扫过大量高考考纲词汇，但很多只停留在短期记忆
- 用户短时记忆/第一次编码速度很快
- 问题主要是长期巩固不足
- 用户每天一般可用于自主英语学习约 30～45 分钟
- 有时可使用 60 分钟
- 主要学习时间在晚上
- 可以戴耳机观看英文内容

内容兴趣初始排序：

1. 历史
2. CS / 电竞
3. 游戏
4. AI
5. 美剧 / 剧集
6. 科技
7. 其他人文内容

这些兴趣权重必须可编辑。

---

# 4. 核心学习理念

整个系统必须遵循以下原则。

## 4.1 先学，再测

完全陌生知识不能直接拿来考试。

尤其是新词。

当前旧逻辑：

> 导入词书 → 直接随机四选一

必须升级为：

> 未接触  
> → Preview  
> → 建立第一次编码  
> → Recall  
> → 间隔重复  
> → 真实语境  
> → 主动使用

测试负责：

> 检查能不能提取。

Preview 负责：

> 第一次把信息装进去。

---

## 4.2 单词不是最终学习单位

长期学习单位需要逐渐升级为：

> 单词  
> → 高频搭配  
> → lexical chunk  
> → 句子  
> → 段落  
> → 文章  
> → 真实媒体  
> → 主动输出

例如：

不要永远只记录：

> reluctant = 不情愿的

而应该逐渐形成：

> reluctant  
> be reluctant to do sth  
> He was reluctant to admit...  
> 在真实文章中的语境  
> 在输出中主动使用

---

## 4.3 AI 是脚手架，不是英语世界本身

AI 负责：

- 生成适应性句子
- 生成强化文章
- 解释语法
- 拆解难句
- 分析输出
- 诊断学习问题
- 帮助生成训练任务

真实英语负责：

> **最终验收。**

用户不能长期只阅读 AI 专门为自己写的舒适材料。

随着水平提升：

> AI 定制材料比例逐渐降低  
> 真实英文比例逐渐提升。

---

## 4.4 中文是脚手架，不是敌人

早期允许：

> reluctant → 不情愿的

随着掌握度提升逐渐过渡到：

> reluctant → not willing to do something

最终目标：

> reluctant → 直接理解概念

系统应有意识减少中文依赖，但不能在用户基础不足时强制全英。

---

## 4.5 最终目标不是“翻译得很好”

目标是：

> English → Meaning

而不是永远：

> English → 中文 → Meaning

所以 Reading Lab 不得永久退化为逐句翻译工具。

---

# 5. 产品一级架构

系统至少包含以下主要模块：

```text
Personal Learning Model
│
├── Daily Planner
├── Vocabulary Engine
├── Sentence Lab
├── Grammar Knowledge Graph
├── Reading Lab
├── Reinforcement Engine
├── Real Input Hub
├── Output Lab
├── Exam Transfer Lab
├── Diagnostics & Analytics
├── AI Service Layer
└── Library / Data / Settings
```

所有模块共享同一个 Learning Model。

禁止做成彼此孤立的：

> 背词页面 + 阅读页面 + AI 聊天框。

所有学习行为必须尽可能产生结构化学习证据，并反向更新 Learning Model。

---

# 6. 每日学习主流程

系统首页采用：

# 强引导为主 + 有限自由

默认不要求用户自己决定：

> 今天应该学什么。

系统自动提供推荐路线。

但是允许：

- 跳过
- 延后
- 替换
- 改变顺序
- 自定义主题
- 自定义材料

自由度存在，但默认路线清晰。

---

# 7. 每日启动流程

每天打开软件后执行：

```text
① 选择今天可用时间
↓
② 选择今日状态
↓
③ Yesterday Recall
↓
④ 根据 Recall 校准计划
↓
⑤ 确定/继续 Mini Unit
↓
⑥ 生成今日完整训练路线
↓
⑦ 动态执行核心模块
↓
⑧ Closing Loop
```

---

# 8. 今日时间选择

提供：

- 20 min
- 30 min
- 45 min
- 60 min
- 自定义

训练采用：

> **Time Budget First**

即：

用户告诉系统：

> 今天有多少时间。

系统再决定：

> 今天做多少任务。

禁止形成：

> 用户今天有 30 分钟  
> 软件硬塞 65 分钟作业。

---

# 9. 今日状态选择

采用简单三档：

- 状态差
- 正常
- 状态好

只需一次点击。

状态影响：

- 新内容数量
- 句子难度
- 阅读难度
- 输入材料难度
- 输出强度
- Comfort / Growth Input 比例

但状态差不能成为完全逃避薄弱项的理由。

---

# 10. 每天五个核心能力全部覆盖

每天原则上都必须触及：

1. Vocabulary
2. Sentence / Grammar
3. Reading
4. Real Input
5. Output

顺序不固定。

系统可以动态重排。

例如：

```text
Reading
→ 发现弱词
→ Vocabulary
→ Sentence Lab
→ 回文章重读
→ Real Input
→ Output
```

也可以：

```text
Vocabulary
→ Sentence
→ Reading
→ Input
→ Output
```

动态顺序由系统根据当天状态决定。

---

# 11. 当天动态重规划

训练过程中系统允许小幅调整剩余计划。

例如发现：

> 今日隔夜词汇保留率异常低。

则可以：

```text
新词 30 → 18
旧词复习 +3 min
Sentence Lab +2 句
Growth Input → Comfort Input
```

约束：

- 总时长基本保持
- 调整幅度通常不超过 20～30%
- 五个核心模块仍尽量保留
- 不允许因为一个模块表现差就把剩余时间全部变成该模块

---

# 12. Mini Unit 系统

学习内容采用：

# 2～3 天 Mini Unit

而不是每天随机完全换主题。

默认 3 天。

可根据实际表现：

- 2 天提前结束
- 3 天标准
- 4 天额外强化

---

# 13. Mini Unit 三阶段

## Day 1 — Build

目标：

> 建立理解脚手架。

预计理解范围：

> 80～90%

重点：

- 核心背景
- 核心词汇
- 基础句法
- 相对容易文章
- 第一轮真实输入

---

## Day 2 — Strengthen

目标：

> 强化并扩展。

预计理解范围：

> 70～85%

重点：

- Day 1 弱词
- 更复杂句型
- 新文章
- 更完整真实输入
- 基础输出

---

## Day 3 — Transfer

目标：

> 脱离脚手架进行迁移。

预计理解范围：

> 65～80%

重点：

- 新真实材料
- 减少中文
- 真实语境理解
- 总结
- 观点
- 主动输出

结束后判断：

- 完成 Mini Unit
- 延长一天
- 以后进入间隔复习

---

# 14. 每个 Mini Unit 必须有 Anchor Material

Anchor Material 是这个 Unit 的核心真实材料。

可以是：

- 英文文章
- 历史文章
- YouTube 视频
- 纪录片
- CS 视频
- 游戏内容
- AI / 科技内容
- 美剧片段

所有：

- 单词
- Sentence Lab
- 辅助阅读
- 强化文章
- Output

尽可能围绕 Anchor Material 建立联系。

核心逻辑：

> 为真实英语做准备  
> → 理解真实英语  
> → 脱离辅助再理解  
> → 自己输出。

---

# 15. 今日主题选择

默认给用户 3 个推荐主题。

例如：

```text
① Why Did the Roman Republic Collapse?
预计理解率：76%
近期弱词覆盖：8
目标语法：relative clauses
预计时间：43 min

② Map Control in Counter-Strike
预计理解率：84%
...

③ Why AI Models Hallucinate
预计理解率：69%
...
```

用户可：

- 选择推荐主题
- 自己输入主题
- 点击“帮我决定”

推荐必须结合：

- 兴趣权重
- 当前水平
- 最近学习内容
- 最近弱词
- 语法弱点
- Mini Unit 连续性
- 难度

---

# 16. Anchor Material 来源

支持三种：

## A. 系统推荐

默认。

尽量推荐 3 个真实材料。

## B. 用户自己导入

支持：

- URL
- 文本
- 图片
- 截图
- 文章

## C. My English Library

用户看到感兴趣材料时可以：

> Save for Later

系统以后根据难度自动推荐。

---

# 17. 外部真实材料推荐原则

如果系统具有联网搜索能力：

必须尽可能验证：

- URL 是否有效
- 材料是否可访问
- 是否需要付费
- 是否存在明显地区限制
- 是否有文本/字幕
- 时长
- 来源
- 主题
- 语言
- 大致难度

禁止：

> 仅凭标题生成一个可能不存在的链接。

如果无法验证：

必须明确标记：

> 未验证可访问性。

如果没有联网能力：

不要伪造实时推荐。

改为：

- 从用户 Library 推荐
- 从已有来源库推荐
- 让用户手动提供链接

---

# 18. Anchor Material 冷启动测试

首次接触真实材料时默认采用：

# Short Cold Test

文章：

- 先读一个小段
- 不提供额外解释
- 做简单理解判断

视频：

- 用户先自己看约 1～2 分钟
- 软件不做视频内容 AI 分析
- 用户填写理解率与卡点

目标：

获得真实基线。

例如：

```text
Cold comprehension: 54%
After support: 79%
```

系统用前后变化衡量真正的帮助效果。

---

# 19. 视频 AI 分析明确取消

不要实现：

- Gemini 长视频分析
- 实时视频视觉理解
- 视频逐帧分析
- 全视频多模态理解
- 持续 AI 监听

原因：

> 成本过高，不符合当前项目收益。

视频、纪录片、YouTube、美剧由用户自己正常观看。

系统只记录：

- title
- URL
- topic
- duration
- watchedDuration
- captionMode
- selfReportedComprehension
- difficultyReason
- notes
- postOutput

captionMode 至少包括：

- no captions
- English captions
- Chinese captions

difficultyReason 包括：

- vocabulary
- speed
- connected speech
- grammar
- proper nouns
- background knowledge
- other

如果用户自己提供 transcript：

可把 transcript 当作 Reading/Text Material 分析。

---

# 20. 视频输入后复盘

默认采用标准模式。

## A. Light Mode

状态差时：

- 理解率
- 难度
- 最大障碍

约 30 秒。

## B. Standard Mode

默认：

- 理解率
- 最大障碍
- 3～5 句英文总结
- AI 分析语言表达

约 3～5 分钟。

## C. Deep Mode

Mini Unit Day 3 或状态好时：

- main idea
- 3 key points
- opinion
- 30～60 秒或多句英文复述

AI 只分析：

> 用户的英语输出。

默认不判断：

> 视频内容总结是否事实准确，

除非系统同时拥有可靠 transcript。

---

# 21. Reading Lab

Reading 是 AI 深度参与的核心输入模块。

支持文章来源：

- 用户拍照
- 用户截图
- 粘贴文本
- 文档文本
- 真实文章
- 系统推荐文章
- AI 生成强化文章

---

# 22. 拍照 / 图片文章导入

移动端支持：

> camera capture

图片进入：

> Vision/OCR Adapter

如果当前配置 AI 支持视觉：

使用 AI 识别。

如果存在本地 OCR 能力：

可以作为 fallback。

必须允许用户人工修正识别结果。

禁止在识别明显错误时直接进入教学流程。

---

# 23. Reading Lab 默认采用 Layered Reading

禁止默认从 Sentence 1 开始逐词翻译整篇。

完整流程：

```text
Preview
↓
Paragraph Read
↓
Main Idea
↓
Problem Detection
↓
Vocabulary Marking
↓
Difficult Sentence → Sentence Lab
↓
Re-read
↓
Whole Text Comprehension
↓
Output
```

---

# 24. Preview

只展示：

- 标题
- 图片（如有）
- 主题
- 极少量背景提示

不提前把全文解释给用户。

可以询问：

> 你认为文章可能讲什么？

---

# 25. Paragraph Reading

每次显示约：

> 80～120 words

根据水平动态调整。

用户先正常阅读。

不鼓励：

> 每遇到一个生词就查。

段落结束首先问：

> 这一段大概在说什么？

初期允许中文。

后期逐渐要求简单英文。

---

# 26. Problem Detection

系统找真正卡点。

证据包括：

- 用户手动标记
- 生词点击
- 停留时间
- 回读
- 理解题错误

真正难句才送入 Sentence Lab。

---

# 27. 阅读中的生词标记

每个词允许：

- 知道
- 模糊
- 不知道
- 根据上下文猜出

记录原始上下文。

例如：

```text
word: mounting
source: ReadingSession-xxx
sentence: "...despite mounting pressure..."
state: unknown
exposure: +1
```

阅读时不要强制立刻背。

结束后统一筛选。

---

# 28. 阅读生词价值筛选

阅读结束后系统分类：

## Core Words

值得加入 Vocabulary Engine。

## Recognition Words

知道大意即可。

## Low Value / Proper Nouns

不需要正式记忆。

筛选依据：

- 使用频率
- 考纲价值
- 用户真实遇见次数
- Mini Unit 相关性
- 当前水平
- 词族价值

---

# 29. Reading 来源比例

初始建议：

- 40% 用户导入 / 真实材料
- 30% AI 定制强化文章
- 30% 系统推荐真实文章

随着能力提升：

> AI 定制占比下降  
> 真实英语占比提升。

---

# 30. Reading 长期辅助退场机制

阅读训练分阶段：

## Stage 1

结构 + 中文理解

## Stage 2

结构 + 中文意译

## Stage 3

英文回答理解问题

## Stage 4

English Summary

## Stage 5

直接理解

系统根据 Translation Dependence 和理解数据自动逐渐减少中文辅助。

---

# 31. Vocabulary Engine

保留现有模块。

升级数据和学习流程。

---

# 32. 单词生命周期

至少：

```text
UNSEEN
PREVIEWED
LEARNING
RECOGNITION
ACTIVE
PRODUCTIVE
```

不能导入后直接进入正式测试。

---

# 33. New Word Preview

每天新词正式 Recall 前先 Preview。

示例：

```text
reluctant
/rɪˈlʌktənt/

adj. 不情愿的；勉强的

be reluctant to do sth

He was reluctant to admit his mistake.
```

允许：

- 已经会
- 熟悉
- 陌生
- 跳过

Preview 目标：

> 快速建立第一次编码。

平均停留不应强制过长。

---

# 34. Preview 后才进入 Recall

支持：

- English → Chinese
- Chinese → English
- 以后可扩展拼写
- chunk recall
- context selection

继续使用：

- responseTime
- correctness
- confusion
- priority
- spaced repetition

---

# 35. 单词三维能力

每个词分别维护：

## Recognition

看到英文是否快速理解。

## Active Recall

给概念/中文是否能想到英文。

## Productive

是否在输出中真正正确使用。

例如：

```text
reluctant
recognition: 91
activeRecall: 63
productive: 28
```

禁止用一个 mastery 值完全替代这三个维度。

现有 mastery 可继续作为综合指标。

---

# 36. Exposure 系统

区分：

## Exposure

只是看见。

## Recall Evidence

主动提取成功。

## Production Evidence

主动使用成功。

例如：

阅读里遇到：

> exposure +1

测试成功：

> recallEvidence +1

输出里主动正确使用：

> productionEvidence +1

---

# 37. 新词来源：多词池

每日新词从多个池混合选择。

## Pool A — Foundation

高考 / 高频基础词。

## Pool B — Mini Unit

当前主题核心词。

## Pool C — Encountered

真实阅读中实际遇到的高价值生词。

## Pool D — Forgotten

以前已经掌握但重新遗忘的词。

Forgotten 不算真正新词，应优先回流。

---

# 38. 当前阶段推荐新词比例

初期：

```text
50～60% 基础核心词
20～30% Mini Unit 核心词
10～20% 阅读 / 真实输入产生的高价值词
```

以后基础覆盖提升：

> 真实英语来源占比逐渐增加。

---

# 39. Learning Value Score

系统为候选词计算学习价值。

参考因素：

- 基础词频
- 高考/常用价值
- Mini Unit 相关性
- 最近遇见次数
- 是否影响阅读
- 是否属于重要词族基础
- 是否与多个已学词相关
- 当前难度是否适合

避免优先学习大量低频词和专有名词。

---

# 40. 新词数量动态调整

不能固定每天 100。

根据：

- Day 1 retention
- Day 7 retention
- 当前 weak load
- 今日时间
- 今日状态
- 最近疲劳
- 阅读生词率

动态确定。

例如：

如果：

```text
D1 retention 89%
D7 retention 82%
```

可以适度加新词。

如果：

```text
D1 65%
D7 41%
```

减少新词，增加复习。

---

# 41. 大容量快速测试保留

用户适合：

> 高频、大量、快速 Recall。

允许：

- 300
- 500
- 1000+

次快速测试。

但必须区分：

> test count

和：

> new word count。

大量测试不意味着大量新词。

---

# 42. Response Time 继续作为核心证据

不能：

> 答对 = 会。

例如初始状态：

```text
<1.5s         instant
1.5–3s        fluent
>3s correct    vague
wrong          unknown
```

阈值必须可配置。

未来可以根据个人平均速度自适应。

---

# 43. Adaptive Spaced Repetition

继续保留并升级。

不能机械使用统一：

> 1 / 3 / 7 / 14 / 30

每个词独立调度。

参考：

- 正确率
- responseTime
- streak
- forgetCount
- direction
- context evidence
- production evidence

---

# 44. Confusion System

保留并升级。

例如用户频繁：

```text
affect → effect
```

则记录 confusion edge。

以后生成选项时提高真实混淆项概率。

---

# 45. Sentence Lab

Sentence Lab 是第二核心模块。

目标：

> 让用户看到英语时自动感觉句子结构。

不是：

> 背大量语法术语。

---

# 46. Sentence Lab 句子来源

默认初始比例：

- 40% AI 定制句
- 40% 用户真实遇到的难句
- 20% 新真实语料句

后期：

> 真实语料比例逐渐提高。

---

# 47. AI 生成句子必须条件化

禁止：

> 随机生成“差不多难”的句子。

生成条件至少包括：

- targetWords
- targetGrammar
- Mini Unit theme
- user vocabulary level
- user grammar level
- desired difficulty
- max unknown words

例如：

```text
target word: maintain
grammar target: basic relative clause
known vocabulary coverage target: >=95%
theme: Roman Republic
```

---

# 48. Sentence Lab 拆句流程

不得直接显示整句翻译。

引导顺序类似：

```text
谁？
↓
做什么？
↓
对什么做？
↓
这一部分修饰谁？
↓
哪个从句？
↓
这个 doing/done/to do 起什么作用？
↓
逻辑关系是什么？
↓
完整意义
```

---

# 49. Sentence Tree

必须支持视觉结构。

例如：

```text
Scientists
└── have discovered
    └── that...
        └── most people
            └── don't do a good job
                └── of predicting
                    └── what will make them happy
```

允许折叠/展开。

---

# 50. Grammar Knowledge Graph

语法必须有显式知识图谱。

不能只显示：

> Grammar Score = 63。

例如：

```text
Sentence Structure
├── SVO
├── Linking Verb
├── Complement
└── Modifier

Clauses
├── Object Clause
├── Relative Clause
├── Adverbial Clause
└── Subject Clause

Non-finite
├── doing
├── done
└── to do

Tense
...

Comparison
...
```

每个节点记录：

- exposures
- attempts
- correct
- errorTypes
- retention
- mastery
- lastSeen
- nextReview
- realContextEvidence

---

# 51. Grammar 页面

用户可以查看：

```text
Object clause      78%
Relative clause    61%
doing              44%
done               27%
to do              49%
```

并点击查看：

- 知识卡
- 最近错误
- 真实难句
- 强化记录
- 掌握趋势

---

# 52. Just-in-Time Grammar Teaching

不要逼用户按教材章节顺序学习。

真实句子中遇到问题后：

展示一个 20～60 秒知识卡。

例如：

```text
介词 + doing

介词后需要名词性质成分。

of predict      ✗
of predicting   ✓
```

然后立刻再练一个类似句子。

---

# 53. Reinforcement Engine

根据近期：

- weak words
- vague words
- grammar weaknesses
- Mini Unit theme

生成自然强化材料。

例如：

弱词：

```text
significant
decline
authority
maintain
conflict
```

语法：

> relative clauses

则生成：

> Why the Roman Republic Gradually Declined

要求这些目标自然出现。

---

# 54. 强化材料限制

AI 文章不能为了塞词写得不自然。

生成约束：

- target length
- target unknown rate
- target words
- target grammar
- theme
- naturalness
- age appropriate
- content coherence

除目标词外，尽可能使用用户已掌握词。

---

# 55. Real Input Hub

Real Input 包括：

- 视频
- 纪录片
- YouTube
- 剧集
- 游戏内容
- CS
- AI
- 科技
- 历史
- 英文真实文章

Input Hub 负责：

- 推荐
- Library
- metadata
- difficulty
- self-report
- post-output

不负责长视频 AI 分析。

---

# 56. Comfort Input / Growth Input

推荐分两种：

## Comfort

预计理解：

> 80～90%

目标：

> 享受英语、建立使用感。

## Growth

预计理解：

> 65～80%

目标：

> 扩展能力。

系统根据状态和 Mini Unit 自动决定比例。

---

# 57. Output Lab

Real Input 和 Reading 后必须逐渐进入 Output。

形式包括：

- 一句话
- 3～5 句总结
- paragraph summary
- retelling
- opinion
- free expression

语音可作为后续阶段扩展。

第一版优先文字输出。

---

# 58. Output 允许绕开不会的词

用户不会：

> assassination

但说：

> someone killed the political leader

不能简单判定失败。

系统应该识别：

> communication repair ability

这是语言真实使用能力。

---

# 59. Output AI Feedback

前台采用：

# Diagnostic First

不要主要给一个总分。

例如：

```text
意思表达：成功

主要问题：
- become → became
- 第三人称 / 时态

表达优点：
- 因果关系清楚

可以升级为：
The Roman Republic became increasingly unstable because...

本次下一步：
时态 + relative clause
```

---

# 60. AI 升级表达必须控制难度

升级原则：

> Current Level + ~0.5

禁止把：

> Caesar was very powerful.

改成完全脱离用户水平的 C2 复杂句。

目标：

> 稍微高一点，但用户能学会。

---

# 61. Output 后台量化

后台可保留：

- meaning
- grammar
- vocabulary
- fluency
- coherence
- repairAbility

用于趋势。

前台不强调：

> 71 / 100。

---

# 62. Translation Dependence

定期记录：

用户理解英语时：

```text
A 直接理解
B 少量中文辅助
C 大部分经过中文
D 基本逐词翻译
E 没理解
```

长期目标：

```text
D/C → B → A
```

这是核心能力指标。

---

# 63. Daily Closing Loop

每天结束固定：

> 3～5 min

不加入新知识。

快速主动回忆：

- 今日几个最重要单词
- 一个 chunk
- 一个语法结构
- Mini Unit 核心概念
- 一句英文总结

然后记录：

> 今日难度：
- 轻松
- 刚好
- 偏难

---

# 64. Yesterday Recall

第二天正式学习前：

> 2～4 min

检测：

- 昨日核心词
- 昨日 grammar target
- Mini Unit 内容
- 一句输出

Yesterday Recall 是：

> 每日 Calibration Test

---

# 65. Yesterday Recall 直接影响今日计划

流程：

```text
选择时间
↓
选择状态
↓
Yesterday Recall
↓
得到隔夜真实保留
↓
生成最终今日计划
```

例如隔夜词汇 retention 过低：

> 自动减少今天新词。

---

# 66. Retention Metrics

至少记录：

- Immediate Retention
- Overnight Retention
- Day 7 Retention
- Day 30 Retention

目标：

> 建模用户自己的遗忘规律。

---

# 67. Weekly Diagnostic

每周一次。

建议：

> 15～25 min

不是考试。

目标：

> 防止系统只会让用户对刚练过的材料变熟。

内容：

## Vocabulary

抽 7 日前及更早词。

## Sentence

全新未见句。

## Reading

非 AI 定制真实短文。

## Output

简单迁移任务。

## Translation Dependence

检测是否减少。

输出：

- 本周真实进步
- 短期熟悉项
- 当前瓶颈
- 下周难度
- 新词量调整
- 中文辅助调整

---

# 68. Mastery 必须使用多证据

禁止：

> 做对 2 次 = mastered

必须综合：

- recent accuracy
- response time
- overnight retention
- 7-day retention
- new-context recognition
- real-text evidence
- output evidence

语法同理。

---

# 69. 不积学习债，只保留记忆债

这是调度核心原则。

昨天没完成：

- 新词
- AI 文章
- 普通 Sentence Lab
- 普通 Output

不要累积成今天必须补完。

真正需要延期：

- 到期复习
- 严重弱词
- 关键延迟测试

---

# 70. 中断学习处理

## 断 1 天

正常恢复。

稍微增加旧内容复习。

## 断 2～3 天

先：

> 5 min Re-entry Check

检测：

- 旧词
- Mini Unit
- 句法

再重新计划。

## 断 7 天+

运行：

> Mini Diagnostic

重新估计真实状态。

禁止把一周前未完成的作业全部叠回来。

---

# 71. 不使用惩罚式 Streak

可以显示：

- 本周 5/7 天
- 本月累计 14h
- 最近 30 天学习频率

不要：

> 断一天 → 47 天 streak 清零 → 制造负反馈。

产品目标：

> 让用户长期回来。

---

# 72. 核心量化指标

Dashboard 必须优先展示真实能力变化。

---

## Vocabulary Retention

```text
D1
D7
D30
```

---

## Stable Recognition Vocabulary

估算真正稳定识别的词汇量。

---

## Retrieval Speed

例如：

```text
3.8s → 2.9s → 2.1s
```

---

## Reading Unknown Rate

这是非常重要的指标。

例如：

```text
49% → 38% → 27% → 18%
```

---

## Sentence Parsing Accuracy

例如：

```text
36% → 59% → 77%
```

---

## Reading Speed

words / minute

但不能以牺牲理解为代价。

---

## Translation Dependence

长期趋势。

---

## Real English Comprehension

用户自评：

- with captions
- without captions

---

## Caption Dependence

趋势：

```text
Chinese subtitles
→ English subtitles
→ no subtitles
```

---

## Input Duration

能连续理解真实英语多久。

---

## Output Metrics

- meaning delivery
- grammar errors / 100 words
- vocabulary range
- active vocabulary
- coherence
- repair ability

---

# 73. 不展示虚假成长

不要把：

> 学了 5382 个词

当作主指标。

更重要：

```text
稳定识别：1820
模糊：462
严重弱词：153
D7 retention：77%
```

---

# 74. Personal Learning Model

系统最终维护类似：

```text
English
│
├── Vocabulary
│   ├── Recognition
│   ├── Active Recall
│   └── Productive
│
├── Grammar
│   ├── Sentence Structure
│   ├── Object Clause
│   ├── Relative Clause
│   ├── Non-finite
│   └── ...
│
├── Reading
│   ├── Main Idea
│   ├── Detail
│   ├── Reference
│   ├── Inference
│   └── Speed
│
├── Real Input
│   ├── Captioned Comprehension
│   ├── Non-captioned Comprehension
│   └── Duration
│
└── Output
    ├── Meaning
    ├── Grammar
    ├── Vocabulary
    ├── Coherence
    └── Repair Ability
```

数值不能全部由 AI 拍脑袋生成。

核心数值必须尽可能来自真实记录。

---

# 75. Exam Transfer Lab

考试能力保留，但不是产品中心。

支持：

- reading
- cloze
- grammar
- translation
- writing
- listening record

错题至少分类：

- Vocabulary Error
- Structure Error
- Logic Error
- Evidence Error
- Overthinking
- Time Pressure

这些结果反馈回 Learning Model。

例如：

> 最近考试错误 41% 来自 vocabulary coverage

系统知道：

> 真正瓶颈不是再刷 50 篇阅读题，而是基础词汇覆盖。

---

# 76. AI 角色

AI 主要负责四件事：

## Generate

- sentences
- reinforcement articles
- output prompts

## Explain

- grammar
- difficult sentences
- vocabulary context

## Diagnose

- output weaknesses
- weekly patterns

## Recommend

- learning suggestions
- theme ideas

AI 不应作为：

> 所有数值状态的唯一来源。

---

# 77. AI Provider

继续支持：

- API Endpoint
- API Key
- Model Name

优先兼容：

> OpenAI Compatible API

允许以后增加：

- OpenAI
- DeepSeek
- OpenRouter
- Gemini text
- other providers

---

# 78. AI Key 安全

API Key：

- 默认只存在本地
- 不写入日志
- 不提交 Git
- 不出现在导出分享文件中，除非用户明确选择
- UI 使用 password field
- 禁止发送到第三方 telemetry

---

# 79. AI Structured Output

所有 AI 功能尽量使用结构化 JSON。

例如 Sentence Generation：

```json
{
  "sentence": "...",
  "target_words": [],
  "grammar_targets": [],
  "difficulty": 0.0,
  "explanation": {}
}
```

必须：

- schema validate
- error handling
- retry
- malformed output fallback

不要把关键逻辑建立在脆弱的字符串解析上。

---

# 80. AI Prompt 管理

Prompt 不要散落在 UI 文件里。

集中：

```text
src/ai/prompts/
```

或现有架构对应目录。

每个 prompt：

- versioned
- documented
- testable

例如：

```text
sentence-generator.v1
reading-reinforcement.v1
output-diagnosis.v1
grammar-explanation.v1
weekly-diagnosis.v1
```

---

# 81. AI 必须可关闭

即使：

> API 未配置

核心系统仍应可使用：

- Vocabulary
- Review
- local scheduling
- statistics
- saved articles
- manual reading
- manual input logging

AI 是增强层。

---

# 82. 数据层扩展

现有 IndexedDB 不要废弃。

应进行 versioned migration。

现有 store 继续保留，例如：

```text
books
words
records
sessions
analyses
meta
```

根据实际代码核对，不要假定名字完全相同。

---

# 83. 建议新增 Stores

根据现有架构最终确定，但至少需要支持：

```text
wordExposures
grammarConcepts
grammarAttempts
sentenceAttempts
passages
readingSessions
inputSources
inputSessions
outputAttempts
dailyPlans
miniUnits
skillSnapshots
weeklyDiagnostics
libraryItems
```

不要盲目照抄名字。

先审计当前 schema。

---

# 84. Word 数据升级

需要兼容旧 Word 数据。

新增能力可类似：

```text
recognitionScore
activeRecallScore
productiveScore

exposureCount
contextExposureCount
productionEvidence

previewedAt
lastEncounteredAt

sourceTypes
tags
```

必须做 migration。

禁止：

> 升级数据库后旧词书全部丢失。

---

# 85. GrammarConcept 示例

```text
id
name
parentId

exposures
attempts
correct

mastery
retention

errorTypes

lastSeenAt
nextReviewAt
```

---

# 86. SentenceAttempt 示例

```text
id
sentence

sourceType
sourceId

targetWords
targetGrammar

subjectCorrect
verbCorrect
structureCorrect

translationDependence
duration

errors
createdAt
```

---

# 87. ReadingSession 示例

```text
id
passageId

wordCount
duration

unknownWords
vagueWords

unknownRate
firstPassComprehension
secondPassComprehension

readingSpeed

structureErrors
translationDependence

summary
createdAt
```

---

# 88. InputSession 示例

```text
id

title
url
topic

duration
watchedDuration

captionMode
comprehension

difficultyReasons

outputAttemptId

createdAt
```

---

# 89. OutputAttempt 示例

```text
id

prompt
sourceType
sourceId

originalText

meaningEvidence
grammarEvidence
vocabularyEvidence
coherenceEvidence
repairAbility

corrections
upgradeSuggestion

createdAt
```

---

# 90. DailyPlan 示例

每日计划必须持久化。

至少记录：

```text
date

availableMinutes
energyState

yesterdayRecallResult

miniUnitId

initialPlan
adjustments
actualExecution

completedModules

closingLoop

createdAt
completedAt
```

---

# 91. MiniUnit 示例

```text
id
theme
dayIndex

anchorMaterialId

targetWords
targetGrammar

difficultyTarget

status

startedAt
completedAt
```

---

# 92. SkillSnapshot

建议每天/每周保存 snapshot，而不是每次实时重算所有历史。

例如：

```text
date

stableVocabulary
d1Retention
d7Retention
d30Retention

avgRetrievalTime

readingUnknownRate
readingSpeed

sentenceParsing

translationDependence

captionedComprehension
uncaptionedComprehension

outputSummary
```

---

# 93. 首页 UI

首页重点是：

# Today's Plan

而不是一堆功能入口。

例如：

```text
Today
45 min · Normal

Yesterday Recall
3 min

Mini Unit
Why Did the Roman Republic Collapse?
Day 2 / 3

Today's Plan

01 Review Words
7 min

02 Sentence Lab
6 min

03 Reading
9 min

04 New Words
6 min

05 Real English
12 min

06 Output
3 min

Closing Loop
4 min
```

主按钮：

> Start Today's Training

---

# 94. 有限自由

每张任务卡允许：

- Start
- Delay
- Skip
- Replace

Skip 后系统记录原因。

不能强制用户卡死在某一步。

---

# 95. 页面建议

最终至少：

```text
Today
Vocabulary
Sentence Lab
Grammar
Reading
Input Hub
Output
Library
Progress
Weekly Diagnostic
Settings
```

Exam Lab 可单独入口。

---

# 96. 性能要求

用户可能：

- 词库 5000～10000+
- 一次测试 1000+
- 长期产生大量 records

要求：

- IndexedDB query 有索引
- 不要每次全表扫描
- 大列表 virtualize / paginate
- quiz 切题低延迟
- 统计尽量增量计算
- 不要因 AI 返回阻塞整个 UI

---

# 97. 响应式

桌面优先。

同时兼容手机。

特别是：

- 阅读
- 相机导入
- 词汇 Preview
- 输入日志
- Output

应可在移动端使用。

---

# 98. 无障碍与键盘

保留高速键盘学习。

例如：

```text
1–6 选择答案
Space 不知道
Enter 下一步
Esc 返回
```

Sentence / Reading 应尽可能支持键盘操作。

---

# 99. 数据备份

必须继续支持：

> Export All Data

建议 JSON。

至少包含：

- words
- records
- grammar
- reading
- miniUnits
- input
- output
- settings
- skill history

支持完整恢复。

---

# 100. 数据迁移原则

所有 DB migration 必须：

1. versioned
2. 可回滚或至少有备份
3. migration 前自动提醒/快照
4. 不清空旧数据
5. 有 migration test

---

# 101. 质量要求

这个项目最终必须是：

> 真正能每天长期使用的软件。

不要做：

- Mock-only
- 漂亮 Demo
- 假按钮
- 假 AI
- 假统计
- hard-coded 示例数据
- 只做页面不做逻辑

未完成就是未完成。

必须明确标记。

---

# 102. 测试策略

至少增加自动化测试体系。

如果当前没有测试框架：

优先考虑：

- Vitest：unit/integration
- Playwright：关键 E2E

但不要为了测试框架推翻现有技术栈。

---

# 103. 至少测试以下逻辑

## Vocabulary

- Preview
- Recall
- response time
- mastery
- confusion
- retention
- scheduler
- word pool selection

## DB

- old schema migration
- new stores
- backup
- restore
- refresh persistence

## Daily Planner

- time budget
- energy state
- yesterday recall
- adjustment
- no learning debt

## Sentence

- structured AI response
- parse state
- grammar evidence

## Reading

- unknown word capture
- layered reading state
- re-read
- metrics

## Output

- AI failure
- malformed JSON
- retry
- offline fallback

---

# 104. E2E 场景

至少验证：

## Scenario A

新用户：

```text
导入词书
→ Preview 新词
→ Recall
→ Closing
→ refresh
→ 数据仍在
```

## Scenario B

第二天：

```text
Yesterday Recall
→ 系统减少/增加新词
→ 生成计划
```

## Scenario C

Reading：

```text
导入文章
→ 标记生词
→ Sentence Lab
→ 生词进入 Vocabulary
```

## Scenario D

Mini Unit：

```text
Day 1
→ Day 2
→ Day 3
→ completed
```

## Scenario E

中断 3 天：

```text
Re-entry Check
→ 重新计划
```

---

# 105. 不允许 Codex 自作主张改变的产品原则

以下已经由用户确认。

不得擅自改变：

1. 强引导 + 有限自由
2. Time Budget First
3. 状态三档
4. 每天五个核心模块都覆盖
5. 模块顺序动态
6. 2～3 天 Mini Unit
7. 每 Unit Anchor Material
8. 默认 3 个主题推荐
9. Anchor Material 三入口
10. Short Cold Test
11. 智能辅助但默认不打断
12. 阅读生词即时轻标记 + 后置筛选
13. 视频不做 AI 内容分析
14. 视频默认 Standard Output
15. Reading 使用 Layered Reading
16. 当日计划允许小幅动态调整
17. Closing Loop
18. Yesterday Recall
19. Recall 直接影响今日计划
20. 多词池选新词
21. Sentence 来源混合
22. Grammar Knowledge Graph
23. Reading 来源混合
24. Output 诊断优先
25. 多证据 Mastery
26. Weekly Diagnostic
27. 不积学习债
28. 真正掌握英语优先于单纯考试

---

---

# 附录 A：已确认的 28 项产品决策

以下决策已经与用户逐项确认，属于高优先级产品约束：

1. 首页采用“强引导为主 + 有限自由”。
2. 采用 Time Budget First：先选今日可用时长，再由系统生成任务量。
3. 每天选择三档状态：状态差 / 正常 / 状态好。
4. 每天原则上覆盖 Vocabulary、Sentence/Grammar、Reading、Real Input、Output 五个核心模块。
5. 五个模块顺序由系统动态调整，而不是固定死。
6. 学习内容采用 2～3 天 Mini Unit。
7. 每个 Mini Unit 都有 Anchor Material。
8. 今日主题默认由系统推荐 3 个供用户选择。
9. Anchor Material 支持：系统推荐 / 用户导入 / My English Library。
10. Anchor Material 首次接触采用 Short Cold Test。
11. 真实输入采用“智能辅助但默认不打断”。
12. 阅读生词采用“即时轻标记 + 后置统一筛选学习”。
13. 视频/纪录片/YouTube/美剧不做昂贵的 AI 长视频内容分析。
14. 视频输入后默认采用 Standard Output 复盘。
15. Reading Lab 默认采用 Layered Reading。
16. 当日计划允许在总时间内进行约 20%～30% 的小幅动态调整。
17. 每天固定 Closing Loop。
18. 第二天开始固定 Yesterday Recall。
19. Yesterday Recall 直接参与当天计划生成。
20. 新词采用多词池 + Learning Value Score 挑选，且必须先 Preview 再 Recall。
21. Sentence Lab 句子来源采用混合制。
22. Grammar 使用显式 Knowledge Graph。
23. Reading 来源采用真实材料 + AI 定制强化 + 系统推荐真实材料混合制。
24. Output 前台诊断优先，后台量化。
25. Mastery/升级必须使用多证据判定。
26. 每周固定 Weekly Diagnostic。
27. 不积学习债，只保留记忆债。
28. 系统最终目标是“真正掌握英语并把英语变成信息渠道”，而非只做应试提分工具。

---

# 附录 B：非目标（明确不做或不优先）

- 不做 Gemini/其他模型的持续长视频多模态分析。
- 不把系统做成纯题库。
- 不把系统做成单纯背词软件。
- 不把 AI 聊天框当成整个产品。
- 不长期强迫逐句中译英。
- 不把“学习了多少词 / 连续打卡多少天”当成主要成长指标。
- 不因中断一天而惩罚用户或制造巨量补作业。
- 不在未验证可访问性时伪造外部资源推荐。
