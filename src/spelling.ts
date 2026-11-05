import type { SpellingAttempt, Word } from './types.ts';
import { uid } from './core.ts';

// v1：只合并空白及排印撇号。保留大小写、连字符、其他标点和词序。
export function normalizeSpelling(value: string): string {
    return value.trim().replace(/\s+/gu, ' ').replace(/[‘’]/gu, "'");
}
function senses(value: string): string[] {
    // 括号内的逗号/顿号是限定语枚举，不是独立词义（如“上（船、火车、公共汽车）”）。
    const parts: string[] = []; let part = '', depth = 0;
    for (const c of value.replace(/\b(?:vt|vi|adj|adv|n|v|prep|conj|pron|num|art|int|aux|abbr)\./gi, '')) {
        if ('（(【['.includes(c)) depth++;
        if (/[;；/\n]/u.test(c) || (!depth && /[,，、]/u.test(c))) { parts.push(part); part = ''; }
        else part += c;
        if ('）)】]'.includes(c)) depth = Math.max(0, depth - 1);
    }
    parts.push(part);
    return parts.map(s => s.replace(/[\s。.!！?？()（）【】\[\]]/gu, '')).filter(Boolean);
}
function usable(w: Word): string | null {
    if (!w.en.trim() || w.en.length > 500 || /[/／;；|]/u.test(w.en)) return '合并词条无法确定唯一拼写';
    if (!/^[A-Za-z][A-Za-z\s'’‘-]*$/u.test(w.en)) return '当前仅支持英文单词与短语';
    const escaped = normalizeSpelling(w.en).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, 'i').test(normalizeSpelling(`${w.zh} ${w.pos}`))) return '题面中含英文答案';
    if (!senses(w.zh).length) return '缺少可用中文释义';
    return null;
}
export function buildSpellingQueue(candidates: Word[], vocabulary: Word[]) {
    // 共享完整释义片段才视为歧义；“激光”与“激光唱片”不能仅因子串相同而排除。
    const exact = new Map<string, Set<string>>();
    for (const w of vocabulary) for (const sense of senses(w.zh)) {
        const answer = normalizeSpelling(w.en);
        const set = exact.get(sense) ?? new Set(); set.add(answer); exact.set(sense, set);
    }
    const excluded: Array<{ wordId: string; reason: string }> = [];
    const words = candidates.filter(w => {
        let reason = usable(w);
        if (!reason) for (const sense of senses(w.zh)) {
            if ([...(exact.get(sense) ?? [])].some(en => en !== normalizeSpelling(w.en))) reason = '释义与其他词重叠，无法确定唯一答案';
            if (reason) break;
        }
        if (reason) { excluded.push({ wordId: w.id, reason }); return false; }
        return true;
    });
    return { words, excluded };
}
export function spellingAttempt(word: Word, input: string, sessionId: string, assisted: boolean, retry: boolean, ms: number, now = Date.now()): SpellingAttempt {
    return { id: uid(), sessionId, wordId: word.id, at: now, input, expected: word.en, correct: normalizeSpelling(input) === normalizeSpelling(word.en), assisted, retry, ms: Math.max(0, ms), normalizationVersion: 1 };
}
