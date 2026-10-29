# Phase 15h.3 · 测试报告

基线：`phase15h2-visual-qa` @ `3ad4cc6`（390/390）。本轮新增 5 条 CSS 作用域回归测试 → **395/395**。

所有数字都是本次真实运行的输出，不是估计。执行环境：Windows 11，Edge（`--headless=new`），构建 `npm run build:test`（`?test=1&proto=d`，播种 50 个既有词），服务 `node server.mjs --dir=dist-test --port=4173`。

---

## 一、工程门禁

| 项目 | 命令 | 结果 |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | **0 error** |
| 单元/集成测试 | `npm test` | **395 / 395 pass，0 fail**（36.0s） |
| 测试构建 | `npm run build:test` | **exit 0** |
| 生产构建 | `npm run build` | **exit 0** |
| 对比度（深） | `THEME=dark PROTO=d node scripts/phase15c-contrast.mjs` | **checked=225，failures=0** |
| 对比度（浅） | `THEME=light PROTO=d …` | **checked=225，failures=0** |
| 移动/桌面溢出 | `node scripts/phase15d-mobile-audit.mjs` | device **10/10**、desktop **10/10**，PASS |
| Reduced Motion | `node scripts/phase15c-reduced-motion.mjs` | 深/浅均 `overflowX:false` |
| 实测无障碍 | `node scripts/phase15h1-live-a11y.mjs` | **11/11 通过 · 异常 0 · 控制台错误 0** |

## 二、新增测试（5 条，全部针对真实 CSS / 真实 DOM）

`tests/phase15h3.css.test.ts`

| # | 断言 | 检测方式 |
|---|---|---|
| 1 | 构建内 CSS 不存在「作用域属性祖先链」 | postcss 解析 7 个真实入口文件，逐选择器算祖先链长度，要求 `< 2` |
| 2 | 页面层作用域规则在真实 DOM 上真的命中 | JSDOM 造 `html[data-level][data-page="sentence"]` + `.lab-option/.lab-sentence/.lab-progress/.lab-panel`，用 `Element.matches()` 实测 |
| 3 | 判题态（`data-verdict`）规则命中已判题选项 | 同上，给选项加 `data-verdict="correct"` 后匹配 |
| 4 | quiz/preview 的 `.answer` 规则命中，且**不**命中首页 | 三个 DOM：`data-page=quiz`、`preview`、`home`，分别 `matches()` |
| 5 | 入场关键帧首帧 opacity ≥ 0.6（`p15-arrive` + `p15-enter`） | 正则读关键帧块，取起点 opacity |

**有效性核验**（不是「写了就算」）：把 5 个 CSS 文件临时 stash 回 HEAD 状态后重跑，**5 条全部失败**；恢复修复后全部通过。

```
✖ CSS：不存在作用域属性祖先链 …
✖ CSS：页面层作用域规则在真实 DOM 上真的命中 …
✖ CSS：训练态（quiz）与预览态（preview）…
✖ CSS：深色按钮默认接触阴影…
✖ CSS：导航入场动画不得从完全透明开始…
```

## 三、CSS 作用域回归

| 指标 | 修复前（HEAD） | 修复后 |
|---|---|---|
| 构建内写错的作用域选择器 | **182**（177 条规则块） | **0** |
| 拆句选项 `.lab-option` 命中数 | 0 | 4（真实页面实测） |
| 语法概念卡 `.concept-card` 命中数 | 0 | 34 |
| 深色主按钮辉光 | 被默认阴影覆盖 | 与修复前一致（`:where()` 降特异性） |
| 1440×900 深/浅计算样式差异 | — | 6 个组件按预期变化，其余逐项相同 |

细节见 `docs/PHASE15H3_CSS_RULE_AUDIT.md`。

## 四、转场连续性

| 通道 | 运行数 | 主内容空白最大 | 返回段空白 | 首个可读内容 | 判定 |
|---|---|---|---|---|---|
| CDP Screencast | 15（5 路径 × 3 轮） | **0ms** | **0ms** | 25–103ms | 通道停帧 1.1–1.4s（页面本身连续可读） |
| 独立截图序列 | 15 | **0ms** | **0ms** | 24–92ms | OK ×15 |

修复前同一脚本、同一判据：141–270ms 不可读窗口。修复内容与证据见 `docs/PHASE15H3_NAVIGATION_EVIDENCE.md`。

## 五、监听器 / 观察器生命周期（P1）

脚本：`scripts/phase15h3-lifecycle.mjs`（在应用脚本之前注入计数器），输出 `screenshots/phase15h3/lifecycle-{before,after}.json`。
每轮「进出」= 13 个页面各点一次 + 回首页；三次测量分别对应 1 次、10 次、30 次往返（累计 390 次导航命中，0 次落空）。

| 指标 | 修复前 | 修复后 |
|---|---|---|
| `window` 上的 `pointerup` 监听器 | 1 → **31**（30 次往返后，仍在线性增长） | **1**（1 / 10 / 30 次均不变） |
| `window` / `document` 其余监听器 | 恒定（pointermove 1、visibilitychange 2、pointerleave 2、keydown 1） | 同左，恒定 |
| ResizeObserver 活实例 | 1 | 1 |
| IntersectionObserver 活实例 | 1 | 1 |
| 未取消的 rAF | 0 | 0 |
| DOM 节点数 | 230 | 230 |
| 页面隐藏 → 恢复 | 无异常 | 无异常 |

**根因**：`bindTouchGlow()` 每个绑定元素都执行一次 `window.addEventListener('pointerup', up)`，从不移除；每次重渲染（含每次导航）都会再加一批，闭包还持有已脱离文档的按钮。
**修复**：改为「按下时登记到 `pressReleases`，一次全局 `pointerup` 统一释放，松开/换舞台即注销」——只保留 1 个全局监听。
**判断**：这是**真实泄漏**，不是理论风险（实测线性增长）。同一文件里的 `ResizeObserver` / `IntersectionObserver` / `visibilitychange` 本来就有 `bound` 守卫与 `disconnect`，复查未发现第二处泄漏。

## 六、交互 / 键盘 / 动效回归

| 项目 | 证据 |
|---|---|
| 主要作答状态（考试单选、句子判题、表达自动保存） | `screenshots/phase15h2/{stills,interaction}` 复跑；`phase15h2-measure.mjs`：radio `w=15`、判题态 `opacity 1`、正文对比 7.14–17.98、小字 5.88–7.67 |
| 深浅主题 | 1440×900 各 7 态（`screenshots/phase15h3/after-{d,l}`）+ 1366×768 与 1920×1080（`styles-size-*.json`，无横向溢出） |
| 页面导航与返回 | 30 次导航 + 30 次快速返回（§四） |
| 动效中断 / 重复点击 | 导航脚本每轮先确认落点；42+ 次重复点击无异常、无控制台错误（`live-a11y` 亦为 0） |
| Reduced Motion | `prefers-reduced-motion` 下入场动画关闭（`#main.p15-enter > * { animation: none }`），无横向溢出 |
| 键盘 | `live-a11y` 覆盖 Tab 顺序 / focus-visible / 单选键盘操作，11/11 |

## 七、性能与资源

- 每次导航后 DOM 节点数恒定 230，无累积。
- 未取消 rAF 恒为 0（隐藏页面时主动 `cancelAnimationFrame`）。
- 转场只依赖 CSS 关键帧 + 一个 60fps 采样器；采样本身不进入生产构建。
- 无新增依赖（本轮所有脚本只用已有的 `postcss` / `jsdom`）。

## 八、未完成 / 缺口（如实）

1. **quiz 训练态的自动化视觉证据缺失**：无法在测试 Profile 上稳定启动 Recall 会话（种子词已全部预览过）。已用「预览态实机截图 + 真实 DOM `matches()` 断言」覆盖，训练态本身没有截图。
2. **77 条已修规则在探针状态里没有非零命中**（D 类主体）：结构已修、断言已过，深层状态的视觉证据待补。
3. **headful 独立窗口序列未做**：本轮两通道都在无头 Edge 上（原因见 NAVIGATION_EVIDENCE §4.4）。
4. 移动端仅「不溢出 / 不重叠」门禁，未做构图（按任务书 PC 优先）。
5. 长文、万词库、长期数据密度未测（沿用 15h 的遗留口径）。
