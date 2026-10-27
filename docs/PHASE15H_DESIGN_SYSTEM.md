# Phase 15h · 全站设计系统（实现说明）

这份文档描述**代码里实际存在的系统**：`src/ui/system.css` + `src/ui/pages/*.css` + `src/ui/motion.ts`。
它不是设计愿景，改代码时以这里的选择器与变量为准。

---

## 1. 分层与加载顺序

```
tokens.css          变量真相（颜色/字号/间距/圆角/时长/阴影/材质基色）
style.css           14 页旧样式（保留，不回退功能）
proto15c*.css       15a–15c 原型层（逐步被覆盖，未删除）
reading15*.css      阅读原型层
cinematic15d.css    Today 电影感层（15f/15g）
──────────────────────────────────────────────
ui/system.css       ★ 全站权威层：材质、骨架、组件原语、状态、动效
ui/pages/*.css      分页增量：quiz / reading / sentence-grammar / io / data / mgmt
```

`src/app.ts` 顶部按此顺序 `import`。新样式只在 `system.css` 与 `pages/*.css` 里写，不再往旧原型层追加。

## 2. 页面等级由运行时决定

`src/ui/motion.ts` 在每个 `paint()` 末尾写入 `<html data-page data-level>`：

| 等级 | 页面 | 视觉强度 |
|---|---|---|
| **A** | home, stats, diagnostics, unit | `--breath-amp: 1`，允许空间纵深与呼吸 |
| **B** | books, weak, quiz, preview, sentence, grammar, input, output, exam, lab | `--breath-amp: .45`，只做按压/选中/收放 |
| **C** | reading, settings, ai | `--breath-amp: .2`，正文零动画、背景稳定 |

`prefers-reduced-motion` 下 `data-motion` 不写入，`[data-reveal]` 直接可见，观察器不注册。

## 3. 材质：三种表面 + 一种数据面

| 材质 | 用在 | 实现要点 |
|---|---|---|
| 玻璃 `.panel/.card` | 任务板、卡片、结果面板 | 两团宽柔透射 + 内表面 + 只保留上沿的 `inset 0 1px 0 var(--edge)`；阴影用 `0 14px 34px -28px`，不做发光 |
| 金属 `.metal` / `button.primary` | 主行动、时间立柱、阶段轨道端点 | 2px 级镜面线（`background-position` 在 hover 时移动 620ms），内阴影模拟厚度 |
| 哑光 `.matte/.plain-list` | 列表、工作区、表单底 | 2.2% 白 wash + `--surface`，几乎不反射 |
| 数据面 `table`/`metrics` | 表格、指标带 | `--surface-sunken` 表头、1px 行分隔、tabular-nums |

**没有 backdrop-filter**：15g 已证实它会让转场快照（body 克隆）在无 GPU 合成下变黑，且对性能不利。

## 4. 组件原语（system.css 里唯一实现）

- 按钮：`button` / `.primary` / `.secondary` / `.text-button` / `.danger` / `.icon` / `.toolbar-actions`
- 表单：`input/select/textarea` 统一 38px、sunken 底、`aria-invalid` 红边 + `.field-error` 左侧实线 + 文本（不靠颜色单独传达）
- 选择：`.chip` `.pill` `.badge` `.tabs` `.segmented` `.book-tabs`
- 数据：`.metrics/.metric` `.two-col` `.table-scroll` `table` `.pagination` `.plain-list`
- 反馈：`.callout/.notice` `.empty-state` `.d-loading` `.error` `.modal-backdrop` `.toast`
- 证据：`.evidence-label[data-src=verified|self|inferred|ai]`（实线 / 虚线 / 暖色 / 冷色）
- 导航：`.app-shell aside nav button(.active)`，激活态 = 填充 + 2px 金属竖条 + 发光极弱
- 可见性：`.sr-only`，`:focus-visible` 统一 2px 环 + 2px 偏移

## 5. 动效系统

| 场景 | 规则 |
|---|---|
| 页面进入 | `#main.p15-enter > *` 逐项 6px 上浮 + 透明度，40–110ms 阶梯；不延迟 DOM |
| 按压 | `--btn-shift: 1px` + `filter: brightness(.965)` + 接触阴影同帧变化（≤110ms） |
| 元选项 | 位移 + 描边 + 受光，禁止常驻动画 |
| 共享元素 | 仍由 `morph15d.ts` 负责（锚点容器），本层不干预 |
| 长文本/阅读 | `[data-level="c"] .reader-text * { animation: none }` |
| Toast | `--ease-out` 减速（不再用弹性回弹） |

## 6. 每页增量（`src/ui/pages/*.css`）

| 文件 | 覆盖 | 关键决定 |
|---|---|---|
| `quiz.css` | quiz / preview / preview-done / results | 词 62px 为唯一中心；四个选项是"物理键位"（kbd 槽 + 下沉按压）；正误用 ✓/✕ 形状 + 左侧 1px 语义线 |
| `reading.css` | reading | Level C：66ch、1.72 行高、侧栏 sticky 不压正文、导入/OCR 为安静面板 |
| `sentence-grammar.css` | sentence / grammar | 结构段与选项分层；正确/错误用形状与标签区分；图谱关系高亮而非装饰粒子 |
| `io.css` | input / output | 自评必须看起来是自评（虚线标签）；编辑器零动画、自动保存是静态状态 |
| `data.css` | diagnostics / stats / exam | 空样本 = 虚线`—`，不画 0 高柱；验证/行为/自评/推断四段证据条用线型区分；学校成绩标 self-reported |
| `mgmt.css` | unit / ai / settings | 阶段轨道有光端点；AI 报告左侧来源线；危险区物理隔离 |

## 7. 一致性约束（后续改动必须遵守）

1. 新样式只允许写进 `system.css` / `pages/*.css`，且必须用 `[data-level]` 或 `[data-page]` 作用域。
2. 不新增裸色值；状态色用 `color-mix(var(--ok) …)` 派生。
3. 不给正文加常驻动画；不引入 `backdrop-filter`；不使用 `!important`。
4. 任何"看起来像能力"的视觉（徽章、进度、图表）必须能追到 `verified / self / inferred / ai` 之一。
5. 每次 UI 改动后跑 `impeccable detect src/ui` 与真实页面检测，side-tab / bounce-easing 归零。
