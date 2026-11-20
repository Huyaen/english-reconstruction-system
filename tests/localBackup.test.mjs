import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rename, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createStaticServer } from '../server.mjs';

test('本机备份跨服务重启、只接收授权的完整 JSON、轮换不碰其他文件', async t => {
    const root = await mkdtemp(path.join(tmpdir(), 'cijian-local-'));
    const dir = path.join(root, 'selected');
    const configFile = path.join(root, 'backup-config.json');
    const web = path.join(root, 'public');
    await mkdir(dir);
    await mkdir(web);
    await writeFile(configFile, JSON.stringify({ directory: dir }));
    await writeFile(path.join(dir, 'keep.json'), 'untouched');
    let server;
    t.after(async () => {
        if (server?.listening) await new Promise(resolve => server.close(resolve));
        await rm(root, { recursive: true, force: true });
    });
    async function start() {
        server = createStaticServer(web, { backupConfig: configFile });
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const port = server.address().port;
        const origin = `http://localhost:${port}`;
        const url = origin + '/__cijian/backup';
        const headers = { 'Sec-Fetch-Site': 'same-origin', 'X-Cijian-Backup': 'status' };
        const res = await fetch(url, { headers });
        assert.equal(res.status, 200);
        const { token } = await res.json();
        return { url, origin, token, headers };
    }
    const first = await start();
    const body = JSON.stringify({ format: 'vocabulary-memory', version: 9, exportedAt: new Date().toISOString(),
        data: { words: [], records: [], books: [], sessions: [], settings: { key: '', rememberKey: false } } });
    const post = (session, override, payload = body) => fetch(session.url, { method: 'POST', body: payload, headers: {
        'Content-Type': 'application/json', 'Sec-Fetch-Site': 'same-origin', 'X-Cijian-Backup': session.token,
        Origin: session.origin, ...override,
    } });
    assert.equal((await fetch(first.url)).status, 403);
    assert.equal((await post(first, { Origin: 'https://other.example' })).status, 403);
    assert.equal((await post(first, { 'X-Cijian-Backup': 'wrong' })).status, 403);
    assert.equal((await post(first, {}, '{')).status, 400);
    assert.equal((await post(first, {}, body.replace('"key":""', '"key":"test-secret"'))).status, 400);
    const written = await post(first, {});
    assert.equal(written.status, 200);
    const { filename, at } = await written.json();
    assert.ok(at > 0);
    assert.deepEqual(JSON.parse(await readFile(path.join(dir, filename), 'utf8')).data, JSON.parse(body).data);
    await new Promise(resolve => server.close(resolve));
    const next = await start();
    assert.notEqual(next.token, first.token);
    assert.equal((await post(next, { 'X-Cijian-Backup': first.token })).status, 403);
    for (let i = 0; i < 15; i++) assert.equal((await post(next, {})).status, 200);
    const names = await readdir(dir);
    assert.equal(names.filter(n => n.startsWith('cijian-local-')).length, 14);
    assert.equal(await readFile(path.join(dir, 'keep.json'), 'utf8'), 'untouched');
    await rename(dir, path.join(root, 'moved'));
    assert.equal((await post(next, {})).status, 503);
    assert.deepEqual(await readdir(path.join(root, 'moved')), names);
});
