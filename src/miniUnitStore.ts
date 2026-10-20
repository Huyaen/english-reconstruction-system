// —— Phase 7：Mini Unit 持久化（miniUnits store，keyPath id）——
// 并发语义与 plannerStore 一致：单事务内“读取-比较 revision-写入”，
// 冲突显式抛 StaleUnitError；创建时用单事务保证不会出现两个 active 单元。
import type { MiniUnit } from './types.ts';
import { getDB, openDB } from './db.ts';
export class StaleUnitError extends Error {
    constructor(public expected: number, public actual: number) {
        super(`单元已被其他窗口更新（期望 revision ${expected}，实际 ${actual}）；请刷新后重试`);
        this.name = 'StaleUnitError';
    }
}
export class ActiveUnitExistsError extends Error {
    constructor(public activeId: string) {
        super('已经有一个进行中的 Mini Unit，请先完成或放弃它');
        this.name = 'ActiveUnitExistsError';
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
        tx.onabort = () => reject(tx.error || Error('单元保存事务中止'));
        tx.onerror = () => reject(tx.error || Error('单元保存失败'));
    });
}
export async function listUnits(limit = 40): Promise<MiniUnit[]> {
    await openDB();
    const rows = await req(getDB().transaction('miniUnits').objectStore('miniUnits').getAll() as IDBRequest<MiniUnit[]>);
    return rows.sort((a, b) => (b.updatedAt ?? b.startedAt) - (a.updatedAt ?? a.startedAt)).slice(0, limit);
}
export async function loadUnit(id: string): Promise<MiniUnit | undefined> {
    await openDB();
    return req(getDB().transaction('miniUnits').objectStore('miniUnits').get(id) as IDBRequest<MiniUnit | undefined>);
}
/** 当前进行中的单元：优先 stage，旧记录回退到 status=active */
export async function activeUnit(): Promise<MiniUnit | undefined> {
    const rows = await listUnits(100);
    return rows.find(u => {
        const stage = u.stage ?? (u.status === 'active' ? 'active' : u.status === 'completed' ? 'completed' : u.status);
        return stage === 'active' || stage === 'ready' || stage === 'draft' || stage === 'paused';
    });
}
/** 创建：单事务内检查“是否已有未结束单元”，避免两个窗口各建一个 */
export async function createUnit(unit: MiniUnit): Promise<MiniUnit> {
    await openDB();
    const tx = getDB().transaction('miniUnits', 'readwrite');
    const store = tx.objectStore('miniUnits');
    const all = await req(store.getAll() as IDBRequest<MiniUnit[]>);
    const open = all.find(u => {
        const stage = u.stage ?? (u.status === 'active' ? 'active' : u.status);
        return stage === 'draft' || stage === 'ready' || stage === 'active' || stage === 'paused';
    });
    if (open) {
        tx.abort();
        throw new ActiveUnitExistsError(open.id);
    }
    const now = Date.now();
    const next: MiniUnit = { ...unit, createdAt: unit.createdAt ?? now, updatedAt: now, revision: 0 };
    store.put(next);
    await done(tx);
    return next;
}
/** 保存：expectedRevision 必须匹配，否则抛冲突（不静默覆盖） */
export async function saveUnit(unit: MiniUnit, expectedRevision?: number): Promise<MiniUnit> {
    await openDB();
    const tx = getDB().transaction('miniUnits', 'readwrite');
    const store = tx.objectStore('miniUnits');
    const current = await req(store.get(unit.id) as IDBRequest<MiniUnit | undefined>);
    const currentRev = current?.revision ?? 0;
    if (expectedRevision !== undefined && expectedRevision !== currentRev) {
        tx.abort();
        throw new StaleUnitError(expectedRevision, currentRev);
    }
    const next: MiniUnit = { ...unit, revision: currentRev + 1, updatedAt: Date.now() };
    store.put(next);
    await done(tx);
    return next;
}
/** 幂等写入：把同一个转换结果写回（若已是该状态则不动） */
export async function applyTransition(unitId: string, apply: (current: MiniUnit) => MiniUnit | null): Promise<MiniUnit> {
    await openDB();
    const tx = getDB().transaction('miniUnits', 'readwrite');
    const store = tx.objectStore('miniUnits');
    const current = await req(store.get(unitId) as IDBRequest<MiniUnit | undefined>);
    if (!current) {
        tx.abort();
        throw new Error('单元不存在');
    }
    const next = apply(current);
    if (!next) {
        await done(tx);
        return current;
    }
    const saved: MiniUnit = { ...next, revision: (current.revision ?? 0) + 1, updatedAt: Date.now() };
    store.put(saved);
    await done(tx);
    return saved;
}
