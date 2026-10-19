// —— Phase 5：阅读材料导入（纯函数；网络与文件读取留在调用方）——
// 流水线：Raw Input → 来源校验 → 文本抽取 → 规范化 → 段落/句子切分 → 元数据 → 难度(由调用方) → 预览 → 保存。
// 任何一步失败都返回结构化错误，绝不“部分成功却静默保存错误正文”。
import type { Passage, ReadingSourceReliability, ReadingSourceType, ReadingExtractionMethod } from './types.ts';
import { contentHash, parsePassageText } from './readingText.ts';
import { uid } from './core.ts';
export const IMPORT_LIMITS = {
    minWords: 60, // 低于此值更像“例句”而不是“文章”，需要用户显式确认
    warnWords: 40,
    maxWords: 20000, // 超过则要求拆分（浏览器里一次性渲染不现实）
    maxChars: 240000,
} as const;
export type ReadingImportErrorCode = 'empty' | 'too-short' | 'too-long' | 'unsupported-type' | 'unsupported-document' | 'invalid-url' | 'blocked-url' | 'cannot-fetch' | 'login-required' | 'paywall' | 'timeout' | 'malformed-html' | 'ocr-unavailable' | 'ocr-needs-confirmation' | 'import-failed';
export type ImportFallback = 'paste' | 'file' | 'image';
export interface ReadingImportError {
    code: ReadingImportErrorCode;
    message: string;
    hint: string;
    fallback: ImportFallback[];
    stage: PipelineStage;
}
export type PipelineStage = 'source-validation' | 'text-extraction' | 'normalization' | 'segmentation' | 'metadata' | 'save';
export interface StageRecord {
    stage: PipelineStage;
    ok: boolean;
    detail: string;
}
export type ImportResult<T> = {
    ok: true;
    value: T;
    stages: StageRecord[];
} | {
    ok: false;
    error: ReadingImportError;
    stages: StageRecord[];
};
export interface PassageDraft {
    title: string;
    text: string;
    sourceType: ReadingSourceType;
    sourceUrl: string;
    sourceName: string;
    topic: string;
    language: string;
    paragraphs: ReturnType<typeof parsePassageText>['paragraphs'];
    sentences: ReturnType<typeof parsePassageText>['sentences'];
    wordCount: number;
    contentHash: string;
    extractionMethod: ReadingExtractionMethod;
    sourceReliability: ReadingSourceReliability;
    userEdited: boolean;
    sourceMetadata: Record<string, string>;
    notes: string[];
}
const fail = (error: ReadingImportError, stages: StageRecord[]): ImportResult<never> => ({ ok: false, error, stages });
function err(code: ReadingImportErrorCode, message: string, hint: string, fallback: ImportFallback[], stage: PipelineStage): ReadingImportError {
    return { code, message, hint, fallback, stage };
}
// —— 来源校验 ——
export function validateImportText(raw: string, opts: {
    allowShort?: boolean;
} = {}): ImportResult<{
    text: string;
    wordCount: number;
}> {
    const stages: StageRecord[] = [];
    const text = String(raw ?? '');
    if (!text.trim()) {
        stages.push({ stage: 'source-validation', ok: false, detail: 'empty' });
        return fail(err('empty', '没有检测到任何正文。', '请粘贴英文文章正文，或改用上传文本文件。', ['paste', 'file'], 'source-validation'), stages);
    }
    const parsed = parsePassageText(text);
    stages.push({ stage: 'source-validation', ok: true, detail: `${parsed.wordCount} words` });
    if (parsed.wordCount === 0) {
        stages.push({ stage: 'normalization', ok: false, detail: 'no-token' });
        return fail(err('empty', '正文里没有可识别的英文词。', '确认内容确实是英文文章（纯图片、表格或乱码无法当正文）。', ['paste', 'image'], 'normalization'), stages);
    }
    if (parsed.wordCount > IMPORT_LIMITS.maxWords || parsed.text.length > IMPORT_LIMITS.maxChars) {
        stages.push({ stage: 'normalization', ok: false, detail: `too-long:${parsed.wordCount}` });
        return fail(err('too-long', `这篇文章有 ${parsed.wordCount} 词，超过单篇上限 ${IMPORT_LIMITS.maxWords} 词。`, '请分成 2–3 篇导入；一次读完整篇不是目标。', ['paste', 'file'], 'normalization'), stages);
    }
    if (parsed.wordCount < IMPORT_LIMITS.minWords && !opts.allowShort) {
        stages.push({ stage: 'normalization', ok: false, detail: `too-short:${parsed.wordCount}` });
        return fail(err('too-short', `只有 ${parsed.wordCount} 词，短于 ${IMPORT_LIMITS.minWords} 词。`, '太短的文本无法形成“读一段完整意思”的训练；如确实要用作短材料，请勾选“仍按短文导入”。', ['paste', 'file'], 'normalization'), stages);
    }
    return { ok: true, value: { text: parsed.text, wordCount: parsed.wordCount }, stages };
}
function guessTitle(text: string, paragraphs: ReturnType<typeof parsePassageText>['paragraphs']): string {
    const first = paragraphs[0]?.text ?? text;
    if (paragraphs.length > 1 && first.split(/\s+/).length <= 14 && !/[.!?]$/.test(first.trim()))
        return first.trim();
    const words = text.trim().split(/\s+/).slice(0, 8).join(' ');
    return words.length > 0 ? words : '未命名文章';
}
function buildDraft(input: {
    raw: string;
    title?: string;
    topic?: string;
    sourceType: ReadingSourceType;
    sourceUrl?: string;
    sourceName?: string;
    sourceReliability?: ReadingSourceReliability;
    extractionMethod: ReadingExtractionMethod;
    userEdited?: boolean;
    sourceMetadata?: Record<string, string>;
    allowShort?: boolean;
}): ImportResult<PassageDraft> {
    const stages: StageRecord[] = [];
    const valid = validateImportText(input.raw, { allowShort: input.allowShort });
    if (!valid.ok)
        return { ok: false, error: valid.error, stages: [...stages, ...valid.stages] };
    stages.push(...valid.stages);
    const parsed = parsePassageText(valid.value.text);
    stages.push({ stage: 'segmentation', ok: true, detail: `${parsed.paragraphs.length} 段 / ${parsed.sentences.length} 句` });
    if (!parsed.paragraphs.length || !parsed.sentences.length) {
        return fail(err('import-failed', '文本切分后没有形成有效段落或句子。', '检查内容是否为英文正文（不是纯符号、代码或乱码）。', ['paste', 'file'], 'segmentation'), stages);
    }
    const draft: PassageDraft = {
        title: (input.title || '').trim() || guessTitle(parsed.text, parsed.paragraphs),
        text: parsed.text,
        sourceType: input.sourceType,
        sourceUrl: input.sourceUrl ?? '',
        sourceName: input.sourceName ?? '',
        topic: (input.topic || '').trim() || '未分类',
        language: 'en',
        paragraphs: parsed.paragraphs,
        sentences: parsed.sentences,
        wordCount: parsed.wordCount,
        contentHash: contentHash(parsed.text),
        extractionMethod: input.extractionMethod,
        sourceReliability: input.sourceReliability ?? 'user_provided',
        userEdited: input.userEdited ?? false,
        sourceMetadata: input.sourceMetadata ?? {},
        notes: parsed.notes,
    };
    stages.push({ stage: 'metadata', ok: true, detail: `hash=${draft.contentHash}` });
    return { ok: true, value: draft, stages };
}
export function buildPastedDraft(input: {
    raw: string;
    title?: string;
    topic?: string;
    allowShort?: boolean;
}): ImportResult<PassageDraft> {
    return buildDraft({ ...input, sourceType: 'pasted_text', extractionMethod: 'paste', sourceReliability: 'user_provided' });
}
// —— 文件导入 ——
const TEXT_EXT = ['.txt', '.md', '.markdown', '.text'];
const HTML_EXT = ['.html', '.htm'];
export function extractTextFromHtml(html: string): string {
    let s = String(html ?? '');
    s = s.replace(/<!--[\s\S]*?-->/g, ' ');
    s = s.replace(/<(script|style|noscript|template|svg|iframe)\b[\s\S]*?<\/\1>/gi, ' ');
    // 优先取语义正文容器
    const article = /<(article|main)\b[^>]*>([\s\S]*?)<\/\1>/i.exec(s);
    if (article)
        s = article[2];
    s = s.replace(/<(nav|aside|footer|header|form)\b[\s\S]*?<\/\1>/gi, ' ');
    // 块级元素 → 换行，行内元素 → 空格
    s = s.replace(/<\/?(p|div|section|br|li|ul|ol|h[1-6]|tr|blockquote|figure|figcaption)\b[^>]*>/gi, '\n');
    s = s.replace(/<[^>]+>/g, ' ');
    s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&mdash;/g, '—').replace(/&ndash;/g, '–')
        .replace(/&hellip;/g, '…').replace(/&rsquo;|&lsquo;/g, "'").replace(/&rdquo;|&ldquo;/g, '"');
    s = s.replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)));
    s = s.replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)));
    return s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}
export function importFromFile(input: {
    name: string;
    data: string;
    title?: string;
    topic?: string;
    allowShort?: boolean;
}): ImportResult<PassageDraft> {
    const name = (input.name || '').toLowerCase();
    const stages: StageRecord[] = [];
    if (TEXT_EXT.some(ext => name.endsWith(ext))) {
        stages.push({ stage: 'text-extraction', ok: true, detail: 'plain-text' });
        const res = buildDraft({ ...input, raw: input.data, sourceType: 'uploaded_file', extractionMethod: 'file_text', sourceName: input.name, sourceReliability: 'user_provided' });
        return { ...res, stages: [...stages, ...res.stages] } as ImportResult<PassageDraft>;
    }
    if (HTML_EXT.some(ext => name.endsWith(ext))) {
        const text = extractTextFromHtml(input.data);
        if (!text.trim()) {
            stages.push({ stage: 'text-extraction', ok: false, detail: 'no-text-in-html' });
            return fail(err('malformed-html', '这个 HTML 文件里没抽到正文。', '可能是脚本动态渲染的页面：请在浏览器里打开后复制正文粘贴。', ['paste'], 'text-extraction'), stages);
        }
        stages.push({ stage: 'text-extraction', ok: true, detail: 'html-to-text' });
        const res = buildDraft({ ...input, raw: text, sourceType: 'uploaded_file', extractionMethod: 'file_html', sourceName: input.name, sourceReliability: 'user_provided' });
        return { ...res, stages: [...stages, ...res.stages] } as ImportResult<PassageDraft>;
    }
    stages.push({ stage: 'text-extraction', ok: false, detail: `unsupported:${name}` });
    return fail(err('unsupported-document', '当前只支持 TXT / MD / HTML 文本文件。', 'PDF、DOCX、EPUB 本阶段没有可靠的本地解析，不做假解析。请复制正文粘贴（或用截图走 OCR）。', ['paste', 'image'], 'text-extraction'), stages);
}
// —— URL 导入（安全边界）——
const PRIVATE_HOST_RE = [
    /^localhost$/i, /^127\./, /^10\./, /^192\.168\./, /^169\.254\./,
    /^172\.(1[6-9]|2\d|3[01])\./, /^0\./, /^\[?::1\]?$/, /\.local$/i, /\.internal$/i,
];
const METADATA_HOSTS = new Set(['169.254.169.254', 'metadata.google.internal', '100.100.100.200']);
export function assertUrlAllowed(rawUrl: string): ImportResult<{
    url: string;
    host: string;
}> {
    const stages: StageRecord[] = [{ stage: 'source-validation', ok: false, detail: 'url' }];
    let url: URL;
    try {
        url = new URL(String(rawUrl || '').trim());
    }
    catch {
        return fail(err('invalid-url', '这不是一个合法网址。', '检查是否少了 https:// 或包含多余空格。', ['paste', 'file'], 'source-validation'), stages);
    }
    if (!/^https?:$/.test(url.protocol)) {
        return fail(err('invalid-url', `只支持 http/https 网址（当前是 ${url.protocol}）。`, '直接粘贴文章正文也可以。', ['paste'], 'source-validation'), stages);
    }
    const host = url.hostname.toLowerCase();
    if (METADATA_HOSTS.has(host) || PRIVATE_HOST_RE.some(re => re.test(host))) {
        return fail(err('blocked-url', '出于安全原因，不抓取本机/内网/云元数据地址。', '这是防止被诱导访问内网服务的保护；公开文章网址不受影响。', ['paste', 'file'], 'source-validation'), stages);
    }
    stages[0] = { stage: 'source-validation', ok: true, detail: host };
    return { ok: true, value: { url: url.toString(), host }, stages };
}
export function classifyFetchFailure(input: {
    status?: number;
    timedOut?: boolean;
    cors?: boolean;
    body?: string;
}): ReadingImportError {
    const body = (input.body ?? '').toLowerCase();
    if (input.timedOut)
        return err('timeout', '抓取超时。', '网络或对方站点太慢；重试一次，或直接粘贴正文。', ['paste', 'file'], 'text-extraction');
    if (input.cors)
        return err('cannot-fetch', '浏览器不允许跨站抓取这个地址（CORS）。', '这是浏览器安全限制，不是为了绕过的 bug；请复制正文粘贴，或上传保存下来的 HTML/TXT。', ['paste', 'file'], 'text-extraction');
    const status = input.status ?? 0;
    if (status === 401 || status === 407 || /sign in|log in|login required/.test(body))
        return err('login-required', '这个页面需要登录才能看全文。', '登录后的内容无法本地抓取；请把正文复制出来粘贴。', ['paste', 'file'], 'text-extraction');
    if (status === 402 || status === 403 || /paywall|subscribe to (continue|read)/.test(body))
        return err('paywall', '这个页面被付费墙/访问控制挡住。', '不绕付费墙；请粘贴你能合法阅读的正文。', ['paste', 'file'], 'text-extraction');
    if (status >= 500)
        return err('cannot-fetch', `对方服务器返回 ${status}。`, '稍后重试，或粘贴正文。', ['paste', 'file'], 'text-extraction');
    return err('cannot-fetch', status ? `抓取失败（HTTP ${status}）。` : '抓取失败。', '直接粘贴正文是最稳的方式。', ['paste', 'file'], 'text-extraction');
}
export function buildUrlDraft(input: {
    url: string;
    html?: string;
    text?: string;
    title?: string;
    topic?: string;
}): ImportResult<PassageDraft> {
    const allowed = assertUrlAllowed(input.url);
    if (!allowed.ok)
        return allowed;
    const stages = [...allowed.stages];
    const extraction = input.text !== undefined
        ? { text: input.text, method: 'url_fetch' as ReadingExtractionMethod, detail: 'provided-text' }
        : { text: extractTextFromHtml(input.html ?? ''), method: 'url_fetch' as ReadingExtractionMethod, detail: 'html-to-text' };
    if (!extraction.text.trim()) {
        stages.push({ stage: 'text-extraction', ok: false, detail: 'empty-after-extract' });
        return fail(err('malformed-html', '从这个页面里没抽到正文。', '可能是脚本渲染或结构异常；请在浏览器里打开后复制正文粘贴。', ['paste', 'file'], 'text-extraction'), stages);
    }
    stages.push({ stage: 'text-extraction', ok: true, detail: extraction.detail });
    const res = buildDraft({
        raw: extraction.text,
        title: input.title,
        topic: input.topic,
        sourceType: 'web_article',
        sourceUrl: allowed.value.url,
        sourceName: allowed.value.host,
        sourceReliability: 'editorial',
        extractionMethod: extraction.method,
        sourceMetadata: { host: allowed.value.host },
    });
    return { ...res, stages: [...stages, ...res.stages] } as ImportResult<PassageDraft>;
}
// —— 截图 / OCR ——
// 视觉能力必须由调用方探测后传入（不同 provider 差异很大，不做假设）。
export interface OcrCapability {
    available: boolean;
    method: 'vision' | 'local' | 'none';
    reason: string;
}
export function ocrCapability(input: {
    providerSupportsVision: boolean;
    localOcrInstalled: boolean;
}): OcrCapability {
    if (input.providerSupportsVision)
        return { available: true, method: 'vision', reason: '当前 AI 供应商支持图像输入' };
    if (input.localOcrInstalled)
        return { available: true, method: 'local', reason: '使用本地 OCR（tesseract.js）' };
    return { available: false, method: 'none', reason: '当前没有可用的 OCR：既没有视觉模型，也没有本地 OCR 引擎' };
}
// OCR 文本必须先经人工确认；未确认的低置信度结果不允许直接进正式阅读。
export function buildImageDraft(input: {
    text: string;
    imageName: string;
    confidence?: number;
    method: 'vision' | 'local';
    userConfirmed: boolean;
    title?: string;
    topic?: string;
    allowShort?: boolean;
}): ImportResult<PassageDraft> {
    const stages: StageRecord[] = [];
    if (!input.userConfirmed) {
        stages.push({ stage: 'source-validation', ok: false, detail: 'ocr-unconfirmed' });
        return fail(err('ocr-needs-confirmation', '识别结果还没有经过你确认。', 'OCR 会有错字：先在编辑框里核对并修正，再保存为阅读材料。', ['paste', 'image'], 'source-validation'), stages);
    }
    stages.push({ stage: 'text-extraction', ok: true, detail: `ocr:${input.method}:${Math.round((input.confidence ?? 0) * 100)}%` });
    const res = buildDraft({
        raw: input.text,
        title: input.title,
        topic: input.topic,
        sourceType: 'uploaded_image',
        sourceName: input.imageName,
        sourceReliability: 'unknown',
        extractionMethod: input.method === 'vision' ? 'vision_ocr' : 'local_ocr',
        userEdited: true,
        allowShort: input.allowShort,
        sourceMetadata: { imageName: input.imageName, ocrMethod: input.method, confidence: String(input.confidence ?? '') },
    });
    return { ...res, stages: [...stages, ...res.stages] } as ImportResult<PassageDraft>;
}
// —— 重复检测 ——
export function findDuplicate(draft: PassageDraft, existing: Passage[]): Passage | null {
    return existing.find(p => (p.contentHash && p.contentHash === draft.contentHash) || p.text === draft.text) ?? null;
}
export function toPassage(draft: PassageDraft, now = Date.now()): Passage {
    return {
        id: uid(),
        title: draft.title,
        text: draft.text,
        sourceType: draft.sourceType,
        sourceUrl: draft.sourceUrl,
        topic: draft.topic,
        wordCount: draft.wordCount,
        difficulty: '',
        createdAt: now,
        sourceName: draft.sourceName,
        language: draft.language,
        paragraphs: draft.paragraphs,
        sentences: draft.sentences,
        sourceReliability: draft.sourceReliability,
        contentHash: draft.contentHash,
        extractionMethod: draft.extractionMethod,
        userEdited: draft.userEdited,
        importedAt: now,
        sourceMetadata: draft.sourceMetadata,
    };
}
// 用户编辑正文后重建（保留来历，标记 userEdited）
export function rebuildDraftText(draft: PassageDraft, raw: string): ImportResult<PassageDraft> {
    const res = buildDraft({
        raw,
        title: draft.title,
        topic: draft.topic,
        sourceType: draft.sourceType,
        sourceUrl: draft.sourceUrl,
        sourceName: draft.sourceName,
        sourceReliability: draft.sourceReliability,
        extractionMethod: draft.extractionMethod === 'paste' ? 'manual' : draft.extractionMethod,
        userEdited: true,
        sourceMetadata: draft.sourceMetadata,
        allowShort: true,
    });
    return res;
}
// 人工转录（当前没有可用 OCR 时的诚实路径）：截图→用户自己录入文字→确认后保存。
// 与“假装 OCR 成功”不同：extractionMethod 记为 manual，来源可靠性 unknown。
export function buildManualImageDraft(input: {
    text: string;
    imageName: string;
    title?: string;
    topic?: string;
    userConfirmed: boolean;
    allowShort?: boolean;
}): ImportResult<PassageDraft> {
    const stages: StageRecord[] = [];
    if (!input.userConfirmed) {
        stages.push({ stage: 'source-validation', ok: false, detail: 'manual-unconfirmed' });
        return fail(err('ocr-needs-confirmation', '截图里的文字还没有经过你确认。', '先把文字录入/核对一遍，再保存为阅读材料。', ['paste', 'image'], 'source-validation'), stages);
    }
    stages.push({ stage: 'text-extraction', ok: true, detail: 'manual-transcription' });
    const res = buildDraft({
        raw: input.text,
        title: input.title,
        topic: input.topic,
        sourceType: 'uploaded_image',
        sourceName: input.imageName,
        sourceReliability: 'unknown',
        extractionMethod: 'manual',
        userEdited: true,
        allowShort: input.allowShort,
        sourceMetadata: { imageName: input.imageName, ocrMethod: 'manual-transcription' },
    });
    return { ...res, stages: [...stages, ...res.stages] } as ImportResult<PassageDraft>;
}
