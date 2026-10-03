import test from 'node:test';
import assert from 'node:assert/strict';
import type { MiniUnit } from '../src/types.ts';
import { makeWord } from '../src/core.ts';
import { applyPreview, applyExposure, applyProductionEvidence, applyRecallEvidence, exposureStateFromPreview, isForgotten, isUnseen, lifecycleOf, recallEligible } from '../src/evidence.ts';
import { buildNewWordQueue, learningValue, looksProperNoun, recommendedNewWordCount } from '../src/pools.ts';
test('preview: 记录 previewedAt/result/exposure，但不给 mastery；skip 不产生 exposure', () => {
    const w = makeWord({ en: 'abandon', zh: '放弃' }, 'b', 0);
    assert.ok(isUnseen(w));
    const r = applyPreview(w, 'know', 1000, 'e1');
    assert.equal(r.word.previewedAt, 1000);
    assert.equal(r.word.previewResult, 'know');
    assert.equal(r.word.exposureCount, 1);
    assert.equal(r.word.recognitionScore, 0); // Preview ≠ mastery
    assert.equal(r.exposure!.state, 'known');
    assert.equal(r.exposure!.sourceType, 'preview');
    const sk = applyPreview(w, 'skip', 2000, 'e2');
    assert.equal(sk.exposure, null);
    assert.equal(sk.word.previewResult, 'skip');
    assert.equal(sk.word.exposureCount, 0);
    assert.equal(exposureStateFromPreview('familiar'), 'vague');
});
test('exposure ≠ mastery；recall 证据更新三维分数；生产证据 API 可用', () => {
    const w = makeWord({ en: 'abandon', zh: '放弃' }, 'b', 0);
    const e = applyExposure(w, { sentence: 'they abandon it' }, 500);
    assert.equal(e.exposureCount, 1);
    assert.equal(e.contextExposureCount, 1);
    assert.equal(e.recognitionScore, 0);
    assert.equal(e.activeRecallScore, 0);
    const rec = applyRecallEvidence(e, 'en-zh', 1);
    assert.equal(rec.recognitionScore, 20);
    assert.equal(rec.activeRecallScore, 0);
    const act = applyRecallEvidence(rec, 'zh-en', 0.7);
    assert.equal(act.activeRecallScore, 14);
    const prod = applyProductionEvidence(applyProductionEvidence(applyProductionEvidence(act)));
    assert.equal(prod.productionEvidence, 3);
    assert.ok(prod.productiveScore > 0);
});
test('lifecycle: 升级与回退（多证据，可降级）', () => {
    let w = makeWord({ en: 'w', zh: '词' }, 'b', 0);
    assert.equal(lifecycleOf(w), 'unseen');
    w = applyPreview(w, 'unknown', 10, 'e1').word;
    assert.equal(lifecycleOf(w), 'previewed');
    for (let i = 0; i < 4; i++)
        w = applyRecallEvidence(w, 'en-zh', 1);
    w = { ...w, state: { ...w.state, total: 4, directions: { ...w.state.directions, 'en-zh': { total: 4, correct: 4, meanMs: 800 } } } };
    assert.equal(lifecycleOf(w), 'recognition');
    for (let i = 0; i < 4; i++)
        w = applyRecallEvidence(w, 'zh-en', 1);
    w = { ...w, state: { ...w.state, directions: { ...w.state.directions, 'zh-en': { total: 4, correct: 4, meanMs: 900 } } } };
    assert.equal(lifecycleOf(w), 'active');
    for (let i = 0; i < 3; i++)
        w = applyRecallEvidence(w, 'zh-en', 0);
    assert.equal(lifecycleOf(w), 'recognition'); // 回退
    const p = applyProductionEvidence(applyProductionEvidence(applyProductionEvidence(w)));
    assert.equal(lifecycleOf(p), 'productive');
});
test('forgotten: 有间隔证据且回落的词进入回流；纯新词不会', () => {
    const fresh = makeWord({ en: 'a', zh: '词' }, 'b', 0);
    assert.equal(isForgotten(fresh), false);
    const fg = makeWord({ en: 'b', zh: '词2' }, 'b', 1);
    fg.state = { ...fg.state, total: 6, correct: 4, lapses: 2, level: 'vague' };
    fg.schedule = { ...fg.schedule, spacedPasses: 2, interval: 86400000, due: 1e12 };
    assert.equal(isForgotten(fg), true);
    assert.equal(recallEligible(fresh), false);
    assert.equal(recallEligible(fg), true);
});
test('learning value: 确定性评分、reasons/components、专名降权', () => {
    const core1 = makeWord({ en: 'maintain', zh: '维持', tags: '核心' }, 'b', 0);
    const v1 = learningValue(core1);
    const v2 = learningValue(core1);
    assert.deepEqual(v1, v2);
    assert.ok(v1.reasons.includes('foundation-tag'));
    assert.equal(v1.components.properNoun, 0);
    const name = makeWord({ en: 'Caesar', zh: '凯撒' }, 'b', 1);
    assert.equal(looksProperNoun(name), true);
    const vn = learningValue(name);
    assert.equal(vn.components.properNoun, -25);
    assert.ok(vn.reasons.includes('possible-proper-noun'));
    assert.ok(vn.score < v1.score);
});
test('pools: 多词池选择 + 空池重分配 + forgotten 优先回流', () => {
    const words = [];
    for (let i = 0; i < 10; i++)
        words.push(makeWord({ en: `fw${i}`, zh: `基础${i}` }, 'b', i));
    const enc = [makeWord({ en: 'ec1', zh: '遇见1' }, 'b', 100), makeWord({ en: 'ec2', zh: '遇见2' }, 'b', 101)];
    for (const w of enc) {
        w.exposureCount = 3;
        w.lastEncounteredAt = 500;
    }
    const fg = makeWord({ en: 'fgt', zh: '遗忘词' }, 'b', 200);
    fg.state = { ...fg.state, total: 6, correct: 4, lapses: 2, level: 'vague' };
    fg.schedule = { ...fg.schedule, spacedPasses: 2, due: 1e12 };
    const all = [...words, ...enc, fg];
    const q = buildNewWordQueue(all, { count: 10, miniUnit: null });
    assert.equal(q.breakdown.requested, 10);
    assert.equal(q.breakdown.newCount, 10);
    assert.equal(q.breakdown.forgottenCount, 1);
    assert.equal(q.items[0].kind, 'forgotten');
    assert.equal(q.breakdown.byPool.miniUnit, 0);
    assert.ok(q.breakdown.byPool.foundation >= 8);
    assert.ok(q.breakdown.fallbackReasons.includes('pool-empty-redistribute'));
    const unit: MiniUnit = { id: 'u', theme: 't', dayIndex: 1, anchorMaterialId: '', targetWords: ['fw3'], targetGrammar: [], difficultyTarget: null, status: 'active', startedAt: 0, completedAt: null, dayLog: [] };
    const q2 = buildNewWordQueue(all, { count: 10, miniUnit: unit });
    assert.equal(q2.breakdown.byPool.miniUnit, 1);
});
test('dynamic new count: 保留率、负荷、状态与边界', () => {
    const baseInput = { availableMinutes: 45, energyState: 'normal' as const, d1Retention: 0.9, d7Retention: 0.85, weakLoad: 0, dueLoad: 0 };
    const high = recommendedNewWordCount(baseInput);
    const low = recommendedNewWordCount({ ...baseInput, d7Retention: 0.55 });
    assert.ok(high.recommended > low.recommended);
    assert.ok(low.reasons.includes('d7-low-fewer-new'));
    const heavy = recommendedNewWordCount({ ...baseInput, dueLoad: 100 });
    assert.ok(heavy.recommended < high.recommended);
    assert.ok(heavy.reasons.includes('due-heavy'));
    const tired = recommendedNewWordCount({ ...baseInput, energyState: 'low' });
    assert.ok(tired.recommended < high.recommended);
    const tiny = recommendedNewWordCount({ availableMinutes: 5 });
    assert.equal(tiny.recommended, tiny.min);
    const huge = recommendedNewWordCount({ availableMinutes: 600, d7Retention: 0.9 });
    assert.equal(huge.recommended, huge.max);
});
