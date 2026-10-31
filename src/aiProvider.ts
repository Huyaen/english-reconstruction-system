// —— Phase 6：AI Provider 传输层（OpenAI-compatible Chat Completions）——
// 纪律：
// 1. 所有 AI 请求都经过这里；模块不得自己 fetch Provider。
// 2. 能力不假设：JSON Schema → JSON Mode → 纯文本，逐级真实降级并记住结果。
// 3. 有界重试：只对 429/5xx/超时/网络错误；鉴权与参数错误立即失败，绝不无限重试。
// 4. Key 不写入日志、不写入错误消息、不进入 prompt。
import type { AISettings } from './types.ts';
export type StructuredMode = 'auto' | 'json_schema' | 'json_object' | 'text';
export type AIFailureCode = 'missing-key' | 'missing-model' | 'invalid-endpoint' | 'auth' | 'model-not-found' | 'rate-limit' | 'server' | 'timeout' | 'network' | 'cors' | 'aborted' | 'invalid-response' | 'unsupported-mode' | 'budget-exceeded';
export interface AIErrorInfo {
    code: AIFailureCode;
    message: string;
    hint: string;
    retryable: boolean;
    status: number | null;
}
export class AIError extends Error {
    info: AIErrorInfo;
    constructor(info: AIErrorInfo) {
        super(info.message);
        this.name = 'AIError';
        this.info = info;
    }
}
export interface AIProviderConfig {
    endpoint: string;
    model: string;
    key: string;
    structuredMode: StructuredMode;
    timeoutMs: number;
    maxRetries: number;
    maxOutputTokens: number;
    temperature: number;
    concurrency: number;
    dailyTokenBudget: number | null;
}
export interface AIUsage {
    promptTokens: number;
    completionTokens: number;
    estimated: boolean;
}
export interface ChatResult {
    text: string;
    usage: AIUsage;
    mode: Exclude<StructuredMode, 'auto'>;
    model: string;
    /** Provider 明确拒绝过的模式（用于降级记忆，不落任何 text） */
    downgradedFrom?: Exclude<StructuredMode, 'auto'>;
}
export interface ChatRequest {
    system: string;
    user: string;
    /** 期望的结构化模式（auto 由传输层逐级降级） */
    jsonSchema?: Record<string, unknown>;
    schemaName?: string;
    maxOutputTokens?: number;
}
const HINTS: Record<AIFailureCode, string> = {
    'missing-key': '还没有填密钥：在设置里填入服务商给的密钥（只保存在本机，不会进日志或备份）。',
    'missing-model': '还没有填模型名：在设置里填服务商给的模型名称。',
    'invalid-endpoint': '服务地址不是有效的 http(s) 地址：填到 /v1 这一层即可（不要带 /chat/completions）。',
    auth: '鉴权失败：检查密钥是否正确、是否过期，或这个密钥有没有该模型的权限。',
    'model-not-found': '服务商找不到这个模型：确认模型名拼写与账号可用的模型列表。',
    'rate-limit': '服务商限流（429）：稍后重试，或缩短一次生成的长度。',
    server: '服务商那边出错（5xx）：这是对方的问题，稍后再试。',
    timeout: '请求超时：网络慢或模型太慢；可以调大超时或换更快的模型。',
    network: '连不上服务商：检查网络、代理与服务地址。',
    cors: '浏览器被跨域限制拦住了（CORS）：这个服务商不允许浏览器直连；换一个允许直连的地址，或用本地代理。',
    aborted: '已取消本次生成。',
    'invalid-response': '服务商返回的内容不是预期的 JSON：已拒绝写入，可重试或换个模型。',
    'unsupported-mode': '该模型不支持任何可用的结构化输出方式：请换用支持 JSON 输出的模型。',
    'budget-exceeded': '已达到你设置的每日预算上限：今天不再自动生成（可调高上限或明天再用）。',
};
export function normalizeAIConfig(s: AISettings | undefined | null): AIProviderConfig {
    const d = s ?? ({} as AISettings);
    return {
        endpoint: String(d.endpoint ?? '').trim(),
        model: String(d.model ?? '').trim(),
        key: String(d.key ?? '').trim(),
        structuredMode: (d.structuredMode ?? 'auto'),
        timeoutMs: Number.isFinite(d.timeoutMs) ? Math.max(3000, Math.min(180000, Number(d.timeoutMs))) : 45000,
        maxRetries: Number.isFinite(d.maxRetries) ? Math.max(0, Math.min(3, Math.floor(Number(d.maxRetries)))) : 2,
        maxOutputTokens: Number.isFinite(d.maxOutputTokens) ? Math.max(64, Math.min(8000, Math.floor(Number(d.maxOutputTokens)))) : 1200,
        temperature: Number.isFinite(d.temperature) ? Math.max(0, Math.min(1.5, Number(d.temperature))) : 0.7,
        concurrency: Number.isFinite(d.concurrency) ? Math.max(1, Math.min(2, Math.floor(Number(d.concurrency)))) : 1,
        dailyTokenBudget: Number.isFinite(d.dailyTokenBudget) ? Math.max(0, Number(d.dailyTokenBudget)) : null,
    };
}
// 只接受 http(s)，且不接受把 key 塞进 URL 的地址（避免 key 进日志/历史）
export function endpointIssue(endpoint: string): string | null {
    if (!endpoint)
        return 'missing';
    let url: URL;
    try {
        url = new URL(endpoint);
    }
    catch {
        return 'url';
    }
    if (!['http:', 'https:'].includes(url.protocol))
        return 'protocol';
    if (url.username || url.password)
        return 'credentials';
    return null;
}
export function validateAIConfig(cfg: AIProviderConfig): AIErrorInfo | null {
    const issue = endpointIssue(cfg.endpoint);
    if (issue)
        return { code: 'invalid-endpoint', message: issue === 'missing' ? '还没有设置 AI 服务地址。' : 'AI 服务地址无效。', hint: HINTS['invalid-endpoint'], retryable: false, status: null };
    if (!cfg.model.trim())
        return { code: 'missing-model', message: '还没有配置模型名。', hint: HINTS['missing-model'], retryable: false, status: null };
    if (!cfg.key.trim())
        return { code: 'missing-key', message: '还没有填密钥。', hint: HINTS['missing-key'], retryable: false, status: null };
    return null;
}
export function isConfigured(s: AISettings | undefined | null): boolean {
    return validateAIConfig(normalizeAIConfig(s)) === null;
}
export function chatURL(endpoint: string): string {
    const base = endpoint.replace(/\/+$/, '');
    if (/\/chat\/completions$/i.test(base))
        return base;
    return `${base}/chat/completions`;
}
export function providerHost(endpoint: string): string {
    try {
        return new URL(endpoint).host;
    }
    catch {
        return 'unknown';
    }
}
// HTTP 状态 → 可读失败；429 单独处理 Retry-After
export function classifyStatus(status: number, body: string): AIErrorInfo {
    const snippet = body.replace(/\s+/g, ' ').slice(0, 200);
    if (status === 401 || status === 403)
        return { code: 'auth', message: `鉴权失败（HTTP ${status}）。`, hint: HINTS.auth, retryable: false, status };
    if (status === 404)
        return { code: 'model-not-found', message: `服务商找不到模型或接口（HTTP 404）。`, hint: HINTS['model-not-found'], retryable: false, status };
    if (status === 429)
        return { code: 'rate-limit', message: '服务商限流（HTTP 429）。', hint: HINTS['rate-limit'], retryable: true, status };
    if (status >= 500)
        return { code: 'server', message: `服务商那边出错（HTTP ${status}）。`, hint: HINTS.server, retryable: true, status };
    // 400/422 里如果明说 response_format / json，就是“该模型不支持这种结构化方式”，交给降级逻辑处理
    if (/response_format|json_schema|json mode|structured/i.test(snippet))
        return { code: 'unsupported-mode', message: `该模型不接受这种结构化输出方式（HTTP ${status}）。`, hint: HINTS['unsupported-mode'], retryable: false, status };
    return { code: 'invalid-response', message: `请求被服务商拒绝（HTTP ${status}）：${snippet}`, hint: HINTS['invalid-response'], retryable: false, status };
}
export function classifyThrown(err: unknown): AIErrorInfo {
    if (err instanceof AIError)
        return err.info;
    const e = err as {
        name?: string;
        message?: string;
    } | null;
    const msg = String(e?.message ?? err ?? '');
    if (e?.name === 'AbortError' || /aborted/i.test(msg))
        return { code: 'aborted', message: '已取消本次生成。', hint: HINTS.aborted, retryable: false, status: null };
    if (/timeout|timed out/i.test(msg))
        return { code: 'timeout', message: '请求超时。', hint: HINTS.timeout, retryable: true, status: null };
    if (/failed to fetch|networkerror|load failed|net::err/i.test(msg))
        return { code: 'network', message: '连不上服务商（网络错误）。', hint: HINTS.network, retryable: true, status: null };
    if (/cors|cross-origin/i.test(msg))
        return { code: 'cors', message: '浏览器被 CORS 拦住了。', hint: HINTS.cors, retryable: false, status: null };
    return { code: 'invalid-response', message: `AI 请求失败：${msg.slice(0, 140)}`, hint: HINTS['invalid-response'], retryable: false, status: null };
}
export interface ChatDeps {
    fetchImpl?: typeof fetch;
    /** 已确认可用的结构化模式（由调用方持久化，避免每次重新降级） */
    knownMode?: Exclude<StructuredMode, 'auto'>;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
}
function modeOrder(cfg: AIProviderConfig, known?: Exclude<StructuredMode, 'auto'>): Array<Exclude<StructuredMode, 'auto'>> {
    if (cfg.structuredMode !== 'auto')
        return [cfg.structuredMode];
    if (known)
        return [known, ...(['json_object', 'text'] as const).filter(m => m !== known)];
    if (cfg.structuredMode === 'auto')
        return ['json_object', 'json_schema', 'text'];
    return ['text'];
}
function bodyFor(cfg: AIProviderConfig, req: ChatRequest, mode: Exclude<StructuredMode, 'auto'>): Record<string, unknown> {
    const body: Record<string, unknown> = {
        model: cfg.model,
        temperature: cfg.temperature,
        max_tokens: Math.min(cfg.maxOutputTokens, req.maxOutputTokens ?? cfg.maxOutputTokens),
        messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.user },
        ],
    };
    if (mode === 'json_schema' && req.jsonSchema)
        body.response_format = {
            type: 'json_schema',
            json_schema: { name: req.schemaName ?? 'result', strict: true, schema: req.jsonSchema },
        };
    else if (mode === 'json_object')
        body.response_format = { type: 'json_object' };
    return body;
}
function estimateTokens(text: string): number {
    return Math.max(1, Math.ceil(text.length / 4));
}
export function readUsage(raw: unknown, promptText: string, completionText: string): AIUsage {
    const u = (raw as {
        usage?: {
            prompt_tokens?: number;
            completion_tokens?: number;
        };
    } | null)?.usage;
    const p = Number(u?.prompt_tokens);
    const c = Number(u?.completion_tokens);
    if (Number.isFinite(p) && Number.isFinite(c) && p >= 0 && c >= 0)
        return { promptTokens: p, completionTokens: c, estimated: false };
    return { promptTokens: estimateTokens(promptText), completionTokens: estimateTokens(completionText), estimated: true };
}
// 单次尝试（不重试）
async function attempt(cfg: AIProviderConfig, req: ChatRequest, mode: Exclude<StructuredMode, 'auto'>, deps: ChatDeps, signal?: AbortSignal): Promise<ChatResult> {
    const fetchImpl = deps.fetchImpl ?? fetch;
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctrl.abort(new DOMException('timeout', 'AbortError')); }, cfg.timeoutMs);
    try {
        const res = await fetchImpl(chatURL(cfg.endpoint), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
            body: JSON.stringify(bodyFor(cfg, req, mode)),
            signal: ctrl.signal,
        });
        const text = await res.text();
        if (!res.ok)
            throw new AIError(classifyStatus(res.status, text));
        let raw: unknown;
        try {
            raw = JSON.parse(text);
        }
        catch {
            throw new AIError({ code: 'invalid-response', message: '服务商返回的不是 JSON。', hint: HINTS['invalid-response'], retryable: false, status: res.status });
        }
        const choice = (raw as {
            choices?: Array<{
                message?: {
                    content?: unknown;
                };
                finish_reason?: string;
            }>;
        })?.choices?.[0];
        const content = typeof choice?.message?.content === 'string'
            ? choice.message.content
            : Array.isArray(choice?.message?.content)
                ? (choice.message.content as Array<{
                    text?: string;
                }>).map(x => x?.text ?? '').join('')
                : '';
        if (!content.trim())
            throw new AIError({ code: 'invalid-response', message: '服务商返回了空内容。', hint: HINTS['invalid-response'], retryable: true, status: res.status });
        return {
            text: content,
            usage: readUsage(raw, req.system + req.user, content),
            mode,
            model: String((raw as {
                model?: string;
            })?.model ?? cfg.model),
        };
    }
    catch (e) {
        // 自己触发的超时要与“用户取消”区分：超时可重试，取消不可
        if (timedOut)
            throw new AIError({ code: 'timeout', message: '请求超时。', hint: HINTS.timeout, retryable: true, status: null });
        throw e;
    }
    finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
    }
}
// 带降级与有界重试的主入口
export async function chat(cfg: AIProviderConfig, req: ChatRequest, deps: ChatDeps = {}, signal?: AbortSignal): Promise<ChatResult> {
    const bad = validateAIConfig(cfg);
    if (bad)
        throw new AIError(bad);
    const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
    const modes = modeOrder(cfg, deps.knownMode);
    let last: AIErrorInfo | null = null;
    for (let mi = 0; mi < modes.length; mi += 1) {
        const mode = modes[mi];
        for (let retry = 0; retry <= cfg.maxRetries; retry += 1) {
            try {
                const r = await attempt(cfg, req, mode, deps, signal);
                return mi > 0 ? { ...r, downgradedFrom: modes[0] } : r;
            }
            catch (e) {
                const info = classifyThrown(e);
                last = info;
                if (signal?.aborted)
                    throw new AIError({ ...info, code: 'aborted', message: '已取消本次生成。' });
                // 模式不被接受 → 换下一种方式（不消耗重试次数）
                if (info.code === 'unsupported-mode') {
                    if (cfg.structuredMode !== 'auto')
                        throw new AIError(info);
                    break;
                }
                if (!info.retryable)
                    throw new AIError(info);
                if (retry === cfg.maxRetries)
                    break;
                const backoff = Math.min(2000, 250 * 2 ** retry) + Math.floor(Math.random() * 120);
                await sleep(info.code === 'rate-limit' ? Math.min(4000, backoff * 2) : backoff);
            }
        }
        // 只有“该模型不支持这种结构化方式”才值得换下一种；其余错误（鉴权/限流/超时）
        // 换模式只会重复打 Provider，直接结束。
        if (last?.code !== 'unsupported-mode' || cfg.structuredMode !== 'auto')
            break;
    }
    throw new AIError(last ?? { code: 'invalid-response', message: '生成失败。', hint: HINTS['invalid-response'], retryable: false, status: null });
}
// 隐私最小化：只描述“将要发送什么”，不含任何私密正文
export function privacySummary(what: {
    targetWords: string[];
    grammarTargets: string[];
    excerptChars: number;
    hasNotes: boolean;
}): string {
    const parts = [`目标词 ${what.targetWords.length} 个`, `语法点 ${what.grammarTargets.length} 个`];
    if (what.excerptChars > 0)
        parts.push(`你选中的文章片段约 ${what.excerptChars} 字符`);
    if (what.hasNotes)
        parts.push('你手动填写的主题/备注');
    return `本次请求只会发送：${parts.join('、')}。不会发送完整词库、学习历史、笔记或备份。`;
}
