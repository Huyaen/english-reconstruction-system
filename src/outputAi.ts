// —— Phase 9：AI 诊断编排（复用 Phase 6 传输层与质量门）——
// 不新建 SDK、不无限重试；校验失败只做有限次修正重试；失败时原文仍在。
import { AIError, chat, classifyThrown, privacySummary, type AIErrorInfo, type AIProviderConfig, type AIUsage } from './aiProvider.ts';
import { parseModelJson } from './aiJson.ts';
import { fence, fnv1a } from './prompts/registry.ts';
import { OUTPUT_DIAGNOSE_PROMPT, OUTPUT_PROMPT_VERSION, type OutputPromptInput } from './prompts/output.ts';
import { qualityGate, validateOutputFeedback, type FeedbackContext } from './outputFeedback.ts';
import { localChecks } from './outputDiagnosis.ts';
import type { GenMeta } from './aiGenerate.ts';
import type { OutputFeedback } from './types.ts';

export type OutputGenResult =
    | { ok: true; feedback: OutputFeedback; meta: GenMeta; warnings: string[] }
    | { ok: false; error: AIErrorInfo; attempts: number; issues: string[]; localSpans: ReturnType<typeof localChecks>['spans'] };

const MAX_ATTEMPTS = 3;

function hostOf(endpoint: string): string {
    try {
        return new URL(endpoint).host;
    }
    catch {
        return 'unknown';
    }
}

function repairSuffix(issues: string[]): string {
    return `上一份输出没有通过契约校验，问题如下：\n${issues.slice(0, 8).map((x, i) => `${i + 1}. ${x}`).join('\n')}\n\n只输出修正后的 JSON 对象；不要解释；所有 original 必须逐字来自学习者的 TEXT，start/end 必须精确对应。`;
}

export interface DiagnoseInput extends OutputPromptInput {
    spec: FeedbackContext['spec'];
    /** 允许引用的语法概念 id（来自 Phase 4 图谱） */
    grammarConceptIds: string[];
    /** 目标词白名单 */
    targetWordIds: string[];
}

export async function diagnoseOutput(input: DiagnoseInput, cfg: AIProviderConfig, deps: { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; now?: () => number; knownMode?: 'json_schema' | 'json_object' | 'text' } = {}, signal?: AbortSignal): Promise<OutputGenResult> {
    const now = deps.now ?? (() => Date.now());
    const local = localChecks(input.text, input.spec);
    const ctx: FeedbackContext = {
        text: input.text,
        spec: input.spec,
        scope: input.scope,
        sourceProvenance: input.materialExcerpt ? 'user_text+material_excerpt' : 'user_text',
        promptVersion: OUTPUT_PROMPT_VERSION,
        grammarConceptIds: input.grammarConceptIds,
        targetWords: input.targetWordIds,
    };
    const built = OUTPUT_DIAGNOSE_PROMPT.build(input);
    const promptHash = OUTPUT_DIAGNOSE_PROMPT.fingerprint();
    const privacy = privacySummary({ targetWords: input.targetWords, grammarTargets: input.targetGrammar, excerptChars: input.materialExcerpt.length, hasNotes: false });
    let usage: AIUsage = { promptTokens: 0, completionTokens: 0, estimated: false };
    let attempts = 0;
    let lastIssues: string[] = [];
    let lastError: AIErrorInfo | null = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        attempts = attempt;
        try {
            const res = await chat(cfg, {
                system: built.system,
                user: attempt === 1 ? built.user : `${built.user}\n\n${repairSuffix(lastIssues)}`,
                jsonSchema: OUTPUT_DIAGNOSE_PROMPT.outputSchema,
                schemaName: OUTPUT_DIAGNOSE_PROMPT.schemaName,
            }, { ...deps, knownMode: deps.knownMode }, signal);
            usage = {
                promptTokens: usage.promptTokens + res.usage.promptTokens,
                completionTokens: usage.completionTokens + res.usage.completionTokens,
                estimated: usage.estimated || res.usage.estimated,
            };
            const parsed = parseModelJson(res.text);
            if (!parsed.ok) {
                lastIssues = [parsed.error ?? '输出不是 JSON'];
                continue;
            }
            const checked = validateOutputFeedback(parsed.value, { ...ctx, sourceProvenance: ctx.sourceProvenance });
            if (!checked.ok) {
                lastIssues = checked.issues;
                continue;
            }
            const gate = qualityGate(checked.value, ctx);
            if (!gate.ok) {
                lastIssues = gate.issues;
                continue;
            }
            const meta: GenMeta = {
                promptId: OUTPUT_DIAGNOSE_PROMPT.promptId,
                promptVersion: OUTPUT_DIAGNOSE_PROMPT.version,
                promptHash,
                providerHost: hostOf(cfg.endpoint),
                model: cfg.model,
                structuredMode: deps.knownMode ?? 'auto',
                attempts,
                usage,
                generatedAt: now(),
                contentHash: fnv1a(`${input.text.trim().toLowerCase()}|${OUTPUT_PROMPT_VERSION}`),
                privacy,
            };
            return { ok: true, feedback: checked.value, meta, warnings: [...checked.warnings, ...gate.warnings, ...local.notes] };
        }
        catch (err) {
            const info = err instanceof AIError ? err.info : classifyThrown(err);
            lastError = info;
            // 只有"输出不可用/格式不支持"才值得重试；鉴权/限流直接结束，避免重复扣费
            if (info.code !== 'invalid-response' && info.code !== 'unsupported-mode') {
                return { ok: false, error: info, attempts, issues: [info.message], localSpans: local.spans };
            }
        }
    }
    return {
        ok: false,
        error: lastError ?? { code: 'invalid-response' as const, message: '反馈格式反复不符合契约', hint: '换一个模型或稍后重试；原文已保存。', retryable: false, status: null },
        attempts,
        issues: lastIssues.length ? lastIssues : ['反馈未通过校验'],
        localSpans: local.spans,
    };
}

/** 材料摘要只允许来自真实 transcript / passage；没有就返回空串（不编造内容） */
export function materialExcerptOf(input: { transcriptText?: string; passageText?: string; reflectionSummary?: string; limit?: number }): string {
    const raw = input.transcriptText || input.passageText || '';
    if (!raw)
        return '';
    return fence('material', raw.slice(0, input.limit ?? 1200));
}
