# Phase 15d 最终视觉验收 · 测试报告

生成时间：2026-10-25
分支：`phase15d-dynamic`
本轮起点提交：`b25d8f5`（纠偏已完成并推送）
本轮改动范围：**只改验收脚本与文档**，未改任何 UI 代码、未动数据库、未合并 `main`。

## 1. 本轮脚本修复

| 文件 | 问题 | 修复 |
| --- | --- | --- |
| `scripts/phase15d-mobile-audit.mjs` | 5 个宽度全部用 `mobile:false`，却以「移动端审计」名义输出结论 | 拆成 `device`（mobile:true / DPR 3 / Android UA / 5 触点）与 `desktop`（mobile:false / DPR 1 / 桌面 UA / 无触摸）两个配置档，分别判定、分别计数；断言改为「全页截图像素宽 = 视口 × DPR」 |
| `scripts/phase15c-contrast.mjs` | 主题翻转后只等 900ms，可能采到 220ms 颜色过渡的中间色（曾把深色行卡读成 `rgba(176,178,180,.886)`） | 采样前轮询 `.d-row` 的 `background-color` 直到连续 3 次稳定（上限 2.4s），再做对比度审计；保留失败项的截图像素复核 |
| `docs/PHASE15D_DYNAMIC.md` | 移动端结论写成「8/8」、Shared Element 写成「50 帧 / 748ms」 | 更正为 device 10/10 + desktop 10/10、40 帧 / 603ms；补设备模拟与真机的边界说明 |
| `HANDOFF.md` | 同上口径不一致 | 同步为「设备模拟 10/10 + 桌面窄视口 10/10」 |

## 2. 移动端审计（`scripts/phase15d-mobile-audit.mjs`）

- 视口：320 / 360 / 390 / 414 / 768；页面：Today / Reading。
- `device` 档：`mobile:true`、DPR 3、Android Chrome UA、`maxTouchPoints=5`、`pointer:coarse`。
- `desktop` 档：`mobile:false`、DPR 1、桌面 Edge UA、触摸关闭、`pointer:fine`。
- 每格检查：`innerWidth === 视口`、`visualViewport.width`、`documentElement/body.scrollWidth`、越界元素、横滚容器豁免、全页截图像素宽。

结果：

| 档 | 通过 | 全页像素宽示例（390） |
| --- | --- | --- |
| device | **10/10** | 1170 × 10563（=390×3） |
| desktop | **10/10** | 390 × 3521 |

- 20 个组合 `escapers` 全部为 0。
- 已知字段噪声：无头 Edge 在 desktop 档 `navigator.maxTouchPoints` 仍报 10（CDP 无法清零），但 `pointer:coarse=false`、触摸事件未启用；该字段不作为设备类型判据。
- **边界**：设备模拟只代表布局响应，不覆盖真机浏览器 UI、地址栏收缩、软键盘、真实触摸滚动物理，不能当作真机验收。

## 3. 业务与构建回归

| 检查 | 命令 | 结果 |
| --- | --- | --- |
| 类型检查 | `npx tsc --noEmit` | 0 错 |
| 单元测试 | `npm test` | **379 / 379**（44.1s） |
| 生产构建 | `npm run build` | 通过（`dist` 更新） |
| 测试构建 | `npm run build:test` | 通过（`erv2-shell-v2-d8c2978b97`） |
| 浏览器冒烟 | `SMOKE_PORT=9915 node scripts/phase3-smoke.mjs` | **21 / 21** |
| 对比度（PROTO=d） | 暗/亮 × 1920/390 | **4 组，226 项，0 违规** |

## 4. 动态与性能（沿用本轮构建的实测）

- 空闲 10s：帧间隔 p50 **3.8ms** / p95 **3.9ms**，>32ms **0 帧**，longtask **0**。
- 交互 4s（合成指针扫动）：p50 **3.8ms** / p95 **3.9ms**，>32ms **1 帧**（61.6ms），longtask **0**。
  - 该帧出现在软件光栅下首次为三层混合光写样式时；未做任何隐藏或裁剪，原始录屏与帧数据均保留。
- reduced-motion：`running 0`，光层 `animation: none`。
- 主按钮弹簧（DOM 实测）：1.000 → **0.951**（按下）→ **1.020**（释放过冲）→ 1.000。
- 共享元素（逐帧抓取）：40 帧 / 603ms，容器宽 1001px → 710px，点击后 29 帧，无空白帧。

## 5. 数据库与学习功能

- DB schema 仍为 **v7**，本轮无迁移、无写入逻辑改动。
- 导入 → 计划 → 预览 / Recall / 收尾 → 刷新恢复 → Re-entry 全链路由 `phase3-smoke` 21 项覆盖并通过。
- 未使用任何真实用户数据：所有验收在 `?test=1` 的隔离 profile + 合成种子数据中进行。

## 6. 未做的事

- 未合并 `main`，未把 `?proto=d` 设为默认，未推广到其余页面。
- 未对本轮证据做二次编码、加速、裁剪或丢帧处理。
- 未宣称用户审美验收通过；本报告只提供可复核证据。
