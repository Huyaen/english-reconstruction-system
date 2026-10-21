// —— Phase 9：修改（Revision）——
// 关键区分：自己改 / 提示后改 / 照抄建议 / 完整示范后改写。
// 只有"自己改"或"提示后自己重写"能产生独立/半独立证据；照抄不产生掌握。
import type { OutputAttempt, OutputErrorSpan, OutputFeedback, OutputRevisionKind, OutputRevisionRecord, OutputSupportLevel } from './types.ts';
import { textSimilarity } from './outputScaffolding.ts';
import { countWords } from './outputTask.ts';
export interface RevisionOptions {
    now?: number;
    /** AI 给出的建议句（用于判定是否照抄） */
    suggestion?: string | null;
    supportLevel?: OutputSupportLevel;
    /** 显式指定来源（用户主动标记"我照抄了"时优先） */
    kind?: OutputRevisionKind;
}
export function classifyRevision(text: string, opts: RevisionOptions): {
    kind: OutputRevisionKind;
    similarity: number;
} {
    const suggestion = String(opts.suggestion ?? '').trim();
    const similarity = suggestion ? textSimilarity(text, suggestion) : 0;
    if (opts.kind)
        return { kind: opts.kind, similarity };
    if (similarity >= 0.82)
        return { kind: 'copied', similarity };
    if ((opts.supportLevel ?? 0) >= 4)
        return { kind: 'after_model', similarity };
    if ((opts.supportLevel ?? 0) > 0)
        return { kind: 'after_hint', similarity };
    return { kind: 'self', similarity };
}
export function recordRevision(attempt: OutputAttempt, text: string, opts: RevisionOptions = {}): OutputAttempt {
    const now = opts.now ?? Date.now();
    const clean = String(text ?? '').trim();
    const { kind, similarity } = classifyRevision(clean, opts);
    const record: OutputRevisionRecord = { text: clean, at: now, kind, similarityToSuggestion: round2(similarity) };
    return {
        ...attempt,
        revisionText: clean,
        finalText: clean,
        revisions: [...(attempt.revisions ?? []), record],
        status: 'revised',
        updatedAt: now,
        revision: (attempt.revision ?? 0) + 1,
    };
}
function round2(n: number): number {
    return Math.round(n * 100) / 100;
}
export interface RevisionComparison {
    beforeWords: number;
    afterWords: number;
    wordDelta: number;
    /** 反馈里的主要问题有多少在修改后不再出现（仅按原文片段是否还在判断） */
    resolved: OutputErrorSpan[];
    remaining: OutputErrorSpan[];
    /** 是否真的改到了点子上（而不是只换同义词/扩写） */
    addressedPriority: boolean;
}
export function compareRevision(before: string, after: string, feedback: OutputFeedback | null): RevisionComparison {
    const spans = feedback ? [...feedback.priorityIssues, ...feedback.corrections] : [];
    const resolved: OutputErrorSpan[] = [];
    const remaining: OutputErrorSpan[] = [];
    for (const s of spans) {
        if (after.toLowerCase().includes(s.original.toLowerCase()))
            remaining.push(s);
        else
            resolved.push(s);
    }
    const priority = feedback?.priorityIssues ?? [];
    const addressedPriority = priority.length === 0 || priority.some(p => !after.toLowerCase().includes(p.original.toLowerCase()));
    const beforeWords = countWords(before);
    const afterWords = countWords(after);
    return { beforeWords, afterWords, wordDelta: afterWords - beforeWords, resolved, remaining, addressedPriority };
}
/** 修改质量：只给方向性判断，不编造分数 */
export function revisionVerdict(cmp: RevisionComparison): 'improved' | 'partial' | 'unchanged' | 'copied' {
    if (!cmp.resolved.length)
        return cmp.afterWords === cmp.beforeWords ? 'unchanged' : 'unchanged';
    return cmp.remaining.length === 0 ? 'improved' : 'partial';
}
/** 复制建议后"语法正确"不等于独立掌握：只有非 copied 的修改才计算成长 */
export function revisionEvidenceKind(attempt: OutputAttempt): OutputRevisionKind | 'none' {
    const last = attempt.revisions?.[attempt.revisions.length - 1];
    return last ? last.kind : 'none';
}
export function revisionIsIndependent(attempt: OutputAttempt): boolean {
    const kind = revisionEvidenceKind(attempt);
    return kind === 'self' || kind === 'after_hint';
}
/** 给用户的下一步：不提"再写一篇 300 词" */
export function nextRevisionPrompt(cmp: RevisionComparison, taskType: string): string {
    if (cmp.remaining.some(s => s.severity === 'blocking'))
        return '先只改那一处让读者读不懂的地方，改完再读一遍整段。';
    if (cmp.remaining.length)
        return `还剩 ${cmp.remaining.length} 处小问题：挑最重要的一处改掉就够了。`;
    if (taskType === 'one_sentence')
        return '这一句已经能读了。可以换一个语境再说一次同样的意思，看看能不能独立说出来。';
    return '意思已经清楚了。下一步：不看原文，用 3 句话把同样的意思再说一遍。';
}
