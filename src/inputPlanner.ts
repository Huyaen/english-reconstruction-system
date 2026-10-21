// —— Phase 8：Input 任务的确定性排布（供 Phase 3 Planner 调用）——
// Time Budget First：只安排能装进剩余时间的片段，不强迫看完整个视频。
// 没有真实材料 → 不生成任务（也不生成假任务）。
import type { InputSession, InputSource } from './types.ts';
export interface InputTaskDescriptor {
    kind: 'input-session' | 'input-continue';
    sourceId: string;
    sessionId?: string;
    minutes: number;
    label: string;
    reasons: string[];
}
export function planInputTask(input: {
    sources: InputSource[];
    sessions: InputSession[];
    now: number;
    availableMinutes: number;
    energy: 'low' | 'normal' | 'good';
}): InputTaskDescriptor | null {
    const available = Math.floor(input.availableMinutes);
    if (available < 5)
        return null;
    const unfinished = (input.sessions ?? []).filter(s => s.status !== 'completed' && s.status !== 'abandoned' && s.status !== undefined).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0];
    if (unfinished) {
        const planned = unfinished.plannedMinutes ?? Math.min(20, available);
        return {
            kind: 'input-continue', sourceId: unfinished.sourceId, sessionId: unfinished.id,
            minutes: Math.max(5, Math.min(available, planned)),
            label: '继续上次真实输入',
            reasons: ['input-unfinished-session', `planned-${planned}min`],
        };
    }
    const usable = (input.sources ?? []).filter(s => s.url.startsWith('http'));
    if (!usable.length)
        return null;
    // 时间不够看完整段时优先短材料；同长度按标题稳定排序（确定性）
    const sorted = [...usable].sort((a, b) => {
        const da = a.durationMinutes || 999, db = b.durationMinutes || 999;
        if (da !== db)
            return da - db;
        return a.title.localeCompare(b.title);
    });
    const pick = sorted[0];
    const duration = pick.durationMinutes || 20;
    const want = input.energy === 'low' ? 10 : 15;
    const minutes = Math.max(5, Math.min(available, Math.min(duration, want)));
    return {
        kind: 'input-session', sourceId: pick.id, minutes,
        label: `真实输入：${pick.title}`,
        reasons: ['input-real-source', `source-${pick.id}`, duration > minutes ? `partial-watch-${minutes}/${duration}min` : `full-length-${minutes}min`],
    };
}
export function inputUnavailableReason(sources: InputSource[] | undefined): string | null {
    if (!sources || !sources.length)
        return '还没有真实材料：添加一个你真正想看的英文链接（任何主题）后才会有输入任务。';
    return null;
}
