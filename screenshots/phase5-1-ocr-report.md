# Phase 5.1 OCR 验收 · 26/26

- PASS · OCR 测试钩子仅在测试构建可用 — dist-test
- PASS · 截图 OCR 面板默认收起
- PASS · 点开后可选择截图，并说明图片不会上传 — OCR 全程在你自己的浏览器里跑（本地 Wasm），图片不会
- PASS · 非 PNG/JPG 直接拒绝，并给人工录入出口 — 只支持 PNG / JPG 截图。 把截图另存为 PNG 或 JPG 再上传；也
- PASS · 被拒绝时不会出现“开始识别”按钮
- PASS · 选择截图后显示本地预览（blob:，未上传） — blob:http://
- PASS · 有效图片才出现“开始本地识别”
- PASS · 真实 OCR 识别出英文正文（本地 Wasm 执行） — 784 chars, 7346ms
- PASS · 识别结果包含关键词：reconstruction / comprehension / spaced repetition — Why reading slowly can make you faster  The Reading Notes - 
- PASS · 识别结果保留段落结构（不是一整行） — 18 lines
- PASS · 识别完成后进度条收起
- PASS · 未勾选“已核对”时拒绝入库 — 请先核对下面的文字、改掉错字，并勾选“我已核对”。OCR 结果未经核对不能入库。
- PASS · 确认后进入预览（先猜，不泄露翻译） — 
  Why reading slowly can make you faste
- PASS · OCR 文章落库 1 篇 — count=1
- PASS · 来源类型=截图上传、可靠性=unknown、方法=local_ocr — uploaded_image/unknown/local_ocr
- PASS · 记录用户修改过（userEdited）与 OCR 置信度 — {"imageName":"reading-ocr.png","ocrMethod":"local","confidence":"0.95"}
- PASS · 用户手工补的句子被保留 — the learner typed by hand after checking the scan.
- PASS · 空白图明确说“没识别出文字”，不伪造结果
- PASS · 空白图不会入库
- PASS · 空白图后仍给手动录入出口
- PASS · 引擎加载失败时明确报“模型/网络”原因（不是沉默或假成功） — model-load-failed · OCR 引擎或英文模型没能加载（看起来是网络问题）。
- PASS · 失败时给出可读提示与人工录入出口 — OCR 引擎或英文模型没能加载（看起来是网络问题）。
- PASS · 取消后明确提示已取消
- PASS · 取消不会写入文章
- PASS · 取消时 worker 被释放（不留在后台跑） — loaded=false
- PASS · 识别过程中没有把图片上传到任何服务器 — 22 个请求，上传=0，POST=0
