import test from 'node:test';
import assert from 'node:assert/strict';
import { Rating } from 'ts-fsrs';
import { applyFsrsReview, decideRating, DEFAULT_RATING_CONFIG, effectiveDue, fsrsRetrievability, hasFsrsHistory } from '../src/fsrs.ts';
import { defaults, fsrsDefaults } from '../src/types.ts';
import { makeWord } from '../src/core.ts';
import { newSession, answer } from '../src/quiz.ts';
const cfg = { ...DEFAULT_RATING_CONFIG };
const base = { correct: true, ms: 900, direction: 'en-zh' as const, firstRecall: false, streakBefore: 5, spacedPasses: 3, fsrsReps: 3, lapses: 0, config: cfg };
test('rating: 错误与超时 → Again', () => {
    assert.equal(decideRating({ ...base, correct: false, ms: 500 }).rating, Rating.Again);
    assert.equal(decideRating({ ...base, ms: cfg.timeoutMs }).rating, Rating.Again);
});
test('rating: 慢速正确 → Hard', () => {
    assert.equal(decideRating({ ...base, ms: cfg.normalMs + 1 }).rating, Rating.Hard);
});
test('rating: 首次正式 Recall 正确时封顶 Good（防短期记忆高估）', () => {
    assert.equal(decideRating({ ...base, firstRecall: true, ms: 400 }).rating, Rating.Good);
});
test('rating: Easy 需要 秒答 + 连续正确 + 间隔证据（禁止单因素 Easy）', () => {
    assert.equal(decideRating({ ...base, ms: 800 }).rating, Rating.Easy);
    assert.equal(decideRating({ ...base, ms: 800, streakBefore: 2 }).rating, Rating.Good);
    assert.equal(decideRating({ ...base, ms: 800, spacedPasses: 0, fsrsReps: 0 }).rating, Rating.Good);
    assert.equal(decideRating({ ...base, ms: 1600 }).rating, Rating.Good);
});
test('fsrs adapter: 确定性、reps/lapses 与 due 生成', () => {
    const s = { requestRetention: 0.9 };
    const t0 = 1700000000000;
    assert.equal(hasFsrsHistory(fsrsDefaults), false);
    const a = applyFsrsReview(fsrsDefaults, Rating.Good, s, t0);
    const b = applyFsrsReview(fsrsDefaults, Rating.Good, s, t0);
    assert.deepEqual(a.state, b.state);
    assert.equal(hasFsrsHistory(a.state), true);
    assert.equal(a.state.reps, 1);
    assert.ok(a.state.due > t0);
    const again = applyFsrsReview(a.state, Rating.Again, s, a.state.due);
    assert.ok(again.state.due < a.state.due + 86400000);
    const easy = applyFsrsReview(fsrsDefaults, Rating.Easy, s, t0);
    assert.equal(easy.state.state, 2); // Easy 首次即毕业进入 Review
    assert.ok(easy.state.due >= a.state.due);
    const failEasy = applyFsrsReview(easy.state, Rating.Again, s, easy.state.due);
    assert.ok(failEasy.state.lapses >= 1); // Review 阶段失败 → lapses+1
    assert.equal(fsrsRetrievability(fsrsDefaults, s, t0), null);
    const r = fsrsRetrievability(a.state, s, a.state.due)!;
    assert.ok(r > 0 && r <= 1);
});
test('quiz answer 同时更新旧调度器与 FSRS（shadow）+ record.rating', () => {
    const w = makeWord({ en: 'abandon', zh: '放弃' }, 'b', 0);
    const s = newSession([w], 'quick');
    s.question = { wordId: w.id, direction: 'en-zh', options: [w.id] };
    const t = 1700000000000;
    const r = answer(s, w, w.id, 800, 'answer', defaults, t);
    assert.equal(r.record.rating, Rating.Good); // 首次 Recall 封顶 Good
    assert.equal(r.word.fsrs.reps, 1);
    assert.ok(r.word.schedule.interval > 0); // 旧调度器字段仍在更新（可回滚）
    assert.equal(r.word.recognitionScore, 20); // En→中 证据 EWMA
    assert.equal(effectiveDue(r.word, 'fsrs'), r.word.fsrs.due);
    assert.equal(effectiveDue(r.word, 'legacy'), r.word.schedule.due);
});
