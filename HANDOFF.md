# HANDOFF — 换模型 / 换会话所需最小上下文

（更新：2026-10-04 01:12 · 基线 commit `6c1c625` / tag `v1.0.0-mvp-baseline`；Phase 0.5 提交见 git log）

## Current phase

Phase 1 — Data Foundation（Phase 0 审计 + Phase 0.5 开源调研均已完成并通过）

## Current task_id

`phase1_db_migration_001` — IndexedDB v1→v2 versioned migration 框架 + 迁移测试（旧数据 100% 保留）。

后续任务顺序：`phase1_learning_model_stores_002` → `phase1_word_upgrade_003` → `phase1_backup_v2_004` → `phase1_model_api_005`（拆分与验收见 `CHECKPOINT.md` §Phase 1 表格）。

## What is done

- **Phase 0 审计完成**：目录结构、真实技术栈、运行验证、build、测试、IndexedDB schema/版本、Vocabulary 能力、调度算法、AI Provider/Key 存储、备份恢复——全部实测并落盘（细节见 `CHECKPOINT.md`）。
- **Phase 0.5 调研完成**：`REFERENCE_RESEARCH.md`（490 行；候选 40+、深挖 12、Adopt/Adapt/Reject 总表 §11；边界与失败记录 §12）。
  - **Adopt**：ts-fsrs（MIT，调度内核，Phase 1/2 引入）、zod（MIT）、jsonrepair（ISC）、tesseract.js（Apache-2.0）、vite-plugin-pwa（MIT）、ECDICT 数据子集（MIT）
  - **Adapt**：Duolingo HLR（半衰期诊断）、pyBKT BKT-lite（语法掌握概率）、VocabSieve 加权已知度、Dexie/Lute 迁移模式、spaCy displaCy 的 `{words,arcs}` 渲染协议、compromise（本地 NLP）
  - **Reject（记录原因）**：Anki/yomitan/vocabsieve/asbplayer 的**代码**（AGPL/GPL 传染）、图数据库、CRDT/local-first 引擎、instructor-js 作为依赖
- **运行证据（最近一次全量复验，Phase 0.5 后）**：
  - `npm test` → **20 pass / 0 fail**（19.3s；含 1 万词导入、1000 题逐题事务、DOM 集成）
  - `npm run build` → `tsc --noEmit && vite build` 成功（2.76s；dist JS 471.38 kB / gzip 163.16 kB）
  - `STATE.json` JSON 校验通过
- **Git 已建立**：`main` 上有 `6c1c625`（基线）、`9dc0b8b`（状态体系）与 Phase 0.5 提交；`core.autocrlf=false`。
- **状态文件体系**：`STATE.json` / `CHECKPOINT.md` / `HANDOFF.md` / `TODO.md` / `DEVELOPMENT_LOG.md` 持续维护。
- `AGENT_EXECUTION.md` 含 Phase 0.5 完整定义 + 深度核查要求补充。

## What is currently running

无后台任务、无未提交的未完成代码（Phase 0.5 为纯文档阶段）。

## What remains

1. **Phase 1 — Data Foundation**（当前）：见上方 Current task_id 与 `CHECKPOINT.md` §Phase 1 表格。
2. **Phase 2–13** 按 `AGENT_EXECUTION.md` 推进（每阶段：测试 → build → 五个状态文件 → commit）。

## Last verified build

`npm run build` @ 工作区（Phase 0.5 后复验）→ vite 6.1.0 成功；产物 `dist/assets/index-Cz7SpIzd.js` 471.38 kB（gzip 163.16 kB）、`index-z7Uz7Smv.css` 15.58 kB。

## Last verified tests

`npm test` @ 同上 → 20 pass / 0 fail（node --test + tsx；fake-indexeddb；jsdom + esbuild DOM 集成）。

## Known bugs

- 无阻断性 bug。
- 未验收项（非 bug，保留待办）：真实浏览器可视化验收、真机移动端、真实 AI 供应商调用（`TODO.md` P1）。
- 已知局限（设计/环境）：同义排除为文本启发式；性能基准使用 fake-indexeddb；调度为透明启发式（Phase 2 计划升级为 ts-fsrs）。

## Files currently being modified

无。

## Database migration status

- 当前 DB：`vocabulary-memory-v1`，**version 1**，6 个 stores（books / words / records / sessions / analyses / meta），无二级索引。
- **尚未执行任何迁移**。Phase 1 将升至 **version 2**（只加不删；新增 14 个 stores + 索引 + `words` 默认字段回填 + `meta` 迁移标记；迁移测试用 v1 fixture）。
- 迁移设计依据：`REFERENCE_RESEARCH.md` §6.1（Dexie 版本化 schema 模式）与 §2.1（Lute migration 模式）。

## Next exact action

执行 `phase1_db_migration_001`：

1. `src/types.ts`：新增 v2 数据模型类型（14 个新 store 的实体接口 + Word 新增三维能力/exposure/来源字段）。
2. `src/db.ts`：`DB_VERSION = 2`；`onupgradeneeded` 逐版本迁移（v1 建原 6 store → v2 建新 stores + 索引 + `words` 默认字段回填 + 写 `meta` 迁移标记）；保持 `replaceData` / `saveAnswer` / `validateBackup` 既有行为不变。
3. 新建 `tests/migration.test.ts`：v1 fixture（手工建 v1 库 + 样本数据）→ 用新代码打开 → 断言旧数据 100% 保留、新 store 就绪、迁移幂等、备份兼容。
4. 运行 `npm test` + `npm run build`，更新状态文件，提交 `feat(db): v1→v2 versioned migration ...`。

## Important warnings

1. **迁移只增不删**；`onupgradeneeded` 中先建 store/索引，再回填数据；升级事务原子性保证失败回滚（旧数据安全）。
2. **不要复制 GPL-3.0 / AGPL-3.0 项目代码**（yomitan/vocabsieve/asbplayer/Lute 代码层面）；Adopt 依赖严格按 `REFERENCE_RESEARCH.md §11` 许可证引入并记录版本。
3. **ts-fsrs 到 Phase 2 才作为依赖引入**；Phase 1 不引入任何新运行时依赖。
4. 修改 `src/*.ts` / `tests/*.ts` 后保持 `docs/format-source.mjs` 的紧凑格式（或运行该脚本），否则 diff 会失控。
5. **不要把 API Key 写入日志/提交**；备份始终剔除 Key。
6. `npm start` / `node server.mjs` 读取的是 `dist/`；源码改动后必须 rebuild。
7. 本机浏览器验证路径：Hermes 内置 browser_exec 不可用；需要真实浏览器时使用 CDP 无头 Edge（见 skill `sillytavern-live-ui-verification` 的自建方案）。
8. 项目唯一根目录：`D:\英语重构训练\vocabulary-app`。禁止另起工程。
9. 完成任何阶段后按 `AGENT_EXECUTION.md` §4 标准动作更新全部状态文件并提交 Git。