// —— Phase 8：My English Library（真实材料收藏/状态/筛选）——
// 纪律：Library 只管理“材料”，不管理兴趣；删除收藏不删兴趣，取消兴趣不删材料。
import type { InputSource, LibraryItem } from './types.ts';
export type LibraryStatus = LibraryItem['status'];
export interface LibraryFilter {
    search?: string;
    topic?: string;
    contentType?: string;
    status?: LibraryStatus | 'all';
    minMinutes?: number;
    maxMinutes?: number;
    difficulty?: 'easy' | 'medium' | 'hard' | 'unknown' | 'all';
    captions?: 'any' | 'has' | 'none' | 'unknown';
    recentDays?: number;
    miniUnitId?: string;
    completion?: 'any' | 'unstarted' | 'partial' | 'done';
}
export function libraryItemFromSource(source: InputSource, now = Date.now(), extra: Partial<LibraryItem> = {}): LibraryItem {
    return {
        id: `lib_${source.id}`, title: source.title, kind: source.kind === 'game' ? 'other' : source.kind, url: source.url, topic: source.topic,
        difficultyEstimate: source.difficultyEstimate, status: 'saved', notes: source.notes ?? '', savedAt: now,
        sourceId: source.id, contentType: source.contentType, durationMinutes: source.durationMinutes,
        captionStatus: source.subtitleStatus, lastOpenedAt: null, completion: 0, miniUnitId: null, updatedAt: now,
        ...extra,
    };
}
/** 保存（幂等）：同一 source 只保留一条；已归档的再次保存会回到 saved */
export function saveToLibrary(items: LibraryItem[], source: InputSource, now = Date.now()): {
    items: LibraryItem[];
    item: LibraryItem;
    created: boolean;
} {
    const idx = items.findIndex(i => i.sourceId === source.id);
    if (idx >= 0) {
        const existing = items[idx];
        const item: LibraryItem = { ...existing, status: existing.status === 'archived' ? 'saved' : existing.status, updatedAt: now };
        const next = [...items];
        next[idx] = item;
        return { items: next, item, created: false };
    }
    const item = libraryItemFromSource(source, now);
    return { items: [...items, item], item, created: true };
}
export function setLibraryStatus(items: LibraryItem[], id: string, status: LibraryStatus, now = Date.now()): LibraryItem[] {
    return items.map(i => i.id === id ? { ...i, status, updatedAt: now } : i);
}
export function markOpened(items: LibraryItem[], id: string, now = Date.now()): LibraryItem[] {
    return items.map(i => i.id === id ? { ...i, lastOpenedAt: now, updatedAt: now } : i);
}
export function setLibraryCompletion(items: LibraryItem[], id: string, completion: number, now = Date.now()): LibraryItem[] {
    const clamped = Math.max(0, Math.min(1, completion));
    return items.map(i => i.id === id ? { ...i, completion: clamped, status: clamped >= 1 ? 'used' : i.status, updatedAt: now } : i);
}
export function linkLibraryToUnit(items: LibraryItem[], id: string, miniUnitId: string | null, now = Date.now()): LibraryItem[] {
    return items.map(i => i.id === id ? { ...i, miniUnitId, updatedAt: now } : i);
}
export function deleteLibraryItem(items: LibraryItem[], id: string): LibraryItem[] {
    return items.filter(i => i.id !== id);
}
function difficultyBucket(value: number | null | undefined): 'easy' | 'medium' | 'hard' | 'unknown' {
    if (value === null || value === undefined)
        return 'unknown';
    if (value <= 0.33)
        return 'easy';
    if (value <= 0.66)
        return 'medium';
    return 'hard';
}
export function filterLibrary(items: LibraryItem[], filter: LibraryFilter, now = Date.now()): LibraryItem[] {
    const q = (filter.search ?? '').trim().toLowerCase();
    const topic = (filter.topic ?? '').trim().toLowerCase();
    return items.filter(i => {
        if ((filter.status ?? 'all') !== 'all' && i.status !== filter.status)
            return false;
        if (q && !`${i.title} ${i.topic} ${i.notes}`.toLowerCase().includes(q))
            return false;
        if (topic && topic !== 'all' && !i.topic.toLowerCase().includes(topic))
            return false;
        if (filter.contentType && filter.contentType !== 'all' && i.contentType !== filter.contentType)
            return false;
        const minutes = i.durationMinutes ?? 0;
        if (filter.minMinutes !== undefined && minutes < filter.minMinutes)
            return false;
        if (filter.maxMinutes !== undefined && minutes > filter.maxMinutes)
            return false;
        if ((filter.difficulty ?? 'all') !== 'all' && difficultyBucket(i.difficultyEstimate) !== filter.difficulty)
            return false;
        if (filter.captions && filter.captions !== 'any') {
            const caption = i.captionStatus ?? 'unknown';
            const has = caption === 'user_supplied' || caption === 'official' || caption === 'machine';
            if (filter.captions === 'has' && !has)
                return false;
            if (filter.captions === 'none' && caption !== 'none')
                return false;
            if (filter.captions === 'unknown' && caption !== 'unknown')
                return false;
        }
        if (filter.recentDays !== undefined) {
            const touched = Math.max(i.lastOpenedAt ?? 0, i.updatedAt ?? 0, i.savedAt);
            if (now - touched > filter.recentDays * 86400000)
                return false;
        }
        if (filter.miniUnitId !== undefined && (i.miniUnitId ?? null) !== filter.miniUnitId)
            return false;
        if (filter.completion) {
            const c = i.completion ?? 0;
            if (filter.completion === 'unstarted' && c > 0)
                return false;
            if (filter.completion === 'partial' && (c <= 0 || c >= 1))
                return false;
            if (filter.completion === 'done' && c < 1)
                return false;
        }
        return true;
    });
}
export function libraryStats(items: LibraryItem[], now = Date.now()) {
    const saved = items.filter(i => i.status === 'saved').length;
    const used = items.filter(i => i.status === 'used').length;
    const archived = items.filter(i => i.status === 'archived').length;
    const inProgress = items.filter(i => (i.completion ?? 0) > 0 && (i.completion ?? 0) < 1).length;
    const recent = items.filter(i => now - Math.max(i.lastOpenedAt ?? 0, i.updatedAt ?? 0, i.savedAt) <= 7 * 86400000).length;
    return { total: items.length, saved, used, archived, inProgress, recent };
}
/** 收藏与兴趣完全解耦：这里不读也不写 Settings.interests */
export function interestIndependent(): true { return true; }
