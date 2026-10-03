import type { Word, Settings, Direction, Mastery, Question } from './types.ts';
export const uid = () => crypto.randomUUID();
export const norm = (s: string) => s.trim().toLowerCase().normalize('NFKC');
export const labels: Record<Mastery, string> = { new: '未测试', unknown: '不会', vague: '模糊', normal: '正常', fluent: '熟练' };
export function makeWord(fields: Partial<Word> & {
    en: string;
    zh: string;
}, bookId: string, order: number): Word { return { id: uid(), bookId, en: fields.en.trim(), zh: fields.zh.trim(), pos: fields.pos || '', phonetic: fields.phonetic || '', example: fields.example || '', collocation: fields.collocation || '', difficulty: fields.difficulty || '', tags: fields.tags || '', order, state: { total: 0, correct: 0, streak: 0, errors: 0, lapses: 0, meanMs: 0, lastMs: 0, lastCorrect: false, level: 'new', directions: { 'en-zh': { total: 0, correct: 0, meanMs: 0 }, 'zh-en': { total: 0, correct: 0, meanMs: 0 } } }, schedule: { due: 0, last: 0, interval: 0, step: 0, spacedPasses: 0 }, confusions: {}, recognitionScore: 0, activeRecallScore: 0, productiveScore: 0, exposureCount: 0, contextExposureCount: 0, productionEvidence: 0, previewedAt: 0, lastEncounteredAt: 0, sourceTypes: ['book'], fsrs: { stability: 0, difficulty: 0, state: 0, reps: 0, lapses: 0, due: 0, lastReview: 0, scheduledDays: 0, learningSteps: 0 }, previewResult: '' }; }
export function classify(correct: boolean, ms: number, s: Settings): Mastery {
    if (!correct || ms >= s.timeout)
        return 'unknown';
    if (ms <= s.fast)
        return 'fluent';
    if (ms <= s.normal)
        return 'normal';
    return 'vague';
}
const intervals = [900000, 14400000, 86400000, 259200000, 604800000, 1209600000, 2592000000, 5184000000, 10368000000];
export function review(word: Word, correct: boolean, ms: number, direction: Direction, settings: Settings, now = Date.now()): Word {
    const w = structuredClone(word), st = w.state, sc = w.schedule;
    const grade = classify(correct, ms, settings);
    correct = correct && grade !== 'unknown';
    const scheduled = st.total > 0 && now >= sc.due;
    st.meanMs = (st.meanMs * st.total + ms) / (st.total + 1);
    st.total++;
    st.correct += Number(correct);
    st.lastMs = ms;
    st.lastCorrect = correct;
    st.streak = correct ? st.streak + 1 : 0;
    st.errors = correct ? 0 : st.errors + 1;
    if (!correct && word.state.lastCorrect)
        st.lapses++;
    const ds = st.directions[direction];
    ds.meanMs = (ds.meanMs * ds.total + ms) / (ds.total + 1);
    ds.total++;
    ds.correct += Number(correct);
    if (!correct) {
        sc.interval = 600000;
        sc.due = now + sc.interval;
        sc.step = 0;
        sc.spacedPasses = 0;
    }
    else if (!word.state.total || scheduled) {
        if (scheduled)
            sc.spacedPasses++;
        sc.step = grade === 'vague' ? Math.max(0, sc.step - 1) : Math.min(intervals.length - 1, sc.step + Number(scheduled));
        const speed = grade === 'fluent' && sc.step >= 3 ? 1.3 : grade === 'vague' ? 0.7 : 1;
        const penalty = 1 / (1 + Math.min(st.lapses, 5) * 0.12);
        sc.interval = Math.max(600000, Math.round(intervals[sc.step] * speed * penalty));
        sc.due = now + sc.interval;
    }
    sc.last = now;
    const both = Object.values(st.directions).every(d => d.correct >= 2 && d.correct / d.total >= 0.8);
    st.level = grade === 'unknown' ? 'unknown' : grade === 'vague' || st.streak < 2 ? 'vague' : grade === 'fluent' && both && sc.spacedPasses >= 3 && st.streak >= 4 ? 'fluent' : 'normal';
    return w;
}
export function priority(w: Word, now = Date.now()): number {
    const s = w.state;
    if (!s.total)
        return 45;
    const base = { unknown: 80, vague: 60, normal: 20, fluent: 0, new: 45 }[s.level];
    const weakDirection = Math.max(...Object.values(s.directions).map(d => d.total ? 1 - d.correct / d.total : 0.5));
    const overdue = w.schedule.interval ? Math.min(20, Math.max(0, (now - w.schedule.due) / w.schedule.interval) * 10) : 0;
    return base + (1 - s.correct / s.total) * 15 + weakDirection * 10 + Math.min(s.errors, 4) * 4 + Math.min(s.lapses, 5) * 2 + Math.min(5, s.lastMs / 2000) + Math.min(5, Object.values(w.confusions).reduce((a, b) => a + b, 0)) + overdue - Math.min(5, s.streak);
}
export function priorityGrade(w: Word) { const p = priority(w); return p >= 90 ? 'S' : p >= 65 ? 'A' : p >= 40 ? 'B' : p >= 15 ? 'C' : 'D'; }
export function shuffle<T>(items: T[], random = Math.random): T[] {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}
export function senses(s: string): string[] { return norm(s).replace(/\b(?:n|v|adj|adv|vt|vi|prep|pron)\./g, '').split(/[;；、,，/]/).map(x => x.replace(/[\s。()（）]/g, '')).filter(Boolean); }
export function overlaps(a: Word, b: Word): boolean { const bs = new Set(senses(b.zh)); return norm(a.en) === norm(b.en) || senses(a.zh).some(x => bs.has(x)); }
function similarity(a: string, b: string) { const aa = new Set(norm(a).split('')); return [...new Set(norm(b).split(''))].filter(x => aa.has(x)).length / Math.max(1, Math.max(a.length, b.length)); }
export function question(target: Word, pool: Word[], direction: Direction, difficulty: Settings['difficulty']): Question {
    const n = difficulty === 'hard' ? 6 : 4;
    const seen = new Set([norm(direction === 'en-zh' ? target.zh : target.en)]);
    // Rank once from a bounded candidate sample for large books; always include historical confusions and nearby entries.
    const sampled = pool.length > 1200 ? [...pool.filter(w => target.confusions[w.id] || w.bookId === target.bookId && Math.abs(w.order - target.order) < 40), ...Array.from({ length: 1100 }, () => pool[Math.floor(Math.random() * pool.length)])] : pool;
    const candidates = sampled.filter(w => w.id !== target.id && !overlaps(target, w)).map(w => ({ w, score: difficulty === 'easy' ? Math.random() : Math.random() * 0.6 + (w.pos && w.pos === target.pos ? 2 : 0) + (w.difficulty && w.difficulty === target.difficulty ? 1 : 0) + similarity(w.en, target.en) * 3 + similarity(w.zh, target.zh) + (w.bookId === target.bookId ? 1 / (1 + Math.abs(w.order - target.order) / 10) : 0) + Math.min(5, target.confusions[w.id] || 0) })).sort((a, b) => b.score - a.score);
    const chosen: Word[] = [];
    for (const { w } of candidates) {
        const key = norm(direction === 'en-zh' ? w.zh : w.en);
        if (seen.has(key) || chosen.some(c => overlaps(c, w)))
            continue;
        seen.add(key);
        chosen.push(w);
        if (chosen.length === n - 1)
            break;
    }
    if (chosen.length < n - 1)
        throw Error(`需要至少 ${n} 个释义互不重叠的词才能生成${n}选项题；请补充词库或降低难度。`);
    return { wordId: target.id, direction, options: shuffle([target, ...chosen].map(w => w.id)) };
}
export function validSettings(s: Settings): boolean { return Number.isFinite(s.fast) && s.fast > 0 && s.fast < s.normal && s.normal < s.timeout && s.timeout <= 120000 && Number.isFinite(s.ratio) && s.ratio >= 0 && s.ratio <= 100 && ['easy', 'normal', 'hard'].includes(s.difficulty) && [-1, 0, 500, 1000].includes(s.feedback) && ['light', 'dark'].includes(s.theme) && ['endpoint', 'model', 'key'].every(k => typeof s[k as keyof Settings] === 'string') && typeof s.rememberKey === 'boolean' && ['legacy', 'fsrs'].includes(s.schedulingAuthority) && Number.isFinite(s.requestRetention) && s.requestRetention >= 0.5 && s.requestRetention <= 0.99; }
