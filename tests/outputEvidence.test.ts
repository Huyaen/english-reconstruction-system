import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractProductiveEvidence, productiveDelta, applyEvidenceScores, mergeEvidence, evidenceKey, isIndependentEvidence, candidateWeaknesses, findWord } from '../src/outputEvidence.ts';
import { classifyRevision, recordRevision, compareRevision, revisionVerdict, revisionIsIndependent, nextRevisionPrompt, revisionEvidenceKind } from '../src/outputRevision.ts';
import { buildTransferTask, buildDelayedTask, transferWeight, transferIsGenuine } from '../src/outputTransfer.ts';
import { buildTaskSpec } from '../src/outputTask.ts';
import { emptySupport } from '../src/outputScaffolding.ts';
import type { OutputAttempt, OutputFeedback, OutputTaskSpec } from '../src/types.ts';
const NOW = 1700000000000;
const words = [{ id: 'w1', en: 'aqueduct' }, { id: 'w2', en: 'carry' }];
function attempt(over: Partial<OutputAttempt> = {}): OutputAttempt {
    const task: OutputTaskSpec = buildTaskSpec({ taskType: 'one_sentence', topic: 'the aqueduct', sourceType: 'free', targetWords: ['aqueduct'], now: NOW });
    return {
        id: 'oa1', prompt: 'x', sourceType: 'free', sourceId: '', originalText: '',
        meaningEvidence: null, grammarEvidence: null, vocabularyEvidence: null, coherenceEvidence: null,
        repairAbility: null, corrections: [], upgradeSuggestion: '', wordCount: 0, aiEval: null,
        createdAt: NOW, status: 'draft', revision: 1, updatedAt: NOW,
        taskType: 'one_sentence', task, targetWords: ['aqueduct'], targetGrammar: [],
        draftText: '', finalText: '', revisionText: '', supportLevel: 0, support: emptySupport(''),
        hintsUsed: [], feedback: null, feedbackStatus: 'none', feedbackSource: 'none',
        productiveEvidence: [], revisions: [], readingSessionId: null, inputSessionId: null,
        miniUnitId: null, aiGenerationId: null, ...over,
    };
}
const fb = (over: Partial<OutputFeedback> = {}): OutputFeedback => ({
    communicationGoal: 'x', meaningAssessment: 'delivered', meaningBasis: 'ai_estimated', meaningConfidence: 0.5,
    strengths: ['clear'], priorityIssues: [], corrections: [], grammarConceptIds: [], targetWordIds: [],
    upgrade: null, nextPractice: 'x', feedbackScope: 'language_only', sourceProvenance: 'user_text',
    uncertainty: '', promptVersion: 'output.diagnose@1.0.0', noCorrectionNeeded: true, ...over,
});
test('目标词匹配按词边界，ha 不会命中 hashtag', () => {
    assert.ok(findWord('The aqueduct carried water.', 'aqueduct'));
    assert.equal(findWord('#aqueduct', 'aqueduct'), null);
});
test('独立正确产出有正证据；照抄/辅助不产生掌握', () => {
    const independent = extractProductiveEvidence({ attemptId: 'oa1', text: 'The aqueduct carried water.', words, independence: { independent: true, dependence: 0, copied: false, assisted: false, reason: 'no hints' }, feedback: fb(), now: NOW });
    assert.equal(independent.length, 2);
    const aqueduct = independent.find(e => e.wordId === 'w1')!;
    assert.equal(aqueduct.independent, true);
    assert.ok(productiveDelta(aqueduct) > 0);
    assert.equal(isIndependentEvidence(aqueduct), true);
    const copied = extractProductiveEvidence({ attemptId: 'oa2', text: 'The aqueduct carried water.', words, independence: { independent: false, dependence: 1, copied: true, assisted: false, reason: 'model answer' }, feedback: null, now: NOW });
    assert.equal(copied.every(e => e.copied && productiveDelta(e) === 0), true);
    assert.equal(copied.every(e => e.correctness === 'questionable'), true, '照抄时无法判断是否真的会');
});
test('证据幂等键 = attempt + word；合并不会翻倍', () => {
    const e1 = extractProductiveEvidence({ attemptId: 'oa1', text: 'aqueduct', words, independence: { independent: true, dependence: 0, copied: false, assisted: false, reason: 'no hints' }, feedback: null, now: NOW });
    const e2 = extractProductiveEvidence({ attemptId: 'oa1', text: 'aqueduct aqueduct', words, independence: { independent: true, dependence: 0, copied: false, assisted: false, reason: 'no hints' }, feedback: null, now: NOW + 10 });
    assert.equal(evidenceKey('oa1', 'w1'), e1[0]!.id);
    const merged = mergeEvidence(e1, e2);
    assert.equal(merged.length, 1);
});
test('评分有界：连续独立正确不超过 0.95，错误会下调', () => {
    const good = extractProductiveEvidence({ attemptId: 'a', text: 'aqueduct', words, independence: { independent: true, dependence: 0, copied: false, assisted: false, reason: 'no hints' }, feedback: null, now: NOW });
    const p1 = applyEvidenceScores({ productiveScore: 0.9, productionEvidence: 0 }, good, NOW);
    assert.ok(p1.productiveScore! <= 0.95);
    const wrong = extractProductiveEvidence({ attemptId: 'b', text: 'aqueduct', words, independence: { independent: true, dependence: 0, copied: false, assisted: false, reason: 'no hints' }, feedback: fb({ corrections: [{ type: 'vocabulary_choice', original: 'aqueduct', proposed: 'bridge', start: 0, end: 8, explanation: '词义不符', severity: 'major', confidence: 0.8, targetWordId: 'w1' }] }), now: NOW });
    const p2 = applyEvidenceScores({ productiveScore: 0.5 }, wrong, NOW);
    assert.ok(p2.productiveScore! < 0.5);
});
test('修改分类：自己改 / 提示后 / 照抄 / 看示范后改写', () => {
    assert.equal(classifyRevision('He went to school.', { suggestion: null, supportLevel: 0 }).kind, 'self');
    assert.equal(classifyRevision('He went to school.', { suggestion: null, supportLevel: 2 }).kind, 'after_hint');
    const copy = classifyRevision('He went to school yesterday.', { suggestion: 'He went to school yesterday.', supportLevel: 0 });
    assert.equal(copy.kind, 'copied');
    assert.ok(copy.similarity > 0.9);
    const model = classifyRevision('He went to school yesterday.', { suggestion: null, supportLevel: 4 });
    assert.equal(model.kind, 'after_model');
    const recorded = recordRevision(attempt({ originalText: 'He go to school yesterday.', status: 'submitted' }), 'He went to school yesterday.', { suggestion: null, now: NOW + 5, supportLevel: 0 });
    assert.equal(recorded.status, 'revised');
    assert.equal(recorded.revision, 2);
    assert.equal(recorded.finalText, 'He went to school yesterday.');
    assert.equal(revisionIsIndependent(recorded), true);
    assert.equal(revisionEvidenceKind(recorded), 'self');
});
test('修改比较：按 span 是否仍存在判断解决，不按字数', () => {
    const before = 'He go to school. I like it.';
    const after = 'He went to school. I like it a lot.';
    const cmp = compareRevision(before, after, fb({ corrections: [{ type: 'tense', original: 'go', proposed: 'went', start: 3, end: 5, explanation: '时态', severity: 'major', confidence: 0.8 }, { type: 'article', original: 'school', proposed: 'the school', start: 6, end: 12, explanation: '冠词', severity: 'minor', confidence: 0.5 }] }));
    assert.equal(cmp.resolved.length, 1, 'go 已被替换；school 仍在文中，不能算解决');
    assert.equal(cmp.beforeWords, 7);
    assert.equal(cmp.afterWords, 9);
    assert.equal(cmp.remaining.length, 1);
    assert.equal(revisionVerdict({ ...cmp, beforeWords: 10, afterWords: 12, resolved: [], remaining: [] }), 'unchanged');
    assert.match(nextRevisionPrompt(cmp, 'one_sentence'), /改掉|改一处/);
    const copied = compareRevision(before, before, null);
    assert.equal(revisionVerdict(copied), 'unchanged');
});
test('迁移任务换了语境，不换两个词了事；延迟任务有 D1', () => {
    const task = buildTaskSpec({ taskType: 'short_summary', topic: 'water', sourceType: 'reading', sourceId: 'p1', now: NOW });
    const t = buildTransferTask(task, { now: NOW + 86400000, seed: 'oa1' });
    assert.notEqual(t.task.topic, task.topic);
    assert.equal(transferIsGenuine(task, t.task), true);
    assert.equal(t.strength, 'strong');
    assert.ok(t.notes.join(' ').includes('换了场景'));
    assert.equal(transferIsGenuine(task, { ...t.task, topic: task.topic }), false);
    const delayed = buildDelayedTask(task, { now: NOW, delayDays: 1 });
    assert.ok(delayed.task.communicationGoal);
    assert.notEqual(delayed.task.id, task.id);
    assert.ok(transferWeight({ independent: true, assisted: false, copied: false, strength: 'strong' }) > transferWeight({ independent: false, assisted: true, copied: false, strength: 'weak' }));
    assert.equal(transferWeight({ independent: false, assisted: false, copied: true, strength: 'strong' }), 0);
});
test('候选薄弱点来自真实反馈/辅助，不凭感觉', () => {
    const a = attempt({ feedback: fb({ grammarConceptIds: ['g.tense'], corrections: [{ type: 'tense', original: 'go', proposed: 'went', start: 0, end: 2, explanation: '时态', severity: 'major', confidence: 0.8, targetWordId: null }] }), supportLevel: 4 });
    const c = candidateWeaknesses(a, NOW);
    assert.ok(c.some(x => x.kind === 'grammar'));
    assert.ok(c.some(x => x.kind === 'support' && x.reason.includes('L4')));
    assert.equal(candidateWeaknesses(attempt(), NOW).length, 0);
});
