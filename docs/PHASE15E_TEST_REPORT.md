# Phase 15e · 测试报告

运行环境：Windows 11 / Node v26.7.0 / Edge headless（CDP）/ 1440×900 桌面、390×844 移动。
构建：`npm run build:test`（tsc 0 error，vite testhooks 构建）。

---

## 1. 功能回归

| 检查 | 命令 | 结果 |
|---|---|---|
| 类型 | `npx tsc --noEmit` | 0 error |
| 单元/集成 | `npm test` | **379 / 379 pass**，0 fail，29.8s |
| 生产构建 | `npm run build` | 通过（见 CI 同流程） |

保留面未改动：DB v7、FSRS 调度、Task Executor、Daily Planner、Reading Evidence、PWA、Backup/Restore、Origin Isolation。

---

## 2. 可访问性与可读性

| 检查 | 命令 | 结果 |
|---|---|---|
| 对比度 | `node scripts/phase15c-contrast.mjs` | `checked=226 failures=0`（深/浅两套） |
| 键盘与语义 | `node scripts/phase15-a11y-probe.mjs` | 通过 |
| 移动端布局 | `node scripts/phase15d-mobile-audit.mjs` | device 10/10、desktop 10/10、escapers 0 |
| 文字尺寸 | CDP 探针 | 桌面 `tiny 0 / 105 节点`；移动 `tiny 0 / 87 节点`（15d：80/108 <12px） |
| 减少动效 | `node scripts/phase15c-reduced-motion.mjs` | 深/浅均 `stageAnim:none`、`ctaTrans:0s`、无横向溢出 |

---

## 3. 性能

`node scripts/phase15c-perf.mjs`：

| 场景 | 平均帧时间 | p95 | >20ms 掉帧 | long task | style 重算 | layout | 节点 |
|---|---|---|---|---|---|---|---|
| 15b（对照） | 4.88ms | 5.1ms | 0% | 0 | 498 | 4 | 254 |
| 15e a（空闲呼吸） | 4.92ms | 5.2ms | 0% | 0 | 182 | 17 | 290 |
| 15e b（指针跟随） | 4.92ms | 5.2ms | 0% | 0 | 41 | 0 | 253 |

持续动画只用 `transform` / `opacity`；`will-change` 仅 4 层。`style 重算 41 / layout 0` 说明光效没有触发重排。

---

## 4. 动态证据（真实截图 + 录屏）

### 4.1 空闲呼吸（15s/条，1440×900）

| 区域 | 深色幅度 | 深色 p95 帧间 | 浅色幅度 | 浅色 p95 帧间 |
|---|---|---|---|---|
| 舞台上 | 4.27 | 0.19 | 0.71 | 0.06 |
| 舞台中 | 1.43 | 0.10 | 1.00 | 0.07 |
| 舞台下 | 10.07 | 0.46 | 5.30 | 0.26 |
| 读数带 | 13.74 | 0.73 | 3.20 | 0.19 |
| 时间带 | 14.87 | 0.79 | 3.97 | 0.23 |

判读：
- 下半部分从 15d 的 0.29–0.40 级（不可见）提升到 10–15 级 / 3–5 级。
- 帧间 p95 ≤0.79 级 → 无闪烁；>6 级的只有 1 帧（采集丢帧）。
- 抽帧复核（`stills/idle-breath-strip.png`）：F1/F8 顶部最亮 → F4/F5 底部+读数带最亮 → F6/F7 回升，是"光从上走到下再回来"。

### 4.2 共享元素

`__morphTrace`（每帧记录几何/内容/页面透明度）：

| | 15d | 15e 进入 | 15e 返回 |
|---|---|---|---|
| 时长 | 620ms | 440ms | 360ms |
| 25% 时间位移 | 80.6% | 35.2% | 29.0% |
| 50% | — | 66.6% | 61.0% |
| 75% | — | 90.4% | 91.0% |
| 90% | 98.3% | 99.0% | 98.5% |
| 新旧内容同帧可读 | 有（412ms） | 无 | 无 |
| 几何回退帧 | — | 0 | 0 |
| 旧内容消失 | 211ms | 104ms | 88ms |
| 新页面开始淡入 | 40ms | 176ms | 153ms |

录像逐帧复核（`journey-dark.mp4`，12fps 抽帧）：帧 1–3 旧文字变淡、帧 4 起容器内已无旧文字、帧 8 新页面文字出现，**没有任何一帧新旧文字同时可读**。

### 4.3 按压与触控

| 场景 | 证据 | 结果 |
|---|---|---|
| 鼠标按下/保持/释放 | `press-dark.mp4` | 弹簧 1.000 → 0.951 → 1.020 → 1.000 |
| 触摸按下/释放 | `touch-dark.mp4` + `stills/touch-pressed.png` | 触点光斑 opacity 1、行 `is-pressed`、松手后 `is-open` |
| 行展开/收起 | `expand-dark.mp4` | 220ms 展开，内容不跳位 |
| 指针光跟随 | `pointer-dark.mp4` | 聚光落在指针位置（抽帧见舞台左上亮斑） |
| 阅读页稳定 | `reading-dark.mp4` | 正文零位移；页面无 `animation` |

---

## 5. 未被验证 / 存疑

1. **深色触摸帧未单独隔离**：`touch-dark.mp4` 时长 3.1s，按下的确切帧没有逐帧标定；触摸反馈以 CDP 探针（DOM 状态）+ 浅色截图为准。深色下的视觉效果需要人眼确认。
2. **preview-done 页的主题不一致**：`journey-dark.mp4` 4.9s 处的"PREVIEW COMPLETE"页是浅色，而 Today 是深色。怀疑是测试脚本"切主题后立刻开始任务"导致重新载入 settings 时读到旧值（主题保存在 IndexedDB）。**不是 15e 引入**，也不在 Today 范围内，留给 15f 核实。
3. **返回转场的视觉证据**：反向转场已由 trace 验证（381ms、无重叠、无回退、结束后 Today 完整），但从 `.quiz-card` 出发的录屏因测试任务选择问题没有拍到干净的返回序列。
4. 浅色主题的材质运动幅度（3–4 级）低于深色（10–15 级）。这是白纸物理决定的：白色表面只能靠"影子经过"表达受光。若嫌弱，可在 15f 调整 `--d-lit`，但再强会有"脏影"风险。

---

## 6. 证据文件清单

```
screenshots/phase15e/stills/
  today-dark.png            1440×900 深色首屏
  today-light.png           1440×900 浅色首屏
  today-dark-390.png        390×844 移动端
  today-expanded.png        行展开态
  touch-pressed.png         触摸按下（光斑 + 白底 + 描边）
  idle-breath-strip.png     呼吸抽帧时间条
screenshots/phase15e/recording/
  idle-dark.mp4             15s 空闲（深）
  idle-light.mp4            15s 空闲（浅）
  idle-m-light.mp4          15s 空闲（390 宽移动）
  pointer-dark.mp4          指针光跟随
  press-dark.mp4            按压弹簧
  expand-dark.mp4           行展开
  journey-dark.mp4          进入 + 跳转
  return-dark.mp4           返回（时间点未对准，见 §5）
  touch-dark.mp4            触摸反馈
  reading-dark.mp4          阅读页稳定
  idle-dark-b9/b11/b15.mp4  呼吸周期 A/B
```
