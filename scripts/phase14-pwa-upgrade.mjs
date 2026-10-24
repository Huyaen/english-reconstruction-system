#!/usr/bin/env node
// —— Phase 14：PWA A→B 更新验收 ——
// 前置：用独立 profile 启动无头 Edge（不要用日常浏览器 profile）：
//   msedge.exe --headless=new --remote-debugging-port=9240 \
//     --user-data-dir=%LOCALAPPDATA%\Temp\edge-pwa14 http://127.0.0.1:4190/
// 脚本会把当前 dist 复制成 A/B 两版，在同一个 origin 上先装 A，再切换 B，
// 检查缓存版本更替、数据标记保留、B 停服后仍可离线打开。
import { spawn } from 'node:child_process';
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import { join } from 'node:path';
const PORT = Number(process.env.PWA_PORT || 4190);
const CDP_PORT = Number(process.env.PWA_CDP || 9240);
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  · ' + detail : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = url => new Promise((resolve, reject) => { const req = http.get(url, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b })); }); req.on('error', reject); req.setTimeout(3000, () => req.destroy(new Error('timeout'))); });
class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } }; }
    send(method, params = {}) { return new Promise((res, rej) => { const id = ++this.id; this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
    async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; }
    async waitFor(expr, ms = 20000, label = expr) { const end = Date.now() + ms; while (Date.now() < end) { try { if (await this.eval(expr)) return true; } catch { } await sleep(250); } throw new Error('timeout ' + label); }
}
function startServer(dir) {
    const p = spawn(process.execPath, ['server.mjs', `--dir=${dir}`, `--port=${PORT}`], { stdio: 'ignore' });
    return p;
}
async function waitServer() {
    for (let i = 0; i < 40; i++) { try { if ((await get(`http://127.0.0.1:${PORT}/`)).status === 200) return true; } catch { } await sleep(150); }
    return false;
}
const markerSet = `new Promise((res,rej)=>{const r=indexedDB.open('vocabulary-memory-v1');r.onerror=()=>rej(r.error);r.onsuccess=()=>{const db=r.result;const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put({id:'phase14-update-marker',value:{kept:true}});tx.oncomplete=()=>{db.close();res(true)};tx.onerror=()=>rej(tx.error)}})`;
const markerGet = `new Promise((res,rej)=>{const r=indexedDB.open('vocabulary-memory-v1');r.onerror=()=>rej(r.error);r.onsuccess=()=>{const db=r.result;const tx=db.transaction('meta','readonly');const q=tx.objectStore('meta').get('phase14-update-marker');q.onsuccess=()=>{db.close();res(q.result?.value?.kept===true)};q.onerror=()=>rej(q.error)}})`;
let server, cdp, ws;
try {
    rmSync('dist-a', { recursive: true, force: true });
    cpSync('dist', 'dist-a', { recursive: true });
    const aSw = readFileSync('dist-a/sw.js', 'utf8').replace(/const CACHE = 'erv2-shell-v2-[a-f0-9]+';/, "const CACHE = 'erv2-shell-a';");
    writeFileSync('dist-a/sw.js', aSw);
    const bSw = readFileSync('dist/sw.js', 'utf8');
    const bCache = bSw.match(/const CACHE = '([^']+)'/)?.[1] || '';
    if (!bCache.startsWith('erv2-shell-v2-')) throw new Error('B 版缓存名没有构建指纹，先 npm run build');
    server = startServer('dist-a');
    if (!await waitServer()) throw new Error('A 版静态服务未启动');
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    let target = list.find(x => x.type === 'page' && (x.url || '').includes(String(PORT)));
    if (!target) {
        const created = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(`http://127.0.0.1:${PORT}/`)}`, { method: 'PUT' })).json();
        target = created;
        await sleep(1200);
    }
    if (!target?.webSocketDebuggerUrl) throw new Error('没有可用的 Edge 页面；请按脚本头部注释启动独立 profile 的 CDP 浏览器');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    cdp = new CDP(ws);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.eval(`location.href='http://127.0.0.1:${PORT}/'`);
    await cdp.waitFor('!!document.querySelector("#import")', 30000, 'A boot');
    await cdp.waitFor('navigator.serviceWorker.getRegistration().then(r=>!!r)', 20000, 'A registration');
    await cdp.eval('navigator.serviceWorker.getRegistration().then(r=>r?.update())');
    await sleep(800);
    await cdp.waitFor('navigator.serviceWorker.ready.then(r=>!!r.active)', 20000, 'A ready');
    await cdp.send('Page.reload');
    await cdp.waitFor('!!document.querySelector("#import")', 30000, 'A reload');
    await cdp.waitFor('!!navigator.serviceWorker.controller', 15000, 'A controller');
    await cdp.eval('localStorage.setItem("phase14-update-marker","kept")');
    await cdp.eval(markerSet);
    const aCaches = await cdp.eval('caches.keys()');
    check('A 版外壳已缓存', aCaches.includes('erv2-shell-a'), JSON.stringify(aCaches));
    check('A 版数据标记已写入', await cdp.eval('localStorage.getItem("phase14-update-marker")==="kept" && ' + markerGet));
    server.kill();
    server = null;
    await sleep(500);
    server = startServer('dist');
    if (!await waitServer()) throw new Error('B 版静态服务未启动');
    await cdp.eval('navigator.serviceWorker.getRegistration().then(r=>r?.update())');
    await sleep(1500);
    await cdp.waitFor(`caches.keys().then(ks=>ks.includes(${JSON.stringify(bCache)}))`, 25000, 'B cache');
    const bCaches = await cdp.eval('caches.keys()');
    check('B 版缓存已安装', bCaches.includes(bCache), bCache);
    check('旧 A 版缓存已清理', !bCaches.includes('erv2-shell-a'), JSON.stringify(bCaches));
    await cdp.send('Page.reload');
    await cdp.waitFor('!!document.querySelector("#import")', 30000, 'B reload');
    check('B 版更新后数据标记仍在', await cdp.eval('localStorage.getItem("phase14-update-marker")==="kept" && ' + markerGet));
    server.kill();
    server = null;
    await sleep(500);
    await cdp.send('Page.reload');
    await cdp.waitFor('!!document.querySelector("#import")', 30000, 'B offline boot');
    check('B 版停服后仍可离线打开', true, await cdp.eval('document.title'));
    check('B 版离线仍由新缓存控制', !!(await cdp.eval('navigator.serviceWorker.controller?.scriptURL')));
    ws.close();
}
catch (e) {
    check('PWA A→B 更新执行完成', false, e.message);
    if (cdp) {
        try { console.error('页面正文：', (await cdp.eval('document.body.innerText')).slice(0, 300)); } catch { }
        try { console.error('页面地址：', await cdp.eval('location.href')); } catch { }
    }
}
finally {
    if (server) { try { server.kill(); } catch { } }
    rmSync('dist-a', { recursive: true, force: true });
}
console.log(`\nPhase 14 PWA upgrade: ${results.filter(Boolean).length}/${results.length}`);
process.exit(results.every(Boolean) ? 0 : 1);
