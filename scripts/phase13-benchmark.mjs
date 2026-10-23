#!/usr/bin/env node
// —— Phase 13：可复现的浏览器性能基准（合成数据，不是真实长期使用数据）——
// 前置：
//   npm run build:test
//   node server.mjs --dir=dist-test --port=4173
//   msedge --headless=new --remote-debugging-port=9233 --user-data-dir=<独立 profile> http://127.0.0.1:4173/?test=1
// 运行：node scripts/phase13-benchmark.mjs
// 数据集 A=空；C=3,000 词/6,000 记录；D=12,000 词/30,000 记录。均为 synthetic。
import fs from 'node:fs';
import http from 'node:http';

const CDP_PORT = Number(process.env.BENCH_CDP || 9233);
const APP = 'http://127.0.0.1:4173/?test=1';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = url => new Promise((resolve, reject) => { const req = http.get(url, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b })); }); req.on('error', reject); req.setTimeout(3000, () => req.destroy(new Error('timeout'))); });
class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } }; }
    send(method, params = {}) { return new Promise((res, rej) => { const id = ++this.id; this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
    async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; }
    async waitFor(expr, ms = 30000, label = expr) { const end = Date.now() + ms; while (Date.now() < end) { try { if (await this.eval(expr)) return; } catch { } await sleep(100); } throw new Error('timeout ' + label); }
}
const pct = (arr, p) => { const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * p))]; };
const median = arr => pct(arr, 0.5);
const fmt = n => `${Math.round(n * 10) / 10}ms`;

async function main() {
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const target = list.find(x => x.type === 'page' && (x.url || '').includes('4173')) || list.find(x => x.type === 'page' && !x.url.startsWith('edge://'));
    if (!target?.webSocketDebuggerUrl) throw new Error('没有可用的 CDP 页面；请按脚本头部注释启动');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const cdp = new CDP(ws);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.eval(`location.href=${JSON.stringify(APP)}`);
    await cdp.waitFor('!!(window.__planTest && document.querySelector("#main"))', 30000, 'boot');
    // 取一个真实词作为结构模板；不含用户真实数据。
    await cdp.eval('__planTest.seedUnified()');
    const template = await cdp.eval(`(async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('vocabulary-memory-v1');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});const w=await new Promise((r,j)=>{const q=db.transaction('words').objectStore('words').getAll();q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});db.close();return w[0]})()`);
    if (!template) throw new Error('无法取得词条模板');

    async function clearAll() {
        await cdp.eval(`(async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('vocabulary-memory-v1');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});const names=[...db.objectStoreNames];await new Promise((r,j)=>{const tx=db.transaction(names,'readwrite');for(const n of names)tx.objectStore(n).clear();tx.oncomplete=r;tx.onerror=()=>j(tx.error)});db.close()})()`);
    }
    async function seed(words, records) {
        return cdp.eval(`(async()=>{const base=${JSON.stringify(template)};const N=${words},R=${records};const db=await new Promise((r,j)=>{const q=indexedDB.open('vocabulary-memory-v1');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});const now=Date.now();const t0=performance.now();await new Promise((r,j)=>{const tx=db.transaction(['words','records'],'readwrite');const ws=tx.objectStore('words'),rs=tx.objectStore('records');for(let i=0;i<N;i++){const id='bench-w-'+i;const w={...base,id,en:'benchword'+i,zh:'合成词'+i,createdAt:now-i,previewedAt:0,previewResult:null,state:{...base.state}};ws.put(w)}for(let i=0;i<R;i++){const id='bench-r-'+i;rs.put({id,wordId:'bench-w-'+(i%N),sessionId:'bench-session',at:now-i*1000,direction:'en-zh',correct:i%3!==0,ms:1200+i%800,selectedId:'bench-w-'+(i%N),reason:'answer',before:'normal',after:'normal',scheduled:true,rating:3})}tx.oncomplete=r;tx.onerror=()=>j(tx.error)});db.close();return {seedMs:performance.now()-t0}})()`);
    }
    async function reloadAndMeasure(label, runs = 2) {
        const out = [];
        for (let i = 0; i < runs; i++) {
            await cdp.send('Page.reload', { ignoreCache: false });
            const t0 = Date.now();
            await cdp.waitFor('!!document.querySelector("#main") && document.querySelector("#main").innerText.trim().length>0', 60000, label + ' render');
            const nav = await cdp.eval('(()=>{const n=performance.getEntriesByType("navigation")[0];return {dcl:n.domContentLoadedEventEnd,load:n.loadEventEnd,fetch:n.fetchStart,now:performance.now(),heap:performance.memory?.usedJSHeapSize??null}})()');
            const readyMs = Date.now() - t0;
            out.push({ readyMs, dcl: nav.dcl, load: nav.load, now: nav.now, heapMB: nav.heap ? Math.round(nav.heap / 1048576) : null });
            await sleep(600);
        }
        return out;
    }
    async function readAll() {
        return cdp.eval(`(async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('vocabulary-memory-v1');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});const t0=performance.now();const names=[...db.objectStoreNames];const data={};for(const n of names)data[n]=await new Promise((r,j)=>{const q=db.transaction(n).objectStore(n).getAll();q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});const t1=performance.now();const json=JSON.stringify(data);db.close();return {readMs:t1-t0,size:json.length,counts:Object.fromEntries(names.map(n=>[n,data[n].length]))}})()`);
    }
    async function planTime() {
        const has = await cdp.eval('!!document.querySelector("#plan-create")');
        if (!has)
            return null;
        const t0 = Date.now();
        await cdp.eval('document.querySelector("#plan-create").click()');
        await cdp.waitFor('!!document.querySelector("#plan-panel")', 60000, 'plan');
        return Date.now() - t0;
    }

    const stats = arr => {
        const ready = arr.map(x => x.readyMs);
        return { median: Math.round(median(ready)), p95: Math.round(pct(ready, 0.95)), worst: Math.round(Math.max(...ready)), heapMB: arr.map(x => x.heapMB).filter(v => v !== null) };
    };
    const report = { generatedAt: new Date().toISOString(), environment: 'headless Edge, local static server, synthetic datasets', datasets: [] };
    // A：空数据
    await clearAll();
    const a = await reloadAndMeasure('A', 3);
    report.datasets.push({ name: 'A 空', words: 0, records: 0, ready: stats(a), samples: a });
    // C
    const seedC = await seed(3000, 6000);
    const c = await reloadAndMeasure('C', 3);
    const readC = await readAll();
    const planC = await planTime();
    report.datasets.push({ name: 'C 日常', words: 3000, records: 6000, seedMs: Math.round(seedC.seedMs), ready: stats(c), readMs: Math.round(readC.readMs), backupBytes: readC.size, planMs: planC, samples: c });
    // D
    await clearAll();
    const seedD = await seed(12000, 30000);
    const d = await reloadAndMeasure('D', 3);
    const readD = await readAll();
    const planD = await planTime();
    report.datasets.push({ name: 'D 压力', words: 12000, records: 30000, seedMs: Math.round(seedD.seedMs), ready: stats(d), readMs: Math.round(readD.readMs), backupBytes: readD.size, planMs: planD, samples: d });
    report.samples = { C: c, D: d };
    const dist = 'dist';
    report.build = fs.existsSync(dist) ? Object.fromEntries(fs.readdirSync(`${dist}/assets`).map(f => [f, fs.statSync(`${dist}/assets/${f}`).size])) : null;
    await clearAll();
    await cdp.send('Page.reload');
    console.log(JSON.stringify(report, null, 2));
    ws.close();
}
main().catch(e => { console.error('BENCHMARK FAILED:', e.message); process.exit(1); });
