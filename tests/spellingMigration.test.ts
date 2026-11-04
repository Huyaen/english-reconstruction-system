import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { DB_NAME, DB_VERSION, dataStores, openDB, closeDB, loadData, backup, validateBackup, replaceData, emptyData, putItems, readLocalMeta, writeLocalMeta } from '../src/db.ts';
import { makeWord } from '../src/core.ts';

test('v7→v8 只添加拼写记录，4716 词和所有既有 store 完整保留，禁止旧程序降级打开', async () => {
    const d = emptyData();
    d.books = [{ id: 'shanghai-scale', name: '上海高考英语词书（4716条隔离规模夹具）', created: 1 }];
    d.words = Array.from({ length: 4716 }, (_, i) => makeWord({ en: `word${i}`, zh: `释义${i}` }, d.books[0].id, i));
    const raw = await new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open(DB_NAME, 7);
        r.onupgradeneeded = () => { for (const name of [...dataStores.filter(n => n !== 'spellingAttempts'), 'meta']) r.result.createObjectStore(name, { keyPath: 'id' }); };
        r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
    });
    await new Promise<void>((resolve, reject) => {
        const tx = raw.transaction(['books', 'words', 'meta'], 'readwrite');
        d.books.forEach(b => tx.objectStore('books').put(b));
        d.words.forEach(w => tx.objectStore('words').put(w));
        tx.objectStore('meta').put({ id: 'settings', value: d.settings });
        tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error);
    }); raw.close();
    await openDB(); const upgraded = await loadData();
    assert.equal(DB_VERSION, 8);
    const byId = (words: typeof d.words) => [...words].sort((a, b) => a.id.localeCompare(b.id));
    assert.deepEqual(byId(upgraded.words), byId(d.words));
    assert.deepEqual(upgraded.books, d.books);
    assert.deepEqual(upgraded.spellingAttempts, []);
    const v7 = JSON.parse(backup(upgraded)); v7.version = 7; delete v7.data.spellingAttempts;
    for (let version = 1; version <= 7; version++) {
        const legacy = structuredClone(v7); legacy.version = version;
        assert.deepEqual(validateBackup(legacy).spellingAttempts, [], `v${version} 备份安全识别`);
    }
    const restored = validateBackup(v7); assert.deepEqual(restored.spellingAttempts, []);
    await replaceData(restored); assert.equal((await loadData()).words.length, 4716);
    closeDB();
    await assert.rejects(new Promise((resolve, reject) => { const r = indexedDB.open(DB_NAME, 7); r.onsuccess = () => { r.result.close(); resolve(true); }; r.onerror = () => reject(r.error); }), { name: 'VersionError' });
});

test('拼写记录进入新版完整备份，非法记录拒绝恢复，旧 FSRS 与 ReviewRecord 保持原样', async () => {
    await openDB(); const d = await loadData();
    const before = structuredClone(d.words);
    const attempt = { id: 'spelling-one', sessionId: 'spell-session', wordId: d.words[0].id, at: 10, input: 'word0', expected: 'word0', correct: true, assisted: false, retry: false, ms: 1000, normalizationVersion: 1 };
    await putItems('spellingAttempts', [attempt]);
    const loaded = await loadData(); assert.deepEqual(loaded.words, before); assert.deepEqual(loaded.records, d.records);
    const text = backup(loaded); const restored = validateBackup(JSON.parse(text));
    assert.deepEqual(restored.spellingAttempts, [attempt]);
    const bad = JSON.parse(text); bad.data.spellingAttempts[0].assisted = 'yes'; assert.throws(() => validateBackup(bad));
    bad.data.spellingAttempts[0].assisted = false; bad.data.spellingAttempts[0].wordId = 'missing'; assert.throws(() => validateBackup(bad));
    await writeLocalMeta('auto-backup', { enabled: true, owner: 'local-device', files: [], events: [] });
    await replaceData(restored); assert.deepEqual((await loadData()).spellingAttempts, [attempt]);
    assert.equal((await readLocalMeta<{ owner: string }>('auto-backup'))?.owner, 'local-device');
    assert.ok(!text.includes('local-device')); closeDB();
});
