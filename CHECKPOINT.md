# CHECKPOINT — English Reconstruction System V2

> 保存阶段性事实与已淘汰方案。最新阶段在前；旧项目历史见文末归档。

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
