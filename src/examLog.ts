// —— Phase 12：考试记录（学校考试 / 月考 / 模拟 / 自定义）——
// 纪律：分数是用户自报事实，不是系统成绩；自评只是线索，不能升级为已验证错因。
import type { ExamCategory, ExamLog, ExamLogType, ExamSpecification } from './examTypes.ts';
export const EXAM_LOG_TYPES: {
    id: ExamLogType;
    label: string;
}[] = [
    { id: 'school_exam', label: '校内考试' },
    { id: 'monthly_exam', label: '月考' },
    { id: 'mock_exam', label: '模拟考试' },
    { id: 'custom', label: '自定义考试' },
];
export function examLogTypeLabel(t: ExamLogType | undefined): string {
    return EXAM_LOG_TYPES.find(x => x.id === t)?.label ?? '校内考试';
}
export function examLogTypeOf(log: ExamLog): ExamLogType {
    return log.examType ?? 'school_exam';
}
export function examLogCategoryLabel(c: ExamCategory): string {
    return ({
        'shanghai-gaokao-foreign-language-first': '上海高考外语一考',
        'shanghai-gaokao-foreign-language-second': '上海高考外语二考',
        'shanghai-spring-exam-foreign-language': '上海春考外语',
        'shanghai-academic-foreign-language': '上海学业水平合格考外语',
        other: '其他 / 校内考试',
    } as const)[c];
}
export function examLogSpecLabel(spec: ExamSpecification): string {
    const score = spec.totalScore === null ? '总分未知' : `${spec.totalScore} 分`;
    const status = ({ official_confirmed: '官方确认', historical_reference: '历史参考', provisional: '暂定', unknown: '未知' } as const)[spec.status];
    return `${examLogCategoryLabel(spec.examCategory)} · ${spec.applicableYear} · ${score} · ${status}`;
}
/** 只有官方已确认且给出总分的规格才能作为“官方满分”预填；其余一律不猜。 */
export function officialTotalForSpec(spec: ExamSpecification | null | undefined): number | null {
    if (!spec || spec.status !== 'official_confirmed')
        return null;
    return spec.totalScore;
}
export interface ExamLogDraft {
    date: string;
    examType: ExamLogType;
    name: string;
    specId: string;
    examCategory: ExamCategory;
    applicableYear: number | null;
    fullScore: number;
    reportedScore: number;
    selfAssessment: string;
    conflictAcknowledged: boolean;
    editingId?: string;
}
export interface ExamLogValidation {
    ok: boolean;
    errors: string[];
    warnings: string[];
    /** 官方已确认总分与本次满分不一致，需要用户显式确认。 */
    blockedConflict: boolean;
    scoreBasis: 'official_total' | 'custom_total';
    spec: ExamSpecification | null;
}
export function validateExamLogDraft(draft: ExamLogDraft, specs: ExamSpecification[]): ExamLogValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    let blockedConflict = false;
    const spec = draft.specId ? specs.find(s => s.id === draft.specId) ?? null : null;
    if (!draft.date || !/^\d{4}-\d{2}-\d{2}$/.test(draft.date))
        errors.push('请填写有效日期');
    if (!draft.name.trim())
        errors.push('请填写考试名称');
    if (draft.specId && !spec)
        errors.push('找不到所选考试规格，请重新选择');
    if (!Number.isFinite(draft.fullScore) || draft.fullScore <= 0)
        errors.push('满分必须大于 0');
    if (!Number.isFinite(draft.reportedScore))
        errors.push('请填写有效得分');
    else if (draft.reportedScore < 0 || (Number.isFinite(draft.fullScore) && draft.reportedScore > draft.fullScore))
        errors.push('得分必须满足 0 ≤ 得分 ≤ 满分');
    if (spec) {
        if (draft.examCategory !== spec.examCategory)
            errors.push('考试类别与所选规格不一致');
        if (draft.applicableYear !== spec.applicableYear)
            errors.push('适用年份与所选规格不一致');
    }
    else if (!draft.specId) {
        if (draft.applicableYear === null || !Number.isInteger(draft.applicableYear) || draft.applicableYear < 2000 || draft.applicableYear > 2100)
            errors.push('请填写有效适用年份');
        else
            warnings.push('未绑定官方规格：类别、年份和满分完全按本次实际考试保存，不会映射成高考分值。');
    }
    let scoreBasis: 'official_total' | 'custom_total' = 'custom_total';
    if (spec && spec.totalScore !== null && draft.fullScore === spec.totalScore) {
        if (spec.status === 'official_confirmed')
            scoreBasis = 'official_total';
        else
            warnings.push(`该规格总分为${spec.totalScore}，但状态是“${spec.status === 'provisional' ? '暂定' : '历史参考/未知'}”，不是官方确认；本记录只按你填写的满分保存。`);
    }
    else if (spec && spec.totalScore !== null && Number.isFinite(draft.fullScore) && draft.fullScore !== spec.totalScore) {
        if (spec.status === 'official_confirmed') {
            blockedConflict = true;
            warnings.push(`官方已确认总分为 ${spec.totalScore} 分，本次填写的满分是 ${draft.fullScore} 分。请确认这是校内/自定义计分，系统不会把它改写成官方分数。`);
        }
        else {
            warnings.push(`规格参考总分为 ${spec.totalScore} 分（尚未官方确认），本次满分 ${draft.fullScore} 分；按本次实际满分保存，不冒充官方分值。`);
        }
    }
    else if (spec && spec.totalScore === null) {
        warnings.push('该规格总分未知/待确认；本次满分完全按你填写的实际分数保存。');
    }
    if (blockedConflict && !draft.conflictAcknowledged)
        errors.push('满分与官方总分不一致，请勾选“我确认这是自定义计分”后再保存');
    return { ok: errors.length === 0, errors, warnings, blockedConflict, scoreBasis, spec };
}
/** 写入/导入时的最后一道闸：不依赖 UI，也不允许把自报记录伪装成验证成绩。 */
export function sanitizeExamLog(raw: unknown, specs: ExamSpecification[]): {
    ok: true;
    log: ExamLog;
} | {
    ok: false;
    error: string;
} {
    if (!raw || typeof raw !== 'object')
        return { ok: false, error: '记录不是对象' };
    const r = raw as Partial<ExamLog>;
    if (!r.id || !r.date || !r.name)
        return { ok: false, error: '缺少 id/date/name' };
    if (!Number.isFinite(r.fullScore) || (r.fullScore as number) <= 0)
        return { ok: false, error: '满分无效' };
    if (!Number.isFinite(r.reportedScore) || (r.reportedScore as number) < 0 || (r.reportedScore as number) > (r.fullScore as number))
        return { ok: false, error: '得分必须满足 0 ≤ 得分 ≤ 满分' };
    const spec = r.specId ? specs.find(s => s.id === r.specId) ?? null : null;
    if (r.specId && !spec)
        return { ok: false, error: '规格不存在' };
    const category = (spec?.examCategory ?? r.examCategory ?? 'other') as ExamCategory;
    const year = spec?.applicableYear ?? (typeof r.applicableYear === 'number' ? r.applicableYear : null);
    if (year === null)
        return { ok: false, error: '缺少适用年份' };
    const scoreBasis = spec && spec.status === 'official_confirmed' && spec.totalScore === r.fullScore ? 'official_total' : 'custom_total';
    return {
        ok: true,
        log: {
            ...r,
            id: String(r.id),
            name: String(r.name),
            date: String(r.date),
            examType: r.examType ?? 'school_exam',
            examCategory: category,
            applicableYear: year,
            fullScore: r.fullScore as number,
            reportedScore: r.reportedScore as number,
            source: 'self_report',
            scoreSource: 'self_reported',
            scoreBasis,
            clueOnly: true,
            errorTypes: [],
            sectionResults: Array.isArray(r.sectionResults) ? r.sectionResults : [],
            selfAssessment: typeof r.selfAssessment === 'string' ? r.selfAssessment : '',
            createdAt: typeof r.createdAt === 'number' ? r.createdAt : Date.now(),
            updatedAt: Date.now(),
        } as ExamLog,
    };
}
export interface ExamLogsExport {
    schema: 'erv2-exam-logs';
    version: 1;
    exportedAt: string;
    logs: ExamLog[];
}
export function exportExamLogs(logs: ExamLog[]): ExamLogsExport {
    return { schema: 'erv2-exam-logs', version: 1, exportedAt: new Date().toISOString(), logs: logs.map(l => ({ ...l, scoreSource: 'self_reported', clueOnly: true, errorTypes: [] })) };
}
export function parseExamLogsExport(text: string, specs: ExamSpecification[]): {
    ok: boolean;
    logs: ExamLog[];
    errors: string[];
} {
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    }
    catch {
        return { ok: false, logs: [], errors: ['不是有效 JSON'] };
    }
    const obj = raw as Partial<ExamLogsExport>;
    if (obj.schema !== 'erv2-exam-logs' || !Array.isArray(obj.logs))
        return { ok: false, logs: [], errors: ['不是考试记录导出文件'] };
    const logs: ExamLog[] = [];
    const errors: string[] = [];
    for (const [i, item] of obj.logs.entries()) {
        const r = sanitizeExamLog(item, specs);
        if (r.ok)
            logs.push(r.log);
        else
            errors.push(`第 ${i + 1} 条：${r.error}`);
    }
    return { ok: logs.length > 0, logs, errors };
}
