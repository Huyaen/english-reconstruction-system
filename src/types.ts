import type { ExamSpecification, ExamMaterial, AssessmentItem, ExamSession, ExamLog } from './examTypes.ts';
export type Direction = 'en-zh' | 'zh-en';
export type Mastery = 'new' | 'unknown' | 'vague' | 'normal' | 'fluent';
export interface DirectionStats {
    total: number;
    correct: number;
    meanMs: number;
}
export interface MasteryState {
    total: number;
    correct: number;
    streak: number;
    errors: number;
    lapses: number;
    meanMs: number;
    lastMs: number;
    lastCorrect: boolean;
    level: Mastery;
    directions: Record<Direction, DirectionStats>;
}
export interface ReviewSchedule {
    due: number;
    last: number;
    interval: number;
    step: number;
    spacedPasses: number;
}
export interface Word {
    id: string;
    bookId: string;
    en: string;
    zh: string;
    pos: string;
    phonetic: string;
    example: string;
    collocation: string;
    difficulty: string;
    tags: string;
    order: number;
    state: MasteryState;
    schedule: ReviewSchedule;
    confusions: Record<string, number>;
    recognitionScore: number;
    activeRecallScore: number;
    productiveScore: number;
    exposureCount: number;
    contextExposureCount: number;
    productionEvidence: number;
    previewedAt: number;
    lastEncounteredAt: number;
    sourceTypes: string[];
    fsrs: FSRSWordState;
    previewResult: string;
}
export interface WordBook {
    id: string;
    name: string;
    created: number;
}
export interface ReviewRecord {
    id: string;
    wordId: string;
    sessionId: string;
    at: number;
    direction: Direction;
    correct: boolean;
    ms: number;
    selectedId: string | null;
    reason: 'answer' | 'unknown' | 'timeout';
    before: Mastery;
    after: Mastery;
    scheduled: boolean;
    rating?: number;
}
export interface Question {
    wordId: string;
    direction: Direction;
    options: string[];
}
export interface StudySession {
    id: string;
    started: number;
    ended: number | null;
    mode: string;
    queue: string[];
    index: number;
    answered: number;
    correct: number;
    retries: Record<string, number>;
    question: Question | null;
    /** Phase 12 Full Integration：从 Today 计划启动的词汇会话；刷新后仍能回写计划。 */
    planTaskId?: string | null;
}
export interface Settings {
    fast: number;
    normal: number;
    timeout: number;
    ratio: number;
    difficulty: 'easy' | 'normal' | 'hard';
    feedback: number;
    theme: 'light' | 'dark';
    endpoint: string;
    model: string;
    key: string;
    rememberKey: boolean;
    schedulingAuthority: 'legacy' | 'fsrs';
    requestRetention: number;
    /** Phase 6：AI 强化设置（可选，旧数据自动补默认值） */
    ai?: AISettings;
    /** Phase 8：动态兴趣画像（可选，旧数据/旧备份自动视为空画像） */
    interests?: InterestProfile;
    /** Phase 11：考试练习是否进入每日计划（默认关闭） */
    exam?: {
        planEnabled: boolean;
    };
}
// —— Phase 8：Dynamic Interest Profile ——
// 兴趣 ≠ 能力：这里只表示“想读什么”，不参与任何掌握度/难度判定。
// 允许用户自由增删改任意主题；默认分类只是建议，不是白名单。
export interface InterestTopic {
    id: string;
    /** 用户看到的主题名（自由文本，用户可改） */
    label: string;
    /** 显式添加（用户主动）或从建议里采纳（采纳后同样成为显式偏好） */
    source: 'explicit' | 'suggested';
    /** 显式权重 0–1：只由用户操作改变，近期行为不会偷偷改它 */
    weight: number;
    /** 关键词：用于把材料主题/标题连到这条兴趣上（可编辑，空则用 label 自动生成） */
    keywords: string[];
    createdAt: number;
    updatedAt: number;
}
export interface InterestProfile {
    version: 1;
    topics: InterestTopic[];
    /** 探索比例 0–1：保留多少推荐位置给“与你无关但有真实材料”的领域 */
    exploration: number;
    /** 用户主动重置的次数（只用于展示，不影响推荐） */
    resets: number;
    updatedAt: number;
}
export type AIStructuredMode = 'auto' | 'json_schema' | 'json_object' | 'text';
// Phase 6：AI Provider 设置（Key 只在本机存储，rememberKey=false 时不落盘）
export interface AISettings {
    endpoint: string;
    model: string;
    key: string;
    structuredMode: AIStructuredMode;
    timeoutMs: number;
    maxRetries: number;
    maxOutputTokens: number;
    temperature: number;
    concurrency: number;
    dailyTokenBudget: number | null;
    /** 已确认可用的结构化模式（自动降级后记住，避免每次重试） */
    knownMode?: 'json_schema' | 'json_object' | 'text';
}
export interface AIUsageRecord {
    promptTokens: number;
    completionTokens: number;
    estimated: boolean;
}
// AI 生成物：永远标 ai_unverified，绝不冒充真实语料或 gold 结构
export interface AIGeneration {
    id: string;
    kind: 'sentence' | 'reading' | 'output';
    createdAt: number;
    promptId: string;
    promptVersion: string;
    promptHash: string;
    providerHost: string;
    model: string;
    structuredMode: string;
    contentHash: string;
    usage: AIUsageRecord;
    output: unknown;
    quality: {
        ok: boolean;
        notes: string[];
    };
    sourceMetadata: Record<string, string>;
}
export interface AIAnalysis {
    id: string;
    at: number;
    text: string;
    model: string;
    sampleSize: number;
}
export interface Data {
    books: WordBook[];
    words: Word[];
    records: ReviewRecord[];
    sessions: StudySession[];
    settings: Settings;
    analyses: AIAnalysis[];
    wordExposures: WordExposure[];
    grammarConcepts: GrammarConcept[];
    grammarAttempts: GrammarAttempt[];
    sentenceAttempts: SentenceAttempt[];
    sentences: SentenceRecord[];
    passages: Passage[];
    readingSessions: ReadingSession[];
    inputSources: InputSource[];
    inputSessions: InputSession[];
    outputAttempts: OutputAttempt[];
    dailyPlans: DailyPlan[];
    miniUnits: MiniUnit[];
    skillSnapshots: SkillSnapshot[];
    weeklyDiagnostics: WeeklyDiagnostic[];
    libraryItems: LibraryItem[];
    transcripts: Transcript[];
    inputEvidence: InputEvidenceRecord[];
    aiGenerations: AIGeneration[];
    // —— Phase 11：考试迁移与统一测评（DB v7，additive）——
    examSpecifications: ExamSpecification[];
    examMaterials: ExamMaterial[];
    examItems: AssessmentItem[];
    examSessions: ExamSession[];
    examLogs: ExamLog[];
    migration?: MigrationRecord | null;
}
export const defaults: Settings = { fast: 1500, normal: 3000, timeout: 6000, ratio: 50, difficulty: 'normal', feedback: 500, theme: 'light', endpoint: '', model: '', key: '', rememberKey: false, schedulingAuthority: 'fsrs', requestRetention: 0.9 };
export const fsrsDefaults: FSRSWordState = { stability: 0, difficulty: 0, state: 0, reps: 0, lapses: 0, due: 0, lastReview: 0, scheduledDays: 0, learningSteps: 0 };
// —— V2 Learning Model 数据类型（Phase 1 Data Foundation）——
// 字段设计依据 PROJECT_SPEC.md §84–§92；所有实体 keyPath 均为字符串 id。
export type Lifecycle = 'unseen' | 'previewed' | 'learning' | 'recognition' | 'active' | 'productive';
export type ExposureState = 'known' | 'vague' | 'unknown' | 'guessed';
export type EnergyState = 'low' | 'normal' | 'good';
export type CaptionMode = 'none' | 'en' | 'zh' | 'other';
export interface MigrationRecord {
    from: number;
    to: number;
    at: number;
}
export interface WordExposure {
    id: string;
    wordId: string;
    at: number;
    sourceType: 'reading' | 'input' | 'output' | 'sentence' | 'manual' | 'preview';
    sourceId: string;
    state: ExposureState;
    sentence: string;
    counted: boolean;
}
// —— Phase 4：Grammar Knowledge Graph / Sentence Lab ——
// 全部新增字段都是可选的：旧数据、旧备份、Phase 3 计划保持可读（见 db.ts 的 v4 additive 迁移）。
export type GrammarCategory = 'sentence-structure' | 'clauses' | 'non-finite' | 'verb-system' | 'phrases' | 'cohesion';
export interface GrammarConcept {
    id: string;
    name: string;
    parentId: string | null;
    exposures: number;
    attempts: number;
    correct: number;
    mastery: number;
    retention: number;
    errorTypes: Record<string, number>;
    lastSeenAt: number;
    nextReviewAt: number;
    createdAt: number;
    // Phase 4 增补
    category?: GrammarCategory;
    description?: string;
    prerequisiteIds?: string[];
    relatedConceptIds?: string[];
    examples?: string[];
    confidence?: number;
    realContextEvidence?: number;
    source?: 'taxonomy' | 'user';
    updatedAt?: number;
}
export interface GrammarAttempt {
    id: string;
    conceptId: string;
    at: number;
    correct: boolean;
    sourceType: string;
    sourceId: string;
    errorType: string;
    durationMs: number;
    // Phase 4 增补：证据分级用（缺省视为普通识别题）
    independent?: boolean;
    supportLevel?: number;
    sentenceId?: string;
    stepId?: string;
    delayed?: boolean;
    transfer?: boolean;
}
// 句源契约（PROJECT_SPEC §46；AI 未上线时不得伪造 AI 句）
export type SentenceSourceType = 'curated' | 'user' | 'saved' | 'real-material' | 'reading' | 'ai';
export type SentenceStructureProvenance = 'gold' | 'verified' | 'heuristic' | 'manual' | 'ai_unverified' | 'none';
export interface SentenceRecord {
    id: string;
    text: string;
    zh: string;
    sourceType: SentenceSourceType;
    sourceId: string;
    attribution: string;
    grammarTags: string[];
    targetWordIds: string[];
    theme: string;
    difficulty: number;
    // 预教词表（authored 教学句自带；有释义的生词不阻断选句）
    glossary?: Record<string, string>;
    structure: unknown;
    structureProvenance: SentenceStructureProvenance;
    createdBy: 'system' | 'user' | 'ai';
    createdAt: number;
    usedCount: number;
    lastUsedAt: number;
    notes: string;
}
export interface SentenceStepRecord {
    stepId: string;
    answer: string;
    correct: boolean;
    supportLevel: number;
    durationMs: number;
    errorType: string;
}
export type SentenceEvidenceClass = 'exposed' | 'hint-assisted' | 'independent' | 'transfer' | 'delayed' | 'error';
export interface SentenceAttempt {
    id: string;
    sentence: string;
    sourceType: SentenceSourceType;
    sourceId: string;
    targetWords: string[];
    targetGrammar: string[];
    subjectCorrect: boolean | null;
    verbCorrect: boolean | null;
    structureCorrect: boolean | null;
    translationDependence: number;
    durationMs: number;
    errors: string[];
    createdAt: number;
    // Phase 4 增补
    at?: number;
    sentenceId?: string;
    sessionId?: string;
    sessionKey?: string;
    steps?: SentenceStepRecord[];
    hintLevel?: number;
    maxSupportLevel?: number;
    independent?: boolean;
    evidenceClass?: SentenceEvidenceClass;
    grammarConceptIds?: string[];
    meaningCorrect?: boolean | null;
    transferOf?: string | null;
    reviewedAt?: number | null;
}
export interface Passage {
    id: string;
    title: string;
    text: string;
    sourceType: 'import' | 'ai' | 'recommended' | 'url' | 'image' | ReadingSourceType;
    sourceUrl: string;
    topic: string;
    wordCount: number;
    difficulty: string;
    createdAt: number;
    // —— Phase 5 增补（全部可选：旧 Passage 记录保持可读）——
    sourceName?: string;
    language?: string;
    paragraphs?: ReadingParagraph[];
    sentences?: ReadingSentence[];
    estimatedDifficulty?: number;
    sourceReliability?: ReadingSourceReliability;
    contentHash?: string;
    extractionMethod?: ReadingExtractionMethod;
    userEdited?: boolean;
    importedAt?: number;
    sourceMetadata?: Record<string, string>;
}
export interface ReadingSession {
    id: string;
    passageId: string;
    wordCount: number;
    durationMs: number;
    unknownWords: string[];
    vagueWords: string[];
    unknownRate: number;
    firstPassComprehension: number | null;
    secondPassComprehension: number | null;
    readingSpeed: number;
    structureErrors: number;
    translationDependence: number;
    summary: string;
    stage: number;
    at: number;
    /** Phase 12 Full Integration：从 Today 计划启动的阅读会话；刷新后仍能回写计划。 */
    dailyPlanTaskId?: string | null;
    // —— Phase 5 增补：完整阅读会话状态（旧字段继续作为“平表镜像”供统计使用）——
    detail?: ReadingSessionDetail;
}
export interface InputSource {
    id: string;
    title: string;
    kind: 'video' | 'article' | 'game' | 'other';
    url: string;
    topic: string;
    durationMinutes: number;
    difficultyEstimate: number | null;
    createdAt: number;
    // —— Phase 8：真实材料域（全部可选，旧数据保持可读）——
    provider?: 'youtube' | 'bilibili' | 'vimeo' | 'web' | 'other';
    language?: string;
    /** 材料是怎么进来的：用户提供 / 平台官方 / 手工转录 / 未验证机器生成 / 未知 */
    provenance?: InputProvenance;
    /** 我们到底验证到了什么：只保存链接 = unverified，绝不冒充 */
    verificationStatus?: InputVerification;
    verifiedAt?: number | null;
    subtitleStatus?: InputSubtitleStatus;
    transcriptRef?: string | null;
    thumbnailUrl?: string;
    contentType?: InputContentType;
    notes?: string;
    updatedAt?: number;
    normalizedUrl?: string;
    videoId?: string;
    contentHash?: string;
    /** 难度估计的依据：没有 transcript 时只能是 none（不猜视频里的词汇） */
    difficultyBasis?: 'transcript' | 'none';
}
export interface InputSession {
    id: string;
    sourceId: string;
    title: string;
    url: string;
    topic: string;
    durationMinutes: number;
    watchedMinutes: number;
    captionMode: CaptionMode;
    comprehension: number | null;
    difficultyReasons: string[];
    outputAttemptId: string;
    notes: string;
    mode: InputMode;
    createdAt: number;
    // —— Phase 8：会话生命周期（旧字段保留为平表镜像供统计）——
    status?: InputSessionStatus;
    revision?: number;
    startedAt?: number;
    pausedAt?: number | null;
    completedAt?: number | null;
    abandonedAt?: number | null;
    miniUnitId?: string | null;
    /** Phase 12 Full Integration：从 Today 计划启动时绑定计划任务；普通输入为 null。 */
    dailyPlanTaskId?: string | null;
    plannedMinutes?: number;
    /** 用户自报的观看时长（我们没有也不应假装知道第三方播放器的真实进度） */
    reportedWatchedMinutes?: number | null;
    coldComprehension?: number | null;
    afterComprehension?: number | null;
    translationDependence?: number | null;
    transcriptRef?: string | null;
    baseline?: InputBaseline;
    reflection?: InputReflection;
    evidenceBasis?: 'self_report' | 'transcript' | 'mixed' | 'none';
}
export interface OutputCorrection {
    from: string;
    to: string;
    note: string;
}
// —— Phase 9：Output Lab（真实表达）——
// 说明：这是"用已知英语传递意思"的训练，不是作文评分器。
// 所有新增字段都是可选的，旧 OutputAttempt 与旧备份保持可读，DB 不升版本。
export type OutputTaskType = 'one_sentence' | 'short_summary' | 'paragraph_summary' | 'retelling' | 'opinion' | 'free_expression' | 'transformation' | 'repair';
export type OutputSourceType = 'free' | 'reading' | 'input' | 'mini_unit' | 'vocabulary' | 'grammar' | 'closing_loop';
export type OutputStatus = 'draft' | 'submitted' | 'waiting_feedback' | 'feedback' | 'revised' | 'completed' | 'abandoned';
export type OutputFeedbackStatus = 'none' | 'pending' | 'ai' | 'unavailable' | 'invalid';
export type OutputFeedbackSource = 'ai' | 'mock' | 'none';
export type OutputFeedbackScope = 'language_only' | 'content_checked' | 'content_unverified';
export type OutputMeaningBasis = 'verified' | 'supported_by_source' | 'ai_estimated' | 'self_reported' | 'unknown';
export type OutputErrorType = 'tense' | 'subject_verb_agreement' | 'article' | 'preposition' | 'word_form' | 'word_order' | 'clause_structure' | 'missing_subject' | 'missing_predicate' | 'vocabulary_choice' | 'collocation' | 'reference' | 'coherence' | 'meaning_ambiguity' | 'other';
export type OutputSupportLevel = 0 | 1 | 2 | 3 | 4;
export type OutputRevisionKind = 'self' | 'after_hint' | 'copied' | 'after_model';
export type ProductiveEvidenceSource = 'output_independent' | 'output_assisted' | 'output_copied' | 'output_transfer' | 'output_delayed';
/** 一次表达训练的任务契约（Planner / UI / Mini Unit 共用） */
export interface OutputTaskSpec {
    id: string;
    taskType: OutputTaskType;
    topic: string;
    /** 这次表达要完成的交际目标（不是作文题目） */
    communicationGoal: string;
    sourceType: OutputSourceType;
    sourceId: string;
    sourceLabel: string;
    targetWords: string[];
    targetGrammar: string[];
    expectedMinutes: number;
    difficultyEstimate: number;
    minWords: number;
    maxWords: number;
    /** 为什么现在练这个（真实材料/薄弱点/单元/时间），禁止编造 */
    reasons: string[];
    /** 用户可以随时换题；兴趣只影响选材，不影响能力判定 */
    interestOnly?: boolean;
    createdAt: number;
}
/** 错误定位：span 必须能在原文中真实找到，否则整条丢弃 */
export interface OutputErrorSpan {
    type: OutputErrorType;
    original: string;
    proposed: string;
    start: number;
    end: number;
    explanation: string;
    severity: 'blocking' | 'major' | 'minor' | 'style';
    confidence: number;
    grammarConceptId?: string | null;
    targetWordId?: string | null;
}
export interface OutputUpgrade {
    original: string;
    suggested: string;
    why: string;
    changes: string[];
    newGrammar: string[];
    newWords: string[];
    /** 只提升一个主要难度维度：true 才允许作为"升级"展示 */
    singleDimension: boolean;
}
export interface OutputFeedback {
    communicationGoal: string;
    meaningAssessment: 'delivered' | 'partly_delivered' | 'not_delivered' | 'unavailable';
    meaningBasis: OutputMeaningBasis;
    meaningConfidence: number;
    strengths: string[];
    priorityIssues: OutputErrorSpan[];
    corrections: OutputErrorSpan[];
    grammarConceptIds: string[];
    targetWordIds: string[];
    upgrade: OutputUpgrade | null;
    nextPractice: string;
    feedbackScope: OutputFeedbackScope;
    sourceProvenance: string;
    uncertainty: string;
    promptVersion: string;
    /** 没有任何问题时明确说明，不强行改句子 */
    noCorrectionNeeded: boolean;
}
export interface OutputSupportRecord {
    highestLevel: OutputSupportLevel;
    requestedHints: string[];
    hintTypes: string[];
    independentText: string;
    textAfterSupport: string;
}
export interface OutputRevisionRecord {
    text: string;
    at: number;
    kind: OutputRevisionKind;
    /** 与 AI 建议的相似度（0–1）；用于区分"自己改"与"照抄" */
    similarityToSuggestion: number;
}
export interface ProductiveEvidence {
    id: string;
    wordId: string;
    outputAttemptId: string;
    textSpan: string;
    context: string;
    independent: boolean;
    assisted: boolean;
    copied: boolean;
    correctness: 'correct' | 'questionable' | 'wrong';
    confidence: number;
    evidenceSource: ProductiveEvidenceSource;
    at: number;
}
export interface OutputAttempt {
    id: string;
    prompt: string;
    sourceType: string;
    sourceId: string;
    originalText: string;
    meaningEvidence: number | null;
    grammarEvidence: number | null;
    vocabularyEvidence: number | null;
    coherenceEvidence: number | null;
    repairAbility: number | null;
    corrections: OutputCorrection[];
    upgradeSuggestion: string;
    wordCount: number;
    aiEval: unknown;
    createdAt: number;
    // —— Phase 9 新增（全部可选）——
    taskType?: OutputTaskType;
    task?: OutputTaskSpec;
    inputSessionId?: string | null;
    readingSessionId?: string | null;
    miniUnitId?: string | null;
    dailyPlanTaskId?: string | null;
    draftText?: string;
    revisionText?: string;
    finalText?: string;
    feedbackStatus?: OutputFeedbackStatus;
    feedbackSource?: OutputFeedbackSource;
    meaningBasis?: OutputMeaningBasis;
    sourceProvenance?: string;
    supportLevel?: OutputSupportLevel;
    support?: OutputSupportRecord;
    hintsUsed?: string[];
    targetWords?: string[];
    targetGrammar?: string[];
    productiveEvidence?: ProductiveEvidence[];
    transferOf?: string | null;
    transferAttemptId?: string | null;
    delayedOf?: string | null;
    delayedAttemptId?: string | null;
    confidence?: number;
    promptVersion?: string;
    aiGenerationId?: string | null;
    feedback?: OutputFeedback | null;
    revisions?: OutputRevisionRecord[];
    status?: OutputStatus;
    meaningPreserved?: boolean | null;
    repair?: OutputRepairRecord | null;
    updatedAt?: number;
    revision?: number;
    /** 完成时刻（Phase 9；旧记录没有） */
    completedAt?: number | null;
    /** 来源展示名（Phase 9；只用于 UI，不参与判分） */
    sourceLabel?: string;
}
/** Communication Repair：用已知英语绕开不会的表达 */
export interface OutputRepairRecord {
    intendedMeaning: string;
    blockedExpression: string;
    userAlternative: string;
    supportLevel: OutputSupportLevel;
    meaningPreserved: boolean | null;
    evidenceBasis: OutputMeaningBasis;
    evaluatorConfidence: number;
    source: 'user' | 'system' | 'ai';
    at: number;
}
// Phase 3 起 PlanItem 作为五模块统一 Task Contract 的持久化形状；
// 新增字段全部可选，因此旧计划/旧备份保持可读（DB 版本无需提升）。
export interface PlanItem {
    id: string;
    module: string;
    minutes: number;
    status: 'pending' | 'started' | 'done' | 'skipped' | 'delayed' | 'replaced';
    note: string;
    kind?: string;
    label?: string;
    priority?: number;
    critical?: boolean;
    flexible?: boolean;
    capabilityRequired?: string;
    source?: string;
    refs?: string[];
    reason?: string[];
    dependencies?: string[];
    // Phase 4：句任务的真实目标语法概念（用于同目标替换与失败解释）
    targetGrammar?: string[];
    // Phase 5：阅读任务要恢复的会话（reading-continue）
    targetSessionId?: string;
    startedAt?: number | null;
    completedAt?: number | null;
    actualMinutes?: number | null;
    replacedBy?: string | null;
}
export interface PlanAdjustment {
    at: number;
    module: string;
    deltaMinutes: number;
    reason: string;
}
export interface PlanEvent {
    id: string;
    at: number;
    taskId: string;
    action: 'start' | 'complete' | 'skip' | 'delay' | 'replace' | 'regenerate' | 'calibrate' | 'overrun';
    minutesDelta: number;
    reason: string;
}
export interface DailyPlan {
    id: string;
    date: string;
    availableMinutes: number;
    energyState: EnergyState;
    yesterdayRecallResult: unknown;
    miniUnitId: string;
    initialPlan: PlanItem[];
    adjustments: PlanAdjustment[];
    actualExecution: unknown;
    completedModules: string[];
    closingLoop: unknown;
    createdAt: number;
    completedAt: number | null;
    // Phase 3 增补（可选，向后兼容）
    revision?: number;
    updatedAt?: number;
    status?: 'planned' | 'active' | 'completed';
    capabilities?: Record<string, {
        available: boolean;
        requires: string | null;
        label?: string;
    }>;
    planRequest?: unknown;
    budget?: unknown;
    recovery?: unknown;
    calibration?: unknown;
    taskActions?: PlanEvent[];
}
export interface MiniUnit {
    id: string;
    theme: string;
    dayIndex: number;
    anchorMaterialId: string;
    targetWords: string[];
    targetGrammar: string[];
    difficultyTarget: number | null;
    status: 'active' | 'completed' | 'extended' | 'abandoned';
    startedAt: number;
    completedAt: number | null;
    dayLog: {
        day: number;
        at: number;
        summary: string;
    }[];
    // —— Phase 7 增补（全部可选：Phase 2–6 的旧 MiniUnit 记录与备份保持可读）——
    stage?: MiniUnitStage;
    themeId?: string;
    topic?: string;
    whyRecommended?: string;
    anchorProvenance?: AnchorProvenance;
    anchorSnapshotRef?: string;
    anchorTitle?: string;
    plannedDays?: number;
    dayHistory?: MiniUnitDayRecord[];
    grammarTargets?: MiniUnitGrammarTarget[];
    baseline?: MiniUnitBaseline;
    transfer?: MiniUnitTransferRecord;
    completionEvaluation?: UnitCompletionEvaluation;
    linkedPassageIds?: string[];
    linkedSentenceIds?: string[];
    linkedGenerationIds?: string[];
    linkedDailyPlanIds?: string[];
    pausedReason?: string;
    createdAt?: number;
    updatedAt?: number;
    revision?: number;
}
// —— Phase 7：Mini Unit（跨学习日的主题学习单元）——
// 约定：status 保留 Phase 2–3 的四个旧值（备份兼容），stage 表达细粒度状态机。
export type MiniUnitStage = 'draft' | 'ready' | 'active' | 'paused' | 'completed' | 'abandoned';
export type AnchorProvenance = 'authentic_external' | 'user_imported_authentic' | 'curated_authentic' | 'ai_generated' | 'authored_educational' | 'unknown';
export type UnitDayKind = 'build' | 'strengthen' | 'transfer' | 'reinforce';
export type UnitSupportLevel = 'high' | 'medium' | 'low';
export interface MiniUnitDayRecord {
    day: number;
    kind: UnitDayKind;
    calendarDate: string;
    at: number;
    summary: string;
    supportLevel: UnitSupportLevel;
    evidenceIds: string[];
    targetWordsCovered: string[];
}
export interface MiniUnitGrammarTarget {
    conceptId: string;
    name: string;
    /** verified = 在 Anchor/教学句中真实出现过；candidate = 只有薄弱点依据，尚未在材料中核验 */
    status: 'verified' | 'candidate';
    evidence: string;
}
export interface MiniUnitBaseline {
    at: number;
    passageId: string;
    sessionId: string;
    source: 'cold_test' | 'estimated';
    unknownRate: number | null;
    comprehension: number | null;
    wordCount: number;
}
export interface MiniUnitTransferRecord {
    at: number;
    passageId: string;
    materialKind: 'authentic' | 'ai_assisted';
    independent: boolean;
    comprehension: number | null;
    targetWordRecall: number;
    grammarObserved: boolean;
    sessionId: string;
}
export interface UnitCompletionMetrics {
    targetWordsCovered: number;
    targetWordTotal: number;
    independentRecallEvidence: number;
    forgottenWords: string[];
    grammarEvidence: number;
    anchorColdResult: number | null;
    supportedResult: number | null;
    transferResult: number | null;
    supportReduction: number;
    translationDependence: number;
    unresolvedObstacles: string[];
    completedLearningDays: number;
}
export interface UnitCompletionEvaluation {
    at: number;
    decision: 'completed_verified' | 'completed_limited_evidence' | 'extended' | 'user_ended' | 'abandoned';
    confidence: 'low' | 'medium' | 'high';
    reasons: string[];
    evidenceRefs: string[];
    nextActions: string[];
    metrics: UnitCompletionMetrics;
}
export interface UnitEvidenceRef {
    kind: 'word' | 'sentence' | 'reading' | 'grammar' | 'plan' | 'ai' | 'exposure' | 'output';
    id: string;
    at: number;
    note: string;
}
export interface UnitEvidenceSummary {
    unitId: string;
    wordsCovered: string[];
    wordsIndependent: string[];
    forgottenWords: string[];
    targetWordTotal: number;
    independentRecall: number;
    grammar: {
        conceptId: string;
        attempts: number;
        correct: number;
        independent: boolean;
    }[];
    anchorSessions: string[];
    transferSessions: string[];
    sentenceAttempts: number;
    planDays: string[];
    generations: string[];
    cold: {
        unknownRate: number | null;
        comprehension: number | null;
    } | null;
    supported: {
        comprehension: number | null;
        translationDependence: number | null;
    } | null;
    supportReduction: number;
    translationDependence: number;
    obstacles: string[];
    /** Phase 8：与单元关联的真实媒体输入（只算曝光，不算迁移/掌握） */
    mediaSessions?: string[];
    mediaMinutes?: number;
    /** Phase 9：与单元关联的真实表达记录（不自动完成学习日） */
    outputAttempts?: string[];
    outputIndependent?: number;
    refs: UnitEvidenceRef[];
}
// —— Phase 10：能力诊断（只描述证据，不合成单一“英语分数”）——
export type DiagnosticDomain = 'vocabulary' | 'grammar' | 'reading' | 'input' | 'output' | 'translation' | 'exam';
export type MetricEvaluability = 'evaluable' | 'insufficient' | 'not-applicable';
export type DiagnosticQuality = 'verified' | 'task-behavior' | 'mixed' | 'self-report' | 'none';
export interface MetricValue {
    id: string;
    domain: DiagnosticDomain;
    label: string;
    kind: 'count' | 'rate' | 'duration' | 'index';
    /** null 表示不可评估；不要用 0 冒充“差” */
    value: number | null;
    numerator: number | null;
    denominator: number | null;
    sample: number;
    minSample: number;
    evaluability: MetricEvaluability;
    quality: DiagnosticQuality;
    /** 指标怎么算、分母是什么（界面上必须可见） */
    definition: string;
    reasons: string[];
}
export interface RetentionPoint {
    label: 'D1' | 'D7' | 'D30';
    total: number;
    correct: number;
    rate: number | null;
    evaluable: boolean;
    note: string;
}
export interface DiagnosticEvidenceMix {
    verified: number;
    taskBehavior: number;
    selfReport: number;
    inferred: number;
    distinctSources: number;
    quality: DiagnosticQuality;
    note: string;
}
export interface DiagnosticBottleneck {
    domain: DiagnosticDomain;
    label: string;
    reason: string;
    confidence: 'low' | 'medium';
    metricIds: string[];
}
export interface MetricComparison {
    metricId: string;
    label: string;
    current: number | null;
    previous: number | null;
    delta: number | null;
    comparable: boolean;
    reason: string;
}
export interface DiagnosticPlanAction {
    id: string;
    title: string;
    reason: string;
    domain: DiagnosticDomain;
    minutes: number;
    actionKind: 'open-reading' | 'open-sentence' | 'open-output' | 'open-input' | 'open-diagnostics';
    targetId: string | null;
}
export interface DiagnosticPayload {
    range: {
        from: number;
        to: number;
        days: number;
    };
    metrics: MetricValue[];
    retention: RetentionPoint[];
    evidence: DiagnosticEvidenceMix;
    bottleneck: DiagnosticBottleneck | null;
    comparison: MetricComparison[];
    plan: DiagnosticPlanAction[];
    notes: string[];
    /** 明确声明：这不是英语总分 */
    disclaimer: string;
}
export interface SkillSnapshot {
    id: string;
    date: string;
    stableVocabulary: number;
    d1Retention: number | null;
    d7Retention: number | null;
    d30Retention: number | null;
    avgRetrievalMs: number | null;
    readingUnknownRate: number | null;
    readingSpeed: number | null;
    sentenceParsing: number | null;
    translationDependence: number | null;
    captionedComprehension: number | null;
    uncaptionedComprehension: number | null;
    outputSummary: unknown;
    createdAt: number;
    /** Phase 10：诊断明细（旧快照没有该字段仍然合法） */
    diagnostics?: DiagnosticPayload;
}
export interface WeeklyDiagnostic {
    id: string;
    weekOf: string;
    results: unknown;
    summary: string;
    createdAt: number;
    /** Phase 10：与快照同源的诊断明细 + 下周行动计划 */
    diagnostics?: DiagnosticPayload;
}
export interface LibraryItem {
    id: string;
    title: string;
    kind: 'article' | 'video' | 'other';
    url: string;
    topic: string;
    difficultyEstimate: number | null;
    status: 'saved' | 'used' | 'archived';
    notes: string;
    savedAt: number;
    // —— Phase 8：与 InputSource 一对一（可选，旧条目仍然合法）——
    sourceId?: string;
    contentType?: InputContentType;
    durationMinutes?: number;
    captionStatus?: InputSubtitleStatus;
    lastOpenedAt?: number | null;
    completion?: number;
    miniUnitId?: string | null;
    updatedAt?: number;
}
// —— Phase 8：Real Input Hub 的领域类型 ——
export type InputProvider = 'youtube' | 'bilibili' | 'vimeo' | 'web' | 'other';
export type InputMode = 'light' | 'standard' | 'deep';
export type InputSessionStatus = 'created' | 'active' | 'paused' | 'reflection' | 'completed' | 'abandoned';
export type InputProvenance = 'user_supplied' | 'official_subtitle' | 'manually_transcribed' | 'machine_generated_unverified' | 'unknown';
export type InputVerification = 'unverified' | 'metadata_verified' | 'user_confirmed';
export type InputSubtitleStatus = 'unknown' | 'none' | 'user_supplied' | 'official' | 'machine';
export type InputContentType = 'youtube' | 'bilibili' | 'online_video' | 'documentary' | 'esports' | 'game_content' | 'series_clip' | 'article' | 'other';
export type InputEvidenceType = 'watching_exposure' | 'self_report' | 'transcript_reading' | 'independent_comprehension' | 'output_attempt';
export interface CaptionCue {
    startMs: number;
    endMs: number;
    text: string;
    language: string;
    provenance: InputProvenance;
}
export interface Transcript {
    id: string;
    sourceId: string;
    language: string;
    provenance: InputProvenance;
    /** 没有时间轴（TXT）时为 false，此时 cue 时间全为 0，不能当作字幕时间轴 */
    timed: boolean;
    cues: CaptionCue[];
    hash: string;
    fileName?: string;
    createdAt: number;
    updatedAt: number;
    warnings?: string[];
}
export interface InputBaseline {
    status: 'recorded' | 'skipped';
    captionMode: CaptionMode;
    comprehension: number | null;
    blocker: string;
    watchedMinutes: number | null;
    at: number;
}
export interface InputReflection {
    mode: InputMode;
    captionMode: CaptionMode;
    comprehension: number | null;
    difficultyReasons: string[];
    notes: string;
    /** Standard：英文总结原文（不做无依据的事实评分） */
    summary?: string;
    /** Deep */
    mainIdea?: string;
    keyPoints?: string[];
    opinion?: string;
    retelling?: string;
    completion: number;
    savedAt: number;
}
export interface InputEvidenceRecord {
    id: string;
    sourceId: string;
    sessionId: string;
    evidenceType: InputEvidenceType;
    at: number;
    confidence: number;
    provenance: InputProvenance;
    meta?: Record<string, unknown>;
}
// —— V3：FSRS 调度状态（字段以 ts-fsrs@5.4.2 实际 API 为准，见 src/fsrs.ts）——
export interface FSRSWordState {
    stability: number;
    difficulty: number;
    state: number;
    reps: number;
    lapses: number;
    due: number;
    lastReview: number;
    scheduledDays: number;
    learningSteps: number;
}
// —— Phase 5：Reading Lab（阅读域）——
// 约定：所有新字段都是可选或带默认值，DB 仍为 v4（passages / readingSessions 两个 store 在 Phase 1 已建）。
// 阅读材料的来源必须可追溯：sourceType 区分真实来源，禁止把人工/AI 材料伪装成外部真实文章。
export type ReadingSourceType = 'pasted_text' | 'uploaded_file' | 'uploaded_image' | 'web_article' | 'curated_real_material' | 'ai_reinforcement' | 'library_item';
export type ReadingSourceReliability = 'authoritative' | 'editorial' | 'user_provided' | 'unknown' | 'ai_generated';
export type ReadingExtractionMethod = 'paste' | 'file_text' | 'file_html' | 'url_fetch' | 'vision_ocr' | 'local_ocr' | 'manual' | 'ai_generated';
export type ReadingStage = 'preview' | 'cold-test' | 'reading' | 'comprehension' | 'support' | 'reread' | 'whole-text' | 'closing' | 'completed';
export type ReadingSessionState = 'created' | 'active' | 'paused' | 'completed' | 'abandoned';
export type TranslationDependenceGrade = 'A' | 'B' | 'C' | 'D' | 'E';
export type ReadingProblemType = 'vocabulary' | 'main-structure' | 'subordinate-clause' | 'non-finite-verb' | 'reference' | 'logic' | 'other';
export type ReadingEvidenceType = 'cold-baseline' | 'independent-comprehension' | 'assisted-comprehension' | 'vocabulary-obstacle' | 'grammar-obstacle' | 'main-idea' | 'detail' | 'inference' | 'translation-dependence' | 'reread-result';
export type ReadingEvidenceSource = 'self_reported' | 'task_behaviour' | 'verified_item' | 'system_inferred';
export type ReadingEvidenceConfidence = 'low' | 'medium' | 'high';
export interface ReadingParagraph {
    index: number;
    text: string;
    start: number;
    end: number;
    wordCount: number;
}
export interface ReadingSentence {
    index: number;
    paragraphIndex: number;
    text: string;
    start: number;
    end: number;
    wordCount: number;
}
export interface ReadingToken {
    index: number;
    paragraphIndex: number;
    sentenceIndex: number;
    surface: string;
    normalized: string;
    lemma: string | null;
    start: number;
    end: number;
}
export interface ReadingChunk {
    index: number;
    paragraphIndexes: number[];
    sentenceIndexes: number[];
    text: string;
    start: number;
    end: number;
    wordCount: number;
}
export interface ReadingMark {
    id: string;
    passageId: string;
    sessionId: string;
    paragraphIndex: number;
    sentenceIndex: number;
    tokenIndex: number;
    surface: string;
    normalized: string;
    lemma: string | null;
    judgment: ExposureState;
    contextSentence: string;
    at: number;
    revokedAt?: number;
}
export interface DifficultSentence {
    id: string;
    passageId: string;
    sessionId: string;
    paragraphIndex: number;
    sentenceIndex: number;
    text: string;
    start: number;
    end: number;
    problemTypes: ReadingProblemType[];
    contextBefore: string;
    contextAfter: string;
    structureProvenance: SentenceStructureProvenance;
    labAttemptId?: string;
    at: number;
}
export interface ReadingHelpRecord {
    id: string;
    type: 'vocabulary' | 'grammar-card' | 'sentence-structure' | 'main-idea-hint' | 'background';
    level: 0 | 1 | 2 | 3 | 4;
    concept: string | null;
    stage: ReadingStage;
    at: number;
}
export interface ReadingComprehensionRecord {
    id: string;
    stage: 'cold-test' | 'paragraph' | 'reread' | 'whole-text';
    kind: 'self-report' | 'main-idea' | 'verified-item';
    prompt: string;
    answer: string;
    language: 'zh' | 'en' | 'mixed';
    score: number | null;
    scoredBy: 'none' | 'self' | 'verified-key';
    assisted: boolean;
    translationDependence: TranslationDependenceGrade | null;
    at: number;
}
export interface ReadingEvidence {
    id: string;
    type: ReadingEvidenceType;
    passageId: string;
    sessionId: string;
    source: ReadingEvidenceSource;
    confidence: ReadingEvidenceConfidence;
    value: number | string | boolean | null;
    key: string;
    at: number;
    metadata: Record<string, string | number | boolean>;
}
export interface ReadingOutputRecord {
    id: string;
    kind: 'one-sentence' | 'short-summary' | 'personal-note';
    text: string;
    language: 'zh' | 'en' | 'mixed';
    submittedAt: number;
    scored: boolean;
    feedback: string;
}
export interface ReadingSessionDetail {
    stage: ReadingStage;
    state: ReadingSessionState;
    passageTitle: string;
    chunks: ReadingChunk[];
    chunkIndex: number;
    paragraphIndex: number;
    coldTestDone: boolean;
    firstPassStartedAt: number | null;
    firstPassEndedAt: number | null;
    rereadStartedAt: number | null;
    rereadEndedAt: number | null;
    helps: ReadingHelpRecord[];
    marks: ReadingMark[];
    difficultSentences: DifficultSentence[];
    comprehension: ReadingComprehensionRecord[];
    evidence: ReadingEvidence[];
    output: ReadingOutputRecord[];
    notes: string;
}
export interface ReadingDifficultyReport {
    difficulty: number;
    knownCoverage: number;
    estimatedUnknownRate: number;
    uncertainRate: number;
    noEvidenceRate: number;
    estimatedMinutes: number;
    confidence: 'low' | 'medium' | 'high';
    reasons: string[];
    classification: 'comfort' | 'growth' | 'stretch' | 'too-hard';
}
