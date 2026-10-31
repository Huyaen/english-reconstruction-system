// —— Phase 5：把阅读接入 Daily Planner（不重写计划器，只提供任务描述）——
// 纪律：
// 1. 没有可读文章时不生成阅读任务（绝不造假文章任务）；只给出“去导入”的引导原因。
// 2. 任务时长服从 Time Budget First：由计划器按剩余预算裁剪。
// 3. 只把真实存在的东西作为任务目标：未完成会话 / 已导入文章 / 需要重读的旧文章。
import type { Passage, ReadingSession } from './types.ts';
import { isResumable } from './readingSession.ts';
export const READING_PLAN = {
    minMinutes: 8,
    preferMinutes: 15,
    maxMinutes: 30,
    maxTasks: 1,
    rereadBelow: 70, // 上次自评低于该值 → 排一次重读
} as const;
export type ReadingTaskKind = 'reading-continue' | 'reading-new' | 'reading-reread';
export interface ReadingTaskDescriptor {
    kind: ReadingTaskKind;
    minutes: number;
    passageIds: string[];
    sessionId: string | null;
    reasons: string[];
    priority: number;
    critical: boolean;
    flexible: boolean;
    label: string;
}
export interface ReadingPlanInput {
    passages: Passage[];
    sessions: ReadingSession[];
    now: number;
    availableMinutes: number;
    energy: 'low' | 'normal' | 'good';
}
function minutesFor(available: number, energy: 'low' | 'normal' | 'good', difficulty?: number | null): number {
    const base = energy === 'low' ? READING_PLAN.minMinutes : READING_PLAN.preferMinutes;
    const soft = difficulty && difficulty >= 4 ? 0.85 : 1;
    const want = Math.round(Math.max(base, Math.min(available, READING_PLAN.preferMinutes)) * soft);
    return Math.max(READING_PLAN.minMinutes, Math.min(READING_PLAN.maxMinutes, Math.min(available, want)));
}
// 选一篇“现在最合适”的文章：先未读，再按估计难度靠近成长区
export function pickPassage(passages: Passage[], sessions: ReadingSession[], now = Date.now()): Passage | null {
    if (!passages.length)
        return null;
    const readIds = new Set(sessions.map(s => s.passageId));
    const unread = passages.filter(p => !readIds.has(p.id));
    const pool = unread.length ? unread : passages;
    const scored = pool.map(p => {
        const d = p.estimatedDifficulty ?? 3;
        const fit = Math.abs(d - 2.6); // 2.6 作为“成长区”的中位难度
        const ageDays = Math.max(0, (now - (p.importedAt ?? p.createdAt)) / 86400000);
        const staleness = Math.min(3, ageDays / 7); // 放久了没读的文章略微优先
        return { p, score: fit - staleness * 0.1 };
    });
    scored.sort((a, b) => a.score - b.score || a.p.createdAt - b.p.createdAt);
    return scored[0]?.p ?? null;
}
export function planReadingTasks(input: ReadingPlanInput): ReadingTaskDescriptor[] {
    const { passages, sessions, availableMinutes, energy, now } = input;
    if (!passages.length || availableMinutes < READING_PLAN.minMinutes)
        return [];
    const open = sessions
        .filter(s => isResumable(s))
        .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
    const out: ReadingTaskDescriptor[] = [];
    const active = open[0];
    if (active) {
        const passage = passages.find(p => p.id === active.passageId);
        if (passage) {
            const done = active.detail?.chunks.length ? Math.round(((active.detail.chunkIndex + 1) / active.detail.chunks.length) * 100) : 0;
            out.push({
                kind: 'reading-continue',
                minutes: minutesFor(availableMinutes, energy, passage.estimatedDifficulty),
                passageIds: [passage.id],
                sessionId: active.id,
                reasons: ['unfinished-reading', `progress-${done}%`, `passage-${passage.wordCount}w`],
                priority: 85,
                critical: false,
                flexible: true,
                label: `继续阅读《${passage.title}》`,
            });
            return out.slice(0, READING_PLAN.maxTasks);
        }
    }
    const completed = sessions
        .filter(s => s.detail?.state === 'completed')
        .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
    const last = completed[0];
    if (last && typeof last.secondPassComprehension === 'number' && last.secondPassComprehension < READING_PLAN.rereadBelow) {
        const passage = passages.find(p => p.id === last.passageId);
        if (passage) {
            out.push({
                kind: 'reading-reread',
                minutes: minutesFor(availableMinutes, energy, passage.estimatedDifficulty),
                passageIds: [passage.id],
                sessionId: null,
                reasons: ['low-comprehension-last-time', `self-reported-${last.secondPassComprehension}%`, 'reread-with-fewer-hints'],
                priority: 60,
                critical: false,
                flexible: true,
                label: `重读《${passage.title}》（这次少用中文）`,
            });
            return out.slice(0, READING_PLAN.maxTasks);
        }
    }
    const passage = pickPassage(passages, sessions, now);
    if (passage) {
        out.push({
            kind: 'reading-new',
            minutes: minutesFor(availableMinutes, energy, passage.estimatedDifficulty),
            passageIds: [passage.id],
            sessionId: null,
            reasons: [`new-material-${passage.wordCount}w`, passage.estimatedDifficulty ? `est-difficulty-${passage.estimatedDifficulty}` : 'difficulty-unknown'],
            priority: 75,
            critical: false,
            flexible: true,
            label: `阅读《${passage.title}》`,
        });
    }
    return out.slice(0, READING_PLAN.maxTasks);
}
// 没有材料时的引导（不是任务，只是解释为什么今天没有阅读任务）
export function readingUnavailableReason(passages: Passage[]): string {
    return passages.length ? '' : '还没有阅读材料：先导入一篇文章（粘贴正文 / 上传 TXT / 截图取字），才会有真实阅读任务';
}
