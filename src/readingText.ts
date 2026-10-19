// —— Phase 5：阅读文本处理（纯函数，无 IO / DOM / DB）——
// 职责：规范化 → 段落切分 → 句子切分 → 词元切分（带原文位置）。
// 纪律：清洗只做“无损”变换（换行统一、NBSP 归一、行尾空白、多余空行），
// 绝不改写措辞、标点、引号、缩写、人名、数字或句子边界。
import type { ReadingParagraph, ReadingSentence, ReadingToken } from './types.ts';
export interface NormalizeResult {
    text: string;
    notes: string[];
}
// 无损失范化：只统一换行/空格字符，不改动字母与标点本身。
export function normalizeReadingText(raw: string): NormalizeResult {
    const notes: string[] = [];
    let text = String(raw ?? '');
    if (/\r\n?/.test(text)) {
        text = text.replace(/\r\n?/g, '\n');
        notes.push('crlf-to-lf');
    }
    if (/[\u00a0\u202f]/.test(text)) {
        text = text.replace(/[\u00a0\u202f]/g, ' ');
        notes.push('nbsp-to-space');
    }
    if (text.includes('\u00ad')) {
        text = text.replace(/\u00ad/g, '');
        notes.push('soft-hyphen-removed');
    }
    // NFC 而不是 NFKC：NFKC 会合并全角/连字并可能改变原文形态
    if (text !== text.normalize('NFC')) {
        text = text.normalize('NFC');
        notes.push('nfc');
    }
    const beforeLines = text.split('\n');
    const trimmedLines = beforeLines.map(l => l.replace(/[ \t]+$/g, ''));
    if (trimmedLines.some((l, i) => l !== beforeLines[i])) {
        text = trimmedLines.join('\n');
        notes.push('trailing-space');
    }
    if (/\n{3,}/.test(text)) {
        text = text.replace(/\n{3,}/g, '\n\n');
        notes.push('blank-lines-collapsed');
    }
    const out = text.replace(/^[ \t\n]+/, '').replace(/[ \t\n]+$/, '');
    if (out !== text)
        notes.push('outer-trim');
    return { text: out, notes };
}
// 段落切分：优先“空行分段”；整篇没有空行时才退化为“单换行分段”（且每行须像一段正文）。
export function segmentParagraphs(text: string): ReadingParagraph[] {
    if (!text.trim())
        return [];
    const blocks: Array<{
        start: number;
        end: number;
    }> = [];
    const blank = /\n[ \t]*\n/g;
    let cursor = 0;
    let m: RegExpExecArray | null;
    while ((m = blank.exec(text))) {
        blocks.push({ start: cursor, end: m.index });
        cursor = m.index + m[0].length;
    }
    blocks.push({ start: cursor, end: text.length });
    let spans = blocks.filter(b => text.slice(b.start, b.end).trim().length > 0);
    if (spans.length <= 1) {
        const lines: Array<{
            start: number;
            end: number;
        }> = [];
        let at = 0;
        for (const line of text.split('\n')) {
            const trimmed = line.trim();
            // 只有“像正文”的行才当作段落（避免把标题行、表格残片、孤立数字拆成段落）
            if (trimmed.length >= 40)
                lines.push({ start: at, end: at + line.length });
            at += line.length + 1;
        }
        if (lines.length > 1) {
            spans = lines;
        }
    }
    return spans.map((span, index) => {
        const raw = text.slice(span.start, span.end);
        const lead = raw.length - raw.replace(/^[ \t]+/, '').length;
        const body = raw.trim();
        const start = span.start + lead;
        return { index, text: body, start, end: start + body.length, wordCount: countWords(body) };
    });
}
const ABBREVIATIONS = new Set([
    'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'etc', 'inc', 'ltd', 'co', 'corp', 'no', 'nos',
    'fig', 'figs', 'al', 'eg', 'ie', 'cf', 'ed', 'eds', 'vol', 'vols', 'pp', 'p', 'approx', 'dept', 'est',
    'min', 'max', 'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec',
    'mon', 'tue', 'tues', 'wed', 'thu', 'thur', 'thurs', 'fri', 'sat', 'sun', 'am', 'pm', 'ad', 'bc', 'ce',
    'bce', 'usa', 'uk', 'us', 'eu', 'un', 'univ', 'assn', 'gov', 'sen', 'rep', 'capt', 'col', 'gen', 'lt',
]);
function lastWordBefore(text: string, dotIndex: number): string {
    let i = dotIndex;
    while (i > 0 && /[A-Za-z0-9.\-']/.test(text[i - 1]))
        i--;
    return text.slice(i, dotIndex).toLowerCase().replace(/\.$/, '');
}
// 句末判定：返回 true 表示 dotIndex 处的 . ! ? 是句子边界
function isSentenceBoundary(text: string, dotIndex: number, kind: 'dot' | 'mark'): boolean {
    const next = text.slice(dotIndex + 1);
    // 允许句末标点后跟引号/括号/省略号
    const tail = /^["'”’)\]]*/.exec(next)?.[0] ?? '';
    const after = next.slice(tail.length);
    if (!after)
        return true; // 文本结束
    if (!/^[ \t\n]/.test(after))
        return kind === 'mark'; // 后面没有空白：! ? 仍可能是边界（"Really?Yes" 罕见），句点不是
    const rest = after.replace(/^[ \t\n]+/, '');
    if (!rest)
        return true;
    const prevWord = lastWordBefore(text, dotIndex);
    const prevChar = dotIndex > 0 ? text[dotIndex - 1] : '';
    const nextChar = rest[0];
    if (kind === 'dot') {
        // 小数：3.14 / 1,000.50
        if (/[0-9]/.test(prevChar) && /[0-9]/.test(nextChar))
            return false;
        // 缩写：Mr. / Dr. / U.S. / e.g. / i.e. / etc.
        if (ABBREVIATIONS.has(prevWord))
            return false;
        if (/^[a-z]$/.test(prevWord) && /^[A-Za-z0-9]/.test(nextChar)) {
            // 单字母（J. K. Rowling）或 e.g. 这类带点的缩写
            const dotted = /[A-Za-z]\.[A-Za-z]\.$/.test(text.slice(Math.max(0, dotIndex - 4), dotIndex + 1));
            if (dotted)
                return false;
            if (/^[A-Z]/.test(prevWord) && /^[A-Z]/.test(nextChar))
                return false;
            return false;
        }
        // 句点后接小写字母：几乎总是同一句（如 "etc. and" 已被上面拦住）
        if (/^[a-z]/.test(nextChar))
            return false;
    }
    return true;
}
// 句子切分：保留原文位置（span 直接指向原文，便于“难句交给拆句”时取到精确片段）。
export function segmentSentences(text: string, paragraph: ReadingParagraph): ReadingSentence[] {
    const out: ReadingSentence[] = [];
    let start = paragraph.start;
    let i = paragraph.start;
    const end = paragraph.end;
    const push = (to: number) => {
        let s = start;
        let e = to;
        while (s < e && /[ \t\n]/.test(text[s]))
            s++;
        while (e > s && /[ \t\n]/.test(text[e - 1]))
            e--;
        if (e > s) {
            const body = text.slice(s, e);
            out.push({ index: out.length, paragraphIndex: paragraph.index, text: body, start: s, end: e, wordCount: countWords(body) });
        }
        start = to;
    };
    while (i < end) {
        const ch = text[i];
        if (ch === '.' || ch === '!' || ch === '?') {
            let j = i;
            while (j + 1 < end && (text[j + 1] === '.' || text[j + 1] === '!' || text[j + 1] === '?'))
                j++;
            const kind = ch === '.' ? 'dot' : 'mark';
            if (isSentenceBoundary(text, j, kind)) {
                // 吞掉句末引号/括号
                let k = j + 1;
                while (k < end && /["'”’)\]]/.test(text[k]))
                    k++;
                push(k);
                i = k;
                continue;
            }
            i = j + 1;
            continue;
        }
        i++;
    }
    if (start < end)
        push(end);
    return out;
}
const TOKEN_RE = /[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g;
export function countWords(text: string): number {
    const m = text.match(TOKEN_RE);
    return m ? m.length : 0;
}
export function tokenizeSentence(text: string, sentence: ReadingSentence): ReadingToken[] {
    const out: ReadingToken[] = [];
    TOKEN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = TOKEN_RE.exec(sentence.text))) {
        const surface = m[0];
        out.push({
            index: out.length,
            paragraphIndex: sentence.paragraphIndex,
            sentenceIndex: sentence.index,
            surface,
            normalized: normalizeToken(surface),
            lemma: null,
            start: sentence.start + m.index,
            end: sentence.start + m.index + surface.length,
        });
    }
    return out;
}
// 归一化：小写 + NFC；**不**做词形还原（lemma 不可靠时宁可为空，见 readingVocabulary）。
export function normalizeToken(surface: string): string {
    return surface.toLowerCase().normalize('NFC').replace(/[’]/g, "'");
}
export interface ParsedPassageText {
    text: string;
    paragraphs: ReadingParagraph[];
    sentences: ReadingSentence[];
    wordCount: number;
    notes: string[];
}
// 一次完成：规范化 + 段落 + 句子（tokens 按需生成，避免大文章重复切分）
export function parsePassageText(raw: string): ParsedPassageText {
    const { text, notes } = normalizeReadingText(raw);
    const paragraphs = segmentParagraphs(text);
    const sentences: ReadingSentence[] = [];
    for (const p of paragraphs)
        sentences.push(...segmentSentences(text, p));
    // 句子索引全篇唯一（segmentSentences 内部按段重置了 index）
    sentences.forEach((s, i) => { s.index = i; });
    return { text, paragraphs, sentences, wordCount: countWords(text), notes };
}
// 内容指纹：用于“重复导入”提示（FNV-1a 32 位，稳定且不泄露内容）
export function contentHash(text: string): string {
    const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();
    let h = 2166136261;
    for (let i = 0; i < normalized.length; i++)
        h = Math.imul(h ^ normalized.charCodeAt(i), 16777619);
    return (h >>> 0).toString(16).padStart(8, '0');
}
// 句子是否存在（供难句 handoff 校验 span 是否仍指向原文）
export function sentenceAtSpan(sentences: ReadingSentence[], start: number, end: number): ReadingSentence | null {
    return sentences.find(s => s.start === start && s.end === end) ?? null;
}
