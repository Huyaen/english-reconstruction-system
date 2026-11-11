# 变更记录

## v1.5.0 — B「动字排练场」与「墨场」交互（2026-11-11）

正式版本：[v1.5.0 标签](https://github.com/Huyaen/english-reconstruction-system/tree/v1.5.0) · [合并 PR #7](https://github.com/Huyaen/english-reconstruction-system/pull/7)

- **视觉与动效**：全站整合 B「动字排练场」静态版式与「墨场」高级动效，包括动态字形墨层、可拖动任务谱、折面转场、原位正误反馈；覆盖主要学习与管理入口。
- **学习目标**：支持「智能推荐 / 手动 0–100 个新词/天」，可设置长期默认和单日覆盖；时间预算不足时区分目标与实际安排，保留到期复习与进行中的记录。
- **交互兼容**：提供 Expressive、Focus 和 Reduced Motion 体验，处理快速作答、动效中断、移动触摸、WebGL/Canvas 降级。
- **稳定性**：修复目标切换时任务关联丢失、计划 revision 冲突后内存不同步、重新打开时误完成进行中任务等问题。
- **数据保护**：保持 IndexedDB DB9；升级前后备份、隔离恢复、4,716 个词条 ID 和学习证据核查通过。
- **验证**：524 项自动测试通过；GitHub Actions Node 22/24 构建和已提交 dist 一致性检查通过。
- **已知限制**：生产主 JS 存在包体积警告；长时间物理 GPU/显存趋势仍待独立测量。

## 历史研发记录

以下早期 Phase 记录是当时的研发快照，不能代表当前正式发布状态；其中未合并的旧 UI 候选（如 Editorial Learning Studio）已经由 v1.5.0 墨场方案替代。

---

## Phase 15h — 全站 Cinematic UI 迁移（历史候选，未作为 v1.5.0 发布）

- 全站设计系统：`src/ui/system.css`、`src/ui/motion.ts`、`src/ui/pages/*.css`（5,553 行，0 `!important`）。
- 14 页按 A/B/C 场景等级接入同一材质、组件与动效语言；导航、顶栏、弹窗、Toast 统一。
- 词汇训练重做：词为唯一视觉中心，四选项为物理键位，正误用形状+语义线而非纯颜色。
- 阅读保持专注级：66ch、1.72 行高、侧栏不压正文、正文零动画。
- 数据页诚实化：空样本 `—`、四段证据条线型区分、学校成绩标 self-reported。
- 词库空结果可行动（导入/清除筛选）；`?proto=d` 成为默认，`?proto=legacy` 保留回退。
- 回归：379/379 测试、tsc 0、对比度 225/0、移动端 10/10×2、0 掉帧。


## Phase 14 — 长期使用、数据安全与发布准备（2026-10-24）

### 数据安全

- 新增 `src/origin.ts`：识别 `localhost` / `127.0.0.1` / 端口不同导致的 origin 隔离；设置页显示当前/推荐地址，不自动跳转、不自动迁移。
- `replaceData()` 写入异常时显式回滚整个 IndexedDB 事务，避免恢复失败留下半套数据。
- 新增 `tests/backupRoundtrip.test.ts`：28 个 store、240 词、嵌套字段、Key 剔除、恢复回滚、重开数据库。
- 新增 `tests/longitudinal.test.ts`：D1/D7/D30、样本不足 `rate=null`、FSRS 多次复习、周诊断幂等。

### PWA / 离线 / 性能

- `scripts/stamp-sw.mjs`：缓存名自动包含构建指纹；CI 检查 `dist/sw.js` 必须带 `erv2-shell-v2-<hash>`。
- 新增 `scripts/phase14-pwa-upgrade.mjs`：A→B 更新 7/7（新缓存、旧缓存清理、数据保留、停服打开）。
- 新增 `scripts/phase14-offline-actions.mjs`：断网前完成真实词汇作答，断网刷新后记录仍在（4/4）。
- `offline-smoke` 增加构建指纹缓存检查（8/8）。
- 新增长会话加速观测脚本；80 轮堆增长约 0.16 MB，明确不等同 4 小时真实使用。

### 验收

- `npm test`：379/379；Phase 3–13 回归全绿；Phase 14 11/11；PWA 7/7；离线动作 4/4。
- 新增文档：`PHASE14_LONG_TERM_SAFETY.md`、`ORIGIN_DATA_SAFETY.md`、`BACKUP_AND_RESTORE.md`、`PERFORMANCE_BASELINE.md`、`MOBILE_AND_ACCESSIBILITY.md`、`TROUBLESHOOTING.md`。

### 未完成 / 限制

- 4 小时真实使用、真实存储配额耗尽、真实断电、真实手机、屏幕阅读器、离线输出草稿均未实测；文档中已逐项标明，不以推断代替证据。

## Phase 13 — 稳定性、安全、性能、离线与发布准备（2026-10-24）

- 只读完整性审计（error / warning）、运行时错误可见化、静态服务器加固、PWA 外壳、离线 smoke、性能基准、20 项真实学习旅程 E2E。

## Phase 12 — 考试记录与 Full Integration（2026-10-23）

- 考试记录分值一致性、类别/年份/满分校验、Today 计划统一执行与证据门控。
