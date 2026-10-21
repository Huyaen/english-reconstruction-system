// —— Phase 9：反馈契约与质量门 ——
// 反馈的职责是"让人看懂哪里影响意思"，不是给作文打分。
// 质量门只拦"结构不正确 / 编造原文位置 / 越界评价内容事实 / 强行升级"。
import type { OutputErrorSpan, OutputErrorType, OutputFeedback, OutputFeedbackScope, OutputMeaningBasis, OutputTaskSpec, OutputUpgrade } from './types.ts';
import { countWords } from './outputTask.ts';
import { LANGUAGE_ERROR_TYPES, spanIsGrounded } from './outputDiagnosis.ts';
const ERROR_TYPES: OutputErrorType[] = ['tense', 'subject_verb_agreement', 'article', 'preposition', 'word_form', 'word_order', 'clause_structure', 'missing_subject', 'missing_predicate', 'vocabulary_choice', 'collocation', 'reference', 'coherence', 'meaning_ambiguity', 'other'];
const SEVERITIES: OutputErrorSpan['severity'][] = ['blocking', 'major', 'minor', 'style'];
const MEANING: OutputFeedback['meaningAssessment'][] = ['delivered', 'partly_delivered', 'not_delivered', 'unavailable'];
const BASIS: OutputMeaningBasis[] = ['verified', 'supported_by_source', 'ai_estimated', 'self_reported', 'unknown'];
const SCOPES: OutputFeedbackScope[] = ['language_only', 'content_checked', 'content_unverified'];
export interface FeedbackContext {
    text: string;
    spec: OutputTaskSpec;
    /** 由调用方决定：没有 transcript / 可靠材料内容时必须是 language_only */
    scope: OutputFeedbackScope;
    sourceProvenance: string;
    promptVersion: string;
    /** 允许引用的语法概念 id（防止模型编造不存在概念） */
    grammarConceptIds?: string[];
    /** 允许关联的目标词（小写英文即可；没有就传空） */
    targetWords?: string[];
}
export type FeedbackCheck = {
    ok: true;
    value: OutputFeedback;
    warnings: string[];
} | {
    ok: false;
    issues: string[];
    partial?: unknown;
};
function isObj(v: unknown): v is Record<string, unknown> {
    return !!v && typeof v === 'object' && !Array.isArray(v);
}
function str(v: unknown): string {
    return typeof v === 'string' ? v.trim() : '';
}
function arr(v: unknown): unknown[] {
    return Array.isArray(v) ? v : [];
}
function num(v: unknown): number | null {
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
function checkSpan(raw: unknown, text: string, i: number, issues: string[], ctx: FeedbackContext): OutputErrorSpan | null {
    if (!isObj(raw)) {
        issues.push(`corrections[${i}] 不是对象`);
        return null;
    }
    const type = str(raw.type) as OutputErrorType;
    if (!ERROR_TYPES.includes(type))
        issues.push(`corrections[${i}].type 不在允许的错误分类中`);
    const severity = str(raw.severity) as OutputErrorSpan['severity'];
    if (!SEVERITIES.includes(severity))
        issues.push(`corrections[${i}].severity 必须是 blocking/major/minor/style`);
    const original = str(raw.original);
    const proposed = typeof raw.proposed === 'string' ? raw.proposed : '';
    const start = num(raw.start);
    const end = num(raw.end);
    const explanation = str(raw.explanation);
    const confidence = num(raw.confidence);
    if (!original)
        issues.push(`corrections[${i}].original 不能为空`);
    if (!explanation || explanation.length < 6)
        issues.push(`corrections[${i}].explanation 太短，必须解释"为什么"`);
    if (confidence === null || confidence < 0 || confidence > 1)
        issues.push(`corrections[${i}].confidence 必须在 0–1`);
    if (start === null || end === null) {
        issues.push(`corrections[${i}] 缺少 start/end`);
        return null;
    }
    const span = { start, end, original };
    if (!spanIsGrounded(text, span)) {
        issues.push(`corrections[${i}] 的原文位置不成立：模型必须引用真实存在的文本片段`);
        return null;
    }
    if (proposed === original)
        issues.push(`corrections[${i}] 的建议与原文相同`);
    const grammarConceptId = raw.grammarConceptId === undefined || raw.grammarConceptId === null ? null : str(raw.grammarConceptId);
    if (grammarConceptId && ctx.grammarConceptIds && !ctx.grammarConceptIds.includes(grammarConceptId))
        issues.push(`corrections[${i}].grammarConceptId 引用了不存在的语法概念`);
    const targetWordId = raw.targetWordId === undefined || raw.targetWordId === null ? null : str(raw.targetWordId);
    return { type, original, proposed, start, end, explanation, severity, confidence: confidence ?? 0, grammarConceptId, targetWordId };
}
function checkUpgrade(raw: unknown, text: string, issues: string[]): OutputUpgrade | null {
    if (raw === null || raw === undefined)
        return null;
    if (!isObj(raw)) {
        issues.push('upgrade 必须是对象或 null');
        return null;
    }
    const original = str(raw.original);
    const suggested = str(raw.suggested);
    const why = str(raw.why);
    const changes = arr(raw.changes).map(str).filter(Boolean);
    const newGrammar = arr(raw.newGrammar).map(str).filter(Boolean).slice(0, 1);
    const newWords = arr(raw.newWords).map(str).filter(Boolean).slice(0, 2);
    if (!original || !text.includes(original))
        issues.push('upgrade.original 必须是用户原文中真实存在的句子');
    if (!suggested)
        issues.push('upgrade.suggested 不能为空');
    if (!why)
        issues.push('upgrade.why 必须说明"为什么更自然"');
    if (suggested && original) {
        const before = countWords(original);
        const after = countWords(suggested);
        if (after > before * 2 + 8)
            issues.push('upgrade 一次跳级太多：只允许提升一个主要难度维度，且用户必须能看懂');
        if (newGrammar.length > 1)
            issues.push('upgrade 最多引入一个新语法点');
        if (newWords.length > 2)
            issues.push('upgrade 最多引入两个新词');
    }
    const singleDimension = raw.singleDimension === true;
    if (!singleDimension)
        issues.push('upgrade.singleDimension 必须为 true（默认只提升一个维度）');
    return { original, suggested, why, changes, newGrammar, newWords, singleDimension };
}
/** 结构化校验 + 语义/引用的硬约束 */
export function validateOutputFeedback(value: unknown, ctx: FeedbackContext): FeedbackCheck {
    if (!isObj(value))
        return { ok: false, issues: ['反馈不是 JSON 对象'] };
    const issues: string[] = [];
    const warnings: string[] = [];
    const communicationGoal = str(value.communicationGoal);
    if (!communicationGoal)
        issues.push('communicationGoal 不能为空');
    const meaningAssessment = str(value.meaningAssessment) as OutputFeedback['meaningAssessment'];
    if (!MEANING.includes(meaningAssessment))
        issues.push('meaningAssessment 必须是 delivered/partly_delivered/not_delivered/unavailable');
    const meaningBasis = str(value.meaningBasis) as OutputMeaningBasis;
    if (!BASIS.includes(meaningBasis))
        issues.push('meaningBasis 必须是 verified/supported_by_source/ai_estimated/self_reported/unknown');
    const meaningConfidence = num(value.meaningConfidence);
    if (meaningConfidence === null || meaningConfidence < 0 || meaningConfidence > 1)
        issues.push('meaningConfidence 必须在 0–1');
    const feedbackScope = str(value.feedbackScope) as OutputFeedbackScope;
    if (!SCOPES.includes(feedbackScope))
        issues.push('feedbackScope 不合法');
    else if (feedbackScope !== ctx.scope) {
        // 没有可靠材料内容时必须 language_only：这是安全边界，不是风格建议
        if (ctx.scope === 'language_only')
            issues.push('没有可靠材料内容时 feedbackScope 必须是 language_only');
        else
            warnings.push(`feedbackScope=${feedbackScope}，上下文期望 ${ctx.scope}`);
    }
    const promptVersion = str(value.promptVersion);
    if (!promptVersion)
        issues.push('promptVersion 不能为空');
    else if (promptVersion !== ctx.promptVersion)
        warnings.push(`promptVersion=${promptVersion}（期望 ${ctx.promptVersion}）`);
    const rawIssues = arr(value.priorityIssues);
    const rawCorrections = arr(value.corrections);
    const priorityIssues: OutputErrorSpan[] = [];
    rawIssues.forEach((x, i) => {
        const s = checkSpan(x, ctx.text, i, issues, ctx);
        if (s)
            priorityIssues.push(s);
    });
    const corrections: OutputErrorSpan[] = [];
    rawCorrections.forEach((x, i) => {
        const s = checkSpan(x, ctx.text, i, issues, ctx);
        if (s)
            corrections.push(s);
    });
    if (priorityIssues.length > 3)
        issues.push('priorityIssues 超过 3 条：初学者一次只需要 1–3 个重点');
    if (priorityIssues.length + corrections.length > 6)
        warnings.push('错误条目较多：展示时只放前 3 条，避免把三句话改出二十个红点');
    const strengths = arr(value.strengths).map(str).filter(Boolean).slice(0, 5);
    if (!strengths.length)
        issues.push('strengths 至少给一条具体做对的地方');
    const upgrade = checkUpgrade(value.upgrade, ctx.text, issues);
    const grammarConceptIds = arr(value.grammarConceptIds).map(str).filter(Boolean).slice(0, 6);
    for (const id of grammarConceptIds)
        if (ctx.grammarConceptIds && !ctx.grammarConceptIds.includes(id))
            issues.push(`grammarConceptIds 引用了不存在的概念：${id}`);
    const targetWordIds = arr(value.targetWordIds).map(str).filter(Boolean).slice(0, 8);
    const nextPractice = str(value.nextPractice);
    if (!nextPractice)
        issues.push('nextPractice 必须给一个可执行的下一步');
    const uncertainty = str(value.uncertainty);
    if (!uncertainty)
        warnings.push('缺少 uncertainty：模型应说明自己不确定的地方');
    const all = [...priorityIssues, ...corrections];
    const hasSerious = all.some(s => s.severity === 'blocking' || s.severity === 'major');
    const noCorrectionNeeded = value.noCorrectionNeeded === true;
    if (noCorrectionNeeded && hasSerious)
        issues.push('noCorrectionNeeded=true 但存在 blocking/major 问题，自相矛盾');
    if (!noCorrectionNeeded && all.length === 0)
        warnings.push('没有给出任何问题，却也没有声明 noCorrectionNeeded');
    // 语言范围之外的事实判断：只有 content_checked 才允许
    const claim = `${strengths.join(' ')} ${str(value.meaningBasis)} ${str(value.uncertainty)}`;
    if (ctx.scope === 'language_only' && /(事实|内容)(完全)?(正确|准确)|accurately (summari[sz]ed|describes)|factually correct/i.test(claim))
        issues.push('language_only 反馈不能宣称用户对材料内容的理解"事实正确"');
    // targetWordIds 必须真实存在（调用方给的白名单）
    for (const id of targetWordIds)
        if (ctx.targetWords && ctx.targetWords.length && !ctx.targetWords.includes(id) && !/^w_/.test(id))
            warnings.push(`targetWordIds 中的 ${id} 不在本次目标词内`);
    if (issues.length)
        return { ok: false, issues, partial: value };
    return {
        ok: true,
        warnings,
        value: {
            communicationGoal,
            meaningAssessment,
            meaningBasis,
            meaningConfidence: meaningConfidence ?? 0.3,
            strengths,
            priorityIssues,
            corrections,
            grammarConceptIds,
            targetWordIds,
            upgrade,
            nextPractice,
            feedbackScope,
            sourceProvenance: ctx.sourceProvenance,
            uncertainty: uncertainty || '模型没有说明不确定之处；请把它当作参考，不是结论。',
            promptVersion,
            noCorrectionNeeded,
        },
    };
}
/** AI 不可用时的确定性反馈：只说"能确定"的东西，绝不冒充语法诊断 */
export function buildUnavailableFeedback(ctx: FeedbackContext, localSpans: OutputErrorSpan[], reason: string): OutputFeedback {
    const issues = localSpans.filter(s => s.severity === 'blocking' || s.severity === 'major');
    return {
        communicationGoal: ctx.spec.communicationGoal,
        meaningAssessment: 'unavailable',
        meaningBasis: 'unknown',
        meaningConfidence: 0.2,
        strengths: ['你把想说的内容写了下来——这本身就是表达训练的第一步。'],
        priorityIssues: localSpans.slice(0, 3),
        corrections: localSpans.slice(0, 6),
        grammarConceptIds: [],
        targetWordIds: [],
        upgrade: null,
        nextPractice: '先自己再读一遍，看有没有哪里读者会不知道你在说什么；稍后（或配置 AI 后）再做语言反馈。',
        feedbackScope: ctx.scope,
        sourceProvenance: ctx.sourceProvenance,
        uncertainty: reason,
        promptVersion: 'local@0',
        noCorrectionNeeded: issues.length === 0 && localSpans.length === 0,
    };
}
export interface GateResult {
    ok: boolean;
    issues: string[];
    warnings: string[];
}
/** 质量门：展示前最后一道，防止"看起来很专业"的越界反馈 */
export function qualityGate(feedback: OutputFeedback, ctx: FeedbackContext): GateResult {
    const issues: string[] = [];
    const warnings: string[] = [];
    for (const s of [...feedback.priorityIssues, ...feedback.corrections]) {
        if (!LANGUAGE_ERROR_TYPES.has(s.type))
            issues.push(`未知错误类型：${s.type}`);
        if (!spanIsGrounded(ctx.text, s))
            issues.push('反馈引用了原文中不存在的片段');
    }
    if (feedback.feedbackScope === 'language_only' && feedback.upgrade && /more (sophisticated|advanced|complex)/i.test(feedback.upgrade.why))
        warnings.push('升级建议在 language_only 范围内应解释"为什么更清楚"，而不是"更高级"');
    if (feedback.meaningAssessment === 'delivered' && feedback.meaningBasis === 'ai_estimated' && feedback.meaningConfidence > 0.7)
        issues.push('AI 估计的理解不能给出过高置信度');
    if (feedback.noCorrectionNeeded && feedback.corrections.some(s => s.severity === 'major'))
        issues.push('声明无需修改却存在主要问题');
    return { ok: issues.length === 0, issues, warnings };
}
/** 逐条修改建议的可读标题（UI 用） */
export const ERROR_LABELS: Record<OutputErrorType, string> = {
    tense: '时态', subject_verb_agreement: '主谓一致', article: '冠词', preposition: '介词',
    word_form: '词形', word_order: '语序', clause_structure: '从句结构', missing_subject: '缺主语',
    missing_predicate: '缺谓语', vocabulary_choice: '用词', collocation: '搭配', reference: '指代',
    coherence: '衔接', meaning_ambiguity: '意思不清', other: '其他',
};
