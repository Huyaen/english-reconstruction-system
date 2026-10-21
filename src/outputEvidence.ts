// —— Phase 9：Productive Evidence（产出证据）——
// 纪律：
//  * 写过一次 ≠ 掌握；证据要带独立性/辅助/照抄标记；
//  * AI 反馈本身不产生掌握；错误反馈只产生"候选薄弱"；
//  * 同一 attempt + word 只写一条（幂等），并发/刷新不翻倍。
import type { OutputAttempt, OutputFeedback, OutputRepairRecord, ProductiveEvidence, ProductiveEvidenceSource } from './types.ts';
import type { IndependenceClass } from './outputScaffolding.ts';
export interface EvidenceWord {
    id: string;
    en: string;
}
export interface ExtractInput {
    attemptId: string;
    text: string;
    words: EvidenceWord[];
    independence: IndependenceClass;
    feedback?: OutputFeedback | null;
    repair?: OutputRepairRecord | null;
    transfer?: boolean;
    delayed?: boolean;
    now?: number;
}
export function evidenceKey(attemptId: string, wordId: string): string {
    return `${attemptId}:${wordId}`;
}
export function extractProductiveEvidence(input: ExtractInput): ProductiveEvidence[] {
    const now = input.now ?? Date.now();
    const text = String(input.text ?? '');
    const out: ProductiveEvidence[] = [];
    const spans = input.feedback ? [...input.feedback.priorityIssues, ...input.feedback.corrections] : [];
    for (const w of input.words) {
        const hit = findWord(text, w.en);
        if (!hit)
            continue;
        const related = spans.filter(s => s.targetWordId === w.id || (s.type === 'vocabulary_choice' && s.original.toLowerCase().includes(w.en.toLowerCase())));
        const wrong = related.some(s => s.severity === 'blocking' || s.severity === 'major');
        const questionable = related.length > 0 && !wrong;
        const source: ProductiveEvidenceSource = input.transfer ? 'output_transfer'
            : input.delayed ? 'output_delayed'
                : input.independence.copied ? 'output_copied'
                    : input.independence.independent ? 'output_independent' : 'output_assisted';
        out.push({
            id: evidenceKey(input.attemptId, w.id),
            wordId: w.id,
            outputAttemptId: input.attemptId,
            textSpan: hit.word,
            context: sentenceAround(text, hit.start, hit.end),
            independent: input.independence.independent,
            assisted: input.independence.assisted,
            copied: input.independence.copied,
            correctness: wrong ? 'wrong' : (questionable || (input.independence.copied && related.length === 0)) ? 'questionable' : 'correct',
            confidence: input.independence.independent ? 0.45 : input.independence.assisted ? 0.3 : 0.1,
            evidenceSource: source,
            at: now,
        });
    }
    return out;
}
export function findWord(text: string, en: string): {
    start: number;
    end: number;
    word: string;
} | null {
    const w = String(en ?? '').trim();
    if (!w)
        return null;
    const alts = wordVariants(w).map(escapeRe).join('|');
    // 词边界：前后不能再接字母/数字/下划线；前面是 # 也不算命中（#aqueduct ≠ aqueduct）
    const re = new RegExp(`(^|[^A-Za-z0-9_#])(${alts})(?![A-Za-z0-9_])`, 'i');
    const m = re.exec(text);
    if (!m)
        return null;
    const start2 = m.index + (m[1]?.length ?? 0);
    const word = m[2]!;
    return { start: start2, end: start2 + word.length, word };
}
/** 只覆盖规则变化：复数、过去式、进行时；不规则动词不猜（避免误判掌握） */
function wordVariants(w: string): string[] {
    const base = w.toLowerCase();
    const set = new Set<string>([base]);
    set.add(`${base}s`);
    if (/(s|x|z|ch|sh)$/.test(base))
        set.add(`${base}es`);
    if (base.endsWith('y') && base.length > 1 && !/[aeiou]y$/.test(base)) {
        set.add(`${base.slice(0, -1)}ies`);
        set.add(`${base.slice(0, -1)}ied`);
    }
    else {
        set.add(`${base}ed`);
        set.add(`${base}d`);
    }
    if (base.endsWith('e'))
        set.add(`${base.slice(0, -1)}ing`);
    else
        set.add(`${base}ing`);
    if (/[^aeiou][aeiou][bdgklmnprt]$/.test(base))
        set.add(`${base}${base.slice(-1)}ed`);
    return [...set];
}
function escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
export function sentenceAround(text: string, start: number, end: number): string {
    const before = Math.max(text.lastIndexOf('.', start), text.lastIndexOf('!', start), text.lastIndexOf('?', start));
    const candidates = [text.indexOf('.', end), text.indexOf('!', end), text.indexOf('?', end)].filter(i => i >= 0);
    const after = candidates.length ? Math.min(...candidates) : text.length;
    return text.slice(before + 1, after + 1).trim().slice(0, 240);
}
/** 证据 → 能力增量：独立/迁移/延迟更高；照抄与 AI 反馈不提升 */
export function productiveDelta(e: ProductiveEvidence): number {
    if (e.copied)
        return 0;
    if (e.correctness === 'wrong')
        return -0.06;
    if (e.correctness === 'questionable')
        return e.independent ? 0.02 : 0;
    const base = e.evidenceSource === 'output_transfer' ? 0.12
        : e.evidenceSource === 'output_delayed' ? 0.1
            : e.evidenceSource === 'output_independent' ? 0.08 : 0.02;
    return base;
}
export interface WordScorePatch {
    productiveScore: number;
    productionEvidence: number;
    activeRecallScore: number;
    confidence: number;
}
/** 有界更新：单次最多 +0.12，总分封顶 0.95；出现新错误允许下降 */
export function applyEvidenceScores(word: {
    productiveScore?: number;
    productionEvidence?: number;
    activeRecallScore?: number;
    exposureCount?: number;
}, evidence: ProductiveEvidence[], now = Date.now()): WordScorePatch {
    let score = clamp(word.productiveScore ?? 0, 0, 0.95);
    let recall = clamp(word.activeRecallScore ?? 0, 0, 1);
    let count = Math.max(0, word.productionEvidence ?? 0);
    let confidence = 0.2;
    for (const e of evidence) {
        if (e.copied) {
            confidence = Math.min(confidence, 0.1);
            continue;
        }
        const delta = productiveDelta(e);
        score = clamp(score + delta, 0, 0.95);
        if (delta > 0 && e.independent)
            recall = clamp(recall + Math.min(0.05, delta / 2), 0, 1);
        if (delta > 0)
            count += 1;
        confidence = Math.max(confidence, e.confidence);
    }
    return { productiveScore: round3(score), productionEvidence: count, activeRecallScore: round3(recall), confidence: round3(confidence) };
}
function clamp(n: number, lo: number, hi: number): number {
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}
function round3(n: number): number {
    return Math.round(n * 1000) / 1000;
}
/** 合并新旧证据：按 id 去重，新证据覆盖旧证据 */
export function mergeEvidence(existing: ProductiveEvidence[] | undefined, incoming: ProductiveEvidence[]): ProductiveEvidence[] {
    const map = new Map<string, ProductiveEvidence>();
    for (const e of existing ?? [])
        map.set(e.id, e);
    for (const e of incoming)
        map.set(e.id, e);
    return [...map.values()].sort((a, b) => a.at - b.at);
}
/** 是否为"独立产出"证据：只有这类可以进入 productive mastery 路径 */
export function isIndependentEvidence(e: ProductiveEvidence): boolean {
    return e.independent && !e.assisted && !e.copied && e.evidenceSource !== 'output_copied';
}
/** 把 AI 反馈转成"候选薄弱"，不直接改 mastery */
export interface CandidateWeakness {
    kind: 'grammar' | 'vocabulary' | 'support';
    refId: string;
    weight: number;
    reason: string;
    at: number;
}
export function candidateWeaknesses(attempt: OutputAttempt, now = Date.now()): CandidateWeakness[] {
    const out: CandidateWeakness[] = [];
    if ((attempt.supportLevel ?? 0) >= 3)
        out.push({ kind: 'support', refId: 'support', weight: 0.2, reason: `最近一次表达需要 L${attempt.supportLevel} 辅助`, at: now });
    const fb = attempt.feedback;
    if (!fb)
        return out;
    for (const id of fb.grammarConceptIds)
        out.push({ kind: 'grammar', refId: id, weight: 0.3, reason: 'AI 疑似语法错误（未验证）', at: now });
    for (const id of fb.targetWordIds)
        out.push({ kind: 'vocabulary', refId: id, weight: 0.25, reason: 'AI 认为该词使用有问题（未验证）', at: now });
    return out;
}
