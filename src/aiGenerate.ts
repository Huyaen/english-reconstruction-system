// —— Phase 6：生成编排（Prompt → Provider → JSON → 校验 → 质量门 → 有界重试）——
// 关键纪律：
// * 校验失败不落库，只允许“有限次”修正重试（默认 ≤ 3 次，绝不无限循环）。
// * AI 生成的句法结构一律 ai_unverified：可用于有提示的探索，不用于自动语法评分。
// * 生成成功 ≠ 用户掌握：这里只产出材料与元数据，不写任何掌握。
import { AIError, chat, classifyThrown, privacySummary, type AIErrorInfo, type AIProviderConfig, type AIUsage } from './aiProvider.ts';
import { parseModelJson } from './aiJson.ts';
import { checkReadingQuality, checkSentenceQuality, summarize, type DifficultyBand, type QualityReport } from './aiQuality.ts';
import { validateReading, validateSentence, type ReadingTarget, type SentenceTarget } from './aiValidate.ts';
import { fence, fnv1a } from './prompts/registry.ts';
import { SENTENCE_PROMPT, type SentencePromptInput } from './prompts/sentence.ts';
import { READING_PROMPT, type ReadingPromptInput } from './prompts/reading.ts';
export interface GenMeta {
    promptId: string;
    promptVersion: string;
    promptHash: string;
    providerHost: string;
    model: string;
    structuredMode: string;
    attempts: number;
    usage: AIUsage;
    generatedAt: number;
    contentHash: string;
    privacy: string;
}
export type GenResult<T> = {
    ok: true;
    value: T;
    meta: GenMeta;
    quality: QualityReport;
} | {
    ok: false;
    error: AIErrorInfo;
    attempts: number;
    issues: string[];
    partial?: unknown;
};
export interface GenerateDeps {
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    knownMode?: 'json_schema' | 'json_object' | 'text';
}
const MAX_ATTEMPTS = 3;
function metaOf(cfg: AIProviderConfig, usage: AIUsage, mode: string, attempts: number, now: number, hash: string, promptId: string, version: string, promptHash: string, privacy: string): GenMeta {
    return {
        promptId, promptVersion: version, promptHash,
        providerHost: hostOf(cfg.endpoint), model: cfg.model, structuredMode: mode,
        attempts, usage, generatedAt: now, contentHash: hash, privacy,
    };
}
function hostOf(endpoint: string): string {
    try {
        return new URL(endpoint).host;
    }
    catch {
        return 'unknown';
    }
}
function repairSuffix(issues: string[]): string {
    return `上一份输出没有通过本系统的契约校验，问题如下：
${issues.slice(0, 10).map((x, i) => `${i + 1}. ${x}`).join('\n')}

请只输出修正后的 JSON 对象：不要解释、不要代码围栏、不要新增字段；所有约束必须满足。`;
}
// 句子：一次生成 = 最多 3 次“生成→校验→修正”
export async function generateSentence(input: SentencePromptInput & {
    maxUnknownWords: number;
    desired: DifficultyBand;
    unknownWords: string[];
    existingHashes: Set<string>;
}, cfg: AIProviderConfig, deps: GenerateDeps = {}, signal?: AbortSignal): Promise<GenResult<SentenceTarget>> {
    const now = deps.now ?? (() => Date.now());
    const built = SENTENCE_PROMPT.build(input);
    const promptHash = SENTENCE_PROMPT.fingerprint();
    const privacy = privacySummary({ targetWords: input.targetWords, grammarTargets: input.targetGrammar.map(g => g.id), excerptChars: 0, hasNotes: !!input.theme });
    let usage: AIUsage = { promptTokens: 0, completionTokens: 0, estimated: false };
    let lastIssues: string[] = [];
    let lastError: AIErrorInfo | null = null;
    let lastRaw: unknown = undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
            const res = await chat(cfg, {
                system: built.system,
                user: attempt === 1 ? built.user : `${built.user}\n\n${repairSuffix(lastIssues)}`,
                jsonSchema: SENTENCE_PROMPT.outputSchema,
                schemaName: SENTENCE_PROMPT.schemaName,
            }, { ...deps, knownMode: deps.knownMode }, signal);
            usage = {
                promptTokens: usage.promptTokens + res.usage.promptTokens,
                completionTokens: usage.completionTokens + res.usage.completionTokens,
                estimated: usage.estimated || res.usage.estimated,
            };
            const parsed = parseModelJson(res.text);
            lastRaw = parsed.value;
            if (!parsed.ok) {
                lastIssues = [parsed.error ?? '输出不是 JSON'];
                continue;
            }
            const checked = validateSentence(parsed.value, {
                allowedWords: input.targetWords,
                grammarConceptIds: input.targetGrammar.map(g => g.id),
                minWords: input.minWords,
                maxWords: input.maxWords,
            });
            if (!checked.value) {
                lastIssues = checked.issues.map(i => `${i.path}: ${i.message}`);
                continue;
            }
            const hash = fnv1a(`${checked.value.sentence.trim().toLowerCase()}`);
            const quality = checkSentenceQuality(checked.value, {
                minWords: input.minWords,
                maxWords: input.maxWords,
                allowedWords: input.targetWords,
                grammarIds: input.targetGrammar.map(g => g.id),
                desired: input.desired,
                existingHashes: input.existingHashes,
                contentHash: hash,
                unknownWords: unknownOf(checked.value.sentence, input.targetWords, input.unknownWords),
                maxUnknownWords: input.maxUnknownWords,
            });
            if (!quality.ok) {
                lastIssues = quality.checks.filter(c => !c.ok).map(c => `${c.label}：${c.detail}`);
                continue;
            }
            return {
                ok: true,
                value: checked.value,
                quality,
                meta: metaOf(cfg, usage, res.mode, attempt, now(), hash, SENTENCE_PROMPT.promptId, SENTENCE_PROMPT.version, promptHash, privacy),
            };
        }
        catch (e) {
            lastError = e instanceof AIError ? e.info : classifyThrown(e);
            // 不可重试的失败（鉴权/参数/取消）直接返回；限流已在传输层退避重试过，
            // 再整轮重试只会成倍扣费，所以也直接结束。
            if (!lastError.retryable || signal?.aborted || lastError.code === 'rate-limit')
                return { ok: false, error: lastError, attempts: attempt, issues: lastIssues, partial: lastRaw };
        }
    }
    return {
        ok: false,
        error: lastError ?? { code: 'invalid-response', message: '生成结果未通过校验。', hint: '可重试；若持续失败，说明当前模型不适合这项生成。', retryable: true, status: null },
        attempts: MAX_ATTEMPTS,
        issues: lastIssues,
        partial: lastRaw,
    };
}
function unknownOf(text: string, targets: string[], unknownPool: string[]): string[] {
    const lower = text.toLowerCase();
    const pool = new Set(unknownPool.map(w => w.toLowerCase()).filter(w => !targets.some(t => t.toLowerCase() === w)));
    const hits = [...pool].filter(w => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i').test(lower));
    // 目标词之外、词库没有的词由调用方提供 unknownPool（不可凭空判断），这里只做交集统计
    return hits;
}
// 阅读强化：同样有界重试；题目证据必须逐字来自正文
export async function generateReading(input: ReadingPromptInput & {
    maxUnknownWords: number;
    desired: DifficultyBand;
    unknownWords: string[];
    existingHashes: Set<string>;
    minWords: number;
    maxWords: number;
    minExercises: number;
    maxExercises: number;
    grammarIds: string[];
}, cfg: AIProviderConfig, deps: GenerateDeps = {}, signal?: AbortSignal): Promise<GenResult<ReadingTarget>> {
    const now = deps.now ?? (() => Date.now());
    const built = READING_PROMPT.build(input);
    const promptHash = READING_PROMPT.fingerprint();
    const privacy = privacySummary({ targetWords: input.targetWords, grammarTargets: input.grammarIds, excerptChars: input.sourceExcerpt.length, hasNotes: !!input.topic });
    let usage: AIUsage = { promptTokens: 0, completionTokens: 0, estimated: false };
    let lastIssues: string[] = [];
    let lastError: AIErrorInfo | null = null;
    let lastRaw: unknown = undefined;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        try {
            const res = await chat(cfg, {
                system: built.system,
                user: attempt === 1 ? built.user : `${built.user}\n\n${repairSuffix(lastIssues)}`,
                jsonSchema: READING_PROMPT.outputSchema,
                schemaName: READING_PROMPT.schemaName,
            }, { ...deps, knownMode: deps.knownMode }, signal);
            usage = {
                promptTokens: usage.promptTokens + res.usage.promptTokens,
                completionTokens: usage.completionTokens + res.usage.completionTokens,
                estimated: usage.estimated || res.usage.estimated,
            };
            const parsed = parseModelJson(res.text);
            lastRaw = parsed.value;
            if (!parsed.ok) {
                lastIssues = [parsed.error ?? '输出不是 JSON'];
                continue;
            }
            const checked = validateReading(parsed.value, {
                allowedGrammar: input.grammarIds,
                minWords: input.minWords,
                maxWords: input.maxWords,
                minExercises: input.minExercises,
                maxExercises: input.maxExercises,
            });
            if (!checked.value) {
                lastIssues = checked.issues.map(i => `${i.path}: ${i.message}`);
                continue;
            }
            const hash = fnv1a(`${checked.value.passage.trim().toLowerCase()}`);
            const quality = checkReadingQuality(checked.value, {
                minWords: input.minWords,
                maxWords: input.maxWords,
                grammarIds: input.grammarIds,
                desired: input.desired,
                existingHashes: input.existingHashes,
                contentHash: hash,
                unknownWords: unknownOf(checked.value.passage, input.targetWords, input.unknownWords),
                maxUnknownWords: input.maxUnknownWords,
            });
            if (!quality.ok) {
                lastIssues = [`质量问题：${summarize(quality)}`];
                continue;
            }
            return {
                ok: true,
                value: checked.value,
                quality,
                meta: metaOf(cfg, usage, res.mode, attempt, now(), hash, READING_PROMPT.promptId, READING_PROMPT.version, promptHash, privacy),
            };
        }
        catch (e) {
            lastError = e instanceof AIError ? e.info : classifyThrown(e);
            if (!lastError.retryable || signal?.aborted)
                return { ok: false, error: lastError, attempts: attempt, issues: lastIssues, partial: lastRaw };
        }
    }
    return {
        ok: false,
        error: lastError ?? { code: 'invalid-response', message: '生成结果未通过校验。', hint: '可重试；若持续失败，说明当前模型不适合这项生成。', retryable: true, status: null },
        attempts: MAX_ATTEMPTS,
        issues: lastIssues,
        partial: lastRaw,
    };
}
// 供 UI 展示“这条结果绝不会提升掌握”的说明
export const EVIDENCE_NOTE = 'AI 只负责出句子，不会让你“自动学会”：只有你自己独立答对，掌握度才会变。';
export function fenceForDisplay(text: string): string {
    return fence('ai_output', text);
}
