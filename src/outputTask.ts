// —— Phase 9：Output Task 契约 ——
// 目标：让学习者先用英语把意思送出去，再谈语法。
// 所有函数都是纯函数（不碰 DOM / 不碰 IndexedDB），便于单测与复用。
import type { OutputSourceType, OutputTaskSpec, OutputTaskType } from './types.ts';
export interface TaskTypeMeta {
    label: string;
    zh: string;
    /** 这次训练真正要完成的交际目标类型 */
    purpose: string;
    minWords: number;
    maxWords: number;
    /** 是否要求篇章结构（初级短句任务不要求引言/结论） */
    needsCoherence: boolean;
    /** 是否必须有真实材料来源 */
    needsSource: boolean;
}
export const OUTPUT_TASK_TYPES: Record<OutputTaskType, TaskTypeMeta> = {
    one_sentence: { label: 'One Sentence', zh: '一句话', purpose: '用一个完整英语句子传递一个意思', minWords: 4, maxWords: 30, needsCoherence: false, needsSource: false },
    short_summary: { label: 'Short Summary', zh: '3–5 句总结', purpose: '用 3–5 句英语概括材料的主要意思', minWords: 25, maxWords: 90, needsCoherence: true, needsSource: true },
    paragraph_summary: { label: 'Paragraph Summary', zh: '短段落', purpose: '用一个短段落解释材料的核心意思与关键细节', minWords: 60, maxWords: 160, needsCoherence: true, needsSource: true },
    retelling: { label: 'Retelling', zh: '复述', purpose: '用自己的话复述看过/读过的内容', minWords: 40, maxWords: 140, needsCoherence: true, needsSource: true },
    opinion: { label: 'Opinion', zh: '观点', purpose: '表达自己的看法并给出理由', minWords: 35, maxWords: 140, needsCoherence: true, needsSource: false },
    free_expression: { label: 'Free Expression', zh: '自由写', purpose: '自由描述自己的想法、经历或观察', minWords: 20, maxWords: 160, needsCoherence: false, needsSource: false },
    transformation: { label: 'Sentence Transformation', zh: '换个句式、换个词', purpose: '在新语境里使用目标词或目标语法', minWords: 8, maxWords: 60, needsCoherence: false, needsSource: false },
    repair: { label: 'Communication Repair', zh: '绕开不会的词', purpose: '不会某个词时，用已知英语把意思说清楚', minWords: 6, maxWords: 70, needsCoherence: false, needsSource: false },
};
export const OUTPUT_TASK_ORDER: OutputTaskType[] = [
    'one_sentence', 'short_summary', 'paragraph_summary', 'retelling',
    'opinion', 'free_expression', 'transformation', 'repair',
];
export function taskMeta(type: OutputTaskType): TaskTypeMeta {
    return OUTPUT_TASK_TYPES[type] ?? OUTPUT_TASK_TYPES.one_sentence;
}
export function countWords(text: string): number {
    const clean = String(text ?? '').trim();
    if (!clean)
        return 0;
    return clean.split(/\s+/u).filter(Boolean).length;
}
/** 任务规模随可用时间/状态变化：时间少就只写一句，绝不强制作文长度 */
export function defaultTaskType(input: {
    minutes: number;
    energy: 'low' | 'normal' | 'good';
    hasSource: boolean;
    hasUnit: boolean;
}): OutputTaskType {
    if (input.hasUnit)
        return input.minutes >= 20 && input.energy !== 'low' ? 'retelling' : 'one_sentence';
    if (input.minutes <= 8 || input.energy === 'low')
        return 'one_sentence';
    if (input.minutes <= 18)
        return input.hasSource ? 'short_summary' : 'free_expression';
    if (input.hasSource)
        return input.energy === 'good' ? 'paragraph_summary' : 'retelling';
    return 'opinion';
}
export interface BuildTaskInput {
    taskType: OutputTaskType;
    topic: string;
    communicationGoal?: string;
    sourceType: OutputSourceType;
    sourceId?: string;
    sourceLabel?: string;
    targetWords?: string[];
    targetGrammar?: string[];
    expectedMinutes?: number;
    difficultyEstimate?: number;
    reasons?: string[];
    now?: number;
    /** 稳定 id 以便 Planner 任务与 attempt 关联；不传则按内容派生 */
    id?: string;
}
export function buildTaskSpec(input: BuildTaskInput): OutputTaskSpec {
    const meta = taskMeta(input.taskType);
    const now = input.now ?? Date.now();
    const goal = (input.communicationGoal ?? '').trim() || meta.purpose;
    const topic = (input.topic || '').trim() || 'your own topic';
    const words = (input.targetWords ?? []).map(w => w.trim()).filter(Boolean).slice(0, 6);
    const grammar = (input.targetGrammar ?? []).map(g => g.trim()).filter(Boolean).slice(0, 3);
    const id = input.id ?? `otask_${now.toString(36)}_${hash(`${input.taskType}|${topic}|${input.sourceId ?? ''}|${now}`)}`;
    return {
        id,
        taskType: input.taskType,
        topic,
        communicationGoal: goal,
        sourceType: input.sourceType,
        sourceId: input.sourceId ?? '',
        sourceLabel: input.sourceLabel ?? '',
        targetWords: words,
        targetGrammar: grammar,
        expectedMinutes: Math.max(3, Math.round(input.expectedMinutes ?? 10)),
        difficultyEstimate: clamp01(input.difficultyEstimate ?? 0.35),
        minWords: meta.minWords,
        maxWords: meta.maxWords,
        reasons: (input.reasons ?? []).filter(Boolean).slice(0, 4),
        interestOnly: true,
        createdAt: now,
    };
}
function hash(s: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36).slice(0, 6);
}
function clamp01(n: number): number {
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.35;
}
/** 首写之前的提示：只给交际目标与约束，绝不给范文 */
export function taskPrompt(spec: OutputTaskSpec): string {
    const lines = [
        `Task: ${taskMeta(spec.taskType).zh} · ${spec.topic}`,
        `Goal: ${spec.communicationGoal}`,
    ];
    if (spec.targetWords.length)
        lines.push(`Try to use: ${spec.targetWords.join(', ')}（不会也可以换一种说法）`);
    if (spec.targetGrammar.length)
        lines.push(`Grammar focus: ${spec.targetGrammar.join(', ')}（先表达清楚，再考虑结构）`);
    lines.push(`建议长度：${spec.minWords}–${spec.maxWords} words（写不够也可以提交，先看意思是否传达到）`);
    lines.push('规则：不要先看范文；用你现有的英语写；不会的词可以绕开。');
    return lines.join('\n');
}
/** 任务类型决定评分标准：一句话任务不因没有引言/结论扣分 */
export function taskCriteria(spec: OutputTaskSpec): string[] {
    const base = ['意思是否传达到（Communication First）', '是否有妨碍理解的主要错误'];
    if (spec.taskType === 'one_sentence')
        return [...base, '句子是否完整（有主语和谓语）'];
    if (spec.taskType === 'repair')
        return [...base, '是否用已知英语绕开了不会的表达', '绕开后主要意思是否保留'];
    if (spec.taskType === 'transformation')
        return [...base, '是否在新语境中使用了目标词/结构（而不是照抄原句）'];
    if (spec.taskType === 'free_expression')
        return [...base, '是否清楚表达了想法/经历'];
    if (spec.taskType === 'opinion')
        return [...base, '是否给出理由'];
    const meta = taskMeta(spec.taskType);
    if (meta.needsCoherence)
        return [...base, '句子之间是否有清楚的连接', '是否覆盖材料的关键点（不要求面面俱到）'];
    return base;
}
export interface AttemptTextCheck {
    ok: boolean;
    message: string;
    wordCount: number;
    tooShort: boolean;
    tooLong: boolean;
}
/** 只做规模与基本完整性检查；语法/表达质量绝不在这里判 */
export function checkAttemptText(spec: OutputTaskSpec, text: string): AttemptTextCheck {
    const clean = String(text ?? '').trim();
    const wordCount = countWords(clean);
    if (!clean)
        return { ok: false, message: '还没有写内容。', wordCount: 0, tooShort: true, tooLong: false };
    if (wordCount < Math.min(3, spec.minWords))
        return { ok: false, message: `至少写 ${Math.min(3, spec.minWords)} 个词，让意思能被读懂。`, wordCount, tooShort: true, tooLong: false };
    if (wordCount > spec.maxWords * 2)
        return { ok: false, message: `这次任务建议不超过 ${spec.maxWords} 个词；先写完再看要不要扩写。`, wordCount, tooShort: false, tooLong: true };
    return {
        ok: true,
        message: wordCount < spec.minWords ? '比建议长度短：只要意思清楚，这样也可以提交。' : '',
        wordCount,
        tooShort: wordCount < spec.minWords,
        tooLong: false,
    };
}
/** 首次独立作答之前禁止显示范文/完整参考答案 */
export function canShowModelAnswer(attempt: {
    status?: string;
    supportLevel?: number;
} | null): boolean {
    if (!attempt)
        return false;
    if ((attempt.supportLevel ?? 0) >= 4)
        return true;
    return attempt.status !== undefined && attempt.status !== 'draft';
}
