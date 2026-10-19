// —— Phase 5：阅读难度估算（纯函数，可解释，全部标为“估算”）——
// 关键纪律：词库里没有的词 ≠ 用户不会的词。四分类：known / uncertain / unknown / no-evidence。
// no-evidence 单独统计并压低置信度，绝不并入 unknownRate。
import type { ReadingDifficultyReport, ReadingSentence, Word } from './types.ts';
import { countWords, normalizeToken } from './readingText.ts';
export type TokenKnowledge = 'known' | 'uncertain' | 'unknown' | 'no-evidence';
export interface KnowledgeModel {
    words: Word[];
    knownVocabSize?: number;
    grammarWeakCount?: number;
    historyWpm?: number | null;
    topicFamiliarity?: 'familiar' | 'neutral' | 'unfamiliar' | null;
}
export const DIFFICULTY_WEIGHTS = {
    unknownRate: 2.2,
    sentenceLength: 1.3,
    clauseDepth: 0.9,
    grammarWeakness: 0.25,
} as const;
export function classifyToken(word: Word | undefined): TokenKnowledge {
    if (!word)
        return 'no-evidence';
    const total = word.state?.total ?? 0;
    if (total <= 0)
        return 'uncertain'; // 词库里有、但从没测过：既不能算会，也不能算不会
    const level = word.state.level;
    if (level === 'fluent' || level === 'normal')
        return 'known';
    if (level === 'unknown')
        return 'unknown';
    return 'uncertain'; // vague / new
}
// 常见的从属结构与关系词：用于粗估从句密度（不是语法解析，只作难度信号）
const SUBORDINATORS = ['that', 'which', 'who', 'whom', 'whose', 'when', 'where', 'while', 'although', 'though',
    'because', 'since', 'unless', 'if', 'whereas', 'whether', 'after', 'before', 'until', 'as', 'so', 'such'];
export function clauseDepthOf(sentence: ReadingSentence): number {
    const words = sentence.text.toLowerCase().match(/[a-z']+/g) ?? [];
    let depth = 0;
    for (const w of words)
        if (SUBORDINATORS.includes(w))
            depth += 1;
    const commas = (sentence.text.match(/,/g) ?? []).length;
    depth += Math.min(2, Math.floor(commas / 2));
    if (/\b\w+ing\b|\b\w+ed\b/.test(sentence.text) && commas > 0)
        depth += 1;
    return depth;
}
export function estimateReadingDifficulty(input: {
    sentences: ReadingSentence[];
    text: string;
    model: KnowledgeModel;
}): ReadingDifficultyReport & {
    distinctUnknownTokens: string[];
} {
    const byToken = new Map<string, Word>();
    for (const w of input.model.words)
        byToken.set(normalizeToken(w.en), w);
    const tokens = input.text.match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g) ?? [];
    const total = tokens.length || 1;
    let known = 0, uncertain = 0, unknown = 0, noEvidence = 0;
    const unknownSet = new Set<string>();
    for (const surface of tokens) {
        const key = normalizeToken(surface);
        const k = classifyToken(byToken.get(key));
        if (k === 'known')
            known++;
        else if (k === 'uncertain')
            uncertain++;
        else if (k === 'unknown') {
            unknown++;
            unknownSet.add(key);
        }
        else {
            noEvidence++;
            unknownSet.add(key);
        }
    }
    const knownCoverage = known / total;
    const estimatedUnknownRate = (unknown + uncertain * 0.5) / total;
    const noEvidenceRate = noEvidence / total;
    const uncertainRate = uncertain / total;
    const sentenceCount = Math.max(1, input.sentences.length);
    const avgSentenceLength = countWords(input.text) / sentenceCount;
    const depthAvg = input.sentences.reduce((a, s) => a + clauseDepthOf(s), 0) / sentenceCount;
    const grammarWeak = input.model.grammarWeakCount ?? 0;
    const vocabSize = input.model.knownVocabSize ?? input.model.words.length;
    const raw = DIFFICULTY_WEIGHTS.unknownRate * (estimatedUnknownRate * 5)
        + DIFFICULTY_WEIGHTS.sentenceLength * Math.max(0, (avgSentenceLength - 12) / 8)
        + DIFFICULTY_WEIGHTS.clauseDepth * Math.min(3, depthAvg)
        + DIFFICULTY_WEIGHTS.grammarWeakness * Math.min(6, grammarWeak);
    const difficulty = Math.max(1, Math.min(5, Math.round((raw + 0.6) * 10) / 10));
    const wpm = input.model.historyWpm && input.model.historyWpm > 40 ? input.model.historyWpm : 110;
    const estimatedMinutes = Math.max(1, Math.ceil(countWords(input.text) / (wpm * (1 - Math.min(0.35, estimatedUnknownRate * 0.5)))));
    const reasons: string[] = [];
    reasons.push(`已知词覆盖约 ${Math.round(knownCoverage * 100)}%（${known}/${total} 词）`);
    if (unknown + uncertain > 0)
        reasons.push(`可能陌生约 ${Math.round(estimatedUnknownRate * 100)}%（其中已确认不会 ${unknown} 词）`);
    if (noEvidenceRate > 0)
        reasons.push(`另有 ${Math.round(noEvidenceRate * 100)}% 的词不在词库里——这不等于你不会，只是还没有证据`);
    reasons.push(`平均句长 ${avgSentenceLength.toFixed(1)} 词，从句密度 ${depthAvg.toFixed(1)}`);
    if (grammarWeak > 0)
        reasons.push(`当前有 ${grammarWeak} 个语法概念被标记为薄弱，可能放大长句难度`);
    const evidenceDensity = (known + uncertain + unknown) / total;
    let confidence: 'low' | 'medium' | 'high' = 'low';
    if (vocabSize >= 500 && evidenceDensity >= 0.75)
        confidence = 'high';
    else if (vocabSize >= 150 && evidenceDensity >= 0.5)
        confidence = 'medium';
    if (confidence === 'low')
        reasons.push('词库证据还很稀疏，难度只是粗略估计（首次使用尤其明显）');
    let classification: ReadingDifficultyReport['classification'] = 'too-hard';
    if (knownCoverage >= 0.9)
        classification = 'comfort';
    else if (knownCoverage >= 0.8)
        classification = 'growth';
    else if (knownCoverage >= 0.65)
        classification = 'stretch';
    if (input.model.topicFamiliarity === 'familiar' && classification === 'stretch')
        classification = 'growth';
    if (input.model.topicFamiliarity === 'unfamiliar' && classification === 'comfort')
        classification = 'growth';
    return {
        difficulty,
        knownCoverage,
        estimatedUnknownRate,
        uncertainRate,
        noEvidenceRate,
        estimatedMinutes,
        confidence,
        reasons,
        classification,
        distinctUnknownTokens: [...unknownSet],
    };
}
export function classificationLabel(c: ReadingDifficultyReport['classification']): string {
    return ({ comfort: '舒适区（很容易读懂）', growth: '成长区（略有挑战）', stretch: '拉伸区（会读得吃力）', 'too-hard': '过难（建议先换一篇）' })[c];
}
