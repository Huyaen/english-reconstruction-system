// —— Phase 8：Dynamic Interest Profile（纯逻辑，无 IO）——
// 设计原则（对应 Phase 8 补充要求 1–10）：
//  1) 主题完全自由增删改；默认分类只是建议，不是白名单；
//  2) 显式偏好与行为推断分开存放：profile.topics 只由用户操作改变；
//  3) 行为信号按时间衰减、有上限，一次点击不会永久改权重；
//  4) 兴趣 ≠ 能力：本模块不读也不写任何掌握度/难度数据；
//  5) 推荐理由必须可解释（interests / recent activity / mini unit / explore）。
import type { Data, InterestProfile, InterestTopic } from './types.ts';
export const SUGGESTED_INTERESTS: {
    label: string;
    keywords: string[];
}[] = [
    { label: '历史 / 人文', keywords: ['history', 'histor', 'culture', '人文', '历史'] },
    { label: 'CS / 电竞', keywords: ['software', 'compute', 'program', 'esport', 'cs', '电竞'] },
    { label: '游戏', keywords: ['game', 'gaming', '游戏'] },
    { label: 'AI / 科技', keywords: ['ai', 'machine learning', 'technolog', '科技', '人工智能'] },
    { label: '剧集 / 真实媒体', keywords: ['series', 'film', 'movie', 'documentary', '剧', '影视'] },
];
export const DEFAULT_EXPLORATION = 0.34;
const MAX_TOPICS = 40;
const SIGNAL_WINDOW_DAYS = 30;
const DECAY_DAYS = 14;
export function emptyProfile(now = Date.now()): InterestProfile {
    return { version: 1, topics: [], exploration: DEFAULT_EXPLORATION, resets: 0, updatedAt: now };
}
const norm = (s: string) => s.toLowerCase().replace(/[\s\u3000]+/g, ' ').replace(/[，,。.;；:：!！?？'"“”‘’()（）\[\]【】]/g, '').trim();
export function normalizeKeywords(label: string, keywords?: string[]): string[] {
    const raw = keywords?.length ? keywords : label.split(/[\s/、,，·|\-]+/);
    return [...new Set(raw.map(k => norm(k)).filter(k => k.length >= (k.length && /[\u4e00-\u9fff]/.test(k) ? 2 : 3)))].slice(0, 8);
}
/** 容忍旧数据/脏数据：去重、夹紧权重、补默认字段 */
export function normalizeProfile(raw: unknown, now = Date.now()): InterestProfile {
    const base = emptyProfile(now);
    if (!raw || typeof raw !== 'object')
        return base;
    const r = raw as Partial<InterestProfile>;
    const topics: InterestTopic[] = [];
    const seen = new Set<string>();
    for (const t of Array.isArray(r.topics) ? r.topics : []) {
        if (!t || typeof t.label !== 'string')
            continue;
        const label = t.label.trim().slice(0, 40);
        const key = norm(label);
        if (!key || seen.has(key))
            continue;
        seen.add(key);
        topics.push({
            id: typeof t.id === 'string' && t.id ? t.id : `it_${key.slice(0, 12)}_${topics.length}`,
            label,
            source: t.source === 'suggested' ? 'suggested' : 'explicit',
            weight: Math.max(0, Math.min(1, Number.isFinite(t.weight) ? Number(t.weight) : 0.6)),
            keywords: normalizeKeywords(label, Array.isArray(t.keywords) ? t.keywords.filter((k): k is string => typeof k === 'string') : undefined),
            createdAt: Number.isFinite(t.createdAt) ? Number(t.createdAt) : now,
            updatedAt: Number.isFinite(t.updatedAt) ? Number(t.updatedAt) : now,
        });
    }
    return {
        version: 1,
        topics: topics.slice(0, MAX_TOPICS),
        exploration: Math.max(0, Math.min(0.6, Number.isFinite(r.exploration) ? Number(r.exploration) : DEFAULT_EXPLORATION)),
        resets: Number.isFinite(r.resets) ? Number(r.resets) : 0,
        updatedAt: Number.isFinite(r.updatedAt) ? Number(r.updatedAt) : now,
    };
}
function stamp(profile: InterestProfile, now: number): InterestProfile {
    return { ...profile, topics: profile.topics.map(t => ({ ...t, keywords: [...t.keywords] })), updatedAt: now };
}
export interface InterestChange {
    profile: InterestProfile;
    topic?: InterestTopic;
    error?: string;
}
export function addInterest(profile: InterestProfile, label: string, opts: {
    keywords?: string[];
    weight?: number;
    source?: InterestTopic['source'];
} = {}, now = Date.now()): InterestChange {
    const clean = label.trim().slice(0, 40);
    if (!clean)
        return { profile, error: '兴趣主题不能为空' };
    if (profile.topics.length >= MAX_TOPICS)
        return { profile, error: `最多 ${MAX_TOPICS} 个兴趣主题` };
    if (profile.topics.some(t => norm(t.label) === norm(clean)))
        return { profile, error: '这个兴趣已经在列表里了' };
    const topic: InterestTopic = {
        id: `it_${now.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        label: clean,
        source: opts.source === 'suggested' ? 'suggested' : 'explicit',
        weight: Math.max(0, Math.min(1, opts.weight ?? 0.6)),
        keywords: normalizeKeywords(clean, opts.keywords),
        createdAt: now,
        updatedAt: now,
    };
    const next = stamp(profile, now);
    next.topics = [...next.topics, topic];
    return { profile: next, topic };
}
export function renameInterest(profile: InterestProfile, id: string, label: string, now = Date.now()): InterestChange {
    const clean = label.trim().slice(0, 40);
    if (!clean)
        return { profile, error: '兴趣主题不能为空' };
    if (profile.topics.some(t => t.id !== id && norm(t.label) === norm(clean)))
        return { profile, error: '这个兴趣已经在列表里了' };
    if (!profile.topics.some(t => t.id === id))
        return { profile, error: '兴趣不存在' };
    const next = stamp(profile, now);
    next.topics = next.topics.map(t => t.id === id ? { ...t, label: clean, keywords: normalizeKeywords(clean), updatedAt: now } : t);
    return { profile: next, topic: next.topics.find(t => t.id === id) };
}
export function updateInterestKeywords(profile: InterestProfile, id: string, keywords: string[], now = Date.now()): InterestChange {
    const next = stamp(profile, now);
    next.topics = next.topics.map(t => t.id === id ? { ...t, keywords: normalizeKeywords(t.label, keywords), updatedAt: now } : t);
    return { profile: next, topic: next.topics.find(t => t.id === id) };
}
export function setInterestWeight(profile: InterestProfile, id: string, weight: number, now = Date.now()): InterestChange {
    const next = stamp(profile, now);
    next.topics = next.topics.map(t => t.id === id ? { ...t, weight: Math.max(0, Math.min(1, weight)), updatedAt: now } : t);
    return { profile: next, topic: next.topics.find(t => t.id === id) };
}
export function removeInterest(profile: InterestProfile, id: string, now = Date.now()): InterestChange {
    const next = stamp(profile, now);
    next.topics = next.topics.filter(t => t.id !== id);
    return { profile: next };
}
/** 重置：清空画像并回到默认探索比例；resets+1 只用于展示 */
export function resetInterests(profile: InterestProfile, now = Date.now()): InterestChange {
    return { profile: { version: 1, topics: [], exploration: DEFAULT_EXPLORATION, resets: profile.resets + 1, updatedAt: now } };
}
export function setExploration(profile: InterestProfile, ratio: number, now = Date.now()): InterestChange {
    const next = stamp(profile, now);
    next.exploration = Math.max(0, Math.min(0.6, ratio));
    return { profile: next };
}
/** 材料是否命中某条兴趣（关键词命中 topic/title/tags 任一） */
export function matchInterest(profile: InterestProfile, text: string): InterestTopic | null {
    const hay = norm(text);
    if (!hay)
        return null;
    const hits = profile.topics
        .filter(t => t.keywords.some(k => hay.includes(k)))
        .sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label));
    return hits[0] ?? null;
}
export interface TopicSignal {
    key: string;
    reads: number;
    imports: number;
    unitActive: boolean;
    unitCompleted: number;
    lastAt: number;
    /** 0–1，按时间衰减并封顶 */
    weight: number;
}
export interface ActivitySignals {
    topics: TopicSignal[];
    /** 是否有足够的真实行为证据（否则推荐不得声称精准个性化） */
    sufficient: boolean;
    sampleSize: number;
}
const dayMs = 86400000;
const decay = (at: number, now: number) => Math.exp(-Math.max(0, now - at) / (DECAY_DAYS * dayMs));
/** 近期行为信号：只用于排序与解释，绝不写回 profile */
export function activitySignals(data: Data, now = Date.now(), opts: {
    windowDays?: number;
} = {}): ActivitySignals {
    const windowMs = (opts.windowDays ?? SIGNAL_WINDOW_DAYS) * dayMs;
    const since = now - windowMs;
    const keyOf = (p?: {
        topic?: string;
        title?: string;
    } | null) => norm(`${p?.topic ?? ''} ${p?.title ?? ''}`).trim();
    const map = new Map<string, TopicSignal>();
    const bump = (key: string, patch: Partial<TopicSignal>) => {
        if (!key)
            return;
        const row = map.get(key) ?? { key, reads: 0, imports: 0, unitActive: false, unitCompleted: 0, lastAt: 0, weight: 0 };
        map.set(key, {
            ...row,
            reads: row.reads + (patch.reads ?? 0),
            imports: row.imports + (patch.imports ?? 0),
            unitActive: row.unitActive || !!patch.unitActive,
            unitCompleted: row.unitCompleted + (patch.unitCompleted ?? 0),
            lastAt: Math.max(row.lastAt, patch.lastAt ?? 0),
        });
    };
    let sample = 0;
    const byId = new Map(data.passages.map(p => [p.id, p]));
    for (const s of data.readingSessions) {
        if (s.at < since)
            continue;
        const p = byId.get(s.passageId);
        if (!p || p.sourceType === 'ai' || p.sourceType === 'ai_reinforcement')
            continue;
        bump(keyOf(p), { reads: 1, lastAt: s.at });
        sample++;
    }
    for (const p of data.passages) {
        const at = p.importedAt ?? p.createdAt;
        if (at < since || p.sourceType === 'ai' || p.sourceType === 'ai_reinforcement')
            continue;
        bump(keyOf(p), { imports: 1, lastAt: at });
        sample++;
    }
    for (const u of data.miniUnits) {
        const at = u.updatedAt ?? u.startedAt ?? 0;
        if (at < since)
            continue;
        const active = u.status === 'active' && u.stage !== 'completed' && u.stage !== 'abandoned';
        bump(norm(`${u.topic ?? ''} ${u.theme ?? ''}`).trim(), active ? { unitActive: true, lastAt: at } : { unitCompleted: 1, lastAt: at });
        sample++;
    }
    const topics = [...map.values()].map(t => ({
        ...t,
        weight: Math.min(1, decay(t.lastAt || now, now) * (t.unitActive ? 1 : 0.8) * (t.reads * 0.4 + t.imports * 0.15 + t.unitCompleted * 0.3 + (t.unitActive ? 0.6 : 0))),
    })).filter(t => t.weight > 0.01).sort((a, b) => b.weight - a.weight);
    return { topics, sufficient: sample >= 3, sampleSize: sample };
}
/** 把材料主题关联到兴趣（先精确匹配关键词，再退化为主题名包含） */
export function interestFor(profile: InterestProfile, ...parts: (string | undefined)[]): InterestTopic | null {
    return matchInterest(profile, parts.filter(Boolean).join(' '));
}
/** 界面文案：四类理由（保留英文标签，便于对照规格） */
export const REASON_LABELS = {
    interests: { tag: 'Based on your interests', zh: '基于你的兴趣' },
    recent: { tag: 'Based on your recent activity', zh: '基于你的近期行为' },
    unit: { tag: 'Related to your Mini Unit', zh: '与你当前单元相关' },
    explore: { tag: 'Explore something new', zh: '换个新领域探索' },
} as const;
export type InterestReasonKind = keyof typeof REASON_LABELS;
