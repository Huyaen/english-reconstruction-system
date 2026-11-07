// —— Phase 9：Output Analytics（为 Phase 10 预留契约，不伪造精度）——
import type { AIGeneration, Data, OutputAttempt, OutputErrorSpan, OutputErrorType } from './types.ts';
import { countWords } from './outputTask.ts';
import { localChecks, type LocalOutputFinding } from './outputDiagnosis.ts';
import { outputFeedbackRequestKey, qualityGate, validateOutputFeedback } from './outputFeedback.ts';
export interface OutputAnalytics {
    attempts: number;
    completed: number;
    independent: number;
    assisted: number;
    copied: number;
    transfer: number;
    delayed: number;
    /** 每 100 词的主要错误数：样本不足时返回 null，而不是 0 */
    errorsPer100Words: number | null;
    /** 意思送达率：只统计通过质量门且给出意思判断的 AI 反馈 */
    meaningDeliveredRate: number | null;
    /** 修改后问题解决率：只统计有 revision 与反馈的 attempt */
    revisionResolvedRate: number | null;
    repairAttempts: number;
    repairSuccessRate: number | null;
    /** 独立 vs 辅助比例 */
    independentRate: number | null;
    productiveWords: number;
    sampleNote: string;
}
export function outputAnalytics(data: Data): OutputAnalytics {
    const all = data.outputAttempts ?? [];
    const completed = all.filter(a => a.status === 'completed');
    const genById = new Map((data.aiGenerations ?? []).map(g => [g.id, g]));
    let independent = 0;
    let assisted = 0;
    let copied = 0;
    let transfer = 0;
    let delayed = 0;
    let words = 0;
    let issues = 0;
    let assessedMeaning = 0;
    let delivered = 0;
    let revisionsWithFeedback = 0;
    let resolvedAll = 0;
    for (const a of completed) {
        const evidence = a.productiveEvidence ?? [];
        if (evidence.some(e => e.copied))
            copied += 1;
        else if (evidence.some(e => e.independent))
            independent += 1;
        else if (evidence.length)
            assisted += 1;
        if (a.transferOf)
            transfer += 1;
        if (a.delayedOf)
            delayed += 1;
        words += countWords(a.finalText || a.originalText);
        const checked = checkedAI(a, genById.get(a.aiGenerationId ?? ''));
        if (checked && checked.meaningAssessment !== 'unavailable') {
            assessedMeaning += 1;
            if (checked.meaningAssessment === 'delivered')
                delivered += 1;
        }
        if (a.feedback) {
            issues += a.feedback.priorityIssues.length + a.feedback.corrections.length;
            if (a.revisions?.length) {
                revisionsWithFeedback += 1;
                const stillThere = [...a.feedback.priorityIssues, ...a.feedback.corrections].filter(s => (a.finalText ?? '').toLowerCase().includes(s.original.toLowerCase()));
                if (stillThere.length === 0)
                    resolvedAll += 1;
            }
        }
    }
    const withRepair = completed.filter(a => a.repair);
    const repaired = withRepair.filter(a => a.repair?.meaningPreserved === true);
    const productiveWords = new Set<string>();
    for (const a of completed)
        for (const e of a.productiveEvidence ?? [])
            if (e.independent && !e.copied && e.correctness === 'correct')
                productiveWords.add(e.wordId);
    const enough = completed.length >= 3;
    return {
        attempts: all.length,
        completed: completed.length,
        independent,
        assisted,
        copied,
        transfer,
        delayed,
        errorsPer100Words: enough && words > 0 ? Math.round((issues / words) * 100 * 10) / 10 : null,
        meaningDeliveredRate: assessedMeaning >= 2 ? Math.round((delivered / assessedMeaning) * 100) / 100 : null,
        revisionResolvedRate: revisionsWithFeedback >= 2 ? Math.round((resolvedAll / revisionsWithFeedback) * 100) / 100 : null,
        repairAttempts: withRepair.length,
        repairSuccessRate: withRepair.length >= 2 ? Math.round((repaired.length / withRepair.length) * 100) / 100 : null,
        independentRate: completed.length ? Math.round((independent / completed.length) * 100) / 100 : null,
        productiveWords: productiveWords.size,
        sampleNote: enough ? '样本仍然很小：这些比例只用于观察趋势，不是能力评级。' : 'insufficient evidence：练习次数太少，暂不计算比例。',
    };
}
/** 历史列表：只显示真实存在的字段，不比较"字数越来越多" */
export function attemptHeadline(a: OutputAttempt): string {
    const label = a.task?.taskType ?? a.taskType ?? 'free_expression';
    const first = (a.originalText || '').trim().split(/[.!?。！？]/)[0] ?? '';
    return `${label} · ${a.task?.topic ?? a.sourceType} · ${first.slice(0, 60)}`;
}

export type OutputErrorSummaryDays = 7 | 14 | 30;
type ErrorSource = 'ai' | LocalOutputFinding['source'];
type ErrorKey = OutputErrorType | LocalOutputFinding['key'];

interface ErrorExample {
    attemptId: string;
    canOpen: boolean;
    topic: string;
    at: number;
    original: string;
    context: string;
    proposed: string;
    explanation: string;
}
interface ErrorCategory {
    key: ErrorKey;
    source: ErrorSource;
    occurrences: number;
    tasks: number;
    independentTasks: number;
    denominator: number;
    independentDenominator: number;
    examples: ErrorExample[];
}

function checkedAI(a: OutputAttempt, gen: AIGeneration | undefined) {
    if (!a.task || a.feedbackStatus !== 'ai' || a.feedbackSource !== 'ai' || gen?.kind !== 'output' || gen.quality?.ok !== true)
        return null;
    const payload = gen.output as { requestKey?: string; feedback?: unknown } | null;
    const feedback = a.feedback;
    if (!feedback || feedback.promptVersion !== gen.promptVersion || payload?.requestKey !== outputFeedbackRequestKey(a.id, gen.promptVersion, a.originalText))
        return null;
    const context = {
        text: a.originalText, spec: a.task, scope: feedback.feedbackScope,
        sourceProvenance: feedback.sourceProvenance, promptVersion: gen.promptVersion,
    };
    const checked = validateOutputFeedback(payload.feedback, context);
    if (!checked.ok || checked.value.promptVersion !== gen.promptVersion || !qualityGate(checked.value, context).ok)
        return null;
    const { priorityIssues, corrections, noCorrectionNeeded } = checked.value;
    return priorityIssues.length || corrections.length || noCorrectionNeeded ? checked.value : null;
}

function isIndependentSubmission(a: OutputAttempt): boolean {
    return (a.support?.highestLevel ?? a.supportLevel) === 0
        && (a.supportLevel ?? 0) === 0
        && !a.support?.requestedHints?.length && !a.hintsUsed?.length
        && !(a.revisions ?? []).some(r => r.text === a.originalText && (r.kind === 'copied' || r.kind === 'after_model' || r.kind === 'after_hint'));
}

/** Counts saved submissions by task creation date. Regrading can change evidence, but never the date or number of tasks. */
export function outputErrorSummary(data: Pick<Data, 'outputAttempts' | 'aiGenerations'>, days: OutputErrorSummaryDays = 14, now = Date.now()) {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    const genById = new Map((data.aiGenerations ?? []).map(g => [g.id, g]));
    const seen = new Set<string>();
    const submitted: OutputAttempt[] = [];
    const sorted = [...(data.outputAttempts ?? [])].sort((a, b) => a.createdAt - b.createdAt || (b.revision ?? 0) - (a.revision ?? 0));
    for (const a of sorted) {
        if (!Number.isFinite(a.createdAt) || a.createdAt > now || a.status === 'draft' || a.status === 'abandoned'
            || a.feedbackSource === 'mock' || !/[a-z]/i.test(a.originalText ?? ''))
            continue;
        const keys = ['attempt:' + a.id];
        if (a.dailyPlanTaskId)
            keys.push('plan:' + a.dailyPlanTaskId);
        else if (a.task?.id)
            keys.push('submission:' + JSON.stringify([a.task.id, a.originalText.trim()]));
        if (keys.some(key => seen.has(key)))
            continue;
        keys.forEach(key => seen.add(key));
        if (a.createdAt >= start.getTime())
            submitted.push(a);
    }

    const coverage = {
        submitted: submitted.length, independent: 0, ai: 0, independentAi: 0,
        deterministic: 0, independentLocal: 0, heuristic: 0, selfReported: 0, unassessable: 0,
    };
    const groups = new Map<string, ErrorCategory & { independentExample?: ErrorExample }>();
    for (const a of submitted.reverse()) {
        const independent = isIndependentSubmission(a);
        if (independent)
            coverage.independent++;
        if (a.repair?.source === 'user' && a.repair.evidenceBasis === 'self_reported')
            coverage.selfReported++;
        const ai = checkedAI(a, genById.get(a.aiGenerationId ?? ''));
        if (ai) {
            coverage.ai++;
            if (independent)
                coverage.independentAi++;
        }
        else {
            coverage.unassessable++;
            if (a.feedbackStatus === 'invalid' || a.feedbackStatus === 'ai' || a.feedbackSource === 'ai')
                continue;
        }
        const local = localChecks(a.originalText, a.task).findings;
        coverage.deterministic++;
        if (independent)
            coverage.independentLocal++;
        if (local.some(f => f.source === 'heuristic'))
            coverage.heuristic++;
        const findings = [
            ...(ai ? [...ai.priorityIssues, ...ai.corrections] : []).filter(span => span.severity !== 'style').map(span => ({ key: span.type, source: 'ai' as const, span })),
            ...local,
        ];
        const occurrences = new Set<string>();
        const categoriesOnTask = new Set<string>();
        for (const { key, source, span } of findings) {
            const categoryId = `${source}:${key}`;
            const occurrenceId = `${source === 'ai' ? 'ai' : categoryId}:${span.start}:${span.end}`;
            if (occurrences.has(occurrenceId))
                continue;
            occurrences.add(occurrenceId);
            const group = groups.get(categoryId) ?? { key, source, occurrences: 0, tasks: 0, independentTasks: 0, denominator: 0, independentDenominator: 0, examples: [] };
            group.occurrences++;
            if (!categoriesOnTask.has(categoryId)) {
                categoriesOnTask.add(categoryId);
                group.tasks++;
                const example = {
                    attemptId: a.id, canOpen: !!a.task, topic: a.task?.topic || a.sourceLabel || '写作练习',
                    at: a.createdAt, original: span.original, proposed: span.proposed, explanation: span.explanation,
                    context: a.originalText.slice(Math.max(0, span.start - 40), span.end + 40),
                };
                if (group.examples.length < 2)
                    group.examples.push(example);
                if (independent) {
                    group.independentTasks++;
                    if (example.canOpen)
                        group.independentExample ??= example;
                }
            }
            groups.set(categoryId, group);
        }
    }
    const categories = [...groups.values()]
        .map(group => ({
            ...group,
            denominator: group.source === 'ai' ? coverage.ai : coverage.deterministic,
            independentDenominator: group.source === 'ai' ? coverage.independentAi : coverage.independentLocal,
        }))
        .sort((a, b) => b.independentTasks - a.independentTasks || b.tasks - a.tasks || b.occurrences - a.occurrences);
    const recommendations = categories.flatMap(({ key, source, independentTasks, independentDenominator, independentExample }) =>
        source !== 'heuristic' && independentDenominator >= 3 && independentTasks >= 2 && independentExample
            ? [{ key, source, independentTasks, independentDenominator, example: independentExample }]
            : []
    ).slice(0, 2);
    return { days, coverage, categories, recommendations };
}
