import { randomUUID } from 'node:crypto';
import { link, lstat, open, readFile, readdir, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';

const route = '/__cijian/backup';
const limit = 64 * 1024 * 1024;
const ownedName = /^cijian-local-\d{13}-[0-9a-f-]{36}\.json$/;

function isBackup(value) {
    const d = value?.data;
    return value?.format === 'vocabulary-memory' && value.version === 9 && Number.isFinite(Date.parse(value.exportedAt))
        && Array.isArray(d?.words) && Array.isArray(d?.records) && Array.isArray(d?.books) && Array.isArray(d?.sessions)
        && d.settings?.key === '' && d.settings.rememberKey === false && (!d.settings.ai || d.settings.ai.key === '');
}

export function localBackup(configFile, staticRoot) {
    const token = randomUUID();
    let writing = false;
    async function directory() {
        const { directory: configured } = JSON.parse(await readFile(configFile, 'utf8'));
        if (typeof configured !== 'string' || !path.isAbsolute(configured) || configured.startsWith('\\\\'))
            throw Error('Invalid backup directory');
        const canonical = await realpath(configured);
        const relative = path.relative(await realpath(staticRoot), canonical);
        if (path.relative(configured, canonical) !== '' || !(await lstat(canonical)).isDirectory()
            || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith('..' + path.sep)))
            throw Error('Invalid backup directory');
        return canonical;
    }
    async function rotate(dir, newest) {
        const names = (await readdir(dir, { withFileTypes: true }))
            .filter(entry => entry.isFile() && ownedName.test(entry.name) && entry.name !== newest)
            .map(entry => entry.name).sort();
        for (const name of names.slice(0, Math.max(0, names.length - 13))) {
            const old = path.join(dir, name);
            const saved = JSON.parse(await readFile(old, 'utf8'));
            if (saved.autoBackup?.transport === 'cijian-local' && saved.autoBackup.filename === name && isBackup(saved))
                await unlink(old);
        }
    }
    return async (req, res) => {
        if (req.url !== route) return false;
        const send = (status, body) => {
            res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
            res.end(JSON.stringify(body));
            return true;
        };
        const expectedHost = `localhost:${req.socket.localPort}`;
        if (!['127.0.0.1', '::1'].includes(req.socket.remoteAddress) || req.headers.host !== expectedHost || req.headers['sec-fetch-site'] !== 'same-origin')
            return send(403, {});
        if (req.method === 'GET' && req.headers['x-cijian-backup'] === 'status') {
            try {
                await directory();
                return send(200, { token });
            } catch { return send(503, { error: '本机备份目录未配置或不可用。' }); }
        }
        if (req.method !== 'POST' || req.headers.origin !== `http://${expectedHost}` || req.headers['x-cijian-backup'] !== token)
            return send(403, {});
        if (req.headers['content-type'] !== 'application/json') return send(415, {});
        // 同一进程只处理一笔，避免轮换与并发写入互相影响。
        if (writing) return send(409, { error: '本机备份正在写入，请稍后重试。' });
        const length = Number(req.headers['content-length']);
        if (!Number.isSafeInteger(length) || length <= 0 || length > limit)
            return send(413, { error: '备份文件大小超出本机写入限制。' });
        writing = true;
        let temp;
        let result;
        try {
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            let data;
            try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
            catch { return send(400, { error: '备份不是有效的 JSON。' }); }
            if (!isBackup(data)) return send(400, { error: '备份结构不完整或含密钥。' });
            const dir = await directory();
            const filename = `cijian-local-${Date.now()}-${randomUUID()}.json`;
            const text = JSON.stringify({ ...data, autoBackup: { transport: 'cijian-local', filename } });
            temp = path.join(dir, `.${filename}.tmp`);
            const fd = await open(temp, 'wx', 0o600);
            try {
                await fd.writeFile(text, 'utf8');
                await fd.sync();
            } finally { await fd.close(); }
            if (await readFile(temp, 'utf8') !== text) throw Error('Verification failed');
            // 完整写入后再发布，硬链接创建失败不会覆盖已有文件。
            await link(temp, path.join(dir, filename));
            const at = Date.now();
            const retained = await rotate(dir, filename).then(() => true, () => false);
            result = { filename, at, retained };
        } catch {
            result = null;
        } finally {
            if (temp) await unlink(temp).catch(() => {});
            writing = false;
        }
        return result ? send(200, result) : send(503, { error: '本机备份未写入，请检查目录、磁盘空间和写入权限。' });
    };
}
