# Phase 15h.1 · 语义标记与视觉状态收尾 · 测试报告

基线：`phase15h-full-ui-migration` / `764e854`
本轮不重新设计，不碰 15f/15g 的光影系统；只关闭 `docs/PHASE15H_MARKUP_BACKLOG.md` 里可安全解决的条目。

---

## 1. 口径统一

| 说法 | 实际 |
|---|---|
| 文档"22 项" | 那是 `grep` 行数：3 条已修 + 19 条待处理，**漏掉 io 表里 3 行**（首列不是路径，没被匹配） |
| 回执"20 项" | 子代理各自数的重叠条目，也没对齐 |
| **真实条目** | **原始 39 条 → 去重 25 条**：3（15h 已修）+ 14（本轮已修）+ 2（部分）+ 6（未修） |

未修的 6 条已在 backlog 里逐条写明"为什么停"，其中 2 条判定为已有等价实现（原生 checkbox 的 `:checked`、空值 `—` 文本）。

## 2. 本轮改了什么

### 2.1 ARIA（3 处）

| 位置 | 属性 | 从哪个真实状态派生 |
|---|---|---|
| 语法类别筛选 | `aria-pressed` | `grammarCategoryFilter` |
| 考试页签 | `aria-pressed` | `examTab` |
| 表达类型 | `aria-pressed` | `input.selectedType` |
| 表达自动保存 | `role="status" aria-live="polite"` | `input.saving`（文案本来就会变，缺的是播报语义） |

### 2.2 状态钩子（11 处）

| 页面 | 钩子 |
|---|---|
| 句子 | `.lab-option[data-verdict]`、`.lab-progress[data-step][data-total]`、`.tree-clause[data-clause-id][data-clause-kind][data-root]`、`.token[data-clause-id]`、`.tree[data-provenance]` |
| 语法 | `.concept-card[data-band]` |
| 阅读 | `tr[data-state]`、`#read-marks .mark-row.mark-*` |
| 输入 | `.cue-time` / `.cue-text` |
| 诊断 | `.diag-metric[data-quality][data-evaluability]`、`.diag-evidence-bar[data-total]` |
| 考试 | `.exam-item-meta[data-src][data-verified]`、`.exam-error[data-reported]` |

### 2.3 视觉表达（只加形状，不加装饰）

- 证据质量用线型区分：可核对实线 / 行为虚线 / 自报虚线（细）/ 混合点线 / 无证据点线。
- 句子作答：正确项实线左轨、误选项虚线左轨。**没有**用伪元素写"正确项"文字——`.picked::after` 已占用右上三角，硬塞文字会打架，"正确项 / 你选的"由 `.lab-feedback` 真实文案承担。
- 考试来源：官方/授权实线、项目编写虚线、用户提供虚线、AI 生成点线；错因自报行虚线左轨。
- 阅读库行：未读正体、已读降一档、未完成加粗。

### 2.4 顺手修掉的两个真问题

| 问题 | 处理 |
|---|---|
| 第一次写 `data-quality` CSS 时用了 `inferred`、`official_adapted`、`self_built` 三个**不存在的枚举值** | 全部改为类型定义里的真实值（`mixed`/`none`；`official`/`licensed`/`authored`/`user_supplied`/`ai_generated`/`unknown`）。这类错误不会报错，只会永远不生效——等于假实现 |
| CSS 里写了 `!important` 去压内联 `height` | 删掉。改成让 `drawTrend` 直接输出 `height:0`，样式表只换视觉 |

## 3. 验证

### 3.1 单元与类型

```
npx tsc --noEmit            →  0
npm test                    →  tests 386 / pass 386 / fail 0   （原 379 + 本轮 7）
npm run build:test          →  built in 5.05s
npm run build               →  built in 2.60s
```

`tests/a11yState.test.ts`（7 项，jsdom + fake-indexeddb）断言的是**状态变化**：

1. 句子选项：未答全 `pending` → 答后恰一个 `correct`，误选项数与反馈对错一致
2. 步骤条：`data-step` 从 1 递增到 2，`data-total` 恒定
3. 语法筛选：`aria-pressed` 单选，点击后旧选项必须回到 `false`
4. 考试页签：`aria-pressed` 转移，旧页签释放
5. 表达类型：`aria-pressed` 与视觉 `.active` 必须同源
6. 诊断：`data-quality` 只取真实枚举值，且每条有 `data-evaluability`
7. 自动保存：`role=status` / `aria-live=polite`，且保存过程中文本真的变化

### 3.2 真实浏览器（headless Edge + CDP + 真实 IndexedDB）

```
node scripts/phase15h1-live-a11y.mjs
→ 11/11 通过 · 页面异常 0 · 控制台错误 0
```

覆盖：语法筛选、考试页签、考试单题元信息、句子作答判定、表达自动保存、诊断指标质量、阅读库行状态（真实导入 92 词文章 → 回库 → `data-state="unread"`）。

### 3.3 旧门禁全部重跑

| 门禁 | 结果 |
|---|---|
| 对比度 | `checked=225 failures=0` |
| 移动端 | `device 10/10 · desktop 10/10` |
| 减少动效 | `overflowX=false`（深浅两套） |
| 性能 | DOM 254，0 掉帧 / 0 long task（沿用 15h 基线，本轮未加动画） |

## 4. 证据

| 类型 | 数量 | 说明 |
|---|---|---|
| 全站截图 | **86 张** | 7 个被改动页面 × 3 尺寸 × 2 主题**全部重拍**（42 张），其余沿用 15h |
| 状态截图 | 4 张 | `exam-item`（单题元信息）、`diagnostics-metrics`（证据质量）、`sentence-verdict`（作答判定）、`exam-practice` |
| 机器可读报告 | 1 份 | `screenshots/phase15h1/live-a11y-report.json` |

视觉复核（`vision_analyze`）对三张关键图逐一确认：

- 考试单题元信息行：竖线与文字有留白，不与卡片边框贴成双线，四段标签基线一致。
- 诊断指标网格：质量边线细、对齐，没有裁切文字。
- 结论都记在下面的"已知不足"里，不写成"审美达标"。

## 5. 已知不足（不粉饰）

1. **逐块 provenance 没做**：`structure.provenance` 是整篇一个值，逐块标注会是伪造。
2. **词块没进 tab 序**：要做 roving tabindex，属独立无障碍任务。
3. **难句在正文里仍无类名**：要改 `sentenceHTML` 的数据流，本轮按"不改学习逻辑"停手。
4. **段意"已记录"状态不存在**：功能本身只做即时反馈，不存储。
5. **视觉未获用户确认**：本轮只加状态形状，不宣布审美目标达成。
6. 移动端视觉构图仍未重做（按任务书要求不做）。
