#!/usr/bin/env node
// —— Phase 15：真实浏览器无障碍/对比度探针 ——
// 前置：npm run build:test → node server.mjs --dir=dist-test --port=4173
// 用法：node scripts/phase15-a11y-probe.mjs [--out=screenshots/phase15b/a11y.json]
// 检查项：文字对比度（WCAG AA 4.5:1 / 大字号 3:1）、可访问名称、横向溢出、触控尺寸。
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
    const m = a.match(/^--([^=]+)=?(.*)$/);
    return m ? [m[1], m[2] || 'true'] : [a, 'true'];
}));
const OUT = args.out || 'screenshots/phase15b/a11y.json';
const PORT = Number(process.env.CDP_PORT || 9245);
const APP = process.env.APP_URL || 'http://127.0.0.1:4173/?test=1';
const PROFILE = path.resolve(process.env.LOCALAPPDATA || 'C:/Users/86152/AppData/Local', 'Temp/edge-p15-a11y');
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => existsSync(p));
const sleep = ms => new Promise(r => setTimeout(r, ms));

class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); clearTimeout(p.t); this.pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } }; }
    static async connect(port) {
        for (let i = 0; i < 120; i++) {
            try {
                const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
                const t = list.find(x => x.type === 'page' && (x.url || '').includes('4173')) || list.find(x => x.type === 'page');
                if (t) { const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); }); return new CDP(ws); }
            }
            catch { /* not up yet */ }
            await sleep(250);
        }
        throw new Error('CDP not reachable on ' + port);
    }
    send(method, params = {}, timeout = 30000) { return new Promise((res, rej) => { const id = ++this.id; const t = setTimeout(() => { this.pending.delete(id); rej(new Error('cdp timeout ' + method)); }, timeout); this.pending.set(id, { res, rej, t }); this.ws.send(JSON.stringify({ id, method, params })); }); }
    async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; }
    async waitFor(expr, timeout = 30000, label = expr) { const end = Date.now() + timeout; let last; while (Date.now() < end) { try { last = await this.eval(expr); if (last) return last; } catch (e) { last = 'err:' + e.message; } await sleep(150); } throw new Error('timeout: ' + label + ' last=' + String(last).slice(0, 160)); }
}

// 在页面里执行的审计：返回结构与违规条目
const AUDIT = `(() => {
  const parse = c => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const lum = c => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); const hi = Math.max(la, lb), lo = Math.min(la, lb); return (hi + 0.05) / (lo + 0.05); };
  const blend = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  function bgOf(el) {
    let node = el, acc = null;
    while (node && node !== document.documentElement) {
      const s = getComputedStyle(node);
      let c = parse(s.backgroundColor);
      if ((!c || c.a === 0) && s.backgroundImage && s.backgroundImage !== 'none') c = parse(s.backgroundImage); // 渐变取首个色标
      if (c && c.a > 0) { acc = acc ? blend(acc, c) : c; if (acc.a >= 0.999) return acc; }
      node = node.parentElement;
    }
    const root = parse(getComputedStyle(document.body).backgroundColor) || { r: 255, g: 255, b: 255, a: 1 };
    return acc ? blend(acc, root) : root;
  }
  const isVisible = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05; };
  const nameOf = el => (el.getAttribute('aria-label') || el.textContent || '').trim() || (el.querySelector('img')?.alt ?? '');
  const contrast = [], unnamed = [], small = [], overflow = [];
  const vw = innerWidth;
  const nodes = [...document.querySelectorAll('body *')];
  for (const el of nodes) {
    if (!isVisible(el)) continue;
    const own = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (own) {
      const s = getComputedStyle(el);
      const fg = parse(s.color);
      if (fg && fg.a > 0.05) {
        const bg = bgOf(el);
        const size = parseFloat(s.fontSize);
        const weight = Number(s.fontWeight) || 400;
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const need = large ? 3 : 4.5;
        const r = ratio(fg.a < 1 ? blend(fg, bg) : fg, bg);
        if (r < need) contrast.push({ text: el.textContent.trim().slice(0, 40), cls: el.className?.toString().slice(0, 60), size, ratio: Math.round(r * 100) / 100, need });
      }
    }
    if (el.matches('button, a[href], input, select, textarea, [role=button]') && !nameOf(el)) unnamed.push(el.outerHTML.slice(0, 100));
    if (el.matches('button, [role=button], a[href]')) {
      const r = el.getBoundingClientRect();
      if (vw <= 760 && r.height > 0 && r.height < 40) small.push({ label: nameOf(el).slice(0, 24), h: Math.round(r.height) });
    }
    const scrolls = (() => { let n = el.parentElement; while (n) { const ox = getComputedStyle(n).overflowX; if (ox === 'auto' || ox === 'scroll') return true; n = n.parentElement; } return false; })();
    const r = el.getBoundingClientRect();
    if (!scrolls && r.width > 0 && (r.right > vw + 1 || r.left < -1)) overflow.push({ cls: el.className?.toString().slice(0, 50), right: Math.round(r.right), vw });
  }
  return {
    viewport: { w: innerWidth, h: innerHeight },
    contrastIssues: contrast.slice(0, 60),
    contrastCount: contrast.length,
    unnamedControls: unnamed.slice(0, 20),
    smallTargets: small.slice(0, 20),
    overflow: overflow.slice(0, 10),
    h1Count: document.querySelectorAll('h1').length,
  };
})()`;

const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=1920,1080', 'about:blank',
], { stdio: 'ignore', detached: false });

const report = { at: new Date().toISOString(), app: APP, runs: [] };
let cdp;
const setViewport = async (w, h) => { await cdp.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w <= 480 }); await sleep(250); };
try {
    await mkdir(path.dirname(OUT), { recursive: true });
    cdp = await CDP.connect(PORT);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.eval(`location.href=${JSON.stringify(APP)}`);
    await cdp.waitFor('!!(window.__planTest && document.querySelector("[data-nav=home]"))', 45000, 'boot');
    // 与截图脚本一致的播种路径：干净数据 + 真实计划
    await cdp.eval(`__planTest.seedUnified()`).catch(() => null);
    await cdp.eval(`__planTest.resetPlan()`).catch(() => null);
    await cdp.eval(`__planTest.createPlan(150)`).catch(() => null);

    for (const vp of [{ id: '1920x1080', w: 1920, h: 1080 }, { id: '390x844', w: 390, h: 844 }]) {
        await setViewport(vp.w, vp.h);
        await cdp.eval('document.querySelector("[data-nav=home]").click()');
        await sleep(500);
        report.runs.push({ page: 'today', theme: 'light', vp: vp.id, ...(await cdp.eval(AUDIT)) });
        await cdp.eval('document.querySelector("#theme").click()');
        await sleep(500);
        report.runs.push({ page: 'today', theme: 'dark', vp: vp.id, ...(await cdp.eval(AUDIT)) });
        await cdp.eval('document.querySelector("#theme").click()');
        await sleep(300);
    }

    // 阅读器（真实路径）
    await setViewport(1920, 1080);
    await cdp.eval('document.querySelector("[data-nav=reading]").click()');
    await sleep(500);
    const opened = await cdp.eval(`(()=>{const b=document.querySelector('[data-read-open]');if(!b)return 'missing';b.click();return 'ok';})()`);
    if (opened === 'ok') {
        await cdp.waitFor('!!document.querySelector("[data-read-start]")', 15000, 'preview');
        await cdp.eval('document.querySelector("[data-read-start]").click()');
        await cdp.waitFor('!!document.querySelector("#read-cold-self")', 15000, 'cold');
        await cdp.eval('document.querySelector("[data-read-cold-submit]").click()');
        await cdp.waitFor('!!document.querySelector("[data-tok]")', 20000, 'reader');
        await sleep(400);
        report.runs.push({ page: 'reading', theme: 'light', vp: '1920x1080', ...(await cdp.eval(AUDIT)) });
        await cdp.eval('document.querySelector("#theme").click()');
        await sleep(450);
        report.runs.push({ page: 'reading', theme: 'dark', vp: '1920x1080', ...(await cdp.eval(AUDIT)) });
        await setViewport(390, 844);
        await sleep(350);
        report.runs.push({ page: 'reading', theme: 'dark', vp: '390x844', ...(await cdp.eval(AUDIT)) });
    }
    else {
        report.runs.push({ page: 'reading', error: 'no passage to open' });
    }
}
catch (e) {
    report.error = e.message;
}
finally {
    try { edge.kill(); } catch { /* ignore */ }
}
const summary = report.runs.map(r => `${r.page}/${r.theme}/${r.vp}: contrast=${r.contrastCount ?? '-'} unnamed=${r.unnamedControls?.length ?? '-'} small=${r.smallTargets?.length ?? '-'} overflow=${r.overflow?.length ?? '-'}`);
report.summary = summary;
await writeFile(OUT, JSON.stringify(report, null, 2));
console.log(summary.join('\n'));
console.log('WROTE', OUT, report.error ? 'ERROR: ' + report.error : '');
process.exit(report.error ? 1 : 0);
