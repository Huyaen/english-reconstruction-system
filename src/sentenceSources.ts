// —— Phase 4：Sentence Source Contract（句源契约）——
// 设计依据：PROJECT_SPEC §46–§47、AGENT_EXECUTION Phase 4/6 边界。
// 纪律：
//   1) AI 未上线时绝不伪造 AI 句；没有外部语料时绝不编造文章出处。
//   2) 允许明确标记为 authored / curated 的人工教学句（由本应用作者撰写，provenance 明示）。
//   3) 目标比例 40% AI / 40% 用户真实难句 / 20% 新真实语料（§46），当前按真实可用能力自动重新分配。
import type { SentenceRecord, SentenceSourceType } from './types.ts';
import { STRUCTURE_VERSION, heuristicStructure, tokenize, type ClauseKind, type SentenceStructure, type StructureClause, type StructureRole, type StructureToken } from './sentenceStructure.ts';
export const CURATED_ATTRIBUTION = '本应用作者写的教学句，不是从文章里摘的原句';
export const SOURCE_LABELS: Record<SentenceSourceType, string> = {
    curated: '练习句',
    user: '你自己加的句子',
    saved: '你收藏的难句',
    'real-material': '真实材料里的句子',
    reading: '从阅读带过来的句子',
    ai: 'AI 生成的句子',
};
export const TARGET_SOURCE_MIX = { ai: 0.4, user: 0.4, real: 0.2 } as const;
// —— gold 结构构造器：以紧凑声明生成可校验结构，避免手工维护 token 表 ——
interface GoldClauseSpec {
    id: string;
    kind: ClauseKind;
    start: number;
    end: number;
    parent: string | null;
    head: number;
    concepts: string[];
}
interface GoldTokenSpec {
    role: StructureRole;
    head?: number;
    note?: string;
}
export interface GoldSentenceSpec {
    id: string;
    text: string;
    zh: string;
    theme: string;
    grammar: string[];
    difficulty: 1 | 2 | 3;
    // 预教词（中文释义）：让句子在生词不多的情况下也能被理解
    glossary: Record<string, string>;
    clauses: GoldClauseSpec[];
    tokens: Record<number, GoldTokenSpec>;
}
export function buildGoldStructure(spec: GoldSentenceSpec): SentenceStructure {
    const words = tokenize(spec.text);
    const byId = new Map(spec.clauses.map(c => [c.id, c]));
    const tokens: StructureToken[] = words.map((w, i) => {
        // 嵌套：token 属于"包含它且范围最小"的子句（否则从句里的词会被算进主句角色）
        const containing = spec.clauses.filter(c => c.start <= i && i <= c.end)
            .sort((a, b) => (a.end - a.start) - (b.end - b.start));
        const clause = containing[0] ?? spec.clauses[0];
        const explicit = spec.tokens[i];
        const parentClause = clause.parent ? byId.get(clause.parent) : undefined;
        const sameClauseHead = clause.head === i;
        const head = explicit?.head ?? (sameClauseHead ? (parentClause ? parentClause.head : -1) : clause.head);
        return { i, text: w, role: explicit?.role ?? 'other', head, clauseId: clause.id, note: explicit?.note ?? '' };
    });
    const clauses: StructureClause[] = spec.clauses.map(c => ({ id: c.id, kind: c.kind, label: c.kind === 'main' ? '主句' : c.kind === 'nonfinite' ? '非谓语结构' : '从句', start: c.start, end: c.end, parentId: c.parent, grammarConceptIds: [...c.concepts] }));
    return {
        version: STRUCTURE_VERSION,
        sentenceId: spec.id,
        text: spec.text,
        tokens,
        clauses,
        rootClauseId: spec.clauses.find(c => c.parent === null)?.id ?? spec.clauses[0].id,
        provenance: 'gold',
        confidence: 1,
        note: '人工审校的教学句结构，可直接用于结构分析练习。',
    };
}
// —— 人工教学句库（authored；每句都带 gold 结构与目标语法概念）——
const CURATED_SPECS: GoldSentenceSpec[] = [
    {
        id: 'sen.curated.relative-01',
        text: 'The report that he wrote about the flood is missing.',
        zh: '他写的关于那次洪水的报告不见了。',
        theme: '工作与失误',
        grammar: ['clause.relative', 'clause.attributive-nonexistent', 'structure.modifier', 'phrase.preposition'],
        difficulty: 3,
        glossary: { report: '报告', flood: '洪水', wrote: '写（write 的过去式）', missing: '不见了／缺失' },
        clauses: [
            { id: 'c0', kind: 'main', start: 0, end: 9, parent: null, head: 8, concepts: ['structure.core', 'structure.subject', 'structure.predicate'] },
            { id: 'c1', kind: 'relative', start: 2, end: 7, parent: 'c0', head: 4, concepts: ['clause.relative', 'structure.modifier'] },
        ],
        tokens: {
            0: { role: 'modifier', head: 1 }, 1: { role: 'subject', head: 8 }, 2: { role: 'relative', head: 1 },
            3: { role: 'subject', head: 4 }, 4: { role: 'predicate', head: 8 }, 5: { role: 'modifier', head: 4 },
            6: { role: 'modifier', head: 7 }, 7: { role: 'object', head: 5 }, 8: { role: 'predicate', head: -1 },
            9: { role: 'complement', head: 8 },
        },
    },
    {
        id: 'sen.curated.object-01',
        text: 'I think that the plan will work.',
        zh: '我认为这个计划会奏效。',
        theme: '判断',
        grammar: ['clause.object', 'clause.main', 'verb.modal'],
        difficulty: 2,
        glossary: { plan: '计划', work: '奏效（动词）' },
        clauses: [
            { id: 'c0', kind: 'main', start: 0, end: 6, parent: null, head: 1, concepts: ['clause.main', 'structure.svo'] },
            { id: 'c1', kind: 'object', start: 2, end: 6, parent: 'c0', head: 6, concepts: ['clause.object', 'structure.object'] },
        ],
        tokens: { 0: { role: 'subject', head: 1 }, 1: { role: 'predicate', head: -1 }, 2: { role: 'subordinator', head: 6 }, 3: { role: 'modifier', head: 4 }, 4: { role: 'subject', head: 6 }, 5: { role: 'predicate', head: 6 }, 6: { role: 'predicate', head: 1 } },
    },
    {
        id: 'sen.curated.adverbial-01',
        text: 'Although it rained they continued the work.',
        zh: '尽管下雨，他们还是继续了工作。',
        theme: '坚持',
        grammar: ['clause.adverbial', 'logic.connection', 'verb.tense'],
        difficulty: 2,
        glossary: { although: '尽管', rained: '下雨（rain 的过去式）', continued: '继续（continue 的过去式）' },
        clauses: [
            { id: 'c0', kind: 'main', start: 0, end: 6, parent: null, head: 4, concepts: ['clause.main', 'structure.svo'] },
            { id: 'c1', kind: 'adverbial', start: 0, end: 2, parent: 'c0', head: 2, concepts: ['clause.adverbial'] },
        ],
        tokens: { 0: { role: 'subordinator', head: 2 }, 1: { role: 'subject', head: 2 }, 2: { role: 'predicate', head: 4 }, 3: { role: 'subject', head: 4 }, 4: { role: 'predicate', head: -1 }, 5: { role: 'modifier', head: 6 }, 6: { role: 'object', head: 4 } },
    },
    {
        id: 'sen.curated.participle-01',
        text: 'The book written in 1900 still sells well.',
        zh: '这本 1900 年写成的书至今仍很畅销。',
        theme: '书籍',
        grammar: ['nonfinite.participle', 'nonfinite.role', 'structure.modifier', 'verb.passive'],
        difficulty: 3,
        glossary: { written: '写成的（write 的过去分词）', sells: '畅销（sell 第三人称单数）', still: '仍然' },
        clauses: [
            { id: 'c0', kind: 'main', start: 0, end: 7, parent: null, head: 6, concepts: ['structure.core', 'structure.subject', 'structure.predicate'] },
            { id: 'c1', kind: 'nonfinite', start: 2, end: 4, parent: 'c0', head: 2, concepts: ['nonfinite.participle', 'nonfinite.role'] },
        ],
        tokens: { 0: { role: 'modifier', head: 1 }, 1: { role: 'subject', head: 6 }, 2: { role: 'nonfinite', head: 1 }, 3: { role: 'modifier', head: 4 }, 4: { role: 'modifier', head: 2 }, 5: { role: 'adverbial', head: 6 }, 6: { role: 'predicate', head: -1 }, 7: { role: 'adverbial', head: 6 } },
    },
    {
        id: 'sen.curated.gerund-01',
        text: 'She is good at solving hard problems.',
        zh: '她很擅长解决难题。',
        theme: '能力',
        grammar: ['nonfinite.gerund', 'phrase.preposition-gerund', 'phrase.preposition', 'structure.svc'],
        difficulty: 2,
        glossary: { solving: '解决（solve 的 -ing 形式）', problems: '难题（复数）' },
        clauses: [
            { id: 'c0', kind: 'main', start: 0, end: 6, parent: null, head: 1, concepts: ['structure.svc', 'structure.complement'] },
            { id: 'c1', kind: 'nonfinite', start: 3, end: 6, parent: 'c0', head: 4, concepts: ['nonfinite.gerund', 'phrase.preposition-gerund'] },
        ],
        tokens: { 0: { role: 'subject', head: 1 }, 1: { role: 'predicate', head: -1 }, 2: { role: 'complement', head: 1 }, 3: { role: 'modifier', head: 2 }, 4: { role: 'nonfinite', head: 3, note: '介词 at 后必须用名词性质的 doing' }, 5: { role: 'modifier', head: 6 }, 6: { role: 'object', head: 4 } },
    },
    {
        id: 'sen.curated.infinitive-01',
        text: 'He left early to catch the train.',
        zh: '他早早出发去赶火车。',
        theme: '出行',
        grammar: ['nonfinite.infinitive', 'nonfinite.role'],
        difficulty: 1,
        glossary: { left: '离开（leave 的过去式）', early: '早早地', catch: '赶上（车）' },
        clauses: [
            { id: 'c0', kind: 'main', start: 0, end: 6, parent: null, head: 1, concepts: ['structure.svo'] },
            { id: 'c1', kind: 'nonfinite', start: 3, end: 6, parent: 'c0', head: 4, concepts: ['nonfinite.infinitive', 'nonfinite.role'] },
        ],
        tokens: { 0: { role: 'subject', head: 1 }, 1: { role: 'predicate', head: -1 }, 2: { role: 'adverbial', head: 1 }, 3: { role: 'nonfinite', head: 4 }, 4: { role: 'nonfinite', head: 1, note: 'to catch 是表目的的不定式' }, 5: { role: 'modifier', head: 6 }, 6: { role: 'object', head: 4 } },
    },
    {
        id: 'sen.curated.passive-01',
        text: 'The bridge was built in 1900 by local workers.',
        zh: '这座桥是 1900 年由当地工人建造的。',
        theme: '工程',
        grammar: ['verb.passive', 'phrase.preposition', 'structure.predicate'],
        difficulty: 2,
        glossary: { bridge: '桥', built: '建造（build 的过去分词）', workers: '工人（复数）', local: '当地的' },
        clauses: [
            { id: 'c0', kind: 'main', start: 0, end: 8, parent: null, head: 2, concepts: ['verb.passive', 'structure.predicate'] },
        ],
        tokens: { 0: { role: 'modifier', head: 1 }, 1: { role: 'subject', head: 2 }, 2: { role: 'predicate', head: -1 }, 3: { role: 'predicate', head: 2, note: 'be + 过去分词 = 被动' }, 4: { role: 'modifier', head: 3 }, 5: { role: 'modifier', head: 4 }, 6: { role: 'modifier', head: 3 }, 7: { role: 'modifier', head: 8 }, 8: { role: 'object', head: 6, note: 'by 引出真正的施动者' } },
    },
    {
        id: 'sen.curated.nested-01',
        text: 'The book that I read says that the plan will fail.',
        zh: '我读的那本书说这个计划会失败。',
        theme: '阅读',
        grammar: ['clause.relative', 'clause.object', 'clause.nested'],
        difficulty: 3,
        glossary: { fail: '失败', read: '读（read 的过去式）', plan: '计划' },
        clauses: [
            { id: 'c0', kind: 'main', start: 0, end: 10, parent: null, head: 5, concepts: ['clause.main', 'structure.svo'] },
            { id: 'c1', kind: 'relative', start: 2, end: 4, parent: 'c0', head: 4, concepts: ['clause.relative'] },
            { id: 'c2', kind: 'object', start: 6, end: 10, parent: 'c0', head: 10, concepts: ['clause.object', 'clause.nested'] },
        ],
        tokens: { 0: { role: 'modifier', head: 1 }, 1: { role: 'subject', head: 5 }, 2: { role: 'relative', head: 1 }, 3: { role: 'subject', head: 4 }, 4: { role: 'predicate', head: 5 }, 5: { role: 'predicate', head: -1 }, 6: { role: 'subordinator', head: 10 }, 7: { role: 'modifier', head: 8 }, 8: { role: 'subject', head: 10 }, 9: { role: 'predicate', head: 10 }, 10: { role: 'predicate', head: 5 } },
    },
    {
        id: 'sen.curated.coordination-01',
        text: 'She sings and dances every evening.',
        zh: '她每天晚上又唱又跳。',
        theme: '日常',
        grammar: ['phrase.coordination', 'logic.connection'],
        difficulty: 1,
        glossary: { sings: '唱歌', dances: '跳舞', evening: '晚上' },
        clauses: [{ id: 'c0', kind: 'main', start: 0, end: 5, parent: null, head: 1, concepts: ['phrase.coordination', 'structure.svo'] }],
        tokens: { 0: { role: 'subject', head: 1 }, 1: { role: 'predicate', head: -1 }, 2: { role: 'conjunction', head: 3 }, 3: { role: 'predicate', head: 1, note: '与 sings 同级并列' }, 4: { role: 'adverbial', head: 3 }, 5: { role: 'adverbial', head: 4 } },
    },
    {
        id: 'sen.curated.comparison-01',
        text: 'The more you practise the more confident you become.',
        zh: '你练得越多，就越自信。',
        theme: '学习',
        grammar: ['logic.comparison', 'structure.svc'],
        difficulty: 3,
        glossary: { practise: '练习（英式拼写）', confident: '自信的', more: '更' },
        clauses: [
            { id: 'c0', kind: 'main', start: 0, end: 8, parent: null, head: 8, concepts: ['logic.comparison'] },
            { id: 'c1', kind: 'adverbial', start: 0, end: 3, parent: 'c0', head: 3, concepts: ['logic.comparison'] },
        ],
        tokens: { 0: { role: 'adverbial', head: 3 }, 1: { role: 'adverbial', head: 3 }, 2: { role: 'subject', head: 3 }, 3: { role: 'predicate', head: 8 }, 4: { role: 'adverbial', head: 8 }, 5: { role: 'adverbial', head: 8 }, 6: { role: 'complement', head: 8 }, 7: { role: 'subject', head: 8 }, 8: { role: 'predicate', head: -1 } },
    },
    {
        id: 'sen.curated.negation-01',
        text: 'I do not think that this approach works.',
        zh: '我认为这个方法行不通。',
        theme: '判断',
        grammar: ['logic.negation', 'clause.object', 'verb.tense'],
        difficulty: 3,
        glossary: { approach: '做法／方法', works: '奏效（work 第三人称单数）', think: '认为' },
        clauses: [
            { id: 'c0', kind: 'main', start: 0, end: 7, parent: null, head: 3, concepts: ['logic.negation', 'structure.svo'] },
            { id: 'c1', kind: 'object', start: 4, end: 7, parent: 'c0', head: 7, concepts: ['clause.object'] },
        ],
        tokens: { 0: { role: 'subject', head: 3 }, 1: { role: 'predicate', head: 3 }, 2: { role: 'adverbial', head: 3, note: '否定实际作用在从句上' }, 3: { role: 'predicate', head: -1 }, 4: { role: 'subordinator', head: 7 }, 5: { role: 'modifier', head: 6 }, 6: { role: 'subject', head: 7 }, 7: { role: 'predicate', head: 3 } },
    },
    {
        id: 'sen.curated.subject-01',
        text: 'What he said surprised the whole team.',
        zh: '他说的话让整个团队都很意外。',
        theme: '沟通',
        grammar: ['clause.subject', 'structure.subject'],
        difficulty: 3,
        glossary: { surprised: '使…惊讶', whole: '整个', team: '团队', said: '说（say 的过去式）' },
        clauses: [
            { id: 'c0', kind: 'main', start: 0, end: 6, parent: null, head: 3, concepts: ['structure.core', 'structure.svo'] },
            { id: 'c1', kind: 'subject', start: 0, end: 2, parent: 'c0', head: 2, concepts: ['clause.subject', 'structure.subject'] },
        ],
        tokens: { 0: { role: 'subordinator', head: 2 }, 1: { role: 'subject', head: 2 }, 2: { role: 'predicate', head: 3 }, 3: { role: 'predicate', head: -1 }, 4: { role: 'modifier', head: 6 }, 5: { role: 'modifier', head: 6 }, 6: { role: 'object', head: 3 } },
    },
];
export function curatedSentenceRecords(now = Date.now()): SentenceRecord[] {
    return CURATED_SPECS.map(spec => ({
        id: spec.id,
        text: spec.text,
        zh: spec.zh,
        sourceType: 'curated' as const,
        sourceId: 'curated-bank',
        attribution: CURATED_ATTRIBUTION,
        grammarTags: [...spec.grammar],
        targetWordIds: [],
        theme: spec.theme,
        glossary: { ...spec.glossary },
        difficulty: spec.difficulty,
        structure: buildGoldStructure(spec),
        structureProvenance: 'gold' as const,
        createdBy: 'system' as const,
        createdAt: 0,
        usedCount: 0,
        lastUsedAt: 0,
        notes: '',
    }));
}
export function curatedSpecs(): GoldSentenceSpec[] {
    return CURATED_SPECS.map(s => ({ ...s }));
}
export function curatedById(id: string): SentenceRecord | undefined {
    return curatedSentenceRecords().find(s => s.id === id);
}
// 把 curated 句库写入数据（幂等：已有 id 保留统计，只补缺失）
export function ensureCuratedSentences(existing: SentenceRecord[], now = Date.now()): SentenceRecord[] {
    const out = [...existing];
    for (const base of curatedSentenceRecords(now)) {
        if (out.some(s => s.id === base.id))
            continue;
        out.push({ ...base, createdAt: now });
    }
    return out;
}
// —— 句源能力与动态比例（Phase 16.2：把三个概念分开，绝不虚报）——
// A. configured   配置有效：只说明填了服务地址/模型/密钥，不代表连得上，也不代表生成过。
// B. canGenerate  产品里已经实现了「AI 定向句」手动生成；与句库里有没有 AI 句无关。
// C. available    句库里真的有这种句子，现在就能用于训练（count > 0）。
// 旧实现把 available 当成 configured，于是「0 句可用」和「占四成」同时出现；
// 这里 available 一律 = count > 0，比例只按真的能用的来源分。
export type SourceShortage =
    | 'ai-not-configured'
    | 'ai-no-sentences'
    | 'real-material-empty'
    | 'reading-not-connected'
    | 'user-empty'
    | 'saved-empty'
    | 'curated-empty';
export interface SourceCapability {
    type: SentenceSourceType;
    label: string;
    available: boolean;
    requires: string | null;
    count: number;
    configured?: boolean;
    canGenerate?: boolean;
    shortage: SourceShortage | null;
}
export interface SourceMixShortage {
    type: SentenceSourceType;
    shortage: SourceShortage;
}
export interface SourceMixResult {
    target: Record<SentenceSourceType, number>;
    mix: Record<SentenceSourceType, number>;
    degraded: boolean;
    unavailable: SentenceSourceType[];
    reasons: string[];
    shortages: SourceMixShortage[];
}
export function targetSourceMix(): Record<SentenceSourceType, number> {
    return {
        curated: 0,
        user: TARGET_SOURCE_MIX.user,
        saved: 0,
        ai: TARGET_SOURCE_MIX.ai,
        'real-material': TARGET_SOURCE_MIX.real,
        reading: 0,
    };
}
export function sourceCapabilities(input: {
    sentences: SentenceRecord[];
    aiConfigured: boolean;
    readingAvailable?: boolean;
}): SourceCapability[] {
    const countOf = (types: SentenceSourceType[]) => input.sentences.filter(s => types.includes(s.sourceType)).length;
    const build = (
        type: SentenceSourceType,
        requires: string | null,
        extra: { configured?: boolean; canGenerate?: boolean; shortage: SourceShortage | null } = { shortage: null },
    ): SourceCapability => {
        const count = countOf([type]);
        return {
            type,
            label: SOURCE_LABELS[type],
            available: count > 0,
            requires,
            count,
            ...extra,
            shortage: count > 0 ? null : extra.shortage,
        };
    };
    return [
        build('curated', null, { shortage: 'curated-empty' }),
        build('user', null, { shortage: 'user-empty' }),
        build('saved', null, { shortage: 'saved-empty' }),
        build('real-material', null, { shortage: 'real-material-empty' }),
        build('reading', 'phase5', { shortage: 'reading-not-connected' }),
        build('ai', 'phase6', {
            configured: input.aiConfigured,
            canGenerate: true,
            shortage: input.aiConfigured ? 'ai-no-sentences' : 'ai-not-configured',
        }),
    ];
}
export function effectiveSourceMix(caps: SourceCapability[]): SourceMixResult {
    const byType = new Map(caps.map(c => [c.type, c]));
    const target = targetSourceMix();
    const mix: Record<SentenceSourceType, number> = { curated: 0, user: 0, saved: 0, 'real-material': 0, reading: 0, ai: 0 };
    const shortages: SourceMixShortage[] = [];
    const reasons: string[] = [];
    for (const type of ['user', 'ai', 'real-material'] as const) {
        const cap = byType.get(type);
        if (cap?.available) {
            mix[type] = target[type];
            continue;
        }
        mix.curated += target[type];
        const shortage = cap?.shortage ?? 'curated-empty';
        shortages.push({ type, shortage });
        reasons.push(`${type}-${shortage}-reallocated`);
    }
    // 连练习句都没有：比例没有意义，如实归零，不留一个「100% 练习句」的假象
    if (!byType.get('curated')?.available) {
        mix.curated = 0;
        if (!shortages.some(s => s.shortage === 'curated-empty'))
            shortages.push({ type: 'curated', shortage: 'curated-empty' });
        reasons.push('no-sentence-at-all');
    }
    const total = Object.values(mix).reduce((n, v) => n + v, 0) || 1;
    for (const k of Object.keys(mix) as SentenceSourceType[])
        mix[k] = Math.round((mix[k] / total) * 100) / 100;
    return { target, mix, degraded: shortages.length > 0, unavailable: caps.filter(c => !c.available).map(c => c.type), reasons, shortages };
}
// —— AI 生句契约（Phase 6 才实现；当前只做校验与 fallback，绝不伪造输出）——
export interface SentenceGenerationRequest {
    targetWords: string[];
    grammarTargets: string[];
    theme: string;
    userLevel: {
        vocabulary: number;
        grammar: number;
    };
    targetDifficulty: number;
    maxUnknownWords: number;
    knownVocabularyCoverage: number;
    miniUnitId?: string;
    promptVersion: string;
}
export interface GeneratedSentenceDraft {
    text: string;
    zh: string;
    grammarTags: string[];
    targetWords: string[];
    theme: string;
    structure?: unknown;
}
export interface SentenceGenerationResult {
    requestId: string;
    provider: 'ai' | 'none';
    sentences: GeneratedSentenceDraft[];
    provenance: {
        model: string;
        promptVersion: string;
        generatedAt: number;
    } | null;
    error: string | null;
    fallbackReason: string | null;
}
export function validateGenerationRequest(req: unknown): {
    ok: boolean;
    issues: string[];
} {
    const r = req as SentenceGenerationRequest | null;
    const issues: string[] = [];
    if (!r || typeof r !== 'object')
        return { ok: false, issues: ['请求缺失'] };
    if (!Array.isArray(r.targetWords) || r.targetWords.some(w => typeof w !== 'string'))
        issues.push('targetWords 必须是字符串数组');
    if (!Array.isArray(r.grammarTargets) || r.grammarTargets.some(g => typeof g !== 'string'))
        issues.push('grammarTargets 必须是字符串数组');
    if (typeof r.theme !== 'string' || !r.theme.trim())
        issues.push('theme 不能为空');
    if (!r.userLevel || typeof r.userLevel.vocabulary !== 'number' || typeof r.userLevel.grammar !== 'number')
        issues.push('userLevel 缺失');
    if (!(typeof r.targetDifficulty === 'number' && r.targetDifficulty > 0 && r.targetDifficulty <= 3))
        issues.push('targetDifficulty 必须在 (0,3]');
    if (!(typeof r.maxUnknownWords === 'number' && r.maxUnknownWords >= 0 && r.maxUnknownWords <= 5))
        issues.push('maxUnknownWords 必须在 0–5');
    if (!(typeof r.knownVocabularyCoverage === 'number' && r.knownVocabularyCoverage >= 0.8 && r.knownVocabularyCoverage <= 1))
        issues.push('knownVocabularyCoverage 必须在 0.8–1');
    if (typeof r.promptVersion !== 'string' || !r.promptVersion)
        issues.push('promptVersion 必填');
    return { ok: issues.length === 0, issues };
}
export function validateGenerationResult(result: unknown, req: SentenceGenerationRequest): {
    ok: boolean;
    issues: string[];
} {
    const r = result as SentenceGenerationResult | null;
    const issues: string[] = [];
    if (!r || typeof r !== 'object')
        return { ok: false, issues: ['结果缺失'] };
    if (r.provider === 'none')
        return { ok: r.sentences.length === 0, issues: r.sentences.length ? ['provider=none 时不得返回句子（禁止伪造 AI 输出）'] : [] };
    if (r.provider !== 'ai')
        issues.push('provider 非法');
    if (!r.provenance || !r.provenance.model || !r.provenance.promptVersion)
        issues.push('缺少 provenance（model/promptVersion）');
    if (r.provenance && r.provenance.promptVersion !== req.promptVersion)
        issues.push('promptVersion 与请求不一致');
    if (!Array.isArray(r.sentences) || !r.sentences.length)
        issues.push('没有生成任何句子');
    for (const s of r.sentences ?? []) {
        if (typeof s.text !== 'string' || s.text.trim().split(/\s+/).length < 3)
            issues.push('句子过短或非字符串');
        if (!Array.isArray(s.grammarTags) || s.grammarTags.sort().join(',') !== [...req.grammarTargets].sort().join(','))
            issues.push('生成句未覆盖请求的 grammarTargets');
    }
    return { ok: issues.length === 0, issues };
}
// AI 句这条能力要分三种状态说清楚（Phase 16.2）：
//   ① 没有配置服务 → 不能生成，也不该说「功能还没做」
//   ② 配置了但一句都没生成过 → 能手动生成，但计划里还没有 AI 句
//   ③ 句库里有 AI 句 → 计划按比例取用，仍可继续生成
// 「自动按比例补 AI 句」没有实现，所以任何状态下都不能声称计划会自己去生成。
export function aiGenerationNotice(input: { configured: boolean; hasTargets: boolean; aiCount: number }): string {
    if (!input.configured)
        return '还没有设置 AI 服务：设置后可以在下面手动生成定向句，生成并加入句库，才会进计划。';
    if (input.aiCount > 0)
        return `句库里已经有 ${input.aiCount} 句 AI 句，计划会按比例取用；也可以继续在下面生成。`;
    if (!input.hasTargets)
        return 'AI 服务已设置。先练出几个薄弱词，再来生成定向句；生成并加入句库，才会进计划。';
    return 'AI 服务已设置，可以在下面生成定向句；加入句库后才会进计划。计划不会自己批量生成 AI 句。';
}
// AI 不可用时的确定性 fallback：只返回 curated/已保存句，provider='none'
export function sentenceGenerationFallback(req: SentenceGenerationRequest, pool: SentenceRecord[]): SentenceGenerationResult {
    const matched = pool.filter(s => s.sourceType !== 'ai' && req.grammarTargets.some(g => s.grammarTags.includes(g)));
    return {
        requestId: `req.${req.promptVersion}.${req.theme}`,
        provider: 'none',
        sentences: [],
        provenance: null,
        error: null,
        fallbackReason: matched.length
            ? `没有可用的 AI 生成结果：改用人工教学句/真实句池中的 ${matched.length} 句（来源明示，不冒充 AI 生成）`
            : '没有可用的 AI 生成结果，句池里也没有匹配句：这次不生成句子',
    };
}
// —— Reading Lab 交接契约（Phase 5 才实现 Reading；这里只定义接口）——
export interface ReadingSentenceHandoffInput {
    sentence: string;
    passageId: string;
    sourceSpan: [
        number,
        number
    ];
    unknownWords: string[];
    userMarkedDifficulty: boolean;
    context: string;
}
export function handoffToSentenceRecord(input: ReadingSentenceHandoffInput, now = Date.now()): {
    record: SentenceRecord;
    issues: string[];
} {
    const issues: string[] = [];
    const text = (input.sentence ?? '').trim();
    if (!text)
        issues.push('句子为空');
    if (!input.passageId)
        issues.push('缺少 passageId（Reading 交接必须带出处）');
    if (!Array.isArray(input.sourceSpan) || input.sourceSpan.length !== 2 || input.sourceSpan[0] < 0 || input.sourceSpan[1] < input.sourceSpan[0])
        issues.push('sourceSpan 非法');
    const id = `sen.reading.${input.passageId}.${input.sourceSpan?.[0] ?? 0}-${input.sourceSpan?.[1] ?? 0}`.replace(/[^a-zA-Z0-9_.-]/g, '_');
    return {
        record: {
            id,
            text,
            zh: '',
            sourceType: 'reading',
            sourceId: input.passageId,
            attribution: `来自阅读模块（passage ${input.passageId}，span ${input.sourceSpan?.[0] ?? 0}–${input.sourceSpan?.[1] ?? 0}）`,
            grammarTags: [],
            targetWordIds: [],
            theme: input.context || '阅读交接',
            difficulty: input.userMarkedDifficulty ? 3 : 2,
            structure: null,
            structureProvenance: 'none',
            createdBy: 'system',
            createdAt: now,
            usedCount: 0,
            lastUsedAt: 0,
            notes: '',
        },
        issues,
    };
}
export function userSentenceRecord(text: string, zh: string, now = Date.now(), kind: 'user' | 'saved' = 'user', wordIds: string[] = []): {
    record: SentenceRecord;
    issues: string[];
} {
    const issues: string[] = [];
    const trimmed = (text ?? '').trim();
    if (!trimmed)
        issues.push('句子为空');
    if (trimmed.split(/\s+/).filter(Boolean).length < 3)
        issues.push('句子太短，至少 3 个词');
    const id = `sen.user.${hashId(trimmed)}`;
    return {
        record: {
            id,
            text: trimmed,
            zh: (zh ?? '').trim(),
            sourceType: kind,
            sourceId: 'user-input',
            attribution: kind === 'saved' ? '你自己保存的难句' : '你自己输入的真实句',
            grammarTags: [],
            targetWordIds: wordIds,
            theme: '自选',
            difficulty: 2,
            // 用户句子没有 gold 结构：给启发式切分（明确标记不确定），不伪造完整句法树
            structure: heuristicStructure(id, trimmed),
            structureProvenance: 'heuristic',
            createdBy: 'user',
            createdAt: now,
            usedCount: 0,
            lastUsedAt: 0,
            notes: '',
        },
        issues,
    };
}
function hashId(text: string): string {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++)
        h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return (h >>> 0).toString(36);
}
