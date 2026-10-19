# English Reconstruction System V2 — 离线工程状态审计

**审计日期：2026-10-19。审计范围：用户本次上传的 13 份文件，未取得 D 盘源码与 `.git` 数据，未连接其 GitHub，未执行 npm test/build。** 本文的 passed 均指文件中记载的**历史测试/验收状态**，不是本次亲自执行。

## 已有证据与可信断点

| 状态维度 | 上传文件支持的结论 | 实时待验证 |
|---|---|---|
| Phase 0 | 审计通过；baseline `6c1c625` | `git log` / tag |
| Phase 0.5 | 开源调研通过、`REFERENCE_RESEARCH.md` 490 行 | 是否存在后续补充 |
| Phase 1 | DB v2 + 14 stores + backup/query 测试通过 | DB实际运行态 |
| Phase 2 | ts-fsrs 5.4.2、DB v3、Preview、三维证据、多词池通过 | 最新代码与 build / test |
| Phase 2 验收 | `npm test` 39/39、build passed、独立 Edge/CDP smoke | 最新运行是否仍通过 |
| Phase 3 | `STATE.tasks.phase3_daily_planner_007.status = planned` | 上传以后是否已有实现 |
| 本地 Git | `STATE.last_verified_commit = 92fdab0...` 功能提交；上次用户报告另有 pin `92f8ec1` | 实际 `git HEAD` |
| GitHub Remote | **无证明已建仓或 push 的事实** | owner、URL、Private、SHA、tags、凭据 |

## 发现的问题与处理

1. `AGENT_EXECUTION.md` 原仅有本地 Git/checkpoint 及开源调研要求，没有本项目 GitHub Remote 创建与 Task/Phase 级 push 规范。新增 Remote Sync Protocol，强调 Private、安全历史扫描、远端 SHA 验收与错误续传。
2. `INITIAL_PROMPT.md` 仍以无条件 Phase 0 开头，尽管后文有恢复说明。现在将“发现状态文件/Git → 首先恢复”作为最高优先级入口，Phase 0 只限全新工程。
3. `STATE.json` `known_limitations` 存在“调度非 FSRS”的老描述，与 `phase2_vocabulary_v2_006: passed` 矛盾。候选修订说明默认已 FSRS，legacy 备选，并另列本机待验证风险。
4. `TODO.md` Phase 2 在 P0 已勾选通过，但 P1 仍出现一个未勾选的 Phase 2 总项。候选修订将其纠正为完成。
5. `README.md` 首页仍声称当前是“仅 MVP，真实浏览器未验收”，而 Phase2 的独立无头 Edge CDP smoke 已有报告。现调整为“Phase2 独立浏览器烟测通过，真机及真实 AI 供应商尚未验收”。
6. `HANDOFF.md` 原下一 task 为 `phase3_daily_planner_007`。新增一次性 `infra_github_remote_001` 为前置核查，业务断点仍是 `phase3_daily_planner_007`。GitHub 认证/网络若阻断，应将远程任务单独标记 blocked/pending，允许安全本地业务继续。
7. `AGENT_EXECUTION.md` 原有两处部分重复的状态/恢复章节。**本包未进行删除式合并**，避免误删用户原有约束；后续可在独立文档重构阶段统一去重。
8. `REFERENCE_RESEARCH.md` 的早期 ts-fsrs 调研建议“不要默认开启 short-term”，与 `CHECKPOINT.md` Phase2 “enable_short_term=true” 有历史差异。**这不是本次运行验证结果**；最终以 Phase2 实际代码、锁定版本、测试及后续用户决定为准，不据旧调研建议自动切换调度参数。
9. `README.md` 记载 V3 数据库名仍为 `vocabulary-memory-v1`；不应因名字尾缀 v1 就创建新库，防止学习数据失联。
10. 已有文档记载 `dist/` 由 Git 跟踪，首次 GitHub push 需扫描所有拟上传历史/构建产物，而非只检查工作目录 `.env`；不因远端同步擅自取消已有 dist 策略。

## 本次候选修改与真实性边界

- 更新：`PROJECT_SPEC.md`、`AGENT_EXECUTION.md`、`INITIAL_PROMPT.md`、`STATE.json`、`HANDOFF.md`、`CHECKPOINT.md`、`TODO.md`、`README.md`、`DEVELOPMENT_LOG.md`。
- 新增：`START_HERMES.md`、`docs/PHASE3_DAILY_PLANNER.md`、`MERGE_GUIDE.md`、本审计文件。
- 保留原功能代码、依赖文件、Git 历史，不宣称创建了 GitHub Repo，也不宣称已重新运行测试。
- **先检查本机是否比上传快照更新，再进行文档合并，禁止无差别覆盖最新 `STATE.json/HANDOFF.md`。**
