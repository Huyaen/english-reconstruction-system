import type { ClozeAttempt, Passage, ReadingSession, Word } from './types.ts';
import { uid } from './core.ts';
import { tokenizeSentence, normalizeToken } from './readingText.ts';
import { normalizeSpelling, buildSpellingQueue } from './spelling.ts';
export interface ClozeQuestion {
    id: string; wordId: string; passageId: string; readingSessionId: string; markId: string;
    sentenceIndex: number; original: string; masked: string; start: number; end: number;
    expected: string; lemma: string; zh: string; pos: string; markedAt: number;
    sourceType: string; sourceTitle: string; sourceUrl: string;
}
// 只用于已标记词与词库的保守关联，不生成答案；答案永远是保存原文的精确词形。
function forms(en: string): string[] {
    const b = normalizeToken(en), out = [b, b + 's', b + 'es', b + 'ed', b + 'ing'];
    if (/y$/.test(b)) out.push(b.slice(0, -1) + 'ies', b.slice(0, -1) + 'ied');
    if (/e$/.test(b)) out.push(b + 'd', b.slice(0, -1) + 'ing');
    if (/[aeiou][bcdfgmnprt]$/.test(b)) out.push(b + b.at(-1) + 'ed', b + b.at(-1) + 'ing');
    const irregular: Record<string, string[]> = { go: ['went', 'gone'], be: ['am', 'is', 'are', 'was', 'were', 'been'], have: ['has', 'had'], do: ['does', 'did', 'done'], child: ['children'], foot: ['feet'], tooth: ['teeth'], mouse: ['mice'], person: ['people'], write: ['wrote', 'written'], see: ['saw', 'seen'], take: ['took', 'taken'], run: ['ran'] };
    return [...new Set([...out, ...(irregular[b] ?? [])])];
}
export function buildClozeQueue(sessions: ReadingSession[], passages: Passage[], vocabulary: Word[]) {
    const questions: ClozeQuestion[] = [], excluded: Array<{ markId: string; reason: string }> = [];
    const byPassage = new Map(passages.map(p => [p.id, p]));
    const byForm = new Map<string, Word[]>();
    for (const w of vocabulary) for (const f of forms(w.en)) { const list = byForm.get(f) ?? []; list.push(w); byForm.set(f, list); }
    const unambiguous = new Set(buildSpellingQueue(vocabulary, vocabulary).words.map(w => w.id));
    const seen = new Set<string>();
    for (const session of sessions) for (const mark of session.detail?.marks ?? []) {
        if (mark.revokedAt || !['unknown', 'vague'].includes(mark.judgment)) continue;
        let reason = '';
        const p = byPassage.get(mark.passageId), s = p?.sentences?.find(s => s.index === mark.sentenceIndex);
        if (!p || p.id !== session.passageId || session.id !== mark.sessionId || ['ai', 'ai_reinforcement'].includes(p.sourceType) || p?.sourceReliability === 'ai_generated') reason = '缺少可核验的非AI阅读来源';
        else if (!s || s.text !== mark.contextSentence || p.text.slice(s.start, s.end) !== s.text || s.paragraphIndex !== mark.paragraphIndex) reason = '原句或位置无法核验';
        const matches = byForm.get(normalizeToken(mark.surface)) ?? [];
        // 显式 lemma 可关联派生词形；不存在时不做任意词根截断或语义猜测。
        const linked = mark.lemma ? vocabulary.filter(w => normalizeToken(w.en) === normalizeToken(mark.lemma!)) : matches;
        const answers = new Map(linked.map(w => [normalizeSpelling(w.en), w]));
        const w = answers.size === 1 ? [...answers.values()][0] : undefined;
        if (!reason && (!w || !unambiguous.has(w.id))) reason = '词条关联/释义存在歧义或缺少中文释义';
        if (!reason) {
            const escaped = mark.surface.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            if (new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, 'i').test(`${w?.zh} ${w?.pos}`)) reason = '提示中泄漏原文词形';
        }
        const tokens = p && s ? tokenizeSentence(p.text, s) : [];
        const targets = tokens.filter(t => t.surface === mark.surface);
        const related = w ? new Set([...forms(w.en), normalizeToken(mark.surface)]) : new Set<string>();
        if (!reason && (targets.length !== 1 || tokens.filter(t => related.has(t.normalized)).length !== 1)) reason = '同句重复词或词形泄漏答案';
        if (!reason && (!s || s.text.length > 2000 || !/^[A-Za-z][A-Za-z'’‘-]*$/.test(mark.surface))) reason = '目标格式不支持';
        if (reason || !w || !p || !s) { excluded.push({ markId: mark.id, reason }); continue; }
        const t = targets[0], start = t.start - s.start, end = t.end - s.start;
        const id = `${p.id}:${s.index}:${t.start}:${w.id}`;
        if (seen.has(id)) continue; seen.add(id);
        questions.push({ id, wordId: w.id, passageId: p.id, readingSessionId: session.id, markId: mark.id, sentenceIndex: s.index,
            original: s.text, masked: s.text.slice(0, start) + '_____' + s.text.slice(end), start, end,
            expected: t.surface, lemma: w.en, zh: w.zh, pos: w.pos, markedAt: mark.at,
            sourceType: p.sourceType, sourceTitle: p.title, sourceUrl: p.sourceUrl });
    }
    return { questions, excluded };
}
export function clozeAttempt(q: ClozeQuestion, input: string, sessionId: string, assisted: boolean, retry: boolean, ms: number, at = Date.now()): ClozeAttempt {
    return { id: uid(), sessionId, wordId: q.wordId, passageId: q.passageId, readingSessionId: q.readingSessionId, markId: q.markId,
        sentenceIndex: q.sentenceIndex, sentence: q.original, start: q.start, end: q.end, expected: q.expected, lemma: q.lemma,
        input, correct: normalizeSpelling(input) === normalizeSpelling(q.expected), assisted, retry,
        ms: Math.max(0, ms), at, markedAt: q.markedAt, source: 'saved-reading', sourceType: q.sourceType, sourceTitle: q.sourceTitle, sourceUrl: q.sourceUrl, normalizationVersion: 1 };
}
