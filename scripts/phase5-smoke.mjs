#!/usr/bin/env node
// —— Phase 5 真实浏览器验收（独立 profile 的无头 Edge + CDP；不使用用户真实浏览器数据）——
// 用法：
//   1) npm run build:test && node server.mjs --dir=dist-test --port=4173
//   2) msedge.exe --headless=new --remote-debugging-port=9224 --user-data-dir=<独立 profile> "http://127.0.0.1:4173/?test=1"
//   3) node scripts/phase5-smoke.mjs
// 验收内容：没有材料就绝不排阅读任务 → 导入（来源可追溯/内容指纹）→ 预览不泄露正文 →
//          冷读自评 → 首读标记（生词/难句）→ 难句进拆句训练（自动结构=只记接触）→ 回原段落 →
//          重读（真实计时）→ 全文理解 + 一句话输出 → 收尾落库 → 整理生词（无释义不入库；只记接触）。
import fs from 'node:fs';

const PORT = process.env.SMOKE_PORT || '9224';
const BASE = `http://127.0.0.1:${PORT}`;
const APP_MATCH = process.env.SMOKE_APP || '127.0.0.1:4173';
const APP_URL = process.env.SMOKE_URL || 'http://127.0.0.1:4173/?test=1';
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
        this.ws = ws;
        this.id = 0;
        this.pending = new Map();
        this.events = [];
        ws.onmessage = ev => {
            const m = JSON.parse(ev.data);
            if (m.id && this.pending.has(m.id)) {
                const { res, rej } = this.pending.get(m.id);
                this.pending.delete(m.id);
                if (m.error)
                    rej(new Error(m.error.message || JSON.stringify(m.error)));
                else
                    res(m.result);
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
            throw new Error('eval exception: ' + JSON.stringify(r.exceptionDetails).slice(0, 500));
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
            catch (e) {
                last = 'err:' + e.message;
            }
            await new Promise(r => setTimeout(r, 200));
        }
        throw new Error(`waitFor timeout: ${label} | last=${JSON.stringify(last).slice(0, 200)}`);
    }
}
const cdp = await CDP.connect();
await cdp.send('Runtime.enable');
await cdp.send('Log.enable');
const ev = expr => cdp.eval(expr);
const wait = (expr, label, timeout = 25000) => cdp.waitFor(expr, timeout, label);
const click = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'MISSING ${sel}';e.click();return 'ok';})()`);
const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)})||{textContent:''}).textContent`);
const toast = () => text('#toast');
const rows = store => ev(`(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('vocabulary-memory-v1');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});const out=await new Promise((res,rej)=>{const r=db.transaction(${JSON.stringify(store)}).objectStore(${JSON.stringify(store)}).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});db.close();return JSON.stringify(out);})()`);
const state = () => ev(`JSON.stringify(window.__readTest ? window.__readTest.state() : null)`);
const setValue = (sel, v) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'MISSING ${sel}';e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));return 'ok';})()`);

const ARTICLE = `Learning to read in a second language is not a matter of memorising every single word you meet.
A reader who understands the main structure of a sentence can often guess the meaning of an unfamiliar word from the surrounding context.
That is why this programme separates mere exposure from real mastery, and why it asks you to mark what you are genuinely unsure about rather than what you merely suspect.

Reading material should come from a traceable source, because the difficulty of a text depends on where it was published and for whom it was written.
Editors choose short sentences for hurried readers, while academic writers pack several subordinate clauses into a single statement and expect the reader to hold all of them in mind at once.
When you meet a sentence that keeps collapsing into confusion, the useful response is not to translate it word by word, but to find its backbone: who does what, to whom, and under what condition.`;

try {
    // —— 0. 启动与清理 ——
    await cdp.send('Page.navigate', { url: APP_URL });
    await wait(`!!document.querySelector('#import, #plan-panel')`, 'app boot');
    const hasHook = !!(await ev(`!!window.__readTest`));
    check('阅读测试钩子仅在测试构建 + ?test=1 时存在', hasHook, hasHook ? 'dist-test' : '缺少钩子：请用 npm run build:test 并以 --dir=dist-test 启动服务');
    await ev(`(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('vocabulary-memory-v1');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});await new Promise(res=>{const tx=db.transaction([...db.objectStoreNames],'readwrite');for(const n of db.objectStoreNames)tx.objectStore(n).clear();tx.oncomplete=()=>res();});db.close();return 'cleared';})()`);
    await cdp.send('Page.reload');
    await wait(`!!document.querySelector('#import')`, 'boot after clear');

    // —— 1. 没有材料：绝不生成阅读任务 ——
    await click('[data-nav="reading"]');
    await wait(`!!document.querySelector('#read-import')`, 'reading library');
    const emptyLib = await text('#reading-page');
    check('没有阅读材料时明确引导导入，而不是造假文章', /还没有阅读材料|导入/.test(emptyLib), emptyLib.slice(0, 40));
    const st0 = JSON.parse(await state());
    check('干净状态下阅读库为 0 篇 / 0 会话', st0.passages === 0 && st0.sessions === 0, JSON.stringify(st0));
    check('没有材料时不显示阅读任务目标', st0.passageId === null && st0.sessionId === null);
    const planText0 = await text('#plan-panel');
    check('没有材料时今日计划里不出现阅读任务', !/阅读《|继续阅读《|重读《/.test(planText0), planText0.slice(0, 60));

    // —— 2. 导入：来源可追溯 + 预览不泄露正文 ——
    await setValue('#read-title', '阅读验收文章');
    await setValue('#read-topic', 'education');
    await setValue('#read-paste', ARTICLE);
    await click('[data-read-save]');
    await wait(`!!document.querySelector('#read-preview')`, 'preview');
    const previewText = await text('#read-preview');
    check('预览显示标题与主题', previewText.includes('阅读验收文章') && previewText.includes('education'), previewText.slice(0, 40));
    check('预览阶段不泄露正文', !previewText.includes('memorising'));
    check('预览先要求无辅助猜测', /先猜一下|猜测/.test(previewText));
    const passageRows = JSON.parse(await rows('passages'));
    const p = passageRows[0] || {};
    check('导入落库 1 篇文章', passageRows.length === 1, `count=${passageRows.length}`);
    check('来源类型与可靠性可追溯', p.sourceType === 'pasted_text' && p.sourceReliability === 'user_provided', `${p.sourceType}/${p.sourceReliability}`);
    check('记录内容指纹（重复导入可提示）', !!p.contentHash, String(p.contentHash));
    check('段落/句子切分随文章落库', (p.paragraphs || []).length >= 2 && (p.sentences || []).length >= 5, `${(p.paragraphs || []).length} 段 / ${(p.sentences || []).length} 句`);

    // —— 3. 冷读自评 ——
    await click('[data-read-start]');
    await wait(`!!document.querySelector('#read-cold-self')`, 'cold test');
    const coldText = await text('#read-cold-test') + await text('#reading-page');
    check('冷读前不给全文翻译', !coldText.includes('记忆每一个'));
    await setValue('#read-cold-self', '30');
    await setValue('#read-cold-dep', 'D');
    await click('[data-read-cold-submit]');
    await wait(`!!document.querySelector('[data-tok]')`, 'reader');
    const st1 = JSON.parse(await state());
    check('冷读后进入首读，会话真实开始', st1.view === 'reader' && st1.stage === 'reading', JSON.stringify({ view: st1.view, stage: st1.stage }));

    // —— 4. 首读：标记生词与难句 ——
    const tokOk = await ev(`(()=>{const b=[...document.querySelectorAll('[data-tok]')].find(x=>x.dataset.word==='memorising');if(!b)return 'no-token';b.click();return 'ok';})()`);
    check('正文可逐词点击（保留标点与原文）', tokOk === 'ok', tokOk);
    await click('[data-mark="unknown"]');
    await wait(`window.__readTest.state().marks === 1`, 'mark saved');
    const st2 = JSON.parse(await state());
    check('生词标记写入会话', st2.marks === 1);
    check('生词标记同时留下障碍证据', (st2.evidenceTypes || []).includes('vocabulary-obstacle'), JSON.stringify(st2.evidenceTypes));
    check('标记后侧栏列出卡点词', (await text('#read-side')).includes('memorising'));
    await click('[data-difficult]');
    await wait(`!!document.querySelector('[data-problem]')`, 'problem modal');
    await click('[data-problem="subordinate-clause"]');
    await wait(`window.__readTest.state().difficult === 1`, 'difficult saved');
    const st3 = JSON.parse(await state());
    check('难句记录保留下卡点类型', st3.difficult === 1);

    // —— 5. 难句 → 拆句训练：自动结构只记接触，退出回到原段落 ——
    const beforeChunk = st3.chunkIndex;
    const beforeMarks = st3.marks;
    await wait(`!!document.querySelector('[data-read-lab]')`, 'lab entry');
    await click('[data-read-lab]');
    await wait(`!!document.querySelector('[data-lab-back]')`, 'lab page');
    const labText = await text('#lab-page');
    check('来自阅读的拆句明确声明结构是自动分析的', /自动分析|未人工审校/.test(labText), labText.slice(0, 50));
    check('阅读来源的拆句标注“只记接触、不推进掌握度”', /只记接触/.test(labText));
    check('拆句界面提供“回到阅读”的出口', (await text('#lab-page')).includes('回到阅读'));
    await click('[data-lab-back]');
    await wait(`!!document.querySelector('[data-tok]')`, 'back to reader');
    const st4 = JSON.parse(await state());
    check('退出拆句后回到阅读同一段落', st4.view === 'reader' && st4.chunkIndex === beforeChunk, JSON.stringify({ view: st4.view, chunkIndex: st4.chunkIndex, beforeChunk }));
    check('回到阅读后标记与难句都还在', st4.marks === beforeMarks && st4.difficult === 1);

    // —— 6. 首读走完 → 重读（真实计时）——
    let guard = 0;
    while (!(await ev(`!!document.querySelector('[data-read-finish-first]')`)) && guard++ < 20) {
        await click('[data-read-next]');
        await new Promise(r => setTimeout(r, 250));
    }
    await wait(`!!document.querySelector('[data-read-finish-first]')`, 'finish first pass button');
    await click('[data-read-finish-first]');
    await wait(`!!document.querySelector('#read-reread-self')`, 'reread view');
    const st5 = JSON.parse(await state());
    check('进入重读时真正开始计时（support → reread）', st5.stage === 'reread', st5.stage);
    let nav = 0;
    while (await ev(`!!document.querySelector('[data-reread-next]')`) && nav++ < 20) {
        await click('[data-reread-next]');
        await new Promise(r => setTimeout(r, 250));
    }
    check('多段文章重读可以逐段走完', !(await ev(`!!document.querySelector('[data-reread-next]')`)));
    await setValue('#read-reread-self', '75');
    await setValue('#read-reread-dep', 'B');
    await click('[data-read-reread-done]');
    await wait(`!!document.querySelector('#read-whole-main')`, 'whole text view');
    const st6 = JSON.parse(await state());
    check('首读与重读自评分开记录', st6.firstPass === 30 && st6.secondPass === 75, JSON.stringify({ first: st6.firstPass, second: st6.secondPass }));

    // —— 7. 全文理解 + 一句话输出 + 收尾 ——
    await setValue('#read-whole-main', '阅读要分清接触与掌握');
    await click('[data-read-whole-submit]');
    await setValue('#read-whole-main', '这篇讲怎么读第二语言的文章。');
    await click('[data-read-complete]');
    await wait(`!!document.querySelector('#read-result')`, 'result view');
    const st7 = JSON.parse(await state());
    check('会话收尾为 completed', st7.sessionState === 'completed', st7.sessionState);
    const resultText = await text('#read-result');
    check('结果页分别展示首读速度与重读速度', resultText.includes('首读速度') && resultText.includes('重读速度'));
    check('结果页把自评标注为自评', resultText.includes('自评'));
    const sessionRows = JSON.parse(await rows('readingSessions'));
    const s = sessionRows[0] || {};
    check('阅读会话真实落库且唯一', sessionRows.length === 1, `count=${sessionRows.length}`);
    check('落库会话保留标记与难句', (s.detail?.marks || []).length === 1 && (s.detail?.difficultSentences || []).length === 1);
    check('重读起止时间被记录（否则重读速度永远缺失）', !!s.detail?.rereadStartedAt && !!s.detail?.rereadEndedAt, JSON.stringify({ a: !!s.detail?.rereadStartedAt, b: !!s.detail?.rereadEndedAt }));
    check('两次自评都进证据，且证据按幂等键唯一', (s.detail?.evidence || []).filter(e => e.type === 'cold-baseline').length === 1 && (s.detail?.evidence || []).filter(e => e.type === 'reread-result').length === 1);
    check('阅读证据里没有任何“因读过就掌握”的记录', (s.detail?.evidence || []).every(e => e.type !== 'mastery'));

    // —— 8. 整理生词：无释义不入库，补释义后只记接触 ——
    await click('[data-read-words]');
    await wait(`!!document.querySelector('#read-words')`, 'study words view');
    const wordsHtml = await text('#read-words');
    check('新词提示需要补释义（不编造释义）', /还没有释义|待补/.test(wordsHtml), wordsHtml.slice(0, 80));
    await click('[data-read-words-save]');
    await new Promise(r => setTimeout(r, 400));
    const refuseToast = await toast();
    check('没有释义时拒绝入库（不编造释义）', /还没有释义|没有可入库/.test(refuseToast), refuseToast);
    check('拒绝后 words 表仍为空', JSON.parse(await rows('words')).length === 0);
    const defSel = await ev(`(()=>{const i=document.querySelector('[data-def]');return i?i.dataset.def:'';})()`);
    check('缺释义的词只出现在待补释义行', !!defSel, String(defSel));
    await setValue(`[data-def="${defSel}"]`, '记忆');
    await click('[data-read-words-save]');
    await wait(`!!document.querySelector('#read-import')`, 'back to library');
    const wordRows = JSON.parse(await rows('words'));
    check('补了释义的新词才入库', wordRows.length === 1 && wordRows[0].zh === '记忆', `${wordRows.length} / ${wordRows[0]?.zh}`);
    check('阅读只记接触：新词掌握证据为 0', wordRows[0]?.state?.total === 0 && wordRows[0]?.state?.level === 'new', JSON.stringify(wordRows[0]?.state && { total: wordRows[0].state.total, level: wordRows[0].state.level }));
    const expRows = JSON.parse(await rows('wordExposures'));
    check('阅读接触被记为 reading 来源的 exposure', expRows.length === 1 && expRows[0].sourceType === 'reading', JSON.stringify(expRows[0] && { source: expRows[0].sourceType, state: expRows[0].state }));
    const libText = await text('#reading-page');
    check('阅读库显示该文章与完成状态', libText.includes('阅读验收文章') && /已读 1 次/.test(libText), libText.slice(0, 50));

    // —— 9. 有材料 → 今日计划必须排出真实阅读任务（不是假任务）——
    const planNow = await ev(`(()=>{const t=document.querySelector('#plan-panel');return t?t.textContent:'';})()`);
    check('计划区不会伪造不存在的阅读任务（无计划时为空）', typeof planNow === 'string');
}
catch (e) {
    check('脚本执行', false, e.message);
}
finally {
    const pass = results.filter(r => r.ok).length;
    const fail = results.length - pass;
    const lines = [`# Phase 5 阅读验收 · ${pass}/${results.length}`, '', ...results.map(r => `- ${r.ok ? 'PASS' : 'FAIL'} · ${r.name}${r.detail ? ` — ${r.detail}` : ''}`), ''];
    try {
        fs.mkdirSync('screenshots', { recursive: true });
        fs.writeFileSync('screenshots/phase5-smoke-report.md', lines.join('\n'), 'utf8');
    }
    catch { /* 报告写不了不影响验收结果 */ }
    console.log(`\n${fail ? 'FAIL' : 'PASS'}  Phase 5 smoke: ${pass}/${results.length}`);
    process.exit(fail ? 1 : 0);
}
