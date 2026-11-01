// Phase 16.3：句源说明只按真实库存说话；AI「检查通过」不等于内容可靠
import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceCapabilities, effectiveSourceMix } from '../src/sentenceSources.ts';
import { AI_CHECK_SCOPE_NOTE, sourceMixNote, describeStock } from '../src/uiLabels.ts';
import { checkReadingQuality, summarize } from '../src/aiQuality.ts';
function countsOf(sentences: Parameters<typeof sourceCapabilities>[0]['sentences'], aiConfigured = false): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const c of sourceCapabilities({ sentences, aiConfigured }))
        counts[c.type] = c.count;
    return counts;
}
function fake(type: 'curated' | 'user' | 'saved' | 'ai' | 'real-material' | 'reading', n: number): any[] {
    return Array.from({ length: n }, (_, i) => ({ id: `${type}-${i}`, sourceType: type, structureProvenance: 'gold' }));
}
test('句源说明：40/40/20 只能叫目标，绝不能说成当前出题比例', () => {
    const full = sourceMixNote({ counts: countsOf([...fake('curated', 12), ...fake('user', 4), ...fake('ai', 3), ...fake('real-material', 2)], true) });
    assert.match(full, /目标/);
    assert.match(full, /不是现在的出题比例/);
    assert.match(full, /不按这个比例分配/, '必须说清真实挑选依据不是配额');
    assert.equal(full.includes('正好按这个比例出句子'), false);
});
test('句源说明：全部为空才说「一句都没有」', () => {
    const empty = sourceMixNote({ counts: countsOf([], true) });
    assert.match(empty, /一句都没有/);
    const onlySaved = sourceMixNote({ counts: countsOf(fake('saved', 2), true) });
    assert.doesNotMatch(onlySaved, /一句都没有/, '只有收藏句时不能说句库是空的');
    assert.match(onlySaved, /收藏的难句 2 句/);
});
test('句源说明：AI 已设置但还没有 AI 句，要说的是这一类空着', () => {
    const note = sourceMixNote({ counts: countsOf(fake('curated', 12), true) });
    assert.match(note, /练习句 12 句/);
    assert.match(note, /AI 生成的句子目前还没有句子|AI 生成的句子/, '缺哪一类要说哪一类');
    assert.doesNotMatch(note, /AI 生成的句子 \d+%/, '没有 AI 句时不能给出 AI 占比');
});
test('真实选句器不看 40/40/20：有效配比只是“设计目标推算”，不是抽题结果', () => {
    const caps = sourceCapabilities({ sentences: [...fake('curated', 5), ...fake('ai', 2)], aiConfigured: true });
    const mix = effectiveSourceMix(caps);
    // 该函数只表达「按目标把缺的份额挪给练习句」，页面不再把它当实际比例展示
    assert.ok(mix.mix.ai > 0);
    assert.match(sourceMixNote({ counts: countsOf([...fake('curated', 5), ...fake('ai', 2)], true) }), /不按这个比例分配/);
});
test('库存描述：按固定顺序列出非零来源', () => {
    const text = describeStock({ curated: 3, ai: 1, saved: 2 });
    assert.match(text, /练习句 3 句/);
    assert.match(text, /收藏的难句 2 句/);
    assert.match(text, /AI 生成的句子 1 句/);
    assert.equal(text.indexOf('练习句') < text.indexOf('收藏的难句'), true, '顺序稳定，便于对照');
});
test('内容重复的文章仍能通过「规则检查」——所以页面只能宣称规则项通过', () => {
    const repeated = Array.from({ length: 11 }, () => 'The notebook that the engineers kept recorded the current every spring.').join(' ');
    const quote = 'The notebook that the engineers kept recorded the current every spring.';
    const target = {
        title: 'The Same Notebook', topic: 'river engineering', passage: repeated,
        targetWords: ['notebook', 'current'], targetGrammar: ['clause.relative'], difficultyRationale: '逐句重复，靠长度达标',
        exercises: [0, 1, 2].map(i => ({ type: 'detail', question: 'What recorded the current?', options: ['The notebook', 'The city', 'A storm', 'A bridge'], answerIndex: 0, evidenceQuote: quote })),
    };
    const report = checkReadingQuality(target as never, {
        minWords: 40, maxWords: 400, grammarIds: ['clause.relative'], desired: 'medium',
        existingHashes: new Set<string>(), contentHash: 'h-repeated', unknownWords: [], maxUnknownWords: 8,
    });
    assert.equal(report.ok, true, '11 句重复的内容确实能通过现有规则检查');
    assert.equal(summarize(report), '全部检查通过');
    // 但页面上不能把它说成「内容已经核实」：
    assert.match(AI_CHECK_SCOPE_NOTE, /规则项/);
    assert.match(AI_CHECK_SCOPE_NOTE, /没有人工核对/);
    assert.doesNotMatch(AI_CHECK_SCOPE_NOTE, /事实正确|准确无误|质量保证/);
    // 检查项里也确实没有「内容连贯/事实正确」这类条目
    const labels = report.checks.map(c => c.label).join(',');
    assert.doesNotMatch(labels, /事实|连贯|教学质量/);
});
