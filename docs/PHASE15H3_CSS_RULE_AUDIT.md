# Phase 15h.3 · CSS 规则审计（P0-3.1 ~ 3.3）

本轮只做一件事：把「作用域选择器写错导致规则从未生效」这件事查清、分类、按批修复，并证明修复没有把视觉弄坏。
不重新设计、不改学习逻辑、不动 IndexedDB。

机器可读清单：`screenshots/phase15h3/css-rule-audit.json`（1139 条规则逐条记录：ID / 文件 / 行号 / 选择器 / 条件组 / 目标页与状态 / 修复前命中 / 修复后命中 / 分类 / 视觉影响 / 修复决策 / 验证结果）。
修复前快照：`css-rule-audit-before.json`、`css-match-before.json`；修复后：`css-rule-audit-after.json`、`css-match-after.json`。

---

## 一、口径对账（176 / 177 / 169 / 7）

用 postcss 解析当前实际参与构建的 CSS（`src/tokens.css`、`style.css`、`cinematic15d.css`、`src/ui/system.css`、`src/ui/pages/*.css`），按 `data-*` 作用域属性筛选：

| 口径 | 数值 | 说明 |
|---|---|---|
| 构建内规则块总数 | 1139 | `css-rule-audit.json` 的 `ruleBlocks` |
| 构建内选择器总数 | 1307 | 一条规则可含多个选择器（含 `:is()` 内层不拆） |
| 含作用域属性的规则块 | 177 | **问题集合**：这些规则的作用域写法需要核对 |
| 其中真正写错（祖先链 ≥2） | 177 | 修复前 `needsRepair=true` 的规则块 |
| 写错的选择器条数 | 182 | 5 条规则各含 2 个写错选择器 |
| 顶层 / 嵌套 | 170 / 7 | 嵌套的 7 条全部在 `@media (max-width:900px)` 内 |
| 按文件 | sentence-grammar 144、quiz 16、io 15、mgmt 1、system 1 | 合计 177 |
| 与作用域无关的规则 | 962 | 分类表里标 `outside-scope`，不属于本轮问题 |

**Codex 的 176 与 Hermes 的 177 差在哪**

176 = 页面层四条文件之和：`144 + 16 + 15 + 1`。
177 = 176 + `src/ui/system.css` 里的一条共享层规则（`[data-theme="dark"] [data-level] button/.button { box-shadow: var(--contact) }`）。Codex 的审计范围是「页面层 CSS」，共享层没有计入。

同理：顶层 169（Codex） vs 170（本轮）= 同一条共享层规则；嵌套 7 双方一致。

**必须分开说的四组数**

| 概念 | 数值 |
|---|---|
| 规则块数（问题集合） | 177 |
| 选择器数（问题集合） | 182 |
| 修复前命中为 0 的选择器 | 182（100%） |
| 确认「结构写错且目标存在」= A 类 | 55 条规则 |
| 真正改变视觉的规则块 | 44 条（触及 6 个组件的样式；实测发生计算样式变化的元素 6 个 + Today 主按钮 1 个） |

---

## 二、分类方法（A/B/C/D）

对每条写错的选择器，在 14 个页面 × 深/浅两主题下测四个数：

1. `raw`：原选择器直接 `querySelectorAll` 的命中数（期望 0）。
2. `struct`：去掉 `::before/::after` 与状态伪类后的命中数（区分「状态没到」还是「结构错」）。
3. `fixed`：把作用域祖先链合并到同一元素后的命中数（**目标是否真的存在**）。
4. `right`：只保留最右复合选择器的命中数（判断选择器右侧是否还可达）。

先判「媒体条件是否适用」——`@media (max-width:900px)` 内的 7 条在 PC 上本就不该命中，不能算进「失效」。

- **A 真实失效**：`raw=0` 且 `fixed>0`。选择器结构错，但目标元素确实在页面上。
- **B 条件性有效**：`raw=0`、`fixed=0`，但 `right>0` 或媒体条件不适用 → 只在特定状态（hover / active / disabled / 判题 / 窄屏）才可能命中。
- **C 历史遗留**：目标不可达且引用标识在代码里也找不到。
- **D 无法确认**：以上都不成立，需要额外状态证据 —— **保留 D，不硬塞进 C**。

### 分类结果（修复前，HEAD 状态）

| 文件 | A | B | C | D | 合计 |
|---|---|---|---|---|---|
| `src/ui/pages/sentence-grammar.css` | 53 | 47 | 0 | 44 | 144 |
| `src/ui/pages/quiz.css` | 0 | 3 | 0 | 13 | 16 |
| `src/ui/pages/io.css` | 2 | 7 | 0 | 6 | 15 |
| `src/ui/pages/mgmt.css` | 0 | 0 | 0 | 1 | 1 |
| `src/ui/system.css` | 0 | 1 | 0 | 0 | 1 |
| **合计** | **55** | **58** | **0** | **64** | **177** |

按选择器计：A 55 / B 59 / C 0 / D 68（共 182）。

**C = 0 是结论，不是省略。** 没有任何一条作用域选择器可以证明「目标已不可达」：`.lab-option`、`.concept-card`、`.answer`、`.handoff`、`button.danger` 都在 DOM 里。因此没有删除任何历史规则（任务书 §4.8 的要求）。

**D = 64 的原因（逐条记在 JSON 的 `classReason`）**

- quiz.css 13 条：训练态 `data-page="quiz"` 需要一次真实 Recall 会话，自动化在测试 Profile 上无法稳定进入（见 §六 的缺口说明）。
- sentence-grammar 44 条：目标元素只在「已判题 / 展开 / 空态 / 某个 step」等深层状态下出现，14 页快照覆盖不到。
- io 6 条、mgmt 1 条：同类，只在保存完成、危险操作二次确认等状态出现。

D 类在修复中**一并做了结构修复**（合并作用域），并在 §五 的回归里验证「不再有结构错误」；它们仍标 D，是因为**没有取到它们在真实状态下的视觉证据**，不代表没修。

---

## 三、根因

`applyPageChrome()` 把 `data-page` 与 `data-level` 同时写在 `<html>` 上；页面层 CSS 却按「祖先 + 后代」写：

```css
/* 错误形态：要求两个 data-* 分布在不同元素上 */
[data-level] :is([data-page="sentence"], [data-page="lab"]) .lab-option { … }
```

`<html>` 既是 `[data-level]` 又是 `[data-page]`，但它不可能是它自己的后代 → 每条这样的规则命中 0。全站 177 条规则、182 个选择器因此**从未生效过**。

## 四、修复（按文件分批，逐批做视觉对照）

修复方式只有一个动作：把「只由 `data-level` / `data-page` / `data-theme` 组成的祖先链」合并成同一个复合选择器，属性数量不变 → **特异性不变、级联顺序不变**。

```css
/* 修复后 */
:is([data-level][data-page="sentence"], [data-level][data-page="lab"]) .lab-option { … }
```

工具：`scripts/phase15h3-selector-lib.mjs`（解析/合并）、`scripts/phase15h3-selector-fix.mjs --dry|--write`（按文件生成可审阅的变更清单）。没有做任何全局字符串替换。

| 批次 | 文件 | 选择器 | 结果 |
|---|---|---|---|
| 1 | `system.css`(2) + `mgmt.css`(2) + `io.css`(15) | 19 | 计算样式零变化（这 19 条在所选状态下没有可测的视觉差异） |
| 2 | `quiz.css`(18) | 18 | 预览态实测正常（截图 `screenshots/phase15h3/quiz/preview-dark.png`） |
| 3 | `sentence-grammar.css`(145) | 145 | 拆句页组件层第一次生效，见 §五 |
| — | 合计 | **182** | 修复后全站写错选择器 **0** |

### 三处「规则能匹配 ≠ 修复成功」的处置

1. **深色默认接触阴影压掉了 Today 主按钮辉光**
   `[data-theme="dark"][data-level] button` 修好后会赢过 `html[data-proto="d"] .d-cta`（同为 (0,2,1)，但 system.css 在后）。
   处置：改成 `[data-theme="dark"] :where([data-level] button, [data-level] .button)`，把特异性降到 (0,1,0)，让它只当「组件没写阴影时的默认值」。修复后 `.d-cta` 的计算阴影与修复前逐字节一致。

2. **拆句选项从 flex 变成 grid**
   这是页面组件层的原设计（`grid-template-columns: minmax(0,1fr)` + 左轨 + 阅读字体）。实测：行高 38→44px（判题态 48→65px），字号 13→14px，内边距 0/16→11/16。
   处置：**保留**。理由是它与 15h 设计契约一致（材质分层 + 状态轨 + 阅读字体），不是旧效果复辟；判题态对比度仍 7.14–17.98:1（≥ AA，正文小字 ≥ 5）。
   取舍已记：`.lab-option` 比修复前高 6px，判题态高 17px；1440×900 下单页 4 个选项仍不需要滚动。

3. **导航入场动画从 opacity:0 开始**（`p15-enter` 动 `<main>`，`p15-arrive` 动 `#main` 子块）
   这两条不是「作用域写错」，但审计过程里被证实是「主内容消失」的应用侧成分（空白 200–270ms）。
   处置：两条关键帧首帧都改成 `opacity: .72`。修完导航实测主内容不可读窗口 **0ms**（详见 `PHASE15H3_NAVIGATION_EVIDENCE.md`）。

---

## 五、修复前后对照（1440×900，深/浅各一轮）

证据：`screenshots/phase15h3/{before-d,before-l,after-d,after-l}/`（各 7 张）+ `styles-*.json`（计算样式）。

| 元素 | 修复前 | 修复后 | 判定 |
|---|---|---|---|
| `.lab-sentence` 原句卡 | 透明底 + 绿灰 tint，16/18 内边距，22px/600 | 哑光下沉面 + 金属左轨，22/28 内边距，24px/500 | 采用（页面组件层原设计，与材质契约一致） |
| `.lab-progress` 步骤条 | 纯文字行，高 26 | 带边框卡片，高 42，12px | 采用 |
| `.lab-option` 选项行 | 38px 高，13px，顶部高光 | 44px 高，14px，grid 单列 | 采用 |
| `.lab-feedback` 判题反馈 | 16px 正文，绿色 tint | 13px 正文，渐变 + 左轨；对比度 7.14–17.98 | 采用（≥ AA） |
| `.concept-card` 概念卡 | 331×272，gap 6 | 335×299，gap 8 | 采用 |
| `.d-cta` Today 主按钮 | 深色辉光 | 修复后一度被默认阴影覆盖 → 用 `:where()` 复原 | 回归已消除 |
| 其余页面（input / output / settings / home 非按钮部分） | — | 计算样式与矩形逐项相同 | 无变化 |

视觉复核（人眼 + 截图）：`after-d/sentence-idle-dark.png`、`after-d/sentence-answered-dark.png`、`after-l/sentence-idle-light.png`、`before-d/grammar-dark.png` vs `after-d/grammar-dark.png`、`quiz/preview-dark.png`。
1440×900 之外另测 1366×768 与 1920×1080（`styles-size-*.json`，`overflow` 全为 false，选项行宽 822px）。

---

## 六、仍未闭合的部分（诚实清单）

1. **quiz 训练态（`data-page="quiz"`）没有自动化视觉证据**
   `#train-filter` 与「预览新词 → 全部标完 → 开始 Recall」两条路径在测试 Profile 上都没能稳定进入训练态（种子词已全部预览过）。已做：预览态实测截图 + quiz.css 选择器在真实 DOM 上的 `matches()` 断言（`tests/phase15h3.css.test.ts`，同时断言它**不**命中首页）。
   未做：训练态实机截图。

2. **77 条已修规则在探针状态里没有得到非零命中**（`verifiedUnmatchedAmongRepaired`）
   它们是 D 类的主体：目标只在深层状态出现。结构修复已完成并通过「全站 0 条作用域祖先链」的断言，但**视觉验证待补**。

3. **`screenshots/phase15h3/css-rule-audit.json` 的 `overriddenByHigherSpecificity` 全部为 null**
   没有发现「修好后被更高优先级规则覆盖」的实例；该字段保留是为了让复核者能逐条填。

---

## 七、复现

```bash
npm run build:test
node scripts/phase15h3-css-audit.mjs          # 静态清单（postcss 解析真实构建入口）
node scripts/phase15h3-css-probe.mjs          # 14 页 × 2 主题 × raw/struct/fixed/right
node scripts/phase15h3-classify.mjs           # A/B/C/D + 口径对账
node scripts/phase15h3-report.mjs             # 合并成最终 css-rule-audit.json
node scripts/phase15h3-selector-fix.mjs --dry src/ui/pages/sentence-grammar.css   # 看修复清单
THEME=dark  node scripts/phase15h3-visual-diff.mjs before|after                   # 计算样式对照
node --import tsx --test tests/phase15h3.css.test.ts
```
