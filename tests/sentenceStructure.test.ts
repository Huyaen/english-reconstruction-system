import test from 'node:test';
import assert from 'node:assert/strict';
import { clauseForToken, fallbackStructure, heuristicStructure, readStructure, structureMetrics, structureRows, structureSummary, tokenize, validateStructure, } from '../src/sentenceStructure.ts';
import { buildGoldStructure, curatedById, curatedSpecs } from '../src/sentenceSources.ts';
test('gold 结构：12 条人工审校句全部通过校验（越界/自环/环/多根/从句嵌套）', () => {
    const specs = curatedSpecs();
    assert.equal(specs.length, 12);
    for (const spec of specs) {
        const st = buildGoldStructure(spec);
        const v = validateStructure(st);
        assert.equal(v.ok, true, `${spec.id}: ${JSON.stringify(v.issues)}`);
        assert.equal(st.provenance, 'gold');
        assert.equal(st.confidence, 1);
        assert.equal(st.tokens.length, tokenize(spec.text).length);
        // 恰好一个根
        assert.equal(st.tokens.filter(t => t.head === -1).length, 1, `${spec.id} 必须恰好一个根`);
        // 每个 token 归属到包含它的最内层子句
        for (const t of st.tokens) {
            const c = st.clauses.find(x => x.id === t.clauseId)!;
            assert.ok(c.start <= t.i && t.i <= c.end, `${spec.id}: token ${t.i} 不在其子句范围内`);
            const inner = st.clauses.filter(x => x.start <= t.i && t.i <= x.end)
                .sort((a, b) => (a.end - a.start) - (b.end - b.start))[0];
            assert.equal(t.clauseId, inner.id, `${spec.id}: token ${t.i} 应归属最内层子句`);
        }
    }
});
test('校验器：越界 head / 自环 / 环 / 多根 / 从句父级缺失 / 从句范围越界 都会失败', () => {
    const base = buildGoldStructure(curatedById('sen.curated.relative-01')! ? curatedSpecs()[0] : curatedSpecs()[0]);
    const mutate = (fn: (x: ReturnType<typeof buildGoldStructure>) => void) => {
        const copy = JSON.parse(JSON.stringify(base));
        fn(copy);
        return validateStructure(copy);
    };
    assert.equal(validateStructure(base).ok, true);
    assert.ok(mutate(x => { x.tokens[0].head = 999; }).issues.some(i => i.kind === 'head-range'));
    assert.ok(mutate(x => { x.tokens[0].head = 0; }).issues.some(i => i.kind === 'self-head'));
    assert.ok(mutate(x => { x.tokens.forEach((t, i) => { t.head = i === 0 ? 1 : 0; }); }).issues.some(i => i.kind === 'cycle'));
    assert.ok(mutate(x => { x.tokens.forEach(t => { t.head = -1; }); }).issues.some(i => i.kind === 'multi-root'));
    assert.ok(mutate(x => { x.clauses[1].parentId = 'nope'; }).issues.some(i => i.kind === 'clause-parent'));
    assert.ok(mutate(x => { x.clauses[0].end = 99; }).issues.some(i => i.kind === 'clause-range'));
    assert.ok(mutate(x => { x.tokens[0].clauseId = 'nope'; }).issues.some(i => i.kind === 'clause-token'));
});
test('无结构 / 坏结构：降级为显式标记的骨架，不伪造句法树', () => {
    const none = readStructure(undefined, 'sen.x', 'The plan will fail.');
    assert.equal(none.ok, false);
    assert.equal(none.structure.provenance, 'none');
    assert.equal(none.structure.confidence, 0);
    assert.equal(none.structure.clauses.length, 1);
    assert.ok(none.structure.note.includes('无法获得可靠结构'));
    assert.ok(none.structure.tokens.every(t => t.role === 'other'), '无结构时不得编造成分角色');
    const garbage = readStructure({ nope: 1 }, 'sen.y', 'The plan will fail.');
    assert.equal(garbage.ok, false);
    assert.equal(garbage.structure.provenance, 'none');
    assert.ok(garbage.issues.length > 0);
    const fb = fallbackStructure('sen.z', 'One two three.');
    assert.equal(fb.tokens.length, 3);
    assert.equal(fb.tokens[0].head, -1);
    assert.equal(fb.clauses.length, 1);
});
test('启发式切分：标记为不确定，只按引导词切范围，不宣称完整依赖分析', () => {
    const h = heuristicStructure('sen.h', 'Although it rained they continued the work.');
    assert.equal(h.provenance, 'heuristic');
    assert.ok(h.confidence < 0.6);
    assert.ok(h.note.includes('不确定') || h.note.includes('未经分析'));
    assert.ok(h.clauses.length >= 1);
    // 不允许把每个词都标成确定成分
    const confidentRoles = h.tokens.filter(t => ['subject', 'predicate', 'object'].includes(t.role));
    assert.equal(confidentRoles.length, 0, '启发式结果不得断言主谓宾角色');
});
test('结构查询：rows 顺序、head 文本、子句归属、span 文本与摘要', () => {
    const spec = curatedSpecs().find(s => s.id === 'sen.curated.relative-01')!;
    const st = buildGoldStructure(spec);
    const rows = structureRows(st);
    assert.deepEqual(rows.map(r => r.tokenIndex), st.tokens.map(t => t.i));
    assert.equal(rows.find(r => r.text === 'report')!.role, 'subject');
    assert.equal(rows.find(r => r.text === 'report')!.headText, 'is');
    assert.equal(clauseForToken(st, 4)!.kind, 'relative');
    assert.equal(clauseForToken(st, 1)!.kind, 'main');
    const summary = structureSummary(st);
    assert.equal(summary.ok, true);
    assert.equal(summary.clauseCount, 2);
    assert.deepEqual(summary.clauseKinds, ['main', 'relative']);
    assert.equal(summary.provenance, 'gold');
    const metrics = structureMetrics(st);
    assert.equal(metrics.tokenCount, st.tokens.length);
    assert.equal(metrics.maxDepth, 1);
    assert.ok(metrics.subordinatorCount >= 1);
});
