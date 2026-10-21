// —— Phase 8：复盘（Light / Standard / Deep）——
// 纪律：
//  * Light 只产生有限自评证据（不能算完整理解训练）；
//  * Standard 的总结保存原文，不做“内容事实准确性”自动评分（没有 transcript 依据时更不可能）；
//  * Deep 允许跳过某项，但必须记录完成度；
//  * 这里没有任何“听力分数”，只有自评与产出记录。
import type { CaptionMode, InputMode, InputReflection } from './types.ts';

export const DIFFICULTY_REASONS = ['vocabulary', 'speed', 'connected_speech', 'grammar', 'proper_nouns', 'background', 'other'] as const;
export type DifficultyReason = (typeof DIFFICULTY_REASONS)[number];
export const DIFFICULTY_REASON_LABELS: Record<DifficultyReason, string> = {
    vocabulary: '词汇', speed: '语速', connected_speech: '连读/口音', grammar: '句法',
    proper_nouns: '专有名词', background: '背景知识', other: '其他',
};
export interface ReflectionSpec {
    mode: InputMode;
    minutes: [number, number];
    requiresSummary: boolean;
    completionCap: number;
    evidenceConfidence: number;
    /** 该模式产生的证据类型（写入 inputEvidence） */
    evidenceTypes: ('self_report' | 'output_attempt')[];
}
export const REFLECTION_SPECS: Record<InputMode, ReflectionSpec> = {
    light: { mode: 'light', minutes: [0.5, 1.5], requiresSummary: false, completionCap: 0.6, evidenceConfidence: 0.3, evidenceTypes: ['self_report'] },
    standard: { mode: 'standard', minutes: [3, 5], requiresSummary: true, completionCap: 1, evidenceConfidence: 0.6, evidenceTypes: ['self_report', 'output_attempt'] },
    deep: { mode: 'deep', minutes: [6, 15], requiresSummary: false, completionCap: 1, evidenceConfidence: 0.8, evidenceTypes: ['self_report', 'output_attempt'] },
};
export interface ReflectionInput {
    mode: InputMode;
    captionMode: CaptionMode;
    comprehension?: number | null;
    difficultyReasons?: string[];
    notes?: string;
    summary?: string;
    mainIdea?: string;
    keyPoints?: string[];
    opinion?: string;
    retelling?: string;
    reportedWatchedMinutes?: number | null;
    now?: number;
}
export type ReflectionResult = { ok: true; reflection: InputReflection } | { ok: false; errors: string[]; completion: number };
function sentenceCount(text: string): number {
    return text.split(/[.!?]+(?:\s|$)/).map(s => s.trim()).filter(Boolean).length;
}
export function validateReflection(input: ReflectionInput): ReflectionResult {
    const spec = REFLECTION_SPECS[input.mode];
    const errors: string[] = [];
    const notes = (input.notes ?? '').trim().slice(0, 1000);
    let comprehension = input.comprehension ?? null;
    if (comprehension !== null) {
        if (!Number.isFinite(comprehension) || comprehension < 0 || comprehension > 1)
            errors.push('理解自评需在 0–100% 之间。');
        else
            comprehension = Math.round(comprehension * 100) / 100;
    }
    const reasons = [...new Set((input.difficultyReasons ?? []).filter(r => (DIFFICULTY_REASONS as readonly string[]).includes(r)))];
    if ((input.difficultyReasons ?? []).some(r => !(DIFFICULTY_REASONS as readonly string[]).includes(r)))
        errors.push('难度原因里有无法识别的选项。');
    let completion = 0.2;
    if (comprehension !== null)
        completion += 0.3;
    if (reasons.length)
        completion += 0.15;
    if (notes)
        completion += 0.1;
    let summary: string | undefined;
    if (input.mode === 'standard') {
        summary = (input.summary ?? '').trim();
        if (!summary) {
            errors.push('Standard 模式需要 3–5 句英文总结（保存原文，不做无依据的内容评分）。');
        }
        else {
            const n = sentenceCount(summary);
            if (n < 2)
                errors.push(`总结只有 ${n} 句，至少写 2–3 句。`);
            if (n > 8)
                errors.push(`总结有 ${n} 句，请压缩到 3–5 句（不超过 8 句）。`);
            completion += 0.25;
        }
    }
    const mainIdea = (input.mainIdea ?? '').trim();
    const keyPoints = (input.keyPoints ?? []).map(k => k.trim()).filter(Boolean);
    const opinion = (input.opinion ?? '').trim();
    const retelling = (input.retelling ?? '').trim();
    if (input.mode === 'deep') {
        if (mainIdea)
            completion += 0.2;
        if (keyPoints.length >= 2)
            completion += 0.2;
        if (opinion || retelling)
            completion += 0.1;
        if (!mainIdea && !keyPoints.length && !retelling)
            errors.push('Deep 模式至少填写 Main Idea、Key Points 或 Retelling 之一。');
    }
    completion = Math.max(0, Math.min(spec.completionCap, Math.round(completion * 100) / 100));
    if (errors.length)
        return { ok: false, errors, completion };
    return {
        ok: true,
        reflection: {
            mode: input.mode, captionMode: input.captionMode, comprehension, difficultyReasons: reasons, notes,
            summary: summary || undefined, mainIdea: mainIdea || undefined, keyPoints, opinion: opinion || undefined,
            retelling: retelling || undefined, completion, savedAt: input.now ?? Date.now(),
        },
    };
}
/** 该复盘产生了哪些证据（只用类型，不宣称掌握） */
export function evidenceTypesOf(reflection: InputReflection): ('self_report' | 'output_attempt')[] {
    const types: ('self_report' | 'output_attempt')[] = ['self_report'];
    if ((reflection.summary && reflection.summary.trim()) || (reflection.retelling && reflection.retelling.trim()) || (reflection.mainIdea && reflection.mainIdea.trim()))
        types.push('output_attempt');
    return types;
}
export function reflectionLabel(mode: InputMode): string {
    return mode === 'light' ? 'Light · 30–60 秒' : mode === 'standard' ? 'Standard · 3–5 分钟' : 'Deep · 深入输出准备';
}
/** 中文字幕下理解更多 ≠ 听力提升：这是一个必须显式说明的口径 */
export function captionCaveat(mode: CaptionMode): string {
    return mode === 'zh' || mode === 'other'
        ? '当前使用中文字幕/其他语言字幕：理解自评不能当作英语听力能力证据。'
        : mode === 'en'
            ? '英文字幕下理解更多仍属于辅助理解，不等于独立听力。'
            : '无字幕观看的理解自评才更接近独立听力，但仍然是自报数据。';
}
