import test from 'node:test';
import assert from 'node:assert/strict';
import type { DailyPlan, PlanItem, ReviewRecord, Word } from '../src/types.ts';
import { curatedSentenceRecords } from '../src/sentenceSources.ts';
const SENTENCES = () => curatedSentenceRecords(1700000000000);
import { fsrsDefaults } from '../src/types.ts';
import { makeWord } from '../src/core.ts';
import { assertPlanInvariants, buildReplacement, calibrateAfterRecall, createDailyPlan, decideRecovery, evaluateRecallSession, estimateRetention, planMinutes, planProgress, regenerateRemaining, PLANNER_CONFIG, type RecallCandidate, } from '../src/planner.ts';
import { effectiveDue } from '../src/fsrs.ts';
import { isUnseen } from '../src/evidence.ts';
const NOW = new Date(2026, 9, 19, 10, 0, 0).getTime();
const DAY = 86400000;
function makeWords(count: number, prefix = 'w'): Word[] {
    return Array.from({ length: count }, (_, i) => makeWord({ en: `${prefix}${i}`, zh: `释义${i}` }, 'book-1', i));
}
function due(w: Word, now = NOW, level: Word['state']['level'] = 'vague'): Word {
    return {
        ...w,
        state: { ...w.state, total: 4, correct: 2, streak: 1, level, directions: { 'en-zh': { total: 2, correct: 1, meanMs: 2500 }, 'zh-en': { total: 2, correct: 1, meanMs: 2600 } } },
        schedule: { due: now - DAY, last: now - 3 * DAY, interval: DAY, step: 2, spacedPasses: 2 },
        fsrs: { ...fsrsDefaults, reps: 3, stability: 3, difficulty: 5, due: now - DAY, lastReview: now - 3 * DAY, scheduledDays: 3 },
    };
}
function previewed(w: Word, now = NOW): Word {
    return { ...w, previewedAt: now - DAY, previewResult: 'familiar', exposureCount: 1 };
}
function record(wordId: string, at: number, correct: boolean, sessionId = 'sess', direction: ReviewRecord['direction'] = 'en-zh', ms = 2000, rating = 3): ReviewRecord {
    return { id: `${wordId}-${at}-${sessionId}`, wordId, sessionId, at, direction, correct, ms, selectedId: wordId, reason: 'answer', before: 'vague', after: correct ? 'normal' : 'unknown', scheduled: true, rating };
}
function yesterdayRecords(words: Word[], now = NOW): ReviewRecord[] {
    return words.map((w, i) => record(w.id, now - DAY + 3600000 + i * 60000, i % 4 !== 3, 'yesterday-session'));
}
// —— 时间预算 ——
test('预算 20/30/45/60/自定义：计划时长永不超出预算', () => {
    const words = [...makeWords(40).map(w => due(w)), ...makeWords(30, 'n')];
    for (const minutes of [20, 30, 45, 60, 37]) {
        const { plan, budget } = createDailyPlan({ now: NOW, availableMinutes: minutes, energy: 'normal', words, records: [] });
        assert.equal(plan.availableMinutes, minutes);
        assert.ok(planMinutes(plan) <= minutes, `${minutes} 分钟计划溢出：${planMinutes(plan)}`);
        assert.equal(budget.planned, planMinutes(plan));
        assertPlanInvariants(plan);
    }
});
test('预算：非法与极端值被拒绝或钳制', () => {
    const words = makeWords(6);
    assert.throws(() => createDailyPlan({ now: NOW, availableMinutes: Number.NaN, energy: 'normal', words, records: [] }));
    assert.throws(() => createDailyPlan({ now: NOW, availableMinutes: 0, energy: 'normal', words, records: [] }));
    assert.throws(() => createDailyPlan({ now: NOW, availableMinutes: -30, energy: 'normal', words, records: [] }));
    const huge = createDailyPlan({ now: NOW, availableMinutes: 5000, energy: 'normal', words, records: [] });
    assert.equal(huge.plan.availableMinutes, PLANNER_CONFIG.budget.max);
    const tiny = createDailyPlan({ now: NOW, availableMinutes: 5, energy: 'normal', words, records: [] });
    assert.ok(planMinutes(tiny.plan) <= 5);
    assert.ok(tiny.plan.initialPlan.some(t => t.kind === 'closing-recall'));
});
test('时间预算包含 Recall / Closing（不额外隐形占用时间）', () => {
    const words = [...makeWords(20).map(w => due(w)), ...makeWords(20, 'y').map(w => previewed(w))];
    const records = yesterdayRecords(words.slice(0, 8));
    const { plan, budget } = createDailyPlan({ now: NOW, availableMinutes: 30, energy: 'normal', words, records });
    const kinds = plan.initialPlan.map(t => t.kind);
    assert.ok(kinds.includes('yesterday-recall'));
    assert.ok(kinds.includes('closing-recall'));
    assert.equal(budget.closing + budget.yesterdayRecall + budget.due + budget.weak + budget.newPreview + budget.newRecall, planMinutes(plan));
    assert.ok(planMinutes(plan) <= 30);
});
// —— 状态三档 ——
test('状态三档：low 记忆优先且新词不多于 good；顺序随负载动态变化', () => {
    const words = [...makeWords(30).map(w => due(w)), ...makeWords(25, 'z')];
    const low = createDailyPlan({ now: NOW, availableMinutes: 45, energy: 'low', words, records: [] }).plan;
    const good = createDailyPlan({ now: NOW, availableMinutes: 45, energy: 'good', words, records: [] }).plan;
    assert.equal(low.initialPlan[0].kind, 'due-review');
    assert.equal(good.initialPlan[0].kind, 'new-preview');
    const lowNew = low.initialPlan.find(t => t.kind === 'new-preview');
    const goodNew = good.initialPlan.find(t => t.kind === 'new-preview');
    assert.ok((lowNew?.refs?.length ?? 0) <= (goodNew?.refs?.length ?? 0));
});
test('到期负载过重时记忆优先，并如实记录未排入的记忆债', () => {
    const words = makeWords(120).map(w => due(w));
    const { plan, budget } = createDailyPlan({ now: NOW, availableMinutes: 30, energy: 'good', words, records: [] });
    assert.equal(plan.initialPlan[0].kind, 'due-review');
    assert.ok(budget.load.memoryDebt > 0);
    assert.ok(planMinutes(plan) <= 30);
    assert.ok(budget.reasons.some(r => r.startsWith('critical-memory-sampled')));
});
// —— 任务合同与能力门禁 ——
test('统一 Task Contract：每个任务都有 module/kind/时间/原因/能力字段', () => {
    const words = [...makeWords(10).map(w => due(w)), ...makeWords(10, 'n')];
    const { plan } = createDailyPlan({ now: NOW, availableMinutes: 30, energy: 'normal', words, records: [] });
    for (const t of plan.initialPlan) {
        assert.equal(t.capabilityRequired, 'vocabulary');
        assert.equal(typeof t.kind, 'string');
        assert.ok(t.minutes > 0);
        assert.ok((t.reason ?? []).length > 0);
        assert.equal(typeof t.critical, 'boolean');
        assert.equal(typeof t.flexible, 'boolean');
        assert.equal(t.source !== undefined, true);
    }
});
test('Capability Gate：未上线模块不可执行，也不生成假任务', () => {
    const words = makeWords(10);
    // Phase 5：reading 能力已实现（available=true），但**没有真实文章**时不得生成任何阅读任务；
    // input / output 仍未上线（Phase 7/8），既不可执行也不生成任务。
    const noSource = createDailyPlan({ now: NOW, availableMinutes: 45, energy: 'normal', words, records: [] }).plan;
    assert.equal(noSource.capabilities!.vocabulary.available, true);
    assert.equal(noSource.capabilities!.sentence.available, true);
    assert.equal(noSource.capabilities!.reading.available, true);
    for (const m of ['input', 'output'])
        assert.equal(noSource.capabilities![m].available, false);
    assert.ok(noSource.initialPlan.every(t => t.module === 'vocabulary'), '没有句源与阅读材料时不得生成句子/阅读任务');
    // Phase 5：reading 已实现，因此有真实文章时**必须**生成真实阅读任务
    const passage = {
        id: 'p1', title: 'Real article', text: 'word '.repeat(200), sourceType: 'pasted_text' as const,
        sourceUrl: '', topic: 'test', wordCount: 200, difficulty: '', createdAt: NOW,
        paragraphs: [{ index: 0, text: 'word '.repeat(200), start: 0, end: 1000, wordCount: 200 }],
        sentences: [{ index: 0, paragraphIndex: 0, text: 'word '.repeat(200), start: 0, end: 1000, wordCount: 200 }],
        estimatedDifficulty: 3,
    };
    const withMaterial = createDailyPlan({
        now: NOW, availableMinutes: 45, energy: 'normal', words, records: [],
        readingInput: { passages: [passage], sessions: [] },
    }).plan;
    const readingTask = withMaterial.initialPlan.find(t => t.module === 'reading');
    assert.ok(readingTask, '有真实文章时必须生成阅读任务');
    assert.equal(readingTask!.kind, 'reading-new');
    assert.deepEqual(readingTask!.refs, ['p1']);
    // 运行时可降级：sentence 被显式关闭时，即使给了句源也不生成
    const gated = createDailyPlan({
        now: NOW, availableMinutes: 45, energy: 'normal', words, records: [],
        capabilityOverrides: { sentence: false },
        sentenceInput: { sentences: SENTENCES(), words, concepts: [], grammarAttempts: [], sentenceAttempts: [], miniUnit: null },
    }).plan;
    assert.equal(gated.capabilities!.sentence.available, false);
    assert.ok(gated.initialPlan.every(t => t.module !== 'sentence'));
});
// —— Yesterday Recall ——
test('隔夜检测：无昨日记录不伪造任务；有记录时抽样去重、方向平衡', () => {
    const words = makeWords(24);
    const none = createDailyPlan({ now: NOW, availableMinutes: 30, energy: 'normal', words, records: [] });
    assert.equal(none.plan.initialPlan.some(t => t.kind === 'yesterday-recall'), false);
    assert.ok((none.budget.reasons ?? []).includes('no-yesterday-evidence'));
    const records = yesterdayRecords(words.slice(0, 12));
    const withSample = createDailyPlan({ now: NOW, availableMinutes: 30, energy: 'normal', words, records });
    const task = withSample.plan.initialPlan.find(t => t.kind === 'yesterday-recall');
    assert.ok(task);
    const refs = task!.refs!;
    assert.equal(new Set(refs).size, refs.length, '同一词不得在样本中重复');
    assert.ok(refs.length >= PLANNER_CONFIG.yesterdayRecall.minSample);
    assert.ok(task!.minutes >= PLANNER_CONFIG.yesterdayRecall.min && task!.minutes <= PLANNER_CONFIG.yesterdayRecall.max);
    const sample = (withSample.plan.yesterdayRecallResult as {
        sample: RecallCandidate[];
    }).sample;
    assert.equal(sample.filter(s => s.direction === 'en-zh').length, Math.ceil(sample.length / 2));
});
test('隔夜评估：只统计有效隔夜证据，重复事件不双计分', () => {
    const words = makeWords(4);
    const candidates: RecallCandidate[] = words.map(w => ({ wordId: w.id, category: 'new', direction: 'en-zh', priorRecordAt: NOW - DAY }));
    const sessionRecords = [
        record(words[0].id, NOW - 3600000, true, 'recall-1'),
        record(words[1].id, NOW - 3500000, false, 'recall-1'),
        record(words[1].id, NOW - 3400000, false, 'recall-1'), // 同一词的重复作答不得双计分
        record(words[2].id, NOW - 3300000, true, 'recall-1'),
    ];
    const ev = evaluateRecallSession(candidates, sessionRecords, 'recall-1');
    assert.equal(ev.validSamples, 3);
    assert.equal(ev.total, 4);
    assert.equal(ev.retention, 0.7);
    assert.equal(ev.confidence, 'ok');
    const none = evaluateRecallSession(candidates, [], 'other');
    assert.equal(none.retention, null);
    assert.equal(none.confidence, 'unavailable');
    const stale = candidates.map(c => ({ ...c, priorRecordAt: NOW - 60000 }));
    const low = evaluateRecallSession(stale, sessionRecords, 'recall-1');
    assert.equal(low.validSamples, 0);
    assert.equal(low.retention, null);
});
test('保留率估计：样本不足返回 null，跨日样本才计入', () => {
    const words = makeWords(4);
    const sameDay = [record(words[0].id, NOW - 7200000, true), record(words[0].id, NOW - 3600000, true)];
    assert.equal(estimateRetention(sameDay, NOW).d1, null);
    const crossDay: ReviewRecord[] = [];
    for (const w of words) {
        crossDay.push(record(w.id, NOW - 2 * DAY, false));
        crossDay.push(record(w.id, NOW - DAY, true));
    }
    const est = estimateRetention(crossDay, NOW);
    assert.equal(est.d1, 1);
    assert.equal(est.samples.d1, 4);
});
// —— 调度复用 / Preview→Recall ——
test('复用 effectiveDue 选取到期词；新词必须先 Preview 再 Recall', () => {
    const words = [...makeWords(12).map(w => due(w)), ...makeWords(12, 'n')];
    const { plan } = createDailyPlan({ now: NOW, availableMinutes: 45, energy: 'normal', words, records: [] });
    const dueTask = plan.initialPlan.find(t => t.kind === 'due-review')!;
    assert.ok(dueTask);
    for (const id of dueTask.refs!) {
        const w = words.find(x => x.id === id)!;
        assert.ok(effectiveDue(w, 'fsrs') <= NOW, '到期任务只能包含真实到期词');
    }
    const preview = plan.initialPlan.find(t => t.kind === 'new-preview')!;
    const recall = plan.initialPlan.find(t => t.kind === 'new-recall')!;
    assert.ok(preview && recall);
    for (const id of preview.refs!) {
        const w = words.find(x => x.id === id)!;
        assert.ok(isUnseen(w) || w.previewedAt > 0, '新词池只放未预览或已预览未测试的词');
    }
    assert.deepEqual(recall.dependencies, [preview.id]);
    assert.ok(plan.initialPlan.indexOf(preview) < plan.initialPlan.indexOf(recall));
});
test('低保留减少新词、高到期负载压缩柔性任务', () => {
    const words = [...makeWords(60).map(w => due(w)), ...makeWords(40, 'n')];
    const lowRecords: ReviewRecord[] = [];
    for (const w of makeWords(6, 'low')) {
        lowRecords.push(record(w.id, NOW - 2 * DAY, false));
        lowRecords.push(record(w.id, NOW - DAY, false));
    }
    const highRecords: ReviewRecord[] = [];
    for (const w of makeWords(6, 'high')) {
        highRecords.push(record(w.id, NOW - 2 * DAY, false));
        highRecords.push(record(w.id, NOW - DAY, true));
    }
    const low = createDailyPlan({ now: NOW, availableMinutes: 45, energy: 'normal', words, records: lowRecords }).plan;
    const high = createDailyPlan({ now: NOW, availableMinutes: 45, energy: 'normal', words, records: highRecords }).plan;
    const newCount = (p: DailyPlan) => p.initialPlan.find(t => t.kind === 'new-preview')?.refs?.length ?? 0;
    assert.ok(newCount(low) < newCount(high), `低保留应减少新词：${newCount(low)} vs ${newCount(high)}`);
    assert.ok(planMinutes(low) <= 45 && planMinutes(high) <= 45);
});
// —— 动态重规划 ——
test('超时/提前完成：柔性任务可调，critical 记忆任务保留，调整 ≤30% 且有原因', () => {
    const words = [...makeWords(30).map(w => due(w)), ...makeWords(30, 'n')];
    const { plan } = createDailyPlan({ now: NOW, availableMinutes: 45, energy: 'normal', words, records: [] });
    const target = plan.initialPlan.find(t => t.kind === 'new-preview')!;
    const before = planMinutes(plan);
    const started = { ...plan, initialPlan: plan.initialPlan.map(t => t.id === target.id ? { ...t, status: 'started' as const, startedAt: NOW } : t) };
    const res = applyComplete(started, target.id, target.minutes + 25);
    assert.ok(res.plan);
    assert.ok(planMinutes(res.plan) <= res.plan.availableMinutes + PLANNER_CONFIG.adjustment.overrunTolerance, `调整后不得大幅溢出：${planMinutes(res.plan)} vs ${before}`);
    assert.ok(res.reasons.includes('overrun-bounded-15min') || res.reasons.some(r => r.startsWith('overrun-bounded')));
    const dueTask = res.plan.initialPlan.find(t => t.kind === 'due-review');
    if (dueTask && dueTask.status !== 'done')
        assert.equal(dueTask.minutes, plan.initialPlan.find(t => t.kind === 'due-review')!.minutes, 'critical 记忆任务不被超时调整削减');
    assert.ok(res.plan.adjustments.every(a => !!a.reason));
});
test('跳过 / 延后 / 替换：记录真实原因；critical 不可替换；无候选明确不可用', () => {
    const words = [...makeWords(20).map(w => due(w)), ...makeWords(60, 'n')];
    const { plan } = createDailyPlan({ now: NOW, availableMinutes: 45, energy: 'normal', words, records: [] });
    const dueTask = plan.initialPlan.find(t => t.kind === 'due-review')!;
    const preview = plan.initialPlan.find(t => t.kind === 'new-preview')!;
    const skipped = apply(plan, dueTask.id, 'skip');
    assert.equal(skipped.plan.initialPlan.find(t => t.id === dueTask.id)!.status, 'skipped');
    assert.ok(skipped.reasons.includes('critical-task-skipped-by-user'));
    const delayed = apply(plan, preview.id, 'delay');
    const moved = delayed.plan.initialPlan;
    assert.equal(moved[moved.length - 2].id, preview.id, '延后只在本日计划内重排');
    assert.equal(moved[moved.length - 1].kind, 'closing-recall');
    const rejected = apply(plan, dueTask.id, 'replace');
    assert.equal(rejected.ok, false);
    assert.ok(rejected.reasons.includes('replace-not-allowed-for-critical'));
    const replacement = buildReplacement(plan, preview, words, NOW);
    assert.ok(replacement);
    const replaced = apply(plan, preview.id, 'replace', replacement!);
    assert.equal(replaced.ok, true);
    assert.equal(replaced.plan.initialPlan.find(t => t.id === preview.id)!.status, 'replaced');
    assert.ok(Math.abs(replacement!.minutes - preview.minutes) <= preview.minutes * PLANNER_CONFIG.adjustment.maxRatio + 0.01);
    const noCandidate = buildReplacement(plan, { ...preview, kind: 'due-review' }, words.filter(w => !plan.initialPlan.some(t => t.refs?.includes(w.id))), NOW);
    assert.equal(noCandidate, null);
});
test('Regenerate Today：只重排未完成任务，保留已完成任务与学习证据', () => {
    const words = [...makeWords(20).map(w => due(w)), ...makeWords(20, 'n')];
    const { plan } = createDailyPlan({ now: NOW, availableMinutes: 45, energy: 'normal', words, records: [] });
    const first = plan.initialPlan[0];
    const started = { ...plan, initialPlan: plan.initialPlan.map(t => t.id === first.id ? { ...t, status: 'started' as const, startedAt: NOW - 300000 } : t) };
    const done = applyComplete(started, first.id, first.minutes);
    const regenerated = regenerateRemaining(done.plan, { now: NOW + 60000, availableMinutes: 45, energy: 'good', words, records: [] });
    assert.equal(regenerated.ok, true);
    const kept = regenerated.plan.initialPlan.find(t => t.id === first.id)!;
    assert.equal(kept.status, 'done');
    assert.equal(kept.actualMinutes, first.minutes);
    assert.ok(regenerated.plan.initialPlan.some(t => t.kind === 'closing-recall'));
    assert.ok(planMinutes(regenerated.plan) <= regenerated.plan.availableMinutes);
    assert.ok(regenerated.plan.adjustments.some(a => a.reason === 'regenerate-remaining'));
});
// —— 中断 / 重新进入 ——
test('中断恢复：断 1 天正常、2–3 天 Re-entry、≥7 天 Mini Diagnostic，且都在预算内', () => {
    assert.equal(decideRecovery(null, NOW).kind, 'none');
    assert.ok(decideRecovery(null, NOW).reasons.includes('first-use-normal-baseline'));
    assert.equal(decideRecovery(NOW - DAY, NOW).reasons.includes('same-day-continue'), true);
    assert.equal(decideRecovery(NOW - 2 * DAY, NOW).reasons.includes('one-day-gap-normal-resume'), true);
    const twoDay = decideRecovery(NOW - 3 * DAY, NOW);
    assert.equal(twoDay.kind, 're-entry');
    assert.ok(twoDay.minutes >= 5 && twoDay.minutes <= PLANNER_CONFIG.recovery.max);
    const long = decideRecovery(NOW - 10 * DAY, NOW);
    assert.equal(long.kind, 'mini-diagnostic');
    const words = [...makeWords(20).map(w => due(w)), ...makeWords(20, 'n')];
    const { plan } = createDailyPlan({ now: NOW, availableMinutes: 30, energy: 'normal', words, records: [record(words[0].id, NOW - 9 * DAY, true)] });
    const task = plan.initialPlan.find(t => t.kind === 're-entry-check');
    assert.ok(task, '断更后必须真实执行重新进入检测');
    assert.ok((task!.reason ?? []).includes('mini-diagnostic-missed-8'));
    assert.ok(planMinutes(plan) <= 30);
    assert.equal(plan.initialPlan.some(t => t.kind === 'yesterday-recall'), false);
});
// —— Closing Loop ——
test('Closing Loop：固定 3–5 分钟、位于末位、使用真实词', () => {
    const words = [...makeWords(10).map(w => due(w)), ...makeWords(10, 'n')];
    const { plan } = createDailyPlan({ now: NOW, availableMinutes: 45, energy: 'normal', words, records: [] });
    const closing = plan.initialPlan[plan.initialPlan.length - 1];
    assert.equal(closing.kind, 'closing-recall');
    assert.ok(closing.minutes >= PLANNER_CONFIG.closing.min && closing.minutes <= PLANNER_CONFIG.closing.max);
    assert.ok((closing.refs ?? []).length > 0 && (closing.refs ?? []).every(id => words.some(w => w.id === id)));
});
test('预算极短：优先短 Closing 与 critical 记忆，并记录降级原因', () => {
    const words = [...makeWords(15).map(w => due(w)), ...makeWords(10, 'n')];
    const records = yesterdayRecords(words.slice(0, 6));
    const { plan, reasons } = createDailyPlan({ now: NOW, availableMinutes: 6, energy: 'low', words, records });
    assert.ok(planMinutes(plan) <= 6);
    const closing = plan.initialPlan.find(t => t.kind === 'closing-recall');
    assert.ok(closing && closing.minutes <= PLANNER_CONFIG.closing.min);
    assert.ok(reasons.some(r => r.startsWith('budget-tight') || r.startsWith('new-deferred')), `应记录降级原因：${reasons.join(',')}`);
});
// —— 不积学习债 ——
test('不积学习债：第二天不克隆昨日未完成任务，到期记忆仍在到期池', () => {
    const words = [...makeWords(20).map(w => due(w)), ...makeWords(20, 'n')];
    const day1 = createDailyPlan({ now: NOW, availableMinutes: 30, energy: 'normal', words, records: [] }).plan;
    const skipped = day1.initialPlan.filter(t => t.flexible).map(t => apply(day1, t.id, 'skip')).pop()!.plan;
    const day2 = createDailyPlan({ now: NOW + DAY, availableMinutes: 30, energy: 'normal', words, records: [] }).plan;
    assert.notEqual(day2.id, day1.id);
    assert.ok(day2.initialPlan.every(t => t.id.startsWith(day2.id)), '新计划不得携带昨日任务 id');
    assert.equal(day2.initialPlan.some(t => t.status === 'skipped' || t.status === 'delayed'), false);
    assert.ok(day2.initialPlan.some(t => t.kind === 'due-review'), '到期记忆仍然存在（记忆债不算学习债）');
    assert.ok(planMinutes(day2) <= 30);
    void skipped;
});
// —— 校准 ——
test('隔夜结果校准：低保留减少未完成新词并补弱词；不溢出预算', () => {
    const words = [...makeWords(20).map(w => due(w)), ...makeWords(30, 'n')];
    const { plan } = createDailyPlan({ now: NOW, availableMinutes: 45, energy: 'normal', words, records: [] });
    const preview = plan.initialPlan.find(t => t.kind === 'new-preview')!;
    const lowEval = { retention: 0.3, confidence: 'ok' as const, total: 4, validSamples: 4, byCategory: {}, samples: [], reasons: [] };
    const res = calibrateAfterRecall(plan, lowEval, { now: NOW, words });
    const after = res.plan.initialPlan.find(t => t.kind === 'new-preview')!;
    assert.ok(after.refs!.length < preview.refs!.length);
    assert.ok(res.plan.initialPlan.some(t => t.kind === 'weak-review' || (t.kind === 'new-preview' && t.refs!.length < preview.refs!.length)));
    assert.ok(planMinutes(res.plan) <= res.plan.availableMinutes);
    assert.equal((res.plan.yesterdayRecallResult as {
        status: string;
    }).status, 'done');
    const highRes = calibrateAfterRecall(createDailyPlan({ now: NOW, availableMinutes: 60, energy: 'good', words, records: [] }).plan, { ...lowEval, retention: 0.9 }, { now: NOW, words });
    assert.ok(planMinutes(highRes.plan) <= highRes.plan.availableMinutes);
});
// —— 确定性 ——
test('确定性：同一输入两次生成完全一致', () => {
    const words = [...makeWords(20).map(w => due(w)), ...makeWords(20, 'n')];
    const records = yesterdayRecords(words.slice(0, 8));
    const a = createDailyPlan({ now: NOW, availableMinutes: 45, energy: 'normal', words, records }).plan;
    const b = createDailyPlan({ now: NOW, availableMinutes: 45, energy: 'normal', words, records }).plan;
    assert.deepEqual(a.initialPlan, b.initialPlan);
    assert.deepEqual(a.budget, b.budget);
});
test('progress：完成与剩余时间口径一致', () => {
    const words = [...makeWords(20).map(w => due(w)), ...makeWords(20, 'n')];
    const { plan } = createDailyPlan({ now: NOW, availableMinutes: 45, energy: 'normal', words, records: [] });
    const p0 = planProgress(plan);
    assert.equal(p0.done, 0);
    assert.equal(p0.remainingMinutes, planMinutes(plan));
    const first = plan.initialPlan[0];
    const done = applyComplete({ ...plan, initialPlan: plan.initialPlan.map(t => t.id === first.id ? { ...t, status: 'started' as const } : t) }, first.id, first.minutes).plan;
    const p1 = planProgress(done);
    assert.equal(p1.done, 1);
    assert.equal(p1.doneMinutes, first.minutes);
    assert.equal(p1.remainingMinutes, planMinutes(done) - first.minutes);
});
// —— 辅助（沿用被测 API，不绕过领域引擎）——
function apply(plan: DailyPlan, taskId: string, action: 'skip' | 'delay' | 'start' | 'replace', replacement?: PlanItem) {
    // eslint 无关：直接调用领域 API
    return applyAction(plan, taskId, action, replacement);
}
import { applyPlanAction } from '../src/planner.ts';
function applyAction(plan: DailyPlan, taskId: string, action: 'skip' | 'delay' | 'start' | 'replace', replacement?: PlanItem) {
    return applyPlanAction(plan, taskId, action, { now: NOW, replacement, reason: 'test' });
}
function applyComplete(plan: DailyPlan, taskId: string, actualMinutes: number) {
    return applyPlanAction(plan, taskId, 'complete', { now: NOW, actualMinutes, reason: 'test-complete' });
}
