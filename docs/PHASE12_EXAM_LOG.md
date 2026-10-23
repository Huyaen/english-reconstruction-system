# Phase 12 — 考试记录与分值一致性（Exam Log Integration）

状态：**已交付**（2026-10-23）
范围：只扩展既有「考试迁移」的学校记录，不重写 Phase 11 的题库、会话、周测或诊断引擎。

## 1. 这轮解决的十个验收点

| # | 验收点 | 实现 |
| --- | --- | --- |
| 1 | 类别 / 适用年份 / 满分一致 | 记录可选绑定 `specId`；类别与年份由规格写入并锁定；未绑定规格时显式填类别和年份 |
| 2 | 已核验官方规格的分值冲突提示 | 官方确认总分与本次满分不同 → 阻止保存，必须勾选“这是自定义/校内计分”；记录卡保留冲突标记 |
| 3 | provisional / unknown 不得伪造官方分值 | 只有 `official_confirmed` 且有 `totalScore` 才预填满分；2028 等规格保持空，并提示“未知/待确认” |
| 4 | 支持校内 / 月考 / 模拟 / 自定义 | `examType = school_exam / monthly_exam / mock_exam / custom` |
| 5 | 自定义考试允许实际满分 | 满分是用户输入字段，不强制 150 或任何高考分值 |
| 6 | 0 ≤ 得分 ≤ 满分 | 纯函数校验 + `saveExamLog()` 写入闸门双重检查 |
| 7 | 自报成绩永远保留来源标记 | 写入时强制 `source='self_report'`、`scoreSource='self_reported'`、`clueOnly=true`；导出/导入/备份保留 |
| 8 | “阅读时间不够”等只作线索 | 存 `selfAssessment`，`errorTypes` 强制为空；UI 标“仅线索，不作已验证错因”；诊断另有 `exam.selfReportedLogs` 计数，不进入错因统计 |
| 9 | 保存/刷新/编辑/删除/导出/恢复保持完整 | 同 id 编辑保留 `createdAt`；完整备份与专用导出/导入均保留类别、年份、满分、类型、来源、满分依据 |
| 10 | Phase 12 Browser Smoke | `scripts/phase12-smoke.mjs`：17 项，覆盖类型、冲突、暂停确认、边界、编辑、删除、刷新、导出/导入、线索与诊断 |

## 2. 数据结构（additive，不升 DB 版本）

```ts
type ExamLogType = 'school_exam' | 'monthly_exam' | 'mock_exam' | 'custom';
type ExamLogScoreBasis = 'official_total' | 'custom_total';

interface ExamLog {
  // Phase 11 既有字段：id/date/name/examCategory/fullScore/reportedScore/
  // sectionResults/errorTypes/selfAssessment/source/createdAt
  examType?: ExamLogType;
  examName?: string;
  specId?: string | null;
  applicableYear?: number | null;
  scoreBasis?: ExamLogScoreBasis;
  conflictAcknowledged?: boolean;
  clueOnly?: boolean;
  scoreSource?: 'self_reported';
  updatedAt?: number;
}
```

旧记录缺新字段时按“校内考试 / 年份未记 / 自定义满分 / self_reported”展示，不推断未知年份，也不改写旧数据。DB 仍为 **v7**，因为只增加可选字段，没有新增 store。

## 3. 分值一致性规则（`src/examLog.ts`）

1. 规格状态 `official_confirmed` 且 `totalScore` 非空 → 只在这种情况下预填官方满分。
2. 本次满分 ≠ 官方确认总分 → `blockedConflict=true`，保存被拒，直到用户勾选确认；保存后 `scoreBasis='custom_total'`。
3. 规格为 `provisional` / `historical_reference` / `unknown` → 从不预填；即使参考总分存在也不称为官方；`scoreBasis='custom_total'`。
4. `totalScore=null`（2028）→ 不显示任何默认满分，只提示“未知/待确认”。
5. 绑定规格时 `examCategory` 与 `applicableYear` 必须等于规格值；不绑定规格时二者由用户填写并有范围校验。
6. `fullScore > 0` 且 `0 ≤ reportedScore ≤ fullScore`，否则 UI 拒绝、store 也抛错。

`official_total` 只表示“本次满分与官方确认总分相同”，不表示本次成绩是官方分数。

## 4. 线索与诊断边界

- `selfAssessment` 是自由文本线索（例：阅读时间不够），保存时与 `errorTypes: []` 一起写入；不产生 item 级错误，不进入 `examErrorCategoryCounts()`。
- 诊断新增 `exam.selfReportedLogs`（kind=count，quality=task-behavior），只报告自报记录条数；不计算正确率、不预测官方分。
- `exam.officialScoreEstimate` 仍固定 `value=null`，保持不可计算。
- 考试记录卡显示“来源：self_reported（学生自报，未经系统核验）”；自评标注“仅线索，不作已验证错因”。

## 5. 导出 / 恢复

- 专用导出：`{ schema:'erv2-exam-logs', version:1, exportedAt, logs }`；字段原样保留。
- 导入：逐条经 `sanitizeExamLog()` 校验；越界分数、缺字段、未知规格会被拒绝并计数，不会伪造来源。
- 完整备份：`examLogs` store 随 `backup()` / `validateBackup()` 往返；集成测试断言类别、年份、满分、类型、来源、`clueOnly` 全部保留。
- 删除只删指定 id；编辑写回同一 id，`createdAt` 不变，`updatedAt` 更新。

## 6. 验收

```bash
npm test                                        # 351/351
npx tsc --noEmit -p tsconfig.json               # 0
npm run build:test
node server.mjs --dir=dist-test --port=4173
SMOKE_PORT=9230 node scripts/phase12-smoke.mjs  # 17/17
```

Phase 11 smoke 仍为 16/16；phase3–phase10 回归全绿；生产包 `__examTest` / `ERV2_TEST_HOOKS` 命中 0。

## 7. 明确不做

- 不把校内分数换算成高考 150 分制。
- 不根据自报分数推断掌握度、排名或下次成绩。
- 不把“阅读时间不够”自动转成 `time_pressure` 已验证错因。
- 不因绑定 2028 规格就宣称 2028 使用 115+35。
