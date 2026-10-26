/**
 * Phase 15g · 逐帧采集录屏（headful Edge + Page.captureScreenshot）
 *
 * 采集链路的选择依据（本轮实测，见 docs/PHASE15G_TRANSITION_FORENSICS.md）：
 *   1. headless(--headless=new) 的 Page.startScreencast 在共享元素转场中会整层丢失 →
 *      录到近黑帧；同一时刻 headful 的 captureScreenshot 与真实窗口 gdigrab 都没有黑帧。
 *      结论：黑帧来自采集链路，不是应用渲染。因此本脚本不再使用 screencast。
 *   2. 系统级 gdigrab 窗口录制在本机受前台焦点争抢限制，无法长时间稳定；
 *      已用它做过一次交叉验证（window-*.mp4，见同一目录）。
 *   3. captureScreenshot 每帧都是真实合成结果，逐帧记录时间戳，按真实 dt 编码成 mp4，
 *      不裁剪、不丢帧。指针位置来自事件日志，按同一时钟在帧上叠加一个光标环
 *      （CDP 截图不含系统光标，这是唯一的人工合成层，已在报告中标注）。
 *
 * 用法：CLIP=idle THEME=dark node scripts/phase15g-record.mjs
 * 片段：idle | pointer | pointer-nobreath | press | journey-forward | journey-return | completion | theme-switch
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const CLIP = process.env.CLIP || 'idle';
const THEME = process.env.THEME || 'dark';
const PORT = Number(process.env.CDP_PORT || 9800);
const OUT = process.env.OUT_DIR || 'screenshots/phase15g/recording';
const FRAMES = join(OUT, `frames-${CLIP}-${THEME}`);
const EDGE = process.env.EDGE_PATH || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const APP = process.env.APP_URL || 'http://127.0.0.1:4173/?test=1&proto=d';
const PROFILE = `C:/Users/86152/AppData/Local/Temp/edge-15g-cap-${PORT}-${Date.now()}`;

rmSync(FRAMES, { recursive: true, force: true });
mkdirSync(FRAMES, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const edge = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--no-default-browser-check', '--force-device-scale-factor=1',
  '--window-position=0,0', '--window-size=1440,948', `--app=${APP}`,
], { stdio: 'ignore', windowsHide: false });

let targets = [];
for (let i = 0; i < 80; i++) {
  try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets.some(t => t.type === 'page')) break; } catch { /* starting */ }
  await sleep(250);
}
const pageTarget = targets.find(t => t.type === 'page');
if (!pageTarget)
  throw new Error('no page target');
const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let seq = 0; const pend = new Map(); const errors = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown')
    errors.push(String(m.params.exceptionDetails?.exception?.description || '').slice(0, 160));
});
const send = (method, params = {}) => new Promise(res => { const i = ++seq; pend.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }))?.result?.result?.value;
const box = async sel => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), w: Math.round(r.width), h: Math.round(r.height) }; })()`);

await send('Page.enable'); await send('Runtime.enable');
await sleep(2600);

/* 播种今日计划（隔离 profile）＋ 固定主题，录制过程中不再动它 */
await ev('(async () => { const t = window.__planTest; await t.seedUnified(); await t.resetPlan(); await t.createPlan(150); return 1; })()');
for (let i = 0; i < 40; i++) { if (await ev('!!document.querySelector("#start-today")')) break; await sleep(200); }
await sleep(500);
for (let i = 0; i < 4; i++) {
  if (await ev('document.documentElement.dataset.theme') === THEME) break;
  await ev(`document.querySelector('#theme').click()`);
  await sleep(420);
}
if (CLIP === 'pointer-nobreath')
  await ev(`document.documentElement.dataset.nobreath = '1'`);
await sleep(500);
const themeAtStart = await ev('document.documentElement.dataset.theme');

/* ── 采集 ─────────────────────────────────────────────────────────────── */
const frames = [];
let stop = false;
const pointer = { x: 12, y: 12, down: false, visible: false };
const log = [];
/* headful 的 screencast 是逐合成帧推流（实测 ~36fps），headless 的同一接口会掉层 —— 差别就在这里 */
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.method !== 'Page.screencastFrame')
    return;
  frames.push({ t: Date.now(), p: { ...pointer }, d: m.params.data });
  send('Page.screencastFrameAck', { sessionId: m.params.sessionId });
});
await send('Page.startScreencast', { format: 'jpeg', quality: 90, everyNthFrame: 1 });
const grab = Promise.resolve();

const move = async (x, y) => {
  pointer.x = Math.round(x); pointer.y = Math.round(y); pointer.visible = true;
  log.push({ t: Date.now(), k: 'move', x: pointer.x, y: pointer.y });
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pointer.x, y: pointer.y, button: 'none' });
};
const glide = async (a, b, ms) => {
  const n = Math.max(4, Math.round(ms / 28));
  for (let i = 1; i <= n; i++) {
    await move(a.x + (b.x - a.x) * (i / n), a.y + (b.y - a.y) * (i / n));
    await sleep(ms / n);
  }
};
const down = async at => { pointer.down = true; log.push({ t: Date.now(), k: 'down' }); await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: at.x, y: at.y, button: 'left', clickCount: 1 }); };
const up = async at => { pointer.down = false; log.push({ t: Date.now(), k: 'up' }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: at.x, y: at.y, button: 'left', clickCount: 1 }); };

const g = {
  spine: await box('.d2-spine'), glass: await box('.d2-now'), cta: await box('#start-today'),
  route: await box('.d2-route'), seg: await box('.d-seg'), theme: await box('#theme'), row: await box('.d-row-head'),
};
await sleep(400);

if (CLIP === 'idle') {
  pointer.visible = false;
  await sleep(22000);
}
else if (CLIP === 'pointer' || CLIP === 'pointer-nobreath') {
  await move(12, 12); await sleep(900);
  const path0 = [
    { x: g.spine?.x, y: g.spine.y - 120 }, { x: g.spine?.x, y: g.spine?.y + 90 },
    { x: g.glass?.x - 240, y: g.glass?.y }, { x: g.glass?.x + 160, y: g.glass?.y - 60 },
    { x: g.route?.x, y: g.route?.y - 10 }, { x: g.seg?.x, y: g.seg?.y },
    { x: g.cta?.x, y: g.cta?.y }, { x: g.glass?.x, y: g.glass?.y }, { x: 12, y: 12 },
  ];
  const path = path0.filter(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));
  for (let i = 0; i < path.length - 1; i++) {
    await glide(path[i], path[i + 1], 900);
    await sleep(800);
  }
  await sleep(1200);
}
else if (CLIP === 'press') {
  await ev('(window).__noNavClick = true');
  await glide({ x: g.cta.x - 220, y: g.cta.y + 120 }, { x: g.cta.x, y: g.cta.y }, 900);
  await sleep(700);
  await down(g.cta); await sleep(950);
  await up(g.cta); await sleep(1500);
  await glide({ x: g.cta.x, y: g.cta.y }, { x: g.cta.x - 40, y: g.cta.y - 90 }, 500);
  await sleep(1200);
}
else if (CLIP === 'journey-forward') {
  await glide({ x: g.cta.x - 260, y: g.cta.y + 160 }, { x: g.cta.x, y: g.cta.y }, 900);
  await sleep(700);
  await down(g.cta); await sleep(70); await up(g.cta);
  await sleep(2600);
}
else if (CLIP === 'journey-return') {
  await glide({ x: g.cta.x - 260, y: g.cta.y + 160 }, { x: g.cta.x, y: g.cta.y }, 800);
  await sleep(500);
  await down(g.cta); await sleep(70); await up(g.cta);
  await sleep(2000);
  const quit = await box('#quit');
  if (quit) {
    await glide({ x: g.cta.x, y: g.cta.y }, quit, 700);
    await sleep(500);
    await down(quit); await sleep(70); await up(quit);
    await sleep(1500);
  }
  // 预览阶段退出会先到完成页，再从完成页回 Today —— 这一跳才是反向共享元素
  const home = await box('#back-home');
  if (home) {
    await glide({ x: home.x - 120, y: home.y - 60 }, home, 700);
    await sleep(400);
    await down(home); await sleep(70); await up(home);
  }
  await sleep(2600);
}
else if (CLIP === 'completion') {
  await glide({ x: g.cta.x - 260, y: g.cta.y + 160 }, { x: g.cta.x, y: g.cta.y }, 800);
  await sleep(500);
  await down(g.cta); await sleep(70); await up(g.cta);
  await sleep(1800);
  for (let i = 0; i < 12; i++) {
    const a = await box('.answer');
    if (!a) break;
    await glide({ x: a.x, y: a.y + 80 }, a, 260);
    await sleep(120);
    await down(a); await sleep(45); await up(a);
    await sleep(360);
  }
  const back = await box('#back-home');
  if (back) {
    await glide({ x: back.x - 120, y: back.y - 60 }, back, 700);
    await sleep(400);
    await down(back); await sleep(60); await up(back);
  }
  await sleep(2600);
}
else if (CLIP === 'journey-triple') {
  // 同一路径连续三次：进入 → 返回 → 进入 → 返回 → 进入
  for (let round = 0; round < 3; round++) {
    const cta = await box('#start-today');
    if (cta) {
      await glide({ x: cta.x - 200, y: cta.y + 120 }, cta, 700);
      await sleep(380);
      await down(cta); await sleep(70); await up(cta);
    }
    await sleep(1500);
    const quit = await box('#quit');
    if (quit) {
      await glide({ x: quit.x + 160, y: quit.y + 90 }, quit, 500);
      await sleep(300);
      await down(quit); await sleep(70); await up(quit);
      await sleep(1200);
    }
    const home = await box('#back-home');
    if (home) {
      await glide({ x: home.x - 120, y: home.y - 50 }, home, 600);
      await sleep(320);
      await down(home); await sleep(70); await up(home);
      await sleep(1800);
    }
  }
  await sleep(900);
}
else if (CLIP === 'theme-switch') {
  await move(g.theme.x, g.theme.y); await sleep(600);
  await down(g.theme); await sleep(50); await up(g.theme);
  await sleep(2600);
  await down(g.theme); await sleep(50); await up(g.theme);
  await sleep(2600);
}
else {
  throw new Error(`unknown clip ${CLIP}`);
}

stop = true;
await send('Page.stopScreencast');
await sleep(250);
void stop; void grab;

/* ── 落盘：原始帧 + 事件日志（ffmpeg 按真实 dt 编码） ─────────────────── */
frames.forEach((f, i) => writeFileSync(join(FRAMES, `${String(i).padStart(4, '0')}.jpg`), Buffer.from(f.d, 'base64')));
writeFileSync(join(FRAMES, 'meta.json'), JSON.stringify({
  clip: CLIP, theme: THEME, themeAtStart,
  frames: frames.map((f, i) => ({ i, t: f.t, px: f.p.x, py: f.p.y, down: f.p.down, visible: f.p.visible })),
  events: log, errors,
}));
const state = JSON.parse(await ev(`JSON.stringify({
  theme: document.documentElement.dataset.theme,
  lights: document.documentElement.dataset.lights || 'on',
  page: (document.querySelector('#main')?.innerText || '').replace(/\\s+/g, ' ').slice(0, 60),
  rows: document.querySelectorAll('.d-row').length,
  done: document.querySelectorAll('.d-seg.is-done').length
})`) || '{}');
writeFileSync(join(OUT, `${CLIP}-${THEME}.json`), JSON.stringify({ clip: CLIP, theme: THEME, themeAtStart, frameCount: frames.length, state, errors }, null, 1));
console.log(JSON.stringify({ ok: true, clip: CLIP, theme: THEME, themeAtStart, frames: frames.length, state, errors: errors.slice(0, 3) }));
ws.close(); edge.kill();
