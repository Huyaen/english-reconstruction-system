# Phase 15h.2 · 测试与修复报告

基线 `phase15h1-semantics` @ `b4e4b2d`。本轮只修 QA 发现的问题，不改视觉系统、不改学习算法、不升级 IndexedDB、不合并 main。

## 1. P1 修复：考试单选的行内布局

**现象**：单选圆点在行中部，答案正文被推到最右，中间一大片空白。

**根因**（真实浏览器量出来的，不是看 CSS 猜的）：`src/style.css` 里 `input { width: 100% }` 是全局规则，`.exam-option` 是 flex 行，于是 `<input type=radio>` 作为 flex 子项被拉到 **893px**，把"标识 + 正文"顶到行尾。

| | input | 标识 | 正文 |
| --- | --- | --- | --- |
| 修前 | x=363 **w=893** | x=1257 w=14 | 被挤出行 |
| 修后 | x=363 **w=15** | x=390 w=14 | x=416 w=929 |

修法（`data.css`）：

```css
[data-page="exam"] .exam-option input[type="radio"] { flex: 0 0 14px; width: 14px; height: 14px; margin: 4px 0 0; }
[data-page="exam"] .exam-option > span:last-child { flex: 1 1 auto; min-width: 0; }
```

行序保持 圆点 → 标识 → 正文；`<label>` 包住整行所以整行可点；原生 radio 保留键盘（方向键/空格）与读屏语义；选中态 `.selected` 用描边 + 微底色，深浅两套主题下都验证过。

**顺带修掉的第二个缺陷**：模板里 `.selected` 是按 `draft` 渲染的，但点选 radio 不触发重渲染（草稿只在「下一题 / 保存 / 提交」时落盘），所以行高亮**永远不出现**，只剩原生 3px 圆点。加了一个只同步视图类的 `change` 监听（不写业务状态）：

```ts
document.querySelectorAll('.exam-option input[type="radio"]').forEach(input => {
  input.addEventListener('change', () => {
    document.querySelectorAll('.exam-option').forEach(row => {
      const own = row.querySelector('input[type="radio"]');
      row.classList.toggle('selected', !!own?.checked);
    });
  });
});
```

## 2. P1 修复：判题后选项可读性

**现象**：句子判题后，正确项 / 误选项 / 其他选项一起变灰，正确答案也看不清。

**根因**：`system.css` 的通用禁用态

```css
[data-level] button[disabled] { color: var(--ink-faint); opacity: .72; }
```

`.lab-option` 作答后就是 `disabled`，于是整行被压到 0.72。sentence-grammar.css 里那条 `.lab-option:disabled { opacity: 1 }` 因为是**同一层被后写的通用规则覆盖**（且优先级更低），没有生效。

**实测（累乘祖先 opacity 后的真实对比度）**：

| 选项 | 修前 opacity | 修前正文 | 修前小字 | 修后 opacity | 修后正文 | 修后小字 |
| --- | --- | --- | --- | --- | --- | --- |
| 误选 | 0.72 | 2.72 | 3.25 | 1 | 13.78 | 5.88 |
| 其他 | 0.72 | 3.19 | 3.78 | 1 | 12.57 | 7.67 |
| 正确 | 0.72 | 3.19 | 3.78 | 1 | 17.98 | 7.67 |

修法：判题态不吃"禁用压暗"，用**文字色 + 左轨线型**表意——正确项实线、误选项虚线，正文回到 `--ink` / `--ink-soft`，小字 `--ink-muted`。没有用伪元素写"正确/错误"字样（`.picked::after` 已被右上角三角占用）。

## 3. P1 复核：诊断页截图偏暗

结论：**不是页面缺陷，是截图时序**。

- 稳定态实测：`#main` opacity 1，卡片 39 张，数字对比度 15.17，小字 4.91，无 `.d-loading`。
- 复核截图（重新过稳定态门控）：证据构成、记忆保持、本周结论全部在，无裁切。
- 根因：`phase15h-capture.mjs` 原来是 `点击导航 → sleep(760) → sleep(180) → 截图`。诊断页要等 IndexedDB 读完再渲染 39 张卡，760ms 不够，于是拍到半页。
- 修法：加稳定态门控——文本非空 + 无 `.d-loading` + 无有限次动画在跑 + 文本 150ms 内不再变化（上限 6s）。全站 84 张静帧都用这个门控重拍，manifest 里记了每张的 `readyMs`（675–900ms）。

没有改配色。

## 4. 新增测试

`tests/phase15h2.test.ts`（4 条，断言结构事实而不是像素）：

1. **导航不允许空壳**：14 页逐个点击，**同一 tick 内** `#main` 必须有子节点与可读文本（占位也算）。这条守的是"主内容消失"不能从应用侧发生。
2. **考试单选行序**：每个 `.exam-option` 的前三个子元素必须是 `input[type=radio]` → `.exam-option-id` → 正文。
3. **选中态只一行**：点选后恰好一行 `.selected`；换选后旧行必须取消。
4. **判题态不被内联压暗**：每个选项都有真实 `data-verdict`，且 `style` 里不得出现 `opacity`；正确项恰好一个。

## 5. 回归结果

| 项目 | 结果 |
| --- | --- |
| `npx tsc --noEmit` | 0 |
| `npm test` | **390 / 390**（386 + 新增 4） |
| `npm run build` / `build:test` | 通过 |
| `phase15h1-live-a11y.mjs`（真实 IndexedDB） | **11/11**，异常 0，控制台错误 0 |
| `phase15h2-navprobe.mjs 3`（14 页 × 3 轮） | 42/42：empty 0ms、loading 0ms、invisible 17–102ms、firstGood 156–294ms、异常 0 |
| 对比度 `PROTO=d` 深色 | **225 检查 / 0 失败** |
| 对比度 `PROTO=d` 浅色 | **225 检查 / 0 失败** |
| `phase15d-mobile-audit.mjs` | device 10/10、desktop 10/10，PASS |
| `phase15c-reduced-motion.mjs` | 深浅两套均无横向溢出 |
| `phase15h2-crosscheck.py` | 15 段新录制：DOM 空窗 0、帧空窗 0、空洞 0（2 处 ~700ms 在片尾静止段） |

## 6. 证据清单（全部来自 `b4e4b2d` 之后的修复构建）

- `screenshots/phase15h/` — **84 张**（14 页 × 2 主题 × 3 尺寸），全部过稳定态门控，`capture-manifest.json` 记 `readyMs`
- `screenshots/phase15h2/stills/` — 28 张（1440×900 × 2 主题 × 14 页），本轮专项
- `screenshots/phase15h2/interaction/` — 7 张：考试答题前/后、句子判题前/后、表达输入与自动保存、阅读正文、阅读辅助面板
- `screenshots/phase15h2/recording/` — 7 段：`data` / `io` / `mgmt` / `sentence` / `vocab` / `reading-real`（真读文章 + 开面板）/ `nav-all`（14 页导航，25.5s）
- `screenshots/phase15h2/nav-probe.json` — 42 次导航的逐帧 DOM 真值
- `screenshots/phase15h2/measure.json` — 单选几何、判题对比度、诊断密度
- `screenshots/phase15h2/selectors.json` — 177 条页面级规则 0 命中
- `screenshots/phase15h2/evidence-manifest.json` — 每张静帧的 `readyMs` 与文本长度

## 7. 未修 / 未复现 / 仍缺证据

**确认但本轮不修**

- 177 条 `[data-level] … [data-page]` 规则从未命中（`data-page` 在 `<html>` 上，不在后代上）。启用等于同时上线 177 条从未生效的样式，属视觉系统变更，需单开一轮。详见 `PHASE15H2_FORENSICS.md` §4。
- 15h.1 留下的 6 条产品策略项（正文难句类名、段意"已记录"、`data-last`、阅读 `aria-busy`、证据行拆字段、L1–L3 提示收进 `<details>`）保持不动。

**未复现**

- 页面切换主内容消失：应用侧 0/42 导航、0/20 录制。见取证文档。

**仍缺证据**

- 移动端构图（本轮明确不做，只守不溢出）。
- 长文（>3000 词）与万词级词库下的导航时序。
- 真机 / 读屏软件（VoiceOver/NVDA）实测。
- `proto=a` 遗留原型首页的 hero 主按钮：审计读到 fg 12,16,21 / bg 8,9,11，与该按钮实际的 `.primary` 金属渐变不符，未追（该页不在上线层；上线层 `proto=d` 双主题 225/0）。
- 深浅主题切换的中间帧无法用纯色对比审计（已让脚本跳过渐变文字/渐变底，并把这类记为"不可测"而不是"通过"）。
