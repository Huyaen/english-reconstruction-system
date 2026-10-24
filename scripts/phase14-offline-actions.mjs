#!/usr/bin/env node
// —— Phase 14：离线真实动作验收 ——
// 前置（独立 profile，不碰日常浏览器）：
//   msedge.exe --headless=new --remote-debugging-port=9242 \
//     --user-data-dir=%LOCALAPPDATA%\Temp\edge-p14-offline http://127.0.0.1:4192/
// 脚本会起/停 4192 的 dist 服务：先在生产页面写入一组真实词，完成一次词汇作答，
// 然后停服、刷新、确认记录仍在；证明不是只有“外壳能打开”。
import { spawn } from 'node:child_process';
import http from 'node:http';
const PORT = Number(process.env.P14_OFFLINE_PORT || 4192);
const CDP_PORT = Number(process.env.P14_OFFLINE_CDP || 9242);
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
const words = Array.from({ length: 6 }, (_, i) => ({ id: `p14w${i}`, en: `offline${i}`, zh: `离线词${i}`, pos: '', phonetic: '', example: `An offline example ${i}.`, collocation: '', difficulty: '', tags: 'offline', order: i, bookId: 'p14book', state: { total: 0, correct: 0, streak: 0, errors: 0, lapses: 0, meanMs: 0, lastMs: 0, lastCorrect: false, level: 'new', directions: { 'en-zh': { total: 0, correct: 0, meanMs: 0 }, 'zh-en': { total: 0, correct: 0, meanMs: 0 } } }, schedule: { due: 0, last: 0, interval: 0, step: 0, spacedPasses: 0 }, confusions: {}, recognitionScore: 0, activeRecallScore: 0, productiveScore: 0, exposureCount: 0, contextExposureCount: 0, productionEvidence: 0, previewedAt: 0, lastEncounteredAt: 0, sourceTypes: ['book'], fsrs: { stability: 0, difficulty: 0, state: 0, reps: 0, lapses: 0, due: 0, lastReview: 0, scheduledDays: 0, learningSteps: 0 }, previewResult: '' }));
const seedExpr = `(async()=>{const words=${JSON.stringify(words)};const db=await new Promise((res,rej)=>{const r=indexedDB.open('vocabulary-memory-v1');r.onerror=()=>rej(r.error);r.onsuccess=()=>res(r.result)});const stores=['books','words','records','sessions','analyses','wordExposures','grammarConcepts','grammarAttempts','sentenceAttempts','sentences','passages','readingSessions','inputSources','inputSessions','outputAttempts','dailyPlans','miniUnits','skillSnapshots','weeklyDiagnostics','libraryItems','aiGenerations','transcripts','inputEvidence','examSpecifications','examMaterials','examItems','examSessions','examLogs'];const tx=db.transaction(stores,'readwrite');for(const s of stores)tx.objectStore(s).clear();tx.objectStore('books').put({id:'p14book',name:'Phase14 离线验收',created:Date.now()});for(const w of words)tx.objectStore('words').put(w);await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error||new Error('seed abort'))});db.close();return words.length})()`;
const countExpr = `new Promise((res,rej)=>{const r=indexedDB.open('vocabulary-memory-v1');r.onerror=()=>rej(r.error);r.onsuccess=()=>{const db=r.result;const tx=db.transaction('records','readonly');const q=tx.objectStore('records').count();q.onsuccess=()=>{db.close();res(q.result)};q.onerror=()=>rej(q.error)}})`;
let server, cdp, ws;
try {
    server = spawn(process.execPath, ['server.mjs', '--dir=dist', `--port=${PORT}`], { stdio: 'ignore' });
    for (let i = 0; i < 40; i++) { try { if ((await get(`http://127.0.0.1:${PORT}/`)).status === 200) break; } catch { } await sleep(150); }
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    let target = list.find(x => x.type === 'page' && (x.url || '').includes(String(PORT)));
    if (!target) {
        target = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(`http://127.0.0.1:${PORT}/`)}`, { method: 'PUT' })).json();
        await sleep(1200);
    }
    if (!target?.webSocketDebuggerUrl) throw new Error('没有可用的 Edge 页面；请按脚本头部注释启动独立 profile');
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    cdp = new CDP(ws);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.eval(`location.href='http://127.0.0.1:${PORT}/'`);
    await cdp.waitFor('!!document.querySelector("#import")', 30000, 'boot');
    await cdp.waitFor('navigator.serviceWorker.getRegistration().then(r=>!!r)', 20000, 'sw registration');
    await cdp.eval('navigator.serviceWorker.getRegistration().then(r=>r?.update())');
    await sleep(700);
    await cdp.waitFor('navigator.serviceWorker.ready.then(r=>!!r.active)', 20000, 'sw ready');
    await cdp.send('Page.reload');
    await cdp.waitFor('!!document.querySelector("#import")', 30000, 'controlled reload');
    await cdp.waitFor('!!navigator.serviceWorker.controller', 15000, 'controller');
    const seeded = await cdp.eval(seedExpr);
    check('离线验收词已写入本地数据库', seeded === 6, `${seeded} 词`);
    await cdp.send('Page.reload');
    await cdp.waitFor('!!document.querySelector("[data-nav=books]")', 30000, 'books boot');
    await cdp.eval('document.querySelector("[data-nav=books]")?.click()');
    await cdp.waitFor('!!document.querySelector("#train-filter")', 12000, 'library');
    await cdp.eval('document.querySelector("#train-filter")?.click()');
    await cdp.waitFor('!!document.querySelector("#question-text") || !!document.querySelector("[data-preview]")', 15000, 'training');
    if (await cdp.eval('!!document.querySelector("[data-preview]")'))
        await cdp.eval('document.querySelector("[data-preview=know]")?.click()');
    await cdp.waitFor('!!document.querySelector("#question-text")', 15000, 'recall');
    await cdp.eval('document.querySelector(".answer")?.click()');
    await sleep(1200);
    const before = await cdp.eval(countExpr);
    check('离线前已完成一次真实词汇作答', before > 0, `${before} 条记录`);
    server.kill();
    server = null;
    await sleep(600);
    await cdp.send('Page.reload');
    await cdp.waitFor('!!document.querySelector("#import")', 30000, 'offline boot');
    const after = await cdp.eval(countExpr);
    check('断网刷新后学习记录仍在', after === before && after > 0, `${before} → ${after}`);
    check('断网后仍由 Service Worker 提供外壳', !!(await cdp.eval('navigator.serviceWorker.controller?.scriptURL')), await cdp.eval('document.title'));
    ws.close();
}
catch (e) {
    check('离线真实动作验收执行完成', false, e.message);
    if (cdp) {
        try { console.error('页面正文：', (await cdp.eval('document.body.innerText')).slice(0, 400)); } catch { }
        try { console.error('页面地址：', await cdp.eval('location.href')); } catch { }
    }
}
finally {
    if (server) { try { server.kill(); } catch { } }
}
console.log(`\nPhase 14 offline actions: ${results.filter(Boolean).length}/${results.length}`);
process.exit(results.every(Boolean) ? 0 : 1);
