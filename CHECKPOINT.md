# Checkpoint 06 · 可运行交付版

## 当前项目状态

当前阶段：MVP功能与自动测试完成，完整项目和编译产物已打包。总体约95%，**仍未满足用户全部完成定义**：真实浏览器桌面/手机可视化验收、真实AI供应商调用未验证。

最后修改：src/ui.ts（同步事件阻止默认表单导航）、src/app.ts（自定义比例、状态保存保护）、tests/ui.test.ts 和交付文档。
无修改到一半的源文件。npm run build 成功；npm test 20项通过，0失败。

## 已完成功能

- [x] TXT/CSV/TSV/XLS/XLSX/JSON词书解析、预览、坏行报告、单次导入去重
- [x] 词书列表、重命名/删除、词条编辑、搜索、筛选、排序、分页、详情
- [x] 英→中/中→英/随机比例，普通与简单4选项、困难6选项
- [x] 字形/词性/难度/邻近/混淆干扰项；明确重复释义排除
- [x] 高速答题、反应计时、1–6/Space/Enter、暂停、自动超时、答错反馈
- [x] 单题事务保存、未完成训练恢复、多窗口写锁、开始互斥、提交期导航保护
- [x] 本次速度分类、保守累计掌握、优先级、每词独立间隔调度
- [x] 今日复习、弱词强化、随机抽查、快速刷词、本轮弱词与重测
- [x] 每词混淆对记录、学习历史、双向表现
- [x] 今日统计、7/30天趋势、有效掌握估算
- [x] 完整JSON备份验证与原子恢复、剔除Key、筛选词表TXT/CSV/XLSX导出
- [x] AI Endpoint/Key/Model设置、实际fetch请求代码、报告保存、发送内容预览
- [x] 深浅主题、响应式CSS
- [x] README、开发日志、TODO、算法说明、测试报告、源码与dist

## 当前正在处理

交付已准备。后续重点是验收而非开发新的高级功能。

## 尚未完成与已知限制

1. 真实浏览器被运行环境ERR_BLOCKED_BY_CLIENT拦截；未验收真实页面视觉、鼠标及手机布局。DOM集成测试不是替代性的浏览器通过结论。
2. 没有真实供应商凭据，因此AI只做了协议适配测试。请在自己的应用设置填写Key后验收，不要在聊天里提供Key。
3. 未实现第二阶段：拼写、填空、搭配题、发音、AI例句/干扰项、PWA、云同步。
4. 同义排除是词表文本启发式，不理解所有语义近义词；需要足够不同释义。
5. AI直连需要供应商支持CORS；没有内置服务端代理。
6. 性能测试使用fake-indexeddb；真实长期浏览器数据库性能与空间上限尚未实测。
7. 趋势已实现作答、正确率、反应、进入熟练次数与到期答错次数；历史每日弱词存量曲线未实现（首页有当前弱词及当日净变化）。

当前自动测试覆盖范围内没有已知阻断功能的Bug；不能据此保证真机无Bug。

## 技术架构与目录

TypeScript + Vite + 原生DOM + IndexedDB + SheetJS。运行成品只需要Node22+，无需npm install；开发需要npm ci。

src/types.ts：真实数据类型；core.ts：算法；quiz.ts：答题状态推进；db.ts：存储/备份；import.ts：词书；stats.ts：统计；ai.ts：请求；app.ts/ui.ts/style.css：界面。tests：20项测试。dist：已编译产物。docs：需求/计划/算法/测试报告。

## 数据结构

Word包含英文/中文/词性/音标/例句/搭配/难度/标签/order/bookId，以及MasteryState、ReviewSchedule、confusions。
WordBook(id/name/created)；ReviewRecord(id/wordId/sessionId/at/direction/correct/ms/selectedId/reason/before/after/scheduled)；StudySession(id/started/ended/mode/queue/index/answered/correct/retries/question)；Settings(fast/normal/timeout/ratio/difficulty/feedback/theme/endpoint/model/key/rememberKey)；AIAnalysis(id/at/text/model/sampleSize)。
IndexedDB六个store：books、words、records、sessions、analyses、meta。数据库名vocabulary-memory-v1，版本1。

## 算法

默认fast1500、normal3000、timeout6000毫秒。错误/达到超时→不会；正确≤fast为本次秒答；≤normal正常；否则模糊。
累计熟练需双向各至少2次正确且各正确率≥80%、跨间隔成功≥3次、连续正确≥4、本次秒答；没有证据的新词先暂列模糊。
Priority：等级基数80/60/20/0（新词45）+错误率15+较弱方向错误率10+连续错误最多16+遗忘最多10+最近反应最多5+混淆最多5+逾期最多20-连续正确最多5。S≥90/A≥65/B≥40/C≥15/D其余。
调度：15分钟/4小时/1/3/7/14/30/60/120天阶梯；高阶秒答×1.3、模糊降一阶×0.7；遗忘折扣1/(1+min(lapses,5)×0.12)。错误重置10分钟。提前正确不延长间隔。本轮错误或慢答最多回插1次。
完整细节见docs/ALGORITHMS.md。

## 验证与 Next Step

已执行依赖安装、生产构建、20项自动测试；包含1万词/1000题逐题事务及备份清空恢复，包含真实应用bundle的DOM操作测试。

继续开发：
1. npm ci；npm test；npm run build。
2. 在能正常访问应用的真实浏览器运行npm start，按docs/TEST_REPORT.md补验收。
3. 用用户自行在设置中填写的有效供应商配置生成一份真实报告。
4. 修复实际问题后更新本文件/日志/TODO，再创建新快照。不要无故重构。
