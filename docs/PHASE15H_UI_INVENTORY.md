# Phase 15h · 全站 UI Inventory

基线：`phase15g-motion-integrity` / `6a550fe`。本清单不是按侧栏猜的，而是把 `src/app.ts`（5,252 行）与 15 个视图模块逐个读完、再在真实浏览器里点一遍得到的。

- 入口：`src/app.ts` → `shell()` 生成外壳，`paint()` 按 `page` 分派到见下表函数。
- 页面身份：`applyPageChrome(page)` 把 `data-page` 与 `data-level` 写到 `<html>`，`src/ui/system.css` 依此分配视觉强度。
- 等级：**A** 表现型（光影与纵深最强）、**B** 交互型（按压/选中/收放）、**C** 专注与管理型（正文稳定、可读性优先）。

---

## 1. 页面总表

| # | 页面 | nav id | 等级 | 渲染入口 | 主要代码 | 现有问题（迁移前实测） |
|---|---|---|---|---|---|---|
| 1 | 今日学习 | `home` | A | `home()` / `todaySection()` | `app.ts:373`, `protoToday.ts`, `planner.ts`, `cinematic15d.css` | 15f/15g 已是新语言；与其余页面脱节，导航进场无空间连续 |
| 2 | 我的词库 | `books` | B | `library(false)` + `drawTable()` | `app.ts:755/782` | 工具栏三行堆叠；表头过暗；空表无行动入口；`预览新词` 在没有新词时仍可点 |
| 3 | 薄弱词 | `weak` | B | `library(true)` | `app.ts:755` | 与词库同一套表格，缺少"为什么薄弱"的证据层 |
| 4 | 句子训练 | `sentence` | B | `sentencePage()` | `sentenceLab.ts`, `sentenceStructure.ts` | 结构分析与选项挤在一列；正误只靠颜色；提示是纯文本 |
| 5 | 阅读 | `reading` | C | `readingPage()` + `readingView.ts` | `readingView.ts`, `readingSession.ts`, `readingImport.ts` | 正文与侧栏竞争注意力；导入/OCR 步骤像表单；标记工具漂浮 |
| 6 | 真实输入 | `input` | B | `inputPageApp()` | `inputView.ts`, `inputSession.ts` | 来源、字幕、会话混在一屏；自评与验证数据视觉上不可区分 |
| 7 | 真实表达 | `output` | C | `outputPageApp()` | `outputView.ts`, `outputActions.ts`, `outputFeedback.ts` | 编辑器背景有动效残留；自动保存状态不显眼；反馈与草稿争空间 |
| 8 | 语法图谱 | `grammar` | B | `grammarPage()` | `grammar.ts` | 概念卡是同质卡片墙；依赖关系不可见；掌握证据埋在详情里 |
| 9 | 主题单元 | `unit` | A | `unitPageApp()` | `miniUnitView.ts`, `miniUnit.ts`, `miniUnitProgression.ts` | 阶段进度无仪式感；阶段之间没有连续性 |
| 10 | 学情诊断 | `diagnostics` | A | `diagnosticsPageApp()` | `diagnosticsView.ts`, `diagnosticsCollect.ts` | 证据来源不可辨；空样本与 0 分不清；比较行是纯文字 |
| 11 | 考试迁移 | `exam` | B | `examPageApp()` | `examView.ts`, `examSpecification.ts` | 官方/自编题徽章对比弱；学校成绩像系统数据 |
| 12 | 学习统计 | `stats` | A | `statistics()` + `drawTrend()` | `app.ts:1769/1770` | 柱状图无基线/网格；空日期与 0 次不可分 |
| 13 | AI 学情 | `ai` | C | `aiPage()` | `aiProvider.ts`, `aiValidate.ts` | AI 结果与已验证表现使用同一视觉重量 |
| 14 | 设置与备份 | `settings` | C | `settingsPage()` | `app.ts:1806`, `db.ts` | 危险操作不够醒目；表单是原生控件堆 |

## 2. 子状态清单（必须一并迁移）

| 页面 | 子状态 | 入口 | 代码 |
|---|---|---|---|
| 训练 | 新词 Preview / 熟悉度四选 | `startPreview()` | `app.ts:480` |
| 训练 | Recall 答题、判分反馈、暂停、超时 | `showQuestion/submit` | `app.ts:584/626` |
| 训练 | 本轮结果（指标 + 弱词分组） | `showResults()` | `app.ts:728` |
| 训练 | Preview 完成 / 可续做 | `previewDone()` | `app.ts:501` |
| 词库 | 单词详情、编辑、导出对话框 | `wordDetail()` / `exportDialog()` | `app.ts:784/804` |
| 词库 | 导入（文件 / 粘贴 / 预览 / 错误列表 / 确认） | `importDialog()` | `app.ts:805` |
| 词库 | 删除词书确认 | `deleteBookDialog()` | `app.ts:850` |
| 词库 | 分页、空结果、筛选无匹配 | `drawTable()` | `app.ts:782` |
| 阅读 | 词库列表 / 导入 / OCR 进度 / 冷读 / 重读 / 标词 / 难句 / 辅助面板 / 结果 | `readingView.ts` | 同 |
| 输入 | 来源新增、字幕抓取、会话步骤、难度自评、记录 | `inputView.ts` | 同 |
| 表达 | 任务选择、草稿、脚手架、修改、反馈、迁移练习、完成记录 | `outputView.ts` | 同 |
| 语法 | 概念列表、概念详情、依赖、证据、练习入口 | `grammar.ts` | 同 |
| 单元 | 概览、Anchor/Reinforcement/Transfer/Assessment、阶段完成 | `miniUnitView.ts` | 同 |
| 诊断 | 能力概览、证据质量、保持率、域比较、快照历史、周诊断、短板、建议 | `diagnosticsView.ts` | 同 |
| 考试 | 概览、练习、周测、作答、错因归因、学校记录、规格审计 | `examView.ts` | 同 |
| 统计 | 7/30 天趋势、方向表现、掌握分布、逐日表 | `app.ts:1769` | 同 |
| AI | Provider 配置、生成、结果、失败/降级 | `aiPage()` | `app.ts:1771` |
| 设置 | 主题、调度、模型、数据地址、导出、导入、完整性审计、危险确认 | `settingsPage()` | `app.ts:1806` |
| 全局 | 弹窗、Toast、空态、加载、错误、禁用、确认 | `modal()`/`toast()` | `app.ts` |

## 3. 技术与复用约束

- 视图层是**字符串模板 + 事件委托**，没有框架；本次迁移不引入 React/Vue。
- 全站样式分层：`tokens.css` → `style.css`（14 页旧样式）→ 15a–15g 原型层 → **`src/ui/system.css`（新权威层）** → `src/ui/pages/*.css`（分页增量）。
- 通用原语（面板/按钮/输入/表格/徽章/空态/加载/弹窗/Toast）统一在 `system.css`，分页样式只写布局与页面专属语义。
- 动效只允许 `transform` / `opacity` / `filter`（有限）；`prefers-reduced-motion` 下全部退化为即时。

## 4. 必须保留的功能行为（逐页验收时逐条核对）

1. FSRS 调度、Preview→Recall 阶段、`answer()` 证据写入不被动画延迟（判分与保存同步完成后才显示反馈）。
2. Task Executor 依据真实证据完成任务；Planner 不生成重复任务。
3. 阅读证据（会话、标记、难句、辅助层级）不丢失。
4. Output 自动保存、revision 冲突提示、刷新恢复；输入期间不重绘编辑器。
5. Exam Session 可恢复；学校成绩标 `self-reported`；自编题不冒充真题。
6. Diagnostics 不伪造能力：空样本显示 `—`，自评/推断/AI 与已验证数据视觉可分。
7. 备份导出/导入/恢复、Origin Isolation、PWA 离线外壳。
8. DB 保持 v7，不新增 Store，不改持久化结构。

## 5. 验收方法

| 层 | 方法 | 证据 |
|---|---|---|
| 结构 | 逐页读源码 + 浏览器点一遍，记录真实 class 与入口 | 本文件第 1–2 节 |
| 视觉 | 1440×900 / 1920×1080 / 1366×768 × 深/浅主题截图 | `screenshots/phase15h/` |
| 交互 | 16 条流程逐帧/截图链路 | `screenshots/phase15h/flows/` |
| 回归 | `npm test`（379+）、`tsc`、生产构建、对比度、移动端、性能 | `docs/PHASE15H_TEST_REPORT.md` |
| 无障碍 | 对比度、焦点顺序、键盘可用、错误非仅颜色 | `accesslint` 与自建探针 |
