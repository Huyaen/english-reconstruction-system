// —— 多词池选择 / Learning Value / 初始比例 / 动态新词量（Phase 2：2.9–2.12）——
// 全部为确定性本地算法（不依赖 AI）；权重集中配置；返回 reasons/components 供 UI 与调试使用。
import type { EnergyState, MiniUnit, Word } from './types.ts';
import { isForgotten, isUnseen, lifecycleOf } from './evidence.ts';
export const POOL_CONFIG = {
    ratio: { foundation: 0.55, miniUnit: 0.25, encountered: 0.2 }, // 初始比例；缺口自动重分配
    fallbackOrder: ['foundation', 'encountered', 'miniUnit'] as const,
    forgottenQuotaShare: 0.5, // 每日回流词 ≤ ceil(newCount × share)；回流不计入“新词”数
    value: { foundationTagBonus: 40, foundationOrderMax: 30, encounterEach: 10, encounteredCap: 40, forgottenBonus: 25, difficultyFitBonus: 10, tooHardPenalty: 10, properNounPenalty: 25 },
    dynamicCount: { minutesPerNewWord: 0.6, newTimeShare: 0.35, defaultAvailableMinutes: 30, min: 5, max: 40, retentionHigh: 0.8, retentionLow: 0.6, energyFactor: { low: 0.7, normal: 1, good: 1.1 }, dueHeavy: 40, dueVeryHeavy: 80, weakHeavy: 100 },
} as const;
export type PoolName = 'foundation' | 'miniUnit' | 'encountered' | 'forgotten';
const FOUNDATION_TAGS = ['核心', '基础', '高频', '高考', 'gk', 'foundation'];
// 专名启发式（英文首字母大写且中文释义很短的单token）——仅作降权信号，不是绝对判断
export function looksProperNoun(w: Word): boolean {
    const en = w.en.trim();
    if (!en || en.includes(' '))
        return false;
    const first = en[0];
    return first >= 'A' && first <= 'Z' && !/[\u4e00-\u9fff]/.test(en) && w.zh.length <= 12;
}
export interface LearningValue {
    score: number;
    reasons: string[];
    components: Record<string, number>;
}
export function learningValue(w: Word, now = Date.now()): LearningValue {
    void now;
    const cfg = POOL_CONFIG.value;
    const reasons: string[] = [];
    const c: Record<string, number> = {};
    const tags = `${w.tags || ''} ${w.difficulty || ''}`.toLowerCase();
    const tagged = FOUNDATION_TAGS.some(t => tags.includes(t));
    c.foundation = tagged ? cfg.foundationTagBonus : Math.round(cfg.foundationOrderMax * (1 - Math.min(w.order, 3000) / 3000) * 10) / 10;
    if (tagged)
        reasons.push('foundation-tag');
    c.encounter = w.exposureCount ? Math.min(cfg.encounteredCap, w.exposureCount * cfg.encounterEach) : 0;
    if (c.encounter)
        reasons.push(`encountered-x${w.exposureCount}`);
    c.forgotten = isForgotten(w) ? cfg.forgottenBonus : 0;
    if (c.forgotten)
        reasons.push('forgotten-reflow');
    const tooHard = w.state.level === 'unknown' && w.state.total >= 3 && w.state.lapses >= 2;
    c.difficultyFit = tooHard ? -cfg.tooHardPenalty : cfg.difficultyFitBonus;
    if (tooHard)
        reasons.push('too-hard-penalty');
    c.properNoun = looksProperNoun(w) ? -cfg.properNounPenalty : 0;
    if (c.properNoun)
        reasons.push('possible-proper-noun');
    const score = Math.round(Object.values(c).reduce((a, b) => a + b, 0) * 10) / 10;
    return { score, reasons, components: c };
}
export interface NewWordItem {
    wordId: string;
    pool: PoolName;
    kind: 'new' | 'forgotten';
    value: LearningValue;
}
export interface NewWordQueue {
    items: NewWordItem[];
    breakdown: {
        requested: number;
        newCount: number;
        forgottenCount: number;
        byPool: Record<PoolName, number>;
        fallbackReasons: string[];
    };
}
export interface QueueOptions {
    count: number;
    miniUnit?: MiniUnit | null;
    now?: number;
}
// 多词池选择：Forgotten 优先回流（kind='forgotten'，不计入新词数）；
// 新词池优先级：miniUnit > encountered > foundation；缺口沿 fallbackOrder 重分配（graceful fallback，不造假数据）。
export function buildNewWordQueue(words: Word[], opts: QueueOptions): NewWordQueue {
    const now = opts.now ?? Date.now();
    const want = Math.max(0, Math.floor(opts.count));
    const fallbackReasons: string[] = [];
    const eligible = words.filter(w => (isUnseen(w) || lifecycleOf(w) === 'previewed') && w.previewResult !== 'skip' && !isForgotten(w));
    const forgottenWords = words.filter(isForgotten);
    const inUnit = new Set((opts.miniUnit?.targetWords ?? []).map(x => x.toLowerCase()));
    const pools: Record<'miniUnit' | 'encountered' | 'foundation', Word[]> = { miniUnit: [], encountered: [], foundation: [] };
    for (const w of eligible) {
        if (inUnit.has(w.en.toLowerCase()))
            pools.miniUnit.push(w);
        else if (w.exposureCount > 0)
            pools.encountered.push(w);
        else
            pools.foundation.push(w);
    }
    const byValue = (arr: Word[]) => arr.map(w => ({ w, v: learningValue(w, now) })).sort((a, b) => b.v.score - a.v.score).map(x => x.w);
    const sorted = { foundation: byValue(pools.foundation), miniUnit: byValue(pools.miniUnit), encountered: byValue(pools.encountered) };
    const picked: NewWordItem[] = [];
    const byPool: Record<PoolName, number> = { foundation: 0, miniUnit: 0, encountered: 0, forgotten: 0 };
    const quota = { foundation: Math.round(want * POOL_CONFIG.ratio.foundation), miniUnit: Math.round(want * POOL_CONFIG.ratio.miniUnit), encountered: 0 };
    quota.encountered = Math.max(0, want - quota.foundation - quota.miniUnit);
    const cursorAt: Record<'foundation' | 'miniUnit' | 'encountered', number> = { foundation: 0, miniUnit: 0, encountered: 0 };
    const take = (name: 'foundation' | 'miniUnit' | 'encountered', limit: number) => {
        while (picked.length < want && byPool[name] < limit && cursorAt[name] < sorted[name].length) {
            const w = sorted[name][cursorAt[name]];
            picked.push({ wordId: w.id, pool: name, kind: 'new', value: learningValue(w, now) });
            cursorAt[name]++;
            byPool[name]++;
        }
    };
    take('foundation', quota.foundation);
    take('miniUnit', quota.miniUnit);
    take('encountered', quota.encountered);
    if (picked.length < want) {
        let logged = false;
        for (const name of POOL_CONFIG.fallbackOrder) {
            if (picked.length >= want)
                break;
            const before = picked.length;
            take(name, want);
            if (picked.length > before && !logged) {
                fallbackReasons.push('pool-empty-redistribute');
                logged = true;
            }
        }
    }
    const fQuota = Math.min(forgottenWords.length, Math.ceil(want * POOL_CONFIG.forgottenQuotaShare));
    const forgottenPicked: NewWordItem[] = byValue(forgottenWords).slice(0, fQuota).map(w => ({ wordId: w.id, pool: 'forgotten' as PoolName, kind: 'forgotten' as const, value: learningValue(w, now) }));
    byPool.forgotten = forgottenPicked.length;
    return { items: [...forgottenPicked, ...picked], breakdown: { requested: want, newCount: picked.length, forgottenCount: forgottenPicked.length, byPool, fallbackReasons } };
}
// —— 动态新词量（纯函数 / service API；Phase 3 Daily Planner 直接调用本函数，不重新实现）——
export interface NewCountInput {
    availableMinutes?: number;
    energyState?: EnergyState;
    d1Retention?: number | null;
    d7Retention?: number | null;
    weakLoad?: number;
    dueLoad?: number;
    recentAccuracy?: number | null;
}
export interface NewCountResult {
    recommended: number;
    min: number;
    max: number;
    components: Record<string, number>;
    reasons: string[];
}
export function recommendedNewWordCount(i: NewCountInput = {}): NewCountResult {
    const cfg = POOL_CONFIG.dynamicCount;
    const reasons: string[] = [];
    const minutes = i.availableMinutes ?? cfg.defaultAvailableMinutes;
    const timeBudget = Math.round(minutes * cfg.newTimeShare * 10) / 10;
    const base = timeBudget / cfg.minutesPerNewWord;
    const d7 = i.d7Retention ?? null;
    let retentionFactor = 1;
    if (d7 === null)
        reasons.push('retention-unknown-neutral');
    else if (d7 >= cfg.retentionHigh) {
        retentionFactor = 1.2;
        reasons.push('d7-high-more-new');
    }
    else if (d7 < cfg.retentionLow) {
        retentionFactor = 0.6;
        reasons.push('d7-low-fewer-new');
    }
    const d1 = i.d1Retention ?? null;
    if (d1 !== null && d1 < 0.6)
        retentionFactor = Math.min(retentionFactor, 0.7);
    if (d1 !== null && d1 < 0.6)
        reasons.push('d1-low-cap');
    const energyFactor = cfg.energyFactor[i.energyState ?? 'normal'];
    if (energyFactor !== 1)
        reasons.push(`energy-${i.energyState ?? 'normal'}`);
    const due = i.dueLoad ?? 0;
    const weak = i.weakLoad ?? 0;
    let loadFactor = 1;
    if (due > cfg.dueVeryHeavy) {
        loadFactor = 0.5;
        reasons.push('due-heavy');
    }
    else if (due > cfg.dueHeavy) {
        loadFactor = 0.7;
        reasons.push('due-moderate');
    }
    if (weak > cfg.weakHeavy)
        loadFactor = Math.min(loadFactor, 0.8);
    if (weak > cfg.weakHeavy)
        reasons.push('weak-load');
    if (i.recentAccuracy != null && i.recentAccuracy < 0.6) {
        loadFactor = Math.min(loadFactor, 0.8);
        reasons.push('recent-accuracy-low');
    }
    const raw = base * retentionFactor * energyFactor * loadFactor;
    const recommended = Math.max(cfg.min, Math.min(cfg.max, Math.round(raw)));
    return { recommended, min: cfg.min, max: cfg.max, components: { base: Math.round(base * 10) / 10, timeBudget, retentionFactor, energyFactor, loadFactor }, reasons };
}
