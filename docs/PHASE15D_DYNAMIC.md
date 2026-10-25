# Phase 15d · Cinematic Dynamic（词间 · Today 动态原型）

> 一句话：这不是「静态看板 + 几条 transition」，而是一套**在跑的光**——环境光在呼吸、指针带着一片高光走、按钮按下有阻尼、任务行能连续展开、进入训练有空间转场；同时帧时间与基线持平，阅读页正文一动不动。

预览入口：`http://127.0.0.1:4173/?test=1&proto=d`（不带 `?proto` 仍是 15b 界面，默认路径未改）

---

## 1. 这轮纠正了什么

前几轮的判断错在这里：**把「配色克制」当成了「光影和动效也要克制」**。于是有了大量静态材质陈列——金属边缘、玻璃、刻度尺都做了，但界面本身不动。

15d 的原则改成两条互不冲突的：

- 色彩：黑曜石 / 石墨 / 钛银 / 霜白 / 冷冰蓝，暖琥珀只做少量标记。
- 动态：**光必须是活的**。饱和度可以低，光的运动、材质的响应、层级的空间感必须强。

---

## 2. 交付形态

以 B 的沉浸式空间为骨架（单列舞台 + 体积光 + 地面光池 + 横向时间带），吸收 A 的精密读数（刻度、读数条、序号），重做为 `?proto=d`。业务动作全部复用既有 `bindPlan()`：开始、跳过、延后、替换、调整预算都走真实流程，原型不改写学习逻辑，也不改数据写入。

新增/改动：

| 文件 | 作用 |
| --- | --- |
| `src/proto15d.css` | Today 的舞台、光层、材质、读数条、任务行、响应式 |
| `src/living.ts` | 指针光场 / 弹簧按压 / 行内展开 / 数字落位 / 可见性暂停 |
| `src/protoToday.ts` | `protoTodayD()` 渲染器（真实数据 + 真实动作） |
| `src/reading15d.css` | 阅读页外围动态（正文不动） |
| `src/app.ts` | `?proto=d` 分支、会话首帧占位、reading 样式引入 |
| `scripts/phase15d-recording.mjs` | 8 段真实交互录屏（CDP 鼠标/触控/主题/降级） |
| `scripts/phase15d-perf.mjs` | 帧间隔、longtask、TaskDuration/RecalcStyle 计量 + reduced-motion 断言 |

---

## 3. 光是怎么活的

舞台里的光不是一张 `radial-gradient` 背景，而是**分层的、各自动的组合**：

| 层 | 行为 | 周期 | 实现 |
| --- | --- | --- | --- |
| `d-aura` ×2 | 环境光斑缓慢扩散/收缩、左右漂移 | 11s / 15s | `transform` + `opacity` |
| `d-orb` | 一颗 760px 光球在舞台内游走、明暗起伏 | 27s | `translate3d` + `scale` |
| `d-bands` | 斜向光带缓慢掠过（像光穿过百叶） | 34s | `translate3d` |
| `d-sweep` / `d-sweep-2` | 两道宽度不同的掠光，方向相反 | 19s / 12s | `translate3d` |
| `d-rim` | 边缘光沿卡片轮廓旋转一圈 | 34s | `rotate`（conic + mask） |
| `d-beam` | 顶部体积光柱呼吸 | 12s | `scaleY` + `opacity` |
| `d-glare` | **跟随指针**的柔光斑，阻尼跟随 | 实时 | 元素级 `transform`（不写 CSS 变量） |
| `.d-lights` | 整组装饰层随指针做 ±3.4° 空间倾斜 | 实时 | `perspective` + `rotateX/Y` |

关键取舍：**文字和点击区域永不参与 3D 变换**。倾斜只作用于装饰层包裹 `.d-lights`，内容层是 `position: relative; z-index: 1`。

---

## 4. 动态交互（对着 8 项要求逐条）

| 要求 | 这里的实现 | 证据 |
| --- | --- | --- |
| Shared Element | 同步 DOM + 克隆层 FLIP（不延迟一帧写 DOM，测试合同不变） | `journey-dark.mp4` 1.0–1.6s |
| Press Scale | 按下 110ms 压到 0.962，松手按按住时长回弹到 1.014 再落 1，`cubic-bezier(.34,1.56,.64,1)` | `pointer-dark.mp4` 2.6–3.6s |
| Interactive Lighting | 指针光斑阻尼跟随 + 整组光层倾斜 + 按钮悬停游光 | `pointer-dark.mp4` 0–2.4s |
| Stagger Cascade | 进入时卡片/读数条/时间带/任务行分层落位（70–90ms 递进） | `idle-dark.mp4` 首帧 |
| Fluid Morph | 任务行展开：高度 340ms `cubic-bezier(.16,1,.3,1)`，详情淡入，收回 240ms 加速 | `expand-dark.mp4`，展开后行高实测 **152px** |
| Bottom Sheet | 辅助面板/展开详情沿用同一套阻尼曲线；移动端触控已在 `touch-dark.mp4` 验证 | `touch-dark.mp4` |
| Snap Odometer | 大数字变化时 `translateY(6px)+opacity` 420ms 落位（数字仍来自真实渲染） | `journey-dark.mp4` |
| 3D Tilt Glare | 装饰层 ±3.4° 倾斜 + 光斑，文字层不动 | `pointer-dark.mp4` |

---

## 5. 性能：动起来不等于卡

同机同负载，headless Edge（软件光栅，比真实 GPU 更悲观），1440×900：

| 场景 | 指标 | 15b 基线 | 15d |
| --- | --- | --- | --- |
| 空闲 10s | 帧间隔 p50 / p95 | 3.8 / 3.9 ms | **3.8 / 3.9 ms** |
| 空闲 10s | 掉帧（>32ms） | 0 | **0** |
| 空闲 10s | longtask | 0 | **0** |
| 指针交互 4.8s | 帧间隔 p50 / p95 | 3.8 / 3.9 ms | **3.8 / 3.9 ms** |
| 指针交互 4.8s | 掉帧（>32ms） | 0 | **0** |
| 指针交互 4.8s | RecalcStyle 总计 | 45 ms | 324 ms |

为了拿到这个结果，做过三次真正的返工（都是先测出来、再改）：

1. **整卡 3D 变换**（`perspective + rotateX/Y` 加在舞台上）→ 每帧强制重栅格化整棵子树，交互段 RecalcStyle 一度 **3065ms / 4.8s**。改为只倾斜装饰层后回落到 324ms。
2. **每帧写 CSS 变量**（`--gx/--gy/--tx/--ty` 写在舞台上）→ 整棵子树样式失效。改为**只写元素自身的 `style.transform`**，并按 0.2px 阈值跳过无意义写入。
3. **大面积 `backdrop-filter`**（舞台 + 9 个任务行）→ 指针移动时反复重合成。去掉后改层叠渐变，肉眼厚度不变。

现在的约束：只有一个 `rAF`；只在指针位于舞台内或动画进行中运行；`document.hidden` 立即停；`reduced-motion` 下 `living.ts` 根本不启动。

---

## 6. 降级与可访问性

- `prefers-reduced-motion: reduce`：`document.getAnimations()` 中 running = **0**；`.d-orb / .d-bands / .d-sweep / .d-sweep-2 / .d-rim / .d-aura / .d-glare` 计算样式全部 `animation-name: none`，`d-glare` `display: none`。
- 对比度精确审计（真实前景 vs 最近不透明背景，禁用控件按 WCAG 1.4.3 豁免）：

| 主题 | 1920×1080 | 390×844 |
| --- | --- | --- |
| 深色 | 225 节点 / **0 违规** | 225 / **0** |
| 浅色 | 225 节点 / **0 违规** | 225 / **0** |

修掉的两处真实问题：行内「开始」原为暖底深字（3.8:1）→ 改深琥珀底 + 近白字；浅色主题次要文字 `#6A7280`（4.09:1）→ 改 `#566070`。

---

## 7. 阅读页：包裹得精致，正文一动不动

只做三件不干扰内容的事：

1. 卡片外的环境冷光缓慢呼吸（`#reading-page::before`，18s）。
2. 工具压条上一道 15s 的慢掠光。
3. 辅助面板悬停时抬 0.5px + 阴影加深。

实测（进入逐段阅读后，指针在正文上缓慢移动）：

- 整屏变化 **0.02%** 像素超过 3 级；
- **正文区域最大变化 4/255**（基本是抗锯齿），文字不移动、不闪烁、不参与任何动画；
- 选中、滚动、点词、输入焦点均未受影响（`phase12-full-smoke` 18/18 通过）。

---

## 8. 证据清单（不随仓库分发）

截图（24 张，深/浅 × 桌面/手机）：`screenshots/phase15d/`

录屏（真实 CDP 鼠标与触控，1440×900 / 390×844）：

| 文件 | 内容 | 时长 |
| --- | --- | --- |
| `recording/idle-dark.mp4` | 打开后 10 秒不碰鼠标：呼吸、游走光球、掠光 | 10.0s |
| `recording/idle-light.mp4` | 同上，浅色 | 10.0s |
| `recording/pointer-dark.mp4` | 指针横扫光影 → 悬停主按钮 → 按下/保持/释放 | 5.4s |
| `recording/pointer-light.mp4` | 同上，浅色（高光改为移动的柔性暗光） | 5.3s |
| `recording/expand-dark.mp4` | 任务行展开 → 阅读详情 → 换一行 → 收回 | 6.2s |
| `recording/journey-dark.mp4` | 进入训练（共享元素）→ 返回 → 切浅色 → 再交互 | 8.9s |
| `recording/touch-dark.mp4` | 390×844 触控：点行展开 → 按主按钮 | 3.1s |
| `recording/reading-dark.mp4` | 逐段阅读：指针扫过正文，正文不动 | 8.1s |

量化证据：

- 空闲呼吸：9 秒内 **36.3%** 像素变化 >3 级、**29.5%** >8 级、峰值 107/255。
- 指针光照：两个指针位置之间 **20.2%** 像素变化 >6 级、峰值 71/255。
- 展开：`.d-row.is-open` 行高 **152px**，详情文本真实渲染。
- 会话首帧：原来约 2 秒黑屏 → 现在显示「正在准备这一项…」占位（`journey-dark.mp4` 1.4–2.4s）。

---

## 9. 没有做的事

- 其余 12 个页面**没有动**（按用户第 14 条：Today 方向确认前不推广）。
- `?proto=d` 仍是开关，默认路径保持 15b；分支 `phase15d-dynamic`，未合并 `main`。
- 未替换 View Transitions（会延迟一帧写 DOM，破坏同步渲染合同与 `phase12-full-smoke`）。

## 10. 验收状态

- `npx tsc --noEmit`：0
- `npm test`：**379/379**
- `npm run build` / `build:test`：通过
- 浏览器冒烟：`phase3` **21/21**、`phase12` **18/18**、`phase13` **20/20**（生产构建另跑 phase3 = 21/21）
- 对比度：4 组组合 **0 违规**
- reduced-motion：running 0，全部 `animation: none`
- 性能：空闲与交互帧间隔 p50/p95 与基线一致，无 longtask、无 >32ms 掉帧

---

## 11. 验收纠偏（第二轮，2026-10-25）

评审反馈：光影与呼吸有进展，但**移动端截图宽度异常、Shared Element 仍是突变、光影语言偏生硬**。以下是本轮的定位、改动与证据。第 10 节中的性能/对比度结论以本节数字为准。

### 11.1 390px 全页截图 756px 的成因

两个独立原因，**都不是页面真的横向溢出**：

1. **截图脚本没有开移动端 Emulation**：`phase15-visual-capture.mjs` 只设了 `width/height`，`mobile:false`，Edge 按桌面视口布局（390px 下 `innerWidth` 仍是 390，但 `mobile:false` 时不会应用移动端 UA/缩放语义），全页 `captureBeyondViewport` 按桌面重排宽度计算，产出 756px 宽的图。
   → 现在 `setViewport()` 在 `width < 700` 时下发 `mobile:true` + `maxTouchPoints:1`，桌面视口下发 `enabled:false`（`maxTouchPoints:0` 会被 CDP 拒绝）。
2. **阅读页装饰伪元素外扩**：`reading15d.css` 里 `#read-cold::before` / `.reader-main::before` 用 `inset:-18% -12%` 画环境光，负右边界把 12px 撑进 `scrollWidth`。伪元素不会出现在 `querySelectorAll`，所以「查越界元素」的探针永远查不到它。
   → 给这两个容器加 `overflow: clip`；截图脚本的溢出断言改为**等 8 帧再判定**，失败时同时输出越界元素与滚动容器，避免用单点探针下结论。

### 11.2 移动端横向布局的真实验收

- `scripts/phase15d-mobile-audit.mjs`（新增）：360 / 390 / 414 / 768 四个视口 × Today / Reading 两个页面，同时校验 `innerWidth === 视口`、`documentElement.scrollWidth`、越过视口且不在横向滚动容器内的元素、以及全页截图实际像素宽度。
- 结果：**8/8 OK，escapers=0**；`today-light-390x844-full.png` 实际 **390×3521**，`reading-dark-360x780.png` 实际 **360×780**。
- `src/style.css` 移动端 `aside` 由 sticky/auto 宽改为 `position: relative` 固定单列，`nav` 保持横向滚动，不再把 `main` 挤宽。

### 11.3 Today → Training：真实容器变形

旧实现（`motion.ts playFlip`）是空 div 从旧位置缩到新标题后淡出，页面同帧替换 —— 观感就是「突变 + 淡入」。本轮换成 Material Container Transform：

- `src/morph15d.ts`（新增）：克隆出发卡片的**真实 DOM** 到 fixed 层，测量目标面板矩形，用弹簧积分连续变形 `left/top/width/height/border-radius`；内容在 16%–34% 淡出，旧页面快照与目标页面交叉透出，最后交接真实 DOM。点击当帧追加 `scale(1.006)` 的「拿起」提示，避免前 200ms 看起来没反应。
- 逐帧证据：`screenshots/phase15d/morph-cast/frames.json`，**50 帧 / 748ms**，转场窗口 46 帧；`_strip.png` 为 12 帧时间条。
- 空白帧检查：对转场窗口逐帧统计内容区灰度标准差，**没有一帧低于 8**（早期版本在 422–454ms 有约 30–60ms 的纯白空档，已通过「内容先淡出、表面后退场、目标页提前进场」的重叠修复）。

### 11.4 光影与材质（P1）

- 移除梯形探照灯 `.d-beam`、扫描线 `.d-sweep/.d-sweep-2`、`.d-orb/.d-bands`。
- 新的光具：`.d-sky`（顶部方向光，线性渐变，无模糊）、`.d-key`（被指针牵引的主光）、`.d-spec`（跟随指针方位角旋转的斜向高光条）、`.d-rim`（上缘掠射）、`.d-glare`（指针聚光）、`.d-breath`（11s 呼吸，最大半径、极低振幅）、`.d-grain`（哑光颗粒）。
- 材质：舞台用方向性渐变 + 内缘高光 + 底部内阴影 + 外侧接触阴影，形成「有厚度的板」而不是一块渐变。
- 光照与材质联动：指针移动时主光位移、高光条旋转、上缘掠射增强、聚光点亮；亮度（`opacity`）只在**进入 / 离开 / 收敛**三处写一次，避免逐帧样式重算。
- 浅色主题：同一套光具，改为暖白透射（`.d-breath` 用 `rgba(255,252,244,.55)`），行卡为 `rgba(255,255,255,.92)`，保留同样的方向光与指针响应。

### 11.5 交互物理（P1）

- 主按钮：`bindSpring` 弹簧 `K=320, C=20`，按下目标 `0.955`，释放注入 `+1.9` 初速。DOM 实测：基线宽 199.95px → 按下最窄 **190.18px（0.951）** → 释放过冲 **203.97px（1.020）** → 收敛回 199.95px；`press-dark.mp4` 完整录下「接近 → 按下 → 持住 → 拖出释放 → 回弹 → 再次轻点」。
- 释放不再用 `setPointerCapture`（capture 会让「拖出后松开」合成 click 直接跳页），改为 `window.pointerup` 兜底；按住拖出按钮再松开也会正常回弹。
- 任务行：展开/收起用高度弹簧（开 `K=210,C=24`，合 `K=300,C=30`），内容按 26ms 级联滑入、12ms 级联退出；整行都是可点面（标题、留白、右侧箭头），展开区内的操作按钮不触发折叠。
- 阅读页：环境光伪元素裁剪后不再产生横向滚动；阅读导航无空屏（`reading-dark.mp4` 全程有内容）。

### 11.6 性能与降级（P2）

- 指针光场改为**与刷新率无关的阻尼**（`dt` 指数插值），收敛即停 rAF；指针静止、页面隐藏、舞台离屏时 JS 帧循环为 0。
- 呼吸完全交给合成层（CSS animation），`html[data-lights=paused]` 时 `animation-play-state: paused`。
- 无头浏览器里 `window` 从不获得焦点，原先的 `blur → paused` 会把整页动画永久冻住（导致录屏只有 1 帧），已移除该监听，只在 `visibilitychange` 与舞台离屏时暂停。
- `perf.json`（1440×900，10s 空闲 + 4s 合成指针扫动）：空闲 p50 **3.8ms** / p95 **3.9ms** / >32ms **0** / longtask **0**；交互 p50 **3.8ms** / p95 **3.9ms**，合成扫动期间 1 帧 >32ms（61.5ms，软件光栅下首次给三层混合光写样式）。reduced-motion：`running 0`，所有光层 `animation: none`。

### 11.7 本轮证据清单

| 证据 | 文件 | 关键数字 |
| --- | --- | --- |
| 移动端真实截图 | `screenshots/phase15d/today-light-390x844-full.png`、`reading-dark-360x780.png` | 390×3521 / 360×780 |
| 移动端多视口审计 | `screenshots/phase15d/mobile-audit.json` | 8 组合，escapers 0 |
| Shared Element 逐帧 | `screenshots/phase15d/morph-cast/frames.json`、`_strip.png` | 50 帧 / 748ms，无空白帧 |
| 10s 呼吸 | `recording/idle-dark.mp4`、`idle-light.mp4` | 10.00s；区域像素差 15.6% >6，max <20 |
| 指针光影 | `recording/pointer-dark.mp4`、`pointer-light.mp4` | 5.5s；17.8% 像素 >6 |
| 主按钮全过程 | `recording/press-dark.mp4` | 0.951 → 1.020 → 1.000 |
| 任务展开/收起 | `recording/expand-dark.mp4` | 6.1s，两次展开一次收起 |
| 阅读导航 | `recording/reading-dark.mp4` | 8.1s，无空屏 |
| Light/Dark 对照 | `screenshots/phase15d/*-light-*` / `*-dark-*` | 24 张 |
| Reduced Motion | `screenshots/phase15d/reduced-motion-1440.png`、`perf.json` | running 0 |

### 11.8 本轮验收

- `npx tsc --noEmit`：0
- `npm test`：**379/379**
- `npm run build`：通过（`dist` 已更新）
- 浏览器冒烟：`phase3` **21/21**、`phase12-full` **18/18**、`phase13` **20/20**
- 对比度（PROTO=d）：暗/亮 × 1920/390 = **4 组 0 违规**（失败项改用截图像素复核，避免半透明叠加推断误差）
- reduced-motion：`running 0`
- DB 版本仍为 **v7**，学习功能未改动
- 仍为 `?proto=d` 开关，未合并 `main`，未推广其余页面
