// —— Phase 10：诊断快照持久化 ——
// 同一天/同一周重复生成 = 覆盖同一条记录（幂等），不会堆出一堆重复快照。
import type { SkillSnapshot, WeeklyDiagnostic } from './types.ts';
import { getDB, openDB } from './db.ts';
function done(tx: IDBTransaction): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error || Error('诊断保存事务中止'));
        tx.onerror = () => reject(tx.error || Error('诊断保存失败'));
    });
}
function req<T>(r: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
    });
}
export async function saveSkillSnapshot(snapshot: SkillSnapshot): Promise<void> {
    await openDB();
    const tx = getDB().transaction('skillSnapshots', 'readwrite');
    tx.objectStore('skillSnapshots').put(snapshot);
    await done(tx);
}
export async function saveWeeklyDiagnostic(diag: WeeklyDiagnostic): Promise<void> {
    await openDB();
    const tx = getDB().transaction('weeklyDiagnostics', 'readwrite');
    tx.objectStore('weeklyDiagnostics').put(diag);
    await done(tx);
}
export async function findSnapshotByDate(date: string): Promise<SkillSnapshot | undefined> {
    await openDB();
    const tx = getDB().transaction('skillSnapshots', 'readonly');
    const all = await req(tx.objectStore('skillSnapshots').getAll() as IDBRequest<SkillSnapshot[]>);
    return all.find(s => s.date === date);
}
export async function findWeeklyByWeek(weekOf: string): Promise<WeeklyDiagnostic | undefined> {
    await openDB();
    const tx = getDB().transaction('weeklyDiagnostics', 'readonly');
    const all = await req(tx.objectStore('weeklyDiagnostics').getAll() as IDBRequest<WeeklyDiagnostic[]>);
    return all.find(s => s.weekOf === weekOf);
}
