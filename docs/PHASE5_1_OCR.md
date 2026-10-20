# Phase 5.1 — 真实截图 OCR（本地 Wasm）

> 目标：把 Phase 5 的「截图 → 人工转录」升级为**真实 OCR**，同时保持三条硬约束：
> 图片不离开本机、识别结果必须经用户确认、失败一律有诚实出口。

## 1. 用户流程

1. 阅读库 → `截图 OCR` → 选择 PNG/JPG（≤ 8MB）。
2. 本地预览（`blob:` URL），点「开始本地识别」。
3. 首次下载英文模型（约 3MB）与 Wasm 内核（约 4MB），随后浏览器缓存；离线时可直接用已缓存模型。
4. 识别文本进入可编辑框；用户逐句核对、修改错字。
5. 勾选「我已核对这份文字，并改掉了识别错字」→「用这段文字创建阅读材料」→ 进入既有导入预览（先猜、不显示全文翻译）。

任何一步失败（格式、大小、模型加载、解码、空结果、超时、取消）都会显示**具体原因 + 人工录入出口**，不会伪造识别成功。

## 2. 模块与职责

| 模块 | 职责 |
| --- | --- |
| `src/ocr.ts` | 纯策略层：格式/大小门禁 `checkImage`、格式识别 `detectImageFormat`、排版级清理 `cleanOcrText`、失败分类 `classifyOcrFailure`、进度文案 `ocrProgress` |
| `src/ocrEngine.ts` | 引擎层：`createTesseractBackend`（动态 `import('tesseract.js')`，路径版本固定）、`OcrService`（懒加载、单 worker 串行、超时、AbortSignal 取消、`dispose` 释放、失败后不缓存坏状态） |
| `src/readingView.ts` | 截图面板 HTML（预览/进度/可编辑文本/确认勾选/保存） |
| `src/app.ts` | 事件接入与提示（消费层，不含识别算法） |
| `src/readingImport.ts` | `buildImageDraft`（method=local，记 confidence）与 `buildManualImageDraft`（method=manual）——**两条路径都要求 `userConfirmed`** |

资源（Apache-2.0，版本钉死）：`tesseract.js@7.0.0`、`tesseract.js-core@7.0.0`、`@tesseract.js-data/eng@1.0.0/4.0.0_best_int`。

## 3. 纪律

- **不上传图片**：OCR 在浏览器 Wasm 中执行；唯一网络请求是 CDN 上的引擎/模型资源（GET）。
- **不自动改拼写**：`cleanOcrText` 只合并空白、接回行尾断词、去行尾空格；错字留给用户。
- **不静默成功**：空图 → `empty-result`；引擎不可达 → `model-load-failed`；超时 → `timeout`；取消 → `aborted`。
- **不留下后台任务**：超时/取消/异常都会 `terminate()` worker；`loaded` 变回 false，下次按需重建。
- **懒加载**：`import('tesseract.js')` 单独切 chunk；生产包首屏不包含 OCR 代码。

## 4. 验收（2026-10-20 · 真实浏览器）

`npm run build:test` + `server.mjs --dir=dist-test --port=4173` + 无头 Edge（独立 profile，CDP 9225）+ `SMOKE_PORT=9225 node scripts/phase5-1-ocr-smoke.mjs`

**PASS 26/26**

| 断言 | 实测 |
| --- | --- |
| 真实截图识别（本地 Wasm） | 784 字符 / 置信度 95% / 6.8s |
| 关键词命中 | `reconstruction`、`comprehension`、`spaced repetition` |
| 段落结构保留 | 18 行 |
| 未确认不得入库 | passages 仍为 0 |
| 入库字段 | `uploaded_image` / `unknown` / `local_ocr` / `userEdited=true` / `confidence=0.95` |
| 用户手改保留 | 追加句子进入 `text` |
| 空白图 | 「没有从这张图里识别出英文文字」，不入库 |
| 引擎不可达（真实报错） | `model-load-failed`，恢复后立即可再识别 |
| 取消 | 明确提示，worker 已释放（`loaded=false`） |
| 不上传 | 22 个请求全为 CDN GET，上传 0 |

单元/集成：`tests/ocr.test.ts` 11 例（门禁/清理/分类/成功/空结果/模型失败/超时/取消/串行/释放复用），全量 **145/145**。

## 5. 已知边界

- 只支持英文 PNG/JPG；BMP/WEBP/GIF/PDF 明确拒绝。
- 首次识别需联网下载模型；离线且无缓存时只能人工转录（会如实说明）。
- 手写体、艺术字、竖排、复杂版式识别质量不保证。
- 不做 PDF 解析、不做多图批量、不做版面还原（段落按行聚类，标题会并入正文）。
