// —— Phase 4：Adaptive Sentence Selection + Planner 任务描述 ——
// 设计依据：文本 §7（不得只按长度判断难度）、§17（Planner 句任务）；PROJECT_SPEC §47。
// 纪律：
//   1) 难度由真实指标决定：生词数量、目标语法结构数量、从句层级、句长、已知词汇覆盖率。
//      绝不允许"要练定语从句，结果被十几个陌生词卡住"。
//   2) 目标语法优先取真实弱点（BKT 状态 + 重复错误），并检查先修是否具备。
//   3) 没有可用真实句源时不生成任务，不伪造句子。
import type { GrammarAttempt, GrammarConcept, MiniUnit, SentenceAttempt, SentenceRecord, Word } from './types.ts';
import { GRAMMAR_TAXONOMY, GRAMMAR_CONFIG, conceptStates, grammarState, prerequisitesSatisfied, weakConcepts, type GrammarConceptDef, type GrammarConceptState } from './grammar.ts';
import { readStructure, structureMetrics } from './sentenceStructure.ts';
import type { EnergyState } from './types.ts';
import { sentenceConceptIds } from './sentenceGraphMap.ts';
function hash(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++)
        h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
}
export interface DifficultyEstimate {
    score: number;
    preTeach: string[];
    tokenCount: number;
    clauseCount: number;
    maxDepth: number;
    nonfiniteCount: number;
    unknownWordCount: number;
    knownCoverage: number;
    targetGrammarCount: number;
    reasons: string[];
}
const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'it', 'this', 'that', 'with', 'for', 'by', 'as', 'from', 'he', 'she', 'they', 'i', 'you', 'we', 'his', 'her', 'their']);
export function knownWordSet(words: Word[]): Set<string> {
    return new Set(words
        .filter(w => w.state.total > 0 && (w.state.level === 'normal' || w.state.level === 'fluent' || w.recognitionScore >= 0.6))
        .map(w => w.en.toLowerCase()));
}
// 难度：多指标加权（不是长度），并给出可解释理由
export function estimateDifficulty(record: SentenceRecord, words: Word[], conceptIds: string[] = []): DifficultyEstimate {
    const structure = readStructure(record.structure, record.id, record.text).structure;
    const metrics = structureMetrics(structure);
    const known = knownWordSet(words);
    const tokens = record.text.toLowerCase().split(/\s+/).map(t => t.replace(/[^a-z'-]/g, '')).filter(Boolean);
    const contentTokens = tokens.filter(t => !STOP_WORDS.has(t) && t.length > 2);
    const glossary = record.glossary ?? {};
    // 有预教释义的词不算"未知"：否则小词库用户永远无法开始句子训练
    const unknown = contentTokens.filter(t => !known.has(t) && !glossary[t]);
    const unknownWordCount = unknown.length;
    const glossed = contentTokens.filter(t => !known.has(t) && glossary[t]);
    const knownCoverage = contentTokens.length ? (contentTokens.length - unknownWordCount) / contentTokens.length : 1;
    const targetGrammarCount = conceptIds.length;
    const reasons: string[] = [];
    let score = 0.5;
    score += Math.min(1, metrics.clauseCount / 3) * 0.9;
    score += Math.min(1, metrics.maxDepth / 2) * 0.6;
    score += Math.min(1, metrics.nonfiniteCount / 2) * 0.4;
    score += Math.min(1, metrics.tokenCount / 22) * 0.5;
    score += Math.min(1, unknownWordCount / 3) * 0.7;
    score += Math.min(1, targetGrammarCount / 3) * 0.4;
    score += (1 - knownCoverage) * 1.2;
    score = Math.round(Math.max(0.5, Math.min(3, score)) * 10) / 10;
    if (metrics.clauseCount > 1)
        reasons.push(`clause-${metrics.clauseCount}（最多 ${metrics.maxDepth} 层）`);
    if (metrics.nonfiniteCount)
        reasons.push(`nonfinite-${metrics.nonfiniteCount}`);
    if (unknownWordCount)
        reasons.push(`unknown-words-${unknownWordCount}:${unknown.slice(0, 3).join('/')}`);
    if (glossed.length)
        reasons.push(`pre-teach-${glossed.length}`);
    reasons.push(`known-coverage-${Math.round(knownCoverage * 100)}%`);
    if (targetGrammarCount)
        reasons.push(`target-grammar-${targetGrammarCount}`);
    if (record.sourceType !== 'curated')
        reasons.push(`source-${record.sourceType}`);
    return { score, preTeach: glossed, tokenCount: metrics.tokenCount, clauseCount: metrics.clauseCount, maxDepth: metrics.maxDepth, nonfiniteCount: metrics.nonfiniteCount, unknownWordCount, knownCoverage, targetGrammarCount, reasons };
}
export interface SentenceSelectionInput {
    now: number;
    sentences: SentenceRecord[];
    words: Word[];
    concepts: GrammarConcept[];
    grammarAttempts: GrammarAttempt[];
    sentenceAttempts?: SentenceAttempt[];
    records?: {
        wordId: string;
    }[];
    miniUnit?: MiniUnit | null;
    availableMinutes: number;
    energy: EnergyState;
    maxUnknownWords?: number;
    minKnownCoverage?: number;
    conceptDefs?: GrammarConceptDef[];
    preferConceptIds?: string[];
}
export interface SelectedSentence {
    record: SentenceRecord;
    preTeach: Array<{
        word: string;
        zh: string;
    }>;
    targetGrammar: string[];
    targetWords: string[];
    estimatedDifficulty: number;
    difficulty: DifficultyEstimate;
    learningReasons: string[];
    source: string;
    expectedLearningObjective: string;
    conceptReadiness: {
        ok: boolean;
        missing: string[];
    };
}
export interface GrammarWeakSignal {
    conceptId: string;
    name: string;
    attempts: number;
    errors: number;
    topError: string;
    p: number;
    reason: string;
}
// 最近真实错误 → 计划原因（文本 §17 示例："最近 4 次结构测试中 relative clause 出现 3 次错误"）
export function recentWeakGrammar(grammarAttempts: GrammarAttempt[], defs: GrammarConceptDef[] = GRAMMAR_TAXONOMY, withinMs = 14 * 86400000, now = Date.now()): GrammarWeakSignal[] {
    const out: GrammarWeakSignal[] = [];
    for (const def of defs) {
        const mine = grammarAttempts.filter(a => a.conceptId === def.id && now - a.at <= withinMs);
        if (mine.length < 2)
            continue;
        const errors = mine.filter(a => !a.correct);
        const p = grammarState(def, grammarAttempts, now).p;
        if (!errors.length && p >= GRAMMAR_CONFIG.mastery.learning)
            continue;
        const topError = Object.entries(errors.reduce<Record<string, number>>((acc, a) => {
            const k = a.errorType || 'structure-error';
            acc[k] = (acc[k] ?? 0) + 1;
            return acc;
        }, {})).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'structure-error';
        out.push({
            conceptId: def.id, name: def.name, attempts: mine.length, errors: errors.length, topError, p,
            reason: `最近 ${mine.length} 次相关练习中，「${def.name}」出现 ${errors.length} 次错误（主要错误类型：${topError}）`,
        });
    }
    return out.sort((a, b) => (b.errors / b.attempts) - (a.errors / a.attempts) || a.p - b.p || (a.conceptId < b.conceptId ? -1 : 1));
}
function glossaryOf(record: SentenceRecord): Record<string, string> {
    return record.glossary ?? {};
}
function usedToday(record: SentenceRecord, now: number): boolean {
    const d = new Date(now);
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return record.lastUsedAt >= start;
}
export function selectSentence(input: SentenceSelectionInput): SelectedSentence | null {
    const defs = input.conceptDefs ?? GRAMMAR_TAXONOMY;
    const maxUnknown = input.maxUnknownWords ?? 2;
    const minCoverage = input.minKnownCoverage ?? 0.75;
    const states = conceptStates(defs, input.grammarAttempts, input.now);
    const weak = weakConcepts(defs, input.grammarAttempts, input.now, 8);
    const weakIds = weak.map(w => w.conceptId);
    const prefer = input.preferConceptIds ?? [];
    const miniUnitGrammar = input.miniUnit?.targetGrammar ?? [];
    const miniUnitWords = new Set(input.miniUnit?.targetWords ?? []);
    const priorityConcepts = [...new Set([...prefer, ...miniUnitGrammar, ...weakIds])];
    const candidates: SelectedSentence[] = [];
    for (const record of input.sentences) {
        if (usedToday(record, input.now))
            continue;
        const concepts = sentenceConceptIds(record);
        const difficulty = estimateDifficulty(record, input.words, concepts);
        if (difficulty.unknownWordCount > maxUnknown)
            continue;
        if (difficulty.knownCoverage < minCoverage)
            continue;
        const target = concepts.filter(c => priorityConcepts.includes(c));
        const readiness = target.length ? prerequisitesSatisfied(target[0], states, GRAMMAR_CONFIG.mastery.learning * 0.6, defs) : { ok: true, missing: [], blockedBy: [] };
        const reasons: string[] = [];
        if (target.length)
            reasons.push(`targets-weak-grammar:${target.join(',')}`);
        if (miniUnitGrammar.some(g => concepts.includes(g)))
            reasons.push('mini-unit-grammar');
        if (record.targetWordIds.some(w => miniUnitWords.has(w)))
            reasons.push('mini-unit-words');
        if (!target.length)
            reasons.push('no-weak-target:basic-structure');
        if (!readiness.ok)
            reasons.push(`prerequisite-repair:${readiness.missing.join(',')}`);
        if (record.sourceType === 'curated')
            reasons.push('authored-curated-source');
        candidates.push({
            record,
            preTeach: difficulty.preTeach.map(w => ({ word: w, zh: glossaryOf(record)[w] ?? '' })),
            targetGrammar: target.length ? target : concepts.slice(0, 1),
            targetWords: [...record.targetWordIds],
            estimatedDifficulty: difficulty.score,
            difficulty,
            learningReasons: reasons,
            source: record.sourceType,
            expectedLearningObjective: target.length
                ? `能在结构中认出并正确判断「${target.map(t => defs.find(d => d.id === t)?.name ?? t).join('、')}」`
                : '巩固主干成分（主谓宾）与修饰成分的区分',
            conceptReadiness: { ok: readiness.ok, missing: readiness.missing },
        });
    }
    if (!candidates.length)
        return null;
    const energyBias: number = input.energy === 'low' ? 0.35 : input.energy === 'good' ? 0.6 : 0.45;
    const timeBias: number = Math.min(1, input.availableMinutes / 20);
    const scored = candidates.map(c => {
        let score = 0;
        score += c.targetGrammar.filter(t => weakIds.includes(t)).length * 2.2;
        score += c.learningReasons.includes('mini-unit-grammar') ? 1.2 : 0;
        score += c.learningReasons.includes('mini-unit-words') ? 0.8 : 0;
        score += (1 - Math.abs(c.estimatedDifficulty - (1 + energyBias * 1.6))) * 1.4;
        score += (c.difficulty.knownCoverage - 0.75) * 2;
        score += c.conceptReadiness.ok ? 0.6 : -0.4;
        score += timeBias * 0.3;
        if (c.record.structureProvenance === 'gold')
            score += 0.5;
        score -= Math.min(1, c.record.usedCount / 5);
        return { c, score };
    }).sort((a, b) => {
        if (b.score !== a.score)
            return b.score - a.score;
        const ka = hash(`sel|${input.now % 86400000}|${a.c.record.id}`), kb = hash(`sel|${input.now % 86400000}|${b.c.record.id}`);
        return ka === kb ? (a.c.record.id < b.c.record.id ? -1 : 1) : ka - kb;
    });
    return scored[0].c;
}
export function selectSentenceBatch(input: SentenceSelectionInput, count: number): SelectedSentence[] {
    const out: SelectedSentence[] = [];
    const used = new Set<string>();
    for (let i = 0; i < count; i++) {
        const pick = selectSentence({ ...input, sentences: input.sentences.filter(s => !used.has(s.id)) });
        if (!pick)
            break;
        used.add(pick.record.id);
        out.push(pick);
    }
    return out;
}
// —— Planner 句任务描述（Planner 只负责排期与预算，不重写选择逻辑）——
export type SentenceTaskKind = 'sentence-basic-structure' | 'sentence-weak-grammar' | 'sentence-difficult-review' | 'sentence-transfer';
export const SENTENCE_TASK_LABELS: Record<SentenceTaskKind, string> = {
    'sentence-basic-structure': '拆句子',
    'sentence-weak-grammar': '补薄弱语法',
    'sentence-difficult-review': '再看难句',
    'sentence-transfer': '换个句子试试',
};
export interface SentenceTaskDescriptor {
    kind: SentenceTaskKind;
    label: string;
    minutes: number;
    sentenceIds: string[];
    targetGrammar: string[];
    reasons: string[];
    priority: number;
    critical: boolean;
    flexible: boolean;
    source: string;
}
export interface SentencePlanInput extends SentenceSelectionInput {
    maxTasks?: number;
}
// 生成真实句任务：无可用句源 / 无预算 → 返回空数组（不制造假任务）
export function planSentenceTasks(input: SentencePlanInput): SentenceTaskDescriptor[] {
    const now = input.now;
    const defs = input.conceptDefs ?? GRAMMAR_TAXONOMY;
    const weakSignals = recentWeakGrammar(input.grammarAttempts, defs, 14 * 86400000, now);
    const states: GrammarConceptState[] = conceptStates(defs, input.grammarAttempts, now);
    const out: SentenceTaskDescriptor[] = [];
    const usedIds = new Set<string>();
    if (!input.sentences.length || input.availableMinutes < 3)
        return out;
    const pick = (kind: SentenceTaskKind, prefer: string[], sentences: number, minutesPerSentence: number, priority: number, critical: boolean, flexible: boolean, reasons: string[], allowFallbackGrammar: string[]): SentenceTaskDescriptor | null => {
        const selected = selectSentenceBatch({ ...input, preferConceptIds: prefer, sentences: input.sentences.filter(s => !usedIds.has(s.id)) }, sentences);
        if (!selected.length)
            return null;
        for (const s of selected)
            usedIds.add(s.record.id);
        const targetGrammar = [...new Set(selected.flatMap(s => s.targetGrammar))];
        const minutes = Math.max(3, Math.min(input.availableMinutes, Math.round(selected.length * minutesPerSentence)));
        return {
            kind,
            label: SENTENCE_TASK_LABELS[kind],
            minutes,
            sentenceIds: selected.map(s => s.record.id),
            targetGrammar,
            reasons: [
                ...reasons,
                ...selected.slice(0, 1).map(s => s.difficulty.reasons.slice(0, 2).join(' · ')),
                `sentences-${selected.length}`,
            ].filter(Boolean),
            priority,
            critical,
            flexible,
            source: selected[0].source,
        };
    };
    // 1) 弱项语法强化：只针对真实弱点，且先修已具备
    for (const signal of weakSignals.slice(0, 3)) {
        const readiness = prerequisitesSatisfied(signal.conceptId, states, GRAMMAR_CONFIG.mastery.learning * 0.6, defs);
        if (!readiness.ok && readiness.missing.length)
            continue;
        const task = pick('sentence-weak-grammar', [signal.conceptId], 2, 2.5, 60, false, true, [signal.reason], []);
        if (task) {
            out.push(task);
            break;
        }
    }
    // 2) 基础结构练习：主干不清时优先（无任何语法证据时也会生成，保证 Sentence Lab 可用）
    const basic = pick('sentence-basic-structure', ['structure.core', 'structure.svo', 'structure.subject', 'structure.predicate'], 2, 2, 50, false, true, [input.grammarAttempts.length ? 'basic-structure-maintenance' : 'first-sentence-practice'], ['structure.svo']);
    if (basic)
        out.push(basic);
    // 3) 难句复习：最近做过但未独立的句子（错误复现）
    const reviewCandidates = (input.sentenceAttempts ?? [])
        .filter(a => a.structureCorrect === false && a.sentenceId && input.sentences.some(s => s.id === a.sentenceId))
        .slice(0, 6)
        .map(a => a.sentenceId!);
    if (reviewCandidates.length) {
        const sentences = input.sentences.filter(s => reviewCandidates.includes(s.id));
        const selected = selectSentenceBatch({ ...input, sentences, preferConceptIds: [] }, 1);
        if (selected.length && !usedIds.has(selected[0].record.id)) {
            usedIds.add(selected[0].record.id);
            out.push({
                kind: 'sentence-difficult-review', label: SENTENCE_TASK_LABELS['sentence-difficult-review'],
                minutes: Math.max(3, Math.min(input.availableMinutes, 4)), sentenceIds: [selected[0].record.id],
                targetGrammar: selected[0].targetGrammar, reasons: ['repeat-structure-error', `sentences-1`],
                priority: 55, critical: false, flexible: true, source: selected[0].source,
            });
        }
    }
    // 4) 迁移练习：仅在已经独立完成过某语法点后出现（迁移才是强证据）
    const independentConcepts = [...new Set(input.grammarAttempts.filter(a => a.correct && a.independent).map(a => a.conceptId))];
    if (independentConcepts.length) {
        const task = pick('sentence-transfer', independentConcepts.slice(0, 2), 1, 3, 40, false, true, [`transfer-check:${independentConcepts.slice(0, 2).join(',')}`], []);
        if (task)
            out.push(task);
    }
    const maxTasks = input.maxTasks ?? 2;
    return out.slice(0, maxTasks);
}
