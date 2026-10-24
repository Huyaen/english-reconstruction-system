// Phase 15c · 精确对比度审计（只算真实前景色 vs 最近一层不透明背景色）
// 目的：旧探针在有渐变/圆环背景的元素上采样失真，这里给出可复核的数字。
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PROTO = process.env.PROTO === 'b' ? 'b' : process.env.PROTO === 'base' ? 'base' : 'a';
const PORT = 9297;
const VW = Number(process.env.VW || 1920), VH = Number(process.env.VH || 1080);
const WANT = process.env.THEME || 'dark';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => existsSync(p));
const child = spawn(edge, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(process.env.TEMP || '.', `p15c-contrast-${Date.now()}`)}`,
    '--window-size=1920,1080', '--hide-scrollbars', '--no-first-run', 'about:blank'], { stdio: 'ignore', windowsHide: true });

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

const qs = PROTO === 'base' ? '' : `&proto=${PROTO}`;
const out = resolve(`screenshots/phase15c/${PROTO === 'base' ? '15b' : PROTO}`);
mkdirSync(out, { recursive: true });

try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: VW < 700 });
    await send('Page.navigate', { url: `http://127.0.0.1:4173/?test=1${qs}` });
    for (let i = 0; i < 80; i++) { if (await evaluate('!!(window.__planTest && document.querySelector("[data-nav=home]"))')) break; await sleep(400); }
    await evaluate('window.__planTest.createPlan(150)');
    for (let i = 0; i < 60; i++) { if (await evaluate('!!document.querySelector("#start-today")')) break; await sleep(300); }
    if (((await evaluate('document.documentElement.dataset.theme')) === 'dark') !== (WANT === 'dark')) {
        await evaluate(`(() => { const b = document.querySelector('#theme'); if (b) b.click(); return 1; })()`);
        await sleep(800);
    }

    const audit = await evaluate(`(() => {
      const parse = c => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
      const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return +((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2); };
      const bgOf = el => {
        let n = el;
        while (n && n !== document.documentElement) {
          const s = getComputedStyle(n);
          const c = parse(s.backgroundColor);
          if (c && c.a >= 0.9) return c;
          n = n.parentElement;
        }
        return parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
      };
      const rows = [];
      const seen = new Set();
      document.querySelectorAll('main *, .sidebar *').forEach(el => {
        const txt = (el.textContent || '').trim();
        if (!txt || txt.length > 40) return;
        if (el.children.length && [...el.children].some(c => (c.textContent || '').trim())) return;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        const s = getComputedStyle(el);
        if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return;
        const fg = parse(s.color);
        if (!fg) return;
        const size = parseFloat(s.fontSize);
        const weight = +s.fontWeight || 400;
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const cr = ratio(fg, bgOf(el));
        const need = large ? 3 : 4.5;
        if (cr < need) {
          const key = txt.slice(0, 24) + '|' + Math.round(size) + '|' + cr;
          if (seen.has(key)) return; seen.add(key);
          const bg = bgOf(el);
          rows.push({ text: txt.slice(0, 28), cls: (el.className || '').toString().slice(0, 44), size: Math.round(size), weight, ratio: cr, need,
            fg: fg.r + ',' + fg.g + ',' + fg.b, bg: bg.r + ',' + bg.g + ',' + bg.b, theme: document.documentElement.dataset.theme });
        }
      });
      return { checked: document.querySelectorAll('main *').length, failures: rows.slice(0, 20) };
    })()`);

    const report = { proto: PROTO, theme: WANT, at: new Date().toISOString(), viewport: `${VW}x${VH}`, ...audit };
    writeFileSync(join(out, `contrast-audit-${WANT}-${VW}x${VH}.json`), JSON.stringify(report, null, 1));
    console.log(`checked=${audit.checked} failures=${audit.failures.length}`);
    for (const f of audit.failures) console.log(` - ${f.ratio} (need ${f.need}) ${f.size}px ${f.cls} :: ${f.text} [fg ${f.fg} / bg ${f.bg} / ${f.theme}]`);
} finally {
    ws.close();
    child.kill();
}
