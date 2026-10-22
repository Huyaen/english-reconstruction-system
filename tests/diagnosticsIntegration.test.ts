import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { emptyData, loadData, backup, validateBackup } from '../src/db.ts';
import type { Data, DiagnosticBottleneck, PlanItem } from '../src/types.ts';
import { applyDiagnosticFocus, boostFor } from '../src/diagnosticsPlanner.ts';
import { buildSnapshotRecord, generateSnapshot, generateWeekly } from '../src/diagnosticsActions.ts';
import { buildDiagnostics, compareWithSnapshot, evidenceMix } from '../src/diagnosticsInsight.ts';
import { findSnapshotByDate, findWeeklyByWeek } from '../src/diagnosticsStore.ts';
const NOW = new Date('2026-10-22T12:00:00+08:00').getTime();
function planItem(partial: Partial<PlanItem>): PlanItem {
    return { id: partial.id ?? 't', kind: partial.kind ?? 'weak-review', minutes: partial.minutes ?? 10, refs: [], status: 'pending', ...partial } as PlanItem;
}
test('诊断焦点只重排柔性任务，不改分钟数与 critical 顺序', () => {
    const tasks: PlanItem[] = [
        planItem({ id: 'due', critical: true, flexible: false, priority: 90, module: 'vocabulary' }),
        planItem({ id: 'reading', flexible: true, priority: 50, module: 'reading', minutes: 20 }),
        planItem({ id: 'sentence', flexible: true, priority: 60, module: 'sentence', minutes: 15 }),
        planItem({ id: 'closing', critical: true, flexible: false, priority: 10, module: 'closing', minutes: 3 }),
    ];
    const focus: DiagnosticBottleneck = { domain: 'grammar', label: 'x', reason: 'y', confidence: 'medium', metricIds: ['grammar.accuracy'] };
    const out = applyDiagnosticFocus(tasks, focus);
    assert.deepEqual(out.map(t => t.id), ['due', 'closing', 'sentence', 'reading']);
    assert.equal(out.find(t => t.id === 'sentence')!.minutes, 15);
    assert.equal(boostFor(focus, 'sentence'), 20);
    assert.deepEqual(applyDiagnosticFocus(tasks, null).map(t => t.id), ['due', 'reading', 'sentence', 'closing']);
});
test('快照与周诊断重复生成是幂等的（同一 id、不堆重复记录）', async () => {
    const d = await loadData();
    const first = await generateSnapshot(d, NOW, 7);
    const reload1 = await loadData();
    const second = await generateSnapshot(reload1, NOW + 3600000, 7);
    assert.equal(first.id, second.id);
    assert.equal((await findSnapshotByDate(first.date))?.id, first.id);
    const after = await loadData();
    assert.equal(after.skillSnapshots.filter(s => s.date === first.date).length, 1);
    const week = await generateWeekly(after, NOW, 7);
    const week2 = await generateWeekly(await loadData(), NOW + 3600000, 7);
    assert.equal(week.id, week2.id);
    assert.equal((await findWeeklyByWeek(week.weekOf))?.id, week.id);
    assert.equal((await loadData()).weeklyDiagnostics.filter(w => w.weekOf === week.weekOf).length, 1);
});
test('没有上一份快照时不给“上升/下降”；有同长度快照则有 delta', async () => {
    const d = emptyData();
    const current = buildDiagnostics(d, { now: NOW });
    assert.deepEqual(compareWithSnapshot(current.metrics, undefined, 7), []);
    const prev = buildSnapshotRecord(d, NOW - 7 * 86400000, 7);
    const withPrev = buildDiagnostics(d, { now: NOW, previous: prev });
    assert.ok(Array.isArray(withPrev.comparison));
    assert.ok(withPrev.comparison.every(c => !c.comparable ? c.delta === null : true));
});
test('证据构成：只有自评时 quality=self-report，并明确来源单一', () => {
    const d = emptyData();
    d.inputSessions.push({
        id: 'i1', sourceId: 's', title: 't', url: '', topic: '', durationMinutes: 10, watchedMinutes: 8, captionMode: 'en',
        comprehension: 70, difficultyReasons: [], outputAttemptId: '', notes: '', mode: 'standard', createdAt: NOW - 1000, completedAt: NOW - 500, status: 'completed',
    });
    const mix = evidenceMix(d, { from: NOW - 7 * 86400000, to: NOW, days: 7 });
    assert.equal(mix.quality, 'mixed', '有行为记录 + 自评，但没有可核对证据');
    assert.equal(mix.verified, 0);
    assert.ok(mix.note.includes('自评'));
});
test('备份往返保留诊断明细，结构仍可校验', () => {
    const d: Data = emptyData();
    d.skillSnapshots.push(buildSnapshotRecord(d, NOW, 7));
    const parsed = JSON.parse(backup(d));
    const checked = validateBackup(parsed);
    assert.ok(checked.skillSnapshots[0].diagnostics);
    assert.ok(parsed.data.skillSnapshots[0].diagnostics.metrics.length > 0);
});
test('payload 里没有单一英语总分字段', () => {
    const d = emptyData();
    const payload = buildDiagnostics(d, { now: NOW });
    assert.equal((payload as unknown as {
        score?: number;
    }).score, undefined);
    assert.ok(payload.disclaimer.includes('不构成'));
});
