// —— Phase 4：Sentence Evidence Service ——
// 设计依据：PROJECT_SPEC §13（证据模型）、§68（多证据掌握）；文本 §13。
// 纪律：
//   1) 同一 attempt 不重复写入（幂等 key 保护）。
//   2) "看过答案"（辅助级别 ≥3）与"提示后正确"不产生掌握证据，只计 exposure。
//   3) 迁移 / 延迟保持是强证据；所有概念概率仍是 BKT-lite 估算值。
import type { GrammarAttempt, GrammarConcept, SentenceAttempt, SentenceEvidenceClass, SentenceSourceType, SentenceStepRecord, SentenceStructureProvenance } from './types.ts';
import { GRAMMAR_CONFIG, GRAMMAR_TAXONOMY, bktUpdate, grammarState, type GrammarConceptDef } from './grammar.ts';
import { countsTowardMastery, evidenceClass, maxSupportLevel, type LabStep, type StepEvaluation } from './sentenceLab.ts';
import type { StructureTrust } from './sentenceTrust.ts';
export interface AttemptDraft {
    sentenceId: string;
    sentence: string;
    sourceType: SentenceSourceType;
    sourceId: string;
    targetWords: string[];
    grammarConceptIds: string[];
    steps: SentenceStepRecord[];
    durationMs: number;
    sessionId: string;
    meaningCorrect: boolean | null;
    translationDependence: number;
    transferOf: string | null;
    delayed: boolean;
    /**
     * Phase 16.3：这句的结构可信度。
     * 缺省按 'unverified' 处理——没声明核验过，就不许拿它给语法计分。
     */
    structureTrust?: StructureTrust;
    structureProvenance?: SentenceStructureProvenance;
}
export interface EvidenceApplyResult {
    concepts: GrammarConcept[];
    grammarAttempts: GrammarAttempt[];
    attempt: SentenceAttempt;
    evidenceClass: SentenceEvidenceClass;
    countsTowardMastery: boolean;
    updatedConceptIds: string[];
    duplicate: boolean;
    /** 为什么这次没算掌握（only when countsTowardMastery === false） */
    ineligibleReason?: 'support-too-high' | 'structure-unverified';
}
const uid = (prefix: string, now: number) => `${prefix}-${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
// 幂等 key：同一句 + 同一会话 + 同一批步骤在短时间内只写一次
export function attemptKey(draft: AttemptDraft, now = Date.now()): string {
    const stepSig = draft.steps.map(s => `${s.stepId}:${s.correct ? 1 : 0}`).join(',');
    return `${draft.sentenceId}|${draft.sessionId}|${draft.transferOf ?? ''}|${stepSig}|${Math.floor(now / 2000)}`;
}
export function buildSentenceAttempt(draft: AttemptDraft, now = Date.now()): {
    attempt: SentenceAttempt;
    klass: SentenceEvidenceClass;
    counts: boolean;
} {
    const structureCorrect = draft.steps.length ? draft.steps.every(s => s.correct) : null;
    const subject = draft.steps.find(s => s.stepId === 'subject');
    const verb = draft.steps.find(s => s.stepId === 'predicate');
    const klass = evidenceClass({
        steps: draft.steps,
        transfer: !!draft.transferOf,
        delayed: draft.delayed,
        allCorrect: draft.steps.length > 0 && draft.steps.every(s => s.correct),
    });
    // 结构没核对过：答得再干净也不能推进语法掌握（只记这次练习本身）
    const trust: StructureTrust = draft.structureTrust ?? 'unverified';
    const eligible = trust === 'verified';
    const attempt: SentenceAttempt = {
        id: uid('sa', now),
        sentence: draft.sentence,
        sourceType: draft.sourceType,
        sourceId: draft.sourceId,
        targetWords: [...draft.targetWords],
        targetGrammar: [...draft.grammarConceptIds],
        subjectCorrect: subject ? subject.correct : null,
        verbCorrect: verb ? verb.correct : null,
        structureCorrect,
        translationDependence: draft.translationDependence,
        durationMs: draft.durationMs,
        errors: draft.steps.filter(s => !s.correct).map(s => s.errorType || s.stepId),
        createdAt: now,
        at: now,
        sentenceId: draft.sentenceId,
        sessionId: draft.sessionId,
        sessionKey: attemptKey(draft, now),
        steps: draft.steps.map(s => ({ ...s })),
        hintLevel: maxSupportLevel(draft.steps),
        maxSupportLevel: maxSupportLevel(draft.steps),
        independent: maxSupportLevel(draft.steps) === 0 && !!structureCorrect,
        evidenceClass: klass,
        grammarConceptIds: [...draft.grammarConceptIds],
        meaningCorrect: draft.meaningCorrect,
        transferOf: draft.transferOf,
        reviewedAt: null,
        structureTrust: trust,
        structureProvenance: draft.structureProvenance,
        masteryEligible: eligible && countsTowardMastery(klass),
    };
    return { attempt, klass, counts: eligible && countsTowardMastery(klass) };
}
export function isDuplicateAttempt(existing: SentenceAttempt[], draft: AttemptDraft, now = Date.now()): boolean {
    const key = attemptKey(draft, now);
    return existing.some(a => a.sessionKey === key || (a.sentenceId === draft.sentenceId && a.sessionId === draft.sessionId && Math.abs((a.at ?? a.createdAt) - now) < 2000 && !draft.transferOf));
}
// 把步骤证据按"概念"聚合：同一概念在一次句子 attempt 内只记一次
export interface ConceptAggregate {
    conceptId: string;
    correct: boolean;
    supportLevel: number;
    errorTypes: string[];
}
export function aggregateByConcept(steps: SentenceStepRecord[], stepConcepts: Map<string, string[]>): ConceptAggregate[] {
    const out = new Map<string, ConceptAggregate>();
    for (const s of steps) {
        for (const cid of stepConcepts.get(s.stepId) ?? []) {
            const prev = out.get(cid);
            if (!prev)
                out.set(cid, { conceptId: cid, correct: s.correct, supportLevel: s.supportLevel ?? 0, errorTypes: s.correct ? [] : [s.errorType || s.stepId] });
            else {
                prev.correct = prev.correct && s.correct;
                prev.supportLevel = Math.max(prev.supportLevel, s.supportLevel ?? 0);
                if (!s.correct)
                    prev.errorTypes.push(s.errorType || s.stepId);
            }
        }
    }
    return [...out.values()].sort((a, b) => (a.conceptId < b.conceptId ? -1 : 1));
}
export function applyEvidence(data: {
    concepts: GrammarConcept[];
    grammarAttempts: GrammarAttempt[];
    sentenceAttempts?: SentenceAttempt[];
}, draft: AttemptDraft, stepConcepts: Map<string, string[]>, now = Date.now(), defs: GrammarConceptDef[] = GRAMMAR_TAXONOMY): EvidenceApplyResult {
    const { attempt, klass, counts } = buildSentenceAttempt(draft, now);
    const eligible = attempt.structureTrust === 'verified';
    // 幂等：只拦"同一次会话里对同一句的重复提交"（双击/重放）。
    // 不同会话再练同一句是合法的第二次练习，必须各自计入证据——不能按"同一句 + 时间窗"去重。
    const duplicated = (data.sentenceAttempts ?? []).some(a => a.sentenceId === draft.sentenceId && a.sessionId === draft.sessionId);
    if (duplicated)
        return { concepts: data.concepts, grammarAttempts: data.grammarAttempts, attempt, evidenceClass: klass, countsTowardMastery: counts, updatedConceptIds: [], duplicate: true };
    const aggregates = aggregateByConcept(draft.steps, stepConcepts);
    // 未核验结构：只记接触（contact），不写 GrammarAttempt，也不碰 BKT 后验与错误类型。
    // 这样 grammarState() 重算时同样看不到这次作答——不存在「页面说不算、数据库却在算」。
    // 注意：这里只拦「结构未核验」；「用了太多提示」是原有证据分级，仍然记接触次数（只是不推进掌握）。
    if (!eligible) {
        const contacted = new Map(data.concepts.map(c => [c.id, { ...c }]));
        const ids: string[] = [];
        for (const agg of aggregates) {
            const prev = contacted.get(agg.conceptId);
            if (!prev)
                continue;
            contacted.set(agg.conceptId, { ...prev, exposures: prev.exposures + 1, lastSeenAt: now, updatedAt: now });
            ids.push(agg.conceptId);
        }
        return {
            concepts: [...contacted.values()], grammarAttempts: data.grammarAttempts, attempt,
            evidenceClass: klass, countsTowardMastery: false, updatedConceptIds: ids, duplicate: false,
            ineligibleReason: 'structure-unverified',
        };
    }
    const conceptById = new Map(data.concepts.map(c => [c.id, { ...c }]));
    const grammarAttempts = [...data.grammarAttempts];
    const updatedConceptIds: string[] = [];
    const newGrammarAttempts: GrammarAttempt[] = [];
    for (const agg of aggregates) {
        const def = defs.find(d => d.id === agg.conceptId);
        const prev = conceptById.get(agg.conceptId);
        if (!prev && !def)
            continue;
        const base: GrammarConcept = prev ?? {
            id: agg.conceptId, name: def?.name ?? agg.conceptId, parentId: def?.parentId ?? null,
            exposures: 0, attempts: 0, correct: 0, mastery: GRAMMAR_CONFIG.bkt.prior, retention: 0,
            errorTypes: {}, lastSeenAt: 0, nextReviewAt: 0, createdAt: now,
            category: def?.category, description: def?.description, prerequisiteIds: def ? [...def.prerequisiteIds] : [],
            relatedConceptIds: def ? [...def.relatedConceptIds] : [], examples: def ? [...def.examples] : [],
            confidence: 0, realContextEvidence: 0, source: 'taxonomy', updatedAt: now,
        };
        const ga: GrammarAttempt = {
            id: `${attempt.id}.${agg.conceptId}`,
            conceptId: agg.conceptId,
            at: now,
            correct: agg.correct,
            sourceType: draft.sourceType,
            sourceId: draft.sentenceId,
            errorType: agg.errorTypes[0] ?? '',
            durationMs: draft.durationMs,
            independent: agg.supportLevel === 0 && agg.correct,
            supportLevel: agg.supportLevel,
            sentenceId: draft.sentenceId,
            stepId: '',
            delayed: draft.delayed,
            transfer: !!draft.transferOf,
        };
        newGrammarAttempts.push(ga);
        grammarAttempts.push(ga);
        const state = grammarState(def ?? { id: agg.conceptId }, grammarAttempts.filter(a => a.conceptId === agg.conceptId), now);
        const next: GrammarConcept = { ...base };
        next.exposures = base.exposures + 1;
        next.attempts = base.attempts + 1;
        next.correct = base.correct + (agg.correct ? 1 : 0);
        // 只有独立/迁移/延迟证据才推进 BKT 后验；否则只记 exposure（不得把"看过答案"算成掌握）
        if (counts)
            next.mastery = bktUpdate(base.mastery, agg.correct, GRAMMAR_CONFIG.bkt);
        const errors = { ...base.errorTypes };
        for (const e of agg.errorTypes)
            if (e)
                errors[e] = (errors[e] ?? 0) + 1;
        next.errorTypes = errors;
        next.lastSeenAt = now;
        next.confidence = Math.min(1, next.attempts / GRAMMAR_CONFIG.mastery.strongEvidence);
        if (draft.sourceType !== 'curated')
            next.realContextEvidence = (base.realContextEvidence ?? 0) + 1;
        next.retention = state.p;
        next.nextReviewAt = state.nextReviewAt;
        next.updatedAt = now;
        conceptById.set(agg.conceptId, next);
        updatedConceptIds.push(agg.conceptId);
    }
    return {
        concepts: [...conceptById.values()], grammarAttempts, attempt, evidenceClass: klass,
        countsTowardMastery: counts, updatedConceptIds, duplicate: false,
        ineligibleReason: counts ? undefined : 'support-too-high',
    };
}
// 延迟保持复测：对既有 attempt 做 24h 后重测的证据升级
export function delayedClass(attempt: SentenceAttempt, now = Date.now()): SentenceEvidenceClass | null {
    if (!attempt.at || now - attempt.at < GRAMMAR_CONFIG.mastery.delayMs)
        return null;
    return attempt.structureCorrect ? 'delayed' : null;
}
// —— Just-in-Time 知识卡（§52 / 文本 §11）——
export interface JustInTimeCard {
    conceptId: string;
    name: string;
    seconds: number;
    rule: string;
    why: string;
    example: {
        ok: string;
        bad?: string;
        note?: string;
    };
    commonErrors: string[];
    transfer: string;
    trigger: string;
}
export function justInTimeCard(conceptId: string, evaluation: StepEvaluation, defs: GrammarConceptDef[] = GRAMMAR_TAXONOMY): JustInTimeCard | null {
    const def = defs.find(d => d.id === conceptId);
    if (!def)
        return null;
    return {
        conceptId,
        name: def.name,
        seconds: 45,
        rule: def.card.rule,
        why: def.card.why,
        example: def.card.example,
        commonErrors: [...def.card.commonErrors],
        transfer: def.card.transfer,
        trigger: evaluation.errorType || 'step-error',
    };
}
// 步骤 → 概念映射（供 applyEvidence 使用）
export function stepConceptMap(steps: LabStep[]): Map<string, string[]> {
    return new Map(steps.map(s => [s.id, [...s.conceptIds]]));
}
// —— Reading Handoff 回执（§14）：只回报告，不重写 Reading ——
export interface ReadingHandoffReport {
    passageId: string;
    detectedGrammarWeaknesses: string[];
    resolvedConcepts: string[];
    unresolvedConcepts: string[];
    evidence: number;
    suggestedReview: string[];
    attempts: number;
}
export function readingHandoffReport(passageId: string, conceptIds: string[], concepts: GrammarConcept[], attempts: GrammarAttempt[], now = Date.now()): ReadingHandoffReport {
    const relevant = conceptIds.length ? conceptIds : [...new Set(attempts.filter(a => a.sourceType === 'reading').map(a => a.conceptId))];
    const states = relevant.map(id => grammarState({ id }, attempts, now));
    const resolved = states.filter(s => s.band === 'likely-mastered').map(s => s.conceptId);
    const unresolved = states.filter(s => s.band !== 'likely-mastered').map(s => s.conceptId);
    const weak = states.filter(s => s.weak).map(s => s.conceptId);
    return {
        passageId,
        detectedGrammarWeaknesses: weak,
        resolvedConcepts: resolved,
        unresolvedConcepts: unresolved,
        evidence: relevant.reduce((n, id) => n + attempts.filter(a => a.conceptId === id).length, 0),
        suggestedReview: unresolved.slice(0, 3),
        attempts: relevant.reduce((n, id) => n + (concepts.find(c => c.id === id)?.attempts ?? 0), 0),
    };
}
