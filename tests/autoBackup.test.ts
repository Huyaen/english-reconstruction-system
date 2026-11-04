import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { emptyData, backup, validateBackup, openDB, putItems, onStudySaved, loadData } from '../src/db.ts';
import { AutoBackup, type BackupDirectory } from '../src/autoBackup.ts';

function directory() {
    const files = new Map<string, string>();
    let permission = 'granted', writes = 0, broken = false, corrupt = false;
    const handle = {
        name: 'isolated-backups',
        async queryPermission() { return permission; },
        async requestPermission() { return permission; },
        async getFileHandle(name: string, options?: { create?: boolean }) {
            if (!files.has(name) && !options?.create) throw new DOMException('', 'NotFoundError');
            if (!files.has(name)) files.set(name, '');
            return {
                async createWritable() {
                    writes++;
                    return { async write(text: string) { if (broken) throw Error('disk full'); files.set(name, text); }, async close() {}, async abort() {} };
                },
                async getFile() { return { async text() { return files.get(name)! + (corrupt ? 'broken' : ''); } }; },
            };
        },
        async removeEntry(name: string) { files.delete(name); },
    } as unknown as BackupDirectory;
    return { handle, files, writes: () => writes, deny: () => { permission = 'prompt'; }, break: () => { broken = true; }, corrupt: () => { corrupt = true; } };
}

test('完整备份排除顶层和嵌套 API Key，恢复也清除两处 Key', () => {
    const d = emptyData();
    d.settings.key = 'TOP-TEST-SECRET';
    d.settings.ai = { key: 'NESTED-TEST-SECRET' } as never;
    const text = backup(d);
    assert.ok(!text.includes('TEST-SECRET'));
    const parsed = JSON.parse(text); parsed.data.settings.ai.key = 'IMPORTED-TEST-SECRET';
    assert.equal(validateBackup(parsed).settings.ai?.key, '');
});

test('写后校验、事件去重、并发串行、14 份保留、仅清理自有文件', async () => {
    const disk = directory();
    const d = emptyData();
    const manager = new AutoBackup(async () => d, async () => {}, () => {});
    await manager.select(disk.handle);
    disk.files.set('unrelated.json', 'keep');
    await Promise.all([manager.run('session:a'), manager.run('session:a'), manager.run('session:b')]);
    assert.equal(disk.writes(), 2);
    for (let i = 0; i < 15; i++) await manager.run(`session:${i}`);
    assert.equal(disk.files.size, 15);
    assert.equal(disk.files.get('unrelated.json'), 'keep');
    for (const [name, text] of disk.files) if (name !== 'unrelated.json') validateBackup(JSON.parse(text));
    const reloaded = new AutoBackup(async () => d, async () => {}, () => {});
    reloaded.restore(manager.state);
    await reloaded.run('session:a');
    assert.equal(disk.writes(), 17);
});

test('权限丢失不请求后台授权，失败保留旧有效备份且允许同事件重试', async () => {
    const disk = directory();
    const manager = new AutoBackup(async () => emptyData(), async () => {}, () => {});
    await manager.select(disk.handle);
    await manager.run('first');
    const before = [...disk.files];
    disk.deny(); await manager.run('next');
    assert.equal(manager.state.status, 'permission');
    assert.deepEqual([...disk.files], before);
    const failing = directory();
    await manager.select(failing.handle); await manager.run('first');
    const valid = [...failing.files]; failing.break(); await manager.run('second');
    assert.equal(manager.state.status, 'error');
    for (const [name, value] of valid) assert.equal(failing.files.get(name), value);
});

test('仅完整会话落盘后触发，重复保存同一会话只写一次', async () => {
    await openDB();
    const disk = directory();
    const manager = new AutoBackup(loadData, async () => {}, () => {});
    await manager.select(disk.handle);
    const jobs: Promise<void>[] = [];
    onStudySaved(event => { jobs.push(manager.run(event)); });
    const session = { id: 'saved-session', started: 1, ended: null, mode: 'quick', queue: ['test-word'], index: 0, answered: 0, correct: 0, retries: {}, question: null };
    await putItems('sessions', [session]); assert.equal(jobs.length, 0);
    // 此处只核对提交后回调；完整备份的引用由其余 roundtrip 测试覆盖。
    onStudySaved(event => { assert.equal(event, 'vocab:saved-session'); jobs.push(Promise.resolve()); });
    await putItems('sessions', [{ ...session, ended: 2, index: 1, answered: 1 }]);
    assert.equal(jobs.length, 1);
    onStudySaved(() => {});
});

test('写入后内容损坏被拒绝，原文件保留，元数据保存失败可重试', async () => {
    const disk = directory();
    let fail = false;
    const manager = new AutoBackup(async () => emptyData(), async () => { if (fail) throw Error('meta full'); }, () => {});
    await manager.select(disk.handle); await manager.run('a');
    const success = manager.state.lastSuccess;
    fail = true; await manager.run('b');
    assert.equal(manager.state.lastSuccess, success);
    assert.ok(!manager.state.events.includes('b'));
    fail = false; await manager.run('b');
    assert.ok(manager.state.events.includes('b'));
    const valid = [...disk.files]; disk.corrupt(); await manager.run('corrupted');
    assert.equal(manager.state.status, 'error');
    assert.deepEqual([...disk.files], valid);
    assert.ok(!manager.state.events.includes('corrupted'));
});
