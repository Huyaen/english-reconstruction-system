// —— Phase 10：诊断指标的公共语义 ——
// 纪律：
//   1) 没有足够证据 → value=null + evaluability='insufficient'，绝不用 0 冒充。
//   2) 所有比率都显式带 numerator/denominator；分母为 0 时不可评估。
//   3) 不合成单一“英语分数”；指标只描述各自证据。
//   4) 窗口长度必须与对比窗口一致，否则不可比。
import type { DiagnosticEvidenceMix, DiagnosticQuality, MetricComparison, MetricEvaluability, MetricValue, DiagnosticDomain, } from './types.ts';
export const DAY_MS = 86400000;
export const RATE_MIN_SAMPLE = 5;
export const DURATION_MIN_SAMPLE = 3;
export const COUNT_MIN_SAMPLE = 1;
export interface Range {
    from: number;
    to: number;
    days: number;
}
export function dayStart(ts: number): number {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}
/** 以“今天 00:00 之后”为终点，取最近 days 个完整自然日（含今天）。 */
export function recentRange(now: number, days: number): Range {
    const n = Math.max(1, Math.floor(days));
    const to = dayStart(now) + DAY_MS;
    return { from: to - n * DAY_MS, to, days: n };
}
export function previousRange(range: Range): Range {
    return { from: range.from - range.days * DAY_MS, to: range.from, days: range.days };
}
export function inRange(at: number, range: Range): boolean {
    return at >= range.from && at < range.to;
}
export function percent(numerator: number, denominator: number): number | null {
    if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0)
        return null;
    const r = numerator / denominator;
    if (!Number.isFinite(r))
        return null;
    return Math.round(Math.min(1, Math.max(0, r)) * 1000) / 1000;
}
export function mean(values: number[]): number | null {
    const xs = values.filter(v => Number.isFinite(v));
    if (!xs.length)
        return null;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
}
export function quantile(values: number[], q: number): number | null {
    const xs = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
    if (!xs.length)
        return null;
    const pos = (xs.length - 1) * Math.min(1, Math.max(0, q));
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return xs[lo] + (xs[hi] - xs[lo]) * (pos - lo);
}
export function median(values: number[]): number | null {
    return quantile(values, 0.5);
}
export function average(values: number[]): number | null {
    return mean(values);
}
export function qualityOf(mix: Omit<DiagnosticEvidenceMix, 'quality' | 'note'>): DiagnosticQuality {
    if (mix.verified > 0 && mix.verified >= mix.selfReport + mix.inferred)
        return 'verified';
    if (mix.verified > 0)
        return 'mixed';
    if (mix.taskBehavior > 0)
        return mix.selfReport + mix.inferred > 0 ? 'mixed' : 'task-behavior';
    if (mix.selfReport > 0)
        return 'self-report';
    return 'none';
}
export function evidenceNote(mix: Omit<DiagnosticEvidenceMix, 'quality' | 'note'>): string {
    if (!mix.verified && !mix.taskBehavior && !mix.selfReport && !mix.inferred)
        return '本窗口没有可用证据。';
    const parts = [
        mix.verified ? `可核对 ${mix.verified}` : '',
        mix.taskBehavior ? `行为证据 ${mix.taskBehavior}` : '',
        mix.selfReport ? `自评 ${mix.selfReport}` : '',
        mix.inferred ? `系统推断 ${mix.inferred}` : '',
    ].filter(Boolean);
    return `${parts.join(' · ')}；${mix.distinctSources <= 1 ? '来源单一，不能据此下强结论。' : `来自 ${mix.distinctSources} 类来源。`}`;
}
export interface MetricInput {
    id: string;
    domain: DiagnosticDomain;
    label: string;
    kind: MetricValue['kind'];
    value: number | null;
    definition: string;
    sample: number;
    minSample?: number;
    numerator?: number | null;
    denominator?: number | null;
    quality?: DiagnosticQuality;
    reasons?: string[];
    notApplicable?: boolean;
}
/** 统一构造指标：NaN/Infinity 一律转 null，样本不足自动降级。 */
export function metric(input: MetricInput): MetricValue {
    const minSample = input.minSample ?? (input.kind === 'rate' ? RATE_MIN_SAMPLE : input.kind === 'duration' ? DURATION_MIN_SAMPLE : COUNT_MIN_SAMPLE);
    const reasons = [...(input.reasons ?? [])];
    let value = input.value;
    if (value !== null && !Number.isFinite(value)) {
        value = null;
        reasons.push('数值无效（NaN/Infinity），已按不可评估处理。');
    }
    let evaluability: MetricEvaluability = input.notApplicable ? 'not-applicable' : 'evaluable';
    if (!input.notApplicable && value === null) {
        evaluability = 'insufficient';
        if (!reasons.length)
            reasons.push('没有可计算的值。');
    }
    else if (!input.notApplicable && input.sample < minSample) {
        evaluability = 'insufficient';
        reasons.push(`样本 ${input.sample} < 最少 ${minSample}，不展示为结论。`);
    }
    return {
        id: input.id,
        domain: input.domain,
        label: input.label,
        kind: input.kind,
        value: evaluability === 'insufficient' ? null : value,
        numerator: input.numerator ?? null,
        denominator: input.denominator ?? null,
        sample: input.sample,
        minSample,
        evaluability,
        quality: input.quality ?? 'none',
        definition: input.definition,
        reasons,
    };
}
export function rateMetric(args: Omit<MetricInput, 'kind' | 'value'> & {
    numerator: number;
    denominator: number;
}): MetricValue {
    return metric({
        ...args,
        kind: 'rate',
        value: percent(args.numerator, args.denominator),
        numerator: args.numerator,
        denominator: args.denominator,
    });
}
/** 同一指标、同一窗口长度的对比；任一侧不可评估或窗口不等长 → comparable=false。 */
export function compareMetric(current: MetricValue | undefined, previous: MetricValue | undefined, currentDays: number, previousDays: number): MetricComparison | null {
    if (!current || !previous)
        return null;
    const sameWindow = currentDays === previousDays;
    const bothEvaluable = current.evaluability === 'evaluable' && previous.evaluability === 'evaluable';
    const comparable = sameWindow && bothEvaluable && current.value !== null && previous!.value !== null;
    let reason = '';
    if (!sameWindow)
        reason = `窗口长度不同（${currentDays} 天 vs ${previousDays} 天），不可直接比较。`;
    else if (!bothEvaluable)
        reason = '至少一侧证据不足。';
    else if (current.minSample !== previous.minSample)
        reason = '两次的样本门槛不同，不可比较。';
    return {
        metricId: current.id,
        label: current.label,
        current: current.value,
        previous: previous.value,
        delta: comparable ? Math.round((current.value! - previous.value!) * 1000) / 1000 : null,
        comparable,
        reason: comparable ? '同长度窗口、两侧均达到最少样本。' : reason,
    };
}
export function clampDays(days: number | undefined, fallback = 7): number {
    if (!days || !Number.isFinite(days))
        return fallback;
    return Math.min(90, Math.max(1, Math.floor(days)));
}
