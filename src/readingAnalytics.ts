// —— Phase 5：阅读分析（纯函数；缺失数据必须如实标注“无数据”）——
// 纪律：first-pass 与 re-read 的速度/理解度绝不混算；自评与系统推断分别标注。
import type { ReadingEvidence, ReadingSession } from './types.ts';
import { explicitUnknownRate, estimatedUnknownRate } from './readingVocabulary.ts';
import { summarizeEvidence } from './readingEvidence.ts';
export interface MetricValue<T> {
    value: T | null;
    available: boolean;
    note: string;
}
const na = <T>(note: string): MetricValue<T> => ({ value: null, available: false, note });
export interface ReadingMetrics {
    wordCount: number;
    firstPassMinutes: MetricValue<number>;
    rereadMinutes: MetricValue<number>;
    firstPassWpm: MetricValue<number>;
    rereadWpm: MetricValue<number>;
    selfReportedFirst: MetricValue<number>;
    selfReportedSecond: MetricValue<number>;
    comprehensionDelta: MetricValue<number>;
    explicitUnknownRate: MetricValue<number>;
    estimatedUnknownRate: MetricValue<number>;
    markedWords: number;
    vagueWords: number;
    difficultSentences: number;
    grammarProblems: string[];
    translationDependenceFirst: MetricValue<string>;
    translationDependenceSecond: MetricValue<string>;
    supportUsage: {
        helps: number;
        maxLevel: number;
        assistedAnswers: number;
    };
    rereadImproved: MetricValue<boolean>;
    caveats: string[];
}
function minutesBetween(a: number | null | undefined, b: number | null | undefined): number | null {
    if (!a || !b || b <= a)
        return null;
    return Math.round(((b - a) / 60000) * 10) / 10;
}
function wpm(words: number, minutes: number | null): number | null {
    if (!minutes || minutes <= 0)
        return null;
    return Math.round((words / minutes) * 10) / 10;
}
export function computeReadingMetrics(session: ReadingSession, opts: {
    tokens?: string[];
    lookup?: (n: string) => import('./types.ts').Word | undefined;
} = {}): ReadingMetrics {
    const detail = session.detail;
    const caveats: string[] = [];
    if (!detail) {
        return {
            wordCount: session.wordCount,
            firstPassMinutes: na('没有会话明细'), rereadMinutes: na('没有会话明细'),
            firstPassWpm: na('没有会话明细'), rereadWpm: na('没有会话明细'),
            selfReportedFirst: na('没有会话明细'), selfReportedSecond: na('没有会话明细'),
            comprehensionDelta: na('没有会话明细'),
            explicitUnknownRate: na('没有会话明细'), estimatedUnknownRate: na('没有会话明细'),
            markedWords: 0, vagueWords: 0, difficultSentences: 0, grammarProblems: [],
            translationDependenceFirst: na('没有会话明细'), translationDependenceSecond: na('没有会话明细'),
            supportUsage: { helps: 0, maxLevel: 0, assistedAnswers: 0 },
            rereadImproved: na('没有会话明细'), caveats: ['旧会话没有 Phase 5 明细数据'],
        };
    }
    const firstMs = detail.firstPassStartedAt && detail.firstPassEndedAt ? detail.firstPassEndedAt - detail.firstPassStartedAt : null;
    const rereadMs = detail.rereadStartedAt && detail.rereadEndedAt ? detail.rereadEndedAt - detail.rereadStartedAt : null;
    const firstMin = firstMs ? Math.round((firstMs / 60000) * 10) / 10 : null;
    const rereadMin = minutesBetween(detail.rereadStartedAt, detail.rereadEndedAt);
    const marks = detail.marks.filter(m => !m.revokedAt);
    const explicit = explicitUnknownRate(marks, session.wordCount, marks.length);
    const evidence: ReadingEvidence[] = detail.evidence;
    const translationFirst = evidence.find(e => e.type === 'translation-dependence' && e.key.endsWith(':first'));
    const translationSecond = evidence.find(e => e.type === 'translation-dependence' && e.key.endsWith(':second'));
    const firstSelf = evidence.find(e => e.type === 'cold-baseline');
    const secondSelf = evidence.find(e => e.type === 'reread-result');
    const first = typeof firstSelf?.value === 'number' ? firstSelf.value : null;
    const second = typeof secondSelf?.value === 'number' ? secondSelf.value : null;
    if (first === null)
        caveats.push('没有冷读自评：理解度无法比较');
    if (!firstMs)
        caveats.push('首读时长缺失：本次速度无法计算');
    const assistedAnswers = detail.comprehension.filter(c => c.assisted).length;
    const maxLevel = detail.helps.reduce((a, h) => Math.max(a, h.level), 0);
    if (maxLevel >= 3)
        caveats.push('用过完整讲解/结构解释：本次不构成独立理解证据');
    const grammarProblems = [...new Set(detail.difficultSentences.flatMap(d => d.problemTypes))];
    let estimated = na<number>('没有提供词表，无法估算');
    if (opts.tokens && opts.lookup) {
        const e = estimatedUnknownRate(marks, opts.tokens, opts.lookup);
        estimated = { value: e.value, available: e.value !== null, note: `${e.method}；${e.note}` };
    }
    return {
        wordCount: session.wordCount,
        firstPassMinutes: firstMin === null ? na('缺少首读起止时间') : { value: firstMin, available: true, note: '首读（无辅助）用时' },
        rereadMinutes: rereadMin === null ? na('没有重读记录') : { value: rereadMin, available: true, note: '重读用时（与首读分开统计）' },
        firstPassWpm: wpm(session.wordCount, firstMin) === null ? na('缺少首读时长') : { value: wpm(session.wordCount, firstMin)!, available: true, note: '首读速度' },
        rereadWpm: wpm(session.wordCount, rereadMin) === null ? na('没有重读记录') : { value: wpm(session.wordCount, rereadMin)!, available: true, note: '重读速度（不能与首读混算）' },
        selfReportedFirst: first === null ? na('未记录') : { value: first, available: true, note: '自评（不是你被验证过的理解率）' },
        selfReportedSecond: second === null ? na('未记录') : { value: second, available: true, note: '重读后的自评' },
        comprehensionDelta: first === null || second === null ? na('需要两次自评才能比较') : { value: second - first, available: true, note: '重读自评 - 首读自评' },
        explicitUnknownRate: explicit.value === null ? na('没有标记') : { value: explicit.value, available: true, note: `${explicit.numerator}/${explicit.denominator} 词；${explicit.note}` },
        estimatedUnknownRate: estimated,
        markedWords: marks.filter(m => m.judgment === 'unknown').length,
        vagueWords: marks.filter(m => m.judgment === 'vague').length,
        difficultSentences: detail.difficultSentences.length,
        grammarProblems,
        translationDependenceFirst: translationFirst ? { value: String(translationFirst.metadata.grade ?? ''), available: true, note: '自评（首读）' } : na('未记录'),
        translationDependenceSecond: translationSecond ? { value: String(translationSecond.metadata.grade ?? ''), available: true, note: '自评（重读）' } : na('未记录'),
        supportUsage: { helps: detail.helps.length, maxLevel, assistedAnswers },
        rereadImproved: first === null || second === null ? na('需要两次自评') : { value: second > first, available: true, note: '仅代表本篇重读的自评变化，不代表阅读能力普遍提高' },
        caveats,
    };
}
// 长期趋势（多篇）：只做真实存在的比较；样本不足时明确说“样本不足”
export interface ReadingTrend {
    passages: number;
    completed: number;
    avgFirstWpm: number | null;
    avgRereadWpm: number | null;
    avgRereadGain: number | null;
    avgExplicitUnknownRate: number | null;
    sampleNote: string;
}
export function computeReadingTrend(sessions: ReadingSession[]): ReadingTrend {
    const withMetrics = sessions.map(s => ({ s, m: computeReadingMetrics(s) }));
    const completed = withMetrics.filter(x => x.s.detail?.state === 'completed');
    const avg = (vals: number[]) => (vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null);
    const firstWpm = completed.map(x => x.m.firstPassWpm.value).filter((v): v is number => v !== null);
    const rereadWpm = completed.map(x => x.m.rereadWpm.value).filter((v): v is number => v !== null);
    const gains = completed.map(x => x.m.comprehensionDelta.value).filter((v): v is number => v !== null);
    const rates = completed.map(x => x.m.explicitUnknownRate.value).filter((v): v is number => v !== null);
    return {
        passages: sessions.length,
        completed: completed.length,
        avgFirstWpm: avg(firstWpm),
        avgRereadWpm: avg(rereadWpm),
        avgRereadGain: avg(gains),
        avgExplicitUnknownRate: avg(rates),
        sampleNote: completed.length < 3 ? `只有 ${completed.length} 篇完成的阅读，趋势还不可靠` : `${completed.length} 篇完成的阅读`,
    };
}
export function evidenceDigest(session: ReadingSession) {
    return summarizeEvidence(session.detail?.evidence ?? []);
}
// 下一篇难度目标：给 Planner / 推荐用（comfort 80–90% / growth 65–80% 是目标区间，不是承诺）
export function targetDifficultyBand(history: Array<{
    comprehension: number | null;
}>): {
    band: 'comfort' | 'growth';
    reason: string;
} {
    const known = history.map(h => h.comprehension).filter((v): v is number => v !== null);
    if (!known.length)
        return { band: 'growth', reason: '还没有阅读理解数据，先按成长区试一篇' };
    const avg = known.reduce((a, b) => a + b, 0) / known.length;
    if (avg >= 88)
        return { band: 'growth', reason: `最近平均自评 ${Math.round(avg)}%，可以上调到成长区` };
    if (avg < 65)
        return { band: 'comfort', reason: `最近平均自评 ${Math.round(avg)}%，先回到舒适区重建信心` };
    return { band: 'growth', reason: `最近平均自评 ${Math.round(avg)}%，保持在成长区` };
}
