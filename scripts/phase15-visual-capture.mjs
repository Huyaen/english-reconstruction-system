#!/usr/bin/env node
// —— Phase 15：真实浏览器视觉采集（Before / After 共用）——
// 前置：npm run build:test  →  node server.mjs --dir=dist-test --port=4173
// 用法：node scripts/phase15-visual-capture.mjs --out=screenshots/phase15/before [--tag=before]
// 说明：使用独立 Edge profile（不碰用户真实学习数据）；截图来自当前真实应用。
import { spawn } from 'node:child_process';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map(a => {
    const m = a.match(/^--([^=]+)=?(.*)$/);
    return m ? [m[1], m[2] || 'true'] : [a, 'true'];
}));
const OUT = args.out || 'screenshots/phase15/after';
const TAG = args.tag || 'after';
const PORT = Number(process.env.CDP_PORT || 9244);
const APP = process.env.APP_URL || 'http://127.0.0.1:4173/?test=1';
const PROFILE = path.resolve(process.env.LOCALAPPDATA || 'C:/Users/86152/AppData/Local', `Temp/edge-${TAG}-profile`);
const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => existsSync(p));
const VIEWPORTS = [
    { id: '1920x1080', width: 1920, height: 1080 },
    { id: '1366x768', width: 1366, height: 768 },
    { id: '768x1024', width: 768, height: 1024 },
    { id: '390x844', width: 390, height: 844 },
    { id: '360x780', width: 360, height: 780 },
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const manifest = [];

class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.errors = []; ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); clearTimeout(p.t); this.pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } else if (m.method === 'Runtime.exceptionThrown') this.errors.push(m.params.exceptionDetails?.exception?.description ?? 'exception'); else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') this.errors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' ')); }; }
    static async connect(port) {
        for (let i = 0; i < 120; i++) {
            try {
                const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
                const t = list.find(x => x.type === 'page' && (x.url || '').includes('4173')) || list.find(x => x.type === 'page');
                if (t) { const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); }); return new CDP(ws); }
            } catch { /* not up yet */ }
            await sleep(250);
        }
        throw new Error('CDP not reachable on ' + port);
    }
    send(method, params = {}, timeout = 30000) { return new Promise((res, rej) => { const id = ++this.id; const t = setTimeout(() => { this.pending.delete(id); rej(new Error('cdp timeout ' + method)); }, timeout); this.pending.set(id, { res, rej, t }); this.ws.send(JSON.stringify({ id, method, params })); }); }
    async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; }
    async waitFor(expr, timeout = 20000, label = expr) { const end = Date.now() + timeout; let last; while (Date.now() < end) { try { last = await this.eval(expr); if (last) return last; } catch (e) { last = 'err:' + e.message; } await sleep(150); } throw new Error('timeout: ' + label + ' last=' + String(last).slice(0, 160)); }
    async click(sel) { return this.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'missing';e.click();return 'ok';})()`); }
}

const READ_TEXT = [
    'A library is not a building. It is a set of decisions about what deserves to be kept.',
    'When a reader opens a page that has survived a hundred years, she is meeting an argument that someone made about attention: this paragraph is worth ten minutes of your life, this sentence is worth remembering, and this word, because it carries the weight of the whole thought, should not be replaced by an easier one.',
    'Modern reading has not destroyed that argument, but it has made it harder to hear. A screen offers a thousand exits from every paragraph, and each exit is dressed as a convenience. The reader who returns to the same difficult sentence three times is not slower than the reader who skims it once; she is doing a different kind of work, and the difference shows up a day later, when only one of them can still explain what the argument was.',
    'What makes a text memorable is rarely the length of it. It is the presence of a small number of load-bearing words, arranged so that removing any one of them would cost the reader the structure of the idea.',
];
const PASSAGE_TEXT = READ_TEXT.join(' ');

const seedScript = `(async()=>{
  const TITLE='The Argument a Library Makes';
  const text=${JSON.stringify(PASSAGE_TEXT)};
  // 与生产代码一致：句子按句末标点切分并记录原文偏移
  const sentences=[];
  const re=/[^.!?]+[.!?]+/g;
  let m,i=0;
  while((m=re.exec(text))){
    const raw=m[0];
    const start=m.index+ (raw.length-raw.trimStart().length);
    const body=raw.trim();
    sentences.push({index:i++,paragraphIndex:0,text:body,start,end:start+body.length,wordCount:body.split(/\\s+/).filter(Boolean).length});
  }
  const before=text.slice(0,text.indexOf('Modern reading'));
  const after=text.slice(text.indexOf('Modern reading'));
  const paragraphs=[
    {index:0,text:before.trim(),start:0,end:before.trim().length,wordCount:0},
    {index:1,text:after.trim(),start:before.length,end:text.length,wordCount:0},
  ];
  const pIdx=s=>{for(const p of paragraphs){if(s.start>=p.start&&s.start<p.end)return p.index;}return 0;};
  for(const s of sentences)s.paragraphIndex=pIdx(s);
  for(const p of paragraphs)p.wordCount=sentences.filter(s=>s.paragraphIndex===p.index).reduce((n,s)=>n+s.wordCount,0);
  const now=Date.now();
  const passage={id:'p15-passage',title:TITLE,text,sourceType:'import',sourceUrl:'https://example.com/library-argument',topic:'reading and memory',
    wordCount:text.split(/\\s+/).filter(Boolean).length,difficulty:'hard',createdAt:now,sourceName:'Phase 15 视觉验收材料',
    language:'en',paragraphs,sentences,sourceReliability:'user_supplied',extractionMethod:'paste',contentHash:'p15-passage-hash',
    userEdited:false,importedAt:now};
  await __unitTest.put('passages',[passage]);
  await __unitTest.reload();
  return {sentences:sentences.length,paragraphs:paragraphs.length,words:passage.wordCount};
})()`;

async function setViewport(cdp, width, height) {
    // mobile:true 时 Chromium 的布局视口不是 width（实测 390 请求 → innerWidth 745，
    // 整页截图因此变成 756/861px 宽，与真实手机不符）。用 mobile:false 得到严格 width 的
    // CSS 视口，再用 touch 仿真保留触控语义。
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Emulation.setTouchEmulationEnabled', width < 700
        ? { enabled: true, maxTouchPoints: 1 }
        : { enabled: false });
    await sleep(260);
    for (let attempt = 0; attempt < 8; attempt++) {
        const m = await cdp.eval(`({ iw: innerWidth, ih: innerHeight, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })`);
        if (m.iw !== width) throw new Error(`viewport mismatch: requested ${width}, innerWidth ${m.iw}`);
        if (m.sw <= width + 1) return;
        if (attempt === 7) {
            const detail = await cdp.eval(`({
              wide: [...document.querySelectorAll('body *')].filter(el => { const b = el.getBoundingClientRect(); return b.width > 0 && b.right > innerWidth + 0.5; }).slice(0, 5).map(el => el.tagName.toLowerCase() + '.' + String(el.className || '').split(/\\s+/)[0] + '@' + Math.round(el.getBoundingClientRect().right)),
              scrollers: [...document.querySelectorAll('html, body, body *')].filter(el => el.scrollWidth > el.clientWidth + 1).slice(0, 6).map(el => (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + '.' + String(el.className || '').split(/\\s+/)[0]) + ' ' + el.scrollWidth + '/' + el.clientWidth + ' ' + getComputedStyle(el).overflowX),
              page: (document.querySelector('main h1, main .page-title') || {}).textContent || '',
            })`);
            throw new Error(`horizontal overflow at ${width}px: scrollWidth ${m.sw} > ${width} :: ${JSON.stringify(detail)}`);
        }
        await sleep(160);
    }
}

async function shot(cdp, name) {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.join(OUT, `${name}.png`);
    await writeFile(file, Buffer.from(data, 'base64'));
    manifest.push({ file, name });
    return file;
}

async function fullShot(cdp, name, expectWidth) {
    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    const buf = Buffer.from(data, 'base64');
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    const vp = await cdp.eval('({ iw: innerWidth, sw: document.documentElement.scrollWidth })');
    if (expectWidth && w !== expectWidth) throw new Error(`fullpage width ${w} !== viewport ${expectWidth} (${name})`);
    if (vp.sw > vp.iw + 1) throw new Error(`fullpage overflow ${vp.sw} > ${vp.iw} (${name})`);
    const file = path.join(OUT, `${name}.png`);
    await writeFile(file, buf);
    manifest.push({ file, name, width: w, height: h });
    return file;
}

const edge = spawn(EDGE, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--window-size=1920,1080', 'about:blank',
], { stdio: 'ignore', detached: false });

let cdp;
try {
    await mkdir(OUT, { recursive: true });
    cdp = await CDP.connect(PORT);
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.eval(`location.href=${JSON.stringify(APP)}`);
    await cdp.waitFor('!!(window.__planTest && window.__unitTest && document.querySelector("[data-nav=home]"))', 40000, 'boot');
    // 干净数据：清库 → 重载 → 播种
    await cdp.eval(`(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('vocabulary-memory-v1');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});await new Promise(res=>{const tx=db.transaction([...db.objectStoreNames],'readwrite');for(const n of db.objectStoreNames)tx.objectStore(n).clear();tx.oncomplete=()=>res();});db.close();return 'cleared';})()`);
    await cdp.eval('location.reload()');
    await cdp.waitFor('!!window.__planTest', 40000, 'boot after clean');
    const seeded = await cdp.eval('__planTest.seedUnified()');
    const passage = await cdp.eval(seedScript);
    await cdp.eval('__planTest.resetPlan()');
    const created = await cdp.eval('__planTest.createPlan(150)');
    console.log('seeded', JSON.stringify({ seeded, passage, tasks: created.tasks }));

    // 1) Today：浅色 + 深色，五个视口
    await cdp.eval('document.querySelector("[data-nav=home]").click()');
    await sleep(500);
    for (const vp of VIEWPORTS) {
        await setViewport(cdp, vp.width, vp.height);
        await cdp.eval(`(()=>{const m=document.querySelector('main');if(m)m.scrollTop=0;window.scrollTo(0,0);return 1})()`);
        await sleep(300);
        await shot(cdp, `today-light-${vp.id}`);
        if (vp.id === '1920x1080' || vp.id === '390x844') await fullShot(cdp, `today-light-${vp.id}-full`, vp.width);
    }
    // 深色：走真实设置写入路径
    await cdp.click('#theme');
    await sleep(400);
    for (const vp of VIEWPORTS) {
        await setViewport(cdp, vp.width, vp.height);
        await sleep(250);
        await shot(cdp, `today-dark-${vp.id}`);
    }
    await cdp.click('#theme');
    await sleep(300);

    // 2) Reading：真实路径进入阅读器（库 → 打开 → 开始 → 冷读 → 阅读器）
    await setViewport(cdp, 1920, 1080);
    await cdp.eval('document.querySelector("[data-nav=reading]").click()');
    await sleep(400);
    await cdp.eval(`(()=>{const b=[...document.querySelectorAll('[data-read-open]')].find(x=>x.dataset.readOpen==='p15-passage');if(!b)return 'missing';b.click();return 'ok';})()`);
    await cdp.waitFor('!!document.querySelector("[data-read-start]")', 15000, 'preview');
    await cdp.click('[data-read-start]');
    await cdp.waitFor('!!document.querySelector("#read-cold-self")', 15000, 'cold');
    await cdp.eval(`(()=>{const e=document.querySelector('#read-cold-self');e.value='45';e.dispatchEvent(new Event('input',{bubbles:true}));return 1})()`);
    await cdp.click('[data-read-cold-submit]');
    await cdp.waitFor('!!document.querySelector("[data-tok]")', 20000, 'reader');
    await sleep(400);
    for (const vp of VIEWPORTS) {
        await setViewport(cdp, vp.width, vp.height);
        await sleep(300);
        await shot(cdp, `reading-light-${vp.id}`);
        if (vp.id === '1920x1080') await fullShot(cdp, `reading-light-${vp.id}-full`);
    }
    // 侧栏收起态（桌面）
    await setViewport(cdp, 1920, 1080);
    await cdp.eval(`(()=>{const b=document.querySelector('[data-reader-side-toggle]');if(!b)return 'missing';b.click();return 'ok';})()`);
    await sleep(400);
    await shot(cdp, 'reading-light-1920x1080-sidebar-collapsed');
    await cdp.eval(`(()=>{const b=document.querySelector('[data-reader-side-toggle]');if(b)b.click();return 'ok';})()`);
    await sleep(300);

    await cdp.click('#theme');
    await sleep(400);
    for (const vp of VIEWPORTS) {
        await setViewport(cdp, vp.width, vp.height);
        await sleep(300);
        await shot(cdp, `reading-dark-${vp.id}`);
    }
    const metrics = await cdp.eval(`(()=>({
      errors:0,
      fonts: getComputedStyle(document.body).fontFamily,
      bodySize: getComputedStyle(document.querySelector('.reader-text')||document.body).fontSize,
      docHeight: document.documentElement.scrollHeight,
      overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      theme: document.documentElement.dataset.theme
    }))()`);
    await writeFile(path.join(OUT, 'manifest.json'), JSON.stringify({ tag: TAG, at: new Date().toISOString(), app: APP, viewports: VIEWPORTS.map(v => v.id), files: manifest.map(m => m.name), metrics, consoleErrors: cdp.errors.slice(0, 20) }, null, 2));
    console.log('CAPTURED', manifest.length, 'shots →', OUT);
    if (cdp.errors.length) console.log('console errors:', cdp.errors.slice(0, 8));
} catch (err) {
    console.error('CAPTURE FAILED:', err.message);
    if (cdp?.errors?.length) console.error('console:', cdp.errors.slice(0, 10));
    process.exitCode = 1;
} finally {
    try { cdp?.ws?.close(); } catch { /* ignore */ }
    edge.kill();
    await sleep(400);
    try { await rm(PROFILE, { recursive: true, force: true, maxRetries: 3 }); } catch { /* profile may stay locked */ }
}
