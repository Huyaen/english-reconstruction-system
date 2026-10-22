# Phase 10 · 能力诊断与学习分析：依赖调研与 PoC

> 调研日期：2026-10-22。所有版本、许可证、维护状态均通过 GitHub API 与 npm registry 现场查询，不凭记忆。
> 原则：不为“看起来专业”引入依赖；默认本地优先、可离线、可回滚。

## 1. 现状检查（先复用，再新增）

| 已有能力 | 位置 | 结论 |
| --- | --- | --- |
| 技能快照字段（D1/D7/D30、未知词率、阅读速度、翻译依赖等） | `src/types.ts` `SkillSnapshot` | 复用结构，新增可选 `diagnostics` 明细，不破坏旧快照 |
| 周诊断记录 | `WeeklyDiagnostic` | 复用，新增可选 `diagnostics`；`results` 仍保留 metrics 数组供旧逻辑读取 |
| 词/语法/句/阅读/输入/输出证据 | `Data` 各实体 | 诊断只读取，不复制证据、不建第二套真源 |
| 生命周期判断 | `src/evidence.ts` `lifecycleOf` | 直接复用 active/productive 阈值，避免另造“稳定词”标准 |
| 计划器 | `src/planner.ts` | 仅显式传入瓶颈时重排柔性任务，不改时长与关键任务 |
| 备份校验 | `src/db.ts` `validateBackup` | `SkillSnapshot` 增加可选字段，无需升 DB 版本；已有往返测试 |

**没有找到可复用的图表/诊断库**；项目现有视图均为纯 HTML + CSS，继续保持零运行时图表依赖。

## 2. 候选库评估

| 候选 | 版本 / 许可证 | 维护状态 | 依赖 | 结论 |
| --- | --- | --- | --- | --- |
| `fast-check` | 4.10.2 · MIT | 2026-10-22 仍活跃，5.2k★，TypeScript | `pure-rand` | **采用（devDependency）**：性质测试能直接驱动 `node:test`，可复现种子、可收缩最小反例；只在测试期使用，生产包零影响 |
| `simple-statistics` | 7.12.1 · ISC | 2026-10-14 活跃，3.5k★ | 无 | **不采用**：本项目只需要分位数/均值/比率，约 60 行纯函数；自研可精确定义 null/样本门槛，避免把“无证据”算成 0 |
| `uPlot` | 1.6.32 · MIT | 活跃，10.5k★ | 无 | **不采用**：诊断看板当前以数值卡片与文字变化为主，不需要交互式时间序列；引入 canvas 图表会增加可访问性与移动端成本 |
| `@observablehq/plot` | 0.6.17 · ISC | 2026-09 活跃，5.4k★ | `d3`、`isoformat`、`interval-tree-1d` | **不采用**：为几张趋势条引入 D3 生态不划算；打包与主题适配成本高于收益 |
| `fsrs-optimizer` | BSD-3-Clause | 2026-08 活跃，Python | Python/PyTorch 生态 | **不采用**：参数拟合需要足够复习样本；本机学习数据远未达到可靠拟合规模，且会引入第二套调度器，违背“单一调度权威” |
| `srs-benchmark` | **无许可证文件**（GitHub license API 404） | 2026-10 活跃，Jupyter | 研究代码 | **仅参考评估思路，不复用代码**：无许可证不得复制；且它是离线研究基准，不是产品运行时组件 |

### 版本/许可证证据

- `https://api.github.com/repos/dubzzz/fast-check` → `MIT`，`pushed_at 2026-10-22T06:04:48Z`
- `https://api.github.com/repos/simple-statistics/simple-statistics` → `ISC`
- `https://api.github.com/repos/leeoniya/uPlot` → `MIT`
- `https://api.github.com/repos/observablehq/plot` → `ISC`
- `https://api.github.com/repos/open-spaced-repetition/fsrs-optimizer` → `BSD-3-Clause`，Python
- `https://api.github.com/repos/open-spaced-repetition/srs-benchmark/license` → `404 Not Found`
- `https://registry.npmjs.org/fast-check/latest` → `4.10.2`，`engines.node >=12.17.0`，类型 `lib/fast-check.d.ts`
- `https://registry.npmjs.org/simple-statistics/latest` → `7.12.1`
- `https://registry.npmjs.org/uplot/latest` → `1.6.32`
- `https://registry.npmjs.org/@observablehq%2fplot/latest` → `0.6.17`

## 3. PoC：fast-check × node:test

安装 `npm install -D --save-exact fast-check@4.10.2` 后，临时用例验证：

1. 比率始终落在 `[0,1]`，分母为 0 时为 `null`；
2. 分位数单调且不越界；
3. 失败时能收缩到最小反例（`[1,1,1]`）并保留种子复现。

运行命令：`node --import tsx --test tests/.poc-fast-check.test.ts` → **3/3 pass**，安装体积 1.5 MB（仅开发依赖）。

**结论：采用 fast-check 作为唯一的性质测试依赖**，PoC 文件在正式性质测试（`tests/diagnostics.test.ts` 中的两个 `fc.assert`）落地后删除。

## 4. 未采用方案的原因汇总

- **不引入图表库**：诊断页以“结论 + 可核对数值 + 分母 + 质量标签”为核心；图表不能替代解释，反而诱导用户把复杂能力压缩成一条曲线。
- **不引入统计库**：自研分位数/比率带明确 null 语义与最少样本门槛，避免第三方默认行为（如空数组返回 0）制造假精度。
- **不引入 FSRS 参数优化器**：数据量不足时拟合参数没有统计意义；现有调度权威保持不变。
- **不复制 srs-benchmark**：无许可证；只借鉴“分桶评估”的思想。

## 5. 回滚策略

- 卸载测试依赖：`npm uninstall fast-check`，删除 `tests/diagnostics.test.ts` 中两个 `fc.assert` 用例即可；生产代码不引用 fast-check。
- 诊断模块全部为新增文件；移除导航与 `planInput.diagnosticFocus` 即回到 Phase 9 行为。快照新增字段均为可选，旧备份仍可读。
