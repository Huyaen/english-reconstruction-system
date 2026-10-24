import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import * as db from '../src/db.ts';
import { makeWord } from '../src/core.ts';
import type { Data, Word } from '../src/types.ts';
function richData(count = 240): Data {
    const d = db.emptyData();
    d.books = [{ id: 'book-probe', name: '备份压力测试', created: 1 }];
    for (let i = 0; i < count; i++) {
        const w = makeWord({ en: `probe${i}`, zh: `释义${i}`, tags: 'probe,backup' }, 'book-probe', i);
        w.fsrs = { stability: i + 1, difficulty: 5, state: 2, reps: i % 7, lapses: i % 2, due: 1700000000000 + i, lastReview: 1690000000000, scheduledDays: i, learningSteps: i % 3 };
        w.sourceTypes = ['book', 'reading'];
        w.confusions = i > 0 ? { [d.words[0]!.id]: 1 } : {};
        d.words.push(w);
    }
    const w0 = d.words[0]!;
    const w1 = d.words[1]!;
    d.sessions = [{ id: 'session-probe', started: 1700000000000, ended: null, mode: 'probe', queue: [w0.id], index: 0, answered: 0, correct: 0, retries: {}, question: null, planTaskId: '2026-10-24:preview' }];
    d.records = [{ id: 'record-probe', wordId: w1.id, sessionId: 'session-probe', at: 1700000001000, direction: 'en-zh', correct: true, ms: 900, selectedId: null, reason: 'answer', before: 'new', after: 'normal', scheduled: false, rating: 3 }];
    d.wordExposures = [{ id: 'exp-probe', wordId: w0.id, at: 1700000002000, state: 'known', count: 1, counted: true, source: 'preview' } as never];
    d.grammarConcepts = [{ id: 'gc-probe', name: '宾语从句', attempts: 1, correct: 1, mastery: 0.5, retention: 0.5, category: 'clause' } as never];
    d.grammarAttempts = [{ id: 'ga-probe', conceptId: 'gc-probe', at: 1700000003000, correct: true } as never];
    d.sentenceAttempts = [{ id: 'sa-probe', sentence: 'I know that he is right.', createdAt: 1700000004000, durationMs: 1200, targetGrammar: ['clause.object'], steps: [] } as never];
    d.sentences = [{ id: 'sen.probe-01', text: 'I know that he is right.', zh: '我知道他是对的。', sourceType: 'curated', sourceId: 'probe', attribution: 'authored', grammarTags: ['clause.object'], targetWordIds: [], theme: 'probe', difficulty: 2, structure: null, structureProvenance: 'none', createdBy: 'system', createdAt: 1, usedCount: 0, lastUsedAt: 0, notes: '' } as never];
    d.passages = [{ id: 'passage-probe', title: 'Probe', text: 'A short probe passage.', createdAt: 1 } as never];
    d.readingSessions = [{ id: 'reading-probe', passageId: 'passage-probe', at: 1 } as never];
    d.inputSources = [{ id: 'source-probe', title: 'Probe source', createdAt: 1 } as never];
    d.inputSessions = [{ id: 'input-probe', sourceId: 'source-probe', at: 1 } as never];
    d.outputAttempts = [{ id: 'output-probe', wordId: w0.id, at: 1 } as never];
    d.dailyPlans = [{ id: 'plan-probe', date: '2026-10-24', createdAt: 1, initialPlan: [], taskActions: [] } as never];
    d.miniUnits = [{ id: 'unit-probe', title: 'Probe unit', status: 'active', startedAt: 1 } as never];
    d.skillSnapshots = [{ id: 'snapshot-probe', date: '2026-10-24', createdAt: 1 } as never];
    d.weeklyDiagnostics = [{ id: 'weekly-probe', weekOf: '2026-10-19', createdAt: 1 } as never];
    d.libraryItems = [{ id: 'library-probe', savedAt: 1 } as never];
    d.aiGenerations = [{ id: 'ai-probe', kind: 'probe', createdAt: 1, contentHash: 'hash' } as never];
    d.transcripts = [{ id: 'transcript-probe', sourceId: 'source-probe', hash: 'h', createdAt: 1, cues: [] } as never];
    d.inputEvidence = [{ id: 'evidence-probe', sessionId: 'input-probe', sourceId: 'source-probe', evidenceType: 'watching_exposure', at: 1, confidence: 0.4, provenance: 'user_supplied', meta: { minutes: 1 } } as never];
    d.examSpecifications = [{ id: 'spec-probe', applicableYear: 2026, examCategory: 'other' } as never];
    d.examMaterials = [{ id: 'material-probe', createdAt: 1 } as never];
    d.examItems = [{ id: 'item-probe', examCategory: 'other', questionType: 'probe', materialId: null, purpose: 'probe' } as never];
    d.examSessions = [{ id: 'exam-probe', mode: 'probe', status: 'draft', createdAt: 1 } as never];
    d.examLogs = [{ id: 'log-probe', date: '2026-10-24', examCategory: 'other' } as never];
    return d;
}
test('全 store 备份/恢复往返：ID、嵌套字段、可选域与设置都保留', () => {
    const d = richData();
    d.settings.requestRetention = 0.87;
    d.settings.key = 'SECRET-SHOULD-NOT-LEAK';
    d.settings.rememberKey = true;
    const raw = db.backup(d);
    assert.ok(!raw.includes('SECRET-SHOULD-NOT-LEAK'));
    const parsed = JSON.parse(raw) as {
        data: Data;
    };
    for (const name of db.dataStores)
        assert.ok(Array.isArray((parsed.data as unknown as Record<string, unknown>)[name]), `${name} 必须出现在备份中`);
    const restored = db.validateBackup(parsed);
    assert.equal(restored.words.length, 240);
    assert.equal(restored.words[0]!.fsrs?.stability, 1);
    assert.deepEqual(restored.words[0]!.sourceTypes, ['book', 'reading']);
    assert.deepEqual(restored.words[1]!.confusions, { [restored.words[0]!.id]: 1 });
    assert.equal(restored.sessions[0]!.planTaskId, '2026-10-24:preview');
    assert.equal(restored.records[0]!.rating, 3);
    assert.equal((restored.inputEvidence[0]!.meta as {
        minutes: number;
    }).minutes, 1);
    assert.equal(restored.settings.requestRetention, 0.87);
    assert.equal(restored.settings.key, '');
    assert.equal(restored.settings.rememberKey, false);
});
test('恢复写入中途失败会回滚，不会留下半套数据', async () => {
    const original = richData(12);
    await db.openDB();
    await db.replaceData(original);
    const before = await db.loadData();
    const bad = richData(12);
    bad.words[0] = { ...bad.words[0]!, en: 'mutated-before-failure' };
    const poisoned = { id: 'book-poison', name: 'poison', created: 1 } as unknown as {
        id: string;
        name: string;
        created: number;
    };
    Object.defineProperty(poisoned, 'name', { get() { throw new Error('simulated serialization failure'); } });
    bad.books.push(poisoned as never);
    await assert.rejects(db.replaceData(bad), /simulated serialization failure/);
    const after = await db.loadData();
    assert.deepEqual(after.books, before.books);
    assert.deepEqual(after.words, before.words);
    assert.ok(after.words.some(w => w.en === 'probe0'));
    assert.ok(!after.words.some(w => w.en === 'mutated-before-failure'));
});
test('成功恢复后重开数据库仍是同一份完整数据', async () => {
    const d = richData(30);
    await db.replaceData(d);
    db.closeDB();
    await db.openDB();
    const loaded = await db.loadData();
    assert.equal(loaded.words.length, 30);
    assert.equal(loaded.books[0]!.name, '备份压力测试');
    assert.equal(loaded.examLogs.length, 1);
    assert.equal(loaded.sentences[0]!.id, 'sen.probe-01');
});
