import type { Data, Settings } from './types.ts';
import { dayKey } from './stats.ts';
import { isForgotten } from './evidence.ts';
const DAY = 86400000;
export const STUBBORN_CONFIG = { windowDays: 60, snoozeDays: 7, recognitionRounds: 6, independentRounds: 4 } as const;
export interface StubbornReason { kind: 'consecutive' | 'forgetting' | 'confusion' | 'spelling' | 'context'; message: string; count: number; otherWordId?: string }
export interface StubbornReport { wordId: string; reasons: StubbornReason[]; lastAt: number }
type Attempt = { id: string; wordId: string; sessionId: string; at: number };
function firstBySession<T extends Attempt>(items: T[], now: number, independent: (a: T) => boolean): Map<string, T[]> {
    const ids = new Set<string>(), grouped = new Map<string, Map<string, T>>();
    for (const a of items) {
        if (ids.has(a.id) || !a.sessionId || !Number.isFinite(a.at) || a.at <= 0 || a.at > now || now - a.at > STUBBORN_CONFIG.windowDays * DAY) continue;
        ids.add(a.id); const sessions = grouped.get(a.wordId) ?? new Map<string, T>(), prior = sessions.get(a.sessionId);
        if (!prior || a.at < prior.at || a.at === prior.at && a.id < prior.id) sessions.set(a.sessionId, a);
        grouped.set(a.wordId, sessions);
    }
    // 先取本轮第一次，再排除辅助/重练，防止同一轮后续重试伪装独立样本。
    return new Map([...grouped].map(([id, sessions]) => [id, [...sessions.values()].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id)).filter(independent)]));
}
function enough(items: Attempt[], count: number, days: number, span: number): boolean {
    return items.length >= count && new Set(items.map(a => dayKey(a.at))).size >= days && items.at(-1)!.at - items[0].at >= span;
}
export function analyzeStubborn(d: Pick<Data, 'words' | 'records' | 'spellingAttempts' | 'clozeAttempts' | 'settings'>, now = Date.now()): StubbornReport[] {
    const choice = firstBySession(d.records, now, () => true);
    const spelling = firstBySession(d.spellingAttempts, now, a => a.assisted === false && a.retry === false);
    const context = firstBySession(d.clozeAttempts, now, a => a.assisted === false && a.retry === false && a.source === 'saved-reading' && !['ai', 'ai_reinforcement'].includes(a.sourceType));
    const words = new Map(d.words.map(w => [w.id, w])), reports: StubbornReport[] = [];
    for (const w of words.values()) {
        if ((d.settings.stubbornSnoozedUntil?.[w.id] ?? 0) > now) continue;
        const allChoice = choice.get(w.id) ?? [], c = allChoice.slice(-STUBBORN_CONFIG.recognitionRounds), s = (spelling.get(w.id) ?? []).slice(-STUBBORN_CONFIG.independentRounds), x = (context.get(w.id) ?? []).slice(-STUBBORN_CONFIG.independentRounds);
        const reasons: StubbornReason[] = [], recognition = enough(c, 6, 3, 2 * DAY);
        if (recognition) {
            if (c.slice(-3).every(r => !r.correct)) reasons.push({ kind: 'consecutive', count: 3, message: '最近6个跨日独立会话中，最后3次选择题均未答对。可先重新理解释义，再按原计划巩固。' });
            const forgottenDays = new Set(c.filter(r => !r.correct && r.before !== 'new' && allChoice.some(p => p.correct && r.at - p.at >= DAY)).map(r => dayKey(r.at)));
            if (isForgotten(w) && !c.at(-1)!.correct && forgottenDays.size >= 3) reasons.push({ kind: 'forgetting', count: forgottenDays.size, message: `曾答对后，最近6个独立会话在${forgottenDays.size}天又未能回忆；已有间隔遗忘证据。先检查理解，再按原计划巩固。` });
            const pairs = new Map<string, typeof c>();
            for (const r of c) if (!r.correct && r.selectedId && r.selectedId !== w.id && words.has(r.selectedId)) { const rs = pairs.get(r.selectedId) ?? []; rs.push(r); pairs.set(r.selectedId, rs); }
            for (const [id, rs] of pairs) if ((w.confusions[id] ?? 0) >= 3 && rs.length >= 3 && new Set(rs.map(r => dayKey(r.at))).size >= 2) reasons.push({ kind: 'confusion', count: rs.length, otherWordId: id, message: `最近6个独立会话中有${rs.length}次错选同一词，涉及至少2天。可对照已有词条释义；不推断未记录的错误原因。` });
        }
        if (enough(s, 4, 2, DAY) && s.filter(a => !a.correct).length >= 3) {
            const n = s.filter(a => !a.correct).length, correct = c.filter(r => r.correct).length;
            reasons.push({ kind: 'spelling', count: n, message: `${recognition && correct >= 4 ? `选择题近6轮答对${correct}次，` : ''}拼写近4个跨日非辅助独立轮次有${n}次未写对。可以试试这个词的拼写回忆。` });
        }
        if (enough(x, 4, 2, DAY) && x.filter(a => !a.correct).length >= 3) reasons.push({ kind: 'context', count: x.filter(a => !a.correct).length, message: `原句回忆近4个跨日非辅助独立轮次有${x.filter(a => !a.correct).length}次与原文词形不同。若仍有可用原句，可回看上下文后再尝试。` });
        if (reasons.length) reports.push({ wordId: w.id, reasons, lastAt: Math.max(c.at(-1)?.at ?? 0, s.at(-1)?.at ?? 0, x.at(-1)?.at ?? 0) });
    }
    return reports.sort((a, b) => b.lastAt - a.lastAt || a.wordId.localeCompare(b.wordId));
}
export function snoozeStubborn(settings: Settings, wordId: string, now = Date.now()): Settings {
    return { ...settings, stubbornSnoozedUntil: { ...Object.fromEntries(Object.entries(settings.stubbornSnoozedUntil ?? {}).filter(([, until]) => until > now)), [wordId]: now + STUBBORN_CONFIG.snoozeDays * DAY } };
}

/** 先前关闭落盘后再读取最新设置，避免不同词条的并行关闭互相覆盖。 */
export function queueStubbornDismissals(read: () => Settings, save: (settings: Settings) => Promise<void>) {
    let pending = Promise.resolve();
    return (wordId: string): Promise<void> => {
        const task = pending.catch(() => {}).then(() => save(snoozeStubborn(read(), wordId)));
        pending = task; return task;
    };
}
