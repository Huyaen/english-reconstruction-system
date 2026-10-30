// —— Phase 10：证据质量、瓶颈与可比性 ——
// 纪律：
//   1) 短板只在有可评估指标时给出；没有证据就说“不知道”，不猜。
//   2) 不合成总分；瓶颈是“最值得先处理的一件事”，不是能力评级。
//   3) 只有同长度窗口、两侧都达标才允许谈“上升/下降”。
import type { Data, DiagnosticBottleneck, DiagnosticEvidenceMix, DiagnosticPayload, DiagnosticPlanAction, MetricComparison, MetricValue, RetentionPoint, SkillSnapshot, } from './types.ts';
import { DAY_MS, compareMetric, dayStart, evidenceNote, inRange, qualityOf, recentRange, type Range, } from './diagnosticsModel.ts';
import { collectDiagnostics, findMetric, isEvaluable } from './diagnosticsCollect.ts';
const DISCLAIMER = '每个数字只说一件事，加起来也不是一个“英语总分”；材料不同、用过的提示不同，就别互相比较高低。';
export function evidenceMix(data: Data, range: Range): DiagnosticEvidenceMix {
    let verified = 0;
    let taskBehavior = 0;
    let selfReport = 0;
    let inferred = 0;
    const sources = new Set<string>();
    for (const s of data.readingSessions) {
        if (!inRange(s.at, range))
            continue;
        taskBehavior += 1;
        sources.add('reading-session');
        for (const c of s.detail?.comprehension ?? []) {
            if (c.scoredBy === 'verified-key')
                verified += 1;
            else if (c.scoredBy === 'self')
                selfReport += 1;
            if (c.scoredBy === 'verified-key')
                sources.add('verified-comprehension');
            if (c.scoredBy === 'self')
                sources.add('self-report');
        }
        const marks = (s.detail?.marks ?? []).filter(m => !m.revokedAt);
        if (marks.length) {
            selfReport += marks.length;
            sources.add('reading-marks');
        }
    }
    for (const r of data.records) {
        if (!inRange(r.at, range))
            continue;
        taskBehavior += 1;
        sources.add('word-review');
    }
    for (const a of data.grammarAttempts) {
        if (!inRange(a.at, range))
            continue;
        taskBehavior += 1;
        sources.add('grammar-attempt');
    }
    for (const a of data.sentenceAttempts) {
        if (!inRange(a.at ?? a.createdAt, range))
            continue;
        taskBehavior += 1;
        sources.add('sentence-attempt');
    }
    for (const a of data.outputAttempts) {
        if (!inRange(a.completedAt ?? a.createdAt, range))
            continue;
        taskBehavior += 1;
        sources.add('output-attempt');
    }
    for (const s of data.inputSessions) {
        if (!inRange(s.completedAt ?? s.createdAt, range))
            continue;
        taskBehavior += 1;
        sources.add('input-session');
        if (typeof s.comprehension === 'number') {
            selfReport += 1;
            sources.add('self-report');
        }
    }
    for (const e of data.readingSessions.flatMap(s => (inRange(s.at, range) ? s.detail?.evidence ?? [] : []))) {
        if (e.source === 'system_inferred')
            inferred += 1;
    }
    const base = { verified, taskBehavior, selfReport, inferred, distinctSources: sources.size };
    return { ...base, quality: qualityOf(base), note: evidenceNote(base) };
}
export function compareWithSnapshot(current: MetricValue[], previous: SkillSnapshot | undefined, days: number): MetricComparison[] {
    if (!previous?.diagnostics)
        return [];
    const prevDays = previous.diagnostics.range.days;
    const out: MetricComparison[] = [];
    for (const m of current) {
        const before = previous.diagnostics.metrics.find(x => x.id === m.id);
        const c = compareMetric(m, before, days, prevDays);
        if (c)
            out.push(c);
    }
    return out;
}
interface Candidate {
    bottleneck: DiagnosticBottleneck;
    severity: number;
    order: number;
}
function severityOf(value: number, threshold: number, higherIsWorse: boolean, span = 1): number {
    const d = higherIsWorse ? value - threshold : threshold - value;
    return Math.max(0, Math.min(1, d / span));
}
/** 规则固定、同分按 order 打破；输出理由都能追溯到具体指标。 */
export function detectBottleneck(metrics: MetricValue[], mix: DiagnosticEvidenceMix): DiagnosticBottleneck | null {
    const candidates: Candidate[] = [];
    const add = (id: string, domain: DiagnosticBottleneck['domain'], label: string, reasonFor: (m: MetricValue) => string, severityFor: (m: MetricValue) => number, order: number) => {
        const m = findMetric(metrics, id);
        if (!isEvaluable(m))
            return;
        const severity = severityFor(m!);
        if (severity <= 0)
            return;
        candidates.push({
            bottleneck: {
                domain,
                label,
                reason: reasonFor(m!),
                confidence: m!.quality === 'verified' || m!.quality === 'mixed' ? 'medium' : 'low',
                metricIds: [id],
            },
            severity,
            order,
        });
    };
    add('vocab.retention.d7', 'vocabulary', '第 7 天忘得比较多', m => `第 7 天还记得的比例是 ${fmtPct(m.value)}（${m.numerator}/${m.denominator}），低于 65% 这条经验线。`, m => severityOf(m.value!, 0.65, false, 0.65), 1);
    add('grammar.independentAccuracy', 'grammar', '语法题太依赖提示', m => `没看提示就答对的比例是 ${fmtPct(m.value)}（${m.numerator}/${m.denominator}），不少是看了提示才答对的。`, m => severityOf(m.value!, 0.6, false, 0.6), 2);
    add('reading.unknownRate', 'reading', '生词太多读不动', m => `标出来的生词占 ${fmtPct(m.value)}（${m.numerator}/${m.denominator}），高于 15% 这条“读得舒服”的线。`, m => severityOf(m.value!, 0.15, true, 0.85), 3);
    add('reading.verifiedComprehension', 'reading', '有答案的题错得比较多', m => `有标准答案的理解题，通过率 ${fmtPct(m.value)}（${m.numerator}/${m.denominator}）。`, m => severityOf(m.value!, 0.6, false, 0.6), 4);
    add('output.independentShare', 'output', '写作太依赖提示', m => `自己写的只占 ${fmtPct(m.value)}（${m.numerator}/${m.denominator}）；照抄或看过示范后写对的，不算自己写。`, m => severityOf(m.value!, 0.5, false, 0.5), 5);
    add('translation.mean', 'translation', '还要先翻译才懂', m => `翻译依赖平均 ${m.value!.toFixed(2)}（0 = 直接懂，4 = 基本没懂），高于 2.2。`, m => severityOf(m.value!, 2.2, true, 1.8), 6);
    if (!candidates.length)
        return null;
    candidates.sort((a, b) => (b.severity - a.severity) || (a.order - b.order));
    const top = candidates[0];
    if (mix.quality === 'none' || mix.distinctSources === 0) {
        return { ...top.bottleneck, confidence: 'low', reason: `${top.bottleneck.reason} 不过记录来源太单一，只能当弱提示。` };
    }
    return top.bottleneck;
}
const fmtPct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
export function planFromBottleneck(bottleneck: DiagnosticBottleneck | null): DiagnosticPlanAction[] {
    if (!bottleneck) {
        return [{
                id: 'plan-observe', title: '先积累一周真实记录', reason: '现在还没有足够记录看出短板；先各做几次阅读、拆句和写作，再来看。',
                domain: 'vocabulary', minutes: 15, actionKind: 'open-diagnostics', targetId: null,
            }];
    }
    const base = (id: string, title: string, reason: string, domain: DiagnosticBottleneck['domain'], minutes: number, actionKind: DiagnosticPlanAction['actionKind']): DiagnosticPlanAction => ({ id, title, reason, domain, minutes, actionKind, targetId: null });
    switch (bottleneck.domain) {
        case 'vocabulary':
            return [
                base('plan-vocab-review', '复习到期词 + 主动提取', bottleneck.reason, 'vocabulary', 15, 'open-diagnostics'),
                base('plan-vocab-output', '用 3 个到期词各写一句', '把“看得懂”变成“想得起、写得出”；写完可以要反馈，但反馈不算掌握。', 'output', 10, 'open-output'),
            ];
        case 'grammar':
            return [
                base('plan-grammar-lab', '做一个句子结构练习', bottleneck.reason, 'grammar', 15, 'open-sentence'),
                base('plan-grammar-reading', '在真实文章里找 3 个同类结构', '把语法点放回真实语境，而不是只做选择题。', 'reading', 15, 'open-reading'),
            ];
        case 'reading':
            return [
                base('plan-reading', '读一篇难度合适的真实文章', bottleneck.reason, 'reading', 20, 'open-reading'),
                base('plan-reading-words', '整理 5 个真正卡住你的词', '只收你标记过的词；不要把所有生词都收进来。', 'vocabulary', 10, 'open-diagnostics'),
            ];
        case 'output':
            return [
                base('plan-output', '做一个一句话/短摘要表达', bottleneck.reason, 'output', 15, 'open-output'),
                base('plan-output-revise', '提交后自己重写一遍', '只有自己改，或看过提示后自己重写，才算自己写的。', 'output', 10, 'open-output'),
            ];
        case 'input':
            return [base('plan-input', '看一段有字幕的材料', bottleneck.reason, 'input', 20, 'open-input')];
        case 'exam':
            return [base('plan-exam', '做一道没做过的考试题', bottleneck.reason, 'vocabulary', 10, 'open-diagnostics')];
        case 'translation':
            return [
                base('plan-translation-read', '读一段并尝试用英文复述', bottleneck.reason, 'reading', 20, 'open-reading'),
                base('plan-translation-output', '用英文写 3 句，不想中文句子', '训练直接表达，不做中译英练习。', 'output', 10, 'open-output'),
            ];
    }
}
export interface BuildOptions {
    now: number;
    days?: number;
    previous?: SkillSnapshot;
}
export function buildDiagnostics(data: Data, options: BuildOptions): DiagnosticPayload {
    const days = Math.max(1, Math.floor(options.days ?? 7));
    const range = recentRange(options.now, days);
    const { metrics, retention } = collectDiagnostics(data, range);
    const mix = evidenceMix(data, range);
    const bottleneck = detectBottleneck(metrics, mix);
    return {
        range: { from: range.from, to: range.to, days },
        metrics,
        retention: retention.points,
        evidence: mix,
        bottleneck,
        comparison: compareWithSnapshot(metrics, options.previous, days),
        plan: planFromBottleneck(bottleneck),
        notes: [...retention.notes],
        disclaimer: DISCLAIMER,
    };
}
export function snapshotDate(now: number): string {
    const d = new Date(now);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}
export function weekStart(now: number): number {
    const d = new Date(dayStart(now));
    const dow = (d.getDay() + 6) % 7; // 周一=0
    return d.getTime() - dow * DAY_MS;
}
export function weeklySummary(payload: DiagnosticPayload): string {
    if (!payload.bottleneck) {
        return `这一周记录还不够，或者没有明显短板。${payload.evidence.note}`;
    }
    return `这一周最值得先处理：${payload.bottleneck.label}。${payload.bottleneck.reason}（可信度：${payload.bottleneck.confidence === 'medium' ? '中' : '低'}）`;
}
export function latestSnapshot(snapshots: SkillSnapshot[]): SkillSnapshot | undefined {
    return [...snapshots].sort((a, b) => b.createdAt - a.createdAt)[0];
}
export function retentionLine(points: RetentionPoint[]): string {
    const dayName = (l: string) => l === 'D1' ? '第 1 天' : l === 'D7' ? '第 7 天' : l === 'D30' ? '第 30 天' : l;
    return points.map(p => `${dayName(p.label)} ${p.evaluable ? fmtPct(p.rate) : '记录不够'}`).join(' · ');
}
