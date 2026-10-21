import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateOutputFeedback, buildUnavailableFeedback, qualityGate, ERROR_LABELS, type FeedbackContext } from '../src/outputFeedback.ts';
import { buildTaskSpec } from '../src/outputTask.ts';
import type { OutputFeedback } from '../src/types.ts';
const NOW = 1700000000000;
const TEXT = 'He go to school yesterday. I like it.';
const spec = buildTaskSpec({ taskType: 'one_sentence', topic: 'school', sourceType: 'free', now: NOW });
const ctx: FeedbackContext = { text: TEXT, spec, scope: 'language_only', sourceProvenance: 'user_text', promptVersion: 'output.diagnose@1.0.0', grammarConceptIds: ['g.tense'], targetWords: [] };
function payload(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        communicationGoal: 'say what happened yesterday',
        meaningAssessment: 'delivered',
        meaningBasis: 'ai_estimated',
        meaningConfidence: 0.5,
        strengths: ['The main meaning is clear: something happened yesterday.'],
        priorityIssues: [{ type: 'tense', original: 'go', proposed: 'went', start: 3, end: 5, explanation: 'yesterday 指过去，动词需要过去式', severity: 'major', confidence: 0.9, grammarConceptId: 'g.tense', targetWordId: null }],
        corrections: [{ type: 'tense', original: 'go', proposed: 'went', start: 3, end: 5, explanation: 'yesterday 指过去，动词需要过去式', severity: 'major', confidence: 0.9, grammarConceptId: 'g.tense', targetWordId: null }],
        grammarConceptIds: ['g.tense'],
        targetWordIds: [],
        upgrade: null,
        nextPractice: 'Write one more sentence about yesterday.',
        feedbackScope: 'language_only',
        sourceProvenance: 'user_text',
        uncertainty: 'I only checked the language, not the facts.',
        promptVersion: 'output.diagnose@1.0.0',
        noCorrectionNeeded: false,
        ...over,
    };
}
test('合法反馈通过校验，并保留 span 与解释', () => {
    const r = validateOutputFeedback(payload(), ctx);
    assert.equal(r.ok, true);
    if (!r.ok)
        return;
    assert.equal(r.value.priorityIssues.length, 1);
    assert.equal(r.value.priorityIssues[0]!.original, 'go');
    assert.equal(r.value.feedbackScope, 'language_only');
    assert.equal(r.value.noCorrectionNeeded, false);
});
test('引用不存在的原文位置必须整条拒绝', () => {
    const bad = payload({ priorityIssues: [{ type: 'tense', original: 'goes', proposed: 'went', start: 3, end: 7, explanation: '错误引用', severity: 'major', confidence: 0.9 }] });
    const r = validateOutputFeedback(bad, ctx);
    assert.equal(r.ok, false);
    if (r.ok)
        return;
    assert.match(r.issues.join(' '), /位置不成立/);
});
test('越界字段被拒绝：无 strengths、优先级超过 3 条、scope 不匹配', () => {
    assert.equal(validateOutputFeedback(payload({ strengths: [] }), ctx).ok, false);
    const many = [0, 1, 2, 3].map(i => ({ type: 'other', original: TEXT[i], proposed: 'X', start: i, end: i + 1, explanation: '这是一处修改建议', severity: 'minor', confidence: 0.6 }));
    assert.equal(validateOutputFeedback(payload({ priorityIssues: many }), ctx).ok, false);
    const scope = validateOutputFeedback(payload({ feedbackScope: 'content_checked' }), ctx);
    assert.equal(scope.ok, false);
});
test('语言范围内不得宣称内容事实正确', () => {
    const claim = payload({ strengths: ['这篇总结事实完全正确，准确复述了视频内容。'] });
    const r = validateOutputFeedback(claim, ctx);
    assert.equal(r.ok, false);
    if (!r.ok)
        assert.match(r.issues.join(' '), /事实正确/);
});
test('升级建议：不能一次跳级，必须单维度、可理解', () => {
    const tooLong = payload({ upgrade: { original: 'He go to school yesterday.', suggested: 'Despite the inclement weather conditions that prevailed throughout the preceding day, he nevertheless proceeded to attend his educational institution.', why: 'more advanced', changes: ['a'], newGrammar: ['g.tense', 'g.clause'], newWords: ['inclement', 'prevailed', 'nevertheless'], singleDimension: true } });
    assert.equal(validateOutputFeedback(tooLong, ctx).ok, false);
    const twoDims = payload({ upgrade: { original: 'He go to school yesterday.', suggested: 'He went to school yesterday.', why: '时态正确', changes: ['go→went'], newGrammar: [], newWords: [], singleDimension: false } });
    assert.equal(validateOutputFeedback(twoDims, ctx).ok, false);
    const good = payload({ upgrade: { original: 'He go to school yesterday.', suggested: 'He went to school yesterday.', why: '把时间与动词时态对上', changes: ['go→went'], newGrammar: [], newWords: [], singleDimension: true } });
    assert.equal(validateOutputFeedback(good, ctx).ok, true);
});
test('没有问题时允许 noCorrectionNeeded，不能自相矛盾', () => {
    const clean = payload({ priorityIssues: [], corrections: [], noCorrectionNeeded: true });
    assert.equal(validateOutputFeedback(clean, ctx).ok, true);
    const contradict = payload({ noCorrectionNeeded: true });
    assert.equal(validateOutputFeedback(contradict, ctx).ok, false);
});
test('AI 不可用时给出明确不可用反馈，不冒充语法诊断', () => {
    const fb = buildUnavailableFeedback(ctx, [], '没有配置 AI Provider');
    assert.equal(fb.meaningAssessment, 'unavailable');
    assert.equal(fb.meaningBasis, 'unknown');
    assert.equal(fb.feedbackScope, 'language_only');
    assert.equal(fb.promptVersion, 'local@0');
    assert.equal(fb.upgrade, null);
    const gate = qualityGate(fb, ctx);
    assert.equal(gate.ok, true);
});
test('质量门：拦截无依据的原文片段与过高置信度', () => {
    const fb: OutputFeedback = {
        communicationGoal: 'x', meaningAssessment: 'delivered', meaningBasis: 'ai_estimated', meaningConfidence: 0.95,
        strengths: ['ok'], priorityIssues: [], corrections: [], grammarConceptIds: [], targetWordIds: [],
        upgrade: null, nextPractice: 'x', feedbackScope: 'language_only', sourceProvenance: 'user_text',
        uncertainty: '', promptVersion: 'output.diagnose@1.0.0', noCorrectionNeeded: true,
    };
    const gate = qualityGate(fb, ctx);
    assert.equal(gate.ok, false);
    assert.match(gate.issues.join(' '), /过高置信度/);
    const ungrounded = qualityGate({ ...fb, meaningConfidence: 0.4, corrections: [{ type: 'tense', original: 'nope', proposed: 'x', start: 0, end: 4, explanation: '不存在', severity: 'minor', confidence: 0.5 }] }, ctx);
    assert.equal(ungrounded.ok, false);
    assert.ok(ERROR_LABELS.tense);
});
