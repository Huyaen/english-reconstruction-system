# Phase 5 阅读验收 · 44/44

- PASS · 阅读测试钩子仅在测试构建 + ?test=1 时存在 — dist-test
- PASS · 没有阅读材料时明确引导导入，而不是造假文章 — READING LAB阅读先直接读英文；只有在真的卡住时才要辅助。阅读不会自动提
- PASS · 干净状态下阅读库为 0 篇 / 0 会话 — {"view":"library","passageId":null,"sessionId":null,"passageTitle":"","chunkIndex":0,"chunks":0,"stage":"","sessionState":"","marks":0,"revoked":0,"difficult":0,"evidence":0,"evidenceTypes":[],"helps":0,"maxHelpLevel":0,"comprehension":0,"passages":0,"sessions":0,"exposures":0,"firstPass":null,"secondPass":null}
- PASS · 没有材料时不显示阅读任务目标
- PASS · 没有材料时今日计划里不出现阅读任务
- PASS · 预览显示标题与主题 — 
  阅读验收文章
  粘贴正文 · 用户提供 · education
  
 
- PASS · 预览阶段不泄露正文
- PASS · 预览先要求无辅助猜测
- PASS · 导入落库 1 篇文章 — count=1
- PASS · 来源类型与可靠性可追溯 — pasted_text/user_provided
- PASS · 记录内容指纹（重复导入可提示） — 068f0a95
- PASS · 段落/句子切分随文章落库 — 2 段 / 6 句
- PASS · 冷读前不给全文翻译
- PASS · 冷读后进入首读，会话真实开始 — {"view":"reader","stage":"reading"}
- PASS · 正文可逐词点击（保留标点与原文） — ok
- PASS · 生词标记写入会话
- PASS · 生词标记同时留下障碍证据 — ["cold-baseline","translation-dependence","vocabulary-obstacle"]
- PASS · 标记后侧栏列出卡点词
- PASS · 难句记录保留下卡点类型
- PASS · 来自阅读的拆句明确声明结构是自动分析的 — SENTENCE LAB拆句 · 1/1先找主干，再看修饰；不确定时可以要提示，但提示会降低这次证据
- PASS · 阅读来源的拆句标注“只记接触、不推进掌握度”
- PASS · 拆句界面提供“回到阅读”的出口
- PASS · 退出拆句后回到阅读同一段落 — {"view":"reader","chunkIndex":0,"beforeChunk":0}
- PASS · 回到阅读后标记与难句都还在
- PASS · 进入重读时真正开始计时（support → reread） — reread
- PASS · 多段文章重读可以逐段走完
- PASS · 首读与重读自评分开记录 — {"first":30,"second":75}
- PASS · 会话收尾为 completed — completed
- PASS · 结果页分别展示首读速度与重读速度
- PASS · 结果页把自评标注为自评
- PASS · 阅读会话真实落库且唯一 — count=1
- PASS · 落库会话保留标记与难句
- PASS · 重读起止时间被记录（否则重读速度永远缺失） — {"a":true,"b":true}
- PASS · 两次自评都进证据，且证据按幂等键唯一
- PASS · 阅读证据里没有任何“因读过就掌握”的记录
- PASS · 新词提示需要补释义（不编造释义） — 
  本次生词
  筛选复用 Phase 2 的学习价值；新词没有释义时先补释义，补完才能进入 Preview / Recall（不会自动提升掌握度）。
  

- PASS · 没有释义时拒绝入库（不编造释义） — 有 1 个新词还没有释义：先补释义再保存
- PASS · 拒绝后 words 表仍为空
- PASS · 缺释义的词只出现在待补释义行 — memorising
- PASS · 补了释义的新词才入库 — 1 / 记忆
- PASS · 阅读只记接触：新词掌握证据为 0 — {"total":0,"level":"new"}
- PASS · 阅读接触被记为 reading 来源的 exposure — {"source":"reading","state":"unknown"}
- PASS · 阅读库显示该文章与完成状态 — READING LAB阅读先直接读英文；只有在真的卡住时才要辅助。阅读不会自动提高任何单词的掌握度。
- PASS · 计划区不会伪造不存在的阅读任务（无计划时为空）
