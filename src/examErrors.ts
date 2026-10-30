// —— Phase 11：错因归因（六分类 + 二级）——
// 纪律：一题答错不自动等于“阅读差”；记录不够返回 uncertain，绝不把猜测写成已验证根因。
// 归因来源优先级：用户自报 > 选项级 distractor 证据 > 目标技能弱推断 > uncertain。
import type { AssessmentAnswer, AssessmentItem, ExamErrorCategory, ExamErrorRecord, ExamErrorSubcategory, ExamSession, } from './examTypes.ts';
import { isChoiceItem } from './examItems.ts';
const INTERVENTION: Record<ExamErrorCategory, string> = {
    vocabulary: '词汇：回到词库做该词的识别/主动提取，并在真实语境中再遇一次。',
    structure: '结构：回到 Sentence Lab 拆主谓/从句，再用同结构新句验证。',
    logic: '逻辑：回阅读做段落关系与推理训练，要求引用原文依据。',
    evidence: '对应原文：练“先回原文找依据，再选答案”，别凭印象作答。',
    overthinking: '过度推断：复盘干扰项，练习只选原文支持的选项。',
    time_pressure: '时间压力：做限时短练，先跳过卡住的题，再回看。',
    uncertain: '记录不够：先保留疑问，完成复盘或补一次同类题再判断。',
};
const SKILL_MAP: {
    prefix: string;
    category: ExamErrorCategory;
    subcategory: ExamErrorSubcategory;
    reason: string;
}[] = [
    { prefix: 'vocabulary', category: 'vocabulary', subcategory: 'word_meaning', reason: '题目目标能力标注为词汇；可能不认识或误解词义。' },
    { prefix: 'grammar', category: 'structure', subcategory: 'clause_relation', reason: '题目目标能力标注为语法结构；可能没有识别从句/时态关系。' },
    { prefix: 'logic', category: 'logic', subcategory: 'misreading', reason: '题目目标能力标注为逻辑关系；可能误读因果/转折。' },
    { prefix: 'reading.main', category: 'logic', subcategory: 'misreading', reason: '主旨题答错更可能是整体理解或过度概括，而非单词问题。' },
    { prefix: 'reading.inference', category: 'logic', subcategory: 'distractor', reason: '推断题答错常见于选了原文未支持的干扰项。' },
    { prefix: 'reading.evidence', category: 'evidence', subcategory: 'incomplete_evidence', reason: '这道题要去原文找依据，可能没回去核对。' },
    { prefix: 'reading.detail', category: 'evidence', subcategory: 'misreading', reason: '细节题答错常见于定位错误或漏看限定词。' },
];
function fromSkills(item: AssessmentItem): {
    category: ExamErrorCategory;
    subcategory: ExamErrorSubcategory;
    reason: string;
} | null {
    for (const s of item.targetSkills) {
        const hit = SKILL_MAP.find(m => s.startsWith(m.prefix));
        if (hit)
            return hit;
    }
    return null;
}
export interface AttributeOptions {
    userCategory?: ExamErrorCategory;
    userSubcategory?: ExamErrorSubcategory;
    now: number;
}
/**
 * 只处理“答错的客观题”；开放题不自动判错。
 * 返回 null 表示这题不构成可归因错误（答对/未答/开放题）。
 */
export function attributeError(item: AssessmentItem, answer: AssessmentAnswer | undefined, session: ExamSession, opts: AttributeOptions): ExamErrorRecord | null {
    if (!isChoiceItem(item) || !item.answerKey)
        return null;
    if (!answer || !answer.value || answer.value === item.answerKey)
        return null;
    const evidenceRefs = [`item:${item.id}`, `answer:${answer.value}`, `key:${item.answerKey}`];
    const alternatives: ExamErrorRecord['alternatives'] = [];
    if (opts.userCategory) {
        const category = opts.userCategory;
        const subcategory = opts.userSubcategory ?? defaultSub(category);
        return {
            itemId: item.id, category, subcategory, confidence: 'medium',
            explanation: `按你的自报归类为「${category}」；系统没有把它当作已验证根因。`,
            evidenceRefs: [...evidenceRefs, 'source:user_reported'], alternatives,
            intervention: INTERVENTION[category], userReported: true, at: opts.now,
        };
    }
    const distractor = item.distractorAnalysis?.find(d => d.option === answer.value);
    if (distractor) {
        const alt = fromSkills(item);
        if (alt && alt.category !== distractor.category)
            alternatives.push({ category: alt.category, subcategory: alt.subcategory, reason: alt.reason });
        return {
            itemId: item.id, category: distractor.category, subcategory: distractor.subcategory, confidence: 'medium',
            explanation: `你选择了 ${answer.value}：${distractor.reason} 正确答案是 ${item.answerKey}。`,
            evidenceRefs: [...evidenceRefs, `distractor:${answer.value}`], alternatives,
            intervention: INTERVENTION[distractor.category], userReported: false, at: opts.now,
        };
    }
    const inferred = fromSkills(item);
    if (!inferred) {
        return {
            itemId: item.id, category: 'uncertain', subcategory: 'other', confidence: 'low',
            explanation: '这道题看不出具体错在哪，也没有明确的能力标签；先记成不确定，复盘后再判断。',
            evidenceRefs, alternatives, intervention: INTERVENTION.uncertain, userReported: false, at: opts.now,
        };
    }
    const slow = answer.timeMs > item.estimatedTimeMinutes * 90000 * 1.5;
    if (slow)
        alternatives.push({ category: 'time_pressure', subcategory: 'timing_strategy', reason: '作答时间明显超过预计，可能是时间压力导致。' });
    return {
        itemId: item.id, category: inferred.category, subcategory: inferred.subcategory, confidence: 'low',
        explanation: `${inferred.reason} 这是基于题目能力标签的弱推断，不是已验证根因。`,
        evidenceRefs: [...evidenceRefs, `skill:${item.targetSkills.join(',')}`], alternatives,
        intervention: INTERVENTION[inferred.category], userReported: false, at: opts.now,
    };
}
function defaultSub(c: ExamErrorCategory): ExamErrorSubcategory {
    return ({
        vocabulary: 'word_meaning', structure: 'clause_relation', logic: 'misreading', evidence: 'incomplete_evidence',
        overthinking: 'distractor', time_pressure: 'timing_strategy', uncertain: 'other',
    } as const)[c];
}
export function collectErrors(session: ExamSession, opts: {
    now: number;
    userCategories?: Record<string, ExamErrorCategory>;
}): ExamErrorRecord[] {
    const out: ExamErrorRecord[] = [];
    for (const item of session.items) {
        const e = attributeError(item, session.answers[item.id], session, {
            now: opts.now, userCategory: opts.userCategories?.[item.id],
        });
        if (e)
            out.push(e);
    }
    return out;
}
export function correctError(record: ExamErrorRecord, category: ExamErrorCategory, subcategory: ExamErrorSubcategory, now: number): ExamErrorRecord {
    return {
        ...record, category, subcategory,
        explanation: `${record.explanation}（用户已把错因修正为 ${category}。）`,
        confidence: 'medium', userReported: true, correctedByUser: true, at: now,
        evidenceRefs: [...record.evidenceRefs, 'source:user_correction'],
    };
}
export function errorCategoryLabel(c: ExamErrorCategory): string {
    return ({
        vocabulary: '词汇', structure: '结构', logic: '逻辑', evidence: '依据', overthinking: '过度推断', time_pressure: '时间压力', uncertain: '不确定',
    } as const)[c];
}
export function errorSubcategoryLabel(s: ExamErrorSubcategory): string {
    return ({
        word_meaning: '词义', collocation: '搭配', clause_relation: '从句关系', reference: '指代', distractor: '干扰项',
        misreading: '误读', incomplete_evidence: '记录不够', timing_strategy: '时间策略', careless_selection: '粗心选择', overgeneralization: '过度概括', other: '其他',
    } as const)[s];
}
export function errorSummary(errors: ExamErrorRecord[]): string {
    if (!errors.length)
        return '没有可归因的错题。';
    const counts = new Map<string, number>();
    for (const e of errors)
        counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    return [...counts].map(([c, n]) => `${errorCategoryLabel(c as ExamErrorCategory)} ${n}`).join(' · ');
}
