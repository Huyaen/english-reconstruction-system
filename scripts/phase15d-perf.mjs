// Phase 15d · 动画性能与降级证据
// 1) TaskDuration / RecalcStyleDuration / LayoutDuration 的 CDP 计量（同机同负载）
// 2) 帧间隔统计（p50 / p95 / 最长），空闲 10s 与指针交互 4s 两段
// 3) longtask 计数
// 4) prefers-reduced-motion 下的计算样式断言
// 用法：node scripts/phase15d-perf.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const OUT = resolve('screenshots/phase15d');
mkdirSync(OUT, { recursive: true });
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => existsSync(p));
if (!edge) { console.error('EDGE NOT FOUND'); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function session(port, profile) {
    const child = spawn(edge, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
        '--window-size=1440,900', '--hide-scrollbars', '--force-device-scale-factor=1', '--no-first-run', 'about:blank'],
        { stdio: 'ignore', windowsHide: true });
    let ws;
    for (let i = 0; i < 90 && !ws; i++) {
        try {
            const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
            const t = list.find(x => x.type === 'page');
            if (t) { ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); }); }
        } catch { /* not ready */ }
        if (!ws) await sleep(250);
    }
    if (!ws) throw new Error('cdp not ready');
    let id = 0; const pending = new Map();
    ws.addEventListener('message', ev => {
        const m = JSON.parse(ev.data);
        if (m.id && pending.has(m.id)) { const { res } = pending.get(m.id); pending.delete(m.id); res(m.result); }
    });
    const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, { res }); ws.send(JSON.stringify({ id: i, method, params })); });
    const evaluate = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;
    return { child, ws, send, evaluate };
}

const BOOT = `(async () => {
  for (let i = 0; i < 90; i++) { if (window.__planTest && document.querySelector('#today')) break; await new Promise(r => setTimeout(r, 300)); }
  window.__planTest && window.__planTest.createPlan(150);
  for (let i = 0; i < 60; i++) { if (document.querySelector('#start-today') || document.querySelector('.proto-cta')) break; await new Promise(r => setTimeout(r, 300)); }
  await new Promise(r => setTimeout(r, 1200));
  window.__samples = []; let last = performance.now();
  const loop = now => { window.__samples.push(now - last); last = now; window.__raf = requestAnimationFrame(loop); };
  window.__raf = requestAnimationFrame(loop);
  window.__long = [];
  try { new PerformanceObserver(l => window.__long.push(...l.getEntries().map(e => Math.round(e.duration)))).observe({ entryTypes: ['longtask'] }); } catch (e) {}
  return true;
})()`;

const METRICS = ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration'];

async function measure(label, url, port, reduced) {
    const { child, ws, send, evaluate } = await session(port, join(process.env.TEMP || '.', `p15d-perf-${label}-${Date.now()}`));
    try {
        await send('Page.enable'); await send('Runtime.enable'); await send('Performance.enable');
        if (reduced) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
        await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
        await send('Page.navigate', { url });
        await evaluate(BOOT);
        await sleep(600);

        if (reduced) {
            const styles = await evaluate(`(() => {
              const pick = ['.d-orb', '.d-bands', '.d-sweep', '.d-sweep-2', '.d-rim', '.d-aura', '.d-glare'];
              const out = {};
              pick.forEach(s => { const el = document.querySelector(s); if (!el) return; const cs = getComputedStyle(el);
                out[s] = { animationName: cs.animationName, animationDuration: cs.animationDuration, display: cs.display }; });
              const running = document.getAnimations().filter(a => a.playState === 'running').length;
              return { out, running };
            })()`);
            const shot = await send('Page.captureScreenshot', { format: 'png' });
            writeFileSync(join(OUT, 'reduced-motion-1440.png'), Buffer.from(shot.data, 'base64'));
            ws.close(); child.kill();
            return { label, reducedMotion: styles };
        }

        const before = Object.fromEntries((await send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
        await evaluate('window.__samples = []; window.__long = []; true');
        await sleep(10000);
        const idle = await evaluate(`(() => { const s = window.__samples.slice(5).sort((a,b)=>a-b); const q = p => Math.round(s[Math.floor(s.length*p)]*10)/10;
            return { frames: s.length, p50: q(.5), p95: q(.95), max: Math.round(s.at(-1)*10)/10, over32: s.filter(x=>x>32).length, long: window.__long.slice(0,6), longCount: window.__long.length, anims: document.getAnimations().filter(a=>a.playState==='running').length }; })()`);
        const afterIdle = Object.fromEntries((await send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));

        // 交互段：4 秒内持续移动指针，制造真实的悬停/光照变化
        await evaluate('window.__samples = []; window.__long = []; true');
        const t0 = Date.now();
        for (let i = 0; i < 40; i++) {
            const x = 300 + Math.round(500 * (0.5 + 0.5 * Math.sin(i / 3.2)));
            const y = 220 + Math.round(240 * (0.5 + 0.5 * Math.cos(i / 2.6)));
            await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 0 });
            await sleep(100);
        }
        const interactiveMs = Date.now() - t0;
        const inter = await evaluate(`(() => { const s = window.__samples.slice(3).sort((a,b)=>a-b); const q = p => Math.round(s[Math.floor(s.length*p)]*10)/10;
            return { frames: s.length, p50: q(.5), p95: q(.95), max: Math.round(s.at(-1)*10)/10, over32: s.filter(x=>x>32).length, long: window.__long.slice(0,6), longCount: window.__long.length }; })()`);
        const afterInter = Object.fromEntries((await send('Performance.getMetrics')).metrics.map(m => [m.name, m.value]));
        await evaluate('cancelAnimationFrame(window.__raf); true');
        ws.close(); child.kill();

        const delta = (a, b) => Object.fromEntries(METRICS.map(k => [k, Math.round((b[k] - a[k]) * 1000)]));
        return {
            label,
            idle: { ...idle, seconds: 10, metricsMs: delta(before, afterIdle) },
            interactive: { ...inter, seconds: +(interactiveMs / 1000).toFixed(1), metricsMs: delta(afterIdle, afterInter) },
        };
    } catch (err) {
        try { child.kill(); } catch { /* noop */ }
        return { label, error: String(err && err.message || err) };
    }
}

const results = [];
results.push(await measure('15b-base', 'http://127.0.0.1:4173/?test=1', 9401, false));
results.push(await measure('15d', 'http://127.0.0.1:4173/?test=1&proto=d', 9402, false));
results.push(await measure('15d-reduced', 'http://127.0.0.1:4173/?test=1&proto=d', 9403, true));
writeFileSync(join(OUT, 'perf.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
console.log(JSON.stringify(results, null, 1));
