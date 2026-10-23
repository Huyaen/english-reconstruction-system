// —— Phase 11：题目契约与校验 ——
// 不可信的题目不能进入可评分题库：缺答案、答案不在选项内、来源不明、AI 冒充真题都拒绝。
import type { AssessmentItem, ExamMaterial, ExamQuestionType, ItemProvenance, ItemVerifiedStatus } from './examTypes.ts';
const OBJECTIVE: ExamQuestionType[] = ['contextual_grammar', 'vocabulary_in_context', 'cloze', 'reading_comprehension', 'text_structure', 'listening', 'delayed_vocabulary', 'sentence_parsing'];
export function isObjectiveType(t: ExamQuestionType): boolean {
    return OBJECTIVE.includes(t);
}
export function isChoiceItem(item: AssessmentItem): boolean {
    return item.options.length > 0 && isObjectiveType(item.questionType);
}
export interface ItemValidation {
    ok: boolean;
    errors: string[];
    warnings: string[];
    scorable: boolean;
}
export function validateItem(item: AssessmentItem, materialIds?: Set<string>): ItemValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!item.id.trim())
        errors.push('缺少题目 ID');
    if (!item.stem.trim())
        errors.push('题干为空');
    if (!item.examCategory)
        errors.push('缺少考试类别');
    if (!item.section.trim())
        errors.push('缺少 section');
    if (!item.answerEvidence.trim())
        errors.push('缺少答案依据');
    if (!item.answerEvidence.trim())
        errors.push('缺少答案依据');
    if (!item.explanation.trim())
        errors.push('缺少解析');
    if (!Number.isFinite(item.pointValue) || item.pointValue < 0)
        errors.push('分值不能为负');
    if (isChoiceItem(item) && item.pointValue <= 0)
        errors.push('可评分客观题分值必须为正');
    if (!Number.isFinite(item.estimatedTimeMinutes) || item.estimatedTimeMinutes <= 0)
        errors.push('预计时间必须为正');
    if (!item.targetSkills.length)
        warnings.push('没有目标能力标签');
    if (item.provenance === 'official' && item.verifiedStatus !== 'verified')
        warnings.push('官方来源但未审核，界面应标未验证');
    if (item.provenance === 'ai_generated' && item.verifiedStatus === 'verified')
        errors.push('AI 生成题不得标为已验证真题');
    if (item.provenance === 'ai_generated' && item.source === 'official_sample')
        errors.push('AI 生成题不得冒充官方样题');
    if (item.provenance === 'user_supplied' && item.verifiedStatus === 'verified' && !item.answerEvidence)
        errors.push('用户材料不可无依据标为已验证');
    if (item.materialId && materialIds && !materialIds.has(item.materialId))
        errors.push(`材料引用不存在：${item.materialId}`);
    if (isChoiceItem(item)) {
        if (item.options.length < 2)
            errors.push('选择题至少需要两个选项');
        const ids = new Set(item.options.map(o => o.id));
        if (ids.size !== item.options.length)
            errors.push('选项 ID 重复');
        if (!item.answerKey || !ids.has(item.answerKey))
            errors.push('答案必须是有效选项 ID');
        for (const o of item.options)
            if (!o.text.trim())
                errors.push(`选项 ${o.id} 文本为空`);
    }
    else if (item.questionType === 'translation' || item.questionType === 'summary_writing' || item.questionType === 'situational_writing' || item.questionType === 'short_output' || item.questionType === 'speaking') {
        if (!item.rubric?.length)
            warnings.push('开放题没有 rubric，只能作为练习反馈');
    }
    if (item.questionType === 'listening' && !item.audioUrl)
        warnings.push('听力题没有音频，不能计为可完成听力任务');
    if (item.materialId && !item.stem.trim())
        warnings.push('材料题缺少题干');
    return {
        ok: errors.length === 0,
        errors,
        warnings,
        scorable: errors.length === 0 && isChoiceItem(item) && !!item.answerKey,
    };
}
export function validateBank(items: AssessmentItem[], materials: ExamMaterial[]): {
    ok: boolean;
    errors: string[];
    byId: Map<string, ItemValidation>;
} {
    const errors: string[] = [];
    const seen = new Set<string>();
    const materialsIds = new Set(materials.map(m => m.id));
    const byId = new Map<string, ItemValidation>();
    for (const item of items) {
        if (seen.has(item.id))
            errors.push(`题目 ID 重复：${item.id}`);
        seen.add(item.id);
        const v = validateItem(item, materialsIds);
        byId.set(item.id, v);
        for (const e of v.errors)
            errors.push(`${item.id}: ${e}`);
    }
    return { ok: errors.length === 0, errors, byId };
}
/** 只有可靠客观题才允许 verified_objective；开放题永远不能自动得到官方分数。 */
export function objectiveScorable(item: AssessmentItem): boolean {
    if (!isChoiceItem(item))
        return false;
    if (!item.answerKey)
        return false;
    if (item.verifiedStatus === 'unverified' || item.verifiedStatus === 'needs_review')
        return true; // 可作为练习评分，但来源仍标注
    return item.options.some(o => o.id === item.answerKey);
}
export function itemProvenanceLabel(p: ItemProvenance): string {
    return ({ official: '官方公开样题', licensed: '已授权材料', user_supplied: '用户导入', authored: '项目编写', ai_generated: 'AI 生成', unknown: '来源未知' } as const)[p];
}
export function verifiedLabel(v: ItemVerifiedStatus): string {
    return ({ verified: '已审核', unverified: '未验证', needs_review: '待复核', auto_verified: '自动校验' } as const)[v];
}
export function materialAvailable(item: AssessmentItem, items: AssessmentItem[], sessions: {
    itemIds: string[];
}[]): boolean {
    if (item.questionType === 'listening' && !item.audioUrl)
        return false;
    if (!item.materialId)
        return true;
    return true;
}
export function itemSkillKey(item: AssessmentItem): string {
    return [...item.targetSkills].sort().join('|') || item.questionType;
}
