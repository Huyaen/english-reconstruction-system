# Phase 16.2 · 文案收口与检测器改造（最终报告）

分支 `phase16.2-copy-final-fix`　起点 `fc2eaf0`（Phase 16.1 收尾）
范围：只改「用户能看到的字」与「判断这些字有没有漏的检测器」；不改学习算法、数据结构、评分、IndexedDB v7、视觉系统；不合并 `main`。

---

## 一、这一轮要解决的问题（来自独立验收 FAIL）

上一轮独立验收给出 **FAIL**，理由是两类：

1. **功能说明与事实不符**
   - 句子页在「AI 已设置」状态下同时出现 `AI 生成的句子 0 句可用` 与 `现在是：… AI 生成的句子 40%`；
   - 同一页又说 `AI 生成句子这个功能还没有开放`，而页面下方就有可用的「AI 定向句」。
2. **常规路径仍有原始枚举上屏**
   - `状态 active`、`（none）`、`Light · 30–60 秒`、`已收藏到 Library`、`结构 ai_unverified`、`来源可靠性：ai_generated`、`authored 教学句`。
3. **检测器本身不可信**：用 7 个受控反例去扫，旧内核只抓到 2 个 —— 所谓「101 文件 0 命中」不构成证据。

本轮把这三类全部处理完，并额外修掉一个验证过程中发现的**功能性缺陷**（见 §五）。

---

## 二、根因，不是措辞

### 2.1 「0 句可用」与「占四成」并存

`src/sentenceSources.ts` 里把三个不同的概念压成了一个布尔：

```
available: input.aiConfigured     // 「填了密钥」= 「有 AI 句可用」
```

于是只要填了服务地址，`available.has('ai')` 就为真，`effectiveSourceMix()` 立刻把 40% 分给 AI —— 而句库里可能一句 AI 句都没有。同一处还有两个同类问题：`user` / `saved` 写死 `available: true`，所以用户一条自己的句子都没加时，界面仍宣称「你自己加的句子占四成」。

### 2.2 「还没有开放」

`generationUnavailableReason()` 是 Phase 15 时代留下的判断，那时 AI 生成确实没实现；Phase 6 实现之后它没被删除，只被改成了「不会伪造输出」，于是这句话变成了对已上线功能的否认。

---

## 三、改了什么（逐条对应）

| # | 位置 | 之前 | 现在 |
| --- | --- | --- | --- |
| 1 | `src/sentenceSources.ts` | `available = aiConfigured`；`user`/`saved` 恒为 true | `available` 一律 = **count > 0**；新增 `configured`（填了服务）、`canGenerate`（功能已实现）、`shortage`（为什么是 0 句）三个字段，互不顶替 |
| 2 | 同上 `effectiveSourceMix()` | 只要配置了 AI 就给 40% | 只有**真的有句子**的来源才参与比例；缺的那几成全给练习句，并逐条记录缺口原因（`shortages`） |
| 3 | 同上 `generationUnavailableReason()` → `aiGenerationNotice()` | 「功能还没有开放」 | 三态真话：未配置 / 已配置但没有 AI 句 / 已有 N 句；并明确「计划不会自己批量生成 AI 句」 |
| 4 | `src/uiLabels.ts` `sourceMixNote()` | 一句长句 + 缺项名称笼统 | 三句：计划比例 → 现在比例 → 缺的原因；缺口用短句（`SOURCE_SHORTAGE_SHORT`），不再出现「AI 服务已设置，但一句都还没生成和真实材料…」这种连读 |
| 5 | `src/uiLabels.ts` 新增 | 无 | `SOURCE_SHORTAGE_TEXT`、`SOURCE_SHORTAGE_SHORT`、`INPUT_SESSION_STATUS_TEXT`、`CAPTION_MODE_TEXT`、`INPUT_MODE_TEXT`、`INPUT_MODE_SHORT`、`TRANSCRIPT_PROVENANCE_TEXT`、`FEEDBACK_STATUS_TEXT` |
| 6 | `src/inputView.ts` | `状态 ${status}`、`（${baseline.captionMode}）`、`字幕分布 ${k} × ${v}`、`Main Idea / Personal Opinion / Short Retelling`、`来源 ${provenance}`、`模式 ${mode}` | 全部过映射；三个英文表单标签改中文（`文章主旨（用英文写一句）` / `你的看法（用英文写 1–2 句）` / `用自己的话复述（英文，3–5 句）`） |
| 7 | `src/inputReflection.ts` | `Light · 30–60 秒` / `Standard · 3–5 分钟` / `Deep · 深入输出准备` | `轻量复盘 · 30–60 秒` / `标准复盘 · 3–5 分钟` / `深入复盘 · 为写作输出做准备` |
| 8 | `src/app.ts` 收藏 toast | `已收藏到 Library（收藏不等于看完）` | `已收藏到素材库（收藏不等于看完）` |
| 9 | `src/app.ts` AI 结果卡 | `结构 ai_unverified`、`质量门：…` | `结构由 AI 生成，未核对`（复用既有 `STRUCTURE_TEXT`）、`内容检查：…` |
| 10 | `src/app.ts` AI 阅读结果卡 | `来源可靠性：ai_generated（不是真实出版物）` | `来源：AI 生成，不是真实出版物` |
| 11 | `src/app.ts` AI 元信息行 | `promptId@version · 指纹 xxxx · 模型 · structuredMode · 第 N 次通过 · 用量` | `模型 X（host）· 第 N 次尝试通过 · 用量：发送 A + 生成 B token`（去掉 promptId、指纹、结构化模式这些纯内部信息） |
| 12 | `src/app.ts` `aiErrorBlock` | `authored 教学句` | `练习句` |
| 13 | `src/app.ts` 拆句页 | `句子来源：${rec.sourceType}`、`结构来源：${…provenance}` | `练习句` / `结构人工标注` 等映射值 |
| 14 | `src/app.ts` 阅读页 eyebrow | `READING` | `冷读` |
| 15 | `src/app.ts` 统计页 | 无数据时 `0 次 · 0.00 秒` | 无数据时只写「还没有记录」 |
| 16 | `src/uiLabels.ts` `MASTERY_DISCLAIMER` | 「按证据次数算」 | 说清「次数 + 答对质量 + 两个方向 + 隔几天再答对」 |
| 17 | `src/outputView.ts` | `Major issue`、`${a.feedbackStatus}` | `主要问题`、`AI 已反馈 / AI 这次没连上…`（`FEEDBACK_STATUS_TEXT`） |
| 18 | `src/outputTransfer.ts` | 6 个英文话题（`a decision you made this week`…） | 中文话题；写作内容仍是英文 |
| 19 | `src/outputSelection.ts` | `topic: 'your own example'`（会显示在任务卡上） | `用你自己的例子` |
| 20 | `src/outputTask.ts` | `label: 'One Sentence'` 等（易被误当界面文案） | 改名 `enLabel`（界面只用 `zh`），并在 `outputCore.test` 里钉住 |
| 21 | `src/readingAnalytics.ts` | `旧会话没有 Phase 5 明细数据` | `旧会话缺少这次阅读的明细` |

---

## 四、检测器：从「能跑」到「能抓」

### 4.1 旧内核为什么给不出证据

三个结构性盲区（都不是漏配词表，而是解析方式不对）：

1. **逐行正则**：模板字符串跨行时整段取不到，而本项目的界面文案大量写在跨行模板里；
2. **`class=` / `value=` / `data-` 出现在 token 前 120 字符就跳过整行**：HTML 字符串几乎每行都有 `class=`，于是 `结构 ai_unverified` 被当成代码；
3. **整串只有一个 token 且在函数调用里**被当成代码：`esc('原因：ai-unavailable-reallocated')` 因此漏掉。

用 7 个受控反例（A 单行带 class 的 `saved`、B 跨行模板 `ai_unverified`、C span 包裹、D 跨行原因码、E toast 枚举、F 单 token 调用、G 无 class HTML）跑旧内核：**只抓到 E 和 G**。

### 4.2 新内核（`scripts/lib/copyLint.mjs`，AST 版）

- 用 TypeScript AST 取**真正的字符串字面量**（含跨行模板、含 `${}` 片段），不再按行猜；
- 按节点位置判断「会不会进 DOM」：HTML 模板 → 可见；`text/zh/passage/question` 等学习内容字段 → 不可见；`status/mode/sourceType/className` 等数据字段 → 不可见；比较分支 / `case` / 枚举数组 → 不可见；`esc/toast/title/metric/modal` 参数 → 可见；
- HTML 里只保留会说给用户听的属性（`title/aria-label/placeholder/alt`），`class/id/value/data-*` 里的值不再被当成文案；
- 新增规则：`raw-enum`（含「状态 active」「（none）」这类上下文形态）、`english-mode-name`（`Light ·` 这类档位名）；
- 例外清单只在内核里维护一份（`EXEMPT_FILES`），CLI 不再复制，避免两处漂移。

### 4.3 现在的检测能力（自证）

| 检验 | 结果 |
| --- | --- |
| 受控反例 A–G | **7/7 抓到**（旧内核 2/7） |
| 真实漏检句型（`状态 active`、`（none）`、`Light · 30–60 秒`、`结构 ai_unverified`…） | 全部抓到（`tests/phase16_2.detector.test.ts`） |
| 正控不误报（学习材料、数据键、比较分支、下拉 value、`abandon 放弃`） | 全部放行 |
| 全仓 `src/`（99 文件） | `{"files":99,"hits":0,"byRule":{}}` |
| 回归钉子（7 条已修泄漏不得回写） | 通过 |

注意：改检测器时顺手暴露了两个**假阴性之外**的问题，也一并修了 —— 旧 CLI 的例外清单与内核重复（会漂移）；`topic:` 曾被当成学习内容字段，导致英文话题漏检。

---

## 五、验证中发现的功能缺陷（并已修）

**「AI 定向句」对没有薄弱语法的用户永远失败。**

- 现象：点「生成定向句」，返回 `生成结果未通过校验。$.grammarTargets: 至少需要 1 项`。
- 根因：`app.ts` 把 `grammar.map(g => g.id)` 直接发出去；没有薄弱语法时是空数组，而生成契约要求 `grammarTargets ≥ 1`，校验必然失败。刚导入词库、还没做过拆句的用户全都命中。
- 修法（与「AI 强化阅读」既有做法一致）：新增 `aiGrammarTargets()`，没有薄弱语法时给一个默认可观察的语法点（定语从句），**并在面板上明说**「定语从句（默认）· 还没有薄弱语法，这次先用一个常见结构」，不假装是薄弱点；「将发送」的语法点数量同步为真实值。
- 证据：修复前该错误卡的截图与文本；修复后走完整条链路（拦截一次真实请求、返回受控响应）拿到结果卡，见 §六。

这是本轮唯一一处触及功能行为的改动，理由是：界面承诺「可以用你的薄弱词生成句子」，而它必然失败 —— 这属于「界面在说谎」，不属于文案偏好。

---

## 六、真实界面证据

环境：`dist/` 生产构建；`http://127.0.0.1:4193/`；干净 Edge profile；1440×900；浅色 + 深色。
数据：真实导入 16–32 词 CSV → 生成计划 → 预览 18 词 → 回忆测试 21 题（故意答错，随堂产生薄弱词）→ 结果页。
AI：填入本机假地址，**用 CDP 拦截那一次真实请求**返回受控响应（不联网、不落真实 Key），走完「生成 → 校验 → 结果卡 → 加入句库并开始练习」。

| 验收点 | 实测文本（逐字） | 截图 |
| --- | --- | --- |
| AI 未配置 | `AI 生成的句子 0 句（还没设置 AI 服务）`；`还没有设置 AI 服务：设置后可以在下面手动生成定向句，生成并加入句库，才会进计划。` | `sentence-no-ai.png` |
| AI 已配置但 0 句 | `AI 生成的句子 0 句（AI 服务已设置，但一句都还没生成）`；配比 `…因为还没有你自己添加的句子、还没有生成过 AI 句、还没有真实材料里的句子，这几成先由练习句补上。现在是：练习句 100%。`；说明 `AI 服务已设置，可以在下面生成定向句；加入句库后才会进计划。计划不会自己批量生成 AI 句。` | `sentence-ai-configured.png` |
| AI 结果卡 | `结构由 AI 生成，未核对`；`内容检查：全部检查通过`；`模型 mock-provider（127.0.0.1:4193）· 第 1 次尝试通过 · 用量：发送 812 + 生成 96 token`；按钮 `加入句库并开始练习` | `sentence-ai-result.png` |
| 输入会话页 | `验收主题 · 时长未知 · 计划 26 分钟 · 状态 进行中` | `input-session.png` |
| 冷测记录 | `已记录：听懂约 40%（无字幕） · 11月1日 13:46`；三个档位 `轻量复盘 · 30-60 秒` / `标准复盘 · 3-5 分钟` / `深入复盘 · 为写作输出做准备` | `input-coldtest.png` |
| 收藏 toast | `已收藏到素材库（收藏不等于看完）` | `input-toast.png` |
| 写作页 | `建议：换个句式、换个词 · 用你自己的例子`；`自由写 · 今天发生的一件小事` / `来自自由写` | `output.png` |
| 阅读页 | eyebrow `冷读` | `reading.png` |
| 拆句页 | `句子来源：练习句 · 结构来源：结构人工标注` | `sentence-lab.png` |
| 深色主题 | `dark-sentence` / `dark-input` / `dark-output` / `dark-books`，无溢出、无控制台错误 | `dark-*.png` |

控制台错误/警告：**0**；1440 宽度下 `scrollWidth - clientWidth = 0`。

---

## 七、自动化门禁

| 门禁 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | 0 |
| `npm test` | **416/416**（44.9s） |
| `npm run build` / `build:test` | 0 / 0 |
| `node scripts/phase16_1-copy-lint.mjs` | `{"files":99,"hits":0,"byRule":{}}` |
| `phase16_1-dom-scan.mjs` | `{"states":39,"hits":0,"selects":38,"errors":0}` |
| `phase16_1-overflow.mjs` | `{"views":84,"clipped":0,"docOverflow":0,"errors":0}` |
| `phase15h4-navsweep.mjs` | `{"pages":14,"brandHome":true,"failures":[]}` |
| 新增测试 | `tests/phase16_2.detector.test.ts` 8 条（检测器灵敏度 7 反例、真实漏检句型、正控、allow、全仓 0 命中、映射表覆盖、配比不虚报、掌握口径） |

测试总数从 407 → 416。

---

## 八、没有做 / 没验证到的

| 项 | 说明 |
| --- | --- |
| 真实 AI 服务 | 只用受控响应；真实模型下的输出质量不在本轮范围 |
| 阅读结果卡的 `ai_generated` | 未走「AI 强化阅读」成功路径（同一函数已改，但只有源码证据） |
| 语法页「大概掌握 / 还没练过」并置 | 说明已加，但本轮未构造「未练过」的语法卡截图 |
| 移动端 | 项目策略 PC 优先 |
| 视觉审美确认 | 仍需用户亲眼看；本轮不宣布任何审美结论 |

---

## 九、交付坐标

- 分支：`phase16.2-copy-final-fix`
- 提交：见本文件末尾的 `git log -1`（提交后回填）
- 审查包：`review-export/phase16_2-review.zip`
- 截图：`screenshots/phase16_2/`（13 张：9 浅色 + 4 深色）
