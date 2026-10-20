import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { DB_VERSION, openDB, closeDB, loadData, replaceData, backup, validateBackup, emptyData, DB_NAME } from '../src/db.ts';
import { dueWords, recordsForWord, exposuresForWord, exposureStats, activeMiniUnit, planForDate, latestSnapshots, unfinishedSessions } from '../src/model.ts';
import { defaults, fsrsDefaults } from '../src/types.ts';
const legacyStores = ['books', 'words', 'records', 'sessions', 'analyses', 'meta'];
const v2Stores = ['wordExposures', 'grammarConcepts', 'grammarAttempts', 'sentenceAttempts', 'passages', 'readingSessions', 'inputSources', 'inputSessions', 'outputAttempts', 'dailyPlans', 'miniUnits', 'skillSnapshots', 'weeklyDiagnostics', 'libraryItems'];
// Phase 4 新增的 store（v4 additive）
const v4Stores = ['sentences'];
// v5（Phase 6）：AI 生成记录 —— 迁移只做 additive
const v5Stores = ['aiGenerations'];
function openRaw(version?: number): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const r = version === undefined ? indexedDB.open(DB_NAME) : indexedDB.open(DB_NAME, version);
        if (version === 1)
            r.onupgradeneeded = () => {
                for (const n of legacyStores)
                    r.result.createObjectStore(n, { keyPath: 'id' });
            };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
    });
}
const legacyBook = { id: 'book-1', name: '旧词书', created: 1000 };
const legacyState = { total: 3, correct: 2, streak: 1, errors: 1, lapses: 0, meanMs: 2100, lastMs: 1900, lastCorrect: true, level: 'vague', directions: { 'en-zh': { total: 2, correct: 2, meanMs: 2000 }, 'zh-en': { total: 1, correct: 0, meanMs: 2300 } } };
const freshState = { total: 0, correct: 0, streak: 0, errors: 0, lapses: 0, meanMs: 0, lastMs: 0, lastCorrect: false, level: 'new', directions: { 'en-zh': { total: 0, correct: 0, meanMs: 0 }, 'zh-en': { total: 0, correct: 0, meanMs: 0 } } };
const legacyWord = { id: 'word-1', bookId: 'book-1', en: 'abandon', zh: '放弃', pos: 'v.', phonetic: '', example: '', collocation: '', difficulty: '', tags: '', order: 0, state: legacyState, schedule: { due: 500, last: 400, interval: 600000, step: 0, spacedPasses: 0 }, confusions: {} };
const legacyWord2 = { ...legacyWord, id: 'word-2', en: 'adequate', zh: '充足的', order: 1, state: freshState, schedule: { due: 0, last: 0, interval: 0, step: 0, spacedPasses: 0 } };
const legacyRecord = { id: 'rec-1', wordId: 'word-1', sessionId: 'sess-1', at: 400, direction: 'en-zh', correct: true, ms: 1500, selectedId: 'word-1', reason: 'answer', before: 'new', after: 'vague', scheduled: false };
const legacySession = { id: 'sess-1', started: 100, ended: 900, mode: 'quick', queue: ['word-1'], index: 1, answered: 1, correct: 1, retries: {}, question: null };
async function seedV1() {
    const raw = await openRaw(1);
    await new Promise<void>((resolve, reject) => {
        const tx = raw.transaction([...legacyStores], 'readwrite');
        tx.objectStore('books').put(legacyBook);
        tx.objectStore('words').put(legacyWord);
        tx.objectStore('words').put(legacyWord2);
        tx.objectStore('records').put(legacyRecord);
        tx.objectStore('sessions').put(legacySession);
        tx.objectStore('meta').put({ id: 'settings', value: { ...defaults } });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    raw.close();
}
test('v1 → v2 migration preserves all legacy data and adds new schema', async () => {
    await seedV1();
    await openDB();
    const d = await loadData();
    assert.equal(d.books.length, 1);
    assert.equal(d.words.length, 2);
    const w = d.words.find(x => x.id === 'word-1')!;
    assert.equal(w.en, 'abandon');
    assert.equal(w.zh, '放弃');
    assert.equal(w.state.level, 'vague');
    assert.equal(w.state.correct, 2);
    assert.equal(w.schedule.due, 500);
    assert.equal(w.recognitionScore, 0);
    assert.deepEqual(w.sourceTypes, ['book']);
    assert.equal(w.previewedAt, 0);
    assert.deepEqual(w.fsrs, fsrsDefaults);
    assert.equal(w.previewResult, '');
    assert.equal(d.records.length, 1);
    assert.equal(d.sessions.length, 1);
    assert.ok(d.migration && d.migration.from === 1 && d.migration.to === DB_VERSION && d.migration.at > 0);
    assert.equal(d.wordExposures.length, 0);
    assert.equal(d.libraryItems.length, 0);
    const raw = await openRaw();
    assert.ok([...v2Stores, ...v4Stores, ...v5Stores].every(n => raw.objectStoreNames.contains(n)));
    assert.ok(raw.transaction('words').objectStore('words').indexNames.contains('bookId'));
    assert.ok(raw.transaction('words').objectStore('words').indexNames.contains('schedule.due'));
    assert.ok(raw.transaction('words').objectStore('words').indexNames.contains('fsrs.due'));
    assert.ok(raw.transaction('wordExposures').objectStore('wordExposures').indexNames.contains('wordId,at'));
    assert.ok(raw.transaction('sentences').objectStore('sentences').indexNames.contains('grammarTags'));
    // v4 迁移不得改动既有数据
    assert.equal(d.wordExposures.length, 0);
    assert.equal(d.sentences.length, 0);
    raw.close();
});
test('migration is idempotent across reopen (no duplicates, data stable)', async () => {
    closeDB();
    await openDB();
    const d = await loadData();
    assert.equal(d.words.length, 2);
    assert.equal(d.words.find(x => x.id === 'word-1')!.state.total, 3);
    assert.equal(d.migration!.from, 1);
    const raw = await openRaw();
    const meta = await new Promise<any[]>(resolve => { const r = raw.transaction('meta').objectStore('meta').getAll(); r.onsuccess = () => resolve(r.result); });
    assert.equal(meta.filter(x => x.id === 'migration').length, 1);
    raw.close();
});
test('v1 backup restores into v2 database (new fields backfilled)', async () => {
    const v1backup = { format: 'vocabulary-memory', version: 1, exportedAt: 'test', data: { books: [legacyBook], words: [legacyWord, legacyWord2], records: [legacyRecord], sessions: [legacySession], analyses: [], settings: { ...defaults, key: '', rememberKey: false } } };
    const restored = validateBackup(JSON.parse(JSON.stringify(v1backup)));
    assert.equal(restored.words.length, 2);
    assert.equal(restored.words.find(x => x.id === 'word-1')!.recognitionScore, 0);
    assert.equal(restored.words.find(x => x.id === 'word-1')!.previewResult, '');
    assert.deepEqual(restored.words.find(x => x.id === 'word-1')!.fsrs, fsrsDefaults);
    assert.deepEqual(restored.wordExposures, []);
    await replaceData(restored);
    const d = await loadData();
    assert.equal(d.words.length, 2);
    assert.equal(d.records.length, 1);
    assert.equal(d.records[0].ms, 1500);
});
test('v2 backup roundtrip carries new stores; validator rejects dangling references', async () => {
    const d = await loadData();
    d.wordExposures.push({ id: 'exp-1', wordId: 'word-1', at: 1000, sourceType: 'reading', sourceId: 'p-1', state: 'unknown', sentence: 'abandon it', counted: true });
    d.wordExposures.push({ id: 'exp-2', wordId: 'word-1', at: 2000, sourceType: 'reading', sourceId: 'p-1', state: 'known', sentence: 'abandon it', counted: true });
    d.passages.push({ id: 'p-1', title: 'Passage', text: 'text', sourceType: 'import', sourceUrl: '', topic: '', wordCount: 100, difficulty: '', createdAt: 900 });
    d.readingSessions.push({ id: 'rs-1', passageId: 'p-1', wordCount: 100, durationMs: 60000, unknownWords: ['abandon'], vagueWords: [], unknownRate: 0.01, firstPassComprehension: null, secondPassComprehension: null, readingSpeed: 100, structureErrors: 0, translationDependence: 0, summary: '', stage: 1, at: 1000 });
    d.libraryItems.push({ id: 'lib-1', title: 'Article', kind: 'article', url: '', topic: '', difficultyEstimate: null, status: 'saved', notes: '', savedAt: 1100 });
    d.miniUnits.push({ id: 'unit-1', theme: 'Roman Republic', dayIndex: 1, anchorMaterialId: '', targetWords: ['abandon'], targetGrammar: ['relative clause'], difficultyTarget: null, status: 'active', startedAt: 1200, completedAt: null, dayLog: [] });
    d.skillSnapshots.push({ id: 'snap-1', date: '2026-10-04', stableVocabulary: 1, d1Retention: null, d7Retention: null, d30Retention: null, avgRetrievalMs: 1500, readingUnknownRate: 0.01, readingSpeed: 100, sentenceParsing: null, translationDependence: null, captionedComprehension: null, uncaptionedComprehension: null, outputSummary: null, createdAt: 1300 });
    d.dailyPlans.push({ id: '2026-10-04', date: '2026-10-04', availableMinutes: 45, energyState: 'normal', yesterdayRecallResult: null, miniUnitId: 'unit-1', initialPlan: [], adjustments: [], actualExecution: null, completedModules: [], closingLoop: null, createdAt: 1400, completedAt: null });
    await replaceData(d);
    const loaded = await loadData();
    assert.equal(loaded.wordExposures.length, 2);
    const encoded = backup(loaded);
    const parsed = JSON.parse(encoded);
    assert.equal(parsed.version, DB_VERSION);
    const validated = validateBackup(parsed);
    assert.equal(validated.wordExposures.length, 2);
    assert.equal(validated.miniUnits.length, 1);
    const broken = JSON.parse(encoded);
    broken.data.wordExposures[0].wordId = 'missing';
    assert.throws(() => validateBackup(broken));
    await replaceData(emptyData());
    assert.equal((await loadData()).wordExposures.length, 0);
    await replaceData(validated);
    const restored = await loadData();
    assert.equal(restored.wordExposures.length, 2);
    assert.equal(restored.passages.length, 1);
    assert.equal(restored.dailyPlans.length, 1);
});
test('model query layer answers from v2 indexes', async () => {
    const due = await dueWords(1500);
    assert.deepEqual(due.map(w => w.id), ['word-1']);
    assert.equal((await recordsForWord('word-1')).length, 1);
    const exps = await exposuresForWord('word-1');
    assert.equal(exps.length, 2);
    const stats = await exposureStats('word-1');
    assert.equal(stats.total, 2);
    assert.deepEqual(stats.byState, { unknown: 1, known: 1 });
    assert.equal((await activeMiniUnit())!.id, 'unit-1');
    assert.equal((await planForDate('2026-10-04'))!.id, '2026-10-04');
    const snaps = await latestSnapshots(5);
    assert.equal(snaps.length, 1);
    assert.equal(snaps[0].id, 'snap-1');
    assert.equal((await unfinishedSessions()).length, 0);
});
test('v2 → v4 migration backfills FSRS defaults (fixture), adds sentences store and is idempotent', async () => {
    closeDB();
    await new Promise<void>((resolve, reject) => { const r = indexedDB.deleteDatabase(DB_NAME); r.onsuccess = () => resolve(); r.onerror = () => reject(r.error); r.onblocked = () => resolve(); });
    const v2names = [...legacyStores, ...v2Stores];
    const raw = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open(DB_NAME, 2);
        r.onupgradeneeded = () => {
            for (const n of v2names)
                r.result.createObjectStore(n, { keyPath: 'id' });
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
    });
    const v2Word = { ...legacyWord, recognitionScore: 12, activeRecallScore: 5, productiveScore: 0, exposureCount: 2, contextExposureCount: 1, productionEvidence: 0, previewedAt: 111, lastEncounteredAt: 222, sourceTypes: ['book'] };
    await new Promise<void>((resolve, reject) => {
        const tx = raw.transaction(['books', 'words', 'records', 'sessions', 'meta'], 'readwrite');
        tx.objectStore('books').put(legacyBook);
        tx.objectStore('words').put(v2Word);
        tx.objectStore('records').put(legacyRecord);
        tx.objectStore('sessions').put(legacySession);
        tx.objectStore('meta').put({ id: 'settings', value: { ...defaults } });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
    raw.close();
    await openDB();
    const d = await loadData();
    const w = d.words.find(x => x.id === 'word-1')!;
    assert.equal(w.state.correct, 2);
    assert.equal(w.recognitionScore, 12);
    assert.equal(w.previewedAt, 111);
    assert.deepEqual(w.fsrs, fsrsDefaults);
    assert.equal(w.previewResult, '');
    assert.ok(d.migration && d.migration.from === 2 && d.migration.to === DB_VERSION);
    const check = await openRaw();
    assert.ok(check.objectStoreNames.contains('sentences'), 'v4 迁移必须新增 sentences store');
    assert.ok(check.transaction('words').objectStore('words').indexNames.contains('fsrs.due'));
    check.close();
    closeDB();
    await openDB();
    const again = await loadData();
    assert.deepEqual(again.words.find(x => x.id === 'word-1')!.fsrs, fsrsDefaults);
    assert.equal(again.records.length, 1);
    assert.equal(again.words.length, 1);
});
