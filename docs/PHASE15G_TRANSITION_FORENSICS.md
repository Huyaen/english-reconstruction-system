# Phase 15g · 转场黑帧取证（P0-1）

结论先行：**15f 录屏里的近黑帧不是应用渲染，是 headless screencast 的采集缺陷。**
但沿着这条线还查出两个真实问题：**加载页空档** 和 **反向转场把整页当容器**。

---

## 1. 四条证据链，同一份构建、同一条操作路径

| 采集方式 | 帧数 | 中位亮度 | 最暗帧 | 近黑帧 | 结论 |
|---|---|---|---|---|---|
| headless + `Page.startScreencast`（15f 用的） | 110 | 233 | 221 | 0（浅色主题下未复现黑帧） | 旧录屏 `journey-dark.mp4` 在 1.27–1.43s 出现 3–4 帧接近黑，且宿主层（侧栏）整层消失 |
| headful + `Page.startScreencast` | 110 | 233.4 | 221.5 | 0 | 同一接口在 headful 下不掉层 |
| headful + `Page.captureScreenshot` 逐帧 | 52 | 236.7 | 221.5 | 0 | 与 screencast 一致 |
| **真实窗口 gdigrab 50fps** | 176 | 210.9 | 186.4 | 0 | 屏幕级录制也没有黑帧 |

`gdigrab` 的 176 帧里没有任何一帧低于 186（浅色主题），也没有整页缩放跳变。

## 2. 那些"整页缩小、突然变暗"的帧是怎么来的

`Page.startScreencast` 只推送**它认为变化的合成层**。共享元素转场期间页面上同时存在：
底板、飞行容器、两个 `mix-blend-mode: screen` 的灯光层、以及 shell 的渐变背景。
headless 合成器在多层叠加 + `filter`/`mix-blend-mode` 时会丢掉整层（录到的是"只剩容器和底色"），
表现为：侧栏消失、页面像被缩小、几帧近乎全黑。

判据：**同一时刻的真实窗口 gdigrab 与 captureScreenshot 都是完整的**。
如果是应用渲染问题，三路必然同时黑。

## 3. 仍然真实的两个应用侧问题

### 3.1 加载页空档
`run()` 之后应用会先渲染一个 loading 页（60vh 的暗底 + 旋钮），预览卡片要等数据准备好才出现。
15f 的转场在 470ms 就结束并撤掉所有覆盖层，于是用户看到的正是那张 loading 页 ——
这就是"接近纯黑的视觉空档"里最实的一段。

修法（v3）：`run()` 仍然**立刻执行**，不推迟 DOM 更新；底板保持不透明盖住 loading 页，
飞行容器在槽位里悬着（scale 1.006）等目标卡片出现，最多等 1400ms。
证据：`journey-triple-dark.mp4` 逐帧看，最常见的过渡是"旧页失焦 → 卡片带着内容飞过去"，
中间没有独立的全屏黑页，旋钮只在卡片内部短暂出现。

### 3.2 反向转场的容器选错
`backToToday('#main > *')` → `resolveFrom` 会 `closest('.d-row, .d-stage, .hero, .card, section')`，
拿到的就是**整个学习页容器**。所以"返回 Today"看起来是整页缩小。

修法：锚点显式化。Today 的任务板加 `data-morph-anchor="today"` / `data-morph-dest="today"`，
`resolveAnchor()` 只认 `[data-morph-anchor]`，其次 `.d-stage/.d-now`，绝不向上爬到 `section`；
反向入口改成传卡片选择器；落点从 `.d-stage`（会命中空状态那块扳手板）改成 `[data-morph-dest="today"]`。

### 3.3 主题突然变浅
`scripts/phase15f-record.mjs:184` 在 journey 场景中间点了一次 `#theme`：
录屏脚本把深色切成浅色，不是应用行为。

验证：`theme.mjs`（隔离 profile）—— 点一次切深色 → 进入学习 → 退出 → 一直是 `dark`；
浅色同样稳定；`theme-switch-dark.mp4` 里两次切换都干净。
15g 的录制脚本只在开录前设定一次主题，录制过程中不再触碰。

## 4. 判定表

| 现象 | 归类 | 依据 |
|---|---|---|
| 转场中 3–4 帧近黑、侧栏消失 | **B 采集链路** | 三路对比，只有 headless screencast 出现 |
| 转场结束后一片近黑 + 旋钮 | **A 应用**（loading 页裸露） | gdigrab + 逐帧截图都能看到 loading 页 |
| 返回时整页缩小 | **A 应用**（容器选错） | trace：15f 反向容器 = `#main > *` 整页 |
| 深色突然变浅 | **D 脚本** | 录制脚本第 184 行点了 `#theme` |
| 目的地学习页整体偏暗 | **C 设计现状** | 学习页仍是 Phase 14 的近黑底，本轮只加环境光，未重做该页 |
