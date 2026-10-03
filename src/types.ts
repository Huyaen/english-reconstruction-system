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
}
export const defaults: Settings = { fast: 1500, normal: 3000, timeout: 6000, ratio: 50, difficulty: 'normal', feedback: 500, theme: 'light', endpoint: '', model: '', key: '', rememberKey: false };
