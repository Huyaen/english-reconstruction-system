// —— Phase 9：Communication Repair（绕开不会的表达）——
// 核心判断：用户没有用"标准词"，是否仍然把主要意思送到了？
// 纪律：没有可靠的 intendedMeaning / 目标意义依据时，不得判定 meaningPreserved=true。
import type { OutputMeaningBasis, OutputRepairRecord, OutputSupportLevel } from './types.ts';

export interface RepairInput {
    intendedMeaning: string;
    blockedExpression: string;
    userAlternative: string;
    basis: OutputMeaningBasis;
    targetWord?: string | null;
    supportLevel?: OutputSupportLevel;
    now?: number;
    source?: 'user' | 'system' | 'ai';
}

export interface RepairResult {
    record: OutputRepairRecord;
    strategies: string[];
    notes: string[];
    /** 只有真正能判断时才给出 true/false；否则 null */
    verdict: 'preserved' | 'partial' | 'failed' | 'unknown';
}

const STRATEGY_RULES: { id: string; zh: string; test: RegExp }[] = [
    { id: 'description', zh: '用描述代替名词', test: /\b(someone|somebody|something|a person who|a thing that|the man who|the woman who)\b/i },
    { id: 'cause_effect', zh: '用因果解释', test: /\b(because|so|therefore|which means|that is why|as a result)\b/i },
    { id: 'example', zh: '用例子说明', test: /\b(for example|for instance|such as|like when)\b/i },
    { id: 'simpler_synonym', zh: '换简单同义词', test: /\b(killed|died|leader|important|big|small|good|bad|help|make|go|get)\b/i },
    { id: 'paraphrase', zh: '改写句式', test: /\b(what happened|what I mean|in other words|it means)\b/i },
];

export function detectRepairStrategies(text: string): string[] {
    const clean = String(text ?? '');
    return STRATEGY_RULES.filter(r => r.test.test(clean)).map(r => r.zh);
}

export function evaluateRepair(input: RepairInput): RepairResult {
    const now = input.now ?? Date.now();
    const intended = String(input.intendedMeaning ?? '').trim();
    const blocked = String(input.blockedExpression ?? '').trim();
    const alternative = String(input.userAlternative ?? '').trim();
    const notes: string[] = [];
    const strategies = detectRepairStrategies(alternative);

    let meaningPreserved: boolean | null = null;
    let verdict: RepairResult['verdict'] = 'unknown';
    let confidence = 0.2;

    const hasBasis = (input.basis === 'verified' || input.basis === 'supported_by_source' || input.basis === 'self_reported') && !!intended;
    if (!hasBasis) {
        notes.push('没有可靠的目标意义依据：只能记录你尝试绕开的事实，不判定意思是否保留。');
    }
    else if (!alternative) {
        meaningPreserved = false;
        verdict = 'failed';
        confidence = 0.6;
        notes.push('没有给出替代表达。');
    }
    else if (alternative.split(/\s+/).filter(Boolean).length < 3) {
        meaningPreserved = false;
        verdict = 'failed';
        confidence = 0.5;
        notes.push('替代表达太短，无法判断是否传递了主要意思。');
    }
    else if (input.basis === 'self_reported') {
        // 用户自述"我表达的是这个意思"：可以记录为自报，不当作客观验证
        meaningPreserved = true;
        verdict = 'preserved';
        confidence = 0.45;
        notes.push('按你的自述记录：系统没有独立核对材料内容。');
    }
    else {
        // 有材料依据时，用"目标意义关键词是否被覆盖"的保守启发式；
        // 覆盖率不足时返回 partial，而不是硬判失败。
        const coverage = keywordCoverage(intended, alternative);
        if (coverage >= 0.5) {
            meaningPreserved = true;
            verdict = 'preserved';
            confidence = 0.6;
        }
        else if (coverage >= 0.2) {
            meaningPreserved = null;
            verdict = 'partial';
            confidence = 0.4;
            notes.push('只覆盖了部分目标意义：需要你自己确认是否表达清楚。');
        }
        else {
            meaningPreserved = false;
            verdict = 'failed';
            confidence = 0.5;
            notes.push('没有覆盖目标意义的关键内容。');
        }
    }

    if (blocked && alternative && alternative.toLowerCase().includes(blocked.toLowerCase()))
        notes.push('替代表达里仍然使用了那个"不会的词"，这次不算绕开。');
    if (input.targetWord && alternative && !alternative.toLowerCase().includes(input.targetWord.toLowerCase()))
        notes.push('没有使用目标词也可以：这里评的是意思是否传达，不是词表命中。');

    const record: OutputRepairRecord = {
        intendedMeaning: intended,
        blockedExpression: blocked,
        userAlternative: alternative,
        supportLevel: input.supportLevel ?? 0,
        meaningPreserved,
        evidenceBasis: input.basis,
        evaluatorConfidence: confidence,
        source: input.source ?? 'system',
        at: now,
    };
    return { record, strategies, notes, verdict };
}

/** 目标意义关键词覆盖率：去掉停用词后看替代表达覆盖了多少 */
export function keywordCoverage(intended: string, alternative: string): number {
    const target = contentWords(intended);
    if (!target.size)
        return 0;
    const got = contentWords(alternative);
    let hit = 0;
    for (const w of target)
        if (got.has(w) || got.has(stem(w)))
            hit += 1;
    return hit / target.size;
}

const STOP = new Set(['the', 'a', 'an', 'to', 'of', 'in', 'on', 'for', 'and', 'or', 'is', 'was', 'were', 'are', 'be', 'been', 'that', 'this', 'it', 'he', 'she', 'they', 'his', 'her', 'their', 'with', 'by', 'as', 'at', 'from', 'not']);

function contentWords(s: string): Set<string> {
    const out = new Set<string>();
    for (const raw of String(s ?? '').toLowerCase().replace(/[^a-z0-9'\s-]/g, ' ').split(/\s+/)) {
        if (!raw || raw.length < 2 || STOP.has(raw))
            continue;
        out.add(raw);
    }
    return out;
}

function stem(w: string): string {
    return w.replace(/(ing|ed|es|s)$/u, '');
}

/** 由一次 repair 训练生成可展示结论（不夸大） */
export function repairSummary(result: RepairResult): string {
    if (result.verdict === 'preserved')
        return '你把主要意思用已知英语说了出来：这不是"退而求其次"，这就是真实交流能力。';
    if (result.verdict === 'partial')
        return '部分意思到了，但还不够清楚；可以补一个例子或原因再试一次。';
    if (result.verdict === 'failed')
        return '这次替代表达没有把主要意思送到；换一个更具体的描述试试。';
    return '系统没有足够依据判断意思是否保留，只记录你尝试绕开的过程。';
}
