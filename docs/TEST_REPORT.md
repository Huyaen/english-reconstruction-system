# 交付验收报告

## 实际执行

- Node 24.19.0，npm依赖安装成功。
- `npm run build`：TypeScript无错误，Vite生产构建成功。
- `npm test`：20项测试，20通过，0失败。
- 预览服务实际启动成功，但浏览器访问被环境拒绝（ERR_BLOCKED_BY_CLIENT），未完成实际浏览器UI和控制台验收。没有切换到其他浏览器控制渠道绕过限制。

## 自动测试覆盖

1. 反应时间阈值边界、错误/超时分类。
2. 提前重复不提高长期熟练度、不延后due。
3. 双向间隔成功拉长周期，失败重置。
4. 选项唯一、相同释义排除、选项不足错误。
5. TXT空行、重复、坏行、中文多释义。
6. CSV引号、字段内逗号、中文字段名。
7. JSON字段别名、非法JSON。
8. 实际XLSX工作簿编码与解析。
9. 数据库关闭重开、坏备份不改变原始数据。
10. 完整备份剔除Key、引用完整性。
11. 不安全ID和非整数阶段拒绝。
12. 1万词导入、1000题4/6项引擎（压力项使用困难6选项）、逐题事务、备份清空恢复。
13. 错词最多回插一次、重复提交状态拒绝。
14. 初次快速答对不因暂列模糊而强制回插。
15. 今日次数与词条去重。
16. API地址规范、协议请求、返回文本读取（供应商响应使用测试替身）。
17. 应用DOM集成：粘贴导入、双击开始仅一个session、正确选择、提交期间导航保护、空格不知道、关闭重建后的记录恢复。
18. 应用DOM集成：保存设置、困难6选项、数字6和repeat按键过滤、暂停计时、超时、Enter继续、自定义62%比例保持。
19. 表单提交同步preventDefault，防止浏览器默认提交/刷新。

上述覆盖分布在20个test块中，DOM多个顺序步骤在同一集成测试里。

## 性能基准

最近一次完整测试：1万词解析与初始数据库写入约353毫秒；1000题算法、答案事务及后续备份/恢复约8685毫秒；最慢单题148毫秒（与DOM测试并行运行）。

使用fake-indexeddb，不代表真实浏览器IndexedDB延迟、内存、帧率。没有声称“真实浏览器1000题完全不卡”。

## 实际发现并修复

- 双击开始造成多个未完成训练：启动互斥。
- 首次秒答因累计状态暂列模糊而被回插：按本次速度而非累计状态决定回插。
- 答案保存过程中切换导航，异步回调覆盖新页面：提交期导航保护。
- 恢复备份可包含不安全ID及小数调度阶段：严格验证。
- 延迟调用事件处理使preventDefault失效：同步执行处理函数，再捕获Promise错误。
- 自定义方向比例在首页退回50%：添加当前自定义比例选项。

## 待在真实浏览器执行

- Windows Chrome/Edge启动成品；全部导航和控制台无异常。
- 通过文件选择器导入TXT、CSV、XLSX、JSON，验证中文编码与坏行预览。
- 英→中/中→英、1/2/3/4/5/6、快速连按、鼠标、双击、手动/自动下一题。
- 刷新、关闭重开、完整JSON下载后通过文件选择器恢复；恢复前导出原数据。
- 窄屏布局、深色、键盘焦点、200%文本放大。
- 真实浏览器下1000题延迟和大词书性能。
- 在设置填写有效AI服务后实际生成报告，检查CORS和供应商模型兼容性。

现有测试使用jsdom与fake-indexeddb，文件下载/选择器和真实布局不在这些替身能力内。

---

## Phase 3（Daily Planner）验证记录 · 2026-10-19

**规模**：`npm test` **69/69 pass / 0 fail**（Phase 2 原 39 例 + Phase 3 新增 30 例）。

| 套件 | 例数 | 覆盖 |
| --- | --- | --- |
| `tests/planner.test.ts` | 22 | 预算（20/30/45/60/自定义/非法/钳制）、状态三档、任务合同、capability gating、隔夜检测抽样与评估（去重/方向/低置信）、保留率 d1/d7、低保留与高到期负载的分配、到期口径复用、Preview→Recall 依赖、超时/提前完成的 ±30% 上限、Skip/Delay/Replace、跨日不积债、中断恢复四档、Closing Loop、确定性、regenerate 保留证据 |
| `tests/plannerStore.test.ts` | 6 | dailyPlans 读写、revision 并发保护（StalePlanError）、同日唯一、旧结构计划向后兼容、备份/恢复往返、刷新恢复 |
| `tests/plannerUi.test.ts` | 2 | 真实 DOM 流程：导入 → 生成计划 → 替换无候选拒绝 → Preview → Recall → Regenerate（保留已完成）→ Closing + 难度反馈 → 跳过收尾任务 → 刷新恢复不重复生成；预算校验与调整预算 |

**构建**：`npm run build` 成功 —— `dist/assets/index-DjucMzEh.js` 544.43 kB（gzip 187.93 kB）、`index-Ubj28ML1.css` 17.23 kB。bundle >500 kB 警告仍属已知 Phase 13 项。

**HTTP 运行时**：`node server.mjs` → `GET /` 200（535 B）、`GET /assets/index-DjucMzEh.js` 200（552,819 B）、`GET /assets/index-Ubj28ML1.css` 200（17,234 B）、`GET /missing.js` 404。

**真实浏览器**：无头 Edge 128（`--headless=new`，独立 profile `%LOCALAPPDATA%\Temp\edge-phase3-profile`，CDP 9224）运行 `scripts/phase3-smoke.mjs` → **20/20 通过**：

1. 应用启动；2. 词表导入 6 词；3. Capability Gate 在 UI 明示未上线模块；4. 生成今日计划（预算 30 分钟）；5. 任务顺序 Preview → Recall → Closing（末位）；6. 计划时长不超预算；7. Closing 使用真实词；8. 替换无同目标候选时明确拒绝；9. Preview 完成并落盘；10. Recall 完成并更新计划；11. Closing Loop 保存难度反馈；12. 计划落盘为完成态；13. 任务动作全带原因（start/complete/calibrate）；14. 刷新后恢复且不重复生成；15. 有昨日记录时生成隔夜检测任务；16. 隔夜检测完成并显示保留率（100.0% · 可信）；17. 隔夜结果触发计划校准；18. 断更后生成重新进入检测任务；19. Re-entry 使用真实词汇且在预算内；20. 无控制台未捕获错误。

**仍未在真实浏览器验收**：真机移动端布局/触控、长期大词库（数万词）性能、离线/PWA、真实 AI 供应商调用（需用户自填凭据）。

## Phase 4（Sentence & Grammar）验证记录 · 2026-10-19

**规模**：`npm test` **106/106 pass / 0 fail**（Phase 3 的 69 + Phase 4 新增 37：grammar 7 / sentenceStructure 6 / sentenceLab 11 / sentenceSources 6 / sentenceSelection 6 / sentenceUi 2）。

**静态与构建**：`npx tsc --noEmit -p tsconfig.json` → 0 error；`npm run build` 成功（dist 与源码同步提交）。

**真实浏览器（无头 Edge 128 + CDP 9224，独立 profile）**：`node scripts/phase4-smoke.mjs` → **36/36 通过**
1. 句源诚实：句库明示 authored 教学句、「不会伪造」AI 句；12 条句均带 gold 结构与预教词
2. 训练：预教词可见；作答前选项不含成分解析（不泄露答案）；训练中不给整句翻译
3. 拆句：主语→谓语→从句→整句意义四步；结果页结构树逐词对齐原文（主句骨架 → 从句）
4. 证据：无提示全对 → `independent`；句子证据 + 每概念一条 grammarAttempt；概念后验上升；句库 usedCount +1
5. 迁移：换同结构新句 → 记录 `transferOf`；L3 看答案 → `exposed`，**所有概念 mastery 不变**
6. 图谱：自检通过（无环、无缺失先修）；证据不足时如实说明判定门槛（≥3 次且 p<60%）；概念详情有知识卡/真实证据/可跳训练句
7. 计划：今日计划含真实句任务（绑定真实句子 id、预算内、可开始并进入拆句）
8. 无控制台未捕获错误

**Phase 3 回归**：`node scripts/phase3-smoke.mjs` → **21/21 通过**（计划顺序/预算/Preview/Recall/Closing/跳过不滚存/刷新恢复/隔夜检测/Re-entry 均未被 Phase 4 破坏）。

**新增测试文件**：`tests/grammar.test.ts`、`tests/sentenceStructure.test.ts`、`tests/sentenceLab.test.ts`、`tests/sentenceSources.test.ts`、`tests/sentenceSelection.test.ts`、`tests/sentenceUi.test.ts`（jsdom + fake-indexeddb 全流程：拆句 → 反馈/JIT → 独立证据 → 迁移 → 看答案不计掌握 → 语法图谱 → 计划内句任务回写）。

## Phase 5（Reading Lab）验证记录 · 2026-10-19

命令与结果（全部实跑，非推断）：

| 项目 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npx tsc --noEmit -p tsconfig.json` | 0 error |
| 全量测试 | `npm test` | **134 tests / 134 pass / 0 fail** |
| 生产构建 | `npm run build` | 成功；`dist` 无 `__readTest`/`__labTest` |
| 测试构建 | `npm run build:test` | 成功；`dist-test` 含测试钩子（仅 `?test=1` 且测试构建时可用） |
| 浏览器验收（阅读） | `node scripts/phase5-smoke.mjs` | **44/44**（dist-test + 无头 Edge/CDP，独立 profile） |
| 回归 | `node scripts/phase4-smoke.mjs` | **36/36** |
| 回归 | `node scripts/phase3-smoke.mjs` | **21/21** |

Phase 5 新增用例（28）：

- `tests/readingCore.test.ts`（14）：无损规范化；段落/句子 span 与缩写、小数点边界；词元 span 无损还原（标点不丢）；内容指纹；导入校验（空/太短/太长/纯符号，含 `allowShort` 出口）；文件类型边界（TXT/MD/HTML 可解析，DOCX/PNG 明确拒绝）；URL 安全边界与失败分类（CORS/超时/登录墙/付费墙）；OCR 能力探测与人工确认门禁；重复导入检测与 Passage 映射；难度四分类（no-evidence 单列、语法薄弱抬高难度）；证据幂等键与自评置信度上限；explicit/estimated 生词率的分母与覆盖；学习候选分桶与待补释义。
- `tests/readingSession.test.ts`（13）：状态机顺序与阶段门控；分块不切断句子（超容差必须来自短段合并）；首读前不显示正文/译文、解释默认隐藏；标记替换式幂等、撤销留痕、证据随标记增减；辅助等级（L3 起算看过答案）；难句 provenance 只能是 heuristic/manual；首读与重读速度/理解度分开统计；证据幂等（重复提交不重复写入）；收尾镜像只统计真实数据；持久化（会话+接触+词汇单事务、可查询可续读）；阅读计划（无材料不排任务、未完成优先续读、低分才重读、预算不足不排）；阅读任务进今日计划且不超预算；结果页与生词页只呈现真实数据。
- `tests/readingUi.test.ts`（1 端到端）：jsdom + fake-indexeddb 全流程（导入 → 预览不泄露正文 → 冷读 → 首读标记 → 难句进拆句并回到原段落 → 重读逐段 → 全文 → 收尾 → 整理生词，含“无释义不入库”与“阅读只记接触”）。

真实浏览器 smoke（`scripts/phase5-smoke.mjs`，44 项）覆盖：测试钩子只在测试构建 + `?test=1` 存在；无材料时引导导入且计划中无阅读任务；导入落库（来源/指纹/段落句子）；预览不含正文；冷读后进入首读；逐词点击标记 + 障碍证据 + 侧栏列出；难句卡点类型；拆句“自动结构只记接触 + 回到阅读”入口；退出拆句回到同一段且标记仍在；重读真实计时并可逐段走完；两次自评分开；收尾 `completed`；结果页首读/重读速度并列；会话落库唯一且含标记/难句/重读起止/证据幂等；整理生词拒绝无释义入库、补释义后才入库且掌握证据为 0、exposure 来源为 `reading`。

## Phase 5.1 — 真实截图 OCR

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npx tsc --noEmit -p tsconfig.json` | 0 error |
| 单元/集成 | `npm test` | **145/145 pass**（新增 `tests/ocr.test.ts` 11 例） |
| 生产构建 | `npm run build` | 通过；`__readTest`/`__labTest`/`__ocrTest`/`ERV2_TEST_HOOKS` 命中 **0** |
| 测试构建 | `npm run build:test` | 通过（含测试钩子） |
| 真实 OCR 验收 | `SMOKE_PORT=9225 node scripts/phase5-1-ocr-smoke.mjs` | **26/26 PASS**（真实截图 784 字符、置信度 95%、6.8s；0 上传） |
| 旧模块回归 | `phase5/phase4/phase3 smoke` | **44/44 · 36/36 · 21/21** |

## Phase 6 — Reinforcement AI

| 项 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npx tsc --noEmit -p tsconfig.json` | 0 error |
| 单元/集成 | `npm test` | **176/176 pass**（新增 31 例：Provider 13 / 结构化 8 / 生成编排 10） |
| 生产构建 | `npm run build` | 通过；测试钩子命中 0 |
| 测试构建 | `npm run build:test` | 通过 |
| 真实浏览器验收 | `SMOKE_PORT=9226 node scripts/phase6-smoke.mjs` | **31/31 PASS** |
| 回归 | Phase 5.1 OCR / Phase 5 / Phase 4 / Phase 3 | **26/26 · 44/44 · 36/36 · 21/21** |
| 真实供应商 | — | **未验收**（无凭据）：mock 仅验证协议；真实 E2E 需用户 Key 后按文档复验 |
