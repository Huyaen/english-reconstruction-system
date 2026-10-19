// —— Phase 4：句 ↔ 语法概念映射（Sentence ↔ Grammar Graph 的连接层）——
// 目标：把一条句子上挂的语法概念统一成一个可解释集合（标签 + 真实结构推导），
// 供选择器、Planner 与 Grammar 页面互相跳转使用。
import type { SentenceRecord } from './types.ts';
import { GRAMMAR_TAXONOMY, conceptById } from './grammar.ts';
import { readStructure, structureRows } from './sentenceStructure.ts';
const ROLE_CONCEPT: Record<string, string> = {
    subject: 'structure.subject',
    predicate: 'structure.predicate',
    object: 'structure.object',
    complement: 'structure.complement',
    modifier: 'structure.modifier',
};
export function knownGrammarConceptIds(): string[] {
    return GRAMMAR_TAXONOMY.map(c => c.id);
}
// 记录上声明的语法标签 + 结构里声明的概念 + 由成分角色推导的基础概念
export function sentenceConceptIds(record: SentenceRecord): string[] {
    const declared = (record.grammarTags ?? []).filter(id => !!conceptById(id));
    const structure = readStructure(record.structure, record.id, record.text).structure;
    const fromClauses = structure.clauses.flatMap(c => c.grammarConceptIds).filter(id => !!conceptById(id));
    const fromRoles = structureRows(structure).map(r => ROLE_CONCEPT[r.role]).filter((x): x is string => !!x);
    return [...new Set([...declared, ...fromClauses, ...fromRoles])].sort();
}
export function sentenceConceptNames(record: SentenceRecord): string[] {
    return sentenceConceptIds(record).map(id => conceptById(id)?.name ?? id);
}
export interface SentenceGrammarProfile {
    conceptIds: string[];
    hasGoldStructure: boolean;
    clauseCount: number;
    unknownConcepts: string[];
}
export function sentenceGrammarProfile(record: SentenceRecord): SentenceGrammarProfile {
    const unknown = (record.grammarTags ?? []).filter(id => !conceptById(id));
    return {
        conceptIds: sentenceConceptIds(record),
        hasGoldStructure: record.structureProvenance === 'gold',
        clauseCount: readStructure(record.structure, record.id, record.text).structure.clauses.length,
        unknownConcepts: unknown,
    };
}
// Grammar 页面 → 相关训练句：按概念反查句子
export function sentencesForConcept(conceptId: string, sentences: SentenceRecord[]): SentenceRecord[] {
    return sentences.filter(s => sentenceConceptIds(s).includes(conceptId));
}
// 先修修复建议：若某概念先修不足，返回可先练的句子（挂该先修概念的句子）
export function sentencesForPrerequisite(conceptId: string, sentences: SentenceRecord[]): SentenceRecord[] {
    const def = conceptById(conceptId);
    if (!def)
        return [];
    const basics = def.prerequisiteIds.filter(p => GRAMMAR_TAXONOMY.some(d => d.id === p));
    return sentences.filter(s => {
        const ids = sentenceConceptIds(s);
        return basics.some(b => ids.includes(b));
    });
}
