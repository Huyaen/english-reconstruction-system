// —— Phase 5：难句 → Sentence Lab handoff ——
// 复用 Phase 4 的 SentenceRecord / heuristicStructure / 证据模型，不重写拆句器。
// 硬规则：
// 1. 真实文章里的句子**没有**经过人工审校的 gold 结构 → provenance 只能是 heuristic / manual / none。
// 2. provenance ≠ gold 时不做“客观正确性评分”：本次只作为接触（exposed），不推进语法后验。
// 3. handoff 必须带回精确原文 span 与上下文，返回阅读时能定位到原段落。
import type { DifficultSentence, Passage, ReadingProblemType, SentenceAttempt, SentenceEvidenceClass, SentenceRecord, } from './types.ts';
import { uid } from './core.ts';
import { heuristicStructure, fallbackStructure, readStructure } from './sentenceStructure.ts';
export const PROBLEM_TYPE_LABELS: Record<ReadingProblemType, string> = {
    vocabulary: '有生词读不懂',
    'main-structure': '找不到主干（主谓宾）',
    'subordinate-clause': '从句绕不清',
    'non-finite-verb': '非谓语/分词看不懂',
    reference: '指代（it/this/they…）不明',
    logic: '逻辑连接（转折/因果）没抓住',
    other: '其他',
};
export const READING_ATTRIBUTION = '来自你的阅读材料（未人工审校结构，仅自动启发式分析）';
// 把难句转成 SentenceRecord：结构用启发式；不编造 gold
export function difficultSentenceRecord(input: {
    difficult: DifficultSentence;
    passage: Passage;
    now: number;
    existingId?: string;
}): SentenceRecord {
    const id = input.existingId ?? `reading.${input.passage.id}.${input.difficult.start}`;
    const analysis = heuristicStructure(id, input.difficult.text);
    const structure = analysis.tokens.length ? analysis : fallbackStructure(id, input.difficult.text, 'reading-sentence');
    return {
        id,
        text: input.difficult.text,
        zh: '',
        sourceType: 'reading',
        sourceId: input.passage.id,
        attribution: `${READING_ATTRIBUTION} · ${input.passage.title}`,
        grammarTags: grammarTagsFor(input.difficult.problemTypes),
        targetWordIds: [],
        theme: input.passage.topic || '阅读',
        difficulty: 3,
        structure,
        structureProvenance: structure.provenance,
        createdBy: 'system',
        createdAt: input.now,
        usedCount: 0,
        lastUsedAt: 0,
        notes: `problem:${input.difficult.problemTypes.join(',')}`,
    };
}
function grammarTagsFor(types: ReadingProblemType[]): string[] {
    const tags: string[] = [];
    for (const t of types) {
        if (t === 'subordinate-clause')
            tags.push('clause.main');
        else if (t === 'main-structure')
            tags.push('structure.subject', 'structure.predicate');
        else if (t === 'non-finite-verb')
            tags.push('nonfinite.overview');
        else if (t === 'reference')
            tags.push('cohesion.reference');
        else if (t === 'logic')
            tags.push('cohesion.logic');
        else if (t === 'vocabulary')
            tags.push('structure.object');
    }
    return [...new Set(tags)];
}
export function structureOf(record: SentenceRecord) {
    return readStructure(record.structure, record.id, record.text).structure ?? fallbackStructure(record.id, record.text);
}
// provenance 不是 gold（没人工审校）→ 只能算接触：不允许把“答对了自动分析出的结构”当掌握证据
export function capEvidenceForProvenance(klass: SentenceEvidenceClass, record: SentenceRecord): SentenceEvidenceClass {
    if (record.structureProvenance === 'gold')
        return klass;
    // 自动分析/手工标注的结构既不能证明对，也不能证明错 → 一律按接触记账
    return 'exposed';
}
export interface LabReturnTarget {
    passageId: string;
    sessionId: string;
    difficultId: string;
    paragraphIndex: number;
    chunkIndex: number;
    start: number;
    end: number;
}
export function returnTarget(session: {
    id: string;
    passageId: string;
    detail?: {
        chunkIndex: number;
    };
}, difficult: DifficultSentence, chunkIndex: number): LabReturnTarget {
    return {
        passageId: session.passageId,
        sessionId: session.id,
        difficultId: difficult.id,
        paragraphIndex: difficult.paragraphIndex,
        chunkIndex,
        start: difficult.start,
        end: difficult.end,
    };
}
// 句子训练完成后写回的 attempt 记录：结构不确定时只记 exposed
export function readingAttemptEvidence(input: {
    attempt: SentenceAttempt;
    record: SentenceRecord;
    klass: SentenceEvidenceClass;
}): {
    attempt: SentenceAttempt;
    klass: SentenceEvidenceClass;
    countsTowardMastery: boolean;
    note: string;
} {
    const capped = capEvidenceForProvenance(input.klass, input.record);
    return {
        attempt: input.attempt,
        klass: capped,
        countsTowardMastery: capped !== 'exposed',
        note: capped === input.klass
            ? '句子结构经过人工审校，按实际作答分级计入证据'
            : '这句的结构是自动分析的（没有人工审校），本次只记录接触，不计入语法掌握证据',
    };
}
export function contextWindow(passage: Passage, difficult: {
    start: number;
    end: number;
}, windowChars = 180): {
    before: string;
    after: string;
} {
    const text = passage.text;
    return {
        before: text.slice(Math.max(0, difficult.start - windowChars), difficult.start).trim(),
        after: text.slice(difficult.end, Math.min(text.length, difficult.end + windowChars)).trim(),
    };
}
export function makeDifficultSentenceId(): string {
    return uid();
}
