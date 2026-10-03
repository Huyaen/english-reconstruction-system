# 开发日志
## Checkpoint 01
完成：保存需求与计划，创建配置和交接文档。
修改：package.json、tsconfig.json、README.md、CHECKPOINT.md、TODO.md、docs/PLAN.md。
测试：确认 Node 24 / npm 可用；尚未安装依赖或执行应用测试。
下一步：数据结构、算法测试与实现。

## Checkpoint 02
完成：types.ts 与 core.ts；5项核心算法测试通过（先观察缺失实现失败，再实现通过）。
修改：src/types.ts、src/core.ts、tests/core.test.ts、package-lock.json、docs/checkpoint.py。
下一步：词书导入/持久化，优先验证损坏备份不能覆盖原数据。

## Checkpoint 03
完成：导入导出、数据库事务、备份模式验证。11项测试通过，TypeScript通过。
测试启动器改为node --import tsx，解决当前环境tsx CLI IPC socket被禁用。
修改：src/import.ts、src/db.ts、tests/data.test.ts、package.json。
下一步：训练交互和统计界面。

## Checkpoint 04
完成：UI、训练流程、统计、AI及全部备份界面，生产构建。
测试：15项通过；TypeScript空值报错已定位为局部别名失去收窄，添加已被前置条件保证的断言后构建成功。
修改：app.ts、style.css、ui.ts、quiz.ts、stats.ts、ai.ts、session.test.ts、index.html、server.mjs、start-windows.bat。
下一步：浏览器端到端及大量数据测试。当前不宣称全部完成。

## Checkpoint 05
完成：大词库/1000题压力测试、完整备份恢复、交互DOM测试，修复测试发现的重复session和导航/保存竞争。
修改：core相关回归测试、db.ts校验、quiz.ts回插条件、app.ts启动互斥与导航保存保护、tests/ui.test.ts、jsdom开发依赖。
测试：核心19项通过，DOM集成1项通过；真实浏览器因环境ERR_BLOCKED_BY_CLIENT未能访问。
下一步：文档、最终构建和交付包。

## Checkpoint 06
完成：交付说明、算法/数据字典、验收报告、最新CHECKPOINT和TODO，源码格式整理。
追加修复：同步preventDefault防止表单默认导航；自定义方向比例保持；保存设置保留当前主题；数据被替换后不保存旧数据AI报告。
测试：新回归先失败后修复；完整20项通过，TypeScript与Vite构建成功。
剩余：真实浏览器/手机可视化及真实供应商AI验收。运行环境浏览器受限，明确保留未验收状态。
下一步：由可运行本地浏览器的环境按docs/TEST_REPORT.md补验收。项目无需重新开始。

## 2026-10-04 — V2 接手：Phase 0 — Audit & Safety

完成：完整审计现有仓库（目录/源码/测试/文档/构建产物），确认真实技术栈（TypeScript 5.7 + Vite 6.1 + 原生 DOM + IndexedDB + SheetJS；node:test + fake-indexeddb + jsdom）。
运行验证（实测）：npm test 20/20 通过；npm run build 成功（vite 1.87s）；node server.mjs 实测 curl `GET /` 200（535B）、JS 200（477,379B）、CSS 200、404 正常。
审计落盘：IndexedDB schema（vocabulary-memory-v1 / version 1 / 6 stores，无 migration 框架）、Vocabulary 调度与 mastery 行为、AI Provider 与 Key 存储（内联 prompt、无 schema）、备份恢复（validateBackup 全量校验 + 原子替换）。
Git：项目此前无 Git → `git init -b main`，baseline commit `6c1c625`，tag `v1.0.0-mvp-baseline`（38 files；node_modules 忽略；core.autocrlf=false）。
状态体系：新建 STATE.json、HANDOFF.md；重写 CHECKPOINT.md（含 Phase 0 结论与 Phase 1 任务拆分）；更新 TODO.md、README.md；AGENT_EXECUTION.md 追加 Phase 0.5 深度核查要求。

修改：STATE.json（新）、HANDOFF.md（新）、CHECKPOINT.md、TODO.md、README.md、DEVELOPMENT_LOG.md、AGENT_EXECUTION.md、.git。

测试：npm test 20 pass / 0 fail（含 1 万词导入 ≈359ms、1000 题逐题事务 ≈8.7s、DOM 集成 ≈2.0s）；npm run build 成功；服务端 HTTP 实测通过。

下一步：Phase 0.5 — GitHub Reference Research → REFERENCE_RESEARCH.md（Adopt/Adapt/Reject），随后进入 Phase 1 Data Foundation。

## 2026-10-04 — Phase 0.5 — GitHub Reference Research

完成：有边界的开源调研（GitHub MCP + REST API 小批次策略；候选 40+ 登记、深挖 12、Adopt/Adapt/Reject 总表）。
深挖（实际读取源码/数据模型/算法/License）：ts-fsrs、free-spaced-repetition-scheduler、fsrs-optimizer、ankitects/anki、duolingo/halflife-regression、LuteOrg/lute-v3、yomidevs/yomitan、FreeLanguageTools/vocabsieve、asbplayer/asbplayer、spencermountain/compromise、explosion/spaCy(displaCy)、dexie/Dexie.js、567-labs/instructor-js、CAHLR/pyBKT、naptha/tesseract.js、skywind3000/ECDICT。
关键结论：Adopt = ts-fsrs/zod/jsonrepair/tesseract.js/vite-plugin-pwa/ECDICT 子集；Adapt = HLR、BKT-lite、VocabSieve 加权已知度、Dexie/Lute 迁移模式、displaCy words+arcs；Reject = GPL/AGPL 代码复用、图数据库、CRDT 系。
产物：REFERENCE_RESEARCH.md（490 行，含 §11 总表、§12 调研边界与失败记录——其中记录了本次中断的 APITimeoutError 恢复过程）。

修改：REFERENCE_RESEARCH.md（新）、STATE.json、CHECKPOINT.md、HANDOFF.md、TODO.md、DEVELOPMENT_LOG.md。

测试：纯文档阶段；提交前复验通过——npm test 20 pass / 0 fail（19.3s）；npm run build 成功（vite 2.76s）；STATE.json JSON 校验通过。

下一步：Phase 1 — Data Foundation（从 phase1_db_migration_001 开始：DB v1→v2 迁移框架 + 迁移测试）。
