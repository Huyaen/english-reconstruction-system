# English Reconstruction System V2
## AGENT_EXECUTION — 工程实施、状态继承、断点恢复与验收协议

> 本文件定义 Agent/Codex 应如何实施 `PROJECT_SPEC.md`。
> 产品需求以 `PROJECT_SPEC.md` 为准；本文件负责“怎么安全地把它做完”。

---

# 1. 总执行原则

这是一个长期、多阶段、可能跨多个模型额度周期和多个 Agent 会话完成的真实软件工程项目。

现有仓库已经有可工作的词汇学习模块。默认策略：

> **审计 → 复用 → 扩展 → 迁移 → 验证**

禁止无理由从零重写。

优先级：

1. 数据安全
2. 正确性
3. 可恢复性
4. 可维护性
5. 学习逻辑正确
6. 性能
7. UX
8. 视觉效果

---


# GitHub Remote Sync Protocol（2026-10-19 增补，长期生效）

## 定义与不可变边界

本节解决的是**本项目自身 GitHub 私有远程仓库**及长期开发表的同步，和已完成的 Phase 0.5（搜索其它 GitHub 参考项目）是**完全不同的工作**。远程仓库预设名 `english-reconstruction-system`；实际 owner/repo/URL 必须从当前授权账号或既存 remote 核实，不得臆造。

远程创建/对账设为一次性独立任务 `infra_github_remote_001`：作为 Phase 3 前的工程基础设施检查执行，而**不回滚重做 Phase 0/0.5/1/2**。如远程实际上早已配置，应直接验收与登记，而非重建。无授权/登录或远程异常时标记 `blocked`/`pending`，本地稳定开发可以继续，不得声称 push 已完成。

## 1. 远程建立前的事实核查

在仓库根目录实测：

- `git status --short --branch`、`git branch -vv`、`git log -n 8 --oneline --decorate`、`git tag -l`、`git remote -v`；不得根据 `STATE.json` 想当然假设远程不存在。
- `git config --get remote.origin.url`、当前登录 GitHub 的账户/owner、仓库是否存在、权限是否足够，以及实际仓库 `private` 状态。
- 检查 Git 受保护的工作区变更：用户当前修改、未提交文件、未追踪文件、已打 tag。任何新动作必须尊重这些状态。
- 分别核实本地 HEAD、远端默认/跟踪分支 SHA（如可达）；先 `fetch` 获取真实远端分支信息，禁止为对齐而盲目 reset。

如果仓库不存在，才在用户授权账号下创建**Private** 仓库（默认名 `english-reconstruction-system`）。当账户归属或授权不明确时暂停请求确认；绝不默认为 Public，绝不使用错误 owner 或错误个人账号。

## 2. 首次上传安全门

建立 remote / 第一次 push 之前必须检查：

1. `.gitignore` 覆盖 `node_modules/`、临时缓存、本地环境配置、token、用户学习数据、数据库转储、操作系统文件；确认 `dist/` 的现有 Git 跟踪策略，不得突然大规模删改已跟踪的构建产物。
2. 检查**当前工作树、暂存区以及全部准备推送的可达 Git 历史**。可以使用现有可靠秘密扫描工具与 Git 搜索交叉核查；不得把匹配结果中的密钥内容写进日志、聊天和 GitHub。
3. 特别核验当前系统 AI Key（可能在用户本机浏览器 IndexedDB 中）：它不应出现在仓库、备份产物、构建文件、日志或自动化测试 fixture 中。浏览器的真实学习数据禁止顺手上传。
4. 检查 `.md`、测试日志、截图、trace、checkpoint、历史 bundle、样例 JSON 是否包含令牌、个人隐私、第三方授权信息；若历史已泄露，停止推送并提供安全清理/轮换建议，不能仅改 `.gitignore` 宣称安全。
5. 不进行破坏性的 `git filter-repo`、历史改写或密钥轮换，除非用户明确授权。

## 3. 任务级与阶段级同步

### Stable Task Gate

完成一次小型稳定任务后：保存代码 → 相关 tests/build（按任务性质） → 检查 diff/secret → 更新状态/交接 → 本地 commit → push 当前预期分支 → 读取远端 SHA 核验。如正在开发中且验证尚未完成，允许先本地 WIP checkpoint，但不得虚称稳定 passed。

### Phase Gate

完成整个 Phase 时：运行完整测试、build、必要真实浏览器验收 → 确认文档/状态 → commit → tag（如 `phase3-daily-planner`）→ push 分支和该 tag → `git ls-remote`/API 确认远端 branch/tag 指向的真实 SHA。任何一步失败都应如实记录：`phase passed` 和 `remote sync verified` 是两个**不同状态维度**。

不要为了在 `STATE.json` 中记载刚刚 push 的 commit SHA 而无限“再提交一笔 pin commit”。Git 的当前远端 SHA 是同步事实依据；状态文件只是写入时的快照，下一次正常 commit 再更新。构建产物如历史上被跟踪，提交前需确保其与源码一致，避免无意义 rebuild 造成伪变更。

## 4. 远端状态与故障续传

`STATE.json` 建议使用 `remote_sync` 对象，包含：

- `setup_task_id`, `status`（unverified / pending / configured / pushed / verified / blocked / error）
- `provider`（github）、`visibility`（unknown / private / public）、`owner`, `repository`, `remote_name`, `remote_url`
- `local_branch`, `last_local_commit`, `last_known_remote_commit`, `pending_push`, `last_verified_at`, `last_error`

值必须来自实际观测；不确定的一律 `null`/`unknown`，不得捏造 URL、SHA、owner。`pending_push` 在尚未建立远端时可为 `null`（未知），不许写 `false` 冒充同步完成。**不要保存 API Token 到 STATE/HANDOFF**。

如果 GitHub MCP/API 超时、鉴权失效、网络故障或限流：保留本地 commit、tag 和记录，检查远端是否已完成先前操作，再幂等重试；绝不自动 `push --force`、`reset --hard`、删除历史或吞掉冲突。必要时改用本机 `git`/GitHub CLI，经授权后执行。

## 5. 新会话恢复的远程对账

每个新会话在读取工程状态文件之后，追加检查本地与远端 SHA/branch/tag、ahead/behind/diverged、未追踪/未提交变更。远端不可达时不要阻塞一切本地工作，但应标记 `remote_sync` 为 `pending/error` 并记录下一次尝试的具体操作。

### 验收

- 远程仓库真实存在且 Private（从 provider 验证）
- 与当前本地仓库是同一条 Git 历史，而非新建空工程替换
- 首次 push 成功，远端 `main` 或现有实际工作分支包含预期 commit
- 已有的阶段 tag 全部得到安全推送与远端核验（不存在或冲突的单独报告）
- 工作区/可达历史扫描未发现待处理 secrets；有疑点必须阻断上传并说明
- `STATE.json`、`HANDOFF.md`、`CHECKPOINT.md` 记录真实状态
- 运行代码仍与上传前一致；禁止为了远程同步去改业务代码

**重要：GitHub 备份源码及被跟踪文件，不会自动备份用户浏览器 IndexedDB；此二者的备份与恢复路径独立。**

---

# 106. 开发优先级

不要一次性到处开工。

采用阶段式重构。

---

# Phase 0 — Audit & Safety

任务：

1. 检查现有 repo
2. 运行现有项目
3. 运行 build
4. 记录现有功能
5. 记录 DB schema
6. 建立状态文件
7. 创建 baseline checkpoint
8. 如无 Git，则初始化 Git
9. 不修改功能逻辑前先确认 baseline 可运行

验收：

> 当前版本可正常启动、构建。

---

# Phase 0.5 — GitHub Reference Research

在 Phase 0 完成现有项目审计之后、正式进行大规模 V2 架构开发之前，执行一次有边界的 GitHub 开源项目调研。

本阶段目的不是重新设计产品，也不是寻找一个项目直接替换当前工程，而是：

> 搜索成熟开源实现，识别已经被验证的架构、算法、交互模式和工程实践，减少重复造轮子。

如果 GitHub MCP / GitHub API / Web Search 可用，应主动使用。

---

## 研究范围

优先寻找与以下模块直接相关的成熟项目：

1. Spaced Repetition / Adaptive Learning
2. FSRS / Memory Scheduling
3. Vocabulary Learning
4. Reading Annotation / Vocabulary Capture
5. Language Learning Systems
6. Grammar / Sentence Parsing Visualization
7. Knowledge Graph for Learning
8. Learning Analytics / Skill Tracking
9. Offline-first Web Apps
10. IndexedDB large-data architecture
11. AI-assisted language learning
12. Structured LLM Output / Schema Validation
13. Daily adaptive learning planner
14. OCR / document import workflows
15. Local-first backup / migration architecture

---

## 搜索原则

优先考虑：

- 有真实用户或较高使用量
- 最近仍有维护
- README / docs 完整
- 有测试
- 架构较清晰
- License 明确
- 与当前 TypeScript / Web / IndexedDB 技术栈存在可迁移价值

不要只按 Star 数判断质量。

---

## 每个候选项目记录

至少记录：

- Repository
- URL
- License
- Last meaningful update
- Primary language / framework
- Project purpose
- Relevant module
- Useful architecture
- Useful algorithm
- Useful UX pattern
- Useful data model
- Testing strategy
- What can be reused conceptually
- What should NOT be copied
- Compatibility with current project
- Adoption recommendation

---

## 强制区分三种结果

### 1. Adopt

成熟、兼容、明显优于自行实现。

可以借鉴其设计或在 License 允许情况下引入依赖。

### 2. Adapt

思想有价值，但需要根据 English Reconstruction System 修改。

这是默认优先方式。

### 3. Reject

与当前产品目标、架构或数据安全要求不匹配。

记录拒绝原因，避免之后的 Agent 重复研究。

---

## 禁止行为

不得：

- 因为发现一个成熟项目就推翻 `PROJECT_SPEC.md`
- 直接把整个其他项目合并进当前仓库
- 未检查 License 就复制代码
- 为了使用某个库而大规模更换技术栈
- 将 GitHub 项目的学习逻辑视为必然正确
- 因开源项目实现不同而擅自修改已经由用户确认的 28 项产品原则
- 花费无限时间进行资料搜索而不开发

GitHub Research 是工程辅助，不是产品决策来源。

---

## 调研输出

在项目根目录创建：

`REFERENCE_RESEARCH.md`

按照模块整理研究结果。

例如：

# Vocabulary / SRS

## Project A
...

## Project B
...

# Reading
...

# Learning Analytics
...

同时在：

`CHECKPOINT.md`

记录本轮最终采用的重要架构启发。

在：

`STATE.json`

记录 Research task 状态。

---

## 时间边界

首次全局调研应保持有限范围。

建议：

- 先找 10～20 个候选项目
- 深入分析其中最有价值的 5～10 个
- 不要求穷尽 GitHub

完成足够支持架构决策的研究后立即继续开发。

---

### Phase 0.5 深度核查要求（2026-10-04 接手时追加，防止后续会话丢失）

对最有价值的候选项目，**必须实际查看**：相关源码、数据模型、核心算法、测试、架构、License、最近维护状态；不得仅凭项目名或 README 下结论。

每个候选项目至少记录：

```text
Repository / URL / License / Last meaningful update / Tech stack /
Relevant module / Useful architecture / Useful algorithm / Useful UX pattern /
Useful data model / Testing strategy / Compatibility with current project /
What can be adapted / What should NOT be copied
```

结论必须分为 **Adopt / Adapt / Reject** 三类；Reject 必须写明原因，避免后续 Agent 重复研究。

边界：先找约 10～20 个候选项目，深入分析最有价值的约 5～10 个；得到足够支持架构决策的信息后**立即进入 Phase 1**，不得无限搜索。

成果落盘：`REFERENCE_RESEARCH.md`（项目根目录），并同步更新 `STATE.json` / `CHECKPOINT.md` / `HANDOFF.md`。

---

# Module Research Gate

以后进入重要模块开发前，可以进行一次小型模块专项搜索。

例如：

进入 Vocabulary V2：

> 搜索 FSRS / Anki / adaptive vocabulary 项目。

进入 Reading Lab：

> 搜索 annotation / reader / vocabulary capture 项目。

进入 Data Foundation：

> 搜索 IndexedDB migration / local-first architecture。

但每次只解决当前工程问题。

禁止重新进行完整 GitHub 大调研。

---

# 最终原则

优先顺序：

`PROJECT_SPEC.md`
↓
当前真实项目结构
↓
已经验证的数据和测试
↓
成熟开源项目的可借鉴经验

而不是：

GitHub 项目
↓
反过来决定我们的产品。

目标是：

> 不重复造已经被很好解决的轮子，同时保持 English Reconstruction System 自己的产品逻辑。

------------

# Phase 1 — Data Foundation

完成：

- schema migration
- Learning Model 数据基础
- word exposure
- grammar concept
- daily plan
- mini unit
- snapshots

优先保证：

> 旧数据 100% 保留。

---

# Phase 2 — Vocabulary V2

完成：

- Preview
- word lifecycle
- three-dimensional mastery
- multi-pool selection
- Learning Value
- forgotten reflow
- exposure evidence
- dynamic new word count

---

# Phase 3 — Daily Planner

完成：

- time selection
- energy
- Yesterday Recall
- plan generation
- dynamic adjustment
- Closing Loop
- interruption / re-entry

---

# Phase 4 — Sentence & Grammar

完成：

- Sentence Lab
- mixed source
- sentence tree
- Grammar Graph
- Just-in-Time cards
- evidence tracking

---

# Phase 5 — Reading

完成：

- article import
- image recognition adapter
- layered reading
- word capture
- sentence handoff
- re-read
- reading analytics

---

# Phase 6 — Reinforcement AI

完成：

- sentence generation
- reinforcement article generation
- strict schemas
- prompt versioning

---

# Phase 7 — Mini Unit

完成：

- 2～3 day state machine
- anchor material
- target words
- target grammar
- Day 1 / 2 / 3 progression

---

# Phase 8 — Input Hub

完成：

- input library
- manual video logging
- topic
- self comprehension
- caption mode
- post-input workflow

不要加入视频 AI 分析。

---

# Phase 9 — Output Lab

完成：

- summary
- retelling
- opinion
- diagnosis
- Current Level +0.5 feedback
- structured evidence

---

# Phase 10 — Diagnostics

完成：

- Dashboard
- Skill Snapshot
- Weekly Diagnostic
- retention
- unknown rate
- translation dependence
- progress charts

---

# Phase 11 — Exam Transfer

完成：

- exam error categories
- reading transfer
- optional exam logs
- feedback into Learning Model

---

# Phase 12 — Full Integration

完成：

> Start Today's Training

真正串通所有模块。

避免模块只是页面存在，但 Daily Planner 不使用。

---

# Phase 13 — Hardening

完成：

- performance
- mobile
- errors
- offline
- API failure
- DB migration test
- E2E
- documentation

---

# 107. 项目文档与进度继承机制

这是长期多阶段 Agent 项目。

在开始正式工作前，在项目根目录建立：

```text
PROJECT_SPEC.md
STATE.json
CHECKPOINT.md
HANDOFF.md
```

这些文件是硬要求。

另外建议继续维护：

```text
README.md
TODO.md
DEVELOPMENT_LOG.md
```

---

# 108. PROJECT_SPEC.md

保存：

> 长期固定目标。

包括：

- 产品目标
- 用户目标
- 模块定义
- 不可改变的产品决策
- 数据原则
- 验收标准
- 非目标

除非用户明确改变产品需求，否则：

> 不要因为换会话就重新解释目标。

---

# 109. STATE.json

这是：

# 唯一机器可读当前状态

必须可以让下一个 Agent 快速知道：

> 现在做到哪里。

建议结构：

```json
{
  "project": "English Reconstruction System V2",
  "current_phase": "phase_3_daily_planner",
  "overall_status": "active",
  "last_updated": "",
  "last_verified_commit": "",
  "tasks": {
    "phase3_daily_plan_001": {
      "status": "passed",
      "description": "",
      "files": [],
      "tests": []
    },
    "phase3_yesterday_recall_002": {
      "status": "running",
      "description": "",
      "files": [],
      "tests": []
    }
  },
  "known_bugs": [],
  "blocked": [],
  "next_task_id": "",
  "database_version": 0,
  "build_status": "",
  "test_status": ""
}
```

---

# 110. Task Status

每个高耗时任务必须有唯一：

> task_id

状态只能使用：

```text
planned
running
verifying
passed
failed
blocked
```

高耗时任务执行前：

> 先检查是否已经完成。

禁止重复执行：

- migration
- 大规模 generation
- expensive AI call
- full E2E
- project-wide refactor

如果已经 passed：

> 不要因为换会话重新做。

---

# 111. CHECKPOINT.md

记录：

- 每阶段完成结论
- 主要架构选择
- 已验证模块
- 已淘汰方案
- 已知限制
- DB migration 状态
- build/test 状态

重点是：

> 保存阶段性事实。

不是写流水账。

---

# 112. HANDOFF.md

这是：

# 换模型 / 换会话所需最小上下文

必须足够让新 Agent：

> 不依赖聊天记录就能继续。

至少包含：

```text
Current phase
Current task_id
What is done
What is currently running
What remains
Last verified build
Last verified tests
Known bugs
Files currently being modified
Database migration status
Next exact action
Important warnings
```

---

# 113. DEVELOPMENT_LOG.md

按时间追加。

例如：

```text
## 2026-xx-xx — Phase 3

Completed:
- Yesterday Recall
- daily plan skeleton

Modified:
- src/...
- ...

Tests:
- ...

Next:
- ...
```

不能覆盖旧记录。

---

# 114. TODO.md

维护：

```text
P0
P1
P2
```

P0：

> 当前阶段必要。

P1：

> 重要。

P2：

> 后续优化。

---

# 115. 每个主要阶段结束后的强制动作

必须：

1. 保存代码
2. 运行相关测试
3. 尝试 build
4. 更新 STATE.json
5. 更新 CHECKPOINT.md
6. 更新 HANDOFF.md
7. 更新 DEVELOPMENT_LOG.md
8. 更新 TODO.md
9. Git commit（如果可用）

---

# 116. 聊天上下文不能作为唯一状态来源

Agent 不得认为：

> “我记得上一个会话做过。”

所有项目状态必须落盘。

---

# 117. 恢复任务协议

任何新会话 / 新模型 / 新 Agent 开始时：

必须先执行：

```text
1. Read PROJECT_SPEC.md
2. Read STATE.json
3. Read CHECKPOINT.md
4. Read HANDOFF.md
5. Read README.md
6. Read TODO.md
7. Inspect git status
8. Inspect actual files
9. Run minimum verification
10. Resume next task
```

禁止收到项目后：

> 直接重新设计。

---

# 118. 状态冲突规则

如果：

> STATE.json

和：

> 实际磁盘 / 实际代码 / 实际测试

冲突：

# 以实际状态为准

然后修正：

> STATE.json

禁止为了“保持状态文件一致”而忽略真实代码。

---

# 119. 中断保护

以下情况：

- 模型额度即将不足
- 会话异常
- 413
- 工具错误
- 环境崩溃
- 长任务不确定能否完成
- Codex 配额即将结束

立即停止开启新模块。

优先执行：

# Emergency Checkpoint

---

# 120. Emergency Checkpoint

必须：

1. 保存全部当前文件
2. 更新 STATE.json
3. 更新 CHECKPOINT.md
4. 更新 HANDOFF.md
5. 记录当前 task_id
6. 记录 task status
7. 记录未完成代码
8. 记录已知 Bug
9. 记录下一条具体操作
10. 如可能运行快速 build/test
11. Git commit 当前安全状态

如果某任务做到一半：

必须明确：

> PARTIAL / RUNNING

不能伪装成完成。

---

# 121. 不允许重复高耗时任务

恢复后先检查：

```text
STATE.json
actual output
artifact
tests
git
```

如果任务已完成：

> 跳过。

这是节省模型额度的重要要求。

---

# 122. Git 原则

如果当前项目可用 Git：

每个稳定模块提交一次。

例如：

```text
feat(vocab): add preview lifecycle
feat(planner): add yesterday recall calibration
feat(sentence): add grammar evidence tracking
feat(reading): add layered reading session
feat(unit): add mini unit state machine
fix(db): preserve legacy word data during migration
```

重大重构前：

> commit baseline。

---

# 123. 不因为额度问题重新开始

如果一个模型额度用完：

下一次模型必须：

> 从磁盘状态继续。

禁止：

- 从零搭 V2
- 重做已经完成的 DB
- 重做已经 passed 的任务
- 重写已经工作的模块
- 重新分析全部需求后产生另一套架构

除非实际代码验证证明原方案不可用。

---

# 124. 恢复开发时的固定指令

恢复任何中断项目时执行：

> 先读取 PROJECT_SPEC.md、STATE.json、CHECKPOINT.md、HANDOFF.md、README.md、TODO.md 和 DEVELOPMENT_LOG.md。
>
> 然后检查实际磁盘、Git 状态、数据库版本、构建状态与测试状态。
>
> 状态文件与实际项目冲突时，以实际项目为准并修正 STATE.json。
>
> 不要从零开始。
>
> 不要重新设计已经验证的模块。
>
> 不要重复执行已经 passed 的高耗时任务。
>
> 从 HANDOFF 中记录的 Next Action 和 STATE.json 的 next_task_id 开始继续。
>
> 如果发现上一任务为 running/verifying，先验证当前实际状态，再决定继续、通过或失败。
>
> 如果当前额度/会话可能不足以安全完成下一项高耗时任务，优先完成 Checkpoint，而不是冒险开启新模块。

---

---

# 2. 强制进度继承协议（用户指定）

在开始正式工作前，在项目根目录建立：

```text
PROJECT_SPEC.md
STATE.json
CHECKPOINT.md
HANDOFF.md
```

规则：

1. `PROJECT_SPEC.md` 保存长期固定目标、输入定义、约束和验收标准。
2. `STATE.json` 保存唯一机器可读当前状态。
3. `CHECKPOINT.md` 保存阶段结论和已淘汰方案。
4. `HANDOFF.md` 保存换模型/换会话所需最小上下文。
5. 每个高耗时任务必须有唯一 `task_id`。
6. 每个任务记录 `planned / running / verifying / passed / failed / blocked`。
7. 高耗时任务执行前先检查是否已完成，禁止重复执行。
8. 每个主要阶段结束后更新四个状态文件。
9. 聊天上下文不作为唯一状态来源。
10. 恢复任务时必须先读取状态文件，再核对实际磁盘和运行状态。
11. 状态文件与实际状态冲突时，以实际状态为准并修正 `STATE.json`。
12. 在模型额度不足、会话异常、413、工具错误或程序崩溃前，优先写入 `HANDOFF.md`。

---

# 3. 建议附加状态文件

除四个硬性文件外，继续维护：

```text
README.md
TODO.md
DEVELOPMENT_LOG.md
```

- `README.md`：运行、构建、目录、数据、AI 配置、当前功能说明。
- `TODO.md`：P0 / P1 / P2。
- `DEVELOPMENT_LOG.md`：只追加，不覆盖，记录每阶段实际修改、测试和下一步。

---

# 4. 每个主要阶段的标准动作

每个阶段完成时必须按顺序执行：

1. 保存全部代码。
2. 运行该阶段相关单测/集成测试。
3. 运行构建。
4. 检查浏览器/运行期阻断错误。
5. 更新 `STATE.json`。
6. 更新 `CHECKPOINT.md`。
7. 更新 `HANDOFF.md`。
8. 更新 `TODO.md`。
9. 追加 `DEVELOPMENT_LOG.md`。
10. 如 Git 可用，提交一个稳定 commit。
11. 只有经过验证的 task 才允许标记 `passed`。

---

# 5. Emergency Checkpoint

遇到以下任一情况时，停止开启新模块并优先保存状态：

- 模型额度即将不足
- 会话即将中断
- 413 / 上下文异常
- 工具错误
- 程序崩溃
- 高耗时任务无法确定能否在本轮完成
- Codex/Agent 配额即将用完

必须：

1. 保存当前所有文件。
2. 写明当前 `task_id` 和真实状态。
3. 更新 `STATE.json`。
4. 更新 `CHECKPOINT.md`。
5. 更新 `HANDOFF.md`。
6. 记录当前正在修改的文件。
7. 记录未完成代码和已知 bug。
8. 记录“下一条具体操作”，不能只写“继续开发”。
9. 如时间允许，运行快速 build/test。
10. 如 Git 可用，提交当前安全状态。
11. 未完成任务标记 `running` / `failed` / `blocked`，禁止伪装成完成。

---

# 6. 恢复开发固定流程

新会话、新模型或新的 Agent 接手后，禁止先重新设计项目。

必须依次：

```text
1. Read PROJECT_SPEC.md
2. Read STATE.json
3. Read CHECKPOINT.md
4. Read HANDOFF.md
5. Read README.md
6. Read TODO.md
7. Read DEVELOPMENT_LOG.md
8. Inspect git status / log
9. Inspect actual files and DB migration version
10. Run minimum build/test verification
11. Inspect GitHub remote / local vs remote SHA and pending push (if reachable)
12. Reconcile state files with actual project
13. Resume STATE.next_task_id / HANDOFF.Next Action
```

如果 `STATE.json` 与实际磁盘、实际代码、实际测试冲突：

> **以实际项目为准，并立刻修正 STATE.json。**

如果上一任务是 `running` 或 `verifying`：

> 先验证实际输出，再决定继续、passed、failed 或 blocked。

禁止仅凭聊天记忆判断“应该已经做完了”。

---

# 7. 高耗时任务去重

以下任务尤其必须通过 `task_id + artifact + tests + git/state` 去重：

- DB migration
- 全仓重构
- 全量 E2E
- 大规模数据生成
- 昂贵 AI 调用
- 一次性批量数据转换
- 大规模索引重建

若状态显示已 `passed` 且实际 artifact/test 能验证：

> 直接跳过，不因换会话重复执行。

---

# 8. Git 建议

重大重构前建立 baseline commit。

稳定模块示例：

```text
feat(vocab): add preview lifecycle
feat(planner): add yesterday recall calibration
feat(sentence): add grammar evidence tracking
feat(reading): add layered reading session
feat(unit): add mini unit state machine
fix(db): preserve legacy word data during migration
```

Git 是辅助，不替代 `STATE.json / CHECKPOINT.md / HANDOFF.md`。

---

# 9. 询问用户的边界

以下小型技术决定由 Agent 自主决定，不要反复停下询问：

- 文件拆分
- service/component 命名
- CSS 组织
- test 组织
- 小型 UI 细节
- 非破坏性内部实现

只有以下情况才询问：

- 明显改变产品方向
- 删除已存在能力
- 可能破坏旧数据
- 两种方案会显著改变学习体验
- 引入新的付费服务
- 需要用户账户、授权、密钥
- 会影响长期兼容性的重大技术选型

---

# 10. 可恢复性原则

## CI Protocol（Phase 5.0 起长期有效：`infra_github_actions_ci_002`）

远程自动化门禁由 GitHub Actions 承担（`.github/workflows/ci.yml`），本地 Hermes 只负责开发、真实浏览器验收与状态同步。两者不可互相替代。

### Task 级门禁（每完成一个稳定 Task）

1. 相关测试通过（`npm test`，例数不得低于上一 Task）。
2. 本地构建通过（`npm run build`）。
3. `git diff` 审核：确认没有意外改动、没有密钥/凭据/备份数据。
4. Commit（清晰、面向 Task 的信息）。
5. Push 到 `origin/main`。
6. 核验远端 SHA（`git ls-remote origin refs/heads/main`）。

### Phase 级门禁（每完成一个主要 Phase）

1. 全量 `npm test`。
2. `npx tsc --noEmit`。
3. `npm run build`（同时提交 `dist`）。
4. 真实浏览器 Smoke（独立 profile 的无头 Edge + CDP；测试构建用 `npm run build:test` 产出的 `dist-test`）。
5. 既有模块回归（`scripts/phase3-smoke.mjs`、`scripts/phase4-smoke.mjs` 等）。
6. 状态文件同步（STATE / CHECKPOINT / HANDOFF / TODO / DEVELOPMENT_LOG / README）。
7. Commit + Tag + Push。
8. **GitHub Actions CI 成功**（以 GitHub API 返回的 run conclusion 为准）。
9. 远端 SHA 与 Tag 核验，仓库仍为 Private。

只有以上全部通过，Phase 才允许标记 `passed`。

### 测试钩子隔离（硬约束）

- 高权限测试能力**不得**只由 URL query 参数控制。唯一开关是构建期常量 `__ERV2_TEST_HOOKS__`（`vite.config.ts` 按 `--mode` 注入）。
- 生产构建：常量为 false → 钩子被摇树移除；CI 有独立步骤断言 `dist/assets/*.js` 中不含 `__labTest`。
- 测试构建：`npm run build:test` → `dist-test/`（已 gitignore），配 `node server.mjs --dir=dist-test --port=4173` 使用。
- 任何钩子都不得直接写用户真实学习数据，且不得绕过学习状态校验。

### CI 失败处理

必须区分：

- **代码失败**：修代码、补测试、重跑，不得删除有效测试或绕过构建错误来换绿。
- **基础设施失败**（GitHub API 超时、Runner 故障、Rate Limit、CI 无法启动、网络不可达）：允许继续本地开发，但必须把真实状态写进 `STATE.json`（`remote_sync.ci.status` / `last_error` / `pending_push`），且**不得**宣称远程门禁已通过。

`dist` 纳入 Git，CI 在 Node 22 上执行 `git diff --exit-code -- dist`。若出现跨平台合法差异，必须先定位原因；确需调整策略时，必须在 STATE.json 与 `docs/PHASE5_READING.md` 记录原因与替代验证机制，不能为了变绿直接删掉该步骤。


## Phase 5 阅读协议（Reading Protocol，2026-10-19 起生效）

处理阅读相关任务时，以下规则是**硬约束**（违反即为缺陷，必须有测试兜底）：

1. 打开文章不显示全文翻译；首读前只有标题/来源/主题。
2. 阅读材料来源必须可追溯：`sourceType` + `sourceReliability` + 内容指纹（`contentHash`）缺一不可。
3. 词库里没有的词 ≠ 用户不会的词：四分类 known/uncertain/unknown/no-evidence，`no-evidence` 单独统计，不并入 `unknownRate`。
4. Unknown Rate 必须区分 explicit（用户点出）与 estimated（词库估算），并携带 denominator / 证据来源 / 样本覆盖 / confidence / method。
5. 阅读只是接触（exposure），不是掌握证据；“被推荐/打开过一篇文章”不构成任何掌握证据。
6. 用户自评 confidence 不得高于 medium。
7. 证据幂等键 = `sessionId + type + key`；重复提交不得新增或改写已有证据。
8. first-pass 与 re-read 的速度与理解度绝不混算，各自独立计时。
9. 没有可读文章时不生成阅读任务（绝不造假文章或假任务）。
10. 任务时长服从 Time Budget First：阅读任务由计划器按剩余预算裁剪。
11. 没有中文释义的新词不得进入 Preview / Recall（不编造释义），只能标记为待补释义。
12. 外部材料的结构一律不得冒充 gold；无人工审校时 provenance 只能是 heuristic/manual，且只记接触。

新增/修改阅读代码后，必须同时跑：`npx tsc --noEmit` → `npm test` → `npm run build`/`build:test` → `node scripts/phase5-smoke.mjs`（+ phase4/phase3 回归），并在 `docs/PHASE5_READING.md` 与 STATE/CHECKPOINT 留下证据。

始终遵守：

> **完成 70% 且状态完整、可恢复、可以继续开发，远优于试图一次做完 100% 却因额度或会话中断而丢失状态。**

因此：

> **可恢复性 > 冒险继续**

聊天不是项目状态数据库。

磁盘代码、状态文件、测试结果和 Git 才是项目事实。

## 13. 内存快照与 IndexedDB 必须显式同步（Phase 7 教训）

Web 应用的 `data` 是内存快照，写入走独立 store。规则：

- 任何 action 成功后，若页面要展示新状态，必须 `loadData()` 重新载入并 `reindex()`，然后 render；
- 不要把 action 拿到的旧 `unit/plan` 对象继续用于下一次写入（revision 会过期，触发 StaleError）；
- 不要靠 `render()` 猜测状态已同步——浏览器验收要断言“页面文字”和“DB 快照”两处一致。
