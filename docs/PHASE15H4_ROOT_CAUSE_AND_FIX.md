# Phase 15h.4 — Quiz 页面状态同步 Hotfix：根因与修复

基线：`phase15h3-css-integrity` @ `691a97c`；分支 `phase15h4-quiz-state-hotfix`。
范围严格受控：只修「内部 page 与 `html[data-page]` 不同步」以及同步所必需的相关缺陷。
不动学习算法、FSRS、IndexedDB v7、评分、持久化协议、产品文案、其他页面视觉。

---

## 一、根因（三层，缺一不可）

### 1. 页面作用域只有一个写入口，而它挂在 `paint()` 上

`src/app.ts::paint()` 末尾调用 `applyPageChrome(page)`，`src/ui/motion.ts::applyPageChrome()` 负责写
`<html data-page data-level>`。问题在于**只有走 `render() → paint()` 的页面会写**。

会话类页面（`quiz` / `preview-done` / `results`）根本不经过 `paint()`：

| 站点 | 原代码 | 后果 |
|---|---|---|
| `startSession()` | `active = s; page = 'quiz'; shell(); await showQuestion()` | 从词库/薄弱词/预览进入训练，根节点仍停在 `books` / `weak` / `preview` |
| `previewDone()` | `page = 'preview-done'; $('#main').innerHTML = …` | 完成页作用域停在 `preview` |
| `showResults()` | `page = 'results'; $('#main').innerHTML = …` | 结果页作用域停在上一个页面（实测 `home` / `books`） |
| 计划流预览 | `page = 'preview'; shell(); previewPage();` | 预览作用域停在上一页 |

`page` 是内部真值，`data-page` 是视觉真值，二者由**两条不同的代码路径**维护 —— 这就是这次 P1 的全部根因。

### 2. 页面等级表缺两个会话页

`motion.ts` 的 `LEVELS` 只有 `quiz` / `preview`，`preview-done` 与 `results` 靠 `?? 'b'` 兜底。
兜底值恰好是 b，所以「看起来是对的」，但等级语义没被显式声明，任何一次等级调整都会静默改变这两页。

### 3. 异步任务的收尾会写回已经离开的页面

`previewAnswer()` / `showQuestion()` / `submit()` 都在 `await` 之后直接写 `#main`。
页面在这一瞬间被切走时（退出、返回、点侧栏），旧任务的续写会覆盖新页面，
同时会话对象被重新挂回 `active` —— 状态与 DOM 一起错位。

## 二、修复（四处写入点 + 一个纪元 + 三个护栏）

### 1. 单一出口 `enterPage()`

```ts
/**
 * 页面切换的唯一出口：内部 page、<html> 上的视觉作用域、以及「作废旧异步任务」的纪元一起前进。
 * 这里只写属性：不重渲染、不重建会话、不碰数据。
 */
function enterPage(next: string): number {
    page = next;
    pageEpoch += 1;
    applyPageScope(next);
    return pageEpoch;
}
```

`motion.ts` 拆出 `applyPageScope(page)`：只写 `data-page` / `data-level`，幂等、无副作用、不碰
`IntersectionObserver`。`applyPageChrome()` 内部改为调用它，`paint()` 的语义完全不变 ——
**没有为了同步而强制跑一遍 `paint()`**（那会重建骨架、重置滚动、并重复业务渲染）。

全部 24 处 `page = 'x'` 赋值统一改为 `enterPage('x')`（含 `setPage`），因此不存在第二条写路径。

### 2. 等级表补齐

`LEVELS` 显式加上 `'preview-done': 'b'`、`results: 'b'`。测试断言这两个页面「必须显式是 b，不能靠默认值碰巧正确」。

### 3. 会话页重建骨架

`previewDone()` / `showResults()` 在写 `#main` 前补 `shell()`（与 `startSession()` 同一做法）：
侧栏高亮、页头标题、主题按钮的绑定都与当前页一致，不再是「内容换了、侧栏还停在上一页」。

### 4. 页面纪元护栏

`pageToken()` 返回当前纪元；异步收尾处比对：

| 位置 | 位置 | 行为 |
|---|---|---|
| `showQuestion()` | 取题/落盘之后、写题面之前 | 纪元变了就不写题面，`busy=false` 退出 |
| `showQuestion()` | 队列耗尽分支 | 纪元变了就不弹结果页 |
| `submit()` | `saveAnswer` 落盘之后 | 数据已写；纪元变了就不把旧会话挂回 `active`、不写判分态 |
| `previewAnswer()` | `savePreview` 落盘之后 | 预览结果已保存；纪元变了就不推进索引、不重绘预览页 |

注意：护栏只拦**视图写入**，不拦业务写入 —— 会话、记录、预览结果仍然照常落盘（测试里断言了这一点）。

## 三、修复前后页面状态对照（真实浏览器，1440×900，深色）

`scripts/phase15h4-scope-probe.mjs`，同一套点击、同一套读数，唯一变量是代码：

| 状态 | 修复前 `html[data-page]` | 修复后 | quiz 专属规则命中 | 卡片 `max-width` |
|---|---|---|---|---|
| 词库 → 直接训练 | `books`（DOM 已是题面） | **`quiz`** | **0/45 → 26/45** | 710px → 780px |
| 判错后（判分态） | `books` | **`quiz`** | 0/45 → **40/45** | 710px → 780px |
| 训练结束 | `home`（DOM 已是结果页） | **`results`** | results 规则 **0/8 → 6/8** | — |
| 预览 | `preview` | `preview` | 16/45 → 16/45（未受影响） | 780px |
| 预览完成 | `preview`（DOM 已是完成页） | **`preview-done`** | done 规则 **3/3** | — |

「规则命中」是拿构建后样式表 CSSOM 里的选择器原文，对真实 DOM 做 `querySelectorAll` —— 不是查选择器字符串是否存在。
伪元素（`::after` / `::before`）按宿主元素计；状态依赖（`:hover` `:disabled` `.is-correct` …）另行单列。

## 四、关键视觉读数（深色 / 浅色同结构）

判分态（真实答错一次后取计算样式）：

| 元素 | 值 |
|---|---|
| 正确答案 `::after` | `"✓"`（修复前该规则从未命中，没有标记） |
| 误选答案 `::after` | `"✕"` |
| 正确答案文字色 | `rgb(233,237,242)` / 卡片底 `rgb(21,26,32)` → **14.88:1** |
| 未选中的其余选项 | `opacity 0.5` → 合成后有效对比 **4.63:1**（仍达 AA 4.5:1） |
| 题面卡片 | `max-width 780px`、`border-radius 26px`、`padding 52px`、材质为径向高光 + 双段渐变 |
| 结果页 `#main` | `max-width 1080px`、`padding 40px 48.96px 96px` |

## 五、没有做的事（刻意）

- 没有新增路由框架、没有引入状态管理库、没有重写 `app.ts`。
- 没有在全站 CSS 里加「兜底选择器」掩盖错误状态（那是掩盖，不是修复）。
- 没有为同步而调用完整 `paint()`；`enterPage()` 不写任何 DOM 内容。
- 没有改动题目数据、判分逻辑、会话结构或存储版本。
