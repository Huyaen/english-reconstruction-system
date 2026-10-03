import type { Word, StudySession, Settings, ReviewRecord } from './types.ts';
import { uid, review } from './core.ts';
export function newSession(words: Word[], mode: string): StudySession { return { id: uid(), started: Date.now(), ended: null, mode, queue: words.map(w => w.id), index: 0, answered: 0, correct: 0, retries: {}, question: null }; }
export function answer(s: StudySession, w: Word, selectedId: string | null, ms: number, reason: ReviewRecord['reason'], settings: Settings, now = Date.now()) {
    if (!s.question || s.question.wordId !== w.id || s.queue[s.index] !== w.id)
        throw Error('题目已提交或状态不一致');
    if (selectedId !== null && !s.question.options.includes(selectedId))
        throw Error('选项无效');
    ms = Math.max(0, Math.min(ms, settings.timeout));
    const correct = reason === 'answer' && selectedId === w.id && ms < settings.timeout;
    const updated = review(w, correct, ms, s.question.direction, settings, now);
    if (!correct && selectedId && selectedId !== w.id)
        updated.confusions[selectedId] = (updated.confusions[selectedId] || 0) + 1;
    const record: ReviewRecord = { id: uid(), wordId: w.id, sessionId: s.id, at: now, direction: s.question.direction, correct, ms, selectedId, reason, before: w.state.level, after: updated.state.level, scheduled: w.state.total > 0 && now >= w.schedule.due };
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
    return { word: updated, record, session };
}
