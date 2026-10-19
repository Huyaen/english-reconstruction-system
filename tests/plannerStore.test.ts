import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { openDB, closeDB, loadData, replaceData, backup, validateBackup, emptyData, DB_NAME } from '../src/db.ts';
import { StalePlanError, latestPlan, listPlans, loadPlan, savePlan } from '../src/plannerStore.ts';
import { createDailyPlan, planMinutes, regenerateRemaining } from '../src/planner.ts';
import { fsrsDefaults } from '../src/types.ts';
import type { DailyPlan, Word } from '../src/types.ts';
import { makeWord } from '../src/core.ts';

const NOW = new Date(2026, 9, 19, 10, 0, 0).getTime();
const DATE = '2026-10-19';
const DAY = 86400000;
function words(count: number): Word[] {
    return Array.from({ length: count }, (_, i) => {
        const w = makeWord({ en: `w${i}`, zh: `释义${i}` }, 'book-1', i);
        return i < Math.ceil(count / 2)
            ? { ...w, state: { ...w.state, total: 3, correct: 1, level: 'vague' as const, directions: { 'en-zh': { total: 2, correct: 1, meanMs: 2000 }, 'zh-en': { total: 1, correct: 0, meanMs: 2100 } } }, schedule: { due: NOW - DAY, last: NOW - 4 * DAY, interval: DAY, step: 2, spacedPasses: 1 }, fsrs: { ...fsrsDefaults, reps: 2, due: NOW - DAY } }
            : w;
    });
}
async function freshDB() {
    await openDB();
    await replaceData(emptyData());
}
test('DailyPlan 持久化：写入、再读取、revision 递增、同日唯一', async () => {
    await freshDB();
    const { plan } = createDailyPlan({ now: NOW, availableMinutes: 30, energy: 'normal', words: words(20), records: [] });
    assert.equal(plan.id, DATE, '计划以本地日期为 key（同一天只应有一条记录）');
    const saved = await savePlan(plan, 0);
    assert.equal(saved.revision, 1);
    const loaded = await loadPlan(DATE);
    assert.ok(loaded);
    assert.equal(loaded!.availableMinutes, 30);
    assert.equal(loaded!.initialPlan.length, plan.initialPlan.length);
    assert.deepEqual(loaded!.initialPlan.map(t => t.id), plan.initialPlan.map(t => t.id));
    const updated = await savePlan({ ...loaded!, adjustments: [...loaded!.adjustments, { at: NOW, module: 'plan', deltaMinutes: -3, reason: 'test-adjust' }] }, loaded!.revision);
    assert.equal(updated.revision, 2);
    const again = await loadPlan(DATE);
    assert.equal(again!.revision, 2);
    assert.equal(again!.adjustments.length, 1);
    const all = await listPlans();
    assert.equal(all.length, 1);
    assert.equal((await latestPlan())!.id, DATE);
});
test('并发写保护：过期 revision 抛出 StalePlanError，不静默覆盖', async () => {
    await freshDB();
    const { plan } = createDailyPlan({ now: NOW, availableMinutes: 45, energy: 'normal', words: words(20), records: [] });
    const first = await savePlan(plan, 0);
    const concurrent = { ...first, availableMinutes: 60 };
    await savePlan(concurrent, first.revision); // 另一个窗口先写入 → revision 2
    await assert.rejects(() => savePlan(first, first.revision), (e: unknown) => e instanceof StalePlanError);
    const final = await loadPlan(DATE);
    assert.equal(final!.availableMinutes, 60);
    assert.equal(final!.revision, 2);
});
test('刷新/断点恢复：重新打开数据库后计划与任务状态完整保留', async () => {
    await freshDB();
    const { plan } = createDailyPlan({ now: NOW, availableMinutes: 45, energy: 'good', words: words(24), records: [] });
    const saved = await savePlan(plan, 0);
    const target = saved.initialPlan[0];
    const done = { ...saved, initialPlan: saved.initialPlan.map(t => t.id === target.id ? { ...t, status: 'done' as const, completedAt: NOW, actualMinutes: target.minutes } : t) };
    await savePlan(done, saved.revision);
    closeDB();
    await openDB();
    const restored = await loadPlan(DATE);
    assert.equal(restored!.energyState, 'good');
    assert.equal(restored!.initialPlan[0].status, 'done');
    assert.equal(restored!.initialPlan[0].actualMinutes, target.minutes);
    const data = await loadData();
    assert.equal(data.dailyPlans.length, 1);
});
test('Regenerate Today 落盘：已完成后重排只改未完成部分，且不重复生成同一天计划', async () => {
    await freshDB();
    const w = words(24);
    const { plan } = createDailyPlan({ now: NOW, availableMinutes: 45, energy: 'normal', words: w, records: [] });
    const saved = await savePlan(plan, 0);
    const first = saved.initialPlan[0];
    const done = { ...saved, initialPlan: saved.initialPlan.map(t => t.id === first.id ? { ...t, status: 'done' as const, actualMinutes: first.minutes } : t) };
    const stored = await savePlan(done, saved.revision);
    const regenerated = regenerateRemaining(stored, { now: NOW + 60000, availableMinutes: 45, energy: 'low', words: w, records: [] });
    const final = await savePlan(regenerated.plan, stored.revision);
    const reloaded = await loadPlan(DATE);
    assert.equal(reloaded!.initialPlan.find(t => t.id === first.id)!.status, 'done');
    assert.ok(reloaded!.adjustments.some(a => a.reason === 'regenerate-remaining'));
    assert.ok(planMinutes(reloaded!) <= reloaded!.availableMinutes);
    assert.equal((await listPlans()).length, 1, '同一天不得出现第二个计划');
    assert.equal(final.revision, 3);
});
test('备份兼容：Phase 3 计划字段可往返导出/校验，旧计划形状仍可读入', async () => {
    await freshDB();
    const { plan } = createDailyPlan({ now: NOW, availableMinutes: 30, energy: 'normal', words: words(16), records: [] });
    await savePlan(plan, 0);
    const legacyPlan: DailyPlan = { id: 'plan-legacy-1', date: '2026-10-18', availableMinutes: 20, energyState: 'low' as const, yesterdayRecallResult: null, miniUnitId: '', initialPlan: [{ id: 'item-1', module: 'vocabulary', minutes: 5, status: 'pending', note: '' }], adjustments: [], actualExecution: null, completedModules: [], closingLoop: null, createdAt: NOW - DAY, completedAt: null };
    const data = await loadData();
    const withLegacy = { ...data, dailyPlans: [...data.dailyPlans, legacyPlan] };
    const restored = validateBackup(JSON.parse(backup(withLegacy)));
    const phase3 = restored.dailyPlans.find(p => p.id === DATE)!;
    const old = restored.dailyPlans.find(p => p.id === 'plan-legacy-1')!;
    assert.ok(phase3);
    assert.equal(phase3.initialPlan[0].capabilityRequired, 'vocabulary');
    assert.equal(phase3.revision, 1);
    assert.ok(Array.isArray(phase3.taskActions));
    assert.equal(old.initialPlan[0].minutes, 5);
    assert.equal(old.capabilities, undefined);
    await replaceData(restored);
    assert.equal((await listPlans()).length, 2);
});
test('IndexedDB 版本未因 Phase 3 提升（dailyPlans 复用现有 store/index）', async () => {
    await freshDB();
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open(DB_NAME);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
    });
    assert.equal(db.version, 3);
    const tx = db.transaction('dailyPlans');
    assert.equal(tx.objectStore('dailyPlans').keyPath, 'id');
    assert.ok(tx.objectStore('dailyPlans').indexNames.contains('date'));
    db.close();
});
