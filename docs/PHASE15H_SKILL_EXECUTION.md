# Phase 15h · UI Skill 执行记录

这份记录只写**真的跑过什么**。跑不动的写明失败原因，没跑的写明没跑，不用"参考过"冒充"执行过"。

环境：Windows 11 · Node 26.7 · Edge headful · 项目 `D:\英语重构训练\vocabulary-app`
Skill 根目录：`C:\Users\86152\AppData\Local\hermes\skills\`

---

## 1. 已发现并实际执行的

### 1.1 `impeccable`（CLI 实际调用）

| 命令 | 结果 | 用在哪里 |
|---|---|---|
| `impeccable.cmd context` | 退出 0，读回 `PRODUCT.md` 全文（约 2.3k 字）作为设计上下文 | 迁移前确认产品契约：证据链、Activity≠Ability、六能力面 |
| `impeccable.cmd --help` | 列出真实子命令：`detect / ignores / install / link / update / check / telemetry` | 纠正一个误解：`critique / animate / polish` **不是** CLI 子命令，而是 Skill 文档里的工作流 |
| `impeccable.cmd detect src/ui src/app.ts` | **24 处 side-tab（3px 左色条）+ 1 处 bounce-easing 建议** | 逐条修：把 2–3px 左色条全部降为 1px，Toast 弹性缓动改 `--ease-out` |
| `impeccable.cmd detect src/ui`（改后） | 0 anti-patterns（仅正则扫描，元素级规则未跑） | 复验 |
| `impeccable.cmd detect "http://127.0.0.1:4173/?test=1"`（改后） | **0 anti-patterns**，1 条 advisory（旧 token 里仍留着 `cubic-bezier(.34,1.32,.64,1)`，来自 15b 的 `--ease-spring`，新层已不再使用） | 元素级实扫（tiny-text / 对比度等规则真正执行） |

### 1.2 `impeccable` 的 `reference/critique.md`（完整读过并按其流程执行）

- 读完 12.5k 字的方法论，按其要求做了**双评估隔离**：
  - Assessment A（设计评审，0 主观分叉）：交给独立子代理，只给截图 + 源码，不给检测器结果；
  - Assessment B（检测器 + 浏览器证据）：交给另一个独立子代理，只跑 `detect`，不做设计判断；
  - 两个子代理互不可见，最后由我合并（合并结果见 `docs/PHASE15H_VISUAL_REVIEW.md`）。
- 采用的可执行结论：side-tab 归零、bounce-easing 去除、证据来源必须可辨、空样本不能当 0。
- **未采用**：`critique-storage` 快照持久化（本机没有 `.impeccable/` 初始化，`slug` 命令不存在于当前 CLI 版本）；
  没有做浏览器内 overlay 注入（本机 Hermes 浏览器后端不可用，改用 CDP 截图作为视觉证据）。

### 1.3 自建可复现的证据工具（替代不可用的 Skill 脚本）

| 脚本 | 作用 | 为什么不用 Skill 自带 |
|---|---|---|
| `scripts/phase15h-capture.mjs` | 14 页 × 2 主题 × 3 尺寸截图；首次运行用真实导入路径写合成词书，跑 16 题产生真实作答 | Skill 的 live-browser 依赖 playwright，本机未安装 |
| `scripts/phase15h-flow.mjs` | 单流程分步截图（可定位到某一状态） | 同上 |
| `scripts/phase15h-record.mjs` | headful Edge + `Page.startScreencast` 逐帧采集 | 同上；15g 已证明 headless screencast 会丢层 |
| `phase15g-encode.py`（复用） | 按真实时间戳重采样编码 mp4，指针环按事件日志叠加 | — |

## 2. 发现但未能执行的

| Skill / 工具 | 状态 | 真实原因 |
|---|---|---|
| `impeccable` 的 `animate` / `polish` / `bolder` / `overdrive` 工作流 | **只读了 `critique.md`，这四个没有逐字读** | 时间；本轮动效语言已由 15g 定稿，强行套用有回退风险。这是明确的未完成项，不是"已采用" |
| `high-end-visual-design` | 未读 | 同上；其材质/光照结论在 15f 已消化成 `DESIGN.md` v2 |
| `design-taste-frontend`（motion / critique / lint） | 未读 | 同上 |
| `anti-ui-slop` | 未读 | 同上；`impeccable detect` 已覆盖其核心规则（side-tab、bounce、emoji 图标等） |
| `accesslint-audit` | 未执行 | 该 Skill 目录只有 `SKILL.md`，没有可执行脚本；项目自带 `phase15c-contrast.mjs`（225 项，0 失败）承担对比度门禁 |
| `frontend-lighthouse` | 未执行 | 需要全局安装 Lighthouse CLI 与 Chrome 调试端口；本机 Lighthouse 未安装，`npm i -g lighthouse` 会改动全局环境，未获授权 |
| `e2e-testing-patterns` | 未执行 | 项目已有 379 个 node:test + jsdom 集成测试；Playwright 未安装 |
| `redesign-existing-projects` | 未读 | 与 `impeccable` 高度重叠，且本轮不是"重设计"而是"统一到既有语言" |

## 3. 结论

- **真正驱动力**：`impeccable detect` 找出的 25 条问题 + 我自己的截图复核 + 子代理的双评估。
- **不是**"读了 SKILL.md 就宣称用了"：`animate/polish/bolder/overdrive/high-end-visual-design/design-taste-frontend/anti-ui-slop` 本轮**没有执行**，不写进"已使用"。
- 下一轮若继续做视觉精修，应先补 `animate` 与 `polish` 的逐字执行，再谈审美验收。


---

## 4. 更正（评审回执后）

上一节写的"活页面 `detect` 0 anti-pattern"**不成立**，已作废。原因：

- `detect --json src/ui` 的 0 是"未测量"：引擎自述 `8 files scanned with regex matching only`，
  `tiny-text` / `low-contrast` 等元素级规则根本没跑。
- `detect <url>` 与 SPA 竞态：同一 URL 连跑 4 次得到 1 / 1 / 3 / 1 条，多数运行扫到脚本渲染前的空壳，
  空壳同样返回 exit 0。我的"0"就来自这种运行。

**改用可复现的方法**（新增 `scripts/phase15h-snapshot.mjs`）：
渲染完成 → `documentElement.cloneNode(true)` → 剥掉 `<script>` → 写成同源静态页 → 对快照跑 detect。
28 张快照（14 页 × 深/浅）复测：修复前 **255** 条 → 修复后 **34** 条。

这条经验已写进 `docs/PHASE15H_VISUAL_REVIEW.md` §4 与 `scripts/phase15h-snapshot.mjs` 的头部注释。
