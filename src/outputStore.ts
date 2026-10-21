// —— Phase 9：Output 持久化 ——
// 单事务读改写：revision 不匹配返回 stale（两个标签页不会静默互相覆盖）。
// 提交/反馈/修改都是幂等的：重复调用只前进一次 revision。
import type { OutputAttempt } from './types.ts';
import { getDB, openDB, putItems } from './db.ts';

function req<T>(r: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
    });
}
function done(tx: IDBTransaction): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error || Error('Output 保存事务中止'));
        tx.onerror = () => reject(tx.error || Error('Output 保存失败'));
    });
}

export async function createAttemptRecord(attempt: OutputAttempt): Promise<void> {
    await openDB();
    await putItems('outputAttempts', [attempt]);
}

export async function getAttempt(id: string): Promise<OutputAttempt | null> {
    await openDB();
    const tx = getDB().transaction('outputAttempts', 'readonly');
    const v = await req<OutputAttempt | undefined>(tx.objectStore('outputAttempts').get(id) as IDBRequest<OutputAttempt | undefined>);
    return v ?? null;
}

export type AttemptUpdate = { ok: true; attempt: OutputAttempt; noop?: boolean } | { ok: false; code: 'missing' | 'stale'; message: string };

/** 读 → 比较 revision → 写；apply 返回 null 表示"无需改动"（noop） */
export async function updateAttempt(id: string, expectedRevision: number | undefined, apply: (cur: OutputAttempt) => OutputAttempt | null): Promise<AttemptUpdate> {
    await openDB();
    const tx = getDB().transaction('outputAttempts', 'readwrite');
    const store = tx.objectStore('outputAttempts');
    const cur = await req<OutputAttempt | undefined>(store.get(id) as IDBRequest<OutputAttempt | undefined>);
    if (!cur) {
        tx.abort();
        return { ok: false, code: 'missing', message: '找不到这条表达记录。' };
    }
    const revision = cur.revision ?? 0;
    if (expectedRevision !== undefined && expectedRevision !== revision) {
        tx.abort();
        return { ok: false, code: 'stale', message: '这条表达在别处被更新过，请刷新后再试。' };
    }
    const next = apply(cur);
    if (!next) {
        await done(tx);
        return { ok: true, attempt: cur, noop: true };
    }
    const saved: OutputAttempt = { ...next, revision: revision + 1, updatedAt: next.updatedAt ?? Date.now() };
    store.put(saved);
    await done(tx);
    return { ok: true, attempt: saved };
}

/** 是否已经为这个 attempt 写过某个词的产出证据（幂等键：attemptId:wordId） */
export function evidenceExists(attempt: OutputAttempt, key: string): boolean {
    return (attempt.productiveEvidence ?? []).some(e => e.id === key);
}

export async function deleteAttempt(id: string): Promise<void> {
    await openDB();
    const tx = getDB().transaction('outputAttempts', 'readwrite');
    tx.objectStore('outputAttempts').delete(id);
    await done(tx);
}

/** 同一 Draft + Prompt 版本 + 参数只应调用一次 AI：以本地指纹做结果复用键 */
export function feedbackFingerprint(attempt: OutputAttempt, promptVersion: string): string {
    return `${attempt.id}|${promptVersion}|${(attempt.draftText ?? attempt.originalText).length}`;
}
