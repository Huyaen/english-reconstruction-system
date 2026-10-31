/**
 * 展示层标签（Phase 16.1）
 *
 * 纪律：
 *   1) 只做「内部值 → 用户看得懂的中文」的映射，不改任何枚举、存储值、算法或协议。
 *   2) 任何在界面上出现的英文枚举（curated / saved / provisional…）都必须先过这里。
 *   3) 技术字段（JSON / CORS / token）保留原名时必须同时给出人话解释。
 */
import type { SentenceSourceType, SentenceStructureProvenance } from './types.ts';
import type { SourceMixResult } from './sentenceSources.ts';

/** 句源：与 sentenceSources.SOURCE_LABELS 保持一致的用户语言 */
export const SOURCE_TEXT: Record<SentenceSourceType, string> = {
    curated: '练习句',
    user: '你自己加的句子',
    saved: '你收藏的难句',
    'real-material': '真实材料里的句子',
    reading: '从阅读带过来的句子',
    ai: 'AI 生成的句子',
};

/** 句子结构来源：gold=人工逐词标注的标准结构；heuristic=自动切分，可能不准 */
export const STRUCTURE_TEXT: Record<SentenceStructureProvenance, string> = {
    gold: '结构人工标注',
    verified: '结构已核对',
    heuristic: '结构自动推断，可能不准',
    manual: '结构你自己标的',
    ai_unverified: '结构由 AI 生成，未核对',
    none: '没有结构',
};

/** 能力缺口：内部用 phase 代号表示「还差什么」，界面只说是哪一环没接上 */
export const CAPABILITY_NEED_TEXT: Record<string, string> = {
    phase5: '要等阅读里的句子能接进来',
    phase6: '要先设置 AI 服务',
};

/** 输入材料状态 */
export const INPUT_STATUS_TEXT: Record<string, string> = {
    saved: '已保存',
    used: '已看过',
    archived: '已归档',
};

/** 输入材料类型 */
export const INPUT_TYPE_TEXT: Record<string, string> = {
    youtube: 'YouTube',
    bilibili: 'Bilibili',
    article: '文章',
    documentary: '纪录片',
    esports: '电竞',
    game_content: '游戏内容',
    series_clip: '剧集片段',
    online_video: '在线视频',
    other: '其他',
};

/** 输入难度目标（comfort / growth 是内部键，不是给人看的词） */
export const INPUT_TARGET_TEXT: Record<'comfort' | 'growth', string> = {
    comfort: '轻松一点（目标听懂 80–90%）',
    growth: '有点挑战（目标听懂 65–80%）',
};

/** 词库优先度：S/A/B/C/D 只是排序桶，字母需要解释 */
export const PRIORITY_TEXT: Record<string, string> = {
    S: '最该先练',
    A: '该练了',
    B: '一般',
    C: '还行',
    D: '不着急',
};

export const PRIORITY_LEGEND =
    '优先度 S→D 是「先练哪个」的顺序，不是分数：按答错、自己标“模糊”、和到期时间算出来的，随时会变。';

/** 句源配比：把内部原因代码换成一句人话，不暴露代码、不拼接分号 */
export function sourceMixNote(mix: SourceMixResult): string {
    const base = '计划里 AI 句占四成、你自己遇到的句子占四成、真实材料占两成';
    const missing: string[] = [];
    if (mix.unavailable.includes('ai'))
        missing.push('AI 生成句子');
    if (mix.unavailable.includes('real-material'))
        missing.push('真实材料里的句子');
    if (mix.unavailable.includes('reading'))
        missing.push('阅读里带过来的句子');
    if (!missing.length)
        return `${base}，现在按这个比例出句子。`;
    const list = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join('、')}和${missing[missing.length - 1]}`;
    return `${base}。现在${list}还用不了，这部分先由练习句补上，比例会跟着可用来源自动调整。`;
}

/** 证据阈值名称（学习报告）与词库分级是两套口径，需要一句话说清 */
export const MASTERY_DISCLAIMER =
    '这里的「想得起／用得出」按证据次数算，和词库里的「熟练／正常／模糊／不会」不是同一把尺子：后者看最近答得稳不稳，前者看累计独立答对或用出来的次数。';
