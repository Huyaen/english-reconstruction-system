// Phase 15d · 动态证据录屏（Edge headless + CDP screencast）
// 五个片段，各自独立成片：
//   idle      —— 页面打开后 10 秒空闲呼吸（不移动指针）
//   pointer   —— 指针移动的光影 + 按下 / 保持 / 释放
//   expand    —— 任务行展开、阅读、收回
//   journey   —— 共享元素进入训练 → 返回 → 主题切换（深→浅）
//   touch     —— 390×844 触控（点击行、按压主按钮）
// 用法：CLIP=idle PROTO=d node scripts/phase15d-recording.mjs
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const CLIP = process.env.CLIP || 'idle';
const PORT = Number(process.env.CDP_PORT || 9320);
const OUT_DIR = resolve('screenshots/phase15e/recording');
const FRAMES_DIR = join(OUT_DIR, `frames-${CLIP}-${process.env.THEME || 'dark'}`);
const W = 1440, H = 900, FPS = 30;
const MOBILE = CLIP === 'touch' || CLIP === 'idle-m';
const BREATH = process.env.BREATH || '';
const URL = 'http://127.0.0.1:4173/?test=1&proto=d' + (BREATH ? `&breath=${BREATH}` : '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => existsSync(p));
if (!edge) { console.error('EDGE NOT FOUND'); process.exit(1); }
rmSync(FRAMES_DIR, { recursive: true, force: true });
mkdirSync(FRAMES_DIR, { recursive: true });

const profile = join(process.env.TEMP || '.', `p15d-${CLIP}-${Date.now()}`);
const child = spawn(edge, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
    `--window-size=${W},${H}`, '--hide-scrollbars', '--force-device-scale-factor=1',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions', 'about:blank'],
    { stdio: 'ignore', windowsHide: true });

async function connect() {
    for (let i = 0; i < 90; i++) {
        try {
            const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
            const t = list.find(x => x.type === 'page');
            if (t) { const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); }); return ws; }
        } catch { /* not up */ }
        await sleep(250);
    }
    throw new Error('devtools not ready');
}

const ws = await connect();
let id = 0;
const pending = new Map();
const frames = [];
const errors = [];
ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else if (m.method === 'Page.screencastFrame') {
        frames.push({ ts: m.params.metadata.timestamp * 1000, data: m.params.data });
        ws.send(JSON.stringify({ id: ++id, method: 'Page.screencastFrameAck', params: { sessionId: m.params.sessionId } }));
    }
    else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails?.exception?.description || 'exception');
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
});
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;
const move = (x, y, buttons = 0) => send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: Math.round(x), y: Math.round(y), button: 'left', buttons });
const press = (x, y) => send('Input.dispatchMouseEvent', { type: 'mousePressed', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, buttons: 1 });
const release = (x, y) => send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, buttons: 0 });
const touch = (type, x, y) => send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x: Math.round(x), y: Math.round(y), radiusX: 6, radiusY: 6, force: 1, id: 1 }],
});
const glide = async (from, to, steps, delay) => {
    for (let i = 1; i <= steps; i++) {
        await move(from.x + (to.x - from.x) * (i / steps), from.y + (to.y - from.y) * (i / steps));
        await sleep(delay);
    }
};
const geom = () => evaluate(`(() => {
  const r = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), top: Math.round(b.top), h: Math.round(b.height) }; };
  return { stage: r(document.querySelector('.d-stage')), cta: r(document.querySelector('#start-today')),
    row1: r(document.querySelectorAll('.d-row')[0]), row2: r(document.querySelectorAll('.d-row')[1]),
    head1: r(document.querySelectorAll('.d-row-head')[0]), head2: r(document.querySelectorAll('.d-row-head')[1]),
    theme: r(document.querySelector('#theme')), navHome: r(document.querySelector('[data-nav="home"]')),
    scrollY: Math.round(window.scrollY) };
})()`);

try {
    await send('Page.enable');
    await send('Runtime.enable');
    if (MOBILE) {
        await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
        await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
    } else {
        await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
        await send('Emulation.setTouchEmulationEnabled', { enabled: false });
    }
    await send('Page.navigate', { url: URL });
    for (let i = 0; i < 90; i++) { if (await evaluate('!!(window.__planTest && document.querySelector(".d-stage"))')) break; await sleep(350); }
    await evaluate('window.__planTest && window.__planTest.seedUnified && window.__planTest.seedUnified()');
    await sleep(400);
    await evaluate('window.__planTest && window.__planTest.resetPlan && window.__planTest.resetPlan()');
    await evaluate('window.__planTest && window.__planTest.createPlan(150)');
    for (let i = 0; i < 60; i++) { if (await evaluate('!!document.querySelector("#start-today")')) break; await sleep(300); }
    const wantTheme = process.env.THEME || 'dark';
    for (let i = 0; i < 30; i++) {
        const now = await evaluate('document.documentElement.dataset.theme || ""');
        if ((now === 'dark') === (wantTheme === 'dark')) break;
        await evaluate(`(() => { const b = document.querySelector('#theme'); if (b) b.click(); return 1; })()`);
        await sleep(600);
    }
    await sleep(1100);

    let g = await geom();
    await send('Page.startScreencast', { format: 'jpeg', quality: 84, maxWidth: MOBILE ? 390 : W, maxHeight: MOBILE ? 844 : H, everyNthFrame: 1 });
    const started = Date.now();

    if (CLIP === 'idle' || CLIP === 'idle-m') {
        // 10 秒不碰指针：只剩环境光呼吸与光束
        await sleep(Number(process.env.IDLE_MS || 15000));
    }
    else if (CLIP === 'pointer') {
        await glide({ x: 220, y: 240 }, { x: 760, y: 210 }, 26, 42);
        await sleep(300);
        await glide({ x: 760, y: 210 }, { x: 520, y: 470 }, 20, 42);
        await sleep(400);
        await move(g.cta.x, g.cta.y);
        await sleep(700);
        await press(g.cta.x, g.cta.y);
        await sleep(420);            // 按住：压缩 + 高光收紧
        await release(g.cta.x, g.cta.y);
        await sleep(420);
        await move(g.cta.x + 240, g.cta.y - 120);
        await sleep(900);
        await deduceHover(g);
    }
    else if (CLIP === 'press') {
        // 主按钮完整过程：接近 → 按下 → 持住 → 释放回弹 → 再次轻点
        await move(g.cta.x - 260, g.cta.y - 160);
        await sleep(300);
        await glide({ x: g.cta.x - 260, y: g.cta.y - 160 }, { x: g.cta.x, y: g.cta.y }, 22, 40);
        await sleep(420);
        await press(g.cta.x, g.cta.y);
        await sleep(160);            // 压下
        await move(g.cta.x + 5, g.cta.y + 3);
        await sleep(1050);           // 持住
        await glide({ x: g.cta.x + 5, y: g.cta.y + 3 }, { x: g.cta.x + 190, y: g.cta.y + 40 }, 12, 34);
        await release(g.cta.x + 190, g.cta.y + 40);
        await sleep(1100);           // 拖出后释放：完整回弹，不跳页
        await move(g.cta.x, g.cta.y);
        await sleep(420);
        await press(g.cta.x, g.cta.y);
        await sleep(90);
        await release(g.cta.x, g.cta.y);
        await sleep(900);            // 轻点：真实进入训练
    }
    else if (CLIP === 'expand') {
        await evaluate(`(() => { const l = document.querySelector('.d-list'); if (l) l.scrollIntoView({ block: 'center', behavior: 'instant' }); return 1; })()`);
        await sleep(700);
        g = await geom();
        await move(g.row1.x, g.row1.y);
        await sleep(500);
        await press(g.head1.x, g.head1.y);
        await release(g.head1.x, g.head1.y);
        await sleep(1100);
        await move(g.head1.x + 40, g.head1.y + 60);
        await sleep(900);
        await press(g.head2.x, g.head2.y);
        await release(g.head2.x, g.head2.y);
        await sleep(1300);
        await press(g.head1.x, g.head1.y);
        await release(g.head1.x, g.head1.y);
        await sleep(1500);
    }
    else if (CLIP === 'journey') {
        await move(g.cta.x, g.cta.y);
        await sleep(500);
        await press(g.cta.x, g.cta.y);
        await sleep(260);
        await release(g.cta.x, g.cta.y);
        await sleep(1600);
        const back = await evaluate(`(() => { const b = document.querySelector('#quit') || document.querySelector('[data-nav="home"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`);
        await sleep(600);
        if (back) { await press(back.x, back.y); await release(back.x, back.y); await sleep(1500); }
        g = await geom();
        if (g.theme) { await press(g.theme.x, g.theme.y); await release(g.theme.x, g.theme.y); await sleep(1200); }
        g = await geom();
        await glide({ x: 300, y: 260 }, { x: 700, y: 300 }, 18, 40);
        await sleep(500);
        if (g.cta) { await move(g.cta.x, g.cta.y); await sleep(600); }
        await sleep(1200);
    }
    else if (CLIP === 'return') {
        // 从「词汇答题」会话直接返回 Today：验证反向共享元素转场
        await evaluate(`(() => { const rows = [...document.querySelectorAll('.d-row')]; const b = rows[1] && rows[1].querySelector('[data-task-start]'); if (b) b.click(); return !!b; })()`);
        await sleep(2200);
        await evaluate(`(() => { const b = document.querySelector('#quit'); if (b) b.click(); return !!b; })()`);
        await sleep(2000);
    }
    else if (CLIP === 'reading') {
        await evaluate(`document.querySelector('[data-nav="reading"]').click()`);
        await sleep(1200);
        await evaluate(`(() => { const b = document.querySelector('[data-read-open]'); if (b) b.click(); return 1; })()`);
        await sleep(1200);
        await evaluate(`(() => { const b = document.querySelector('[data-read-start]'); if (b) b.click(); return 1; })()`);
        await sleep(1200);
        await evaluate(`(() => { const b = document.querySelector('[data-read-cold-submit]'); if (b) b.click(); return 1; })()`);
        await sleep(1800);
        // 指针在正文上缓慢移动：只验证"文字不动、光在动、点击不被拦截"
        const r = await evaluate(`(() => { const t = document.querySelector('#read-cold'); if (!t) return null; const b = t.getBoundingClientRect(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), top: Math.round(b.y) }; })()`);
        if (r) {
            await glide({ x: r.x - 160, y: r.top + 80 }, { x: r.x + 160, y: r.top + 220 }, 30, 60);
            await sleep(1200);
            await glide({ x: r.x + 160, y: r.top + 220 }, { x: r.x - 120, y: r.top + 120 }, 24, 60);
        }
        await sleep(2600);
    }
    else if (CLIP === 'touch') {
        await evaluate(`(() => { const l = document.querySelector('.d-list'); if (l) l.scrollIntoView({ block: 'center', behavior: 'instant' }); return 1; })()`);
        await sleep(600);
        g = await geom();
        await touch('touchStart', g.row1.x, g.row1.y);
        await sleep(90);
        await touch('touchEnd', g.row1.x, g.row1.y);
        await sleep(1200);
        await touch('touchStart', g.cta.x, g.cta.y);
        await sleep(280);
        await touch('touchEnd', g.cta.x, g.cta.y);
        await sleep(900);
    }

    if (CLIP === 'expand' || CLIP === 'touch') {
        const open = await evaluate(`(() => { const r = document.querySelector('.d-row.is-open'); return r ? { open: true, h: Math.round(r.getBoundingClientRect().height), text: (r.querySelector('.d-row-detail') || {}).textContent ? r.querySelector('.d-row-detail').textContent.trim().slice(0, 24) : '' } : { open: false }; })()`);
        console.log('ROW_STATE', JSON.stringify(open));
    }
    await send('Page.stopScreencast');
    const elapsed = (Date.now() - started) / 1000;
    ws.close();
    child.kill();
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* locked */ }

    if (frames.length < 6) { console.error('TOO FEW FRAMES', frames.length); process.exit(1); }
    const t0 = frames[0].ts;
    const last = Math.min(elapsed * 1000, frames.at(-1).ts - t0 + 800);
    let idx = 0, emitted = 0;
    frames.forEach((f, i) => {
        const file = join(FRAMES_DIR, `src-${String(i).padStart(5, '0')}.jpg`);
        writeFileSync(file, Buffer.from(f.data, 'base64'));
        const target = Math.max(1, Math.round(Math.min(f.ts - t0, last) / 1000 * FPS) + 1);
        while (emitted < target) { copyFileSync(file, join(FRAMES_DIR, `f-${String(idx++).padStart(5, '0')}.jpg`)); emitted++; }
    });
    // 静态片段 CDP 可能只给少量帧：把末帧补到真实时长，画面本身就是静止的
    const want = Math.max(idx, Math.round(last / 1000 * FPS));
    while (idx < want) { copyFileSync(join(FRAMES_DIR, `src-${String(frames.length - 1).padStart(5, '0')}.jpg`), join(FRAMES_DIR, `f-${String(idx++).padStart(5, '0')}.jpg`)); }

    const mp4 = join(OUT_DIR, `${CLIP}-${process.env.THEME || 'dark'}${BREATH ? '-b' + BREATH : ''}.mp4`);
    await new Promise((res, rej) => {
        const ff = spawn('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(FPS),
            '-i', join(FRAMES_DIR, 'f-%05d.jpg'), '-c:v', 'libx264', '-preset', 'medium', '-crf', '21',
            '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4], { stdio: 'inherit', windowsHide: true });
        ff.on('exit', c => c === 0 ? res() : rej(new Error(`ffmpeg ${c}`)));
        ff.on('error', rej);
    });
    console.log(JSON.stringify({ ok: true, clip: CLIP, theme: process.env.THEME || 'dark', frames: frames.length, encoded: idx, seconds: +(last / 1000).toFixed(1), mp4, errors: errors.slice(0, 3) }));
} catch (err) {
    console.error('CLIP FAILED', CLIP, err.message);
    try { child.kill(); } catch { /* noop */ }
    process.exit(1);
}

async function deduceHover(g) {
    if (!g.row2) return;
    await move(g.row2.x, g.row2.y);
    await sleep(900);
}
