import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWord, validSettings } from '../src/core.ts';
import { applyPreview } from '../src/evidence.ts';
import { calibrateAfterRecall, createDailyPlan, firstAttemptedOn, planMinutes, regenerateRemaining } from '../src/planner.ts';
import { applyCatchupToPlan } from '../src/catchup.ts';
import { defaults, type ReviewRecord } from '../src/types.ts';
import { backup, emptyData, validateBackup } from '../src/db.ts';

const now = new Date(2026, 10, 10, 12).getTime();
const words = Array.from({ length: 130 }, (_, i) => makeWord({ en: 'testword' + i, zh: '释义' + i }, 'fixture', i));
const input = { words, records: [], now, availableMinutes: 120, energy: 'normal' as const };
const refs = (plan: ReturnType<typeof createDailyPlan>['plan']) =>
    new Set(plan.initialPlan.filter(t => t.kind === 'new-preview' || t.kind === 'new-recall').flatMap(t => t.refs ?? []));

test('smart default stays identical, and manual goals include zero and one', () => {
    const smart = createDailyPlan(input);
    assert.deepEqual(createDailyPlan({ ...input, newWordGoal: null }).plan.initialPlan, smart.plan.initialPlan);
    for (const newWordGoal of [0, 1, 5, 20, 40, 100]) {
        const { plan } = createDailyPlan({ ...input, newWordGoal });
        assert.equal(plan.newWordGoal, newWordGoal);
        assert.equal(refs(plan).size, newWordGoal);
        assert.ok(planMinutes(plan) <= plan.availableMinutes);
    }
});

test('manual settings reject invalid counts; time, due words and eligible supply constrain allocation', () => {
    for (const newWordGoal of [-1, 1.5, 101, NaN, Infinity]) assert.equal(validSettings({ ...defaults, newWordGoal }), false);
    assert.ok(validSettings({ ...defaults, newWordGoal: 0 }));
    const due = words.slice(0, 50).map(w => ({ ...w, state: { ...w.state, total: 2 } }));
    const tight = createDailyPlan({ ...input, words: [...due, ...words.slice(50)], availableMinutes: 15, newWordGoal: 40 });
    assert.ok(tight.budget.load.duePlanned > 0);
    assert.equal(refs(tight.plan).size, 0);
    assert.ok(tight.reasons.includes('new-goal-budget'));
    const limited = createDailyPlan({ ...input, words: words.slice(0, 3), newWordGoal: 20 });
    assert.equal(refs(limited.plan).size, 3);
    assert.ok(limited.reasons.some(r => r.startsWith('pool-limited')));
});

test('replanning reserves introduced words, keeps unfinished recall and permits a fresh pair', () => {
    const { plan } = createDailyPlan({ ...input, newWordGoal: 5 });
    const preview = plan.initialPlan.find(t => t.kind === 'new-preview')!;
    preview.status = 'done';
    const introduced = new Set(preview.refs);
    const seen = words.map(w => introduced.has(w.id) ? applyPreview(w, 'know', now, w.id).word : w);
    const higher = regenerateRemaining(plan, { ...input, words: seen, newWordGoal: 20 }).plan;
    assert.equal(refs(higher).size, 20);
    assert.deepEqual(higher.initialPlan.find(t => t.id === preview.id), preview);
    assert.equal(new Set(higher.initialPlan.map(t => t.id)).size, higher.initialPlan.length);
    const fresh = higher.initialPlan.find(t => t.kind === 'new-recall' && !t.dependencies?.includes(preview.id))!;
    assert.ok(fresh.dependencies?.every(id => higher.initialPlan.some(t => t.id === id)));
    const lower = regenerateRemaining(plan, { ...input, words: seen, newWordGoal: 0 }).plan;
    assert.equal(refs(lower).size, 5);
    assert.equal(lower.newWordGoal, 0);
    assert.equal(lower.initialPlan.find(t => t.kind === 'new-recall')?.refs?.length, 5);
    preview.status = 'started';
    const running = regenerateRemaining(plan, { ...input, newWordGoal: 1 }).plan;
    assert.deepEqual(running.initialPlan.find(t => t.id === preview.id), preview);
});

test('calibration and catchup keep the manual target; first-day records deduplicate', () => {
    const { plan } = createDailyPlan({ ...input, newWordGoal: 20 });
    for (const retention of [0.3, 0.95]) {
        const calibrated = calibrateAfterRecall(plan, { retention } as Parameters<typeof calibrateAfterRecall>[1], { words, now });
        assert.equal(refs(calibrated.plan).size, 20);
        assert.equal(calibrated.plan.newWordGoal, 20);
    }
    const paused = applyCatchupToPlan(plan, { now, cap: 30, minutes: 120, words, records: [], settings: defaults });
    assert.equal(paused.newWordGoal, 20);
    assert.ok(paused.initialPlan.filter(t => t.kind === 'new-preview').every(t => t.status === 'replaced'));
    const records = [{ wordId: 'new', at: now, before: 'new' }, { wordId: 'new', at: now + 1, before: 'normal' }, { wordId: 'old', at: now, before: 'normal' }, { wordId: 'old', at: now - 86400000, before: 'new' }] as ReviewRecord[];
    assert.deepEqual([...firstAttemptedOn(records, plan.date)], ['new']);
    const tomorrow = createDailyPlan({ ...input, now: now + 86400000, newWordGoal: 5 });
    assert.notEqual(tomorrow.plan.date, plan.date);
    assert.equal(refs(tomorrow.plan).size, 5);
});

test('DB9 backup round-trips a default distinct from the daily override and reads old settings', () => {
    const plan = createDailyPlan({ ...input, words: [], newWordGoal: 0 }).plan;
    const exported = JSON.parse(backup({ ...emptyData(), dailyPlans: [plan], settings: { ...defaults, newWordGoal: 20 } }));
    assert.equal(exported.version, 9);
    const restored = validateBackup(exported);
    assert.equal(restored.settings.newWordGoal, 20);
    assert.equal(restored.dailyPlans[0].newWordGoal, 0);
    delete exported.data.settings.newWordGoal;
    delete exported.data.dailyPlans[0].newWordGoal;
    assert.equal(validateBackup(exported).settings.newWordGoal, undefined);
    exported.data.dailyPlans[0].newWordGoal = 101;
    assert.throws(() => validateBackup(exported));
});
test('release: repeated smart/manual changes preserve the preview-to-recall contract', () => {
    let plan = createDailyPlan({ ...input, newWordGoal: 20 }).plan;
    const preview = plan.initialPlan.find(t => t.kind === 'new-preview')!;
    preview.status = 'done';
    const introduced = new Set(preview.refs);
    const seen = words.map(w => introduced.has(w.id) ? applyPreview(w, 'know', now, w.id).word : w);
    for (const goal of [null, null, 0, 30, null, 30]) {
        const result = regenerateRemaining(plan, { ...input, words: seen, newWordGoal: goal });
        assert.ok(result.ok);
        plan = result.plan;
        for (const recall of plan.initialPlan.filter(t => t.kind === 'new-recall' && t.status === 'pending')) {
            const linked = plan.initialPlan.find(t => recall.dependencies?.includes(t.id));
            assert.ok(linked && linked.kind === 'new-preview');
            assert.ok(recall.refs?.every(id => linked.refs?.includes(id)), 'recall must use the linked preview words');
        }
        const oldRecall = plan.initialPlan.find(t => t.kind === 'new-recall' && t.dependencies?.includes(preview.id) && t.status === 'pending');
        assert.deepEqual(new Set(oldRecall?.refs), introduced, 'the unfinished original recall stays available across toggles');
        assert.equal(new Set(plan.initialPlan.map(t => t.id)).size, plan.initialPlan.length);
    }
});
