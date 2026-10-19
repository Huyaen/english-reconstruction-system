// —— Phase 3：DailyPlan 持久化层（dailyPlans store，keyPath id = 本地日期）——
// 复用现有 IndexedDB 一致性设计：单事务读取-比较-revision 递增写入；
// 跨窗口由 app.ts 的 Web Locks 单写者保护；revision 冲突显式抛出，不静默覆盖。
import type { DailyPlan } from './types.ts';
import { openDB, getDB } from './db.ts';
export class StalePlanError extends Error {
    constructor(public expected: number, public actual: number) {
        super(`计划已被其他窗口更新（期望 revision ${expected}，实际 ${actual}）；请刷新后重试`);
        this.name = 'StalePlanError';
    }
}
function req<T>(r: IDBRequest<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
    });
}
function done(tx: IDBTransaction): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error || Error('计划保存事务中止'));
        tx.onerror = () => reject(tx.error || Error('计划保存失败'));
    });
}
// 同一天只应存在一个计划；历史上若出现多条（外部导入），取 revision 最高者。
export async function loadPlan(date: string): Promise<DailyPlan | undefined> {
    await openDB();
    const store = getDB().transaction('dailyPlans').objectStore('dailyPlans');
    const rows = await req(store.index('date').getAll(date) as IDBRequest<DailyPlan[]>);
    if (rows.length) {
        rows.sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0) || b.createdAt - a.createdAt);
        return rows[0];
    }
    return req(store.get(date) as IDBRequest<DailyPlan | undefined>);
}
export async function savePlan(plan: DailyPlan, expectedRevision?: number): Promise<DailyPlan> {
    await openDB();
    const tx = getDB().transaction('dailyPlans', 'readwrite');
    const store = tx.objectStore('dailyPlans');
    const current = await req(store.get(plan.id) as IDBRequest<DailyPlan | undefined>);
    const currentRev = current?.revision ?? 0;
    if (expectedRevision !== undefined && expectedRevision !== currentRev)
        throw new StalePlanError(expectedRevision, currentRev);
    const next: DailyPlan = { ...plan, revision: currentRev + 1, updatedAt: Date.now() };
    store.put(next);
    await done(tx);
    return next;
}
export async function listPlans(limit = 60): Promise<DailyPlan[]> {
    await openDB();
    const rows = await req(getDB().transaction('dailyPlans').objectStore('dailyPlans').getAll() as IDBRequest<DailyPlan[]>);
    return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, limit);
}
export async function latestPlan(): Promise<DailyPlan | undefined> {
    const rows = await listPlans(1);
    return rows[0];
}
