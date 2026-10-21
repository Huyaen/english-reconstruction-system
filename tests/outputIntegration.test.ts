import { test } from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { emptyData, backup, validateBackup } from '../src/db.ts';
import { selectOutputTasks, suggestedTypeFor } from '../src/outputSelection.ts';
import { handoutFromInput } from '../src/outputActions.ts';
import { outputAnalytics } from '../src/outputAnalytics.ts';
import { buildTaskSpec } from '../src/outputTask.ts';
import { createDailyPlan, planMinutes } from '../src/planner.ts';
import { createAttemptRecord, getAttempt, updateAttempt } from '../src/outputStore.ts';
import { collectUnitEvidence } from '../src/miniUnitEvidence.ts';
import { buildUnavailableFeedback } from '../src/outputFeedback.ts';
import type { Data, MiniUnit, OutputAttempt, Passage, Transcript } from '../src/types.ts';

const NOW = 1_700_000_000_000;

function data(): Data {
    return emptyData();
}
function word(id: string, en: string, errors = 0) {
    const d = data().words[0];
    return { ...(d ?? {}), id, en, zh: 'x', bookId: 'b', createdAt: NOW, state: { total: 3, correct: 1, errors, level: 'vague', streak: 0, directions: {} } } as unknown as Data['words'][number];
}
function unit(): MiniUnit {
    return {
        id: 'u1', status: 'active', stage: 'exposure', theme: 'water systems', topic: 'ancient aqueducts',
        targetWords: ['aqueduct', 'carry'], targetGrammar: ['g.past'], dayIndex: 3,
        anchorMaterialId: 'p1', anchorTitle: 'Roman aqueducts', startedAt: NOW - 86400000 * 3,
        lastActiveAt: NOW, completedAt: null, days: [], evidence: [], revision: 1, createdAt: NOW,
    } as unknown as MiniUnit;
}
function passage(): Passage {
    return { id: 'p1', title: 'Roman aqueducts', topic: 'ancient aqueducts', text: 'The aqueduct carried water into the city.', source: 'user', sourceType: 'user_paste', estimatedDifficulty: 42, createdAt: NOW } as unknown as Passage;
}

test('任务选择：优先当前 Mini Unit，其次最近真实输入，最后才是自由表达', () => {
    const d = data();
    d.miniUnits.push(unit());
    d.passages.push(passage());
    const r = selectOutputTasks({ data: d, now: NOW, availableMinutes: 30, energy: 'good' });
    assert.equal(r.task?.sourceType, 'mini_unit');
    assert.equal(r.task?.taskType, 'retelling', 'Day 3+ 应该复述');
    assert.ok(r.candidates.some(c => c.sourceType === 'mini_unit'));
    assert.ok(r.note.length > 0);
});

test('任务选择：真实输入与阅读都能成为表达任务，没有材料时不伪造', () => {
    const d = data();
    d.passages.push(passage());
    d.readingSessions.push({ id: 'r1', passageId: 'p1', stage: 4, at: NOW } as unknown as Data['readingSessions'][number]);
    d.inputSources.push({ id: 'is1', title: 'A video about water', topic: 'water', url: 'https://example.com', verificationStatus: 'unverified', transcriptRef: 't1', createdAt: NOW } as unknown as Data['inputSources'][number]);
    d.inputSessions.push({ id: 'ins1', sourceId: 'is1', status: 'completed', completedAt: NOW - 1000, reflection: { summary: 'It explained how water reached the city.' } } as unknown as Data['inputSessions'][number]);
    const r = selectOutputTasks({ data: d, now: NOW, availableMinutes: 20, energy: 'normal' });
    assert.ok(r.candidates.some(c => c.sourceType === 'input' && c.sourceId === 'ins1'));
    assert.ok(r.candidates.some(c => c.sourceType === 'reading' && c.sourceId === 'r1'));
    const empty = selectOutputTasks({ data: data(), now: NOW, availableMinutes: 20, energy: 'normal' });
    assert.equal(empty.task?.sourceType, 'free');
    assert.equal(empty.candidates.some(c => c.sourceType === 'input' || c.sourceType === 'reading'), false);
    assert.equal(suggestedTypeFor({ minutes: 5, energy: 'low', hasSource: false, hasUnit: false }), 'one_sentence');
});

test('任务选择：用户指定类型优先过滤，兴趣不上能力路径', () => {
    const d = data();
    d.passages.push(passage());
    d.readingSessions.push({ id: 'r1', passageId: 'p1', stage: 4, at: NOW } as unknown as Data['readingSessions'][number]);
    const r = selectOutputTasks({ data: d, now: NOW, availableMinutes: 25, energy: 'good', preferredType: 'opinion' });
    assert.equal(r.task?.taskType, 'opinion');
    d.settings.interests = { topics: [{ id: 'i1', label: 'water', keywords: ['water'], weight: 5, updatedAt: NOW }], updatedAt: NOW, revision: 1 } as never;
    const again = selectOutputTasks({ data: d, now: NOW, availableMinutes: 25, energy: 'good' });
    assert.equal(again.task?.difficultyEstimate, r.task?.difficultyEstimate, '兴趣不能改变难度');
});

test('Input → Output 交接用真实总结，缺失时明确不可用', () => {
    const d = data();
    d.inputSources.push({ id: 'is1', title: 'Water video', topic: 'water', transcriptRef: 't1', createdAt: NOW } as never);
    d.transcripts.push({ id: 't1', sourceId: 'is1', language: 'en', provenance: 'user_supplied', segments: [{ start: 0, end: 2, text: 'Water is heavy.' }, { start: 2, end: 4, text: 'It moves slowly.' }], createdAt: NOW } as unknown as Transcript);
    d.inputSessions.push({ id: 'ins1', sourceId: 'is1', status: 'completed', completedAt: NOW, reflection: { summary: 'Water is heavy and moves slowly.' } } as never);
    const r = handoutFromInput(d, 'ins1');
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.match(r.value.text, /Water is heavy/);
    assert.match(r.value.text, /Water is heavy and moves slowly/);
    assert.equal(r.value.task.sourceType, 'input');
    assert.equal(handoutFromInput(d, 'nope').ok, false);
});

test('Planner：有真实任务契约时才排 Output，且不超预算', () => {
    const d = data();
    d.passages.push(passage());
    d.readingSessions.push({ id: 'r1', passageId: 'p1', stage: 4, at: NOW } as unknown as Data['readingSessions'][number]);
    const task = selectOutputTasks({ data: d, now: NOW, availableMinutes: 40, energy: 'good' }).task!;
    const { plan, budget } = createDailyPlan({ now: NOW, availableMinutes: 40, energy: 'good', words: [], records: [], outputTask: task });
    assert.ok(plan.initialPlan.some(t => t.module === 'output'), '应该排入真实表达任务');
    assert.ok(planMinutes(plan) <= 40);
    assert.ok((budget.output ?? 0) >= 0);
    const none = createDailyPlan({ now: NOW, availableMinutes: 40, energy: 'good', words: [], records: [] });
    assert.equal(none.plan.initialPlan.some(t => t.module === 'output'), false);
});

test('Analytics 在样本不足时明确说 insufficient evidence', () => {
    const d = data();
    let a = outputAnalytics(d);
    assert.equal(a.attempts, 0);
    assert.equal(a.meaningDeliveredRate, null);
    assert.match(a.sampleNote, /insufficient|样本/);
    const task = buildTaskSpec({ taskType: 'one_sentence', topic: 'x', sourceType: 'free', now: NOW });
    d.outputAttempts.push({
        id: 'oa1', prompt: 'x', sourceType: 'free', sourceId: '', originalText: 'The aqueduct carried water.', meaningEvidence: null,
        grammarEvidence: null, vocabularyEvidence: null, coherenceEvidence: null, repairAbility: null, corrections: [], upgradeSuggestion: '',
        wordCount: 5, aiEval: null, createdAt: NOW, taskType: 'one_sentence', task, status: 'completed', revision: 2,
        supportLevel: 0, feedbackStatus: 'ai', feedbackSource: 'ai', feedback: buildUnavailableFeedback({ text: '', spec: task, scope: 'language_only', sourceProvenance: 'user_text', promptVersion: 'x' }, [], 'x'),
        productiveEvidence: [{ id: 'oa1:w1', wordId: 'w1', outputAttemptId: 'oa1', textSpan: 'aqueduct', context: 'x', independent: true, assisted: false, copied: false, correctness: 'correct', confidence: 0.45, evidenceSource: 'output_independent', at: NOW }],
        revisions: [],
    } as unknown as OutputAttempt);
    a = outputAnalytics(d);
    assert.equal(a.attempts, 1);
    assert.equal(a.independent, 1);
    assert.ok(a.productiveWords >= 1);
});

test('备份往返保留 Output 的新字段与证据，不丢任务契约', () => {
    const d = data();
    d.passages.push(passage());
    d.readingSessions.push({ id: 'r1', passageId: 'p1', stage: 4, at: NOW } as unknown as Data['readingSessions'][number]);
    const task = buildTaskSpec({ taskType: 'one_sentence', topic: 'x', sourceType: 'reading', sourceId: 'r1', now: NOW });
    d.outputAttempts.push({
        id: 'oa1', prompt: task.communicationGoal, sourceType: 'reading', sourceId: 'r1', originalText: 'The aqueduct carried water.',
        meaningEvidence: null, grammarEvidence: null, vocabularyEvidence: null, coherenceEvidence: null, repairAbility: null,
        corrections: [], upgradeSuggestion: '', wordCount: 5, aiEval: null, createdAt: NOW, taskType: 'one_sentence', task,
        status: 'revised', revision: 3, feedbackStatus: 'unavailable', supportLevel: 2, transferOf: null,
        productiveEvidence: [], revisions: [{ text: 'x', at: NOW, kind: 'self', similarityToSuggestion: 0.2 }],
    } as unknown as OutputAttempt);
    const round = validateBackup(JSON.parse(backup(d)));
    assert.equal(round.outputAttempts.length, 1);
    assert.equal(round.outputAttempts[0]!.taskType, 'one_sentence');
    assert.equal(round.outputAttempts[0]!.task?.sourceType, 'reading');
    assert.equal(round.outputAttempts[0]!.revision, 3);
});

test('Mini Unit：关联 Output 记录可见，但不会自动完成学习日', () => {
    const d = data();
    const u = unit();
    d.miniUnits.push(u);
    d.passages.push(passage());
    const task = buildTaskSpec({ taskType: 'one_sentence', topic: 'x', sourceType: 'mini_unit', sourceId: u.id, now: NOW });
    d.outputAttempts.push({
        id: 'oa-unit', prompt: 'x', sourceType: 'mini_unit', sourceId: u.id, originalText: 'The aqueduct carried water.', meaningEvidence: null,
        grammarEvidence: null, vocabularyEvidence: null, coherenceEvidence: null, repairAbility: null, corrections: [], upgradeSuggestion: '',
        wordCount: 5, aiEval: null, createdAt: NOW, taskType: 'one_sentence', task, miniUnitId: u.id, status: 'completed', completedAt: NOW,
        productiveEvidence: [{ id: 'oa-unit:w1', wordId: 'w1', outputAttemptId: 'oa-unit', textSpan: 'aqueduct', context: 'x', independent: true, assisted: false, copied: false, correctness: 'correct', confidence: 0.45, evidenceSource: 'output_independent', at: NOW }],
    } as unknown as OutputAttempt);
    const ev = collectUnitEvidence(d, u);
    assert.equal(ev.outputAttempts?.length, 1);
    assert.equal(ev.outputIndependent, 1);
    assert.equal(d.miniUnits[0]!.dayHistory?.length ?? 0, 0, '表达不会自动写 dayHistory');
    assert.equal(d.miniUnits[0]!.status, 'active', '表达不会自动完成单元');
});

test('Store：并发写只允许一个 revision 前进，旧 revision 返回 stale', async () => {
    const task = buildTaskSpec({ taskType: 'one_sentence', topic: 'x', sourceType: 'free', now: NOW });
    const a: OutputAttempt = {
        id: 'store-test-1', prompt: 'p', sourceType: 'free', sourceId: '', originalText: 'x', meaningEvidence: null,
        grammarEvidence: null, vocabularyEvidence: null, coherenceEvidence: null, repairAbility: null, corrections: [],
        upgradeSuggestion: '', wordCount: 1, aiEval: null, createdAt: NOW, taskType: 'one_sentence', task,
        status: 'draft', revision: 1, feedbackStatus: 'none', productiveEvidence: [], revisions: [],
    };
    await createAttemptRecord(a);
    const first = await updateAttempt(a.id, 1, cur => ({ ...cur, draftText: 'one', revision: (cur.revision ?? 0) + 1 }));
    assert.equal(first.ok, true);
    const stale = await updateAttempt(a.id, 1, cur => ({ ...cur, draftText: 'two', revision: (cur.revision ?? 0) + 1 }));
    assert.equal(stale.ok, false);
    if (!stale.ok) assert.equal(stale.code, 'stale');
    const fresh = await getAttempt(a.id);
    assert.equal(fresh?.draftText, 'one');
    assert.equal(fresh?.revision, 2);
});
