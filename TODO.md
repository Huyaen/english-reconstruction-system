# TODO — English Reconstruction System V2

> P0 = 当前阶段必要；P1 = 重要；P2 = 后续优化。
> 任务状态以 `STATE.json` 为准（task_id 一一对应）。

## P0 — GitHub Remote 基础设施（已完成并核验）

- [x] `infra_github_remote_001`：既有 remote 检查（当时为空）→ 历史 secrets 审核（0 命中）→ 创建 GitHub **Private** 仓库 `Huyaen/english-reconstruction-system` → 关联 origin → push main + 3 个阶段 tag → `git ls-remote`/API 核验 SHA 与 private 状态 ✔ 2026-10-19

## P0 — GitHub Actions CI（passed 2026-10-19）

- [x] `infra_github_actions_ci_002`：`.github/workflows/ci.yml`（Node 22/24：npm ci → tsc → 全量测试 → 构建 → dist 一致性 → 生产包无 `__labTest` 断言）· 测试钩子构建期隔离（`__ERV2_TEST_HOOKS__` + `dist-test`）· `server.mjs --dir/--port` · STATE 纠错（`current_phase=phase_5_reading`）· 长期 Task/Phase 门禁写入 `AGENT_EXECUTION.md` ✔ 远程 run 39271191340 @ `6f7c889` 双绿

## P0 — Phase 4 Sentence & Grammar（passed 2026-10-19）

- [x] `phase4_sentence_grammar_008`：语法知识图谱（34 概念 / 6 类 / 先修边，禁循环）· 句源契约（12 条 authored 教学句 + gold 结构 + 中文预教词）· 引导式拆句（L0–L4 分层辅助 / 即时反馈 / JIT 知识卡 / 迁移验证）· 证据分级（exposed 不计掌握；幂等=会话+句子）· 自适应选句（多维难度 + 先修修复）· Planner 真实句任务（sentence-basic-structure / sentence-weak-grammar / sentence-transfer）· DB v4 additive ✔（106/106 tests + build + 浏览器 smoke 36/36，Phase 3 回归 21/21）

## P0 — Phase 3 Daily Planner（passed 2026-10-19）

- [x] `phase3_daily_planner_007`：Time Budget First（20/30/45/60/自定义）· 状态三档 · Yesterday Recall（真实隔夜抽样 + 保留率 + 校准）· 计划生成（复用 recommendedNewWordCount/buildNewWordQueue/effectiveDue）· 五模块 Task Contract + Capability Gate · 动态调整（Start/Skip/Delay/Replace，±30%）· Closing Loop（3–5 分钟 + 难度反馈）· 中断恢复（1 天 / 2–3 天 Re-entry / ≥7 天 Mini Diagnostic）· 持久化与刷新恢复 · 不积学习债 ✔（69/69 tests + build + HTTP + 浏览器 smoke 20/20）

- [x] `phase0_5_reference_research_004`：GitHub 参考调研（候选 40+、深挖 12）→ `REFERENCE_RESEARCH.md`（Adopt / Adapt / Reject）✔ 2026-10-04
- [x] `phase1_db_migration_001`：IndexedDB v1→v2 versioned migration 框架（只加不删、原子升级）+ 迁移测试 ✔ 2026-10-04（tests/migration.test.ts）
- [x] `phase1_learning_model_stores_002`：新增 14 个 Learning Model stores + 16 组索引 ✔
- [x] `phase1_word_upgrade_003`：Word 三维能力（recognition/activeRecall/productive）、exposure、来源字段 + 旧数据默认值迁移 ✔
- [x] `phase1_backup_v2_004`：备份格式 v2（含新 stores；兼容读入 v1 备份）✔
- [x] `phase1_model_api_005`：Learning Model 查询层（src/model.ts，索引化，避免全表扫描）✔
- [x] `phase2_vocabulary_v2_006`：ts-fsrs@5.4.2 调度（shadow→默认+回滚）、DB v3、Rating 映射、Preview→Recall、三维证据、多词池/Learning Value/动态新词量、UI ✔ 2026-10-04（39/39 tests + 浏览器 smoke）
- [x] `phase3_daily_planner_007`：Time Budget First / 状态三档 / Yesterday Recall / 计划生成 / 动态调整 / Closing Loop / 中断恢复（调用 recommendedNewWordCount 等已就绪 API）✔ 2026-10-19

## P0 — Phase 8 主体 Real Input Hub（已完成并核验 2026-10-21）

- [x] DB v6 + 输入域类型
- [x] URL/字幕/材料/库/复盘/状态机/证据/推荐/交接/难度/存储/动作/视图/规划 14 个模块
- [x] Input Hub 页面与 Planner 接入
- [x] 275/275 单测 + 34/34 浏览器 + 六阶段回归
- [x] `docs/PHASE8_REAL_INPUT_HUB.md`（L1–L12 + AC1–AC14）

## P0 — Phase 10 能力诊断（已完成并核验 2026-10-22）

- [x] 指标注册与分域采集（词汇/语法/阅读/输入/表达/翻译依赖）
- [x] D1/D7/D30 固定窗口 + 样本门槛（不补算、不插值）
- [x] 证据质量分层（可核对/行为/自评/混合）与置信度降级
- [x] 可比性（同长度窗口、两侧达标）与零变化过滤
- [x] 固定规则短板判定 + 证据不足不下结论
- [x] 今日快照 / 本周诊断（幂等、可选字段、DB v6）
- [x] 看板（结论、证据条、保持率、分域、变化、下周行动、历史）
- [x] Planner 显式焦点（只重排柔性任务，不改时长）
- [x] 325/325 单测 + 16/16 浏览器 + phase3–9 回归
- [x] `docs/PHASE10_DIAGNOSTICS.md` + `docs/PHASE10_RESEARCH.md`

## P0 — Phase 9 主体 Output Lab（已完成并核验 2026-10-21）

- [x] 任务契约 + 六类真实表达任务（一句话也能完成）
- [x] 分层辅助 L1–L4（用户主动；L4 后不算独立掌握）
- [x] Communication Repair（有依据才判定意思保留）
- [x] 确定性检查 + 反馈契约/质量门（span 必须真实存在）
- [x] 产出证据（独立性/辅助/照抄；幂等、有界）
- [x] 修改分类（self / after_hint / after_model / copied）
- [x] 迁移与延迟任务接口（换语境，不复用原答案）
- [x] 任务选择（单元/输入/阅读/薄弱词/自由表达；无材料不编来源）
- [x] Planner 接入（只在有任务契约时排；不超预算）
- [x] Mini Unit 关联展示（不自动完成学习日）
- [x] 308/308 单测 + 20/20 浏览器 + 七阶段回归
- [x] `docs/PHASE9_OUTPUT_LAB.md`（L1–L12 + AC1–AC14）

## P1 — 后续开发阶段（AGENT_EXECUTION.md Phase 2–13）

- [x] Phase 2 Vocabulary V2：Preview、word lifecycle、三维 mastery、多词池选词、Learning Value Score、forgotten 回流、exposure 证据、动态新词量（已于 2026-10-04 文档验收）
- [x] Phase 3 Daily Planner：Time Budget First、状态三档、Yesterday Recall、每日计划生成、动态调整（≤20–30%）、Closing Loop、中断/恢复 ✔ 2026-10-19（验收：docs/PHASE3_DAILY_PLANNER.md §13）
- [x] Phase 4 Sentence & Grammar：Sentence Lab（混合句源、拆句流程、Sentence Tree）、Grammar Knowledge Graph（34 概念 + 先修边）、Just-in-Time 知识卡、证据追踪 ✔ 2026-10-19（验收：docs/PHASE4_SENTENCE_GRAMMAR.md §4）
- [x] Phase 5 Reading（`phase5_reading_009`）：文章导入（粘贴/文件/URL/截图人工转录，来源+指纹可追溯）、Layered Reading（首读无辅助、不显示全文翻译）、生词即时标记 + 后置筛选入库（无释义不入库）、难句交接（复用 Phase 4 `sentenceLab`，自动结构只记接触）、re-read（真实计时，与首读分开）、阅读分析（explicit/estimated 生词率）✔ 2026-10-19（验收：docs/PHASE5_READING.md §4）
- [ ] Phase 6 Reinforcement AI（下一个任务 `phase6_reinforcement_ai_010`）：条件化句子生成、强化文章生成、严格 JSON schema、prompt 版本化（prompts/ 目录）
- [ ] Phase 7 Mini Unit：2–3 天状态机、Anchor Material、targetWords/targetGrammar、Day1/2/3 推进
- [x] Phase 8 补充：Dynamic Interest Profile（兴趣画像 + 推荐理由 + 探索位 + 13 单测 + 19 浏览器断言）
- [x] Phase 8 补充：Dynamic Interest Profile（兴趣画像 + 推荐理由 + 探索位 + 13 单测 + 19 浏览器断言）
- [ ] Phase 8 主体：Real Input Hub 主体：Real Input Hub Input Hub：输入库、手动视频记录（title/url/topic/duration/captionMode/selfReported）+ 复盘工作流；**不含视频 AI 分析**
- [ ] Phase 9 Output Lab：summary/retelling/opinion、诊断优先反馈、Current Level +0.5 升级、结构化证据
- [ ] Phase 10 Diagnostics：Dashboard、Skill Snapshot、Weekly Diagnostic、retention（D1/D7/D30）、unknown rate、translation dependence、趋势图
- [ ] Phase 11 Exam Transfer：错题分类（Vocabulary/Structure/Logic/Evidence/Overthinking/Time）、结果回馈 Learning Model
- [ ] Phase 12 Full Integration：Start Today's Training 串通全部模块
- [ ] Phase 13 Hardening：性能、移动端、offline、API 失败、DB migration 测试、E2E、文档

## P1 — 旧项目遗留验收（保留）

- [ ] 真实浏览器桌面/手机可视化验收（本机用 CDP 无头 Edge 补验；建议 Phase 13 统一执行）
- [ ] 真实供应商 AI 调用验收（需用户自行在应用设置填凭据；勿在聊天中提供 Key）
- [ ] 真实浏览器长期大数据库（数万词、数千题）性能与容量实测

## P2 — 后续优化

- [ ] 拼写题、句子填空、搭配题、发音
- [ ] AI 解释混淆词 / 生成例句 / 生成干扰项
- [ ] 每日历史弱词存量曲线（当前已有当日净变化）
- [ ] PWA、离线、多设备同步
- [ ] 个体记忆参数校准（FSRS Optimizer 类方案）

## P0 — Phase 5.1 真实截图 OCR（已完成并核验）

- [x] `phase5_1_local_ocr_011`：tesseract.js 本地 Wasm OCR + 懒加载 + 单 worker 串行 + 超时/取消释放 + 失败分类（格式/大小/模型/解码/空结果/取消/超时）+ 用户确认门禁 + 真实截图 fixture + 真实浏览器验收 26/26 ✔ 2026-10-20

## P0 — Phase 6 Reinforcement AI（已完成并核验）

- [x] `phase6_reinforcement_ai_010`：AI Service Layer + 结构化输出校验 + Prompt 版本化 + 定向句/强化阅读 + 质量门 + 证据纪律 + 隐私/用量 + 失败降级 + DB v5 + 真实浏览器验收 31/31 ✔ 2026-10-20

## P0 — Phase 7 Mini Unit（已完成并核验）

- [x] `phase7_mini_unit_012`：状态机 + 主题推荐 + Anchor/目标 + Day 1–4 + 迁移与完成判定 + 证据 + 持久化/并发 + Planner 集成 + UI + 文档 + 真实浏览器验收 33/33 ✔ 2026-10-20


## P0 — Phase 11 考试迁移（passed 2026-10-23T20:04:05+08:00）

- [x] `phase11_exam_transfer_011`：官方规格审计（2026 确认 / 2028 未知）· DB v7 五个 additive store · 题目来源/答案/审核状态契约 · 统一测评状态机 + revision · 客观与开放分开计分 · 六类错因 + 用户修正 · 新题迁移复测 · 15–25 分钟周测 · 默认关闭的考试计划 · exam 域诊断指标 · 真实浏览器 16/16


## P0 — Phase 12 考试记录与分值一致性（passed 2026-10-23T21:55:13+08:00）

- [x] `phase12_exam_log_012`：校内/月考/模拟/自定义四类 · 类别/年份/满分与规格一致 · 官方分值冲突显式确认 · 2028 暂定不预填 · 得分边界 · self_reported 强制 · 自评仅线索 · 刷新/编辑/删除/导出/恢复 · phase12 smoke 17/17
