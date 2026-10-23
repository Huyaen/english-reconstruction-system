// —— Phase 11：统一测评会话状态机 ——
// created → active ⇄ paused → submitted → reviewed → completed；abandoned 终止。
// 自动保存、刷新恢复、并发 revision、重复提交幂等都在这里，不依赖 UI。
import type { AssessmentAnswer, AssessmentItem, ExamSession, ExamSessionMode, ExamSpecification } from './examTypes.ts';
import { isChoiceItem } from './examItems.ts';
export interface SessionResult {
    ok: boolean;
    session?: ExamSession;
    noop?: boolean;
    message?: string;
}
const clone = (s: ExamSession): ExamSession => ({ ...s, itemIds: [...s.itemIds], items: s.items.map(i => ({ ...i, options: i.options.map(o => ({ ...o })) })), answers: { ...s.answers }, errors: s.errors.map(e => ({ ...e })) });
export function createExamSession(args: {
    id: string;
    mode: ExamSessionMode;
    spec: ExamSpecification | null;
    items: AssessmentItem[];
    now: number;
    timeLimitMinutes?: number;
    weeklyReportId?: string | null;
    sourceProvenance?: string;
}): ExamSession {
    const ids = [...new Set(args.items.map(i => i.id))];
    const items = ids.map(id => args.items.find(i => i.id === id)!).filter(Boolean);
    const estimated = items.reduce((n, i) => n + i.estimatedTimeMinutes, 0);
    const minutes = args.timeLimitMinutes ?? Math.max(5, Math.min(180, Math.ceil(estimated)));
    return {
        id: args.id, mode: args.mode, specId: args.spec?.id ?? '', examCategory: args.spec?.examCategory ?? items[0]?.examCategory ?? 'other',
        itemIds: ids, items, answers: {},
        startedAt: args.now, updatedAt: args.now, completedAt: null, pausedAt: null,
        timeLimitMinutes: minutes, timeUsedMs: 0, helpUsed: 0, status: 'created', revision: 1,
        score: null, maxScore: items.reduce((n, i) => n + i.pointValue, 0), scoreStatus: 'unavailable',
        errors: [], review: '', sourceProvenance: args.sourceProvenance ?? 'project-authored', weeklyReportId: args.weeklyReportId ?? null,
        unavailableSections: [], createdAt: args.now,
    };
}
export function startSession(session: ExamSession, now: number): SessionResult {
    if (session.status === 'active')
        return { ok: true, session, noop: true };
    if (session.status !== 'created' && session.status !== 'paused')
        return { ok: false, message: '这个测评已经提交或结束，不能重新开始。' };
    const s = clone(session);
    s.status = 'active';
    s.pausedAt = null;
    s.updatedAt = now;
    s.revision += 1;
    return { ok: true, session: s };
}
export function pauseSession(session: ExamSession, now: number): SessionResult {
    if (session.status === 'paused')
        return { ok: true, session, noop: true };
    if (session.status !== 'active')
        return { ok: false, message: '只有进行中的测评可以暂停。' };
    const s = clone(session);
    s.status = 'paused';
    s.pausedAt = now;
    s.updatedAt = now;
    s.timeUsedMs = Math.max(s.timeUsedMs, now - s.startedAt);
    s.revision += 1;
    return { ok: true, session: s };
}
export function saveAnswer(session: ExamSession, args: {
    itemId: string;
    value: string;
    timeMs: number;
    helpUsed?: boolean;
    now: number;
    flagged?: boolean;
}): SessionResult {
    if (session.status !== 'active' && session.status !== 'paused')
        return { ok: false, message: '当前状态不能保存答案。' };
    if (!session.itemIds.includes(args.itemId))
        return { ok: false, message: '题目不属于这个测评。' };
    const s = clone(session);
    const prev = s.answers[args.itemId];
    s.answers[args.itemId] = {
        itemId: args.itemId, value: String(args.value).slice(0, 20000), at: args.now,
        timeMs: Math.max(0, Math.round(args.timeMs)), helpUsed: !!args.helpUsed,
        flagged: args.flagged ?? prev?.flagged ?? false,
    };
    if (args.helpUsed)
        s.helpUsed += 1;
    s.updatedAt = args.now;
    s.timeUsedMs = Math.max(s.timeUsedMs, args.now - s.startedAt);
    s.revision += 1;
    return { ok: true, session: s };
}
export interface SubmitOutcome {
    score: number | null;
    maxScore: number;
    status: ExamSession['scoreStatus'];
    correct: number;
    answered: number;
    total: number;
    openItems: number;
    reason: string;
}
/** 只对可靠客观题算分；含开放题时总成绩只能是 partial，绝不冒充官方总分。 */
export function gradeSession(session: ExamSession): SubmitOutcome {
    const total = session.items.length;
    const answered = session.items.filter(i => session.answers[i.id]?.value?.trim()).length;
    let score = 0;
    let correct = 0;
    let objective = 0;
    let open = 0;
    for (const item of session.items) {
        if (!isChoiceItem(item) || !item.answerKey) {
            open += 1;
            continue;
        }
        objective += 1;
        const a = session.answers[item.id];
        if (a && a.value === item.answerKey) {
            correct += 1;
            score += item.pointValue;
        }
    }
    const maxScore = session.maxScore;
    if (!objective)
        return { score: null, maxScore, status: 'unavailable', correct, answered, total, openItems: open, reason: '没有可靠客观题，无法计算客观分。' };
    if (answered < total)
        return { score: null, maxScore, status: 'partial', correct, answered, total, openItems: open, reason: `还有 ${total - answered} 题未作答，不计算总分。` };
    return {
        score: Math.round(score * 10) / 10, maxScore, status: open ? 'partial' : 'verified_objective',
        correct, answered, total, openItems: open,
        reason: open ? `含 ${open} 道开放题，客观分只统计选择/填空，不代表整卷成绩。` : '全部题目有可靠答案，客观分可核对。',
    };
}
export function submitSession(session: ExamSession, now: number): SessionResult & {
    outcome?: SubmitOutcome;
} {
    if (session.status === 'submitted' || session.status === 'reviewed' || session.status === 'completed') {
        const outcome = gradeSession(session);
        return { ok: true, session, noop: true, outcome };
    }
    if (session.status !== 'active' && session.status !== 'paused')
        return { ok: false, message: '只有进行中的测评可以提交。' };
    const outcome = gradeSession(session);
    const s = clone(session);
    s.status = 'submitted';
    s.submittedAt = now;
    s.completedAt = now;
    s.timeUsedMs = Math.max(s.timeUsedMs, now - s.startedAt);
    s.score = outcome.score;
    s.scoreStatus = outcome.status;
    s.review = outcome.reason;
    s.updatedAt = now;
    s.revision += 1;
    return { ok: true, session: s, outcome };
}
export function reviewSession(session: ExamSession, errors: ExamSession['errors'], review: string, now: number): SessionResult {
    if (session.status === 'reviewed' || session.status === 'completed')
        return { ok: true, session, noop: true };
    if (session.status !== 'submitted')
        return { ok: false, message: '请先提交后再复盘。' };
    const s = clone(session);
    s.status = 'reviewed';
    s.errors = errors.map(e => ({ ...e }));
    s.review = review;
    s.updatedAt = now;
    s.revision += 1;
    return { ok: true, session: s };
}
export function completeSession(session: ExamSession, now: number): SessionResult {
    if (session.status === 'completed')
        return { ok: true, session, noop: true };
    if (session.status !== 'reviewed')
        return { ok: false, message: '复盘后才能完成。' };
    const s = clone(session);
    s.status = 'completed';
    s.completedAt = now;
    s.updatedAt = now;
    s.revision += 1;
    return { ok: true, session: s };
}
export function abandonSession(session: ExamSession, now: number): SessionResult {
    if (session.status === 'abandoned')
        return { ok: true, session, noop: true };
    if (session.status === 'completed')
        return { ok: false, message: '已完成的测评不能放弃。' };
    const s = clone(session);
    s.status = 'abandoned';
    s.updatedAt = now;
    s.revision += 1;
    return { ok: true, session: s };
}
export function sessionProgress(session: ExamSession): {
    answered: number;
    total: number;
    ratio: number;
} {
    const total = session.itemIds.length;
    const answered = session.itemIds.filter(id => session.answers[id]?.value?.trim()).length;
    return { answered, total, ratio: total ? answered / total : 0 };
}
export function currentItem(session: ExamSession): AssessmentItem | null {
    return session.items.find(i => !session.answers[i.id]?.value?.trim()) ?? session.items[session.items.length - 1] ?? null;
}
export function answerOf(session: ExamSession, itemId: string): AssessmentAnswer | undefined {
    return session.answers[itemId];
}
export function scoreStatusLabel(s: ExamSession['scoreStatus']): string {
    return ({
        verified_objective: '可核对客观分', rubric_reviewed: '按 rubric 复核', ai_estimated: 'AI 估算（非官方）',
        self_reported: '自报（非系统验证）', unavailable: '不可评分', partial: '部分评分',
    } as const)[s];
}
