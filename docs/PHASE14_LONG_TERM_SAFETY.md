# Phase 14：长期使用、数据安全与发布准备

**状态：本地实现与验收完成；未自动开始下一阶段。**
本阶段不新增运行时依赖，DB 仍为 **v7**；重点是数据安全、地址隔离、备份恢复、长周期逻辑、PWA 更新和离线真实动作。

## 1. 交付范围

| 项 | 实现 / 证据 |
| --- | --- |
| 数据地址安全 | `src/origin.ts` + 设置页「数据地址」面板；不自动跳转、不自动迁移 |
| 恢复事务原子性 | `replaceData()` 写入异常显式 `tx.abort()`，避免半套数据 |
| 备份压力回归 | `tests/backupRoundtrip.test.ts`：28 个 store、240 词、字段往返、回滚 |
| 长周期语义 | `tests/longitudinal.test.ts`：D1/D7/D30、FSRS、周诊断幂等 |
| PWA 版本门禁 | `scripts/stamp-sw.mjs`：缓存名含构建指纹；CI 校验 |
| PWA A→B | `scripts/phase14-pwa-upgrade.mjs`：7/7 |
| 离线真实动作 | `scripts/phase14-offline-actions.mjs`：4/4 |
| 地址/备份/双标签 E2E | `scripts/phase14-smoke.mjs`：11/11 |
| 长会话加速观测 | `scripts/phase14-long-session.mjs`：80 轮，堆增长 0.16 MB |

## 2. 数据地址：这是本阶段最重要的安全修复

推荐地址固定为 `http://localhost:4173`。

`http://127.0.0.1:4173` 能打开同一个程序，但浏览器把它视为**另一个 origin**；两边的 IndexedDB 不共享。代码无法知道用户真实数据在哪一边，因此本阶段：

- 不自动重定向；
- 不自动搬运数据；
- 在设置页明确显示当前/推荐地址和迁移风险；
- 只用真实 E2E 证明两边确实隔离。

详见 `docs/ORIGIN_DATA_SAFETY.md`。

## 3. 备份与恢复

`backup()` 覆盖 28 个数据域，并剔除 API Key。恢复流程：

1. `validateBackup()` 校验结构、ID、关键引用；
2. 校验失败不碰现有数据；
3. 一个 readwrite 事务 clear + put；
4. 任意写入异常 → `tx.abort()` → 原数据保留；
5. 恢复后重新读库并做只读完整性审计。

Phase 14 修复的关键点：此前 `replaceData` 在 `s.put()` 同步抛错时可能让已经 clear 的 store 提交，留下半套数据；现在整个写入包在 `try/catch`，异常显式 abort。

详见 `docs/BACKUP_AND_RESTORE.md`。

## 4. 长周期与算法

- **D1/D7/D30** 严格按首次出现后的第 1/7/30 个 24h 窗口分桶；错过的复习不补算、不外推；样本 <5 时 `rate=null`，不拿 0 冒充。
- **FSRS** 连续复习时 due 单调前进，reps 真实累加；一次作答不会被复制成多条证据。
- **周诊断** 同一周重复生成覆盖同一条 `weekOf` 记录，不堆叠。
- **Mini Unit / 输入恢复 / AI 降级** 沿用 Phase 7/8/13 的真实证据与恢复规则，本阶段回归全绿（见下方矩阵）。

## 5. PWA A→B 更新

原实现是手写 `CACHE = 'erv2-shell-v2'`；忘记改版本号会让旧外壳继续引用旧 hashed 资源。Phase 14 改为：

- 构建后 `scripts/stamp-sw.mjs` 根据 `dist/assets` 文件名 + 外壳源文件计算指纹；
- 写入 `dist/sw.js` 的 `CACHE = 'erv2-shell-v2-<10位hash>'`；
- `activate` 清理所有旧 `erv2-shell-*` 缓存；
- CI 在 `npm run build` 后检查缓存名必须带指纹。

A→B 实测：先装 A（`erv2-shell-a`），切 B 后新缓存安装、A 缓存删除、数据标记保留、停服后仍能离线打开（7/7）。

## 6. 离线真实动作

`phase14-offline-actions.mjs` 在生产构建页面：

1. 写入 6 个真实词；
2. 完成一次真实词汇作答（1 条记录）；
3. 停掉静态服务器；
4. 刷新，应用仍由 Service Worker 打开；
5. 记录数保持 1 → 1。

这证明不是只有“首页能打开”。**输出草稿离线续写没有单独自动化**，属于未覆盖项。

## 7. 验收矩阵（本机）

| 套件 | 结果 |
| --- | --- |
| `npm test` | **379/379** |
| `tsc --noEmit` | 0 error |
| Phase 3 | 21/21 |
| Phase 4 | 36/36 |
| Phase 5 | 44/44 |
| Phase 5.1 | 26/26 |
| Phase 6 | 31/31 |
| Phase 7 | 33/33 |
| Phase 8 | 34/34 + 兴趣 19/19 |
| Phase 9 | 20/20 |
| Phase 10 | 16/16 |
| Phase 11 | 16/16 |
| Phase 12 | 17/17 |
| Phase 12 Full | 18/18 |
| Phase 13 | 20/20 |
| Phase 14 地址/备份/双标签 | 11/11 |
| PWA A→B | 7/7 |
| 离线真实动作 | 4/4 |
| 生产离线外壳 | 8/8 |

## 8. 明确没有完成 / 不能证明的项

- **4 小时真实使用**：没有在用户真实设备上连续使用 4 小时；只做了 80 轮加速页面循环（堆 +0.16 MB，DOM 142→142，JS 异常 0），不能冒充 4 小时结论。
- **真实存储配额耗尽**：没有稳定制造 QuotaExceededError；不宣称通过。事务回滚和异常路径已测，配额是未实测。
- **真实断电/浏览器崩溃**：未做硬件级断电注入。
- **真实手机**：移动端是 Edge 390×844 视口模拟，不是 iPhone Safari / Android Chrome；没有真实触控和软键盘测试。
- **屏幕阅读器**：没有 NVDA/VoiceOver 实测；只做了可访问名称和键盘 Tab 检查。
- **离线输出草稿**：未自动化；AI 请求在离线时仍会失败，这是预期，不做离线 AI。
- **PWA 安装 UI**：没有验证桌面/移动安装提示和图标缓存的所有平台差异。

这些限制必须和“通过”一起报告，不能用推断替代证据。

## 9. 相关文件

- `src/origin.ts`、`src/app.ts`（设置页地址面板）
- `src/db.ts`（`replaceData` 事务回滚）
- `scripts/stamp-sw.mjs`、`public/sw.js`
- `scripts/phase14-smoke.mjs`、`phase14-pwa-upgrade.mjs`、`phase14-offline-actions.mjs`、`phase14-long-session.mjs`
- `tests/origin.test.ts`、`tests/backupRoundtrip.test.ts`、`tests/longitudinal.test.ts`
- `docs/ORIGIN_DATA_SAFETY.md`、`BACKUP_AND_RESTORE.md`、`PERFORMANCE_BASELINE.md`、`MOBILE_AND_ACCESSIBILITY.md`、`TROUBLESHOOTING.md`、`CHANGELOG.md`
