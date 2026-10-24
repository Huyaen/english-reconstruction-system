# Phase 15b · Cinematic Graphite（视觉方向纠偏）

> 15a 交付的是「暖纸 + 鼠尾草 + 编辑式排版」。那是 Warm Minimalism，不是本项目的目标。
> 15b 推翻它作为主视觉，改为：**Premium Cinematic Lighting + Sophisticated Materials + Spatial Depth + Physical Interaction**。

## 1. 方向定义

**一束主光，其余都是材质。**

| 维度 | 15a（被否） | 15b（本轮） |
|---|---|---|
| 底色 | 暖纸 `#F4F2EA` | 中性冷石墨 `#08090B`（深）/ `#E9ECF0`（浅） |
| 强调色 | 鼠尾草绿主导全站 | 鼠尾草**降级为状态色**（掌握 / 通过 / 完成）；主行动改用金属 |
| 空间 | 平面分区 + 细边框 | 四层：环境光 → 外壳面板 → 卡片 → 控件，每层一道 1px 描光 |
| 光影 | 无方向的环境渐变 | 唯一光源**左上 45°**，高光在左上 / 上缘，阴影一律落右下 |
| 材质 | 一种纸面 | 四种：拉丝石墨 / 哑光陶面 / 阳极金属 / 磨砂玻璃 |
| 金属 | 无 | 只出现一处：Hero 右上角静态倒角薄片（不与任务争注意力） |
| 动效 | 入场 + 计量 | 八类，且每一类都有静态路径 |

## 2. 与参考手册的逐项对应

参考页：`docs/reference/词间-UI参考手册.pdf`（本地，未入库，第三方图片不随仓库分发）。

### Raycast（p3 · R02 总体视觉）
手册结论：*「金属反光只负责制造入场质感」*；*「把光影压缩成首页一处静态装饰」*；*「不要把金属纹理铺在英文正文下」*。

| 手册要求 | 本轮实现 |
|---|---|
| 光源左上 45°，高光在上缘 / 左缘，暗部在下缘 / 右侧 | `--light-key` 只落在 Hero 左上（`11% -6%`），卡片上缘有左亮右断的 1px 光缝；所有 `--e-*` 阴影都带正 x / 正 y 偏移 |
| 金属只做一处 | Hero 右上角 168×132 的倒角薄片，`opacity .62`，正文区零金属 |
| 大面积黑场托住小块高光 | Hero 背景为 `#0D1116 → #08090B` 的石墨渐变，右下角额外压暗 42% |
| 正文与主按钮保持简单 | 标题区无任何纹理；全页只有一个金属主按钮 |
| 不复制营销页的巨型标题 / 订阅结构 / 持续扫光 | 无扫光动画；金属片只随指针有 ≤4px 位移 |

### Endel（p4 · R03 总体视觉）
手册结论：*「单色深空间与克制的沉浸入口」*；*「中央内容集中，四周大面积留黑」*；*「暗部细密颗粒」*；*「深色胶囊、细描边、低对比控件」*。

| 手册要求 | 本轮实现 |
|---|---|
| 单色深空间、无彩色霓虹 | 底色与表面全部为中性石墨；唯一的彩色是极弱的冷光谱（进度条 / 导航指示条 / 金属反光） |
| 中心亮、四周暗（暗角） | `.app-shell::before` 第五层为 `radial-gradient(... transparent 42%, canvas-deep 100%)` 渐晕 |
| 暗部颗粒 | `.app-shell::after` 叠加 180×180 的 `feTurbulence` 颗粒，`opacity .05`，`mix-blend-mode: soft-light` |
| 控件是深色胶囊 + 细描边 | 次级按钮 = 陶面 + `--line-strong` 描边；文字按钮无底色 |
| 单一入口 | Hero 内只有一个金属主按钮；清单行按钮全部降级为陶面次级 |

### Things / iA Writer / Bear（只负责信息组织）
保留 15a 已验收的部分：单主任务、时间预算优先、任务顺序可解释、阅读度量为 19px / 1.72 / 66ch、正文左对齐不居中。这些**没有**因为美术改动而变动。

## 3. 八类动效：实现与安全边界

手册要求：*Shared Element / Press Scale / Stagger Cascade / Bottom Sheet 服务任务切换与局部反馈；Snap Odometer / Fluid Morph 限非输入状态；Conic Glow / 3D Tilt Glare 只考虑首页装饰并提供静态路径；学习内容与输入光标不跟随装饰运动。*

| 动效 | 本轮实现 | 为什么不破坏合同 |
|---|---|---|
| Shared Element | `captureFlip()` 记录行位置 → 同步渲染 → `playFlip()` 在 `body` 上放一个**空白克隆层**做位移/缩放，420ms 后移除 | 真实 DOM 仍然同步更新；冒烟脚本点击后立刻查询新 DOM 照旧成立（phase12 18/18 通过即证据） |
| Press Scale | `--press-scale: .984`，只作用于被按下的元素 | 不改变布局尺寸，不延迟点击回调 |
| Stagger Cascade | `[data-stagger] > .stagger-item`，最多 8 项，间隔 40ms，只动 `opacity/transform` | 初始态由 `.motion-ok` 门控；JS 失败时内容直接可见 |
| Bottom Sheet | 阅读器 ≤980px 时 `data-side="open"` 驱动 `translateY` | 面板始终在 DOM 中，可被键盘与读屏访问 |
| Snap Odometer | 只读 `[data-odometer]` 真实值 | 没有数据时写 `—`，绝不推测数字 |
| Fluid Morph | 用同一个克隆层做「行 → 目标标题」的形状过渡 | 与 Shared Element 共用，不额外引入布局动画 |
| Conic Glow | 仅在「今日完成」时扫一次（`conic-gradient` + 1 次 animation） | `prefers-reduced-motion` 下 `animation: none`，静态高光仍在 |
| 3D Tilt Glare | 指针驱动 `--rx/--ry`，**只作用于装饰层与金属片** | 文字、输入框、光标永不参与变换 |

铁律：所有动画只走 `transform` / `opacity`；`prefers-reduced-motion: reduce` 下全部 1ms 或 `none`，内容始终可见。

## 4. 具体改动

- `src/tokens.css`：重写为两套空间（石墨 / 昼光）+ 四类材质 + 方向性阴影 + 光谱；鼠尾草只保留为状态色；新增 `--noise-opacity`、`--metal-*`、`--glass-*`、`--spectral`。旧变量名全部保留为别名，Phase 4–14 页面零改动地继承新皮肤。
- `src/style.css`：替换 15a 的组件层（外壳 / Hero / 清单 / 阅读 / 动效 / 响应式），共 300 + 行新规则；移除旧深色侧栏与旧根变量。
- `src/motion.ts`：新增 `captureFlip` / `playFlip`；`bindSpecular` 增加 `--rx/--ry`。
- `src/app.ts`：任务行「开始」点击时先 `captureFlip`；`可调整` 徽标加 `badge-flex` 类（在清单里隐藏，减少噪声）。
- `scripts/phase15b-interaction-recording.mjs`：CDP screencast → 30fps MP4，真实鼠标事件驱动。
- `scripts/phase15-visual-capture.mjs` / `phase15-a11y-probe.mjs`：沿用，输出到 `screenshots/phase15b/`。

## 5. 验证

| 项 | 结果 |
|---|---|
| `npx tsc --noEmit` | 0 |
| `npm test` | 379 / 379 |
| `npm run build` | 通过（sw 版本戳 `erv2-shell-v2-*`） |
| Phase 3 冒烟 | 21 / 21 |
| Phase 5 冒烟 | 44 / 44 |
| Phase 12 全链路冒烟 | 18 / 18（证明共享元素改造没有破坏同步 DOM 合同） |
| Phase 13 冒烟 | 20 / 20 |
| 无障碍探针 | 8 个页面组合：对比度 0 违规、可访问名称 0 缺失、溢出 0；仅阅读正文内单词按钮 31px（WCAG 2.2 行内文本例外） |
| 视觉证据 | 24 张截图（1920 / 1366 / 390 × 浅深 × Today/Reading）+ 8.8s 交互录屏，输出到 `screenshots/phase15b/`；证据目录不入库，两份脚本可完整复现 |

## 6. 本轮刻意不做

- 其余 12 个页面只继承 token 与新外壳，不重排（等视觉方向确认）。
- 没有大面积光晕、没有毛玻璃堆叠：玻璃只用于浮层（侧栏 <760px、阅读辅助面板、悬浮控件）。
- 没有把学习内容放进任何动效层：正文、输入框、光标始终静止。
