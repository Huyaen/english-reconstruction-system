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
/**
 * 句源够不够用（Phase 16.2）：一行一句话说清「为什么现在没有」。键是内部枚举，值是给人看的。
 * 注意与 CAPABILITY_NEED_TEXT 区分：那个说的是「功能模块还差哪一环」，这里说的是「这一种句子为什么是 0 句」。
 */
export const SOURCE_SHORTAGE_TEXT: Record<string, string> = {
    'ai-not-configured': '还没设置 AI 服务',
    'ai-no-sentences': 'AI 服务已设置，但一句都还没生成',
    'real-material-empty': '真实材料里还没有句子',
    'reading-not-connected': '阅读里的句子还没接进来',
    'user-empty': '你还没有添加自己的句子',
    'saved-empty': '你还没有收藏难句',
    'curated-empty': '练习句库是空的',
};
/** 输入会话状态（内部 created/active/paused/reflection/completed/abandoned，不能直接上屏） */
export const INPUT_SESSION_STATUS_TEXT: Record<string, string> = {
    created: '还没开始',
    active: '进行中',
    paused: '已暂停',
    reflection: '在写复盘',
    completed: '已完成',
    abandoned: '已放弃',
};
/** 字幕模式（none/en/zh/other 是内部键） */
export const CAPTION_MODE_TEXT: Record<string, string> = {
    none: '无字幕',
    en: '英文字幕',
    zh: '中文字幕',
    other: '其他语言字幕',
};
/** 复盘深度：保留「轻/标准/深入」三个档位，时长写清，不用 Light/Standard/Deep */
export const INPUT_MODE_TEXT: Record<string, string> = {
    light: '轻量复盘 · 30–60 秒',
    standard: '标准复盘 · 3–5 分钟',
    deep: '深入复盘 · 为写作输出做准备',
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
export const PRIORITY_LEGEND = '优先度 S→D 是「先练哪个」的顺序，不是分数：按答错、自己标“模糊”、和到期时间算出来的，随时会变。';
/**
 * 句源说明（Phase 16.3 重写）
 * 之前的写法（「现在正好按这个比例出句子」）是错的：`selectSentenceBatch()` 并不按 40/40/20 抽题，
 * 它按薄弱语法、难度、生词覆盖、先修关系和用过几次打分。所以这里只做三件诚实的事：
 *   1) 把 40/40/20 明说成**目标**，不是当前出题比例；
 *   2) 说明真实挑选依据；
 *   3) 用真实库存数量说话（不拿比例冒充库存，也不因为某三类为空就说句库空了）。
 */
export function sourceMixNote(input: {
    counts: Partial<Record<SentenceSourceType, number>>;
}): string {
    const goal = '目标句源：AI 句 40%、你自己添加的句子 40%、真实材料 20%。这是希望句源别太单一的目标，不是现在的出题比例。';
    const how = '真正排进练习时，按薄弱语法、难度、生词覆盖和用过的次数综合挑，不按这个比例分配。';
    const stock = describeStock(input.counts);
    const total = Object.values(input.counts).reduce((n, v) => n + (v ?? 0), 0);
    if (!total)
        return `${goal}${how}现在句库里一句都没有：先在下面添加你自己的句子，或用 AI 生成一句。`;
    const emptyTargets = (['ai', 'user', 'real-material'] as SentenceSourceType[])
        .filter(t => (input.counts[t] ?? 0) === 0)
        .map(t => SOURCE_TEXT[t]);
    const tail = emptyTargets.length ? `目标里的${emptyTargets.join('、')}目前还没有句子。` : '';
    return `${goal}${how}${stock}${tail}`;
}
/** 真实库存（按固定顺序，只列非零项） */
export function describeStock(counts: Partial<Record<SentenceSourceType, number>>): string {
    const order: SentenceSourceType[] = ['curated', 'user', 'saved', 'real-material', 'reading', 'ai'];
    const items = order.filter(k => (counts[k] ?? 0) > 0).map(k => `${SOURCE_TEXT[k]} ${counts[k]} 句`);
    if (!items.length)
        return '';
    return `现在句库里有：${items.join('、')}。`;
}
/** 把 6 个来源里非零的那几个写成「X 40% · Y 20%」；全为 0 时返回空串 */
export function describeMix(mix: Record<string, number>): string {
    return (Object.keys(SOURCE_TEXT) as SentenceSourceType[])
        .filter(k => (mix[k] ?? 0) > 0)
        .map(k => `${SOURCE_TEXT[k]} ${Math.round((mix[k] ?? 0) * 100)}%`)
        .join(' · ');
}
/**
 * 证据阈值名称（学习报告）与词库分级是两套口径，需要一句话说清。
 * Phase 16.2 重写：原来的「按证据次数算」漏掉了「答对质量」和「两个方向」这两个真实条件。
 */
export const MASTERY_DISCLAIMER = '这里的「想得起／用得出」和词库里的「熟练／正常／模糊／不会」是两套口径：词库看最近答得稳不稳，而且「熟练」要求两个方向都答对、还要隔几天再答对；这里看这个周期里独立答对的次数和答对的质量——次数够了但答得慢、答得不稳，也不会算「用得出」。';
/**
 * AI 结果卡上「检查了什么」的边界（Phase 16.3）
 * 质量门检查的是格式/词数/目标词/题目引文这些规则项，不检查事实、文风、教学正确性；
 * 不能把它包装成「全部检查通过」这种全面保证。
 */
export const AI_CHECK_SCOPE_NOTE = '检查的是格式、词数、目标词、题目引文这些规则项；内容是否真实、英语是否自然、答案是否可靠，都还没有人工核对。';
/** 结构自检失败时的内部码（invalid-structure:<kind>）→ 人话 */
export const STRUCTURE_ISSUE_TEXT: Record<string, string> = {
    empty: '没有可用的结构数据',
    'token-index': '词编号对不上',
    'token-text': '词和原句不一致',
    role: '成分角色不认识',
    'head-range': '依存指向越界',
    'self-head': '词指向了自己',
    cycle: '依存关系成环',
    'multi-root': '出现多个根节点',
    'clause-range': '从句范围不对',
    'clause-parent': '从句的上级对不上',
    'clause-nesting': '从句没有正确嵌套在上级范围内',
    'root-clause': '找不到主句',
    'clause-token': '从句里的词对不上',
};
/** 估算可信度（low / medium / high 是内部档位） */
export const CONFIDENCE_TEXT: Record<string, string> = {
    low: '低（样本或词表覆盖有限）',
    medium: '中',
    high: '高',
    none: '无法估计',
};
/** 复盘深度的短名（用在完成态的摘要行里） */
export const INPUT_MODE_SHORT: Record<string, string> = {
    light: '轻量',
    standard: '标准',
    deep: '深入',
};
/** 字幕来源（内部 user_supplied / official_subtitle / machine_generated_unverified…） */
export const TRANSCRIPT_PROVENANCE_TEXT: Record<string, string> = {
    user_supplied: '你自己提供的字幕',
    official_subtitle: '平台官方字幕',
    manually_transcribed: '你手工转录',
    machine_generated_unverified: '机器生成（未验证）',
    unknown: '来源不确定',
};
/** AI 反馈状态（none/pending/ai/unavailable/invalid 是内部值） */
export const FEEDBACK_STATUS_TEXT: Record<string, string> = {
    none: '还没有 AI 反馈',
    pending: 'AI 正在看',
    ai: 'AI 已反馈',
    unavailable: 'AI 这次没连上',
    invalid: 'AI 反馈不合格，已丢弃',
};
/** 配比说明里的短句（比能力行更短，避免长句连读） */
export const SOURCE_SHORTAGE_SHORT: Record<string, string> = {
    'ai-not-configured': '还没有 AI 服务',
    'ai-no-sentences': '还没有生成过 AI 句',
    'real-material-empty': '还没有真实材料里的句子',
    'reading-not-connected': '没有阅读带过来的句子',
    'user-empty': '还没有你自己添加的句子',
    'saved-empty': '还没有收藏的难句',
    'curated-empty': '练习句库是空的',
};
