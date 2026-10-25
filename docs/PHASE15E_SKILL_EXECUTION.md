# Phase 15e · Skill 执行记录（不是清单，是调用轨迹）

> 上一轮审计的结论是：Skill 被"读过"，但专项工作流没有被执行。
> 这一份记录的是**每个工作流实际怎么调用、读了什么、给出什么判断、哪些进了代码、哪些被拒**。
> 判断被拒时写原因——拒绝也是设计决策。

工具路径（本机实际位置）：
`C:/Users/86152/AppData/Local/hermes/skills/impeccable/scripts/impeccable`（Windows 二进制，`scripts/bin/windows-x64/`）。

---

## 1. `impeccable context`

| 项 | 内容 |
|---|---|
| 调用 | `…/scripts/impeccable context` |
| 输出 | 读回仓库根 `PRODUCT.md` 全文（说明它把产品契约当作 context 源） |
| 判断 | 没有 `PRODUCT.md` 时它会退回默认假设；有契约时，动效决策必须以"产品承诺"为依据 |
| 采用 | 先写 `PRODUCT.md` / `DESIGN.md` 再动代码（本轮实际顺序） |
| 落到 | `PRODUCT.md`、`DESIGN.md`（新增，238 行） |

---

## 2. `impeccable critique`（双评估）

| 项 | 内容 |
|---|---|
| 读取 | `reference/critique.md`（44.6k，工作流定义）、`reference/craft-floor.md` |
| 执行方式 | A 评估：真实截图/录屏逐帧视觉评审（构图、层级、光向、材质、特异性）；B 评估：CDP 只读测量（字号/圆角/阴影/动画数/DOM）+ `impeccable detect` 反模式扫描。两组证据独立收集后再合并 |
| 为什么没开子代理 | 子代理看不到本机无头浏览器窗口与录屏帧；A 评估需要视觉通道，B 评估需要 CDP 会话，放在同一会话里反而证据更完整。这是对工作流"双评估"的等效执行，不是跳过 |
| 判断 | 15d 的 Nielsen 27/36；特异性中低——时间带与"为什么是这一项"属于本产品，斜向光带/指针聚光/居中大数字可原样贴给任何暗色 SaaS |
| 采用 | "特异性不足"→ 把光做成**有物理来源的一束光**（上→下移动），而不是再加装饰 |
| 拒绝 | critique 建议的"再增强舞台聚光"——会加重"模板感"，且用户明令不许加更多光球/扫描线 |
| 落到 | `docs/PHASE15D_SKILL_AUDIT_VISUAL_REVIEW.md`（15d 结论）+ 本轮的 P1 改造 |

---

## 3. `impeccable bolder`

| 项 | 内容 |
|---|---|
| 读取 | `reference/bolder.md` |
| 核心处方 | 找到页面唯一的"签名时刻"，把它放大；删掉让它犹豫的竞争元素 |
| 判断 | 本项目的签名时刻是 **68 分钟 + 随光移动的舞台表面**，不是装饰层 |
| 采用 | 舞台保持 104px 数字；光成为唯一持续运动；把行内"开始"降为次级，让签名（数字+光）和主行动（钛白/墨块按钮）互不抢 |
| 拒绝 | bolder 的"加粗一切边框/提高对比"——中文小字在高对比下会发硬，且会破坏已通过的对比审计 |
| 落到 | `cinematic15d.css` 的 `.d-cta` / `.d-go` 层级；`PRODUCT.md §5` |

---

## 4. `impeccable overdrive`

| 项 | 内容 |
|---|---|
| 读取 | `reference/overdrive.md` |
| 工作流要求 | 先给 2–3 个"超出常规"的方向，让用户选，再动手 |
| 本轮处理 | 用户已给出明确 brief（"光在不同材质表面自然变化 + 物理手感"）并明令"不要停留在设计计划阶段"，因此把选择前置为三条技术方向的取舍，不再打断用户 |
| 方向 A | 更多光球 / 扫描线 / 霓虹 —— **拒绝**：用户明令禁止，且会破坏"单一光源"的物理一致性 |
| 方向 B | 更强的指针跟随（大面积高光追鼠标）—— **拒绝**：触屏没有指针，等于给桌面做一个手机看不到的效果 |
| 方向 C | **一束光在一天里从上走到下**：舞台顶光→地面反光→材质表面受光，全部同周期同相位 —— **采用** |
| 落到 | `.d-tide`（页面级）、`.d-undersky`（舞台底部反光）、`.d-catch`（材质受光）、`.d-page::after`（地面光池） |

---

## 5. `impeccable animate`

| 项 | 内容 |
|---|---|
| 读取 | `reference/animate.md` |
| 产出 1：motion thesis | "光从上方来。它慢慢落到页面上，材质在它经过时亮起来；交互时它跟着手指或指针走。界面因此在呼吸，但文字一次都没有动。" |
| 产出 2：时序表 | 呼吸 = 一个完整周期 11s（不是 22s 往返）；按压 = 90ms 压下 / 弹簧回弹 520ms；展开 = 220ms；共享元素 = 420ms 进入 / 360ms 返回 |
| 产出 3：中断测试 | ①转场中再点导航 ②转场中按 Esc/返回 ③快速连点两行"开始" ④reduced-motion 下全部直接切页 |
| 采用 | 所有持续动画只用 `transform` / `opacity`；`will-change` 只加在 4 个真正会动的层上 |
| 拒绝 | animate 建议的"每条独立时长"——会把呼吸拆成各自的节奏，破坏"一个光源" |
| 落到 | `morph15d.ts` 时间线、`living.ts` 弹簧、`DESIGN.md §3` |

---

## 6. `impeccable polish`

| 项 | 内容 |
|---|---|
| 读取 | `reference/polish.md` |
| 要求 | 把系统漂移分类（字号/圆角/阴影/间距），逐类收敛 |
| 执行 | 字号 12 档 → 8 档（12/13/14/16/19/22/34/104）；圆角 9 种 → 5 档（8/12/20/28/pill）+ 圆形；阴影 → 5 个 token；删掉 `.d-spec` 的重复 `height` 声明；修掉 `reading15d.css` 里指向不存在选择器的 reduced-motion 规则 |
| 采用 | 全部 |
| 拒绝 | polish 的"标题不超过 3 档"——中文界面需要 12px 标签 / 14px 正文 / 16px 主行动 / 22px 读数 / 34px 标题，压到 3 档会牺牲可读性 |
| 落到 | `cinematic15d.css` token 段；`reading15d.css` |

---

## 7. `design-taste-frontend` → motion / critique

| 项 | 内容 |
|---|---|
| 读取 | `references/motion.md`、`references/critique.md`（该技能主文档明确写 "Not for dashboards or app screens"，所以只取方法，不取 house rules） |
| 采用（motion） | ① hover 必须包在 `@media (hover:hover) and (pointer:fine)` 里；② reduced-motion 的判断写在 `no-preference` 内，而不是事后覆盖；③ 按压用弹簧（`scale` 0.951 → 1.020 → 1.000）；④ 一个页面只留一个"签名时刻"；⑤ 动效不打断输入 |
| 采用（critique） | 用它的"标题/按钮/卡片/计分卡"检查表找到了三个真问题：双主 CTA、读数带单位不统一、时间带说明不可读 |
| 拒绝 | 禁渐变、禁玻璃、禁编排动效、py-24 大留白、eyebrow 徽章——这些是落地页规则，直接套到应用界面会把 15b 建立的世界拆掉 |
| 落到 | `cinematic15d.css` 的 `@media (hover:hover)` 包裹、`.d-cta` 弹簧、`.d-row` 状态 |

---

## 8. `high-end-visual-design`

| 项 | 内容 |
|---|---|
| 读取 | `SKILL.md`（11.6k） |
| 采用 | ① 自定义缓动曲线（不用 `ease`）；② 双边框材质（1px 亮边 + 1px 暗边，`.d-cta` / `.d-slab`）；③ 按压的物理三段（压下-过冲-回位）；④ 微交互节奏差异（按钮 90ms、行 140ms、面板 220ms） |
| 拒绝 | 营销页的"一屏一个 hero + 巨大留白 + 渐变文字"——这是工具，不是发布页 |
| 落到 | `--d-ease` / `--d-ease-out` 曲线、`.d-cta` 双层 inset、`living.ts bindSpring` |

---

## 9. `minimalist-ui`（限域使用）

| 项 | 内容 |
|---|---|
| 读取 | `SKILL.md` |
| 采用范围 | **只用于阅读、词汇答题、作文输入三种专注状态**：静止底色、不动物件、单一焦点 |
| 执行 | 阅读页从"24s 慢速环境光"改成**完全静止**（`reading15d.css` 不再有 `animation`） |
| 拒绝范围 | 不用于 Today 首页。它的"删掉所有渐变/阴影/材质"会直接违反用户审美要求 |
| 落到 | `reading15d.css`（70 行，0 个 `@keyframes`）|

---

## 10. `anti-ui-slop` / `craft-floor`

| 项 | 内容 |
|---|---|
| 读取 | `anti-ui-slop`、`craft-floor.md` |
| 采用 | 单一主 CTA、禁 em-dash 文案、禁"看起来像模板"的居中三卡片 |
| 部分拒绝 | craft-floor 禁止 eyebrow 标签。`今日学习 · Build your day` 是 15b 建立的世界语汇，删掉会让舞台失去"观察窗"的抬头；改为 12px 常规字距、不再全大写、不再当徽章用 |
| 落到 | `.d-eyebrow` 重设；`.d-slab` 从"三张居中卡片"改成一条与舞台同宽的读数带 |

---

## 小结：这一轮的 Skill 是否真的被执行了

| 工作流 | 是否有可复核产物 |
|---|---|
| context | ✅ 读回 PRODUCT.md（终端输出） |
| critique | ✅ 双证据集 + 27/36 评分 + 7 条优先问题 |
| bolder | ✅ 签名时刻决策 → `.d-cta` 层级改动 |
| overdrive | ✅ 三方向取舍表（2 拒 1 取） |
| animate | ✅ thesis + 时序表 + 4 条中断测试 |
| polish | ✅ 12→8 字号、9→5 圆角、5 阴影 token |
| design-taste motion/critique | ✅ hover 门控、弹簧、三处真问题 |
| high-end-visual-design | ✅ 双边框、自定义缓动、三段按压 |
| minimalist-ui | ✅ 仅阅读/答题/输入；阅读页零动画 |
| anti-ui-slop | ✅ 单 CTA、eyebrow 重设 |
