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
export type SentenceStructureProvenance = 'gold' | 'heuristic' | 'manual' | 'none';
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
    sourceType: 'import' | 'ai' | 'recommended' | 'url' | 'image';
    sourceUrl: string;
    topic: string;
    wordCount: number;
    difficulty: string;
    createdAt: number;
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
    mode: 'light' | 'standard' | 'deep';
    createdAt: number;
}
export interface OutputCorrection {
    from: string;
    to: string;
    note: string;
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
}
export interface WeeklyDiagnostic {
    id: string;
    weekOf: string;
    results: unknown;
    summary: string;
    createdAt: number;
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
