import type { Word, StudySession, Settings, ReviewRecord } from './types.ts';
import { uid, review } from './core.ts';
import { applyFsrsReview, decideRating, ratingConfigFromSettings } from './fsrs.ts';
import { applyRecallEvidence, qualityFromAnswer } from './evidence.ts';
export function newSession(words: Word[], mode: string): StudySession { return { id: uid(), started: Date.now(), ended: null, mode, queue: words.map(w => w.id), index: 0, answered: 0, correct: 0, retries: {}, question: null }; }
export function answer(s: StudySession, w: Word, selectedId: string | null, ms: number, reason: ReviewRecord['reason'], settings: Settings, now = Date.now()) {
    if (!s.question || s.question.wordId !== w.id || s.queue[s.index] !== w.id)
        throw Error('题目已提交或状态不一致');
    if (selectedId !== null && !s.question.options.includes(selectedId))
        throw Error('选项无效');
    ms = Math.max(0, Math.min(ms, settings.timeout));
    const correct = reason === 'answer' && selectedId === w.id && ms < settings.timeout;
    const direction = s.question.direction;
    // 多因素 Rating 映射（Phase 2.4）：correctness + responseTime + direction + 学习状态 + 首次正式 Recall + 历史证据
    const decision = decideRating({ correct, ms, direction, firstRecall: w.state.total === 0, streakBefore: w.state.streak, spacedPasses: w.schedule.spacedPasses, fsrsReps: w.fsrs?.reps ?? 0, lapses: w.state.lapses, config: ratingConfigFromSettings(settings) });
    const updated = review(w, correct, ms, direction, settings, now);
    if (!correct && selectedId && selectedId !== w.id)
        updated.confusions[selectedId] = (updated.confusions[selectedId] || 0) + 1;
    // FSRS 与旧调度器同时计算（shadow）：旧字段保留回滚能力，FSRS 状态独立存储
    updated.fsrs = applyFsrsReview(w.fsrs, decision.rating, settings, now).state;
    // 三维证据（En→中 计入 recognition；中→En 计入 activeRecall）
    const final = applyRecallEvidence(updated, direction, qualityFromAnswer(correct, ms, settings));
    const record: ReviewRecord = { id: uid(), wordId: w.id, sessionId: s.id, at: now, direction, correct, ms, selectedId, reason, before: w.state.level, after: final.state.level, scheduled: w.state.total > 0 && now >= w.schedule.due, rating: decision.rating };
    const session = structuredClone(s);
    session.index++;
    session.answered++;
    session.correct += Number(correct);
    session.question = null;
    if ((!correct || ms > settings.normal) && !session.retries[w.id]) {
        session.retries[w.id] = 1;
        session.queue.splice(Math.min(session.queue.length, session.index + 5), 0, w.id);
    }
    if (session.index >= session.queue.length)
        session.ended = now;
    return { word: final, record, session };
}
