// Phase 16.3：未核验结构不得推进语法掌握（纯函数层）
// 复现审计路径：AI 定向句（structureProvenance='ai_unverified'）只答一道完整意思题，
// 旧版本会写 GrammarAttempt（structure.core）并把 mastery 推到 ~0.60。
import test from 'node:test';
import assert from 'node:assert/strict';
import { curatedById, curatedSentenceRecords } from '../src/sentenceSources.ts';
import { assessStructureTrust } from '../src/sentenceTrust.ts';
import { applyEvidence, type AttemptDraft } from '../src/sentenceEvidence.ts';
import { buildLabPlan, stepRecord } from '../src/sentenceLab.ts';
import { GRAMMAR_CONFIG, GRAMMAR_TAXONOMY, grammarState } from '../src/grammar.ts';
import { heuristicStructure, readStructure } from '../src/sentenceStructure.ts';
import { emptyData } from '../src/db.ts';
import type { SentenceRecord, SentenceStepRecord } from '../src/types.ts';
const NOW = 1700000000000;
const CLAUSE = 'Although the river had risen, the engineers rebuilt the bridge before the storm arrived.';
function aiSentence(id = 'sen.ai.test'): SentenceRecord {
    return {
        id, text: CLAUSE, zh: '虽然河水上涨，工程师还是在暴风雨前重建了那座桥。',
        sourceType: 'ai', sourceId: 'ai.generate', attribution: 'AI 生成（结构未验证）',
        grammarTags: ['clause.relative'], targetWordIds: [],
        theme: 'AI 定向句', difficulty: 2,
        structure: heuristicStructure(id, CLAUSE), structureProvenance: 'ai_unverified',
        createdBy: 'ai', createdAt: NOW, usedCount: 0, lastUsedAt: 0, notes: '',
    };
}
function draftFor(record: SentenceRecord, steps: SentenceStepRecord[]): AttemptDraft {
    const structure = readStructure(record.structure, record.id, record.text).structure;
    const plan = buildLabPlan(record, structure, []);
    return {
        sentenceId: record.id, sentence: record.text, sourceType: record.sourceType, sourceId: record.sourceId,
        targetWords: record.targetWordIds, grammarConceptIds: plan.steps.flatMap(s => s.conceptIds),
        steps, durationMs: 3200, sessionId: 'lab-test', meaningCorrect: true,
        translationDependence: 0, transferOf: null, delayed: false,
        structureTrust: assessStructureTrust(record, structure).trust, structureProvenance: record.structureProvenance,
    };
}
/** 只答完整意思这一步（审计里的复现步骤），其余步骤不答 */
function meaningOnly(record: SentenceRecord): SentenceStepRecord[] {
    const structure = readStructure(record.structure, record.id, record.text).structure;
    const plan = buildLabPlan(record, structure, []);
    const step = plan.steps.find(s => s.kind === 'meaning') ?? plan.steps[plan.steps.length - 1];
    return [stepRecord(step.id, step.correctId, true, 0, 1800, '')];
}
test('结构可信度：只有人工审校且结构可用才允许计分', () => {
    const curated = curatedById('sen.curated.relative-01')!;
    assert.equal(assessStructureTrust(curated).trust, 'verified', '人工标注的练习句应可信');
    const ai = aiSentence();
    const aiTrust = assessStructureTrust(ai);
    assert.equal(aiTrust.trust, 'unverified');
    assert.equal(aiTrust.reason, 'provenance-unverified');
    // 阅读难句是启发式切分，同样不可信（不能因为「不是 AI」就放过）
    const heuristic: SentenceRecord = { ...curated, structureProvenance: 'heuristic', structure: heuristicStructure('x', curated.text) };
    assert.equal(assessStructureTrust(heuristic).trust, 'unverified');
    // 声称 gold，但结构本身自检不通过：仍然不可信
    const broken = { ...curated, structure: { ...(curated.structure as object), clauses: [] } } as SentenceRecord;
    assert.equal(assessStructureTrust(broken).trust, 'unverified', '结构自检失败不能当可靠依据');
    // 声称 gold、结构可用，但把握度不够
    const lowConfidence = { ...curated, structure: { ...(curated.structure as object), confidence: 0.2 } } as SentenceRecord;
    assert.equal(assessStructureTrust(lowConfidence).trust, 'unverified');
});
test('未核验结构：答对也只记接触，不写 GrammarAttempt，不推进 BKT', () => {
    const record = aiSentence();
    const data = emptyData();
    const steps = meaningOnly(record);
    const applied = applyEvidence({ concepts: data.grammarConcepts, grammarAttempts: data.grammarAttempts, sentenceAttempts: [] }, draftFor(record, steps), new Map([[steps[0].stepId, ['structure.core']]]), NOW, GRAMMAR_TAXONOMY);
    assert.equal(applied.attempt.evidenceClass, 'independent', '作答质量本身仍如实记录');
    assert.equal(applied.attempt.structureTrust, 'unverified');
    assert.equal(applied.attempt.masteryEligible, false);
    assert.equal(applied.countsTowardMastery, false);
    assert.equal(applied.ineligibleReason, 'structure-unverified');
    assert.equal(applied.grammarAttempts.length, 0, '未核验结构不得写入任何语法证据');
    assert.deepEqual(applied.updatedConceptIds, []);
    const core = applied.concepts.find(c => c.id === 'structure.core');
    if (core)
        assert.equal(core.mastery, GRAMMAR_CONFIG.bkt.prior, '概念掌握度不得被推进');
    // grammarState() 从 attempt 重算同样看不到这次作答
    const state = grammarState({ id: 'structure.core' }, applied.grammarAttempts, NOW);
    assert.equal(state.p, GRAMMAR_CONFIG.bkt.prior);
    assert.equal(state.attempts, 0);
    assert.equal(state.band, 'unknown');
});
test('未核验结构：答错也不产生负证据或薄弱点', () => {
    const record = aiSentence();
    const steps = meaningOnly(record).map(s => ({ ...s, correct: false, errorType: 'meaning-error' }));
    const data = emptyData();
    const applied = applyEvidence({ concepts: data.grammarConcepts, grammarAttempts: data.grammarAttempts, sentenceAttempts: [] }, draftFor(record, steps), new Map([[steps[0].stepId, ['structure.core']]]), NOW, GRAMMAR_TAXONOMY);
    assert.equal(applied.grammarAttempts.length, 0);
    assert.equal(applied.concepts.find(c => c.id === 'structure.core')?.errorTypes?.['meaning-error'], undefined);
});
test('可信结构：正常练习仍然推进掌握（不能被修过头）', () => {
    const record = curatedById('sen.curated.relative-01')!;
    const structure = readStructure(record.structure, record.id, record.text).structure;
    const plan = buildLabPlan(record, structure, curatedSentenceRecords(NOW));
    const steps = plan.steps.map(s => stepRecord(s.id, s.correctId, true, 0, 900, ''));
    const data = emptyData();
    const applied = applyEvidence({ concepts: data.grammarConcepts, grammarAttempts: data.grammarAttempts, sentenceAttempts: [] }, draftFor(record, steps), new Map(plan.steps.map(s => [s.id, s.conceptIds])), NOW, GRAMMAR_TAXONOMY);
    assert.equal(applied.countsTowardMastery, true);
    assert.ok(applied.grammarAttempts.length >= 1, '可信结构必须照常写语法证据');
    const grown = applied.concepts.filter(c => c.mastery > GRAMMAR_CONFIG.bkt.prior);
    assert.ok(grown.length >= 1, '可信结构的独立作答应提高掌握估算');
});
test('旧数据：没有 structureTrust 字段的记录不能被默认当成可信', () => {
    const record = aiSentence();
    const draft = draftFor(record, meaningOnly(record));
    delete (draft as {
        structureTrust?: unknown;
    }).structureTrust;
    const data = emptyData();
    const applied = applyEvidence({ concepts: data.grammarConcepts, grammarAttempts: data.grammarAttempts, sentenceAttempts: [] }, draft, new Map(), NOW, GRAMMAR_TAXONOMY);
    assert.equal(applied.countsTowardMastery, false, '没声明核验过就不许计分');
    assert.equal(applied.attempt.structureTrust, 'unverified');
});
