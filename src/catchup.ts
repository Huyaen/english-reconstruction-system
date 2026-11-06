import type { CatchupAllocation, DailyPlan, EnergyState, ReviewRecord, Settings, Word } from './types.ts';
import { effectiveDue, fsrsRetrievability } from './fsrs.ts';
import { priority } from './core.ts';
import { dayKey, isWeak } from './stats.ts';
import { decideRecovery, latestLearningAt, localDayNumber, PLANNER_CONFIG } from './planner.ts';
export interface CatchupInput { words: Word[]; records: ReviewRecord[]; settings: Settings; now: number; cap: number; minutes: number; lastActivityAt?: number | null }
function bounds(i: CatchupInput) {
    if (!Number.isInteger(i.cap) || i.cap < 1 || i.cap > 500) throw Error('每日上限须为 1–500 个词');
    if (!Number.isFinite(i.minutes) || i.minutes < 0 || i.minutes > PLANNER_CONFIG.budget.max) throw Error('复习时间预算无效');
    return Math.min(i.cap, Math.floor(i.minutes / PLANNER_CONFIG.minutesPerDueWord));
}
function reviewedToday(i: CatchupInput): Set<string> {
    return new Set(i.records.filter(r => localDayNumber(r.at) === localDayNumber(i.now) && r.before !== 'new').map(r => r.wordId));
}
function dueWords(i: CatchupInput): Word[] { return i.words.filter(w => w.state.total > 0 && effectiveDue(w, i.settings.schedulingAuthority) <= i.now); }
export function catchupStatus(i: CatchupInput) {
    const capacity = bounds(i), dueTotal = dueWords(i).length, reviewed = reviewedToday(i).size;
    const recovery = decideRecovery(i.lastActivityAt ?? latestLearningAt(i.records), i.now);
    return { dueTotal, capacity, reviewedToday: reviewed, remainingCapacity: Math.max(0, capacity - reviewed), missedDays: recovery.missedDays ?? 0,
        recommended: dueTotal > 0 && (dueTotal > capacity || recovery.kind !== 'none') };
}
/** 只分配呈现顺序；绝不改 Word/FSRS/ReviewRecord。当天固定快照，跨日生成新快照。 */
export function allocateCatchup(i: CatchupInput, existing?: CatchupAllocation): CatchupAllocation {
    const status = catchupStatus(i), date = dayKey(i.now);
    if (existing?.date === date && existing.cap === i.cap && existing.budgetMinutes === i.minutes) return existing;
    const reviewed = reviewedToday(i), due = dueWords(i).filter(w => !reviewed.has(w.id));
    const count = Math.min(status.remainingCapacity, due.length), recentErrors = new Map<string, number>();
    for (const r of i.records) if (!r.correct && r.at <= i.now && i.now - r.at <= 14 * 86400000) recentErrors.set(r.wordId, (recentErrors.get(r.wordId) ?? 0) + 1);
    const risk = new Map(due.map(w => {
        const retrievability = fsrsRetrievability(w.fsrs, i.settings, i.now);
        const age = Math.max(0, (i.now - effectiveDue(w, i.settings.schedulingAuthority)) / 86400000);
        return [w.id, (1 - (retrievability ?? 0.5)) * 50 + priority(w, i.now) * 0.2 + (isWeak(w) ? 20 : 0) + Math.min(20, (recentErrors.get(w.id) ?? 0) * 4) + Math.min(180, age) * 0.2];
    }));
    const oldest = [...due].sort((a, b) => effectiveDue(a, i.settings.schedulingAuthority) - effectiveDue(b, i.settings.schedulingAuthority) || a.id.localeCompare(b.id));
    // 小于4个名额时每4天保底一次；常规名额至少25%留给最长积压，避免长期饿死。
    const reserve = count >= 4 ? Math.ceil(count / 4) : localDayNumber(i.now) % 4 === 0 ? Math.min(1, count) : 0;
    const selected = oldest.slice(0, reserve).map(w => w.id), used = new Set(selected);
    const groups = new Map<string, Word[]>();
    for (const w of due) if (!used.has(w.id)) { const key = `${w.bookId}:${isWeak(w) ? 'weak' : 'other'}`; const list = groups.get(key) ?? []; list.push(w); groups.set(key, list); }
    for (const list of groups.values()) list.sort((a, b) => risk.get(b.id)! - risk.get(a.id)! || a.id.localeCompare(b.id));
    const keys = [...groups.keys()].sort(), offset = keys.length ? localDayNumber(i.now) % keys.length : 0;
    while (selected.length < count) {
        let progressed = false;
        for (let n = 0; n < keys.length && selected.length < count; n++) { const w = groups.get(keys[(n + offset) % keys.length])!.shift(); if (w) { selected.push(w.id); progressed = true; } }
        if (!progressed) break;
    }
    return { date, cap: i.cap, budgetMinutes: i.minutes, wordIds: selected, dueTotal: status.dueTotal, createdAt: Math.max(i.now, (existing?.createdAt ?? 0) + 1), active: true };
}
export function remainingCatchup(a: CatchupAllocation, i: CatchupInput): string[] {
    if (a.date !== dayKey(i.now) || !a.active) return [];
    const done = reviewedToday(i), available = new Set(i.words.map(w => w.id));
    return a.wordIds.filter(id => available.has(id) && !done.has(id)).slice(0, catchupStatus(i).remainingCapacity);
}
export function applyCatchupToPlan(plan: DailyPlan, i: CatchupInput): DailyPlan {
    const lexical = (module: string) => module === 'vocabulary' || module === 'closing';
    const unexpected = plan.initialPlan.some(t => lexical(t.module) && t.source !== 'catchup' && !['done', 'skipped', 'replaced'].includes(t.status));
    if (!unexpected && plan.catchup?.active && plan.catchup.date === dayKey(i.now) && plan.catchup.cap === i.cap && plan.catchup.planMinutes === plan.availableMinutes) return plan;
    const kept = plan.initialPlan.filter(t => t.status === 'done' || !lexical(t.module));
    const active = kept.filter(t => !['delayed', 'skipped', 'replaced'].includes(t.status));
    const spentOrReserved = active.reduce((sum, t) => sum + (t.status === 'done' ? t.actualMinutes ?? t.minutes : t.minutes), 0);
    const minutes = Math.max(0, Math.min(i.minutes, plan.availableMinutes - spentOrReserved));
    const allocation = { ...allocateCatchup({ ...i, minutes }, plan.catchup), planMinutes: plan.availableMinutes };
    const tasks = plan.initialPlan.map(t => lexical(t.module) && t.status !== 'done' && t.status !== 'skipped'
        ? { ...t, status: 'replaced' as const, note: `${t.note} · 回归模式暂缓：原任务保留，恢复正常模式时重排。` } : t);
    const remaining = remainingCatchup(allocation, { ...i, minutes });
    const dueMinutes = Math.round(remaining.length * PLANNER_CONFIG.minutesPerDueWord * 100) / 100;
    if (remaining.length) tasks.push({ id: `${plan.date}.catchup.${plan.revision ?? 0}.${tasks.filter(t => t.source === 'catchup').length}`, module: 'vocabulary', kind: 'due-review', label: '按每日上限回归复习', minutes: dueMinutes,
        refs: remaining, status: 'pending', note: '只分配呈现，不修改未复习词到期日。', source: 'catchup', critical: false, flexible: false, dependencies: [] });
    const planned = Math.round((spentOrReserved + dueMinutes) * 100) / 100;
    const prior = plan.budget && typeof plan.budget === 'object' ? plan.budget as Record<string, unknown> : {};
    return { ...plan, catchup: allocation, initialPlan: tasks, budget: { ...prior, planned, unallocated: Math.max(0, plan.availableMinutes - planned),
        catchup: { plannedWords: allocation.wordIds.length, deferred: Math.max(0, allocation.dueTotal - allocation.wordIds.length), minutes: dueMinutes, newWordsPaused: true } } };
}
export function adjustCatchupPlan(plan: DailyPlan, i: CatchupInput, energy: EnergyState): DailyPlan {
    bounds(i);
    // 回归期间只调整回归分配；正常重排会重新创建已暂缓的新词任务。
    const reserved = plan.initialPlan.filter(t => t.status === 'done' || !['vocabulary', 'closing'].includes(t.module) && !['delayed', 'skipped', 'replaced'].includes(t.status))
        .reduce((n, t) => n + (t.status === 'done' ? t.actualMinutes ?? t.minutes : t.minutes), 0);
    if (i.minutes < reserved) throw Error(`其他任务及已投入时间需要 ${reserved} 分钟，请先调整这些任务。`);
    if (plan.availableMinutes === i.minutes && plan.catchup?.cap === i.cap) return { ...plan, energyState: energy };
    return applyCatchupToPlan({ ...plan, availableMinutes: i.minutes, energyState: energy, catchup: plan.catchup ? { ...plan.catchup, planMinutes: undefined } : undefined }, i);
}
