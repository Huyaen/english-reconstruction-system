import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData } from '../src/db.ts';
import { checkDataIntegrity, integritySummary } from '../src/integrity.ts';
function base() {
    return emptyData();
}
test('干净数据没有结构性问题，摘要如实计数', () => {
    const report = checkDataIntegrity(base());
    assert.equal(report.ok, true);
    assert.equal(report.errors, 0);
    assert.equal(report.warnings, 0);
    assert.match(integritySummary(report), /未发现结构性问题/);
});
test('重复 id、非法 id、坏时间戳都算 error', () => {
    const d = base();
    d.books = [{ id: 'b1', name: '册', created: 1 } as any];
    d.words = [
        { id: 'w1', bookId: 'b1', en: 'a', zh: '甲', order: 0, previewedAt: -1 } as any,
        { id: 'w1', bookId: 'b1', en: 'b', zh: '乙', order: 1 } as any,
        { id: 'bad id', bookId: 'b1', en: 'c', zh: '丙', order: 2 } as any,
    ];
    const report = checkDataIntegrity(d);
    assert.equal(report.ok, false);
    assert.ok(report.issues.some(x => x.code === 'DUPLICATE_ID'));
    assert.ok(report.issues.some(x => x.code === 'INVALID_ID'));
    assert.ok(report.issues.some(x => x.code === 'BAD_TIMESTAMP'));
});
test('孤儿引用一律 warning；结构性问题才是 error', () => {
    const d = base();
    d.words = [{ id: 'w1', bookId: 'missing', en: 'a', zh: '甲', order: 0 } as any];
    d.readingSessions = [{ id: 'r1', passageId: 'gone', at: 1, detail: { state: 'active' } } as any];
    const report = checkDataIntegrity(d);
    assert.equal(report.ok, true, '孤儿引用不把报告升级为结构损坏');
    assert.ok(report.issues.some(x => x.code === 'DANGLING_REF' && x.severity === 'warning' && x.store === 'words'));
    assert.ok(report.issues.some(x => x.code === 'DANGLING_REF' && x.severity === 'warning' && x.store === 'readingSessions'));
});
test('完成态缺少证据时拒绝把数据判为健康', () => {
    const d = base();
    d.inputSessions = [{ id: 'i1', status: 'completed', reflection: null, startedAt: 1, completedAt: 2 } as any];
    d.examSessions = [{ id: 'x1', status: 'completed', completedAt: null, createdAt: 1, itemIds: [] } as any];
    const report = checkDataIntegrity(d);
    assert.ok(report.issues.some(x => x.code === 'DONE_WITHOUT_REFLECTION' && x.severity === 'error'));
    assert.ok(report.issues.some(x => x.code === 'DONE_WITHOUT_TIME' && x.severity === 'error'));
});
test('阅读证据 key 重复会破坏幂等', () => {
    const d = base();
    d.readingSessions = [{
            id: 'r1', passageId: 'p1', at: 1,
            detail: { state: 'completed', firstPassEndedAt: 2, evidence: [{ key: 'k' }, { key: 'k' }] },
        } as any];
    const report = checkDataIntegrity(d);
    assert.ok(report.issues.some(x => x.code === 'DUPLICATE_EVIDENCE_KEY' && x.severity === 'error'));
});
test('审计是纯函数：同一输入得到同一报告，且不修改输入', () => {
    const d = base();
    d.words = [{ id: 'w1', bookId: 'missing', en: 'a', zh: '甲', order: 0 } as any];
    const before = JSON.stringify(d);
    const a = checkDataIntegrity(d);
    const b = checkDataIntegrity(d);
    assert.equal(JSON.stringify(d), before);
    assert.deepEqual(a, b);
    assert.deepEqual(Object.keys(a).sort(), ['byStore', 'checkedRecords', 'checkedStores', 'errors', 'issues', 'ok', 'warnings']);
});
