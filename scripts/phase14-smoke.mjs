#!/usr/bin/env node
// —— Phase 14：长期使用与数据安全 E2E ——
// 前置（脚本不启动浏览器，避免碰日常浏览器数据）：
//   1) npm run build:test
//   2) node server.mjs --dir=dist-test --port=4173
//   3) 用独立 profile 启动无头 Edge，CDP 9230，打开 http://127.0.0.1:4173/?test=1
//   4) node scripts/phase14-smoke.mjs
// 覆盖：origin 数据空间隔离、推荐地址提示、完整备份往返、旧备份缺可选域、
//       恢复写入异常时事务回滚、双标签页、无自动跳转。PWA A→B 见 phase14-pwa-upgrade.mjs。
import http from 'node:http';
const PORT = Number(process.env.P14_PORT || 4173);
const CDP_PORT = Number(process.env.P14_CDP || 9230);
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  · ' + detail : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } }; }
    send(method, params = {}) { return new Promise((res, rej) => { const id = ++this.id; this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
    async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; }
    async waitFor(expr, ms = 20000, label = expr) { const end = Date.now() + ms; while (Date.now() < end) { try { if (await this.eval(expr)) return true; } catch { } await sleep(250); } throw new Error('timeout ' + label); }
}
async function connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const c = new CDP(ws);
    await c.send('Runtime.enable');
    await c.send('Page.enable');
    return { c, ws };
}
const markerSet = `new Promise((res,rej)=>{const r=indexedDB.open('vocabulary-memory-v1');r.onerror=()=>rej(r.error);r.onsuccess=()=>{const db=r.result;const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put({id:'phase14-origin-marker',value:{origin:location.origin}});tx.oncomplete=()=>{db.close();res(true)};tx.onerror=()=>rej(tx.error)}})`;
const markerGet = `new Promise((res,rej)=>{const r=indexedDB.open('vocabulary-memory-v1');r.onerror=()=>rej(r.error);r.onsuccess=()=>{const db=r.result;const tx=db.transaction('meta','readonly');const q=tx.objectStore('meta').get('phase14-origin-marker');q.onsuccess=()=>{db.close();res(q.result?.value?.origin||null)};q.onerror=()=>rej(q.error)}})`;
let cdp, ws;
try {
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const target = list.find(x => x.type === 'page' && (x.url || '').includes(String(PORT))) || list.find(x => x.type === 'page');
    if (!target?.webSocketDebuggerUrl) throw new Error('没有可用的 Edge 页面；请按脚本头部注释启动 CDP 浏览器');
    // 只保留一个应用页；上一个测试遗留的第二标签页会持有启动锁，导致“已在另一个窗口打开”。
    for (const t of list.filter(x => x.type === 'page' && x.id !== target.id && (x.url || '').includes(String(PORT))))
        await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${t.id}`).catch(() => { });
    await sleep(400);
    ({ c: cdp, ws } = await connect(target.webSocketDebuggerUrl));
    // 测试构建不注册 SW；若同一 origin 之前跑过生产构建，先清掉旧 SW/缓存，
    // 否则旧外壳会把生产页面（无测试钩子）继续喂给测试。
    await cdp.eval('navigator.serviceWorker.getRegistrations().then(rs=>Promise.all(rs.map(r=>r.unregister()))).then(()=>caches.keys()).then(ks=>Promise.all(ks.map(k=>caches.delete(k))))');
    await cdp.send('Page.reload', { ignoreCache: true });
    await cdp.eval(`location.href='http://127.0.0.1:${PORT}/?test=1'`);
    await cdp.waitFor('!!(window.__planTest && window.__inputTest && document.querySelector("[data-nav=home]"))', 30000, 'boot');
    await cdp.eval('window.__planTest.seedUnified()');
    await sleep(600);

    // A. origin 数据空间隔离
    await cdp.eval(markerSet);
    check('127.0.0.1 写入的标记可读', (await cdp.eval(markerGet)) === `http://127.0.0.1:${PORT}`);
    await cdp.eval(`location.href='http://localhost:${PORT}/?test=1'`);
    await cdp.waitFor('!!(window.__planTest && window.__inputTest && document.querySelector("[data-nav=home]"))', 30000, 'localhost boot');
    const crossOrigin = await cdp.eval(markerGet);
    check('localhost 与 127.0.0.1 数据空间隔离', crossOrigin !== `http://127.0.0.1:${PORT}`, String(crossOrigin));
    await cdp.eval(`location.href='http://127.0.0.1:${PORT}/?test=1'`);
    await cdp.waitFor('!!(window.__planTest && window.__inputTest && document.querySelector("[data-nav=home]"))', 30000, 'back boot');
    check('返回原地址仍能看到原数据', (await cdp.eval(markerGet)) === `http://127.0.0.1:${PORT}`);

    // B. 设置页地址提示：只提示，不自动跳转
    await cdp.eval('document.querySelector("[data-nav=settings]")?.click()');
    await cdp.waitFor('!!document.querySelector("#origin-panel")', 10000, 'origin panel');
    const originPanel = await cdp.eval('(()=>{const p=document.querySelector("#origin-panel");return {current:p?.dataset.originCurrent,canonical:p?.dataset.originCanonical,same:p?.dataset.originSame,text:p?.innerText||""}})()');
    check('设置页显示当前与推荐数据地址', originPanel.current === `http://127.0.0.1:${PORT}` && originPanel.canonical === 'http://localhost:4173', JSON.stringify(originPanel));
    check('非推荐地址明确提示迁移风险', originPanel.same === 'false' && /不同地址|不会自动合并|迁移/.test(originPanel.text));
    check('不会自动跳转地址', (await cdp.eval('location.hostname')) === '127.0.0.1');

    // 先从干净数据开始，避免上一轮 smoke 的孤儿记录影响“完整备份”往返。
    await cdp.eval(`(async()=>{const db=await new Promise((r,j)=>{const q=indexedDB.open('vocabulary-memory-v1');q.onsuccess=()=>r(q.result);q.onerror=()=>j(q.error)});const names=[...db.objectStoreNames];await new Promise((r,j)=>{const tx=db.transaction(names,'readwrite');for(const n of names)tx.objectStore(n).clear();tx.oncomplete=r;tx.onerror=()=>j(tx.error)});db.close();return true})()`);
    await cdp.send('Page.reload');
    await cdp.waitFor('!!(window.__planTest && window.__inputTest && document.querySelector("[data-nav=home]"))', 30000, 'clean boot');
    await cdp.eval('window.__planTest.seedUnified()');
    await sleep(500);

    // C. 完整备份往返
    const backupText = await cdp.eval('window.__inputTest.backupJson()');
    const backup = JSON.parse(backupText);
    const stores = ['books', 'words', 'records', 'sessions', 'analyses', 'wordExposures', 'grammarConcepts', 'grammarAttempts', 'sentenceAttempts', 'sentences', 'passages', 'readingSessions', 'inputSources', 'inputSessions', 'outputAttempts', 'dailyPlans', 'miniUnits', 'skillSnapshots', 'weeklyDiagnostics', 'libraryItems', 'aiGenerations', 'transcripts', 'inputEvidence', 'examSpecifications', 'examMaterials', 'examItems', 'examSessions', 'examLogs'];
    check('备份包含全部数据域', backup.format === 'vocabulary-memory' && stores.every(k => Array.isArray(backup.data[k])), `${stores.length} stores`);
    const before = { words: backup.data.words.length, records: backup.data.records.length, sources: backup.data.inputSources.length, exams: backup.data.examItems.length };
    await cdp.eval(`window.__inputTest.restoreJson(${JSON.stringify(backupText)})`);
    await cdp.waitFor('!!(window.__planTest && window.__inputTest)', 15000, 'restore boot');
    const afterText = await cdp.eval('window.__inputTest.backupJson()');
    const after = JSON.parse(afterText).data;
    check('完整备份恢复后核心计数一致', after.words.length === before.words && after.records.length === before.records && after.inputSources.length === before.sources && after.examItems.length === before.exams, JSON.stringify({ before, after: { words: after.words.length, records: after.records.length } }));

    // D. 旧备份缺可选域：校验/恢复后仍能打开，缺的域补空
    const legacy = structuredClone(backup);
    legacy.version = 6;
    for (const k of ['sentences', 'examSpecifications', 'examMaterials', 'examItems', 'examSessions', 'examLogs', 'transcripts', 'inputEvidence', 'weeklyDiagnostics'])
        delete legacy.data[k];
    const legacyText = JSON.stringify(legacy);
    let legacyOk = false;
    try {
        await cdp.eval(`window.__inputTest.restoreJson(${JSON.stringify(legacyText)})`);
        legacyOk = true;
    }
    catch { legacyOk = false; }
    check('旧版本备份缺可选域仍可恢复', legacyOk && (await cdp.eval('typeof window.__planTest === "object"')));
    await cdp.eval(`window.__inputTest.restoreJson(${JSON.stringify(backupText)})`);
    await cdp.waitFor('!!(window.__planTest && window.__inputTest)', 15000, 'restore original');

    // E. 恢复写入中途异常：事务回滚，原数据不变
    const beforeFault = JSON.parse(await cdp.eval('window.__inputTest.backupJson()')).data.words.length;
    const faultResult = await cdp.eval(`(async()=>{const orig=IDBObjectStore.prototype.put;let hit=0;IDBObjectStore.prototype.put=function(v){if(this.name==='words'){hit++;throw new Error('phase14-fault')}return orig.call(this,v)};let msg='';try{await window.__inputTest.restoreJson(${JSON.stringify(backupText)})}catch(e){msg=String(e)}finally{IDBObjectStore.prototype.put=orig}return {msg,hit}})()`);
    await sleep(300);
    const afterFault = JSON.parse(await cdp.eval('window.__inputTest.backupJson()')).data.words.length;
    check('恢复写入异常会回滚且不报告成功', /phase14-fault|事务|保存|结构/.test(faultResult.msg) && afterFault === beforeFault, JSON.stringify({ faultResult, beforeFault, afterFault }));

    // F. 双标签页：同一 origin 可并发打开，互不破坏
    const list2 = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const existing = list2.filter(x => x.type === 'page').length;
    const created = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?${encodeURIComponent(`http://127.0.0.1:${PORT}/?test=1`)}`, { method: 'PUT' })).json();
    await sleep(1200);
    const second = await connect(created.webSocketDebuggerUrl);
    await second.c.waitFor('document.body.innerText.includes("已在另一个窗口打开")', 25000, 'second tab lock');
    const lockText = await second.c.eval('document.body.innerText');
    check('第二标签页被启动锁拦住，不并发写同一数据库', /已在另一个窗口打开/.test(lockText), `${existing} → ${existing + 1}`);
    await second.ws.close();
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/close/${created.id}`).catch(() => { });
    ws.close();
}
catch (e) {
    check('Phase 14 E2E 执行完成', false, e.message);
    if (cdp) {
        try { console.error('页面正文：', (await cdp.eval('document.body.innerText')).slice(0, 300)); } catch { }
        try { console.error('页面地址：', await cdp.eval('location.href')); } catch { }
    }
}
console.log(`\nPhase 14 smoke: ${results.filter(Boolean).length}/${results.length}`);
process.exit(results.every(Boolean) ? 0 : 1);
