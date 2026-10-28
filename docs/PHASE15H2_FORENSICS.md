# Phase 15h.2 · 页面切换"主内容消失"取证

基线 `phase15h1-semantics` @ `b4e4b2d`。本轮不找新设计方向，只判断这些空白到底是应用缺陷还是录制缺陷。

## 0. 结论先行

| 待查类别 | 判定 | 证据 |
| --- | --- | --- |
| 应用真实渲染缺陷 | **不成立** | 42 次导航（14 页 × 3 轮）`#main` 空壳时长 **0ms**；20 段录制里 `#main` 文本 < 12 字的时长为 **0ms** |
| CDP Screencast 合成层丢失 | **主因** | 旧管线每段有 3–6 段"推流停帧"，最长 **5.85s**；编码器只能重复最后一帧 |
| 页面异步加载 / 导航时序 | 存在，但不是空白来源 | 首个稳定内容 **184–305ms**；期间是应用自己的占位，不是裸背景 |
| 转场容器 opacity/visibility | 设计内行为 | 转场中内容层不可见 **32–92ms**，随后 `opacity: 1` |
| 取消 / 重复导航 / 未清理动画 | **未复现** | 42 次导航 0 异常；除 home 的无限呼吸外，无残留 running 动画 |

用户看到的"主内容消失"是 **采集链路**产物：推流在静止期不再出帧，编码器把最后一帧（恰好是转场中间态）重复了数秒。应用在同一时刻 DOM 是完整的。

## 1. 方法与仪器

不是靠亮度判断，而是同时采三路真值：

1. **页面内 DOM 采样（100ms）**：`documentElement.dataset.page`、`#main` 文本长度（去空白）、首个子元素 `opacity`、是否 `.d-loading`。
2. **帧级空白检测**：把主区域（x > 24%）切成像素，`ink` = 亮度 > 70 的像素占比；空白窗判据 `ink < 0.003 且 std < 8`。
3. **推流空洞检测**：相邻交付帧的时间差 ≥ 700ms 记为空洞，并记录空洞前那一帧的 `ink`。

脚本：

- `scripts/phase15h2-navprobe.mjs` — 无头 CDP，逐帧（16ms）量 `#main`，每页单独一轮，跑 3 轮。
- `scripts/phase15h-record.mjs` — 真实 headful Edge + `Page.startScreencast`，本轮加了页面内 DOM 采样与"停帧补采"。
- `scripts/phase15h2-crosscheck.py` — 帧 vs DOM 对照，输出空洞清单。
- `scripts/phase15h2-measure.mjs` — 具体元素几何与作答态对比度。

## 2. 关键证据

### 2.1 DOM 从没空过

`nav-probe.json`（42 条导航，3 轮）：

```
books       empty 0ms  invisible 85ms  loading 0ms  firstGood 260ms
sentence    empty 0ms  invisible 71ms  loading 0ms  firstGood 294ms
grammar     empty 0ms  invisible 73ms  loading 0ms  firstGood 293ms
diagnostics empty 0ms  invisible 55ms  loading 0ms  firstGood 282ms
exam        empty 0ms  invisible 43ms  loading 0ms  firstGood 225ms
stats       empty 0ms  invisible 44ms  loading 0ms  firstGood 157ms
home        empty 0ms  invisible 17ms  loading 0ms  firstGood 193ms
... 14 页 × 3 轮全是 empty 0 / loading 0
     invisible 17–102ms，firstGood 156–294ms，exceptions 全空
```

`invisible` 指的是首个子元素 `opacity` 还不为 1 的时长——也就是共享元素转场本身，
不是空白；`empty` 才是"#main 没有子节点 / 文本 < 12 字"。

### 2.2 视频里的空白 = 推流空洞

`sentence-dark.mp4`（旧管线）：

| 时刻 | DOM 真值 | 推流 |
| --- | --- | --- |
| 6200ms | `page=sentence`，文本 **2018 字**，首子元素 `opacity 1`，无 loading | 5600–7000ms **一帧未推** |

编码器在这 1.4s 里只能重复 5.4s 那一帧——而 5.4s 正是共享元素转场的中间态（内容层还没落位）。于是成片显示"主内容消失 1.4s"，DOM 却是满的。

旧管线五段录制的空洞统计（同构建、同操作、无补采）：

| 视频 | 空洞数 | 最长空洞 | 该帧 ink |
| --- | --- | --- | --- |
| data-dark | 5 | 5852ms | 0.018 |
| io-dark | 4 | 2134ms | 0.014 |
| mgmt-dark | 3 | 3191ms | 0.026 |
| sentence-dark | 4 | 3016ms | 0.025 |
| vocab-dark | 6 | 4097ms | 0.026 |

## 3. 修复（只改采集链路，不改产品代码）

`scripts/phase15h-record.mjs` 增加停帧守卫：

- 若距上一帧 screencast > 180ms，就用 `Page.captureScreenshot` 取一张**真实截图**，按真实时间戳插进帧序列（`kind: 'still'`）；
- `meta.json` 记每帧扩展名，`scripts/phase15g-encode.py` 按扩展名取文件，不再假定全是 jpg。

为什么不用"每 120ms 改一个属性逼重绘"：那会改动被拍的页面本身。用第二个真实采集 API 补帧，两个来源都是同一时刻的真实画面，且能明确标注。

### 修复后（15 段：5 流程 × 3 轮）

```
r1 data     gaps=0  still=32    r2 data     gaps=1(719ms,片尾)   r3 data     gaps=0
r1 io       gaps=0  still=24    r2 io       gaps=0                r3 io       gaps=1(703ms,片尾)
r1 mgmt     gaps=0  still=31    r2 mgmt     gaps=0                r3 mgmt     gaps=0
r1 sentence gaps=0  still=33    r2 sentence gaps=0                r3 sentence gaps=0
r1 vocab    gaps=0  still=40    r2 vocab    gaps=0                r3 vocab    gaps=0
domBlank=0 frameBlank=0（全部 15 段）
```

两处 ~700ms 空洞都在片尾最后一段静止（随后录制就结束了），且前一帧 `ink 0.025`（有内容），不构成"裸露背景"。

新增两条流程视频，替掉之前没覆盖到的部分：

- `reading-real-dark.mp4` —— 真的导入文章 → 进阅读器 → 打开辅助面板 → 点读正文；
- `nav-all-dark.mp4` —— 14 页依次切换，25.5s，空洞 0。

## 4. 顺带查出的真实缺陷：177 条页面级 CSS 从未生效

`data-page` 和 `data-level` **都在 `<html>` 上**，而页面层写的是后代表达式：

```css
[data-level] :is([data-page="sentence"], [data-page="lab"]) .lab-option { … }
```

这要求 `data-page` 落在 `data-level` 的后代上，永远不成立。浏览器实测：

```
data-page 出现位置：html#[home]
data-level 出现位置：html[a]
每个页面上带 [data-level]…[data-page] 的规则数：177，命中数：0
```

来源文件：`sentence-grammar.css` 140 处、`quiz.css` 16 处、`io.css` 14 处、`mgmt.css` 2 处。

**本轮没有启用它们**：启用等于让 177 条从未生效的样式同时上线，是视觉系统变更，不属于"QA 收尾"。已在 `PHASE15H_MARKUP_BACKLOG.md` 记为 P0 待决项，建议单开一轮"页面层选择器修复"，逐个文件打开并重新做对比度/移动端门禁。

15h.1 新增的状态样式用的是 `[data-page="…"] .x` 形态，**未受影响**（对比度、线型、行状态均在真实浏览器里验证过）。

## 5. 逐类回答任务书里的五问

1. **应用真实渲染缺陷**：无。导航 42/42 空壳 0ms；录制 20/20 DOM 空白 0ms。
2. **CDP Screencast 合成层丢失**：是。表现不是"整帧黑"，而是"停推 + 重复上一帧"；旧片里被重复的帧恰是转场中间态。
3. **异步加载与导航时序**：存在但无害。首稳定内容 184–305ms，期间是 `.d-loading` 占位或旧内容，不是裸背景。
4. **转场容器 opacity/visibility**：转场期间确有 32–92ms 不可见，属共享元素转场的定义；落位后 `opacity 1`，未见停留。
5. **取消/重复导航/未清理动画**：42 次导航 0 异常、0 控制台错误；`getAnimations()` 除 home 的无限呼吸外无残留。

## 6. 复现命令

```bash
npm run build:test
node scripts/phase15h2-navprobe.mjs 3          # DOM 真值，42 次导航
FLOW=data THEME=dark OUT_DIR=screenshots/phase15h2/rec/r1 DOM_PROBE=1 node scripts/phase15h-record.mjs
python scripts/phase15h2-crosscheck.py          # 帧 vs DOM 对照
```

## 7. 仍然不确定的部分

- 只测了 1440×900 / 1920×1080 / 1366×768 三个桌面尺寸；移动端构图本轮不在范围。
- 长文（>3000 词）与万词级词库下的导航时序没有重复测。
- 真实窗口（gdigrab）录像没有作为交付物：`--app` 窗口会被其他窗口遮挡，OS 级截图会把遮挡一起拍进去。判定改用"DOM 采样 + 独立截图"两路真值交叉，已足够区分应用与采集链路。
