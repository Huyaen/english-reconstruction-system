import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { makeWord } from '../src/core.ts';
import { emptyData } from '../src/db.ts';
import { observedRetentionReport } from '../src/diagnosticsRetention.ts';
import type { ClozeAttempt, Data, ReviewRecord, SpellingAttempt } from '../src/types.ts';

const date = (offset: number, hour = 12) => new Date(2026, 11, 29 + offset, hour).getTime();
const now = date(40);

function data(ids = ['w']): Data {
    return { ...emptyData(), words: ids.map((id, order) => ({
        ...makeWord({ en: 'impact', zh: '影响' }, 'b', order), id,
        previewedAt: date(-90), lastEncounteredAt: date(-1), exposureCount: 10,
    })) };
}
function choice(d: Data, wordId: string, id: string, at: number, extra: Partial<ReviewRecord> = {}): ReviewRecord {
    const record: ReviewRecord = {
        id, wordId, sessionId: id, at, direction: 'en-zh', correct: true, ms: 100,
        selectedId: wordId, reason: 'answer', before: 'new', after: 'normal', scheduled: false, ...extra,
    };
    if (!d.sessions.some(s => s.id === record.sessionId))
        d.sessions.push({ id: record.sessionId, mode: 'quick', started: at - 100, ended: at, queue: [wordId],
            index: 1, answered: 1, correct: Number(record.correct), retries: {}, question: null });
    d.records.push(record);
    return record;
}
function spelling(wordId: string, id: string, at: number, extra: Partial<SpellingAttempt> = {}): SpellingAttempt {
    return { id, wordId, sessionId: id, at, input: 'impact', expected: 'impact', correct: true, ms: 100,
        assisted: false, retry: false, normalizationVersion: 1, ...extra };
}
function cloze(wordId: string, id: string, at: number, extra: Partial<ClozeAttempt> = {}): ClozeAttempt {
    return { ...spelling(wordId, id, at), passageId: 'removed-passage', readingSessionId: 'removed-reading',
        markId: 'removed-mark', sentence: 'It had an impact.', start: 10, end: 16, lemma: 'impact', sentenceIndex: 0,
        markedAt: date(-10), source: 'saved-reading', sourceType: 'import', sourceTitle: 'Source', sourceUrl: '', ...extra };
}
function point(d: Data, label: 'D1' | 'D7' | 'D30', mode: 'recognition' | 'spelling' | 'cloze' = 'recognition', asOf = now) {
    return observedRetentionReport(d, asOf).points.find(p => p.label === label && p.mode === mode)!;
}

test('local calendar windows cross year and month, exclude outside days, and select the earliest eligible outcome', () => {
    const d = data();
    choice(d, 'w', 'learn', date(0, 23));
    choice(d, 'w', 'same-day', date(0, 23) + 10);
    choice(d, 'w', 'next-day', date(1, 0), { direction: 'zh-en' });
    choice(d, 'w', 'day-2', date(2));
    choice(d, 'w', 'day-5', date(5));
    choice(d, 'w', 'day-6', date(6), { correct: false, selectedId: null, reason: 'unknown' });
    choice(d, 'w', 'day-8', date(8));
    choice(d, 'w', 'day-9', date(9));
    choice(d, 'w', 'day-26', date(26));
    choice(d, 'w', 'day-27', date(27));
    choice(d, 'w', 'day-33', date(33));
    choice(d, 'w', 'day-34', date(34));
    assert.deepEqual((['D1', 'D7', 'D30'] as const).map(label => {
        const p = point(d, label);
        return [p.validAttempts, p.denominator, p.correct, p.rate];
    }), [[1, 1, 1, null], [2, 1, 0, null], [2, 1, 1, null]]);
});

test('only attempted words enter the denominator, with rate withheld below five unique words', () => {
    const d = data(['a', 'b', 'c', 'd', 'e', 'untested', 'preview-only', 'too-recent']);
    for (const id of ['a', 'b', 'c', 'd', 'e', 'untested'])
        choice(d, id, 'learn-' + id, date(0));
    choice(d, 'too-recent', 'late-anchor', now - 1);
    for (const id of ['a', 'b', 'c', 'd'])
        choice(d, id, 'test-' + id, date(1));
    choice(d, 'a', 'extra-session', date(1, 13));
    assert.deepEqual(point(d, 'D1'), {
        label: 'D1', mode: 'recognition', fromDay: 1, toDay: 1, correct: 4,
        denominator: 4, validAttempts: 5, uniqueWords: 4, eligibleWords: 6, minSample: 5, rate: null, evaluable: false,
    });
    choice(d, 'e', 'test-e', date(1), { correct: false, selectedId: null, reason: 'unknown' });
    assert.equal(point(d, 'D1').rate, 0.8);
    assert.equal(point(d, 'D1').denominator, 5);
    assert.equal(point(d, 'D1', 'spelling').rate, null);
});

test('the earliest credible attempt anchors all modes, independent spelling and saved reading stay separate', () => {
    const d = data();
    choice(d, 'w', 'later-recognition', date(1));
    choice(d, 'w', 'independent-anchor', date(0));
    d.spellingAttempts.push(spelling('w', 'assisted-earlier', date(-6), { assisted: true }));
    d.spellingAttempts.push(spelling('w', 'spelling-wrong', date(1), { input: 'wrong', correct: false }));
    d.clozeAttempts.push(cloze('w', 'context-right', date(1)));
    assert.equal(point(d, 'D1').correct, 1);
    assert.equal(point(d, 'D1', 'spelling').denominator, 1);
    assert.equal(point(d, 'D1', 'spelling').correct, 0);
    assert.equal(point(d, 'D1', 'cloze').correct, 1);
    assert.equal(point(d, 'D7', 'cloze').rate, null);
});

test('earlier timeout and assisted attempts suppress later retries in that session', () => {
    const d = data(['w', 'v']);
    choice(d, 'w', 'learn', date(0));
    choice(d, 'w', 'timeout', date(1), { correct: false, reason: 'timeout', selectedId: null });
    choice(d, 'w', 'retry-after-timeout', date(1, 13), { sessionId: 'timeout', direction: 'zh-en' });
    choice(d, 'v', 'timeout-anchor', date(-6), { correct: false, reason: 'timeout', selectedId: null });
    choice(d, 'v', 'v-learn', date(0));
    choice(d, 'v', 'v-choice', date(1));
    d.spellingAttempts.push(spelling('w', 'assist', date(1), { assisted: true }));
    d.spellingAttempts.push(spelling('w', 'second', date(1, 13), { sessionId: 'assist' }));
    d.spellingAttempts.push(spelling('w', 'explicit-retry', date(1), { retry: true }));
    d.clozeAttempts.push(cloze('w', 'initial', date(0, 18), { assisted: true }));
    d.clozeAttempts.push(cloze('w', 'tomorrow', date(1), { sessionId: 'initial' }));
    assert.equal(point(d, 'D1').denominator, 1);
    assert.equal(point(d, 'D1').correct, 1);
    assert.equal(point(d, 'D7').denominator, 0);
    assert.equal(point(d, 'D1', 'spelling').denominator, 0);
    assert.equal(point(d, 'D1', 'cloze').denominator, 0);
});

test('invalid, orphan, future, duplicate and generated evidence cannot add observations or set an earlier anchor', () => {
    const d = data();
    d.wordExposures.push({
        id: 'read-exposure', wordId: 'w', at: date(-6), sourceType: 'reading', sourceId: 'reading',
        state: 'unknown', sentence: 'It had an impact.', counted: true,
    });
    for (const mode of ['preview', 'audio']) {
        const nonAnswer = choice(d, 'w', mode, date(-6));
        d.sessions.find(s => s.id === nonAnswer.sessionId)!.mode = mode;
    }
    const first = choice(d, 'w', 'learn', date(0));
    d.records.push({ ...first, id: 'orphan-session', sessionId: 'missing', at: date(-6) });
    d.records.push({ ...first, id: 'orphan-word', wordId: 'missing', at: date(1) });
    d.records.push({ ...first, id: 'invalid-date', at: Number.NaN });
    d.records.push({ ...first, id: 'invalid-mode', direction: 'bad' as ReviewRecord['direction'], at: date(-6) });
    const observed = choice(d, 'w', 'test', date(1), { correct: false, selectedId: null });
    d.records.push({ ...observed });
    const conflict = choice(d, 'w', 'conflict', date(1, 10));
    d.records.push({ ...conflict, at: date(1, 11) });
    choice(d, 'w', 'future', date(7, 18));
    d.spellingAttempts.push(spelling('w', 'unanswered', date(-6), { input: '', correct: false }));
    d.spellingAttempts.push(spelling('w', 'missing-assisted', date(1), { assisted: undefined as unknown as boolean }));
    d.spellingAttempts.push(spelling('w', 'wrong-score', date(1), { input: 'wrong' }));
    d.clozeAttempts.push(cloze('w', 'generated', date(-6), { sourceType: 'ai' }));
    d.clozeAttempts.push(cloze('w', 'bad-position', date(1), { start: 0 }));
    d.clozeAttempts.push(cloze('w', 'future-mark', date(1), { markedAt: date(2) }));
    assert.equal(point(d, 'D1').validAttempts, 1);
    assert.equal(point(d, 'D1').correct, 0);
    assert.equal(point(d, 'D7', 'recognition', date(7)).denominator, 0);
    assert.equal(point(d, 'D1', 'spelling').denominator, 0);
    assert.equal(point(d, 'D1', 'cloze').denominator, 0);
});

test('the same local calendar gap is retained through DST in New York and a month boundary within a single UTC day in Taipei', () => {
    const prior = process.env.TZ;
    try {
        for (const [zone, y, m, day, hour, elapsed] of [
            ['America/New_York', 2026, 2, 7, 23, 23],
            ['America/New_York', 2026, 9, 31, 23, 25],
            ['Asia/Taipei', 2026, 0, 31, 23, 1],
        ] as const) {
            process.env.TZ = zone;
            const d = data();
            const start = new Date(y, m, day, hour).getTime();
            const end = new Date(y, m, day + 1, zone === 'Asia/Taipei' ? 0 : hour).getTime();
            assert.equal((end - start) / 3_600_000, elapsed);
            choice(d, 'w', 'anchor', start);
            choice(d, 'w', 'followup', end);
            assert.equal(point(d, 'D1', 'recognition', end).denominator, 1);
        }
    }
    finally {
        if (prior === undefined) delete process.env.TZ;
        else process.env.TZ = prior;
    }
});

test('aggregation is invariant to evidence order and exact duplicates and does not mutate records', () => {
    fc.assert(fc.property(fc.array(fc.array(fc.boolean(), { maxLength: 10 }), { maxLength: 15 }), outcomes => {
        const d = data(outcomes.map((_, i) => 'w' + i));
        outcomes.forEach((answers, i) => {
            const word = 'w' + i;
            choice(d, word, 'anchor-' + word, date(0));
            answers.forEach((correct, j) => choice(d, word, word + '-' + j, date(1) + j, {
                correct, selectedId: correct ? word : null,
            }));
        });
        const previous = structuredClone(d);
        const p = point(d, 'D1');
        assert.equal(p.validAttempts, outcomes.flat().length);
        assert.equal(p.denominator, outcomes.filter(answers => answers.length).length);
        assert.equal(p.correct, outcomes.filter(answers => answers[0] === true).length);
        assert.deepEqual(d, previous);
        const result = observedRetentionReport(d, now);
        const reordered = { ...d, sessions: [...d.sessions].reverse(), records: [...d.records, ...d.records].reverse() };
        assert.deepEqual(observedRetentionReport(reordered, now), result);
    }), { numRuns: 80, seed: 42 });
});

test('4,716 words and more than 50,000 attempts aggregate without rescanning the corpus per word', () => {
    const d = data(Array.from({ length: 4716 }, (_, i) => 'w' + i));
    for (const word of d.words) {
        d.spellingAttempts.push(spelling(word.id, 'anchor-' + word.id, date(0)));
        for (let i = 0; i < 10; i++)
            d.spellingAttempts.push(spelling(word.id, word.id + '-' + i, date(1) + i));
    }
    const start = performance.now();
    const p = point(d, 'D1', 'spelling');
    assert.equal(p.denominator, 4716);
    assert.equal(p.validAttempts, 47_160);
    assert.equal(p.rate, 1);
    assert.ok(performance.now() - start < 2_000, 'synthetic full-book aggregation exceeded 2s');
});
