import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStaticServer } from '../server.mjs';

async function fixture() {
    const root = await mkdtemp(path.join(os.tmpdir(), 'erv2-server-'));
    await writeFile(path.join(root, 'index.html'), '<!doctype html><title>ok</title>');
    await mkdir(path.join(root, 'assets'));
    await writeFile(path.join(root, 'assets', 'app-abc123.js'), 'export const ok = true;');
    const server = createStaticServer(root);
    await new Promise(res => server.listen(0, '127.0.0.1', res));
    const port = server.address().port;
    return { root, server, port, close: async () => { await new Promise(res => server.close(res)); await rm(root, { recursive: true, force: true }); } };
}
function raw(port, rawPath, method = 'GET') {
    return new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path: rawPath, method }, res => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', c => body += c);
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
        });
        req.on('error', reject);
        req.end();
    });
}
test('静态服务器：GET/HEAD、缓存、安全头与路径穿越', async () => {
    const f = await fixture();
    try {
        const page = await raw(f.port, '/');
        assert.equal(page.status, 200);
        assert.match(page.body, /<title>ok<\/title>/);
        assert.equal(page.headers['x-content-type-options'], 'nosniff');
        assert.equal(page.headers['x-frame-options'], 'DENY');
        assert.equal(page.headers['referrer-policy'], 'no-referrer');
        assert.equal(page.headers['cache-control'], 'no-cache');

        const head = await raw(f.port, '/', 'HEAD');
        assert.equal(head.status, 200);
        assert.equal(head.body, '');
        assert.ok(Number(head.headers['content-length']) > 0);

        const asset = await raw(f.port, '/assets/app-abc123.js');
        assert.equal(asset.status, 200);
        assert.match(asset.headers['cache-control'], /immutable/);
        assert.match(asset.headers['content-type'], /javascript/);

        const post = await raw(f.port, '/', 'POST');
        assert.equal(post.status, 405);
        assert.equal(post.headers.allow, 'GET, HEAD');

        const traversal = await raw(f.port, '/%2e%2e/secret.txt');
        assert.ok([403, 404].includes(traversal.status));
        assert.doesNotMatch(traversal.body, /secret|Users|:\\\\/i);

        const bad = await raw(f.port, '/%E0%A4%A');
        assert.equal(bad.status, 400);

        const missing = await raw(f.port, '/missing');
        assert.equal(missing.status, 404);
        assert.doesNotMatch(missing.body, new RegExp(f.root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    }
    finally {
        await f.close();
    }
});
