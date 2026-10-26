# Phase 15g · 实现说明

基线 `phase15f-art-direction` / `8ff5524` → 分支 `phase15g-motion-integrity`。
本轮只动 PC 端 Today、任务转场，以及转场落点上必要的学习页过渡。构图沿用 15f，没有第二次整体重做。

---

## 1. 共享元素：Anchored Container Transform（`src/morph15d.ts` v3）

**只有任务容器走，页面底板不动。**

| 层 | 角色 | 行为 |
|---|---|---|
| 新页面 `#main` | 真实 DOM，`run()` 后立刻存在 | **从不改 opacity**，不做延迟更新 |
| 底板 `.m15-plate` | `body` 克隆（不是 `#main` 克隆），锚点槽位挖空 | 不缩放不位移；`blur 0→14px`（5 级）、`brightness 1→0.84`、末尾 140ms 淡出 |
| 飞行容器 `.m15-traveler` | 锚点克隆 + 目标材质 + 随形高光 | 几何/圆角/阴影/高光同一条进度曲线 |

- 锚点：`[data-morph-anchor]`（Today 任务板 `data-morph-anchor="today"`）。
- 落点：`target` 选择器（学习页卡片），反向用 `[data-morph-dest="today"]`。
- 时间线（forward 470ms）：几何 0–470（smoothstep + 末段 1% 阻尼）；旧内容 0–165ms 退场；
  目标材质 12%→88% 交叉到 0.58；底板 300–440ms 淡出；落定后 88ms 壳淡出。
  反向 400ms 同构。
- 阴影随形：`0 y px b px s px rgba(0,0,0,a)`，y 14→34、b 34→96、s −18→−64、a .34→.72。
- 可中断：Escape、页面隐藏、重复点击都收敛到终点（`finishMorph()` / `morphBusy()`）。
- 快速重复点击：CTA 与任务行入口都过 `morphBusy()` 闸门，不会开第二个会话。

为什么克隆 `body` 而不是 `#main`：页面底色、环境光场、外框都在 `#main` 之外，
只克隆 `#main` 的底板比真实页面暗 11 级（实测均值 33 → 22），转场一开始就像被人压暗。

## 2. 材质（P1）

| 材质 | 之前 | 现在 |
|---|---|---|
| 金属立柱 | 130% 高的一整条渐变，screen 混合，随指针平移 30px | **2px 镜面线**（46%–94% 白）+ 极弱次级反射两层；随 `--ly` 移动 46px（方向性），随 `--lx` 16px |
| 玻璃任务板 | 一条横向窄亮带（像扫描线） | **两团宽柔透射**（64%×54% / 52%×46%）+ 内表面一层（`::after`）+ 四边 inset 边缘光；不再有移动亮带 |
| 哑光路线 | 60%×50% 柔光，opacity .30，平移 8px | 96%×82% 漫反射，opacity .16，平移 3px（几乎只变明暗） |
| 主按钮 | 弹簧 scale + 160ms 阴影 | 弹簧 scale + **130ms 同步**的接触阴影与 `brightness(.965)`，`is-pressed` 时 glint 提到 .8 |

## 3. 呼吸（P2）

- 同一光源、不同惯性：`--d-b-metal = 11s×1.21`、`--d-b-glass = 11s×1.47`、`--d-b-matte = 11s×1.73`，
  合成图案几分钟内不重复，避免"一眼识破的机械循环"。
- 关键帧不再整块上下扫描：位移 ≤10px（金属镜面线除外），主要靠明暗与体积。
- `data-nobreath` 提供硬暂停（指针诊断录屏用）。此前 `data-lights="paused"` 在样式表里**根本没有实现**，
  而 JS 的 `kick()` 又会把它翻回 `on` —— 两处都修了。

## 4. 修掉的两个真 bug

1. **呼吸会自己停**：重渲染换掉整个 `.d-stage` 后，`IntersectionObserver` / `ResizeObserver`
   仍盯着已脱离文档的旧节点，下一次回调把舞台判成"离屏" → `data-lights="paused"` 永久生效。
   现在舞台变化时重建观察器，并忽略非当前舞台的回调。
2. **`data-lights` 没有样式实现**：JS 在切状态，CSS 没有对应规则，等于开关是空的。

## 5. 完成态反馈（P3）

`completePlanTask` 成功后把 `planTaskId` 写进 `sessionStorage`，回到 Today 渲染时给对应 `.d-seg`
加一次 `is-just-done`（1150ms：抬起 2px + 一道镜面扫过）。不写任何学习证据，不延迟保存。
证据：`completion-dark.mp4` 走完 12 个新词预览 → 完成页 → 返回 Today，路线 `1/9`，对应段闪一次。

## 6. 录屏链路（交付物）

`scripts/phase15g-record.mjs`（逐帧采集）+ `scripts/phase15g-encode.py`（按真实时间轴编码）。

- 采集：headful Edge `--app` + `Page.startScreencast`（headless 会掉层，见取证文档）。
- 交互：`Input.dispatchMouseEvent`，走真实命中测试。
- 指针：CDP 截图不含系统光标，按事件日志在同一时钟上叠加一个环（唯一的人工合成层）。
- 编码：按 `帧数/真实时长` 定帧率（24–60fps），逐个时间戳取最近帧，**成片时长 == 采集时长**
  （例如 idle 采集 22.39s → 成片 22.38s）。
