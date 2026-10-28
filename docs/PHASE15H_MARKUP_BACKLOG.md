# Phase 15h · 标记层缺口清单（15h.1 收尾后）

## 口径

原始材料是四个页面样式模块编写时留下的 `markup_gaps`，**共 39 条**（阅读 7、句子/语法 14、输入/表达 6、诊断/统计/考试 12）。
去重合并后是 **25 条**（同一元素在多处被重复提过）。上一版文档只数到 22 行、回执写"20 项"，两边都不准，以本文件的 25 条为准。

| 分类 | 数量 |
|---|---|
| 15h 收尾时已修 | 3 |
| 15h.1 本轮已修 | 14 |
| 15h.1 本轮部分修 | 2 |
| 未修（需改业务流程，或已有等价实现） | 6 |
| **合计** | **25** |

---

## 一、已修（15h 收尾）

| 位置 | 问题 | 处理 |
|---|---|---|
| `examView.ts:141` | 规格审计把 `s.totalScore ?? 'null'` 打印成字符串 **"null"** | 改 `—` |
| `app.ts` `drawTrend` | 零作答日渲染 `height:2px` 柱子，像"有 2 次" | `is-zero` + `height:0`，基线虚线刻度 |
| `app.ts` `#lab-sentence` | 英文原句缺 `lang="en"` | 补 `lang="en"` |

## 二、已修（15h.1，14 条）

每条 `data-*` / ARIA 都从真实业务字段派生，并配了**状态变化测试**（`tests/a11yState.test.ts` + `scripts/phase15h1-live-a11y.mjs`）。

| 位置 | 钩子 | 业务来源 |
|---|---|---|
| `app.ts:2505` 语法类别筛选 | `aria-pressed` | `grammarCategoryFilter` |
| `app.ts:2519` 概念卡 | `data-band` | `conceptStates[id].band`（五档） |
| `app.ts:2697` 句法步骤条 | `data-step` / `data-total` | `cur.stepIndex + 1` / `total` |
| `app.ts:2699` 句法选项 | `data-verdict="pending\|correct\|wrong\|neutral"` | `cur.answered` + `step.correctId` |
| `app.ts:2877` 句树块 | `data-clause-id` / `data-clause-kind` / `data-root` | `structure.clauses[].id/kind` |
| `app.ts:3453` 阅读库行 | `data-state="unread\|unfinished\|read"` | `r.unfinished` / `r.completed` |
| `readingView.ts:170` 侧栏标记行 | `mark-row mark-${judgment}` | `mark.judgment` |
| `inputView.ts:173` 字幕 | `.cue-time` / `.cue-text` 分列 | `c.startMs` |
| `outputView.ts:95` 自动保存 | `role="status" aria-live="polite"` | `input.saving` |
| `diagnosticsView.ts:46` 诊断指标 | `data-quality` / `data-evaluability` | `m.quality` / `m.evaluability` |
| `diagnosticsView.ts:66` 证据条 | `data-total` | 四类证据求和 |
| `examView.ts:56` 考试元信息 | `data-src` / `data-verified` | `item.provenance` / `item.verifiedStatus` |
| `examView.ts:65` 错因卡 | `data-reported="1\|0"` | `e.userReported` |
| `app.ts` 考试页签 | `aria-pressed` | `examTab` |

## 三、部分修（2）

| 位置 | 已做 | 缺什么、为什么停 |
|---|---|---|
| `app.ts:2877` 句树来源 | 容器带 `data-provenance`，块带 `data-root` | **逐块** provenance 做不到：`structure.provenance` 是整篇一个值（`gold`/`heuristic`/`none`），没有逐块字段。伪造"每块来源"就是造假，故只标容器。 |
| `app.ts:2877` 词块 | `data-clause-id` | 未加 `tabindex`：词块是 `<span title>`，全站几十个，逐个进 tab 序会把键盘用户困在句树里。要可聚焦得先设计 roving tabindex，属独立无障碍任务。 |

## 四、未修（6），附原因

| 位置 | 缺什么 | 为什么本轮不做 |
|---|---|---|
| `readingView.ts:100` | 正文难句 `is-difficult` | `sentenceHTML()` 拿不到"哪些句被标为难句"的集合（难句在 session 侧），要改渲染函数签名与数据流，属学习数据流改动。 |
| `readingView.ts:155` | `#read-idea-box` 的 `is-recorded` | "记录我的说法"目前只做即时反馈，**没有存储段意的业务状态**。加 `is-recorded` 等于凭空造状态。 |
| `readingView.ts:147` | `.reader-main` 的 `data-last` | 需要"当前段落是否末段"的视图状态；现在只在按钮文案里区分，属分页逻辑改动。 |
| `app.ts:291` | 阅读加载态 `aria-busy` | 阅读器是同步渲染，没有真实 loading 阶段；挂一个永远 false 的 `aria-busy` 是装饰。 |
| `app.ts:2553` | 掌握证据行拆成 `ev-outcome` / `ev-support` / `ev-kind` | 一行是拼接文本（日期 · 对错 · 独立/辅助 · 迁移 · 延迟 · 错型）。拆分要重排信息密度，属视觉重设计。 |
| `io` output 提示 | L1–L3 提示包进 `<details>` | 会改变"提示默认可见"的教学策略（写作时提示必须可见），属产品决策。 |

另有 2 条判定为**已有等价实现**，不加标记：

| 位置 | 现有等价 |
|---|---|
| `app.ts:1785` `.direction-stat` / `.metric` | 空值已用 `—` 文本表达；"活动量 vs 能力估算"需重新划分指标分类，属产品语义，不是样式缺钩子 |
| `examView.ts:27` 考试开关 | 原生 `<input type="checkbox">`，`:checked` 已能表达开/关；再加 `data-on` 是同一事实两份来源 |

## 五、测试如何证明这些状态是真的

- `tests/a11yState.test.ts`（7 项，jsdom）：先操作再断言变化。例如"未作答时所有选项 `pending`，答后恰有一个 `correct`，误选项数与反馈对错一致"。
- `scripts/phase15h1-live-a11y.mjs`（11 项，headless Edge + 真实 IndexedDB）：同一批断言在真实浏览器重跑，并要求 0 页面异常 / 0 控制台错误。
- 只断言"属性存在"的检查被删过一次：阅读库那条最初写成 `n >= 0`（恒真，等于没测），改成"导入文章 → 回库 → 行状态必须是 unread"。
