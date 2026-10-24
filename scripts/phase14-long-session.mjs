#!/usr/bin/env node
// —— Phase 14：长时间会话加速压力（观测，不冒充 4 小时真实使用）——
// 前置：dist-test 4173 + 独立 Edge CDP 9230（?test=1）。
// 循环切换全部页面，记录 usedJSHeapSize / DOM 节点 / JS 异常。
// 结论只用于发现明显单调泄漏；真实 4 小时使用仍需用户设备验收。
import http from 'node:http';
const PORT = Number(process.env.P14_LONG_PORT || 4173);
const CDP_PORT = Number(process.env.P14_LONG_CDP || 9230);
const CYCLES = Number(process.env.P14_LONG_CYCLES || 80);
const sleep = ms => new Promise(r => setTimeout(r, ms));
class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.errors = []; ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.method === 'Runtime.exceptionThrown') this.errors.push(m.params?.exceptionDetails?.text || 'exception'); if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } }; }
    send(method, params = {}) { return new Promise((res, rej) => { const id = ++this.id; this.pending.set(id, { res, rej }); this.ws.send(JSON.stringify({ id, method, params })); }); }
    async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 200)); return r.result.value; }
    async waitFor(expr, ms = 15000) { const end = Date.now() + ms; while (Date.now() < end) { try { if (await this.eval(expr)) return true; } catch { } await sleep(150); } return false; }
}
const pages = ['home', 'books', 'weak', 'sentence', 'reading', 'input', 'output', 'grammar', 'unit', 'diagnostics', 'exam', 'stats', 'ai', 'settings'];
const samples = [];
try {
    const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
    const target = list.find(x => x.type === 'page' && (x.url || '').includes(String(PORT))) || list.find(x => x.type === 'page');
    if (!target?.webSocketDebuggerUrl) throw new Error('没有可用的 Edge 页面');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const cdp = new CDP(ws);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.eval(`location.href='http://127.0.0.1:${PORT}/?test=1'`);
    if (!await cdp.waitFor('!!document.querySelector("[data-nav=home]")', 30000)) throw new Error('boot timeout');
    await cdp.eval('window.__planTest.seedUnified()');
    await sleep(400);
    for (let i = 0; i < CYCLES; i++) {
        for (const page of pages) {
            await cdp.eval(`document.querySelector('[data-nav="${page}"]')?.click()`);
            await sleep(35);
        }
        const s = await cdp.eval(`({heap: performance.memory?.usedJSHeapSize ?? 0, nodes: document.querySelectorAll('*').length, main: document.querySelector('#main')?.innerHTML.length ?? 0})`);
        samples.push({ cycle: i + 1, ...s, errors: cdp.errors.length });
    }
    const first = samples[0];
    const last = samples.at(-1);
    const maxHeap = Math.max(...samples.map(s => s.heap));
    const minHeap = Math.min(...samples.map(s => s.heap));
    console.log(JSON.stringify({ cycles: CYCLES, samples: samples.length, first, last, maxHeap, minHeap, heapGrowthMB: (last.heap - first.heap) / 1048576, nodeGrowth: last.nodes - first.nodes, errors: cdp.errors.length }, null, 2));
    const growth = (last.heap - first.heap) / 1048576;
    const ok = cdp.errors.length === 0 && growth < 80 && Math.abs(last.nodes - first.nodes) < 500;
    console.log(`\nPhase 14 long-session: ${ok ? 'PASS (accelerated proxy, not 4h field test)' : 'CHECK'}`);
    ws.close();
    process.exit(ok ? 0 : 1);
}
catch (e) {
    console.error('long-session failed:', e.message);
    process.exit(1);
}
