/**
 * Phase 15h · 全站交互录屏（headful Edge + Page.startScreencast）
 *
 * 采集口径（写进报告，不允许含糊）：
 *  - CDP：Page.startScreencast（headful）。15g 已验证 headless 的同一接口在共享元素转场中整层丢失。
 *  - 浏览器：headful Edge，--app 独立窗口，--force-device-scale-factor=1，1440×948。
 *  - 指针：Input.dispatchMouseEvent 真实命中测试 + 逐帧移动；截图本身不含系统光标，
 *    编码阶段按事件日志叠加一个环（唯一合成层）。
 *  - 帧率：由合成器推流决定（本机 30–60fps），每帧带真实时间戳；编码按时间轴重采样。
 *
 * 用法：FLOW=vocab THEME=dark node scripts/phase15h-record.mjs
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync, cpSync } from 'node:fs';
import { join } from 'node:path';

const FLOW = process.env.FLOW || 'vocab';
const THEME = process.env.THEME || 'dark';
const PORT = Number(process.env.CDP_PORT || 9600 + (Date.now() % 90));
const OUT = process.env.OUT_DIR || 'screenshots/phase15h/recording';
const FRAMES = join(OUT, `frames-${FLOW}-${THEME}`);
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const APP = 'http://127.0.0.1:4173/?test=1';
const PB = 'C:/Users/86152/AppData/Local/hermes/cache/scratch/p15h/live';
const PROFILE = `C:/Users/86152/AppData/Local/hermes/cache/scratch/p15h/rec-${PORT}`;

rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });
try { if (existsSync(PB)) cpSync(PB, PROFILE, { recursive: true }); } catch {}
mkdirSync(PROFILE, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--no-default-browser-check', '--force-device-scale-factor=1',
  '--window-position=0,0', '--window-size=1440,948', `--app=${APP}`,
], { stdio: 'ignore', windowsHide: false });

let targets = [];
for (let i = 0; i < 80; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.some(t => t.type === 'page')) break; } catch {}
  await sleep(250);
}
const pageTarget = targets.find(t => t.type === 'page');
if (!pageTarget) throw new Error('no page target');
const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let seq = 0; const pend = new Map(); const errors = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') errors.push(String(m.params.exceptionDetails?.exception?.description || '').slice(0, 160));
});
const send = (method, params = {}) => new Promise(res => { const i = ++seq; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }))?.result?.result?.value;
const box = async sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);

await send('Page.enable'); await send('Runtime.enable');
await sleep(3000);
for (let i = 0; i < 4; i++) {
  if (await ev('document.documentElement.dataset.theme') === THEME) break;
  await ev(`document.querySelector('#theme').click()`); await sleep(420);
}
await sleep(400);

const frames = [];
const pointer = { x: 12, y: 12, down: false, visible: false };
const log = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.method !== 'Page.screencastFrame') return;
  frames.push({ t: Date.now(), p: { ...pointer }, d: m.params.data });
  send('Page.screencastFrameAck', { sessionId: m.params.sessionId });
});
await send('Page.startScreencast', { format: 'jpeg', quality: 90, everyNthFrame: 1 });

const move = async (x, y) => {
  pointer.x = Math.round(x); pointer.y = Math.round(y); pointer.visible = true;
  log.push({ t: Date.now(), k: 'move', x: pointer.x, y: pointer.y });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pointer.x, y: pointer.y, button: 'none' });
};
const glide = async (a, b, ms) => {
  const n = Math.max(4, Math.round(ms / 26));
  for (let i = 1; i <= n; i++) { await move(a.x + (b.x - a.x) * (i / n), a.y + (b.y - a.y) * (i / n)); await sleep(ms / n); }
};
const tap = async (sel, ms = 850) => {
  const b = await box(sel);
  if (!b) return false;
  await glide({ x: b.x - 90, y: b.y + 40 }, b, ms);
  await sleep(160);
  pointer.down = true; log.push({ t: Date.now(), k: 'down' });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: b.x, y: b.y, button: 'left', clickCount: 1 });
  await sleep(90);
  pointer.down = false; log.push({ t: Date.now(), k: 'up' });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: b.x, y: b.y, button: 'left', clickCount: 1 });
  await sleep(600);
  return true;
};
const nav = async (p) => { await ev(`document.querySelector('[data-nav="${p}"]').click()`); await sleep(900); };

const started = Date.now();
await move(10, 10); await sleep(600);

if (FLOW === 'vocab') {
  await nav('books'); await sleep(700);
  await tap('#preview-lib'); await sleep(1400);
  await tap('[data-preview="familiar"]'); await sleep(900);
  await tap('[data-preview="unknown"]'); await sleep(900);
  await tap('#quit'); await sleep(900);
  await tap('#recall-now'); await sleep(1600);
  await tap('.answer'); await sleep(1100);
  await ev(`document.querySelector('#quit')?.click()`); await sleep(900);
  await nav('home'); await sleep(1200);
} else if (FLOW === 'sentence') {
  await nav('sentence'); await sleep(900);
  await tap('button.primary'); await sleep(1400);
  await tap('.answer, [data-choice]'); await sleep(1000);
  await nav('grammar'); await sleep(900);
  await tap('.concept-card, [data-concept]'); await sleep(900);
} else if (FLOW === 'reading') {
  await nav('reading'); await sleep(900);
  await tap('[data-read], .read-entry, button.primary'); await sleep(1600);
  await tap('.reader-side-toggle, #read-help-tools'); await sleep(900);
} else if (FLOW === 'io') {
  await nav('input'); await sleep(900);
  await tap('button.primary'); await sleep(1400);
  await nav('output'); await sleep(900);
  await tap('button.primary'); await sleep(1200);
} else if (FLOW === 'data') {
  await nav('diagnostics'); await sleep(1000);
  await tap('.diag-more summary, details summary'); await sleep(700);
  await nav('stats'); await sleep(1000);
  await ev(`(() => { const s = document.querySelector('#trend-days'); if (s) { s.value = '30'; s.dispatchEvent(new Event('change', { bubbles: true })); } })()`);
  await sleep(900);
  await nav('exam'); await sleep(900);
  await tap('button.primary'); await sleep(1400);
} else if (FLOW === 'mgmt') {
  await nav('unit'); await sleep(1000);
  await nav('settings'); await sleep(1000);
  await tap('#export-backup, .backup-panel button'); await sleep(1000);
  await ev(`document.querySelector('#close-modal, .modal-backdrop button, dialog')?.close?.()`); await sleep(600);
  await tap('#theme'); await sleep(1200);
}

await sleep(1200);
await send('Page.stopScreencast');
await sleep(400);

/* 时间轴以「开始录制」为零点：screencast 只在画面变化时推帧，静止段会没有帧。
   为了让成片时长 == 真实时长，首尾各补一帧静态保持（同一张图，不伪造内容）。 */
const total = Date.now() - started;
const list = frames.map(f => ({ ...f, tAbs: Math.round(f.t - started) }));
if (list.length && list[0].tAbs > 300) list.unshift({ ...list[0], tAbs: 0 });
if (list.length && total - list[list.length - 1].tAbs > 300) list.push({ ...list[list.length - 1], tAbs: total });
list.forEach((f, i) => writeFileSync(join(FRAMES, `${String(i).padStart(4, '0')}.jpg`), Buffer.from(f.d, 'base64')));
writeFileSync(join(FRAMES, 'meta.json'), JSON.stringify({
  clip: FLOW, theme: THEME,
  frames: list.map((f, i) => ({
    i, t: f.tAbs,
    visible: !!f.p.visible, px: f.p.x, py: f.p.y, down: !!f.p.down,
  })),
  pointer: log.map(l => ({ k: l.k, x: l.x, y: l.y, t: Math.round(l.t - started) })),
}, null, 0));

const state = await ev(`({ theme: document.documentElement.dataset.theme, page: document.documentElement.dataset.page, errs: [] })`);
console.log(JSON.stringify({ flow: FLOW, theme: THEME, frames: frames.length, seconds: Math.round((Date.now() - started) / 100) / 10, state, errors: errors.slice(0, 3) }));

ws.close(); edge.kill(); await sleep(500);
try { rmSync(PROFILE, { recursive: true, force: true }); } catch {}
process.exit(0);
