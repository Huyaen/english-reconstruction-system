// Phase 15c · 性能对比：15b 基线 / 原型 A / 原型 B
// 同一台机器、同一个 headless Edge、同一套指针与滚动负载；
// 指标：平均帧时间、>20ms 掉帧比例、style/layout 计数（CDP Performance.getMetrics）。
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PORT = 9296;
const W = 1440, H = 900;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const OUT = resolve('screenshots/phase15c/perf');
mkdirSync(OUT, { recursive: true });
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => existsSync(p));
const child = spawn(edge, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(process.env.TEMP || '.', `p15c-perf-${Date.now()}`)}`,
    `--window-size=${W},${H}`, '--hide-scrollbars', '--force-device-scale-factor=1', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore', windowsHide: true });

async function connect() {
    for (let i = 0; i < 80; i++) {
        try {
            const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
            const t = l.find(x => x.type === 'page');
            if (t) { const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); }); return ws; }
        } catch { /* not up */ }
        await sleep(250);
    }
    throw new Error('cdp not ready');
}

const ws = await connect();
let id = 0;
const pending = new Map();
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;

const cases = [
    { id: '15b', url: 'http://127.0.0.1:4173/?test=1' },
    { id: 'a', url: 'http://127.0.0.1:4173/?test=1&proto=a' },
    { id: 'b', url: 'http://127.0.0.1:4173/?test=1&proto=b' },
];
const results = [];

try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

    for (const c of cases) {
        await send('Page.navigate', { url: c.url });
        for (let i = 0; i < 80; i++) { if (await evaluate('!!(window.__planTest && document.querySelector("[data-nav=home]"))')) break; await sleep(400); }
        await evaluate('window.__planTest.createPlan(150)');
        for (let i = 0; i < 60; i++) { if (await evaluate('!!document.querySelector("#start-today")')) break; await sleep(300); }
        await sleep(900);
        await send('Performance.enable');

        // 负载：40 次真实指针移动（覆盖 Hero 高光区与任务行）+ 2 次滚动，测量帧节奏
        const box = await evaluate(`(() => {
          const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
          return { hero: r(document.querySelector('.proto-instrument') || document.querySelector('.today-hero') || document.querySelector('.proto-air')), row: r(document.querySelectorAll('[data-task]')[1]) };
        })()`);
        const before = Object.fromEntries((await send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));

        await evaluate(`(() => {
          window.__frames = [];
          window.__long = [];
          const t0 = performance.now();
          let last = t0;
          const tick = now => { window.__frames.push(now - last); last = now; if (now - t0 < 3200) requestAnimationFrame(tick); };
          requestAnimationFrame(tick);
          try {
            window.__po = new PerformanceObserver(list => { for (const e of list.getEntries()) window.__long.push(Math.round(e.duration)); });
            window.__po.observe({ entryTypes: ['longtask'] });
          } catch {}
          return 1;
        })()`);

        for (let i = 0; i < 40; i++) {
            if (!box.hero) break;
            const x = box.hero.x + box.hero.w * (0.15 + (i % 10) * 0.07);
            const y = box.hero.y + box.hero.h * (0.2 + (i % 5) * 0.12);
            await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y), button: 'left', buttons: 0 });
            await sleep(35);
        }
        if (box.row) {
            for (let i = 0; i < 3; i++) {
                await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(box.row.x + 30), y: Math.round(box.row.y + 10), button: 'left', buttons: 0 });
                await sleep(220);
            }
        }
        await sleep(1600);

        const frames = await evaluate('window.__frames || []');
        const long = await evaluate('window.__long || []');
        const after = Object.fromEntries((await send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
        const deltas = frames.slice(2).map(Number);
        const avg = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
        const dropped = deltas.filter(d => d > 20).length;
        results.push({
            case: c.id,
            frames: deltas.length,
            avgFrameMs: +avg.toFixed(2),
            p95FrameMs: deltas.length ? +deltas.slice().sort((a, b) => a - b)[Math.floor(deltas.length * 0.95)].toFixed(2) : 0,
            droppedFrames: dropped,
            droppedPct: deltas.length ? +(dropped / deltas.length * 100).toFixed(1) : 0,
            longTasks: long.length,
            longestTaskMs: long.length ? Math.max(...long) : 0,
            styleRecalcs: Math.round((after.RecalcStyleCount || 0) - (before.RecalcStyleCount || 0)),
            layouts: Math.round((after.LayoutCount || 0) - (before.LayoutCount || 0)),
            nodes: await evaluate('document.querySelectorAll("*").length'),
        });
        console.log('measured', JSON.stringify(results.at(-1)));
    }

    writeFileSync(join(OUT, 'perf.json'), JSON.stringify({ at: new Date().toISOString(), viewport: `${W}x${H}`, results }, null, 1));
    const rows = results.map(r => `| ${r.case} | ${r.avgFrameMs} | ${r.p95FrameMs} | ${r.droppedPct}% | ${r.longTasks} / ${r.longestTaskMs}ms | ${r.styleRecalcs} | ${r.layouts} | ${r.nodes} |`);
    const md = ['| 运行 | 平均帧时间 | p95 | >20ms 掉帧 | long task | style 重算 | layout | DOM 节点 |', '|---|---|---|---|---|---|---|---|', ...rows].join('\n');
    writeFileSync(join(OUT, 'perf.md'), md + '\n');
    console.log(md);
} finally {
    ws.close();
    child.kill();
}
