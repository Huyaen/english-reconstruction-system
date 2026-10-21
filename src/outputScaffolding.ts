// —— Phase 9：Adaptive Scaffolding（分层辅助）——
// 纪律：
//  * 辅助是用户主动请求的，不是系统硬塞的；
//  * 记录最高辅助级别与请求过的提示类型；
//  * 用了 L4 完整示范之后的正确表达，绝不能算独立产出证据。
import type { OutputSupportLevel, OutputSupportRecord, OutputTaskSpec } from './types.ts';
import { countWords } from './outputTask.ts';

export interface SupportHint {
    level: OutputSupportLevel;
    type: 'keywords' | 'skeleton' | 'partial_model' | 'full_model';
    title: string;
    content: string;
    /** 提示本身包含多少"可直接照抄"的成分（用于证据判定） */
    answerReveal: number;
}

export const SUPPORT_LEVELS: { level: OutputSupportLevel; zh: string; reveal: number }[] = [
    { level: 0, zh: '独立表达（无辅助）', reveal: 0 },
    { level: 1, zh: '关键词提示', reveal: 0.15 },
    { level: 2, zh: '句型骨架', reveal: 0.35 },
    { level: 3, zh: '部分表达示例', reveal: 0.6 },
    { level: 4, zh: '完整示范', reveal: 1 },
];

export function supportLevelZh(level: OutputSupportLevel): string {
    return SUPPORT_LEVELS.find(x => x.level === level)?.zh ?? '独立表达（无辅助）';
}

/** 生成某级提示：越高越具体；L4 才给完整示范，且明确标注"不能算独立掌握" */
export function buildSupportHint(spec: OutputTaskSpec, level: OutputSupportLevel): SupportHint {
    const words = spec.targetWords;
    const keywordLine = words.length ? words.join(' · ') : '使用你已会的词，先把主语和动词写出来。';
    if (level <= 0)
        return { level: 0, type: 'keywords', title: '独立表达', content: '先自己写。写完再要提示。', answerReveal: 0 };
    if (level === 1)
        return {
            level: 1, type: 'keywords', title: '关键词提示',
            content: `可以用这些词做支点：${keywordLine}\n不会的词可以先用简单说法代替。`,
            answerReveal: 0.15,
        };
    if (level === 2)
        return {
            level: 2, type: 'skeleton', title: '句型骨架',
            content: `试试这个骨架（自己填内容，不要照抄）：\n- I think ... because ...\n- The video/article shows ... , and it also ...\n- When ..., ... happened.\n目标词：${keywordLine}`,
            answerReveal: 0.35,
        };
    if (level === 3)
        return {
            level: 3, type: 'partial_model', title: '部分表达示例',
            content: `示例开头（只给前半句，后半句自己写）：\n"What I found most interesting is that ..."\n"The main idea is ... , but the part about ... is less clear."\n目标词：${keywordLine}`,
            answerReveal: 0.6,
        };
    return {
        level: 4, type: 'full_model', title: '完整示范（会降低证据等级）',
        content: `完整示范（照抄可以学会说法，但不算独立掌握）：\n"The material explains ${spec.topic} in a simple way. It shows why this matters, and it gives one clear example. I think the main point is easy to follow."\n目标词：${keywordLine}`,
        answerReveal: 1,
    };
}

export function emptySupport(text: string): OutputSupportRecord {
    return { highestLevel: 0, requestedHints: [], hintTypes: [], independentText: text, textAfterSupport: text };
}

/** 记录一次提示使用：只升不降，保留独立原文与辅助后文本 */
export function recordSupport(prev: OutputSupportRecord | undefined, hint: SupportHint, textAfter: string): OutputSupportRecord {
    const base = prev ?? emptySupport(textAfter);
    const highest = Math.max(base.highestLevel, hint.level) as OutputSupportLevel;
    return {
        highestLevel: highest,
        requestedHints: [...base.requestedHints, `L${hint.level}:${hint.type}`].slice(-20),
        hintTypes: Array.from(new Set([...base.hintTypes, hint.type])),
        independentText: base.independentText,
        textAfterSupport: textAfter,
    };
}

export interface IndependenceClass {
    independent: boolean;
    assisted: boolean;
    copied: boolean;
    /** 0（独立）–1（完全照抄），用于证据置信度缩放 */
    dependence: number;
    reason: string;
}

/**
 * 证据独立性判定：
 * - L0 且没有复制 → independent
 * - L1–L3 → assisted（意思可以是自己组织的，但表达被提示过）
 * - 与示范高度相似 / L4 → copied
 */
export function classifyIndependence(input: {
    support?: OutputSupportRecord | null;
    text: string;
    modelAnswer?: string | null;
}): IndependenceClass {
    const level = input.support?.highestLevel ?? 0;
    const model = (input.modelAnswer ?? '').trim();
    const similarity = model ? textSimilarity(input.text, model) : 0;
    if (similarity >= 0.82 || (level >= 4 && similarity >= 0.5))
        return { independent: false, assisted: true, copied: true, dependence: 1, reason: '与示范高度相似，按照抄处理' };
    if (level === 0)
        return { independent: true, assisted: false, copied: false, dependence: 0, reason: '无辅助独立完成' };
    if (level <= 2)
        return { independent: false, assisted: true, copied: false, dependence: 0.5, reason: `使用 L${level} 提示` };
    return { independent: false, assisted: true, copied: false, dependence: 0.8, reason: `使用 L${level} 提示（示例级）` };
}

/** 归一化 token Jaccard：只用于判定"是否照抄"，不用于评分 */
export function textSimilarity(a: string, b: string): number {
    const ta = tokens(a);
    const tb = tokens(b);
    if (!ta.size || !tb.size)
        return 0;
    let inter = 0;
    for (const t of ta)
        if (tb.has(t))
            inter += 1;
    return inter / (ta.size + tb.size - inter);
}

function tokens(s: string): Set<string> {
    return new Set(String(s ?? '').toLowerCase().replace(/[^a-z0-9'\s]/g, ' ').split(/\s+/).filter(Boolean));
}

/** 学习者的辅助是否应逐步减少：连续多次独立完成 → 建议不再默认给提示 */
export function shouldFadeSupport(recentIndependent: boolean[]): boolean {
    const last = recentIndependent.slice(-3);
    return last.length === 3 && last.every(Boolean);
}

export function hintWordBudget(spec: OutputTaskSpec): number {
    return Math.max(8, Math.round(countWords(spec.communicationGoal) * 2));
}
