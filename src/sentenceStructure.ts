// —— Phase 4：Sentence Structure Representation ——
// 设计依据：PROJECT_SPEC §49（Sentence Tree）；REFERENCE_RESEARCH §（spaCy displaCy 的 words/arcs 思路，只借鉴形状不复制代码）。
// 纪律：
//   1) 结构必须可校验：越界索引、非法 head、自环、环、重复 token 索引一律拒绝。
//   2) 启发式分析必须显式标记为不确定；没有 gold 结构时允许引导式手动拆句 + 明确的 fallback，
//      绝不因为"认出了名词/动词"就伪造完整依存句法树。
import type { SentenceStructureProvenance } from './types.ts';
export const STRUCTURE_VERSION = 1 as const;
export type StructureRole = 'subject' | 'predicate' | 'object' | 'complement' | 'modifier' | 'subordinator' | 'relative' | 'nonfinite' | 'conjunction' | 'adverbial' | 'other';
export const ROLE_LABELS: Record<StructureRole, string> = {
    subject: '主语',
    predicate: '谓语',
    object: '宾语',
    complement: '补语',
    modifier: '修饰',
    subordinator: '从句引导词',
    relative: '关系词',
    nonfinite: '非谓语',
    conjunction: '并列连词',
    adverbial: '状语',
    other: '其他',
};
export type ClauseKind = 'main' | 'object' | 'relative' | 'adverbial' | 'subject' | 'predicative' | 'nonfinite';
export const CLAUSE_LABELS: Record<ClauseKind, string> = {
    main: '主句',
    object: '宾语从句',
    relative: '定语从句',
    adverbial: '状语从句',
    subject: '主语从句',
    predicative: '表语从句',
    nonfinite: '非谓语结构',
};
export interface StructureToken {
    i: number;
    text: string;
    role: StructureRole;
    head: number;
    clauseId: string;
    note: string;
}
export interface StructureClause {
    id: string;
    kind: ClauseKind;
    label: string;
    start: number;
    end: number;
    parentId: string | null;
    grammarConceptIds: string[];
}
export interface SentenceStructure {
    version: typeof STRUCTURE_VERSION;
    sentenceId: string;
    text: string;
    tokens: StructureToken[];
    clauses: StructureClause[];
    rootClauseId: string;
    provenance: SentenceStructureProvenance;
    confidence: number;
    note: string;
}
export interface StructureIssue {
    kind: 'empty' | 'token-index' | 'token-text' | 'role' | 'head-range' | 'self-head' | 'cycle' | 'multi-root' | 'clause-range' | 'clause-parent' | 'clause-nesting' | 'root-clause' | 'clause-token';
    detail: string;
}
export interface StructureValidation {
    ok: boolean;
    issues: StructureIssue[];
    structure: SentenceStructure;
    fallback: boolean;
}
const ROLES = Object.keys(ROLE_LABELS) as StructureRole[];
const CLAUSE_KINDS = Object.keys(CLAUSE_LABELS) as ClauseKind[];
// —— 词表（仅用于启发式切分的"提示"，不代表可靠句法分析）——
const SUBORDINATORS = ['that', 'which', 'who', 'whom', 'whose', 'where', 'when', 'while', 'because', 'although', 'though', 'if', 'unless', 'since', 'after', 'before', 'as', 'so', 'whether', 'what', 'how'];
const CONJUNCTIONS = ['and', 'or', 'but', 'nor', 'yet', 'so'];
const NONFINITE_HINTS = ['to'];
export function tokenize(text: string): string[] {
    return text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
}
// 兜底结构：只保证"可渲染 + 可校验"，明确标注不确定，不声称做了句法分析
export function fallbackStructure(sentenceId: string, text: string, reason = 'no-gold-structure'): SentenceStructure {
    const words = tokenize(text);
    const tokens: StructureToken[] = words.map((w, i) => ({ i, text: w, role: 'other', head: i === 0 ? -1 : i - 1, clauseId: 'c0', note: '' }));
    return {
        version: STRUCTURE_VERSION,
        sentenceId,
        text,
        tokens,
        clauses: [{ id: 'c0', kind: 'main', label: CLAUSE_LABELS.main, start: 0, end: Math.max(0, words.length - 1), parentId: null, grammarConceptIds: [] }],
        rootClauseId: 'c0',
        provenance: 'none',
        confidence: 0,
        note: `无法获得可靠结构（${reason}）：当前只提供分词与单层切分，需要用户引导式手动拆句或补充人工审校结构。`,
    };
}
// 启发式切分：只标出"看到引导词/逗号"的位置，明确标注不确定，绝不生成完整依存树
export function heuristicStructure(sentenceId: string, text: string): SentenceStructure {
    const words = tokenize(text);
    const tokens: StructureToken[] = words.map((w, i) => {
        const lower = w.toLowerCase().replace(/[^a-z']/g, '');
        let role: StructureRole = 'other';
        if (SUBORDINATORS.includes(lower))
            role = 'relative';
        else if (CONJUNCTIONS.includes(lower))
            role = 'conjunction';
        else if (lower === 'to' || lower === 'doing')
            role = 'nonfinite';
        else if (lower.endsWith('ing') || lower.endsWith('ed'))
            role = 'nonfinite';
        return { i, text: w, role, head: i === 0 ? -1 : i - 1, clauseId: 'c0', note: '' };
    });
    const boundaries: number[] = [];
    tokens.forEach(t => {
        if ((t.role === 'relative' || t.role === 'conjunction') && t.i > 0)
            boundaries.push(t.i);
    });
    const clauses: StructureClause[] = [];
    const ranges: Array<[
        number,
        number
    ]> = [];
    let start = 0;
    for (const b of [...new Set(boundaries)].sort((a, c) => a - c)) {
        if (b - 1 < start)
            continue;
        ranges.push([start, b - 1]);
        start = b;
    }
    ranges.push([start, Math.max(start, words.length - 1)]);
    ranges.forEach(([s, e], idx) => {
        const id = idx === 0 ? 'c0' : `c${idx}`;
        const kind: ClauseKind = idx === 0 ? 'main' : 'adverbial';
        clauses.push({ id, kind, label: idx === 0 ? CLAUSE_LABELS.main : '可能的小句（未确认类型）', start: s, end: e, parentId: idx === 0 ? null : 'c0', grammarConceptIds: [] });
        for (let i = s; i <= e; i++)
            if (tokens[i])
                tokens[i].clauseId = id;
    });
    return {
        version: STRUCTURE_VERSION,
        sentenceId,
        text,
        tokens,
        clauses,
        rootClauseId: 'c0',
        provenance: 'heuristic',
        confidence: 0.35,
        note: '启发式切分：只依据引导词与标点划分范围，依赖关系与成分角色未经分析，请勿当作可靠句法树。',
    };
}
export function structureIssue(kind: StructureIssue['kind'], detail: string): StructureIssue {
    return { kind, detail };
}
export function validateStructure(input: unknown): StructureValidation {
    const issues: StructureIssue[] = [];
    const s = (input ?? null) as SentenceStructure | null;
    if (!s || typeof s !== 'object' || !Array.isArray(s.tokens) || !s.tokens.length)
        return { ok: false, issues: [structureIssue('empty', '结构缺失或没有 token')], structure: fallbackStructure(s?.sentenceId ?? 'unknown', s?.text ?? ''), fallback: true };
    const n = s.tokens.length;
    const seen = new Set<number>();
    s.tokens.forEach((t, idx) => {
        if (!Number.isInteger(t.i) || t.i < 0 || t.i >= n || seen.has(t.i)) {
            issues.push(structureIssue('token-index', `token 索引非法或重复：${String(t.i)}`));
        }
        else
            seen.add(t.i);
        if (typeof t.text !== 'string' || !t.text.trim())
            issues.push(structureIssue('token-text', `token ${t.i} 缺少文本`));
        if (!ROLES.includes(t.role))
            issues.push(structureIssue('role', `token ${t.i} 角色非法：${String(t.role)}`));
        if (!Number.isInteger(t.head) || t.head < -1 || t.head >= n)
            issues.push(structureIssue('head-range', `token ${t.i} 的 head 越界：${String(t.head)}`));
        else if (t.head === t.i)
            issues.push(structureIssue('self-head', `token ${t.i} 指向自身`));
    });
    // 依存环检测（head 指向父节点）
    if (!issues.some(i => i.kind === 'head-range' || i.kind === 'self-head')) {
        const state = new Map<number, 0 | 1 | 2>();
        const walk = (i: number): boolean => {
            const st = state.get(i) ?? 0;
            if (st === 2)
                return false;
            if (st === 1) {
                issues.push(structureIssue('cycle', `依赖关系出现环，涉及 token ${i}`));
                return true;
            }
            state.set(i, 1);
            const head = s.tokens[i]?.head ?? -1;
            if (head >= 0 && walk(head))
                return true;
            state.set(i, 2);
            return false;
        };
        for (let i = 0; i < n; i++)
            if (walk(i))
                break;
        const roots = s.tokens.filter(t => t.head === -1).length;
        if (roots !== 1)
            issues.push(structureIssue('multi-root', `根节点数量为 ${roots}，应恰好为 1`));
    }
    // 子句校验
    const clauses = Array.isArray(s.clauses) ? s.clauses : [];
    if (!clauses.length)
        issues.push(structureIssue('clause-range', '缺少子句划分'));
    const clauseIds = new Set(clauses.map(c => c.id));
    for (const c of clauses) {
        if (!CLAUSE_KINDS.includes(c.kind))
            issues.push(structureIssue('clause-range', `子句 ${c.id} 类型非法：${String(c.kind)}`));
        if (!Number.isInteger(c.start) || !Number.isInteger(c.end) || c.start < 0 || c.end >= n || c.start > c.end)
            issues.push(structureIssue('clause-range', `子句 ${c.id} 范围非法：${c.start}–${c.end}`));
        if (c.parentId !== null && !clauseIds.has(c.parentId))
            issues.push(structureIssue('clause-parent', `子句 ${c.id} 的父级不存在：${String(c.parentId)}`));
        if (c.parentId) {
            const parent = clauses.find(p => p.id === c.parentId);
            if (parent && (c.start < parent.start || c.end > parent.end))
                issues.push(structureIssue('clause-nesting', `子句 ${c.id} 未嵌套在 ${parent.id} 范围内`));
        }
    }
    if (!clauseIds.has(s.rootClauseId))
        issues.push(structureIssue('root-clause', `rootClauseId 不存在：${String(s.rootClauseId)}`));
    for (const t of s.tokens)
        if (!clauseIds.has(t.clauseId))
            issues.push(structureIssue('clause-token', `token ${t.i} 指向不存在的子句 ${String(t.clauseId)}`));
    if (issues.length)
        return { ok: false, issues, structure: fallbackStructure(s.sentenceId, s.text, `invalid-structure:${issues[0].kind}`), fallback: true };
    return {
        ok: true,
        issues: [],
        structure: {
            version: STRUCTURE_VERSION,
            sentenceId: s.sentenceId,
            text: s.text,
            tokens: s.tokens.map(t => ({ ...t, note: t.note ?? '' })),
            clauses,
            rootClauseId: s.rootClauseId,
            provenance: s.provenance,
            confidence: typeof s.confidence === 'number' ? Math.max(0, Math.min(1, s.confidence)) : 0,
            note: s.note ?? '',
        },
        fallback: false,
    };
}
// 从持久化的 unknown 安全读取结构（失败 → 明确标注的 fallback，绝不抛异常给 UI）
export function readStructure(value: unknown, sentenceId: string, text: string): StructureValidation {
    if (!value)
        return { ok: false, issues: [structureIssue('empty', '没有结构数据')], structure: fallbackStructure(sentenceId, text), fallback: true };
    return validateStructure(value);
}
export function structureByToken(structure: SentenceStructure): Map<number, StructureToken> {
    return new Map(structure.tokens.map(t => [t.i, t]));
}
// 供 UI 渲染：按子句分组的可折叠层级（不含"依赖树"语义，只展示范围与角色）
export interface StructureRow {
    tokenIndex: number;
    text: string;
    role: StructureRole;
    roleLabel: string;
    clauseId: string;
    depth: number;
    headText: string;
    note: string;
}
export function structureRows(structure: SentenceStructure): StructureRow[] {
    const byIdx = structureByToken(structure);
    const clauseDepth = new Map<string, number>();
    const depthOf = (id: string, guard = 0): number => {
        if (clauseDepth.has(id))
            return clauseDepth.get(id)!;
        const c = structure.clauses.find(x => x.id === id);
        const d = !c || !c.parentId || guard > 8 ? 0 : depthOf(c.parentId, guard + 1) + 1;
        clauseDepth.set(id, d);
        return d;
    };
    return [...structure.tokens].sort((a, b) => a.i - b.i).map(t => ({
        tokenIndex: t.i,
        text: t.text,
        role: t.role,
        roleLabel: ROLE_LABELS[t.role] ?? '其他',
        clauseId: t.clauseId,
        depth: depthOf(t.clauseId),
        headText: t.head >= 0 ? byIdx.get(t.head)?.text ?? '' : '（根）',
        note: t.note,
    }));
}
export function clausesOf(structure: SentenceStructure): StructureClause[] {
    return [...structure.clauses].sort((a, b) => a.start - b.start);
}
export function clauseForToken(structure: SentenceStructure, tokenIndex: number): StructureClause | undefined {
    // 返回"包含该词且范围最小"的子句：嵌套从句的 token 同时落在主句区间内
    return [...structure.clauses]
        .filter(c => c.start <= tokenIndex && tokenIndex <= c.end)
        .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
}
export function tokensWithRole(structure: SentenceStructure, role: StructureRole): StructureToken[] {
    return structure.tokens.filter(t => t.role === role).sort((a, b) => a.i - b.i);
}
export function spanText(structure: SentenceStructure, range: [
    number,
    number
]): string {
    return structure.tokens.filter(t => t.i >= range[0] && t.i <= range[1]).map(t => t.text).join(' ');
}
export function structureSummary(structure: SentenceStructure): {
    ok: boolean;
    clauseCount: number;
    roles: Record<string, number>;
    clauseKinds: ClauseKind[];
    confidence: number;
    provenance: SentenceStructureProvenance;
} {
    const roles: Record<string, number> = {};
    for (const t of structure.tokens)
        roles[t.role] = (roles[t.role] ?? 0) + 1;
    return { ok: !!(structure.tokens.length && structure.clauses.length), clauseCount: structure.clauses.length, roles, clauseKinds: [...new Set(structure.clauses.map(c => c.kind))], confidence: structure.confidence, provenance: structure.provenance };
}
// 难度相关结构指标（供选择器使用，不是"难度 = 长度"）
export function structureMetrics(structure: SentenceStructure): {
    tokenCount: number;
    clauseCount: number;
    maxDepth: number;
    nonfiniteCount: number;
    subordinatorCount: number;
} {
    const rows = structureRows(structure);
    const depthOf = (id: string, guard = 0): number => {
        const c = structure.clauses.find(x => x.id === id);
        return !c || !c.parentId || guard > 8 ? 0 : depthOf(c.parentId, guard + 1) + 1;
    };
    return {
        tokenCount: structure.tokens.length,
        clauseCount: structure.clauses.length,
        maxDepth: structure.clauses.reduce((m, c) => Math.max(m, depthOf(c.id)), 0),
        nonfiniteCount: rows.filter(r => r.role === 'nonfinite').length,
        subordinatorCount: rows.filter(r => r.role === 'subordinator' || r.role === 'relative').length,
    };
}
