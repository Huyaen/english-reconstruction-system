#!/usr/bin/env node
// —— Phase 13：生产 PWA 离线外壳验收 ——
// 前置（脚本不启动浏览器，避免把用户浏览器数据卷进来）：
//   1) npm run build
//   2) 用独立 profile 启动无头 Edge：
//      msedge.exe --headless=new --remote-debugging-port=9231 \
//        --user-data-dir=%LOCALAPPDATA%\Temp\edge-offline http://127.0.0.1:4180/
//   3) node scripts/offline-smoke.mjs
// 脚本会自行起/停 4180 静态服务，验证 SW 注册、资源缓存、停服后仍能打开首页。
import { spawn } from 'node:child_process';
import http from 'node:http';

const PORT = Number(process.env.OFFLINE_PORT || 4180);
const CDP_PORT = Number(process.env.OFFLINE_CDP || 9231);
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
let server;
let cdp;
try {
    server = spawn(process.execPath, ['server.mjs', '--dir=dist', `--port=${PORT}`], { stdio: 'ignore' });
    for (let i = 0; i < 30; i++) { try { if ((await get(`http://127.0.0.1:${PORT}/`)).status === 200) break; } catch { } await sleep(200); }
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    let target = list.find(x => x.type === 'page' && (x.url || '').includes(String(PORT)));
    if (!target) {
        const created = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(`http://127.0.0.1:${PORT}/`)}`, { method: 'PUT' })).json();
        target = created;
        await sleep(1500);
    }
    if (!target?.webSocketDebuggerUrl) throw new Error('没有可用的 Edge 页面；请按脚本头部注释启动独立 profile 的 CDP 浏览器');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    cdp = new CDP(ws);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.eval(`location.href='http://127.0.0.1:${PORT}/'`);
    await cdp.waitFor('!!document.querySelector("#import")', 30000, 'boot');
    check('生产页面启动', true, await cdp.eval('document.title'));
    check('生产构建不暴露测试钩子', await cdp.eval('typeof window.__planTest === "undefined" && typeof window.__examTest === "undefined"'));
    await cdp.waitFor('navigator.serviceWorker.getRegistration().then(r=>!!r)', 20000, 'sw registration');
    await cdp.eval('navigator.serviceWorker.getRegistration().then(r=>r?.update())');
    await sleep(800);
    await cdp.waitFor('navigator.serviceWorker.ready.then(r=>!!r.active)', 20000, 'sw ready');
    check('Service Worker 已激活', true, await cdp.eval('navigator.serviceWorker.ready.then(r=>r.active.scriptURL)'));
    await cdp.send('Page.reload');
    await cdp.waitFor('!!document.querySelector("#import")', 30000, 'reload');
    await cdp.waitFor('!!navigator.serviceWorker.controller', 15000, 'controller');
    const cached = await cdp.eval('caches.keys().then(async ks=>{const out=[];for(const k of ks){const c=await caches.open(k);for(const r of await c.keys())out.push(new URL(r.url).pathname)}return out})');
    check('应用外壳与 hashed 资源已进入缓存', cached.includes('/index.html') && cached.some(p => p.startsWith('/assets/') && p.endsWith('.js')), JSON.stringify(cached));
    const cacheNames = await cdp.eval('caches.keys()');
    check('PWA 缓存名包含构建指纹', cacheNames.some(k => /^erv2-shell-v2-[a-f0-9]{10}$/.test(k)), JSON.stringify(cacheNames));
    server.kill();
    server = null;
    await sleep(600);
    let reachable = true;
    try { await get(`http://127.0.0.1:${PORT}/`); } catch { reachable = false; }
    check('静态服务器已停止（模拟断网）', !reachable);
    await cdp.send('Page.reload');
    await cdp.waitFor('!!document.querySelector("#import")', 30000, 'offline boot');
    check('断网后仍能打开应用并进入首页', true, await cdp.eval('document.title'));
    check('离线时仍由 Service Worker 提供页面', !!(await cdp.eval('navigator.serviceWorker.controller?.scriptURL')));
    ws.close();
}
catch (e) {
    check('离线验收执行完成', false, e.message);
    if (cdp) {
        try { console.error('页面正文：', (await cdp.eval('document.body.innerText')).slice(0, 400)); } catch { }
        try { console.error('页面地址：', await cdp.eval('location.href')); } catch { }
    }
}
finally {
    if (server) { try { server.kill(); } catch { } }
}
console.log(`\nPhase 13 offline smoke: ${results.filter(Boolean).length}/${results.length}`);
process.exit(results.every(Boolean) ? 0 : 1);
