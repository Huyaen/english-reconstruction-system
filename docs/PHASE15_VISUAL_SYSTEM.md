# Phase 15 · 视觉系统与界面重构（词间）

「光影留在空间，专注留给文字。」

本阶段只改视觉与交互表现层：领域逻辑、证据规则、计划器、数据模型均未改动。
所有数值来自 `docs/reference/词间-UI参考手册.pdf`（本地参考，不入库）的候选值，
再按实际渲染校准；产物为原创实现，未复制任何第三方素材。

## 1. Token 层（唯一来源）

`src/tokens.css` 是全站唯一的设计变量来源，`src/style.css` 只允许引用变量，不再新增颜色/阴影/时长。

| 类别 | 关键变量 | 取值要点 |
| --- | --- | --- |
| 纸面 | `--canvas` `--canvas-deep` `--surface` `--surface-raised` `--surface-sunken` | 浅色为暖纸（#F4F2EA 系），不是白色反相 |
| 墨色 | `--ink` `--ink-soft` `--ink-muted` `--ink-faint` | 暖炭黑 #1F2321；次级 6.3:1，三级 5.7:1（surface） |
| 强调 | `--accent` `--accent-ink` `--accent-strong` `--accent-wash` | 鼠尾草：填充用 accent，文字用 accent-ink（6.2:1） |
| 语义 | `--ok` `--warn` `--danger` `--m-*` | 掌握度五级保留语义，只重调色 |
| 光 | `--light-warm` `--light-cool` `--sheen` `--edge` `--glow` | 单一光源（左上偏上），其余为描光 |
| 高度 | `--e-1` `--e-2` `--e-3` `--e-pop` | 阴影带偏移与柔化，零偏移彩光禁用 |
| 字体 | `--font-ui` `--font-display` `--font-reading` | 阅读正文用衬线（Charter / Iowan / Palatino / Georgia） |
| 阅读排版 | `--read-size` `--read-leading` `--read-measure` | 19px / 1.72 / 66ch（实测满行 66–73 字符） |
| 动效 | `--dur-1..4` `--ease-out/std/spring` `--stagger` `--press-scale` | 120/220/380/620ms；reduced-motion 全部降为 1ms |

深色为石墨（#101312 系），靠明度差 + 顶边描光分层，不使用纯黑与霓虹投影。

## 2. 四类表面

手册要求四种表面在视觉上可区分，落地为：

- **环境面（Ambient）**：仅今日 Hero。双层结构（外壳托盘 + 内芯玻璃板）、左上暖光、顶边描光、指针高光（`data-specular`，仅桌面、仅背景层，文字不位移）。
- **交互面（Interactive）**：清单卡、任务行、面板。细边框 + 极轻阴影 + 内描光；hover 提亮而不是加粗。
- **阅读面（Reading）**：阅读卡与正文。纸白、衬线、66ch、1.72 行高；正文里不出现任何装饰性光影。
- **数据面（Data）**：统计条、表格。内凹底、等宽数字（`font-variant-numeric: tabular-nums`）。

## 3. 今日学习：一个主角任务

- Hero 承担「下一步 + 为什么」，全页只有它包含实心主按钮。
- 清单行内动作降为次要/文字级，「开始」是行内唯一 tonal 按钮，与「替换 / 延后 / 跳过」形成层级。
- 计划理由码（`order-new-first`、`critical-memory-sampled` 等）经 `humanReason()` 翻译成人话；内部码不再出现在界面上。
- 数据条由四张同款卡改为一张面 + 内描光分隔，数字计量只对真实值做（`data-odometer`）。

## 4. 英文阅读器

- 标题、元信息、正文共用同一条左基线（`reader-bar` 与 `reader-main` 同步 padding）。
- 辅助面板桌面为右栏，`≤980px` 变底部面板；窄屏默认收起，避免浮层遮挡正文。
- 折叠只切 `data-side`，不重绘 → 阅读位置、选中词、已标记词全部保留。
- 标记词用底色 + 2px 语义下划线表达（知道/模糊/不知道/猜出），不使用整段高亮。

## 5. 动效（8 类中落地 6 类，2 类显式不做）

| 类别 | 落地 | 说明 |
| --- | --- | --- |
| Stagger Entrance | 是 | 清单/指标/模式卡，最多 8 项，45ms 间隔 |
| Snap Odometer | 是 | 以上一次真实渲染值为起点计量，不生成数字 |
| Press Feedback | 是 | `:active` 缩放 0.982，120ms，不拦截提交 |
| Directional Light | 是 | 指针高光只改背景层（`--mx/--my`） |
| Page Transition | 是 | 内容区 380ms 就位动画；**不使用 View Transition API** |
| Status Glow | 是 | 完成态一次性 1.4s 光晕，不常驻 |
| Fluid Morph | 不做 | 卡片展开形变会牵动布局与焦点，收益低于风险 |
| 3D Tilt | 不做 | 明确不用于阅读面与文字卡；高光已覆盖"质感"需求 |

**为什么不用 View Transition API**：`startViewTransition` 会把 DOM 写入推迟到下一帧，
而本项目（含冒烟脚本）依赖同步渲染（点击后立刻查询新 DOM）。实测该方案使
`phase12-full-smoke` 的 F/G 段失败，故改为同步的 CSS 入场动画。正确性优先于炫技。

## 6. 无障碍与窄屏

- 焦点：`focus-visible` 统一 2px accent 描边，不依赖颜色单独传达。
- 对比度：自动化探针扫描全部可见文字节点，AA 阈值（4.5:1 / 大字号 3:1）零违规。
- 命中区：窄屏导航、行内动作、主题切换、辅助入口 ≥42px；正文内的单词按钮为行内控件（31px），按 WCAG 2.2 行内文本例外处理。
- 横向溢出：390px 下零溢出（可滚动导航内部的横向溢出不计）。
- `prefers-reduced-motion: reduce` 下所有时长降为 1ms、位移取消，内容始终可见（动效类只在 JS 检测通过后挂 `motion-ok`）。

## 7. 验证证据

| 项 | 结果 |
| --- | --- |
| `npm test` | 379 / 379 |
| `npx tsc --noEmit` | 0 错误 |
| `npm run build` / `build:test` | 通过 |
| `phase13-smoke` | 20 / 20 |
| `phase3-smoke` | 21 / 21 |
| `phase5-smoke` | 44 / 44 |
| `phase12-full-smoke` | 18 / 18 |
| `phase15-a11y-probe` | 对比度 0 违规、可访问名称 0 缺失、390px 溢出 0 |
| `phase15-visual-capture` | 24 张（5 视口 × 浅/深 + 全页/折叠态） |

Before/After 截图位于 `screenshots/phase15/{before,after}/`，采集脚本固定播种数据
（24 词 / 1 篇 194 词文章 / 2 个输入源 / 12 句 / 16 题 / 9 个计划任务），保证可比。

## 8. 已知边界

- 其余页面（词库、句子、输入、表达、考试、诊断、统计、AI、设置）只继承 token 与外壳，
  未逐页重排；它们保持原有结构，视觉靠 token 与新外壳统一。
- `docs/reference/` 为第三方参考手册，已在 `.git/info/exclude` 中排除，不随仓库分发。
- 单词级行内按钮不追求 44px 命中区；若未来要做"点词查词"手势，需要另设浮动命中策略。
