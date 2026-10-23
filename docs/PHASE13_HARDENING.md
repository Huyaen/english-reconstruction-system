# Phase 13 — 稳定性、安全、性能、离线与发布准备

> 交付时间：2026-10-24（台北时间）
> 范围：只读数据完整性审计、未捕获错误出口、静态服务器加固、PWA 离线外壳、真实学习旅程 Browser E2E、性能基准、移动/主题/键盘回归。
> 约束：不重写已验收的学习模型；审计不修复、不迁移、不改学习数据；DB 仍为 **v7**（本阶段没有新 store）。

## 1. 数据完整性审计（只读）

新增 `src/integrity.ts`：

- `checkDataIntegrity(data)` 是纯函数，无时钟、无随机数；同一输入永远得到同一报告，不修改传入的 `Data`。
- **warning**：跨表孤儿引用（`bookId`、`wordId`、`passageId`、`sourceId`、`targetWords`、计划任务 refs 等）。旧备份可能本来不完整，不能据此判定数据损坏，也不能自动修复或删除。
- **error**：同一张表内重复 id、非法 id、非对象记录、`revision` 非负整数校验失败、时间戳字段非法、已完成输入缺复盘、已完成阅读/考试缺完成时间、阅读证据 key 重复。
- 报告包含 `ok / errors / warnings / checkedStores / checkedRecords / byStore / issues[]`；`ok` 只表示没有结构性 error，warning 不会被伪装成健康，也不会被隐藏。
- 设置页「检查数据完整性」只展示前 12 条，明确区分「错误 / 警告」，并说明是只读检查。
- 恢复备份时审计只作为提示：`validateBackup` 仍负责解析/引用完整性闸门；审计 error 会显示数量与摘要，但不会静默改数据，也不强制阻断旧备份恢复。用户确认后才替换，确认前当前数据不变。

## 2. 未捕获错误可见化

- 全局 `unhandledrejection` / `error` → `reportRuntimeError`：控制台保留完整错误对象；UI 只显示可理解的一句话（最多 120 字）并节流 3 秒，提示数据仍在本机、可刷新重试。
- 启动失败（`boot` 抛错）→ `fatalStartup`：显示「无法打开本地数据」、安全说明和「刷新重试」，不再白屏或静默留在加载文案。
- 多窗口写锁失败 → 明确提示「词间已在另一个窗口打开」，不覆盖学习记录。

## 3. 静态服务器加固

`server.mjs` 重写为无依赖的只读静态服务器：

- 只接受 `GET` / `HEAD`；其他方法返回 **405** + `Allow: GET, HEAD`。
- 非法 URL/百分号编码/空字节返回 **400**；不存在资源返回 **404**，文案不包含文件系统路径。
- 路径穿越防护：`path.resolve` 后必须位于 root 内；越界返回 **403**。
- 安全响应头：`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: no-referrer`、`Permissions-Policy`、`Cross-Origin-Opener-Policy: same-origin`、`Cross-Origin-Resource-Policy: same-origin`。
- hashed 资源 `Cache-Control: public, max-age=31536000, immutable`；其他资源 `no-cache`。
- `dist-test` / `dist` 目录与端口仍由启动参数决定；默认 `127.0.0.1:4173`（不再对外绑定 `0.0.0.0`）。

## 4. PWA 与离线边界

- `public/manifest.webmanifest`、`public/icon.svg`、`public/sw.js`、`index.html` manifest/icon/theme 元数据。
- Service Worker 只缓存**同源静态外壳**：`/`、`/index.html`、manifest、图标、`/assets/*.js|css`；不缓存 AI 请求、用户材料、输入内容或任何跨域请求。
- 导航请求 network-first，断网时回退已缓存外壳；安装/激活只清理本项目 `erv2-shell-*` 缓存。
- 只在生产构建注册：`__ERV2_PWA__ = !testHooks`；`npm run build:test` 不注册 SW，避免缓存污染 smoke。
- 离线边界是「已打开过一次的静态外壳 + 已缓存资源」；首次未缓存、未打开过页面、AI 请求、外部链接均不在离线承诺内。

## 5. 真实学习旅程 E2E（`scripts/phase13-smoke.mjs`，别名 `phase13-hardening-smoke.mjs`，20/20）

前置：`npm run build:test` → `node server.mjs --dir=dist-test --port=4173` → 独立 profile 无头 Edge CDP → `node scripts/phase13-smoke.mjs`。

脚本只用测试钩子播种**真实结构**数据（词、文章、输入材料、教学句、考试题库）；所有「完成」都走真实 UI 交互，不由测试钩子直接写 done。覆盖：

| 检查 | 内容 |
| --- | --- |
| A | 从干净数据生成今日计划，六类模块齐全 |
| B | 初始完整性审计无结构错误 |
| C–G | 词汇 Preview→Recall、句子、阅读、真实输入、表达、考试迁移六域连续执行 |
| H | 每个任务完成都由领域证据驱动，计划状态同步 |
| I | 跨模块计划证据/状态一致 |
| J | 收尾回忆完成并保存难度反馈 |
| K | 整个旅程后完整性仍无结构错误 |
| L | 刷新后已完成任务仍为 done |
| M | 重新生成保留已完成任务，不重建证据 |
| N | 迁移后总时长不超预算 |
| P | 390×844 移动视口 home/settings/reading/input/output/exam 无横向溢出 |
| Q | 主按钮都有文字或 aria-label |
| S/S2 | 深色主题可切换并切回浅色 |
| T | Tab 键可移动键盘焦点 |
| U | 页面无未捕获 JavaScript 错误 |

## 6. 生产离线验收（`scripts/offline-smoke.mjs`，7/7）

用 `dist` 生产包 + 独立 profile Edge + 本地静态服务：

1. 生产页面启动，测试钩子不存在；
2. Service Worker 激活；
3. 外壳与 hashed JS/CSS 进入缓存；
4. 停止静态服务器（模拟断网）；
5. 断网重载仍能打开首页；
6. 页面由 Service Worker 控制。

## 7. 性能基准（合成数据，非真实长期使用验证）

环境：Windows 11、headless Edge、本地静态服务器；数据为 synthetic。命令：

```bash
npm run build:test
node server.mjs --dir=dist-test --port=4173
# 独立 profile 无头 Edge，CDP 9233，打开 http://127.0.0.1:4173/?test=1
node scripts/phase13-benchmark.mjs
```

| 数据集 | 词 / 记录 | 首屏就绪 median / p95 / worst | IndexedDB 全读 | 今日计划生成 | 备份 JSON | JS 堆 |
| --- | --- | --- | --- | --- | --- | --- |
| A 空 | 0 / 0 | 123 / 132 / 132 ms | — | — | — | 7–9 MB |
| C 日常 | 3,000 / 6,000 | 248 / 391 / 391 ms | 108 ms | 36 ms | 4.1 MB | 8–19 MB |
| D 压力 | 12,000 / 30,000 | 1,180 / 1,448 / 1,448 ms | 530 ms | 254 ms | 17.8 MB | 36 MB |

- 首屏就绪是 CDP 轮询观测值，含 Node→浏览器往返；不是浏览器 Performance 面板的精确帧时间。
- 合成数据写入耗时：C 约 1.7 s，D 约 8.6 s（3 次样本同一数据集）。
- 生产构建资产：主 JS **1,121,772 B** + 动态 chunk **15,947 B**；CSS **41,646 B**。`dist` 中不含测试钩子（grep 0）。
- 结论：空/日常数据首屏在百毫秒级到数百毫秒；12k 词/30k 记录压力数据首屏约 1.2 s、计划生成约 0.25 s，作为本地优先应用可接受；没有据此声称真实长期数据或真实手机性能。

## 8. 完整回归

- 单测：**368/368 pass**（含新增 `tests/integrity.test.ts`、`tests/server.test.mjs`，以及阅读旧会话保护、retention 不可得校准事件回归）。
- 类型：`npx tsc --noEmit -p tsconfig.json` **0 error**。
- 构建：`npm run build` / `npm run build:test` 通过；生产包 `__planTest|__examTest|__inputTest|__outputTest|__diagTest|__unitTest|__interestTest|__ocrTest|ERV2_TEST_HOOKS` grep **0**。
- 浏览器回归：Phase 3 21/21、4 36/36、5 44/44、5.1 26/26、6 31/31、7 33/33、8 34/34、兴趣 19/19、9 20/20、10 16/16、11 16/16、12 17/17、12 Full 18/18、**13 20/20**、**offline 7/7**。
- 安全审计：`npm audit` 无有效高危项；没有把 API Key 写入代码/日志/备份（备份导出继续剔除 Key）。

## 9. Phase 13 验收 A–V 对应

- **A** 冷/热启动：phase13 smoke A/L + 性能基准 A/C/D。
- **B** 新用户完整首日：phase13 smoke A–K。
- **C** 五模块连续训练：phase13 smoke C–G（实际六域）。
- **D** Mini Unit 跨天：`phase7-smoke` 33/33。
- **E** Diagnostics → Planner：`phase10-smoke` 16/16。
- **F** Weekly Assessment → Report：`phase11-smoke` 16/16。
- **G** 刷新、关闭、重启恢复：phase13 smoke L；`tests/data.test.ts` 重开库；Phase 3/12 full smoke 刷新恢复。
- **H** 多标签页并发：`tests/inputCore.test.ts` revision 冲突、`tests/miniUnitStore.test.ts` StaleUnitError；启动时 `navigator.locks` 阻止第二个窗口写入。
- **I** 领域成功、计划失败后的对账：`tests/taskExecutor.test.ts` 与 phase12-full smoke；无证据不标 done。
- **J** IndexedDB 事务失败：`tests/data.test.ts` 损坏备份不破坏原数据；浏览器级事务注入未单独模拟，明确记录为边界。
- **K** 完整 Backup/Restore：`tests/backupV6.test.ts`、`tests/data.test.ts`、`tests/examIntegration.test.ts`；设置页导出/导入路径。
- **L** 无网络但 localhost 仍运行：`offline-smoke` 7/7。
- **M** AI Provider 不可用：`phase6-smoke` 31/31（无 Key/失败降级路径）。
- **N** OCR 失败和恢复：`phase5-1-ocr-smoke` 26/26。
- **O** 大数据集性能：本文件第 7 节实测。
- **P** 小屏移动视口：phase13 smoke P。
- **Q** 深色主题：phase13 smoke S/S2。
- **R** 键盘与焦点：phase13 smoke T；Phase 4 数字键/空格/Enter 回归。
- **S** 外部不可信内容安全：`src/import.ts` 纯文本解析 + `esc()` 输出转义 + 备份校验；未见 eval/动态脚本执行。
- **T** 生产包启动与测试钩子：`offline-smoke` 7/7 + hooks grep 0。
- **U** 浏览器内存/存储异常：完整性审计、`fatalStartup`、`reportRuntimeError`；容量/配额注入未单独模拟，明确记录为边界。
- **V** 旧数据库兼容：`tests/migration.test.ts`、`tests/backupV6.test.ts`；阅读旧会话缺 marks/evidence 的保护回归。

## 10. 已知边界（不冒充已验收）

- 未在真实 iPhone Safari 上验收；移动结论来自 390×844 视口模拟，不等于真实手机/触控验收。
- AI 验收使用 Mock/本地替身；没有真实供应商 Key，也不声称真实供应商端到端通过。
- 离线只覆盖同源静态外壳；AI、OCR 首次模型、外部视频/链接不在离线范围。
- 性能为合成数据；不能据此宣称「真实长期使用不卡」。
- `J` 的浏览器级 IndexedDB 事务故障注入、`U` 的存储配额耗尽未做专门自动化；已有单元级保护，报告不把它们说成已做。

## 11. 主要文件

- 新增：`src/integrity.ts`、`tests/integrity.test.ts`、`tests/server.test.mjs`、`scripts/phase13-smoke.mjs`、`scripts/offline-smoke.mjs`、`scripts/phase13-benchmark.mjs`、`public/manifest.webmanifest`、`public/icon.svg`、`public/sw.js`。
- 修改：`src/app.ts`（完整性 UI/错误出口/PWA 注册/恢复提示/种子完整时间）、`src/readingAnalytics.ts`、`src/readingView.ts`（旧会话空数组保护）、`src/planner.ts`（retention 不可得也记录 calibrate 事件）、`src/taskExecutor.ts`（考试关闭前置）、`src/testMode.ts`、`vite.config.ts`、`server.mjs`、`index.html`、`package.json`、`tests/taskExecutor.test.ts`、`tests/readingSession.test.ts`、`tests/planner.test.ts`。
