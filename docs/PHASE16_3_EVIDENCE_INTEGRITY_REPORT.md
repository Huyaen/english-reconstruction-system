# Phase 16.3 · 证据完整性（Evidence Integrity）交付报告

> 分支 `phase16.3-evidence-integrity` · 基线 `495bce1`（Phase 16.2 交付点）· 不合并 `main`
> 本报告所有数据来自实机抓取与真实模块执行，未使用猜测值；凡未实测的项目在第十一节单列。

---

## 一、这一版在解决什么

Phase 16.2 把「界面说的是不是真的」收口了，但它收的是**文案**。审计（Codex 独立验收）指出的是更底下的一层：

> **「句子来源可靠」不等于「句法结构可靠」。**

AI 生成的句子，`structureProvenance = 'ai_unverified'`——系统自己都承认这份句法结构没人核对过。可是用户练完这一句，句子练习仍然按「独立作答」写入 `GrammarAttempt`，BKT 后验被推到 **0.6014**。界面写着「结构由 AI 生成，未核对」，数据库里却把这次作答当成掌握证据。**界面比数据库诚实，这本身就是缺陷。**

同一批问题还有三条：

- AI 面板承诺的目标语法（「定语从句（默认）」）与阅读实际请求的语法点（`clause.adverbial`）不是同一个；
- 生成定向句时用的是默认目标，保存进句库时又回头用 `aiWeakGrammar()` 重算了一遍，结果句库里的目标语法变成「—」；
- 句源说明在缺口存在时仍说「按计划比例」，把计划当成了事实。

Phase 16.3 只做一件事：**让「界面说的」「请求发的」「校验认的」「库里存的」「算掌握时用的」是同一个事实。**

---

## 二、修复前的现场（可复现，不是转述审计）

用 `495bce1` 的**真实模块**跑同一条输入：AI 来源、结构 `ai_unverified`、用户四步全对。

```
$ npx tsx before-probe2.ts        # 指向 495bce1 的 src
{
 "tree": "before@495bce1",
 "countsTowardMastery": true,
 "evidenceClass": "independent",
 "grammarAttemptsWritten": [
  "sa-mvn29s00-3ft7.clause.relative",
  "sa-mvn29s00-3ft7.structure.core",
  "sa-mvn29s00-3ft7.structure.modifier",
  "sa-mvn29s00-3ft7.structure.predicate",
  "sa-mvn29s00-3ft7.structure.subject"
 ],
 "conceptsAfter": [
  { "id": "clause.relative", "attempts": 1, "mastery": 0.6014 },
  { "id": "structure.core", "attempts": 1, "mastery": 0.6014 },
  { "id": "structure.modifier", "attempts": 1, "mastery": 0.6014 },
  { "id": "structure.predicate", "attempts": 1, "mastery": 0.6014 },
  { "id": "structure.subject", "attempts": 1, "mastery": 0.6014 }
 ],
 "attemptFields": { "structureTrust": null }
}
```

**一句 AI 句、四步全对，换来 5 个语法概念的 0.6014。** 这就是审计里那个数字的来源，也解释了为什么它会被当成「学得好」的证据。

同一个探针指向当前分支：

```
$ npx tsx after-probe.ts
{
 "tree": "after@HEAD",
 "countsTowardMastery": false,
 "evidenceClass": "independent",
 "grammarAttemptsWritten": [],
 "conceptsAfter": [],
 "attemptFields": { "structureTrust": "unverified" }
}
```

同一句、同样四步全对：**0 条语法证据，后验不动。** 注意 `evidenceClass` 仍然是 `independent`——这次作答**确实**是用户自己做的，我们记它是独立作答，只是不拿它当「掌握」的证据。这两件事必须分开，否则下一步就会把「接触」当成「会了」。

---

## 三、P1 逐条闭环

### P1-1 「来源可靠」被当成「结构可靠」

- **根因**：`sentenceEvidence.buildSentenceAttempt()` 只看步骤和提示级别算 `evidenceClass`，从不看 `structureProvenance`；`applyEvidence()` 拿到 `counts === true` 就写 `GrammarAttempt` 并推进 BKT。
- **修法**：新增 `src/sentenceTrust.ts`——把「这份句法结构能不能拿来算掌握」变成一个显式判定（`verified` / `unverified`），`AttemptDraft` 必须带上 `structureTrust`，`buildSentenceAttempt()` 返回 `{ attempt, klass, counts }` 时用 `eligible = structureTrust === 'verified'` 决定 `counts`；`applyEvidence()` 在 `!eligible` 时**只记 exposure**（`concepts[].exposures` 与 `sentenceAttempts` 照常写），不写 `GrammarAttempt`、不推 BKT、不记错误类型。
- **保守默认**：字段缺失（16.3 之前的历史数据、任何忘了声明的调用点）一律按 `unverified` 处理。宁可少算，不可多算。
- **反向保护**：人工审校的练习句（`gold`）仍走原路径正常计分——`tests/phase16_3.structureTrust.test.ts` 的正控与 `tests/phase16_3.appEvidence.test.ts` 的第二个用例都在钉这件事。

### P1-2 界面承诺 ≠ 实际请求 ≠ 库里存的

- **根因**：三处各自算了一遍目标——面板文案写死「定语从句（默认）」，阅读请求走 `aiGrammarTargets()` 的另一条分支（`clause.adverbial`），采纳入库时又用 `aiWeakGrammar()` 重新取一次（此时用户仍没有薄弱语法 → 空数组 → 句库里目标语法显示「—」）。
- **修法**：新增 `src/aiTargets.ts` 的 `aiTargetPlan()`，成为唯一出口：它同时给出 `words`、`targets`、`label`、`reason`、`isDefault`。句子面板、阅读面板、请求体、结果卡校验、入库记录**全部读同一个 plan**；`aiAdoptSentence()` 写 `plan.targets`，不再重算。
- **为什么不是「三处调用同一个函数就完了」**：`label` 与 `reason` 也由 plan 产出——「定语从句（默认）· 还没有薄弱语法」这句解释必须和 `targets` 同源，否则下次改默认值，文案又会漂。

### P1-3 「接触」与「掌握」在界面上没有区分

- **根因**：拆句结果页只有一句「自己答对」，用户无法知道这次算不算数。
- **修法**：结果页在「这次自己完成的程度」后面直接写清楚：可信结构 →「（会算进语法掌握）」；未核验结构 →「（这次答对了，但结构没核对，不计入语法掌握）」或「（这次没答对，结构也没核对，不计入语法掌握）」；两种都没有的一条橙色说明写全：「这句的语法结构还没有核对。本次练习已记录，但不会计入语法掌握度。」
- **实机文案**（`shots/lab-ai-result.png`）：
  > 这次自己完成的程度：自己答对（这次答对了，但结构没核对，不计入语法掌握）
  > 这句的语法结构还没有核对。本次练习已记录，但不会计入语法掌握度。（结构来源：这份结构是自动分析出来的，没有人工核对）

### P1-4 句源说明把计划当事实

- **根因**：`sourceMixNote()` 在「有缺口」的分支里仍以「按计划比例」开头，读者会理解成比例已经执行。
- **修法**：说明按三段走——「计划是……」→「现在是：真实库存」→「缺的那几成由练习句补上，还缺哪些来源」。库存为空时不再说「现在句库里有：」，直接说「一句都没有」；缺口存在时才列「目标里的 X、Y 目前还没有句子」。
- **实机文案**：
  > 现在句库里有：练习句 12 句。目标里的 AI 生成的句子、你自己加的句子、真实材料里的句子目前还没有句子。

---

## 四、修复前后 IndexedDB 对照（实机，真实点击，真实库）

采集方式：生产构建 + 干净 Edge profile + 真实导入 CSV → 真实练习 → 真实配置 AI（本机拦截）→ 真实点「加入句库并开始练习」→ 真实答题；随后用 CDP 直接读 `vocabulary-memory-v1`。

| 观测项 | 修复前 `495bce1`（模块级复现） | 修复后（实机首轮 AI 句） |
| --- | --- | --- |
| `sentenceAttempts[].structureTrust` | 字段不存在（`null`） | `'unverified'` |
| `sentenceAttempts[].masteryEligible` | 字段不存在 | `false` |
| `sentenceAttempts[].evidenceClass` | `'independent'` | `'independent'`（保留：确实是用户自己做对的） |
| `grammarAttempts` 新增条数 | **5 条**（`clause.relative` + 4 个 `structure.*`） | **0 条** |
| `grammarConcepts[structure.core].mastery` | `0.6014` | 未变化（该概念只有前面人工练习句留下的 1 次证据） |
| 语法页呈现 | 「练得比较稳」 | 这次 AI 句不参与，页面不出现新的高置信判断 |

实机 JSON 摘要（`audit-16_3.json` → `db`）：

```json
{ "id": "sa-mvxj6hzf-imnp", "sentenceId": "sen.ai.36wqaw", "sourceType": "ai",
  "evidenceClass": "independent", "structureTrust": "unverified", "masteryEligible": false }
```

`grammarAttempts` 在该次练习前后同为 5 条（`db.beforeAi = 5 → db.afterAi = 5`），即**这次 AI 句一句语法证据都没写**。

---

## 五、AI 目标：展示 / 请求 / 校验 / 保存 同源

句子侧实机文案（`shots/sentence-ai-result.png` 同页）：

> 目标词：genuine / abandon / emerge
> 语法：定语从句（默认） · 还没有薄弱语法，这次先用一个常见结构

同一次生成，CDP 拦截到的**真实请求体**里的语法 id 是 `clause.relative`（`audit.ai.requested.grammarSent = ["clause.relative","clause.relative"]`），与面板一致；采纳后句库记录的目标语法同样是 `clause.relative`，不再是「—」。

阅读侧：面板文案与句子侧同源；点击「生成强化文章」时拦截到的请求里，`clause.*` 命中仅 `clause.relative`，**`clause.adverbial` 出现 0 次**（`audit.ai.readingRequest = { grammarHits: ['clause.relative','clause.relative'], mentionsAdverbial: false }`）。这条请求被脚本故意按 500 处理，避免把模拟文章写进库。

---

## 六、内容检查的边界（「全部检查通过」到底通过什么）

任务书要求用「格式合法但内容重复」的文章验证：「程序可以报告基础检查通过；页面不声称事实与教学质量已经全面核实」。

我们直接调用 `checkReadingQuality()`（不经过生成链路）：

- 输入：同一句 `The notebook that the engineers kept recorded the current every spring.` 重复 11 次的文章，配套题目引文都能对上原文；
- 结果：`report.ok === true`，`summarize() === '全部检查通过'`；
- 而检查项清单只有：正文长度、目标词出现、目标语法可观察、题目能对上原文、答案键一致、难度理智性、陌生词负荷、**与历史生成重复**、安全渲染。**没有一项检查「事实是否真实」「段落是否连贯」「教学价值」。**

因此界面文案改成有边界的说法，并抽成常量 `AI_CHECK_SCOPE_NOTE`（`src/uiLabels.ts`）：

> 图卡上的「全部检查通过」只代表格式、词数、目标词、题目引文这些规则项——不代表内容的真实性或教学效果。

测试 `tests/phase16_3.sentenceSources.test.ts` 钉死三件事：`ok === true`（重复内容确实能过）、提示语必须点到「规则项」、提示语**不得**出现「事实正确 / 准确无误」这类越界表述。

---

## 七、测试

| 文件 | 条数 | 覆盖 |
| --- | --- | --- |
| `tests/phase16_3.structureTrust.test.ts` | 5 | 纯函数：信任判定、保守默认、可信结构仍计分、接触与掌握分离 |
| `tests/phase16_3.appEvidence.test.ts` | 2 | **真实 `app.ts`**（jsdom + fake-indexeddb + 真实点击 + 真实 IndexedDB）：AI 句走完一遍后库里 0 条语法证据、`masteryEligible=false`、重载后语法页不出现高置信；正控：人工练习句照常写 5 条证据 |
| `tests/phase16_3.aiTargets.test.ts` | 2 | `aiTargetPlan()` 的默认/薄弱分支；**真实请求体**（拦截 `fetch`）≠ `clause.adverbial`，且入库 `targetGrammar === plan.targets` |
| `tests/phase16_3.sentenceSources.test.ts` | 6 | 句源说明按库存说话、0 句来源不出现在「现在是」里、缺口才列举；`checkReadingQuality` 对重复内容仍 `ok` |
| 既有回归 | — | `tests/sentenceLab.test.ts` 的两处 draft 显式声明 `structureTrust: 'verified'`（它们都用人工标注练习句），`tests/sentenceUi.test.ts` 的文案断言同步 |

全量：**`npm test` 431 / 431 通过**（`39.2s`–`48.5s` 区间实测），基线 416 → 新增 15 条。

---

## 八、门禁与实机证据

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| 类型 | `npx tsc --noEmit` | exit 0 |
| 单元/集成 | `npm test` | 431/431，0 fail |
| 构建 | `npm run build` / `build:test` | exit 0 |
| 文案泄漏 | `node scripts/phase16_1-copy-lint.mjs` | `{"files":101,"hits":0,"byRule":{}}`（新增 2 个源文件，文件数 99 → 101） |
| DOM 文案扫描 | `scripts/phase16_1-dom-scan.mjs` | `{"states":39,"hits":0,"selects":38,"errors":0}` |
| 溢出 | `scripts/phase16_1-overflow.mjs` | `{"views":84,"clipped":0,"docOverflow":0,"errors":0}` |
| 页态/导航 | `scripts/phase15h4-navsweep.mjs` | `{"pages":14,"brandHome":true,"failures":[]}` |

门禁 JSON 原样保存在 `screenshots/phase16_3/{dom-scan,overflow,navsweep}.json`。

实机截图（`screenshots/phase16_3/`，9 张，3.0MB，生产构建、干净 profile、稳定后采集）：

| 文件 | 证明什么 |
| --- | --- |
| `sentence-no-ai.png` | 未配置 AI 时，句源说明只按库存说话，不承诺计划比例 |
| `sentence-ai-result.png` | AI 结果卡：目标语法「定语从句（默认）· 还没有薄弱语法」、来源与结构写人话 |
| `lab-ai-banner.png` | 进入拆句前就提示这句结构没核对 |
| `lab-ai-result.png` | 结果页「答对了，但结构没核对，不计入语法掌握」+ 橙色说明 |
| `lab-gold-result.png` | 正控：人工练习句走完整流程，正常计分 |
| `grammar-after.png` | 这次 AI 句之后语法页没有出现新的高置信判断 |
| `reading-ai-panel.png` | 阅读面板目标与句子侧同源 |
| `dark-sentence.png` / `dark-grammar.png` | 深色主题下同一批关键状态可读 |

---

## 九、历史数据影响识别（只读）

新增 `scripts/phase16_3-legacy-audit.mjs`：吃一份备份/导出 JSON，产出**只读**报告，绝不写库、不重算、不删除。

判定依据（三条各自的证据能力不同，报告里分列）：

1. **能确定**：`sentenceAttempt` 没有 `structureTrust` 字段，且它对应的句子 `structureProvenance !== 'gold'`，同时库里存在 `id` 以 `<attemptId>.` 开头的 `grammarAttempt` → 这条语法证据来自未核验结构，且当时被算进了后验。
2. **能推断**：句子是 `gold` / 有 `structure` 字段 → 即使没有 `structureTrust`，当时算进去也基本合理。
3. **不能确定**：句子已被删除、或 `structureProvenance` 缺失 → 只报「无法判断」，不猜。

用一份合成污染数据实测（`legacy-contaminated.json`，1 句 AI + 1 句 gold + 1 条孤立语法证据）：

```
legacy（没有信任字段）的句子练习：3 条
  ├─ 结构未核验且当时算了掌握：1 条（结构 AI 自动分析 → 影响 structure.core 等 2 个概念）
  ├─ 可能可信（gold/有结构）：1 条
  └─ 无法判断：1 条（对应句子已不在库里）
孤立语法证据（找不到对应练习）：1 条
```

**处理方式：不自动回滚。** 旧数据是用户真实练过的记录，删除或重算会破坏「历史不可改写」的约定；本版只保证**从此之后不再新增**，并给出识别方法供用户自行决定。

---

## 十、边界与已知限制

- **AI 路径用受控响应验证，不是真实模型输出。** 请求、校验、渲染、入库都是真的，唯独「模型写得好不好」不在证据范围内。阅读成功路径同样只有面板与请求侧证据——生成会污染真实库，本轮故意让它失败。
- **「结构可信」的判定标准是本轮定义的**：`gold` / 带人工结构标记 → `verified`；`heuristic`、`ai_unverified`、缺失 → `unverified`。这是保守策略，不是学术定义的「句法正确」。
- **旧数据不回填。** 见第九节。
- **语法图谱仍不是图谱**（34 张概念卡，非先修链可视化），属产品决策，本轮未动。
- **移动端未做专项**；深色只覆盖两个关键状态。
- **视觉审美仍需用户确认**——本版不改变视觉系统，也不宣布任何审美目标达成。

---

## 十一、未实测 / 不声称

- 真实模型（DeepSeek / OpenAI 等）生成的句子质量、以及真实模型下「目标语法提取」的准确率：未测。
- 真实用户历史库（浏览器里的既有数据）回填效果：未测（工具只做了合成样本）。
- 阅读成功路径的完整 UI 状态（生成 → 答题 → 保存）：未测，仅面板与请求侧。
- 移动端、平板、Safari/Firefox：未测。

---

## 十二、交付坐标

| 项 | 值 |
| --- | --- |
| 分支 | `phase16.3-evidence-integrity`（不合并 `main`） |
| 基线 | `495bce1`（Phase 16.2 交付点） |
| 修复提交 | `eb2ef92` — `fix(16.3): 未核验结构只记接触、AI 目标四端同源，语法掌握不再被 AI 句推高` |
| 产物提交 | `53aa8ab` — `build(16.3): 重新生成 dist`（首次 CI 在「dist 与源码不同步」这一步失败，重建后通过；该步按设计存在，未删改） |
| tag | `phase16.3-evidence-integrity` → `53aa8ab`（annotated，未移动任何旧 tag） |
| CI | run `41287868813`（Node 22 + Node 24）→ **success**；失败留痕：`41287566919`（dist 陈旧） |
| 审查包 | `review-export/phase16_3-review.zip`（32 项 / 3.2MB） |
| 未移动标签 | `phase16.2-copy-final` → `2af1bd7`（保持不动） |

## 十三、下一步建议（不在本轮范围）

1. 让「结构核验」有真实来源：模型返回结构化标注 + 规则校验通过 → 升为 `verified`，这样 AI 句才能合法地算掌握。
2. 旧数据回填做成**用户可选**的一次性迁移（先备份、只处理能确定的第 1 类）。
3. 语法图谱做成真正的先修链（产品决策）。

---

## 十四、P2 取证：首页「范围」下拉里的 `scan`

**结论：它不是界面文案，是词书名（用户数据），不改代码。**

证据链（每一环都能在源码里对上）：

| 环节 | 位置 | 事实 |
| --- | --- | --- |
| 控件标签 | `src/app.ts:416` `rangeControls()` | 写死的是 `范围`、`数量`、`方向`，全中文 |
| 第一项 | 同处 | `<option value="">全部词书</option>`，中文 |
| 其余项 | 同处 | `${data.books.map(b => '<option value="' + b.id + '">' + esc(b.name) + '</option>')}` —— 文字来自 `b.name`，即**词书名**，且 `esc()` 转义后原样显示，不做翻译或改写 |
| 书名怎么来的 | `src/app.ts:911` | 导入时「词书名称」留空 → `f.name.replace(/\.[^.]+$/, '')`，即文件名去扩展名 |
| 入库 | `src/app.ts:926` | `const book = { id: uid(), name, created: Date.now() }`，`name` 就是上面那个值 |
| 这次为什么是 scan | `scripts/phase16_1-dom-scan.mjs:75` | 门禁脚本为了造数据，上传的文件就叫 `scan.csv` |

所以下拉里出现 `scan` = 「用户导入了一个叫 scan.csv 的文件，没有另填名称」。用户可以在确认弹窗里改成中文名；换成真实用户的文件，这里就是那个文件名。**界面自带文字（范围 / 全部词书）本来就是中文，`scan` 属于学习材料与用户数据，按 Phase 16 的文案规范边界（不约束学习材料）不在管辖内。**

顺带说明：门禁脚本 `phase16_1-dom-scan.mjs` 已把 `range-book` 列进 `USER_DATA_SELECTS`（第 26 行），即它自己也知道这一列选项是用户数据、不参与文案判定；所以 `{"hits":0}` 与这条 `scan` 并不矛盾。

**回归断言**（`tests/phase16_3.bookName.test.ts`，2/2 通过）：

1. 首页「范围」下拉：`label` 含「范围」、首项为「全部词书」（界面中文）；种一本名为 `scan` 的词书后，该项文字**原样**为 `scan`、`value` 仍是词书 id（筛选行为不变）。
2. 导入弹窗：名称留空时选 `scan.csv` → `#import-name` 自动变成 `scan`（这就是它的来历），且该输入框可编辑（证明它是数据，不是界面固定文案）。

不建议为此改动任何代码：改 `scan` 只能靠「翻译用户数据」，那才是真正的错误（用户的书名会被系统篡改）。若希望取证截图更干净，正确做法是把门禁脚本里的 CSV 文件改名为中文，但那属于脚本观感、与产品无关，本轮不动。
