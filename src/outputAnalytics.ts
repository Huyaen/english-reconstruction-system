// —— Phase 9：Output Analytics（为 Phase 10 预留契约，不伪造精度）——
import type { Data, OutputAttempt } from './types.ts';
import { countWords } from './outputTask.ts';
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
    /** 意思送达率：只统计有反馈的 attempt */
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
    let independent = 0;
    let assisted = 0;
    let copied = 0;
    let transfer = 0;
    let delayed = 0;
    let words = 0;
    let issues = 0;
    let withFeedback = 0;
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
        if (a.feedback) {
            withFeedback += 1;
            issues += a.feedback.priorityIssues.length + a.feedback.corrections.length;
            if (a.feedback.meaningAssessment === 'delivered')
                delivered += 1;
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
        meaningDeliveredRate: withFeedback >= 2 ? Math.round((delivered / withFeedback) * 100) / 100 : null,
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
