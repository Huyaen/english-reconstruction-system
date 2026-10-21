// —— Phase 9：Output 应用层编排 ——
// 所有写入都走 outputStore（单事务 + revision 校验）；AI 只走 Phase 6 传输层。
import type { AIProviderConfig } from './aiProvider.ts';
import type { AIGeneration, Data, OutputAttempt, OutputFeedback, OutputRepairRecord, OutputSupportLevel, OutputSupportRecord, OutputTaskSpec } from './types.ts';
import { normalizeAIConfig, isConfigured } from './aiProvider.ts';
import { buildGeneration, findReusable } from './aiStore.ts';
import { putItems } from './db.ts';
import { createAttemptRecord, updateAttempt } from './outputStore.ts';
import { classifyIndependence, type IndependenceClass } from './outputScaffolding.ts';
import { classifyRevision } from './outputRevision.ts';
import { localChecks } from './outputDiagnosis.ts';
import { buildUnavailableFeedback, type FeedbackContext } from './outputFeedback.ts';
import { diagnoseOutput, materialExcerptOf } from './outputAi.ts';
import { OUTPUT_PROMPT_VERSION } from './prompts/output.ts';
import { extractProductiveEvidence, applyEvidenceScores, mergeEvidence } from './outputEvidence.ts';
import { countWords } from './outputTask.ts';
export type ActionResult<T> = {
    ok: true;
    value: T;
} | {
    ok: false;
    message: string;
};
export interface CreateOutputInput {
    task: OutputTaskSpec;
    readingSessionId?: string | null;
    inputSessionId?: string | null;
    miniUnitId?: string | null;
    dailyPlanTaskId?: string | null;
    sourceProvenance?: string;
    initialDraft?: string;
    transferOf?: string | null;
    delayedOf?: string | null;
    now?: number;
}
export async function createOutputAttempt(input: CreateOutputInput): Promise<ActionResult<OutputAttempt>> {
    const now = input.now ?? Date.now();
    const text = String(input.initialDraft ?? '');
    const attempt: OutputAttempt = {
        id: `out_${now.toString(36)}_${hash(input.task.id + now.toString(36))}`,
        prompt: input.task.communicationGoal,
        sourceType: input.task.sourceType,
        sourceId: input.task.sourceId,
        originalText: text,
        meaningEvidence: null,
        grammarEvidence: null,
        vocabularyEvidence: null,
        coherenceEvidence: null,
        repairAbility: null,
        corrections: [],
        upgradeSuggestion: '',
        wordCount: countWords(text),
        aiEval: null,
        createdAt: now,
        taskType: input.task.taskType,
        task: input.task,
        inputSessionId: input.inputSessionId ?? null,
        readingSessionId: input.readingSessionId ?? null,
        miniUnitId: input.miniUnitId ?? null,
        dailyPlanTaskId: input.dailyPlanTaskId ?? null,
        draftText: text,
        revisionText: '',
        finalText: '',
        feedbackStatus: 'none',
        feedbackSource: 'none',
        meaningBasis: 'unknown',
        sourceProvenance: input.sourceProvenance ?? 'user_text',
        supportLevel: 0,
        hintsUsed: [],
        targetWords: input.task.targetWords,
        targetGrammar: input.task.targetGrammar,
        productiveEvidence: [],
        transferOf: input.transferOf ?? null,
        delayedOf: input.delayedOf ?? null,
        revisions: [],
        status: 'draft',
        meaningPreserved: null,
        repair: null,
        updatedAt: now,
        revision: 0,
    };
    await createAttemptRecord(attempt);
    return { ok: true, value: attempt };
}
export async function saveDraft(id: string, expectedRevision: number | undefined, text: string): Promise<ActionResult<OutputAttempt>> {
    const r = await updateAttempt(id, expectedRevision, cur => {
        if ((cur.draftText ?? '') === text)
            return null;
        return { ...cur, draftText: text, originalText: cur.originalText || text, wordCount: countWords(text), updatedAt: Date.now() };
    });
    return r.ok ? { ok: true, value: r.attempt } : { ok: false, message: r.message };
}
export async function pauseOutput(id: string, expectedRevision: number | undefined): Promise<ActionResult<OutputAttempt>> {
    const r = await updateAttempt(id, expectedRevision, cur => (cur.status === 'draft' ? { ...cur, status: 'draft', updatedAt: Date.now() } : null));
    return r.ok ? { ok: true, value: r.attempt } : { ok: false, message: r.message };
}
/** 提交：保存初稿原文；重复提交幂等（noop） */
export async function submitOutput(id: string, expectedRevision: number | undefined, text: string, opts: {
    supportLevel?: OutputSupportLevel;
    hintsUsed?: string[];
    support?: OutputSupportRecord;
} = {}): Promise<ActionResult<OutputAttempt>> {
    const clean = String(text ?? '').trim();
    if (!clean)
        return { ok: false, message: '还没有写内容。' };
    const r = await updateAttempt(id, expectedRevision, cur => {
        if (cur.status && cur.status !== 'draft' && cur.status !== 'revised')
            return null;
        return {
            ...cur,
            originalText: clean,
            draftText: clean,
            wordCount: countWords(clean),
            status: 'submitted',
            supportLevel: opts.supportLevel ?? cur.supportLevel ?? 0,
            support: opts.support ?? cur.support,
            hintsUsed: opts.hintsUsed ?? cur.hintsUsed ?? [],
            updatedAt: Date.now(),
        };
    });
    return r.ok ? { ok: true, value: r.attempt } : { ok: false, message: r.message };
}
export interface FeedbackOptions {
    cfg?: AIProviderConfig | null;
    data: Data;
    /** 材料文本（只有真实 transcript/passage 才能传；没有就空） */
    materialText?: string;
    scope?: FeedbackContext['scope'];
    grammarConceptIds?: string[];
    targetWordIds?: string[];
    level?: string;
    deps?: {
        fetchImpl?: typeof fetch;
        sleep?: (ms: number) => Promise<void>;
        now?: () => number;
        knownMode?: 'json_schema' | 'json_object' | 'text';
    };
    signal?: AbortSignal;
    now?: number;
}
export interface FeedbackOutcome {
    attempt: OutputAttempt;
    feedback: OutputFeedback;
    aiUsed: boolean;
    reused: boolean;
    message: string;
}
/** 请求反馈：同一初稿 + prompt 版本只调用一次；AI 不可用则本地确定性反馈 */
export async function requestOutputFeedback(id: string, expectedRevision: number | undefined, opts: FeedbackOptions): Promise<ActionResult<FeedbackOutcome>> {
    const now = opts.now ?? Date.now();
    const cfg = opts.cfg ?? normalizeAIConfig(opts.data.settings.ai);
    const current = opts.data.outputAttempts.find(a => a.id === id);
    if (!current)
        return { ok: false, message: '找不到这条表达记录。' };
    const text = current.originalText || current.draftText || '';
    if (!text.trim())
        return { ok: false, message: '先写一点内容，再请求反馈。' };
    const scope: FeedbackContext['scope'] = opts.scope ?? (opts.materialText ? 'content_unverified' : 'language_only');
    const ctx: FeedbackContext = {
        text,
        spec: current.task!,
        scope,
        sourceProvenance: opts.materialText ? 'user_text+material' : 'user_text',
        promptVersion: OUTPUT_PROMPT_VERSION,
        grammarConceptIds: opts.grammarConceptIds,
        targetWords: opts.targetWordIds,
    };
    // 1) 复用同一 attempt + 版本 + 文本的结果（刷新不重复付费）
    const key = `${id}|${OUTPUT_PROMPT_VERSION}|${hash(text)}`;
    const reusable = findReusable(opts.data.aiGenerations ?? [], 'output', key);
    if (reusable) {
        const fb = reusable.output as {
            feedback?: OutputFeedback;
            requestKey?: string;
        };
        if (fb?.feedback) {
            const saved = await updateAttempt(id, expectedRevision, cur => ({ ...cur, feedback: fb.feedback!, feedbackStatus: 'ai', feedbackSource: 'ai', aiGenerationId: reusable.id, promptVersion: OUTPUT_PROMPT_VERSION, updatedAt: now }));
            return saved.ok
                ? { ok: true, value: { attempt: saved.attempt, feedback: fb.feedback, aiUsed: true, reused: true, message: '已复用同一份初稿的反馈（未重复调用 AI）。' } }
                : { ok: false, message: saved.message };
        }
    }
    // 2) 没有 Key：明确不可用，但仍给确定性检查
    if (!isConfigured(cfg)) {
        const local = localChecks(text, ctx.spec);
        const feedback = buildUnavailableFeedback(ctx, local.spans, '没有配置 AI Provider：当前只做了本地确定性检查，不是语法诊断。原文已保存，随时可以稍后重试。');
        const saved = await updateAttempt(id, expectedRevision, cur => ({ ...cur, feedback, feedbackStatus: 'unavailable', feedbackSource: 'none', meaningBasis: 'unknown', promptVersion: 'local@0', updatedAt: now }));
        return saved.ok
            ? { ok: true, value: { attempt: saved.attempt, feedback, aiUsed: false, reused: false, message: 'AI 反馈不可用：已保留原文，并给出本地格式检查。' } }
            : { ok: false, message: saved.message };
    }
    // 3) 真 AI
    const res = await diagnoseOutput({
        text,
        taskType: ctx.spec.taskType,
        topic: ctx.spec.topic,
        communicationGoal: ctx.spec.communicationGoal,
        targetWords: ctx.spec.targetWords,
        targetGrammar: ctx.spec.targetGrammar,
        scope,
        materialExcerpt: opts.materialText ? materialExcerptOf({ passageText: opts.materialText }) : '',
        learnerLevel: opts.level ?? 'beginner',
        spec: ctx.spec,
        grammarConceptIds: opts.grammarConceptIds ?? [],
        targetWordIds: opts.targetWordIds ?? [],
    }, cfg, opts.deps ?? {}, opts.signal);
    if (!res.ok) {
        const local = localChecks(text, ctx.spec);
        const feedback = buildUnavailableFeedback(ctx, local.spans, `AI 反馈失败（${res.error.code}）：${res.error.message}。原文与你的修改都已保存，可以稍后重试。`);
        const saved = await updateAttempt(id, expectedRevision, cur => ({ ...cur, feedback, feedbackStatus: 'invalid', feedbackSource: 'none', updatedAt: now }));
        return saved.ok
            ? { ok: true, value: { attempt: saved.attempt, feedback, aiUsed: false, reused: false, message: feedback.uncertainty } }
            : { ok: false, message: saved.message };
    }
    const gen: AIGeneration = buildGeneration('output', { requestKey: key, feedback: res.feedback }, res.meta, { ok: true, notes: res.warnings }, now);
    await putItems('aiGenerations', [gen]);
    const saved = await updateAttempt(id, expectedRevision, cur => ({
        ...cur,
        feedback: res.feedback,
        feedbackStatus: 'ai',
        feedbackSource: 'ai',
        meaningBasis: res.feedback.meaningBasis,
        meaningEvidence: res.feedback.meaningAssessment === 'delivered' ? 0.7 : res.feedback.meaningAssessment === 'partly_delivered' ? 0.4 : 0.1,
        grammarEvidence: res.feedback.priorityIssues.some(s => s.type.includes('verb') || s.type === 'tense') ? 0.3 : 0.6,
        aiGenerationId: gen.id,
        promptVersion: OUTPUT_PROMPT_VERSION,
        updatedAt: now,
    }));
    if (!saved.ok)
        return { ok: false, message: saved.message };
    return { ok: true, value: { attempt: saved.attempt, feedback: res.feedback, aiUsed: true, reused: false, message: res.warnings.slice(0, 2).join('；') } };
}
export async function reviseOutput(id: string, expectedRevision: number | undefined, text: string, opts: {
    suggestion?: string | null;
    supportLevel?: OutputSupportLevel;
    now?: number;
} = {}): Promise<ActionResult<OutputAttempt>> {
    const now = opts.now ?? Date.now();
    const clean = String(text ?? '').trim();
    if (!clean)
        return { ok: false, message: '修改后的内容还是空的。' };
    let classified: {
        kind: ReturnType<typeof classifyRevision>['kind'];
        similarity: number;
    } | null = null;
    const r = await updateAttempt(id, expectedRevision, cur => {
        classified = classifyRevision(clean, { suggestion: opts.suggestion, supportLevel: opts.supportLevel ?? cur.supportLevel ?? 0 });
        return {
            ...cur,
            revisionText: clean,
            finalText: clean,
            revisions: [...(cur.revisions ?? []), { text: clean, at: now, kind: classified.kind, similarityToSuggestion: Math.round(classified.similarity * 100) / 100 }],
            status: 'revised',
            updatedAt: now,
        };
    });
    if (!r.ok)
        return { ok: false, message: r.message };
    const kind = classified ? (classified as {
        kind: string;
    }).kind : '';
    const msg = kind === 'copied' ? '已保存修改。注意：这条修改与建议高度相似，按“照抄”记录，不会产生独立掌握证据。'
        : kind === 'after_hint' ? '已保存修改（提示后完成）。' : '已保存修改。';
    return { ok: true, value: r.attempt };
}
export async function finishOutput(id: string, expectedRevision: number | undefined, data: Data): Promise<ActionResult<OutputAttempt>> {
    const now = Date.now();
    const cur = data.outputAttempts.find(a => a.id === id);
    if (!cur)
        return { ok: false, message: '找不到这条表达记录。' };
    // 幂等：重复完成只返回现状，不再前进 revision、不重复写证据
    if (cur.status === 'completed')
        return { ok: true, value: cur };
    const text = cur.finalText || cur.revisionText || cur.originalText;
    const words = (cur.targetWords ?? []).map(en => data.words.find(w => w.en.toLowerCase() === en.toLowerCase())).filter((w): w is NonNullable<typeof w> => !!w);
    const independence: IndependenceClass = classifyIndependence({
        support: cur.support ?? { highestLevel: (cur.supportLevel ?? 0) as OutputSupportLevel, requestedHints: cur.hintsUsed ?? [], hintTypes: [], independentText: cur.originalText, textAfterSupport: text },
        text,
        modelAnswer: cur.feedback?.upgrade?.suggested ?? '',
    });
    const lastKind = cur.revisions?.[cur.revisions.length - 1]?.kind;
    const copied = independence.copied || lastKind === 'copied' || lastKind === 'after_model';
    let evidence = copied || !words.length ? [] : extractProductiveEvidence({
        attemptId: id,
        text,
        words: words.map(w => ({ id: w.id, en: w.en })),
        independence,
        feedback: cur.feedback ?? null,
        now,
    });
    // 只让"独立"证据进入分数路径；assisted 仍记录，但不提升 mastery
    const independent = evidence.filter(e => e.independent && !e.copied);
    const updatedWords = words.map(w => {
        const mine = independent.filter(e => e.wordId === w.id);
        if (!mine.length)
            return null;
        const patch = applyEvidenceScores(w, mine, now);
        return { ...w, ...patch };
    }).filter((w): w is NonNullable<typeof w> => !!w);
    const saved = await updateAttempt(id, expectedRevision, c => ({
        ...c,
        status: 'completed',
        completedAt: c.completedAt ?? now,
        finalText: text,
        wordCount: countWords(text),
        productiveEvidence: mergeEvidence(c.productiveEvidence, evidence),
        repairAbility: c.repair?.meaningPreserved === true ? 0.6 : c.repairAbility,
        meaningPreserved: c.repair?.meaningPreserved ?? c.meaningPreserved ?? null,
        updatedAt: now,
    }));
    if (!saved.ok)
        return { ok: false, message: saved.message };
    if (updatedWords.length)
        await putItems('words', updatedWords);
    // 反向关联：InputSession → OutputAttempt
    if (cur.inputSessionId) {
        const session = data.inputSessions.find(s => s.id === cur.inputSessionId);
        if (session && session.outputAttemptId !== id)
            await putItems('inputSessions', [{ ...session, outputAttemptId: id }]);
    }
    return { ok: true, value: saved.attempt };
}
/** 记录一次 Communication Repair（用户在提交时说明"我本来想说 X"） */
export async function attachRepair(id: string, expectedRevision: number | undefined, repair: OutputRepairRecord): Promise<ActionResult<OutputAttempt>> {
    const r = await updateAttempt(id, expectedRevision, cur => ({ ...cur, repair, meaningPreserved: repair.meaningPreserved, repairAbility: repair.meaningPreserved === true ? 0.6 : repair.meaningPreserved === false ? 0.2 : null, updatedAt: repair.at }));
    return r.ok ? { ok: true, value: r.attempt } : { ok: false, message: r.message };
}
/** 从 InputSession 的标准英文总结直接进入 Output（不要求用户重新输入） */
export function handoutFromInput(data: Data, sessionId: string, now = Date.now()): ActionResult<{
    text: string;
    task: OutputTaskSpec;
    meta: {
        topic: string;
        sourceLabel: string;
    };
}> {
    const s = data.inputSessions.find(x => x.id === sessionId);
    if (!s)
        return { ok: false, message: '找不到这次输入会话。' };
    const text = (s.reflection?.summary || s.reflection?.retelling || s.reflection?.mainIdea || '').trim();
    if (!text)
        return { ok: false, message: '这次输入还没有英文总结：先完成 Standard/Deep 复盘，或在这里直接写。' };
    const src = data.inputSources.find(x => x.id === s.sourceId);
    const task = buildTaskFromInput(s, src?.title ?? '', src?.topic ?? s.topic, now);
    return { ok: true, value: { text, task, meta: { topic: task.topic, sourceLabel: task.sourceLabel } } };
}
function buildTaskFromInput(s: Data['inputSessions'][number], title: string, topic: string, now: number): OutputTaskSpec {
    return {
        id: `otask_input_${s.id}`,
        taskType: 'short_summary',
        topic: topic || 'the material',
        communicationGoal: '把你的英文总结改写成更清楚的表达，并保留你对内容的理解',
        sourceType: 'input',
        sourceId: s.id,
        sourceLabel: title,
        targetWords: [],
        targetGrammar: [],
        expectedMinutes: 10,
        difficultyEstimate: 0.4,
        minWords: 15,
        maxWords: 120,
        reasons: [`来自真实输入：${title || s.id}`],
        interestOnly: true,
        createdAt: now,
    };
}
function hash(s: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36);
}
