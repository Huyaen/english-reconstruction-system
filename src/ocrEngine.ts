// —— Phase 5.1：本地 OCR 引擎（懒加载 + 单 worker + 可取消 + 可释放）——
// 只在这里 import tesseract.js：动态 import 会单独切 chunk，首屏不加载 OCR（不得拖慢启动）。
// 图片始终留在本地：Wasm 在浏览器里跑，tesseract 的 worker 只读取本地 Blob，不上传图片。
import { OCR_POLICY, classifyOcrFailure, cleanOcrText, ocrProgress, type OcrFailure, type OcrProgress, type OcrRecognized } from './ocr.ts';
export interface OcrBackend {
    recognize(image: Blob, onProgress: (p: OcrProgress) => void): Promise<{
        text: string;
        confidence: number | null;
    }>;
    terminate(): Promise<void>;
}
export type OcrBackendFactory = (ctx: {
    onProgress: (p: OcrProgress) => void;
}) => Promise<OcrBackend>;
export class OcrError extends Error {
    failure: OcrFailure;
    constructor(failure: OcrFailure) {
        super(failure.message);
        this.name = 'OcrError';
        this.failure = failure;
    }
}
// 资源位置固定写死版本，避免 CDN “latest” 悄悄换实现；全部是 Apache-2.0 资产。
export const OCR_ASSETS = {
    workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/worker.min.js',
    corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@7.0.0',
    // 2.9MB 的 best_int 英文模型：截图场景够用，首次下载后可被浏览器缓存
    langPath: 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int',
} as const;
type TesseractWorker = {
    recognize: (image: Blob | string, options?: Record<string, unknown>, output?: Record<string, unknown>) => Promise<{
        data: {
            text?: string;
            confidence?: number;
        };
    }>;
    terminate: () => Promise<unknown>;
};
type CreateWorkerFn = (langs?: string, oem?: number, options?: Record<string, unknown>, config?: Record<string, unknown>) => Promise<TesseractWorker>;
export async function createTesseractBackend(ctx: {
    onProgress: (p: OcrProgress) => void;
}, paths: Partial<typeof OCR_ASSETS> = {}): Promise<OcrBackend> {
    const assets = { ...OCR_ASSETS, ...paths };
    const mod = await import('tesseract.js') as unknown as {
        createWorker?: CreateWorkerFn;
        default?: {
            createWorker?: CreateWorkerFn;
        };
    };
    const createWorker = mod.createWorker ?? mod.default?.createWorker;
    if (typeof createWorker !== 'function')
        throw Object.assign(new Error('tesseract.js createWorker 不可用'), { code: 'engine-unavailable' });
    const worker = await createWorker(OCR_POLICY.lang, 1, {
        workerPath: assets.workerPath,
        corePath: assets.corePath,
        langPath: assets.langPath,
        logger: (m: {
            status?: string;
            progress?: number;
        }) => ctx.onProgress(ocrProgress(String(m.status ?? ''), Number(m.progress ?? 0))),
        errorHandler: () => { },
    }, {});
    return {
        async recognize(image: Blob, onProgress) {
            const res = await (worker as unknown as {
                recognize: (img: Blob, opts: Record<string, unknown>) => Promise<{
                    data: {
                        text?: string;
                        confidence?: number;
                    };
                }>;
                setParameters?: (p: Record<string, unknown>) => Promise<unknown>;
            }).recognize(image, {});
            onProgress(ocrProgress('recognizing text', 1));
            const conf = Number(res?.data?.confidence);
            return { text: String(res?.data?.text ?? ''), confidence: Number.isFinite(conf) ? Math.max(0, Math.min(100, conf)) : null };
        },
        async terminate() {
            try {
                await (worker as unknown as {
                    terminate: () => Promise<unknown>;
                }).terminate();
            }
            catch { /* 已经终止 */ }
        },
    };
}
// 单例服务：懒加载后端、串行执行（tesseract worker 一次只能跑一个任务）、超时/取消都能真正停下来
export class OcrService {
    private factory: OcrBackendFactory;
    private backend: Promise<OcrBackend> | null = null;
    private chain: Promise<unknown> = Promise.resolve();
    private disposed = false;
    private active: OcrBackend | null = null;
    constructor(factory: OcrBackendFactory = createTesseractBackend) {
        this.factory = factory;
    }
    get loaded(): boolean {
        return this.backend !== null;
    }
    private async ensure(): Promise<OcrBackend> {
        if (this.disposed)
            this.disposed = false;
        if (!this.backend) {
            const p = this.factory({ onProgress: p => this.lastProgress(p) });
            this.backend = p;
            p.catch(() => { this.backend = null; });
        }
        try {
            const b = await this.backend;
            this.active = b;
            return b;
        }
        catch (e) {
            this.backend = null;
            throw new OcrError(classifyOcrFailure(e));
        }
    }
    private lastProgressFn: ((p: OcrProgress) => void) | null = null;
    private lastProgress(p: OcrProgress): void {
        this.lastProgressFn?.(p);
    }
    // 识别：串行排队 → 超时/取消都会 terminate worker 并让下一次重新加载
    async recognize(file: Blob, opts: {
        onProgress?: (p: OcrProgress) => void;
        signal?: AbortSignal;
        timeoutMs?: number;
    } = {}): Promise<OcrRecognized> {
        const run = async (): Promise<OcrRecognized> => {
            const timeoutMs = opts.timeoutMs ?? OCR_POLICY.timeoutMs;
            if (opts.signal?.aborted)
                throw new OcrError(classifyOcrFailure(Object.assign(new Error('aborted'), { code: 'aborted' })));
            this.lastProgressFn = opts.onProgress ?? null;
            const backend = await this.ensure();
            let timer: ReturnType<typeof setTimeout> | null = null;
            const timeout = new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new OcrError(classifyOcrFailure(Object.assign(new Error('timeout'), { code: 'timeout' })))), timeoutMs);
            });
            const abort = new Promise<never>((_, reject) => {
                opts.signal?.addEventListener('abort', () => reject(new OcrError(classifyOcrFailure(Object.assign(new Error('aborted'), { code: 'aborted' })))), { once: true });
            });
            try {
                const res = await Promise.race([backend.recognize(file, p => this.lastProgress(p)), timeout, abort]);
                const text = cleanOcrText(res.text);
                if (!text)
                    throw new OcrError(classifyOcrFailure(Object.assign(new Error('empty'), { code: 'empty-result' })));
                return { text, confidence: res.confidence };
            }
            catch (e) {
                const failure = e instanceof OcrError ? e.failure : classifyOcrFailure(e);
                // 超时/取消/引擎异常后 worker 可能处于坏状态：直接释放，下一次重新加载
                if (['timeout', 'aborted', 'unknown', 'decode-failed', 'model-load-failed', 'engine-unavailable'].includes(failure.code))
                    await this.dispose();
                throw new OcrError(failure);
            }
            finally {
                if (timer)
                    clearTimeout(timer);
                this.lastProgressFn = null;
            }
        };
        const queued = this.chain.then(run, run);
        this.chain = queued.catch(() => undefined);
        return queued;
    }
    async dispose(): Promise<void> {
        const b = this.active;
        this.active = null;
        this.backend = null;
        this.disposed = true;
        if (b) {
            try {
                await b.terminate();
            }
            catch { /* ignore */ }
        }
    }
}
export const ocrService = new OcrService();
// 只给验收用：用一份独立引擎指向自定义资源路径（例如故意指错，验证“模型加载失败”的真实报错）
export function ocrServiceWithPaths(paths: Partial<typeof OCR_ASSETS>): OcrService {
    return new OcrService(ctx => createTesseractBackend(ctx, paths));
}
