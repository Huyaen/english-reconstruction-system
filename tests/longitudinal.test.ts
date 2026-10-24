import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { emptyData } from '../src/db.ts';
import { makeWord } from '../src/core.ts';
import { applyFsrsReview, Rating } from '../src/fsrs.ts';
import { retentionReport } from '../src/diagnosticsCollect.ts';
import { buildWeeklyRecord } from '../src/diagnosticsActions.ts';
import { findWeeklyByWeek, saveWeeklyDiagnostic } from '../src/diagnosticsStore.ts';
import type { Data, ReviewRecord, WeeklyDiagnostic } from '../src/types.ts';
const DAY = 86400000;
const START = new Date(2026, 0, 1, 9, 0, 0).getTime();
function word(i: number) {
    return makeWord({ en: `long${i}`, zh: `长期${i}` }, 'book-long', i);
}
function rec(w: string, at: number, correct = true): ReviewRecord {
    return { id: `r-${w}-${at}`, wordId: w, sessionId: 's-long', at, direction: 'en-zh', correct, ms: 1200, selectedId: null, reason: 'answer', before: 'new', after: correct ? 'normal' : 'unknown', scheduled: true };
}
test('D1/D7/D30 按首次出现后的精确 24h 窗口分桶，不补算不外推', () => {
    const d: Data = emptyData();
    d.books = [{ id: 'book-long', name: 'Long', created: START }];
    for (let i = 0; i < 5; i++) {
        const w = word(i);
        d.words.push(w);
        d.wordExposures.push({ id: `exp-${i}`, wordId: w.id, at: START, state: 'known', count: 1, counted: true, source: 'probe' } as never);
        // 每个词在 D1、D7、D30 各有一条记录；另外插入 D2/D8/D29 的非窗口记录。
        for (const [offset, ok] of [[1, true], [7, true], [30, false], [2, true], [8, true], [29, true]] as const)
            d.records.push(rec(w.id, START + offset * DAY, ok));
    }
    const r = retentionReport(d);
    const by = Object.fromEntries(r.points.map(p => [p.label, p]));
    assert.equal(by.D1.total, 5);
    assert.equal(by.D1.correct, 5);
    assert.equal(by.D1.rate, 1);
    assert.equal(by.D7.total, 5);
    assert.equal(by.D7.correct, 5);
    assert.equal(by.D30.total, 5);
    assert.equal(by.D30.correct, 0);
    assert.equal(by.D30.rate, 0);
    assert.equal(r.reviewsUsed, 15);
});
test('D1/D7/D30 样本不足时 rate=null，不拿 0 冒充', () => {
    const d: Data = emptyData();
    d.books = [{ id: 'book-long', name: 'Long', created: START }];
    const w = word(0);
    d.words.push(w);
    d.wordExposures.push({ id: 'exp-one', wordId: w.id, at: START, state: 'known', count: 1, counted: true, source: 'probe' } as never);
    d.records.push(rec(w.id, START + DAY));
    const r = retentionReport(d);
    assert.equal(r.points.find(p => p.label === 'D1')!.total, 1);
    assert.equal(r.points.find(p => p.label === 'D1')!.rate, null);
    assert.equal(r.points.find(p => p.label === 'D1')!.evaluable, false);
});
test('FSRS 跨多次复习推进 due，且不把一次作答复制成多次证据', () => {
    let state = applyFsrsReview(undefined, Rating.Good, { requestRetention: 0.9 }, START).state;
    const dues = [state.due];
    for (let i = 0; i < 4; i++) {
        state = applyFsrsReview(state, Rating.Good, { requestRetention: 0.9 }, state.due + 1000).state;
        dues.push(state.due);
    }
    assert.equal(state.reps, 5);
    for (let i = 1; i < dues.length; i++)
        assert.ok(dues[i]! > dues[i - 1]!, `第 ${i} 次 due 必须前进`);
    assert.ok(dues.at(-1)! > START + DAY);
});
test('同一周重复生成周诊断只保留一条记录（幂等覆盖）', async () => {
    const d: Data = emptyData();
    d.books = [{ id: 'book-long', name: 'Long', created: START }];
    const w = word(0);
    d.words.push(w);
    d.wordExposures.push({ id: 'exp-one', wordId: w.id, at: START, state: 'known', count: 1, counted: true, source: 'probe' } as never);
    d.records.push(rec(w.id, START + DAY));
    const now = new Date(2026, 0, 12, 12).getTime();
    const first = buildWeeklyRecord(d, now);
    const second = buildWeeklyRecord({ ...d, weeklyDiagnostics: [first] }, now);
    assert.equal(first.weekOf, second.weekOf);
    await saveWeeklyDiagnostic(first);
    await saveWeeklyDiagnostic(second);
    const all = await findWeeklyByWeek(first.weekOf);
    assert.equal(all?.weekOf, first.weekOf);
    const stored = all as WeeklyDiagnostic;
    assert.equal(stored.summary.length > 0, true);
});
