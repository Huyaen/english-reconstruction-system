# Phase 15h.4 — 测试报告

基线 `395/395` → 现在 **398/398**（新增 3 条真实集成回归）。

执行环境：Windows 11 / Node 26.7（本地）、CI Node 22 与 24；浏览器 Edge `--headless=new`，隔离 profile，
`npm run build:test`（`?test=1&proto=d`），`node server.mjs --dir=dist-test --port=4173`。

---

## 一、新增测试：`tests/phase15h4.pageState.test.ts`

在 jsdom 里启动**真实的 `src/app.ts`**（真实 boot、真实点击、真实 IndexedDB via fake-indexeddb），
只从外部可观察事实断言：`html[data-page]`、`data-level`、`#main` 里真实的标记、以及库里的会话与记录。
**没有**「把 data-page 设成 quiz 再断言页面是 quiz」这类自证；页面切换全部由真实按钮点击触发。

| # | 测试 | 断言要点 |
|---|---|---|
| 1 | 预览答题的异步收尾不会把旧页面写回当前页面 | 点「已经会」后**同一 tick** 切到词库：根节点必须是 `books`、词库内容必须完整、旧预览卡片不得被写回；同时预览结果仍需落盘 |
| 2 | 五个页面转换都让 `html[data-page]` 与真实渲染一致 | `preview → preview-done`、`preview-done → quiz`（Recall）、`books → quiz`（词库训练）、`quiz → results`（答完）、`results → home`；每一步同时校验等级、DOM 结构、以及库里会话「恰好一个进行中 / 结束后 ended + records 落盘」 |
| 3 | 页面等级表覆盖会话页 | `quiz/preview-done/results` 显式 b、`home` a、`reading` c、未知页面回落 b |

**回归有效性核验**（关键）：把 `src/app.ts` + `src/ui/motion.ts` 临时 stash 回 `691a97c` 后重跑 —— **3 条全部失败**，报错正是缺陷本身：

```
✖ 预览答题的异步收尾…  AssertionError: 词库页内容应完整（不应被异步收尾破坏）  actual: null, expected: true
✖ 五个页面转换…        Error: 超时：进入预览完成页          ← 修复前 previewDone 从不写 data-page=preview-done
✖ 页面等级表…          TypeError: applyPageScope is not a function
```

第一条尤其重要：它证明「旧任务把旧页面写回新页面」在修复前是**可复现的真实缺陷**，不是理论风险。

## 二、真实浏览器业务路径（`scripts/phase15h4-stateflow.mjs`）

7 条路径 / 21 个检查点，深色与浅色各跑一遍（1440×900）。每个检查点记录：
内部 page、`html[data-page]`、`data-level`、`#main` 可见内容、该页专属 CSS 的真实命中、
关键元素计算样式、判分反馈、会话/预览的落盘状态。

| 路径 | 检查点 |
|---|---|
| 词库 → 直接训练 → 答错 → 下一题 → 答对 | `A1 books` `A2 quiz` `A3 判错态` `A4 暂停` `A5 继续` `A6 答对进阶` |
| 训练退出 → 返回 Today（会话保留） | `A7 quit-home` |
| 已有未完成训练 → 恢复 | `D1 resume-quiz` |
| 一轮答完 → 结果页 | `D2 results` |
| 结果页 → 再次训练 | `D3 results-again-quiz` `D4 back-home` |
| 结果页 → 返回首页 | `D6 results-back-home` |
| 薄弱词 → 训练 → 结果 → 返回 | `C1 weak` `C2 weak-quiz` `C3 weak-results` `C4 back-home` |
| 预览新词 → 完成预览 → Recall → 结果 → 返回 | `B1 preview` `B2 preview-done` `B3 recall-quiz` `B4 recall-results` `B5 home` |

结果（两种主题一致）：

```
dark  : steps 21  pages [books,quiz,home,results,weak,preview,preview-done]
        inconsistent []  levelMismatch []  failures []  consoleErrors 0  boot 18.1s
light : steps 21  pages [books,quiz,home,results,weak,preview,preview-done]
        inconsistent []  levelMismatch []  failures []  consoleErrors 0  boot 18.0s
```

- **不一致 0 / 等级不同步 0**：每个检查点 `内部 page === html.data-page`。
- **页面规则意外 0 命中 0**：逐条对 CSSOM 规则求命中；伪元素按宿主计；状态依赖单列；
  唯一一次「0 命中」是 `[data-page="preview"] .quiz-card blockquote` —— 种子词没有例句，
  这一页确实没有 blockquote 宿主，记为**内容依赖**而不是作用域失效（已在流程里显式记录）。

### 前置条件的真实性

两条路径都受真实业务规则约束，脚本没有绕过，而是满足条件：

- 首次跑到「薄弱词训练」时，前面几轮已经把种子弱词**练成了会**，薄弱词池真实清空（截图实证：
  「还没有需要强化的词」「查看这 0 个词的明细」，按钮变成导入）。于是重新播种同一份合成词表恢复前置条件。
- 预览入口需要「未预览新词」；同理在新一轮前重新播种。
- 退出训练后首页会出现「继续上次训练」，此时再开新一轮会被业务规则拒绝（toast「请先继续或结束首页的未完成训练」）——
  脚本按真实规则先结束旧会话，而不是跳过后台校验。

## 三、工程门禁

| 项目 | 命令 | 结果 |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | **0 error** |
| 全量测试 | `npm test` | **398 / 398 pass，0 fail**（37.1s） |
| 生产构建 | `npm run build` | **exit 0** |
| 测试构建 | `npm run build:test` | **exit 0** |
| 对比度（深 / 浅） | `scripts/phase15c-contrast.mjs`（`PROTO=d`） | **225/0** 与 **225/0** |
| 移动/桌面溢出 | `scripts/phase15d-mobile-audit.mjs` | PASS（0 failures，10/10 + 10/10） |
| Reduced Motion | `scripts/phase15c-reduced-motion.mjs` | 深/浅 `overflowX:false` |
| 实测无障碍 | `scripts/phase15h1-live-a11y.mjs` | **11/11 通过 · 异常 0 · 控制台错误 0** |
| 15h.3 CSS 作用域回归 | `tests/phase15h3.css.test.ts` | 仍全绿（未回退） |

## 四、证据索引

| 内容 | 位置 |
|---|---|
| 修复前后作用域对照（机器可读） | `screenshots/phase15h4/scope-before-dark.json`、`scope-after-dark.json`、`scope-after-light.json` |
| 业务路径真值（每检查点全字段） | `screenshots/phase15h4/flow-dark.json`、`flow-light.json` |
| 深浅主题关键状态截图 | `screenshots/phase15h4/dark/`（21 张）、`screenshots/phase15h4/light/`（21 张） |
| 复跑命令 | `THEME=dark node scripts/phase15h4-stateflow.mjs` / `TAG=after node scripts/phase15h4-scope-probe.mjs` |

截图名单（每主题 21 张）：`A1-books` `A2-quiz-enter` `A3-quiz-wrong` `A4-quiz-paused` `A5-quiz-resumed`
`A6-quiz-correct-advanced` `A7-quit-home` `B1-preview` `B2-preview-done` `B3-recall-quiz` `B4-recall-results`
`B5-home` `C1-weak` `C2-weak-quiz` `C3-weak-results` `C4-results-back-home` `D1-resume-quiz` `D2-results`
`D3-results-again-quiz` `D4-back-home-from-quiz` `D6-results-back-home`。

## 五、未覆盖 / 未解决（如实）

1. **键盘路径没有单独跑一遍完整流程**：Enter / 数字键的绑定由 `keydown` 处理，本轮只验证了按钮点击路径与
   `live-a11y` 的键盘覆盖（11/11）。数字键在 quiz 页、Enter 在判分后进阶，逻辑未改，但没有逐键截图。
2. **Hover / Focus / Pressed 只有计算样式层证据**：`cssHits` 把 `:hover/:active` 单列为状态依赖规则，
   未逐个模拟指针悬停取像素。理由：本轮修的是「页面作用域」，这些状态规则在 15h.3 已逐条验证过命中。
3. **headful 窗口序列未做**：两轮取证都在无头 Edge（headful 下 `Page.captureScreenshot` 与 screencast 并存会挂死，
   15h.2/15h.3 已记录该限制）。
4. **`entered via 计划任务` 的预览分支**（`page = 'preview'` 的计划流）只做了代码层统一，没有单独的点击路径覆盖：
   它需要一个真实的今日计划任务，属产品前置条件，本轮没有构造。
5. 移动端构图未重做（PC 优先，沿用 15h 口径）。
