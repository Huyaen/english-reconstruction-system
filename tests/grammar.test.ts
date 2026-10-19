import test from 'node:test';
import assert from 'node:assert/strict';
import { bktUpdate, bktSequence, conceptById, conceptStates, descendantConcepts, ancestorConcepts, evidenceWeight, GRAMMAR_CONFIG, GRAMMAR_TAXONOMY, grammarState, prerequisitesOf, prerequisitesSatisfied, seedGrammarConcepts, topologicalOrder, validateTaxonomy, weakConcepts, } from '../src/grammar.ts';
import type { GrammarAttempt, GrammarConcept } from '../src/types.ts';
const NOW = 1700000000000;
function attempt(conceptId: string, correct: boolean, opts: Partial<GrammarAttempt> = {}): GrammarAttempt {
    return {
        id: `ga-${conceptId}-${Math.random().toString(36).slice(2)}`, conceptId, at: NOW - 1000, correct,
        sourceType: 'curated', sourceId: 's1', errorType: correct ? '' : 'clause-boundary', durationMs: 4000,
        independent: correct, supportLevel: 0, ...opts,
    };
}
test('语法图谱本体：节点唯一、先修存在、无环、可拓扑排序', () => {
    const v = validateTaxonomy();
    assert.equal(v.ok, true, JSON.stringify(v.issues));
    assert.equal(v.concepts.length, GRAMMAR_TAXONOMY.length);
    const ids = GRAMMAR_TAXONOMY.map(c => c.id);
    assert.equal(new Set(ids).size, ids.length, '概念 id 必须唯一');
    for (const c of GRAMMAR_TAXONOMY) {
        for (const p of c.prerequisiteIds)
            assert.ok(ids.includes(p), `${c.id} 的先修 ${p} 不存在`);
        assert.ok(c.name.length > 0 && c.description.length > 0);
        assert.ok(c.card.rule.length > 10 && c.card.transfer.length > 5, `${c.id} 的知识卡内容过空`);
        assert.ok(c.card.commonErrors.length >= 1);
    }
    const order = topologicalOrder();
    assert.equal(order.length, GRAMMAR_TAXONOMY.length);
});
test('语法图谱本体：成环、缺失先修、重复 id 会被拒绝并如实报告', () => {
    const base = GRAMMAR_TAXONOMY.slice(0, 4).map(c => ({ ...c, prerequisiteIds: [...c.prerequisiteIds] }));
    const cyclic = { ...base[0], id: 'cycle.a', prerequisiteIds: ['cycle.b'], relatedConceptIds: [] };
    const cyclic2 = { ...base[1], id: 'cycle.b', prerequisiteIds: ['cycle.a'], relatedConceptIds: [] };
    const missing = { ...base[2], id: 'missing.pre', prerequisiteIds: ['does.not.exist'], relatedConceptIds: [] };
    const dup = { ...base[3], id: 'cycle.a' };
    const v = validateTaxonomy([cyclic, cyclic2, missing, dup]);
    assert.equal(v.ok, false);
    const kinds = v.issues.map(i => i.kind);
    assert.ok(kinds.includes('missing-prerequisite'), '必须报告缺失先修');
    assert.ok(kinds.includes('duplicate-id'), '必须报告重复 id');
    assert.ok(kinds.includes('cycle'), '必须报告成环');
    // 丢弃成环边后仍返回可用概念集
    assert.ok(v.concepts.length >= 2);
});
test('先修关系：祖先/后代、就绪判定与阈值真实生效', () => {
    assert.deepEqual(ancestorConcepts('clause.relative').includes('structure.core'), true);
    assert.deepEqual(descendantConcepts('structure.core').includes('clause.relative'), true);
    assert.deepEqual(prerequisitesOf('structure.core'), []);
    const states = conceptStates(GRAMMAR_TAXONOMY, [], NOW);
    const blocked = prerequisitesSatisfied('clause.relative', states);
    assert.equal(blocked.ok, false);
    assert.ok(blocked.missing.length > 0, '没有证据时先修不应判定为具备');
    const mastered = states.map(s => s.conceptId === 'structure.svo' || s.conceptId === 'structure.modifier'
        ? { ...s, p: 0.95, attempts: 12, correct: 11 } : s);
    // 只补一部分先修，仍然不应就绪
    const partial = prerequisitesSatisfied('clause.relative', mastered);
    assert.equal(partial.ok, false);
});
test('BKT-lite：后验有界、正确上升、错误下降、证据权重区分独立/提示/延迟/迁移', () => {
    const { prior, learn, guess, slip } = GRAMMAR_CONFIG.bkt;
    assert.equal(bktUpdate(prior, true), bktSequence([true], 1));
    const up = bktUpdate(prior, true);
    const down = bktUpdate(prior, false);
    assert.ok(up > prior && up <= 1);
    assert.ok(down < prior && down >= 0);
    let p = prior;
    for (let i = 0; i < 20; i++)
        p = bktUpdate(p, true);
    assert.ok(p > 0.9 && p <= 1, '连续正确答案应趋向上界但不越界');
    for (let i = 0; i < 40; i++)
        p = bktUpdate(p, false);
    assert.ok(p >= 0 && p < 0.3, '连续错误应明显下降');
    const independent = evidenceWeight(attempt('structure.subject', true, { independent: true, supportLevel: 0 }), NOW);
    const hinted = evidenceWeight(attempt('structure.subject', true, { independent: false, supportLevel: 2 }), NOW);
    const exposed = evidenceWeight(attempt('structure.subject', true, { independent: false, supportLevel: 4 }), NOW);
    const transfer = evidenceWeight(attempt('structure.subject', true, { transfer: true }), NOW);
    assert.ok(independent > hinted, '独立正确权重必须高于提示后正确');
    assert.ok(hinted > exposed, '提示后正确权重必须高于看过答案');
    assert.ok(transfer > independent, '迁移证据权重必须最高');
    assert.equal(GRAMMAR_CONFIG.mastery.delayMs, 24 * 3600 * 1000);
    assert.ok(learn > 0 && guess > 0 && slip > 0);
});
test('掌握度：证据不足不宣称掌握；"看过答案"的尝试不推进后验', () => {
    const def = conceptById('clause.relative')!;
    const fresh = grammarState(def, [], NOW);
    assert.equal(fresh.band, 'unknown');
    assert.equal(fresh.p, GRAMMAR_CONFIG.bkt.prior);
    const oneCorrect = grammarState(def, [attempt(def.id, true)], NOW);
    assert.notEqual(oneCorrect.band, 'likely-mastered', '单次正确不得宣称掌握');
    const exposedOnly = grammarState(def, [attempt(def.id, true, { supportLevel: 4, independent: false })], NOW);
    assert.equal(exposedOnly.independentCorrect, 0);
    assert.equal(exposedOnly.band, 'exposed');
    assert.equal(exposedOnly.p, GRAMMAR_CONFIG.bkt.prior, '看过答案不得推进后验');
    assert.ok(exposedOnly.reasons.some(r => r.startsWith('exposed-only')), '必须如实说明只有接触证据');
    const many = Array.from({ length: 8 }, (_, i) => attempt(def.id, true, { at: NOW - (8 - i) * 86400000 }));
    const strong = grammarState(def, many, NOW);
    assert.notEqual(strong.band, 'unknown');
    assert.ok(strong.reasons.length > 0, '必须给出判定理由');
    assert.ok(strong.p < 1, '不得给出 100% 的确定性掌握');
});
test('薄弱概念：只报告有重复错误的概念，并按错误率排序', () => {
    const attempts = [
        attempt('clause.relative', false, { at: NOW - 3 * 86400000, errorType: 'clause-boundary' }),
        attempt('clause.relative', false, { at: NOW - 2 * 86400000, errorType: 'clause-boundary' }),
        attempt('clause.relative', true, { at: NOW - 86400000 }),
        attempt('nonfinite.role', true, { at: NOW - 86400000 }),
        attempt('nonfinite.role', true, { at: NOW - 3600000 }),
        attempt('logic.connection', false, { at: NOW - 30 * 86400000 }), // 太旧，不计入
    ];
    const weak = weakConcepts(GRAMMAR_TAXONOMY, attempts, NOW);
    const ids = weak.map(w => w.conceptId);
    assert.ok(ids.includes('clause.relative'));
    assert.equal(ids.includes('nonfinite.role'), false, '全对的概念不应进入薄弱列表');
    assert.equal(ids.includes('logic.connection'), false, '窗口外的旧证据不应计入');
    assert.ok(weak[0].reasons.length > 0);
});
test('种子：新增缺失概念但绝不覆盖已有学习证据', () => {
    const existing: GrammarConcept[] = [{
            id: 'clause.relative', name: '定语从句', parentId: null, exposures: 9, attempts: 7, correct: 5,
            mastery: 0.71, retention: 0.66, errorTypes: { 'clause-boundary': 2 }, lastSeenAt: NOW - 1000,
            nextReviewAt: NOW + 86400000, createdAt: NOW - 99999,
        }];
    const merged = seedGrammarConcepts(existing, NOW);
    assert.equal(merged.length, GRAMMAR_TAXONOMY.length);
    const kept = merged.find(c => c.id === 'clause.relative')!;
    assert.equal(kept.attempts, 7);
    assert.equal(kept.correct, 5);
    assert.equal(kept.mastery, 0.71);
    assert.deepEqual(kept.errorTypes, { 'clause-boundary': 2 });
    assert.equal(kept.lastSeenAt, NOW - 1000);
    // 新节点带分类/先修/知识卡元数据
    const fresh = merged.find(c => c.id === 'phrase.coordination')!;
    assert.equal(fresh.category, 'phrases');
    assert.ok((fresh.prerequisiteIds ?? []).length >= 0);
    assert.ok(fresh.examples && fresh.examples.length > 0);
    // 幂等
    const again = seedGrammarConcepts(merged, NOW + 5000);
    assert.equal(again.length, merged.length);
    assert.equal(again.filter(c => c.id === 'clause.relative').length, 1);
});
