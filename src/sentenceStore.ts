// —— Phase 4：句库 / 语法证据持久化层（复用 db.ts 的索引，避免全表扫描）——
// store 与索引定义见 src/db.ts（v4 additive：新增 sentences；grammarTags 为 multiEntry 索引）。
import type { GrammarAttempt, GrammarConcept, SentenceAttempt, SentenceRecord } from './types.ts';
import { openDB, getDB, putItems, emptyData } from './db.ts';
import { ensureCuratedSentences } from './sentenceSources.ts';
import { seedGrammarConcepts } from './grammar.ts';
const p = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
const MAX = Number.MAX_SAFE_INTEGER;
export async function loadSentences(): Promise<SentenceRecord[]> {
    await openDB();
    return p(getDB().transaction('sentences').objectStore('sentences').getAll() as IDBRequest<SentenceRecord[]>);
}
export async function saveSentences(records: SentenceRecord[]): Promise<void> {
    await openDB();
    if (!records.length)
        return;
    await putItems('sentences', records);
}
export async function sentencesBySource(type: SentenceRecord['sourceType']): Promise<SentenceRecord[]> {
    await openDB();
    return p(getDB().transaction('sentences').objectStore('sentences').index('sourceType').getAll(type) as IDBRequest<SentenceRecord[]>);
}
// multiEntry 索引：按语法概念反查句子（Grammar 页面 → 相关训练句）
export async function sentencesForGrammar(conceptId: string): Promise<SentenceRecord[]> {
    await openDB();
    return p(getDB().transaction('sentences').objectStore('sentences').index('grammarTags').getAll(conceptId) as IDBRequest<SentenceRecord[]>);
}
export async function grammarAttemptsForConcept(conceptId: string, from = 0): Promise<GrammarAttempt[]> {
    await openDB();
    return p(getDB().transaction('grammarAttempts').objectStore('grammarAttempts').index('conceptId,at').getAll(IDBKeyRange.bound([conceptId, from], [conceptId, MAX])) as IDBRequest<GrammarAttempt[]>);
}
export async function sentenceAttemptsDesc(limit = 50): Promise<SentenceAttempt[]> {
    await openDB();
    const store = getDB().transaction('sentenceAttempts').objectStore('sentenceAttempts');
    const out: SentenceAttempt[] = [];
    await new Promise<void>((resolve, reject) => {
        const r = store.index('at').openCursor(null, 'prev');
        r.onsuccess = () => {
            const c = r.result;
            if (!c || out.length >= limit) {
                resolve();
                return;
            }
            out.push(c.value as SentenceAttempt);
            c.continue();
        };
        r.onerror = () => reject(r.error);
    });
    return out;
}
export async function saveGrammarConcepts(concepts: GrammarConcept[]): Promise<void> {
    await openDB();
    if (!concepts.length)
        return;
    await putItems('grammarConcepts', concepts);
}
// 启动/首次进入 Sentence Lab 时保证图谱节点与 curated 句库存在（幂等，不覆盖学习证据）
export async function ensureGraphData(data: {
    grammarConcepts: GrammarConcept[];
    sentences: SentenceRecord[];
}, now = Date.now()): Promise<{
    concepts: GrammarConcept[];
    sentences: SentenceRecord[];
    seeded: boolean;
    sentencesSeeded: number;
}> {
    const concepts = seedGrammarConcepts(data.grammarConcepts, now);
    const seeded = concepts.length !== data.grammarConcepts.length || data.grammarConcepts.length === 0;
    const sentences = ensureCuratedSentences(data.sentences, now);
    const sentencesSeeded = sentences.length - data.sentences.length;
    await saveGrammarConcepts(concepts);
    if (sentencesSeeded > 0)
        await saveSentences(sentences.filter(s => !data.sentences.some(o => o.id === s.id)));
    return { concepts, sentences, seeded, sentencesSeeded };
}
export function emptyGraph(): {
    grammarConcepts: GrammarConcept[];
    sentences: SentenceRecord[];
} {
    const e = emptyData();
    return { grammarConcepts: e.grammarConcepts, sentences: e.sentences };
}
