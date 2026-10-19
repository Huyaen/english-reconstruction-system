# CHECKPOINT — English Reconstruction System V2

> 保存阶段性事实与已淘汰方案。最新阶段在前；旧项目历史见文末归档。

---

## 2026-10-19 · Phase 3 — Daily Planner / Today 主入口（passed）

**结论**：Daily Planner 全量交付并实测通过。Today 首页成为主入口（时间预算 → 状态 → 隔夜检测 → 计划 → 执行/微调 → 收尾），Phase 0/1/2 既有能力全部保持。

新增/改动：
- `src/planner.ts`（领域引擎，纯函数/确定性/无 DOM 无 AI）：预算分配（Closing 与 Recall/Re-entry 同一预算）、`buildYesterdayRecallSample`/`evaluateRecallSession`（只统计 ≥12h 的真实隔夜证据，同词去重）、`estimateRetention`（d1/d7，样本 <3 返回 null）、`decideRecovery`、`createDailyPlan`、`applyPlanAction`（start/complete/skip/delay/replace + overrun rebalance ≤30%）、`calibrateAfterRecall`、`regenerateRemaining`、`buildReplacement`、`assertPlanInvariants`。
- `src/plannerStore.ts`：dailyPlans 持久化（id=本地日期）、`savePlan` revision 并发保护（`StalePlanError`）、`loadPlan/listPlans`。
- `src/types.ts`：PlanItem 扩为统一 Task Contract（kind/label/priority/critical/flexible/capabilityRequired/source/refs/reason/dependencies/actualMinutes，全部可选 → 旧计划与旧备份继续可读）；DailyPlan 增 revision/status/capabilities/budget/recovery/calibration/taskActions。
- `src/app.ts`：Today 面板（预算 20/30/45/60/自定义、状态三档、任务卡 Start/Skip/Delay/Replace、进度与剩余时间、Regenerate 未完成部分、调整预算/状态、Closing 难度反馈）+ 会话与计划任务串联（任务完成即落盘，隔夜检测完成后校准剩余任务）；未上线模块在 UI 明示为不可执行。
- `src/style.css`：Plan 面板样式（含窄屏与深色主题变量复用）。

**关键设计取舍**
- 复用而非重写调度：新词量走 `recommendedNewWordCount()`、选词走 `buildNewWordQueue()`、到期判定走 `effectiveDue()`；Planner 不新增第二套 FSRS 调度。
- 只用真实证据：没有昨日记录 → 不生成隔夜检测；样本不足 → 保留率返回 null（不伪造通过率）；同一次作答不重复计入保留率（按 sessionId + wordId 去重）。
- 不积学习债：跨日不克隆未完成任务；到期记忆仍按到期池出现（记忆债 ≠ 学习债）。
- Capability Gate：sentence/reading/input/output 只声明 `requires`，不生成任何任务与假进度。
- 超时/提前完成只收缩柔性任务（新词/弱词），critical 记忆任务不静默削减；调整全部写入 `adjustments/taskActions` 并带原因。

**验证证据**
- `npm test` **69/69**（Phase 2 原 39 + planner 22 + plannerStore 6 + plannerUi 2）；`npm run build` 成功（544.43 kB / gzip 187.93 kB）。
- HTTP：`node server.mjs` → `/` 200、JS 200（552,819B）、CSS 200（17,234B）、缺失路径 404。
- 真实浏览器 smoke（无头 Edge 128 + CDP 9224，独立 profile）**20/20**：导入 → 生成计划 → 任务顺序（Preview→Recall→Closing 末位）→ 替换无候选明确拒绝 → Preview/Recall 完成落盘 → Closing + 难度反馈 → 刷新恢复（同日唯一计划）→ 昨日记录隔夜检测（保留率 100% · 可信 · 触发校准）→ 断更 5 天 Re-entry（真实词、预算内）→ 无控制台错误。
- DB 仍为 **v3**（未提升版本；dailyPlans 复用现有 store 与 `date` 索引）。

---

## 2026-10-19 · 离线文件审查与 GitHub Remote Sync 规格增补（documentation only）

**真实性边界**：基于用户上传的 Markdown/JSON/依赖清单审核，未连接用户 D 盘 Git 仓库；此条不表示实测 GitHub、创建仓库、push 或重新运行 39 个测试。本地最新状态仍须接手 Agent 核验。

- 恢复断点：截至上传快照，Phase 0/0.5/1/2 均已 passed，Phase 3 仍 planned，DB v3，最后记录 39/39 test + build + CDP smoke 通过。
- 新增工程任务 `infra_github_remote_001`：GitHub **Private** 仓库首次核验/创建/历史敏感信息审核/推送和 tag 对账；与 Phase 0.5 研究其它开源仓库的任务区分。
- 产品层 `PROJECT_SPEC.md` 增补工程隐私和远端备份边界；执行层 `AGENT_EXECUTION.md` 细化 Task-Level/Phase-Level GitHub Push/校验/失败重试/跨会话对账；`INITIAL_PROMPT.md` 改为“已有状态优先恢复”；新增 `docs/PHASE3_DAILY_PLANNER.md` 与 `START_HERMES.md`。
- 修订状态文件已存在的过期描述（legacy 调度非 FSRS）、TODO 重复的 Phase 2 待办、README 旧恢复入口；这是**文档纠错**，不是源码行为变更。
- 远程真实 owner / URL / SHA / 分支 / Private 状态、真实当前 Git HEAD 和当下 tests 均为 unverified。任何敏感信息历史被发现时首次 push 必须暂停。

---

## 2026-10-04 · Phase 2 — Vocabulary V2（passed）

**结论**：Vocabulary Engine 完成 V2 升级：**FSRS 调度**（ts-fsrs@5.4.2，MIT，精确锁定）接入并成为默认调度权威（旧调度器完整保留、可一键回滚）；**DB v3**（只加不删、原子、幂等；v1/v2 备份均兼容）；**Preview → Recall 强制流程**（UNSEEN 不得直接测试）；三维证据系统上线；多词池 + Learning Value + 动态新词量（供 Phase 3 直接调用）。

### 交付（子阶段 ↔ 实现 ↔ 证据）

| 子阶段 | 内容 | 文件 | 证据 |
|---|---|---|---|
| 2.1 FSRS Foundation | ts-fsrs 5.4.2（`--save-exact`）**仅**经由 `src/fsrs.ts` 适配层使用（UI/业务不直连库） | src/fsrs.ts, package.json/lock | tests/fsrs.test.ts |
| 2.2 DB v2→v3 | Word.fsrs（stability/difficulty/state/reps/lapses/due/lastReview/scheduledDays/learningSteps）+ previewResult 回填；新增 `fsrs.due` 索引；**串行回填修复并行游标竞态**；backup v3（兼容读入 v1/v2） | src/db.ts | migration.test（v1→v3、v2 fixture→v3、幂等、备份兼容/悬空拒绝） |
| 2.3 过渡能力 | 每次作答同时计算 legacy + FSRS（shadow）；`settings.schedulingAuthority`（默认 fsrs，可回滚 legacy）；`effectiveDue()` 平滑切换（无 FSRS 历史的词回退旧 due） | src/fsrs.ts, src/quiz.ts, src/model.ts, src/stats.ts, src/app.ts | fsrs.test 'shadow' 用例 |
| 2.4 Rating 映射 | 多因素：错误/超时→Again；慢正确→Hard；**首次正式 Recall 封顶 Good**；Easy=秒答+streak≥4+间隔证据（spacedPasses≥2 或 fsrsReps≥2）；阈值集中于 RatingConfig | src/fsrs.ts | fsrs.test 映射 4 用例 |
| 2.5 生命周期 | unseen→previewed→learning→recognition→active→productive；EWMA 三维分数 + 证据计数驱动；**可升级可回退**；forgotten 检测 | src/evidence.ts | vocab.test 升级/回退用例 |
| 2.6 Preview Flow | 独立 Preview 会话（词/IPA/词性/释义/搭配/例句 + 1–4 键：已会/熟悉/陌生/跳过）；记录 previewedAt/previewResult/exposure；**Preview ≠ mastery**；跳过不产生 exposure | src/app.ts, src/evidence.ts, src/db.ts(savePreview) | ui.test Preview 6/6 + IDB 断言；浏览器 smoke |
| 2.7 三维掌握 | recognition（En→中）/ activeRecall（中→En）/ productive（预留 API，Output Lab 接入） | src/evidence.ts, src/quiz.ts | vocab.test |
| 2.8 Exposure 模型 | preview/reading/input → exposure；答题 → recall evidence；Output → production evidence（API 已备）；exposure 不改变 mastery | src/evidence.ts | vocab.test 'exposure ≠ mastery' |
| 2.9 多词池 | foundation / miniUnit（空池 fallback）/ encountered / forgotten（优先回流、不计入新词数）；游标式配额 + 自动重分配 | src/pools.ts | pools 用例 |
| 2.10 Learning Value | 确定性评分 `{score, reasons[], components{}}`：foundation 标签/词书顺序、encountered、forgotten、难度适配、专名降权；无 AI | src/pools.ts | learning value 用例 |
| 2.11 初始比例 | 55/25/20 + graceful fallback（绝不生成假数据） | src/pools.ts | pools 用例 |
| 2.12 动态新词量 | 纯函数 `recommendedNewWordCount`：availableMinutes/energy/d1/d7/weakLoad/dueLoad/recentAccuracy → `{recommended,min,max,components,reasons}`；Phase 3 直接调用 | src/pools.ts | dynamic count 用例（含边界） |
| 2.13 高量检索 | 索引化查询（fsrs.due 索引 + 复合索引）；1000 题基准无显著退化（fake-IDB 17.2s，单题 max 19ms） | src/model.ts, src/db.ts | benchmark 输出 |
| 2.14 Confusion 兼容 | confusion 系统与 distractor 生成行为不变（review()/question() 未改） | src/core.ts | 原有回归全绿 |
| 2.15 UI | 首页「今日新词」面板（建议数/来源构成/回流入口）、Preview 入口（首页 + 词库）、词库生命周期列、词详情三维+FSRS+保留率、设置页「调度引擎/目标保留率」 | src/app.ts, src/style.css | ui.test + 浏览器 smoke |
| 2.16 测试 | 39 项（+14：fsrs 6、vocab 7、migration +1、ui 扩展；原 25 项全保留） | tests/* | `npm test` **39/39** |
| 2.17 验证门 | 见下 | — | — |

### 验证门（实测记录）

- `npm test` → **39 pass / 0 fail**；`npm run build` → 成功（JS 511.74 kB / gzip 176.27 kB，>500KB 警告记入 Phase 13）
- **真实浏览器 smoke**（无头 Edge + 独立 profile + CDP 驱动）：boot → 导入 8 词 → 未预览词被拦截（不建 session）→ Preview 8/8 → Recall（EN→中）作答 → 退出后恢复横幅「已答 1 题」→ IDB 校验（version=3、20 stores、8 词全部 previewed、已答词 fsrs.reps>0、exposures=8（preview）、records=1、rating=[3]）→ **reload 后状态保留**
- v2 fixture→v3 升级（100% 保留 + 幂等）实测通过；v1 备份 → v3 恢复实测通过；v3 备份往返实测通过

### 关键决策 / 已淘汰 / 已知限制

- **ts-fsrs 精确锁定 5.4.2**（`--save-exact`，MIT 已核验）；`enable_fuzz=false`（确定性）、`enable_short_term=true`（学习步 [1m,10m]）
- 调度权威默认 `fsrs`；`legacy` 字段/代码/开关全保留（回滚能力），shadow 双算在 Phase 2 内完成验证后切换
- **已淘汰**：并行游标式 v2/v3 回填（互相覆盖 → 改串行链）；pools fallback 的直接重取（重复选取 → 改游标消费）
- 已知限制：bundle 体积 >500KB 警告（Phase 13 处理）；fake-indexeddb 基准≠真实性能；Preview 不创建 StudySession（直接落盘 word+exposure，刷新安全）

### Phase 3 前置就绪（Daily Planner 直接调用，不重写）

- `recommendedNewWordCount()`（纯函数）；`buildNewWordQueue()`
- `model.ts` 索引化查询；`DailyPlan`/`MiniUnit` store；`schedulingAuthority` + `effectiveDue()`

---

## 2026-10-04 · Phase 1 — Data Foundation（passed）

**结论**：DB 升级到 **version 2**（只加不删、原子升级、v1 数据 100% 保留有测试）；**14 个 Learning Model stores** 就绪并带索引；Word 三维能力字段 + 默认值迁移；**备份格式 v2**（兼容读入 v1）；**Learning Model 查询层**（索引化）。

### 交付（task_id ↔ 实现 ↔ 证据）

| task_id | 内容 | 文件 | 证据 |
|---|---|---|---|
| phase1_db_migration_001 | versioned migration 框架：逐版本分支（v1 建原 6 store；v2 建新 stores+索引+回填）；升级事务原子性；meta 迁移记录；旧库升级后 UI toast 提示导出备份 | `src/db.ts`、`src/app.ts` | `tests/migration.test.ts`：v1 fixture（book/2 words/record/session/settings）升级后 100% 保留 + 重开幂等 |
| phase1_learning_model_stores_002 | 新增 14 stores（wordExposures…libraryItems）+ 16 组二级索引（复合 `wordId,at` 等） | `src/db.ts`、`src/types.ts` | 测试断言 store/index 实际存在（raw IndexedDB 检查） |
| phase1_word_upgrade_003 | Word 新增：recognitionScore/activeRecallScore/productiveScore/exposureCount/contextExposureCount/productionEvidence/previewedAt/lastEncounteredAt/sourceTypes；旧词回填默认值 | `src/types.ts`、`src/core.ts`、`src/db.ts` | 测试断言回填默认值 + 校验器类型检查 |
| phase1_backup_v2_004 | 备份 v2（全部新 stores、去 Key）；`validateBackup` 兼容 v1+v2；悬空引用拒绝；`normalizeData` 规范化 | `src/db.ts` | v1 备份恢复测试 + v2 往返测试 + 悬空引用拒绝 |
| phase1_model_api_005 | `src/model.ts`：dueWords/wordsByBook/recordsForWord/exposuresForWord/exposureStats/latestSnapshots/planForDate/activeMiniUnit/unfinishedSessions | `src/model.ts` | model 查询测试（索引范围查询、到期过滤 total>0、快照倒序） |

### 验证（实测）

- `npm test` → **25 pass / 0 fail**（原 20 + 新增 5）
- `npm run build` → 成功（vite built in 1.15s；dist JS 475.21 kB / gzip 164.36 kB）
- 服务实测：`node server.mjs` → `GET /` 200（535B）、新 JS asset 200（481,259B）、404 正常
- 压力基准（fake-indexeddb）：1 万词导入+建库约 3.9s、1000 题逐题事务约 16.6s（索引精简后）；真实浏览器数值以 Phase 13 实测为准

### 设计决策与已淘汰方案

- **只加不删 + 原子升级**：onupgradeneeded 失败自动回滚（旧数据安全的 rollback 保障）；真实升级写 `meta.migration` 记录并在 UI 提示导出备份（浏览器无用户手势无法自动下载快照，采用「原子升级 + 事后提醒」组合）
- 全新安装（oldVersion=0）**不写**迁移记录（避免误报）
- backup v2 **不持久化** migration 记录（运行时信息）；`dueWords` 过滤 `total>0`（未测试新词 due=0 不算到期）
- **已淘汰**：初版 4 个冗余索引（`records.wordId/sessionId`、`wordExposures.wordId`、`grammarAttempts.conceptId` 等）导致写放大 → 精简为复合 `wordId,at` + `at`（复合索引前缀查询等价）；**不引入 Dexie**（原生实现复杂度可控，保留升级预案）
- 迁移框架可直接复用：后续 Word.fsrs 字段（Phase 2）走 v2→v3 同模式

### 已知限制

- sessions「未完成」查询为读取后过滤（`ended=null` 不进索引；量级小）
- 迁移的自动快照受浏览器限制未实现自动下载（以原子性 + 提示替代）

---

## 2026-10-04 · Phase 0.5 — GitHub Reference Research（passed）

**结论**：完成有边界的开源调研（候选 40+、深挖 12、Adopt/Adapt/Reject 总表），成果 `REFERENCE_RESEARCH.md`（490 行）。未改变任何产品原则；未发现需要推翻现有技术栈的理由。

### 采用的重要架构启发（持久决策）

1. **调度内核 → ts-fsrs（MIT）**（Phase 1/2 引入）：替换 9 级阶梯启发式为 FSRS-6（stability/difficulty/retrievability）；本项目的反应时间分类映射为 Again/Hard/Good/Easy；保留每词独立调度与「到期复习优先」。
2. **个人遗忘模型 → HLR 思想（Adapt，Phase 10）**：半衰期 `h=2^(θ·x)`、保留率 `p=2^(−t/h)`、观测半衰期反推 `h=−t/log2(p)` → Dashboard「平均半衰期/保留率」趋势。
3. **语法掌握 → BKT-lite（Adapt，Phase 4/10）**：每 concept 维护 `p(known)`（prior/learn/guess/slip，O(1) 增量更新）→ Grammar 百分比与周诊断信号。
4. **Sentence Tree 渲染 → spaCy displaCy 的 `{words[], arcs[]}` 协议（Adapt，Phase 4）**：渲染层与分析来源解耦；AI 结构化输出与本地降级共用同一中间表示。
5. **词汇已知度评分 → VocabSieve 多源加权思想（Adapt，Phase 2/10）**：exposure/测试/生产证据分离 + 权重表 + 阈值 → 稳定识别词汇估算与生词价值筛选。
6. **IndexedDB 迁移 → Dexie 版本化 schema + Lute migration 模式（Adapt，Phase 1）**：原生 `onupgradeneeded` 逐版本、只加不删、升级回调链、v1 fixture 迁移测试。
7. **AI 结构化输出 → instructor-js 模式自研（Phase 6）**：Zod 校验 + 模式回退链（json_schema → json_object → MD_JSON 提取）+ 重试 + jsonrepair（ISC）修复；不引入 instructor-js 依赖。
8. **OCR fallback → tesseract.js（Apache-2.0，Phase 5）**：AI Vision 优先、本地 fallback、必须人工修正。
9. **数据源 → ECDICT（MIT）数据子集（Phase 2）**：gk 高考/四六级标签、BNC/COCA 词频、lemma exchange → Learning Value Score 与词形还原。
10. **关键否定结论**：Knowledge Graph 与 Daily Planner 无对口成熟 OSS（搜索 0 结果）→ 自研；不引入图数据库/CRDT；不复制 GPL-3.0/AGPL-3.0 项目代码（yomitan/vocabsieve/asbplayer/Lute 代码层面）。

### 影响与边界

- Phase 1 迁移框架设计按 Dexie/Lute 模式定稿（只加不删 + 迁移测试）。
- Phase 2 起按 `REFERENCE_RESEARCH.md §11` 逐项引入，每项记录许可证与版本。
- 调研失败记录（含一次 `APITimeoutError` 中断与恢复策略、raw.githubusercontent 不可达的替代路径）见 `REFERENCE_RESEARCH.md §12`。

---

## 2026-10-04 · Phase 0 — Audit & Safety（passed）

**结论**：现有 vocabulary-app（V1 MVP）审计完成——可正常启动、构建、测试全部通过。
唯一结构性缺口是项目此前**没有 Git 仓库、也没有 V2 状态文件体系** → 已补齐。
现有代码默认保留，按「审计 → 复用 → 扩展 → 迁移 → 验证」推进，**不重写**。

### 1. 真实目录结构（实测）

```text
vocabulary-app/
├── PROJECT_SPEC.md / AGENT_EXECUTION.md / INITIAL_PROMPT.md     # 产品与执行协议（V2）
├── STATE.json / CHECKPOINT.md / HANDOFF.md / TODO.md / DEVELOPMENT_LOG.md  # V2 状态体系
├── README.md / package.json / package-lock.json / tsconfig.json / .gitignore
├── index.html                       # Vite 入口（挂载 #app / #toast / #modal）
├── server.mjs                       # 静态服务器（服务 dist/，127.0.0.1:4173）
├── start-windows.bat                # 双击启动入口
├── src/                             # app.ts(450) core.ts(98) db.ts(126) quiz.ts(27)
│                                    # import.ts(89) stats.ts(28) ai.ts(32) types.ts(107) ui.ts(26) style.css
├── tests/                           # core/data/regression/session/ui 共 5 个测试文件（20 项测试）
├── dist/                            # 构建产物（已纳入 Git；server.mjs 读取此处）
└── docs/                            # ALGORITHMS.md / PLAN.md / REQUIREMENTS.md / TEST_REPORT.md
                                     # checkpoint.py(打包脚本) / format-source.mjs(源码格式化) / history.bundle(被忽略)
```

### 2. 真实技术栈（以代码为准，非提示词推断）

| 层 | 实际实现 |
|---|---|
| 语言/构建 | TypeScript 5.7（strict、noEmit、allowImportingTsExtensions）+ Vite 6.1（`tsc --noEmit && vite build`） |
| UI | 原生 DOM 渲染 + 模板字符串，无框架；单入口 `src/app.ts` |
| 存储 | 原生 IndexedDB（无 Dexie/RxDB）；`src/db.ts` 封装 |
| 词书解析 | `xlsx`(SheetJS) 0.18.5（唯一生产依赖） |
| 测试 | `node:test`（`node --import tsx --test tests/*.test.ts`）+ fake-indexeddb + jsdom + esbuild（DOM 集成） |
| 运行时 | Node ≥22（实测环境 Node v26.7.0 / npm 11.19.0） |
| 产物 | dist JS ≈471 kB（gzip 163 kB）、CSS ≈15.6 kB |

源码格式由 `docs/format-source.mjs`（TS printer）统一为紧凑风格——**修改源码后保持该风格或重跑脚本**。

### 3. 运行验证（实际执行，非推测）

| 项 | 命令 | 结果 |
|---|---|---|
| 测试 | `npm test` | **20 pass / 0 fail**（含 1 万词导入 ≈359ms；1000 题逐题事务 ≈8.7s，最慢单题 32ms；DOM 集成 ≈2.0s） |
| 构建 | `npm run build` | **成功**（tsc 无错误，vite built in 1.87s，hash 不变 `index-Cz7SpIzd.js`） |
| 运行 | `node server.mjs` + curl | `GET /` **200**（535B）；JS asset 200（477,379B）；CSS asset 200（15,579B）；不存在路径 404 |
| Git | `git init` + commit | baseline `6c1c625`，tag `v1.0.0-mvp-baseline`，工作区干净 |

说明：旧交付报告中的"浏览器被拦截未验收"是旧环境限制；本机具备 CDP 无头 Edge 验证手段，浏览器级验收安排在后续阶段（Phase 13 Hardening）统一补齐，当前证据 = 自动测试 + 真实构建产物 HTTP 实测。

### 4. IndexedDB schema / 版本 / migration（实测自 src/db.ts）

- 数据库名：`vocabulary-memory-v1`，**版本 1**（注意：DB 名自带 `v1` 字样，升级时建议保持库名、只升版本号）
- 6 个 object store，全部 `keyPath: 'id'`：`books` / `words` / `records` / `sessions` / `analyses` / `meta`
- `meta` 仅存单条 `{id:'settings', value: Settings}`
- 升级机制：**仅 v1 `onupgradeneeded` 建 store；没有任何 versioned migration 框架、没有迁移测试** → Phase 1 首要任务
- 写路径：`replaceData`（单事务全量替换，导入/恢复/清空用）；`saveAnswer`（单事务同写 words+records+sessions）；`putItems`（单 store 批量）
- 安全机制：`db.onversionchange` 自动关库；Web Locks 单写者（多窗口检测，无锁时提示关闭其他窗口）；`onblocked` 报错
- 备份校验：`validateBackup()` 对 ID 正则白名单、引用完整性（bookId/wordId/sessionId/selectedId/confusions 目标存在）、数值有限、枚举、`step` 整数 ≤8、选项数 4/6 且含目标、`queue[index]==question.wordId` 等全面校验后才允许进入破坏性事务

### 5. 现有 Vocabulary 能力审计（真实行为）

- **词书导入**：TXT/CSV/TSV/XLS/XLSX/JSON；中英字段别名表头探测；GB18030 解码回退；单文件 ≤25MB；同次导入按 en 去重；坏行报告；也支持直接粘贴
- **词库管理**：搜索 / 状态筛选 / 优先级·字母·到期排序 / 分页 50 / 词书重命名·删除（连带清理 records/confusions/sessions 引用）/ 词条编辑 / 单词详情（历史 20 次、混淆、双向表现）
- **训练模式**：快速刷词、今日复习(due)、弱词强化(unknown+vague 按 priority)、随机抽查、筛选结果测试（≤1000）、单词汇重测
- **题型**：en-zh / zh-en，比例可设（含自定义 0–100）；easy/normal=4 选项、hard=6 选项；干扰项综合词性/难度/字形相似/中文字符相似/词书邻近/历史混淆；重叠释义与同义排除；选项不足时明确报错
- **反应时间**：fast ≤1500ms / normal ≤3000ms / vague <6000ms / ≥6000ms=unknown（阈值可配置）；暂停与标签页切换不计时；键盘 1–6 / Space / Enter（110ms 防连发）；超时自动提交
- **熟练度（多证据）**：本次分类 classify + 累计 level；fluent 需双向各 ≥2 正确、各方向正确率 ≥80%、spacedPasses ≥3、streak ≥4、本次秒答；"提前重复不拉长间隔"有测试保证
- **独立调度**：9 级阶梯 [15m, 4h, 1, 3, 7, 14, 30, 60, 120 天]；秒答 ×1.3（step≥3）、模糊 ×0.7、遗忘惩罚 `1/(1+min(lapses,5)×0.12)`；错误重置 10 分钟并清 step/spacedPasses；每词独立。**透明启发式，非 FSRS/SM-2**（docs/ALGORITHMS.md 明示）
- **Priority 算法**：状态基数 80/60/20/0（新词 45）+ 错误率×15 + 弱方向×10 + 连错×4 + 遗忘×2 + 速度 + 混淆 + 逾期(≤20) − streak；S/A/B/C/D 分级，用于 due/weak 队列排序
- **弱词与混淆**：unknown+vague 计弱词；答错（选了别的选项）记录 confusion edge 计数，后续出题提高该混淆词概率；今日弱词净变化（新增/消除）在首页展示
- **统计**：今日作答/正确率/平均反应；双向表现对比；7/30 天趋势（含进入熟练次数、到期答错次数）；"有效掌握" = fluent 且未逾期（保守估算）
- **会话与事务**：每答题一次事务落盘；刷新/中断可继续（未完成 session 恢复，首页入口）；本轮结果页含弱词重测与导出
- **设置**：阈值/比例/难度/反馈停留(-1~1000ms)/主题；`validSettings` 严格校验；Web Locks 防多窗口写冲突

### 6. AI Provider / Prompt / API Key 审计

- **配置**：Endpoint + Model + Key；OpenAI-compatible Chat Completions；自动补 `/chat/completions`；校验协议/无账户/无查询/无片段
- **调用**：浏览器直连 fetch（Bearer），60s 超时，非流式；错误分类提示（网络/CORS、HTTP status、响应结构）
- **发送内容**：汇总指标 + 30 天趋势 + 最多 60 个弱词（含混淆），UI 提供"查看将发送的数据"预览；不发送完整词书与逐题历史
- **Prompt 现状**：单一 system prompt **内联在 src/ai.ts**（无 `prompts/` 目录、无版本号、无 JSON schema）→ Phase 6 需 prompt 版本化 + 结构化输出校验
- **Key 存储**：默认仅内存（rememberKey=false 时存空串）；勾选后明文存 IndexedDB `meta`；**备份/导出始终剔除 Key**；无第三方 telemetry
- **报告**：`AIAnalysis` 存 `analyses` store，本地展示；报告不自动改设置

### 7. 备份与恢复审计

- **导出**：JSON `{format:'vocabulary-memory', version:1, exportedAt, data:{...}, settings 去 Key}`（文件名 `词间完整备份-YYYY-MM-DD.json`）
- **恢复**：`validateBackup`（完整结构+引用校验，见 §4）→ 确认对话框（显示数量）→ 单事务 `replaceData`；**校验失败不动旧数据**（有测试）
- **清空**：需输入「清空」二字确认；提供"先导出备份"入口
- **持久存储**：可申请 `navigator.storage.persist()`
- **容量基准**：1 万词 + 1000 条记录 ≈ **10.6MB** JSON
- **已知约束**：恢复后 Key 被剔除（设计如此，提示重填）；数据与站点地址绑定（localhost 与 127.0.0.1 是不同来源）

### 8. 复用 / 扩展 / 替换清单（V2 决策）

- **直接复用（Vocabulary Engine 基座）**：`db.ts` 事务与校验框架、`core.ts` 分类/优先级/调度/选项、`quiz.ts` 会话推进、`import.ts`、`stats.ts`、`app.ts` quiz UI 与键盘、`style.css`
- **扩展/迁移**：`db.ts` → versioned migration + 新 stores；`Word` → 三维分数/exposure/来源字段（旧数据补默认值）；`ai.ts` → prompts 目录 + JSON schema + retry/fallback
- **升级候选（Phase 0.5 调研后定）**：启发式调度 → FSRS（ts-fsrs, MIT）或参数化改造；单一 AI 报告 → 结构化多任务
- **明确不做**：重写现有 DOM 架构；引入重型框架（React 等）替换现有轻量方案

### 9. 数据安全与迁移风险

1. **最高风险**：v1→v2 升级若在 `onupgradeneeded` 中误删/重建 store → 丢全部学习数据。对策：只加不删（additive）、先自动快照备份、迁移测试（fixture v1 数据 → 新代码打开 → 全量保留校验）
2. `replaceData` 全量重写在超大库（≥10 万词）可能慢 → 导入改增量 put（Phase 1/2）
3. 浏览器存储可能被清理（无痕/清站点数据）→ 保持备份提醒与持久存储申请
4. 站点地址必须固定 `localhost:4173`，换端口/换来源=换数据库

### 10. 本 checkpoint 依据

- build：`npm run build` passed（vite 6.1.0）
- test：`npm test` 20/20 passed
- git：`main @ 6c1c625`（tag `v1.0.0-mvp-baseline`），工作区干净
- DB version：1

### 11. Phase 1（Data Foundation）任务拆分

| task_id | 内容 | 验收 |
|---|---|---|
| `phase1_db_migration_001` | IndexedDB v1→v2 versioned migration 框架（additive only、升级前快照提示）+ 迁移测试 | fixture v1 数据经升级后 100% 保留 |
| `phase1_learning_model_stores_002` | 新 stores：wordExposures、grammarConcepts、grammarAttempts、sentenceAttempts、passages、readingSessions、inputSources、inputSessions、outputAttempts、dailyPlans、miniUnits、skillSnapshots、weeklyDiagnostics、libraryItems + 索引设计 | 打开即建；旧库升级不丢数据 |
| `phase1_word_upgrade_003` | Word 字段扩展：recognitionScore/activeRecallScore/productiveScore、exposureCount/contextExposureCount/productionEvidence、previewedAt/lastEncounteredAt、sourceTypes/tags + 旧数据默认值迁移 | 旧词条可读可写；migration 测试 |
| `phase1_backup_v2_004` | 备份格式 v2（含新 stores；**兼容读入 v1 备份**） | v1 备份可恢复；v2 往返测试 |
| `phase1_model_api_005` | Learning Model 查询层（聚合接口；索引化查询，避免全表扫描） | 大数据量查询基准 |

---

# Phase 4 — Sentence & Grammar（passed 2026-10-19）

## 交付内容

| 模块 | 结果 |
|---|---|
| `src/grammar.ts` | 显式语法知识图谱：34 概念 / 6 类 / 先修边；`validateTaxonomy` 成环即丢弃并报告；BKT-lite 后验 + 掌握带 + 弱项信号 + 概念知识卡（规则/为什么/例子/常见错误/迁移） |
| `src/sentenceStructure.ts` | 句子结构表示（token + clause 树）与严格校验：越界索引 / 非法 head / 自环 / 环 / 重复一律拒绝；`structureRows` / `structureMetrics` |
| `src/sentenceSources.ts` | 句源契约：12 条 authored 教学句（作者撰写，非任何文章原句）+ gold 结构 + 中文预教词；来源能力/混比；AI 与外部语料未接入只声明 unavailable |
| `src/sentenceLab.ts` | 引导式拆句：主语→谓语→宾语→修饰→从句→非谓语→逻辑→完整意；L0–L4 分层辅助；即时反馈 + 错误类型；迁移任务；证据分级 |
| `src/sentenceEvidence.ts` | 证据服务：幂等键 = 会话 + 句子；聚合取最保守结果；JIT 30–60 秒知识卡 |
| `src/sentenceSelection.ts` | 多维难度（生词/已知覆盖率/从句层级/长度/目标结构）、弱点信号、自适应选句（含先修修复与预教词兜底）、Planner 句任务描述 |
| `src/sentenceGraphMap.ts` / `src/sentenceStore.ts` | 句↔概念映射；句库与语法证据持久化（复用索引） |
| `src/types.ts` / `src/db.ts` | Phase 4 类型 + `Data.sentences` + `glossary`；DB **v4 additive**（`sentences` store、`grammarTags` multiEntry 索引），旧 v3 数据继续可读 |
| `src/planner.ts` / `src/app.ts` / `src/style.css` | capability gate 打开 sentence + 真实句任务（`sentence-basic-structure` / `sentence-weak-grammar` / `sentence-transfer`）；句子页 / 拆句页 / 语法图谱页 / 计划内句任务接线 |

## 证据等级（写死在实现里）

- 计入 BKT：`independent`（无提示全对）、`transfer`（换句同结构迁移）、`delayed`（延迟复测）、`error`（独立作答错误 = 负证据）
- 不计入：`exposed`（辅助 ≥ L3 = 看过答案）、`hint-assisted`（提示后正确），只记 exposure
- 幂等：同一会话重复提交同一句只算一次；不同会话再练同一句必须各算一次

## 验收

```
npx tsc --noEmit -p tsconfig.json   → 0 error
npm test                            → 106/106 pass
npm run build                       → 成功
node scripts/phase4-smoke.mjs       → 36/36（真实无头 Edge + CDP，独立 profile）
node scripts/phase3-smoke.mjs       → 21/21（回归）
```

浏览器冒烟覆盖：句源诚实标示 → 预教词 → 作答前不泄露成分解析 → 四步拆句 → 结构树逐词对齐 → 证据落库（independent）→ 概念后验上升 → 句库使用次数 → 迁移（记录来源句）→ L3 看答案全部概念 mastery 不变 → 图谱自检 + 概念详情（知识卡/最近证据/真实训练句）→ 计划内真实句任务（真实 id、预算内、可开始）。

## 修掉的真实缺陷（测试驱动）

`evidenceClass` 把独立错误当 exposed；支持等级差一（L4 拿不到末条提示）；`spanOf` 跨从句取错候选；gold 结构 spec 的 clause 区间错（修数据侧未放宽校验）；难度只看长度；小词库永远选不到句（用预教词解决，未放宽"生词过多即拒绝"）；幂等键用时间窗会吞掉同日第二次练习（改为会话+句子）；选项解析写在作答前 = 答案泄露；图谱页"已有证据 N"与"证据不足"文案自相矛盾；概念卡缺先修可见性。

## 未做（诚实边界）

AI 句生成、外部语料 / 阅读 handoff、Mini Diagnostic 非词汇子测试、个性化时间估算；BKT 参数未拟合，界面标注"估算"。

---

# 归档：旧项目 Checkpoint 06（V1 MVP 交付版，原文保留）

## 当前项目状态

当前阶段：MVP功能与自动测试完成，完整项目和编译产物已打包。总体约95%，**仍未满足用户全部完成定义**：真实浏览器桌面/手机可视化验收、真实AI供应商调用未验证。

最后修改：src/ui.ts（同步事件阻止默认表单导航）、src/app.ts（自定义比例、状态保存保护）、tests/ui.test.ts 和交付文档。
无修改到一半的源文件。npm run build 成功；npm test 20项通过，0失败。

## 已完成功能

- [x] TXT/CSV/TSV/XLS/XLSX/JSON词书解析、预览、坏行报告、单次导入去重
- [x] 词书列表、重命名/删除、词条编辑、搜索、筛选、排序、分页、详情
- [x] 英→中/中→英/随机比例，普通与简单4选项、困难6选项
- [x] 字形/词性/难度/邻近/混淆干扰项；明确重复释义排除
- [x] 高速答题、反应计时、1–6/Space/Enter、暂停、自动超时、答错反馈
- [x] 单题事务保存、未完成训练恢复、多窗口写锁、开始互斥、提交期导航保护
- [x] 本次速度分类、保守累计掌握、优先级、每词独立间隔调度
- [x] 今日复习、弱词强化、随机抽查、快速刷词、本轮弱词与重测
- [x] 每词混淆对记录、学习历史、双向表现
- [x] 今日统计、7/30天趋势、有效掌握估算
- [x] 完整JSON备份验证与原子恢复、剔除Key、筛选词表TXT/CSV/XLSX导出
- [x] AI Endpoint/Key/Model设置、实际fetch请求代码、报告保存、发送内容预览
- [x] 深浅主题、响应式CSS
- [x] README、开发日志、TODO、算法说明、测试报告、源码与dist

## 尚未完成与已知限制（旧记录）

1. 真实浏览器被运行环境ERR_BLOCKED_BY_CLIENT拦截；未验收真实页面视觉、鼠标及手机布局。
2. 没有真实供应商凭据，因此AI只做了协议适配测试。
3. 未实现第二阶段：拼写、填空、搭配题、发音、AI例句/干扰项、PWA、云同步。
4. 同义排除是词表文本启发式。
5. AI直连需要供应商支持CORS。
6. 性能测试使用fake-indexeddb。
7. 历史每日弱词存量曲线未实现。
