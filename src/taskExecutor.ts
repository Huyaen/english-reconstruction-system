// —— Phase 12 Full Integration：Today 计划任务的唯一执行契约 ——
// 约束：
//   1) 计划里的每个 task 只能由本模块判定「它属于哪个训练模块、能否执行、是否已有真实证据」。
//   2) 完成计划任务必须由领域证据驱动；没有证据不得把 task 标成 done。
//   3) 未知模块/缺数据一律明确拒绝，绝不回退到词汇默认页。
import type { Data, DailyPlan, PlanItem } from './types.ts';
export type TrainingModule = 'vocabulary' | 'sentence' | 'reading' | 'input' | 'output' | 'exam' | 'closing' | 'unsupported';
export const MODULE_LABELS: Record<TrainingModule, string> = {
    vocabulary: '词汇记忆',
    sentence: '句子与语法',
    reading: '阅读',
    input: '输入练习',
    output: '写作练习',
    exam: '考试',
    closing: '收尾回忆',
    unsupported: '不认识的类型',
};
const VOCABULARY_KINDS = new Set([
    'yesterday-recall', 'due-review', 'new-preview', 'new-recall', 'weak-review',
    're-entry-check', 'closing-recall', 'mini-diagnostic', 'reflow',
]);
/** 归一化 PlanItem.module；兼容旧计划里缺 module 的词汇任务。 */
export function taskModule(task: PlanItem): TrainingModule {
    const m = String(task.module ?? '').trim();
    if (m === 'vocabulary' || m === 'sentence' || m === 'reading' || m === 'input' || m === 'output' || m === 'exam')
        return m;
    if (m === 'closing')
        return 'closing';
    const kind = String(task.kind ?? '');
    if (kind.startsWith('sentence-'))
        return 'sentence';
    if (kind.startsWith('reading-'))
        return 'reading';
    if (kind.startsWith('input-'))
        return 'input';
    if (kind.startsWith('output-'))
        return 'output';
    if (kind === 'exam-practice')
        return 'exam';
    if (kind === 'closing-recall')
        return 'closing';
    if (VOCABULARY_KINDS.has(kind))
        return 'vocabulary';
    return 'unsupported';
}
/** 计划任务的简短目标描述（今日页展示用，不伪造数量）。 */
export function taskTargetLabel(task: PlanItem): string {
    const m = taskModule(task);
    const n = (task.refs ?? []).length;
    if (m === 'sentence')
        return `${n} 句`;
    if (m === 'reading')
        return '1 篇文章';
    if (m === 'input')
        return task.kind === 'input-continue' ? '继续未完成输入' : '1 份材料';
    if (m === 'output')
        return '写 1 段';
    if (m === 'exam')
        return '1 道题';
    if (m === 'vocabulary' || m === 'closing')
        return `${n} 个词`;
    return '无可执行目标';
}
/**
 * 执行前的静态可用性检查（不启动任何会话）。
 * 这里只检查「目标是否仍然存在」；时间/依赖等另由 Planner 校验。
 */
export function taskUnavailableReason(task: PlanItem, data: Data): string | null {
    const m = taskModule(task);
    const refs = task.refs ?? [];
    if (m === 'unsupported')
        return '这项任务的类型不认识，不能当作词汇练习执行。请重新生成今天的计划。';
    if (m === 'reading') {
        if (!refs[0] || !(data.passages ?? []).some(p => p.id === refs[0]))
            return '这篇文章已不在阅读库（可能被删除）。';
        return null;
    }
    if (m === 'input') {
        if (!refs[0] || !(data.inputSources ?? []).some(s => s.id === refs[0]))
            return '这份材料已经不在材料库里了。';
        return null;
    }
    if (m === 'exam') {
        if (data.settings?.exam?.planEnabled !== true)
            return '考试练习当前已关闭；开启后才能执行这项任务。';
        if (!refs[0] || !(data.examItems ?? []).some(i => i.id === refs[0]))
            return '这道考试题已不在题库。';
        return null;
    }
    if (m === 'sentence') {
        if (!refs.length)
            return '这个句任务没有目标句子。';
        const missing = refs.filter(id => !(data.sentences ?? []).some(s => s.id === id));
        if (missing.length)
            return `目标句子已不存在（${missing.length} 句），请重新生成今日计划。`;
        return null;
    }
    if (m === 'output') {
        if (!refs[0])
            return '这个表达任务没有目标题目。';
        return null;
    }
    if (!refs.length)
        return '这个任务没有可执行的目标，请重新生成今日计划。';
    // 词汇/收尾任务的目标是真实词条；词被删除后不能继续用空引用执行。
    const missingWords = refs.filter(id => !(data.words ?? []).some(w => w.id === id));
    if (missingWords.length)
        return `目标词已不存在（${missingWords.length} 个），请重新生成今日计划。`;
    return null;
}
export interface TaskEvidenceInput {
    planTaskId: string;
    startedAt: number;
    /** 领域会话 id；可用时优先用它防止把旧证据算进来。 */
    sessionId?: string;
}
export interface TaskEvidenceResult {
    ok: boolean;
    reason: string;
    evidenceId: string;
    module: TrainingModule;
}
/**
 * 真实证据校验：
 *   - 词汇：本次 startedAt 之后、本 session 的 ReviewRecord；Preview 只看 exposure。
 *   - 句子：本 lab session 的 SentenceAttempt。
 *   - 阅读：目标会话 completed（或 detail.state=completed）。
 *   - 输入：目标会话 completed 且已有复盘。
 *   - 表达：本次创建/绑定的 OutputAttempt completed。
 *   - 考试：本次创建/绑定的 ExamSession completed。
 * 任何一条不满足都拒绝写 done，不做“自动标记完成”。
 */
export function taskEvidence(task: PlanItem, data: Data, exec: TaskEvidenceInput): TaskEvidenceResult {
    const m = taskModule(task);
    const refs = task.refs ?? [];
    const startedAt = Math.max(0, exec.startedAt || task.startedAt || 0);
    const fail = (reason: string): TaskEvidenceResult => ({ ok: false, reason, evidenceId: '', module: m });
    // 没有开始时间的旧任务无法证明证据属于“本次”；宁可拒绝，也不把历史记录算进来。
    if (!startedAt)
        return fail('这次没有开始时间，没法确认是不是刚刚练的。');
    if (m === 'vocabulary' || m === 'closing') {
        if (task.kind === 'new-preview') {
            const hit = (data.wordExposures ?? []).filter(e => e.at >= startedAt
                && e.sourceType === 'preview'
                && (!refs.length || refs.includes(e.wordId)));
            return hit.length
                ? { ok: true, reason: `已记录 ${hit.length} 个词的预览`, evidenceId: hit[hit.length - 1].id, module: m }
                : fail('这次预览还没有记录。');
        }
        const records = (data.records ?? []).filter(r => r.at >= startedAt
            && (!exec.sessionId || r.sessionId === exec.sessionId)
            && (!refs.length || refs.includes(r.wordId)));
        return records.length
            ? { ok: true, reason: `已记录 ${records.length} 次真实作答`, evidenceId: records[records.length - 1].id, module: m }
            : fail('还没有本次训练的真实作答记录。');
    }
    if (m === 'sentence') {
        const attempts = (data.sentenceAttempts ?? []).filter(a => (a.at ?? 0) >= startedAt
            && (!exec.sessionId || a.sessionId === exec.sessionId)
            && (!refs.length || refs.includes(a.sentenceId ?? '')));
        return attempts.length
            ? { ok: true, reason: `已记录 ${attempts.length} 个句子练习`, evidenceId: attempts[attempts.length - 1].id, module: m }
            : fail('还没有本次句子练习的真实尝试记录。');
    }
    if (m === 'reading') {
        const s = (data.readingSessions ?? []).find(x => x.id === (exec.sessionId || task.targetSessionId || ''));
        if (!s || (s.detail?.state !== 'completed'))
            return fail('这次阅读还没有真正完成。');
        const completedMoment = Math.max(s.at ?? 0, s.detail?.firstPassEndedAt ?? 0, s.detail?.rereadEndedAt ?? 0);
        if (completedMoment < startedAt)
            return fail('这次阅读是在任务开始前做的，不能算作这一次。');
        return { ok: true, reason: '阅读已完成（只算看过和读懂，不会自动让单词变熟）', evidenceId: s.id, module: m };
    }
    if (m === 'input') {
        const sessions = (data.inputSessions ?? []).filter(s => s.id === (exec.sessionId || task.targetSessionId || '')
            || (!exec.sessionId && !task.targetSessionId && refs.includes(s.sourceId)))
            .sort((a, b) => (b.completedAt ?? b.startedAt ?? 0) - (a.completedAt ?? a.startedAt ?? 0));
        const s = sessions.find(x => x.status === 'completed' && !!x.reflection
            && (x.completedAt ?? 0) >= startedAt);
        return s
            ? { ok: true, reason: '输入会话已完成并留下复盘（曝光 + 自评，不是能力提升）', evidenceId: s.id, module: m }
            : fail('这次输入还没有完成复盘并结束。');
    }
    if (m === 'output') {
        const attempts = (data.outputAttempts ?? []).filter(a => a.id === (exec.sessionId || task.targetSessionId || '')
            || a.dailyPlanTaskId === task.id
            || (!exec.sessionId && (!task.targetSessionId) && refs.includes(a.sourceId)))
            .sort((a, b) => b.createdAt - a.createdAt);
        const attempt = attempts.find(a => a.status === 'completed' && (!startedAt || a.createdAt >= startedAt))
            ?? attempts.find(a => a.status === 'completed');
        if (!attempt)
            return fail('这段还没写完。');
        if (startedAt && attempt.createdAt < startedAt)
            return fail('这次写作是在任务开始前做的，不能算作这一次。');
        return { ok: true, reason: '表达已完成；独立性按实际辅助级别记录', evidenceId: attempt.id, module: m };
    }
    if (m === 'exam') {
        const sessions = (data.examSessions ?? []).filter(x => x.id === (exec.sessionId || task.targetSessionId || '')
            || x.dailyPlanTaskId === task.id
            || (!exec.sessionId && (!task.targetSessionId) && refs.some(id => x.itemIds.includes(id))))
            .sort((a, b) => b.createdAt - a.createdAt);
        const s = sessions.find(x => x.status === 'completed' && (!startedAt || x.createdAt >= startedAt))
            ?? sessions.find(x => x.status === 'completed');
        if (!s)
            return fail('这次考试测评还没有完成（需提交并复盘）。');
        if (startedAt && s.createdAt < startedAt)
            return fail('这次测评是在任务开始前做的，不能算作这一次。');
        return { ok: true, reason: '测评已完成（是换题检验，不是英语总分）', evidenceId: s.id, module: m };
    }
    return fail('这项任务类型不认识，没法标记完成。');
}
/** 今日页「继续下一项」：按计划顺序找第一个未结束任务（进行中优先）。 */
export function nextOpenTask(plan: DailyPlan | null): PlanItem | null {
    if (!plan)
        return null;
    const open = plan.initialPlan.filter(t => t.status === 'pending' || t.status === 'delayed' || t.status === 'started');
    return open.find(t => t.status === 'started') ?? open[0] ?? null;
}
/** 只有真正 done 才算完成；skipped/replaced 不冒充学习证据。 */
export function completedTaskCount(plan: DailyPlan | null): number {
    return plan ? plan.initialPlan.filter(t => t.status === 'done').length : 0;
}
