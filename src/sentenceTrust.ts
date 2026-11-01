// —— Phase 16.3：结构可信度（学习证据准入）——
// 背景（Codex 独立验收 P1）：AI 定向句的 `structureProvenance = 'ai_unverified'`，
// 但句子练习仍然按「独立作答」写入 GrammarAttempt，BKT 后验因此被推高（实测 0.6014）。
// 纪律：
//   1) 「句子来源可靠」不等于「句法结构可靠」；`sourceType === 'ai'` 只是线索，不是判据。
//   2) 只有能被核查的结构（人工审校/已核验，且结构本身校验通过、把握足够）才允许计分。
//   3) 拿不准时一律按未核验处理：宁可少算，不可虚增掌握。
//   4) 本模块只做判定，不写库、不改历史数据。
import type { SentenceRecord, SentenceStructureProvenance } from './types.ts';
import { readStructure, validateStructure, type SentenceStructure } from './sentenceStructure.ts';
export type StructureTrust = 'verified' | 'unverified';
export type StructureTrustReason = 'hand-checked' | 'provenance-unverified' | 'structure-invalid' | 'low-confidence';
export interface StructureTrustAssessment {
    trust: StructureTrust;
    provenance: SentenceStructureProvenance;
    confidence: number;
    reason: StructureTrustReason;
}
/** 只有这两种来源声称经过人工/外部核对；其余一律视为未核验 */
const TRUSTED_PROVENANCE: SentenceStructureProvenance[] = ['gold', 'verified'];
/** 结构要通过校验，并且把握度至少到这个值，才认为「够用来判断语法」 */
export const MIN_TRUSTED_CONFIDENCE = 0.6;
export const STRUCTURE_TRUST_TEXT: Record<StructureTrust, string> = {
    verified: '人工核对过',
    unverified: '还没核对',
};
export const STRUCTURE_TRUST_REASON_TEXT: Record<StructureTrustReason, string> = {
    'hand-checked': '这份结构是人工标注并校对过的',
    'provenance-unverified': '这份结构是自动分析出来的，没有人工核对',
    'structure-invalid': '这份结构数据没能通过自检，只能当参考',
    'low-confidence': '这份结构的把握度不够，只能当参考',
};
/**
 * 判定一句的结构能不能用来给语法计分。
 * 判据是可核查的事实（来源声明 + 结构校验 + 把握度），不是字段名的联想。
 */
export function assessStructureTrust(record: SentenceRecord, structure?: SentenceStructure): StructureTrustAssessment {
    const parsed = structure ?? readStructure(record.structure, record.id, record.text).structure;
    const provenance = record.structureProvenance ?? parsed.provenance;
    const confidence = Number.isFinite(parsed.confidence) ? parsed.confidence : 0;
    if (!TRUSTED_PROVENANCE.includes(provenance))
        return { trust: 'unverified', provenance, confidence, reason: 'provenance-unverified' };
    if (!validateStructure(parsed).ok)
        return { trust: 'unverified', provenance, confidence, reason: 'structure-invalid' };
    if (confidence < MIN_TRUSTED_CONFIDENCE)
        return { trust: 'unverified', provenance, confidence, reason: 'low-confidence' };
    return { trust: 'verified', provenance, confidence, reason: 'hand-checked' };
}
/** 能不能把这次练习计入语法掌握 */
export function canScoreGrammar(record: SentenceRecord): boolean {
    return assessStructureTrust(record).trust === 'verified';
}
/** 结果页/提示用的一句话（只在未核验时给） */
export function unverifiedStructureNote(): string {
    return '这句的语法结构还没有核对。本次练习已记录，但不会计入语法掌握度。';
}
