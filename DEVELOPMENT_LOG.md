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

## 2026-10-04 — Phase 1 — Data Foundation

完成：DB v1→v2 versioned migration 框架（只加不删、逐版本分支、原子升级、meta 迁移记录、升级后 UI 提示）；14 个 Learning Model stores + 16 组索引；Word 三维能力/曝光/来源字段 + 默认值回填；备份 v2（兼容读入 v1、悬空引用拒绝）；Learning Model 查询层。
关键实现：src/db.ts（runMigration / withV2WordDefaults / normalizeData / validateBackup v1+v2 / indexSpecs）、src/types.ts（14 实体 + Word/Data 扩展）、src/core.ts（makeWord 补字段）、src/app.ts（boot 升级提示 + 删词书清理 wordExposures）、src/model.ts（新）、tests/migration.test.ts（新，5 个测试）。
测试：npm test **25 pass / 0 fail**（v1 fixture 迁移 100% 保留、重开幂等、v1 备份恢复、v2 往返与悬空引用拒绝、索引化查询）；npm run build 成功（dist JS 475.21 kB / gzip 164.36 kB）；node server.mjs 服务实测 200（新 hashed bundle）。
过程记录：初版冗余索引导致 fake-indexeddb 写放大（1000 题 8.7s→16.6s）→ 精简为复合索引（复合索引前缀等价）；TS2783（spread 覆盖默认值报错）→ 改为 ??= 赋值。

下一步：Phase 2 — Vocabulary V2（先 `npm install ts-fsrs`（MIT，记录版本）→ 设计 Word.fsrs 字段与 v2→v3 迁移 → 反应时间分类→FSRS Rating 映射 → 回归全绿）。

## 2026-10-04 — Phase 2 — Vocabulary V2

完成：ts-fsrs@5.4.2（MIT，`--save-exact`）经 `src/fsrs.ts` 适配层接入；DB v2→v3（Word.fsrs + previewResult 回填、fsrs.due 索引、串行回填修复并行游标竞态、backup v3 兼容 v1/v2）；多因素 Rating 映射（首次 Recall 封顶 Good；Easy 需秒答+streak+间隔证据）；Preview→Recall 强制（UNSEEN 拦截）；三维证据（recognition/activeRecall/productive + exposure/production API）；多词池（foundation/miniUnit/encountered/forgotten 优先回流；游标式配额修复重复选取）；Learning Value 确定性评分；动态新词量纯函数（供 Phase 3）。
关键实现：新增 src/fsrs.ts、src/evidence.ts、src/pools.ts；重写 db.ts 迁移框架（runBackfills 串行链 + 索引同步 + v3）；quiz.ts 接入 shadow 双算 + record.rating；model.ts/stats.ts 按调度权威取 due；app.ts 新增「今日新词」面板、Preview 会话、生命周期列、词详情三维/FSRS 展示、设置页调度引擎与目标保留率；types.ts Settings/Word/ReviewRecord 扩展。
测试：npm test **39 pass / 0 fail**（新增 fsrs 6、vocab 7、migration +1、ui 扩展；含 v1→v3 与 v2→v3 fixture、幂等、备份兼容/悬空拒绝、Preview 流程 DOM 断言）；npm run build 成功（511.74 kB / gzip 176.27 kB）；**真实浏览器 smoke（无头 Edge + CDP）通过**：导入→未预览拦截→Preview 8/8→Recall 作答→退出恢复→IDB v3/FSRS/rating 校验→reload 保留。
过程记录：并行游标回填互相覆盖（v2/v3）→ 串行游标链修复；pools fallback 重复选取 → 游标式消费修复；`#quit` 保存忙碌期点击被忽略 → smoke 脚本改为重试；TS2783/TS2352 类型修复。
下一步：Phase 3 — Daily Planner（直接调用 recommendedNewWordCount/buildNewWordQueue/effectiveDue；DailyPlan store 已就绪）。


## 2026-10-19 — 项目文档审计与 GitHub Sync 协议整合（离线文件操作，不是本地业务开发）

依据用户上传的 STATE/CHECKPOINT/HANDOFF/规格/README/TODO/package 文件，发现：Phase 3 尚为 planned，旧入口容易误触 Phase 0；STATE known_limitations 含非 FSRS 过期条目，TODO Phase 2 P1 重复未完成；此前只有本地 Git checkpoint，无远程 GitHub push 协议。

已生成新的文档候选包：产品规格增 GitHub 私有仓库隐私边界、执行规格增远程建立与 Task/Phase 同步、统一启动入口、Phase 3 验收细则和合并使用说明。未接入用户本机，未运行 npm test/build/浏览器/推送 GitHub；全部运行期验收须接手 Hermes 依原状态协议复验。

下一步：用本机最新 Git 事实三方对照合并此候选包，确认仓库 owner 与 Private 后执行 `infra_github_remote_001`；再续 `phase3_daily_planner_007` 或实际更靠后的任务。


## 2026-10-19 — 文档整合包合并 + GitHub Private Remote + Phase 3 Daily Planner

环境/恢复核查：HEAD=92f8ec1（clean）、无 origin remote、Phase 3 未开工；合并 2026-10-19 文档包（产品规格附录 C、AGENT_EXECUTION 的 GitHub Remote Sync Protocol、INITIAL_PROMPT 恢复优先、STATE/TODO/README/CHECKPOINT/HANDOFF 增补与纠错、docs/PHASE3_DAILY_PLANNER.md、START_HERMES.md），合并前副本存于 scratch。

基础设施 `infra_github_remote_001`：全历史 secrets 扫描（48 个跟踪文件 / 51 个历史文件名，0 命中）→ 创建 GitHub **Private** 仓库 `Huyaen/english-reconstruction-system` → 推送 main 与 3 个阶段 tag → `git ls-remote` 与 API 双重复核 SHA 一致、`private=true`；`STATE.remote_sync` 记为 verified。

Phase 3 Daily Planner：新增 `src/planner.ts`（确定性领域引擎）、`src/plannerStore.ts`（revision 并发保护持久化）、`tests/planner.test.ts` / `plannerStore.test.ts` / `plannerUi.test.ts`、`scripts/phase3-smoke.mjs`；`src/app.ts` 加入 Today 主入口（时间预算 → 状态 → 隔夜检测 → 计划 → Start/Skip/Delay/Replace → Closing Loop → Regenerate 未完成部分）；`src/types.ts` 把 PlanItem 扩为统一 Task Contract（可选字段，向后兼容，DB 版本不变）。

测试：npm test **69/69**（原 39 + 22 + 6 + 2）；npm run build 成功（544.43 kB / gzip 187.93 kB）；HTTP 实测 200/404；真实浏览器 smoke（无头 Edge + CDP，独立 profile）**20/20**，含昨日隔夜检测（保留率 100%，触发校准）、断更 5 天 Re-entry、刷新恢复与无控制台错误。

过程记录：计划时长必须 ≤ 预算（Closing/Recall/Re-entry 同预算）→ 生成后用 `trimToBudget` 收缩柔性任务兜底；`touch()` 不再自增 revision（revision 由持久化层统一递增，避免与 DB 分叉）；跳过/替换后的任务不再显示可执行按钮（避免当天出现"已完成但仍可开始"的假状态）；收尾用词在无今日记录时回退到今日新词（不凭空造词）；UI 测试发现 regenerate 会在剩余预算内补入弱词任务 → 属于预期行为，改为"跳过并验证不滚存"。

下一步：Phase 4 Sentence & Grammar（Planner 通过 typed capability 接口接入，不重写计划器）。

## 2026-10-19 — Phase 4 Sentence & Grammar

新增：`src/grammar.ts`（34 概念显式图谱 + 先修边校验 + BKT-lite + 弱项信号 + 知识卡）、`src/sentenceStructure.ts`（结构表示与严格校验）、`src/sentenceSources.ts`（句源契约：12 条 authored 教学句 + gold 结构 + 中文预教词）、`src/sentenceLab.ts`（L0–L4 引导式拆句 + 即时反馈 + 迁移）、`src/sentenceEvidence.ts`（幂等证据 + JIT 卡）、`src/sentenceSelection.ts`（多维难度 + 自适应选句 + Planner 句任务描述）、`src/sentenceGraphMap.ts`、`src/sentenceStore.ts`。

修改：`src/types.ts`（Phase 4 类型 + `Data.sentences` + `glossary`）、`src/db.ts`（**v4 additive**：`sentences` store + `grammarTags` multiEntry 索引 + 备份校验）、`src/planner.ts`（capability gate 打开 sentence + `makeTask` 载荷）、`src/app.ts`（句子页 / 拆句页 / 语法图谱页 / 计划内句任务 + `?test=1` 测试钩子）、`src/style.css`。

测试：`npx tsc --noEmit` 0 error；`npm test` **106/106**（Phase 3 的 69 + 新增 grammar 7 / sentenceStructure 6 / sentenceLab 11 / sentenceSources 6 / sentenceSelection 6 / sentenceUi 2）；`npm run build` 成功；`node scripts/phase4-smoke.mjs` **36/36**（真实无头 Edge + CDP 独立 profile）；`node scripts/phase3-smoke.mjs` **21/21** 回归。

过程记录（都是测试暴露出来的真问题）：`evidenceClass` 曾把"独立作答错误"归为 exposed → 改为 `error` 负证据；支持等级映射差一（L4 拿不到最后一条提示）；`spanOf` 跨从句取错候选 → 按 clauseId 过滤；gold 结构 spec 的 clause 区间错 → 修数据侧而非放宽校验器；难度只看长度 → 改多维；小词库永远选不到句 → 用 authored 预教词解决（未放宽"生词过多即拒绝"）；幂等键用"同句 + 2 秒窗"会吞掉同日第二次真实练习 → 改为"会话 + 句子"；选项解析出现在作答前 = 把答案写在选项上 → 作答后才展开；图谱页"已有证据 N"与"还没足够证据"文案自相矛盾 → 按证据量如实解释判定门槛；概念卡补先修可见性。

浏览器实测还发现：迁移句可能选中同一句（同一结构池较小）→ 幂等按会话区分后，同句在不同会话的复练能各自计入，符合"迁移不是重播"。

下一步：Phase 5 Reading（article 导入 + Layered Reading + 难句 handoff 复用 `sentenceSources`/`sentenceLab`）。

## 2026-10-19 · Phase 5.0：GitHub Actions CI 与测试钩子隔离（infra_github_actions_ci_002）

Phase 5 开工前先补远程质量门禁。审计结果：仓库此前**没有任何** `.github/workflows`，所有验证都只发生在 Hermes 本地。

做了什么：

1. `.github/workflows/ci.yml`：push/PR/手动触发；Node 22 + 24 矩阵；`npm ci` → `tsc --noEmit` → `npm test` → `npm run build`；Node 22 上额外跑 `git diff --exit-code -- dist`；再加一步 `grep __labTest dist/assets/*.js` 必须为空。权限只有 `contents: read`，无 secrets、不部署。
2. 测试钩子隔离：原来是"`?test=1` 就暴露钩子"——这是**仅靠 URL 参数控制高权限测试能力**，违反 Phase 5 规格 §38。改成构建期常量 `__ERV2_TEST_HOOKS__`（`vite.config.ts` 按 `--mode testhooks` 注入）：生产构建里常量是 `false`，整个钩子（含 `window.__labTest` 赋值与点选能力）被摇树移除；只有 `npm run build:test`（输出 `dist-test/`，已 gitignore）才存在，且仍需 `?test=1`。
3. 为让两次构建可同时存在：`server.mjs` 支持 `--dir` / `--port`；`package.json` 加 `build:test`、`start:test`（4174）。
4. 修 `scripts/phase3-smoke.mjs` 的可重复性问题：原来只在"首页有计划面板"时才清库，脚本上次停在子页面时会带着残留数据跑，导致 closing 断言偶发失败（本次实测踩到一次）。改成**无条件清空测试 profile 的库**。
5. STATE 纠错：`current_phase` 从误导性的 `phase_4_sentence_grammar` 改为 `phase_5_reading`；新增 `infra_github_actions_ci_002`（状态枚举 planned/running/verifying/passed/failed/blocked）；`remote_sync` 区分 `latest_local_head` / `latest_remote_head` / `last_verified_commit` / CI `last_success_commit`，避免再靠"状态 pin 提交"凑 SHA。
6. `AGENT_EXECUTION.md` 写入长期 Task/Phase 门禁与 CI 失败分类（代码失败 vs 基础设施失败），并明确"CI 未成功不得宣称远程门禁通过"。

实测：`npm test` 106/106；生产构建成功且 `grep __labTest` = 0；`dist-test` = 1；`phase4-smoke` 36/36、`phase3-smoke` 21/21（都在测试构建上）；GitHub Actions run `39271191340` @ `6f7c889` → **success（Node 22 + 24）**，`dist` 跨平台一致；仓库仍 Private。

下一步：`phase5_reading_009` Phase 5 Reading Lab。

## 2026-10-19 · Phase 5：Reading Lab（phase5_reading_009）

- 新增阅读域 11 个纯函数模块（text/import/difficulty/evidence/session/vocabulary/sentences/analytics/store/planner/view）+ `docs/PHASE5_READING.md`；DB 仍 **v4**（复用 Phase 1 的 `passages`/`readingSessions`/`wordExposures`，不新增 store，旧数据可读）。
- 纪律落地（写进代码与测试，不是文档口号）：打开文章不显示全文翻译；首读无辅助；词库里没有的词 ≠ 不会（no-evidence 单列、不并入生词率）；Unknown Rate 分 explicit/estimated 并带分母/覆盖/置信度/method；证据幂等键 = sessionId+type+key，自评置信度上限 medium；阅读只记接触（exposure）不提掌握；first-pass 与 re-read 绝不混算；没有材料就不生成阅读任务；任务时长服从 Time Budget First。
- 真实缺陷（由测试与浏览器验收发现并修掉）：① 进入重读从未调用 `startReread` → 重读时长恒为 0、重读速度永远缺失；② 重读页只显示第 1 段 → 多段文章重读不完整（补逐段导航）；③ 生词入库用 `CSS.escape` 在部分环境直接抛错 → 改为按 `data-def` 收集释义；④ 从阅读进拆句后“返回”丢失阅读上下文 → 回到原段落并保留标记；⑤ 拆句页只在作答后提示“自动结构只记接触” → 改为进入即提示。
- 验证：`tsc --noEmit` 0 error；`npm test` **134/134**（Phase 5 新增 28 例，含 jsdom + fake-indexeddb 的端到端阅读流程）；`npm run build` / `build:test` 成功（生产 dist 无测试钩子）；`scripts/phase5-smoke.mjs` **44/44**（无头 Edge + CDP，独立 profile）；回归 `phase4-smoke` 36/36、`phase3-smoke` 21/21。

