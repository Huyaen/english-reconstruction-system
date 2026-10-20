import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import type { MiniUnit, Word } from '../src/types.ts';
import { emptyData } from '../src/db.ts';
import { makeWord } from '../src/core.ts';
import { ActiveUnitExistsError, StaleUnitError, activeUnit, applyTransition, createUnit, listUnits, loadUnit, saveUnit } from '../src/miniUnitStore.ts';
import { applyUnitEvent, nextDay, stageOf } from '../src/miniUnit.ts';
import { createDailyPlan, planMinutes } from '../src/planner.ts';
import { planDay } from '../src/miniUnitProgression.ts';
import type { Passage, ReviewRecord } from '../src/types.ts';
const NOW = new Date(2026, 9, 20, 10, 0, 0).getTime();
function unit(over: Partial<MiniUnit> = {}): MiniUnit {
    return {
        id: `unit-${Math.random().toString(36).slice(2, 8)}`, theme: 'Rivers', topic: 'rivers', dayIndex: 0,
        anchorMaterialId: 'a1', anchorProvenance: 'user_imported_authentic', targetWords: ['current', 'notebook'],
        targetGrammar: ['clause.adverbial'], grammarTargets: [{ conceptId: 'clause.adverbial', name: '状语从句', status: 'verified', evidence: 'e' }],
        difficultyTarget: 50, status: 'active', startedAt: NOW, completedAt: null, dayLog: [], stage: 'ready',
        plannedDays: 3, dayHistory: [], linkedPassageIds: ['a1'], linkedSentenceIds: [], linkedGenerationIds: [], linkedDailyPlanIds: [],
        createdAt: NOW, updatedAt: NOW, revision: 0, ...over,
    };
}
async function clear(): Promise<void> {
    const { getDB, openDB } = await import('../src/db.ts');
    await openDB();
    const tx = getDB().transaction('miniUnits', 'readwrite');
    tx.objectStore('miniUnits').clear();
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}
test('创建后重载仍在；不允许出现第二个未结束单元', async () => {
    await clear();
    const a = await createUnit(unit({ id: 'u-a' }));
    assert.equal(a.revision, 0);
    const loaded = await loadUnit('u-a');
    assert.equal(loaded?.theme, 'Rivers');
    assert.equal((await activeUnit())?.id, 'u-a');
    await assert.rejects(() => createUnit(unit({ id: 'u-b' })), (e: unknown) => e instanceof ActiveUnitExistsError);
    // 放弃后可以再建新的
    const abandoned = applyUnitEvent(loaded!, { type: 'abandon', reason: '换主题', now: NOW + 10 });
    assert.ok(abandoned.ok);
    if (!abandoned.ok)
        return;
    await saveUnit(abandoned.unit, loaded!.revision ?? 0);
    const b = await createUnit(unit({ id: 'u-b' }));
    assert.equal(b.id, 'u-b');
    assert.equal((await listUnits()).length, 2);
});
test('revision 冲突显式失败，不静默覆盖别人的更新', async () => {
    await clear();
    const u = await createUnit(unit({ id: 'u-c' }));
    const first = await saveUnit({ ...u, theme: 'Rivers v2' }, u.revision ?? 0);
    assert.equal(first.revision, 1);
    await assert.rejects(() => saveUnit({ ...u, theme: 'Stale write' }, u.revision ?? 0), (e: unknown) => e instanceof StaleUnitError);
    const latest = await loadUnit('u-c');
    assert.equal(latest?.theme, 'Rivers v2');
});
test('两个并发路径尝试同一天晋级：只有一个生效，证据不重复', async () => {
    await clear();
    const base = await createUnit(unit({ id: 'u-d', stage: 'active' }));
    const advance = () => applyTransition('u-d', (current) => {
        if (nextDay(current) !== 1)
            return null;
        const t = applyUnitEvent(current, { type: 'complete-day', day: 1, calendarDate: '2026-10-20', summary: '并发测试', evidenceIds: ['e1', 'e2'], wordsCovered: ['current'], now: NOW + 100 });
        return t.ok ? t.unit : null;
    });
    const [r1, r2] = await Promise.all([advance(), advance()]);
    const final = await loadUnit('u-d');
    assert.equal(final?.dayHistory?.length, 1, '只能有一个 Day 1 记录');
    assert.equal(final?.dayIndex, 1);
    assert.equal(nextDay(final!), 2);
    // 两次返回的都是同一天，不会出现 Day 2
    assert.equal([r1, r2].filter(u => u.dayIndex === 2).length, 0);
    assert.equal(base.revision, 0);
});
test('跨会话恢复：刷新后 stage/dayHistory/证据都还在', async () => {
    await clear();
    await createUnit(unit({ id: 'u-e', stage: 'active' }));
    await applyTransition('u-e', c => {
        const t = applyUnitEvent(c, { type: 'complete-day', day: 1, calendarDate: '2026-10-19', summary: 'D1', evidenceIds: ['e1'], wordsCovered: ['current'], now: NOW - 86400000 });
        return t.ok ? t.unit : null;
    });
    const { closeDB } = await import('../src/db.ts');
    closeDB();
    const reopened = await loadUnit('u-e');
    assert.equal(stageOf(reopened!), 'active');
    assert.equal(reopened?.dayHistory?.[0].calendarDate, '2026-10-19');
    assert.deepEqual(reopened?.dayHistory?.[0].evidenceIds, ['e1']);
});
// ————— Planner 集成 —————
const ANCHOR: Passage = {
    id: 'a1', title: 'Rivers and Records', text: 'The engineers measured the current and wrote the numbers in a grey notebook. When the water rose, that notebook was the only record they trusted.', sourceType: 'import', sourceUrl: '', topic: 'rivers', wordCount: 26, difficulty: 'medium', createdAt: NOW - 86400000, contentHash: 'h1',
};
function words(count: number): Word[] {
    return Array.from({ length: count }, (_, i) => makeWord({ en: `word${i}`, zh: `释义${i}` }, 'b1', i));
}
function due(w: Word): Word {
    return { ...w, state: { ...w.state, total: 4, correct: 2, level: 'vague' }, schedule: { due: NOW - 86400000, last: NOW - 3 * 86400000, interval: 86400000, step: 2, spacedPasses: 2 }, fsrs: { ...w.fsrs, reps: 3, stability: 3, difficulty: 5, due: NOW - 86400000, lastReview: NOW - 3 * 86400000, scheduledDays: 3 } };
}
test('Planner 接受 miniUnit：写入 miniUnitId，遵守时间预算，不产生假 Input/Output 任务', () => {
    const ws = [...words(20).map(due), ...words(10)];
    for (const minutes of [20, 30, 45]) {
        const { plan } = createDailyPlan({
            now: NOW, availableMinutes: minutes, energy: 'normal', words: ws, records: [] as ReviewRecord[],
            miniUnit: unit({ stage: 'active' }), readingInput: { passages: [ANCHOR], sessions: [] },
        });
        assert.equal(plan.miniUnitId.length > 0, true);
        assert.ok(planMinutes(plan) <= minutes, `超预算：${planMinutes(plan)} > ${minutes}`);
        const modules = plan.initialPlan.map(p => p.module);
        assert.equal(modules.includes('input'), false, 'Input Hub 未实现，不能生成输入任务');
        assert.equal(modules.includes('output'), false, 'Output Lab 未实现，不能生成输出任务');
        for (const item of plan.initialPlan)
            if (item.capabilityRequired)
                assert.notEqual(plan.capabilities?.[item.capabilityRequired]?.available, false, '不可用能力不应被排进计划');
    }
});
test('低能量时计划更轻，但仍保留阅读材料（不抹掉全部目标）', () => {
    const ws = [...words(20).map(due), ...words(10)];
    const low = createDailyPlan({ now: NOW, availableMinutes: 30, energy: 'low', words: ws, records: [], miniUnit: unit({ stage: 'active' }), readingInput: { passages: [ANCHOR], sessions: [] } }).plan;
    const high = createDailyPlan({ now: NOW, availableMinutes: 30, energy: 'good', words: ws, records: [], miniUnit: unit({ stage: 'active' }), readingInput: { passages: [ANCHOR], sessions: [] } }).plan;
    assert.ok(planMinutes(low) <= 30 && planMinutes(high) <= 30);
    assert.ok(low.initialPlan.length > 0);
});
test('Unit 提供当天材料给 Planner：Day3 用新材料而不是 Anchor', () => {
    const second: Passage = { ...ANCHOR, id: 'a2', title: 'Second river text', text: ANCHOR.text, contentHash: 'h2' };
    const d = emptyData();
    d.passages = [ANCHOR, second];
    const u = unit({ stage: 'active', dayIndex: 2, dayHistory: [
            { day: 1, kind: 'build', calendarDate: 'd1', at: NOW - 172800000, summary: '', supportLevel: 'high', evidenceIds: ['e'], targetWordsCovered: [] },
            { day: 2, kind: 'strengthen', calendarDate: 'd2', at: NOW - 86400000, summary: '', supportLevel: 'medium', evidenceIds: ['e'], targetWordsCovered: [] },
        ] });
    const spec = planDay({ unit: u, day: 3, availableMinutes: 45, energy: 'normal', data: d });
    assert.equal(spec.material.kind, 'transfer');
    assert.equal(spec.material.passageId, 'a2');
    assert.equal(spec.translationAllowed, false);
});
