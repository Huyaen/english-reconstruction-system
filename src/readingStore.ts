// —— Phase 5：阅读持久化（只做 IO；业务规则在纯函数模块里）——
// 复用 Phase 1 已有的 passages / readingSessions / wordExposures store（DB 仍为 v4）：
// - passages(keyPath id, index createdAt)
// - readingSessions(keyPath id, index passageId / at)
// 不新增 store，不重建数据库。
import type { Passage, ReadingSession, Word, WordExposure } from './types.ts';
import { getDB } from './db.ts';
function done(tx: IDBTransaction): Promise<void> {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error ?? Error('事务被中止'));
    });
}
export async function savePassage(passage: Passage): Promise<void> {
    const tx = getDB().transaction('passages', 'readwrite');
    const p = done(tx);
    tx.objectStore('passages').put(passage);
    await p;
}
export async function saveReadingSession(session: ReadingSession): Promise<void> {
    const tx = getDB().transaction('readingSessions', 'readwrite');
    const p = done(tx);
    tx.objectStore('readingSessions').put(session);
    await p;
}
// 会话 + 接触记录 + 词汇关联单事务（刷新不会出现“会话存了、证据没存”）
export async function saveReadingProgress(input: {
    session: ReadingSession;
    exposures?: WordExposure[];
    words?: Word[];
    passages?: Passage[];
}): Promise<void> {
    const names: string[] = ['readingSessions'];
    if (input.exposures?.length || input.words?.length)
        names.push('wordExposures', 'words');
    if (input.passages?.length)
        names.push('passages');
    const tx = getDB().transaction([...new Set(names)], 'readwrite');
    const p = done(tx);
    tx.objectStore('readingSessions').put(input.session);
    if (input.exposures?.length || input.words?.length) {
        const exStore = tx.objectStore('wordExposures');
        for (const e of input.exposures ?? [])
            exStore.put(e);
        const wStore = tx.objectStore('words');
        for (const w of input.words ?? [])
            wStore.put(w);
    }
    if (input.passages?.length) {
        const pStore = tx.objectStore('passages');
        for (const x of input.passages)
            pStore.put(x);
    }
    await p;
}
export async function listPassages(): Promise<Passage[]> {
    const tx = getDB().transaction('passages', 'readonly');
    const req = tx.objectStore('passages').getAll();
    const rows = await new Promise<Passage[]>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result as Passage[]);
        req.onerror = () => reject(req.error);
    });
    return rows.sort((a, b) => b.createdAt - a.createdAt);
}
export async function listSessions(): Promise<ReadingSession[]> {
    const tx = getDB().transaction('readingSessions', 'readonly');
    const req = tx.objectStore('readingSessions').getAll();
    const rows = await new Promise<ReadingSession[]>((resolve, reject) => {
        req.onsuccess = () => resolve(req.result as ReadingSession[]);
        req.onerror = () => reject(req.error);
    });
    return rows.sort((a, b) => b.at - a.at);
}
// 打开中的会话：优先最近一篇未完成的（刷新/关页后继续）
export function openSessions(sessions: ReadingSession[]): ReadingSession[] {
    return sessions.filter(s => s.detail && s.detail.state !== 'completed' && s.detail.state !== 'abandoned');
}
export function latestOpenSession(sessions: ReadingSession[]): ReadingSession | null {
    return openSessions(sessions)[0] ?? null;
}
export function passageOf(passages: Passage[], session: ReadingSession | null): Passage | null {
    if (!session)
        return null;
    return passages.find(p => p.id === session.passageId) ?? null;
}
// 阅读库查询（内存过滤即可：文章数量级远小于词条；排序按导入时间）
export interface LibraryQuery {
    text?: string;
    topic?: string;
    source?: string;
    readState?: 'all' | 'read' | 'unread' | 'unfinished';
}
export function queryLibrary(passages: Passage[], sessions: ReadingSession[], q: LibraryQuery = {}): Array<{
    passage: Passage;
    completed: number;
    unfinished: ReadingSession | null;
    lastReadAt: number | null;
}> {
    const byPassage = new Map<string, ReadingSession[]>();
    for (const s of sessions) {
        const list = byPassage.get(s.passageId) ?? [];
        list.push(s);
        byPassage.set(s.passageId, list);
    }
    const text = (q.text ?? '').trim().toLowerCase();
    return passages
        .filter(p => {
        if (text && !(`${p.title} ${p.text.slice(0, 400)}`.toLowerCase().includes(text)))
            return false;
        if (q.topic && p.topic !== q.topic)
            return false;
        if (q.source && p.sourceType !== q.source)
            return false;
        const list = byPassage.get(p.id) ?? [];
        const completed = list.filter(s => s.detail?.state === 'completed').length;
        const unfinished = list.find(s => s.detail && s.detail.state !== 'completed' && s.detail.state !== 'abandoned') ?? null;
        if (q.readState === 'read' && completed === 0)
            return false;
        if (q.readState === 'unread' && list.length > 0)
            return false;
        if (q.readState === 'unfinished' && !unfinished)
            return false;
        return true;
    })
        .map(p => {
        const list = byPassage.get(p.id) ?? [];
        const completed = list.filter(s => s.detail?.state === 'completed').length;
        const unfinished = list.find(s => s.detail && s.detail.state !== 'completed' && s.detail.state !== 'abandoned') ?? null;
        const last = list.length ? Math.max(...list.map(s => s.at)) : null;
        return { passage: p, completed, unfinished, lastReadAt: last };
    })
        .sort((a, b) => (b.lastReadAt ?? b.passage.createdAt) - (a.lastReadAt ?? a.passage.createdAt));
}
