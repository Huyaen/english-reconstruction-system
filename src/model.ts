// —— Learning Model 查询层（Phase 1 task: phase1_model_api_005）——
// 目的：为后续所有模块提供索引化查询接口，避免全表扫描（PROJECT_SPEC §96）。
// 索引定义见 src/db.ts 的 indexSpecs（DB v2）。
import type { Word, WordExposure, ReviewRecord, SkillSnapshot, DailyPlan, MiniUnit, StudySession } from './types.ts';
import { openDB, getDB } from './db.ts';
import { effectiveDue } from './fsrs.ts';
const p = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
const MAX = Number.MAX_SAFE_INTEGER;
// 到期复习词（schedule.due 索引；未测试的新词 due=0 不算到期）
// 到期复习词（按调度权威选择索引：legacy → schedule.due；fsrs → fsrs.due 与 schedule.due 合并后过滤有效 due）
export async function dueWords(now = Date.now(), authority: 'legacy' | 'fsrs' = 'fsrs'): Promise<Word[]> {
    await openDB();
    const store = getDB().transaction('words').objectStore('words');
    const range = IDBKeyRange.upperBound(now);
    const merged = new Map<string, Word>();
    for (const w of await p(store.index('schedule.due').getAll(range) as IDBRequest<Word[]>))
        merged.set(w.id, w);
    if (authority === 'fsrs')
        for (const w of await p(store.index('fsrs.due').getAll(range) as IDBRequest<Word[]>))
            merged.set(w.id, w);
    return [...merged.values()].filter(w => w.state.total > 0 && effectiveDue(w, authority) <= now);
}
export async function wordsByBook(bookId: string): Promise<Word[]> {
    await openDB();
    return p(getDB().transaction('words').objectStore('words').index('bookId').getAll(bookId) as IDBRequest<Word[]>);
}
export async function recordsForWord(wordId: string): Promise<ReviewRecord[]> {
    await openDB();
    return p(getDB().transaction('records').objectStore('records').index('wordId,at').getAll(IDBKeyRange.bound([wordId, 0], [wordId, MAX])) as IDBRequest<ReviewRecord[]>);
}
export async function exposuresForWord(wordId: string, from = 0): Promise<WordExposure[]> {
    await openDB();
    return p(getDB().transaction('wordExposures').objectStore('wordExposures').index('wordId,at').getAll(IDBKeyRange.bound([wordId, from], [wordId, MAX])) as IDBRequest<WordExposure[]>);
}
export async function exposureStats(wordId: string): Promise<{
    total: number;
    byState: Record<string, number>;
}> {
    const es = await exposuresForWord(wordId);
    const byState: Record<string, number> = {};
    for (const e of es)
        byState[e.state] = (byState[e.state] || 0) + 1;
    return { total: es.length, byState };
}
// 最近的技能快照（按日期倒序，最多 n 条）
export async function latestSnapshots(n = 30): Promise<SkillSnapshot[]> {
    await openDB();
    const store = getDB().transaction('skillSnapshots').objectStore('skillSnapshots');
    const out: SkillSnapshot[] = [];
    await new Promise<void>((resolve, reject) => {
        const r = store.index('date').openCursor(null, 'prev');
        r.onsuccess = () => {
            const c = r.result;
            if (!c || out.length >= n) {
                resolve();
                return;
            }
            out.push(c.value as SkillSnapshot);
            c.continue();
        };
        r.onerror = () => reject(r.error);
    });
    return out;
}
export async function planForDate(date: string): Promise<DailyPlan | undefined> {
    await openDB();
    return p(getDB().transaction('dailyPlans').objectStore('dailyPlans').get(date) as IDBRequest<DailyPlan | undefined>);
}
export async function activeMiniUnit(): Promise<MiniUnit | undefined> {
    await openDB();
    const rows = await p(getDB().transaction('miniUnits').objectStore('miniUnits').index('status').getAll('active') as IDBRequest<MiniUnit[]>);
    return rows.sort((a, b) => b.startedAt - a.startedAt)[0];
}
// sessions 无“未完成”索引（ended 为 null 不进入索引）；数量级小，读取后过滤
export async function unfinishedSessions(): Promise<StudySession[]> {
    await openDB();
    const rows = await p(getDB().transaction('sessions').objectStore('sessions').getAll() as IDBRequest<StudySession[]>);
    return rows.filter(s => !s.ended);
}
