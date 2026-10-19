# Phase 4 · Sentence & Grammar（句子与语法）

> 交付日期：2026-10-19 · DB v4（additive）· 提交与 tag 见交付报告
> 依据：`PROJECT_SPEC.md` §46–§52 / §68 / §85；`REFERENCE_RESEARCH.md` §5.2（BKT-lite）；`AGENT_EXECUTION.md` §115（Module Research Gate）

## 1. 这一阶段解决什么问题

Phase 3 的计划把「句子与语法」标为未上线，因为当时没有任何真实句源与语法证据模型。
Phase 4 把它变成**真实可执行**的模块：

1. **语法知识图谱**：34 个显式概念节点 + 先修边，禁止循环先修；掌握度是 BKT-lite 估算，界面标注为"估算"。
2. **句源契约**：只用 authored 教学句（应用作者撰写，带中文预教词与 gold 结构），AI 未上线时明确声明"不会伪造"。
3. **引导式拆句（Sentence Lab）**：主语 → 谓语 → 宾语 → 修饰 → 从句 → 非谓语 → 逻辑 → 完整意；默认**不给**整句翻译；分层辅助 L0–L4。
4. **证据模型**：每次练习产出句子证据 + 每个覆盖语法概念一条证据；「看过答案」（L≥3）与「提示后正确」不推进掌握。
5. **自适应句选择**：难度由生词数 / 已知词覆盖率 / 从句层级 / 句长 / 目标结构共同决定，禁止只看长度。
6. **Planner 接入**：计划里生成真实句任务（`sentence-basic-structure` / `sentence-weak-grammar` / `sentence-transfer`），点击直接进入拆句，完成后回写任务状态。

## 2. 新增模块（全部纯逻辑，不依赖 DOM / AI）

| 模块 | 行数量级 | 职责 |
|---|---|---|
| `src/grammar.ts` | 690 | 语法图谱、先修边校验（成环即丢弃并报告）、BKT-lite 后验、掌握带、弱项信号、`seedGrammarConcepts` |
| `src/sentenceStructure.ts` | 327 | 句子结构表示（token + clause 树）、`validateStructure`（越界/非法 head/自环/环/重复一律拒绝）、`structureRows`/`structureMetrics` |
| `src/sentenceSources.ts` | 495 | 句源契约、12 条 authored 教学句 + gold 结构 + 预教词、来源能力与混比、用户自定义句入口 |
| `src/sentenceLab.ts` | 342 | 拆句步骤生成、分层辅助、即时反馈与错误类型、证据分级、迁移任务 |
| `src/sentenceEvidence.ts` | 248 | 证据写入（幂等键 = 会话 + 句子）、聚合最保守结果、JIT 知识卡 |
| `src/sentenceSelection.ts` | 324 | 难度估计、弱点信号、自适应选句（含预教词兜底）、Planner 句任务描述 |
| `src/sentenceGraphMap.ts` | 59 | 句 ↔ 语法概念映射 |
| `src/sentenceStore.ts` | 73 | 句库 / 证据持久化（复用 db.ts 索引） |

改动文件：`src/types.ts`（Phase 4 类型 + `Data.sentences` + `glossary`）、`src/db.ts`（v4 additive：`sentences` store、`grammarTags` multiEntry 索引、备份校验补 glossary）、`src/planner.ts`（capability gate 打开 sentence + `makeTask` 载荷）、`src/app.ts`（句子页 / 拆句页 / 语法图谱页 / 任务接线）、`src/style.css`。

## 3. 关键纪律（写进代码与测试）

- **不伪造**：AI 句与会话外外部语料在未接入时只声明 `unavailable`；句库页明写「不会伪造」。
- **不循环**：先修边成环 → `validateTaxonomy` 丢弃该边并报告；图谱页显示「图谱自检：通过（无环、无缺失先修）」。
- **不越级**：先修未达 `learning` 阈值的概念不出「弱项任务」，先补先修（`prerequisite-repair` 原因可见）。
- **不泄露答案**：作答前选项**不带**成分解析（早期实现把「主句主语」写在选项上 = 答案泄露，已修）；整句中文只在结果页出现。
- **不虚报掌握**：辅助 ≥ L3 的证据类为 `exposed`，只计 exposure；只有 `independent` / `transfer` / `delayed` / 独立错误（`error`，负证据）进 BKT。
- **不被生词卡死**：authored 教学句带预教词释义；有释义的词不计入「未知生词」，但会在训练页以 `预教词` 面板先给出。无释义且生词过多的句子仍然拒绝出题。
- **幂等**：同一会话重复提交同一句只算一次；**不同会话**再练同一句是合法的第二次练习（按会话去重，不按"同句 + 时间窗"去重——后者会吞掉真实练习）。

## 4. 验收证据（全部实跑）

```
npx tsc --noEmit -p tsconfig.json           → 0 error
npm test                                    → 106/106 pass（Phase 3 的 69 + Phase 4 的 37）
npm run build                               → 成功（dist 已同步提交）
node scripts/phase4-smoke.mjs               → 36/36（真实无头 Edge + CDP，独立 profile）
node scripts/phase3-smoke.mjs               → 21/21（回归：计划/隔夜/Re-entry 未被 Phase 4 破坏）
```

Phase 4 浏览器冒烟覆盖：句源诚实标示 → 预教词可见 → 作答前不泄露成分 → 拆句 4 步（主语/谓语/从句/意义）→ 结构树逐词对齐 → 证据落库（`independent`）→ 概念后验上升 → 句库使用次数 → 迁移验证（记录来源句）→ L3 看答案不计掌握（所有概念 mastery 不变）→ 图谱自检 + 概念详情（知识卡/最近证据/真实训练句）→ 计划内真实句任务（绑定真实 id、预算内、可开始）。

新增测试：`tests/grammar.test.ts`（7）、`tests/sentenceStructure.test.ts`（6）、`tests/sentenceLab.test.ts`（11）、`tests/sentenceSources.test.ts`（6）、`tests/sentenceSelection.test.ts`（6）、`tests/sentenceUi.test.ts`（2，jsdom + fake-indexeddb 全流程）。

## 5. 测试期发现并修掉的真问题

1. `evidenceClass` 曾把「独立作答错误」归为 `exposed` → 改为独立错误即 `error`（负证据），并补进 `SentenceEvidenceClass`。
2. 支持等级映射差一（L4 拿不到最后一条提示）→ 修正为 L4 = 末条提示。
3. `spanOf` 跨从句取错候选 → 必须按 `clauseId` 过滤。
4. gold 结构 spec 的 clause 区间/父子关系错 → 修数据侧，不放宽校验器。
5. 难度只看长度 → 改为多维（生词/覆盖率/从句层级/长度/目标结构）。
6. 小词库用户永远选不到句子 → 用 authored 预教词解决，而不是放宽"生词过多即拒绝"的规则。
7. 幂等键用「同句 + 2 秒窗」→ 会吞掉同一天内的第二次真实练习，改为「会话 + 句子」。
8. 选项解析写在作答前 = 把答案摆在选项上 → 作答后才展开解析。
9. 图谱页「已有证据 N」与「还没有足够的语法证据」自相矛盾 → 文案改为按证据量如实解释判定门槛（≥3 次且 p<60%）。
10. 概念卡缺先修可见性 → 每张卡显示可点击的先修概念。

## 6. 明确未做（诚实边界）

- 真实 AI 句生成 / 外部语料（实时新闻、书摘）：**未接入**，UI 明示不可用，不生成假句。
- 阅读 → 拆句的 handoff（`reading-handoff`）：未上线，句源混比里标为不可用。
- Mini Diagnostic 的非词汇子测试、个性化时间估算：仍留待后续阶段。
- BKT-lite 参数为启发式起点（prior 0.25 / learn 0.15 / guess 0.25 / slip 0.1），**未用用户数据拟合**；界面一律标注"估算"。
