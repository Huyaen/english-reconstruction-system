# English Reconstruction System V2 — 新 Hermes 会话完整恢复启动提示词

你现在正式接手工作目录：

`D:\英语重构训练\vocabulary-app`

**这是已开发到 V2 Phase 3 的同一个长期工程，不是新项目。不要从零创建，不要重做 Phase 0、0.5、1、2，也不要因为旧聊天丢失而重新设计产品。**

## 1. 先核实本地真实状态

在修改任何代码之前，按顺序读取：`INITIAL_PROMPT.md`、`PROJECT_SPEC.md`、`AGENT_EXECUTION.md`、`STATE.json`、`CHECKPOINT.md`、`HANDOFF.md`、`REFERENCE_RESEARCH.md`、`TODO.md`、`DEVELOPMENT_LOG.md`、`README.md`、`docs/PHASE3_DAILY_PLANNER.md`（如存在）、`docs/ALGORITHMS.md`（如存在）。

检查 `git status --short --branch`、`git log -n 8 --oneline --decorate`、tags、branches、`git remote -v`、最新提交的实际文件、DB 版本、`package.json` 与 lockfile、近期源码与测试。以磁盘+Git+测试为准，离线文档快照只作为已知历史；不可因状态文件看似陈旧就 `reset --hard`/`clean`。

已上传的上一快照记录：Phase 0/0.5/1/2 `passed`；DB v3；fsrs@5.4.2；上次测试 39/39；Phase 2 tag `phase2-vocabulary-v2`；`STATE.next_task_id = phase3_daily_planner_007` 且 status=`planned`。这不是对本机今天的实时验证。如果发现 Phase 3 已做过部分或全部，直接在对应断点续接。

## 2. 先完成一次 GitHub Private Remote Setup / Audit

这项是新增基础设施任务：`infra_github_remote_001`。**必须与已完成的 Phase 0.5 GitHub 参考研究区别开**；Phase 0.5 搜过开源项目，不意味着本工程代码已托管远端。

按 `AGENT_EXECUTION.md` 的 GitHub Remote Sync Protocol：

1. `git remote -v`、实际当前 GitHub owner/account/auth、分支 HEAD 与历史 tag，先核实是否已有同工程远程仓库；有则对账，禁止新建替代。
2. 若不存在远端，在有权限的用户账户下建立建议名 `english-reconstruction-system` 的 **Private** 仓库（未经明确许可不得 Public）；owner/account 不明或缺授权时问我确认，不猜账号、不编 URL。
3. **首次 push 前扫描工作树、已暂存文件、所有将被上传的可达历史**，检查密钥、API Token、`.env`、浏览器学习数据、个人隐私、日志、构建产物；一旦历史有敏感信息，停止上传并提供安全处理选项。不能只补 `.gitignore` 就声称解决已提交历史的风险。
4. 创建或复用现有 `origin`（实际名称以当前配置为准）；不得丢失 V1 baseline、Phase 0/0.5/1/2 既有提交和 tags；正常 push 当前实际分支和 tags；用 `git ls-remote`/GitHub API 验证远端 SHA、Private 可见性。
5. **严禁 force push、blind reset/merge/rebase、自动改写历史、删除 tags/branches**。如果远端已有不一致历史，停止破坏性操作并报告分叉情况。
6. 更新 `STATE.remote_sync` 与 CHECKPOINT/HANDOFF/README（值必须实测，不编造）。
7. 若 GitHub API timeout / 认证未完成，记录 blocked/pending、具体报错、下一重试动作，保留本地 commit；不要为了 GitHub 问题重跑已通过业务开发。

在每个稳定 task/phase 验收后执行 Task-Level Sync / Phase-Level Sync，并验证推送结果；**GitHub 只保存工程代码，不会自动备份 IndexedDB 学习数据**。GitHub token 不得写入代码/日志/STATE/HANDOFF。

## 3. 立即恢复 Phase 3 的实际未完成工作

本地如果仍未推进 Phase 3：按 `docs/PHASE3_DAILY_PLANNER.md` 完整实施 `phase3_daily_planner_007`，不要仅做任务 UI。

关键要求：

- Time Budget First：20/30/45/60/custom，包含 Yesterday Recall/Closing/Re-entry 的**总时间**不超预算；low/normal/high 三档状态。
- 复用 Phase 2 的 `recommendedNewWordCount()`、`buildNewWordQueue()`、`effectiveDue()` 和 IndexedDB `dailyPlans`。核心 deterministic 纯函数 + 索引查询，不重写 FSRS。
- Yesterday Recall（真实隔夜词、2–4 分钟）→ 以真实保留和弱词校准计划；禁止无历史时伪造 retention；避免重复写入同一 FSRS review event。
- 五模块统一 typed Task / capability gate；尚未上线 Sentence/Reading/Input/Output 时不显示假可执行任务；未来模块按稳定接口注册。
- Start/Skip/Delay/Replace + 动态重规划（一般不超过20–30%调整），保留 critical memory，任务超时默认不延长总预算。
- Closing Loop（3–5分钟，仅主动回忆和难度反馈）、同日中断刷新恢复、Regenerate只改剩余计划。
- 不积学习债，只保留到期记忆债；间断1天正常恢复，2–3天 Re-entry Check，7天+ Mini Diagnostic，4–6天至少 Re-entry。
- 本次不提前大规模实现后续模块；全部接口、数据、状态真实落盘，禁止假数据/假按钮。

如果 Phase 3 已经全部实测 `passed`，不要重新实现，直接进入 `STATE.next_task_id` 所指的下一阶段。

## 4. 强制验证、提交和中断保护

每个阶段：相关单测→完整 `npm test`→`npm run build`→HTTP runtime→隔离的真实浏览器/CDP smoke（不得破坏真实用户 IndexedDB）→Git diff/secret scan→CHECKPOINT/STATE/HANDOFF/TODO/DEVELOPMENT_LOG→稳定 commit、tag→按同步协议 push/远程 SHA 验证。

若本机无法联网或认证，**本地验收 passed 与 remote_sync pending 必须分开记录**。不要谎称 push 成功或远端备份完成。

模型额度、会话、工具、网络风险时立即保存文件和 Emergency Checkpoint；明确 `current_phase/task_id`、已完成项、未完成项、最后通过的 tests/build、变动文件、Git 状态、远程同步状态、下一条具体操作；不得只在聊天说“已保存”。

## 5. 工作方式

小型技术实现选择自主决定，不要频繁问我；涉及 GitHub owner/授权、可能公开、历史改写、敏感文件上传、删除旧数据、付费 API 或改变产品方向才请求确认。

这次是**实际开发任务**：核查 → 必要文档合并 → GitHub remote 安全配置/核验 → 从真实断点继续 Phase 3 → 完成测试与状态同步。不要只输出计划，不要重做过去工作。
