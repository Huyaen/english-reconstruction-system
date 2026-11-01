// —— Phase 16.3：AI 目标（展示 / 请求 / 校验 / 保存 同源）——
// 背景（Codex 独立验收 P1）：
//   ① 面板写「定语从句（默认）」，AI 强化阅读实际发的是 `clause.adverbial`（状语从句）；
//   ② 生成时用默认目标，保存时又回头用 `aiWeakGrammar()` 重算，结果句库里的目标语法变成「—」。
// 纪律：目标只在发起请求时确定一次，随后一直带着走（面板、请求、校验、保存都用同一份）。
import { conceptById } from './grammar.ts';
export interface AiGrammarTarget {
    id: string;
    name: string;
    description: string;
}
export interface AiTargetPlan {
    words: string[];
    grammar: AiGrammarTarget[];
    wordsIsDefault: boolean;
    grammarIsDefault: boolean;
}
/** 生成契约要求 grammarTargets ≥ 1：没有薄弱语法时用这个，并明确告诉用户是默认值 */
export const AI_DEFAULT_GRAMMAR: AiGrammarTarget = {
    id: 'clause.relative',
    name: '定语从句',
    description: conceptById('clause.relative')?.description ?? '用 which/who/that 引导从句修饰名词',
};
/** 生成契约要求 targetWords ≥ 1：没有任何弱词时（只可能在阅读侧发生）用这两个可观察的常用词 */
export const AI_DEFAULT_WORDS = ['notebook', 'current'] as const;
export interface AiTargetInput {
    words: Array<{
        id: string;
        en: string;
    }>;
    grammar: AiGrammarTarget[];
    maxWords?: number;
    maxGrammar?: number;
}
/**
 * 一份目标，供「AI 定向句」与「AI 强化阅读」共用。
 * 两个功能的教学目的不同（句子练结构与用词，阅读练成篇理解），但目标契约相同：
 * 至少 1 个词 + 至少 1 个语法点；缺哪个就补默认值，并如实标记为默认。
 */
export function aiTargetPlan(input: AiTargetInput): AiTargetPlan {
    const maxWords = input.maxWords ?? 3;
    const maxGrammar = input.maxGrammar ?? 2;
    const words = input.words.map(w => w.en).slice(0, maxWords);
    const grammar = input.grammar.slice(0, maxGrammar).map(g => ({ id: g.id, name: g.name, description: g.description }));
    return {
        words: words.length ? words : [...AI_DEFAULT_WORDS].slice(0, maxWords),
        grammar: grammar.length ? grammar : [{ ...AI_DEFAULT_GRAMMAR }],
        wordsIsDefault: words.length === 0,
        grammarIsDefault: grammar.length === 0,
    };
}
/** 面板上的目标行（展示的就是即将发送的） */
export function targetRowText(plan: AiTargetPlan): {
    words: string;
    grammar: string;
} {
    return {
        words: plan.words.join('、') + (plan.wordsIsDefault ? '（默认）' : ''),
        grammar: plan.grammar.map(g => g.name).join('、') + (plan.grammarIsDefault ? '（默认）' : ''),
    };
}
