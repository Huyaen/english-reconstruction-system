#!/usr/bin/env node
/**
 * Phase 15d — 移动端布局真实审计
 *
 * 目的：不依赖单一 overflow 探针。对多个视口 × 多个页面同时检查
 *   1) documentElement / body 的 scrollWidth 是否超出视口
 *   2) 是否存在越过视口右/左边界、且不在任何横向滚动容器内的元素
 *   3) 是否有元素宽度大于视口
 *   4) 整页截图的像素宽度是否等于视口宽度（这是 756px 问题的直接证据）
 *
 * 输出：screenshots/phase15d/mobile-audit.json + mobile/*.png
 * 用法：node scripts/phase15d-mobile-audit.mjs
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const PORT = Number(process.env.CDP_PORT || 9530);
const APP = process.env.APP_URL || 'http://127.0.0.1:4173/?test=1&proto=d';
const OUT = process.env.OUT || 'screenshots/phase15d';
const MOBILE_DIR = path.join(OUT, 'mobile');
const PROFILE = path.join(process.env.TEMP || '.', `p15audit-${Date.now()}`);
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WIDTHS = [320, 360, 390, 414, 768];

class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
    static async connect(port) {
        for (let i = 0; i < 100; i++) {
            try {
                const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
                const page = list.find(t => t.type === 'page');
                if (page) {
                    const ws = new WebSocket(page.webSocketDebuggerUrl);
                    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws failed')); });
                    const c = new CDP(ws); c.hook(); return c;
                }
            } catch { /* retry */ }
            await sleep(250);
        }
        throw new Error('CDP 连接超时');
    }
    send(method, params = {}) {
        return new Promise(resolve => { const id = ++this.id; this.pending.set(id, resolve); this.ws.send(JSON.stringify({ id, method, params })); });
    }
    hook() { this.ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && this.pending.has(m.id)) { this.pending.get(m.id)(m.result); this.pending.delete(m.id); } }); }
    async eval(expr) {
        const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
        return r.result?.value;
    }
    async waitFor(expr, timeout = 20000, label = '') {
        const t0 = Date.now();
        while (Date.now() - t0 < timeout) { if (await this.eval(expr)) return true; await sleep(180); }
        throw new Error(`waitFor 超时: ${label || expr}`);
    }
}

const AUDIT = `(() => {
  const vw = innerWidth;
  const de = document.documentElement;
  const isScrollX = el => { const o = getComputedStyle(el).overflowX; return o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip'; };
  const clippedBy = el => {
    let a = el.parentElement;
    while (a && a !== document.body) {
      const r = a.getBoundingClientRect();
      if (isScrollX(a) && r.right <= vw + 1 && r.left >= -1) return a;
      a = a.parentElement;
    }
    return null;
  };
  const escapers = [], wide = [];
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') return;
    if ((r.right > vw + 1 || r.left < -1) && !clippedBy(el)) {
      escapers.push({ sel: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : ''),
        left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width) });
    }
    if (r.width > vw + 1 && cs.position === 'static') wide.push({ sel: el.tagName.toLowerCase() + '.' + String(el.className || '').split(/\\s+/)[0], width: Math.round(r.width) });
  });
  return {
    vw, innerHeight, dpr: devicePixelRatio,
    docScrollW: de.scrollWidth, bodyScrollW: document.body.scrollWidth, docClientW: de.clientWidth,
    overflowX: de.scrollWidth - vw,
    escapers: escapers.slice(0, 10), escaperCount: escapers.length, wide: wide.slice(0, 6),
    hasViewportMeta: !!document.querySelector('meta[name=viewport]'),
    contentWidth: document.querySelector('main') ? Math.round(document.querySelector('main').getBoundingClientRect().width) : null,
  };
})()`;

const edge = spawn(EDGE, ['--headless=new', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });

let cdp;
const report = { app: APP, generatedAt: new Date().toISOString(), widths: WIDTHS, pages: {}, failures: [] };
try {
    await mkdir(MOBILE_DIR, { recursive: true });
    cdp = await CDP.connect(PORT);
    await cdp.send('Runtime.enable'); await cdp.send('Page.enable');
    await cdp.send('Page.navigate', { url: APP });
    await cdp.waitFor('!!(window.__planTest && document.querySelector("[data-nav=home]"))', 40000, 'boot');
    const seeded = await cdp.eval('__planTest.seedUnified()');
    await cdp.eval('__planTest.resetPlan()');
    await cdp.eval('__planTest.createPlan(150)');
    await sleep(600);
    report.fixture = seeded;

    for (const [pageName, navSel] of [['today', '[data-nav=home]'], ['reading', '[data-nav=reading]']]) {
        await cdp.eval(`document.querySelector(${JSON.stringify(navSel)}).click()`);
        await sleep(900);
        report.pages[pageName] = {};
        for (const w of WIDTHS) {
            await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: w < 700 ? 844 : 900, deviceScaleFactor: 1, mobile: false });
            await cdp.send('Emulation.setTouchEmulationEnabled', w < 700
                ? { enabled: true, maxTouchPoints: 1 }
                : { enabled: false });
            await sleep(420);
            await cdp.eval('window.scrollTo(0,0)');
            await sleep(220);
            const audit = await cdp.eval(AUDIT);
            const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
            const buf = Buffer.from(shot.data, 'base64');
            const pw = buf.readUInt32BE(16), ph = buf.readUInt32BE(20);
            const name = `${pageName}-${w}x${w < 700 ? 844 : 900}`;
            await writeFile(path.join(MOBILE_DIR, `${name}.png`), buf);
            const entry = { ...audit, fullshotWidth: pw, fullshotHeight: ph, widthMatches: pw === w };
            entry.ok = audit.vw === w && pw === w && audit.docScrollW <= w + 1 && audit.bodyScrollW <= w + 1 && audit.escaperCount === 0;
            report.pages[pageName][w] = entry;
            if (!entry.ok) report.failures.push({ page: pageName, width: w, vw: audit.vw, docScrollW: audit.docScrollW, fullshotWidth: pw, escapers: audit.escaperCount });
            console.log(`${entry.ok ? 'OK  ' : 'FAIL'} ${name}  innerWidth=${audit.vw} docScroll=${audit.docScrollW} shot=${pw}x${ph} escapers=${audit.escaperCount}`);
        }
    }
    report.pass = report.failures.length === 0;
    await writeFile(path.join(OUT, 'mobile-audit.json'), JSON.stringify(report, null, 2));
    console.log(`\nmobile-audit: ${report.pass ? 'PASS' : 'FAIL'} (${report.failures.length} failures) → ${path.join(OUT, 'mobile-audit.json')}`);
    if (!report.pass) process.exitCode = 1;
} finally {
    try { cdp?.ws.close(); } catch { }
    edge.kill();
}
