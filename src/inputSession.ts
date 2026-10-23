// —— Phase 8：InputSession 生命周期（纯状态机）——
// created → active → paused → reflection → completed，任意非终态可 abandoned。
// 纪律：
//  * 所有转换都有前置条件，非法转换返回错误而不是“尽力而为”；
//  * 每次成功转换 revision +1；带 expectedRevision 的写入在持久层单事务比较（防并发）；
//  * 重复完成 / 重复提交必须幂等（noop），不能重复写时长或证据；
//  * 观看时长只有“用户自报”这一种来源，永远标记 reported。
import type { CaptionMode, InputBaseline, InputMode, InputReflection, InputSession, InputSessionStatus } from './types.ts';
const CAPTION_MODES = ['none', 'en', 'zh', 'other'] as const;
import { validateReflection, type ReflectionInput } from './inputReflection.ts';
import type { InputSource } from './types.ts';
export type SessionErrorCode = 'illegal-transition' | 'stale' | 'invalid-input' | 'ended';
export type SessionResult = {
    ok: true;
    session: InputSession;
    noop?: boolean;
} | {
    ok: false;
    code: SessionErrorCode;
    message: string;
};
const NEXT: Record<InputSessionStatus, InputSessionStatus[]> = {
    created: ['active', 'abandoned'],
    active: ['paused', 'reflection', 'abandoned', 'completed'],
    paused: ['active', 'reflection', 'abandoned'],
    reflection: ['active', 'completed', 'abandoned'],
    completed: [],
    abandoned: ['active'],
};
export function canTransition(from: InputSessionStatus, to: InputSessionStatus): boolean {
    return (NEXT[from] ?? []).includes(to);
}
function statusOf(session: InputSession): InputSessionStatus {
    return session.status ?? 'created';
}
function revisionOf(session: InputSession): number {
    return session.revision ?? 1;
}
export interface CreateSessionInput {
    source: InputSource;
    mode: InputMode;
    plannedMinutes?: number;
    miniUnitId?: string | null;
    dailyPlanTaskId?: string | null;
    now?: number;
}
export function createInputSession(input: CreateSessionInput): SessionResult {
    if (!input.source?.id)
        return { ok: false, code: 'invalid-input', message: '缺少材料，无法开始输入。' };
    const planned = Math.max(1, Math.min(600, Math.round(input.plannedMinutes ?? (input.source.durationMinutes || 15))));
    const now = input.now ?? Date.now();
    const session: InputSession = {
        id: `ins_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        sourceId: input.source.id, title: input.source.title, url: input.source.url, topic: input.source.topic,
        durationMinutes: input.source.durationMinutes || 0, watchedMinutes: 0,
        captionMode: 'none', comprehension: null, difficultyReasons: [], outputAttemptId: '', notes: '',
        mode: input.mode, createdAt: now, status: 'created', revision: 1, startedAt: now, pausedAt: null,
        completedAt: null, abandonedAt: null, miniUnitId: input.miniUnitId ?? null,
        dailyPlanTaskId: input.dailyPlanTaskId ?? null, plannedMinutes: planned,
        reportedWatchedMinutes: null, coldComprehension: null, afterComprehension: null,
        translationDependence: null, transcriptRef: input.source.transcriptRef ?? null,
        evidenceBasis: input.source.transcriptRef ? 'transcript' : 'none',
        baseline: { status: 'skipped', captionMode: 'none', comprehension: null, blocker: '', watchedMinutes: null, at: now },
    };
    // 默认 baseline 表示“还没做冷测”；recordBaseline 会覆盖它
    delete (session as Partial<InputSession>).baseline;
    return { ok: true, session };
}
function check(session: InputSession, to: InputSessionStatus, expectedRevision?: number): SessionResult | null {
    const from = statusOf(session);
    if (from === 'completed' || from === 'abandoned') {
        if (from === to)
            return { ok: true, session, noop: true };
        return { ok: false, code: 'ended', message: from === 'completed' ? '这次输入已经完成。' : '这次输入已经放弃，可以重新开始一次。' };
    }
    if (expectedRevision !== undefined && expectedRevision !== revisionOf(session))
        return { ok: false, code: 'stale', message: '这次输入在别处被更新过，请刷新后再试（避免覆盖另一个标签页的记录）。' };
    if (!canTransition(from, to))
        return { ok: false, code: 'illegal-transition', message: `当前状态（${from}）不能直接变成 ${to}。` };
    return null;
}
const bump = (session: InputSession, patch: Partial<InputSession>, now: number): InputSession => {
    const next = { ...session, ...patch, revision: revisionOf(session) + 1, updatedAt: now } as InputSession & {
        updatedAt: number;
    };
    if (patch.status)
        next.status = patch.status;
    return next;
};
export function startInputSession(session: InputSession, opts: {
    expectedRevision?: number;
    now?: number;
} = {}): SessionResult {
    const now = opts.now ?? Date.now();
    const blocked = check(session, 'active', opts.expectedRevision);
    if (blocked)
        return blocked;
    return { ok: true, session: bump(session, { status: 'active', startedAt: session.startedAt ?? now, pausedAt: null }, now) };
}
export function pauseInputSession(session: InputSession, opts: {
    expectedRevision?: number;
    now?: number;
} = {}): SessionResult {
    const now = opts.now ?? Date.now();
    const blocked = check(session, 'paused', opts.expectedRevision);
    if (blocked)
        return blocked;
    return { ok: true, session: bump(session, { status: 'paused', pausedAt: now }, now) };
}
export function resumeInputSession(session: InputSession, opts: {
    expectedRevision?: number;
    now?: number;
} = {}): SessionResult {
    const now = opts.now ?? Date.now();
    const blocked = check(session, 'active', opts.expectedRevision);
    if (blocked)
        return blocked;
    return { ok: true, session: bump(session, { status: 'active', pausedAt: null }, now) };
}
export function beginReflection(session: InputSession, opts: {
    expectedRevision?: number;
    now?: number;
} = {}): SessionResult {
    const now = opts.now ?? Date.now();
    const blocked = check(session, 'reflection', opts.expectedRevision);
    if (blocked)
        return blocked;
    return { ok: true, session: bump(session, { status: 'reflection' }, now) };
}
/** 冷测：必须在正式复盘之前记录；跳过则显式留空，不允许把复盘自评反填 */
export function recordBaseline(session: InputSession, input: {
    captionMode: CaptionMode;
    comprehension: number | null;
    blocker?: string;
    watchedMinutes?: number | null;
    skipped?: boolean;
    now?: number;
}): SessionResult {
    const now = input.now ?? Date.now();
    const from = statusOf(session);
    if (from === 'completed' || from === 'abandoned')
        return { ok: false, code: 'ended', message: '这次输入已经结束，不能补写冷测。' };
    if (session.reflection)
        return { ok: false, code: 'illegal-transition', message: '已经写过复盘，不能把复盘自评当作冷测。' };
    if (!(CAPTION_MODES as readonly string[]).includes(input.captionMode))
        return { ok: false, code: 'invalid-input', message: '字幕模式无效。' };
    if (input.comprehension !== null && (input.comprehension < 0 || input.comprehension > 1))
        return { ok: false, code: 'invalid-input', message: '理解自评需在 0–100% 之间。' };
    const baseline: InputBaseline = {
        status: input.skipped ? 'skipped' : 'recorded',
        captionMode: input.captionMode,
        comprehension: input.skipped ? null : input.comprehension,
        blocker: (input.blocker ?? '').slice(0, 200),
        watchedMinutes: input.watchedMinutes ?? null,
        at: now,
    };
    return { ok: true, session: bump(session, { baseline, coldComprehension: baseline.comprehension, captionMode: baseline.captionMode }, now) };
}
export function submitInputReflection(session: InputSession, input: Omit<ReflectionInput, 'mode' | 'now'> & {
    mode?: InputMode;
}, opts: {
    expectedRevision?: number;
    now?: number;
} = {}): SessionResult {
    const now = opts.now ?? Date.now();
    const from = statusOf(session);
    if (from === 'completed' || from === 'abandoned')
        return { ok: false, code: 'ended', message: '这次输入已经结束，不能重复提交复盘。' };
    if (opts.expectedRevision !== undefined && opts.expectedRevision !== revisionOf(session))
        return { ok: false, code: 'stale', message: '这次输入在别处被更新过，请刷新后再试。' };
    const mode = input.mode ?? session.mode;
    const result = validateReflection({ ...input, mode, now });
    if (!result.ok)
        return { ok: false, code: 'invalid-input', message: result.errors.join('；') };
    const reported = input.reportedWatchedMinutes ?? null;
    let watched = session.watchedMinutes;
    if (reported !== null && Number.isFinite(reported) && reported >= 0) {
        const cap = session.durationMinutes > 0 ? Math.max(session.durationMinutes, 0) + 5 : 600;
        watched = Math.round(Math.min(reported, cap));
    }
    const reflection: InputReflection = result.reflection;
    return {
        ok: true,
        session: bump(session, {
            status: 'reflection', reflection, mode, captionMode: reflection.captionMode,
            comprehension: reflection.comprehension, difficultyReasons: reflection.difficultyReasons,
            notes: reflection.notes, reportedWatchedMinutes: reported, watchedMinutes: watched,
            afterComprehension: reflection.comprehension,
        }, now),
    };
}
export function completeInputSession(session: InputSession, opts: {
    expectedRevision?: number;
    now?: number;
} = {}): SessionResult {
    const now = opts.now ?? Date.now();
    const from = statusOf(session);
    if (from === 'completed')
        return { ok: true, session, noop: true };
    if (from === 'abandoned')
        return { ok: false, code: 'ended', message: '这次输入已经放弃。' };
    if (opts.expectedRevision !== undefined && opts.expectedRevision !== revisionOf(session))
        return { ok: false, code: 'stale', message: '这次输入在别处被更新过，请刷新后再试。' };
    if (!session.reflection)
        return { ok: false, code: 'illegal-transition', message: '请先完成复盘再结束这次输入。' };
    if (from !== 'reflection' && from !== 'active' && from !== 'paused')
        return { ok: false, code: 'illegal-transition', message: '当前状态不能结束。' };
    return { ok: true, session: bump(session, { status: 'completed', completedAt: now }, now) };
}
export function abandonInputSession(session: InputSession, opts: {
    expectedRevision?: number;
    now?: number;
} = {}): SessionResult {
    const now = opts.now ?? Date.now();
    const from = statusOf(session);
    if (from === 'abandoned')
        return { ok: true, session, noop: true };
    if (from === 'completed')
        return { ok: false, code: 'ended', message: '已完成的输入不能放弃。' };
    if (opts.expectedRevision !== undefined && opts.expectedRevision !== revisionOf(session))
        return { ok: false, code: 'stale', message: '这次输入在别处被更新过，请刷新后再试。' };
    return { ok: true, session: bump(session, { status: 'abandoned', abandonedAt: now }, now) };
}
/** 默认模式建议（用户始终可以改）：低能量 Light；正常 Standard；高能量或单元 Day 3 Deep */
export function suggestMode(input: {
    energy: 'low' | 'normal' | 'good';
    unitDay?: number | null;
}): InputMode {
    if (input.energy === 'low')
        return 'light';
    if (input.energy === 'good' || (input.unitDay ?? 0) >= 3)
        return 'deep';
    return 'standard';
}
/** 时间预算 → 计划观看/复盘分钟数（允许只看片段，不强求整段视频） */
export function planInputMinutes(input: {
    availableMinutes: number;
    durationMinutes: number;
    mode: InputMode;
}): {
    watchMinutes: number;
    reflectionMinutes: number;
} {
    const spec = input.mode === 'light' ? 1 : input.mode === 'standard' ? 4 : 8;
    const available = Math.max(5, input.availableMinutes);
    const reflectionMinutes = Math.min(spec, Math.max(1, Math.round(available * 0.2)));
    const watchMinutes = Math.max(1, Math.min(input.durationMinutes || available, available - reflectionMinutes));
    return { watchMinutes, reflectionMinutes };
}
