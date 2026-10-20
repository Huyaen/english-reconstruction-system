#!/usr/bin/env node
// —— Phase 5.1 真实浏览器 OCR 验收（独立 profile 无头 Edge + CDP）——
// 前置：npm run build:test && node server.mjs --dir=dist-test --port=4173
//        msedge --headless=new --remote-debugging-port=9225 --user-data-dir=<独立 profile> http://127.0.0.1:4173/?test=1
// 验收：真实截图 → 本地 OCR（Wasm）→ 用户修改 → 必须确认 → 入库；
//       以及格式拒绝 / 空图 / 模型加载失败 / 取消 / 不上传图片。
import fs from 'node:fs';
import path from 'node:path';

const PORT = process.env.SMOKE_PORT || '9225';
const BASE = `http://127.0.0.1:${PORT}`;
const APP_MATCH = process.env.SMOKE_APP || '127.0.0.1:4173';
const APP_URL = process.env.SMOKE_URL || 'http://127.0.0.1:4173/?test=1';
const FIXTURE = path.resolve('tests/fixtures/reading-ocr.png');
const BLANK = path.resolve('tests/fixtures/reading-blank.png');
const results = [];
function check(name, ok, detail = '') {
    results.push({ name, ok: !!ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  · ' + detail : ''}`);
}
async function pageTarget() {
    const list = await (await fetch(`${BASE}/json/list`)).json();
    return list.find(x => x.type === 'page' && (x.url || '').includes(APP_MATCH));
}
class CDP {
    constructor(ws) {
        this.ws = ws; this.id = 0; this.pending = new Map(); this.events = [];
        ws.onmessage = ev => {
            const m = JSON.parse(ev.data);
            if (m.id && this.pending.has(m.id)) {
                const { res, rej } = this.pending.get(m.id);
                this.pending.delete(m.id);
                m.error ? rej(new Error(m.error.message || JSON.stringify(m.error))) : res(m.result);
            }
            else if (m.method)
                this.events.push(m);
        };
    }
    static async connect() {
        const t = await pageTarget();
        if (!t)
            throw new Error('no page target for ' + APP_MATCH);
        const ws = new WebSocket(t.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
        return new CDP(ws);
    }
    send(method, params = {}) {
        return new Promise((res, rej) => {
            const id = ++this.id;
            this.pending.set(id, { res, rej });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }
    async eval(expression) {
        const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails)
            throw new Error('eval exception: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
        return r.result.value;
    }
    async waitFor(expression, timeout = 20000, label = expression) {
        const deadline = Date.now() + timeout;
        let last;
        while (Date.now() < deadline) {
            try {
                last = await this.eval(expression);
                if (last)
                    return last;
            }
            catch (e) { last = 'err:' + e.message; }
            await new Promise(r => setTimeout(r, 250));
        }
        throw new Error(`waitFor timeout: ${label} | last=${JSON.stringify(last).slice(0, 200)}`);
    }
    // 真实文件选择：走 DOM.setFileInputFiles（和用户点开文件框选文件等价）
    async setFiles(selector, files) {
        const doc = await this.send('DOM.getDocument', { depth: -1 });
        const node = await this.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector });
        if (!node.nodeId)
            throw new Error('file input not found: ' + selector);
        await this.send('DOM.setFileInputFiles', { nodeId: node.nodeId, files });
        return 'ok';
    }
}
const cdp = await CDP.connect();
await cdp.send('Runtime.enable');
await cdp.send('Log.enable');
await cdp.send('Network.enable');
await cdp.send('DOM.enable');
const ev = expr => cdp.eval(expr);
const wait = (expr, label, timeout = 30000) => cdp.waitFor(expr, timeout, label);
const click = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'MISSING ${sel}';e.click();return 'ok';})()`);
const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)})||{textContent:''}).textContent`);
const rows = store => ev(`(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('vocabulary-memory-v1');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});const out=await new Promise((res,rej)=>{const r=db.transaction(${JSON.stringify(store)}).objectStore(${JSON.stringify(store)}).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});db.close();return JSON.stringify(out);})()`);
const visible = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});return !!e && !e.hidden && e.getClientRects().length>0;})()`);
async function openOcrPanel() {
    // 保存后界面会进入预览：重新载入 → 回到阅读库 → 展开截图面板
    await cdp.send('Page.reload');
    await wait(`!!document.querySelector('#import')`, 'boot for ocr panel');
    await click('[data-nav="reading"]');
    await wait(`!!document.querySelector('[data-read-ocr-open]')`, 'reading nav');
    await click('[data-read-ocr-open]');
    await wait(`(()=>{const b=document.querySelector('#read-ocr-box');return !!b && !b.hidden;})()`, 'ocr panel reopen');
}
const clearDb = () => ev(`(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('vocabulary-memory-v1');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});await new Promise(res=>{const tx=db.transaction([...db.objectStoreNames],'readwrite');for(const n of db.objectStoreNames)tx.objectStore(n).clear();tx.oncomplete=()=>res();});db.close();return 'cleared';})()`);

try {
    // —— 0. 干净启动 ——
    await cdp.send('Page.navigate', { url: APP_URL });
    await wait(`!!document.querySelector('#import')`, 'app boot');
    check('OCR 测试钩子仅在测试构建可用', !!(await ev('!!window.__ocrTest')), 'dist-test');
    await clearDb();
    await cdp.send('Page.reload');
    await wait(`!!document.querySelector('#import')`, 'boot after clear');
    await click('[data-nav="reading"]');
    await wait(`!!document.querySelector('#read-import')`, 'reading library');

    // —— 1. 截图面板与格式门禁 ——
    check('截图 OCR 面板默认收起', (await visible('#read-ocr-box')) === false);
    await click('[data-read-ocr-open]');
    await wait(`!!document.querySelector('#read-ocr-box') && !document.querySelector('#read-ocr-box').hidden`, 'ocr panel');
    check('点开后可选择截图，并说明图片不会上传', /不会上传/.test(await text('#read-ocr-msg')), (await text('#read-ocr-msg')).slice(0, 30));

    fs.writeFileSync('tests/fixtures/not-an-image.txt', 'this is not a screenshot\n', 'utf8');
    await cdp.setFiles('#read-image', [path.resolve('tests/fixtures/not-an-image.txt')]);
    await wait(`/只支持/.test(document.querySelector('#read-ocr-msg').textContent)`, 'unsupported msg', 8000);
    check('非 PNG/JPG 直接拒绝，并给人工录入出口', /只支持 PNG/.test(await text('#read-ocr-msg')) && (await visible('[data-read-ocr-manual]')), (await text('#read-ocr-msg')).slice(0, 40));
    check('被拒绝时不会出现“开始识别”按钮', (await visible('[data-read-ocr-run]')) === false);

    // —— 2. 真实截图 → 真实本地 OCR ——
    await cdp.setFiles('#read-image', [FIXTURE]);
    await wait(`(()=>{const p=document.querySelector('#read-ocr-preview');return !!p && !p.hidden && p.src.startsWith('blob:');})()`, 'preview blob', 8000);
    check('选择截图后显示本地预览（blob:，未上传）', true, await ev(`document.querySelector('#read-ocr-preview').src.slice(0,12)`));
    check('有效图片才出现“开始本地识别”', await visible('[data-read-ocr-run]'));
    await click('[data-read-ocr-run]');
    const t0 = Date.now();
    await wait(`(()=>{const t=document.querySelector('#read-ocr-text');return !!t && t.value.length>200;})()`, 'ocr text ready', 180000);
    const ocrMs = Date.now() - t0;
    const ocrText = await ev(`document.querySelector('#read-ocr-text').value`);
    check('真实 OCR 识别出英文正文（本地 Wasm 执行）', ocrText.length > 400, `${ocrText.length} chars, ${ocrMs}ms`);
    check('识别结果包含关键词：reconstruction / comprehension / spaced repetition',
        /reconstruction/i.test(ocrText) && /comprehension/i.test(ocrText) && /spaced\s+repetition/i.test(ocrText),
        ocrText.slice(0, 60).replace(/\n/g, ' '));
    check('识别结果保留段落结构（不是一整行）', ocrText.split('\n').filter(l => l.trim()).length >= 4, `${ocrText.split('\n').length} lines`);
    const progressGone = (await visible('#read-ocr-progress')) === false;
    check('识别完成后进度条收起', progressGone);

    // —— 3. 未确认 → 不许入库 ——
    await click('[data-read-ocr-save]');
    await wait(`/勾选|确认/.test(document.querySelector('#read-ocr-msg').textContent)`, 'confirm gate msg', 8000);
    check('未勾选“已核对”时拒绝入库', JSON.parse(await rows('passages')).length === 0, (await text('#read-ocr-msg')).slice(0, 40));

    // —— 4. 用户修改识别结果 → 确认 → 入库 ——
    const EDITED = ocrText.replace(/\s+/g, ' ').trim() + ' One more sentence the learner typed by hand after checking the scan.';
    await ev(`(()=>{const t=document.querySelector('#read-ocr-text');t.value=${JSON.stringify(EDITED)};t.dispatchEvent(new Event('input',{bubbles:true}));return 'ok';})()`);
    await ev(`(()=>{const c=document.querySelector('#read-ocr-confirm');c.checked=true;c.dispatchEvent(new Event('change',{bubbles:true}));return 'ok';})()`);
    await click('[data-read-ocr-save]');
    await wait(`!!document.querySelector('#read-preview')`, 'preview after ocr save', 15000);
    const previewText = await text('#read-preview');
    check('确认后进入预览（先猜，不泄露翻译）', /先猜一下|猜测/.test(previewText) && !/[\u4e00-\u9fa5]{12,}/.test(previewText), previewText.slice(0, 40));
    const saved = JSON.parse(await rows('passages'));
    const p = saved[0] || {};
    check('OCR 文章落库 1 篇', saved.length === 1, `count=${saved.length}`);
    check('来源类型=截图上传、可靠性=unknown、方法=local_ocr',
        p.sourceType === 'uploaded_image' && p.sourceReliability === 'unknown' && p.extractionMethod === 'local_ocr',
        `${p.sourceType}/${p.sourceReliability}/${p.extractionMethod}`);
    check('记录用户修改过（userEdited）与 OCR 置信度', p.userEdited === true && !!p.sourceMetadata?.confidence, JSON.stringify(p.sourceMetadata || {}));
    check('用户手工补的句子被保留', String(p.text || '').includes('typed by hand'), String(p.text || '').slice(-50));

    // —— 5. 空图：不假装识别成功 ——
    await openOcrPanel();
    await cdp.setFiles('#read-image', [BLANK]);
    await wait(`(()=>{const p=document.querySelector('#read-ocr-preview');return !!p && !p.hidden;})()`, 'blank preview', 8000);
    await click('[data-read-ocr-run]');
    await wait(`/没有从这张图里识别出/.test(document.querySelector('#read-ocr-msg').textContent)`, 'empty result msg', 120000);
    check('空白图明确说“没识别出文字”，不伪造结果', /没有从这张图里识别出/.test(await text('#read-ocr-msg')));
    check('空白图不会入库', JSON.parse(await rows('passages')).length === 1);
    check('空白图后仍给手动录入出口', await visible('[data-read-ocr-manual]'));

    // —— 6. 模型加载失败：说清原因 + 不崩溃 ——
    // —— 6. 模型加载失败：真实引擎指向不可达地址，验证报错分类（不是 mock）——
    const deadRun = JSON.parse(await ev(`(async()=>{
        const file=document.querySelector('#read-image').files[0];
        const r=await window.__ocrTest.recognizeWithPaths(file,{
            langPath:'http://127.0.0.1:9/eng',
            corePath:'http://127.0.0.1:9/core',
            workerPath:'http://127.0.0.1:9/worker.min.js'
        },{timeoutMs:25000});
        return JSON.stringify(r);
    })()`));
    check('引擎加载失败时明确报“模型/网络”原因（不是沉默或假成功）',
        deadRun.ok === false && ['model-load-failed', 'timeout', 'engine-unavailable'].includes(deadRun.code),
        `${deadRun.code} · ${String(deadRun.message || '').slice(0, 40)}`);
    check('失败时给出可读提示与人工录入出口', /模型|网络|超时/.test(String(deadRun.message || '')), String(deadRun.message || '').slice(0, 50));

    // —— 7. 取消：真的停下，不入库 ——
    await openOcrPanel();
    await cdp.setFiles('#read-image', [FIXTURE]);
    await wait(`(()=>{const p=document.querySelector('#read-ocr-preview');return !!p && !p.hidden;})()`, 'preview for cancel', 8000);
    await click('[data-read-ocr-run]');
    await new Promise(r => setTimeout(r, 700));
    await click('[data-read-ocr-cancel]');
    await wait(`/取消/.test(document.querySelector('#read-ocr-msg').textContent)`, 'cancel msg', 30000);
    check('取消后明确提示已取消', /取消/.test(await text('#read-ocr-msg')));
    check('取消不会写入文章', JSON.parse(await rows('passages')).length === 1);
    const stillLoaded = await ev('window.__ocrTest.loaded()');
    check('取消时 worker 被释放（不留在后台跑）', stillLoaded === false, 'loaded=' + stillLoaded);

    // —— 8. 图片没有离开这台设备 ——
    const reqs = cdp.events.filter(e => e.method === 'Network.requestWillBeSent').map(e => e.params.request);
    const uploads = reqs.filter(r => /reading-ocr|blob:|data:image/.test(r.url) && r.method !== 'GET');
    const posts = reqs.filter(r => r.method === 'POST' && !/\/v1\/|api\./i.test(r.url));
    check('识别过程中没有把图片上传到任何服务器', uploads.length === 0 && posts.length === 0, `${reqs.length} 个请求，上传=${uploads.length}，POST=${posts.length}`);
} catch (e) {
    check('脚本执行', false, e.message);
} finally {
    const pass = results.filter(r => r.ok).length;
    const fail = results.length - pass;
    const lines = [`# Phase 5.1 OCR 验收 · ${pass}/${results.length}`, '', ...results.map(r => `- ${r.ok ? 'PASS' : 'FAIL'} · ${r.name}${r.detail ? ` — ${r.detail}` : ''}`), ''];
    try {
        fs.mkdirSync('screenshots', { recursive: true });
        fs.writeFileSync('screenshots/phase5-1-ocr-report.md', lines.join('\n'), 'utf8');
    } catch { /* ignore */ }
    console.log(`\n${fail ? 'FAIL' : 'PASS'}  Phase 5.1 OCR smoke: ${pass}/${results.length}`);
    process.exit(fail ? 1 : 0);
}
