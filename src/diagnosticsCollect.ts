// —— Phase 10：从真实记录汇总指标（纯函数，不读全局时钟）——
// 只统计窗口内的行为；保留每个指标的分母与来源质量，不把曝光当掌握。
import type { Data, MetricValue, ReadingEvidence, RetentionPoint, SentenceAttempt } from './types.ts';
import { DAY_MS, RATE_MIN_SAMPLE, average, inRange, median, metric, percent, rateMetric, type Range, } from './diagnosticsModel.ts';
import { EVIDENCE_CONFIG, lifecycleOf } from './evidence.ts';
import { examMetrics } from './examDiagnostics.ts';
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
                : `记录太少（${b.total} 条，至少要 ${RATE_MIN_SAMPLE} 条），先不算 ${label}。`,
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
            id: 'vocab.stable', domain: 'vocabulary', label: '稳定记住的词', kind: 'count',
            value: stable, sample: words.length, minSample: 1, quality: 'mixed',
            definition: '已经到“想得起、用得出”这一步的词数。按实际作答算，不是自己估的。',
            reasons: [`全库 ${words.length} 个词；active ${active}、productive ${productive}。`],
        }),
        metric({
            id: 'vocab.active', domain: 'vocabulary', label: '想得起的词', kind: 'count', value: active,
            sample: words.length, minSample: 1, quality: 'mixed',
            definition: '看英文能认，并且中→英主动想起至少 3 次、都答对了。',
        }),
        metric({
            id: 'vocab.productive', domain: 'vocabulary', label: '用得出的词', kind: 'count', value: productive,
            sample: words.length, minSample: 1, quality: 'mixed',
            definition: '在写作里自己用过至少 3 次、而且写得对；只写一次不算。',
        }),
        metric({
            id: 'vocab.retrievalMs', domain: 'vocabulary', label: '想起来的快慢', kind: 'duration',
            value: median(ms), sample: ms.length, quality: 'task-behavior',
            definition: '单词题用时的中位数。快不一定就好，要和正确率一起看。',
        }),
        metric({
            id: 'vocab.reviews', domain: 'vocabulary', label: '复习了几次', kind: 'count', value: reviews.length,
            sample: reviews.length, quality: 'task-behavior', definition: '这段时间做完的单词题数量。',
        }),
        metric({
            id: 'vocab.exposures', domain: 'vocabulary', label: '见过几次', kind: 'count', value: exposures.length,
            sample: exposures.length, quality: 'mixed', definition: '真的看过、算得上的次数。见过不等于记住。',
        }),
    ];
    for (const p of retention.points) {
        metrics.push(metric({
            id: `vocab.retention.${p.label.toLowerCase()}`, domain: 'vocabulary', label: `${p.label} 还记得多少`, kind: 'rate',
            value: p.rate, sample: p.total, quality: 'task-behavior', numerator: p.correct, denominator: p.total,
            definition: `第一次学过之后第 ${p.label.slice(1)} 天那次复习的正确率；答得太少就留空。`,
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
            id: 'grammar.accuracy', domain: 'grammar', label: '语法题答对率', numerator: correct, denominator: attempts.length,
            sample: attempts.length, quality: 'task-behavior',
            definition: '语法题答对的比例（看过提示的也算在内）。看了提示才答对，不算自己会。',
        }),
        rateMetric({
            id: 'grammar.independentAccuracy', domain: 'grammar', label: '自己答对的比例', numerator: independent, denominator: attempts.length,
            sample: attempts.length, quality: 'task-behavior',
            definition: '没看提示就答对的占比；算比例时仍然按全部语法题算。',
        }),
        rateMetric({
            id: 'grammar.sentenceStructure', domain: 'grammar', label: '拆句正确率', numerator: structureCorrect, denominator: sentenceEvaluable.length,
            sample: sentenceEvaluable.length, quality: 'task-behavior',
            definition: '能判断对错的那几次尝试。看提示或照抄的不算自己拆的。',
        }),
        metric({
            id: 'grammar.obstacles', domain: 'grammar', label: '读不懂的地方标了几处', kind: 'count', value: readingObstacles.length,
            sample: readingObstacles.length, quality: 'self-report', definition: '读文章时你自己标出来的语法或词汇障碍有几处。',
        }),
    ];
    if (worst) {
        metrics.push(metric({
            id: 'grammar.weakest', domain: 'grammar', label: `最该补的语法点：${worst.name}`, kind: 'rate', value: Math.round(worst.rate * 1000) / 1000,
            sample: worst.sample, quality: 'task-behavior', numerator: Math.round(worst.rate * worst.sample), denominator: worst.sample,
            definition: '这段时间练过至少 5 次的语法点里，正确率最低的那个。并列时取编号小的，规则固定。',
        }));
    }
    return metrics;
}
function readingMetrics(data: Data, range: Range): MetricValue[] {
    const sessions = data.readingSessions.filter(s => inRange(s.at, range));
    const details = sessions.map(s => s.detail).filter((d): d is NonNullable<typeof d> => !!d);
    const marks = details.flatMap(d => d.marks ?? []).filter(m => !m.revokedAt);
    const judged = marks.length;
    const unknown = marks.filter(m => m.judgment === 'unknown' || m.judgment === 'guessed').length;
    const vague = marks.filter(m => m.judgment === 'vague').length;
    const verified = details.flatMap(d => d.comprehension ?? []).filter(c => c.scoredBy === 'verified-key' && typeof c.score === 'number');
    const self = details.flatMap(d => d.comprehension ?? []).filter(c => c.scoredBy === 'self' && typeof c.score === 'number');
    const durations = sessions.filter(s => s.durationMs >= 60000);
    const speeds = durations.map(s => s.wordCount / (s.durationMs / 60000)).filter(v => Number.isFinite(v) && v > 0);
    const reread = details
        .map(d => {
        const comprehension = d.comprehension ?? [];
        const cold = comprehension.find(c => c.stage === 'cold-test' && c.scoredBy === 'self');
        const again = comprehension.find(c => c.stage === 'reread' && c.scoredBy === 'self');
        return cold?.score !== null && again?.score !== null && cold && again ? again.score! - cold.score! : null;
    })
        .filter((v): v is number => v !== null);
    return [
        metric({ id: 'reading.sessions', domain: 'reading', label: '读完的文章', kind: 'count', value: sessions.length, sample: sessions.length, quality: 'task-behavior', definition: '这段时间开始或读完的阅读数量。' }),
        rateMetric({
            id: 'reading.unknownRate', domain: 'reading', label: '生词比例', numerator: unknown, denominator: judged,
            sample: judged, quality: 'self-report',
            definition: '你标成“不认识”或“猜的”词，占全部标记词的比例。没标就留空，不猜。',
        }),
        rateMetric({
            id: 'reading.uncertainRate', domain: 'reading', label: '模糊词比例', numerator: vague, denominator: judged,
            sample: judged, quality: 'self-report', definition: '标成“模糊”的词，占全部标记词的比例。',
        }),
        rateMetric({
            id: 'reading.verifiedComprehension', domain: 'reading', label: '有标准答案的题答对率', numerator: verified.filter(c => (c.score ?? 0) >= 60).length, denominator: verified.length,
            sample: verified.length, quality: 'verified', definition: '有标准答案的题，60 分以上算过；自评的不算。',
        }),
        rateMetric({
            id: 'reading.selfComprehension', domain: 'reading', label: '自评读懂的比例', numerator: self.filter(c => (c.score ?? 0) >= 60).length, denominator: self.length,
            sample: self.length, quality: 'self-report', definition: '你说理解度在 60 以上的会话占比。只是你的感觉。',
        }),
        metric({ id: 'reading.speed', domain: 'reading', label: '阅读速度（词/分钟）', kind: 'index', value: median(speeds), sample: speeds.length, quality: 'task-behavior', definition: '词数 ÷ 真正读的分钟数（只算读了 60 秒以上的）。材料难度不同，不要直接比。' }),
        metric({ id: 'reading.rereadDelta', domain: 'reading', label: '重读后感觉好多少', kind: 'index', value: average(reread), sample: reread.length, quality: 'self-report', definition: '同一篇“重读后的自评减去第一次的自评”。只是感觉，不同文章之间也不能比。' }),
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
        metric({ id: 'input.completed', domain: 'input', label: '看完的材料', kind: 'count', value: completed.length, sample: sessions.length, quality: 'task-behavior', definition: '这段时间标成“完成”的输入记录。' }),
        metric({ id: 'input.minutes', domain: 'input', label: '看了多久（分钟）', kind: 'duration', value: reported.reduce((a, b) => a + b, 0), sample: reported.length, quality: 'self-report', definition: '你自己填的分钟数之和。不是平台的真实播放进度，也不代表记住了。' }),
        metric({ id: 'input.comprehension', domain: 'input', label: '平均听懂程度（0–100）', kind: 'index', value: average(comp), sample: comp.length, quality: 'self-report', definition: '每次完成后你自报的理解度平均。这里没有所谓“听力分数”。' }),
        metric({ id: 'input.captioned', domain: 'input', label: '有字幕时听得懂多少', kind: 'index', value: average(captioned.map(s => s.comprehension!)), sample: captioned.length, quality: 'self-report', definition: '开了英文或中文字幕那些次的平均自评。' }),
        metric({ id: 'input.uncaptioned', domain: 'input', label: '没字幕时听得懂多少', kind: 'index', value: average(uncaptioned.map(s => s.comprehension!)), sample: uncaptioned.length, quality: 'self-report', definition: '完全没开字幕那些次的平均自评。' }),
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
        metric({ id: 'output.completed', domain: 'output', label: '写完的段落', kind: 'count', value: attempts.length, sample: attempts.length, quality: 'task-behavior', definition: '这段时间写出最终稿的；只写一句也算完成。' }),
        rateMetric({
            id: 'output.independentShare', domain: 'output', label: '自己写的比例', numerator: independent, denominator: evidence.length,
            sample: evidence.length, quality: 'mixed',
            definition: '没用完整示范、也没照抄的，占全部写作的比例。看过完整示范后写对的，不算自己写。',
            reasons: [`照抄的 ${copied} 条已排除。`],
        }),
        rateMetric({
            id: 'output.assistedShare', domain: 'output', label: '用过提示的比例', numerator: assisted, denominator: attempts.length,
            sample: attempts.length, quality: 'task-behavior',
            definition: '用过至少一级提示的占比。记下来是为了看清过程，不会因此扣作文分。',
        }),
        metric({ id: 'output.revisions', domain: 'output', label: '自己改过的段落', kind: 'count', value: revisions, sample: attempts.length, quality: 'task-behavior', definition: '你写完又自己改过的次数。照抄建议再改，不算自己改的。' }),
        metric({ id: 'output.transfers', domain: 'output', label: '换场景写作次数', kind: 'count', value: transfers, sample: attempts.length, quality: 'task-behavior', definition: '换了新场景、新内容再写的次数；照着原题重写不算。' }),
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
        metric({ id: 'translation.mean', domain: 'translation', label: '要先翻译的程度（0 = 直接懂，4 = 基本没懂）', kind: 'index', value: average(values), sample: values.length, quality: 'self-report', definition: '阅读时自报的翻译依赖等级平均。只说明依赖程度，不是能力分数。' }),
        rateMetric({
            id: 'translation.directShare', domain: 'translation', label: '不用翻译就懂的比例', numerator: direct, denominator: grades.length,
            sample: grades.length, quality: 'self-report', definition: '评为 A 或 B 的次数，占全部有记录次数的比例。',
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
        ...examMetrics(data, range),
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
    return `门槛来自 EVIDENCE_CONFIG：active≥${EVIDENCE_CONFIG.lifecycle.activeMinScore} 分/${EVIDENCE_CONFIG.lifecycle.activeMinEvidence} 次，productive≥${EVIDENCE_CONFIG.lifecycle.productiveMinScore} 分/${EVIDENCE_CONFIG.lifecycle.productiveMinEvidence} 次。`;
}
