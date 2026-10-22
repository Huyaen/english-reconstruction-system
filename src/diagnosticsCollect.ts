// —— Phase 10：从真实记录汇总指标（纯函数，不读全局时钟）——
// 只统计窗口内的行为；保留每个指标的分母与来源质量，不把曝光当掌握。
import type { Data, MetricValue, ReadingEvidence, RetentionPoint, SentenceAttempt } from './types.ts';
import { DAY_MS, RATE_MIN_SAMPLE, average, inRange, median, metric, percent, rateMetric, type Range, } from './diagnosticsModel.ts';
import { EVIDENCE_CONFIG, lifecycleOf } from './evidence.ts';
const lower = (s: string) => s.toLowerCase();
export interface RetentionResult {
    points: RetentionPoint[];
    reviewsUsed: number;
    notes: string[];
}
/** D1/D7/D30：按“首次出现后第 N 个 24h 窗口”分桶；错过的日子不补算，不插值。 */
export function retentionReport(data: Data): RetentionResult {
    const first = new Map<string, number>();
    for (const w of data.words)
        first.set(w.id, Number.POSITIVE_INFINITY);
    for (const e of data.wordExposures) {
        if (!e.counted)
            continue;
        const prev = first.get(e.wordId);
        if (prev === undefined || e.at < prev)
            first.set(e.wordId, e.at);
    }
    for (const r of data.records) {
        const prev = first.get(r.wordId);
        if (prev === undefined || r.at < prev)
            first.set(r.wordId, r.at);
    }
    const buckets: Record<'D1' | 'D7' | 'D30', {
        total: number;
        correct: number;
    }> = {
        D1: { total: 0, correct: 0 },
        D7: { total: 0, correct: 0 },
        D30: { total: 0, correct: 0 },
    };
    let used = 0;
    for (const r of data.records) {
        const start = first.get(r.wordId);
        if (!start || !Number.isFinite(start) || r.at <= start)
            continue;
        const day = Math.floor((r.at - start) / DAY_MS);
        const key = day === 1 ? 'D1' : day === 7 ? 'D7' : day === 30 ? 'D30' : null;
        if (!key)
            continue;
        buckets[key].total += 1;
        if (r.correct)
            buckets[key].correct += 1;
        used += 1;
    }
    const points: RetentionPoint[] = (['D1', 'D7', 'D30'] as const).map(label => {
        const b = buckets[label];
        const evaluable = b.total >= RATE_MIN_SAMPLE;
        return {
            label,
            total: b.total,
            correct: b.correct,
            rate: evaluable ? percent(b.correct, b.total) : null,
            evaluable,
            note: evaluable
                ? `首次出现后第 ${label.slice(1)} 个 24h 窗口内的复习正确率（${b.correct}/${b.total}）。`
                : `样本 ${b.total} < ${RATE_MIN_SAMPLE}，不计算 ${label}。`,
        };
    });
    return {
        points,
        reviewsUsed: used,
        notes: ['保持率按首次出现后的第 1/7/30 个 24h 窗口统计；没有恰好落在窗口内的复习就不补算，也不外推。'],
    };
}
function vocabularyMetrics(data: Data, range: Range, retention: RetentionResult): MetricValue[] {
    const words = data.words;
    const stable = words.filter(w => ['active', 'productive'].includes(lifecycleOf(w))).length;
    const active = words.filter(w => lifecycleOf(w) === 'active').length;
    const productive = words.filter(w => lifecycleOf(w) === 'productive').length;
    const reviews = data.records.filter(r => inRange(r.at, range));
    const exposures = data.wordExposures.filter(e => e.counted && inRange(e.at, range));
    const ms = reviews.map(r => r.ms).filter(v => Number.isFinite(v) && v > 0);
    const metrics: MetricValue[] = [
        metric({
            id: 'vocab.stable', domain: 'vocabulary', label: '稳定词汇量（active + productive）', kind: 'count',
            value: stable, sample: words.length, minSample: 1, quality: 'mixed',
            definition: '生命周期达到 active 或 productive 的词数；由既有识别/提取/产出证据阈值决定，不是自报。',
            reasons: [`全库 ${words.length} 个词；active ${active}、productive ${productive}。`],
        }),
        metric({
            id: 'vocab.active', domain: 'vocabulary', label: '主动词汇（active）', kind: 'count', value: active,
            sample: words.length, minSample: 1, quality: 'mixed',
            definition: '识别达标 + 中→英主动提取证据 ≥ 3 次且分数达标。',
        }),
        metric({
            id: 'vocab.productive', domain: 'vocabulary', label: '产出词汇（productive）', kind: 'count', value: productive,
            sample: words.length, minSample: 1, quality: 'mixed',
            definition: '有独立产出证据（≥3 条且分数达标），不是“写过一次”。',
        }),
        metric({
            id: 'vocab.retrievalMs', domain: 'vocabulary', label: '提取速度（中位反应时间）', kind: 'duration',
            value: median(ms), sample: ms.length, quality: 'task-behavior',
            definition: '本窗口内单词测试反应时间的中位数（毫秒）；越短不一定越好，需与正确率一起看。',
        }),
        metric({
            id: 'vocab.reviews', domain: 'vocabulary', label: '复习次数', kind: 'count', value: reviews.length,
            sample: reviews.length, quality: 'task-behavior', definition: '本窗口内完成的单词测试记录数。',
        }),
        metric({
            id: 'vocab.exposures', domain: 'vocabulary', label: '有效接触次数', kind: 'count', value: exposures.length,
            sample: exposures.length, quality: 'mixed', definition: '本窗口内 counted=true 的词汇接触记录；曝光不是掌握。',
        }),
    ];
    for (const p of retention.points) {
        metrics.push(metric({
            id: `vocab.retention.${p.label.toLowerCase()}`, domain: 'vocabulary', label: `${p.label} 保持率`, kind: 'rate',
            value: p.rate, sample: p.total, quality: 'task-behavior', numerator: p.correct, denominator: p.total,
            definition: `首次出现后第 ${p.label.slice(1)} 个 24h 窗口的复习正确率；样本不足时留空。`,
            reasons: [p.note],
        }));
    }
    return metrics;
}
function weakestConcept(data: Data, range: Range): {
    id: string;
    name: string;
    rate: number;
    sample: number;
} | null {
    const per = new Map<string, {
        total: number;
        correct: number;
    }>();
    for (const a of data.grammarAttempts) {
        if (!inRange(a.at, range))
            continue;
        const cur = per.get(a.conceptId) ?? { total: 0, correct: 0 };
        cur.total += 1;
        if (a.correct)
            cur.correct += 1;
        per.set(a.conceptId, cur);
    }
    let worst: {
        id: string;
        name: string;
        rate: number;
        sample: number;
    } | null = null;
    for (const [id, v] of per) {
        if (v.total < RATE_MIN_SAMPLE)
            continue;
        const rate = v.correct / v.total;
        if (!worst || rate < worst.rate || (rate === worst.rate && id < worst.id)) {
            worst = { id, name: data.grammarConcepts.find(c => c.id === id)?.name ?? id, rate, sample: v.total };
        }
    }
    return worst;
}
function grammarMetrics(data: Data, range: Range): MetricValue[] {
    const attempts = data.grammarAttempts.filter(a => inRange(a.at, range));
    const correct = attempts.filter(a => a.correct).length;
    const independent = attempts.filter(a => a.independent && a.correct).length;
    const sentence = data.sentenceAttempts.filter(a => inRange(a.at ?? a.createdAt, range));
    const sentenceEvaluable = sentence.filter(a => a.structureCorrect !== null);
    const structureCorrect = sentenceEvaluable.filter(a => a.structureCorrect).length;
    const readingObstacles = data.readingSessions
        .filter(s => inRange(s.at, range))
        .flatMap(s => s.detail?.evidence ?? [])
        .filter(e => e.type === 'grammar-obstacle' || e.type === 'vocabulary-obstacle');
    const worst = weakestConcept(data, range);
    const metrics: MetricValue[] = [
        rateMetric({
            id: 'grammar.accuracy', domain: 'grammar', label: '语法题正确率', numerator: correct, denominator: attempts.length,
            sample: attempts.length, quality: 'task-behavior',
            definition: '本窗口语法识别题的正确比例（含提示后的作答）；提示后的正确不等于独立掌握。',
        }),
        rateMetric({
            id: 'grammar.independentAccuracy', domain: 'grammar', label: '独立语法正确率', numerator: independent, denominator: attempts.length,
            sample: attempts.length, quality: 'task-behavior',
            definition: 'independent=true 的语法作答正确比例；分母仍是全部语法作答。',
        }),
        rateMetric({
            id: 'grammar.sentenceStructure', domain: 'grammar', label: '句子结构正确率', numerator: structureCorrect, denominator: sentenceEvaluable.length,
            sample: sentenceEvaluable.length, quality: 'task-behavior',
            definition: '句子实验室中结构可判定的尝试；含提示/照抄的尝试不产生独立证据。',
        }),
        metric({
            id: 'grammar.obstacles', domain: 'grammar', label: '阅读中的语法/词汇障碍标记', kind: 'count', value: readingObstacles.length,
            sample: readingObstacles.length, quality: 'self-report', definition: '阅读时用户主动标记为语法/词汇障碍的证据条数。',
        }),
    ];
    if (worst) {
        metrics.push(metric({
            id: 'grammar.weakest', domain: 'grammar', label: `最需补的语法点：${worst.name}`, kind: 'rate', value: Math.round(worst.rate * 1000) / 1000,
            sample: worst.sample, quality: 'task-behavior', numerator: Math.round(worst.rate * worst.sample), denominator: worst.sample,
            definition: '本窗口内样本 ≥ 5 的语法点中正确率最低者；同分取 id 较小者，规则确定。',
        }));
    }
    return metrics;
}
function readingMetrics(data: Data, range: Range): MetricValue[] {
    const sessions = data.readingSessions.filter(s => inRange(s.at, range));
    const details = sessions.map(s => s.detail).filter((d): d is NonNullable<typeof d> => !!d);
    const marks = details.flatMap(d => d.marks.filter(m => !m.revokedAt));
    const judged = marks.length;
    const unknown = marks.filter(m => m.judgment === 'unknown' || m.judgment === 'guessed').length;
    const vague = marks.filter(m => m.judgment === 'vague').length;
    const verified = details.flatMap(d => d.comprehension).filter(c => c.scoredBy === 'verified-key' && typeof c.score === 'number');
    const self = details.flatMap(d => d.comprehension).filter(c => c.scoredBy === 'self' && typeof c.score === 'number');
    const durations = sessions.filter(s => s.durationMs >= 60000);
    const speeds = durations.map(s => s.wordCount / (s.durationMs / 60000)).filter(v => Number.isFinite(v) && v > 0);
    const reread = details
        .map(d => {
        const cold = d.comprehension.find(c => c.stage === 'cold-test' && c.scoredBy === 'self');
        const again = d.comprehension.find(c => c.stage === 'reread' && c.scoredBy === 'self');
        return cold?.score !== null && again?.score !== null && cold && again ? again.score! - cold.score! : null;
    })
        .filter((v): v is number => v !== null);
    return [
        metric({ id: 'reading.sessions', domain: 'reading', label: '完成阅读会话', kind: 'count', value: sessions.length, sample: sessions.length, quality: 'task-behavior', definition: '本窗口内创建/完成的阅读会话数。' }),
        rateMetric({
            id: 'reading.unknownRate', domain: 'reading', label: '未知词率（显式标记）', numerator: unknown, denominator: judged,
            sample: judged, quality: 'self-report',
            definition: '阅读中主动标记为 unknown/guessed 的 token ÷ 全部已标记 token；没有标记时留空，不用估算值冒充。',
        }),
        rateMetric({
            id: 'reading.uncertainRate', domain: 'reading', label: '模糊词率', numerator: vague, denominator: judged,
            sample: judged, quality: 'self-report', definition: '标记为 vague 的 token ÷ 全部已标记 token。',
        }),
        rateMetric({
            id: 'reading.verifiedComprehension', domain: 'reading', label: '可核对理解正确率', numerator: verified.filter(c => (c.score ?? 0) >= 60).length, denominator: verified.length,
            sample: verified.length, quality: 'verified', definition: '有标准答案/可核对条目的得分 ≥60 视为通过；自评不计入。',
        }),
        rateMetric({
            id: 'reading.selfComprehension', domain: 'reading', label: '自评理解（≥60 的比例）', numerator: self.filter(c => (c.score ?? 0) >= 60).length, denominator: self.length,
            sample: self.length, quality: 'self-report', definition: '自报理解度 ≥60 的会话比例；只代表主观感受。',
        }),
        metric({ id: 'reading.speed', domain: 'reading', label: '阅读速度（词/分钟，中位数）', kind: 'index', value: median(speeds), sample: speeds.length, quality: 'task-behavior', definition: '词数 ÷ 实际阅读分钟（至少 60 秒的会话）；不同材料难度下不可直接比。' }),
        metric({ id: 'reading.rereadDelta', domain: 'reading', label: '重读自评提升（百分点）', kind: 'index', value: average(reread), sample: reread.length, quality: 'self-report', definition: '同一会话的“重读后自评 − 首读自评”；仅自评，且不同材料次数不可比。' }),
    ];
}
function inputMetrics(data: Data, range: Range): MetricValue[] {
    const sessions = data.inputSessions.filter(s => inRange(s.completedAt ?? s.createdAt, range));
    const completed = sessions.filter(s => (s.status ?? 'completed') === 'completed');
    const reported = completed.map(s => s.reportedWatchedMinutes ?? s.watchedMinutes).filter(v => Number.isFinite(v) && v >= 0);
    const comp = completed.map(s => s.comprehension).filter((v): v is number => typeof v === 'number');
    const captioned = completed.filter(s => (s.captionMode === 'en' || s.captionMode === 'zh') && typeof s.comprehension === 'number');
    const uncaptioned = completed.filter(s => s.captionMode === 'none' && typeof s.comprehension === 'number');
    return [
        metric({ id: 'input.completed', domain: 'input', label: '完成输入会话', kind: 'count', value: completed.length, sample: sessions.length, quality: 'task-behavior', definition: '本窗口内状态为 completed 的真实材料输入会话。' }),
        metric({ id: 'input.minutes', domain: 'input', label: '观看/聆听时长（分钟）', kind: 'duration', value: reported.reduce((a, b) => a + b, 0), sample: reported.length, quality: 'self-report', definition: '用户自报或计划完成的分钟数之和；不是平台真实播放进度，也不等于掌握。' }),
        metric({ id: 'input.comprehension', domain: 'input', label: '自评理解均值（0–100）', kind: 'index', value: average(comp), sample: comp.length, quality: 'self-report', definition: '完成后自报理解度的均值；没有“听力分数”。' }),
        metric({ id: 'input.captioned', domain: 'input', label: '有字幕时自评理解', kind: 'index', value: average(captioned.map(s => s.comprehension!)), sample: captioned.length, quality: 'self-report', definition: 'captionMode 为 en/zh 的会话自评均值。' }),
        metric({ id: 'input.uncaptioned', domain: 'input', label: '无字幕时自评理解', kind: 'index', value: average(uncaptioned.map(s => s.comprehension!)), sample: uncaptioned.length, quality: 'self-report', definition: 'captionMode=none 的会话自评均值。' }),
    ];
}
function outputMetrics(data: Data, range: Range): MetricValue[] {
    const attempts = data.outputAttempts.filter(a => inRange(a.completedAt ?? a.createdAt, range) && !!(a.finalText || a.originalText));
    const evidence = attempts.flatMap(a => a.productiveEvidence ?? []);
    const independent = evidence.filter(e => e.independent && !e.copied).length;
    const copied = evidence.filter(e => e.copied).length;
    const assisted = attempts.filter(a => (a.supportLevel ?? 0) > 0).length;
    const revisions = attempts.filter(a => !!a.revisionText).length;
    const transfers = attempts.filter(a => !!a.transferOf).length;
    return [
        metric({ id: 'output.completed', domain: 'output', label: '完成的表达任务', kind: 'count', value: attempts.length, sample: attempts.length, quality: 'task-behavior', definition: '本窗口有最终文本的表达尝试；一句话也算完成。' }),
        rateMetric({
            id: 'output.independentShare', domain: 'output', label: '独立产出证据占比', numerator: independent, denominator: evidence.length,
            sample: evidence.length, quality: 'mixed',
            definition: '独立且非照抄的产出证据 ÷ 全部产出证据；L4 完整示范后的正确表达不计入独立。',
            reasons: [`照抄证据 ${copied} 条，已排除。`],
        }),
        rateMetric({
            id: 'output.assistedShare', domain: 'output', label: '使用过辅助的任务占比', numerator: assisted, denominator: attempts.length,
            sample: attempts.length, quality: 'task-behavior',
            definition: '最高辅助级别 ≥1 的任务比例；辅助被记录，不因此扣“作文分”。',
        }),
        metric({ id: 'output.revisions', domain: 'output', label: '自己修改过的尝试', kind: 'count', value: revisions, sample: attempts.length, quality: 'task-behavior', definition: '存在 revisionText 的尝试数；照抄反馈后重写不算独立。' }),
        metric({ id: 'output.transfers', domain: 'output', label: '迁移尝试', kind: 'count', value: transfers, sample: attempts.length, quality: 'task-behavior', definition: '带 transferOf 的尝试数；迁移必须换语境与内容。' }),
    ];
}
function translationMetrics(data: Data, range: Range): MetricValue[] {
    const evidence = readingTranslation(data, range);
    const grades = evidence
        .map(e => (typeof e.metadata.grade === 'string' ? e.metadata.grade : null))
        .filter((g): g is string => !!g && 'ABCDE'.includes(g));
    const score = (g: string) => ({ A: 0, B: 1, C: 2, D: 3, E: 4 } as Record<string, number>)[g];
    const values = grades.map(score);
    const direct = grades.filter(g => g === 'A' || g === 'B').length;
    return [
        metric({ id: 'translation.mean', domain: 'translation', label: '翻译依赖均值（0=直接理解，4=没有理解）', kind: 'index', value: average(values), sample: values.length, quality: 'self-report', definition: '阅读会话中自报的 A–E 等级换算均值；只表示依赖程度，不是能力分数。' }),
        rateMetric({
            id: 'translation.directShare', domain: 'translation', label: '直接理解占比（A/B）', numerator: direct, denominator: grades.length,
            sample: grades.length, quality: 'self-report', definition: 'A/B 等级占全部已记录等级的比例。',
        }),
    ];
}
function readingTranslation(data: Data, range: Range): ReadingEvidence[] {
    return data.readingSessions
        .filter(s => inRange(s.at, range))
        .flatMap(s => s.detail?.evidence ?? [])
        .filter(e => e.type === 'translation-dependence');
}
export interface CollectedDiagnostics {
    metrics: MetricValue[];
    retention: RetentionResult;
}
export function collectDiagnostics(data: Data, range: Range): CollectedDiagnostics {
    const retention = retentionReport(data);
    const metrics = [
        ...vocabularyMetrics(data, range, retention),
        ...grammarMetrics(data, range),
        ...readingMetrics(data, range),
        ...inputMetrics(data, range),
        ...outputMetrics(data, range),
        ...translationMetrics(data, range),
    ];
    return { metrics, retention };
}
/** 供测试/视图使用：指标是否真的可以拿来做判断 */
export function isEvaluable(m: MetricValue | undefined): boolean {
    return !!m && m.evaluability === 'evaluable' && m.value !== null;
}
export function findMetric(metrics: MetricValue[], id: string): MetricValue | undefined {
    return metrics.find(m => m.id === id);
}
export function sentenceSample(data: Data, range: Range): SentenceAttempt[] {
    return data.sentenceAttempts.filter(a => inRange(a.at ?? a.createdAt, range));
}
export function configVersionNote(): string {
    return `证据阈值来自 EVIDENCE_CONFIG：active≥${EVIDENCE_CONFIG.lifecycle.activeMinScore} 分/${EVIDENCE_CONFIG.lifecycle.activeMinEvidence} 次，productive≥${EVIDENCE_CONFIG.lifecycle.productiveMinScore} 分/${EVIDENCE_CONFIG.lifecycle.productiveMinEvidence} 次。`;
}
