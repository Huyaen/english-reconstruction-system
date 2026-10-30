// —— 证据系统与三维掌握（Phase 2：2.5 / 2.7 / 2.8）——
// Exposure（看见）≠ Recall Evidence（主动提取）≠ Production Evidence（主动使用）。
// 三维分数（recognition / activeRecall / productive）为 EWMA 连续值；生命周期由多证据推导，
// 二者相关但不互为替代（生命周期可升可降，分数连续变化）。
import type { Direction, ExposureState, Lifecycle, Word, WordExposure } from './types.ts';
export const EVIDENCE_CONFIG = {
    alpha: 0.2, // EWMA 学习率：单个证据不主导，短期刷题无法快速拉满分
    quality: { fast: 1, normal: 0.7, slow: 0.4, wrong: 0 },
    lifecycle: { recognitionMinScore: 55, recognitionMinEvidence: 3, activeMinScore: 55, activeMinEvidence: 3, productiveMinScore: 40, productiveMinEvidence: 3 },
    forgotten: { minTotal: 4, minSpaced: 1, minReps: 3 },
} as const;
export type PreviewResult = 'know' | 'familiar' | 'unknown' | 'skip';
export function exposureStateFromPreview(result: PreviewResult): ExposureState | null {
    switch (result) {
        case 'know': return 'known';
        case 'familiar': return 'vague';
        case 'unknown': return 'unknown';
        default: return null;
    }
}
// 本次作答质量（用于三维分数）：错误=0；秒答=1；正常=0.7；较慢=0.4
export function qualityFromAnswer(correct: boolean, ms: number, s: {
    fast: number;
    normal: number;
}): number {
    if (!correct)
        return EVIDENCE_CONFIG.quality.wrong;
    if (ms <= s.fast)
        return EVIDENCE_CONFIG.quality.fast;
    if (ms <= s.normal)
        return EVIDENCE_CONFIG.quality.normal;
    return EVIDENCE_CONFIG.quality.slow;
}
function ewma(old: number, quality: number): number {
    const next = old * (1 - EVIDENCE_CONFIG.alpha) + quality * 100 * EVIDENCE_CONFIG.alpha;
    return Math.round(Math.max(0, Math.min(100, next)) * 10) / 10;
}
export interface PreviewOutcome {
    word: Word;
    exposure: WordExposure | null;
}
// Preview 结果落盘：只改 previewedAt / previewResult / exposure（**不直接给 mastery**）
export function applyPreview(word: Word, result: PreviewResult, now: number, exposureId: string): PreviewOutcome {
    const w: Word = { ...word, previewedAt: word.previewedAt || now, previewResult: result, lastEncounteredAt: now };
    if (result === 'skip')
        return { word: w, exposure: null };
    w.exposureCount = word.exposureCount + 1;
    const exposure: WordExposure = { id: exposureId, wordId: word.id, at: now, sourceType: 'preview', sourceId: '', state: exposureStateFromPreview(result)!, sentence: '', counted: true };
    return { word: w, exposure };
}
// 阅读 / 输入中的“看见”证据（Exposure ≠ mastery）
export function applyExposure(word: Word, info: Pick<WordExposure, 'sentence'>, now: number): Word {
    const w = { ...word };
    w.exposureCount = word.exposureCount + 1;
    if (info.sentence)
        w.contextExposureCount = word.contextExposureCount + 1;
    w.lastEncounteredAt = now;
    return w;
}
// 主动提取证据：En→中 计入 recognition；中→En 计入 activeRecall
export function applyRecallEvidence(word: Word, direction: Direction, quality: number): Word {
    const w = { ...word };
    if (direction === 'en-zh')
        w.recognitionScore = ewma(word.recognitionScore, quality);
    else
        w.activeRecallScore = ewma(word.activeRecallScore, quality);
    return w;
}
// 生产性证据 API（供 Output Lab 等后续模块调用；当前无 Output Lab 也保留完整数据通路）
export function applyProductionEvidence(word: Word, quality = 1): Word {
    const w = { ...word };
    w.productionEvidence = word.productionEvidence + 1;
    w.productiveScore = ewma(word.productiveScore, quality);
    return w;
}
// 生命周期推导（多证据；允许回退）：
// productive → active → recognition → learning → previewed → unseen
export function lifecycleOf(w: Word): Lifecycle {
    const c = EVIDENCE_CONFIG.lifecycle;
    if (w.productionEvidence >= c.productiveMinEvidence && w.productiveScore >= c.productiveMinScore)
        return 'productive';
    const rec = w.state.directions['en-zh'];
    const act = w.state.directions['zh-en'];
    const recognitionOK = w.recognitionScore >= c.recognitionMinScore && rec.total >= c.recognitionMinEvidence;
    const activeOK = recognitionOK && w.activeRecallScore >= c.activeMinScore && act.total >= c.activeMinEvidence;
    if (activeOK)
        return 'active';
    if (recognitionOK)
        return 'recognition';
    if (w.state.total > 0)
        return 'learning';
    if (w.previewedAt > 0)
        return 'previewed';
    return 'unseen';
}
export function isUnseen(w: Word): boolean {
    return w.state.total === 0 && w.previewedAt === 0;
}
// 回忆资格：UNSEEN（从未预览且从未测试）不得进入正式 Recall；其余词可测
export function recallEligible(w: Word): boolean {
    return !isUnseen(w);
}
// “曾经较稳定、后来遗忘”：有跨间隔证据 + 当前处于 unknown/vague + 至少一次 lapse
export function isForgotten(w: Word): boolean {
    const c = EVIDENCE_CONFIG.forgotten;
    return w.state.lapses >= 1 && w.state.total >= c.minTotal && (w.state.level === 'unknown' || w.state.level === 'vague') && (w.schedule.spacedPasses >= c.minSpaced || w.fsrs.reps >= c.minReps);
}
export const LIFECYCLE_LABELS: Record<Lifecycle, string> = { unseen: '未预览', previewed: '已预览', learning: '学习中', recognition: '看得懂', active: '想得起', productive: '用得出' };
