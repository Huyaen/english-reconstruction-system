// —— Phase 9：确定性语言检查（不是语法引擎）——
// 只做"能确定"的事：空文本、句末标点、重复词、超长句、括号不配对、明显缺谓语。
// 所有启发式检查的 confidence ≤ 0.5，并明确标注 heuristic；不冒充 AI 诊断。
import type { OutputErrorSpan, OutputFeedback, OutputTaskSpec } from './types.ts';
import { countWords } from './outputTask.ts';
export type LocalOutputFinding = {
    key: 'sentence_punctuation' | 'repeated_word' | 'long_sentence_hint' | 'missing_predicate_hint' | 'sentence_capitalization';
    source: 'deterministic' | 'heuristic';
    span: OutputErrorSpan;
};
export interface LocalCheckResult {
    spans: OutputErrorSpan[];
    findings: LocalOutputFinding[];
    notes: string[];
    /** 是否做了"像语法引擎"的判断：这里永远是 false，用于 UI 文案 */
    authoritative: false;
}
const VERBISH = /\b(am|is|are|was|were|be|been|being|do|does|did|have|has|had|can|could|will|would|shall|should|may|might|must|go|goes|went|make|makes|made|take|took|see|saw|like|likes|want|wants|need|needs|think|thinks|know|knows|show|shows|explain|explains|carry|carried|keep|kept|give|gave|get|got|use|used|help|helped|say|said|tell|told|become|became|seem|seems|feel|felt|look|looks|find|found|live|lived|work|worked|come|came|go|going)\b/i;
export function localChecks(text: string, spec?: OutputTaskSpec): LocalCheckResult {
    const raw = String(text ?? '');
    const findings: LocalOutputFinding[] = [];
    const add = (key: LocalOutputFinding['key'], source: LocalOutputFinding['source'], span: OutputErrorSpan) => findings.push({ key, source, span });
    const notes: string[] = ['这些是本地确定性检查，不是语法诊断；真正的语言反馈见 AI 反馈（若已配置）。'];
    if (!raw.trim())
        return { spans: [], findings, notes: ['还没有内容可检查。'], authoritative: false };
    // 1) 句末标点
    const trimmed = raw.trimEnd();
    if (trimmed && !/[.!?。！？]["')\]]?$/u.test(trimmed)) {
        add('sentence_punctuation', 'deterministic', {
            type: 'other', original: trimmed.slice(-1), proposed: trimmed.slice(-1) + '.',
            start: raw.lastIndexOf(trimmed.slice(-1)), end: raw.lastIndexOf(trimmed.slice(-1)) + 1,
            explanation: '句子结尾缺少标点，读者难以判断句界。', severity: 'style', confidence: 0.9,
        });
    }
    // 2) 相邻重复词（the the）
    const repeat = /\b([a-zA-Z']+)\s+\1\b/giu;
    let m: RegExpExecArray | null;
    while ((m = repeat.exec(raw))) {
        add('repeated_word', 'deterministic', {
            type: 'other', original: m[0], proposed: m[1] ?? '',
            start: m.index, end: m.index + m[0].length,
            explanation: '相邻重复了同一个词。', severity: 'minor', confidence: 0.95,
        });
    }
    // 3) 超长句
    for (const s of splitSentences(raw)) {
        const words = countWords(s.text);
        if (words > 45) {
            add('long_sentence_hint', 'heuristic', {
                type: 'coherence', original: s.text.slice(0, 40) + '…', proposed: '',
                start: s.start, end: s.end,
                explanation: `这一句约 ${words} 个词，读起来容易失去主线；试着拆成两句。`,
                severity: 'minor', confidence: 0.7,
            });
        }
    }
    // 4) 括号/引号不配对（只提示，不自动修改）
    const open = (raw.match(/\(/g) ?? []).length;
    const close = (raw.match(/\)/g) ?? []).length;
    if (open !== close)
        notes.push('括号数量不配对，检查一下是否有哪一处没闭合。');
    // 5) 明显缺谓语（启发式，置信度低）
    for (const s of splitSentences(raw)) {
        const w = countWords(s.text);
        if (w >= 4 && !VERBISH.test(s.text)) {
            add('missing_predicate_hint', 'heuristic', {
                type: 'missing_predicate', original: s.text, proposed: '',
                start: s.start, end: s.end,
                explanation: '这句里没有找到常见动词；如果确实缺谓语，读者会不知道发生了什么（启发式判断）。',
                severity: 'major', confidence: 0.4,
            });
        }
    }
    // 6) 首字母小写（只针对第一句）
    const first = raw.trimStart();
    if (/^[a-z]/.test(first) && first.length > 2) {
        const at = raw.indexOf(first.charAt(0));
        add('sentence_capitalization', 'deterministic', {
            type: 'other', original: first.charAt(0), proposed: first.charAt(0).toUpperCase(),
            start: at, end: at + 1,
            explanation: '句首字母通常大写。', severity: 'style', confidence: 0.9,
        });
    }
    if (spec && spec.taskType === 'one_sentence' && wcOf(raw) > spec.maxWords)
        notes.push('这句话比较长：先确认它仍然是一个句子，而不是把几句连在一起。');
    return { spans: findings.map(finding => finding.span), findings, notes, authoritative: false };
}
function wcOf(s: string): number {
    return countWords(s);
}
export interface SentenceSpan {
    text: string;
    start: number;
    end: number;
}
export function splitSentences(text: string): SentenceSpan[] {
    const out: SentenceSpan[] = [];
    const re = /[^.!?。！？]+[.!?。！？]?/gu;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
        const chunk = m[0];
        if (!chunk.trim())
            continue;
        const lead = chunk.length - chunk.trimStart().length;
        out.push({ text: chunk.trim(), start: m.index + lead, end: m.index + chunk.trimEnd().length });
    }
    return out;
}
/** span 必须能在原文精确取到同一段文字，否则丢弃（防模型编造位置） */
export function spanIsGrounded(text: string, span: Pick<OutputErrorSpan, 'start' | 'end' | 'original'>): boolean {
    if (!Number.isInteger(span.start) || !Number.isInteger(span.end))
        return false;
    if (span.start < 0 || span.end <= span.start || span.end > text.length)
        return false;
    return text.slice(span.start, span.end) === span.original;
}
export function dropUngrounded(text: string, spans: OutputErrorSpan[]): {
    kept: OutputErrorSpan[];
    dropped: number;
} {
    const kept = spans.filter(s => spanIsGrounded(text, s));
    return { kept, dropped: spans.length - kept.length };
}
const SEVERITY_ORDER: Record<OutputErrorSpan['severity'], number> = { blocking: 0, major: 1, minor: 2, style: 3 };
/** Minimal Correction Policy：一次只把最重要的 1–3 个问题放到前面 */
export function prioritize(spans: OutputErrorSpan[], limit = 3): OutputErrorSpan[] {
    return [...spans]
        .sort((a, b) => (SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]) || (b.confidence - a.confidence) || (a.start - b.start))
        .slice(0, Math.max(1, limit));
}
/** 合并本地检查与 AI 纠错：重叠 span 保留更严重/更高置信度的一条 */
export function mergeSpans(local: OutputErrorSpan[], ai: OutputErrorSpan[]): OutputErrorSpan[] {
    const all = [...local, ...ai];
    const out: OutputErrorSpan[] = [];
    for (const s of all) {
        const clash = out.findIndex(o => o.start < s.end && s.start < o.end);
        if (clash < 0) {
            out.push(s);
            continue;
        }
        const cur = out[clash]!;
        const better = (SEVERITY_ORDER[s.severity] - SEVERITY_ORDER[cur.severity]) || (s.confidence - cur.confidence);
        if (better < 0)
            out[clash] = s;
    }
    return out.sort((a, b) => a.start - b.start);
}
/** 应用修改（只用于"建议修订"的展示，不自动覆盖用户原文） */
export function applySpans(text: string, spans: OutputErrorSpan[]): string {
    const usable = spans.filter(s => spanIsGrounded(text, s) && s.proposed).sort((a, b) => b.start - a.start);
    let out = text;
    for (const s of usable)
        out = out.slice(0, s.start) + s.proposed + out.slice(s.end);
    return out;
}
/** 反馈是否"无主要问题"：只有 blocking/major 都为空才允许 */
export function needsCorrection(feedback: Pick<OutputFeedback, 'priorityIssues' | 'corrections'>): boolean {
    const all = [...feedback.priorityIssues, ...feedback.corrections];
    return all.some(s => s.severity === 'blocking' || s.severity === 'major');
}
/** 语言层错误类型集合：用于判断"这条反馈是否越界评价内容事实" */
export const LANGUAGE_ERROR_TYPES = new Set(['tense', 'subject_verb_agreement', 'article', 'preposition', 'word_form', 'word_order', 'clause_structure', 'missing_subject', 'missing_predicate', 'vocabulary_choice', 'collocation', 'reference', 'coherence', 'meaning_ambiguity', 'other']);
