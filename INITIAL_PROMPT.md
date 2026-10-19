# English Reconstruction System V2
## INITIAL_PROMPT — 首次启动与断点恢复统一入口

你现在接手一个已经存在的英语词汇学习 Web App，并要将其升级为完整的 **English Reconstruction System V2**。

本次不是创建 Demo，也不是从零重写。

> **强制入口路由，优先级高于下文首次审计示例：** 如果仓库中已经有 `STATE.json` / `HANDOFF.md` / Git commit，**先按恢复协议核对真实磁盘和远端**，从当前任务继续；不要无条件运行 Phase 0。下文 Phase 0 仅适用于确实没有完整初始工程状态的首次导入。
>
> 2026-10-19 用户上传的文档快照显示 Phase 0/0.5/1/2 已 `passed`、DB v3、上次测试 39/39、下一任务 `phase3_daily_planner_007`（planned）。这是**离线历史记录**，本机可能更靠后；以 Git / 实际源码 / 最新本机 STATE 为准。
>
> 新增 `infra_github_remote_001` 作为一次性 GitHub 私有仓库创建/核验/安全首次推送任务；执行前必须检查是否已有 remote，绝不覆盖历史。远程不可用则记录 blocked/pending，继续本地安全开发。详细协议：`AGENT_EXECUTION.md` 的 GitHub Remote Sync Protocol；当前阶段验收：`docs/PHASE3_DAILY_PLANNER.md`。


项目根目录应同时包含或由你创建并维护：

```text
PROJECT_SPEC.md
AGENT_EXECUTION.md
STATE.json
CHECKPOINT.md
HANDOFF.md
README.md
TODO.md
DEVELOPMENT_LOG.md
```

其中：

- `PROJECT_SPEC.md` 是长期产品规格和不可随意改变的产品决策。
- `AGENT_EXECUTION.md` 是工程实施、分阶段开发、Checkpoint、状态继承和恢复协议。
- `STATE.json` 是唯一机器可读当前状态。
- `CHECKPOINT.md` 保存阶段事实与已淘汰方案。
- `HANDOFF.md` 保存下一模型/下一会话继续所需的最小上下文。

---

# 第一原则

**先审计现有工程，禁止直接重写。**

现有项目已经有一套可工作的词汇学习能力，包括词书导入、双向测试、反应时间、掌握度、混淆词、复习调度、统计、AI API、IndexedDB、备份恢复等。

你的目标是：

> 复用现有词汇模块作为 Vocabulary Engine，
> 在其上逐步建立 Daily Planner、Personal Learning Model、Sentence Lab、Grammar Knowledge Graph、Reading Lab、Reinforcement Engine、Mini Unit、Real Input Hub、Output Lab、Diagnostics、Weekly Diagnostic 和 Exam Transfer。

---

# 立即执行 Phase 0 — Audit & Safety

**仅当这是没有 STATE/已验收 baseline 的首次接手时才执行此节。** 已有进度时跳到文末恢复协议。

在修改业务代码前，完成以下工作：

1. 检查仓库目录结构。
2. 识别真实技术栈，不根据提示词臆测。
3. 安装/检查依赖。
4. 启动旧版项目。
5. 运行 build。
6. 检查当前测试体系；如无测试，记录。
7. 审计现有词汇模块的真实能力。
8. 审计 IndexedDB schema、版本号和 migration 机制。
9. 审计 AI provider / prompt / API key 存储方式。
10. 审计数据备份与恢复逻辑。
11. 识别可直接复用的模块。
12. 识别需要迁移、扩展、替换的部分。
13. 记录当前已知 bug 和风险点。
14. 如项目没有 Git，初始化 Git；如已有 Git，检查状态。
15. 在任何重大修改前建立 baseline commit / checkpoint。

---

# 建立状态体系

如果以下文件尚不存在，立即创建：

```text
STATE.json
CHECKPOINT.md
HANDOFF.md
TODO.md
DEVELOPMENT_LOG.md
```

`STATE.json` 至少应包含：

```json
{
  "project": "English Reconstruction System V2",
  "overall_status": "active",
  "current_phase": "phase_0_audit",
  "last_updated": "",
  "last_verified_commit": "",
  "database_version": null,
  "build_status": "unknown",
  "test_status": "unknown",
  "tasks": {},
  "known_bugs": [],
  "blocked": [],
  "next_task_id": ""
}
```

每个高耗时任务必须有唯一 `task_id`，状态只允许：

```text
planned
running
verifying
passed
failed
blocked
```

---

# Phase 0 的落盘产物

完成审计后，将结果写入项目文件，而不是只在聊天里汇报。

至少更新：

- `CHECKPOINT.md`
- `HANDOFF.md`
- `STATE.json`
- `DEVELOPMENT_LOG.md`
- `TODO.md`
- 必要时 `README.md`

并确保 `CHECKPOINT.md` 明确记录：

- 真实目录结构
- 技术栈
- 当前 DB schema / 版本
- 当前可运行功能
- build 结果
- test 结果
- 可复用模块
- 迁移风险
- Phase 1 的具体任务拆分

---

# 不可改变的产品方向

开发过程中必须持续遵守 `PROJECT_SPEC.md`，尤其不能擅自改变以下原则：

- 强引导 + 有限自由
- Time Budget First
- 状态三档
- 每天覆盖五个核心能力
- 动态模块顺序
- 2～3 天 Mini Unit
- 每个 Unit 有 Anchor Material
- Short Cold Test
- Reading 使用 Layered Reading
- 新词先 Preview 再 Recall
- 多词池选词
- Grammar Knowledge Graph
- Sentence Lab 混合句源
- Output 诊断优先
- 多证据 Mastery
- Closing Loop
- Yesterday Recall
- Weekly Diagnostic
- 不积学习债，只保留记忆债
- 视频不做昂贵长视频 AI 分析
- AI 是脚手架，真实英语负责验收
- 最终目标是掌握英语，而不是只提高考试分数

---

# 开发顺序

完成 Phase 0 后，严格参考 `AGENT_EXECUTION.md` 中的阶段计划，原则上按：

```text
Phase 1  Data Foundation
Phase 2  Vocabulary V2
Phase 3  Daily Planner
Phase 4  Sentence & Grammar
Phase 5  Reading
Phase 6  Reinforcement AI
Phase 7  Mini Unit
Phase 8  Input Hub
Phase 9  Output Lab
Phase 10 Diagnostics
Phase 11 Exam Transfer
Phase 12 Full Integration
Phase 13 Hardening
```

逐阶段推进。

不要同时大规模开启多个 phase。

---

# 开发过程行为

每个主要阶段结束必须：

1. 保存代码。
2. 运行相关测试。
3. 运行 build。
4. 更新 `STATE.json`。
5. 更新 `CHECKPOINT.md`。
6. 更新 `HANDOFF.md`。
7. 更新 `TODO.md`。
8. 追加 `DEVELOPMENT_LOG.md`。
9. 如 Git 可用，提交稳定 commit。

未验证的功能不能标记 `passed`。

---

# 中断 / 额度不足处理

如果出现模型额度不足、会话异常、413、工具错误、程序崩溃或你判断下一高耗时任务无法安全完成：

**立即停止开启新模块。**

优先执行 Emergency Checkpoint：

1. 保存当前文件。
2. 更新 `STATE.json`。
3. 更新 `CHECKPOINT.md`。
4. 更新 `HANDOFF.md`。
5. 写清当前 `task_id` 和真实状态。
6. 写清未完成代码、已知 bug、正在修改的文件。
7. 写清下一条具体操作。
8. 如可能运行快速 build/test。
9. 如 Git 可用，提交当前安全状态。

禁止在中断前仅回复“已保存进度”而没有实际状态文件更新。

---

# 恢复会话规则

如果你不是第一次接手，而项目里已经存在状态文件：

不要重新执行 Phase 0 全部工作，也不要从头重构。

先：

```text
Read PROJECT_SPEC.md
Read AGENT_EXECUTION.md
Read STATE.json
Read CHECKPOINT.md
Read HANDOFF.md
Read README.md
Read TODO.md
Read DEVELOPMENT_LOG.md
Inspect git + actual files
Run minimum verification
```

状态文件与实际磁盘冲突时：

> 以实际项目为准并修正状态文件。

已经 `passed` 且可验证的高耗时任务禁止重复执行。

从：

> `STATE.next_task_id` + `HANDOFF.md` 的 Next Action

继续。

---

# 最终要求

不要只输出设计方案。

这是一个实际开发任务。

最终交付必须：

- 旧词汇数据不丢失
- 可正常启动
- 可正常构建
- 核心测试通过
- 各模块真正串入 Daily Planner
- AI 未配置时核心本地能力仍可使用
- 备份与恢复可用
- 无阻断日常使用的已知 bug
- 文档、状态文件和 handoff 完整

最终产品应帮助用户从：

> 逐词翻译、短期背词、低词汇覆盖

逐渐走向：

> 直接理解英语、稳定长期记忆、阅读真实材料、观看英文媒体、用英语总结和表达观点。

当前目录如果已经存在已完成阶段和状态文件：

1. 优先恢复；核对 Git / `STATE.json` / `HANDOFF.md` / `CHECKPOINT.md` / 实际构建与测试。
2. 在本地检查 `infra_github_remote_001`：先核实远程是否已有、授权与敏感历史，建立/核验 Private Github remote；不能推送则按协议记录状态。
3. 从真实 `next_task_id` 继续。若仍是 Phase 3，按 `docs/PHASE3_DAILY_PLANNER.md` 和 `PROJECT_SPEC.md` 开发。
4. 每个稳定 task/phase 同步仓库，异常时保持离线 Git checkpoint 和 HANDOFF。

**只有真实的新项目才执行 Phase 0。不要从零重写或重做已经 passed 的任务。**
