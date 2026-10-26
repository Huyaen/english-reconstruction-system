# Phase 15g · 验收报告

分支 `phase15g-motion-integrity`（基线 `8ff5524`）· Windows 11 · Node 26.7 · Edge headful 1440×909 采集

## 1. 构建与回归

| 项 | 命令 | 结果 |
|---|---|---|
| TypeScript | `npx tsc --noEmit` | 0 error |
| 单元测试 | `npm test` | **379 / 379 pass**，0 fail |
| 生产构建 | `npm run build:test` | 成功 |
| 对比度 | `phase15c-contrast` | 226 检查 / **0 失败** |
| Reduced Motion | `phase15c-reduced-motion` | 两主题 `stageAnim: none`、`ctaTrans: 0s`、无横向溢出 |
| 帧时间 | `phase15c-perf` | 平均 **3.85ms**、p95 3.9ms、0 掉帧、0 long task、DOM 253 节点 |
| 移动端 | `phase15d-mobile-audit` | device 10/10、desktop 10/10 |

## 2. 原始视频（PC）

| 文件 | 时长 | 体积 |
|---|---|---|
| `completion-dark.mp4` | 17.0s | 1.7 MB |
| `idle-dark.mp4` | 22.4s | 3.0 MB |
| `journey-forward-dark.mp4` | 3.1s | 0.7 MB |
| `journey-return-dark.mp4` | 11.0s | 1.3 MB |
| `journey-triple-dark.mp4` | 25.7s | 3.2 MB |
| `pointer-dark.mp4` | 21.0s | 3.0 MB |
| `pointer-nobreath-dark.mp4` | 19.7s | 2.0 MB |
| `press-dark.mp4` | 7.0s | 1.0 MB |
| `theme-switch-dark.mp4` | 6.3s | 0.9 MB |

采集口径：headful Edge + `Page.startScreencast`；成片时长与采集时长一致（±0.02s），
未裁剪、未加速、未删帧。

## 3. 黑帧审计（全部 9 段）

阈值：`YAVG < max(10, 中位数×0.35)`。

| 片段 | 帧数 | 中位 YAVG | 最暗 | 近黑帧 |
|---|---|---|---|---|
| completion-dark | 935 | 15.4 | 11.8 | **0** |
| idle-dark | 1343 | 32.5 | 31.5 | **0** |
| journey-forward-dark | 189 | 32.6 | 15.9 | **0** |
| journey-return-dark | 451 | 15.6 | 12.6 | **0** |
| journey-triple-dark | 1210 | 15.6 | 13.3 | **0** |
| pointer-dark | 1258 | 32.7 | 31.4 | **0** |
| pointer-nobreath-dark | 1180 | 32.5 | 31.9 | **0** |
| press-dark | 417 | 33.4 | 31.9 | **0** |
| theme-switch-dark | 379 | 33.9 | 31.9 | **0** |

注：journey 系列的"中位 15"来自学习页本身（Phase 14 的近黑底），不是转场帧；
转场区间内最低 12.6，仍高于阈值，且没有整页丢失。

## 4. 转场时间线（`window.__morphTrace`）

| 指标 | forward | reverse |
|---|---|---|
| 容器起点 | 708×345 @ (622,120) | 学习页卡片 |
| 容器终点 | 710×383 @ (491,186) | Today 任务板 |
| 时长 | 470ms + 88ms 收尾 | 400ms + 84ms |
| 底板提前消失（geo<0.8 时） | **0 帧** | **0 帧** |
| 几何单调 | 是 | 是 |
| 每帧最大位移 | 无跳变（smoothstep + 1% 阻尼） | 同 |

## 5. 主题稳定性

| 场景 | 结果 |
|---|---|
| 深色：Today → 学习 → 返回 | 全程 `dark` |
| 浅色：Today → 学习 → 返回 | 全程 `light` |
| 手动切换两次 | `theme-switch-dark.mp4` 干净，无中途跳变 |

15f 录屏里"深色突然变浅"的根因是录制脚本在第 184 行点了 `#theme`，已从脚本移除。

## 6. 已知问题与未验证边界

1. **学习页底色仍是 Phase 14 的近黑场**（YAVG≈15）。本轮只加了 Today 的环境光晕，
   没有重做该页 —— 用户要求"其余页面暂不推广新设计"。转场本身不再压暗（33→31→27→21 平滑），
   但落点页面的整体亮度低于 Today。
2. **指针环是合成的**：CDP 截图不含系统光标，环按事件日志叠加。真实窗口 gdigrab 录制的
   `window-*.mp4` 仅用于黑帧交叉验证（该链路在本机受前台焦点争抢影响，无法长时间稳定）。
3. **采集帧率 41–60fps 波动**：screencast 按合成变化推流，静止段帧率更高；
   时间轴已按真实时间戳对齐，但个别片段帧率低于 60。
4. 移动端、Reading、其余页面未改动。
5. `journey-forward-dark.mp4` 只有 3.15s（点击后立即进入加载），
   三次往返的完整证据在 `journey-triple-dark.mp4`（25.7s，3 次进入 + 3 次返回）。
6. 深色下 `.answer` 等学习页控件仍是旧样式，未做材质统一。
