import type { Data, Settings, Word, WordExposure, GrammarAttempt, GrammarConcept, SentenceAttempt, SentenceRecord, ReviewRecord, StudySession, MigrationRecord } from './types.ts';
import { defaults, fsrsDefaults } from './types.ts';
import { validSettings } from './core.ts';
// —— 数据库版本与迁移框架（Phase 1）——
// 设计依据：REFERENCE_RESEARCH.md §6.1（Dexie 版本化 schema 思想）与 §2.1（Lute migration 模式）。
// 原则：只加不删（additive only）；逐版本迁移；升级事务原子性（失败自动回滚，旧数据安全）。
export const DB_NAME = 'vocabulary-memory-v1';
export const DB_VERSION = 7;
const legacyStores = ['books', 'words', 'records', 'sessions', 'analyses', 'meta'] as const;
const legacyDataStores = ['books', 'words', 'records', 'sessions', 'analyses'] as const;
const v2Stores = ['wordExposures', 'grammarConcepts', 'grammarAttempts', 'sentenceAttempts', 'passages', 'readingSessions', 'inputSources', 'inputSessions', 'outputAttempts', 'dailyPlans', 'miniUnits', 'skillSnapshots', 'weeklyDiagnostics', 'libraryItems'] as const;
// v4（Phase 4）：句源与 gold 结构需要独立 store（句库不属于任何既有 store 的形状）
const v4Stores = ['sentences'] as const;
// v5（Phase 6）：AI 生成记录与用量（additive only；旧 store 与数据完全不动）
const v5Stores = ['aiGenerations'] as const;
// v6（Phase 8）：真实输入域 —— 字幕（含时间轴）与输入证据账本（additive only）
const v6Stores = ['transcripts', 'inputEvidence'] as const;
// v7（Phase 11）：考试规格 / 材料 / 题目 / 会话 / 学校考试记录（additive only）
const v7Stores = ['examSpecifications', 'examMaterials', 'examItems', 'examSessions', 'examLogs'] as const;
// 所有 Learning Model store（v2 + v4）：ID 安全性与唯一性校验共用
const modelStores = [...v2Stores, ...v4Stores, ...v5Stores, ...v6Stores, ...v7Stores] as const;
export const dataStores = [...legacyDataStores, ...modelStores] as const;
export const stores = [...dataStores, 'meta'] as const;
type StoreName = (typeof stores)[number];
export type DataStoreName = Exclude<StoreName, 'meta'>;
// v2 二级索引：避免后续模块全表扫描（PROJECT_SPEC §96）
type IndexSpec = readonly [
    string,
    string | string[],
    IDBIndexParameters?
];
const indexSpecs: Partial<Record<StoreName, readonly IndexSpec[]>> = {
    words: [['bookId', 'bookId'], ['schedule.due', 'schedule.due'], ['fsrs.due', 'fsrs.due']],
    records: [['wordId,at', ['wordId', 'at']], ['at', 'at']],
    wordExposures: [['wordId,at', ['wordId', 'at']], ['at', 'at']],
    grammarConcepts: [['parentId', 'parentId'], ['nextReviewAt', 'nextReviewAt']],
    grammarAttempts: [['conceptId,at', ['conceptId', 'at']]],
    sentenceAttempts: [['at', 'at']],
    passages: [['createdAt', 'createdAt']],
    readingSessions: [['passageId', 'passageId'], ['at', 'at']],
    inputSources: [['createdAt', 'createdAt']],
    inputSessions: [['at', 'at']],
    outputAttempts: [['at', 'at']],
    dailyPlans: [['date', 'date']],
    miniUnits: [['status', 'status'], ['startedAt', 'startedAt']],
    skillSnapshots: [['date', 'date']],
    weeklyDiagnostics: [['weekOf', 'weekOf']],
    libraryItems: [['savedAt', 'savedAt']],
    // v4：句库索引（grammarTags 为数组 → multiEntry，便于按概念反查句子）
    sentences: [['sourceType', 'sourceType'], ['createdAt', 'createdAt'], ['grammarTags', 'grammarTags', { multiEntry: true }]],
    // v5：AI 生成记录（按种类/时间/内容指纹检索；指纹用于去重与恢复）
    aiGenerations: [['kind', 'kind'], ['createdAt', 'createdAt'], ['contentHash', 'contentHash']],
    // v6：字幕与输入证据
    transcripts: [['sourceId', 'sourceId'], ['hash', 'hash'], ['createdAt', 'createdAt']],
    inputEvidence: [['sessionId', 'sessionId'], ['sourceId', 'sourceId'], ['at', 'at'], ['evidenceType', 'evidenceType']],
    // v7：考试域索引
    examSpecifications: [['applicableYear', 'applicableYear'], ['examCategory', 'examCategory']],
    examMaterials: [['createdAt', 'createdAt']],
    examItems: [['examCategory', 'examCategory'], ['questionType', 'questionType'], ['materialId', 'materialId'], ['purpose', 'purpose']],
    examSessions: [['mode', 'mode'], ['status', 'status'], ['createdAt', 'createdAt']],
    examLogs: [['date', 'date'], ['examCategory', 'examCategory']],
};
// 旧词条缺少 v2 字段时回填默认值；已具备字段的词原样返回（幂等，可反复调用）
export function withV2WordDefaults(w: Word): Word {
    if (w.recognitionScore !== undefined && w.sourceTypes !== undefined)
        return w;
    const out = { ...w };
    out.recognitionScore ??= 0;
    out.activeRecallScore ??= 0;
    out.productiveScore ??= 0;
    out.exposureCount ??= 0;
    out.contextExposureCount ??= 0;
    out.productionEvidence ??= 0;
    out.previewedAt ??= 0;
    out.lastEncounteredAt ??= 0;
    out.sourceTypes ??= ['book'];
    return out;
}
// v3：Word 回填 FSRS 状态与 Preview 结果（幂等）
export function withV3WordDefaults(w: Word): Word {
    if (w.fsrs !== undefined && w.previewResult !== undefined)
        return w;
    const out = { ...w };
    out.fsrs ??= { ...fsrsDefaults };
    out.previewResult ??= '';
    return out;
}
export function withWordDefaults(w: Word): Word { return withV3WordDefaults(withV2WordDefaults(w)); }
// 把任意来源（旧备份、旧数据）规范化为完整的 v2 Data 形状
export function normalizeData(d: Data): Data {
    const bag = d as unknown as Record<string, unknown>;
    for (const name of modelStores)
        if (!Array.isArray(bag[name]))
            bag[name] = [];
    d.words = d.words.map(withWordDefaults);
    return d;
}
let db: IDBDatabase;
function runBackfills(tx: IDBTransaction, fns: Array<(w: Word) => Word>) {
    const step = (i: number) => {
        if (i >= fns.length)
            return;
        const request = tx.objectStore('words').openCursor();
        request.onsuccess = () => {
            const cursor = request.result;
            if (!cursor) {
                step(i + 1);
                return;
            }
            const updated = fns[i](cursor.value as Word);
            if (updated !== cursor.value)
                cursor.update(updated);
            cursor.continue();
        };
    };
    step(0);
}
function runMigration(database: IDBDatabase, tx: IDBTransaction, oldVersion: number) {
    if (oldVersion < 1)
        for (const name of legacyStores as readonly string[])
            if (!database.objectStoreNames.contains(name))
                database.createObjectStore(name, { keyPath: 'id' });
    if (oldVersion < 2) {
        for (const name of v2Stores as readonly string[])
            if (!database.objectStoreNames.contains(name))
                database.createObjectStore(name, { keyPath: 'id' });
    }
    // v4（Phase 4）：additive — 只新增 sentences store，不动既有 store 与数据
    if (oldVersion < 4) {
        for (const name of v4Stores as readonly string[])
            if (!database.objectStoreNames.contains(name))
                database.createObjectStore(name, { keyPath: 'id' });
    }
    // v6（Phase 8）：additive — 字幕与输入证据
    if (oldVersion < 6) {
        for (const name of v6Stores as readonly string[])
            if (!database.objectStoreNames.contains(name))
                database.createObjectStore(name, { keyPath: 'id' });
    }
    // v5（Phase 6）：additive — AI 生成记录
    if (oldVersion < 5) {
        for (const name of v5Stores as readonly string[])
            if (!database.objectStoreNames.contains(name))
                database.createObjectStore(name, { keyPath: 'id' });
    }
    // v7（Phase 11）：additive — 考试域；不迁移、不改写任何旧记录
    if (oldVersion < 7) {
        for (const name of v7Stores as readonly string[])
            if (!database.objectStoreNames.contains(name))
                database.createObjectStore(name, { keyPath: 'id' });
    }
    // 数据回填：逐版本顺序执行（串行游标，避免并行游标互相覆盖；幂等）
    const backfills: Array<(w: Word) => Word> = [];
    if (oldVersion < 2)
        backfills.push(withV2WordDefaults);
    if (oldVersion < 3)
        backfills.push(withV3WordDefaults);
    runBackfills(tx, backfills);
    // 索引同步：对当前 schema 中已存在的 store 补齐缺失索引（幂等；新增索引只改 indexSpecs 即可）
    for (const [name, specs] of Object.entries(indexSpecs)) {
        if (!database.objectStoreNames.contains(name))
            continue;
        const store = tx.objectStore(name);
        for (const spec of specs ?? []) {
            const [index, keyPath, options] = spec;
            if (!store.indexNames.contains(index))
                store.createIndex(index, keyPath as string | string[], options);
        }
    }
    // 仅真实升级（oldVersion ≥ 1）写迁移记录；全新安装不写；同一 id 覆盖，只保留最近一次
    if (oldVersion >= 1)
        tx.objectStore('meta').put({ id: 'migration', value: { from: oldVersion, to: DB_VERSION, at: Date.now() } as MigrationRecord });
}
export async function openDB(): Promise<void> {
    if (db)
        return;
    db = await new Promise((resolve, reject) => {
        const r = indexedDB.open(DB_NAME, DB_VERSION);
        r.onupgradeneeded = e => runMigration(r.result, r.transaction!, (e as IDBVersionChangeEvent).oldVersion);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.onblocked = () => reject(Error('数据库升级被另一个窗口阻塞，请关闭其他窗口'));
    });
    db.onversionchange = () => db.close();
}
export function getDB(): IDBDatabase { return db; }
export async function readLocalMeta<T>(id: string): Promise<T | undefined> {
    await openDB();
    const row = await req(db.transaction('meta', 'readonly').objectStore('meta').get(id));
    return row?.value as T | undefined;
}
export async function writeLocalMeta(id: string, value: unknown): Promise<void> {
    const tx = db.transaction('meta', 'readwrite'); const p = done(tx);
    tx.objectStore('meta').put({ id, value }); await p;
}
let studySaved: (event: string) => void = () => {};
export function onStudySaved(listener: (event: string) => void) { studySaved = listener; }
function completedStudy(session: StudySession) {
    if (session.ended && session.index >= session.queue.length && session.answered > 0)
        studySaved(`vocab:${session.id}`);
}
export function closeDB() { db?.close(); db = undefined as unknown as IDBDatabase; }
function done(tx: IDBTransaction) { return new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onabort = () => reject(tx.error || Error('保存事务中止')); tx.onerror = () => reject(tx.error || Error('数据保存失败')); }); }
function req<T>(r: IDBRequest<T>) { return new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
export function emptyData(): Data { return { books: [], words: [], records: [], sessions: [], analyses: [], settings: { ...defaults }, wordExposures: [], grammarConcepts: [], grammarAttempts: [], sentenceAttempts: [], sentences: [], passages: [], readingSessions: [], inputSources: [], inputSessions: [], outputAttempts: [], dailyPlans: [], miniUnits: [], skillSnapshots: [], weeklyDiagnostics: [], libraryItems: [], aiGenerations: [], transcripts: [], inputEvidence: [], examSpecifications: [], examMaterials: [], examItems: [], examSessions: [], examLogs: [], migration: null }; }
export async function loadData(): Promise<Data> {
    await openDB();
    const tx = db.transaction([...stores], 'readonly');
    const d = emptyData();
    await Promise.all(stores.map(async (name) => {
        const rows = await req(tx.objectStore(name).getAll());
        if (name === 'meta') {
            d.settings = { ...defaults, ...(rows.find(x => x.id === 'settings') as {
                    value?: Settings;
                } | undefined)?.value };
            d.migration = (rows.find(x => x.id === 'migration') as {
                value?: MigrationRecord;
            } | undefined)?.value ?? null;
        }
        else
            (d as unknown as Record<string, unknown>)[name] = rows;
    }));
    return d;
}
export async function replaceData(d: Data): Promise<void> {
    await openDB();
    const tx = db.transaction([...stores], 'readwrite');
    const p = done(tx);
    try {
        const bag = d as unknown as Record<string, unknown[]>;
        for (const name of stores) {
            const s = tx.objectStore(name);
            s.clear();
            if (name === 'meta')
                s.put({ id: 'settings', value: storedSettings(d.settings) });
            else
                for (const item of bag[name] ?? [])
                    s.put(item);
        }
    }
    catch (e) {
        // 恢复是破坏性写入：任何一项无法序列化/写入时，必须显式回滚整个事务，
        // 不能让已 clear 的 store 先提交、后面的 store 再失败，留下半套数据。
        try {
            tx.abort();
        }
        catch { }
        await p.catch(() => { });
        throw e;
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
export async function putItems(name: DataStoreName, items: unknown[]) {
    const tx = db.transaction(name, 'readwrite');
    const p = done(tx);
    for (const x of items)
        tx.objectStore(name).put(x);
    await p;
    if (name === 'sessions') for (const s of items) completedStudy(s as StudySession);
}
export async function saveAnswer(word: Word, record: ReviewRecord, session: StudySession) { const tx = db.transaction(['words', 'records', 'sessions'], 'readwrite'); const p = done(tx); tx.objectStore('words').put(word); tx.objectStore('records').put(record); tx.objectStore('sessions').put(session); await p; completedStudy(session); }
// Preview 结果落盘（Phase 2.6）：word 与可选 exposure 单事务写入
export async function savePreview(word: Word, exposure: WordExposure | null) {
    const names = exposure ? ['words', 'wordExposures'] : ['words'];
    const tx = db.transaction(names, 'readwrite');
    const p = done(tx);
    tx.objectStore('words').put(word);
    if (exposure)
        tx.objectStore('wordExposures').put(exposure);
    await p;
}
// Phase 4：句证据单事务写入（attempt + grammar attempts + concept 更新 + 句使用统计）
export async function saveSentenceEvidence(attempt: SentenceAttempt, grammarAttempts: GrammarAttempt[], concepts: GrammarConcept[], sentence?: SentenceRecord | null) {
    const names: DataStoreName[] = ['sentenceAttempts', 'grammarAttempts', 'grammarConcepts'];
    if (sentence)
        names.push('sentences');
    const tx = db.transaction(names, 'readwrite');
    const p = done(tx);
    tx.objectStore('sentenceAttempts').put(attempt);
    for (const a of grammarAttempts)
        tx.objectStore('grammarAttempts').put(a);
    for (const c of concepts)
        tx.objectStore('grammarConcepts').put(c);
    if (sentence)
        tx.objectStore('sentences').put(sentence);
    await p;
}
export function backup(d: Data) {
    const data: Record<string, unknown> = {};
    for (const name of dataStores)
        data[name] = (d as unknown as Record<string, unknown>)[name] ?? [];
    data.settings = backupSettings(d.settings);
    return JSON.stringify({ format: 'vocabulary-memory', version: DB_VERSION, exportedAt: new Date().toISOString(), data }, null, 2);
}
// 先校验、后进入破坏性事务。v1/v2 备份都可读入；未知版本拒绝。
export function validateBackup(value: unknown): Data {
    const fail = (): never => { throw Error('备份结构无效、引用损坏或版本不兼容；现有数据未改动。'); };
    if (!value || typeof value !== 'object')
        return fail();
    const v = value as {
        format: string;
        version: number;
        data: Data;
    };
    if (v.format !== 'vocabulary-memory' || !Number.isInteger(v.version) || v.version < 1 || v.version > DB_VERSION || !v.data)
        return fail();
    const d = v.data;
    for (const k of ['books', 'words', 'records', 'sessions', 'analyses'] as const) {
        if (!Array.isArray(d[k]))
            return fail();
        const ids = new Set();
        for (const x of d[k]) {
            if (!x || typeof x.id !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(x.id) || ['__proto__', 'constructor', 'prototype'].includes(x.id) || ids.has(x.id))
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
        // v2 新增字段：存在时类型必须正确（缺省由 normalizeData 回填）
        for (const k of ['recognitionScore', 'activeRecallScore', 'productiveScore', 'exposureCount', 'contextExposureCount', 'productionEvidence', 'previewedAt', 'lastEncounteredAt'] as const)
            if (w[k] !== undefined && !num(w[k]))
                return fail();
        if (w.sourceTypes !== undefined && (!Array.isArray(w.sourceTypes) || w.sourceTypes.some(t => typeof t !== 'string' || t.length > 64)))
            return fail();
        if (w.previewResult !== undefined && typeof w.previewResult !== 'string')
            return fail();
        if (w.fsrs !== undefined && (typeof w.fsrs !== 'object' || w.fsrs === null || !['stability', 'difficulty', 'state', 'reps', 'lapses', 'due', 'lastReview', 'scheduledDays', 'learningSteps'].every(k => num((w.fsrs as unknown as Record<string, unknown>)[k]))))
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
    for (const r of d.records)
        if (r.rating !== undefined && !(Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 4))
            return fail();
    for (const a of d.analyses)
        if (typeof a.text !== 'string' || typeof a.model !== 'string' || !num(a.at) || !num(a.sampleSize))
            return fail();
    // v2 stores：项 ID 安全性与唯一性
    const bag = d as unknown as Record<string, unknown>;
    for (const name of modelStores) {
        const arr = bag[name] ?? [];
        if (!Array.isArray(arr))
            return fail();
        const ids = new Set();
        for (const x of arr) {
            const id = (x as {
                id?: unknown;
            } | null)?.id;
            if (!x || typeof x !== 'object' || typeof id !== 'string' || !/^[a-zA-Z0-9._:-]{1,128}$/.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id) || ids.has(id))
                return fail();
            ids.add(id);
        }
    }
    // v2 关键引用/字段抽查
    for (const e of (bag['wordExposures'] ?? []) as WordExposure[])
        if (!wordIds.has(e.wordId) || !num(e.at) || !['known', 'vague', 'unknown', 'guessed'].includes(e.state))
            return fail();
    for (const a of (bag['grammarAttempts'] ?? []) as GrammarAttempt[])
        if (typeof a.conceptId !== 'string' || !num(a.at) || typeof a.correct !== 'boolean')
            return fail();
    const SOURCE_TYPES = ['curated', 'user', 'saved', 'real-material', 'reading', 'ai'];
    const PROVENANCE = ['gold', 'heuristic', 'manual', 'none'];
    for (const s of (bag['sentences'] ?? []) as SentenceRecord[]) {
        if (typeof s.text !== 'string' || !s.text.trim() || s.text.length > 2000)
            return fail();
        if (typeof s.zh !== 'string')
            return fail();
        if (!SOURCE_TYPES.includes(s.sourceType) || !['system', 'user', 'ai'].includes(s.createdBy))
            return fail();
        if (!PROVENANCE.includes(s.structureProvenance))
            return fail();
        if (!Array.isArray(s.grammarTags) || s.grammarTags.some(t => typeof t !== 'string' || t.length > 64))
            return fail();
        if (!Array.isArray(s.targetWordIds) || s.targetWordIds.some(id => typeof id !== 'string'))
            return fail();
        if (!num(s.createdAt) || !num(s.usedCount) || !num(s.lastUsedAt))
            return fail();
        if (s.glossary !== undefined) {
            if (typeof s.glossary !== 'object' || Array.isArray(s.glossary) || s.glossary === null)
                return fail();
            if (Object.entries(s.glossary).some(([k, v]) => !k || typeof v !== 'string'))
                return fail();
        }
    }
    for (const c of (bag['grammarConcepts'] ?? []) as GrammarConcept[]) {
        if (typeof c.name !== 'string' || !num(c.attempts) || !num(c.correct) || c.correct > c.attempts)
            return fail();
        if (!num(c.mastery) || c.mastery > 1 || !num(c.retention) || c.retention > 1)
            return fail();
        if (c.prerequisiteIds !== undefined && (!Array.isArray(c.prerequisiteIds) || c.prerequisiteIds.some(id => typeof id !== 'string' || id.length > 64)))
            return fail();
        if (c.category !== undefined && typeof c.category !== 'string')
            return fail();
    }
    for (const a of (bag['sentenceAttempts'] ?? []) as SentenceAttempt[]) {
        if (typeof a.sentence !== 'string' || !num(a.createdAt) || !num(a.durationMs))
            return fail();
        if (a.targetGrammar !== undefined && (!Array.isArray(a.targetGrammar) || a.targetGrammar.some(t => typeof t !== 'string')))
            return fail();
        if (a.steps !== undefined && (!Array.isArray(a.steps) || a.steps.some(st => !st || typeof st.stepId !== 'string' || typeof st.correct !== 'boolean')))
            return fail();
    }
    return structuredClone(normalizeData({ ...d, settings: backupSettings(d.settings) }));
}
function backupSettings(settings: Settings): Settings {
    return { ...settings, key: '', rememberKey: false, ...(settings.ai ? { ai: { ...settings.ai, key: '' } } : {}) };
}
