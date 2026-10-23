# HANDOFF — Phase 11 → Phase 12（2026-10-23）

**Phase 11（考试迁移与统一测评）已实现并完成本地验收；提交/推送/CI 见 §6。下一阶段由用户指定（`STATE.next_task_id = await_user_phase12_directive`）。**

## 1. 当前工程状态

| 项 | 值 |
| --- | --- |
| 根目录 | `D:\英语重构训练\vocabulary-app` |
| 分支 | `main` |
| DB 版本 | **v7**（新增 5 个考试域 store，additive） |
| 测试 | **344/344**（`npm test`） |
| 类型检查 | `tsc --noEmit` 0 error |
| 构建 | `npm run build` / `build:test` 通过；生产包测试钩子 0 |
| 浏览器验收 | Phase 11 **16/16**；Phase 10 16/16、9 20/20、8 34/34、interest 19/19、7 33/33、6 31/31、5.1 26/26、5 44/44、4 36/36、3 21/21 |
| 远程 | `Huyaen/english-reconstruction-system`（Private） |

## 2. Phase 11 关键文件

- `src/examTypes.ts`：规格/题目/会话/错因/日志/周报类型。
- `src/examSpecification.ts`：内置规格、校验、状态标签；2026 confirmed，2028 provisional/null。
- `src/examItems.ts`：题目契约、题库校验、客观可评分判断。
- `src/examSeed.ts`：项目自编材料与题（`authored` / `project-authored` / `other`，非真题）。
- `src/examSession.ts`：状态机、自动保存、revision、评分门。
- `src/examErrors.ts`：六类错因 + 二级 + 置信度 + 用户修正。
- `src/examStore.ts`：DB 读写、幂等种子、revision 冲突、清空会话（仅测试钩子）。
- `src/examPlanner.ts` / `src/weeklyAssessment.ts`：考试计划、周测构建/报告、迁移新题。
- `src/examDiagnostics.ts`：exam 域指标。
- `src/examView.ts`：概览/练习/会话/结果/周测/日志/规格审计 HTML。
- `src/app.ts`：导航「考试迁移」、页面动作、`__examTest`（仅测试构建）。
- `docs/PHASE11_EXAM_TRANSFER.md`、`docs/PHASE11_RESEARCH.md`。

## 3. 数据与迁移

`DB_VERSION=7`；新 store：`examSpecifications`、`examMaterials`、`examItems`、`examSessions`、`examLogs`。升级只创建缺失 store，不重写旧记录；`validateBackup` 接受 v1–v7；内置题按稳定 ID 幂等覆盖，用户记录不覆盖。

## 4. 验收命令

```bash
npm test
npx tsc --noEmit -p tsconfig.json
npm run build
npm run build:test
node server.mjs --dir=dist-test --port=4173
# headless Edge CDP 9230，独立 profile
SMOKE_PORT=9230 node scripts/phase11-smoke.mjs
```

生产包必须确认 `__examTest` / `ERV2_TEST_HOOKS` 命中 0。

## 5. 诚实边界

题库是项目自编，不是官方真题；2028 规则未发布，所有分值/时长保持未知；听力无音频、口语不自动评分；周测阅读只要求主旨+依据，不伪造选择题；学校分数是自报；考试诊断指标不能单独证明迁移完成。

## 6. 交付记录（提交后回填）

- 功能 commit：`77e5396`（feat(exam): Phase 11…）。
- tag：`phase11-exam-transfer`。
- CI：`39950992136` success（feature commit）。
- tag：`phase11-exam-transfer` → `77e5396`；远端 `main` 已核对一致。
