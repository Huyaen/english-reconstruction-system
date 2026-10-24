import test from 'node:test';
import assert from 'node:assert/strict';
import { CANONICAL_ORIGIN, originNotice } from '../src/origin.ts';
test('推荐地址本身不再提示迁移', () => {
    const o = originNotice(CANONICAL_ORIGIN);
    assert.equal(o.same, true);
    assert.equal(o.hostDifferent, false);
    assert.match(o.message, /已使用推荐地址/);
});
test('127.0.0.1 与 localhost 被识别为不同数据空间', () => {
    const o = originNotice('http://127.0.0.1:4173');
    assert.equal(o.same, false);
    assert.equal(o.hostDifferent, true);
    assert.match(o.message, /127\.0\.0\.1:4173/);
    assert.match(o.message, /localhost:4173/);
    assert.match(o.message, /不同存储空间/);
    assert.match(o.message, /看不到/);
});
test('端口变化同样视为不同 origin', () => {
    const o = originNotice('http://localhost:4174');
    assert.equal(o.same, false);
    assert.equal(o.hostDifferent, false);
    assert.match(o.message, /localhost:4174/);
});
test('非法地址不抛异常，仍给出保守提示', () => {
    const o = originNotice('not a url');
    assert.equal(o.same, false);
    assert.equal(o.hostDifferent, true);
    assert.ok(o.message.length > 10);
});
