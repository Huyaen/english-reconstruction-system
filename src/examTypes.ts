// —— Phase 11：考试迁移与统一测评数据类型 ——
// 纪律：考试只是迁移证据；题目来源、答案可靠性、分数来源都必须显式。
import type { Data } from './types.ts';
export type ExamCategory = 'shanghai-gaokao-foreign-language-first' | 'shanghai-gaokao-foreign-language-second' | 'shanghai-spring-exam-foreign-language' | 'shanghai-academic-foreign-language' | 'other';
export type ExamSpecStatus = 'official_confirmed' | 'historical_reference' | 'provisional' | 'unknown';
export type ExamSourceType = 'official' | 'official_commentary' | 'user_provided' | 'third_party';
export type ExamConfidence = 'low' | 'medium' | 'high';
export interface ExamSourceRef {
    url: string;
    title: string;
    issuingAuthority: string;
    publishedAt: string;
    applicableYear: number | null;
    examCategory: ExamCategory;
    verifiedAt: number;
    sourceType: ExamSourceType;
    confidence: ExamConfidence;
}
export interface ExamSectionSpec {
    id: string;
    label: string;
    score: number | null;
    minutes: number | null;
    questionTypes: string[];
    status: ExamSpecStatus;
    basis: string;
}
export interface ExamQuestionTypeSpec {
    questionType: ExamQuestionType;
    label: string;
    included: boolean;
    score: number | null;
    itemCount: number | null;
    status: ExamSpecStatus;
    basis: string;
}
export interface ExamSpecification {
    id: string;
    examId: string;
    region: 'Shanghai';
    examCategory: ExamCategory;
    subject: 'English';
    applicableYear: number;
    status: ExamSpecStatus;
    issuingAuthority: string;
    sourceRefs: ExamSourceRef[];
    totalScore: number | null;
    writtenScore: number | null;
    listeningSpeakingScore: number | null;
    writtenDurationMinutes: number | null;
    oralDurationMinutes: number | null;
    sections: ExamSectionSpec[];
    questionTypes: ExamQuestionTypeSpec[];
    scoringRules: string[];
    publishedAt: string | null;
    verifiedAt: number | null;
    confidence: ExamConfidence;
    notes: string[];
}
export type ExamQuestionType = 'contextual_grammar' | 'vocabulary_in_context' | 'cloze' | 'reading_comprehension' | 'text_structure' | 'translation' | 'summary_writing' | 'situational_writing' | 'listening' | 'speaking' | 'delayed_vocabulary' | 'sentence_parsing' | 'short_output' | 'reflection';
export type ItemProvenance = 'official' | 'licensed' | 'user_supplied' | 'authored' | 'ai_generated' | 'unknown';
export type ItemVerifiedStatus = 'verified' | 'unverified' | 'needs_review' | 'auto_verified';
export type ItemSource = 'builtin' | 'imported' | 'generated' | 'official_sample';
export interface ExamDistractor {
    option: string;
    category: ExamErrorCategory;
    subcategory: ExamErrorSubcategory;
    reason: string;
}
export interface AssessmentItem {
    id: string;
    examCategory: ExamCategory;
    examYear: number | null;
    purpose: 'exam' | 'weekly';
    section: string;
    questionType: ExamQuestionType;
    materialId: string | null;
    stem: string;
    options: {
        id: string;
        text: string;
    }[];
    answerKey: string | null;
    answerEvidence: string;
    explanation: string;
    pointValue: number;
    estimatedTimeMinutes: number;
    difficulty: 'easy' | 'medium' | 'hard';
    difficultyBasis: string;
    targetSkills: string[];
    targetWords: string[];
    targetGrammar: string[];
    source: ItemSource;
    license: string;
    provenance: ItemProvenance;
    verifiedStatus: ItemVerifiedStatus;
    distractorAnalysis?: ExamDistractor[];
    rubric?: string[];
    audioUrl?: string | null;
    createdAt: number;
}
export interface ExamMaterial {
    id: string;
    title: string;
    text: string;
    topic: string;
    wordCount: number;
    source: ItemSource;
    license: string;
    provenance: ItemProvenance;
    verifiedStatus: ItemVerifiedStatus;
    createdAt: number;
}
export interface AssessmentAnswer {
    itemId: string;
    value: string;
    at: number;
    timeMs: number;
    helpUsed: boolean;
    flagged?: boolean;
}
export type ExamSessionStatus = 'created' | 'active' | 'paused' | 'submitted' | 'reviewed' | 'completed' | 'abandoned';
export type ExamSessionMode = 'skill_practice' | 'mixed_practice' | 'timed_practice' | 'review' | 'transfer_retest' | 'weekly_assessment';
export type ScoreStatus = 'verified_objective' | 'rubric_reviewed' | 'ai_estimated' | 'self_reported' | 'unavailable' | 'partial';
export type ExamErrorCategory = 'vocabulary' | 'structure' | 'logic' | 'evidence' | 'overthinking' | 'time_pressure' | 'uncertain';
export type ExamErrorSubcategory = 'word_meaning' | 'collocation' | 'clause_relation' | 'reference' | 'distractor' | 'misreading' | 'incomplete_evidence' | 'timing_strategy' | 'careless_selection' | 'overgeneralization' | 'other';
export interface ExamErrorRecord {
    itemId: string;
    category: ExamErrorCategory;
    subcategory: ExamErrorSubcategory;
    confidence: ExamConfidence;
    explanation: string;
    evidenceRefs: string[];
    alternatives: {
        category: ExamErrorCategory;
        subcategory: ExamErrorSubcategory;
        reason: string;
    }[];
    intervention: string;
    userReported: boolean;
    correctedByUser?: boolean;
    at: number;
}
export interface WeeklyAssessmentReport {
    id: string;
    sessionId: string;
    createdAt: number;
    minutes: number;
    sections: string[];
    answeredSections: string[];
    objectiveCorrect: number;
    objectiveTotal: number;
    selfReportedDependence: string | null;
    unavailable: {
        section: string;
        reason: string;
    }[];
    evidenceNote: string;
}
export interface ExamSession {
    id: string;
    mode: ExamSessionMode;
    specId: string;
    examCategory: ExamCategory;
    itemIds: string[];
    items: AssessmentItem[];
    answers: Record<string, AssessmentAnswer>;
    startedAt: number;
    updatedAt: number;
    completedAt: number | null;
    submittedAt?: number | null;
    pausedAt: number | null;
    timeLimitMinutes: number;
    timeUsedMs: number;
    helpUsed: number;
    status: ExamSessionStatus;
    revision: number;
    score: number | null;
    maxScore: number;
    scoreStatus: ScoreStatus;
    errors: ExamErrorRecord[];
    review: string;
    sourceProvenance: string;
    weeklyReportId?: string | null;
    /** Phase 12 Full Integration：从 Today 计划启动时绑定计划任务；直接练习为 null。 */
    dailyPlanTaskId?: string | null;
    /** 每个 section 是否因缺少可靠材料而降级 */
    unavailableSections?: {
        section: string;
        reason: string;
    }[];
    createdAt: number;
}
export type ExamLogType = 'school_exam' | 'monthly_exam' | 'mock_exam' | 'custom';
export type ExamLogScoreBasis = 'official_total' | 'custom_total';
export interface ExamLog {
    id: string;
    date: string;
    name: string;
    examCategory: ExamCategory;
    fullScore: number;
    reportedScore: number;
    sectionResults: {
        name: string;
        score: number | null;
        fullScore: number | null;
    }[];
    errorTypes: string[];
    selfAssessment: string;
    source: string;
    createdAt: number;
    /** Phase 12：用户实际参加的考试类型；旧记录缺省按校内考试显示。 */
    examType?: ExamLogType;
    /** Phase 12：自定义名称可为空，保存时必填；不与官方规格混淆。 */
    examName?: string;
    /** Phase 12：绑定的规格；为空表示自定义/不绑定。 */
    specId?: string | null;
    /** Phase 12：可从规格推导的适用年份；自定义考试必须显式填写。 */
    applicableYear?: number | null;
    /** Phase 12：满分依据；official_total 仅表示与官方总分相同，不代表官方成绩。 */
    scoreBasis?: ExamLogScoreBasis;
    /** Phase 12：官方总分与本次满分不一致时，用户显式确认自定义计分。 */
    conflictAcknowledged?: boolean;
    /** Phase 12：自报记录固定为线索，不进入已验证错因/能力。 */
    clueOnly?: boolean;
    /** Phase 12：自报来源标记，导出/恢复必须保留。 */
    scoreSource?: 'self_reported';
    updatedAt?: number;
}
export interface ExamData {
    examSpecifications: ExamSpecification[];
    examMaterials: ExamMaterial[];
    examItems: AssessmentItem[];
    examSessions: ExamSession[];
    examLogs: ExamLog[];
}
export function examDataOf(data: Data): ExamData {
    return {
        examSpecifications: data.examSpecifications ?? [],
        examMaterials: data.examMaterials ?? [],
        examItems: data.examItems ?? [],
        examSessions: data.examSessions ?? [],
        examLogs: data.examLogs ?? [],
    };
}
