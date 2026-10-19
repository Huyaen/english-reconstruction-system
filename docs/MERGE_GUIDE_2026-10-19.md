# 使用与合并说明（必读）

## 先看两件事

1. **此包是基于 2026-10-19 用户上传的文件快照，在隔离容器中编辑的文档包，未连接 Windows D 盘源码/Git，也未新建/推送 GitHub 仓库。** 包中的 `STATE.json`、`HANDOFF.md`、`CHECKPOINT.md` 只是基于该快照的候选修订，不是用户 Windows 文件系统的实时状态。
2. **如果你在上传这些文件之后继续用过 Hermes 或 Codex，严禁直接覆盖本机较新文档。** 必须先备份、`git diff`、三方合并；以实际代码、Git 及测试为准。

## 文件与推荐覆盖策略

| 文件 | 内容 | 如果本机自上传后没有改动 | 如果本机后来又改动 |
|---|---|---|---|
| PROJECT_SPEC.md | 原完整产品规格 + 工程 GitHub 隐私边界 | 可以替换 | 只把附录 C 合并进去 |
| AGENT_EXECUTION.md | 原执行协议 + 完整 Remote Sync Protocol | 可以替换 | 合并新增 GitHub 协议，不删本机新规则 |
| INITIAL_PROMPT.md | 首次/恢复优先级切换 + GitHub/Phase3 入口 | 可以替换 | 以恢复优先规则合并 |
| START_HERMES.md | 新会话完整启动提示词 | 新增 | 可直接新增，执行前本机核对 |
| docs/PHASE3_DAILY_PLANNER.md | Phase 3 专项全量验收规范 | 新增 | 若本机已有同名文件，三方合并 |
| STATE.json | 清除旧 FSRS 过期限制，新增 github task/remote_sync | 可替换但仍需 agent 实测 | **不要覆盖**；只合并新增字段/task，以最新进度为准 |
| HANDOFF.md / CHECKPOINT.md | 追加 2026-10-19 离线审计说明 | 可以替换但审慎 | **不要覆盖**，将新说明段落追加 |
| TODO.md / README.md / DEVELOPMENT_LOG.md | 修正重复状态/过时入口 + GitHub 协议 | 可以替换 | 三方合并，开发日志必须只追加 |

无需修改或包含：`src/`、`tests/`、`dist/`、`.git/`、`package.json`、`package-lock.json`、`tsconfig.json`、`REFERENCE_RESEARCH.md`、`docs/ALGORITHMS.md`。本包不对这些未上传的运行时代码作任何成功验证。

## 推荐实际操作

- 先在 `D:\英语重构训练\vocabulary-app` 保留一份原文档副本；切勿备份/上传 token。
- 用 Hermes 对照当前 Git 与本机文件，按上表合并；保留真实 `current_phase`、`last_verified_commit`、现有 task status。
- 验证 `STATE.json` 可解析，检查协议链接目标文件存在。
- 向新的 Hermes 发 `START_HERMES.md` 全文，或令它直接读取该文件执行。**不要再把数万字产品规格贴进聊天**。
- 先运行 `infra_github_remote_001` 的核查/配置；授权或网络不可用则记 pending/blocked，然后安全继续真实业务任务。
- 在 Phase 3 完成前参考 `docs/PHASE3_DAILY_PLANNER.md`，不得只做空壳 UI。

## 本次审核认定的历史断点（不是实时验证）

- 文档 `STATE.json`：Phase 0/0.5/1/2 `passed`；Phase 3 `planned`，DB v3，最后报告 39/39，最后记录 `last_verified_commit=92fdab0...`。
- 用户先前报告另有 pin commit `92f8ec1`；没有 `.git` 无法从上传文档单独核验本机 HEAD。
- `package.json`、lockfile 记载 `ts-fsrs` 版本 5.4.2。
- `README.md` 原先旧 MVP 恢复说法、`STATE.json` 中旧“非 FSRS”局限项、`TODO.md` Phase 2 双重未完成描述已在本包纠正。
- `AGENT_EXECUTION.md` 中 Phase0.5 GitHub **开源调研**已经完成；本包新增的 `infra_github_remote_001` 才是自己的 GitHub **远程仓库**设置。

## 完成的判定

“文档写了 GitHub Private” ≠ “GitHub 仓库已经建立”；“本地 Git commit 存在” ≠ “push 成功”；“推送成功” ≠ “学习数据已备份”；“旧日志测试通过” ≠ “新会话已重跑测试”。这些状态要分开验证。
