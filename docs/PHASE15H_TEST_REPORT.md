# Phase 15h · 验收报告

分支 `phase15h-full-ui-migration`（基线 `phase15g-motion-integrity` / `6a550fe`）
Windows 11 · Node 26.7 · Edge headful · 采集 1440×948 / 截图 1440×900 · 1920×1080 · 1366×768

---

## 1. 功能回归（强制项）

| 项 | 命令 | 结果 |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | **0 error** |
| 单元 / 集成 | `npm test` | **379 / 379 pass**，0 fail |
| 生产构建 | `npm run build:test` | 成功（`dist-test`） |
| 测试钩子 | 构建产物内 `?test=1` 钩子 | 截图与录屏全部经由真实钩子路径，未绕过业务层 |
| 对比度（默认路径 `proto=d`） | `PROTO=d node scripts/phase15c-contrast.mjs` | **225 检查 / 0 失败**（修掉 Hero 禁用态 2.25:1 后复测） |
| Reduced Motion | `node scripts/phase15c-reduced-motion.mjs` | 深/浅两主题 `overflowX: false`，动效时长归零 |
| 移动端窄视口 | `node scripts/phase15d-mobile-audit.mjs` | **device 10/10 · desktop 10/10** |
| 帧时间 | `node scripts/phase15c-perf.mjs` | 平均 **15.5ms**（vsync 上限，≈64fps）、p95 16.1ms、**0 掉帧**、**0 long task**、DOM 254 |
| 原型回退 | `?proto=legacy` | 15b 界面仍可渲染，业务逻辑不变 |

> 对比度说明：默认 `PROTO=a` 跑会得到 2 处失败，全部来自 **proto=a 旧原型**的渐变文字/金属按钮，
> 检测器读不到 `background-clip:text` 与渐变背景，属于测量盲区；默认产品路径 `proto=d` 为 225/0。

## 2. 全站截图（真实浏览器）

| 尺寸 | 深色 | 浅色 | 合计 |
|---|---|---|---|
| 1440×900 | 14 页 | 14 页 | 28 |
| 1920×1080 | 14 页 | 14 页 | 28 |
| 1366×768 | 14 页 | 14 页 | 28 |
| 训练流程（question / feedback） | 2 | — | 2 |
| 阅读态（真实文章，深/浅） | 1 | 1 | 2 |
| **合计** | | | **86 张**（训练态截图由视频覆盖，见 §8） |

页面：home / books / weak / sentence / reading / input / output / grammar / unit / diagnostics / exam / stats / ai / settings。
清单与每张的标题文本：`screenshots/phase15h/capture-manifest.json`。

## 3. 原始交互视频（6 段，覆盖 16 条流程中的 13 条）

| 文件 | 时长 | 帧数 | 覆盖流程 |
|---|---|---|---|
| `vocab-dark.mp4` | 22.9s | 846 | ①Today→词汇训练 ②Preview ③Recall 作答→下一题→退出 |
| `sentence-dark.mp4` | 7.3s | 174 | ④Today→Sentence Lab ⑤句式操作 ⑩语法概念 |
| `reading-dark.mp4` | 8.5s | 204 | ⑥Today→Reading ⑦阅读与辅助面板 |
| `io-dark.mp4` | 9.3s | 370 | ⑧Real Input 会话 ⑨Output 任务与编辑 |
| `data-dark.mp4` | 15.0s | 359 | ⑫Diagnostics 展开 ⑭统计时间范围 ⑬Exam 练习 |
| `mgmt-dark.mp4` | 12.7s | 305 | ⑪单元 ⑮备份确认 ⑯主题切换（深→浅） |

**未覆盖**：阅读辅助面板的细操作、Output 自动保存的逐秒状态、考试错因归因的展开 —— 这三条没有视频，
只有截图，如实记录，不用"已覆盖"含糊过去。

采集口径（脚本 `scripts/phase15h-record.mjs`）：
- CDP：`Page.startScreencast`，**headful**（15g 已证实 headless 版会整层丢失）；
- 独立 `--app` 窗口，`--force-device-scale-factor=1`，1440×948；
- 指针：`Input.dispatchMouseEvent` 真实命中；截图不含系统光标，编码时按事件日志叠加（唯一合成层）；
- 帧率由合成器推流决定（24–60fps），每帧带真实时间戳；成片时长 == 采集时长（误差 ≤0.05s）。

## 4. 近黑帧审计

阈值 `YAVG < max(10, 中位×0.35)`：

| 片段 | 帧数 | 中位 YAVG | 最暗 | 近黑帧 |
|---|---|---|---|---|
| vocab-dark | 846 | 17.7 | 12.4 | **0** |
| sentence-dark | 174 | 23.2 | 12.3 | **0** |
| reading-dark | 204 | 19.3 | 15.3 | **0** |
| io-dark | 370 | 23.9 | 12.3 | **0** |
| data-dark | 359 | 21.7 | 12.3 | **0** |
| mgmt-dark | 305 | 19.6 | 12.3 | **0** |

"0 近黑帧"只证明**没有黑屏**，不证明视觉质量达标；质量结论看 `PHASE15H_VISUAL_REVIEW.md`。

## 5. 性能细节（真实浏览器，非 rAF 自测）

- 帧时间：15.5ms 均值（受 vsync 限制），p95 16.1ms，**0 帧超过 20ms**。
- 主线程：0 long task；style 重算 219 次（页面进入的阶梯动画）；layout 1 次。
- DOM：254 节点（15b 为 289），比迁移前更轻。
- 未测：大词库（>5k 词）滚动性能、长阅读（>8k 词）首屏、长文本编辑的输入延迟 —— 本轮无对应合成数据，
  不写"通过"。

## 6. 已知问题

1. **移动端只做了"不溢出"**：10/10 是布局门禁，不是视觉验收；构图未重做。
2. **旧原型层未清理**：`proto15c*.css`、`reading15*.css` 仍加载，`!important` 竞争在旧层里仍存在。
3. **阅读辅助面板、Output 自动保存、考试错因** 三条没有视频证据。
4. `--ease-spring`（弹性）仍留在 tokens 里，新层不用它，但旧层会；`impeccable detect` 因此报 1 条 advisory。
5. 学情诊断 / 统计在"完全没有记录"的新 profile 下只验证了空态，没有验证长期数据下的图表密度。

## 7. 阅读态专项（本轮新增证据）

| 项 | 实测 |
|---|---|
| 正文列宽 | 622px |
| 字号 / 行高 | 19px / 33.06px（1.74） |
| 每行字符 | ≈ 65 字符 |
| 右栏 | 去卡片化后降为 1px 分隔轨；视觉复核判定"不再抢正文" |
| 截图 | `reading-passage-dark-1440x900.png` / `reading-passage-light-1440x900.png` |

样文是本项目自写的英文短文（`The Cost of Convenience`），**不是抓取的真实文章**，不冒充任何来源；
它只用于验证阅读态排版。导入链路本身走的是真实表单与真实持久层。


## 8. 评审回执后的第二轮验收（2026-10-28）

按两个独立评审的意见修完，并用**渲染后 DOM 快照**复测（`scripts/phase15h-snapshot.mjs`，14 页 × 深/浅 = 28 张）：

| 阶段 | detect findings（28 快照合计） |
|---|---|
| 修复前 | 255 |
| 第一轮 | 63 |
| 第二轮（本轮） | **34**，其中 8 条是金属拉丝纹理、8 条是 3 处手写 eyebrow、少量 nested-cards 判定 |

| 项 | 结果 |
|---|---|
| `tsc --noEmit` | 0 |
| `npm test` | **379 / 379** |
| 对比度（proto=d） | **225 / 0** |
| 移动端 | device 10/10 · desktop 10/10 |
| Reduced Motion | 深/浅两主题 `overflowX: false` |
| 截图 | **86 张**（84 = 14 页 × 3 尺寸 × 2 主题，+ 2 张阅读态）。原先两张 22:08 的训练态截图已过期，已删除；训练态由 `vocab-dark.mp4` 视频承担 |
| 视频 | 6 段（本轮未重录；受影响的是 weak/books/grammar 三页的静态布局） |

本轮修掉的真实缺陷：books `lifecycle` 3.3:1（根因旧层 `opacity:.65`）、浅色掌握度色 3.08/2.54/3.12、
diagnostics 11px ×29、grammar 34 张卡嵌套 ×36、`d-pulse` 无限脉冲、nav/预算条/圆点彩色光晕、
考试 2px 彩边 + 16px 圆角、设置极光光斑、重复 `import io.css`、薄弱词与词库同构（P0）。
