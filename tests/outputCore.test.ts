import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTaskSpec, checkAttemptText, canShowModelAnswer, defaultTaskType, taskCriteria, taskMeta, countWords, OUTPUT_TASK_TYPES } from '../src/outputTask.ts';
import { buildSupportHint, recordSupport, classifyIndependence, textSimilarity, shouldFadeSupport, emptySupport } from '../src/outputScaffolding.ts';
import { evaluateRepair, repairSummary, keywordCoverage } from '../src/outputRepair.ts';
import { localChecks, dropUngrounded, prioritize, mergeSpans, applySpans, splitSentences } from '../src/outputDiagnosis.ts';
import type { OutputTaskSpec } from '../src/types.ts';
const NOW = 1700000000000;
function spec(over: Partial<OutputTaskSpec> = {}): OutputTaskSpec {
    return { ...buildTaskSpec({ taskType: 'one_sentence', topic: 'my day', sourceType: 'free', now: NOW }), ...over };
}
test('任务类型：一句话任务不要求篇章结构，总结任务要求衔接', () => {
    const one = spec();
    assert.equal(taskMeta('one_sentence').needsCoherence, false);
    assert.equal(taskCriteria(one).some(c => c.includes('句子是否完整')), true);
    assert.equal(taskCriteria(one).some(c => c.includes('连接')), false);
    const sum = spec({ taskType: 'short_summary' });
    assert.equal(taskCriteria(sum).some(c => c.includes('连接')), true);
    for (const t of Object.keys(OUTPUT_TASK_TYPES))
        assert.ok(taskMeta(t as never).enLabel, '英文任务名是给模型/导出的，界面上只用 zh');
});
test('任务规模由时间与状态决定：时间少只写一句，不强制长度', () => {
    assert.equal(defaultTaskType({ minutes: 5, energy: 'normal', hasSource: true, hasUnit: false }), 'one_sentence');
    assert.equal(defaultTaskType({ minutes: 30, energy: 'good', hasSource: true, hasUnit: false }), 'paragraph_summary');
    assert.equal(defaultTaskType({ minutes: 12, energy: 'normal', hasSource: true, hasUnit: false }), 'short_summary');
    assert.equal(defaultTaskType({ minutes: 6, energy: 'low', hasSource: false, hasUnit: false }), 'one_sentence');
});
test('提交检查只做规模判断：短但意思清楚可以提交', () => {
    const s = spec({ minWords: 25, maxWords: 90 });
    assert.equal(checkAttemptText(s, '').ok, false);
    assert.equal(checkAttemptText(s, 'hi').ok, false);
    const short = checkAttemptText(s, 'The video is about water.');
    assert.equal(short.ok, true);
    assert.equal(short.tooShort, true);
    assert.equal(checkAttemptText(s, 'word '.repeat(500)).ok, false);
    assert.equal(countWords(' one  two '), 2);
});
test('首次作答之前不展示范文', () => {
    assert.equal(canShowModelAnswer(null), false);
    assert.equal(canShowModelAnswer({ status: 'draft' }), false);
    assert.equal(canShowModelAnswer({ status: 'submitted' }), true);
    assert.equal(canShowModelAnswer({ status: 'draft', supportLevel: 4 }), true);
});
test('Scaffolding：分层提示、最高级别只升不降、独立性判定', () => {
    const s = spec({ targetWords: ['aqueduct'] });
    const l1 = buildSupportHint(s, 1);
    const l4 = buildSupportHint(s, 4);
    assert.equal(l1.answerReveal < l4.answerReveal, true);
    let rec = emptySupport('I saw a bridge.');
    rec = recordSupport(rec, buildSupportHint(s, 2), 'I saw a bridge that carried water.');
    rec = recordSupport(rec, buildSupportHint(s, 1), 'I saw a bridge that carried water.');
    assert.equal(rec.highestLevel, 2);
    assert.equal(rec.independentText, 'I saw a bridge.');
    assert.equal(rec.requestedHints.length, 2);
    assert.equal(classifyIndependence({ support: rec, text: 'I wrote this myself.' }).independent, false);
    const fresh = classifyIndependence({ support: emptySupport('x'), text: 'The aqueduct carried water.' });
    assert.equal(fresh.independent, true);
    const copied = classifyIndependence({ support: emptySupport('x'), text: 'The aqueduct carried water into the city.', modelAnswer: 'The aqueduct carried water into the city.' });
    assert.equal(copied.copied, true);
    assert.equal(copied.dependence, 1);
    assert.equal(shouldFadeSupport([true, true, true]), true);
    assert.ok(textSimilarity('a b c', 'a b c') > 0.9);
});
test('Communication Repair：没有目标意义依据时不得判定成功', () => {
    const unknown = evaluateRepair({ intendedMeaning: '', blockedExpression: 'assassination', userAlternative: 'Someone killed the leader.', basis: 'unknown', now: NOW });
    assert.equal(unknown.record.meaningPreserved, null);
    assert.equal(unknown.verdict, 'unknown');
    assert.match(unknown.notes.join(' '), /没有可靠的目标意义/);
    const self = evaluateRepair({ intendedMeaning: '有人暗杀了政治领袖', blockedExpression: 'assassination', userAlternative: 'Someone killed the political leader.', basis: 'self_reported', now: NOW });
    assert.equal(self.record.meaningPreserved, true);
    assert.ok(self.record.evaluatorConfidence <= 0.5);
    assert.match(repairSummary(self), /真实交流能力/);
    const tooShort = evaluateRepair({ intendedMeaning: 'x', blockedExpression: '', userAlternative: 'killed', basis: 'self_reported' });
    assert.equal(tooShort.record.meaningPreserved, false);
    const stillUsed = evaluateRepair({ intendedMeaning: '有人暗杀了领袖', blockedExpression: 'assassination', userAlternative: 'It was an assassination.', basis: 'self_reported' });
    assert.match(stillUsed.notes.join(' '), /仍然使用了/);
    assert.ok(keywordCoverage('the leader was killed', 'someone killed the leader') > 0.5);
});
test('确定性检查：只报能确定的，span 必须能在原文找到', () => {
    const text = 'i saw the the water';
    const r = localChecks(text);
    assert.equal(r.authoritative, false);
    assert.ok(r.spans.some(s => s.type === 'other' && /重复/.test(s.explanation)));
    assert.ok(r.spans.some(s => /标点/.test(s.explanation)));
    const grounded = r.spans.filter(s => text.slice(s.start, s.end) === s.original);
    assert.equal(grounded.length, r.spans.length);
    assert.equal(dropUngrounded(text, [{ ...r.spans[0]!, start: 999, end: 1002 }]).kept.length, 0);
    const long = 'word '.repeat(60) + '.';
    assert.ok(localChecks(long).spans.some(s => s.type === 'coherence'));
    const noVerb = 'The big red car on the road.';
    assert.ok(localChecks(noVerb).spans.some(s => s.type === 'missing_predicate' && s.confidence <= 0.5));
    assert.equal(splitSentences('One. Two! Three?').length, 3);
});
test('最小纠错策略：优先 blocking/major，最多 3 条；重叠 span 只留一条', () => {
    const text = 'He go to school yesterday.';
    const a = { type: 'tense' as const, original: 'go', proposed: 'went', start: 3, end: 5, explanation: '过去时间需要过去式', severity: 'major' as const, confidence: 0.8 };
    const b = { type: 'word_order' as const, original: 'He go', proposed: 'He goes', start: 0, end: 5, explanation: '主谓一致', severity: 'minor' as const, confidence: 0.6 };
    const merged = mergeSpans([], [b, a]);
    assert.equal(merged.length, 1);
    assert.equal(merged[0]!.type, 'tense');
    const many = Array.from({ length: 6 }, (_, i) => ({ ...a, start: i, end: i + 1, original: text[i]!, severity: (i === 5 ? 'blocking' : 'style') as never }));
    assert.equal(prioritize(many).length, 3);
    assert.equal(prioritize(many)[0]!.severity, 'blocking');
    assert.equal(applySpans(text, [a]), 'He went to school yesterday.');
});
