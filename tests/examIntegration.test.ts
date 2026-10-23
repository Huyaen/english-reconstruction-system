import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { backup, emptyData, loadData, replaceData, validateBackup } from '../src/db.ts';
import { ensureExamContent, getExamBank, saveExamSession, saveExamLog, deleteExamLog } from '../src/examStore.ts';
import { createExamSession, startSession, saveAnswer, submitSession } from '../src/examSession.ts';
import { createDailyPlan } from '../src/planner.ts';
import { planExamTask } from '../src/examPlanner.ts';
import { buildWeeklyAssessment, weeklySession } from '../src/weeklyAssessment.ts';
import { builtinSpecifications } from '../src/examSpecification.ts';
const NOW = Date.UTC(2026, 9, 23, 5, 0, 0);
test('v7 种子幂等：重复 ensure 不会复制规格/材料/题目（稳定 id 覆盖）', async () => {
    const first = await ensureExamContent();
    assert.equal(first.specs, builtinSpecifications().length);
    assert.ok(first.items > 0);
    const bank1 = await getExamBank();
    await ensureExamContent();
    const bank2 = await getExamBank();
    assert.equal(bank2.items.length, bank1.items.length);
    assert.equal(bank2.specifications.length, bank1.specifications.length);
    assert.equal(new Set(bank2.items.map(i => i.id)).size, bank2.items.length);
});
test('会话持久化：revision 冲突显式返回 stale；日志可增删', async () => {
    const bank = await getExamBank();
    const items = bank.items.filter(i => i.options.length).slice(0, 2);
    let s = createExamSession({ id: 'persist-1', mode: 'mixed_practice', spec: bank.specifications[0], items, now: NOW });
    await saveExamSession(s);
    s = startSession(s, NOW).session!;
    s = saveAnswer(s, { itemId: items[0].id, value: items[0].answerKey!, timeMs: 100, now: NOW + 100 }).session!;
    const ok = await saveExamSession(s, 1);
    assert.equal(ok.ok, true);
    const stale = await saveExamSession({ ...s, revision: s.revision + 1 }, 1);
    assert.equal(stale.ok, false);
    assert.equal(stale.stale, true);
    await saveExamLog({ id: 'log-1', date: '2026-10-20', name: '月考', examCategory: 'other', fullScore: 150, reportedScore: 100, sectionResults: [], errorTypes: [], selfAssessment: '阅读慢', source: 'self_report', createdAt: NOW });
    assert.equal((await getExamBank()).logs.length, 1);
    await deleteExamLog('log-1');
    assert.equal((await getExamBank()).logs.length, 0);
});
test('备份包含 v7 考试域，导出→校验往返不丢来源与评分状态', async () => {
    const d = await loadData();
    await ensureExamContent();
    const bank = await getExamBank();
    const items = bank.items.slice(0, 2);
    let s = createExamSession({ id: 'backup-1', mode: 'skill_practice', spec: bank.specifications[0], items, now: NOW });
    s = startSession(s, NOW).session!;
    s = saveAnswer(s, { itemId: items[0].id, value: items[0].answerKey ?? 'A', timeMs: 100, now: NOW + 100 }).session!;
    s = submitSession(s, NOW + 200).session!;
    await saveExamSession(s);
    const data = await loadData();
    assert.ok(data.examSpecifications.length >= 3);
    const raw = JSON.parse(backup(data));
    const restored = validateBackup(raw);
    assert.equal(restored.examSessions.length, data.examSessions.length);
    assert.equal(restored.examItems.length, data.examItems.length);
    assert.equal(restored.examSessions.find(x => x.id === 'backup-1')?.scoreStatus, s.scoreStatus);
    assert.ok(restored.examSpecifications.find(x => x.id === 'spec-2028-gaokao-foreign-language')?.totalScore === null);
    assert.equal((await loadData()).examLogs.length, 0);
});
test('计划只在使用者开启且题目新鲜时加入考试任务，关键任务顺序不变', async () => {
    assert.equal(planExamTask({ enabled: false, items: [], sessions: [], availableMinutes: 60, now: NOW }), null);
    const d = emptyData();
    const bank = await getExamBank();
    const task = planExamTask({ enabled: true, items: bank.items, sessions: [], availableMinutes: 60, now: NOW });
    assert.ok(task);
    const { plan } = createDailyPlan({ now: NOW, availableMinutes: 45, energy: 'normal', words: [], records: [], examTask: task });
    const exam = plan.initialPlan.find(t => t.module === 'exam');
    assert.ok(exam);
    assert.equal(exam!.flexible, true);
    assert.equal(exam!.critical, false);
    assert.ok(exam!.minutes <= 10);
    const no = createDailyPlan({ now: NOW, availableMinutes: 45, energy: 'normal', words: [], records: [] });
    assert.equal(no.plan.initialPlan.some(t => t.module === 'exam'), false);
    assert.equal(d.words.length, 0);
});
test('周测会话保存固定题目快照，刷新后不重新出题', async () => {
    const d = emptyData();
    const now = NOW;
    d.words = Array.from({ length: 5 }, (_, i) => ({
        id: `w${i}`, bookId: 'b', en: `word${i}`, zh: `释义${i}`, pos: '', phonetic: '', example: '', collocation: '', difficulty: '', tags: '', order: i,
        schedule: { due: 0, last: 0, interval: 0, step: 0, spacedPasses: 0 },
        state: { total: 2, correct: 1, streak: 0, errors: 1, lapses: 0, meanMs: 1000, lastMs: 1000, level: 'normal', lastCorrect: true, directions: { 'en-zh': { total: 1, correct: 1, meanMs: 1000 }, 'zh-en': { total: 1, correct: 0, meanMs: 1000 } } },
        confusions: {}, fsrs: null,
    })) as never;
    d.passages = [{ id: 'p1', title: 'P', text: 'Text about a real topic. '.repeat(8), sourceType: 'import', sourceUrl: '', topic: '', wordCount: 10, difficulty: '', createdAt: now }];
    const bank = await getExamBank();
    const a = buildWeeklyAssessment(d, bank.items, [], now);
    const b = buildWeeklyAssessment(d, bank.items, [], now);
    assert.deepEqual(a.items.map(i => i.id), b.items.map(i => i.id));
    const w = weeklySession({ d, items: bank.items, sessions: [], now, spec: null, id: 'wk-snap' });
    assert.ok(w.session);
    assert.deepEqual(w.session!.itemIds, a.items.map(i => i.id));
    await saveExamSession(w.session!);
    const loaded = (await getExamBank()).sessions.find(s => s.id === 'wk-snap')!;
    assert.deepEqual(loaded.itemIds, a.items.map(i => i.id));
    assert.equal(loaded.weeklyReportId, 'war-wk-snap');
});
