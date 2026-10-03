import type { Data, Settings, Word, ReviewRecord, StudySession } from './types.ts';
import { defaults } from './types.ts';
import { validSettings } from './core.ts';
const stores = ['books', 'words', 'records', 'sessions', 'analyses', 'meta'] as const;
let db: IDBDatabase;
export async function openDB(): Promise<void> {
    if (db)
        return;
    db = await new Promise((resolve, reject) => {
        const r = indexedDB.open('vocabulary-memory-v1', 1);
        r.onupgradeneeded = () => {
            for (const name of stores)
                r.result.createObjectStore(name, { keyPath: 'id' });
        };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.onblocked = () => reject(Error('数据库升级被另一个窗口阻塞，请关闭其他窗口'));
    });
    db.onversionchange = () => db.close();
}
export function closeDB() { db?.close(); db = undefined as unknown as IDBDatabase; }
function done(tx: IDBTransaction) { return new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error || Error('保存事务中止')); tx.onerror = () => reject(tx.error || Error('数据保存失败')); }); }
function req<T>(r: IDBRequest<T>) { return new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
export function emptyData(): Data { return { books: [], words: [], records: [], sessions: [], analyses: [], settings: { ...defaults } }; }
export async function loadData(): Promise<Data> { await openDB(); const tx = db.transaction([...stores], 'readonly'); const d = emptyData(); const [books, words, records, sessions, analyses, meta] = await Promise.all(stores.map(s => req(tx.objectStore(s).getAll()))); Object.assign(d, { books, words, records, sessions, analyses }); d.settings = { ...defaults, ...meta.find(x => x.id === 'settings')?.value }; return d; }
export async function replaceData(d: Data): Promise<void> {
    await openDB();
    const tx = db.transaction([...stores], 'readwrite');
    const p = done(tx);
    for (const name of stores) {
        const s = tx.objectStore(name);
        s.clear();
        if (name === 'meta')
            s.put({ id: 'settings', value: storedSettings(d.settings) });
        else
            for (const item of d[name])
                s.put(item);
    }
    await p;
}
const storedSettings = (s: Settings) => ({ ...s, key: s.rememberKey ? s.key : '' });
export async function saveSettings(s: Settings) {
    if (!validSettings(s))
        throw Error('时间阈值必须递增，且不超过120秒');
    const tx = db.transaction('meta', 'readwrite');
    const p = done(tx);
    tx.objectStore('meta').put({ id: 'settings', value: storedSettings(s) });
    await p;
}
export async function putItems(name: Exclude<typeof stores[number], 'meta'>, items: unknown[]) {
    const tx = db.transaction(name, 'readwrite');
    const p = done(tx);
    for (const x of items)
        tx.objectStore(name).put(x);
    await p;
}
export async function saveAnswer(word: Word, record: ReviewRecord, session: StudySession) { const tx = db.transaction(['words', 'records', 'sessions'], 'readwrite'); const p = done(tx); tx.objectStore('words').put(word); tx.objectStore('records').put(record); tx.objectStore('sessions').put(session); await p; }
export function backup(d: Data) { return JSON.stringify({ format: 'vocabulary-memory', version: 1, exportedAt: new Date().toISOString(), data: { ...d, settings: { ...d.settings, key: '', rememberKey: false } } }, null, 2); }
// Validate before starting any destructive transaction. Reject unknown schema versions.
export function validateBackup(value: unknown): Data {
    const fail = (): never => { throw Error('备份结构无效、引用损坏或版本不兼容；现有数据未改动。'); };
    if (!value || typeof value !== 'object')
        return fail();
    const v = value as {
        format: string;
        version: number;
        data: Data;
    };
    if (v.format !== 'vocabulary-memory' || v.version !== 1 || !v.data)
        return fail();
    const d = v.data;
    for (const k of ['books', 'words', 'records', 'sessions', 'analyses'] as const) {
        if (!Array.isArray(d[k]))
            return fail();
        const ids = new Set();
        for (const x of d[k]) {
            if (!x || typeof x.id !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(x.id) || ['__proto__', 'constructor', 'prototype'].includes(x.id) || ids.has(x.id))
                return fail();
            ids.add(x.id);
        }
    }
    if (!d.settings || !validSettings(d.settings))
        return fail();
    const num = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0;
    const levels = ['new', 'unknown', 'vague', 'normal', 'fluent'];
    const dirs = ['en-zh', 'zh-en'];
    const bookIds = new Set(d.books.map(x => x.id));
    const wordIds = new Set(d.words.map(x => x.id));
    const sessionIds = new Set(d.sessions.map(x => x.id));
    for (const b of d.books)
        if (typeof b.name !== 'string' || !num(b.created))
            return fail();
    for (const w of d.words) {
        if (!bookIds.has(w.bookId) || !['en', 'zh', 'pos', 'phonetic', 'example', 'collocation', 'difficulty', 'tags'].every(k => typeof w[k as keyof Word] === 'string') || !w.en.trim() || !w.zh.trim() || !num(w.order))
            return fail();
        if (!w.schedule || !['due', 'last', 'interval', 'step', 'spacedPasses'].every(k => num(w.schedule[k as keyof typeof w.schedule])))
            return fail();
        if (!Number.isInteger(w.schedule.step) || w.schedule.step > 8 || !Number.isInteger(w.schedule.spacedPasses))
            return fail();
        if (!w.state || !levels.includes(w.state.level) || typeof w.state.lastCorrect !== 'boolean' || !['total', 'correct', 'streak', 'errors', 'lapses', 'meanMs', 'lastMs'].every(k => num(w.state[k as keyof typeof w.state])) || w.state.correct > w.state.total)
            return fail();
        if (!['total', 'correct', 'streak', 'errors', 'lapses'].every(k => Number.isInteger(w.state[k as keyof typeof w.state])))
            return fail();
        for (const dir of dirs) {
            const ds = w.state.directions?.[dir as 'en-zh'];
            if (!ds || ![ds.total, ds.correct, ds.meanMs].every(num) || ds.correct > ds.total)
                return fail();
        }
        if (!w.confusions || typeof w.confusions !== 'object' || Array.isArray(w.confusions) || Object.entries(w.confusions).some(([id, n]) => !wordIds.has(id) || !num(n)))
            return fail();
    }
    for (const s of d.sessions) {
        if (!num(s.started) || s.ended !== null && !num(s.ended) || typeof s.mode !== 'string' || !Array.isArray(s.queue) || s.queue.some(id => !wordIds.has(id)) || ![s.index, s.answered, s.correct].every(n => num(n) && Number.isInteger(n)) || s.index > s.queue.length || s.correct > s.answered || !s.retries || Object.entries(s.retries).some(([id, n]) => !wordIds.has(id) || !num(n)))
            return fail();
        const q = s.question;
        if (q && (!wordIds.has(q.wordId) || !dirs.includes(q.direction) || !Array.isArray(q.options) || ![4, 6].includes(q.options.length) || new Set(q.options).size !== q.options.length || !q.options.includes(q.wordId) || q.options.some(id => !wordIds.has(id)) || s.queue[s.index] !== q.wordId))
            return fail();
    }
    for (const r of d.records)
        if (!wordIds.has(r.wordId) || !sessionIds.has(r.sessionId) || !num(r.at) || !num(r.ms) || !dirs.includes(r.direction) || typeof r.correct !== 'boolean' || typeof r.scheduled !== 'boolean' || !levels.includes(r.before) || !levels.includes(r.after) || !['answer', 'unknown', 'timeout'].includes(r.reason) || r.selectedId !== null && !wordIds.has(r.selectedId))
            return fail();
    for (const a of d.analyses)
        if (typeof a.text !== 'string' || typeof a.model !== 'string' || !num(a.at) || !num(a.sampleSize))
            return fail();
    return structuredClone({ ...d, settings: { ...d.settings, key: '', rememberKey: false } });
}
