import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import type { Data, OutputAttempt, ReadingSession, Word } from '../src/types.ts';
import { emptyData } from '../src/db.ts';
import { DAY_MS, compareMetric, percent, quantile, metric, rateMetric, recentRange, } from '../src/diagnosticsModel.ts';
import { collectDiagnostics, retentionReport } from '../src/diagnosticsCollect.ts';
import { buildDiagnostics, weekStart } from '../src/diagnosticsInsight.ts';
import { buildSnapshotRecord, buildWeeklyRecord } from '../src/diagnosticsActions.ts';
const NOW = new Date('2026-10-22T12:00:00+08:00').getTime();
function word(id: string, opts: Partial<Word> = {}): Word {
    return {
        id, bookId: 'b', en: id, zh: id, pos: '', phonetic: '', example: '', collocation: '', difficulty: '', tags: '', order: 0,
        state: { total: 0, correct: 0, streak: 0, errors: 0, lapses: 0, meanMs: 0, lastMs: 0, lastCorrect: false, level: 'new', directions: { 'en-zh': { total: 0, correct: 0, meanMs: 0 }, 'zh-en': { total: 0, correct: 0, meanMs: 0 } } },
        schedule: { due: 0, last: 0, interval: 0, step: 0, spacedPasses: 0 },
        confusions: {}, recognitionScore: 0, activeRecallScore: 0, productiveScore: 0,
        exposureCount: 0, contextExposureCount: 0, productionEvidence: 0, previewedAt: 0, lastEncounteredAt: 0,
        sourceTypes: [], fsrs: { stability: 0, difficulty: 0, state: 0, reps: 0, lapses: 0, due: 0, lastReview: 0, scheduledDays: 0, learningSteps: 0 }, previewResult: '',
        ...opts,
    };
}
function review(id: string, wordId: string, at: number, correct = true) {
    return { id, wordId, sessionId: 's', at, direction: 'en-zh' as const, correct, ms: 1200, selectedId: null, reason: 'answer' as const, before: 'new' as const, after: 'normal' as const, scheduled: true };
}
function session(id: string, at: number, marks: number, unknown: number): ReadingSession {
    return {
        id, passageId: 'p', wordCount: 300, durationMs: 5 * 60000, unknownWords: [], vagueWords: [], unknownRate: 0,
        firstPassComprehension: 60, secondPassComprehension: null, readingSpeed: 60, structureErrors: 0, translationDependence: 0, summary: '', stage: 0, at,
        detail: {
            stage: 'reading', state: 'completed', passageTitle: 't', chunks: [], chunkIndex: 0, paragraphIndex: 0,
            coldTestDone: true, firstPassStartedAt: at, firstPassEndedAt: at + 1000, rereadStartedAt: null, rereadEndedAt: null,
            helps: [], marks: Array.from({ length: marks }, (_, i) => ({ id: `m${i}`, passageId: 'p', sessionId: id, paragraphIndex: 0, sentenceIndex: 0, tokenIndex: i, surface: 'w', normalized: 'w', lemma: 'w', judgment: i < unknown ? 'unknown' : 'known' as const, contextSentence: '', at })),
            difficultSentences: [], comprehension: [], evidence: [], output: [], notes: '',
        },
    };
}
function output(id: string, at: number, evidence: OutputAttempt['productiveEvidence']): OutputAttempt {
    return {
        id, prompt: 'p', sourceType: 'free', sourceId: '', originalText: 'I wrote this.', meaningEvidence: null, grammarEvidence: null,
        vocabularyEvidence: null, coherenceEvidence: null, repairAbility: null, corrections: [], upgradeSuggestion: '', wordCount: 3, aiEval: null,
        createdAt: at, completedAt: at, finalText: 'I wrote this.', supportLevel: 0, productiveEvidence: evidence,
    };
}
test('percent/quantile 的边界：分母 0 与 NaN 都不伪造数值', () => {
    assert.equal(percent(1, 0), null);
    assert.equal(percent(NaN, 3), null);
    assert.equal(percent(5, 4), 1);
    assert.equal(quantile([], 0.5), null);
    assert.equal(quantile([3, 1, 2], 0.5), 2);
});
test('指标样本不足时 value=null 且说明原因；NaN 不落库', () => {
    const low = rateMetric({ id: 'x', domain: 'reading', label: 'x', numerator: 1, denominator: 2, sample: 2, quality: 'self-report', definition: 'd' });
    assert.equal(low.value, null);
    assert.equal(low.evaluability, 'insufficient');
    assert.ok(low.reasons.length > 0);
    const bad = metric({ id: 'y', domain: 'vocabulary', label: 'y', kind: 'index', value: NaN, sample: 10, definition: 'd' });
    assert.equal(bad.value, null);
});
test('窗口长度不同或一侧证据不足时不可比较', () => {
    const a = rateMetric({ id: 'r', domain: 'reading', label: 'r', numerator: 7, denominator: 10, sample: 10, quality: 'task-behavior', definition: 'd' });
    const b = rateMetric({ id: 'r', domain: 'reading', label: 'r', numerator: 5, denominator: 10, sample: 10, quality: 'task-behavior', definition: 'd' });
    assert.equal(compareMetric(a, b, 7, 7)?.comparable, true);
    assert.equal(compareMetric(a, b, 7, 14)?.comparable, false);
    const weak = rateMetric({ id: 'r', domain: 'reading', label: 'r', numerator: 1, denominator: 2, sample: 2, quality: 'task-behavior', definition: 'd' });
    assert.equal(compareMetric(a, weak, 7, 7)?.comparable, false);
    assert.equal(compareMetric(a, undefined, 7, 7), null);
});
test('D1/D7/D30 只认恰好落在第 N 个 24h 窗口的复习，不补算', () => {
    const d = emptyData();
    const start = NOW - 40 * DAY_MS;
    d.words.push(word('w1'), word('w2'));
    d.wordExposures.push({ id: 'x1', wordId: 'w1', at: start, sourceType: 'reading', sourceId: 's', state: 'unknown', sentence: '', counted: true }, { id: 'x2', wordId: 'w2', at: start, sourceType: 'reading', sourceId: 's', state: 'unknown', sentence: '', counted: true });
    d.records.push(review('r1', 'w1', start + 1 * DAY_MS + 1000, true), review('r2', 'w1', start + 2 * DAY_MS, false), review('r3', 'w2', start + 7 * DAY_MS + 1000, true), review('r4', 'w2', start + 30 * DAY_MS + 1000, true));
    const rep = retentionReport(d);
    assert.equal(rep.points.find(p => p.label === 'D1')!.total, 1);
    assert.equal(rep.points.find(p => p.label === 'D7')!.total, 1);
    assert.equal(rep.points.find(p => p.label === 'D30')!.total, 1);
    assert.equal(rep.points.find(p => p.label === 'D1')!.rate, null, '样本 < 5 不计算');
});
test('阅读未知词率只认显式标记；没有标记时不可评估', () => {
    const range = recentRange(NOW, 7);
    const d = emptyData();
    assert.equal(collectDiagnostics(d, range).metrics.find(m => m.id === 'reading.unknownRate')!.value, null);
    d.readingSessions.push(session('s1', NOW - DAY_MS, 10, 3));
    const m = collectDiagnostics(d, range).metrics.find(x => x.id === 'reading.unknownRate')!;
    assert.equal(m.evaluability, 'evaluable');
    assert.equal(m.value, 0.3);
});
test('旧版/不完整阅读会话缺少 marks/comprehension 时诊断不崩溃', () => {
    const range = recentRange(NOW, 7);
    const d = emptyData();
    d.readingSessions.push({ ...session('s1', NOW - DAY_MS, 0, 0), detail: { stage: 'reading', state: 'completed', at: NOW - DAY_MS } } as unknown as ReadingSession);
    assert.doesNotThrow(() => collectDiagnostics(d, range));
});
test('没有标记的阅读会话不会产生 0% 未知词率的假结论', () => {
    const range = recentRange(NOW, 7);
    const d = emptyData();
    d.readingSessions.push(session('s1', NOW - DAY_MS, 0, 0));
    const m = collectDiagnostics(d, range).metrics.find(x => x.id === 'reading.unknownRate')!;
    assert.equal(m.value, null);
    assert.equal(m.evaluability, 'insufficient');
});
test('产出证据排除照抄，独立占比正确', () => {
    const range = recentRange(NOW, 7);
    const d = emptyData();
    d.outputAttempts.push(output('o1', NOW - DAY_MS, [
        ...Array.from({ length: 5 }, (_, i) => ({ id: `e${i}`, wordId: 'w', outputAttemptId: 'o1', textSpan: 'wrote', context: '', independent: true, assisted: false, copied: false, correctness: 'correct' as const, confidence: 0.6, evidenceSource: 'output_independent' as const, at: NOW - DAY_MS })),
        ...Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, wordId: 'w', outputAttemptId: 'o1', textSpan: 'this', context: '', independent: true, assisted: false, copied: true, correctness: 'correct' as const, confidence: 0.6, evidenceSource: 'output_copied' as const, at: NOW - DAY_MS })),
    ]));
    const m = collectDiagnostics(d, range).metrics.find(x => x.id === 'output.independentShare')!;
    assert.equal(m.numerator, 5);
    assert.equal(m.denominator, 10);
    assert.equal(m.value, 0.5);
});
test('证据不足时不给短板；D7 低且样本达标才给词汇保持短板', () => {
    const range = recentRange(NOW, 7);
    const d = emptyData();
    const payload = buildDiagnostics(d, { now: NOW });
    assert.equal(payload.bottleneck, null);
    // 5 个词在首次出现后第 7 天全部答错
    for (let i = 0; i < 5; i++)
        d.words.push(word(`w${i}`));
    for (let i = 0; i < 5; i++) {
        const start = NOW - 10 * DAY_MS;
        d.wordExposures.push({ id: `x${i}`, wordId: `w${i}`, at: start, sourceType: 'reading', sourceId: 's', state: 'unknown', sentence: '', counted: true });
        d.records.push(review(`r${i}`, `w${i}`, start + 7 * DAY_MS + 1000, false));
    }
    const payload2 = buildDiagnostics(d, { now: NOW });
    assert.ok(payload2.bottleneck);
    assert.equal(payload2.bottleneck!.domain, 'vocabulary');
    assert.ok(payload2.bottleneck!.metricIds.includes('vocab.retention.d7'));
    assert.equal(collectDiagnostics(d, range).metrics.find(m => m.id === 'vocab.retention.d7')!.value, 0);
});
test('快照同日幂等；周诊断固定在周一且不产生总分', () => {
    const d = emptyData();
    const a = buildSnapshotRecord(d, NOW, 7);
    const b = buildSnapshotRecord({ ...d, skillSnapshots: [a] }, NOW + 3600000, 7);
    assert.equal(a.id, b.id);
    assert.equal(a.date, '2026-10-22');
    const week = buildWeeklyRecord(d, NOW, 7);
    assert.equal(week.id, `week-${week.weekOf}`);
    assert.equal(week.weekOf, '2026-10-19');
    assert.equal((week.diagnostics as {
        score?: number;
    }).score, undefined);
    assert.ok(week.summary.includes('证据') || week.summary.includes('处理'));
    assert.equal(new Date(weekStart(NOW)).getDay(), 1);
});
test('fast-check：比率永不超过 1，样本不足永不生成数值', () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 10000 }), fc.integer({ min: 0, max: 10000 }), (n, d) => {
        const r = percent(n, d);
        assert.ok(r === null || (r >= 0 && r <= 1));
        const m = rateMetric({ id: 'x', domain: 'reading', label: 'x', numerator: n, denominator: d, sample: Math.min(n, d), quality: 'task-behavior', definition: 'd' });
        if (m.sample < 5 && m.value !== null)
            assert.fail('样本不足却给出数值');
    }), { numRuns: 300, seed: 20261022 });
});
test('fast-check：分位数单调且不越界', () => {
    fc.assert(fc.property(fc.array(fc.double({ min: -1000, max: 1000, noNaN: true }), { minLength: 1, maxLength: 40 }), xs => {
        const sorted = [...xs].sort((a, b) => a - b);
        const q = [0.1, 0.5, 0.9].map(x => quantile(xs, x)!);
        assert.ok(q[0] <= q[1] && q[1] <= q[2]);
        assert.ok(q[0] >= sorted[0] && q[2] <= sorted[sorted.length - 1]);
    }), { numRuns: 300, seed: 20261022 });
});
