# 词间 · 自适应英语词汇记忆

用大量双向检索、反应时间、薄弱词强化和独立间隔调度，建立个人词汇学习记录。本地优先，不需要账号，也不需要 AI 才能刷词。

**当前工程状态（2026-10-19 实测）**：V2 Phase 0/0.5/1/2/3/4/5 已通过。DB 升到 **v4（additive）**、FSRS 5.4.2 默认调度。Phase 3 Daily Planner：Today 首页为唯一入口（可用时间与状态 → 隔夜检测 → 计划 → Start/Skip/Delay/Replace → Closing Loop），支持 Re-entry / Mini Diagnostic 与刷新恢复。Phase 4 Sentence & Grammar：语法知识图谱（34 概念 + 先修边，禁循环）、12 条 authored 教学句（gold 结构 + 中文预教词）、引导式拆句（L0–L4 分层辅助 / 即时反馈 / JIT 知识卡 / 迁移验证）、证据分级（看过答案不计掌握）、计划内真实句任务。Phase 5 Reading Lab：真实文章导入（粘贴/文件/URL/截图人工转录，来源类型与可靠性、内容指纹全部可追溯）、逐段阅读（首读无辅助、**打开文章不显示全文翻译**）、生词四分类即时标记 + 后置筛选入库（**没有释义的新词不得入库**）、难句一键交给 Phase 4 拆句训练（自动分析的结构只记接触，练完回到原段落）、重读（真实计时，与首读分开统计）、全文理解 + 一句话输出；**没有导入材料时不会生成任何阅读任务**。仍未上线模块（真实输入/输出）在 UI 明示不可执行、不生成假任务。验证：`npm test` **134/134**、`npm run build` 成功、HTTP 200、真实浏览器（无头 Edge + CDP，独立 profile）smoke **44/44**（+ Phase 4 回归 36/36、Phase 3 回归 21/21）。远程质量门禁：GitHub Actions **Node 22/24 双绿**（run 39271191340 @ `6f7c889`）。真机移动端与真实 AI 供应商调用仍未验收。工程已关联 GitHub **Private** 仓库 `Huyaen/english-reconstruction-system`（源码备份 ≠ IndexedDB 学习数据备份）。

## 最快启动（Windows）

1. 解压整个 `vocabulary-app` 文件夹。不要只提取 index.html。
2. 电脑需要 Node.js 22 或以上；可在终端输入 `node -v` 检查。运行酒馆的电脑可能已经安装。
3. 双击 `start-windows.bat`，保持弹出的终端窗口开启。
4. 浏览器访问 **http://localhost:4173**。
5. 点击“导入词书”，选择文件，检查预览，确认导入。

交付包含 `dist`，**仅使用成品不需要 npm install，也无需联网下载前端依赖**。关闭终端会停止网页服务；学习记录仍留在浏览器中。下次重复上述步骤。

Mac / Linux：进入解压目录，运行 `node server.mjs` 或 `npm start`，再打开相同地址。

若提示 `node` 不是命令，先安装 Node.js；若提示 `EADDRINUSE`，说明 4173 已被占用，请关闭之前启动的本应用窗口，不要随意换端口以免找不到原数据。

## 日常使用

- **快速刷词**：选择词书和 50 / 100 / 300 / 500 / 1000 词，随机测试。不足所选数量时使用实际词数。
- **今日复习**：只选已经到期且测试过的词，按优先级排列。
- **弱词强化**：只处理不会和模糊词。
- **随机抽查**：从测试过的词中抽取，检验旧记忆。
- **识别阶段**：英→中 100%；**双向阶段**：可设 50/50、70/30、30/70，或在设置中自定义比例。
- 简单与普通是4选项；困难是6选项。库内需要至少4或6个能形成互不重叠选项的词。干扰项可来自全部词库，学习范围只决定被测试的目标词。
- 答对立即下一题；答错反馈可设0 / 0.5 / 1秒或手动继续。
- 错误、主动不知道、超时或较慢的正确回答，本轮稍后重测一次，避免无限循环。长期复习另按每词时间安排。
- `1`–`6` 选择，`Space` 不知道，`Enter` 下一题或从暂停恢复。
- 暂停与切换标签页不计入反应时间。每题提交后，用同一事务保存单词、记录和本轮进度。
- 保存并退出或刷新后，可从首页继续未完成训练。当前未提交题的计时会重新开始。

## 词书格式

支持 TXT、CSV、TSV、XLSX、XLS、JSON；Excel 读取第一个工作表。

TXT 推荐制表符分隔，也支持“英文 空格 中文”：

```text
abandon 放弃；抛弃
adequate 充足的
reluctant 不情愿的
```

多词短语推荐使用 CSV 引号或制表符，例如 `give up\t放弃`（这里的 `\t` 表示实际 Tab）。

CSV / Excel：

```csv
英文,中文,词性,音标,例句,搭配,等级,标签
abandon,放弃,v.,,Do not abandon hope.,abandon a plan,高中,核心
```

JSON：

```json
[
  {"word":"abandon","meaning":"放弃；抛弃","pos":"v."},
  {"en":"adequate","zh":"充足的","tags":["高中","核心"]}
]
```

字段支持中英文别名。空行跳过，格式问题在预览中列出；同一次导入中英文相同（忽略大小写）保留第一条。不同词书的同一单词独立保存学习记录。单文件限制25 MB。

词库支持搜索、按掌握状态筛选、优先级/字母/复习时间排序、词书重命名/删除、词条释义/词性/标签编辑、单词详情。筛选结果可导出 TXT / CSV / XLSX，或选前1000词测试。

## 阅读（Reading Lab，2026-10-19 新增）

- **入口**：左侧「阅读」。先导入一篇**真实**英文文章：粘贴正文 / 上传 TXT·MD·HTML / 填网址（拒绝本机与内网地址；遇到 CORS、登录墙、付费墙会说明原因，不会绕过）/ 上传截图（没有视觉模型或本地 OCR 时提供人工转录 + 确认，不做假识别）。
- **纪律**：打开文章**不显示全文翻译**；首读无辅助；只有你主动要 L0–L4 辅助时才给提示（L3 起算“看过答案”，本次理解只记接触）。
- **标记**：点正文里的词标记 知道 / 模糊 / 不知道 / 根据上下文猜出（可撤销）。词库里没有的词 **不等于** 你不会——这类词单独统计为“无证据”，不并入生词率。生词率区分「你点出来的（explicit）」与「按词库估算的（estimated）」，两者都带分母、样本覆盖与置信度。
- **难句**：每句可标“难”，选卡点类型后一键进 Phase 4 拆句训练；来自阅读的句子结构是**自动分析**（没有人工审校），练完只记接触、不推进语法掌握度，并会回到原来的段落。
- **重读与收尾**：重读单独计时（不与首读混算），可逐段走完；全文理解与一句话输出分开记录；自评永远标注为自评。
- **生词入库**：整理本次生词时，**没有释义的新词不会入库**（不编造释义）；入库后只增加一次 `reading` 来源的接触（exposure），不会提升任何掌握证据。
- **没有材料就不排任务**：没有导入文章时，今日计划中不会出现任何阅读任务（绝不造假文章）。

## 数据保存与备份

数据库：浏览器 IndexedDB `vocabulary-memory-v1`（当前 schema 版本 4）。所有版本升级均为「只加不删」的原子迁移（v1→v2→v3 均有 fixture 测试；旧词书与学习记录 100% 保留）；真实升级后首次启动会提示导出一次备份。对象仓库：books / words / records / sessions / analyses / meta + V2 新增 14 个 Learning Model 仓库（wordExposures、grammarConcepts、grammarAttempts、sentenceAttempts、passages、readingSessions、inputSources、inputSessions、outputAttempts、dailyPlans、miniUnits、skillSnapshots、weeklyDiagnostics、libraryItems）。V3 为 words 增加 FSRS 调度状态与预览结果字段。

**学习数据不在项目文件夹里。复制程序目录不能代替导出学习备份。** 请固定使用同一浏览器配置和 http://localhost:4173；localhost 与 127.0.0.1、不同端口、不同浏览器是不同存储空间。

“设置与备份 → 导出全部学习数据”包含词书、全部逐题记录、状态、复习时间、未完成训练、设置和AI报告。JSON 备份始终剔除 API Key。

换电脑：启动程序 → 设置与备份 → 导入备份 → 核对数量 → 确认替换。恢复会替换当前学习数据；建议先导出旧数据。程序先校验完整结构与引用，再通过单一事务替换，失败不会留下半份备份。

申请持久存储可降低自动清理风险，但不替代备份。无痕模式、手动清理站点数据、浏览器配置损坏都可能删除本地记录。

应用使用 Web Locks 防止多窗口同时修改同一数据库。另一个窗口已打开时，请关闭它再刷新。

## 算法概要

可配置默认阈值：秒答≤1.5秒、正常≤3秒、模糊<6秒、达到6秒或答错/不知道为不会。

这是本次反应的分类。**累计掌握状态更保守**：初次答对仍需后续证据；连续正确达到2次可进入正常；双向各≥2次正确、各方向正确率≥80%、至少3次到期成功、连续正确≥4且本次秒答，才判熟练。短时间反复刷同词不会拉长长期间隔。

间隔调度自 Phase 2 起由 **FSRS**（ts-fsrs 5.4.2）负责：目标保留率默认 0.9（设置页可调）；评分由「正确性 + 反应时间 + 历史证据」多因素映射（错误/超时→Again，慢正确→Hard，首次正式 Recall 封顶 Good，Easy 需秒答 + 连续正确 + 间隔证据）。旧调度器完整保留为可回滚选项（设置页「调度引擎」可切回）。每个词独立调度。

Priority 根据状态、总正确率、弱势方向、连续错误、遗忘、速度、混淆和逾期加权。详见 `docs/ALGORITHMS.md`。

“有效掌握”是目前尚未逾期的熟练词数，是保守估算，并非标准化测量的真实词汇量。中→英选择题也不能等同于拼写或自由输出。

干扰项综合词性、难度、字形、释义字符、邻近词和历史混淆。同义排除依赖词表明确提供的释义，不能语义理解全部近义词。

## AI API

在设置中填写 Endpoint、API Key、Model Name，保存后进入 AI 学情生成报告。

- Endpoint 支持类似 `https://你的服务地址/v1`，自动追加 `/chat/completions`；也支持完整该路径。
- 协议：OpenAI-compatible Chat Completions，POST JSON、Bearer鉴权、非流式响应。
- 由浏览器直连你配置的供应商；该服务必须支持 CORS。不会自动转发到其他服务，也没有内置代理。
- 发送的是汇总指标、30天趋势和最多60个弱词/混淆信息。点击“查看将发送的数据”可提前核对。
- 不勾选“记住Key”时只在当前页面内存保存；勾选后明文存于本机IndexedDB。完整备份始终不带Key。
- 60秒超时，HTTP错误和协议格式错误会明确提示。报告本地保存，建议不自动修改设置。
- 已通过协议适配测试；**未提供真实供应商凭据，尚未进行真实AI调用验收**。不要在聊天中发送Key，直接在自己的应用设置里填写。

## 开发

技术栈：TypeScript、Vite、原生DOM、IndexedDB、SheetJS、ts-fsrs 5.4.2（FSRS 调度，仅经 src/fsrs.ts 适配层使用）。测试使用 Node test runner、tsx、fake-indexeddb、jsdom；无外部数据库，无账户系统。

```bash
npm ci
npm run dev
npm test
npm run build
npm start
```

开发服务器默认4173。修改源码后必须重新构建，`npm start` 读取的是 dist。

目录：

| 路径 | 用途 |
|---|---|
| src/types.ts | 全部真实数据结构 |
| src/core.ts | 熟练度、优先级、调度、选项算法 |
| src/quiz.ts | 单题结果与session状态推进 |
| src/db.ts | IndexedDB事务与备份验证 |
| src/import.ts | 各格式解析与导出 |
| src/stats.ts | 今日/方向/趋势统计 |
| src/ai.ts | 数据摘要与实际API请求 |
| src/app.ts、ui.ts、style.css | 界面、事件、主题、响应式布局 |
| tests/ | 单元、数据、压力与DOM集成测试 |
| dist/ | 已编译成品，可直接本地服务 |
| server.mjs、start-windows.bat | 本地启动入口 |
| docs/ | 原始需求、方案、算法、验收报告 |

## 恢复开发协议

新会话先读取 `INITIAL_PROMPT.md`、`PROJECT_SPEC.md`、`AGENT_EXECUTION.md`、`STATE.json`、`CHECKPOINT.md`、`HANDOFF.md`、`TODO.md`、`DEVELOPMENT_LOG.md`；检查 `git status/log/tags/remote`、本地与远端 SHA（`git ls-remote origin`）、真实 DB 版本，并运行必要的 `npm test` / `npm run build`，从真实 `STATE.next_task_id` 与 HANDOFF Next Action 继续（当前为 Phase 6 Reinforcement AI）。浏览器验收脚本必须跑在**测试构建**上：`npm run build:test` → `node server.mjs --dir=dist-test --port=4173` → `node scripts/phase5-smoke.mjs` / `node scripts/phase4-smoke.mjs` / `node scripts/phase3-smoke.mjs`（独立 profile 无头 Edge/CDP，端口 9224）。详细 Github Sync / CI 协议见 `AGENT_EXECUTION.md`，最新 Phase 5 工作规格见 `docs/PHASE5_READING.md`（Phase 4 见 `docs/PHASE4_SENTENCE_GRAMMAR.md`，Phase 3 见 `docs/PHASE3_DAILY_PLANNER.md`）。

旧版 MVP 的遗留验收包括真实手机和真实 AI 服务；当前主要开发阶段依据 `STATE.json` 推进。Phase 2 已完成独立 Edge/CDP smoke，但不等于所有浏览器/手机已验收。详细历史见 `docs/TEST_REPORT.md` 与 `CHECKPOINT.md`。

第二阶段未实现：拼写、填空、搭配题、发音、AI生成例句/干扰项、PWA与多设备同步。

## V2 开发状态（English Reconstruction System V2）

本项目正在从「自适应背单词软件」升级为完整的 **Personal English Learning System**（V2）。产品规格见 `PROJECT_SPEC.md`，工程协议与阶段计划见 `AGENT_EXECUTION.md`。

- **接手入口（换模型/换会话必读）**：依次读 `PROJECT_SPEC.md` → `STATE.json` → `CHECKPOINT.md` → `HANDOFF.md` → `TODO.md` → `DEVELOPMENT_LOG.md`，再核对实际磁盘与 Git。
- **当前阶段**：见 `HANDOFF.md`（Phase 0 / 0.5 / 1 / 2 / 3 / 4 已完成并通过；当前 Phase 5 Reading）。
- **基线**：V1 MVP 基线 commit `6c1c625`（tag `v1.0.0-mvp-baseline`）；该提交已实测：`npm test` 20/20、`npm run build` 成功、`node server.mjs` 服务实测 200。
- **硬约束**：旧数据 100% 保留；审计 → 复用 → 扩展 → 迁移 → 验证；禁止无理由重写现有词汇模块。
- **源码格式**：`src/*.ts`、`tests/*.ts` 由 `docs/format-source.mjs` 整理为紧凑格式，编辑后请保持一致或重跑该脚本。


## 远程 CI（GitHub Actions，2026-10-19 新增）

- **用途**：在全新 GitHub Runner 上验证代码质量，不依赖本机环境、缓存或已装依赖。仅验证，不部署、不发布、不写仓库。
- **文件**：`.github/workflows/ci.yml`（权限 `contents: read`，无 secrets）。
- **触发**：push 到 `main`、向 `main` 发 PR、手动 `workflow_dispatch`。
- **检查项**：`npm ci` → `npx tsc --noEmit` → `npm test`（全量 node:test） → `npm run build` → Node 22 上 `git diff --exit-code -- dist`（dist 纳入 Git，跨平台可重复）→ 断言生产包内不含 `__labTest`（测试钩子隔离）。
- **Node 版本矩阵**：22、24。
- **失败日志**：仓库 Actions 页面 → 对应 run → 点失败 step 展开日志；或本地复现同样四步。
- **CI 不包含**：真实 AI 供应商调用、真实浏览器 E2E（仍用本地独立 profile 无头 Edge + CDP）、IndexedDB 用户学习数据备份。
- **测试钩子隔离**：`__ERV2_TEST_HOOKS__` 是构建期常量（`vite.config.ts`）。生产构建为 false → 钩子被摇树移除；`npm run build:test` 输出到 `dist-test/`（gitignore），才是验收脚本使用的产物。

## GitHub 私有远程仓库与跨会话恢复（2026-10-19 新增）

本工程预期关联用户授权的 GitHub **Private** 仓库（建议名 `english-reconstruction-system`），按**稳定任务**提交并 push、按**阶段验收**打 tag 并 push；远端 SHA/Private 状态必须实测，不推测。当前上传的离线文件包**没有证明已有 origin、已创建仓库或已 push**，详细协议见 `AGENT_EXECUTION.md`。

上传前必须扫描**全部准备推送的历史**，排除 API key、tokens、`.env`、用户学习数据、秘密 fixture；远端存在分叉不得强制推送；网络失败保留本地 Git 并记录 `STATE.remote_sync`。GitHub 版本库只备份被跟踪的工程文件；**浏览器 IndexedDB 的学习记录仍须使用应用内 JSON 导出独立备份**。

新 Hermes 会话直接读取 `START_HERMES.md`（完整版启动提示词）并按 `INITIAL_PROMPT.md` 的恢复优先规则工作。若项目本地文件晚于此文档更新包，应先三方对照合并，不能无条件覆盖较新状态。
