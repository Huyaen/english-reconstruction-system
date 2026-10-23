// 静态服务器（无依赖）。用法：node server.mjs [--dir=dist] [--port=4173]
//   --dir ：托管目录（默认 dist；测试构建用 dist-test）——Phase 5.0 测试环境隔离
//   --port：监听端口（默认 4173）
// Phase 13：只接受 GET/HEAD；错误请求明确 400/405；补齐安全响应头；不泄露文件系统路径。
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.woff2': 'font/woff2',
};
const SECURITY_HEADERS = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
};
export function createStaticServer(rootDir) {
    const root = path.resolve(rootDir);
    return http.createServer(async (req, res) => {
        const method = req.method || 'GET';
        if (method !== 'GET' && method !== 'HEAD') {
            res.writeHead(405, { ...SECURITY_HEADERS, Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(method === 'HEAD' ? undefined : 'Method Not Allowed');
            return;
        }
        let pathname;
        try {
            pathname = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
        }
        catch {
            res.writeHead(400, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(method === 'HEAD' ? undefined : 'Bad Request');
            return;
        }
        if (pathname.includes('\0')) {
            res.writeHead(400, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(method === 'HEAD' ? undefined : 'Bad Request');
            return;
        }
        try {
            let file = path.resolve(root, '.' + pathname);
            if (file !== root && !file.startsWith(root + path.sep)) {
                res.writeHead(403, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
                res.end(method === 'HEAD' ? undefined : 'Forbidden');
                return;
            }
            let info = await stat(file);
            if (info.isDirectory()) {
                file = path.join(file, 'index.html');
                info = await stat(file);
            }
            if (!info.isFile())
                throw new Error('not a file');
            const ext = path.extname(file).toLowerCase();
            const hashedAsset = pathname.startsWith('/assets/') && /[-.][a-z0-9]{6,}\.(js|css)$/i.test(pathname);
            const headers = {
                ...SECURITY_HEADERS,
                'Content-Type': TYPES[ext] || 'application/octet-stream',
                'Content-Length': String(info.size),
                'Cache-Control': hashedAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
            };
            res.writeHead(200, headers);
            if (method === 'HEAD') {
                res.end();
                return;
            }
            res.end(await readFile(file));
        }
        catch {
            res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(method === 'HEAD' ? undefined : 'Not found. Run npm run build first.');
        }
    });
}
export function startServer({ dir = 'dist', port = 4173, host = '127.0.0.1' } = {}) {
    const root = path.isAbsolute(dir) ? dir : path.join(import.meta.dirname, dir);
    const server = createStaticServer(root);
    server.listen(port, host, () => console.log(`词间已启动：http://localhost:${port} （目录 ${dir}，按 Ctrl+C 停止）`));
    return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const argv = process.argv.slice(2);
    const arg = (name, fallback) => {
        const hit = argv.find(a => a.startsWith(`--${name}=`));
        return hit ? hit.slice(name.length + 3) : fallback;
    };
    startServer({ dir: arg('dir', 'dist'), port: Number(arg('port', '4173')) });
}
