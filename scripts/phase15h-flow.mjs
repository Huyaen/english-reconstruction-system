// Phase 15h · 交互流程 GIF/PNG 抓帧（headful + Page.captureScreenshot）
// 用法：node scripts/phase15h-flow.mjs <flow> <theme> <outDir>
// flow: preview | recall | feedback | reading-open | sentence | grammar | unit | diag | exam | settings-modal
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync, cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const FLOW = process.argv[2] || 'preview';
const THEME = process.argv[3] || 'dark';
const OUT = process.argv[4] || 'screenshots/phase15h/flows';
const PORT = Number(process.env.CDP_PORT || 9700 + (Date.now() % 80));
const BASE = process.env.BASE || 'http://127.0.0.1:4173/?test=1';
const W = Number(process.env.W || 1440), H = Number(process.env.H || 900);
const PROFILE_BASE = 'C:/Users/86152/AppData/Local/hermes/cache/scratch/p15h/live';
const PROFILE = `C:/Users/86152/AppData/Local/hermes/cache/scratch/p15h/flow-${PORT}`;
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const sleep = ms => new Promise(r => setTimeout(r, ms));
mkdirSync(OUT, { recursive: true });
try { if (existsSync(PROFILE_BASE)) cpSync(PROFILE_BASE, PROFILE, { recursive: true }); } catch {}
mkdirSync(PROFILE, { recursive: true });

const child = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--no-default-browser-check', `--window-size=${W},${H + 120}`,
  '--window-position=0,0', 'about:blank',
], { stdio: 'ignore', windowsHide: true });

async function wsUrl() {
  for (let i = 0; i < 80; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find(t => t.type === 'page');
      if (p) return p.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error('devtools not ready');
}
const ws = new WebSocket(await wsUrl());
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let id = 0; const waiters = new Map(); const errs = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && waiters.has(m.id)) { waiters.get(m.id)(m); waiters.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const n = ++id;
  const t = setTimeout(() => { waiters.delete(n); rej(new Error(method + ' timeout')); }, 20000);
  waiters.set(n, m => { clearTimeout(t); m.error ? rej(new Error(m.error.message)) : res(m.result); });
  ws.send(JSON.stringify({ id: n, method, params }));
});
const js = async (e) => {
  const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(OUT, `${FLOW}-${name}-${THEME}.png`), Buffer.from(s.data, 'base64'));
};

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: BASE });
await sleep(3200);
await js(`(async () => { if (document.documentElement.dataset.theme !== ${JSON.stringify(THEME)}) { document.querySelector('#theme').click(); await new Promise(r=>setTimeout(r,450)); } return document.documentElement.dataset.theme; })()`);

const nav = async (p) => { await js(`document.querySelector('[data-nav="${p}"]').click()`); await sleep(850); };
const steps = [];
const log = async (label) => { steps.push(label); await shot(String(steps.length).padStart(2, '0') + '-' + label); };

if (FLOW === 'preview' || FLOW === 'recall') {
  await nav('books');
  await log('library');
  await js(`document.querySelector('#preview-lib')?.click()`);
  await sleep(1100);
  await log('preview-card');
  // 点第一个选项：Preview 记录一次真实分类
  await js(`document.querySelector('[data-preview]')?.click()`);
  await sleep(520);
  await log('preview-next');
  if (FLOW === 'recall') {
    await js(`document.querySelector('#quit')?.click()`); await sleep(700);
    await js(`document.querySelector('#recall-now')?.click()`); await sleep(1200);
    await log('recall-question');
    await js(`[...document.querySelectorAll('.answer')][0]?.click()`); await sleep(700);
    await log('recall-after-answer');
  }
} else if (FLOW === 'feedback') {
  await nav('books');
  await log('library');
  const started = await js(`(async () => {
    const b = document.querySelector('#train-filter'); if (!b) return false;
    b.click(); await new Promise(r=>setTimeout(r,900));
    const old = document.querySelector('#finish-old');
    if (old) { old.click(); await new Promise(r=>setTimeout(r,1200)); }
    await new Promise(r=>setTimeout(r,900));
    return !!document.querySelector('.answer');
  })()`);
  if (started) {
    await log('question');
    // 选一个错误答案以触发反馈面板
    const wrong = await js(`(async () => {
      const btns = [...document.querySelectorAll('.answer')];
      if (btns.length < 2) return false;
      btns[btns.length - 1].click();
      await new Promise(r => setTimeout(r, 900));
      return !!document.querySelector('#feedback .answer-feedback');
    })()`);
    if (wrong) await log('feedback-panel');
  }
} else if (FLOW === 'reading-open') {
  await nav('reading');
  await log('library');
  const opened = await js(`(async () => { const b = document.querySelector('[data-read], #read-open, .read-entry'); if (!b) return false; b.click(); await new Promise(r => setTimeout(r, 1200)); return true; })()`);
  await log(opened ? 'passage' : 'library-only');
} else if (FLOW === 'sentence') {
  await nav('sentence'); await log('sentence-page');
  await js(`document.querySelector('#sentence-next, .sentence-next, button.primary')?.click()`); await sleep(900);
  await log('after-next');
} else if (FLOW === 'grammar') {
  await nav('grammar'); await log('graph');
  await js(`document.querySelector('.concept-card, [data-concept]')?.click()`); await sleep(700);
  await log('concept');
} else if (FLOW === 'unit') {
  await nav('unit'); await log('unit-overview');
  await js(`document.querySelector('button.primary, [data-unit-start]')?.click()`); await sleep(900);
  await log('unit-step');
} else if (FLOW === 'diag') {
  await nav('diagnostics'); await log('diagnostics');
  await js(`document.querySelector('details.diag-more summary, .diag-more summary')?.click()`); await sleep(500);
  await log('diagnostics-expanded');
} else if (FLOW === 'exam') {
  await nav('exam'); await log('exam-overview');
  await js(`document.querySelector('button.primary, [data-exam-start]')?.click()`); await sleep(1000);
  await log('exam-session');
} else if (FLOW === 'settings-modal') {
  await nav('settings'); await log('settings');
  await js(`document.querySelector('#export-backup, button.primary, .danger, button.danger')?.click()`); await sleep(600);
  await log('dialog');
} else if (FLOW === 'theme') {
  await nav('home'); await log('home-before');
  await js(`document.querySelector('#theme').click()`); await sleep(600);
  await log('home-after-toggle');
}

console.log(JSON.stringify({ flow: FLOW, theme: THEME, steps, errs: errs.slice(0, 3) }));
ws.close(); child.kill();
await sleep(500);
try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
process.exit(0);
