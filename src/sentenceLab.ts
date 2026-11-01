// —— Phase 4：Sentence Lab（引导式拆句 / 分层辅助 / 即时反馈 / 迁移验证）——
// 设计依据：PROJECT_SPEC §48（拆句流程）、§52（Just-in-Time 卡片）、文本 §9–§13、§20（反馈必须具体）。
// 纪律：
//   1) 默认不给整句翻译；逐步引导（主语 → 谓语 → 宾语 → 修饰 → 从句 → 非谓语 → 逻辑 → 完整意义）。
//   2) 步骤由真实结构（gold）推导；结构不可靠时步骤降级并显式标注不确定。
//   3) 反馈必须说明"哪部分对、哪部分错、为什么"，禁止"回答错误，继续努力"这类空泛反馈。
//   4) 辅助级别越高，证据权重越低（见 grammar.evidenceWeight）。
import type { SentenceRecord, SentenceStepRecord, SentenceEvidenceClass } from './types.ts';
import { CLAUSE_LABELS, ROLE_LABELS, clauseForToken, spanText, structureRows, type ClauseKind, type SentenceStructure, type StructureClause, type StructureRole, } from './sentenceStructure.ts';
export const SUPPORT_LABELS = ['不看提示自己拆', '提示关键成分', '给出部分框架', '直接指出关系', '完整解释和示范'] as const;
export const MAX_SUPPORT_LEVEL = SUPPORT_LABELS.length - 1;
export type StepKind = 'subject' | 'predicate' | 'object' | 'modifier' | 'clause' | 'nonfinite' | 'logic' | 'meaning';
export const STEP_LABELS: Record<StepKind, string> = {
    subject: '找主语',
    predicate: '找谓语',
    object: '找宾语',
    modifier: '区分修饰成分',
    clause: '切分主句与从句',
    nonfinite: '判断非谓语作用',
    logic: '判断逻辑关系',
    meaning: '形成完整意义',
};
export interface StepOption {
    id: string;
    label: string;
    detail: string;
}
export interface LabStep {
    id: string;
    kind: StepKind;
    question: string;
    options: StepOption[];
    correctId: string;
    explain: string;
    hints: string[];
    conceptIds: string[];
    clauseIds: string[];
}
export interface LabPlan {
    sentenceId: string;
    steps: LabStep[];
    simplified: boolean;
    uncertain: boolean;
    notes: string[];
}
function hash(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++)
        h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
}
function seededOrder<T>(items: T[], seed: string, keyOf: (x: T) => string): T[] {
    return [...items].sort((a, b) => {
        const ka = hash(`${seed}|${keyOf(a)}`), kb = hash(`${seed}|${keyOf(b)}`);
        if (ka !== kb)
            return ka - kb;
        return keyOf(a) < keyOf(b) ? -1 : 1;
    });
}
function spanOf(structure: SentenceStructure, role: StructureRole, clause?: StructureClause): [
    number,
    number
] | null {
    // 按 clauseId 过滤：嵌套从句的 token 落在主句区间内，但角色属于从句
    const rows = structureRows(structure).filter(r => r.role === role && (!clause || r.clauseId === clause.id));
    if (!rows.length)
        return null;
    let start = rows[0].tokenIndex;
    const end = rows[rows.length - 1].tokenIndex;
    // 名词短语的限定词/形容词与中心词同属一个成分：向左吸收紧邻的同子句 modifier
    const all = structureRows(structure);
    while (start - 1 >= (clause?.start ?? 0)) {
        const prev = all.find(r => r.tokenIndex === start - 1);
        if (!prev || prev.role !== 'modifier' || prev.clauseId !== (clause ? clause.id : prev.clauseId))
            break;
        start -= 1;
    }
    return [start, end];
}
function rootClause(structure: SentenceStructure): StructureClause {
    return structure.clauses.find(c => c.id === structure.rootClauseId) ?? structure.clauses[0];
}
function mainClauseContent(structure: SentenceStructure, kind: ClauseKind[]): StructureClause[] {
    return structure.clauses.filter(c => kind.includes(c.kind));
}
function roleSpanIn(structure: SentenceStructure, role: StructureRole, clauseId: string): [
    number,
    number
] | null {
    const rows = structureRows(structure).filter(r => r.role === role && r.clauseId === clauseId);
    if (!rows.length)
        return null;
    return [rows[0].tokenIndex, rows[rows.length - 1].tokenIndex];
}
// 选项生成：正确范围 + 边界干扰（少一词/多一词）+ 从句同角色 + 主句其他角色。
// 不做"整句当选项"这种无教学价值的干扰项；范围过长（>7 词）也不进入选项。
function spanOptionSet(structure: SentenceStructure, record: SentenceRecord, role: StructureRole, correct: [
    number,
    number
], main: StructureClause, correctDetail: string): {
    options: StepOption[];
    correctId: string;
} {
    const correctId = `${correct[0]}-${correct[1]}`;
    const keyOf = (sp: [
        number,
        number
    ]) => `${sp[0]}-${sp[1]}`;
    const pool: Array<{
        span: [
            number,
            number
        ];
        detail: string;
    }> = [];
    const add = (span: [
        number,
        number
    ] | null, detail: string) => {
        if (!span || span[1] < span[0])
            return;
        const len = span[1] - span[0] + 1;
        if (len < 1 || len > 7 || keyOf(span) === correctId)
            return;
        if (span[0] < main.start || span[1] > main.end)
            return;
        if (pool.some(p => keyOf(p.span) === keyOf(span)))
            return;
        pool.push({ span, detail });
    };
    add([correct[0], correct[1] - 1], '范围少了最后一个词');
    add([correct[0] - 1, correct[1]], '范围多了一个词');
    for (const c of structure.clauses) {
        if (c.id === main.id)
            continue;
        const same = roleSpanIn(structure, role, c.id);
        add(same ?? [c.start, Math.min(c.end, c.start + 3)], same ? `从句里的${ROLE_LABELS[role]}` : '这是一个从句范围');
    }
    for (const other of ['predicate', 'object', 'subject', 'complement', 'modifier'] as StructureRole[]) {
        if (other === role)
            continue;
        const sp = roleSpanIn(structure, other, main.id);
        if (sp)
            add(sp, `主句里的${ROLE_LABELS[other]}`);
    }
    const chosen = seededOrder(pool, `${record.id}|${role}-distractors`, p => keyOf(p.span)).slice(0, 3);
    const options = seededOrder([
        { id: correctId, label: spanText(structure, correct), detail: correctDetail },
        ...chosen.map(p => ({ id: keyOf(p.span), label: spanText(structure, p.span), detail: p.detail })),
    ], `${record.id}|${role}-opt`, o => o.id);
    return { options, correctId };
}
function optionFromSpan(structure: SentenceStructure, span: [
    number,
    number
], detail: string): StepOption {
    return { id: `${span[0]}-${span[1]}`, label: spanText(structure, span), detail };
}
const LOGIC_BY_MARKER: Record<string, string> = {
    although: '让步', though: '让步', even: '让步', because: '原因', since: '原因', as: '原因（需结合语境）',
    if: '条件', unless: '条件', when: '时间', while: '时间／对比', after: '时间', before: '时间', until: '时间',
    so: '目的／结果', whether: '选择／是否', and: '并列', or: '并列（选择）', but: '转折', nor: '并列（否定）',
};
function logicOptions(structure: SentenceStructure, record: SentenceRecord): {
    correct: string;
    options: string[];
    explain: string;
} | null {
    const tags = record.grammarTags;
    const markers = structureRows(structure).filter(r => r.role === 'subordinator' || r.role === 'relative' || r.role === 'conjunction').map(r => r.text.toLowerCase().replace(/[^a-z]/g, ''));
    if (tags.includes('logic.comparison'))
        return { correct: '比较', options: ['比较', '转折', '因果', '并列'], explain: '这是比较结构：the more… the more… / than / as…as，重点在"谁比谁更"。' };
    if (tags.includes('logic.negation'))
        return { correct: '否定（含否定转移）', options: ['否定（含否定转移）', '假设', '让步', '并列'], explain: '否定词的实际作用范围可能落在从句上（I don\'t think…）。' };
    if (tags.includes('phrase.coordination'))
        return { correct: '并列', options: ['并列', '因果', '让步', '比较'], explain: 'and/or/but 连接的是同级成分，先确认两侧是否同性质。' };
    const marker = markers.find(m => LOGIC_BY_MARKER[m]);
    if (!marker)
        return null;
    const correct = LOGIC_BY_MARKER[marker];
    return { correct, options: [...new Set([correct, '原因', '让步', '条件', '时间', '并列', '转折'])].slice(0, 4), explain: `引导词 "${marker}" 标示的是「${correct}」关系；先读连词再读句子，避免把让步当原因。` };
}
// 由结构推导引导式步骤；简单句自动简化，不确定结构显式标注
export function buildLabPlan(record: SentenceRecord, structure: SentenceStructure, distractors: SentenceRecord[] = []): LabPlan {
    const notes: string[] = [];
    const steps: LabStep[] = [];
    const main = rootClause(structure);
    const uncertain = structure.provenance !== 'gold' || structure.confidence < 0.6;
    if (uncertain)
        notes.push(structure.provenance === 'none' || !structure.tokens.length
            ? '这句还没有可靠的句法结构，下面的步骤是按词序和标点推出来的，可能不完整。'
            : structure.provenance === 'ai_unverified'
                ? '这句的结构是自动分析出来的，没有人工核对，下面的步骤可能不完整。'
                : '这句的结构是自动推断的（不确定），下面的步骤可能不完整。');
    const tokenCount = structure.tokens.length;
    const simple = structure.clauses.length <= 1 && tokenCount <= 7;
    const subjectSpan = spanOf(structure, 'subject', main);
    if (subjectSpan) {
        const opt = spanOptionSet(structure, record, 'subject', subjectSpan, main, '主句主语');
        steps.push({
            id: 'subject', kind: 'subject', question: '谁是句子的主体（主句主语）？',
            options: opt.options, correctId: opt.correctId,
            explain: `主句主语是「${spanText(structure, subjectSpan)}」，它是整句谓语所说明的对象。找主语前先锁定谓语会更稳。`,
            hints: ['先问"这句话在说谁/什么"', '主语不一定在最前面', '如果句首是 Although/When 等引导词，主语在其后', '主句主语不是从句里的主语', `主句主语的范围是「${spanText(structure, subjectSpan)}」`],
            conceptIds: ['structure.subject'], clauseIds: [main.id],
        });
    }
    const predicateSpan = spanOf(structure, 'predicate', main);
    if (predicateSpan) {
        const opt = spanOptionSet(structure, record, 'predicate', predicateSpan, main, '主句谓语');
        steps.push({
            id: 'predicate', kind: 'predicate', question: '核心谓语是什么？',
            options: opt.options, correctId: opt.correctId,
            explain: `谓语是「${spanText(structure, predicateSpan)}」：它带时态/语态，是句子唯一的骨架中心。助动词与主动词要一起看。`,
            hints: ['谓语一定带时态或语态', 'doing / to do 单独出现时不是谓语', '从句里也有谓语，但先找主句的', '先排除从句范围', `主句谓语是「${spanText(structure, predicateSpan)}」`],
            conceptIds: ['structure.predicate'], clauseIds: [main.id],
        });
    }
    const objectSpan = spanOf(structure, 'object', main);
    if (objectSpan && !simple) {
        const opt = spanOptionSet(structure, record, 'object', objectSpan, main, '主句宾语');
        steps.push({
            id: 'object', kind: 'object', question: '动作作用于什么（主句宾语）？',
            options: opt.options, correctId: opt.correctId,
            explain: `主句宾语是「${spanText(structure, objectSpan)}」。若宾语是一整句话，那就是宾语从句。`,
            hints: ['问"对什么做"', '宾语可以是名词、从句或非谓语', '介词后面的成分通常是状语或定语，不是宾语', `主句宾语是「${spanText(structure, objectSpan)}」`],
            conceptIds: ['structure.object'], clauseIds: [main.id],
        });
    }
    const subClauses = structure.clauses.filter(c => c.id !== main.id);
    if (subClauses.length) {
        const target = seededOrder(subClauses, `${record.id}|clause`, c => c.id)[0];
        steps.push({
            id: 'clause', kind: 'clause', question: '哪一部分是从句？它属于哪一类？',
            options: seededOrder(subClauses.map(c => ({ id: `${c.id}:${c.kind}`, label: spanText(structure, [c.start, c.end]), detail: c.label })), `${record.id}|clause-opt`, o => o.id),
            correctId: `${target.id}:${target.kind}`,
            explain: `「${spanText(structure, [target.start, target.end])}」是${CLAUSE_LABELS[target.kind]}：它不能独立成句，依附主句的「${spanText(structure, [main.start, main.end])}」。`,
            hints: ['先找引导词（that/which/who/because/although…）', '从句自己也有主谓，所以容易被误认成第二个主句', '判断从句类型看它补足什么成分', `从句范围是 ${target.start}–${target.end}`],
            conceptIds: target.grammarConceptIds.length ? target.grammarConceptIds : ['clause.main'], clauseIds: [target.id, main.id],
        });
    }
    const nonfiniteRows = structureRows(structure).filter(r => r.role === 'nonfinite');
    if (nonfiniteRows.length) {
        const first = nonfiniteRows[0];
        const clause = clauseForToken(structure, first.tokenIndex);
        const headRow = structureRows(structure).find(r => r.tokenIndex === structure.tokens[first.tokenIndex]?.head);
        const headRole = headRow?.role;
        const correct = headRole === 'subject' || headRole === 'object' && /ing|ed$/.test(first.text) ? '修饰名词（定语）' : first.text.toLowerCase() === 'to' || structure.tokens[0]?.text.toLowerCase() === 'to' ? '表目的（状语）' : clause?.kind === 'nonfinite' ? '与介词/动词搭配的动名词' : '修饰谓语（状语）';
        steps.push({
            id: 'nonfinite', kind: 'nonfinite', question: 'doing / done / to do 在这里起什么作用？',
            options: seededOrder(['修饰名词（定语）', '表目的（状语）', '修饰谓语（状语）', '与介词/动词搭配的动名词'].map(x => ({ id: x, label: x, detail: '' })), `${record.id}|nonfinite-opt`, o => o.id),
            correctId: correct,
            explain: `「${first.text}」在这里是${correct}：非谓语没有主语，它的逻辑主语必须能从主句找到。`,
            hints: ['看位置：紧贴名词 → 定语；句首/句末带逗号 → 状语', 'ing 多为主动，ed 多为被动', '介词后面的动词必须是 doing', `这个非谓语紧贴在「${headRow?.text ?? '句子主干'}」之后`],
            conceptIds: ['nonfinite.role', 'nonfinite.gerund', 'nonfinite.participle', 'nonfinite.infinitive'], clauseIds: clause ? [clause.id] : [],
        });
    }
    const logic = logicOptions(structure, record);
    if (logic && !simple) {
        steps.push({
            id: 'logic', kind: 'logic', question: '句子各部分是什么逻辑关系？',
            options: seededOrder(logic.options.map(x => ({ id: x, label: x, detail: '' })), `${record.id}|logic-opt`, o => o.id),
            correctId: logic.correct,
            explain: logic.explain,
            hints: ['先读连接词', '问"这两部分是对立、因果还是并列"', '同一个句子换连接词，意思会完全变', `正确答案是「${logic.correct}」`],
            conceptIds: ['logic.connection'], clauseIds: [],
        });
    }
    if (record.zh) {
        const distractorZh = seededOrder(distractors.filter(d => d.zh && d.id !== record.id), `${record.id}|meaning`, d => d.id).slice(0, 3);
        steps.push({
            id: 'meaning', kind: 'meaning', question: '整句话表达什么意义？',
            options: seededOrder([{ id: 'right', label: record.zh, detail: '' }, ...distractorZh.map(d => ({ id: d.id, label: d.zh, detail: '' }))], `${record.id}|meaning-opt`, o => o.id),
            correctId: 'right',
            explain: `正确意思是「${record.zh}」。${structure.provenance === 'gold' ? '这是基于结构分析得出的结论，而不是靠背答案。' : '注意：该句结构未审校，请以分析过程为准。'}`,
            hints: ['先确定主干（谁 + 做什么 + 对什么）', '再把修饰成分放回去，一次只加一层', '最后确认逻辑关系', `主干是「${spanText(structure, [main.start, main.end])}」`, `整句意思是「${record.zh}」`],
            conceptIds: ['structure.core'], clauseIds: [main.id],
        });
    }
    return { sentenceId: record.id, steps, simplified: simple && steps.length <= 3, uncertain, notes };
}
// —— 分层辅助（Scaffolding）——
export interface SupportHint {
    level: number;
    label: string;
    hint: string;
    revealsAnswer: boolean;
}
export function supportHint(step: LabStep, level: number): SupportHint {
    const l = Math.max(0, Math.min(MAX_SUPPORT_LEVEL, Math.floor(level)));
    // L1..L4 依次对应 hints[0..]；最高级别直接给最后一条（含答案/完整示范）
    const idx = l === 0 ? -1 : Math.min(l - 1, Math.max(0, step.hints.length - 2));
    const hint = l === 0 ? '不看提示，先独立判断。' : (l >= MAX_SUPPORT_LEVEL ? step.hints[step.hints.length - 1] : step.hints[idx]) ?? '回顾句子主干。';
    return { level: l, label: SUPPORT_LABELS[l], hint, revealsAnswer: l >= 3 };
}
export function maxSupportLevel(records: SentenceStepRecord[]): number {
    return records.reduce((m, r) => Math.max(m, r.supportLevel ?? 0), 0);
}
// —— 步骤评估与具体反馈（§20 禁止空泛反馈）——
export interface StepEvaluation {
    correct: boolean;
    partial: boolean;
    errorType: string;
    feedback: string;
    correctedPart: string;
    nextFocus: string;
}
export function evaluateStep(step: LabStep, answerId: string, supportLevel = 0): StepEvaluation {
    const chosen = step.options.find(o => o.id === answerId);
    const correctOption = step.options.find(o => o.id === step.correctId);
    if (!chosen)
        return { correct: false, partial: false, errorType: 'no-answer', feedback: `这一步还没有选择。${step.explain}`, correctedPart: '', nextFocus: '先看句子主干再作答' };
    if (answerId === step.correctId) {
        const confident = supportLevel === 0;
        return {
            correct: true, partial: false, errorType: '',
            feedback: `${confident ? '独立判断正确' : '在辅助下判断正确'}：${step.explain}`,
            correctedPart: chosen.label, nextFocus: '继续下一步；下一步先找主干成分。',
        };
    }
    // 部分正确：范围有重叠但边界不对（例如把从句范围当成宾语）
    const overlap = overlapRatio(chosen.id, step.correctId);
    const partial = overlap > 0 && overlap < 1;
    const { errorType, feedback } = errorFeedback(step, chosen, correctOption);
    return {
        correct: false, partial, errorType,
        feedback: `${feedback}（正确范围是「${correctOption?.label ?? ''}」）`,
        correctedPart: chosen.label,
        nextFocus: step.kind === 'clause' ? '下一句先寻找从句的先行词／引导词' : '下一句先固定主干，再看修饰',
    };
}
function overlapRatio(a: string, b: string): number {
    const parse = (id: string) => id.split('-').map(Number).filter(n => Number.isFinite(n));
    const [a0, a1] = parse(a), [b0, b1] = parse(b);
    if (a0 === undefined || b0 === undefined)
        return 0;
    const inter = Math.max(0, Math.min(a1 ?? a0, b1 ?? b0) - Math.max(a0, b0) + 1);
    const union = Math.max(a1 ?? a0, b1 ?? b0) - Math.min(a0, b0) + 1;
    return union > 0 ? inter / union : 0;
}
function errorFeedback(step: LabStep, chosen: StepOption, correct?: StepOption): {
    errorType: string;
    feedback: string;
} {
    const chosenDetail = chosen.detail || '你选的部分';
    const correctLabel = correct?.label ?? '';
    const map: Record<StepKind, {
        type: string;
        text: string;
    }> = {
        subject: { type: 'subject-identification', text: `你把「${chosen.label}」当成了主语，但主句谓语所说明的对象是「${correctLabel}」。先找谓语，再回头找主语。` },
        predicate: { type: 'predicate-identification', text: `「${chosen.label}」里有动词样子的词，但它不是主句谓语（可能属于从句或非谓语）。主句谓语是「${correctLabel}」。` },
        object: { type: 'object-identification', text: `「${chosen.label}」不是主句宾语（${chosenDetail}）。宾语回答"对什么做"，这里应是「${correctLabel}」。` },
        modifier: { type: 'modifier-boundary', text: `「${chosen.label}」被当成了修饰成分，但它是主干的一部分。修饰成分可以整个删掉而句子仍成立。` },
        clause: { type: 'clause-boundary', text: `你选的范围（${chosenDetail}）不是正确的从句类型／边界：这类错误很常见——修饰名词的从句容易被误认成另一个独立主句。正确是「${correctLabel}」（${correct?.detail ?? ''}）。` },
        nonfinite: { type: 'nonfinite-role', text: `你判断「${chosen.label}」，但从位置上看不成立：先看它紧贴的是名词还是谓语。正确答案是「${correctLabel}」。` },
        logic: { type: 'logic-relation', text: `逻辑关系判断为「${chosen.label}」，但引导词标明的是「${correctLabel}」。读连词即可避免这类误判。` },
        meaning: { type: 'meaning-error', text: `整句意思选成了「${chosen.label}」，说明某个成分理解偏了。正确是「${correctLabel}」。` },
    };
    const entry = map[step.kind];
    return { errorType: entry.type, feedback: `${entry.text} ${step.explain}` };
}
export function stepRecord(stepId: string, answerId: string, correct: boolean, supportLevel: number, durationMs: number, errorType: string): SentenceStepRecord {
    return { stepId, answer: answerId, correct, supportLevel, durationMs, errorType };
}
// —— 证据分级（§13：区分已接触 / 提示后正确 / 独立正确 / 迁移 / 延迟保持）——
export function evidenceClass(input: {
    steps: SentenceStepRecord[];
    transfer: boolean;
    delayed: boolean;
    allCorrect: boolean;
}): SentenceEvidenceClass {
    const support = maxSupportLevel(input.steps);
    // 看过答案/完整解释：无论对错都只算接触
    if (support >= 3)
        return 'exposed';
    if (!input.allCorrect)
        return support >= 1 ? 'hint-assisted' : 'error';
    if (input.transfer)
        return 'transfer';
    if (input.delayed)
        return 'delayed';
    if (support >= 1)
        return 'hint-assisted';
    return 'independent';
}
export const EVIDENCE_LABELS: Record<SentenceEvidenceClass, string> = {
    exposed: '看过解释（不算掌握）',
    'hint-assisted': '看了提示才答对（不算独立）',
    independent: '自己答对',
    transfer: '换一句也答对',
    delayed: '隔几天还答对',
    error: '自己答错了',
};
// 独立错误也是证据（推进后验下降）；提示后错误与"看过答案"不作为掌握证据
export function countsTowardMastery(klass: SentenceEvidenceClass): boolean {
    return klass === 'independent' || klass === 'transfer' || klass === 'delayed' || klass === 'error';
}
// —— 迁移验证（§12）——
export interface TransferTask {
    original: SentenceRecord;
    candidate: SentenceRecord;
    sameGrammar: string[];
    reason: string;
}
export function buildTransferTask(original: SentenceRecord, pool: SentenceRecord[]): TransferTask | null {
    const candidates = pool
        .filter(s => s.id !== original.id && s.text.trim() !== original.text.trim() && s.grammarTags.some(g => original.grammarTags.includes(g)))
        .filter(s => !/\b(although|because|if|when|while)\b/i.test(s.text) || true);
    if (!candidates.length)
        return null;
    const scored = candidates.map(c => {
        const same = c.grammarTags.filter(g => original.grammarTags.includes(g));
        const differentWords = c.text.toLowerCase().split(/\s+/).filter(w => !original.text.toLowerCase().includes(w)).length;
        return { c, same, differentWords };
    }).sort((a, b) => {
        if (b.same.length !== a.same.length)
            return b.same.length - a.same.length;
        if (b.differentWords !== a.differentWords)
            return b.differentWords - a.differentWords;
        const ka = hash(`transfer|${original.id}|${a.c.id}`), kb = hash(`transfer|${original.id}|${b.c.id}`);
        return ka === kb ? (a.c.id < b.c.id ? -1 : 1) : ka - kb;
    });
    const best = scored[0];
    return { original, candidate: best.c, sameGrammar: best.same, reason: `结构相近（共同语法点：${best.same.join('、')}）、语义与用词不同，适合检验迁移而不是记答案。` };
}
export function roleLabelOf(role: StructureRole): string {
    return ROLE_LABELS[role] ?? '其他';
}
