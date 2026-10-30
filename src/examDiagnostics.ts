// —— Phase 11：考试域诊断指标 ——
// 只描述本次/窗口内的考试证据；不与词汇记忆、阅读理解混成一个“英语总分”。
import type { Data, MetricValue } from './types.ts';
import type { ExamSession } from './examTypes.ts';
import { inRange, metric, percent, rateMetric, type Range } from './diagnosticsModel.ts';
import { isChoiceItem } from './examItems.ts';
function objectiveStats(sessions: ExamSession[]): {
    correct: number;
    total: number;
    answered: number;
} {
    let correct = 0, total = 0, answered = 0;
    for (const s of sessions) {
        if (!['submitted', 'reviewed', 'completed'].includes(s.status))
            continue;
        for (const item of s.items) {
            if (!isChoiceItem(item) || !item.answerKey)
                continue;
            total += 1;
            const a = s.answers[item.id];
            if (a?.value?.trim())
                answered += 1;
            if (a?.value === item.answerKey)
                correct += 1;
        }
    }
    return { correct, total, answered };
}
export function examMetrics(data: Data, range: Range): MetricValue[] {
    const sessions = (data.examSessions ?? []).filter(s => inRange(s.createdAt, range) && ['submitted', 'reviewed', 'completed'].includes(s.status));
    const objective = objectiveStats(sessions);
    const completed = sessions.filter(s => s.status === 'completed');
    const independent = completed.filter(s => s.helpUsed === 0);
    const transfer = completed.filter(s => s.mode === 'transfer_retest');
    const timed = completed.filter(s => s.timeLimitMinutes > 0);
    const pressured = timed.filter(s => s.timeUsedMs >= s.timeLimitMinutes * 60000 * 0.9);
    const errors = sessions.flatMap(s => s.errors);
    const uncertain = errors.filter(e => e.category === 'uncertain');
    const logs = (data.examLogs ?? []).filter(l => inRange(l.createdAt, range));
    const out: MetricValue[] = [
        rateMetric({
            id: 'exam.objectiveAccuracy', domain: 'exam', label: '考试客观题正确率', numerator: objective.correct, denominator: objective.total,
            sample: objective.total, definition: '窗口内已提交测评中，有可靠答案的选择/填空题的正确比例；开放题不计入。',
            quality: objective.total ? 'verified' : 'none',
            reasons: objective.total ? [`${objective.correct}/${objective.total} 道客观题；未答按错计。`] : ['本窗口没有已提交的客观题。'],
        }),
        rateMetric({
            id: 'exam.independentShare', domain: 'exam', label: '无辅助完成的测评占比', numerator: independent.length, denominator: completed.length,
            sample: completed.length, definition: '完成的测评中，全程没有使用提示/示范的比例；只表示这次是否独立，不等于掌握。',
            quality: 'task-behavior',
            reasons: completed.length ? ['按会话 helpUsed=0 统计。'] : ['本窗口没有完成的测评。'],
        }),
        metric({
            id: 'exam.transferRetests', domain: 'exam', label: '换题重测的次数', kind: 'count', value: transfer.length || null,
            sample: transfer.length, definition: '换了题、换了语境之后再测的次数；0 次只是还没测过，不代表你做不到。',
            quality: 'task-behavior', reasons: transfer.length ? [] : ['这段时间还没换题重测过。'],
        }),
        rateMetric({
            id: 'exam.timePressureShare', domain: 'exam', label: '接近时限完成的占比', numerator: pressured.length, denominator: timed.length,
            sample: timed.length, definition: '用时达到时限 90% 的已完成测评比例；只提示时间压力，不判断能力。',
            quality: 'task-behavior', reasons: timed.length ? [] : ['本窗口没有计时测评。'],
        }),
        rateMetric({
            id: 'exam.uncertainErrorShare', domain: 'exam', label: '错因不确定占比', numerator: uncertain.length, denominator: errors.length,
            sample: errors.length, definition: '已记录的错因里，因为信息不够只能标成“不确定”的比例。比例高，说明复盘还要再细一点。',
            quality: 'task-behavior', reasons: errors.length ? [] : ['本窗口没有错因记录。'],
        }),
    ];
    out.push(metric({
        id: 'exam.selfReportedLogs', domain: 'exam', label: '自报考试记录', kind: 'count', value: logs.length || null,
        sample: logs.length, definition: '窗口内用户自报的校内/月考/模拟/自定义考试条数；只作事实线索，不参与错因或能力计算。',
        quality: 'task-behavior', reasons: logs.length ? ['来源固定为 self_reported；自评文字不升级为已验证错因。'] : ['本窗口没有自报考试记录。'],
    }));
    // 明确不使用“考试总分/预测分”：仅有题目的来源与分值，不足以推断官方分数。
    out.push(metric({
        id: 'exam.officialScoreEstimate', domain: 'exam', label: '官方分数预测', kind: 'index', value: null, sample: 0,
        notApplicable: true, definition: '不提供官方分数预测。分项记录不够以映射到 150 分制，任何预测都会制造虚假精度。',
        quality: 'none', reasons: ['按设计不可计算。'],
    }));
    return out;
}
// 自报记录（含“阅读时间不够”等自评）不在此函数内：它们没有已验证的 item 级错误证据。
export function examErrorCategoryCounts(data: Data, range: Range): {
    category: string;
    count: number;
}[] {
    const sessions = (data.examSessions ?? []).filter(s => inRange(s.createdAt, range));
    const counts = new Map<string, number>();
    for (const e of sessions.flatMap(s => s.errors))
        counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
    return [...counts].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
}
export function verifiedExamShare(sessions: ExamSession[]): number | null {
    if (!sessions.length)
        return null;
    return percent(sessions.filter(s => s.scoreStatus === 'verified_objective' || s.scoreStatus === 'partial').length, sessions.length);
}
