// Phase 15h · 全站截图工具（headful Edge + CDP Page.captureScreenshot）
// 用法：node scripts/phase15h-shot.mjs <outDir> [theme] [pages...]
// 每张：1440×900 / 1920×1080 / 1366×768 由 SIZES 控制，可传 SIZES=1440x900
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const PORT = Number(process.env.CDP_PORT || 9400 + (Date.now() % 120));
const BASE = process.env.BASE || 'http://127.0.0.1:4173/?test=1';
const OUT = process.argv[2] || 'screenshots/phase15h/probe';
const THEME = process.argv[3] || 'dark';
const PAGES = process.argv.slice(4).length ? process.argv.slice(4) : ['home'];
const SIZES = (process.env.SIZES || '1440x900').split(',').map(s => s.split('x').map(Number));
const PROFILE = `C:/Users/86152/AppData/Local/hermes/cache/scratch/p15h/prof-${PORT}`;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';

const sleep = ms => new Promise(r => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });

const child = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--no-default-browser-check', '--disable-features=msEdgeSidebarV2',
  `--window-size=${SIZES[0][0]},${SIZES[0][1] + 120}`,
  '--window-position=0,0', 'about:blank',
], { stdio: 'ignore', windowsHide: true });

async function wsUrl() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('no devtools');
}

const ws = new WebSocket(await wsUrl());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const waiters = new Map();
const events = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
  else if (m.method) events.push(m);
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const n = ++id;
  waiters.set(n, m => m.error ? rej(new Error(method + ': ' + m.error.message)) : res(m.result));
  ws.send(JSON.stringify({ id: n, method, params }));
});

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: SIZES[0][0], height: SIZES[0][1], deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE });
await sleep(3000);

const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r.result.value;
};

// 主题
await evalJs(`(async () => {
  const t = ${JSON.stringify(THEME)};
  if (document.documentElement.dataset.theme !== t) { document.querySelector('#theme')?.click(); await new Promise(r=>setTimeout(r,400)); }
  return document.documentElement.dataset.theme;
})()`);

const shots = [];
for (const size of SIZES) {
  await send('Emulation.setDeviceMetricsOverride', { width: size[0], height: size[1], deviceScaleFactor: 1, mobile: false });
  await sleep(320);
  for (const page of PAGES) {
    const ok = await evalJs(`(async () => {
      const b = document.querySelector('[data-nav="${page}"]');
      if (!b) return 'no-nav';
      b.click();
      await new Promise(r => setTimeout(r, 620));
      return document.querySelector('#main')?.querySelector('h1')?.textContent?.trim().slice(0,40) || document.querySelector('#main')?.textContent?.trim().slice(0,40) || 'empty';
    })()`);
    await sleep(220);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const name = `${page}-${THEME}-${size[0]}x${size[1]}.png`;
    writeFileSync(join(OUT, name), Buffer.from(shot.data, 'base64'));
    shots.push({ name, ok });
  }
}

const errs = events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
  .map(e => e.params.args.map(a => a.value ?? a.description).join(' ')).slice(0, 5);
console.log(JSON.stringify({ shots: shots.length, sample: shots.slice(0, 3), errs }, null, 0));

ws.close();
child.kill();
await sleep(400);
try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
process.exit(0);
