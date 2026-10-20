// —— Phase 5.1：截图 OCR 的策略与错误契约（纯函数，无 DOM / 无网络）——
// 纪律：
// 1. OCR 只在用户自己的浏览器里跑（本地 Wasm）；图片不上传任何服务器。
// 2. 识别结果必须经用户核对确认后才能进 Reading Import Pipeline。
// 3. 识别不了就明确说原因并给出人工转录出口，绝不伪造识别成功。
export const OCR_POLICY = {
    maxBytes: 8 * 1024 * 1024, // 8MB：再大就不像“文章截图”了
    timeoutMs: 90000,
    lang: 'eng',
    // 训练数据只有英文：英文截图是唯一承诺支持的场景
    formats: ['png', 'jpeg'] as const,
} as const;
export type OcrFormat = typeof OCR_POLICY.formats[number];
export type OcrFailureCode = 'unsupported-type' | 'too-large' | 'engine-unavailable' | 'model-load-failed' | 'decode-failed' | 'empty-result' | 'aborted' | 'timeout' | 'unknown';
export type OcrFallback = 'manual' | 'paste' | 'file';
export interface OcrFailure {
    code: OcrFailureCode;
    message: string;
    hint: string;
    fallback: OcrFallback[];
}
export interface OcrRecognized {
    text: string;
    /** 0–100，来自 OCR 引擎自己的置信度；未提供时为 null（不编造） */
    confidence: number | null;
}
export interface OcrProgress {
    status: string;
    /** 0–1 */
    progress: number;
    label: string;
}
function ext(name: string): string {
    const m = /\.([a-z0-9]+)$/i.exec(name.trim());
    return m ? m[1].toLowerCase() : '';
}
// 只接受 PNG / JPEG（BMP/WEBP/GIF 交给用户另存或改用粘贴，不做“大概能识别”的承诺）
export function detectImageFormat(name: string, mime = ''): OcrFormat | null {
    const e = ext(name);
    if (e === 'png' || mime === 'image/png')
        return 'png';
    if (e === 'jpg' || e === 'jpeg' || mime === 'image/jpeg' || mime === 'image/jpg')
        return 'jpeg';
    return null;
}
export function checkImage(input: {
    name: string;
    type?: string;
    size: number;
}): OcrFailure | null {
    if (!detectImageFormat(input.name, input.type ?? ''))
        return {
            code: 'unsupported-type',
            message: '只支持 PNG / JPG 截图。',
            hint: '把截图另存为 PNG 或 JPG 再上传；也可以直接粘贴正文，或手动录入截图里的文字。',
            fallback: ['manual', 'paste', 'file'],
        };
    if (input.size > OCR_POLICY.maxBytes)
        return {
            code: 'too-large',
            message: `这张图片有 ${(input.size / 1024 / 1024).toFixed(1)}MB，超过 ${OCR_POLICY.maxBytes / 1024 / 1024}MB 上限。`,
            hint: '只截需要读的那一段（不要整页长截图），或压缩后再试；也可以直接粘贴正文。',
            fallback: ['manual', 'paste'],
        };
    if (input.size === 0)
        return { code: 'decode-failed', message: '这个文件是空的。', hint: '重新截图后再试。', fallback: ['manual', 'paste'] };
    return null;
}
// 识别文本只做“排版级”清理：统一空白、去掉 OCR 常在行尾留下的孤立连字符换行。
// 不改写单词、不纠正拼写（那是识别出错，必须由用户自己改）。
export function cleanOcrText(raw: string): string {
    let t = String(raw ?? '').replace(/\r\n?/g, '\n');
    t = t.replace(/[ \t\u00a0]+/g, ' ');
    t = t.replace(/([A-Za-z])-[ \t]*\n[ \t]*([a-z])/g, '$1$2'); // 行尾断词
    t = t.split('\n').map(l => l.replace(/[ \t]+$/g, '').trim()).join('\n');
    t = t.replace(/\n{3,}/g, '\n\n');
    return t.trim();
}
const NETWORK_HINTS = [/failed to fetch/i, /networkerror/i, /load failed/i, /fetch/i, /importing a module script failed/i, /worker/i];
export function classifyOcrFailure(err: unknown): OcrFailure {
    const e = err as {
        message?: string;
        name?: string;
        code?: string;
    } | null;
    const msg = String(e?.message ?? err ?? '');
    if (e?.code === 'empty-result')
        return {
            code: 'empty-result',
            message: '没有从这张图里识别出英文文字。',
            hint: '可能图片太模糊、文字太小，或不是英文截图。请在阅读区把文字手动录入（不会假装识别成功）。',
            fallback: ['manual', 'paste'],
        };
    if (e?.code === 'aborted' || /abort/i.test(msg))
        return { code: 'aborted', message: '已取消识别。', hint: '可以重新识别，或直接手动录入。', fallback: ['manual', 'paste'] };
    if (e?.code === 'timeout' || /timeout|timed out/i.test(msg))
        return { code: 'timeout', message: '识别超时了。', hint: '截图太大或设备太慢：只截需要读的一段再试，或手动录入。', fallback: ['manual', 'paste'] };
    if (e?.code === 'engine-unavailable' || /cannot find module|not supported|webassembly/i.test(msg))
        return {
            code: 'engine-unavailable',
            message: '这个浏览器不支持本地 OCR（需要 WebAssembly）。',
            hint: '换用较新的 Chrome / Edge，或直接手动录入截图里的文字。',
            fallback: ['manual', 'paste'],
        };
    if (e?.code === 'decode-failed' || /decode|invalid image|unsupported image/i.test(msg))
        return { code: 'decode-failed', message: '这张图片读不出来。', hint: '确认文件能正常打开，另存为 PNG 后再试。', fallback: ['manual', 'paste'] };
    if (NETWORK_HINTS.some(re => re.test(msg)))
        return {
            code: 'model-load-failed',
            message: 'OCR 引擎或英文模型没能加载（看起来是网络问题）。',
            hint: '首次使用需要下载约 3MB 的英文识别模型；离线或网络受限时请手动录入文字（不会上传图片，也不会假装识别成功）。',
            fallback: ['manual', 'paste'],
        };
    return {
        code: 'unknown',
        message: '识别失败：' + (msg.slice(0, 120) || '未知错误'),
        hint: '可以重试一次；仍然失败就手动录入截图里的文字。',
        fallback: ['manual', 'paste'],
    };
}
const STATUS_LABELS: Record<string, string> = {
    'loading tesseract core': '加载 OCR 内核',
    'initializing tesseract': '初始化 OCR',
    'loading language traineddata': '下载英文识别模型',
    'loading language traineddata (from cache)': '读取已缓存的英文模型',
    'initializing api': '准备识别',
    'recognizing text': '识别文字',
};
export function ocrStatusLabel(status: string): string {
    return STATUS_LABELS[status] ?? '准备 OCR';
}
export function ocrProgress(status: string, progress: number): OcrProgress {
    const p = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
    return { status, progress: p, label: `${ocrStatusLabel(status)} ${Math.round(p * 100)}%` };
}
