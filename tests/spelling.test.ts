import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWord } from '../src/core.ts';
import { buildSpellingQueue, normalizeSpelling, spellingAttempt } from '../src/spelling.ts';
const word = (en: string, zh: string) => makeWord({ en, zh, pos: 'n.' }, 'book', 0);

test('统一首尾和连续空格、弯撇号；大小写、连字符及其他标点严格保留', () => {
    assert.equal(normalizeSpelling('  New   York  '), 'New York');
    assert.equal(normalizeSpelling('don’t'), "don't");
    for (const [expected, input] of [['China', 'china'], ['Miss', 'miss'], ['well-known', 'well known'], ['well-known', 'well–known'], ["don't", 'dont'], ['New York', 'NewYork'], ['word', 'word.']]) {
        assert.equal(spellingAttempt(word(expected, '测试释义'), input, 's', false, false, 1).correct, false);
    }
    assert.equal(spellingAttempt(word('New York', '纽约'), 'New   York', 's', false, false, 1).correct, true);
});
test('共享完整释义、大小写合并词、释义泄漏答案均排除；不限制正常短语', () => {
    const ws = [word('large', '大的；巨大的'), word('big', '巨大的'), word('head', '头部'), word('skull', '头部骨骼'), word('China/china', '中国；瓷器'), word('Miss/miss', '小姐；想念'), word('apple', 'apple 苹果'), word('New York', '纽约'), word("don't", '不要')];
    const result = buildSpellingQueue(ws, ws);
    assert.deepEqual(result.words.map(w => w.en), ['head', 'skull', 'New York', "don't"]);
    assert.equal(result.excluded.length, 5);
});
test('辅助与重练独立留痕，生成证据不改原词任何字段', () => {
    const w = word('apple', '苹果'), before = structuredClone(w);
    const a = spellingAttempt(w, 'apple', 'round', true, true, 123);
    assert.equal(a.correct, true); assert.equal(a.assisted, true); assert.equal(a.retry, true);
    assert.equal(a.normalizationVersion, 1); assert.deepEqual(w, before);
});

test('规范化后的释义和可见词性中也不能泄漏英文答案', () => {
    const ws = [word('New York', 'New   York 纽约'), word("don't", 'don’t 不要'), { ...word('apple', '苹果'), pos: 'apple' }];
    assert.equal(buildSpellingQueue(ws, ws).words.length, 0);
});

test('激光与激光唱片不是同义答案，中文子串相同不能单独造成排除', () => {
    const ws = [word('laser', 'n. 激光'), { ...word('CD', 'abbr. 光盘，激光唱片（Compact Disc）'), pos: 'abbr.' }];
    assert.ok(buildSpellingQueue(ws, ws).words.some(w => w.en === 'laser'));
    assert.equal(spellingAttempt(ws[0], 'CD', 's', false, false, 1).correct, false);
});

test('括号内枚举不能拆成独立释义；括号外真实同义片段仍排除', () => {
    const ws = [word('board', '板；上（船、火车、公共汽车、飞机等）'), word('bus', '公共汽车'), word('bed', '床；(湖、海的)底'), word('lake', '湖'), word('keeper', '看守人;保管人'), word('watchman', "([复] watchmen /'wɒtʃmən/) 看守人")];
    const result = buildSpellingQueue(ws, ws);
    assert.deepEqual(result.words.map(w => w.en), ['board', 'bus', 'bed', 'lake']);
    assert.equal(spellingAttempt(ws[0], 'bus', 's', false, false, 1).correct, false);
});
