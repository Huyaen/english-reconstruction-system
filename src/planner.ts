// —— Phase 3：Daily Planner 领域引擎（纯函数 / 确定性 / 不依赖 DOM 与 AI）——
// 设计依据：PROJECT_SPEC.md、docs/PHASE3_DAILY_PLANNER.md。
// 约束：
//   1) 时间预算优先：sum(task.minutes) 必须 ≤ availableMinutes（Recall / Closing / Re-entry 同在预算内）。
//   2) 复用 Phase 2 的 recommendedNewWordCount / buildNewWordQueue / effectiveDue，不另建调度器。
//   3) 五模块统一 Task Contract + Capability Gate：未上线模块不生成任何假任务。
//   4) 确定性：同一输入（含 now 与种子）产生同一计划；不使用 Math.random。
//   5) 只保留记忆债，不保留学习债；跨日不克隆未完成任务。
import { inputUnavailableReason, planInputTask } from './inputPlanner.ts';
import type { DailyPlan, Direction, EnergyState, InputSession, InputSource, MiniUnit, Passage, PlanEvent, PlanItem, ReadingSession, ReviewRecord, Word } from './types.ts';
import { effectiveDue } from './fsrs.ts';
import { dayKey, isWeak } from './stats.ts';
import { priority, validNewWordGoal } from './core.ts';
import { buildNewWordQueue, recommendedNewWordCount } from './pools.ts';
import { isUnseen, recallEligible } from './evidence.ts';
import type { SentenceRecord } from './types.ts';
import { SENTENCE_TASK_LABELS, planSentenceTasks, type SentencePlanInput, type SentenceTaskDescriptor, type SentenceTaskKind } from './sentenceSelection.ts';
import { planOutputTask } from './outputPlanner.ts';
import { applyDiagnosticFocus } from './diagnosticsPlanner.ts';
import type { OutputTaskSpec } from './types.ts';
import { planReadingTasks, readingUnavailableReason, type ReadingTaskDescriptor } from './readingPlanner.ts';
export const PLANNER_CONFIG = {
    minutesPerDueWord: 0.35,
    minutesPerWeakWord: 0.4,
    minutesPerNewWord: 0.6,
    previewShare: 0.45,
    newWordShareCap: 0.55,
    yesterdayRecall: { min: 2, max: 4, targetWords: 8, wordsPerMinute: 3, minSample: 3 },
    closing: { min: 3, max: 5, default: 4, targetWords: 4 },
    recovery: { reentryBase: 5, perMissedDay: 0.5, max: 8, miniDiagnosticMin: 7, reentryWords: 5, miniWords: 10 },
    budget: { presets: [20, 30, 45, 60], min: 5, max: 240, default: 30 },
    adjustment: { maxRatio: 0.3, defaultRatio: 0.2, overrunTolerance: 0.5 },
    heavyDueLoad: 60,
    // Phase 4：句任务预算（与词汇共享同一份总预算）
    sentence: { shareOfRemaining: 0.3, minBlockMinutes: 3, maxTasks: 2 },
    retentionMinSamples: 3,
} as const;
export const TASK_LABELS: Record<string, string> = {
    'yesterday-recall': '昨天学的还记得吗',
    'due-review': '今天该复习的',
    'weak-review': '薄弱词再练',
    'new-preview': '新词预览',
    'new-recall': '新词回忆测试',
    'closing-recall': '收尾再想一遍',
    're-entry-check': '找回状态',
    'output-task': '写一段',
    ...SENTENCE_TASK_LABELS,
};
export const MODULES = ['vocabulary', 'sentence', 'reading', 'input', 'output', 'exam'] as const;
export type PlanModule = (typeof MODULES)[number];
export interface Capability {
    available: boolean;
    requires: string | null;
    label: string;
}
// Capability Gate：vocabulary（Phase 3）、sentence（Phase 4）、reading（Phase 5）真实可用；
// input / output 仅声明接口，未上线前不生成任何任务。
// reading 能力可用，但任务只在有真实文章时生成（见 readingPlanner.readingUnavailableReason）。
// overrides 供测试与运行时探针使用（例如句库为空时把 sentence 临时降级）。
export interface CapabilityOverrides {
    vocabulary?: boolean;
    sentence?: boolean;
    reading?: boolean;
    input?: boolean;
    output?: boolean;
    exam?: boolean;
}
export function moduleCapabilities(overrides: CapabilityOverrides = {}): Record<PlanModule, Capability> {
    const base: Record<PlanModule, Capability> = {
        vocabulary: { available: true, requires: null, label: '词汇记忆' },
        sentence: { available: true, requires: null, label: '句子与语法' },
        reading: { available: true, requires: null, label: '阅读' },
        input: { available: true, requires: null, label: '输入练习' },
        output: { available: true, requires: null, label: '写作练习' },
        exam: { available: true, requires: null, label: '考试' },
    };
    for (const key of MODULES)
        if (overrides[key] === false)
            base[key] = { ...base[key], available: false, requires: base[key].requires ?? 'disabled-this-session' };
    return base;
}
// —— 本地日界与确定性工具 ——
export function localDayNumber(at: number): number {
    const d = new Date(at);
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}
export function previousDayKey(at: number): string {
    const d = new Date(at);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - 1);
    return dayKey(d.getTime());
}
function hash(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++)
        h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
}
// 稳定排序键：同一天同一词始终落在同一位置（不使用随机数）
function stableKey(seed: string, id: string): number {
    return hash(`${seed}|${id}`);
}
const round1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export interface PlannerInput {
    newWordGoal?: number | null;
    now: number;
    availableMinutes: number;
    energy: EnergyState;
    words: Word[];
    records: ReviewRecord[];
    plans?: DailyPlan[];
    miniUnit?: MiniUnit | null;
    lastActivityAt?: number | null;
    schedulingAuthority?: 'legacy' | 'fsrs';
    // Phase 4：句任务输入（真实句库 + 语法证据）；缺失时 sentence 不生成任何任务
    sentenceInput?: Omit<SentencePlanInput, 'availableMinutes' | 'energy' | 'now'> | null;
    // Phase 5：阅读输入（真实 Passages + Sessions）；没有材料时 reading 不生成任何任务
    readingInput?: {
        passages: Passage[];
        sessions: ReadingSession[];
    } | null;
    // Phase 8：真实输入（有材料才生成任务）
    inputInput?: {
        sources: InputSource[];
        sessions: InputSession[];
    } | null;
    /** Phase 9：今日表达任务（由 outputSelection 依据真实材料生成；null = 不安排） */
    outputTask?: OutputTaskSpec | null;
    /** Phase 11：考试迁移任务（默认关闭；仅由调用方在用户开启且有新题时传入） */
    examTask?: import('./examPlanner.ts').ExamPlanTask | null;
    /** Phase 10：显式传入的短板诊断；只影响柔性任务排序，不改时长与 capability */
    diagnosticFocus?: import('./types.ts').DiagnosticBottleneck | null;
    capabilityOverrides?: CapabilityOverrides;
}
export interface BudgetBreakdown {
    availableMinutes: number;
    closing: number;
    yesterdayRecall: number;
    recovery: number;
    newPreview: number;
    newRecall: number;
    sentence: number;
    reading: number;
    input: number;
    output?: number;
    exam?: number;
    due: number;
    weak: number;
    planned: number;
    unallocated: number;
    load: {
        dueTotal: number;
        duePlanned: number;
        weakTotal: number;
        weakPlanned: number;
        newRequested: number;
        newPlanned: number;
        forgottenPlanned: number;
        memoryDebt: number;
        sentenceTasks: number;
        sentenceSentences: number;
        readingTasks: number;
        readingMinutes: number;
        inputTasks: number;
        inputMinutes: number;
        outputTasks?: number;
        outputMinutes?: number;
        examTasks?: number;
        examMinutes?: number;
    };
    reasons: string[];
}
export interface PlanBuildResult {
    plan: DailyPlan;
    budget: BudgetBreakdown;
    reasons: string[];
}
// —— 记忆证据：隔夜 / 日保留估计 ——
export interface RetentionEstimate {
    d1: number | null;
    d7: number | null;
    samples: {
        d1: number;
        d7: number;
    };
    reasons: string[];
}
// 由真实复习记录计算保留率：只统计跨日且间隔 ≥12h 的“第二次作答”，样本不足时返回 null（不伪造）。
export function estimateRetention(records: ReviewRecord[], now = Date.now()): RetentionEstimate {
    const byWord = new Map<string, ReviewRecord[]>();
    for (const r of records)
        (byWord.get(r.wordId) ?? byWord.set(r.wordId, []).get(r.wordId)!).push(r);
    let d1Total = 0, d1Correct = 0, d7Total = 0, d7Correct = 0;
    for (const rs of byWord.values()) {
        rs.sort((a, b) => a.at - b.at);
        for (let i = 1; i < rs.length; i++) {
            const prev = rs[i - 1], cur = rs[i];
            const hours = (cur.at - prev.at) / 3600000;
            if (hours < 12)
                continue;
            const gapDays = localDayNumber(cur.at) - localDayNumber(prev.at);
            if (gapDays === 1) {
                d1Total++;
                d1Correct += Number(cur.correct);
            }
            else if (gapDays >= 6 && gapDays <= 8) {
                d7Total++;
                d7Correct += Number(cur.correct);
            }
        }
    }
    const min = PLANNER_CONFIG.retentionMinSamples;
    const reasons: string[] = [];
    const d1 = d1Total >= min ? round1(d1Correct / d1Total) : null;
    const d7 = d7Total >= min ? round1(d7Correct / d7Total) : null;
    if (d1 === null)
        reasons.push(`d1-sample-low(${d1Total})`);
    if (d7 === null)
        reasons.push(`d7-sample-low(${d7Total})`);
    void now;
    return { d1, d7, samples: { d1: d1Total, d7: d7Total }, reasons };
}
// —— Yesterday Recall：抽样契约 ——
export type RecallCategory = 'hard' | 'new' | 'easy' | 'confusion';
export interface RecallCandidate {
    wordId: string;
    category: RecallCategory;
    direction: Direction;
    priorRecordAt: number | null;
}
// 抽昨日新词 / Again-Hard / 少量 Easy 高价值 / confusion 候选；类型平衡；同一词只出现一次。
export function buildYesterdayRecallSample(o: {
    words: Word[];
    records: ReviewRecord[];
    now: number;
    targetWords?: number;
}): RecallCandidate[] {
    const target = o.targetWords ?? PLANNER_CONFIG.yesterdayRecall.targetWords;
    const yKey = previousDayKey(o.now);
    const yRecords = o.records.filter(r => dayKey(r.at) === yKey);
    if (!yRecords.length || target <= 0)
        return [];
    const wordById = new Map(o.words.map(w => [w.id, w]));
    const firstDay = new Map<string, number>();
    for (const r of o.records) {
        const day = localDayNumber(r.at);
        const prev = firstDay.get(r.wordId);
        if (prev === undefined || day < prev)
            firstDay.set(r.wordId, day);
    }
    const yDay = localDayNumber(o.now) - 1;
    const byWord = new Map<string, ReviewRecord[]>();
    for (const r of yRecords) {
        if (!wordById.has(r.wordId))
            continue;
        const arr = byWord.get(r.wordId) ?? [];
        arr.push(r);
        byWord.set(r.wordId, arr);
    }
    const buckets: Record<RecallCategory, RecallCandidate[]> = { hard: [], new: [], easy: [], confusion: [] };
    for (const [wordId, rs] of byWord) {
        rs.sort((a, b) => a.at - b.at);
        const last = rs[rs.length - 1];
        const w = wordById.get(wordId)!;
        const isNew = firstDay.get(wordId) === yDay;
        const hard = !last.correct || (last.rating !== undefined && last.rating <= 2);
        const easy = last.correct && (last.rating === 4 || last.ms <= 1500);
        const confusion = Object.keys(w.confusions ?? {}).length > 0;
        const categories: RecallCategory[] = [];
        if (hard)
            categories.push('hard');
        if (isNew)
            categories.push('new');
        if (confusion)
            categories.push('confusion');
        if (easy)
            categories.push('easy');
        const category = categories[0];
        if (!category)
            continue;
        buckets[category].push({ wordId, category, direction: 'en-zh', priorRecordAt: last.at });
    }
    for (const list of Object.values(buckets))
        list.sort((a, b) => stableKey(yKey, a.wordId) - stableKey(yKey, b.wordId));
    const quota: Record<RecallCategory, number> = {
        hard: Math.ceil(target * 0.5),
        new: Math.max(1, Math.ceil(target * 0.3)),
        easy: Math.max(1, Math.ceil(target * 0.15)),
        confusion: 1,
    };
    const picked: RecallCandidate[] = [];
    const seen = new Set<string>();
    const take = (category: RecallCategory, limit: number) => {
        for (const c of buckets[category]) {
            if (picked.length >= target || picked.filter(x => x.category === category).length >= limit)
                return;
            if (seen.has(c.wordId))
                continue;
            seen.add(c.wordId);
            picked.push(c);
        }
    };
    take('hard', quota.hard);
    take('new', quota.new);
    take('confusion', quota.confusion);
    take('easy', quota.easy);
    // 缺口用昨日其它词补齐（仍然是真实昨日材料，不造假）
    if (picked.length < target) {
        const rest = [...byWord.keys()].filter(id => !seen.has(id)).sort((a, b) => stableKey(yKey, a) - stableKey(yKey, b));
        for (const wordId of rest) {
            if (picked.length >= target)
                break;
            const cat = buckets.hard.find(x => x.wordId === wordId)?.category ?? 'new';
            seen.add(wordId);
            picked.push({ wordId, category: cat, direction: 'en-zh', priorRecordAt: byWord.get(wordId)!.slice(-1)[0].at });
        }
    }
    return picked.slice(0, target).map((c, i) => ({ ...c, direction: (i % 2 === 0 ? 'en-zh' : 'zh-en') as Direction }));
}
export interface RecallSample {
    wordId: string;
    category: RecallCategory;
    direction: Direction;
    correct: boolean;
    ms: number;
    priorGapDays: number | null;
    valid: boolean;
}
export interface RecallEvaluation {
    retention: number | null;
    confidence: 'ok' | 'low' | 'unavailable';
    total: number;
    validSamples: number;
    byCategory: Record<string, {
        total: number;
        valid: number;
        correct: number;
    }>;
    samples: RecallSample[];
    reasons: string[];
}
// 只使用本次 Recall session 的记录；同一词只计一次 → 不会把同一记忆证据重复计入。
export function evaluateRecallSession(candidates: RecallCandidate[], records: ReviewRecord[], sessionId: string): RecallEvaluation {
    const rs = records.filter(r => r.sessionId === sessionId);
    const byWord = new Map<string, ReviewRecord>();
    for (const r of rs)
        byWord.set(r.wordId, r);
    const samples: RecallSample[] = candidates.map(c => {
        const r = byWord.get(c.wordId);
        const priorGapDays = r && c.priorRecordAt !== null ? round1((r.at - c.priorRecordAt) / 86400000) : null;
        const valid = !!r && priorGapDays !== null && priorGapDays >= 0.5;
        return { wordId: c.wordId, category: c.category, direction: r?.direction ?? c.direction, correct: !!r?.correct, ms: r?.ms ?? 0, priorGapDays, valid };
    });
    return evaluateYesterdayRecall(samples);
}
export function evaluateYesterdayRecall(samples: RecallSample[]): RecallEvaluation {
    const byCategory: Record<string, {
        total: number;
        valid: number;
        correct: number;
    }> = {};
    let valid = 0, correct = 0;
    for (const s of samples) {
        const b = byCategory[s.category] ?? (byCategory[s.category] = { total: 0, valid: 0, correct: 0 });
        b.total++;
        if (!s.valid)
            continue;
        b.valid++;
        valid++;
        if (s.correct) {
            b.correct++;
            correct++;
        }
    }
    const reasons: string[] = [];
    if (valid === 0)
        return { retention: null, confidence: 'unavailable', total: samples.length, validSamples: 0, byCategory, samples, reasons: ['no-valid-overnight-evidence'] };
    const retention = round1(correct / valid);
    const confidence: RecallEvaluation['confidence'] = valid >= PLANNER_CONFIG.retentionMinSamples ? 'ok' : 'low';
    if (confidence === 'low')
        reasons.push(`low-confidence(${valid})`);
    return { retention, confidence, total: samples.length, validSamples: valid, byCategory, samples, reasons };
}
// —— 中断 / 重新进入 ——
export interface RecoveryDecision {
    missedDays: number | null;
    kind: 'none' | 're-entry' | 'mini-diagnostic';
    minutes: number;
    words: number;
    reasons: string[];
}
export function decideRecovery(lastActivityAt: number | null, now: number): RecoveryDecision {
    if (lastActivityAt === null)
        return { missedDays: null, kind: 'none', minutes: 0, words: 0, reasons: ['first-use-normal-baseline'] };
    const gap = localDayNumber(now) - localDayNumber(lastActivityAt);
    const missed = Math.max(0, gap - 1);
    const cfg = PLANNER_CONFIG.recovery;
    if (missed <= 1)
        return { missedDays: missed, kind: 'none', minutes: 0, words: 0, reasons: [missed === 1 ? 'one-day-gap-normal-resume' : 'same-day-continue'] };
    if (missed < cfg.miniDiagnosticMin) {
        const minutes = Math.min(cfg.max, round1(cfg.reentryBase + (missed - 2) * cfg.perMissedDay));
        return { missedDays: missed, kind: 're-entry', minutes, words: cfg.reentryWords, reasons: [`re-entry-missed-${missed}`] };
    }
    return { missedDays: missed, kind: 'mini-diagnostic', minutes: cfg.max, words: cfg.miniWords, reasons: [`mini-diagnostic-missed-${missed}`] };
}
export function latestLearningAt(records: ReviewRecord[]): number | null {
    let max = 0;
    for (const r of records)
        if (r.at > max)
            max = r.at;
    return max || null;
}
// —— 计划生成 ——
function normalizeBudget(minutes: number): {
    minutes: number;
    reasons: string[];
} {
    if (!Number.isFinite(minutes))
        throw Error('可用时间要填数字');
    const rounded = Math.round(minutes);
    if (rounded <= 0)
        throw Error('可用时间要大于 0 分钟');
    const cfg = PLANNER_CONFIG.budget;
    const clamped = clamp(rounded, cfg.min, cfg.max);
    return { minutes: clamped, reasons: rounded === clamped ? [] : [`budget-clamped-${rounded}->${clamped}`] };
}
function makeTask(date: string, kind: string, minutes: number, refs: string[], o: {
    priority: number;
    critical: boolean;
    flexible: boolean;
    source: string;
    reason: string[];
    dependencies?: string[];
    label?: string;
    module?: string;
    capabilityRequired?: string;
    targetGrammar?: string[];
}): PlanItem {
    return {
        id: `${date}:${kind}`,
        module: o.module ?? 'vocabulary',
        kind,
        label: o.label ?? TASK_LABELS[kind] ?? kind,
        minutes: round1(Math.max(1, minutes)),
        status: 'pending',
        note: '',
        priority: o.priority,
        critical: o.critical,
        flexible: o.flexible,
        capabilityRequired: o.capabilityRequired ?? 'vocabulary',
        targetGrammar: o.targetGrammar ?? [],
        source: o.source,
        refs,
        reason: o.reason,
        dependencies: o.dependencies ?? [],
        startedAt: null,
        completedAt: null,
        actualMinutes: null,
        replacedBy: null,
    };
}
function dueOrder(a: Word, b: Word, auth: 'legacy' | 'fsrs', now: number): number {
    const pa = priority(a, now), pb = priority(b, now);
    if (pb !== pa)
        return pb - pa;
    const da = effectiveDue(a, auth) - effectiveDue(b, auth);
    if (da !== 0)
        return da;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
export function planMinutes(plan: DailyPlan): number {
    return round1(plan.initialPlan.reduce((n, t) => n + t.minutes, 0));
}
export function openTasks(plan: DailyPlan): PlanItem[] {
    return plan.initialPlan.filter(t => t.status === 'pending' || t.status === 'started' || t.status === 'delayed');
}
export function planProgress(plan: DailyPlan) {
    const total = plan.initialPlan.length;
    const done = plan.initialPlan.filter(t => t.status === 'done');
    const skipped = plan.initialPlan.filter(t => t.status === 'skipped' || t.status === 'replaced').length;
    const doneMinutes = round1(done.reduce((n, t) => n + (t.actualMinutes ?? t.minutes), 0));
    const remainingMinutes = round1(openTasks(plan).reduce((n, t) => n + t.minutes, 0));
    return { total, done: done.length, skipped, doneMinutes, remainingMinutes, plannedMinutes: round1(doneMinutes + remainingMinutes), ratio: total ? done.length / total : 0, remainingTaskIds: openTasks(plan).map(t => t.id) };
}
export function firstAttemptedOn(records: ReviewRecord[], date: string): Set<string> {
    const first = new Map<string, ReviewRecord>();
    for (const r of records) {
        const prior = first.get(r.wordId);
        if (!prior || r.at < prior.at) first.set(r.wordId, r);
    }
    return new Set([...first.values()].filter(r => r.before === 'new' && dayKey(r.at) === date).map(r => r.wordId));
}
export function createDailyPlan(input: PlannerInput, reservedNew: ReadonlySet<string> = new Set(), reservedDue: ReadonlySet<string> = new Set()): PlanBuildResult {
    const now = input.now;
    const date = dayKey(now);
    const budgetNorm = normalizeBudget(input.availableMinutes);
    const reasons: string[] = [...budgetNorm.reasons];
    const available = budgetNorm.minutes;
    if (!['low', 'normal', 'good'].includes(input.energy))
        reasons.push('energy-invalid-normalized');
    const energy: EnergyState = (['low', 'normal', 'good'].includes(input.energy) ? input.energy : 'normal') as EnergyState;
    const auth: 'legacy' | 'fsrs' = input.schedulingAuthority === 'legacy' ? 'legacy' : 'fsrs';
    const caps = moduleCapabilities(input.capabilityOverrides ?? {});
    const lastActivityAt = input.lastActivityAt === undefined ? latestLearningAt(input.records) : input.lastActivityAt;
    const recovery = decideRecovery(lastActivityAt, now);
    reasons.push(...recovery.reasons);
    const dueAll = input.words.filter(w => !reservedDue.has(w.id) && w.state.total > 0 && effectiveDue(w, auth) <= now);
    const dueIds = new Set(dueAll.map(w => w.id));
    const weakAll = input.words.filter(w => w.state.total > 0 && isWeak(w) && !dueIds.has(w.id));
    const retention = estimateRetention(input.records, now);
    reasons.push(...retention.reasons);
    // 预算骨架：Closing 与 Recall / Re-entry 共享同一预算
    let closingMinutes: number = available >= 20 ? PLANNER_CONFIG.closing.default : PLANNER_CONFIG.closing.min;
    if (available < closingMinutes) {
        closingMinutes = available;
        reasons.push('budget-closing-only');
    }
    const sample = recovery.kind === 'none' ? buildYesterdayRecallSample({ words: input.words, records: input.records, now }) : [];
    let recallMinutes = sample.length >= PLANNER_CONFIG.yesterdayRecall.minSample
        ? clamp(Math.ceil(sample.length / PLANNER_CONFIG.yesterdayRecall.wordsPerMinute), PLANNER_CONFIG.yesterdayRecall.min, PLANNER_CONFIG.yesterdayRecall.max)
        : 0;
    if (!sample.length)
        reasons.push(recovery.kind === 'none' ? 'no-yesterday-evidence' : 'recovery-replaces-recall');
    let recoveryMinutes = recovery.kind === 'none' ? 0 : recovery.minutes;
    if (recallMinutes > 0 && available - closingMinutes - recallMinutes < 1) {
        recallMinutes = 0;
        reasons.push('budget-tight-skip-recall');
    }
    if (recoveryMinutes > 0) {
        recallMinutes = 0;
        recoveryMinutes = Math.min(recoveryMinutes, Math.max(0, available - closingMinutes));
        if (recoveryMinutes < 2) {
            recoveryMinutes = 0;
            reasons.push('budget-tight-skip-reentry');
        }
    }
    let remaining = Math.max(0, available - closingMinutes - recallMinutes - recoveryMinutes);
    const recommendation = recommendedNewWordCount({
        availableMinutes: remaining,
        energyState: energy,
        d1Retention: retention.d1,
        d7Retention: retention.d7,
        weakLoad: weakAll.length,
        dueLoad: dueAll.length,
    });
    const goal = validNewWordGoal(input.newWordGoal) ? input.newWordGoal : null;
    const requested = goal === null ? recommendation.recommended
        : Math.max(0, goal - new Set([...firstAttemptedOn(input.records, date), ...reservedNew]).size);
    if (goal === null) reasons.push(...recommendation.reasons);
    const dueReserve = goal === null ? 0 : Math.min(remaining, Math.ceil(dueAll.length * PLANNER_CONFIG.minutesPerDueWord));
    const newBudget = goal === null ? remaining * PLANNER_CONFIG.newWordShareCap : remaining - dueReserve;
    const newCapByBudget = newBudget >= (goal === null ? 0 : 2) ? Math.floor(newBudget / PLANNER_CONFIG.minutesPerNewWord) : 0;
    let newCount = Math.min(requested, Math.max(0, newCapByBudget));
    if (goal !== null && newCount < requested) reasons.push('new-goal-budget');
    if (goal === null && newCount < 2) {
        newCount = 0;
        if (remaining > 0)
            reasons.push('new-deferred-budget');
    }
    const queue = buildNewWordQueue(reservedNew.size ? input.words.filter(w => !reservedNew.has(w.id)) : input.words, { count: newCount, miniUnit: input.miniUnit ?? null, now });
    const newIds = queue.items.filter(i => i.kind === 'new').map(i => i.wordId);
    const forgottenIds = queue.items.filter(i => i.kind === 'forgotten').map(i => i.wordId);
    if (queue.breakdown.fallbackReasons.length)
        reasons.push(...queue.breakdown.fallbackReasons);
    if (newIds.length < newCount)
        reasons.push(`pool-limited-${newIds.length}/${newCount}`);
    let newMinutes = newIds.length ? Math.max(goal === null ? 0 : 2, Math.ceil(newIds.length * PLANNER_CONFIG.minutesPerNewWord)) : 0;
    let dueBudget = Math.max(0, remaining - newMinutes);
    let dueTarget = Math.min(dueAll.length, Math.floor(dueBudget / PLANNER_CONFIG.minutesPerDueWord));
    let dueMinutes = dueTarget ? Math.ceil(dueTarget * PLANNER_CONFIG.minutesPerDueWord) : 0;
    if (newMinutes + dueMinutes > remaining) {
        dueTarget = Math.max(0, Math.floor((remaining - newMinutes) / PLANNER_CONFIG.minutesPerDueWord));
        dueMinutes = dueTarget ? Math.ceil(dueTarget * PLANNER_CONFIG.minutesPerDueWord) : 0;
    }
    if (dueAll.length > dueTarget)
        reasons.push(`critical-memory-sampled-${dueTarget}/${dueAll.length}`);
    const weakPool = [...weakAll, ...input.words.filter(w => forgottenIds.includes(w.id) && !weakAll.some(x => x.id === w.id))];
    const weakIds = [...new Set(weakPool.map(w => w.id))].sort((a, b) => {
        const wa = input.words.find(w => w.id === a), wb = input.words.find(w => w.id === b);
        const pa = wa ? priority(wa, now) : 0, pb = wb ? priority(wb, now) : 0;
        if (pb !== pa)
            return pb - pa;
        return a < b ? -1 : 1;
    });
    let weakBudget = Math.max(0, remaining - newMinutes - dueMinutes);
    let weakTarget = Math.min(weakIds.length, Math.floor(weakBudget / PLANNER_CONFIG.minutesPerWeakWord));
    let weakMinutes = weakTarget ? Math.ceil(weakTarget * PLANNER_CONFIG.minutesPerWeakWord) : 0;
    while (weakTarget > 0 && newMinutes + dueMinutes + weakMinutes > remaining) {
        weakTarget--;
        weakMinutes = weakTarget ? Math.ceil(weakTarget * PLANNER_CONFIG.minutesPerWeakWord) : 0;
    }
    const dueWords = dueAll.slice().sort((a, b) => dueOrder(a, b, auth, now)).slice(0, dueTarget);
    const weakWords = weakIds.slice(0, weakTarget);
    const weakObjs = weakWords.map(id => input.words.find(w => w.id === id)).filter((w): w is Word => !!w);
    // —— Phase 4：句任务（只在 sentence capability 真实可用且有真实句源时生成）——
    const vocabPlanned = closingMinutes + recallMinutes + recoveryMinutes + newMinutes + dueMinutes;
    const sentenceBudgetTotal = Math.max(0, remaining - (newMinutes + dueMinutes));
    const sentenceDescriptors: SentenceTaskDescriptor[] = [];
    if (caps.sentence.available && input.sentenceInput && sentenceBudgetTotal >= PLANNER_CONFIG.sentence.minBlockMinutes) {
        const wanted = Math.min(sentenceBudgetTotal, Math.max(PLANNER_CONFIG.sentence.minBlockMinutes, Math.floor(remaining * PLANNER_CONFIG.sentence.shareOfRemaining)));
        try {
            sentenceDescriptors.push(...planSentenceTasks({ ...input.sentenceInput, now, availableMinutes: wanted, energy, maxTasks: PLANNER_CONFIG.sentence.maxTasks }));
        }
        catch (e) {
            reasons.push(`sentence-selection-error:${(e as Error).message}`);
        }
        if (!sentenceDescriptors.length)
            reasons.push('sentence-no-eligible-source');
    }
    const sentenceCapByBudget = Math.max(0, remaining - (newMinutes + dueMinutes));
    let sentenceMinutesUsed = 0;
    const sentenceTasks: PlanItem[] = [];
    for (const d of sentenceDescriptors) {
        if (sentenceMinutesUsed + d.minutes > sentenceCapByBudget)
            break;
        sentenceMinutesUsed += d.minutes;
        sentenceTasks.push(makeTask(date, d.kind, d.minutes, d.sentenceIds, {
            priority: d.priority, critical: d.critical, flexible: d.flexible, source: d.source,
            reason: d.reasons, module: 'sentence', capabilityRequired: 'sentence',
            targetGrammar: d.targetGrammar,
        }));
    }
    if (sentenceDescriptors.length && !sentenceTasks.length)
        reasons.push('sentence-deferred-budget');
    reasons.push(`sentence-block-${sentenceMinutesUsed}min/${sentenceBudgetTotal}min`);
    // —— Phase 5：阅读任务（只有存在真实文章时才生成；绝不造假文章）——
    const readingCapByBudget = Math.max(0, remaining - (newMinutes + dueMinutes + sentenceMinutesUsed));
    let readingMinutesUsed = 0;
    const readingTasks: PlanItem[] = [];
    if (caps.reading.available && input.readingInput) {
        let descriptors: ReadingTaskDescriptor[] = [];
        try {
            descriptors = planReadingTasks({
                passages: input.readingInput.passages, sessions: input.readingInput.sessions,
                now, availableMinutes: readingCapByBudget, energy,
            });
        }
        catch (e) {
            reasons.push(`reading-selection-error:${(e as Error).message}`);
        }
        if (!descriptors.length)
            reasons.push(readingUnavailableReason(input.readingInput.passages) ? 'reading-no-material' : 'reading-nothing-scheduled');
        for (const d of descriptors) {
            if (readingMinutesUsed + d.minutes > readingCapByBudget)
                break;
            readingMinutesUsed += d.minutes;
            const t = makeTask(date, d.kind, d.minutes, d.passageIds, {
                priority: d.priority, critical: d.critical, flexible: d.flexible, source: 'reading',
                reason: d.reasons, module: 'reading', capabilityRequired: 'reading', label: d.label,
            });
            readingTasks.push(d.sessionId ? { ...t, targetSessionId: d.sessionId } : t);
        }
        if (descriptors.length && !readingTasks.length)
            reasons.push('reading-deferred-budget');
    }
    reasons.push(`reading-block-${readingMinutesUsed}min/${readingCapByBudget}min`);
    // —— Phase 8：真实输入任务（只在有真实材料/未完成会话时生成）——
    const inputCapByBudget = Math.max(0, remaining - (newMinutes + dueMinutes + sentenceMinutesUsed + readingMinutesUsed));
    let inputMinutesUsed = 0;
    const inputTasks: PlanItem[] = [];
    if (caps.input.available && input.inputInput) {
        const descriptor = planInputTask({ sources: input.inputInput.sources, sessions: input.inputInput.sessions, now, availableMinutes: inputCapByBudget, energy });
        if (descriptor) {
            inputMinutesUsed = descriptor.minutes;
            const inputTask = makeTask(date, descriptor.kind, descriptor.minutes, [descriptor.sourceId], {
                priority: 40, critical: false, flexible: true, source: 'input', module: 'input',
                capabilityRequired: 'input', label: descriptor.label, reason: descriptor.reasons,
            });
            if (descriptor.sessionId)
                inputTask.targetSessionId = descriptor.sessionId;
            inputTasks.push(inputTask);
        }
        else {
            const why = inputUnavailableReason(input.inputInput.sources);
            reasons.push(why ? 'input-no-material' : 'input-nothing-scheduled');
        }
    }
    // —— Phase 9：真实表达任务（有任务且装得下才排；没有就不排，不造假）——
    const outputCapByBudget = Math.max(0, remaining - (newMinutes + dueMinutes + sentenceMinutesUsed + readingMinutesUsed + inputMinutesUsed));
    let outputMinutesUsed = 0;
    const outputTasks: PlanItem[] = [];
    if (caps.output.available && input.outputTask) {
        const descriptor = planOutputTask(input.outputTask, { now, availableMinutes: outputCapByBudget, energy });
        if (descriptor) {
            outputMinutesUsed = descriptor.minutes;
            outputTasks.push(makeTask(date, descriptor.kind, descriptor.minutes, [descriptor.sourceId], {
                priority: 35, critical: false, flexible: true, source: 'output', module: 'output',
                capabilityRequired: 'output', label: descriptor.label, reason: descriptor.reasons,
            }));
        }
        else {
            reasons.push('output-deferred-budget');
        }
    }
    // 动态顺序：状态差 / 到期负载重 → 记忆优先；否则先建新编码。
    const memoryFirst = energy === 'low' || dueAll.length >= PLANNER_CONFIG.heavyDueLoad;
    reasons.push(memoryFirst ? 'order-memory-first' : 'order-new-first');
    const tasks: PlanItem[] = [];
    if (recovery.kind !== 'none' && recoveryMinutes > 0) {
        const refs = pickRecoveryWords(input.words, dueAll, weakPool, now, recovery.words);
        tasks.push(makeTask(date, 're-entry-check', recoveryMinutes, refs, {
            priority: 100, critical: true, flexible: false, source: 'recovery',
            reason: recovery.kind === 'mini-diagnostic' ? [...recovery.reasons, 'mini-diagnostic-contract'] : recovery.reasons,
            label: recovery.kind === 'mini-diagnostic' ? '小诊断（词汇）' : TASK_LABELS['re-entry-check'],
        }));
    }
    else if (recallMinutes > 0) {
        tasks.push(makeTask(date, 'yesterday-recall', recallMinutes, sample.map(s => s.wordId), {
            priority: 100, critical: true, flexible: false, source: 'yesterday',
            reason: ['overnight-retention-check', `sample-${sample.length}`, `recall-${recallMinutes}min`],
        }));
    }
    const dueTask = dueWords.length
        ? makeTask(date, 'due-review', dueMinutes, dueWords.map(w => w.id), { priority: 90, critical: true, flexible: false, source: 'due', reason: [`due-${dueAll.length}`, `planned-${dueWords.length}`] })
        : null;
    const previewTask = newIds.length
        ? makeTask(date, 'new-preview', Math.max(1, Math.ceil(newMinutes * PLANNER_CONFIG.previewShare)), newIds, { priority: 70, critical: false, flexible: true, source: 'pool', reason: [`new-${newIds.length}`, `${goal === null ? 'recommended' : 'manual'}-${goal ?? recommendation.recommended}`] })
        : null;
    const recallTask = newIds.length && previewTask
        ? makeTask(date, 'new-recall', Math.max(1, newMinutes - previewTask.minutes), newIds, { priority: 68, critical: false, flexible: true, source: 'pool', reason: ['preview-then-recall'], dependencies: [previewTask.id] })
        : null;
    const weakTask = weakWords.length
        ? makeTask(date, 'weak-review', weakMinutes, weakWords, { priority: 55, critical: false, flexible: true, source: 'weak', reason: [`weak-${weakAll.length}`, forgottenIds.length ? `forgotten-${forgottenIds.length}` : ''].filter(Boolean) })
        : null;
    const newObjs = newIds.map(id => input.words.find(w => w.id === id)).filter((w): w is Word => !!w);
    const closingRefs = pickClosingWords(input.words, input.records, dueWords, weakObjs, now, newObjs);
    const closingTask = closingMinutes > 0
        ? makeTask(date, 'closing-recall', closingMinutes, closingRefs, { priority: 10, critical: true, flexible: false, source: 'closing', reason: ['closing-loop-3-5min'] })
        : null;
    // —— Phase 11：考试迁移（可选、短时、低优先级；不挤占关键记忆任务）——
    const examTasks: PlanItem[] = [];
    if (caps.exam?.available && input.examTask) {
        const cap = Math.max(0, remaining - (newMinutes + dueMinutes + sentenceMinutesUsed + readingMinutesUsed + inputMinutesUsed + outputMinutesUsed));
        if (input.examTask.minutes <= cap) {
            examTasks.push(makeTask(date, 'exam-practice', input.examTask.minutes, [input.examTask.itemId], {
                priority: 32, critical: false, flexible: true, source: 'exam', module: 'exam', capabilityRequired: 'exam',
                label: input.examTask.label, reason: input.examTask.reasons,
            }));
        }
        else
            reasons.push('exam-deferred-budget');
    }
    const middle: Array<PlanItem | null> = memoryFirst ? [dueTask, previewTask, recallTask, weakTask, ...sentenceTasks, ...readingTasks, ...inputTasks, ...outputTasks, ...examTasks] : [previewTask, recallTask, dueTask, weakTask, ...sentenceTasks, ...readingTasks, ...inputTasks, ...outputTasks, ...examTasks];
    for (const t of middle)
        if (t)
            tasks.push(t);
    if (closingTask)
        tasks.push(closingTask);
    // —— Phase 10：诊断焦点只重排柔性任务，critical 与 closing 顺序不动 ——
    if (input.diagnosticFocus) {
        reasons.push(`diagnostic-focus-${input.diagnosticFocus.domain}`);
        const ordered = applyDiagnosticFocus(tasks, input.diagnosticFocus);
        tasks.length = 0;
        tasks.push(...ordered);
    }
    // 数值安全：任何取整误差都不得突破总预算；优先收缩柔性任务。
    trimToBudget(tasks, available, reasons);
    const planned = round1(tasks.reduce((n, t) => n + t.minutes, 0));
    const budget: BudgetBreakdown = {
        availableMinutes: available, closing: closingMinutes, yesterdayRecall: recallMinutes, recovery: recoveryMinutes,
        newPreview: previewTask?.minutes ?? 0, newRecall: recallTask?.minutes ?? 0, due: dueMinutes, weak: weakMinutes, sentence: round1(sentenceMinutesUsed), reading: round1(readingMinutesUsed), input: round1(inputMinutesUsed), output: round1(outputMinutesUsed), exam: round1(examTasks.reduce((n, t) => n + t.minutes, 0)),
        planned, unallocated: round1(Math.max(0, available - planned)),
        load: { dueTotal: dueAll.length, duePlanned: dueWords.length, weakTotal: weakAll.length, weakPlanned: weakWords.length, newRequested: goal ?? recommendation.recommended, newPlanned: newIds.length, forgottenPlanned: forgottenIds.length, memoryDebt: Math.max(0, dueAll.length - dueWords.length), sentenceTasks: sentenceTasks.length, sentenceSentences: sentenceTasks.reduce((n, t) => n + (t.refs ?? []).length, 0), readingTasks: readingTasks.length, readingMinutes: round1(readingMinutesUsed), inputTasks: inputTasks.length, inputMinutes: round1(inputMinutesUsed), outputTasks: outputTasks.length, outputMinutes: round1(outputMinutesUsed), examTasks: examTasks.length, examMinutes: round1(examTasks.reduce((n, t) => n + t.minutes, 0)) },
        reasons,
    };
    const plan: DailyPlan = {
        id: date, date, availableMinutes: available, energyState: energy,
        yesterdayRecallResult: { status: sample.length ? 'pending' : recovery.kind !== 'none' ? 'recovery' : 'no-evidence', sample, sessionId: '', evaluation: null },
        miniUnitId: input.miniUnit?.id ?? '',
        initialPlan: tasks, adjustments: [],
        actualExecution: { actualMinutes: 0, completedTasks: [] },
        completedModules: [],
        closingLoop: { status: closingTask ? 'pending' : 'skipped', words: closingRefs, feedback: null, minutes: 0 },
        createdAt: now, completedAt: null,
        revision: 0, updatedAt: now, status: 'planned',
        capabilities: caps,
        planRequest: { availableMinutes: available, energyState: energy, lastActivityAt, recovery, retention, sampleSize: sample.length },
        ...(input.newWordGoal !== undefined ? { newWordGoal: goal } : {}),
        budget, recovery, calibration: null, taskActions: [],
    };
    return { plan, budget, reasons };
}
function pickRecoveryWords(words: Word[], due: Word[], weak: Word[], now: number, count: number): string[] {
    const pool = [...due, ...weak, ...words.filter(w => w.state.total > 0)];
    const seen = new Set<string>();
    const out: string[] = [];
    const sorted = pool.slice().sort((a, b) => priority(b, now) - priority(a, now));
    for (const w of sorted) {
        if (seen.has(w.id))
            continue;
        seen.add(w.id);
        out.push(w.id);
        if (out.length >= count)
            break;
    }
    return out;
}
// 收尾用词优先取今日真实接触过的词；没有历史时回退到今日引入的新词（绝不凭空造词）。
function pickClosingWords(words: Word[], records: ReviewRecord[], due: Word[], weak: Word[], now: number, extra: Word[] = []): string[] {
    const today = dayKey(now);
    const map = new Map(words.map(w => [w.id, w]));
    const todayIds = [...new Set(records.filter(r => dayKey(r.at) === today).map(r => r.wordId))];
    const ranked = [...todayIds.map(id => map.get(id)).filter((w): w is Word => !!w), ...due, ...weak, ...extra]
        .sort((a, b) => priority(b, now) - priority(a, now));
    const seen = new Set<string>();
    const out: string[] = [];
    for (const w of ranked) {
        if (seen.has(w.id))
            continue;
        seen.add(w.id);
        out.push(w.id);
        if (out.length >= PLANNER_CONFIG.closing.targetWords)
            break;
    }
    return out;
}
// 只裁柔性任务（新词 / 弱词）；critical 记忆任务不静默削减。
function trimToBudget(tasks: PlanItem[], available: number, reasons: string[]): void {
    const total = () => round1(tasks.reduce((n, t) => n + t.minutes, 0));
    if (total() <= available)
        return;
    reasons.push('budget-trim-applied');
    for (let i = tasks.length - 1; i >= 0 && total() > available; i--) {
        const t = tasks[i];
        // 已完成/已开始的真实会话不能被预算裁剪改写；Only 未开始部分可缩。
        if (t.status === 'done' || t.status === 'started')
            continue;
        if (!t.flexible || t.minutes <= 1)
            continue;
        const original = t.minutes;
        while (t.minutes > 1 && total() > available) {
            t.minutes = round1(t.minutes - 0.5);
            const refs = t.refs ?? [];
            if (refs.length > 1) {
                const keep = Math.max(1, Math.ceil(refs.length * (t.minutes / original)));
                if (keep < refs.length)
                    t.refs = refs.slice(0, keep);
            }
        }
    }
}
// —— 动态重规划：Start / Skip / Delay / Replace / Complete + 超时与提前完成 ——
export type PlanActionName = 'start' | 'complete' | 'skip' | 'delay' | 'replace';
export interface PlanActionOptions {
    now: number;
    actualMinutes?: number;
    reason?: string;
    replacement?: PlanItem;
}
export interface PlanActionResult {
    ok: boolean;
    plan: DailyPlan;
    event: PlanEvent;
    reasons: string[];
}
function event(plan: DailyPlan, taskId: string, action: PlanEvent['action'], minutesDelta: number, reason: string, now: number): PlanEvent {
    return { id: `${plan.id}:${action}:${taskId}:${(plan.taskActions?.length ?? 0) + 1}`, at: now, taskId, action, minutesDelta: round1(minutesDelta), reason };
}
// revision 由持久化层（plannerStore.savePlan）统一递增，避免与 DB 中的值分叉。
function touch(plan: DailyPlan): void {
    plan.updatedAt = Date.now();
}
function syncCompletion(plan: DailyPlan): void {
    const open = openTasks(plan);
    if (!open.length && plan.initialPlan.length) {
        plan.status = 'completed';
        plan.completedAt = plan.completedAt ?? Date.now();
        plan.completedModules = [...new Set(plan.initialPlan.filter(t => t.status === 'done').map(t => t.module))];
    }
    else {
        plan.status = plan.initialPlan.some(t => t.status === 'started' || t.status === 'done') ? 'active' : 'planned';
        plan.completedAt = null;
    }
    plan.actualExecution = {
        actualMinutes: round1(plan.initialPlan.filter(t => t.status === 'done').reduce((n, t) => n + (t.actualMinutes ?? t.minutes), 0)),
        completedTasks: plan.initialPlan.filter(t => t.status === 'done').map(t => t.id),
    };
}
export function applyPlanAction(plan: DailyPlan, taskId: string, action: PlanActionName, opts: PlanActionOptions): PlanActionResult {
    const next: DailyPlan = structuredClone(plan);
    const task = next.initialPlan.find(t => t.id === taskId);
    if (!task)
        return { ok: false, plan, event: event(plan, taskId, 'skip', 0, 'task-not-found', opts.now), reasons: ['task-not-found'] };
    const reasons: string[] = [];
    const before = task.status;
    let delta = 0;
    if (action === 'start') {
        if (task.status === 'started') {
            reasons.push('already-started');
            return { ok: true, plan: next, event: event(next, taskId, 'start', 0, 'already-started', opts.now), reasons };
        }
        if (task.status !== 'pending' && task.status !== 'delayed')
            return { ok: false, plan, event: event(plan, taskId, 'start', 0, `invalid-from-${before}`, opts.now), reasons: [`invalid-from-${before}`] };
        task.status = 'started';
        task.startedAt = opts.now;
        reasons.push('task-started');
    }
    else if (action === 'complete') {
        if (task.status !== 'started' && task.status !== 'pending' && task.status !== 'delayed')
            return { ok: false, plan, event: event(plan, taskId, 'complete', 0, `invalid-from-${before}`, opts.now), reasons: [`invalid-from-${before}`] };
        const actual = opts.actualMinutes ?? task.minutes;
        task.status = 'done';
        task.completedAt = opts.now;
        task.actualMinutes = round1(Math.max(0, actual));
        delta = round1(task.actualMinutes - task.minutes);
        reasons.push(delta > 0 ? 'task-overrun' : delta < 0 ? 'task-early' : 'task-on-time');
        next.adjustments = [...next.adjustments, { at: opts.now, module: task.module, deltaMinutes: delta, reason: opts.reason ?? reasons[0] }];
        rebalance(next, opts.now, reasons);
    }
    else if (action === 'skip') {
        if (task.status === 'done')
            return { ok: false, plan, event: event(plan, taskId, 'skip', 0, 'invalid-from-done', opts.now), reasons: ['invalid-from-done'] };
        task.status = 'skipped';
        task.completedAt = opts.now;
        delta = round1(-task.minutes);
        if (task.critical) {
            reasons.push('critical-task-skipped-by-user');
            if (task.kind === 'closing-recall')
                next.closingLoop = { ...((next.closingLoop as Record<string, unknown>) ?? {}), status: 'skipped' };
        }
        else
            reasons.push('flexible-task-skipped');
        next.adjustments = [...next.adjustments, { at: opts.now, module: task.module, deltaMinutes: delta, reason: opts.reason ?? reasons[0] }];
    }
    else if (action === 'delay') {
        if (task.status === 'done' || task.status === 'replaced')
            return { ok: false, plan, event: event(plan, taskId, 'delay', 0, `invalid-from-${task.status}`, opts.now), reasons: [`invalid-from-${task.status}`] };
        task.status = 'delayed';
        reasons.push('delayed-within-today');
        // 延后只在本日计划内重排（不自动成为次日作业债）
        const idx = next.initialPlan.findIndex(t => t.id === taskId);
        next.initialPlan.splice(idx, 1);
        const closingIdx = next.initialPlan.findIndex(t => t.kind === 'closing-recall');
        next.initialPlan.splice(closingIdx === -1 ? next.initialPlan.length : closingIdx, 0, task);
        next.adjustments = [...next.adjustments, { at: opts.now, module: task.module, deltaMinutes: 0, reason: 'delay-resequenced' }];
    }
    else {
        // replace：仅柔性任务；等价目标；分钟数保持 ±20–30% 内
        if (!task.flexible)
            return { ok: false, plan, event: event(plan, taskId, 'replace', 0, 'replace-not-allowed-for-critical', opts.now), reasons: ['replace-not-allowed-for-critical'] };
        if (!opts.replacement) {
            reasons.push('replace-unavailable');
            return { ok: false, plan, event: event(plan, taskId, 'replace', 0, 'replace-unavailable', opts.now), reasons };
        }
        const maxRatio = PLANNER_CONFIG.adjustment.maxRatio;
        const min = task.minutes * (1 - maxRatio), max = task.minutes * (1 + maxRatio);
        const replacement: PlanItem = {
            ...opts.replacement,
            id: `${task.id}:r${next.taskActions?.length ?? 0}`,
            minutes: round1(clamp(opts.replacement.minutes, min, max)),
            status: 'pending',
            startedAt: null,
            completedAt: null,
            actualMinutes: null,
            dependencies: [],
            reason: [...(opts.replacement.reason ?? []), 'replaced-task'],
        };
        task.status = 'replaced';
        task.replacedBy = replacement.id;
        const idx = next.initialPlan.findIndex(t => t.id === taskId);
        next.initialPlan.splice(idx + 1, 0, replacement);
        delta = round1(replacement.minutes - task.minutes);
        reasons.push('task-replaced');
        next.adjustments = [...next.adjustments, { at: opts.now, module: task.module, deltaMinutes: delta, reason: 'replace-task' }];
    }
    const ev = event(next, taskId, action, delta, reasons[reasons.length - 1] ?? action, opts.now);
    next.taskActions = [...(next.taskActions ?? []), ev];
    touch(next);
    syncCompletion(next);
    if (planMinutes(next) > next.availableMinutes + PLANNER_CONFIG.adjustment.overrunTolerance)
        reasons.push('plan-exceeds-budget');
    return { ok: true, plan: next, event: ev, reasons };
}
// 超时 / 提前完成后的有限调整：只收缩柔性剩余任务，最多 30%；critical 记忆任务保留。
export function rebalance(plan: DailyPlan, now: number, reasons: string[]): void {
    const open = openTasks(plan);
    const planned = round1(open.reduce((n, t) => n + t.minutes, 0));
    const spent = round1(plan.initialPlan.filter(t => t.status === 'done').reduce((n, t) => n + (t.actualMinutes ?? t.minutes), 0));
    const over = round1(spent + planned - plan.availableMinutes);
    if (over <= PLANNER_CONFIG.adjustment.overrunTolerance) {
        if (over > 0)
            reasons.push('budget-tolerance-used');
        return;
    }
    const flexible = open.filter(t => t.flexible);
    const flexTotal = round1(flexible.reduce((n, t) => n + t.minutes, 0));
    const cap = round1(flexTotal * PLANNER_CONFIG.adjustment.maxRatio);
    const reduce = Math.min(over, cap);
    if (reduce <= 0) {
        reasons.push('overrun-no-flexible-capacity');
        return;
    }
    reasons.push(`overrun-bounded-${reduce}min`, over > cap ? 'overrun-exceeds-adjustment-cap' : 'overrun-within-cap');
    let left = reduce;
    for (const t of flexible) {
        if (left <= 0 || t.minutes <= 1)
            continue;
        const take = Math.min(left, round1(t.minutes * 0.5));
        t.minutes = round1(Math.max(1, t.minutes - take));
        left = round1(left - take);
        t.reason = [...(t.reason ?? []), 'adjusted-after-overrun'];
    }
    plan.adjustments = [...plan.adjustments, { at: now, module: 'plan', deltaMinutes: -reduce, reason: 'overrun-bounded-rebalance' }];
}
// 昨日 Recall 结果 → 校准今日剩余计划（低保留减新词并补弱词；高保留适度增量；不溢出预算）
export function calibrateAfterRecall(plan: DailyPlan, evaluation: RecallEvaluation, opts: {
    now: number;
    words: Word[];
}): PlanActionResult {
    const next: DailyPlan = structuredClone(plan);
    const reasons: string[] = [];
    next.yesterdayRecallResult = { ...((next.yesterdayRecallResult as Record<string, unknown>) ?? {}), status: 'done', evaluation };
    const retention = evaluation.retention;
    if (retention === null) {
        next.calibration = { retention: null, factor: 1, reasons: ['retention-unavailable'] };
        const ev = event(next, '', 'calibrate', 0, 'retention-unavailable', opts.now);
        next.taskActions = [...(next.taskActions ?? []), ev];
        touch(next);
        return { ok: true, plan: next, event: ev, reasons: ['retention-unavailable'] };
    }
    const factor = validNewWordGoal(plan.newWordGoal) ? 1 : retention < 0.6 ? 0.7 : retention >= 0.8 ? 1.15 : 1;
    const preview = next.initialPlan.find(t => t.kind === 'new-preview');
    const recall = next.initialPlan.find(t => t.kind === 'new-recall');
    const previewRefs = preview?.refs ?? [];
    const before = previewRefs.length;
    if (preview && preview.status === 'pending' && factor !== 1) {
        const per = PLANNER_CONFIG.minutesPerNewWord;
        const wanted = Math.max(0, Math.round(before * factor));
        if (wanted < before) {
            const keep = previewRefs.slice(0, wanted);
            preview.refs = keep;
            preview.minutes = round1(Math.max(1, Math.ceil(keep.length * per * PLANNER_CONFIG.previewShare)));
            if (recall)
                recall.refs = keep;
            reasons.push(`retention-${retention}-reduce-new`);
        }
        else if (wanted > before) {
            const used = new Set(next.initialPlan.flatMap(t => t.refs ?? []));
            const extra = opts.words.filter(w => !used.has(w.id) && (isUnseen(w) || w.previewedAt > 0) && w.previewResult !== 'skip').slice(0, wanted - before);
            if (extra.length) {
                preview.refs = [...(preview.refs ?? []), ...extra.map(w => w.id)];
                preview.minutes = round1(Math.max(1, Math.ceil((preview.refs?.length ?? 0) * per * PLANNER_CONFIG.previewShare)));
                if (recall)
                    recall.refs = preview.refs;
                reasons.push(`retention-${retention}-increase-new`);
            }
        }
        if (recall)
            recall.minutes = round1(Math.max(1, Math.ceil((recall.refs?.length ?? 0) * per * (1 - PLANNER_CONFIG.previewShare))));
    }
    if (retention < 0.6) {
        const weak = next.initialPlan.find(t => t.kind === 'weak-review');
        const spare = round1(next.availableMinutes - planMinutes(next));
        if (!weak && spare >= 1) {
            const weakWords = opts.words.filter(w => w.state.total > 0 && isWeak(w)).slice(0, Math.max(1, Math.floor(spare / PLANNER_CONFIG.minutesPerWeakWord)));
            if (weakWords.length) {
                const closingIdx = next.initialPlan.findIndex(t => t.kind === 'closing-recall');
                const insertAt = closingIdx === -1 ? next.initialPlan.length : closingIdx;
                next.initialPlan.splice(insertAt, 0, makeTask(next.id, 'weak-review', Math.min(spare, weakWords.length * PLANNER_CONFIG.minutesPerWeakWord), weakWords.map(w => w.id), { priority: 55, critical: false, flexible: true, source: 'weak', reason: ['retention-low-weak-boost'] }));
            }
        }
    }
    // 校准绝不能突破预算：超出时回退训练量
    if (planMinutes(next) > next.availableMinutes) {
        const flexible = openTasks(next).filter(t => t.flexible);
        for (let i = flexible.length - 1; i >= 0 && planMinutes(next) > next.availableMinutes; i--) {
            const t = flexible[i];
            const refs = t.refs ?? [];
            if (refs.length > 1) {
                t.refs = refs.slice(0, refs.length - 1);
                t.minutes = round1(Math.max(1, t.minutes - 1));
            }
            else
                t.status = 'skipped';
        }
        reasons.push('calibration-capped-by-budget');
    }
    next.calibration = { retention, factor, before, after: preview?.refs?.length ?? 0, reasons };
    const ev = event(next, '', 'calibrate', 0, reasons.join(',') || 'calibration-no-change', opts.now);
    next.taskActions = [...(next.taskActions ?? []), ev];
    touch(next);
    syncCompletion(next);
    return { ok: true, plan: next, event: ev, reasons };
}
// Regenerate Today：只重建未完成任务；已完成任务与已提交证据保留。
export function regenerateRemaining(plan: DailyPlan, input: PlannerInput): PlanActionResult {
    const now = input.now;
    // 已完成 + 已开始的任务都保留：开始过的领域会话不能被“重新生成”抹掉。
    const done = plan.initialPlan.filter(t => t.status === 'done');
    const started = plan.initialPlan.filter(t => t.status === 'started');
    const preserved = [...done, ...started];
    const spent = round1(preserved.reduce((n, t) => n + (t.actualMinutes ?? t.minutes), 0));
    const totalBudget = Math.max(input.availableMinutes, spent + PLANNER_CONFIG.budget.min);
    const remainingBudget = Math.max(PLANNER_CONFIG.budget.min, round1(totalBudget - spent));
    const goal = input.newWordGoal === undefined ? plan.newWordGoal : input.newWordGoal;
    const trackGoal = goal !== undefined || plan.newWordGoal !== undefined;
    const isNew = (t: PlanItem) => t.kind === 'new-preview' || t.kind === 'new-recall';
    const previewed = new Set(input.words.filter(w => recallEligible(w) && w.previewResult !== 'skip').map(w => w.id));
    const reserved = new Set(trackGoal ? preserved.filter(isNew).flatMap(t => (t.refs ?? [])
        .filter(id => t.kind !== 'new-preview' || t.status === 'started' || previewed.has(id))) : []);
    const reservedDue = new Set(trackGoal ? preserved.filter(t => t.kind === 'due-review').flatMap(t => t.refs ?? []) : []);
    const preservedIds = new Set(preserved.map(t => t.id));
    const carry = trackGoal ? plan.initialPlan.filter(t => t.kind === 'new-recall'
        && (t.status === 'pending' || t.status === 'delayed' || (t.status === 'replaced' && t.note?.includes('回归模式暂缓')))
        && t.dependencies?.some(id => preservedIds.has(id))).map(t => {
        const dependencyStarted = started.some(p => t.dependencies?.includes(p.id));
        return { ...t, status: 'pending' as const, note: '', refs: dependencyStarted ? t.refs : (t.refs ?? []).filter(id => previewed.has(id)) };
    }).filter(t => t.refs?.length) : [];
    const carryMinutes = carry.reduce((sum, t) => sum + t.minutes, 0);
    if (trackGoal && input.availableMinutes < spent + carryMinutes) {
        const reason = `已投入及保留的新词回忆共需 ${round1(spent + carryMinutes)} 分钟，请增加总时间。`;
        return { ok: false, plan, event: event(plan, '', 'regenerate', 0, reason, now), reasons: [reason] };
    }
    const room = trackGoal ? round1(input.availableMinutes - spent - carryMinutes) : remainingBudget;
    const rebuilt = createDailyPlan({ ...input, newWordGoal: goal, now, availableMinutes: room, energy: input.energy ?? plan.energyState }, reserved, reservedDue);
    const preservedKinds = new Set(preserved.map(t => t.kind));
    const recallDone = (plan.yesterdayRecallResult as {
        status?: string;
    } | null)?.status === 'done';
    const closingDone = (plan.closingLoop as {
        status?: string;
    } | null)?.status === 'completed';
    const fresh = rebuilt.plan.initialPlan.filter(t => {
        if (trackGoal && room < PLANNER_CONFIG.budget.min) return false;
        if (trackGoal && (isNew(t) || t.kind === 'due-review')) return true;
        if (preservedKinds.has(t.kind))
            return false;
        if (t.kind === 'yesterday-recall' && recallDone)
            return false;
        if (t.kind === 'closing-recall' && closingDone)
            return false;
        return true;
    });
    const kept = [...preserved, ...carry];
    const ids = new Set(kept.map(t => t.id));
    const remap = new Map(fresh.filter(t => ids.has(t.id)).map(t => [t.id, `${t.id}:r${(plan.revision ?? 0) + 1}`]));
    for (const t of fresh) {
        t.id = remap.get(t.id) ?? t.id;
        t.dependencies = t.dependencies?.map(id => remap.get(id) ?? id);
    }
    const tasks = [...kept, ...fresh];
    if (!trackGoal) trimToBudget(tasks, totalBudget, []);
    const next: DailyPlan = {
        ...plan,
        availableMinutes: trackGoal ? input.availableMinutes : totalBudget,
        energyState: rebuilt.plan.energyState,
        initialPlan: tasks,
        status: 'active',
        completedAt: null,
        adjustments: [...plan.adjustments, { at: now, module: 'plan', deltaMinutes: round1(tasks.reduce((n, t) => n + t.minutes, 0) - (planMinutes(plan) - done.reduce((n, t) => n + t.minutes, 0))), reason: 'regenerate-remaining' }],
        budget: rebuilt.budget,
        planRequest: rebuilt.plan.planRequest,
        newWordGoal: goal,
        recovery: rebuilt.plan.recovery,
        capabilities: rebuilt.plan.capabilities,
    };
    const ev = event(next, '', 'regenerate', 0, 'regenerate-remaining-only', now);
    next.taskActions = [...(next.taskActions ?? []), ev];
    touch(next);
    syncCompletion(next);
    return { ok: true, plan: next, event: ev, reasons: ['regenerate-remaining-only', ...rebuilt.reasons] };
}
// 同目标替换候选：仍由真实词库与到期/弱词状态决定；无候选则明确返回 null。
export function buildReplacement(plan: DailyPlan, task: PlanItem, words: Word[], now: number, auth: 'legacy' | 'fsrs' = 'fsrs', sentencePool: SentenceRecord[] = []): PlanItem | null {
    if (validNewWordGoal(plan.newWordGoal) && (task.kind === 'new-preview' || task.kind === 'new-recall')) return null;
    const used = new Set(plan.initialPlan.flatMap(t => t.refs ?? []));
    if (task.module === 'sentence' || task.kind?.startsWith('sentence-')) {
        const pool = sentencePool.filter(s => task.targetGrammar?.some(g => s.grammarTags.includes(g)) && !used.has(s.id));
        if (!pool.length)
            return null;
        const picked = pool.slice().sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, Math.max(1, (task.refs ?? []).length));
        return makeTask(plan.id, task.kind ?? 'sentence-basic-structure', task.minutes, picked.map(s => s.id), {
            priority: task.priority ?? 50, critical: false, flexible: true, source: 'sentence-replace',
            reason: ['replacement-same-goal', `target-grammar-${task.targetGrammar?.join(',') ?? ''}`],
            module: 'sentence', capabilityRequired: 'sentence', targetGrammar: task.targetGrammar ?? [],
        });
    }
    let candidates: Word[] = [];
    if (task.kind === 'due-review')
        candidates = words.filter(w => w.state.total > 0 && effectiveDue(w, auth) <= now && !used.has(w.id));
    else if (task.kind === 'weak-review')
        candidates = words.filter(w => w.state.total > 0 && isWeak(w) && !used.has(w.id));
    else if (task.kind === 'new-preview' || task.kind === 'new-recall')
        candidates = words.filter(w => (isUnseen(w) || w.previewedAt > 0) && w.previewResult !== 'skip' && !used.has(w.id));
    if (!candidates.length)
        return null;
    const picked = candidates.sort((a, b) => priority(b, now) - priority(a, now)).slice(0, Math.max(1, (task.refs ?? []).length));
    return makeTask(plan.id, task.kind ?? 'micro-task', task.minutes, picked.map(w => w.id), { priority: task.priority ?? 50, critical: false, flexible: true, source: task.source ?? 'replace', reason: ['replacement-same-goal'] });
}
// 不变量：用于测试与持久化前的断言
export function assertPlanInvariants(plan: DailyPlan): void {
    const total = planMinutes(plan);
    if (total > plan.availableMinutes)
        throw Error(`计划超过可用时间：${total} > ${plan.availableMinutes}`);
    const caps = moduleCapabilities();
    for (const t of plan.initialPlan) {
        const cap = t.capabilityRequired as PlanModule | undefined;
        if (!cap || !(cap in caps))
            throw Error(`任务缺少合法 capability：${String(t.capabilityRequired)}`);
        if (!caps[cap].available)
            throw Error(`未实现的 capability 生成了任务：${cap}`);
        if (cap === 'sentence' && (!t.refs || !t.refs.length))
            throw Error(`句子任务 ${t.id} 必须绑定真实句子（不能拿空任务凑）`);
        if (t.minutes <= 0)
            throw Error(`任务 ${t.id} 的时间无效`);
    }
    if (plan.initialPlan.some(t => t.kind === 'closing-recall') && plan.initialPlan[plan.initialPlan.length - 1].kind !== 'closing-recall')
        throw Error('Closing Loop 必须是最后一个任务');
    if (plan.adjustments.some(a => !a.reason))
        throw Error('调整必须记录原因');
}
