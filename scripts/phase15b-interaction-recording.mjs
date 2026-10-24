// Phase 15b · 真实浏览器交互录屏（Edge headless + CDP screencast）
// 目的：用真机像素证明「光 / 材质 / 纵深 / 物理交互」不是静态截图作弊。
// 流程：深色 Today（指针高光 → 行悬停 → 按压 → 页面转场）→ 切浅色 → 重复。
// 输出：screenshots/phase15b/recording/today-interaction.mp4

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const OUT_DIR = resolve('screenshots/phase15b/recording');
const FRAMES_DIR = join(OUT_DIR, 'frames');
const PORT = 9240;
const URL = 'http://127.0.0.1:4173/?test=1';
const W = 1440, H = 900, FPS = 30;

const EDGE_CANDIDATES = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];
const edge = EDGE_CANDIDATES.find(p => existsSync(p));
if (!edge) {
  console.error('EDGE NOT FOUND');
  process.exit(1);
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(FRAMES_DIR, { recursive: true });

const profile = join(process.env.TEMP || '.', `p15b-rec-${Date.now()}`);
const child = spawn(edge, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`, '--hide-scrollbars', '--force-device-scale-factor=1',
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank',
], { stdio: 'ignore', windowsHide: true });

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitJson() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return await r.json();
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('devtools not ready');
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.handlers = new Map();
    ws.addEventListener('message', ev => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve: res, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(`${msg.error.message}`)) : res(msg.result);
      } else if (msg.method) {
        const h = this.handlers.get(msg.method);
        if (h) h(msg.params);
      }
    });
  }
  on(method, fn) { this.handlers.set(method, fn); }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, reject) => {
      this.pending.set(id, { resolve: res, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error(`timeout ${method}`)); }
      }, 20000);
    });
  }
  async eval(expr, awaitPromise = false) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'eval failed');
    return r.result?.value;
  }
  async move(x, y, steps = 8, dt = 24) {
    for (let i = 1; i <= steps; i++) {
      await this.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: x + ((i / steps) - 1) * 0, y, buttons: 0,
      });
      await sleep(dt);
    }
  }
  async moveTo(x, y, fromX, fromY, steps = 10, dt = 26) {
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await this.send('Input.dispatchMouseEvent', {
        type: 'mouseMoved', x: fromX + (x - fromX) * t, y: fromY + (y - fromY) * t, buttons: 0,
      });
      await sleep(dt);
    }
  }
  async click(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
    await sleep(90);
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
  }
}

const frames = [];
let started = 0;

async function main() {
  await waitJson();
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(URL)}`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);

  cdp.on('Page.screencastFrame', async p => {
    frames.push({ ts: p.metadata.timestamp, data: p.data });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: p.sessionId }); } catch { /* closed */ }
  });

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  // 等应用真正挂载
  for (let i = 0; i < 60; i++) {
    const ok = await cdp.eval(`!!document.querySelector('.today-hero') && document.querySelectorAll('[data-task]').length > 2`);
    if (ok) break;
    await sleep(250);
  }
  // 与截图脚本同一套种数据路径：真实计划（9 项）+ 真实阅读材料
  await cdp.eval('__planTest.seedUnified()', true);
  await cdp.eval('__planTest.resetPlan()', true);
  await cdp.eval('__planTest.createPlan(150)', true);
  // 主方向是深色：确保从石墨开始，录屏中段再切浅色
  const themeNow = await cdp.eval(`document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')`);
  if (themeNow !== 'dark') {
    await cdp.eval(`(() => { const b = document.querySelector('#theme'); if (b) b.click(); return true; })()`);
    await sleep(420);
  }
  await cdp.eval(`(() => { document.documentElement.style.scrollBehavior='auto'; window.scrollTo(0,0); return true; })()`);
  await sleep(600);

  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 82, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  started = Date.now();

  let box = null;
  for (let i = 0; i < 40; i++) {
    box = await cdp.eval(`(() => {
    const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x + b.width/2), y: Math.round(b.y + b.height/2) }; };
    return {
      hero: r(document.querySelector('.today-hero')),
      next: r(document.querySelector('.hero-next')),
      start: r(document.querySelector('#start-today')),
      row1: r(document.querySelectorAll('[data-task]')[0]),
      row2: r(document.querySelectorAll('[data-task]')[1]),
      theme: r(document.querySelector('#theme')),
      navLib: r(document.querySelector('[data-nav="words"]')),
      navHome: r(document.querySelector('[data-nav="home"]')),
      h: innerHeight,
    };
  })()`);
    if (box && box.hero && box.row1 && box.row2 && box.start && box.theme) break;
    await sleep(250);
  }
  if (!box || !box.hero || !box.row1 || !box.start) {
    console.error('BOX MISSING', JSON.stringify(box));
    throw new Error('geometry not ready');
  }

  // —— 深色：指针高光横扫 → 行悬停 → 按压 → 切换页面再回来 ——
  await sleep(500);
  await cdp.moveTo(box.hero.x + 210, box.hero.y - 40, box.hero.x - 260, box.hero.y - 60, 14, 26);
  await sleep(420);
  await cdp.moveTo(box.hero.x + 300, box.hero.y + 20, box.hero.x + 210, box.hero.y - 40, 10, 24);
  await sleep(300);
  await cdp.moveTo(box.row1.x, box.row1.y, box.hero.x + 300, box.hero.y + 20, 12, 24);
  await sleep(520);
  await cdp.moveTo(box.row2.x, box.row2.y, box.row1.x, box.row1.y, 8, 26);
  await sleep(480);
  // 按压（真实 mousePressed，松开在另一行，避免触发任务会话）
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.row2.x, y: box.row2.y, button: 'left', clickCount: 1, buttons: 1 });
  await sleep(260);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.row2.x, y: box.row2.y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(360);
  // 页面转场：我的词库 → 今日学习
  if (box.navLib) {
    await cdp.click(box.navLib.x, box.navLib.y);
    await sleep(760);
    await cdp.click(box.navHome.x, box.navHome.y);
    await sleep(720);
  }

  // —— 切浅色，重复同一套交互 ——
  await cdp.click(box.theme.x, box.theme.y);
  await sleep(620);
  await cdp.moveTo(box.hero.x + 180, box.hero.y - 30, box.hero.x - 200, box.hero.y - 40, 12, 26);
  await sleep(380);
  await cdp.moveTo(box.row1.x, box.row1.y + 10, box.hero.x + 180, box.hero.y - 30, 12, 24);
  await sleep(520);
  await cdp.moveTo(box.start.x, box.start.y, box.row1.x, box.row1.y + 10, 10, 26);
  await sleep(300);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.start.x, y: box.start.y, button: 'left', clickCount: 1, buttons: 1 });
  await sleep(150);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.start.x, y: box.start.y, button: 'left', clickCount: 1, buttons: 0 });
  await sleep(900);

  await cdp.send('Page.stopScreencast');
  const elapsed = (Date.now() - started) / 1000;
  await sleep(200);
  ws.close();
  child.kill();
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* locked */ }

  // —— 帧 → 固定 30fps 序列（按 CDP 时间戳还原真实节奏）——
  if (frames.length < 10) {
    console.error(`TOO FEW FRAMES: ${frames.length}`);
    process.exit(1);
  }
  const t0 = frames[0].ts;
  let idx = 0;
  let emitted = 0;
  for (let i = 0; i < frames.length; i++) {
    const cur = Math.min(frames[i].ts - t0, elapsed);
    const file = join(FRAMES_DIR, `src-${String(i).padStart(5, '0')}.jpg`);
    writeFileSync(file, Buffer.from(frames[i].data, 'base64'));
    // 累计时间 → 目标帧号：60fps 输入被正确降采样到 30fps，不再无谓翻倍
    const target = Math.max(1, Math.round(cur * FPS) + 1);
    while (emitted < target) {
      copyFileSync(file, join(FRAMES_DIR, `f-${String(idx++).padStart(5, '0')}.jpg`));
      emitted++;
    }
  }
  const tail = Math.max(1, Math.round(Math.min(0.6, elapsed - (frames.at(-1).ts - t0)) * FPS));
  for (let k = 0; k < tail; k++) {
    copyFileSync(join(FRAMES_DIR, `src-${String(frames.length - 1).padStart(5, '0')}.jpg`), join(FRAMES_DIR, `f-${String(idx++).padStart(5, '0')}.jpg`));
  }
  const mp4 = join(OUT_DIR, 'today-interaction.mp4');
  await new Promise((res, rej) => {
    const ff = spawn('ffmpeg', [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-framerate', String(FPS), '-i', join(FRAMES_DIR, 'f-%05d.jpg'),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart', mp4,
    ], { stdio: 'inherit', windowsHide: true });
    ff.on('exit', code => code === 0 ? res() : rej(new Error(`ffmpeg exit ${code}`)));
    ff.on('error', rej);
  });
  console.log(JSON.stringify({ ok: true, frames: frames.length, encoded: idx, seconds: +elapsed.toFixed(1), mp4 }, null, 2));
}

main().catch(err => {
  console.error('RECORDING FAILED:', err.message);
  try { child.kill(); } catch { /* noop */ }
  process.exit(1);
});
