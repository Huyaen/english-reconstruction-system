# TODO — English Reconstruction System V2

> P0 = 当前阶段必要；P1 = 重要；P2 = 后续优化。
> 任务状态以 `STATE.json` 为准（task_id 一一对应）。

## P0 — Phase 2 Vocabulary V2（进行中）

- [x] `phase0_5_reference_research_004`：GitHub 参考调研（候选 40+、深挖 12）→ `REFERENCE_RESEARCH.md`（Adopt / Adapt / Reject）✔ 2026-10-04
- [x] `phase1_db_migration_001`：IndexedDB v1→v2 versioned migration 框架（只加不删、原子升级）+ 迁移测试 ✔ 2026-10-04（tests/migration.test.ts）
- [x] `phase1_learning_model_stores_002`：新增 14 个 Learning Model stores + 16 组索引 ✔
- [x] `phase1_word_upgrade_003`：Word 三维能力（recognition/activeRecall/productive）、exposure、来源字段 + 旧数据默认值迁移 ✔
- [x] `phase1_backup_v2_004`：备份格式 v2（含新 stores；兼容读入 v1 备份）✔
- [x] `phase1_model_api_005`：Learning Model 查询层（src/model.ts，索引化，避免全表扫描）✔
- [ ] `phase2_vocabulary_v2_006`：ts-fsrs 调度替换（评分映射）+ v2→v3 迁移（Word.fsrs）+ Preview / 生命周期 / 多词池 / Learning Value

## P1 — 后续开发阶段（AGENT_EXECUTION.md Phase 2–13）

- [ ] Phase 2 Vocabulary V2：Preview、word lifecycle、三维 mastery、多词池选词、Learning Value Score、forgotten 回流、exposure 证据、动态新词量
- [ ] Phase 3 Daily Planner：Time Budget First、状态三档、Yesterday Recall、每日计划生成、动态调整（≤20–30%）、Closing Loop、中断/恢复
- [ ] Phase 4 Sentence & Grammar：Sentence Lab（混合句源、拆句流程、Sentence Tree）、Grammar Knowledge Graph、Just-in-Time 知识卡、证据追踪
- [ ] Phase 5 Reading：文章导入（文本/URL/图片 OCR 适配）、Layered Reading、生词即时标记+后置筛选、难句交接、re-read、阅读分析
- [ ] Phase 6 Reinforcement AI：条件化句子生成、强化文章生成、严格 JSON schema、prompt 版本化（prompts/ 目录）
- [ ] Phase 7 Mini Unit：2–3 天状态机、Anchor Material、targetWords/targetGrammar、Day1/2/3 推进
- [ ] Phase 8 Input Hub：输入库、手动视频记录（title/url/topic/duration/captionMode/selfReported）+ 复盘工作流；**不含视频 AI 分析**
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
