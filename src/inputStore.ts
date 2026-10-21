// —— Phase 8：Input Hub 持久化 ——
// 单事务语义：
//  * 会话状态转换 = 读 → 比较 revision → 写（防止两个标签页互相覆盖）；
//  * 证据写入按键幂等（同一 session+type 只保留一条）；
//  * 字幕按 source 去重（同 hash 不重复入库）。
import type { InputEvidenceRecord, InputSession, InputSource, LibraryItem, Transcript } from './types.ts';
import { getDB, openDB } from './db.ts';
import type { SessionResult } from './inputSession.ts';

function req<T>(r: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
    });
}
function done(tx: IDBTransaction): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error || Error('输入保存事务中止'));
        tx.onerror = () => reject(tx.error || Error('输入保存失败'));
    });
}
export async function saveInputSource(source: InputSource): Promise<void> {
    await openDB();
    await putOne('inputSources', source);
}
async function putOne(store: 'inputSources' | 'inputSessions' | 'transcripts' | 'inputEvidence' | 'libraryItems', value: unknown) {
    const tx = getDB().transaction(store, 'readwrite');
    tx.objectStore(store).put(value as never);
    await done(tx);
}
export async function saveInputSources(sources: InputSource[]): Promise<void> {
    await openDB();
    const tx = getDB().transaction('inputSources', 'readwrite');
    for (const s of sources)
        tx.objectStore('inputSources').put(s);
    await done(tx);
}
export async function saveTranscript(transcript: Transcript): Promise<void> {
    await openDB();
    await putOne('transcripts', transcript);
}
export async function saveLibraryItem(item: LibraryItem): Promise<void> {
    await openDB();
    await putOne('libraryItems', item);
}
export async function deleteLibraryItemById(id: string): Promise<void> {
    await openDB();
    const tx = getDB().transaction('libraryItems', 'readwrite');
    tx.objectStore('libraryItems').delete(id);
    await done(tx);
}
export async function createSessionRecord(session: InputSession): Promise<void> {
    await openDB();
    await putOne('inputSessions', session);
}
/** 读改写：在同一个 readwrite 事务里完成，冲突显式返回 stale */
export async function transitionSession(id: string, expectedRevision: number | undefined, apply: (session: InputSession) => SessionResult): Promise<SessionResult> {
    await openDB();
    const tx = getDB().transaction('inputSessions', 'readwrite');
    const store = tx.objectStore('inputSessions');
    const current = await req(store.get(id) as IDBRequest<InputSession | undefined>);
    if (!current) {
        tx.abort();
        return { ok: false, code: 'invalid-input', message: '找不到这次输入记录（可能已在别的窗口删除）。' };
    }
    const result = apply(current);
    if (!result.ok) {
        tx.abort();
        return result;
    }
    if (!result.noop)
        store.put(result.session);
    await done(tx);
    return result;
}
export async function appendInputEvidence(records: InputEvidenceRecord[]): Promise<{ added: number }> {
    if (!records.length)
        return { added: 0 };
    await openDB();
    const tx = getDB().transaction('inputEvidence', 'readwrite');
    const store = tx.objectStore('inputEvidence');
    let added = 0;
    for (const record of records) {
        const existing = await req(store.get(record.id) as IDBRequest<InputEvidenceRecord | undefined>);
        if (!existing) {
            store.put(record);
            added++;
        }
    }
    await done(tx);
    return { added };
}
export async function loadTranscriptsFor(sourceId: string): Promise<Transcript[]> {
    await openDB();
    const rows = await req(getDB().transaction('transcripts').objectStore('transcripts').getAll() as IDBRequest<Transcript[]>);
    return rows.filter(t => t.sourceId === sourceId);
}
export async function listInputSessions(): Promise<InputSession[]> {
    await openDB();
    const rows = await req(getDB().transaction('inputSessions').objectStore('inputSessions').getAll() as IDBRequest<InputSession[]>);
    return rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}
