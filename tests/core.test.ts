import test from 'node:test';
import assert from 'node:assert/strict';
import * as core from '../src/core.ts';
import { defaults } from '../src/types.ts';
const word = () => core.makeWord({ en: 'test', zh: '测试' }, 'book', 0);
test('classification boundaries and timeout', () => { assert.equal(core.classify(true, 1500, defaults), 'fluent'); assert.equal(core.classify(true, 1501, defaults), 'normal'); assert.equal(core.classify(true, 3001, defaults), 'vague'); assert.equal(core.classify(true, 6000, defaults), 'unknown'); assert.equal(core.classify(false, 200, defaults), 'unknown'); });
test('early repetitions cannot inflate long term interval', () => {
    let w = word();
    w = core.review(w, true, 900, 'en-zh', defaults, 1000000);
    const due = w.schedule.due;
    for (let i = 0; i < 10; i++)
        w = core.review(w, true, 800, 'zh-en', defaults, 1000100 + i);
    assert.equal(w.schedule.due, due);
    assert.equal(w.schedule.spacedPasses, 0);
    assert.notEqual(w.state.level, 'fluent');
});
test('spaced bidirectional success extends intervals and failure resets', () => {
    let w = word();
    for (let i = 0; i < 8; i++)
        w = core.review(w, true, 800, i % 2 ? 'zh-en' : 'en-zh', defaults, Math.max(1e6, w.schedule.due));
    assert.equal(w.state.level, 'fluent');
    assert.ok(w.schedule.interval > 86400000);
    w = core.review(w, false, 1000, 'en-zh', defaults, w.schedule.due);
    assert.equal(w.state.level, 'unknown');
    assert.equal(w.schedule.interval, 600000);
    assert.equal(w.state.lapses, 1);
});
test('options exclude overlapping meanings, never invent words', () => {
    const ws = ['放弃；抛弃', '放弃', '充足', '可靠', '犹豫', '维持', '明显'].map((zh, i) => core.makeWord({ en: 'word' + i, zh }, 'b', i));
    for (let i = 0; i < 20; i++) {
        const q = core.question(ws[0], ws, 'zh-en', 'hard');
        assert.ok(!q.options.includes(ws[1].id));
        assert.equal(new Set(q.options).size, 6);
        assert.ok(q.options.includes(ws[0].id));
    }
});
test('insufficient distinct distractors raises useful error', () => { assert.throws(() => core.question(word(), [], 'en-zh', 'normal'), /至少/); });
