// —— Phase 7：主题推荐 / Anchor 候选 / 目标词汇与语法选择（纯函数，无 IO）——
// 原则：推荐必须引用真实材料与真实学情；证据不足时明说，不编造“兴趣画像”。
import type { AnchorProvenance, GrammarConcept, MiniUnit, MiniUnitGrammarTarget, Passage, Word } from './types.ts';
import { GRAMMAR_TAXONOMY } from './grammar.ts';
import { grammarMarker } from './aiQuality.ts';
import { learningValue } from './pools.ts';
import { provenanceOf, targetWordBudget, UNIT_RULES } from './miniUnit.ts';
import { activitySignals, interestFor, REASON_LABELS, type ActivitySignals, type InterestReasonKind } from './interestProfile.ts';
import type { InterestProfile } from './types.ts';
export interface ThemeRecommendation {
    themeId: string;
    theme: string;
    topic: string;
    whyRecommended: string;
    basis: {
        materials: {
            passageId: string;
            title: string;
            wordCount: number;
            provenance: AnchorProvenance;
        }[];
        weakWordsInMaterials: string[];
        grammarInMaterials: string[];
        observedDifficulty: string[];
        recentUnitThemes: string[];
    };
    targetWords: {
        word: string;
        reason: string;
    }[];
    targetGrammar: MiniUnitGrammarTarget[];
    estimatedDifficulty: number;
    difficultyConfidence: 'low' | 'medium' | 'high';
    estimatedLearningDays: number;
    insufficientEvidence: boolean;
    /** Phase 8：推荐理由分类（interests / recent / unit / explore） */
    reasonKind: InterestReasonKind;
    reasonTag: string;
    reasonZh: string;
    /** 是否“探索位”（与你当前兴趣/近期行为无关，但有真实材料） */
    exploration: boolean;
    /** 是否与刚完成的单元同主题（防重复推荐同一内容） */
    repeat: boolean;
}
export interface ThemeInput {
    passages: Passage[];
    words: Word[];
    grammar: GrammarConcept[];
    units: MiniUnit[];
    now: number;
    availableMinutes: number;
    /** 用户自定义主题时直接给定 topic（仍然需要真实材料） */
    customTopic?: string;
    /** Phase 8：动态兴趣画像 + 近期行为信号（都可缺省；缺省时推荐必须说明依据有限） */
    interest?: {
        profile: InterestProfile;
        signals?: ActivitySignals;
    };
}
const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'had', 'was', 'were', 'are', 'is', 'be', 'been', 'being', 'but', 'not', 'they', 'their', 'them', 'there', 'then', 'than', 'when', 'what', 'which', 'who', 'whom', 'whose', 'into', 'over', 'under', 'about', 'after', 'before', 'more', 'most', 'some', 'such', 'only', 'also', 'just', 'like', 'would', 'could', 'should', 'will', 'can', 'may', 'might', 'must', 'his', 'her', 'its', 'our', 'your', 'all', 'any', 'each', 'other', 'because', 'while', 'where', 'how', 'why', 'these', 'those', 'one', 'two', 'out', 'not', 'you', 'she', 'him', 'did', 'does', 'do', 'very', 'much', 'many']);
export function tokensOf(text: string): string[] {
    return (text.toLowerCase().match(/[a-z][a-z'-]{1,}/g) ?? []).filter(t => t.length > 2 && !STOP.has(t));
}
export function isAuthenticAnchor(p: Passage): boolean {
    const prov = provenanceOf(p);
    return prov !== 'ai_generated' && prov !== 'authored_educational';
}
/** 主题键：优先 passage.topic，其次标题里的实词（稳定，不用随机） */
export function topicKeyOf(p: Passage): string {
    const topic = (p.topic || '').trim();
    if (topic)
        return topic.toLowerCase();
    const words = tokensOf(p.title).slice(0, 2);
    return (words.join(' ') || 'untitled').toLowerCase();
}
function unitUsesPassage(unit: MiniUnit, id: string): boolean {
    return unit.anchorMaterialId === id || (unit.linkedPassageIds ?? []).includes(id);
}
export function recommendThemes(input: ThemeInput): {
    themes: ThemeRecommendation[];
    note: string;
} {
    const authentic = input.passages.filter(isAuthenticAnchor);
    if (!authentic.length)
        return { themes: [], note: '阅读库里还没有真实材料。先把一篇真实英文文章（粘贴/导入/OCR/URL）加入阅读库，才能开始 单元。' };
    const openUnits = input.units.filter(u => u.status === 'active');
    const recentThemes = input.units.filter(u => u.status !== 'abandoned').sort((a, b) => (b.updatedAt ?? b.startedAt) - (a.updatedAt ?? a.startedAt)).slice(0, 3).map(u => u.theme);
    const weak = new Set(input.words.filter(w => w.state.level === 'unknown' || w.state.level === 'vague').map(w => w.en.toLowerCase()));
    const byTopic = new Map<string, Passage[]>();
    for (const p of authentic) {
        const key = topicKeyOf(p);
        byTopic.set(key, [...(byTopic.get(key) ?? []), p]);
    }
    const profile = input.interest?.profile;
    const signals = input.interest?.signals ?? { topics: [], sufficient: false, sampleSize: 0 };
    const scored: {
        rec: ThemeRecommendation;
        score: number;
    }[] = [];
    for (const [key, group] of byTopic) {
        // 已经在进行中的单元占用的材料/主题不再推荐
        const available = group.filter(p => !openUnits.some(u => unitUsesPassage(u, p.id)));
        if (!available.length)
            continue;
        const text = available.map(p => p.text).join('\n');
        const tokens = tokensOf(text);
        const weakInMaterials = [...new Set(tokens.filter(t => weak.has(t)))];
        const grammarInMaterials = observedGrammar(text).map(g => g.conceptId);
        const difficulties = available.map(p => p.difficulty).filter(Boolean);
        const words = selectTargetVocabulary({ passage: available[0], passages: available, words: input.words, now: input.now, availableMinutes: input.availableMinutes });
        const grammar = selectTargetGrammar({ passages: available, grammar: input.grammar, taxonomyIds: GRAMMAR_TAXONOMY.map(g => g.id) });
        const avgWords = Math.round(available.reduce((n, p) => n + p.wordCount, 0) / available.length);
        const estDifficulty = Math.max(0, Math.min(1, 1 - words.words.length / Math.max(4, UNIT_RULES.targetWords.max)));
        // —— Phase 8：兴趣 / 近期行为 / 当前单元 / 防重复 ——
        const interestHit = profile ? interestFor(profile, key, available[0].topic, available[0].title) : null;
        const unitHit = input.units.some(u => u.status === 'active' && u.stage !== 'completed' && u.stage !== 'abandoned' && sameTopic(u, key));
        const recentHit = bestSignal(signals, key, available[0].title);
        const daysSinceUnit = (u: MiniUnit) => Math.max(0, (input.now - (u.updatedAt ?? u.startedAt ?? 0)) / 86400000);
        const justFinished = input.units.filter(u => u.status !== 'abandoned' && (u.stage === 'completed' || u.status === 'completed') && sameTopic(u, key) && daysSinceUnit(u) <= 14).length;
        let score = available.length * 2 + weakInMaterials.length * 3 + grammar.length * 2;
        if (interestHit)
            score += 4 + interestHit.weight * 2;
        if (unitHit)
            score += 2.5;
        score += 1.5 * (recentHit?.weight ?? 0);
        // 防重复：刚完成同主题的单元会显著降权（不是永久拉黑，14 天后自然恢复）
        if (justFinished)
            score -= 4 * justFinished;
        if (recentThemes.includes(key) || recentThemes.includes(available[0].topic))
            score -= 4;
        if (avgWords > 900)
            score -= 2;
        // 理由优先级：显式兴趣 > 当前单元 > 近期行为 > 探索
        const reasonKind: InterestReasonKind = interestHit ? 'interests' : unitHit ? 'unit' : (recentHit?.weight ?? 0) >= 0.25 ? 'recent' : 'explore';
        const reason = REASON_LABELS[reasonKind];
        const why = [
            `阅读库里有 ${available.length} 篇关于「${key}」的真实材料（${available[0].title}${available.length > 1 ? ` 等` : ''}）`,
            interestHit ? `与你设置的兴趣「${interestHit.label}」匹配（显式偏好优先）` : '',
            unitHit ? '与你当前进行中的 单元 同主题' : '',
            !interestHit && !unitHit && (recentHit?.weight ?? 0) >= 0.25 ? `基于你近期的输入练习（${recentHit?.reads ?? 0} 次阅读 / ${recentHit?.imports ?? 0} 次导入）` : '',
            reasonKind === 'explore' ? '这个主题不在你的兴趣列表里，也不是近期行为：作为探索推荐（有真实材料才出现）' : '',
            weakInMaterials.length ? `其中有 ${weakInMaterials.length} 个你最近的薄弱词：${weakInMaterials.slice(0, 5).join('、')}` : '材料里暂未出现你标记的薄弱词',
            grammarInMaterials.length ? `能练到 ${grammarInMaterials.length} 个可观察的语法结构` : '语法结构以基础主干为主',
        ].filter(Boolean);
        const insufficient = weakInMaterials.length === 0 && grammar.filter(g => g.status === 'verified').length === 0;
        if (insufficient)
            why.push('你的练习记录还少：推荐主要看材料主题和长度，学习目标请在开始前自己确认');
        scored.push({
            score,
            rec: {
                themeId: `theme:${key}`,
                theme: titleCase(key),
                topic: available[0].topic || key,
                whyRecommended: why.join('；'),
                basis: {
                    materials: available.map(p => ({ passageId: p.id, title: p.title, wordCount: p.wordCount, provenance: provenanceOf(p) })),
                    weakWordsInMaterials: weakInMaterials,
                    grammarInMaterials,
                    observedDifficulty: difficulties,
                    recentUnitThemes: recentThemes,
                },
                targetWords: words.words.map(w => ({ word: w.word, reason: w.reason })),
                targetGrammar: grammar,
                estimatedDifficulty: Math.round(estDifficulty * 100) / 100,
                difficultyConfidence: words.words.length >= 5 ? 'medium' : 'low',
                estimatedLearningDays: avgWords > 700 ? 4 : 3,
                insufficientEvidence: insufficient,
                reasonKind,
                reasonTag: reason.tag,
                reasonZh: reason.zh,
                exploration: reasonKind === 'explore',
                repeat: justFinished > 0,
            },
        });
    }
    // 防重复硬规则：刚完成过同主题的候选一律排到未重复候选之后（14 天窗口内），
    // 仍然展示（有真实材料就可以选），但不会占据第一顺位。
    const sorted = scored
        .sort((a, b) => Number(a.rec.repeat) - Number(b.rec.repeat) || b.score - a.score || a.rec.theme.localeCompare(b.rec.theme))
        .map(s => s.rec);
    let themes = sorted.slice(0, 3);
    // 探索位：画像非空时，至少保留 1 个“与你无关但有真实材料”的主题（若存在）
    if (profile && profile.topics.length && themes.length >= 2 && !themes.some(t => t.exploration)) {
        const candidate = sorted.find(t => t.exploration && !themes.includes(t));
        if (candidate)
            themes = [...themes.slice(0, Math.max(1, themes.length - 1)), candidate];
    }
    const personalized = !!(profile?.topics.length) || signals.sufficient;
    const insufficientOverall = !personalized;
    if (insufficientOverall && themes.length)
        return { themes, note: '还没设兴趣，最近记录也少（不到 3 次输入练习）：下面只按材料本身推荐，不算个性化。' };
    if (themes.length && themes[0].insufficientEvidence)
        return { themes, note: '依据有限：词库或语法练习还不够。先做几次真实练习，再开新单元。' };
    return { themes, note: themes.length < 3 ? `当前只有 ${themes.length} 个主题有真实材料支撑，不凑数。` : '' };
}
/** 单元主题与候选主题是否同一类（双向包含，避免 “rivers” 与 “rivers and records” 被当成两个） */
function sameTopic(unit: MiniUnit, key: string): boolean {
    const t = normTopic(`${unit.topic ?? ''} ${unit.theme ?? ''}`);
    if (!t)
        return false;
    return t.includes(key) || key.includes(t);
}
function normTopic(s: string): string {
    return s.toLowerCase().replace(/\s+/g, ' ').trim();
}
/** 在近期行为信号里找与当前主题最相关的一条（双向包含） */
function bestSignal(signals: {
    topics: {
        key: string;
        weight: number;
        reads: number;
        imports: number;
    }[];
}, key: string, title: string): {
    weight: number;
    reads: number;
    imports: number;
} | null {
    const hay = normTopic(`${key} ${title}`);
    let best: {
        weight: number;
        reads: number;
        imports: number;
    } | null = null;
    for (const row of signals.topics) {
        const hit = row.key.includes(key) || key.includes(row.key) || hay.includes(row.key) || row.key.includes(hay);
        if (!hit)
            continue;
        if (!best || row.weight > best.weight)
            best = { weight: row.weight, reads: row.reads, imports: row.imports };
    }
    return best;
}
function titleCase(s: string): string {
    return s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
/** 材料中能被可靠观察到的语法（只对正则可达的概念给 verified） */
export function observedGrammar(text: string): {
    conceptId: string;
    name: string;
    count: number;
    sample: string;
}[] {
    const out: {
        conceptId: string;
        name: string;
        count: number;
        sample: string;
    }[] = [];
    for (const def of GRAMMAR_TAXONOMY) {
        const marker = grammarMarker(def.id);
        if (!marker)
            continue;
        const matches = text.match(new RegExp(marker.source, marker.flags.includes('g') ? marker.flags : marker.flags + 'g'));
        if (!matches?.length)
            continue;
        const idx = text.search(marker);
        const sample = idx >= 0 ? text.slice(Math.max(0, idx - 20), Math.min(text.length, idx + 60)).replace(/\s+/g, ' ').trim() : '';
        out.push({ conceptId: def.id, name: def.name, count: matches.length, sample });
    }
    return out.sort((a, b) => b.count - a.count);
}
export interface TargetWordPick {
    word: string;
    wordId: string;
    anchorCount: number;
    value: number;
    reason: string;
}
export function selectTargetVocabulary(input: {
    passage: Passage;
    passages?: Passage[];
    words: Word[];
    now: number;
    availableMinutes: number;
    dueLoad?: number;
    energy?: 'low' | 'normal' | 'good';
}): {
    words: TargetWordPick[];
    uncovered: string[];
    budget: number;
} {
    const passages = input.passages?.length ? input.passages : [input.passage];
    const text = passages.map(p => p.text).join('\n');
    const tokens = tokensOf(text);
    const freq = new Map<string, number>();
    for (const t of tokens)
        freq.set(t, (freq.get(t) ?? 0) + 1);
    const byEn = new Map<string, Word>();
    for (const w of input.words)
        byEn.set(w.en.toLowerCase(), w);
    const budget = targetWordBudget({
        availableMinutes: input.availableMinutes,
        difficulty: input.passage.estimatedDifficulty ?? 0.5,
        dueLoad: input.dueLoad,
        energy: input.energy,
    });
    const picks: {
        pick: TargetWordPick;
        score: number;
    }[] = [];
    const uncovered: string[] = [];
    for (const [token, count] of freq) {
        const word = byEn.get(token);
        if (!word) {
            if (count >= 2 && token.length >= 5)
                uncovered.push(token);
            continue;
        }
        const value = learningValue(word, input.now);
        const weak = word.state.level === 'unknown' || word.state.level === 'vague';
        const score = value.score * (1 + Math.log(1 + count)) + (weak ? 12 : 0);
        const reason = weak
            ? `你的薄弱词，在材料中出现 ${count} 次`
            : count >= 3
                ? `材料核心词（出现 ${count} 次），当前学习价值 ${value.score.toFixed(0)}`
                : `材料中出现 ${count} 次，学习价值 ${value.score.toFixed(0)}`;
        picks.push({ score, pick: { word: word.en, wordId: word.id, anchorCount: count, value: Math.round(value.score), reason } });
    }
    // 薄弱词优先，再按价值；同分时按 anchor 频次与字母序，保证确定性
    picks.sort((a, b) => b.score - a.score || b.pick.anchorCount - a.pick.anchorCount || a.pick.word.localeCompare(b.pick.word));
    return { words: picks.slice(0, budget).map(p => p.pick), uncovered: uncovered.sort(), budget };
}
export function selectTargetGrammar(input: {
    passages: Passage[];
    grammar: GrammarConcept[];
    taxonomyIds?: string[];
}): MiniUnitGrammarTarget[] {
    const text = input.passages.map(p => p.text).join('\n');
    const observed = new Map(observedGrammar(text).map(g => [g.conceptId, g]));
    const weak = input.grammar
        .filter(g => g.attempts > 0 && (g.mastery < 0.6 || g.correct / Math.max(1, g.attempts) < 0.6))
        .sort((a, b) => a.mastery - b.mastery)
        .slice(0, 6);
    const out: MiniUnitGrammarTarget[] = [];
    // 1) 材料里可观察 + 你确实薄弱的：最高优先
    for (const g of weak) {
        const seen = observed.get(g.id);
        if (!seen)
            continue;
        out.push({
            conceptId: g.id,
            name: g.name,
            status: 'verified',
            evidence: `材料中出现 ${seen.count} 次（如“${seen.sample.slice(0, 40)}”），你的正确率 ${Math.round((g.correct / Math.max(1, g.attempts)) * 100)}%`,
        });
    }
    // 2) 材料里可观察的结构（按出现次数），补足到 3 个
    for (const seen of [...observed.values()].sort((a, b) => b.count - a.count)) {
        if (out.length >= 3)
            break;
        if (out.some(g => g.conceptId === seen.conceptId))
            continue;
        out.push({ conceptId: seen.conceptId, name: seen.name, status: 'verified', evidence: `材料中出现 ${seen.count} 次（如“${seen.sample.slice(0, 40)}”）` });
    }
    // 3) 仍不足：把薄弱点标为 candidate（明确未在材料中核验）
    for (const g of weak) {
        if (out.length >= 2)
            break;
        if (out.some(x => x.conceptId === g.id))
            continue;
        out.push({
            conceptId: g.id,
            name: g.name,
            status: 'candidate',
            evidence: `你的薄弱点（正确率 ${Math.round((g.correct / Math.max(1, g.attempts)) * 100)}%），但在当前材料中未直接观察到`,
        });
    }
    return out.slice(0, 3);
}
/** 迁移材料候选：同主题、真实、与 Anchor 内容不同 */
export function transferCandidates(passages: Passage[], unit: MiniUnit, limit = 3): Passage[] {
    const anchor = passages.find(p => p.id === unit.anchorMaterialId);
    const key = anchor ? topicKeyOf(anchor) : '';
    const used = new Set(unit.linkedPassageIds ?? []);
    return passages
        .filter(p => p.id !== unit.anchorMaterialId && !used.has(p.id) && isAuthenticAnchor(p))
        .filter(p => !key || topicKeyOf(p) === key || (p.topic || '').toLowerCase() === (anchor?.topic || '').toLowerCase())
        .filter(p => (p.contentHash ?? p.id) !== (anchor?.contentHash ?? anchor?.id))
        .sort((a, b) => Math.abs(a.wordCount - (anchor?.wordCount ?? a.wordCount)) - Math.abs(b.wordCount - (anchor?.wordCount ?? b.wordCount)))
        .slice(0, limit);
}
