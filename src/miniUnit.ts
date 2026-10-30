// —— Phase 7：单元 状态机与推进规则（纯函数，无 IO / 无 DOM）——
// 设计约束：
// 1) 旧字段 status（active/completed/extended/abandoned）保持不变，备份兼容；
//    stage 只做细粒度表达，写入时两者保持一致。
// 2) 所有转换都有前置条件；重复事件幂等（不重复写 dayLog/证据）。
// 3) 完成判定必须基于真实记录；缺证据时只能降级为 limited_evidence。
import type { AnchorProvenance, MiniUnit, MiniUnitDayRecord, MiniUnitStage, Passage, UnitCompletionEvaluation, UnitCompletionMetrics, UnitDayKind, UnitEvidenceSummary, UnitSupportLevel } from './types.ts';
export const UNIT_RULES = {
    plannedDays: 3,
    maxDays: 4,
    /** 每个学习日至少需要的真实活动证据条数（防止“打开即完成”） */
    minEvidencePerDay: 1,
    /** Day 2 提前完成的硬门槛 */
    earlyCompletion: {
        minIndependentRecall: 3,
        minGrammarEvidence: 1,
        minComprehension: 0.6,
        requiresAuthenticTransfer: true,
    },
    /** 完成后判定 verified 的门槛 */
    verified: {
        minIndependentRecall: 3,
        minWordsCoveredRatio: 0.5,
        minTransferComprehension: 0.5,
        maxTranslationDependence: 0.6,
    },
    targetWords: { min: 3, max: 18, perReadingMinute: 0.35 },
} as const;
export type UnitEvent = {
    type: 'attach-anchor';
    passageId: string;
    provenance: AnchorProvenance;
    snapshotRef: string;
    title: string;
    now: number;
} | {
    type: 'set-targets';
    words: string[];
    grammar: {
        conceptId: string;
        name: string;
        status: 'verified' | 'candidate';
        evidence: string;
    }[];
    difficulty: number | null;
    now: number;
} | {
    type: 'start';
    now: number;
} | {
    type: 'complete-day';
    day: number;
    calendarDate: string;
    summary: string;
    evidenceIds: string[];
    wordsCovered: string[];
    now: number;
} | {
    type: 'pause';
    reason: string;
    now: number;
} | {
    type: 'resume';
    now: number;
} | {
    type: 'extend';
    reason: string;
    now: number;
} | {
    type: 'finish';
    evaluation: UnitCompletionEvaluation;
    now: number;
} | {
    type: 'abandon';
    reason: string;
    now: number;
};
export type UnitTransition = {
    ok: true;
    unit: MiniUnit;
    kind: 'applied' | 'noop';
    note: string;
} | {
    ok: false;
    error: 'invalid-transition' | 'not-ready' | 'duplicate-day' | 'out-of-order' | 'missing-evidence' | 'needs-transfer' | 'unit-closed';
    detail: string;
};
export function stageOf(unit: MiniUnit): MiniUnitStage {
    if (unit.stage)
        return unit.stage;
    // 旧记录没有 stage：由 status + dayIndex 推导
    if (unit.status === 'abandoned')
        return 'abandoned';
    if (unit.status === 'completed')
        return 'completed';
    if (unit.anchorMaterialId && unit.targetWords.length)
        return unit.dayIndex > 0 ? 'active' : 'ready';
    return 'draft';
}
export function isOpen(unit: MiniUnit): boolean {
    const s = stageOf(unit);
    return s === 'draft' || s === 'ready' || s === 'active' || s === 'paused';
}
export function dayKind(day: number): UnitDayKind {
    if (day <= 1)
        return 'build';
    if (day === 2)
        return 'strengthen';
    if (day === 3)
        return 'transfer';
    return 'reinforce';
}
export function supportLevelFor(day: number): UnitSupportLevel {
    if (day <= 1)
        return 'high';
    if (day === 2)
        return 'medium';
    return 'low';
}
export function dayLabel(day: number): string {
    const kind = dayKind(day);
    const name = kind === 'build' ? '建立理解' : kind === 'strengthen' ? '强化' : kind === 'transfer' ? '迁移' : '额外强化';
    return `Day ${day} · ${name}`;
}
/** 下一个要进行的单元日（1 起）；已完成的天数 = dayHistory 中不同的 day 数 */
export function completedDays(unit: MiniUnit): number[] {
    const seen = new Set<number>();
    for (const d of unit.dayHistory ?? [])
        seen.add(d.day);
    for (const d of unit.dayLog ?? [])
        seen.add(d.day);
    return [...seen].sort((a, b) => a - b);
}
export function nextDay(unit: MiniUnit): number {
    const done = new Set(completedDays(unit));
    let day = 1;
    while (done.has(day) && day < UNIT_RULES.maxDays)
        day++;
    return done.has(day) ? UNIT_RULES.maxDays : day;
}
export function plannedDays(unit: MiniUnit): number {
    return unit.plannedDays ?? UNIT_RULES.plannedDays;
}
/** Ready 的硬条件：你自己的材料 + 目标词 + 目标语法（没有这些就不是可执行的 Unit） */
export function readiness(unit: MiniUnit): {
    ok: boolean;
    missing: string[];
} {
    const missing: string[] = [];
    if (!unit.anchorMaterialId)
        missing.push('缺少你自己的材料 材料');
    if (unit.anchorProvenance === 'ai_generated')
        missing.push('AI 生成材料不能作为 材料');
    if (!unit.targetWords.length)
        missing.push('缺少目标词汇');
    if (!(unit.grammarTargets?.length ?? unit.targetGrammar.length))
        missing.push('缺少目标语法');
    return { ok: missing.length === 0, missing };
}
const clone = (unit: MiniUnit): MiniUnit => ({
    ...unit,
    targetWords: [...unit.targetWords],
    targetGrammar: [...unit.targetGrammar],
    dayLog: (unit.dayLog ?? []).map(d => ({ ...d })),
    dayHistory: (unit.dayHistory ?? []).map(d => ({ ...d, evidenceIds: [...d.evidenceIds], targetWordsCovered: [...d.targetWordsCovered] })),
    grammarTargets: (unit.grammarTargets ?? []).map(g => ({ ...g })),
    linkedPassageIds: [...(unit.linkedPassageIds ?? [])],
    linkedSentenceIds: [...(unit.linkedSentenceIds ?? [])],
    linkedGenerationIds: [...(unit.linkedGenerationIds ?? [])],
    linkedDailyPlanIds: [...(unit.linkedDailyPlanIds ?? [])],
});
function bump(unit: MiniUnit, now: number): MiniUnit {
    unit.updatedAt = now;
    unit.revision = (unit.revision ?? 0) + 1;
    return unit;
}
export function applyUnitEvent(unit: MiniUnit, event: UnitEvent): UnitTransition {
    if (!isOpen(unit) && event.type !== 'pause')
        return { ok: false, error: 'unit-closed', detail: `单元已结束（${stageOf(unit)}）` };
    const stage = stageOf(unit);
    switch (event.type) {
        case 'attach-anchor': {
            if (event.provenance === 'ai_generated')
                return { ok: false, error: 'missing-evidence', detail: 'AI 生成材料只能作为强化材料，不能作为 材料' };
            const next = clone(unit);
            next.anchorMaterialId = event.passageId;
            next.anchorProvenance = event.provenance;
            next.anchorSnapshotRef = event.snapshotRef;
            next.anchorTitle = event.title;
            next.linkedPassageIds = [...new Set([...(next.linkedPassageIds ?? []), event.passageId])];
            next.stage = readiness(next).ok ? 'ready' : 'draft';
            next.status = 'active';
            return { ok: true, unit: bump(next, event.now), kind: 'applied', note: '已绑定你自己的材料' };
        }
        case 'set-targets': {
            const next = clone(unit);
            next.targetWords = [...new Set(event.words.map(w => w.trim()).filter(Boolean))].slice(0, UNIT_RULES.targetWords.max);
            next.targetGrammar = event.grammar.map(g => g.conceptId);
            next.grammarTargets = event.grammar.map(g => ({ ...g }));
            next.difficultyTarget = event.difficulty;
            next.stage = readiness(next).ok ? 'ready' : 'draft';
            next.status = 'active';
            return { ok: true, unit: bump(next, event.now), kind: 'applied', note: '目标已更新' };
        }
        case 'start': {
            if (stage !== 'ready' && stage !== 'active' && stage !== 'paused')
                return { ok: false, error: 'not-ready', detail: `当前阶段 ${stage} 不能开始学习日` };
            const ready = readiness(unit);
            if (!ready.ok)
                return { ok: false, error: 'not-ready', detail: ready.missing.join('；') };
            const next = clone(unit);
            next.stage = 'active';
            next.status = 'active';
            if (!next.startedAt)
                next.startedAt = event.now;
            return { ok: true, unit: bump(next, event.now), kind: 'applied', note: `进入 ${dayLabel(nextDay(next))}` };
        }
        case 'complete-day': {
            if (stage !== 'active')
                return { ok: false, error: 'invalid-transition', detail: `只有进行中的单元可以完成学习日（当前 ${stage}）` };
            const done = completedDays(unit);
            if (done.includes(event.day))
                return { ok: true, unit, kind: 'noop', note: `Day ${event.day} 已完成（幂等，不重复记录）` };
            const expected = nextDay(unit);
            if (event.day !== expected)
                return { ok: false, error: 'out-of-order', detail: `应按顺序完成：当前应完成 Day ${expected}` };
            if (event.evidenceIds.length < UNIT_RULES.minEvidencePerDay)
                return { ok: false, error: 'missing-evidence', detail: '没有真实学习活动，不能算完成一天' };
            const record: MiniUnitDayRecord = {
                day: event.day,
                kind: dayKind(event.day),
                calendarDate: event.calendarDate,
                at: event.now,
                summary: event.summary,
                supportLevel: supportLevelFor(event.day),
                evidenceIds: [...new Set(event.evidenceIds)],
                targetWordsCovered: [...new Set(event.wordsCovered)],
            };
            const next = clone(unit);
            next.dayHistory = [...(next.dayHistory ?? []), record];
            next.dayLog = [...(next.dayLog ?? []), { day: event.day, at: event.now, summary: event.summary }];
            next.dayIndex = event.day;
            next.stage = 'active';
            next.status = 'active';
            if (event.day >= UNIT_RULES.maxDays)
                next.stage = 'active';
            return { ok: true, unit: bump(next, event.now), kind: 'applied', note: `Day ${event.day} 已完成` };
        }
        case 'pause': {
            if (stage !== 'active' && stage !== 'ready')
                return { ok: false, error: 'invalid-transition', detail: `当前阶段 ${stage} 不能暂停` };
            const next = clone(unit);
            next.stage = 'paused';
            next.pausedReason = event.reason;
            next.status = 'active';
            return { ok: true, unit: bump(next, event.now), kind: 'applied', note: '已暂停' };
        }
        case 'resume': {
            if (stage !== 'paused')
                return { ok: false, error: 'invalid-transition', detail: '只有已暂停的单元可以继续' };
            const next = clone(unit);
            next.stage = 'active';
            next.pausedReason = '';
            next.status = 'active';
            return { ok: true, unit: bump(next, event.now), kind: 'applied', note: `继续 ${dayLabel(nextDay(next))}` };
        }
        case 'extend': {
            if (completedDays(unit).length < UNIT_RULES.plannedDays)
                return { ok: false, error: 'invalid-transition', detail: '完成 3 个学习日后才需要延长' };
            if ((unit.plannedDays ?? UNIT_RULES.plannedDays) >= UNIT_RULES.maxDays)
                return { ok: true, unit, kind: 'noop', note: '已经是 Day 4 上限' };
            const next = clone(unit);
            next.plannedDays = UNIT_RULES.maxDays;
            next.stage = 'active';
            next.status = 'extended';
            return { ok: true, unit: bump(next, event.now), kind: 'applied', note: `已延长到 Day ${UNIT_RULES.maxDays}：${event.reason}` };
        }
        case 'finish': {
            const next = clone(unit);
            const evalResult = event.evaluation;
            // 硬闸：没有真实迁移证据就不能宣称 verified
            const guarded = guardDecision(unit, evalResult);
            next.completionEvaluation = guarded;
            next.stage = 'completed';
            next.status = guarded.decision === 'extended' ? 'extended' : 'completed';
            next.completedAt = event.now;
            return { ok: true, unit: bump(next, event.now), kind: 'applied', note: `单元结束：${guarded.decision}` };
        }
        case 'abandon': {
            const next = clone(unit);
            next.stage = 'abandoned';
            next.status = 'abandoned';
            next.completedAt = event.now;
            next.completionEvaluation = {
                at: event.now,
                decision: 'abandoned',
                confidence: 'low',
                reasons: [event.reason || '用户放弃'],
                evidenceRefs: [],
                nextActions: ['可以从阅读库重新选择材料，开启新的 单元'],
                metrics: emptyMetrics(unit),
            };
            return { ok: true, unit: bump(next, event.now), kind: 'applied', note: '已放弃' };
        }
    }
}
/** 完成判定闸门：把“记录不够”的 verified 降级，绝不伪造掌握 */
export function guardDecision(unit: MiniUnit, evaluation: UnitCompletionEvaluation): UnitCompletionEvaluation {
    if (evaluation.decision !== 'completed_verified')
        return evaluation;
    const t = unit.transfer;
    const authenticTransfer = !!t && t.independent && t.materialKind === 'authentic' && (t.comprehension ?? 0) >= UNIT_RULES.verified.minTransferComprehension;
    if (authenticTransfer)
        return evaluation;
    return {
        ...evaluation,
        decision: 'completed_limited_evidence',
        confidence: 'low',
        reasons: [...evaluation.reasons, '缺少真实新材料的换场景练习的记录：只标为记录有限的完成，不算验证通过'],
        nextActions: [...evaluation.nextActions, '补一篇同主题真实文章做一次独立迁移，再重新评估'],
    };
}
function emptyMetrics(unit: MiniUnit): UnitCompletionMetrics {
    return {
        targetWordsCovered: 0,
        targetWordTotal: unit.targetWords.length,
        independentRecallEvidence: 0,
        forgottenWords: [],
        grammarEvidence: 0,
        anchorColdResult: null,
        supportedResult: null,
        transferResult: null,
        supportReduction: 0,
        translationDependence: 0,
        unresolvedObstacles: [],
        completedLearningDays: completedDays(unit).length,
    };
}
/** Day 2 提前完成：必须有换场景练习的记录，否则只是“想结束” */
export function earlyCompletionCheck(unit: MiniUnit, ev: UnitEvidenceSummary): {
    allowed: boolean;
    reasons: string[];
} {
    const reasons: string[] = [];
    const r = UNIT_RULES.earlyCompletion;
    if (ev.independentRecall < r.minIndependentRecall)
        reasons.push(`自己想起来的记录不足（${ev.independentRecall}/${r.minIndependentRecall} 个目标词）`);
    if (ev.grammar.filter(g => g.independent).length < r.minGrammarEvidence)
        reasons.push('目标语法缺少自己作答的记录');
    const comprehension = ev.supported?.comprehension ?? null;
    if (comprehension === null || comprehension < r.minComprehension)
        reasons.push(`支持后理解度未达标（${comprehension === null ? '无记录' : Math.round(comprehension * 100) + '%'}）`);
    const t = unit.transfer;
    if (!t || !t.independent)
        reasons.push('还没有换场景练习的记录');
    if (t && t.materialKind !== 'authentic')
        reasons.push('迁移材料是 AI 强化材料，不能作为真实迁移依据');
    return { allowed: reasons.length === 0, reasons };
}
/** 完成评价：只根据真实记录算；缺证据 → confidence=low，不臆测 */
export function evaluateUnit(unit: MiniUnit, ev: UnitEvidenceSummary, now: number): UnitCompletionEvaluation {
    const targetTotal = unit.targetWords.length || ev.targetWordTotal;
    const covered = ev.wordsCovered.length;
    const independent = ev.independentRecall;
    const cold = ev.cold?.comprehension ?? null;
    const supported = ev.supported?.comprehension ?? null;
    const transfer = unit.transfer?.comprehension ?? null;
    const grammarIndependent = ev.grammar.filter(g => g.independent).length;
    const metrics: UnitCompletionMetrics = {
        targetWordsCovered: covered,
        targetWordTotal: targetTotal,
        independentRecallEvidence: independent,
        forgottenWords: [...ev.forgottenWords],
        grammarEvidence: grammarIndependent,
        anchorColdResult: cold,
        supportedResult: supported,
        transferResult: transfer,
        supportReduction: ev.supportReduction,
        translationDependence: ev.translationDependence,
        unresolvedObstacles: [...ev.obstacles],
        completedLearningDays: completedDays(unit).length,
    };
    const reasons: string[] = [];
    const nextActions: string[] = [];
    const ratio = targetTotal ? covered / targetTotal : 0;
    const v = UNIT_RULES.verified;
    let verifiedOk = true;
    if (independent < v.minIndependentRecall) {
        verifiedOk = false;
        reasons.push(`自己想起来的记录偏少（${independent} 个目标词）`);
        nextActions.push('对剩余目标词做一次独立回忆（不借助中文释义）');
    }
    if (ratio < v.minWordsCoveredRatio) {
        verifiedOk = false;
        reasons.push(`目标词覆盖不足（${covered}/${targetTotal}）`);
        nextActions.push('把未出现的目标词放进下一天的计划');
    }
    const authenticTransfer = !!unit.transfer && unit.transfer.independent && unit.transfer.materialKind === 'authentic';
    if (!authenticTransfer) {
        verifiedOk = false;
        reasons.push('缺少真实新材料的换场景练习的记录');
        nextActions.push('用同主题的另一篇真实文章做一次独立理解');
    }
    if (ev.translationDependence > v.maxTranslationDependence) {
        verifiedOk = false;
        reasons.push('中文辅助依赖偏高');
        nextActions.push('下一次阅读先不看中文，再回看');
    }
    if (ev.obstacles.length) {
        reasons.push(`仍有未解决障碍：${ev.obstacles.slice(0, 3).join('、')}`);
        nextActions.push('针对这些障碍安排一次针对性练习');
    }
    if (verifiedOk) {
        reasons.push('目标词有自己想起来的记录，目标语法有独立作答，真实新材料迁移完成');
        nextActions.push('进入下一个主题，或把本单元标为已完成');
    }
    const decision = verifiedOk ? 'completed_verified' : 'completed_limited_evidence';
    let confidence: UnitCompletionEvaluation['confidence'] = 'low';
    if (verifiedOk && independent >= v.minIndependentRecall + 2 && ev.grammar.length >= 2)
        confidence = 'high';
    else if (verifiedOk || (independent >= 2 && covered >= Math.ceil(targetTotal * 0.4)))
        confidence = 'medium';
    return { at: now, decision, confidence, reasons, evidenceRefs: ev.refs.map(r => r.id), nextActions, metrics };
}
/** 材料 是否适合本单元：真实材料 + 长度/难度可控；AI 材料只允许作为强化材料 */
export function anchorSuitability(passage: Passage, report: {
    difficulty: number;
    knownCoverage: number;
    estimatedMinor?: number;
    classification: string;
    estimatedMinutes: number;
} | null): {
    ok: boolean;
    provenance: AnchorProvenance;
    reasons: string[];
    recommendedDays: number;
} {
    const reasons: string[] = [];
    const provenance = provenanceOf(passage);
    if (provenance === 'ai_generated')
        return { ok: false, provenance, reasons: ['AI 生成材料不能作为 材料，只能作为强化材料'], recommendedDays: 0 };
    if (passage.wordCount > 1200) {
        reasons.push(`材料偏长（${passage.wordCount} 词），建议拆分或改用更短的一篇`);
    }
    if (report && report.classification === 'too-hard')
        reasons.push('对当前水平过难：需要更多辅助，或换更短更简单的材料');
    if (!report)
        reasons.push('缺少难度分析：先导入真实材料，系统会重新估计');
    const ok = passage.wordCount >= 80 && (!report || report.classification !== 'too-hard');
    const recommendedDays = !report ? 3 : report.classification === 'comfort' ? 2 : 3;
    return { ok, provenance, reasons, recommendedDays };
}
export function provenanceOf(passage: Passage): AnchorProvenance {
    switch (passage.sourceType) {
        case 'import':
        case 'image':
        case 'uploaded_image':
        case 'uploaded_file':
        case 'pasted_text':
        case 'library_item':
            return 'user_imported_authentic';
        case 'url':
        case 'web_article':
            return 'authentic_external';
        case 'recommended':
        case 'curated_real_material':
            return 'curated_authentic';
        case 'ai':
        case 'ai_reinforcement':
            return 'ai_generated';
        default:
            return passage.sourceUrl ? 'authentic_external' : 'unknown';
    }
}
/** 目标词数量：按可用时间与阅读难度动态决定，绝不固定 30 个 */
export function targetWordBudget(input: {
    availableMinutes: number;
    difficulty: number;
    dueLoad?: number;
    energy?: 'low' | 'normal' | 'good';
}): number {
    const minutes = Math.max(10, input.availableMinutes);
    const base = minutes * UNIT_RULES.targetWords.perReadingMinute * (1.1 - Math.min(1, Math.max(0, input.difficulty)));
    const duePenalty = Math.min(0.4, (input.dueLoad ?? 0) / 100);
    const energyFactor = input.energy === 'low' ? 0.7 : input.energy === 'good' ? 1.1 : 1;
    const n = Math.round(base * (1 - duePenalty) * energyFactor);
    return Math.max(UNIT_RULES.targetWords.min, Math.min(UNIT_RULES.targetWords.max, n));
}
export function snapshotRef(passage: Passage): string {
    return `${passage.id}#${passage.contentHash ?? `${passage.wordCount}w`}`;
}
