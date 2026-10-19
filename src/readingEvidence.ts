// —— Phase 5：阅读证据（结构化、幂等、可信度显式）——
// 纪律：
// 1. 用户自评 ≠ 客观测量：self_report 的证据 confidence 不得高于 medium，且 value 保留原始自评值。
// 2. 只是“被推荐/打开过一篇文章”不构成任何掌握证据。
// 3. 幂等键 = sessionId + type + key，重复提交（刷新、重复渲染、双击）不产生第二条证据。
import type { ReadingComprehensionRecord, ReadingEvidence, ReadingEvidenceConfidence, ReadingEvidenceSource, ReadingEvidenceType, ReadingSession, TranslationDependenceGrade, } from './types.ts';
import { uid } from './core.ts';
export function evidenceKey(sessionId: string, type: ReadingEvidenceType, suffix: string): string {
    return `${sessionId}:${type}:${suffix}`;
}
export function makeEvidence(input: {
    type: ReadingEvidenceType;
    passageId: string;
    sessionId: string;
    source: ReadingEvidenceSource;
    confidence: ReadingEvidenceConfidence;
    value: number | string | boolean | null;
    key: string;
    at: number;
    metadata?: Record<string, string | number | boolean>;
}): ReadingEvidence {
    return {
        id: uid(),
        type: input.type,
        passageId: input.passageId,
        sessionId: input.sessionId,
        source: input.source,
        confidence: input.source === 'self_reported' && input.confidence === 'high' ? 'medium' : input.confidence,
        value: input.value,
        key: input.key,
        at: input.at,
        metadata: input.metadata ?? {},
    };
}
// 幂等追加：同 key 已存在则原样返回（不新增、不改写）
export function appendEvidence(list: ReadingEvidence[], item: ReadingEvidence): ReadingEvidence[] {
    if (list.some(e => e.key === item.key))
        return list;
    return [...list, item];
}
export function hasEvidence(list: ReadingEvidence[], type: ReadingEvidenceType): boolean {
    return list.some(e => e.type === type);
}
export function evidenceByType(list: ReadingEvidence[], type: ReadingEvidenceType): ReadingEvidence[] {
    return list.filter(e => e.type === type);
}
// 翻译依赖等级：A 直接理解 → E 没有理解（数值越大依赖越强，用于趋势，不做“分数”）
export function translationDependenceScore(grade: TranslationDependenceGrade): number {
    return ({ A: 0, B: 1, C: 2, D: 3, E: 4 } as const)[grade];
}
export function comprehensionEvidenceType(record: ReadingComprehensionRecord): ReadingEvidenceType {
    if (record.stage === 'cold-test')
        return 'cold-baseline';
    if (record.stage === 'reread')
        return 'reread-result';
    if (record.kind === 'main-idea')
        return 'main-idea';
    if (record.kind === 'verified-item')
        return 'detail';
    return record.assisted ? 'assisted-comprehension' : 'independent-comprehension';
}
// 会话级汇总（供 analytics / handoff 使用）
export interface EvidenceSummary {
    independent: number;
    assisted: number;
    vocabularyObstacles: number;
    grammarObstacles: number;
    selfReported: number;
    verified: number;
    types: ReadingEvidenceType[];
}
export function summarizeEvidence(list: ReadingEvidence[]): EvidenceSummary {
    const count = (t: ReadingEvidenceType) => list.filter(e => e.type === t).length;
    return {
        independent: count('independent-comprehension'),
        assisted: count('assisted-comprehension'),
        vocabularyObstacles: count('vocabulary-obstacle'),
        grammarObstacles: count('grammar-obstacle'),
        selfReported: list.filter(e => e.source === 'self_reported').length,
        verified: list.filter(e => e.source === 'verified_item').length,
        types: [...new Set(list.map(e => e.type))],
    };
}
// 会话证据快照（不写入额外 store：证据随会话一起持久化，passage/session 已有索引）
export function collectSessionEvidence(session: ReadingSession): ReadingEvidence[] {
    return session.detail?.evidence ?? [];
}
