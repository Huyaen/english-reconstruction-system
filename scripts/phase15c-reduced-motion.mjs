// Phase 15c · reduced-motion 验收（计算样式断言 + 静态截图）
// 输出：screenshots/phase15c/<proto>/reduced-motion-<theme>.png 与 reduced-motion.json
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PROTO = process.env.PROTO === 'b' ? 'b' : 'a';
const OUT = resolve(`screenshots/phase15c/${PROTO}`);
const PORT = PROTO === 'b' ? 9291 : 9290;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => existsSync(p));

const child = spawn(edge, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(process.env.TEMP || '.', `p15c-rm-${PROTO}-${Date.now()}`)}`,
    '--window-size=1440,900', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore', windowsHide: true });

async function connect() {
    for (let i = 0; i < 80; i++) {
        try {
            const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
            const t = list.find(x => x.type === 'page');
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

try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await send('Page.navigate', { url: `http://127.0.0.1:4173/?test=1&proto=${PROTO}` });
    for (let i = 0; i < 80; i++) { if (await evaluate('!!(window.__planTest && document.querySelector("[data-nav=home]"))')) break; await sleep(400); }
    await evaluate('window.__planTest.createPlan(150)');
    for (let i = 0; i < 60; i++) { if (await evaluate('!!document.querySelector("#start-today")')) break; await sleep(300); }
    await sleep(700);
    mkdirSync(OUT, { recursive: true });

    const report = { proto: PROTO, media: 'prefers-reduced-motion: reduce', at: new Date().toISOString(), themes: [] };
    for (const theme of ['dark', 'light']) {
        const now = await evaluate('document.documentElement.dataset.theme');
        const wantDark = theme === 'dark';
        if (wantDark !== (now === 'dark')) {
            const t = await evaluate(`(() => { const b = document.querySelector('#theme'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
            if (t) {
                await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: t.x, y: t.y, button: 'left', clickCount: 1, buttons: 1 });
                await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: t.x, y: t.y, button: 'left', clickCount: 1, buttons: 0 });
            }
            await sleep(900);
        }
        const probe = await evaluate(`(() => {
          const q = s => document.querySelector(s);
          const stage = q('.proto-instrument') || q('.proto-air');
          const slab = q('.proto-slab'), cta = q('.proto-cta'), side = q('.proto-side > *');
          const g = el => el ? getComputedStyle(el) : null;
          const row = el => { const s = g(el); return s ? { animation: s.animationName, animDur: s.animationDuration, transition: s.transitionProperty, transDur: s.transitionDuration, transform: s.transform } : null; };
          return { stage: row(stage), slab: row(slab), side: row(side), cta: row(cta),
            motionClass: document.documentElement.className,
            overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth };
        })()`);
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        const file = join(OUT, `reduced-motion-${theme}.png`);
        writeFileSync(file, Buffer.from(shot.data, 'base64'));
        report.themes.push({ theme, file, probe });
    }
    writeFileSync(join(OUT, 'reduced-motion.json'), JSON.stringify(report, null, 1));
    console.log(JSON.stringify(report.themes.map(t => ({ theme: t.theme, stageAnim: t.probe.stage?.animation, ctaTrans: t.probe.cta?.transDur, overflowX: t.probe.overflowX }))));
} finally {
    ws.close();
    child.kill();
}
