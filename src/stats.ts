import type { Data, ReviewRecord, Word } from './types.ts';
import { effectiveDue } from './fsrs.ts';
export const isWeak = (w: Word) => ['unknown', 'vague'].includes(w.state.level);
export function dayKey(at: number) { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
export function recordStats(rs: ReviewRecord[]) { return { attempts: rs.length, unique: new Set(rs.map(r => r.wordId)).size, accuracy: rs.length ? rs.filter(r => r.correct).length / rs.length : 0, meanMs: rs.length ? rs.reduce((n, r) => n + r.ms, 0) / rs.length : 0 }; }
export function summary(d: Data, now = Date.now()) {
    const auth: 'legacy' | 'fsrs' = d.settings?.schedulingAuthority === 'legacy' ? 'legacy' : 'fsrs';
    const today = d.records.filter(r => dayKey(r.at) === dayKey(now));
    const changes = new Map<string, {
        before: string;
        after: string;
    }>();
    for (const r of [...today].sort((a, b) => a.at - b.at)) {
        const v = changes.get(r.wordId);
        changes.set(r.wordId, { before: v?.before || r.before, after: r.after });
    }
    const weak = (x: string) => x === 'unknown' || x === 'vague';
    const effective = d.words.filter(w => w.state.level === 'fluent' && now <= effectiveDue(w, auth)).length;
    return { today: recordStats(today), effective, due: d.words.filter(w => w.state.total && effectiveDue(w, auth) <= now).length, weak: d.words.filter(isWeak).length, newWeak: [...changes.values()].filter(c => !weak(c.before) && weak(c.after)).length, resolved: [...changes.values()].filter(c => weak(c.before) && !weak(c.after)).length, directions: { 'en-zh': recordStats(d.records.filter(r => r.direction === 'en-zh')), 'zh-en': recordStats(d.records.filter(r => r.direction === 'zh-en')) } };
}
export function trend(d: Data, days: number, now = Date.now()) {
    const groups = new Map<string, ReviewRecord[]>();
    for (const r of d.records) {
        const k = dayKey(r.at);
        if (!groups.has(k))
            groups.set(k, []);
        groups.get(k)!.push(r);
    }
    return Array.from({ length: days }, (_, i) => { const date = new Date(now); date.setDate(date.getDate() - (days - i - 1)); const key = dayKey(date.getTime()); const rs = groups.get(key) || []; return { date: key, ...recordStats(rs), gained: rs.filter(r => r.before !== 'fluent' && r.after === 'fluent').length, forgotten: rs.filter(r => r.scheduled && !r.correct).length }; });
}
