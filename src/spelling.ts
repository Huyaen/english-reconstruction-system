import type { SpellingAttempt, Word } from './types.ts';
import { uid } from './core.ts';

// v1：只合并空白及排印撇号。保留大小写、连字符、其他标点和词序。
export function normalizeSpelling(value: string): string {
    return value.trim().replace(/\s+/gu, ' ').replace(/[‘’]/gu, "'");
}
function senses(value: string): string[] {
    return value.replace(/\b(?:vt|vi|adj|adv|n|v|prep|conj|pron|num|art|int|aux|abbr)\./gi, '')
        .split(/[;；,，、/\n]+/u).map(s => s.replace(/[\s。.!！?？()（）【】\[\]]/gu, '')).filter(Boolean);
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
    // 索引所有释义中的连续子串，避免每次取题对整本词书做平方比较。
    // 一个释义是另一释义的连续部分（至少两个字）时也保守排除。
    const exact = new Map<string, Set<string>>(), fragments = new Map<string, Set<string>>();
    for (const w of vocabulary) for (const sense of senses(w.zh)) {
        const answer = normalizeSpelling(w.en);
        const set = exact.get(sense) ?? new Set(); set.add(answer); exact.set(sense, set);
        // 只索引实际出现的释义，后续用首两个字符缩小重叠检查范围。
        for (let i = 0; i + 1 < sense.length; i++) {
            const key = sense.slice(i, i + 2), values = fragments.get(key) ?? new Set();
            values.add(sense); fragments.set(key, values);
        }
    }
    const excluded: Array<{ wordId: string; reason: string }> = [];
    const words = candidates.filter(w => {
        let reason = usable(w);
        if (!reason) for (const sense of senses(w.zh)) {
            const related = new Set([sense, ...(sense.length >= 2 ? fragments.get(sense.slice(0, 2)) ?? [] : [])]);
            // 较短的另一释义也可能在当前释义中间出现。
            for (let i = 0; i + 1 < sense.length; i++) for (const v of fragments.get(sense.slice(i, i + 2)) ?? []) related.add(v);
            for (const other of related) {
                if (sense !== other && (Math.min(sense.length, other.length) < 2 || !(sense.includes(other) || other.includes(sense)))) continue;
                if ([...(exact.get(other) ?? [])].some(en => en !== normalizeSpelling(w.en))) { reason = '释义与其他词重叠，无法确定唯一答案'; break; }
            }
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
