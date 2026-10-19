// —— Phase 5：阅读中的词汇捕获 ——
// 纪律：
// 1. Unknown Rate 必须区分 explicit（用户点出来的）/ estimated（按词库四分类估算），并携带
//    denominator / evidence source / sample coverage / confidence / method——不允许假精度。
// 2. 阅读只是接触（exposure），绝不因为“读过这篇文章”提升任何词的 mastery。
// 3. 学习价值复用 Phase 2 的 learningValue()，不另造一套优先级系统。
// 4. 新词没有中文释义时不得进入 Preview/Recall（不编造释义），只能标记为“待补释义”。
import type { ExposureState, ReadingMark, Word, WordExposure } from './types.ts';
import { makeWord, norm, uid } from './core.ts';
import { learningValue, looksProperNoun } from './pools.ts';
export interface RateMetric {
    value: number | null;
    numerator: number;
    denominator: number;
    method: string;
    source: 'explicit_marks' | 'vocabulary_model' | 'mixed';
    sampleCoverage: number;
    confidence: 'low' | 'medium' | 'high';
    note: string;
}
const pct = (n: number) => Math.round(n * 1000) / 10;
// 用户显式标出的生词率：分母是全文词数，样本覆盖只算“被标记过的不同词”
export function explicitUnknownRate(marks: ReadingMark[], wordCount: number, distinctTokensRead = 0): RateMetric {
    const active = marks.filter(m => !m.revokedAt);
    const unknown = new Set(active.filter(m => m.judgment === 'unknown').map(m => m.normalized));
    const denominator = Math.max(0, wordCount);
    const coverage = denominator > 0 ? Math.min(1, active.length / denominator) : 0;
    const value = denominator > 0 ? pct(unknown.size / denominator) : null;
    return {
        value,
        numerator: unknown.size,
        denominator,
        method: 'unknown 标记数 / 全文词数',
        source: 'explicit_marks',
        sampleCoverage: coverage,
        confidence: coverage >= 0.2 ? 'medium' : 'low',
        note: distinctTokensRead > 0
            ? `你只标记了 ${active.length} 处（覆盖 ${pct(coverage)}% 的正文）；未标记不等于认识`
            : '未标记不等于认识：这是“显式生词率”，不是真实生词率',
    };
}
// 估算生词率：用词库四分类（known / uncertain / unknown / no-evidence）；未知词库部分不算“不会”
export function estimatedUnknownRate(marks: ReadingMark[], tokens: string[], lookup: (normalized: string) => Word | undefined): RateMetric {
    const total = tokens.length || 0;
    if (!total)
        return { value: null, numerator: 0, denominator: 0, method: 'no-token', source: 'vocabulary_model', sampleCoverage: 0, confidence: 'low', note: '没有可统计的词' };
    let unknown = 0, uncertain = 0, noEvidence = 0;
    for (const t of tokens) {
        const w = lookup(norm(t));
        if (!w) {
            noEvidence++;
            continue;
        }
        const total2 = w.state?.total ?? 0;
        if (total2 <= 0)
            uncertain++;
        else if (w.state.level === 'unknown')
            unknown++;
        else if (w.state.level === 'vague')
            uncertain++;
    }
    const estimate = (unknown + uncertain * 0.5) / total;
    const coverage = 1 - noEvidence / total;
    return {
        value: pct(estimate),
        numerator: unknown,
        denominator: total,
        method: '(已确认不会 + 0.5 × 不确定) / 全文词数',
        source: 'vocabulary_model',
        sampleCoverage: coverage,
        confidence: coverage >= 0.75 ? 'medium' : 'low',
        note: `其中 ${noEvidence} 个词不在词库里——不等于你不会，只是还没有证据`,
    };
}
export function vocabularyCoverageEstimate(marks: ReadingMark[], tokens: string[], lookup: (n: string) => Word | undefined): RateMetric {
    const total = tokens.length || 0;
    let known = 0;
    for (const t of tokens) {
        const w = lookup(norm(t));
        if (w && (w.state?.level === 'normal' || w.state?.level === 'fluent') && (w.state?.total ?? 0) > 0)
            known++;
    }
    return {
        value: total ? pct(known / total) : null,
        numerator: known,
        denominator: total,
        method: '已知掌握词数 / 全文词数',
        source: 'mixed',
        sampleCoverage: 1,
        confidence: total >= 200 ? 'medium' : 'low',
        note: marks.length ? '结合阅读中的标记与词库掌握状态' : '仅按词库掌握状态估算',
    };
}
export type StudyWordBucket = 'core' | 'recognition' | 'low-value' | 'proper-noun';
export interface StudyCandidate {
    normalized: string;
    surface: string;
    occurrences: number;
    contextSentence: string;
    judgment: ExposureState;
    bucket: StudyWordBucket;
    score: number;
    reasons: string[];
    existingWordId: string | null;
    needsDefinition: boolean;
}
const FUNCTION_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for', 'with',
    'is', 'are', 'was', 'were', 'be', 'been', 'it', 'its', 'this', 'that', 'these', 'those', 'he', 'she', 'they',
    'we', 'you', 'i', 'as', 'by', 'from', 'not', 'no', 'so', 'if', 'than', 'then', 'there', 'their', 'his', 'her']);
export interface SelectStudyOptions {
    maxCandidates?: number;
    coreThreshold?: number;
}
// 从标记里挑“值得学”的词：core（进 Vocabulary）/ recognition（练识别）/ low-value / proper-noun
export function selectStudyCandidates(marks: ReadingMark[], words: Word[], opts: SelectStudyOptions = {}): StudyCandidate[] {
    const byNorm = new Map<string, Word>();
    for (const w of words)
        byNorm.set(norm(w.en), w);
    const active = marks.filter(m => !m.revokedAt);
    const groups = new Map<string, ReadingMark[]>();
    for (const m of active) {
        const list = groups.get(m.normalized) ?? [];
        list.push(m);
        groups.set(m.normalized, list);
    }
    const coreThreshold = opts.coreThreshold ?? 12;
    const out: StudyCandidate[] = [];
    for (const [normalized, group] of groups) {
        if (FUNCTION_WORDS.has(normalized))
            continue;
        const first = group[0];
        const existing = byNorm.get(normalized);
        const judgment = group.some(g => g.judgment === 'unknown') ? 'unknown'
            : group.some(g => g.judgment === 'vague') ? 'vague'
                : group.some(g => g.judgment === 'guessed') ? 'guessed' : 'known';
        const allCapitalized = group.every(g => /^[A-Z]/.test(g.surface));
        const proper = !existing && allCapitalized && group.length <= 2;
        const synthetic = existing ?? makeWord({ en: first.surface, zh: '' }, 'reading', 1200 + out.length);
        const value = learningValue({ ...synthetic, exposureCount: group.length });
        const reasons = [...value.reasons];
        let bucket: StudyWordBucket = 'recognition';
        if (proper || (looksProperNoun(synthetic) && !existing)) {
            bucket = 'proper-noun';
            reasons.push('proper-noun');
        }
        else if (judgment === 'unknown' && (value.score >= coreThreshold || group.length >= 3)) {
            bucket = 'core';
            reasons.push('unknown-and-valuable');
        }
        else if (judgment === 'guessed') {
            bucket = 'recognition';
            reasons.push('guessed-from-context');
        }
        else if (value.score < coreThreshold && group.length === 1) {
            bucket = 'low-value';
            reasons.push('single-occurrence-low-value');
        }
        if (judgment === 'unknown' && group.length >= 2)
            reasons.push(`appears-x${group.length}`);
        out.push({
            normalized,
            surface: first.surface,
            occurrences: group.length,
            contextSentence: first.contextSentence,
            judgment,
            bucket,
            score: Math.round((value.score + (judgment === 'unknown' ? 8 : judgment === 'vague' ? 4 : 0)) * 10) / 10,
            reasons,
            existingWordId: existing?.id ?? null,
            needsDefinition: !existing || !existing.zh || !existing.zh.trim(),
        });
    }
    const order: Record<StudyWordBucket, number> = { core: 0, recognition: 1, 'low-value': 2, 'proper-noun': 3 };
    out.sort((a, b) => order[a.bucket] - order[b.bucket] || b.score - a.score || a.normalized.localeCompare(b.normalized));
    const max = opts.maxCandidates ?? 40;
    return out.slice(0, max);
}
export interface HandoffPlan {
    link: Array<{
        wordId: string;
        en: string;
        sentence: string;
    }>;
    create: Array<{
        en: string;
        sentence: string;
        needsDefinition: true;
    }>;
    skipped: Array<{
        en: string;
        reason: string;
    }>;
}
// 交给 Vocabulary Engine 的计划：已有词只关联；新词创建但**不**写掌握、**不**直接进 Recall
export function buildHandoffPlan(candidates: StudyCandidate[]): HandoffPlan {
    const plan: HandoffPlan = { link: [], create: [], skipped: [] };
    for (const c of candidates) {
        if (c.bucket === 'proper-noun') {
            plan.skipped.push({ en: c.normalized, reason: 'proper-noun' });
            continue;
        }
        if (c.bucket === 'low-value') {
            plan.skipped.push({ en: c.normalized, reason: 'low-value' });
            continue;
        }
        if (c.existingWordId)
            plan.link.push({ wordId: c.existingWordId, en: c.surface, sentence: c.contextSentence });
        else
            plan.create.push({ en: c.surface, sentence: c.contextSentence, needsDefinition: true });
    }
    return plan;
}
// 接触记录：sourceType='reading'，counted=false（接触不等于回忆成功）
export function exposureFromMark(mark: ReadingMark, wordId: string, at = Date.now()): WordExposure {
    return {
        id: uid(),
        wordId,
        at,
        sourceType: 'reading',
        sourceId: mark.sessionId,
        state: mark.judgment,
        sentence: mark.contextSentence,
        counted: false,
    };
}
// 阅读新词入库时的最小词条：不带释义、不带掌握证据，sourceTypes 记为 reading
export function readingWordSeed(surface: string, bookId: string, order: number, now: number): Word {
    const w = makeWord({ en: surface, zh: '' }, bookId, order);
    return { ...w, sourceTypes: ['reading'], previewResult: 'needs-definition', previewedAt: now, lastEncounteredAt: now };
}
// 用户补上释义后才能进入 Preview / Recall
export function readyForTraining(w: Word): boolean {
    return !!w.zh && w.zh.trim().length > 0;
}
