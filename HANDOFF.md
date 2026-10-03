# HANDOFF — 换模型 / 换会话所需最小上下文

（更新：2026-10-04 01:50 · 最新代码提交见 git log；基线 `6c1c625` / `v1.0.0-mvp-baseline`）

## Current phase

Phase 2 — Vocabulary V2（Phase 0 审计 / Phase 0.5 调研 / Phase 1 Data Foundation 均已完成并通过）

## Current task_id

`phase2_vocabulary_v2_006`（下一步开工）。Phase 1 五项任务（`phase1_db_migration_001` … `phase1_model_api_005`）全部 passed，证据见 `CHECKPOINT.md` §Phase 1。

## What is done（累计）

- **Phase 0 审计**：目录/技术栈/运行/build/test/DB/AI/备份全部实测（`CHECKPOINT.md`）。
- **Phase 0.5 调研**：`REFERENCE_RESEARCH.md`（候选 40+、深挖 12、Adopt/Adapt/Reject 总表 §11）。
- **Phase 1 Data Foundation（本轮完成）**：
  - DB **version 2**：`runMigration` 逐版本、只加不删、原子升级；v1 数据 100% 保留有测试
  - 新增 14 个 stores + 16 组索引（含复合 `wordId,at`）；`src/model.ts` 索引化查询层
  - Word 三维能力字段 + 默认值回填（`withV2WordDefaults`）；备份 v2（兼容读入 v1；悬空引用拒绝）
  - 真实升级后 UI toast 提示导出备份；删词书同步清理 `wordExposures`
- **验证证据（最新全量）**：`npm test` **25/25 pass**；`npm run build` 成功（dist JS 475.21 kB / gzip 164.36 kB）；`node server.mjs` 实测 `GET /` 200、新 bundle 200。
- **Git 轨迹**：`6c1c625`（基线）→ `9dc0b8b`（状态体系）→ `76716a6`（Phase 0.5）→ 本轮 Phase 1 提交（见 git log）。

## What is currently running

无后台任务；无未完成的代码修改（工作区 = 本轮已验证状态）。

## What remains

Phase 2（当前）→ Phase 3–13 按 `AGENT_EXECUTION.md` 推进。

## Last verified build

`npm run build` @ 本轮工作树 → vite 1.15s；`dist/assets/index-DzHi_0Ef.js` 475.21 kB（gzip 164.36 kB）。

## Last verified tests

`npm test` @ 同上 → 25 pass / 0 fail（含 v1→v2 迁移 100% 保留、幂等、v1/v2 备份兼容与拒绝、索引化查询）。

## Known bugs

- 无阻断性 bug。
- 未验收项（TODO P1）：真实浏览器可视化、真机移动端、真实 AI 供应商调用。
- 已知限制：性能基准基于 fake-indexeddb；调度仍为启发式阶梯（Phase 2 换 ts-fsrs）。

## Files currently being modified

无。

## Database migration status

- 当前 schema：**version 2**（DB 名仍为 `vocabulary-memory-v1`，刻意保持不变）。
- v1→v2 迁移框架已就绪并测试；`meta.migration` 记录最近一次真实升级（from/to/at）。
- 后续任何 schema 变更必须走同一框架：新增 `if (oldVersion < N)` 分支 + 数据回填 + fixture 测试；**禁止修改或删除已发布版本的迁移分支**。

## Next exact action

Phase 2 第一步（建议顺序）：

1. `npm install ts-fsrs`（MIT；将实际版本号记录到 CHECKPOINT/HANDOFF）。
2. 设计 Word 的 FSRS 字段（参照 `REFERENCE_RESEARCH.md` §1.1：stability/difficulty/state/reps/lapses/due 等），用现有迁移框架加 **v2→v3** 迁移 + fixture 测试（旧数据回填 FSRS 初值）。
3. 评分映射层：`classify()`（fluent/normal/vague/unknown）→ Again/Hard/Good/Easy；设置项暴露 `request_retention`（默认 0.9）。
4. 新调度接入 `quiz.ts` 的 answer 路径；保留 priority/弱词/混淆逻辑可用；回归测试全绿。
5. 之后继续 Phase 2 余项：Preview、lifecycle、多词池、Learning Value、forgotten reflow、动态新词量。

## Important warnings

1. **迁移只加不删**；任何 DB 版本改动必须带迁移测试；升级前提示备份。
2. 不复制 GPL-3.0 / AGPL-3.0 代码；Adopt 依赖按 `REFERENCE_RESEARCH.md §11` 引入并记录版本。
3. `src/*.ts`、`tests/*.ts` 变更后跑 `node docs/format-source.mjs`（保持紧凑格式）→ 再跑测试；注意该脚本会重写文件 mtime。
4. 源码改动后必须 `npm run build`（`server.mjs` 服务 `dist/`；dist 随提交更新）。
5. 不要把 API Key 写入日志/提交；备份始终剔除 Key。
6. 浏览器验证用 CDP 无头 Edge（Hermes 内置 browser_exec 不可用）。
7. 唯一根目录 `D:\英语重构训练\vocabulary-app`；禁止另起工程。
8. 阶段完成按 `AGENT_EXECUTION.md` §4：测试 → build → 更新五个状态文件 → commit。
