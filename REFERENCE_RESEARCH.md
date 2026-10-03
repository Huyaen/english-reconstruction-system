# REFERENCE_RESEARCH — GitHub 开源参考调研（Phase 0.5）

> 状态：**已完成（2026-10-04）**。结论见 §11 总表；每条目含 License/维护状态/源码实际查看记录。
> 用途：为 English Reconstruction System V2 的架构决策提供工程参考。
> 硬性边界：GitHub 项目只作参考；不推翻 `PROJECT_SPEC.md`；不改 28 项产品原则；不因开源库更换技术栈；未查 License 不复制代码。

调研方法（已执行）：

- GitHub MCP 搜索 + GitHub REST API（curl，小批次）获取 License / 最近提交 / 维护状态；
- 对高价值项目**实际读取源码、数据模型、核心算法**（不只是 README）；
- 结论按 **Adopt / Adapt / Reject** 分类；Reject 必须写明原因。

已完成的搜索批次（记录，避免重复）：

1. `fsrs spaced repetition`（stars 排序）
2. `spaced repetition language:TypeScript stars:>300`
3. `vocabulary learning app stars:>200`
4. `reading language learning vocabulary stars:>150`（0 结果）
5. `user:open-spaced-repetition`（组织全览）
6. `language learning reader annotation stars:>200`（0 结果）
7. `halflife regression forgetting curve`（0 结果，后以精确名命中）
8. `bayesian knowledge tracing learner modeling`
9. `lute learning with texts` → 定位 Lute（已迁移 LuteOrg/lute-v3）
10. `yomitan dictionary popup`
11. `asbplayer subtitles language immersion`（0 结果，后以精确名命中）
12. `vocabsieve` → FreeLanguageTools/vocabsieve
13. `pybkt knowledge tracing` → CAHLR/pyBKT
14. `halflife-regression` → duolingo/halflife-regression
15. `user:open-spaced-repetition` + `repo:…` 元数据批量核验（curl GitHub API，20 repos）
16. `prerequisite skill graph mastery learning stars:>30`（0 结果 → 结论：无对口 OSS）
17. `adaptive study planner stars:>100`（0 结果 → 结论：无对口 OSS）
18. 定向仓库核验：LuteOrg/lute-v3、asbplayer/asbplayer、vite-pwa/vite-plugin-pwa、567-labs/instructor-js、567-labs/instructor、colinhacks/zod、yomidevs/yomitan、naptha/tesseract.js、skywind3000/ECDICT 等（curl -L 跟随重定向）

候选池（20+，含已深挖与仅登记）：ts-fsrs、free-spaced-repetition-scheduler、fsrs-optimizer、fsrs4anki、fsrs.js、fsrs-rs、srs-benchmark、anki、Anki-Revlogs、srs-simulator、supermemo(JS)、obsidian-spaced-repetition、orbit、ulangi(archived)、wordpecker-app、LearnKit、true-recall、flashcards-open-source-app、fishword、Lute(lute-v3)、yomitan、vocabsieve、asbplayer、pyBKT、halflife-regression、dexie、idb、actualbudget/actual、tinybase、RxDB、instructor-js、instructor(py)、zod、ajv、jsonrepair、compromise、wink-nlp、spaCy、tesseract.js、vite-plugin-pwa、workbox、ECDICT、wordfreq。

---

# 1. Spaced Repetition / Memory Scheduling（本批完成）

## 1.1 open-spaced-repetition/ts-fsrs —— **Adopt（调度内核）**

- Repository：`open-spaced-repetition/ts-fsrs`
- URL：https://github.com/open-spaced-repetition/ts-fsrs
- License：MIT（repo metadata 实测）
- Last meaningful update：2026-10-03（pushed_at 实测，持续维护）
- Tech stack：TypeScript（monorepo：packages/fsrs + packages/binding）；ESM/CJS/UMD
- Relevant module：Vocabulary Engine 的每词独立调度（替代现有 9 级阶梯启发式）；后续 Grammar/Sentence 复习调度同样可用
- 实际读取的源码：`packages/fsrs/src/models.ts`、`packages/fsrs/src/algorithm.ts`（SHA 已记录）

**核心算法（实际代码确认，FSRS-6）**：

- 遗忘曲线：`R(t,S) = (1 + FACTOR · t / (9·S))^DECAY`，其中 `DECAY = -w20`，`FACTOR = e^(ln0.9/DECAY) − 1`；`S` 为稳定性（对应 R=90% 时的间隔天数）
- 参数：21 个权重 `w[]` + `request_retention`（目标保留率）+ `maximum_interval` + `enable_fuzz` + short-term 学习步（learning_steps/relearning_steps）
- 关键公式：`S0(G)=max(w[G-1],0.1)`；`D0(G)=w4−e^((G-1)·w5)+1`（D∈[1,10]）；成功 `S'=S·(1+e^w8·(11−D)·S^(−w9)·(e^(w10·(1−R))−1)·hard/easy 系数)`；遗忘 `S'f=w11·D^(−w12)·((S+1)^w13−1)·e^(w14·(1−R))`；难度线性阻尼 + 均值回归
- 间隔：`I = (R_req^(1/DECAY) − 1)/FACTOR · S`，钳制 [1, maximum_interval]，可选 fuzz（alea 伪随机）
- 数据结构：`Card{due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, reps, lapses, state}`；`state ∈ New|Learning|Review|Relearning`；`ReviewLog{rating, state, due, stability, difficulty, elapsed_days, scheduled_days, learning_steps, review}`
- 评分：`Rating ∈ Manual(0)|Again(1)|Hard(2)|Good(3)|Easy(4)`；`FSRSHistory/FSRSReview {rating, delta_t}` 支持从历史重放
- 测试策略（仓库结构可见）：packages/fsrs 内有完整测试与 binding-test 包；官方另有 srs-benchmark（对 100M+ 复习记录做离线评测）验证算法（见 1.2）

**可迁移到本项目的部分**：

- 直接 `npm i ts-fsrs` 引入调度内核（MIT，允许商用/闭源），替换 `core.ts` 的阶梯调度，同时保留本项目自己的反应时间分类（fluent/normal/vague/unknown → 映射为 Easy/Good/Hard/Again）
- Card 字段与我们的 Word 状态合并：`stability/difficulty/due/state/reps/lapses` 增量写入 Word；旧字段（step/spacedPasses）保留只读以兼容迁移
- 旧数据迁移：已有 words 没有 FSRS 字段 → Phase 1/2 迁移时给默认值，用历史 records 做“冷启动”（可选：用 `FSRSHistory` 重放把旧记录转换为初始 stability/difficulty）
- request_retention 暴露到设置（默认 0.9），maximum_interval 默认 36500

**不可照抄/注意**：

- 不要引入它的 `enable_short_term` 学习步机制作为默认（我们的学习步由 Preview→Recall 流程与反应时间决定）；学习步保持自适应
- 不要把它当作“学习价值/优先级”算法 —— FSRS 只排“何时复习”，不回答“先学什么词”（那是 Learning Value + 多词池的职责）
- 注意其 `elapsed_days/scheduled_days` 为天粒度；我们的高频快刷（同一分钟内多轮）需要按 ms 粒度做短间隔初始学习（本项目已有 10–15 分钟档位），映射时要防止天粒度取整丢精度

## 1.2 open-spaced-repetition/free-spaced-repetition-scheduler —— **Adapt（算法规范来源）**

- Repository：`open-spaced-repetition/free-spaced-repetition-scheduler`
- URL：https://github.com/open-spaced-repetition/free-spaced-repetition-scheduler
- License：MIT
- Last meaningful update：2026-04-21（pushed_at 实测）
- Tech stack：算法规范仓库（README + 文档，非可执行库）
- Relevant module：FSRS 算法原理（DSR 模型：Difficulty / Stability / Retrievability）
- 实际读取：README（完整）
- 有用内容：明确 FSRS 来源（MaiMemo DHP 模型 → DSR/三变量记忆模型）；记忆三定律（材料越复杂稳定性增长越低；稳定性越高增长越低；可提取性越低成功回忆的稳定性增益越大）；全本地运行。列出了各语言实现清单（ts-py-go-rs-dart-ruby-swift…）
- 与 ts-fsrs 的配合：本仓库 = 规范与原理；ts-fsrs = 实现。**Adapt**：我们采用 FSRS-6 公式但**参数个性化策略**自研（见 1.3），不采用其默认超参当“真相”
- 不可照抄：不要把“free”=任意提前/延后复习当作取消 到期复习 纪律的理由；本产品仍然保留“到期复习优先”的调度原则（PROJECT_SPEC §69：只保留记忆债）

## 1.3 open-spaced-repetition/fsrs-optimizer —— **Adapt（Phase 10 个性化参数，暂缓）**

- Repository：`open-spaced-repetition/fsrs-optimizer`
- URL：https://github.com/open-spaced-repetition/fsrs-optimizer
- License：BSD-3-Clause（注意：与 ts-fsrs 的 MIT 不同）
- Last meaningful update：2026-08-06
- Tech stack：Python（torch）
- Relevant module：从用户自己的复习历史拟合个人 FSRS 参数（w[]）
- 结论：思想重要（“个人遗忘模型”正是 PROJECT_SPEC §66 的目标），但 Python/torch 不适合浏览器内运行 → **Adapt**：Phase 10 或以后，做简化版参数自适应（如按成绩分组微调 w、或离线用 Node 脚本拟合后手动导入参数）；不在 Phase 1–2 引入
- 不可照抄：不要在客户端训练大模型；不要在没有足够复习记录时声称“个性化参数已校准”

## 1.4 ankitects/anki —— **Reject（作为代码/依赖）；仅作行为参考**

- Repository：`ankitects/anki`；License：AGPL-3.0（+专有资源）→ 复制代码会传染许可证，且是大型 Rust/Python 桌面应用
- Last meaningful update：2026-10-02；31.7k stars
- 有价值的**行为参考**（不抄代码）：desired retention 概念（用户设目标保留率 → 自动调间隔）、FSRS 在真实产品中的集成方式（learning steps、fuzz、maximum interval 上限、重新学习阶段）、统计页的 retention 图表与 workload 预估
- 不可照抄：AGPL 代码；桌面端架构；其“每日队列上限”机制（与我们的 Time Budget First 不同——我们用时间预算生成任务量，不用卡片数上限）

## 1.5 open-spaced-repetition/srs-benchmark —— **Adapt（评测方法论，Phase 10 参考）**

- License：仓库未标注 SPDX（含 Jupyter Notebook）；272★；用途：对调度算法做离线公平评测（对真实 Anki revlog 数据集）
- 可借鉴：评测指标（log loss / RMSE / 校准曲线）——未来若要验证“我们的调度是否更适合这个用户”，用同样的离线评测思路，而不是凭感觉
- 结论：不作为依赖；作为评测方法参考

## 1.6 duolingo/halflife-regression —— **Adapt（个人遗忘曲线建模的第二个来源）**

- Repository：`duolingo/halflife-regression`
- URL：https://github.com/duolingo/halflife-regression
- License：MIT（Copyright 2016 Duolingo Inc.，实际读取 experiment.py 头部确认）
- Last meaningful update：2024-04-20（维护放缓，但算法经典、代码自包含）
- Tech stack：Python（单文件 experiment.py + evaluation.r）
- Relevant module：保留率预测 / 个人遗忘规律建模（PROJECT_SPEC §66 Retention Metrics、§74 Personal Learning Model）
- 实际读取的源码：`experiment.py`（完整，SHA 已记录）

**核心算法（实际代码确认，Settles & Meeder 2016 HLR）**：

- 半衰期模型：`h = 2^(θ·x)`，预测 `p = 2^(−t/h)`（t 为距上次复习天数）；恰好是“再等 t 天还记得的概率”
- 特征：`sqrt(1+正确次数)`、`sqrt(1+错误次数)`、bias、语言/词元特征；输出经 pclip[0.0001,0.9999]、半衰期 hclip[15min, 274 天]
- 训练：对 (p, h) 联合损失做 SGD（含 L2 与 hl 权重）；评价：MAE + Spearman 相关（对预测与真实保留率排序一致性）
- 数据实例：`p_recall, delta(天), history_seen/correct, session_seen/correct, lexeme_id/string, ui_language, learning_language, timestamp, user_id`
- 重要工程结论：Duolingo 用 **每个学习者可训练的半衰期回归** 取代固定间隔表——与本项目“按用户建模遗忘速度”的目标一致

**可迁移到本项目的部分**：

- Phase 10 “个人遗忘模型”：用 HLR 的极简版本（特征：该词历史正确/错误、遗忘次数、反应速度、方向）在浏览器内做在线 SGD（几十行 TS 即可），输出**每词当前保留率估计**与**半衰期**，用于：Dashboard 的“今天最可能忘记的词”、以及计划生成中的复习强度分配
- 观测半衰期公式 `h = −t / log2(p)` 直接用于从“隔夜/7 日保留率”反推半衰期，作为 Dashboard 指标（“你的平均半衰期：3.2 天 → 4.1 天”）
- 与 FSRS 的关系：FSRS 给出 stability（两者可互为 sanity check）；实现时以 FSRS 为调度主引擎，HLR 仅作为**诊断/展示与预测**层，避免两套调度打架

**不可照抄**：

- 不要引入 Python/pypy 训练管线；不要用其“词元（lexeme）one-hot 特征”（我们词表动态增长，特征维度爆炸；用已聚合的每词统计替代）
- 不要把它当复习调度器（它只预测保留率，不生成间隔建议）

## 1.7 st3v3nmw/obsidian-spaced-repetition / fsrs.js / supermemo(JS) / orbit / ulangi / LearnKit / true-recall / fishword / flashcards-open-source-app —— **Reject（不作为架构参考）或仅登记**

- `st3v3nmw/obsidian-spaced-repetition`（MIT，2.5k★）：SM-2/固定间隔实现 + Obsidian 插件形态；**Reject**：调度算法落后于 FSRS；插件架构与本项目无关。其 “topic/deck 层级 + 到期队列 UI” 有轻微 UX 参考价值
- `open-spaced-repetition/fsrs.js`（180★）：ts-fsrs 的前身（旧版 FSRS），**Reject**：已有更新的 ts-fsrs
- `VienDinhCom/supermemo`（SM-2 JS/TS，MIT）：**Reject**：SM-2 已被 FSRS 全面超过；仅作为“简单可读调度实现”的教学参考
- `andymatuschak/orbit`（1.8k★，TypeScript）：研究型记忆增强平台（把复习任务与注意力“编程化”）；理念有趣，形态复杂；**Reject（本期）**：研究平台，不提供可复用工程件；其“prompt scheduling”思想与我们的 Daily Planner 有交集，留作后期阅读材料
- `subconcept-labs/ulangi`：已 archived；**Reject**
- `ctrlaltwill/LearnKit`、`pieralukasz/true-recall`、`Chenggou1/fishword`、`kirill-markin/flashcards-open-source-app`：新出现的 FSRS 生态小项目（多为 Obsidian 插件/CLI）；**登记**，不深挖——它们把 ts-fsrs 作为依赖的做法**验证**了 1.1 的 Adopt 决策（“成熟项目在引用它”）
- `wordpecker-app`（2.2k★，TS，MIT）：词表 + LLM 课件；属于 Reinforcement AI 方向，将在后续批次分析（暂挂）

---

# 2. Reading Annotation / Vocabulary Capture（本批完成）

## 2.1 LuteOrg/lute-v3 —— **Adapt（数据模型 + 迁移机制 + 术语状态）**

- Repository：`LuteOrg/lute-v3`（原 jzohrab/lute-v3，仓库已迁移；旧 jzohrab/lute 已 DEPRECATED 存档）
- URL：https://github.com/LuteOrg/lute-v3
- License：MIT（实测 repo metadata；旧 v2 存档仓库为 PHP）
- Last meaningful update：2026-09-05（pushed_at 实测；活跃）
- Tech stack：Python + Flask + SQLite（web app，自托管）
- Relevant module：Reading Lab / 词汇采集 / 词生命周期 / IndexedDB migration 设计参考
- 实际读取的源码：`lute/models/term.py`、`lute/db/schema/README.md`（SHA 已记录）

**数据模型（实际代码确认）**：

- `words` 表（Term）：`WoText / WoTextLC（小写归一） / WoStatus / WoTranslation / WoRomanization / WoTokenCount`；
- 术语状态 `Status`：`UNKNOWN=0`、`1..5`（学习分步）、`IGNORED=98`、`WELLKNOWN=99`（终态可跳过）
- 多词术语：用零宽空格（ZWS）连接 token 并计算 token_count；`wordparents` 自引用表支持「短语→组成部分」的父/子关系（词族关系雏形）
- 附加表：`wordtags`（标签）、`wordimages`、`wordflashmessages`（阅读页提示）
- 文本不可变性：已保存 term 不能改文本（只允许大小写变化）→ 防破坏引用完整性
- **迁移机制**：`baseline.sql`（基线 + demo 数据）+ `migrations/`（一次性）+ `migrations_repeatable/`（可重复），由 `SqliteMigrator` 按 `_migrations` 表跟踪执行；不用 Alembic 等重工具

**可迁移到本项目**：

- 「状态机 + 终态标记」思想 → 我们的 Word lifecycle（UNSEEN→…→PRODUCTIVE）+ 「忽略/专有名词」旗标；`WoTextLC` 归一 → 我们已有 `norm()`
- `wordparents` 短语↔成分关系 → 未来 lexical chunk / 词族关系（PROJECT_SPEC §4.2 的 chunk 方向）
- 迁移机制（baseline + 有序 migration + 记录表）→ **Phase 1 IndexedDB v1→v2 迁移框架的参考模式**（原生 IDB 逐版本 `onupgradeneeded` + 完成后写入 meta 迁移标记）
- 阅读页「轻标记后置筛选」的完整产品形态（Lute 就是这一模式的成熟实现）

**不可照抄**：Python/Flask/SQLite 服务端形态（我们是纯浏览器 IndexedDB）；其 0–5 状态数值语义（我们的生命周期与三维能力更细）；多用户/账户模型（我们单用户本地）。

## 2.2 yomidevs/yomitan —— **Reject（代码）；Adapt（标注 UX 模式）**

- Repository：`yomidevs/yomitan`；URL：https://github.com/yomidevs/yomitan
- License：**GPL-3.0**（复制代码会传染）→ 只可借鉴交互与架构思想
- Last meaningful update：2026-09-25（pushed_at）；2862★；JS 浏览器扩展
- Tech stack：JavaScript 扩展（chrome/firefox/edge）；**存储用 Dexie + dexie-export-import**；vitest + playwright tests + benches
- Relevant module：阅读中的词典查询/取词 → 未来 Reading Lab 侧边词典与生词捕获交互
- 有用的 UX/架构：悬停即弹的 popup 词典（多词典源合并、来源标注）；一键制卡（AnkiConnect）；自定义搜索页；多格式词典导入（EPWING 等）
- 佐证价值：一个 2.8k★ 扩展在 Dexie 上跑大数据量（词典库）+ 导出/导入 → **支持本项目对 Dexie/版本化迁移与大数据 IndexedDB 的信任**
- 不可照抄：GPL 代码；扩展宿主环境（我们内嵌阅读器）；它的 Anki 依赖链

## 2.3 FreeLanguageTools/vocabsieve —— **Adapt（「多源加权已知度」模型）**

- Repository：`FreeLanguageTools/vocabsieve`；URL：https://github.com/FreeLanguageTools/vocabsieve
- License：**GPL-3.0**（不复制代码）
- Last meaningful update：2025-08-15（pushed_at；相对放缓但活跃项目）；542★；Python + Qt 桌面
- Relevant module：词汇状态评分、Reading 采集、Anki 导出
- 实际读取的源码：`vocabsieve/models.py`（SHA 已记录）

**核心模型（实际代码确认）**：

- `WordRecord{lemma, language, n_seen, n_lookups, anki_young_ctx, anki_young_tgt, anki_mature_ctx, anki_mature_tgt}`：把「看见次数、查询次数、卡片成熟度（语境/目标）」聚合为单词认识度
- `WordActionWeights{seen, lookup, anki_young_ctx/tgt, anki_mature_ctx/tgt, threshold, threshold_cognate}`：**每个证据源一个权重，加权求和后与阈值比较**得到「已知/未知」
- `KnownMetadata{n_lookups, n_seen, n_young/mature_tgt/ctx}`：用于统计「文章/媒体已知词占比（comprehension 估算）」
- `LemmaPolicy`（6 档词形还原策略）、`LookupTrigger`（双击/快捷键/悬停）、`SRSNote{word, sentence, definition×2, audio, image, tags}`、`DictionarySource/FreqSource/AudioSource` 抽象（词典/词频/音频三类来源）

**可迁移到本项目**：

- 「多源加权已知度」直接对应我们的：stable recognition vocabulary 估算（PROJECT_SPEC §72）、阅读生词价值筛选（§28）、Dashboard「稳定识别/模糊/严重弱词」分档 → Phase 2/10 自研 TS 实现同构评分（exposure / recall 证据 / 生产证据 / 卡片成熟度 → 权重表可配置）
- 「语境 vs 目标」计数分离 → 我们的 contextExposureCount 与测试证据分离
- 媒体已知词覆盖率估算 → Reading Unknown Rate 与 Real Input comprehension 指标

**不可照抄**：GPL 代码；Qt/桌面形态；其义为「卡片成熟度依赖 Anki 数据」，我们改为直接使用本应用内证据。

## 2.4 asbplayer/asbplayer —— **Reject（代码）；Adapt（Real Input 标注 UX）**

- Repository：`asbplayer/asbplayer`；License：**AGPL-3.0**（不复制）；1461★；2026-10-03（活跃）；TypeScript（浏览器端 + 扩展 + 插件）
- 有用的模式：按单词状态着色（未采集/未知/学习中）、字幕词级标注（读音/频率/释义）；单词浏览器；自动暂停/跳读「沉浸模式」；AnkiConnect 一键制卡（word+sentence+audio 上下文）
- 佐证：**纯本地「字幕文件 + 本地词典」路线可以做出成熟产品** → 支持我们「不做昂贵视频 AI 分析」的决策（PROJECT_SPEC §19）
- 用于：Phase 8 Real Input Hub 的复盘/标注交互参考；未来若做字幕级辅助阅读可复读其思想
- 不可照抄：AGPL 代码；扩展形态；对 Anki 的强绑定

## 2.5 其它登记（不深挖）

- `baturyilmaz/wordpecker-app`（MIT，2266★，2025-08-08）：自有词表 + LLM 课程/测验。Reinforcement Engine（Phase 6）的 UX 参考候选；阶段进入时再按 Module Research Gate 做小调研
- `readlang/readlang`：未核验（早期调研时未纳入；如 Phase 5 需要再查）
- `lingq`（闭源）、`LinguaCafe`（登记）：不采用

---

# 3. Grammar / Sentence Parsing Visualization（本批完成）

## 3.1 spencermountain/compromise —— **Adapt（本地分词/词性/专名过滤；不承担句法树）**

- Repository：`spencermountain/compromise`；URL：https://github.com/spencermountain/compromise
- License：MIT；12162★；2026-10-02（活跃）；JavaScript，~250KB minified，**可浏览器端运行**，TypeScript 支持
- Relevant module：Sentence Lab 本地预处理、Reading 专名排除、句子切分
- 实际读取：README（完整，含 83 个 POS 标签体系、API、限制）

**能力（实际文档确认）**：

- tokenizer（`compromise/one`，句子级切分，10th ms/句）；POS tagger（`/two`，83 tags：#FirstName→#Person→#ProperNoun→#Noun 层级）；短语/从句工具（`/three`：`.chunks()` 名词/动词短语、`.clauses()`）；共轭/时态变换（.verbs().toPastTense() 等）；插件生态（dates、stats: tfidf/ngrams、syllables、wikipedia）
- **明确限制：不做 dependency parsing / syntax tree**（README 自述，欢迎贡献）→ 句法树必须来自 AI 结构化输出或我们自己的渲染层

**可迁移到本项目**：

- Reading Lab 生词标记的**专名过滤**（#Person/#Place/#Organization → Low Value/Proper Nouns 分类，PROJECT_SPEC §28）
- Sentence Lab 的离线兜底：无 AI 时的句子切分、词性高亮、基本 chunk 提示（AI 不可用 ≠ 功能全废，符合 §81）
- 阅读文本预处理（段落→句子切分、token 化）不依赖网络

**不可照抄**：不要把它当作「语法解释引擎」或句法结构来源；不期望 100% 词性准确（README 自述“not as smart as you'd think”）。

## 3.2 explosion/spaCy（displaCy 可视化）—— **Adapt（句法树渲染的数据结构范式）**

- Repository：`explosion/spaCy`；License：MIT（大项目，仅取一个文件研究）
- 实际读取的源码：`spacy/displacy/__init__.py`（SHA 已记录）

**关键发现（实际代码确认）**：

- `parse_deps()` 把句法分析转成 **`{words: [{text, tag, lemma}], arcs: [{start, end, label, dir}]}`** 的紧凑结构，再交给 SVG 渲染器画弧线
- `render(..., manual=True)` 允许**跳过 spaCy 解析，直接渲染预解析 dict** —— 即「words+arcs JSON → SVG」是一个与引擎解耦的渲染协议
- 支持 `collapse_punct` / `collapse_phrases`（标点折叠、短语折叠）等显示选项

**可迁移到本项目（Phase 4 Sentence Tree 的直接设计来源）**：

- Sentence Tree 的中间表示采用同构结构：AI/本地分析输出 `{words[], arcs[], settings}` → 前端自绘 SVG/HTML 弧线；折叠/展开（PROJECT_SPEC §49）映射为 collapse 选项
- 好处：渲染层与「谁做的分析」（AI 或本地）解耦；离线时用 compromise 的粗粒度结构渲染降级版本

**不可照抄**：Python 依赖；不能指望浏览器端跑 spaCy 全量模型。

## 3.3 其它登记

- `winkjs/wink-nlp`：compromise README 列为同类替代（向量化、实体、POS）。**未核验元数据**；若 compromise 不满足，Module Research Gate 再查
- `NaturalNode/natural`、`finnlp/en-pos`：同类候选，登记不采用

---

# 4. Knowledge Graph for Learning（本批结论：无对口成熟 OSS，自研）

**搜索记录**：`prerequisite skill graph mastery learning stars:>30` → 0 结果。

- 发现的小项目：
  - `tombro27/mentis`（2026-08 新建，TypeScript，0★）：描述为「Gemini 生成前置技能图 + 确定性引擎（BKT/Elo/遗忘曲线）决定下一步教什么」——**证明该模式（技能图 + BKT 后验）是自然设计**，但项目过小无参考价值
  - `amajorai/ryu-tuition`（Rust，0★）：技能前置图 + BKT posterior + SM-2 调度——同上
- **Adapt 结论**：Grammar Knowledge Graph 由我们自己建模（层级节点/边 = PROJECT_SPEC §50 的 Sentence Structure / Clauses / Non-finite / Tense / Comparison），每个节点用 **BKT-lite 掌握概率**（见 §5.2）记录证据；存储用 IndexedDB 普通 store（grammarConcepts / grammarAttempts），**不引入图数据库**（零后端约束；节点规模 < 100，普通 store + parentId 足够）。
- **Reject**：Neo4j/图引擎/知识图谱框架（过重，无必要）；SuperMemo 的 incremental reading 仅作理念参考（无开源工程件可借）。

---

# 5. Learning Analytics / Skill Tracking（本批完成）

## 5.1 duolingo/halflife-regression

见 §1.6（已深挖，Adapt：个人半衰期/保留率预测）。

## 5.2 CAHLR/pyBKT —— **Adapt（BKT-lite：每个技能的掌握概率）**

- Repository：`CAHLR/pyBKT`；URL：https://github.com/CAHLR/pyBKT
- License：MIT；281★；2026-08-05（pushed_at）；Python（+C++ 扩展，Windows 仅纯 Python 版）
- Relevant module：Grammar concept 掌握概率 / 技能追踪 / Weekly Diagnostic 诊断信号
- 实际读取：README（完整）

**核心模型（实际文档确认）**：

- 潜变量「会/不会」两状态；四个关键参数：`prior`（先验会）、`learns`（不会→会）、`forgets`（会→不会）、`guesses`（不会但答对）、`slips`（会但答错）
- **Roster API**：只保存当前潜状态即可增量更新每个学生每个技能的掌握概率（O(1)/次观测）——这正是我们需要的「每个 grammar concept 一个实时掌握概率」
- 变体：per-student priors、per-item guess/slip、per-resource learn rate（我们对应：per-concept 参数）
- 评测：RMSE / AUC / accuracy / crossvalidate（我们未来可用 played-back 历史数据自查）

**可迁移到本项目（Phase 4/10 自研，约 50 行 TS）**：

- 每个 grammar concept 维护 `p(known)`；每次 grammar attempt 后：
  - 答对：`p = p(1−slip) / (p(1−slip) + (1−p)guess)`
  - 答错：`p = p·slip / (p·slip + (1−p)(1−guess))`
  - 学习转移：`p = p + (1−p)·learn`（可选遗忘项 `p = p(1−forget)`）
- 映射到 Grammar 页面（§51）的「Object clause 78%」等展示；与词汇的 FSRS/HLR 互不冲突（不同子系统）
- 参数起点用经验值（如 learn=0.15, slip=0.1, guess=0.25, prior 由 Preview 状态决定），Phase 10 可扩展为按用户历史做简单网格搜索校准

**不可照抄**：Python 工具链（EM 拟合、pandas、模型动物园）；不在客户端训练复杂模型。

## 5.3 srs-benchmark（评测方法论）

见 §1.5：离线指标（log loss/RMSE/校准）用于未来验证调度质量；不在 Phase 1–2 使用。

## 5.4 汇总：Analytics 相关数据流

- 词汇：FSRS 提供 stability/difficulty/retrievability → Dashboard 展示「预计今日最易遗忘」；HLR 提供个人半衰期趋势（D1/D7/D30 retention 实测 + 半衰期反推）
- 语法：BKT-lite p(known) 每概念；Weekly Diagnostic 抽样该概念的历史 attempt 重测验证
- 阅读：unknown rate / speed / translation dependence 由 ReadingSession 直接统计（自研，无开源依赖）

---

# 6. Offline-first / IndexedDB 架构（本批完成）

## 6.1 dexie/Dexie.js —— **Adapt（版本化 schema 机制）；暂不引入依赖**

- Repository：`dexie/Dexie.js`；URL：https://github.com/dexie/Dexie.js
- License：Apache-2.0；14621★；2026-09-28（活跃）；TypeScript
- 实际读取的源码：`src/classes/version/version.ts`（SHA 已记录；另有 `schema-helpers.ts`、`version-constructor.ts`）

**实际确认的机制**：

- `db.version(n).stores({...})` 声明式 schema；**`Version.stores()` 会把旧版本 stores 合并推导出新 schema**（未显式覆盖则不删除）；主键强制 unique；多值/自增约束校验
- `version(n).upgrade(fn)` 内容升级回调，用 `promisableChain` 串成链（每个版本的 upgrade 依次执行）
- 版本间 schema 差异（新增/删除 store、索引）由库自动 diff 并应用
- 生态佐证：yomitan（2.8k★扩展）用 Dexie + dexie-export-import 管理大词典数据

**决策（Phase 1 相关，重要）**：

- **Adapt 其思想，不引入依赖（暂定）**：现有 `src/db.ts` 是原生 IDB 封装且经过测试（20/20），v1→v2 迁移用原生 `onupgradeneeded`（version=2）+ 逐版本分支 + 迁移完成后写 `meta` 标记即可，复杂度可控
- 如果 Phase 1 实现中迁移逻辑显著复杂化（多版本叠加、索引 diff），升级预案 = Adopt Dexie（Apache-2.0 允许，~80KB gzip），但**不重写**现有事务/校验/备份逻辑
- 迁移必须遵守 PROJECT_SPEC §100：versioned / 有备份 / 不清空旧数据 / 有 migration test

## 6.2 jakearchibald/idb —— **Adapt（API 形态参考）**

- License：ISC；7417★；2025-05（维护放缓但稳定）；TypeScript
- 参考点：`openDB(name, version, { upgrade(db, oldVersion, newVersion, tx) })` 的升级签名（oldVersion/newVersion/tx 三参数）——与我们 Phase 1 迁移函数设计一致；不引入（我们已有等价封装）

## 6.3 vite-pwa/vite-plugin-pwa —— **Adopt 候选（Phase 13）**

- License：MIT；4279★；2026-10-03（活跃）；TypeScript
- 用途：PWA/离线清单/Service Worker（底层 Workbox）；Phase 13 Hardening 时引入评估，Vite 6 兼容

## 6.4 其它登记

- `actualbudget/actual`（MIT）、`tinybase`（MIT）：local-first 数据引擎路线（同步/CRDT 方向），与「单机单用户 + IndexedDB」不匹配；登记不采用（无同步需求，PROJECT_SPEC 非目标）

---

# 7. AI Structured Output / Schema Validation（本批完成）

## 7.1 567-labs/instructor-js —— **Adapt（模式自研）；Reject（作为依赖引入）**

- Repository：`567-labs/instructor-js`（原 instructor-ai/instructor-js）；License：MIT；802★；最后 push **2025-01-27（维护放缓）**
- 实际读取：README（完整）
- 模式（可自研复刻）：Zod schema 作为 `response_model` → 转 function/tool 或 JSON schema → 解析 → **schema 校验 → 失败重试（max_retries）**；多种 provider 模式：`TOOLS / JSON / JSON_SCHEMA / MD_JSON / FUNCTIONS(deprecated)`；流式部分解析（zod-stream）
- **模式回退链的价值（重点）**：不同 OpenAI-compatible 供应商对 `response_format: json_schema` / `tools` 支持不一 → 我们按「json_schema → json_object → 纯提示词+MD 代码块提取」的顺序做能力探测与回退
- Reject 作为依赖的原因：它封装 OpenAI SDK + Bun 生态/流式栈；本项目是「raw fetch + 任意兼容端点」，直接照模式实现更轻、更可控（PROJECT_SPEC §79 要求 schema validate/retry/malformed fallback）

## 7.2 colinhacks/zod —— **Adopt（Phase 6 起）**

- License：MIT；44054★；2026-10-02（活跃）；TypeScript
- 用途：AI 输出（句子生成/强化文章/Output 诊断/周诊断）、OCR 结果、外部 JSON 导入的 schema 校验锚点
- 范围限定：只用于新模块（src/ai/ 等）；**不重写**现有手写 validateBackup（更严格且已有测试）

## 7.3 josdejong/jsonrepair —— **Adopt（Phase 6 起，候选）**

- License：**ISC**（LICENSE.md 实读确认）；2409★；2026-07-03（活跃）；TypeScript
- 用途：LLM 返回畸形 JSON（尾逗号、单引号、缺闭合、注释）先修复再 parse；修复后仍必须过 Zod
- 注意：仅作为「解析前修复」，不替代重试与报错

## 7.4 其它登记

- `ajv`（JSON Schema 标准校验器）：如未来需要标准 JSON-Schema 生态再评估；当前以 Zod 为主
- OpenAI structured outputs / response_format 文档：供应商差异大，正是回退链存在的理由

---

# 8. OCR / Document Import（本批完成）

## 8.1 naptha/tesseract.js —— **Adopt（Phase 5 图像导入 fallback）**

- Repository：`naptha/tesseract.js`；License：Apache-2.0；**38.7k★**；2026-05-17（活跃）；JS/WASM
- 实际读取：README（完整）
- 能力与用法（文档确认）：`createWorker('eng')` → `worker.recognize(image)` → `ret.data.text`；浏览器（CDN/ESM/bundle）与 Node 皆可；v6 默认仅 text 输出（hocr 等需显式开启）；**不支持 PDF、不改进识别模型**（官方自述）；同类替代 Scribe.js（支持 PDF/增强模型）
- 本项目定位（PROJECT_SPEC §22）：图片文章导入 = AI Vision（若配置的供应商支持）优先 → tesseract.js 本地 fallback → **必须人工修正识别结果后才能进入教学流程**
- 工程注意：traineddata（eng+chi_sim）体积与首次加载时间 → 按需加载 + 缓存；Worker 复用（单 worker 多次 recognize）
- 不可照抄：不要承诺 PDF/复杂版式；不把 OCR 结果直接送入教学（必须可修正）

---

# 9. Daily Adaptive Planner（本批结论：无对口成熟 OSS，自研）

- 搜索 `adaptive study planner stars:>100` → 0 结果。Anki 的每日限额（workload cap）与我们的 **Time Budget First** 模型不同（我们从「今天可用时间」反推任务量，而不是从卡片数反推时间）。
- 可借鉴（Adapt）：
  - FSRS 的 `request_retention` + 间隔分布 → **估算今日到期复习的预计耗时**（每词预计用时 = 近期该词平均 ms + 固定 overhead）
  - Anki 的 workload forecast 概念（未来 7 天到期量预测）→ 改造成时间预算版，用于「今日计划」里 Review 模块的时间占比与 Yesterday Recall 之后的动态调整（PROJECT_SPEC §11：±20–30%）
  - HLR/BKT 的「低保留率词优先」信号 → 复习强度重分配
- 结论：Planner 逻辑以 `PROJECT_SPEC.md` §6–§13、§63–§71 为唯一规范，不引入外部依赖。

---

# 10. Backup / Migration（汇总补充）

- **Lute**：baseline + 一次性 migrations + repeatable migrations + `_migrations` 跟踪表（§2.1）——理念可用，机制需移植到 IDB
- **Dexie**：声明式版本 + 自动 diff + upgrade 回调链（§6.1）——Phase 1 迁移设计的直接参考
- **yomitan**：dexie-export-import 的导出/导入在真实产品中使用 —— 佐证「JSON 全量备份 + 导入校验」路线
- **本项目现状（Phase 0 审计）**：backup v1（format/version 标记 + 去 Key）+ 严格 `validateBackup`（引用完整性/枚举/数值）已是较成熟模式；Phase 1 计划 **backup v2**：新增 stores 序列化 + **向后兼容读 v1 备份**（version 字段分派）

---

# 11. Adopt / Adapt / Reject 总表（Phase 0.5 最终决策）

## Adopt（引入依赖或直接采用设计，逐项注明许可证）

| 项目 | 用途 | License | 引入时机 |
|---|---|---|---|
| ts-fsrs | 每词独立调度内核（替换启发式阶阶梯） | MIT | Phase 1/2（数据层就绪后） |
| zod | AI 输出/导入 JSON 的 schema 校验 | MIT | Phase 6（AI 加固） |
| jsonrepair | 畸形 JSON 修复（parse 前） | ISC | Phase 6（AI 加固） |
| tesseract.js | 图像文章 OCR fallback | Apache-2.0 | Phase 5（图片导入） |
| vite-plugin-pwa | PWA/离线能力 | MIT | Phase 13（Hardening） |
| ECDICT 数据子集 | 词频（BNC/COCA）/考纲标签(gk 等)/lemma 数据 | MIT（注意数据子集的再分发说明） | Phase 2（Learning Value / 词形还原） |
| （设计）spaCy displaCy 的 words+arcs | Sentence Tree 渲染的中间表示 | MIT（仅设计借鉴） | Phase 4 |
| （设计）Lute 迁移机制 | IndexedDB v1→v2 迁移框架 | 概念借鉴 | Phase 1 |

## Adapt（借鉴思想，自行实现）

| 来源 | 借鉴内容 | 落地模块 |
|---|---|---|
| Duolingo HLR | 半衰期/保留率预测、半衰期反推公式 h=−t/log2(p) | Phase 10 遗忘诊断 |
| pyBKT | BKT-lite 掌握概率（prior/learn/guess/slip，O(1) 更新） | Phase 4/10 Grammar mastery |
| VocabSieve | 多源加权「已知度」评分与阈值 | Phase 2/10 词汇状态估算 |
| Lute | 术语状态机（含忽略/知名终态）、wordparents 词族、文本不可变 | Phase 2/5 |
| Dexie | 声明式 versioned schema + upgrade 回调链（原生 IDB 实现） | Phase 1 |
| compromise | 本地分词/句切分/POS/专名过滤（Reading & Sentence 离线兜底） | Phase 4/5 |
| asbplayer / yomitan | 状态着色/标注/一键采集的交互模式 | Phase 5/8 |
| Anki（行为） | desired retention、workload forecast（改造成时间预算版） | Phase 3 |
| instructor-js | Zod + 模式回退链 + 重试的结构化输出流水线（自研实现） | Phase 6 |

## Reject（记录原因，避免后续重复研究）

| 项目 | Reject 原因 |
|---|---|
| ankitects/anki | AGPL + 桌面 Rust/Python 架构；只借行为概念 |
| yomitan（代码） | GPL-3.0 传染 |
| vocabsieve（代码） | GPL-3.0 传染 |
| asbplayer（代码） | AGPL-3.0 传染 |
| Lute（代码） | Python/Flask 服务端形态（其 v3 为 MIT，但语言栈不符；仅借模型与机制） |
| obsidian-spaced-repetition | SM-2 旧算法 + Obsidian 插件形态 |
| fsrs.js | 旧版 FSRS，已被 ts-fsrs 取代 |
| supermemo(JS)/ulangi | 旧算法 / 已存档 |
| orbit | 研究平台，无可复用工程件 |
| instructor-js（作为依赖） | 封装过重（OpenAI SDK + 流式栈）；模式自研 |
| RxDB/tinybase/actual | local-first 同步/CRDT 路线与单机需求不符 |
| Neo4j 等图数据库 | 零后端约束；Grammar Graph 规模小，IDB 足够 |
| wink-nlp/natural/en-pos | 未核验/非必要；compromise 已满足当前需求（Module Gate 再评估） |

---

# 12. 调研边界与失败记录（可恢复性要求）

- **数量边界**：搜索确认候选 40+（含登记）；深挖 12 个（ts-fsrs、free-SRS-spec、HLR、Lute、yomitan、vocabsieve、asbplayer、compromise、spaCy-displaCy、Dexie、instructor-js、pyBKT、tesseract.js、ECDICT）；达到「足够支持架构决策」目标，未无限扩展（符合 AGENT_EXECUTION Phase 0.5 边界：10–20 候选 / 深挖 5–10）
- **失败记录（不影响结论）**：
  1. 上一轮调研会话在 GitHub MCP 调用时发生一次 `APITimeoutError: Request timed out` → 恢复后改为「每批 2–3 个调用、失败即降级」策略；未重复已完成的搜索
  2. 从本机 curl 直连 `raw.githubusercontent.com` 返回 HTTP 000（网络路径不可达）→ 改用 GitHub MCP `get_file_contents` 获取文件（jsonrepair 许可证、spaCy 源码等均由 MCP 取得）
  3. 两次搜索（`language learning reader annotation`、`halflife regression forgetting curve` 首查形式）返回 0 结果 → 已改用精确项目名/组织名检索成功
- **未决事项（留待对应阶段 Module Research Gate）**：wink-nlp 元数据核验；wordpecker 深挖（Phase 6）；Scribe.js（若需 PDF）；actualbudget 的本地优先架构（若 Phase 12/13 需要）
- **与产品原则的一致性声明**：本轮所有 Adopt/Adapt 均不改变 `PROJECT_SPEC.md` 的 28 项产品原则；ts-fsrs 属于「升级既有调度实现」，不改变「先学再测、多词池、多证据 Mastery」等产品逻辑；未复制任何未核验许可证的代码。

