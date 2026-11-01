import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLabPlan, buildTransferTask, countsTowardMastery, evaluateStep, evidenceClass, MAX_SUPPORT_LEVEL, stepRecord, supportHint, type LabStep, } from '../src/sentenceLab.ts';
import { applyEvidence, aggregateByConcept, attemptKey, justInTimeCard, stepConceptMap, type AttemptDraft } from '../src/sentenceEvidence.ts';
import { readStructure } from '../src/sentenceStructure.ts';
import { buildGoldStructure, curatedById, curatedSentenceRecords, curatedSpecs } from '../src/sentenceSources.ts';
import { GRAMMAR_CONFIG, GRAMMAR_TAXONOMY, grammarState, seedGrammarConcepts } from '../src/grammar.ts';
import type { SentenceAttempt, GrammarAttempt, GrammarConcept, SentenceRecord } from '../src/types.ts';
const NOW = 1700000000000;
const POOL = curatedSentenceRecords(NOW);
function rec(id: string): SentenceRecord {
    const r = POOL.find(x => x.id === id);
    assert.ok(r, 'missing ' + id);
    return r!;
}
function planOf(id: string) {
    const record = rec(id);
    return { record, plan: buildLabPlan(record, readStructure(record.structure, record.id, record.text).structure, POOL.filter(p => p.id !== id)) };
}
function draftOf(record: SentenceRecord, plan: ReturnType<typeof buildLabPlan>, steps: ReturnType<typeof stepRecord>[], opts: Partial<AttemptDraft> = {}): AttemptDraft {
    return {
        sentenceId: record.id, sentence: record.text, sourceType: record.sourceType, sourceId: record.sourceId,
        targetWords: record.targetWordIds, grammarConceptIds: plan.steps.flatMap(s => s.conceptIds), steps,
        durationMs: 42000, sessionId: 'sess-1', meaningCorrect: true, translationDependence: 0,
        transferOf: null, delayed: false,
        // 这些用例都用人工标注的练习句：必须显式声明结构已核验，否则按 16.3 的保守默认不计分
        structureTrust: 'verified', structureProvenance: record.structureProvenance, ...opts,
    };
}
// 用正确选项把整句走一遍
function playCorrect(plan: ReturnType<typeof buildLabPlan>, support = 0) {
    return plan.steps.map(s => stepRecord(s.id, s.correctId, true, support, 4000, ''));
}
test('拆句流程：复合句给出主干/从句步骤，简单句走简化流程，且步骤确定', () => {
    const { plan } = planOf('sen.curated.relative-01');
    assert.deepEqual(plan.steps.map(s => s.kind), ['subject', 'predicate', 'clause', 'meaning']);
    assert.equal(plan.simplified, false);
    assert.equal(plan.uncertain, false);
    const subject = plan.steps[0];
    assert.ok(subject.options.length >= 3, '必须有真实干扰项');
    assert.equal(subject.options.find(o => o.id === subject.correctId)!.label, 'The report', '主语范围必须含限定词且不含从句');
    assert.ok(subject.hints.length >= 4);
    for (const step of plan.steps) {
        assert.ok(step.options.some(o => o.id === step.correctId), `${step.id} 的正确项必须在选项内`);
        assert.ok(step.explain.length > 8, `${step.id} 必须有解释`);
        assert.equal(new Set(step.options.map(o => o.id)).size, step.options.length, `${step.id} 选项不得重复`);
        assert.ok(step.options.every(o => o.label.length > 0 && o.label.length < 80), `${step.id} 不得出现整句级选项`);
    }
    const simple = planOf('sen.curated.coordination-01').plan;
    assert.deepEqual(simple.steps.map(s => s.kind), ['subject', 'predicate', 'meaning']);
    assert.equal(simple.simplified, true);
    // 确定性
    const again = planOf('sen.curated.relative-01').plan;
    assert.deepEqual(again.steps.map(s => [s.id, s.correctId, s.options.map(o => o.id)]), plan.steps.map(s => [s.id, s.correctId, s.options.map(o => o.id)]));
});
test('结构不确定的句子：流程标注不确定，且不生成主谓判定步骤', () => {
    const record: SentenceRecord = { ...rec('sen.curated.nested-01'), id: 'sen.user.x', structure: null, structureProvenance: 'none', sourceType: 'user', sourceId: 'user' };
    const st = readStructure(record.structure, record.id, record.text).structure;
    const plan = buildLabPlan(record, st, POOL);
    assert.equal(plan.uncertain, true);
    assert.ok(plan.notes.some(n => n.includes('可能不完整')));
    assert.deepEqual(plan.steps.map(s => s.kind), ['meaning'], '无结构时只问意义，不伪造成分判定');
});
test('评估与反馈：正确/错误/部分正确都给具体解释，错误类型可追踪', () => {
    const { plan } = planOf('sen.curated.relative-01');
    const subject = plan.steps.find(s => s.kind === 'subject')!;
    const ok = evaluateStep(subject, subject.correctId, 0);
    assert.equal(ok.correct, true);
    assert.ok(ok.feedback.includes('独立判断正确'));
    const hinted = evaluateStep(subject, subject.correctId, 2);
    assert.ok(hinted.feedback.includes('辅助'));
    const wrongOption = subject.options.find(o => o.id !== subject.correctId)!;
    const wrong = evaluateStep(subject, wrongOption.id, 0);
    assert.equal(wrong.correct, false);
    assert.equal(wrong.errorType, 'subject-identification');
    assert.ok(wrong.feedback.includes('主语'), '反馈必须点名具体错误');
    assert.ok(wrong.feedback.includes('正确的') || wrong.feedback.includes('正确范围'), '反馈必须给出正确范围');
    // 部分正确：范围重叠但边界不对
    const synthetic: LabStep = {
        id: 'subject', kind: 'subject', question: 'q',
        options: [{ id: '0-1', label: 'The report', detail: '' }, { id: '0-2', label: 'The report that', detail: '' }],
        correctId: '0-1', explain: 'x', hints: ['a'], conceptIds: ['structure.subject'], clauseIds: ['c0'],
    };
    const partial = evaluateStep(synthetic, '0-2', 0);
    assert.equal(partial.correct, false);
    assert.equal(partial.partial, true, '边界重叠必须识别为部分正确');
});
test('分层辅助：L0–L4 递进，L3 起等于看到答案', () => {
    const step = planOf('sen.curated.relative-01').plan.steps[0];
    const levels = [0, 1, 2, 3, 4].map(l => supportHint(step, l));
    assert.equal(MAX_SUPPORT_LEVEL, 4);
    assert.equal(levels[0].hint, '不看提示，先独立判断。');
    assert.equal(levels[0].revealsAnswer, false);
    assert.equal(levels[2].revealsAnswer, false);
    assert.equal(levels[3].revealsAnswer, true);
    assert.equal(levels[4].revealsAnswer, true);
    assert.equal(levels[4].hint, step.hints[step.hints.length - 1]);
    assert.equal(level(9).level, MAX_SUPPORT_LEVEL);
    function level(n: number) { return supportHint(step, n); }
});
test('证据分级：接触 / 提示后 / 独立 / 迁移 / 延迟，只有后三者计入掌握', () => {
    const exposed = evidenceClass({ steps: [stepRecord('subject', 'x', true, 3, 1, '')], transfer: false, delayed: false, allCorrect: true });
    const hinted = evidenceClass({ steps: [stepRecord('subject', 'x', true, 1, 1, '')], transfer: false, delayed: false, allCorrect: true });
    const independent = evidenceClass({ steps: [stepRecord('subject', 'x', true, 0, 1, '')], transfer: false, delayed: false, allCorrect: true });
    const transfer = evidenceClass({ steps: [stepRecord('subject', 'x', true, 0, 1, '')], transfer: true, delayed: false, allCorrect: true });
    const delayed = evidenceClass({ steps: [stepRecord('subject', 'x', true, 0, 1, '')], transfer: false, delayed: true, allCorrect: true });
    const wrong = evidenceClass({ steps: [stepRecord('subject', 'x', false, 0, 1, 'e')], transfer: false, delayed: false, allCorrect: false });
    assert.equal(exposed, 'exposed');
    assert.equal(hinted, 'hint-assisted');
    assert.equal(independent, 'independent');
    assert.equal(transfer, 'transfer');
    assert.equal(delayed, 'delayed');
    assert.equal(wrong, 'error');
    assert.equal(countsTowardMastery('exposed'), false);
    assert.equal(countsTowardMastery('hint-assisted'), false);
    assert.equal(countsTowardMastery('independent'), true);
    assert.equal(countsTowardMastery('transfer'), true);
    assert.equal(countsTowardMastery('delayed'), true);
    assert.equal(countsTowardMastery('error'), true);
});
test('迁移验证：必须换一句同结构新句；没有候选就明确不可用', () => {
    const original = rec('sen.curated.relative-01');
    const t = buildTransferTask(original, POOL);
    assert.ok(t);
    assert.notEqual(t!.candidate.id, original.id);
    assert.notEqual(t!.candidate.text, original.text);
    assert.ok(t!.sameGrammar.length > 0);
    for (const g of t!.sameGrammar) {
        assert.ok(original.grammarTags.includes(g) && t!.candidate.grammarTags.includes(g));
    }
    const lonely: SentenceRecord = { ...original, id: 'sen.only', grammarTags: ['concept.that.does.not.exist'], text: 'Unique sentence here.' };
    assert.equal(buildTransferTask(lonely, [lonely]), null);
});
test('证据写入：独立完成推进后验，看答案只计接触，重复提交不双计', () => {
    const { record, plan } = planOf('sen.curated.relative-01');
    const concepts: GrammarConcept[] = seedGrammarConcepts([], NOW);
    const steps = playCorrect(plan, 0);
    const first = applyEvidence({ concepts, grammarAttempts: [] }, draftOf(record, plan, steps), stepConceptMap(plan.steps), NOW, GRAMMAR_TAXONOMY);
    assert.equal(first.duplicate, false);
    assert.equal(first.evidenceClass, 'independent');
    assert.equal(first.countsTowardMastery, true);
    assert.equal(first.grammarAttempts.length, first.updatedConceptIds.length, '每个被证据覆盖的概念一条 grammarAttempt');
    for (const id of first.updatedConceptIds) {
        const c = first.concepts.find(x => x.id === id)!;
        assert.equal(c.attempts, 1);
        assert.ok(c.mastery > GRAMMAR_CONFIG.bkt.prior, `${id} 独立正确应推进后验`);
        assert.equal(c.retention, grammarState({ id }, first.grammarAttempts, NOW).p);
    }
    assert.equal(first.attempt.structureCorrect, true);
    assert.equal(first.attempt.maxSupportLevel, 0);
    assert.equal(first.attempt.at, NOW);
    // 同一会话重复提交：视为同一次（幂等键 = 会话 + 句子）
    const dup = applyEvidence({ concepts: first.concepts, grammarAttempts: first.grammarAttempts, sentenceAttempts: [first.attempt] }, draftOf(record, plan, steps), stepConceptMap(plan.steps), NOW + 1500, GRAMMAR_TAXONOMY);
    assert.equal(dup.duplicate, true);
    assert.equal(dup.concepts.find(c => c.id === 'structure.subject')!.attempts, 1);
    // 看过答案：不推进后验
    const fresh = seedGrammarConcepts([], NOW);
    const exposed = applyEvidence({ concepts: fresh, grammarAttempts: [] }, draftOf(record, plan, playCorrect(plan, 4)), stepConceptMap(plan.steps), NOW + 60000, GRAMMAR_TAXONOMY);
    assert.equal(exposed.evidenceClass, 'exposed');
    assert.equal(exposed.countsTowardMastery, false);
    const subj = exposed.concepts.find(c => c.id === 'structure.subject')!;
    assert.equal(subj.attempts, 1);
    assert.equal(subj.mastery, GRAMMAR_CONFIG.bkt.prior, '看过答案不得改变掌握估算');
    // 迁移：记为 transfer 且强证据
    const tr = applyEvidence({ concepts: fresh, grammarAttempts: [] }, draftOf(record, plan, playCorrect(plan, 0), { transferOf: 'sen.curated.nested-01' }), stepConceptMap(plan.steps), NOW + 120000, GRAMMAR_TAXONOMY);
    assert.equal(tr.evidenceClass, 'transfer');
    assert.equal(tr.grammarAttempts.every(a => a.transfer === true), true);
});
test('聚合与键：同一概念多步骤取最保守结果；attemptKey 稳定可去重', () => {
    const map = new Map<string, string[]>([['subject', ['structure.subject']], ['predicate', ['structure.predicate']], ['clause', ['structure.subject', 'clause.relative']]]);
    const steps = [
        stepRecord('subject', '0-1', true, 0, 100, ''),
        stepRecord('predicate', '1-1', false, 0, 100, 'predicate-identification'),
        stepRecord('clause', 'c1:relative', false, 2, 100, 'clause-boundary'),
    ];
    const aggs = aggregateByConcept(steps, map);
    const subj = aggs.find(a => a.conceptId === 'structure.subject')!;
    assert.equal(subj.correct, false, '同一概念有错即判错（clause 步骤也覆盖 structure.subject）');
    assert.equal(subj.supportLevel, 2, '辅助级别取最高');
    assert.deepEqual(subj.errorTypes, ['clause-boundary']);
    const rel = aggs.find(a => a.conceptId === 'clause.relative')!;
    assert.equal(rel.correct, false);
    assert.deepEqual(rel.errorTypes, ['clause-boundary']);
    const pred = aggs.find(a => a.conceptId === 'structure.predicate')!;
    assert.equal(pred.correct, false);
    assert.deepEqual(pred.errorTypes, ['predicate-identification']);
    const d = draftOf(rec('sen.curated.relative-01'), planOf('sen.curated.relative-01').plan, steps);
    assert.equal(attemptKey(d, NOW), attemptKey(d, NOW + 500));
    assert.notEqual(attemptKey(d, NOW), attemptKey(d, NOW + 5000));
});
test('Just-in-Time 卡片：错误后给出 20–60 秒可读卡片，含规则/例子/你的错误', () => {
    const { plan } = planOf('sen.curated.relative-01');
    const subject = plan.steps[0];
    const wrong = evaluateStep(subject, subject.options.find(o => o.id !== subject.correctId)!.id, 0);
    const card = justInTimeCard('clause.relative', wrong);
    assert.ok(card);
    assert.ok(card!.seconds >= 20 && card!.seconds <= 60);
    assert.ok(card!.rule.length > 10 && card!.example.ok.length > 0);
    assert.ok(card!.trigger.includes('错误') || card!.trigger.length > 5);
    assert.equal(justInTimeCard('no.such.concept', wrong), null);
    // 所有图谱概念都能生成卡片（无空缺）
    for (const def of GRAMMAR_TAXONOMY) {
        assert.ok(justInTimeCard(def.id, wrong), `${def.id} 缺少 JIT 卡片`);
    }
});
test('gold 结构可直接由 spec 复现：lab 使用的结构与句库记录一致', () => {
    const record = rec('sen.curated.passive-01');
    const fromSpec = buildGoldStructure(curatedSpecs().find(s => s.id === record.id)!);
    const stored = curatedById(record.id)!;
    assert.deepEqual(stored.structure, fromSpec);
});
test('证据幂等：同一会话重复提交只算一次，不同会话再练同一句必须各算一次', () => {
    const rec = curatedById('sen.curated.relative-01')!;
    const plan = buildLabPlan(rec, readStructure(rec.structure, rec.id, rec.text).structure, []);
    const steps = plan.steps.map((s) => stepRecord(s.id, s.correctId, true, 0, 1200, ''));
    const draft: AttemptDraft = {
        sentenceId: rec.id, sentence: rec.text, sourceType: rec.sourceType, sourceId: rec.sourceId,
        targetWords: [], grammarConceptIds: [...rec.grammarTags], steps,
        durationMs: 30000, sessionId: 'sess-A', meaningCorrect: null, translationDependence: 0,
        transferOf: null, delayed: false,
        structureTrust: 'verified', structureProvenance: rec.structureProvenance,
    };
    let d = { concepts: seedGrammarConcepts([], 1000), grammarAttempts: [] as GrammarAttempt[], sentenceAttempts: [] as SentenceAttempt[] };
    const first = applyEvidence(d, draft, stepConceptMap(plan.steps), 2000);
    assert.equal(first.duplicate, false);
    d = { concepts: first.concepts, grammarAttempts: first.grammarAttempts, sentenceAttempts: [...d.sentenceAttempts, first.attempt] };
    const masteryAfterFirst = d.concepts.find(c => c.id === 'structure.subject')!.mastery;
    // 同一会话重复提交（双击/重放）：不得再记一条证据
    const again = applyEvidence(d, draft, stepConceptMap(plan.steps), 2100);
    assert.equal(again.duplicate, true);
    assert.equal(again.grammarAttempts.length, first.grammarAttempts.length);
    assert.equal(again.concepts.find(c => c.id === 'structure.subject')!.attempts, 1);
    // 换一个会话再练同一句：必须算第二次练习
    const secondSession = applyEvidence(d, { ...draft, sessionId: 'sess-B' }, stepConceptMap(plan.steps), 3000);
    assert.equal(secondSession.duplicate, false);
    assert.equal(secondSession.concepts.find(c => c.id === 'structure.subject')!.attempts, 2);
    assert.ok(secondSession.concepts.find(c => c.id === 'structure.subject')!.mastery > masteryAfterFirst);
});
