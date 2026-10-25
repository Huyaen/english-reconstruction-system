#!/usr/bin/env node
/**
 * Phase 15d — 移动端布局真实审计（设备模拟 / 桌面窄视口 分开报告）
 *
 * 目的：不依赖单一 overflow 探针。对每个「配置档 × 视口 × 页面」同时检查
 *   1) innerWidth / visualViewport 宽度是否等于目标视口
 *   2) documentElement / body 的 scrollWidth 是否超出视口
 *   3) 是否存在越过视口左右边界、且不在任何横向滚动容器内的元素
 *   4) 是否有静态定位元素宽度大于视口
 *   5) 整页截图的像素宽度是否等于「视口 × DPR」（这是 756px 问题的直接证据）
 *
 * 两个配置档必须分别报告，不得混为一谈：
 *   device  —— 真移动设备模拟：mobile:true、DPR 3、Android Chrome UA、触摸开启
 *   desktop —— 桌面窄视口：mobile:false、DPR 1、桌面 UA、无触摸
 *   设备模拟只能在「布局响应」意义上代表手机，不能冒充真机上的浏览器 UI、
 *   地址栏收缩、软键盘与真实触摸滚动。
 *
 * 输出：screenshots/phase15d/mobile-audit.json
 *       screenshots/phase15d/mobile/<profile>/<page>-<w>x<h>.png
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
const PROFILE_DIR = path.join(process.env.TEMP || '.', `p15audit-${Date.now()}`);
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));

const WIDTHS = [320, 360, 390, 414, 768];
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 Edg/128.0.0.0';
const PROFILES = {
    device: { mobile: true, dpr: 3, touch: true, ua: ANDROID_UA, label: '真移动设备模拟（DPR 3 + 移动 UA + 触摸）' },
    desktop: { mobile: false, dpr: 1, touch: false, ua: DESKTOP_UA, label: '桌面窄视口（DPR 1 + 桌面 UA，无触摸）' },
};

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
  const vv = window.visualViewport ? { width: +window.visualViewport.width.toFixed(2), scale: +window.visualViewport.scale.toFixed(3) } : null;
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
  const main = document.querySelector('main');
  return {
    vw, innerHeight, dpr: devicePixelRatio, visualViewport: vv,
    ua: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints, coarse: matchMedia('(pointer: coarse)').matches,
    docScrollW: de.scrollWidth, bodyScrollW: document.body.scrollWidth, docClientW: de.clientWidth,
    overflowX: de.scrollWidth - vw,
    escapers: escapers.slice(0, 10), escaperCount: escapers.length, wide: wide.slice(0, 6),
    hasViewportMeta: !!document.querySelector('meta[name=viewport]'),
    metaViewport: (document.querySelector('meta[name=viewport]') || {}).content || null,
    contentWidth: main ? Math.round(main.getBoundingClientRect().width) : null,
  };
})()`;

const edge = spawn(EDGE, ['--headless=new', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE_DIR}`, 'about:blank'], { stdio: 'ignore', windowsHide: true });

const report = {
    app: APP,
    generatedAt: new Date().toISOString(),
    note: 'device 档是布局层面的移动设备模拟，不等同于真机渲染；desktop 档是桌面引擎的窄视口。两档分别判定，不合并计数。',
    profiles: {}, failures: [],
};
let cdp;
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

    for (const profileName of Object.keys(PROFILES)) {
        const cfg = PROFILES[profileName];
        const dir = path.join(MOBILE_DIR, profileName);
        await mkdir(dir, { recursive: true });
        const block = { label: cfg.label, mobile: cfg.mobile, dpr: cfg.dpr, touch: cfg.touch, widths: WIDTHS, pages: {}, failures: [] };
        report.profiles[profileName] = block;
        await cdp.send('Emulation.setUserAgentOverride', { userAgent: cfg.ua, acceptLanguage: 'zh-CN,zh', platform: cfg.mobile ? 'Android' : 'Windows' });

        for (const [pageName, navSel] of [['today', '[data-nav=home]'], ['reading', '[data-nav=reading]']]) {
            await cdp.eval(`document.querySelector(${JSON.stringify(navSel)}).click()`);
            await sleep(900);
            block.pages[pageName] = {};
            for (const w of WIDTHS) {
                const h = w < 700 ? 844 : 900;
                await cdp.send('Emulation.setDeviceMetricsOverride', {
                    width: w, height: h, deviceScaleFactor: cfg.dpr, mobile: cfg.mobile,
                    screenWidth: w, screenHeight: h,
                });
                await cdp.send('Emulation.setTouchEmulationEnabled', cfg.touch ? { enabled: true, maxTouchPoints: 5 } : { enabled: false });
                await sleep(480);
                await cdp.eval('window.scrollTo(0,0)');
                await sleep(240);
                const audit = await cdp.eval(AUDIT);
                const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
                const buf = Buffer.from(shot.data, 'base64');
                const pw = buf.readUInt32BE(16), ph = buf.readUInt32BE(20);
                const name = `${pageName}-${w}x${h}`;
                await writeFile(path.join(dir, `${name}.png`), buf);
                const expectedPx = w * cfg.dpr;
                const entry = { ...audit, fullshotWidth: pw, fullshotHeight: ph, expectedPixelWidth: expectedPx, widthMatches: pw === expectedPx };
                entry.ok = audit.vw === w && pw === expectedPx && audit.docScrollW <= w + 1 && audit.bodyScrollW <= w + 1 && audit.escaperCount === 0;
                block.pages[pageName][w] = entry;
                if (!entry.ok) {
                    const fail = { profile: profileName, page: pageName, width: w, vw: audit.vw, docScrollW: audit.docScrollW, fullshotWidth: pw, expectedPixelWidth: expectedPx, escapers: audit.escaperCount };
                    block.failures.push(fail); report.failures.push(fail);
                }
                console.log(`${entry.ok ? 'OK  ' : 'FAIL'} [${profileName}] ${name}  innerWidth=${audit.vw} dpr=${audit.dpr} touch=${audit.maxTouchPoints} docScroll=${audit.docScrollW} shot=${pw}x${ph} (expect ${expectedPx}) escapers=${audit.escaperCount}`);
            }
        }
        block.pass = block.failures.length === 0;
        block.checked = Object.values(block.pages).reduce((n, p) => n + Object.keys(p).length, 0);
    }

    report.pass = report.failures.length === 0;
    report.summary = Object.fromEntries(Object.entries(report.profiles).map(([k, v]) => [k, `${v.checked - v.failures.length}/${v.checked}`]));
    await writeFile(path.join(OUT, 'mobile-audit.json'), JSON.stringify(report, null, 2));
    console.log('\n' + Object.entries(report.summary).map(([k, v]) => `${k}: ${v} 通过`).join(' | '));
    console.log(`mobile-audit: ${report.pass ? 'PASS' : 'FAIL'} (${report.failures.length} failures) → ${path.join(OUT, 'mobile-audit.json')}`);
    if (!report.pass) process.exitCode = 1;
} finally {
    try { cdp?.ws.close(); } catch { }
    edge.kill();
}
