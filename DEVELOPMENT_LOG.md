# 开发日志
## Checkpoint 01
完成：保存需求与计划，创建配置和交接文档。
修改：package.json、tsconfig.json、README.md、CHECKPOINT.md、TODO.md、docs/PLAN.md。
测试：确认 Node 24 / npm 可用；尚未安装依赖或执行应用测试。
下一步：数据结构、算法测试与实现。

## Checkpoint 02
完成：types.ts 与 core.ts；5项核心算法测试通过（先观察缺失实现失败，再实现通过）。
修改：src/types.ts、src/core.ts、tests/core.test.ts、package-lock.json、docs/checkpoint.py。
下一步：词书导入/持久化，优先验证损坏备份不能覆盖原数据。

## Checkpoint 03
完成：导入导出、数据库事务、备份模式验证。11项测试通过，TypeScript通过。
测试启动器改为node --import tsx，解决当前环境tsx CLI IPC socket被禁用。
修改：src/import.ts、src/db.ts、tests/data.test.ts、package.json。
下一步：训练交互和统计界面。

## Checkpoint 04
完成：UI、训练流程、统计、AI及全部备份界面，生产构建。
测试：15项通过；TypeScript空值报错已定位为局部别名失去收窄，添加已被前置条件保证的断言后构建成功。
修改：app.ts、style.css、ui.ts、quiz.ts、stats.ts、ai.ts、session.test.ts、index.html、server.mjs、start-windows.bat。
下一步：浏览器端到端及大量数据测试。当前不宣称全部完成。

## Checkpoint 05
完成：大词库/1000题压力测试、完整备份恢复、交互DOM测试，修复测试发现的重复session和导航/保存竞争。
修改：core相关回归测试、db.ts校验、quiz.ts回插条件、app.ts启动互斥与导航保存保护、tests/ui.test.ts、jsdom开发依赖。
测试：核心19项通过，DOM集成1项通过；真实浏览器因环境ERR_BLOCKED_BY_CLIENT未能访问。
下一步：文档、最终构建和交付包。

## Checkpoint 06
完成：交付说明、算法/数据字典、验收报告、最新CHECKPOINT和TODO，源码格式整理。
追加修复：同步preventDefault防止表单默认导航；自定义方向比例保持；保存设置保留当前主题；数据被替换后不保存旧数据AI报告。
测试：新回归先失败后修复；完整20项通过，TypeScript与Vite构建成功。
剩余：真实浏览器/手机可视化及真实供应商AI验收。运行环境浏览器受限，明确保留未验收状态。
下一步：由可运行本地浏览器的环境按docs/TEST_REPORT.md补验收。项目无需重新开始。
