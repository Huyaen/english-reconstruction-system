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
11. Reconcile state files with actual project
12. Resume STATE.next_task_id / HANDOFF.Next Action
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

始终遵守：

> **完成 70% 且状态完整、可恢复、可以继续开发，远优于试图一次做完 100% 却因额度或会话中断而丢失状态。**

因此：

> **可恢复性 > 冒险继续**

聊天不是项目状态数据库。

磁盘代码、状态文件、测试结果和 Git 才是项目事实。
