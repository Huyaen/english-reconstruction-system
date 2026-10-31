# HANDOFF — 当前状态（Phase 16.1）

> **2026-10-31 更新（Phase 16.1 文案残留修复）**：分支 `phase16.1-copy-polish`
> （起点 Phase 16 `phase16-ux-writing` @ `9e281cc`）。`main` 仍 `9de8acd`，**未合并**。
>
> 依据独立审计（P0 0 / P1 16 / P2 12，`C:\Users\86152\Documents\ERV2-phase16-audit\`）：
> 16 项 P1 全部处理（14 改写 / 2 保留 + 解释），12 项 P2 全部处理，另修 9 处同类残留。
> 内部原因代码、状态枚举、开发阶段号、英文标题、未解释的优先级字母不再出现在界面上。
> 学习语义零改动：枚举存储值、IndexedDB v7、FSRS、Planner、评分、AI 协议、用户数据、
> 学习材料与题干全部未动。
>
> 验证：`tsc` 0；`npm test` **407/407**（新增 9 条防回归）；`build` / `build:test` 0；
> 静态文案检测 101 文件 / **0 命中**；真实 DOM 检测 39 状态 / 38 下拉 / **0 命中**；
> 排版回归 84 视图（1366/1440/1920 × 深浅）/ **0 裁切 / 0 溢出**；15h.4 页面状态同步 14/14。
> 证据：`screenshots/phase16_1/`（56 张）+ `docs/PHASE16_1_COPY_FIX_REPORT.md`。
> 视觉审美仍未由用户确认。
> **2026-10-30 更新（Phase 16）**：全站界面文案重写。分支 `phase16-ux-writing`
> （起点 15h.4 `phase15h4-quiz-state-hotfix` @ `e293ef4`）。`main` 仍 `9de8acd`，**未合并**；
> 15h.1–15h.4 的 tag 均未移动。
>
> 做了什么：把应用里所有用户能看到的字——页面标题、按钮、说明、空状态、错误、toast、对话框、
> 表头、表单标签、`aria-label`、`placeholder`——按「像一个懂行的朋友在说话」重写。
> 不去改学习材料（释义/例句/原文/题干）、学习算法、IndexedDB v7、题目与评分、整体视觉系统。
>
> 双证据源：`screenshots/phase16/copy-inventory.json`（静态全量 4,737 条）+
> `copy-live-dark.json`（真实 DOM 20 个状态）。改后用同一套状态键重抓 dark/light，
> `copy-diff.json` 逐状态列出：消失 376 条、新增 366 条。
>
> 机器门禁：tsc 0、**398/398**、build 0、静态禁用词 112 文件 0 命中、真实 DOM dark/light 0 命中、
> 生产构建巡检 84 视图（14 页 × 3 宽度 × 2 主题）横向溢出 0 / 控制台报错 0、
> 对比度 225/0 ×2、live-a11y 11/11、mobile PASS、reduced-motion OK。
>
> 顺手修掉三处非文案问题：开发用原型切换器不再出现在上线页（只在 `?proto=` 时渲染）、
> 推荐理由徽标不再中英并排、对比度脚本改成等所有过渡结束后再采样（原先会把 `.d-quiet`
> 的主题过渡中间色当最终色，误报 2.25:1）。
>
> 规范与台账：`docs/PHASE16_UX_WRITING_GUIDE.md`、`docs/PHASE16_COPY_CHANGELOG.md`、
> `docs/PHASE16_TEST_REPORT.md`。

# HANDOFF — 当前状态（Phase 15h.4）

> **2026-10-30 更新（15h.4）**：Quiz 页面状态同步 Hotfix。分支 `phase15h4-quiz-state-hotfix`
> （起点 `phase15h3-css-integrity` @ `691a97c`），tag `phase15h4-quiz-state-hotfix`。`main` 仍 `9de8acd`，
> **未合并**；`phase15h3-css-integrity` / `phase15h2-visual-qa` / `phase15h-full-ui` tag 均未移动。
>
> 根因：`page`（内部真值）与 `html[data-page]`（视觉真值）由**两条路径**维护 ——
> 只有 `render() → paint() → applyPageChrome()` 会写根属性，而 `quiz` / `preview-done` / `results`
> 三个会话页直接写 `#main`、从不走 `paint()`。于是「从词库直接训练」的根节点停在 `books`、
> 「预览完成」停在 `preview`、「结果页」停在上一页，所有页面级规则一起失效。
>
> 修复：新增唯一出口 `enterPage()`（内部 page + `data-page` + `data-level` + 页面纪元），
> 24 处 `page = 'x'` 全部改走它；`motion.ts` 拆出 `applyPageScope()`（只写属性，不重建观察器）；
> `preview-done` / `results` 在等级表里显式声明 b；`previewDone()` / `showResults()` 重建骨架；
> 三处异步收尾（取题、作答落盘、预览作答）在 `await` 后核对页面纪元，旧任务不再写回新页面。
>
> 证据：修复前 `data-page` = books/home/preview 且 quiz 规则 0/45 命中 → 修复后 = quiz/results/preview-done，
> quiz 规则 26–40/45、results 6/8；卡片 `max-width` 710 → 780px。真实浏览器 7 条业务路径 × 2 主题
> × 21 个检查点：不一致 0、等级不同步 0、失败 0、控制台错误 0；14 个侧栏入口 + 品牌键全一致。
> 门禁：`tsc` 0、`npm test` **398/398**（+3 条真实 jsdom 集成回归，已验证「改回旧代码 3 条全红」）、
> `build` 0、对比度 225/0 ×2、移动 PASS、live-a11y 11/11、Reduced Motion OK。
> 未覆盖：键盘逐键截图、hover/focus 像素级取证、headful 序列、计划任务入口的预览分支。
> 视觉验收仍未获得用户确认 —— **不得自行宣布 Phase 15 审美目标达成**。
> 文档：`docs/PHASE15H4_ROOT_CAUSE_AND_FIX.md`、`docs/PHASE15H4_TEST_REPORT.md`。

# HANDOFF — 当前状态（Phase 15h.3）

> **2026-10-29 更新（15h.3）**：CSS 作用域完整性 + 转场连续性收口。分支 `phase15h3-css-integrity`
> （起点 `phase15h2-visual-qa` @ `3ad4cc6`），tag `phase15h3-css-integrity`。`main` 仍 `9de8acd`，
> **未合并**；`phase15h-full-ui` tag 仍停在 `764e854`，未移动。DB v7 / FSRS / Planner / 算法零改动。
>
> 本轮三件事：
> 1. **177 条作用域写错的 CSS 规则**（182 个选择器）全部按文件批量合并作用域，修好并做视觉对照。
>    口径对账：176（Codex，仅页面层）= 144+16+15+1；177 = 176 + system.css 的深色按钮接触阴影；
>    顶层 170 / 嵌套 7。分类 A 55 / B 58 / C 0 / D 64（D 保留原因写在文档里）。
> 2. **转场"主内容消失"找到应用侧成分并修掉**：`p15-enter`（动 `<main>`）与 `p15-arrive`
>    （动子块）首帧都是 `opacity:0`，普通导航又不建旧页底板 → 主内容区裸露背景 141–270ms。
>    两条关键帧首帧改 `opacity:.72` 后，30 次运行（screencast + 独立截图各 15）空白 **0ms**。
>    旧录屏的 1.4s 空白仍是 CDP 停帧（本轮再次复现，1.1–1.4s 通道空洞，同期页面连续可读）。
> 3. **`living.ts` 真实监听器泄漏**：`bindTouchGlow` 每个元素挂一个 `window pointerup` 且从不移除，
>    30 次往返后从 1 涨到 31。改为全局单一监听 + 按下登记，修后 1/10/30 次往返恒为 1。
>
> 门禁：`tsc` 0、`npm test` **395/395**（+5 条真实 CSS/DOM 回归，已用 stash 验证"改回旧 CSS 会全红"）、
> `build` 0、对比度 225/0 ×2、移动 10/10 ×2、live-a11y 11/11、Reduced Motion OK。
> 未完成：quiz 训练态缺自动化截图；77 条已修规则在深层状态缺视觉证据；headful 独立窗口序列未补。
> 视觉验收仍未获得用户确认 —— **不得自行宣布 Phase 15 审美目标达成**。
> 文档：`docs/PHASE15H3_CSS_RULE_AUDIT.md`、`docs/PHASE15H3_NAVIGATION_EVIDENCE.md`、`docs/PHASE15H3_TEST_REPORT.md`。

# HANDOFF — 当前状态（Phase 15h.2）

> **2026-10-28 更新（15h.2）**：独立视觉验收的 P0/P1 收口，分支 `phase15h2-visual-qa`（起点 `b4e4b2d`），
> 提交 `9dd7a77`，tag `phase15h2-visual-qa`。`main` 仍 `9de8acd`，**未合并**；`phase15h-full-ui` tag
> 仍停在 `764e854`，未移动。DB v7 / FSRS / Planner / Diagnostics 算法零改动。
>
> 本轮结论：**视频里的"主内容消失"是录制链路缺陷，不是应用缺陷**——42 次导航逐帧采样
> `#main` 空壳 0ms；旧片是 CDP screencast 静止期停推、编码器重复转场中间态那一帧（最长 5.85s）。
> 采集脚本已加"停帧补采"，重录 15 段后帧空洞 0。同时修了三处真实 UI 缺陷：考试单选被全局
> `input{width:100%}` 撑到 893px、判题后选项被 `button[disabled]{opacity:.72}` 压到 2.72:1、
> 点选单选不出现整行选中态。诊断页"偏暗"是截图时机，截图脚本已改为稳定态门控。
>
> 另发现（本轮不修）：177 条页面级 CSS 规则因 `data-page` 在 `<html>` 上而从未命中，
> 启用等于视觉系统变更，需单独一轮。详见 `docs/PHASE15H2_FORENSICS.md` §4。

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
