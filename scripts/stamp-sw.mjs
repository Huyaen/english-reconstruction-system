#!/usr/bin/env node
// —— 构建后给 service worker 盖上内容指纹（Phase 14）——
// 预缓存清单或任何构建产物变化时，缓存名必须变化；否则旧 hashed 资源会继续被
// 旧外壳引用，A→B 更新可能拿到半新半旧的页面。这里用构建产物文件名 + 外壳源文件
// 计算指纹，构建期自动写入 dist/sw.js，避免靠人记得手动改版本号。
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const distArg = process.argv.find(a => a.startsWith('--dir='));
const dist = distArg ? distArg.slice(6) : (process.env.PWA_DIST || 'dist');
const swPath = join(dist, 'sw.js');
if (!existsSync(swPath)) {
    console.error('stamp-sw: dist/sw.js 不存在，先运行 vite build');
    process.exit(1);
}
const shellFiles = ['index.html', 'manifest.webmanifest', 'icon.svg', 'sw.js'];
const assets = existsSync(join(dist, 'assets')) ? readdirSync(join(dist, 'assets')).sort() : [];
const hash = createHash('sha256');
hash.update(assets.join('|'));
for (const name of shellFiles) {
    const p = join(dist, name);
    if (existsSync(p))
        hash.update(readFileSync(p));
}
hash.update(readFileSync('public/sw.js'));
const buildId = hash.digest('hex').slice(0, 10);
const source = readFileSync(swPath, 'utf8');
const next = source.replace(/const CACHE = 'erv2-shell-v2(?:-[a-f0-9]+)?';/, `const CACHE = 'erv2-shell-v2-${buildId}';`);
if (next === source && !source.includes(`erv2-shell-v2-${buildId}`)) {
    console.error('stamp-sw: 未找到 CACHE 声明');
    process.exit(1);
}
writeFileSync(swPath, next);
console.log(`stamp-sw: ${dist}/sw.js → erv2-shell-v2-${buildId}（${assets.length} 个资源）`);
