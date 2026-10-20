// Phase 6：Provider 传输层（配置校验 / 错误分类 / 有界重试 / 能力降级 / 用量）
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AIError, chat, chatURL, classifyStatus, classifyThrown, endpointIssue, isConfigured, normalizeAIConfig, providerHost, readUsage, validateAIConfig, type AIProviderConfig } from '../src/aiProvider.ts';
const CFG: AIProviderConfig = {
    endpoint: 'https://api.example.com/v1', model: 'test-model', key: 'sk-test',
    structuredMode: 'auto', timeoutMs: 5000, maxRetries: 2, maxOutputTokens: 500,
    temperature: 0.7, concurrency: 1, dailyTokenBudget: null,
};
type FakeRes = {
    ok: boolean;
    status: number;
    text: () => Promise<string>;
};
const okRes = (body: unknown): FakeRes => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
const errRes = (status: number, body: string): FakeRes => ({ ok: false, status, text: async () => body });
const content = (text: string, usage?: {
    prompt_tokens: number;
    completion_tokens: number;
}) => ({
    model: 'served-model',
    choices: [{ message: { content: text } }],
    ...(usage ? { usage } : {}),
});
test('配置校验：缺 endpoint / model / key 都是明确错误，且不静默使用默认值', () => {
    assert.equal(endpointIssue(''), 'missing');
    assert.equal(endpointIssue('not a url'), 'url');
    assert.equal(endpointIssue('ftp://x'), 'protocol');
    assert.equal(endpointIssue('https://user:pw@api.x.com/v1'), 'credentials');
    assert.equal(endpointIssue('https://api.x.com/v1'), null);
    const bad = validateAIConfig({ ...CFG, key: '' });
    assert.equal(bad?.code, 'missing-key');
    assert.equal(validateAIConfig({ ...CFG, model: '  ' })?.code, 'missing-model');
    assert.equal(validateAIConfig({ ...CFG, endpoint: 'javascript:alert(1)' })?.code, 'invalid-endpoint');
    assert.equal(validateAIConfig(CFG), null);
    assert.equal(isConfigured({ endpoint: CFG.endpoint, model: CFG.model, key: CFG.key } as never), true);
    assert.equal(isConfigured({ endpoint: '', model: '', key: '' } as never), false);
});
test('配置归一化会夹紧危险数值（超时/重试/长度）', () => {
    const c = normalizeAIConfig({ endpoint: 'https://a/v1', model: 'm', key: 'k', timeoutMs: 1, maxRetries: 99, maxOutputTokens: 999999, temperature: 9 } as never);
    assert.equal(c.timeoutMs, 3000);
    assert.equal(c.maxRetries, 3);
    assert.equal(c.maxOutputTokens, 8000);
    assert.equal(c.temperature, 1.5);
    assert.equal(c.structuredMode, 'auto');
});
test('URL 拼接与 host 提取', () => {
    assert.equal(chatURL('https://a.com/v1'), 'https://a.com/v1/chat/completions');
    assert.equal(chatURL('https://a.com/v1/'), 'https://a.com/v1/chat/completions');
    assert.equal(chatURL('https://a.com/v1/chat/completions'), 'https://a.com/v1/chat/completions');
    assert.equal(providerHost('https://api.example.com/v1'), 'api.example.com');
    assert.equal(providerHost('bad'), 'unknown');
});
test('HTTP 状态分类：401/403 鉴权、404 模型、429 限流、5xx 服务端', () => {
    assert.equal(classifyStatus(401, '').code, 'auth');
    assert.equal(classifyStatus(403, '').code, 'auth');
    assert.equal(classifyStatus(404, '').code, 'model-not-found');
    assert.equal(classifyStatus(429, '').code, 'rate-limit');
    assert.equal(classifyStatus(429, '').retryable, true);
    assert.equal(classifyStatus(500, '').code, 'server');
    assert.equal(classifyStatus(503, '').code, 'server');
    assert.equal(classifyStatus(400, '{"error":"response_format is not supported"}').code, 'unsupported-mode');
    assert.equal(classifyStatus(400, '{"error":"bad param"}').code, 'invalid-response');
    assert.equal(classifyThrown(new Error('CORS policy blocked')).code, 'cors');
});
test('用量：Provider 给了真实 usage 就用真实值，否则明确标 estimated', () => {
    const real = readUsage({ usage: { prompt_tokens: 120, completion_tokens: 80 } }, 'x'.repeat(400), 'y'.repeat(400));
    assert.deepEqual(real, { promptTokens: 120, completionTokens: 80, estimated: false });
    const est = readUsage({}, 'x'.repeat(400), 'y'.repeat(40));
    assert.equal(est.estimated, true);
    assert.equal(est.promptTokens, 100);
    assert.equal(est.completionTokens, 10);
});
test('成功请求：发送正确的 body，解析 content 与 usage', async () => {
    let seen: {
        url: string;
        body: Record<string, unknown>;
    } | null = null;
    const fetchImpl = (async (url: string, init: RequestInit) => {
        seen = { url: String(url), body: JSON.parse(String(init.body)) };
        return okRes(content('{"a":1}', { prompt_tokens: 10, completion_tokens: 5 }));
    }) as unknown as typeof fetch;
    const r = await chat(CFG, { system: 'sys', user: 'usr' }, { fetchImpl });
    assert.equal(seen!.url, 'https://api.example.com/v1/chat/completions');
    assert.equal(seen!.body.model, 'test-model');
    assert.equal(seen!.body.response_format && (seen!.body.response_format as {
        type: string;
    }).type, 'json_object');
    assert.equal(r.text, '{"a":1}');
    assert.equal(r.usage.promptTokens, 10);
    assert.equal(r.model, 'served-model');
});
test('鉴权失败不重试（避免拿错误 Key 反复打 Provider）', async () => {
    let calls = 0;
    const fetchImpl = (async () => { calls += 1; return errRes(401, '{"error":"invalid api key"}'); }) as unknown as typeof fetch;
    await assert.rejects(() => chat(CFG, { system: 's', user: 'u' }, { fetchImpl, sleep: async () => { } }), (e: unknown) => {
        assert.ok(e instanceof AIError);
        assert.equal(e.info.code, 'auth');
        return true;
    });
    assert.equal(calls, 1);
});
test('429 会按上限重试，最终返回限流错误（不无限循环）', async () => {
    let calls = 0;
    const fetchImpl = (async () => { calls += 1; return errRes(429, '{"error":"rate limited"}'); }) as unknown as typeof fetch;
    await assert.rejects(() => chat(CFG, { system: 's', user: 'u' }, { fetchImpl, sleep: async () => { } }), (e: unknown) => {
        assert.equal((e as AIError).info.code, 'rate-limit');
        return true;
    });
    assert.equal(calls, 3, 'maxRetries=2 → 最多 3 次');
});
test('5xx 之后成功：重试有效且最终成功', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
        calls += 1;
        return calls === 1 ? errRes(503, 'busy') : okRes(content('{"ok":true}'));
    }) as unknown as typeof fetch;
    const r = await chat(CFG, { system: 's', user: 'u' }, { fetchImpl, sleep: async () => { } });
    assert.equal(r.text, '{"ok":true}');
    assert.equal(calls, 2);
});
test('超时被识别为 timeout（可重试），用户取消是 aborted（不可重试）', async () => {
    const hang = ((_u: string, init: RequestInit) => new Promise((_res, rej) => {
        init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })) as unknown as typeof fetch;
    await assert.rejects(() => chat({ ...CFG, timeoutMs: 20, maxRetries: 0 }, { system: 's', user: 'u' }, { fetchImpl: hang }), (e: unknown) => {
        assert.equal((e as AIError).info.code, 'timeout');
        return true;
    });
    const ac = new AbortController();
    const p = chat({ ...CFG, timeoutMs: 5000 }, { system: 's', user: 'u' }, { fetchImpl: hang }, ac.signal);
    setTimeout(() => ac.abort(), 10);
    await assert.rejects(() => p, (e: unknown) => {
        assert.equal((e as AIError).info.code, 'aborted');
        return true;
    });
});
test('结构化能力逐级降级：json_object 被拒 → json_schema → 纯文本（并记录 downgradedFrom）', async () => {
    const modes: string[] = [];
    const fetchImpl = (async (_u: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body));
        const fmt = body.response_format?.type ?? 'text';
        modes.push(fmt);
        if (fmt !== 'text')
            return errRes(400, '{"error":"response_format is not supported by this model"}');
        return okRes(content('{"ok":1}'));
    }) as unknown as typeof fetch;
    const r = await chat(CFG, { system: 's', user: 'u', jsonSchema: { type: 'object' } }, { fetchImpl, sleep: async () => { } });
    assert.equal(r.mode, 'text');
    assert.deepEqual(modes, ['json_object', 'json_schema', 'text']);
    assert.equal(r.downgradedFrom, 'json_object');
});
test('显式指定不支持的模式时直接失败，不偷偷降级', async () => {
    const fetchImpl = (async () => errRes(400, '{"error":"json_schema unsupported"}')) as unknown as typeof fetch;
    await assert.rejects(() => chat({ ...CFG, structuredMode: 'json_schema' }, { system: 's', user: 'u' }, { fetchImpl, sleep: async () => { } }), (e: unknown) => {
        assert.equal((e as AIError).info.code, 'unsupported-mode');
        return true;
    });
});
test('空内容 / 非 JSON / 网络错误都有明确分类', async () => {
    const empty = (async () => okRes({ choices: [{ message: { content: '   ' } }] })) as unknown as typeof fetch;
    await assert.rejects(() => chat({ ...CFG, maxRetries: 0 }, { system: 's', user: 'u' }, { fetchImpl: empty }), /空内容/);
    const notJson = (async () => ({ ok: true, status: 200, text: async () => 'not json' })) as unknown as typeof fetch;
    await assert.rejects(() => chat({ ...CFG, maxRetries: 0 }, { system: 's', user: 'u' }, { fetchImpl: notJson }), /不是 JSON/);
    const net = (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch;
    await assert.rejects(() => chat({ ...CFG, maxRetries: 1 }, { system: 's', user: 'u' }, { fetchImpl: net, sleep: async () => { } }), (e: unknown) => {
        assert.equal((e as AIError).info.code, 'network');
        return true;
    });
});
