# HANDOFF — 当前状态（Phase 15h.1）

> **2026-10-28 更新（15h.1）**：语义标记与视觉状态收尾，分支 `phase15h1-semantics`（起点 `764e854`），
> tag `phase15h1-semantics`。`main` 仍不含任何 15 系列提交，**未合并**。功能层（DB v7 / FSRS /
> Planner / Diagnostics 算法）零改动，不升级 IndexedDB。
>
> 本轮只做三件事：给真实业务状态补语义钩子（`aria-pressed`、`role=status`、
> `data-verdict`、`data-quality`、`data-src`、`data-reported`、`data-state`、`data-band`…），
> 用**线型形状**而不是颜色表达证据强度，并用状态变化测试证明它们真的会变。
>
> 口径：`docs/PHASE15H_MARKUP_BACKLOG.md` 原始 39 条 → 去重 25 条 = 3 已修 + 14 本轮 + 2 部分 + 6 未修。
> 未修的每条都写明"为什么停"（要改业务流程 / 只有整篇 provenance / tabindex 属独立任务）。
>
> 验证：`tsc` 0 · `npm test` **386/386** · 真实浏览器 live-a11y **11/11**（0 异常、0 控制台错误）·
> 对比度 225/0 · 移动端 10/10×2 · CI run `40682596505` **success** · 86 张截图（42 张重拍）+ 4 张状态特写。
>
> **Phase 15 仍未标 completed**：用户尚未做视觉验收。

# HANDOFF — 当前状态（Phase 15h）

> **2026-10-27 更新（15h）**：UI 工作全在 `phase15h-full-ui-migration` 分支（起点 `6a550fe`），
> `main` 仍是功能基线 `514110a` + Phase 14 的旧 UI，**未合并**。功能层（DB v7 / FSRS / Task Executor /
> PWA / Backup）零改动。
> 本轮做的是**动效完整性**：共享元素只让任务容器飞（底板不缩放），转场中段的近黑经三路取证
> 判定为 headless screencast 丢层；同时修掉 loading 页裸露、反向转场选错容器、呼吸被旧
> IntersectionObserver 永久暂停三个真问题。材质改为窄镜面/宽柔透射/漫反射。
> 契约：`PRODUCT.md`（按 PROJECT_SPEC 重写为六能力面）、`DESIGN.md` v2；证据见
> `docs/PHASE15G_TRANSITION_FORENSICS.md`（取证）、`docs/PHASE15G_IMPLEMENTATION.md`、
> `docs/PHASE15G_TEST_REPORT.md`、`screenshots/phase15g/recording/`（9 段原始视频）。
> **Phase 15 未标 completed**：用户尚未做视觉验收（`STATE.next_task_id = await_user_visual_acceptance_phase15h`）。

# HANDOFF — 当前状态（Phase 14）

**本文件是唯一交接入口。** 本段优先于下方历史段落；与下方旧 Phase 12/13 内容冲突时，以本段和 `STATE.json` 为准。

## 1. 当前工程状态

| 项 | 值 |
| --- | --- |
| 根目录 | `D:\英语重构训练\vocabulary-app` |
| 分支 | `main` |
| 当前代码 HEAD | `514110a`（Phase 14 功能提交；pin 提交见 STATE） |
| DB 版本 | **v7**（Phase 14 无新 store、无迁移） |
| 单测 | **379/379 pass** |
| 类型/构建 | `tsc --noEmit` 0；生产构建通过；生产包测试钩子 grep 0 |
| Phase 14 E2E | **11/11**（origin 隔离、地址提示、备份往返、旧备份缺域、写入回滚、双标签锁） |
| PWA A→B | **7/7** |
| 离线真实动作 | **4/4** |
| Phase 13 离线 | **8/8**（新增构建指纹缓存检查） |
| 回归 | Phase 3–13 全部通过（21/36/44/26/31/33/34/19/20/16/16/17/18/20） |
| Phase 15a 视觉 | 已交付但**方向被否**（暖纸 + 鼠尾草 = Warm Minimalism）；保留其排版 / 任务层级 / 数据安全改进 |
| Phase 15b 视觉 | **待用户确认方向**：Cinematic Graphite（左上单光源、四类材质、方向性阴影、金属只做一处）；`npm test` 379/379、phase3 21/21、phase5 44/44、phase12 18/18、phase13 20/20、a11y 8 组 0 违规；24 张截图 + 8.8s 交互录屏；详见 `docs/PHASE15B_CINEMATIC.md` |
| Phase 15d 动态 | **待用户确认**：以 B 的空间为骨架重做 Today（`?proto=d`）。第二轮纠偏已交付：移动端 390/360 真实布局修复（截图 390×3521，设备模拟 10/10 + 桌面窄视口 10/10 审计 escapers=0）、Today→Training 改为真实容器变形（50 帧 / 748ms，无空白帧）、光影重写为「方向光 + 指针聚光 + 斜向高光条 + 上缘掠射 + 11s 呼吸」并删掉梯形探照灯/扫描线、主按钮弹簧 0.951→1.020→1.000、任务行整行可点且展开连续、浅色主题同套光具。379/379、phase3 21/21、phase12 18/18、phase13 20/20、对比度 4 组 0 违规、reduced-motion running=0、空闲 p50/p95=3.8/3.9ms 0 longtask。证据见 `docs/PHASE15D_DYNAMIC.md` §11 |
| Phase 15c 原型 | **待用户选型**：A·Obsidian Instrument（非对称仪表台/游标尺/竖向序列轨）与 B·Atmospheric Studio（体积光舞台/玻璃层/横向时间带）两套真实页面；`?proto=a\|b` 切换，默认仍是 15b；379/379、phase3 21/21、phase12 18/18、phase13 20/20、对比度 8 组 0 违规、无长任务；13.1s×2 录屏 + reduced-motion 证据；详见 `docs/PHASE15C_PROTOTYPES.md` |
| 远程 | `Huyaen/english-reconstruction-system`（Private）；功能点/tag `514110a` / `phase14-long-term-safety`；main 上另有 docs-only pin 提交，以 `git ls-remote` 为准 |

## 2. Phase 14 做了什么

1. **数据地址隔离**：新增 `src/origin.ts`；推荐 `http://localhost:4173`。`127.0.0.1:4173` 是另一个 origin，数据不共享；设置页显示当前/推荐地址和迁移风险，不自动跳转、不自动搬运。
2. **恢复事务原子性**：`replaceData()` 任何写入异常都显式 `tx.abort()`；测试证明中途失败后 books/words 原样保留。
3. **备份压力回归**：`tests/backupRoundtrip.test.ts` 覆盖 28 个数据域、240 词、嵌套 FSRS/sourceTypes/confusions、Key 剔除、重开数据库。
4. **长周期语义**：`tests/longitudinal.test.ts` 验证 D1/D7/D30 精确窗口、样本不足 `rate=null`、FSRS due 前进、周诊断幂等。
5. **PWA 更新门禁**：`scripts/stamp-sw.mjs` 把构建指纹写进 `CACHE = 'erv2-shell-v2-<hash>'`；CI 校验。A→B 实测：新缓存安装、旧缓存清理、数据保留、停服可开。
6. **离线真实动作**：断网前写入 6 词并完成一次真实词汇作答，停服刷新后记录 1→1。
7. **长会话观测**：80 轮页面循环，堆 +0.16 MB、DOM 142→142、JS 异常 0；明确是加速代理，不是 4 小时真实使用。

## 3. 验收命令

```bash
npm test
npx tsc --noEmit
npm run build                 # 末尾自动 node scripts/stamp-sw.mjs
grep -R "__planTest\|__examTest\|__inputTest" -n dist/assets/*.js | wc -l   # 必须 0

# test build + 4173 + 独立 Edge 9230
node scripts/phase13-smoke.mjs
node scripts/phase14-smoke.mjs
node scripts/phase14-long-session.mjs
node scripts/phase13-benchmark.mjs        # 独立 Edge 9233

# 独立 Edge 9240 / 9242；脚本自行起停 4190 / 4192
node scripts/phase14-pwa-upgrade.mjs
node scripts/phase14-offline-actions.mjs

# 独立 Edge 9231；脚本自行起停 4180
node scripts/offline-smoke.mjs
```

## 4. 未完成 / 不能声称通过

- 4 小时真实使用（只做 80 轮加速观测）；
- 真实存储配额耗尽（QuotaExceededError 未制造）；
- 真实断电 / 浏览器进程崩溃；
- 真实 iPhone / Android / 触控 / 软键盘；
- NVDA / VoiceOver / TalkBack 屏幕阅读器；
- 离线输出草稿续写（只测了离线词汇作答）；
- PWA 各平台安装提示/图标差异。

以上限制同时写入 `docs/PHASE14_LONG_TERM_SAFETY.md` 和 `CHANGELOG.md`，不得在交付报告中删掉。

## 5. 数据地址警告（必读）

日常只使用 **`http://localhost:4173`**。如果曾用 `127.0.0.1:4173`，那边的数据不会自动出现在 localhost。迁移必须由用户显式导出/导入，先保留备份，不清空旧地址。详见 `docs/ORIGIN_DATA_SAFETY.md`。

## 6. 下一步

`STATE.next_task_id = await_user_phase15_directive`。**不自动开始 Phase 15**；等待用户明确指示。

---

# 历史：Phase 12（已过时，仅供追溯）

**Phase 12（考试记录与分值一致性）已实现并完成本地验收；下一阶段由用户指定（`STATE.next_task_id = await_user_phase13_directive`）。**

## 1. 当前工程状态

| 项 | 值 |
| --- | --- |
| 根目录 | `D:\英语重构训练\vocabulary-app` |
| 分支 | `main` |
| DB 版本 | **v7**（Phase 12 只加 ExamLog 可选字段，无新 store） |
| 测试 | **351/351**（`npm test`） |
| 类型检查 | `tsc --noEmit` 0 error |
| 构建 | `npm run build` / `build:test` 通过；生产包测试钩子 0 |
| 浏览器验收 | Phase 12 **17/17**；Phase 11 16/16、10 16/16、9 20/20、8 34/34、interest 19/19、7 33/33、6 31/31、5.1 26/26、5 44/44、4 36/36、3 21/21 |
| 远程 | `Huyaen/english-reconstruction-system`（Private） |

## 2. Phase 12 关键文件

- `src/examLog.ts`：纯规则、校验、导出/导入、`sanitizeExamLog`。
- `src/examTypes.ts`：`ExamLogType` / `ExamLogScoreBasis` 与 ExamLog 可选字段。
- `src/examStore.ts`：写入边界校验，强制 self_reported/clueOnly/errorTypes=[]；`clearExamLogs()`。
- `src/examView.ts`：表单与记录卡片（来源、满分依据、冲突、线索）。
- `src/app.ts`：规格联动、冲突确认、编辑/删除、导出/导入、`__examTest` 扩展。
- `src/examDiagnostics.ts`：`exam.selfReportedLogs`。
- `tests/examLog.test.ts`、`tests/examIntegration.test.ts`。
- `scripts/phase12-smoke.mjs`（17 项）。
- `docs/PHASE12_EXAM_LOG.md`。

## 3. 数据与迁移

DB 仍 v7。旧 `ExamLog` 缺新字段时按“校内考试 / 年份未记 / 自定义满分 / self_reported”展示，**不推断真实年份**。完整备份与专用导出都会保留新字段；导入时逐条校验，越界分数拒绝。

## 4. 验收命令

```bash
npm test
npx tsc --noEmit -p tsconfig.json
npm run build
npm run build:test
node server.mjs --dir=dist-test --port=4173
SMOKE_PORT=9230 node scripts/phase12-smoke.mjs
SMOKE_PORT=9230 node scripts/phase11-smoke.mjs
```

## 5. 诚实边界

学校考试记录是用户自报，系统不验证原始试卷或学校评分；“阅读时间不够”等自评只作线索，不升级为已验证错因；旧记录缺少年份时不猜；2028 规格总分仍未公布，不能因绑定规格就宣称 115+35。

## 6. 交付记录

- 功能 commit：`a4e7dcb`（feat(exam): Phase 12…）。
- tag：`phase12-exam-log` → `a4e7dcb`。
- CI：`39967369661` success（feature commit）。
- 远端 `main` HEAD 必须与本地一致后才算交付完成。

---

# Phase 12 Full Integration 交接（2026-10-23）

## 1. 当前状态

- 分支 `main`；DB **v7**；Phase 0–12 全部交付。
- 本轮新增 `src/taskExecutor.ts`：Today 计划任务 → 模块/可执行性/证据的唯一判定层。
- 六类任务：vocabulary / sentence / reading / input / output / exam；未知模块返回 `unsupported`，不回退词汇。
- 计划任务启动时写 `started` 并绑定领域会话（`dailyPlanTaskId` / `planTaskId`）；完成必须由领域证据写回，按钮不能直接 done。
- Regenerate 保留 done 与 started；刷新恢复；无材料/考试未开启显示 unavailable。
- 验收：360/360 单测、tsc 0、生产包钩子 0、phase12-full smoke 18/18、phase12 17/17、phase11 16/16、phase3–10 回归全绿。

## 2. 关键文件

- `src/taskExecutor.ts`：`taskModule` / `taskUnavailableReason` / `taskEvidence` / `nextOpenTask` / `completedTaskCount`。
- `src/app.ts`：`startPlanTask`、`completePlanTask`、Today UI、`__planTest`、各模块完成回调与 resume guard。
- `src/planner.ts`：input task 绑定 `targetSessionId`；`regenerateRemaining` 合并 done/started。
- `src/inputSession.ts` / `src/examSession.ts` / `src/types.ts`：绑定字段。
- `src/inputView.ts`：冷测 skipped 后显示结果态。
- `src/diagnosticsCollect.ts` / `src/diagnosticsInsight.ts`：不完整阅读会话的空数组保护。
- `tests/taskExecutor.test.ts`、`tests/planner.test.ts`。
- `scripts/phase12-full-smoke.mjs`、`docs/PHASE12_FULL_INTEGRATION.md`。

## 3. 验收命令

```bash
npm test
npx tsc --noEmit -p tsconfig.json
npm run build
npm run build:test
node server.mjs --dir=dist-test --port=4173
SMOKE_PORT=9230 node scripts/phase12-full-smoke.mjs
SMOKE_PORT=9230 node scripts/phase12-smoke.mjs
SMOKE_PORT=9230 node scripts/phase11-smoke.mjs
```

## 4. 诚实边界

完成输入/阅读/表达只代表接触或产出记录，不等于词汇掌握；考试完成只是迁移证据，不是英语总分；AI 生成材料不作为 Anchor 或完成证据；考试任务默认关闭。

## 7. 交付记录

- 功能 commit：`e0c5cd1`（feat(integration): unify Today plan execution on evidence）。
- tag：`phase12-full-integration` → `e0c5cd1`（已推送）。
- CI：`39983209902` success。
- 远端 `main` HEAD 与 tag SHA 均为 `e0c5cd137814d3543bacb18d9288ee9848b1e6dd`。


---

# Phase 13 交接（2026-10-24）

## 1. 当前状态

- 分支 `main`；DB **v7**；Phase 0–13 全部交付，下一阶段等用户明确指示。
- Phase 13 只做稳定性、安全、性能、离线与发布准备，不重写已验收学习模型。
- 单测 **368/368**；tsc 0；生产构建无测试钩子；Phase 13 smoke **20/20**；生产离线 **7/7**；Phase 3–12 回归全绿。

## 2. 关键交付

- `src/integrity.ts`：只读完整性审计。重复 id、坏时间戳、完成态缺证据记 error；孤儿引用记 warning；不修复、不迁移、不改数据。
- `src/app.ts`：设置页完整性检查（只读展示前 12 条）；`reportRuntimeError` + `fatalStartup`；PWA 注册；恢复备份时的审计提示；测试种子补齐阅读完成时间。
- `src/readingAnalytics.ts` / `readingView.ts`：旧阅读会话缺 marks/evidence/difficultSentences/helps 时不崩溃。
- `src/planner.ts`：retention 不可得时也把 calibrate 事件写入 `taskActions`（Phase 3 回归）。
- `server.mjs`：GET/HEAD、400/405/403、安全响应头、防路径穿越、不泄露路径。
- `public/sw.js`（`erv2-shell-v2`）、manifest、icon、`index.html`：只缓存同源外壳；生产才注册；升级时清理旧外壳缓存。
- `scripts/phase13-smoke.mjs`（别名 `phase13-hardening-smoke.mjs`）：真实 UI 六域旅程，20 项。
- `scripts/offline-smoke.mjs`：生产包停服后离线打开，7 项。
- `scripts/phase13-benchmark.mjs`：A/C/D 合成数据性能基准。
- `docs/PHASE13_HARDENING.md`：完整规格、验收映射与边界。

## 3. 验收命令

```bash
npm test
npx tsc --noEmit -p tsconfig.json
npm run build
npm run build:test
# 独立 profile 无头 Edge CDP 9230 / 4173
node scripts/phase13-smoke.mjs
# 独立 profile 无头 Edge CDP 9231 / 4180（脚本自行起停 4180）
node scripts/offline-smoke.mjs
```

## 4. 诚实边界

- 性能为 synthetic，不代表真实长期数据或真实手机。
- 未做真实 iPhone Safari、真实供应商 AI、真实 OCR 失败硬件验收。
- 离线只覆盖同源静态外壳；AI、OCR 首次模型、外部链接不在范围内。
- 浏览器级 IndexedDB 事务故障注入与存储配额耗尽未单独模拟；有单元级保护。

## 5. 交付记录

- 功能 commit：`553a595` `feat(hardening): add integrity audit, offline shell and release gates`。
- tag：`phase13-hardening` → `553a595`。
- CI：`40003518308` success（feature commit）。
- 远端 `main` HEAD 必须与本地一致后才算交付完成；STATE pin 在后续提交。
