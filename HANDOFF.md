# HANDOFF — 换模型 / 换会话所需最小上下文

（更新：2026-10-04 · 对应 commit 6c1c625 / tag v1.0.0-mvp-baseline）

## Current phase

Phase 0.5 — GitHub Reference Research（Phase 0 已完成并通过）

## Current task_id

`phase0_5_reference_research_004` — 目标：产出 `REFERENCE_RESEARCH.md`（10–20 候选、深挖 5–10，结论分 Adopt/Adapt/Reject），随后更新 STATE.json / CHECKPOINT.md / HANDOFF.md 并进入 Phase 1。

## What is done

- **Phase 0 审计完成**：目录结构、真实技术栈、运行验证、build、测试、IndexedDB schema/版本、Vocabulary 能力、调度算法、AI Provider/Key 存储、备份恢复——全部实测并落盘（细节见 `CHECKPOINT.md` §2026-10-04）。
- **运行证据（实测，非推测）**：
  - `npm test` → 20/20 pass / 0 fail（含 1 万词导入 ≈359ms、1000 题逐题事务 ≈8.7s、DOM 集成测试）
  - `npm run build` → `tsc --noEmit && vite build` 成功（1.87s；dist JS 471.38 kB / gzip 163.16 kB）
  - `node server.mjs` → curl 实测 `GET /` 200（535B）、JS asset 200（477,379B）、CSS asset 200、404 路径正常
- **Git 已建立**：`git init -b main`，baseline commit `6c1c625`，tag `v1.0.0-mvp-baseline`，工作区干净；`core.autocrlf=false`（防止源码换行被改造）。
- **状态文件体系**：`STATE.json` / `CHECKPOINT.md` / `HANDOFF.md` / `TODO.md` / `DEVELOPMENT_LOG.md` 均在项目根目录。
- `AGENT_EXECUTION.md` 已包含 Phase 0.5 完整定义，并追加了"深度核查要求"（必须实际看源码/数据模型/算法/测试/License/维护状态）。

## What is currently running

无后台任务、无未完成的代码修改。源码目录 `src/`、`tests/` 与 commit 一致。

## What remains

1. **Phase 0.5**：GitHub 参考调研 → `REFERENCE_RESEARCH.md`（Adopt / Adapt / Reject）。
2. **Phase 1 — Data Foundation**（拆分见 `CHECKPOINT.md` §11 / TODO.md P0）：
   - `phase1_db_migration_001`：IndexedDB v1→v2 versioned migration 框架 + 迁移测试（旧数据 100% 保留）
   - `phase1_learning_model_stores_002`：新增 stores（wordExposures、grammarConcepts、grammarAttempts、sentenceAttempts、passages、readingSessions、inputSources、inputSessions、outputAttempts、dailyPlans、miniUnits、skillSnapshots、weeklyDiagnostics、libraryItems）
   - `phase1_word_upgrade_003`：Word 三维能力/exposure/来源字段 + 旧数据默认值
   - `phase1_backup_v2_004`：备份格式 v2（兼容读入 v1 备份）
   - `phase1_model_api_005`：Learning Model 查询层（索引化）

## Last verified build

`npm run build` @ `6c1c625` → vite 6.1.0，built in 1.87s；产物 `dist/assets/index-Cz7SpIzd.js` 471.38 kB（gzip 163.16 kB）、`index-z7Uz7Smv.css` 15.58 kB。

## Last verified tests

`npm test` @ `6c1c625` → 20 pass / 0 fail（node --test + tsx；fake-indexeddb；jsdom + esbuild DOM 集成）。

## Known bugs

- 无阻断性 bug（20 项自动测试、构建、服务实测全部通过）。
- 未验收项（非 bug，保留待办）：真实浏览器可视化验收、真机移动端、真实 AI 供应商调用。
- 已知局限（设计/环境）：同义排除为文本启发式；性能基准使用 fake-indexeddb；调度为透明启发式而非 FSRS。

## Files currently being modified

无进行中的源码修改（仅状态文档刚更新并已/将提交）。

## Database migration status

- 当前：数据库 `vocabulary-memory-v1`，**version 1**，6 个 stores（books / words / records / sessions / analyses / meta）。
- 尚无 migration 框架、无已执行的迁移、无迁移测试。
- 首次迁移将在 Phase 1 执行（v1→v2）。**迁移前必须：整库备份 + 迁移测试 + 只加不删（additive only）。**

## Next exact action

执行 Phase 0.5 调研：用 GitHub MCP（搜索/读文件/看 commit）对以下方向各找候选（共 10–20 个，深挖 5–10 个）：FSRS/记忆调度、自适应学习与知识追踪、词汇学习与阅读标注采集、句法/语法解析可视化、学习知识图谱、学习分析/技能追踪、local-first 与 IndexedDB 架构、AI 结构化输出与 schema 校验、每日自适应计划、OCR/文档导入、备份与迁移。深挖时实际查看源码、数据模型、核心算法、测试、架构、License、最近维护状态；产出 `REFERENCE_RESEARCH.md` 后按 Adopt/Adapt/Reject 记录决策，然后更新四个状态文件并进入 Phase 1。

## Important warnings

1. **不要重写现有 Vocabulary 模块**。策略固定为：审计 → 复用 → 扩展 → 迁移 → 验证。
2. **旧数据 100% 保留**是硬约束；任何改 DB 版本号的操作前先备份。
3. 修改 `src/*.ts` / `tests/*.ts` 后保持 `docs/format-source.mjs` 的紧凑格式（或运行该脚本），否则 diff 会失控。
4. **不要把 API Key 写入日志/提交**；备份始终剔除 Key；不要在聊天中索取 Key。
5. `npm start` / `node server.mjs` 读取的是 `dist/`；源码改动后必须 rebuild 才能看到效果。
6. 本机浏览器验证路径：Hermes 内置 browser_exec 不可用；需要真实浏览器时使用 CDP 无头 Edge（见 skill `sillytavern-live-ui-verification` 的自建方案）。
7. 项目唯一根目录：`D:\英语重构训练\vocabulary-app`。禁止另起工程。
8. 完成任何阶段后按 `AGENT_EXECUTION.md` §4 标准动作更新全部状态文件并提交 Git。
