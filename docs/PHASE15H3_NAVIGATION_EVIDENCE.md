# Phase 15h.3 · 转场连续性取证（P0-5）

审查在五段旧录屏里看到主内容消失：`data`、`mgmt`、`sentence`、`io`、`vocab`。
本轮用**同一构建、隔离配置、两条独立采集通道**逐次取证，回答一个问题：**主内容区域是否在任何一帧里只剩背景。**

结论先说：**修复前确实存在 141–270ms 的应用侧不可读窗口（不是 1.4 秒，1.4 秒是录制链路停帧）；修复后 30 次运行全部为 0ms。**

机器可读证据：`screenshots/phase15h3/nav-screencast.json`、`nav-shots.json`、`nav-analysis.json`。
采集脚本：`scripts/phase15h3-nav-continuity.mjs`（通道）、`scripts/phase15h3-nav-sampler.js`（页面内采样）、`scripts/phase15h3-nav-analyze.mjs`（判定）。

---

## 一、方法

### 1.1 双通道（同一构建，分别跑满 15 次）

| 通道 | 采集方式 | 采样间隔（实测） | 一轮次数 |
|---|---|---|---|
| A | CDP `Page.startScreencast`（jpeg q70，everyNthFrame=1，记录 `metadata.timestamp`） | 73–92ms | 5 路径 × 3 轮 |
| B | 独立 `Page.captureScreenshot` 序列（记录请求发起 / 返回 / 耗时） | 134–159ms（约 7fps） | 5 路径 × 3 轮 |

两通道**不混跑**：`captureScreenshot` 与 `startScreencast` 同时开时，无头环境下截图会挂死（实测 20s 超时）。分开跑反而让两条证据更独立。

### 1.2 同步真值源：页面内 16ms 采样

每次点击前注入采样器，以 `performance.now()` 对齐，逐 16ms 记录：

- `performance.now()` 单调时间戳、点击时间、返回点击时间
- `#main` 子节点数、文本长度
- **主内容块**：视口内可见面积最大的那个子块（不是 `textContent.length`）
- 该块的祖先链 `opacity`（逐层相乘）、`visibility`、`display`、`transform`、`z-index`
- 目标矩形、是否在视口内、`elementFromPoint` 命中的元素
- `.d-loading` / `[data-loading]` 真实加载态
- `document.getAnimations()` 里运行中的动画名与目标（含 shared-element 飞行层）
- 旧页底板 `.m15-plate` 与飞行容器 `.m15-traveler` 的存在、透明度、文本量

**判据**（写死在分析器里）：`可读 = 文本>12字 且 祖先 opacity>0.35 且 visibility:visible 且 未 display:none 且 在视口内 且 宽>60 高>24`；
`一片空白 = 主块不可读 且 任一子块不可读 且 没有可见的 .m15-plate / .m15-traveler`。

不使用整帧亮度（YAVG），也不使用「DOM 里有文本」单独作为通过条件。

### 1.3 测试环境安全

- 每次运行删除并新建 `--user-data-dir`（`.p15h3-nav-<port>`），**不复制、不读写用户日常浏览器配置**。
- 数据来自 `?test=1` 播种（`existing:50`），不接触真实学习库。
- 只点导航按钮与返回，不触发删除/导入等写操作。

### 1.4 路径与次数

| 路径 id | 起点 → 目标 | 轮数 | 快速返回 |
|---|---|---|---|
| data | home → 学习统计(stats) | 3 | 1300ms 时点回 home |
| mgmt | home → 设置与备份(settings) | 3 | 同上 |
| sentence | home → 句子训练(sentence) | 3 | 同上 |
| io | home → 真实表达(output) | 3 | 同上 |
| vocab | home → 我的词库(books) | 3 | 同上 |

每轮先确认「真的停在起点」（`dataset.page === from`，最多 12 次重试，必要时重载），否则跳过——避免把「点击空转」误记成一次导航。

---

## 二、结果（修复后，当前构建）

### 2.1 通道 A（Screencast）

| 路径 | 轮 | 主内容空白最大 | 返回段空白 | 首个可读内容 | 通道帧间隔最大 | 帧间隔（节奏） | 判定 |
|---|---|---|---|---|---|---|---|
| data | 3 | 0ms | 0ms | 27–53ms | 1250ms | 83–87ms | CAPTURE_STALL ×3 |
| mgmt | 3 | 0ms | 0ms | 31–70ms | 1255ms | 83–92ms | CAPTURE_STALL ×3 |
| sentence | 3 | 0ms | 0ms | 43–103ms | 1356ms | 73–84ms | CAPTURE_STALL ×3 |
| io | 3 | 0ms | 0ms | 25–44ms | 1260ms | 75–84ms | CAPTURE_STALL ×3 |
| vocab | 3 | 0ms | 0ms | 25–32ms | 1199ms | 89–91ms | CAPTURE_STALL ×3 |

`CAPTURE_STALL` 指的是**通道**：帧序列在 600–1900ms 区间出现 1.1–1.4s 空洞，而同段页面内的 16ms 采样显示主内容始终可读（空白 0ms）。这一段正是「页面静止 → 点返回 → 返回转场」的过程：Chrome 的 screencast 只在画面变化时推帧，重渲染繁忙时会丢帧。

### 2.2 通道 B（独立截图）

| 路径 | 轮 | 主内容空白最大 | 返回段空白 | 首个可读内容 | 通道帧间隔最大 | 节奏 | 判定 |
|---|---|---|---|---|---|---|---|
| data | 3 | 0ms | 0ms | 27–49ms | 219ms | 138–143ms | OK ×3 |
| mgmt | 3 | 0ms | 0ms | 30–66ms | 281ms | 140–159ms | OK ×3 |
| sentence | 3 | 0ms | 0ms | 32–92ms | 224ms | 137–140ms | OK ×3 |
| io | 3 | 0ms | 0ms | 24–41ms | 252ms | 140–154ms | OK ×3 |
| vocab | 3 | 0ms | 0ms | 24–30ms | 251ms | 141–150ms | OK ×3 |

30 次运行（两通道各 15）中，`#main` 空壳 0 次、真实 loading 0 次、取消/重复导航 0 次。

### 2.3 修复前后

| 判据 | 修复前 | 修复后 |
|---|---|---|
| 主内容「完全不可读且无底板/飞行层」最长窗口 | 141ms（anyReadable 判据）/ 270ms（单块判据） | **0ms** |
| 首个可读内容出现时间 | 24–201ms（随判据波动） | 24–103ms |
| 首帧起 opacity | 0（`p15-enter` 动 `<main>`、`p15-arrive` 动子块） | 0.72 |

---

## 三、归因（按审查给的分类）

| 分类 | 结论 | 依据 |
|---|---|---|
| 真实应用空白 | **修复前存在，141–270ms**；已修复 | 16ms 采样：点击后首帧起 `opacity:0`，`.m15-plate` 不存在（普通导航不建底板），主区只剩背景 |
| 采集停帧 | **存在，1.1–1.4s** | 同段 DOM 可读 0ms 空白；15h.2 已定位旧编码器把转场中间帧重复播放 1.4s |
| 正常设计转场 | 是，`opacity .72 → 1` + `translateY(6→12px)`，约 300ms | 首个可读内容 24–103ms 即出现 |
| 加载状态 | **0 次** | 全程 `.d-loading` 未出现 |
| 尚无法区分 | 无 | — |

### 根因与修复

`style.css` 的 `.motion-ok main { animation: p15-enter … both }` 从 `opacity:0` 起步，`system.css` 的 `#main.p15-enter > *` 从 `opacity:0` 起步。而导航时旧页内容被**同步移除**（普通导航不建 `.m15-plate` 底板），于是：

```
点击 → 旧 DOM 移除 → 新 DOM 插入且 opacity 0 → 约 200ms 后才越过可读阈值
```

修复（最小改动，两条关键帧首帧都改）：

```css
/* src/style.css */
@keyframes p15-enter{from{opacity:.72;transform:translateY(12px)} …}
/* src/ui/system.css */
@keyframes p15-arrive{from{opacity:.72;transform:translate3d(0,6px,0)} …}
```

「抵达」动作保留（位移 + 300ms 收敛），但**第一帧就可读**。测试 `tests/phase15h3.css.test.ts` 对两条关键帧都做了断言（首帧 opacity ≥ 0.6）。

---

## 四、采集的局限（必须一起读）

1. **screencast 只在画面变化时推帧**：页面静止的尾段必然出现长间隔。分析器用「该区间内主内容 opacity 变化 >0.15 或文本变化 >10 字」区分「真停帧」与「静止无帧」。
2. **截图通道约 7fps**（每次 130–160ms，含请求往返），不可能捕捉 16ms 级抖动；它用来验证「视频链路的复现性」，不是精度来源。
3. **页面内采样 16ms** 也有约 1 帧误差（采样本身要跑在渲染线程上）。
4. 本轮为无头 Edge（`--headless=new`）。任务书优先 headful；本轮未用 headful 的原因是 headful 下 `captureScreenshot` 在与 screencast 并存时会挂死，而两条通道分开跑反而更独立。**headful 独立窗口序列仍缺一份**，已列入未完成项。
5. 旧录屏里的 1.4s 空白与本次的 0–141ms 不是同一个量级，前者已被 15h.2 证明是编码器重复推送转场中间帧；本轮再次复现了该停帧（通道 A）。
