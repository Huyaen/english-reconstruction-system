// Phase 5.1：OCR 契约与调度（真实 Wasm 识别在浏览器冒烟里跑，这里验证策略/错误/生命周期）
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OCR_POLICY, checkImage, classifyOcrFailure, cleanOcrText, detectImageFormat, ocrProgress, ocrStatusLabel } from '../src/ocr.ts';
import { OcrError, OcrService, type OcrBackend, type OcrBackendFactory } from '../src/ocrEngine.ts';
function fakeBackend(impl: {
    text?: string;
    confidence?: number | null;
    delayMs?: number;
    throwErr?: unknown;
}): OcrBackend & {
    terminated: number;
    calls: number;
} {
    const state = {
        terminated: 0,
        calls: 0,
        async recognize() {
            state.calls += 1;
            if (impl.delayMs)
                await new Promise(r => setTimeout(r, impl.delayMs));
            if (impl.throwErr)
                throw impl.throwErr;
            return { text: impl.text ?? 'Hello world.', confidence: impl.confidence === undefined ? 92 : impl.confidence };
        },
        async terminate() { state.terminated += 1; },
    };
    return state as unknown as OcrBackend & {
        terminated: number;
        calls: number;
    };
}
// —— 1. 格式与大小门禁：不支持的类型绝不“大概试试” ——
test('只接受 PNG / JPG，其他类型直接拒绝', () => {
    assert.equal(detectImageFormat('shot.png'), 'png');
    assert.equal(detectImageFormat('SHOT.JPG'), 'jpeg');
    assert.equal(detectImageFormat('shot.jpeg'), 'jpeg');
    assert.equal(detectImageFormat('shot.webp'), null);
    assert.equal(detectImageFormat('shot.gif'), null);
    assert.equal(detectImageFormat('shot.heic'), null);
    assert.equal(detectImageFormat('noext', 'image/png'), 'png');
    assert.equal(detectImageFormat('noext', 'image/jpeg'), 'jpeg');
    assert.equal(detectImageFormat('noext', 'image/tiff'), null);
    const bad = checkImage({ name: 'a.webp', type: 'image/webp', size: 1000 });
    assert.equal(bad?.code, 'unsupported-type');
    assert.deepEqual(bad?.fallback, ['manual', 'paste', 'file']);
    assert.match(bad?.hint ?? '', /手动录入|粘贴/);
    const big = checkImage({ name: 'a.png', type: 'image/png', size: OCR_POLICY.maxBytes + 1 });
    assert.equal(big?.code, 'too-large');
    assert.match(big?.message ?? '', /MB/);
    assert.equal(checkImage({ name: 'a.png', type: 'image/png', size: 0 })?.code, 'decode-failed');
    assert.equal(checkImage({ name: 'a.png', type: 'image/png', size: 2048 }), null);
});
// —— 2. 文本清理：只改排版，不改词 ——
test('清理只做排版：合并空白、接回行尾断词，保留段落与拼写', () => {
    const raw = '  The  quick brown   fox\njumps over the la-\nzy dog.  \n\n\n\nSecond   paragraph here.  \n';
    const out = cleanOcrText(raw);
    assert.equal(out, 'The quick brown fox\njumps over the lazy dog.\n\nSecond paragraph here.');
    // 拼写错误原样保留：识别错字必须由用户自己改，程序不替他“美化”
    assert.equal(cleanOcrText('teh cat sat'), 'teh cat sat');
    assert.equal(cleanOcrText(''), '');
    assert.equal(cleanOcrText(null as unknown as string), '');
});
// —— 3. 失败分类：每种失败都有明确出口，且都保留人工通道 ——
test('失败分类覆盖空结果/取消/超时/网络/解码/不支持/未知', () => {
    assert.equal(classifyOcrFailure(Object.assign(new Error('x'), { code: 'empty-result' })).code, 'empty-result');
    assert.equal(classifyOcrFailure(Object.assign(new Error('x'), { code: 'aborted' })).code, 'aborted');
    assert.equal(classifyOcrFailure(Object.assign(new Error('timed out'), { code: 'timeout' })).code, 'timeout');
    assert.equal(classifyOcrFailure(new TypeError('Failed to fetch')).code, 'model-load-failed');
    assert.equal(classifyOcrFailure(new Error('NetworkError when attempting to fetch resource.')).code, 'model-load-failed');
    assert.equal(classifyOcrFailure(new Error('invalid image data')).code, 'decode-failed');
    assert.equal(classifyOcrFailure(Object.assign(new Error('x'), { code: 'engine-unavailable' })).code, 'engine-unavailable');
    assert.equal(classifyOcrFailure(new Error('weird')).code, 'unknown');
    for (const err of [new TypeError('Failed to fetch'), new Error('invalid image data'), new Error('weird')]) {
        const f = classifyOcrFailure(err);
        assert.ok(f.fallback.includes('manual'), '任何失败都必须给人工录入出口');
        assert.ok(f.hint.length > 0);
    }
    // 网络失败要说清“首次需要下载模型”，不能含糊
    assert.match(classifyOcrFailure(new TypeError('Failed to fetch')).hint, /模型|离线/);
});
test('进度文案是中文且带百分比', () => {
    assert.equal(ocrStatusLabel('recognizing text'), '识别文字');
    assert.equal(ocrStatusLabel('loading language traineddata'), '下载英文识别模型');
    assert.equal(ocrProgress('recognizing text', 0.42).label, '识别文字 42%');
    assert.equal(ocrProgress('recognizing text', 5).progress, 1);
    assert.equal(ocrProgress('recognizing text', Number.NaN).progress, 0);
});
// —— 4. 服务：成功 / 空结果 / 模型加载失败 / 超时 / 取消 / 释放 / 串行 ——
test('识别成功返回文本与置信度，且后端只加载一次（懒加载复用）', async () => {
    let built = 0;
    const backend = fakeBackend({ text: 'Reading slowly is deliberate.\n\n  Spaced  repetition works. ', confidence: 88 });
    const factory: OcrBackendFactory = async () => { built += 1; return backend; };
    const svc = new OcrService(factory);
    assert.equal(svc.loaded, false);
    const r1 = await svc.recognize(new Blob(['x']));
    assert.equal(r1.text, 'Reading slowly is deliberate.\n\nSpaced repetition works.');
    assert.equal(r1.confidence, 88);
    const r2 = await svc.recognize(new Blob(['y']));
    assert.equal(r2.text, r1.text);
    assert.equal(built, 1, '第二次识别必须复用已加载的 worker');
    assert.equal(backend.calls, 2);
    await svc.dispose();
    assert.equal(backend.terminated, 1);
    assert.equal(svc.loaded, false);
});
test('空结果按“没识别出文字”处理，不返回空文章', async () => {
    const svc = new OcrService(async () => fakeBackend({ text: '   \n\n  ', confidence: 0 }));
    await assert.rejects(() => svc.recognize(new Blob(['x'])), (e: unknown) => {
        assert.ok(e instanceof OcrError);
        assert.equal(e.failure.code, 'empty-result');
        assert.match(e.failure.hint, /手动录入/);
        return true;
    });
    await svc.dispose();
});
test('模型下载失败 → model-load-failed，而不是笼统报错', async () => {
    const svc = new OcrService(async () => { throw new TypeError('Failed to fetch'); });
    await assert.rejects(() => svc.recognize(new Blob(['x'])), (e: unknown) => {
        assert.ok(e instanceof OcrError);
        assert.equal(e.failure.code, 'model-load-failed');
        assert.match(e.failure.message, /模型|网络/);
        return true;
    });
    // 失败后不缓存坏状态：下一次会重新尝试加载
    const svc2 = new OcrService(async () => fakeBackend({ text: 'ok' }));
    await assert.rejects(() => svc.recognize(new Blob(['x'])));
    assert.equal(await svc2.recognize(new Blob(['y'])).then(r => r.text), 'ok');
});
test('超时会释放 worker 并给出重试出口', async () => {
    const backend = fakeBackend({ delayMs: 5000 });
    const svc = new OcrService(async () => backend);
    await assert.rejects(() => svc.recognize(new Blob(['x']), { timeoutMs: 30 }), (e: unknown) => {
        assert.equal((e as OcrError).failure.code, 'timeout');
        return true;
    });
    assert.equal(backend.terminated, 1, '超时后必须 terminate，worker 不能留在后台');
});
test('取消识别会立刻停下并释放引擎', async () => {
    const backend = fakeBackend({ delayMs: 5000 });
    const svc = new OcrService(async () => backend);
    const ac = new AbortController();
    const p = svc.recognize(new Blob(['x']), { signal: ac.signal, timeoutMs: 10000 });
    setTimeout(() => ac.abort(), 20);
    await assert.rejects(() => p, (e: unknown) => {
        assert.equal((e as OcrError).failure.code, 'aborted');
        return true;
    });
    assert.equal(backend.terminated, 1);
});
test('并发识别被串行化：同一个 worker 不会同时跑两个任务', async () => {
    let active = 0;
    let maxActive = 0;
    const svc = new OcrService(async () => ({
        async recognize() {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await new Promise(r => setTimeout(r, 25));
            active -= 1;
            return { text: 'serialized text here', confidence: 90 };
        },
        async terminate() { },
    }));
    const results = await Promise.all([svc.recognize(new Blob(['a'])), svc.recognize(new Blob(['b'])), svc.recognize(new Blob(['c']))]);
    assert.equal(results.length, 3);
    assert.equal(maxActive, 1, '必须串行：tesseract worker 一次只能跑一个任务');
    await svc.dispose();
});
test('dispose 后再识别会重新加载引擎（不残留已终止的 worker）', async () => {
    let built = 0;
    const svc = new OcrService(async () => { built += 1; return fakeBackend({ text: 'reload ok' }); });
    await svc.recognize(new Blob(['a']));
    await svc.dispose();
    const r = await svc.recognize(new Blob(['b']));
    assert.equal(r.text, 'reload ok');
    assert.equal(built, 2);
    await svc.dispose();
});
