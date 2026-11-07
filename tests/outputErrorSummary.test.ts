import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyData } from '../src/db.ts';
import { curatedSentenceRecords } from '../src/sentenceSources.ts';
import { buildTaskSpec } from '../src/outputTask.ts';
import { fnv1a } from '../src/prompts/registry.ts';
import { outputErrorSummary, outputAnalytics } from '../src/outputAnalytics.ts';
import { outputHubPage } from '../src/outputView.ts';
import type { Data, OutputAttempt, OutputErrorSpan, OutputFeedback } from '../src/types.ts';

const NOW = new Date(2026, 10, 7, 12).getTime();
function daysAgo(days: number) {
    return new Date(2026, 10, 7 - days).getTime();
}
function attempt(id: string, originalText: string, attrs: Partial<OutputAttempt> = {}): OutputAttempt {
    const createdAt = attrs.createdAt ?? NOW;
    return {
        id, originalText, createdAt, prompt: 'Describe an event', sourceType: 'free', sourceId: '',
        meaningEvidence: null, grammarEvidence: null, vocabularyEvidence: null, coherenceEvidence: null,
        repairAbility: null, corrections: [], upgradeSuggestion: '', wordCount: 4, aiEval: null,
        task: buildTaskSpec({ id: 'task-' + id, taskType: 'one_sentence', topic: 'a walk', sourceType: 'free', now: createdAt }),
        status: 'completed', supportLevel: 0, ...attrs,
    };
}
function span(text: string, original: string, proposed: string, type: OutputErrorSpan['type'], start = text.indexOf(original)): OutputErrorSpan {
    return { type, original, proposed, start, end: start + original.length, explanation: '根据语境调整这一处。', severity: 'major', confidence: 0.85 };
}
function withAI(data: Data, a: OutputAttempt, priorityIssues: OutputErrorSpan[], corrections: OutputErrorSpan[] = priorityIssues, ok = true): OutputAttempt {
    const promptVersion = 'test-v1';
    const feedback: OutputFeedback = {
        communicationGoal: 'Describe an event', meaningAssessment: 'partly_delivered', meaningBasis: 'ai_estimated', meaningConfidence: 0.5,
        strengths: ['清楚写出了行动。'], priorityIssues, corrections, grammarConceptIds: [], targetWordIds: [],
        upgrade: null, nextPractice: '用另一个场景改写。', feedbackScope: 'language_only', sourceProvenance: 'user_text',
        uncertainty: '具体时间只根据原文推测。', promptVersion, noCorrectionNeeded: !corrections.length && !priorityIssues.length,
    };
    const id = 'gen-' + a.id;
    const requestKey = [a.id, promptVersion, parseInt(fnv1a(a.originalText), 16).toString(36)].join('|');
    data.aiGenerations.push({
        id, kind: 'output', createdAt: NOW, promptId: 'output_diagnose', promptVersion, promptHash: '', providerHost: '', model: 'fixture',
        structuredMode: '', contentHash: '', usage: { promptTokens: 0, completionTokens: 0, estimated: true },
        output: { requestKey, feedback }, quality: { ok, notes: [] }, sourceMetadata: {},
    });
    const graded = { ...a, aiGenerationId: id, feedbackStatus: 'ai', feedbackSource: 'ai', feedback } as const;
    data.outputAttempts.push(graded);
    return graded;
}
function past(text: string, at?: number) { return span(text, 'go', 'went', 'tense', at); }

test('同一任务的重复记录、修改及两份反馈列表只计一次，不同位置仍分开计', () => {
    const data = emptyData();
    const first = attempt('first', 'I go there, then go home.', { createdAt: daysAgo(3), dailyPlanTaskId: 'plan-task', revisions: [{ text: 'I went there, then went home.', at: NOW, kind: 'self', similarityToSuggestion: 0 }] });
    const firstIssue = past(first.originalText);
    const secondIssue = past(first.originalText, first.originalText.lastIndexOf('go'));
    withAI(data, first, [firstIssue], [{ ...firstIssue, proposed: 'have gone' }, { ...firstIssue, type: 'word_form' }, secondIssue]);
    withAI(data, attempt('repeat', 'I go early.', { task: first.task, dailyPlanTaskId: 'plan-task' }), [past('I go early.')]);
    const summary = outputErrorSummary(data, 14, NOW);
    assert.equal(summary.coverage.submitted, 1);
    assert.equal(summary.coverage.independent, 1);
    assert.equal(summary.coverage.ai, 1);
    const tense = summary.categories.find(c => c.key === 'tense');
    assert.equal(tense?.occurrences, 2);
    assert.equal(tense?.tasks, 1);
    assert.ok(!summary.categories.some(category => category.key === 'word_form'));
    assert.equal(tense?.examples[0]?.attemptId, 'first');
    assert.equal(tense?.examples[0]?.proposed, 'went');
});

test('可重复使用的题目按不同稿计，保存同题同稿只认首次', () => {
    const data = emptyData();
    const first = attempt('first', 'I go home.', { createdAt: daysAgo(9) });
    data.outputAttempts.push(
        first,
        attempt('same-text', first.originalText, { task: first.task }),
        attempt('new-writing', 'I walk early.', { task: first.task }),
    );
    assert.equal(outputErrorSummary(data, 7, NOW).coverage.submitted, 1);
    assert.equal(outputErrorSummary(data, 14, NOW).coverage.submitted, 2);
});

test('本地自然日范围包含起始日零点，旧任务的重评时间不改变归属', () => {
    const data = emptyData();
    data.outputAttempts.push(
        attempt('today', 'I walk home.'),
        attempt('boundary', 'I walk home.', { createdAt: daysAgo(6) }),
        attempt('yesterday-boundary', 'I walk home.', { createdAt: daysAgo(6) - 1, updatedAt: NOW }),
        attempt('fourteen', 'I walk home.', { createdAt: daysAgo(13) }),
        attempt('thirty', 'I walk home.', { createdAt: daysAgo(29) }),
        attempt('outside', 'I walk home.', { createdAt: daysAgo(29) - 1 }),
        attempt('future', 'I walk home.', { createdAt: NOW + 1 }),
    );
    assert.deepEqual([7, 14, 30].map(days => outputErrorSummary(data, days as 7 | 14 | 30, NOW).coverage.submitted), [2, 4, 5]);
});

test('真实本地规则、启发式、自述和无法评估分开，排除模拟和无效反馈', () => {
    const data = emptyData();
    const genuine = attempt('local', 'Several unusually bright blue lamps');
    data.outputAttempts.push(
        { ...genuine, repair: { intendedMeaning: '那儿有几盏蓝灯', userAlternative: genuine.originalText, blockedExpression: '', supportLevel: 0, meaningPreserved: null, evidenceBasis: 'self_reported', evaluatorConfidence: 0.4, source: 'user', at: NOW } },
        attempt('mock', 'mock mock', { feedbackSource: 'mock' }),
        attempt('invalid', 'invalid invalid', { feedbackStatus: 'invalid' }),
        attempt('draft', 'draft draft', { status: 'draft' }),
        attempt('blank', ' ... '),
    );
    withAI(data, attempt('failed', 'I go home'), [past('I go home')], undefined, false);
    withAI(data, attempt('ungrounded', 'I walk home.'), [past('I go home.')]);
    const stale = withAI(data, attempt('stale', 'I Walk home.'), []);
    stale.originalText = 'I walk home.';
    const summary = outputErrorSummary(data, 14, NOW);
    assert.equal(summary.coverage.submitted, 5);
    assert.equal(summary.coverage.ai, 0);
    assert.equal(summary.coverage.deterministic, 1);
    assert.equal(summary.coverage.heuristic, 1);
    assert.equal(summary.coverage.selfReported, 1);
    assert.equal(summary.coverage.unassessable, 5);
    assert.deepEqual(summary.categories.map(c => [c.key, c.source]), [['sentence_punctuation', 'deterministic'], ['missing_predicate_hint', 'heuristic']]);
    assert.deepEqual(summary.recommendations, []);
});

test('跨任务反复出现且独立样本足够才建议复看，最多选两类', () => {
    const data = emptyData();
    for (const id of ['one', 'two', 'assisted']) {
        const text = 'I go to school on Monday.';
        withAI(data, attempt(id, text, { supportLevel: id === 'assisted' ? 1 : 0 }), [past(text), span(text, 'to', 'into', 'preposition'), span(text, 'school', 'the school', 'article')]);
    }
    assert.equal(outputErrorSummary(data, 14, NOW).recommendations.length, 0);
    withAI(data, attempt('three', 'I went there.'), []);
    const summary = outputErrorSummary(data, 14, NOW);
    assert.equal(summary.coverage.independentAi, 3);
    assert.equal(summary.recommendations.length, 2);
    for (const recommendation of summary.recommendations) {
        assert.equal(recommendation.independentTasks, 2);
        assert.equal(recommendation.independentDenominator, 3);
        assert.ok(['one', 'two'].includes(recommendation.example.attemptId));
    }
});

test('写作入口给出自然日选项及可返回真实记录的示例，转义反馈文本', () => {
    const data = emptyData();
    const text = 'I go home.';
    withAI(data, attempt('example', text), [past(text)], [span(text, 'home', '<img src=x>', 'article')]);
    const render = () => outputHubPage({ data, suggestion: null, candidates: [], note: '', handoffs: [], analytics: outputAnalytics(data), selectedType: null, topicDraft: '', minutes: 10, energy: 'normal', errorSummaryDays: 7, errorSummaryNow: NOW });
    const html = render();
    assert.match(html, /id="out-error-summary"/);
    assert.match(html, /value="7" selected/);
    assert.match(html, /value="14"/);
    assert.match(html, /value="30"/);
    assert.match(html, /通过质量门的 AI/);
    assert.match(html, /data-out-open="example"/);
    assert.match(html, /&lt;img src=x&gt;/);
    assert.doesNotMatch(html, /<img src=x>/);
    data.outputAttempts = [];
    const empty = render();
    assert.match(empty, /证据不足/);
    assert.doesNotMatch(empty, /0 处错误/);
});

test('表达概览不会把 AI 无法判断当成意思没有送达', () => {
    const data = emptyData();
    withAI(data, attempt('failed', 'I go home.'), [past('I go home.')], undefined, false);
    withAI(data, attempt('invalid', 'I walked home.'), [past('I go home.')]);
    assert.equal(outputAnalytics(data).meaningDeliveredRate, null);
});

test('旧备份中的真实示例仍可见，缺任务契约时没有打不开的入口', () => {
    const data = emptyData();
    data.outputAttempts.push(
        attempt('old-first', 'I went home', { task: undefined }),
        attempt('old-second', 'I went to school', { task: undefined }),
    );
    const html = outputHubPage({ data, suggestion: null, candidates: [], note: '', handoffs: [], analytics: outputAnalytics(data), selectedType: null, topicDraft: '', minutes: 10, energy: 'normal', errorSummaryNow: NOW });
    assert.match(html, /句末标点/);
    assert.match(html, /独立任务中重复出现/);
    assert.doesNotMatch(html, /data-out-open="old-(?:first|second)"/);
});


test('重复时态问题只链接实际存在的语法练习', () => {
    const data = emptyData();
    for (const id of ['one', 'two', 'three']) {
        const text = 'I go home.';
        withAI(data, attempt(id, text), [past(text)]);
    }
    const render = () => outputHubPage({ data, suggestion: null, candidates: [], note: '', handoffs: [], analytics: outputAnalytics(data),
        selectedType: null, topicDraft: '', minutes: 10, energy: 'normal', errorSummaryNow: NOW });
    assert.doesNotMatch(render(), /data-out-grammar=/);
    data.sentences = curatedSentenceRecords(NOW);
    assert.match(render(), /data-out-grammar="verb.tense"/);
});
