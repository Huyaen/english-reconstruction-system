// —— Phase 7：Mini Unit 动作层（应用侧编排；app.ts 只调用这里）——
// 约束：所有写入都经 miniUnitStore 的 revision 校验；重复点击不会重复晋级/重复写证据。
import type { Data, MiniUnit, Passage, UnitCompletionEvaluation } from './types.ts';
import { applyUnitEvent, dayKind, evaluateUnit, nextDay, provenanceOf, readiness, snapshotRef, stageOf, UNIT_RULES, type UnitEvent } from './miniUnit.ts';
import { collectUnitEvidence, dayEvidenceIds } from './miniUnitEvidence.ts';
import { createUnit, saveUnit } from './miniUnitStore.ts';
import { planDay, transferEvidence, type DayPlanSpec } from './miniUnitProgression.ts';
import { recommendThemes, selectTargetGrammar, selectTargetVocabulary, type ThemeRecommendation } from './miniUnitSelection.ts';
export interface ActionResult {
    ok: boolean;
    unit?: MiniUnit;
    note?: string;
    error?: string;
}
const uid = (prefix: string) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
function baseUnit(theme: string, topic: string, why: string, now: number): MiniUnit {
    return {
        id: uid('unit'),
        theme,
        topic,
        whyRecommended: why,
        dayIndex: 0,
        anchorMaterialId: '',
        targetWords: [],
        targetGrammar: [],
        difficultyTarget: null,
        status: 'active',
        startedAt: 0,
        completedAt: null,
        dayLog: [],
        stage: 'draft',
        plannedDays: UNIT_RULES.plannedDays,
        dayHistory: [],
        grammarTargets: [],
        linkedPassageIds: [],
        linkedSentenceIds: [],
        linkedGenerationIds: [],
        linkedDailyPlanIds: [],
        createdAt: now,
        updatedAt: now,
        revision: 0,
    };
}
export async function createFromTheme(input: {
    data: Data;
    recommendation: ThemeRecommendation;
    now: number;
    availableMinutes: number;
    energy: 'low' | 'normal' | 'good';
}): Promise<ActionResult> {
    const { recommendation: rec, data, now } = input;
    const anchorId = rec.basis.materials[0]?.passageId ?? '';
    const passage = data.passages.find(p => p.id === anchorId);
    if (!passage)
        return { ok: false, error: '推荐里的材料已不存在，请刷新后重新推荐' };
    const unit = baseUnit(rec.theme, rec.topic, rec.whyRecommended, now);
    unit.anchorMaterialId = passage.id;
    unit.anchorProvenance = provenanceOf(passage);
    unit.anchorSnapshotRef = snapshotRef(passage);
    unit.anchorTitle = passage.title;
    unit.linkedPassageIds = [passage.id];
    const words = rec.targetWords.map(w => w.word);
    const grammar = rec.targetGrammar;
    unit.targetWords = words;
    unit.targetGrammar = grammar.map(g => g.conceptId);
    unit.grammarTargets = grammar;
    unit.difficultyTarget = Math.round(rec.estimatedDifficulty * 100);
    unit.plannedDays = Math.min(UNIT_RULES.maxDays, Math.max(2, rec.estimatedLearningDays));
    unit.stage = readiness(unit).ok ? 'ready' : 'draft';
    unit.status = 'active';
    try {
        const saved = await createUnit(unit);
        return { ok: true, unit: saved, note: `已创建 ${saved.theme}（Anchor：${passage.title}）` };
    }
    catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}
export async function createCustomDraft(input: {
    data: Data;
    topic: string;
    now: number;
    passageId?: string;
}): Promise<ActionResult> {
    const topic = input.topic.trim();
    if (!topic)
        return { ok: false, error: '请先写一个主题' };
    const unit = baseUnit(topic, topic, '用户自定义主题', input.now);
    const passage = input.passageId ? input.data.passages.find(p => p.id === input.passageId) : undefined;
    if (passage) {
        unit.anchorMaterialId = passage.id;
        unit.anchorProvenance = provenanceOf(passage);
        unit.anchorSnapshotRef = snapshotRef(passage);
        unit.anchorTitle = passage.title;
        unit.linkedPassageIds = [passage.id];
        const words = selectTargetVocabulary({ passage, words: input.data.words, now: input.now, availableMinutes: 45 });
        unit.targetWords = words.words.map(w => w.word);
        const grammar = selectTargetGrammar({ passages: [passage], grammar: input.data.grammarConcepts });
        unit.targetGrammar = grammar.map(g => g.conceptId);
        unit.grammarTargets = grammar;
    }
    unit.stage = readiness(unit).ok ? 'ready' : 'draft';
    try {
        const saved = await createUnit(unit);
        return { ok: true, unit: saved, note: readiness(saved).ok ? '草稿已就绪：已绑定真实材料与目标' : '草稿已创建：还需要真实 Anchor 材料' };
    }
    catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}
export async function attachAnchor(input: {
    data: Data;
    unit: MiniUnit;
    passageId: string;
    now: number;
}): Promise<ActionResult> {
    const passage = input.data.passages.find(p => p.id === input.passageId);
    if (!passage)
        return { ok: false, error: '材料不存在' };
    if (passage.sourceType === 'ai' || passage.sourceType === 'ai_reinforcement')
        return { ok: false, error: 'AI 生成材料不能作为 Anchor，只能作为强化材料' };
    const provenance = provenanceOf(passage);
    // 绑定 Anchor 时同时给出目标词 / 语法（基于真实材料与你的词库）
    const words = selectTargetVocabulary({ passage, words: input.data.words, now: input.now, availableMinutes: 45 });
    const grammar = selectTargetGrammar({ passages: [passage], grammar: input.data.grammarConcepts });
    const t1 = applyUnitEvent(input.unit, { type: 'attach-anchor', passageId: passage.id, provenance, snapshotRef: snapshotRef(passage), title: passage.title, now: input.now });
    if (!t1.ok)
        return { ok: false, error: t1.detail };
    const t2 = applyUnitEvent(t1.unit, { type: 'set-targets', words: words.words.map(w => w.word), grammar, difficulty: passage.estimatedDifficulty ? Math.round(passage.estimatedDifficulty * 100) : null, now: input.now });
    if (!t2.ok)
        return { ok: false, error: t2.detail };
    const saved = await saveUnit(t2.unit, input.unit.revision ?? 0);
    return {
        ok: true,
        unit: saved,
        note: `已绑定《${passage.title}》：${words.words.length} 个目标词、${grammar.length} 个目标语法${words.uncovered.length ? `；词库未覆盖 ${words.uncovered.length} 个高频生词` : ''}`,
    };
}
async function apply(unit: MiniUnit, event: UnitEvent): Promise<ActionResult> {
    const t = applyUnitEvent(unit, event);
    if (!t.ok)
        return { ok: false, error: t.detail };
    if (t.kind === 'noop')
        return { ok: true, unit, note: t.note };
    const saved = await saveUnit(t.unit, unit.revision ?? 0);
    return { ok: true, unit: saved, note: t.note };
}
export function todaySpec(data: Data, unit: MiniUnit, availableMinutes: number, energy: 'low' | 'normal' | 'good'): DayPlanSpec {
    return planDay({ unit, day: nextDay(unit), availableMinutes, energy, data });
}
export async function startToday(unit: MiniUnit, now: number): Promise<ActionResult> {
    return apply(unit, { type: 'start', now });
}
/** 完成今天：必须先有真实活动证据（打开页面不算） */
export async function completeToday(input: {
    data: Data;
    unit: MiniUnit;
    now: number;
    summary: string;
}): Promise<ActionResult> {
    const day = nextDay(input.unit);
    const evidenceIds = dayEvidenceIds(input.data, input.unit, day);
    if (!evidenceIds.length)
        return { ok: false, error: '今天还没有真实学习记录（作答/精读/阅读会话）：先完成至少一项训练，再标记完成' };
    const covered = coveredWordsToday(input.data, input.unit, day);
    const summary = input.summary.trim() || buildSummary(input.unit, day, covered, evidenceIds.length);
    const t = applyUnitEvent(input.unit, { type: 'complete-day', day, calendarDate: localDate(input.now), summary, evidenceIds, wordsCovered: covered, now: input.now });
    if (!t.ok)
        return { ok: false, error: t.detail };
    if (t.kind === 'noop')
        return { ok: true, unit: input.unit, note: t.note };
    let saved = await saveUnit(t.unit, input.unit.revision ?? 0);
    // Day 1 结束时，把真实的冷测会话固化为基线（只在有真实冷测证据时）
    if (day === 1 && !saved.baseline) {
        const cold = coldSession(input.data, saved);
        if (cold) {
            const next = { ...saved, baseline: cold };
            saved = await saveUnit(next, saved.revision ?? 0);
        }
    }
    // Day 3 结束时，从真实新材料会话生成迁移记录（没有就不写，不伪造）
    if (day === 3 && !saved.transfer) {
        const t3 = transferFromSessions(input.data, saved);
        if (t3) {
            const next = { ...saved, transfer: t3 };
            saved = await saveUnit(next, saved.revision ?? 0);
        }
    }
    return { ok: true, unit: saved, note: `Day ${day} 完成：${evidenceIds.length} 条真实证据` };
}
/** 真实冷测：必须来自 Anchor 的 cold-test 证据，且发生在辅助之前 */
function coldSession(data: Data, unit: MiniUnit) {
    const rows = data.readingSessions
        .filter(s => s.passageId === unit.anchorMaterialId && s.at >= (unit.startedAt || 0))
        .sort((a, b) => a.at - b.at);
    for (const s of rows) {
        const cold = s.detail?.evidence.find(e => e.type === 'cold-baseline');
        if (!cold && s.detail?.coldTestDone !== true)
            continue;
        const comprehension = typeof cold?.value === 'number' ? cold.value : null;
        return {
            at: s.at,
            passageId: s.passageId,
            sessionId: s.id,
            source: 'cold_test' as const,
            unknownRate: s.unknownRate ?? null,
            comprehension,
            wordCount: s.wordCount ?? 0,
        };
    }
    return null;
}
/** 迁移：必须是与 Anchor 不同的真实材料，且没有用过辅助 */
function transferFromSessions(data: Data, unit: MiniUnit) {
    const rows = data.readingSessions
        .filter(s => s.passageId !== unit.anchorMaterialId && s.at >= (unit.startedAt || 0))
        .filter(s => {
        const p = data.passages.find(x => x.id === s.passageId);
        return !!p && p.sourceType !== 'ai' && p.sourceType !== 'ai_reinforcement';
    })
        .sort((a, b) => a.at - b.at);
    const s = rows[rows.length - 1];
    if (!s)
        return null;
    const comprehension = s.secondPassComprehension ?? s.firstPassComprehension ?? null;
    const helped = (s.detail?.helps.length ?? 0) > 0;
    const ev = collectUnitEvidence(data, unit);
    return transferEvidence({
        unit,
        passage: data.passages.find(p => p.id === s.passageId),
        sessionId: s.id,
        at: s.at,
        comprehension,
        independent: !helped,
        targetWordRecall: ev.independentRecall,
        grammarObserved: ev.grammar.some(g => g.correct > 0),
    });
}
function coveredWordsToday(data: Data, unit: MiniUnit, day: number): string[] {
    const since = (unit.dayHistory ?? []).filter(d => d.day < day).sort((a, b) => b.day - a.day)[0]?.at ?? unit.startedAt ?? 0;
    const targetEn = new Map(unit.targetWords.map(w => [w.toLowerCase(), w]));
    const out = new Set<string>();
    for (const r of data.records) {
        if (r.at < since || r.reason !== 'answer')
            continue;
        const w = data.words.find(x => x.id === r.wordId);
        if (w && targetEn.has(w.en.toLowerCase()))
            out.add(targetEn.get(w.en.toLowerCase())!);
    }
    for (const e of data.wordExposures) {
        if (e.at < since)
            continue;
        const w = data.words.find(x => x.id === e.wordId);
        if (w && targetEn.has(w.en.toLowerCase()))
            out.add(targetEn.get(w.en.toLowerCase())!);
    }
    return [...out];
}
function buildSummary(unit: MiniUnit, day: number, covered: string[], evidence: number): string {
    const kind = dayKind(day);
    const head = kind === 'build' ? '建立理解' : kind === 'strengthen' ? '强化' : kind === 'transfer' ? '迁移' : '额外强化';
    return `${head}：覆盖 ${covered.length}/${unit.targetWords.length} 个目标词，${evidence} 条证据`;
}
export function localDate(at: number): string {
    const d = new Date(at);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export async function pauseUnit(unit: MiniUnit, reason: string, now: number): Promise<ActionResult> {
    return apply(unit, { type: 'pause', reason, now });
}
export async function resumeUnit(unit: MiniUnit, now: number): Promise<ActionResult> {
    return apply(unit, { type: 'resume', now });
}
export async function extendUnit(unit: MiniUnit, reason: string, now: number): Promise<ActionResult> {
    return apply(unit, { type: 'extend', reason, now });
}
export async function abandonUnit(unit: MiniUnit, reason: string, now: number): Promise<ActionResult> {
    return apply(unit, { type: 'abandon', reason, now });
}
/** 结束并评估：评估只看真实证据；缺真实迁移证据会自动降级为 limited_evidence */
export async function finishUnit(input: {
    data: Data;
    unit: MiniUnit;
    now: number;
    decision?: UnitCompletionEvaluation['decision'];
}): Promise<ActionResult> {
    const ev = collectUnitEvidence(input.data, input.unit);
    const evaluation = evaluateUnit(input.unit, ev, input.now);
    const decision = input.decision ?? evaluation.decision;
    const final: UnitCompletionEvaluation = decision === evaluation.decision
        ? evaluation
        : { ...evaluation, decision, reasons: [...evaluation.reasons, `用户选择：${decision === 'user_ended' ? '现在结束' : decision}`] };
    const t = applyUnitEvent(input.unit, { type: 'finish', evaluation: final, now: input.now });
    if (!t.ok)
        return { ok: false, error: t.detail };
    const saved = await saveUnit(t.unit, input.unit.revision ?? 0);
    return { ok: true, unit: saved, note: `单元结束：${saved.completionEvaluation?.decision}（置信度 ${saved.completionEvaluation?.confidence}）` };
}
/** Day 1 冷测基线：只有真实冷测（辅助前）才写入；估计值单独标 estimated */
export async function recordBaseline(input: {
    unit: MiniUnit;
    passageId: string;
    sessionId: string;
    source: 'cold_test' | 'estimated';
    unknownRate: number | null;
    comprehension: number | null;
    wordCount: number;
    now: number;
}): Promise<ActionResult> {
    if (input.unit.baseline && input.source === 'estimated')
        return { ok: true, unit: input.unit, note: '已有真实基线，忽略估计值' };
    const next: MiniUnit = {
        ...input.unit,
        baseline: {
            at: input.now,
            passageId: input.passageId,
            sessionId: input.sessionId,
            source: input.source,
            unknownRate: input.unknownRate,
            comprehension: input.comprehension,
            wordCount: input.wordCount,
        },
    };
    const saved = await saveUnit(next, input.unit.revision ?? 0);
    return { ok: true, unit: saved, note: input.source === 'cold_test' ? '已记录真实冷测基线' : '已记录估计基线（不是冷测结果）' };
}
/** Day 3 迁移记录：新材料 + 独立完成才算 authentic transfer */
export async function recordTransfer(input: {
    unit: MiniUnit;
    data: Data;
    passageId: string;
    sessionId: string;
    comprehension: number | null;
    independent: boolean;
    grammarObserved: boolean;
    now: number;
}): Promise<ActionResult> {
    const passage: Passage | undefined = input.data.passages.find(p => p.id === input.passageId);
    const ev = collectUnitEvidence(input.data, input.unit);
    const transfer = transferEvidence({
        unit: input.unit,
        passage,
        sessionId: input.sessionId,
        at: input.now,
        comprehension: input.comprehension,
        independent: input.independent,
        targetWordRecall: ev.independentRecall,
        grammarObserved: input.grammarObserved,
    });
    const next: MiniUnit = { ...input.unit, transfer };
    const saved = await saveUnit(next, input.unit.revision ?? 0);
    const kind = transfer.materialKind === 'authentic' && transfer.independent ? '真实迁移' : 'AI/有辅助的迁移练习';
    return { ok: true, unit: saved, note: `已记录迁移：${kind}` };
}
/** AI 复用键写进 sourceMetadata.unitReuseKey，避免刷新/重规划重复扣费 */
export function aiMetadata(unit: MiniUnit, day: number, promptVersion: string): Record<string, string> {
    return { miniUnitId: unit.id, dayIndex: String(day), unitReuseKey: `${unit.id}|d${day}|${unit.targetWords.slice().sort().join(',')}|${unit.targetGrammar.slice().sort().join(',')}|${promptVersion}` };
}
/** 给 Planner 的 miniUnit 投影：只带真实存在的目标与材料，不伪造 */
export function plannerProjection(unit: MiniUnit): MiniUnit {
    return {
        ...unit,
        targetWords: unit.targetWords,
        targetGrammar: unit.targetGrammar,
    };
}
export function unitRecommendations(data: Data, now: number, availableMinutes: number) {
    return recommendThemes({ passages: data.passages, words: data.words, grammar: data.grammarConcepts, units: data.miniUnits, now, availableMinutes });
}
export function stageOfUnit(unit: MiniUnit) {
    return stageOf(unit);
}
