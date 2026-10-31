// —— Phase 11：版本化考试规格 ——
// 只记录有来源的事实；2028 未公布的细节一律 provisional/unknown，不写死。
import type { ExamCategory, ExamQuestionType, ExamSectionSpec, ExamSourceRef, ExamSpecification, ExamSpecStatus, ExamQuestionTypeSpec } from './examTypes.ts';
const CATEGORY_LABEL: Record<ExamCategory, string> = {
    'shanghai-gaokao-foreign-language-first': '上海普通高考外语一考',
    'shanghai-gaokao-foreign-language-second': '上海普通高考外语二考',
    'shanghai-spring-exam-foreign-language': '上海春考外语（一考）',
    'shanghai-academic-foreign-language': '上海高中学业水平合格考外语',
    other: '其他考试',
};
export function examCategoryLabel(c: ExamCategory): string {
    return CATEGORY_LABEL[c];
}
export function statusLabel(s: ExamSpecStatus): string {
    return ({ official_confirmed: '官方已确认', historical_reference: '历史参考', provisional: '暂定/待确认', unknown: '未知' } as const)[s];
}
const OFFICIAL_2026: ExamSourceRef = {
    url: 'https://www.shmeea.edu.cn/page/08000/20251118/19863.html',
    title: '2026年上海市普通高校春季考试招生实施办法',
    issuingAuthority: '上海市教育考试院',
    publishedAt: '2025-11-18',
    applicableYear: 2026,
    examCategory: 'shanghai-spring-exam-foreign-language',
    verifiedAt: 0,
    sourceType: 'official',
    confidence: 'high',
};
const COMMENTARY_2026: ExamSourceRef = {
    url: 'https://www.shmeea.edu.cn/page/02300/20260104/19984.html',
    title: '专家点评2026年上海春考英语暨“外语一考”（笔试）试卷',
    issuingAuthority: '上海市教育考试院',
    publishedAt: '2026-01-04',
    applicableYear: 2026,
    examCategory: 'shanghai-spring-exam-foreign-language',
    verifiedAt: 0,
    sourceType: 'official_commentary',
    confidence: 'high',
};
const COMMENTARY_2025: ExamSourceRef = {
    url: 'https://www.shmeea.edu.cn/page/02200/20250609/19465.html',
    title: '专家点评2025年上海高考英语试卷',
    issuingAuthority: '上海市教育考试院',
    publishedAt: '2025-06-09',
    applicableYear: 2025,
    examCategory: 'shanghai-gaokao-foreign-language-first',
    verifiedAt: 0,
    sourceType: 'official_commentary',
    confidence: 'high',
};
const ORAL_MOCK_2026: ExamSourceRef = {
    url: 'https://www.shmeea.edu.cn/page/08000/20260508/20219.html',
    title: '2026年普通高等学校招生全国统一考试外语听说测试在线模拟练习系统上线说明',
    issuingAuthority: '上海市教育考试院',
    publishedAt: '2026-05-08',
    applicableYear: 2026,
    examCategory: 'shanghai-gaokao-foreign-language-first',
    verifiedAt: 0,
    sourceType: 'official',
    confidence: 'high',
};
function qtype(questionType: ExamQuestionType, label: string, status: ExamSpecStatus, included = true, basis = '官方评析提及题型；题量/分值未公开，保持待确认。'): ExamQuestionTypeSpec {
    return { questionType, label, included, score: null, itemCount: null, status, basis };
}
function section(id: string, label: string, status: ExamSpecStatus, questionTypes: string[], score: number | null = null, minutes: number | null = null, basis = ''): ExamSectionSpec {
    return { id, label, score, minutes, questionTypes, status, basis };
}
export function builtinSpecifications(): ExamSpecification[] {
    const verifiedAt = Date.UTC(2026, 9, 23, 3, 0, 0);
    const first2026: ExamSpecification = {
        id: 'spec-2026-spring-foreign-language',
        examId: 'shanghai-2026-spring-foreign-language',
        region: 'Shanghai', examCategory: 'shanghai-spring-exam-foreign-language', subject: 'English', applicableYear: 2026,
        status: 'official_confirmed', issuingAuthority: '上海市教育考试院',
        sourceRefs: [{ ...OFFICIAL_2026, verifiedAt }, { ...COMMENTARY_2026, verifiedAt }],
        totalScore: 150, writtenScore: 115, listeningSpeakingScore: 35,
        writtenDurationMinutes: 105, oralDurationMinutes: 35,
        sections: [
            section('written', '笔试', 'official_confirmed', ['contextual_grammar', 'cloze', 'reading_comprehension', 'summary_writing', 'situational_writing'], 115, 105, '2026 春季考试实施办法：笔试 115 分、105 分钟。'),
            section('oral', '听说测试', 'official_confirmed', ['listening', 'speaking'], 35, 35, '2026 春季考试实施办法：听说测试 35 分、35 分钟。'),
        ],
        questionTypes: [
            qtype('contextual_grammar', '语境语法', 'provisional'),
            qtype('cloze', '完形填空', 'provisional'),
            qtype('reading_comprehension', '阅读理解', 'provisional'),
            qtype('summary_writing', '概要写作', 'provisional', true, '2026 官方评析明确提到概要写作。'),
            qtype('situational_writing', '情境写作', 'provisional', true, '2026 官方评析明确提到写作建议与理由。'),
            qtype('listening', '听力', 'provisional', true, '听说测试包含听力与口语；具体题量未公开。'),
            qtype('speaking', '口语', 'provisional', true, '本应用暂不做自动口语评分。'),
        ],
        scoringRules: ['笔试与听说测试分开计分，总分 150。', '本应用只做本地练习评分，不产生官方成绩。'],
        publishedAt: '2025-11-18', verifiedAt, confidence: 'high',
        notes: ['这是 2026 年已公布规则，不能直接当作 2028 年规则。', '各题型题量与分值未在官方页面公开，先标为暂定。'],
    };
    const target2028: ExamSpecification = {
        id: 'spec-2028-gaokao-foreign-language',
        examId: 'shanghai-2028-gaokao-foreign-language',
        region: 'Shanghai', examCategory: 'shanghai-gaokao-foreign-language-first', subject: 'English', applicableYear: 2028,
        status: 'provisional', issuingAuthority: '上海市教育考试院（2028 规则尚未公布）',
        sourceRefs: [
            { ...OFFICIAL_2026, verifiedAt, applicableYear: 2026, examCategory: 'shanghai-spring-exam-foreign-language', confidence: 'medium' },
            { ...ORAL_MOCK_2026, verifiedAt, applicableYear: 2026, examCategory: 'shanghai-gaokao-foreign-language-first' },
        ],
        totalScore: null, writtenScore: null, listeningSpeakingScore: null, writtenDurationMinutes: null, oralDurationMinutes: null,
        sections: [
            section('written', '笔试（结构待 2028 官方确认）', 'unknown', [], null, null, '2028 年考试说明未发布。'),
            section('oral', '听说测试（结构待确认）', 'unknown', [], null, null, '2028 年考试说明未发布。'),
        ],
        questionTypes: [
            qtype('contextual_grammar', '语境语法', 'unknown', true, '仅依据 2026 历史资料推断可能延续，不能确认。'),
            qtype('cloze', '完形填空', 'unknown', true, '仅依据 2026 历史资料推断可能延续，不能确认。'),
            qtype('reading_comprehension', '阅读理解', 'unknown', true, '仅依据 2026 历史资料推断可能延续，不能确认。'),
            qtype('translation', '翻译', 'unknown', false, '2026 官方评析未提及；是否在 2028 出现未知。'),
            qtype('summary_writing', '概要写作', 'unknown', true, '仅历史参考。'),
            qtype('situational_writing', '情境写作', 'unknown', true, '仅历史参考。'),
            qtype('listening', '听力', 'unknown', true, '仅历史参考。'),
            qtype('speaking', '口语', 'unknown', true, '本应用不做自动口语评分。'),
        ],
        scoringRules: [],
        publishedAt: null, verifiedAt, confidence: 'low',
        notes: ['2028 官方规则尚未发布；本规格只用于占位与版本升级，所有分值/时长保持未知。', '不得在界面声称“2028 确定为 115+35”。'],
    };
    const academic2026: ExamSpecification = {
        id: 'spec-2026-academic-foreign-language',
        examId: 'shanghai-2026-academic-foreign-language',
        region: 'Shanghai', examCategory: 'shanghai-academic-foreign-language', subject: 'English', applicableYear: 2026,
        status: 'provisional', issuingAuthority: '待官方核验',
        sourceRefs: [],
        totalScore: 100, writtenScore: 80, listeningSpeakingScore: 20, writtenDurationMinutes: null, oralDurationMinutes: null,
        sections: [
            section('written', '笔试', 'provisional', ['contextual_grammar', 'reading_comprehension'], 80, null, '用户提供线索，尚未取得官方原文；不得当作高考 115+35。'),
            section('oral', '听说', 'provisional', ['listening', 'speaking'], 20, null, '用户提供线索，尚未取得官方原文。'),
        ],
        questionTypes: [qtype('contextual_grammar', '语境语法', 'provisional'), qtype('reading_comprehension', '阅读理解', 'provisional'), qtype('listening', '听力', 'provisional')],
        scoringRules: ['合格考与普通高考外语是不同考试，记录不得混用。'],
        publishedAt: null, verifiedAt, confidence: 'low',
        notes: ['80+20 这个分法来自用户线索，还没拿到官方页面，先标为待核实；用之前请自己核对。'],
    };
    return [first2026, target2028, academic2026];
}
export interface SpecValidation {
    ok: boolean;
    errors: string[];
    warnings: string[];
}
export function validateSpecification(spec: ExamSpecification): SpecValidation {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!spec.id || !spec.examId)
        errors.push('缺少 id/examId');
    if (!Number.isInteger(spec.applicableYear))
        errors.push('applicableYear 必须是整数');
    if (spec.totalScore !== null && spec.totalScore <= 0)
        errors.push('总分必须为正');
    if (spec.writtenScore !== null && spec.writtenScore < 0)
        errors.push('笔试分不能为负');
    if (spec.listeningSpeakingScore !== null && spec.listeningSpeakingScore < 0)
        errors.push('听说分不能为负');
    if (spec.totalScore !== null && spec.writtenScore !== null && spec.listeningSpeakingScore !== null
        && spec.writtenScore + spec.listeningSpeakingScore !== spec.totalScore) {
        errors.push(`分值不一致：${spec.writtenScore}+${spec.listeningSpeakingScore} ≠ ${spec.totalScore}`);
    }
    const sectionSum = spec.sections.reduce((n, s) => n + (s.score ?? 0), 0);
    const knownScores = spec.sections.every(s => s.score !== null);
    if (knownScores && spec.totalScore !== null && sectionSum !== spec.totalScore)
        errors.push(`section 分值合计 ${sectionSum} ≠ 总分 ${spec.totalScore}`);
    if (spec.status === 'official_confirmed') {
        if (!spec.sourceRefs.some(s => s.sourceType === 'official'))
            errors.push('官方确认规格必须有官方来源');
        if (!spec.publishedAt)
            errors.push('官方确认规格必须有发布日期');
    }
    if (spec.applicableYear >= 2027 && spec.status === 'official_confirmed') {
        warnings.push('未来年份的官方确认需要可核验的官方文件；请确认来源确实适用于该年份。');
    }
    for (const src of spec.sourceRefs) {
        if (!/^https?:\/\//.test(src.url))
            errors.push(`来源 URL 非法：${src.url}`);
        if (src.applicableYear !== null && src.applicableYear !== spec.applicableYear && spec.status === 'official_confirmed')
            warnings.push(`来源适用年份 ${src.applicableYear} ≠ 规格年份 ${spec.applicableYear}`);
    }
    return { ok: errors.length === 0, errors, warnings };
}
export function specsForYear(specs: ExamSpecification[], year: number): ExamSpecification[] {
    return specs.filter(s => s.applicableYear === year).sort((a, b) => a.id.localeCompare(b.id));
}
export function getSpec(specs: ExamSpecification[], id: string): ExamSpecification | undefined {
    return specs.find(s => s.id === id);
}
export function specDisplayLine(spec: ExamSpecification): string {
    const score = spec.totalScore === null ? '总分待确认' : `${spec.totalScore} 分`;
    return `${examCategoryLabel(spec.examCategory)} · ${spec.applicableYear} · ${score} · ${statusLabel(spec.status)}`;
}
