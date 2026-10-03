// —— FSRS 调度适配层（Phase 2；基于 ts-fsrs@5.4.2，MIT）——
// 业务层只能通过本模块使用 FSRS；ts-fsrs API 不散落到 UI 或其它模块。
// 设计依据：REFERENCE_RESEARCH.md §1.1；Rating 映射规则见 decideRating()（集中配置、可测试）。
import { createEmptyCard, fsrs, generatorParameters, Rating, State } from 'ts-fsrs';
import type { Card, Grade } from 'ts-fsrs';
import type { Direction, FSRSWordState, Settings, Word } from './types.ts';
export const FSRS_CONFIG = {
    maximumInterval: 36500,
    enableFuzz: false, // 确定性：测试/对照可复现；如需随机分散（Anki fuzz），后续阶段评估
    enableShortTerm: true, // 学习步（ts-fsrs 默认 [1m, 10m]）——替代旧调度器“错误重置 10 分钟”的短间隔作用
} as const;
type SchedSettings = Pick<Settings, 'requestRetention'>;
export function makeScheduler(settings: SchedSettings) {
    return fsrs(generatorParameters({ request_retention: settings.requestRetention, maximum_interval: FSRS_CONFIG.maximumInterval, enable_fuzz: FSRS_CONFIG.enableFuzz, enable_short_term: FSRS_CONFIG.enableShortTerm }));
}
export function hasFsrsHistory(s: FSRSWordState | undefined | null): boolean {
    return !!s && s.reps > 0;
}
// FSRSWordState（毫秒时间戳）↔ ts-fsrs Card（Date）互转
function toCard(state: FSRSWordState | undefined, now: number): Card {
    if (!hasFsrsHistory(state))
        return createEmptyCard(new Date(now));
    const s = state!;
    return { due: new Date(s.due), stability: s.stability, difficulty: s.difficulty, elapsed_days: 0, scheduled_days: s.scheduledDays, learning_steps: s.learningSteps, reps: s.reps, lapses: s.lapses, state: s.state as State, last_review: s.lastReview ? new Date(s.lastReview) : undefined };
}
export function fromCard(c: Card): FSRSWordState {
    return { stability: c.stability, difficulty: c.difficulty, state: c.state as number, reps: c.reps, lapses: c.lapses, due: c.due.getTime(), lastReview: c.last_review ? c.last_review.getTime() : 0, scheduledDays: c.scheduled_days, learningSteps: c.learning_steps };
}
// —— 反应证据 → FSRS Rating：多因素映射（禁止单因素 Easy）——
// 规则（集中配置，可后续个性化）：
//   1) 错误 / 超时            → Again
//   2) 正确但明显困难（>normalMs） → Hard
//   3) 第一次正式 Recall 的正确   → 至多 Good（防止短期记忆快 → 高估长期记忆）
//   4) Easy 需同时满足：本次秒答 + 连续正确≥easyMinStreak + 间隔证据（旧调度 spacedPasses≥easyMinSpaced 或 FSRS reps≥easyMinReps）
//   5) 其余正确              → Good
export interface RatingConfig {
    fastMs: number;
    normalMs: number;
    timeoutMs: number;
    easyMinStreak: number;
    easyMinSpaced: number;
    easyMinReps: number;
}
export const DEFAULT_RATING_CONFIG: RatingConfig = { fastMs: 1500, normalMs: 3000, timeoutMs: 6000, easyMinStreak: 4, easyMinSpaced: 2, easyMinReps: 2 };
export function ratingConfigFromSettings(s: Pick<Settings, 'fast' | 'normal' | 'timeout'>): RatingConfig {
    return { ...DEFAULT_RATING_CONFIG, fastMs: s.fast, normalMs: s.normal, timeoutMs: s.timeout };
}
export interface RatingInput {
    correct: boolean;
    ms: number;
    direction: Direction;
    firstRecall: boolean; // 该词第一次正式 Recall（作答前 state.total === 0）
    streakBefore: number; // 作答前的连续正确
    spacedPasses: number; // 旧调度器的跨间隔证据
    fsrsReps: number; // FSRS 复习次数
    lapses: number; // 遗忘次数（旧调度器）
    config: RatingConfig;
}
export interface RatingDecision {
    rating: Grade;
    reasons: string[];
}
export function decideRating(i: RatingInput): RatingDecision {
    if (!i.correct || i.ms >= i.config.timeoutMs)
        return { rating: Rating.Again, reasons: [i.correct ? 'timeout' : 'incorrect'] };
    if (i.ms > i.config.normalMs)
        return { rating: Rating.Hard, reasons: ['slow-correct'] };
    if (i.firstRecall)
        return { rating: Rating.Good, reasons: ['first-recall-no-easy'] };
    const fast = i.ms <= i.config.fastMs;
    const stable = i.streakBefore >= i.config.easyMinStreak && (i.spacedPasses >= i.config.easyMinSpaced || i.fsrsReps >= i.config.easyMinReps);
    if (fast && stable)
        return { rating: Rating.Easy, reasons: ['fast-stable-history'] };
    return { rating: Rating.Good, reasons: [fast ? 'fast-thin-history' : 'normal-correct'] };
}
export interface FSRSOutcome {
    state: FSRSWordState;
    rating: Grade;
}
export function applyFsrsReview(previous: FSRSWordState | undefined, grade: Grade, settings: SchedSettings, now: number): FSRSOutcome {
    const scheduler = makeScheduler(settings);
    const { card } = scheduler.next(toCard(previous, now), new Date(now), grade);
    return { state: fromCard(card), rating: grade };
}
export function fsrsRetrievability(previous: FSRSWordState | undefined, settings: SchedSettings, now = Date.now()): number | null {
    if (!hasFsrsHistory(previous))
        return null;
    return makeScheduler(settings).get_retrievability(toCard(previous, now), new Date(now), false) as number;
}
// 有效到期时间：FSRS 生效但该词暂无 FSRS 历史时回退旧调度器的 due（平滑切换）
export function effectiveDue(w: Word, authority: 'legacy' | 'fsrs'): number {
    return authority === 'fsrs' && hasFsrsHistory(w.fsrs) ? w.fsrs.due : w.schedule.due;
}
export { Rating };
