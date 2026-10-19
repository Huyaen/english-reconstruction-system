# Phase 5 · Reading Lab（阅读）

> 状态：**passed（2026-10-19，任务 `phase5_reading_009`）**。DB 仍为 **v4**（复用 Phase 1 的 `passages` / `readingSessions` / `wordExposures`，不新增 store、不做迁移，旧数据继续可读）。
> 本文档是该阶段的工作规格 + 验收记录。换会话/换模型时先读本文档再改阅读相关代码。

## 1. 这一阶段解决什么问题

让用户**真的读英文**，而不是继续做选择题：

- 导入一篇**真实**文章（不是 AI 编的教学段子），并且来源可追溯；
- 打开文章时**不显示全文翻译**，先无辅助地读一段，再记录“读懂了什么”；
- 在读的过程中**即时标记**卡住的词与句子，而不是读完后凭记忆回忆；
- 把难句**直接交给 Phase 4 的拆句训练**，练完回到原来的段落；
- 重读一遍，看“现在能不能更顺地直接读懂”；
- 最后把值得学的词**筛选后**交给词汇引擎（没有释义的新词不进训练）；
- 全程只把阅读当**接触（exposure）**，不当作掌握证据。

## 2. 新增模块（全部纯逻辑，不依赖 DOM / AI）

| 模块 | 职责 |
| --- | --- |
| `src/readingText.ts` | 无损规范化（CRLF/NBSP/软连字符/NFC/行尾空白/空行）→ 段落 → 句子 → 词元（带原文 span）；`contentHash` 内容指纹 |
| `src/readingImport.ts` | 导入流水线：来源校验 → 文本抽取 → 规范化 → 切分 → 元数据 → 预览 → 保存；每次失败返回结构化错误（code/message/hint/fallback/stage），绝不“部分成功却静默保存错误正文” |
| `src/readingDifficulty.ts` | 难度估算：四分类 known/uncertain/unknown/**no-evidence**；no-evidence 单独统计并压低置信度；语法薄弱抬高难度 |
| `src/readingEvidence.ts` | 结构化幂等证据（键 = `sessionId:type:key`）；自评置信度上限 medium |
| `src/readingSession.ts` | 会话状态机：`preview → cold-test → reading → comprehension → support → reread → whole-text → closing → completed`；分块、标记、辅助、难句、重读、收尾 |
| `src/readingVocabulary.ts` | explicit / estimated 生词率（带分母/覆盖/置信度/method）；学习候选分桶；新词种子（不带释义）；接触记录 |
| `src/readingSentences.ts` | 难句 → Phase 4 `SentenceRecord` 的 handoff；provenance 非 gold 时证据一律降级为“接触” |
| `src/readingAnalytics.ts` | 阅读指标与趋势：first-pass 与 re-read **分开**统计；样本不足时明确说不足 |
| `src/readingStore.ts` | 持久化（唯一 IO 层）：会话 + 接触 + 词汇单事务写入；阅读库查询 |
| `src/readingPlanner.ts` | 接入 Daily Planner：没有材料不排任务；未完成会话优先续读；上次自评过低才排重读 |
| `src/readingView.ts` | 阅读 UI 纯标记生成（导入区 / 预览 / 阅读区 + 侧栏 / 冷读 / 重读 / 全文 / 结果 / 生词整理） |
| `src/app.ts` | 阅读页接线（含从计划进入阅读任务、从阅读进入拆句并回到原段落） |

## 3. 关键纪律（写进代码与测试，不是文档口号）

1. **打开文章不显示全文翻译**；预览只给标题/来源/主题/难度估算与“先猜一下”。
2. **首读无辅助**；辅助必须用户主动索取，L3 及以上视为“看过答案”，本次理解只记接触。
3. **来源可追溯**：`sourceType` + `sourceReliability` + `contentHash`；URL 导入拒绝本机/内网/云元数据地址，CORS/超时/登录墙/付费墙按原因分类且**不绕过**。
4. **词库里没有的词 ≠ 用户不会**：no-evidence 单列，不并入生词率。
5. **生词率分 explicit / estimated**，两者都带分母、样本覆盖、置信度、method。
6. **阅读只是接触**：`wordExposures.sourceType='reading'`，掌握证据为 0；“被推荐/打开过”不构成任何证据。
7. **证据幂等**：`sessionId:type:key`，重复提交不新增不改写；自评 confidence ≤ medium。
8. **first-pass 与 re-read 绝不混算**：各自独立计时（`firstPassStartedAt/EndedAt`、`rereadStartedAt/EndedAt`）。
9. **没有材料就不生成阅读任务**；任务时长服从 Time Budget First。
10. **没有释义的新词不得入库**（不编造释义），只能标记待补释义。
11. **外部材料的结构不得冒充 gold**：无人工审校时 provenance 只能是 heuristic/manual，本次只记接触。

## 4. 验收证据（全部实跑）

| 项目 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npx tsc --noEmit -p tsconfig.json` | 0 error |
| 全量测试 | `npm test` | **134/134 pass**（Phase 5 新增 28） |
| 构建 | `npm run build` / `npm run build:test` | 成功；生产 `dist` 无测试钩子 |
| 浏览器验收 | `node scripts/phase5-smoke.mjs` | **44/44**（`dist-test` + `?test=1`，独立 profile 无头 Edge + CDP） |
| 回归 | `node scripts/phase4-smoke.mjs` / `node scripts/phase3-smoke.mjs` | **36/36** / **21/21** |

新增测试：

- `tests/readingCore.test.ts`（14）：文本/导入/难度/证据/词汇率的纯函数契约。
- `tests/readingSession.test.ts`（13）：状态机、分块、视图纪律、标记、辅助、难句、指标分离、证据幂等、持久化、计划接入。
- `tests/readingUi.test.ts`（1）：jsdom + fake-indexeddb 的完整端到端阅读流程（含“无释义不入库”“阅读只记接触”）。

浏览器验收脚本 `scripts/phase5-smoke.mjs` 另覆盖：测试钩子只在测试构建 + `?test=1` 存在；无材料时计划中无阅读任务；导入落库（来源/指纹/段落句子）；预览不含正文；冷读后进入首读；逐词标记 + 障碍证据；难句进拆句并回到原段落且标记仍在；重读真实计时并逐段走完；两次自评分开；收尾 `completed` 且会话落库唯一（含重读起止时间与幂等证据）；整理生词拒绝无释义入库、补释义后入库且掌握证据为 0、接触来源为 `reading`。

## 5. 测试期发现并修掉的真问题

1. **重读从未开始计时**：进入重读页只调用了 `finishFirstPass`，没有 `startReread` → `rereadStartedAt/EndedAt` 缺失，重读速度永远为空、总时长也少算重读部分。现在进入重读即计时（`support → reread`）。
2. **重读页只渲染第 1 段**：多段文章重读不完整却已经要求给整篇自评 → 补逐段导航（上一段/下一段），并让验收断言必须走完。
3. **生词入库路径崩溃**：保存生词时用 `CSS.escape` 拼选择器，环境缺失该 API 时直接抛错 → 改为按 `data-def` 收集用户填写释义。
4. **从阅读进拆句后丢失阅读上下文**：“返回”跳到句库 → 现在回到原段落，标记与难句都保留。
5. **拆句页的“只记接触”提示来得太晚**：原先只在作答后显示 → 进入即提示，并且返回按钮明确写“回到阅读”。

> 这些都不是靠读代码发现的，而是被 `tests/readingUi.test.ts` 与 `scripts/phase5-smoke.mjs` 抓出来的——这正说明端到端验收不可省略。

## 6. 明确未做（诚实边界）

- **截图自动 OCR**：本机未配置视觉模型/本地 OCR 时只提供“人工转录 + 用户确认”（`extractionMethod='manual'`，`sourceReliability='unknown'`），不做假识别；接入真实视觉能力后应走 `buildImageDraft`。
- **PDF / DOCX / EPUB**：不做本地解析（明示不支持并引导复制正文）。
- **词形还原**：不做；`lemma` 不可靠时留空，不猜。
- **AI 推荐与强化文章生成**：属于 Phase 6；当前阅读库排序只用启发式难度与“未读优先”。
- **个性化时间估算**：仍是集中配置的启发式常量（默认 110 wpm + 生词率修正）。
- 阅读接触只进 `wordExposures`，不参与任何掌握度计算——这是设计，不是缺陷。
