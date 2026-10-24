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
