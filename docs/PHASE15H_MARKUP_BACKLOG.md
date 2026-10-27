# Phase 15h · 标记层缺口清单（供下一轮）

这四个页面样式模块在编写时，因为**不允许改 `app.ts`**，遇到一批"样式需要、但标记没给钩子"的地方。
这里按页面记下来，附 `file:line` 与建议钩子。已在 15h 收尾时修掉的，标注 ✅。

---

## 已修（本轮）

| 位置 | 问题 | 处理 |
|---|---|---|
| `examView.ts:141` | 规格审计把 `s.totalScore ?? 'null'` 直接打印成字符串 **"null"**——用户真的会看到 null | 改为 `—` ✅ |
| `app.ts:1810` `drawTrend` | 零作答日渲染内联 `height:2px` 的柱子，视觉上像"有 2 次"，且内联高度无法被样式覆盖 | 输出 `is-zero` + `height:0`，样式给基线上的虚线刻度 ✅ |
| `app.ts:2739` `#lab-sentence` | 英文原句缺 `lang="en"`，断行与朗读语音受影响 | 补 `lang="en"` ✅ |

## 待处理（按页面）

### 阅读（`reading.css`）

| 位置 | 需要什么钩子 | 为什么 |
|---|---|---|
| `readingView.ts:100` | 难句 `<span class="rsent">` 加 `is-difficult` 或 `data-difficult="1"` | 正文里现在无法给难句任何精确提示 |
| `readingView.ts:170` | `#read-marks` 的 `<li>` 加 `mark-${judgment}` | 侧栏清单无法复用正文四种下划线形状 |
| `readingView.ts:155` | `#read-idea-box` 提交后加 `.is-recorded` | 已记录的段意无法变成只读摘要 |
| `readingView.ts:147` | `.reader-main` 加 `data-last="true"` | 末段无法提示"读完即进入重读" |
| `app.ts:3453` | 阅读库 `<tr>` 加 `data-state="unread\|unfinished\|read"` | 行级入口状态目前只能靠颜色 |
| `app.ts:291` | `.reader-main` 加 `aria-busy` 或 `.is-loading` | 只能落回全局 `.d-loading` |

### 句子 / 语法（`sentence-grammar.css`）

| 位置 | 需要什么钩子 | 为什么 |
|---|---|---|
| `app.ts:2699` | `.lab-option` 加 `data-verdict="correct\|partial\|wrong"` | 作答后无法在原位标出正确边界（quiz 已有 `.answer.is-correct`） |
| `app.ts:2697` | `.lab-progress` 加 `data-step` / `data-total` | 步骤条只能静态分隔，显示不了 1/4 |
| `app.ts:2877` | `.tree-clause` 加 `data-clause-id` / `data-root` / `data-provenance` | 主句强调、按层缩进、逐块标注"未审校"都做不到 |
| `app.ts:2877` | `.token` 加 `data-clause-id` + 可聚焦 | 词块无法与所属子句联动，键盘/读屏拿不到依存信息 |
| `app.ts:2519` | `.concept-card` 加 `data-band` | 只能靠 badge 表达五档掌握度，卡片本身无层级 |
| `app.ts:2505` | `.chip.active` 补 `aria-pressed` | 键盘与读屏拿不到选中状态 |
| `app.ts:2553` | 最近证据行拆成 `ev-outcome` / `ev-support` / `ev-kind` | 正确/错误无法加左侧条与标签 |

### 输入 / 表达（`io.css`）

| 位置 | 需要什么钩子 | 为什么 |
|---|---|---|
| input 字幕 | 时间码独立成 `.cue-time` span（现在与正文同一文本节点） | 只能用 `text-indent` 近似对齐 |
| output 提示 | L1–L3 提示包进 `<details>` | 无法收起，长文写作时占屏 |
| output 保存 | `#out-save-state` 加 `aria-live` | 保存确认无法被读屏播报 |

### 诊断 / 统计 / 考试（`data.css`）

| 位置 | 需要什么钩子 | 为什么 |
|---|---|---|
| `diagnosticsView.ts:46` | `.diag-metric` 加 `data-quality` | 证据质量只存在文本里，自评/推断无法与可核对分开 |
| `diagnosticsView.ts:66` | 证据条加 `data-total="0"` | 四类全 0 时只能靠 `:not(:has(> i))` 兜底 |
| `app.ts:1785` | `.direction-stat` / `.metric` 加 `data-empty` / `data-kind` | 空值与"活动量 vs 能力估算"无法在样式上区分 |
| `examView.ts:56` | 题型/分值/来源 span 加 `data-src` | "官方改编"与"自建"只能同样式 |
| `examView.ts:65` | 错误归因行加 `data-reported="1"` | 用户自报与系统推断无法区分 |
| `examView.ts:27` | 开关加 `data-on` | 开/关两态只能靠文本 |

---

这些都不影响当前功能，只影响"能不能把状态画准"。下一轮做视觉精修时按表补钩子即可。
