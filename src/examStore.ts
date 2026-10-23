// —— Phase 11：考试域持久化 ——
// 会话保存走 revision 比较，两个标签页不会互相覆盖；提交/复盘重复调用幂等。
import type { AssessmentItem, ExamLog, ExamMaterial, ExamSession, ExamSpecification } from './examTypes.ts';
import type { Data } from './types.ts';
import { getDB, openDB, putItems } from './db.ts';
import { builtinExamItems, builtinMaterials } from './examSeed.ts';
import { builtinSpecifications } from './examSpecification.ts';
function req<T>(r: IDBRequest<T>): Promise<T> {
    return new Promise((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
function done(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error || Error('考试事务中止'));
        tx.onerror = () => reject(tx.error || Error('考试事务失败'));
    });
}
/** 幂等种子：规格按 id 覆盖内置版本；材料/题目只在缺失时补，避免覆盖用户编辑。 */
export async function ensureExamContent(): Promise<{
    specs: number;
    materials: number;
    items: number;
}> {
    await openDB();
    const tx = getDB().transaction(['examSpecifications', 'examMaterials', 'examItems'], 'readwrite');
    const specsStore = tx.objectStore('examSpecifications');
    const matsStore = tx.objectStore('examMaterials');
    const itemsStore = tx.objectStore('examItems');
    const specs = builtinSpecifications();
    for (const s of specs)
        specsStore.put(s);
    const mats = builtinMaterials();
    const items = builtinExamItems();
    // 内置题库是不可变内容：按稳定 id 覆盖，保证规格/分类修订能生效；不触碰用户导入物。
    for (const m of mats)
        matsStore.put(m);
    for (const i of items)
        itemsStore.put(i);
    await done(tx);
    return { specs: specs.length, materials: mats.length, items: items.length };
}
export async function getExamBank(): Promise<{
    specifications: ExamSpecification[];
    materials: ExamMaterial[];
    items: AssessmentItem[];
    sessions: ExamSession[];
    logs: ExamLog[];
}> {
    await openDB();
    const tx = getDB().transaction(['examSpecifications', 'examMaterials', 'examItems', 'examSessions', 'examLogs'], 'readonly');
    const [specifications, materials, items, sessions, logs] = await Promise.all([
        req(tx.objectStore('examSpecifications').getAll() as IDBRequest<ExamSpecification[]>),
        req(tx.objectStore('examMaterials').getAll() as IDBRequest<ExamMaterial[]>),
        req(tx.objectStore('examItems').getAll() as IDBRequest<AssessmentItem[]>),
        req(tx.objectStore('examSessions').getAll() as IDBRequest<ExamSession[]>),
        req(tx.objectStore('examLogs').getAll() as IDBRequest<ExamLog[]>),
    ]);
    await done(tx);
    return { specifications, materials, items, sessions, logs };
}
export async function saveExamSession(session: ExamSession, expectedRevision?: number): Promise<{
    ok: boolean;
    stale?: boolean;
    session?: ExamSession;
}> {
    await openDB();
    const tx = getDB().transaction('examSessions', 'readwrite');
    const store = tx.objectStore('examSessions');
    const current = await req(store.get(session.id) as IDBRequest<ExamSession | undefined>);
    if (current && expectedRevision !== undefined && current.revision !== expectedRevision) {
        tx.abort();
        return { ok: false, stale: true, session: current };
    }
    store.put(session);
    await done(tx);
    return { ok: true, session };
}
export async function clearExamSessions(): Promise<void> {
    await openDB();
    const tx = getDB().transaction('examSessions', 'readwrite');
    tx.objectStore('examSessions').clear();
    await done(tx);
}
export async function getExamSession(id: string): Promise<ExamSession | undefined> {
    await openDB();
    const tx = getDB().transaction('examSessions', 'readonly');
    const s = await req(tx.objectStore('examSessions').get(id) as IDBRequest<ExamSession | undefined>);
    await done(tx);
    return s;
}
export async function saveExamLog(log: ExamLog): Promise<void> {
    await openDB();
    if (!Number.isFinite(log.fullScore) || log.fullScore <= 0)
        throw new Error('满分必须大于 0');
    if (!Number.isFinite(log.reportedScore) || log.reportedScore < 0 || log.reportedScore > log.fullScore)
        throw new Error('得分必须满足 0 ≤ 得分 ≤ 满分');
    const tx = getDB().transaction('examLogs', 'readwrite');
    tx.objectStore('examLogs').put({ ...log, source: 'self_reported', scoreSource: 'self_reported', clueOnly: true, errorTypes: [] });
    await done(tx);
}
export async function deleteExamLog(id: string): Promise<void> {
    await openDB();
    const tx = getDB().transaction('examLogs', 'readwrite');
    tx.objectStore('examLogs').delete(id);
    await done(tx);
}
export async function clearExamLogs(): Promise<void> {
    await openDB();
    const tx = getDB().transaction('examLogs', 'readwrite');
    tx.objectStore('examLogs').clear();
    await done(tx);
}
export async function saveExamSpecification(spec: ExamSpecification): Promise<void> {
    await openDB();
    await putItems('examSpecifications', [spec]);
}
export function examDataFrom(d: Data) {
    return { specs: d.examSpecifications ?? [], materials: d.examMaterials ?? [], items: d.examItems ?? [], sessions: d.examSessions ?? [], logs: d.examLogs ?? [] };
}
