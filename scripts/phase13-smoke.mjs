#!/usr/bin/env node
// —— Phase 13：从第一天开始的真实学习旅程验收（独立 profile + CDP）——
// 前置：npm run build:test；node server.mjs --dir=dist-test --port=4173；无头 Edge CDP 9230；
//       页面必须带 ?test=1。测试钩子只播种真实结构数据，完成证据全部由真实 UI/领域引擎产生。
const PORT = process.env.SMOKE_PORT || '9230';
const BASE = `http://127.0.0.1:${PORT}`;
const APP = 'http://127.0.0.1:4173/?test=1';
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  · ' + String(detail).slice(0, 320) : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.errors = []; ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); clearTimeout(p.t); this.pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } else if (m.method === 'Runtime.exceptionThrown') this.errors.push(m.params.exceptionDetails?.exception?.description ?? 'exception'); else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') this.errors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' ')); }; }
    static async connect() { const list = await (await fetch(`${BASE}/json/list`)).json(); const t = list.find(x => x.type === 'page' && (x.url || '').includes('4173')); if (!t) throw new Error('no app page'); const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); }); return new CDP(ws); }
    send(method, params = {}, timeout = 25000) { return new Promise((res, rej) => { const id = ++this.id; const t = setTimeout(() => { this.pending.delete(id); rej(new Error('cdp timeout ' + method)); }, timeout); this.pending.set(id, { res, rej, t }); this.ws.send(JSON.stringify({ id, method, params })); }); }
    async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; }
    async waitFor(expr, timeout = 20000, label = expr) { const end = Date.now() + timeout; let last; while (Date.now() < end) { try { last = await this.eval(expr); if (last) return last; } catch (e) { last = 'err:' + e.message; } await sleep(200); } throw new Error('timeout: ' + label + ' last=' + String(last).slice(0, 160)); }
    async click(sel) { return this.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'missing';e.click();return 'ok';})()`); }
    async set(sel, value, event = 'input') { return this.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'missing';e.value=${JSON.stringify(value)};e.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));return 'ok';})()`); }
}
const cdp = await CDP.connect();
const snap = () => cdp.eval('__planTest.snapshot()');
const taskById = async id => (await snap()).plan.tasks.find(t => t.id === id);
const start = async id => { const r = await cdp.click(`[data-task-start="${id}"]`); if (r !== 'ok') throw new Error('start missing ' + id); };
const home = async () => { const r = await cdp.click('[data-nav=home]'); await sleep(350); return r; };
try {
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.eval(`location.href=${JSON.stringify(APP)}`);
    await cdp.waitFor('!!(window.__planTest && window.__examTest && document.querySelector("[data-nav=home]"))', 30000, 'boot');
    // 本次旅程从干净 profile 开始；清空所有 store，避免上一轮遗留的 records 指向已删除 sessions。
    await cdp.eval(`(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('vocabulary-memory-v1');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});await new Promise(res=>{const tx=db.transaction([...db.objectStoreNames],'readwrite');for(const n of db.objectStoreNames)tx.objectStore(n).clear();tx.oncomplete=()=>res();});db.close();return 'cleared';})()`);
    await cdp.eval('location.reload()');
    await cdp.waitFor('!!window.__planTest', 30000, 'boot after clean');
    await cdp.eval('__planTest.seedUnified()');
    await cdp.eval('__planTest.resetPlan()');
    const created = await cdp.eval('__planTest.createPlan(180)');
    const s0 = await snap();
    const tasks = s0.plan.tasks;
    check('A. 从干净数据生成今日计划（六类模块齐全）', created.ok === true && ['vocabulary', 'sentence', 'reading', 'input', 'output', 'exam'].every(m => tasks.some(t => t.module === m)), JSON.stringify({ tasks: tasks.length, modules: [...new Set(tasks.map(t => t.module))] }));
    const initialIntegrity = await cdp.eval('__planTest.integrity()');
    check('B. 初始数据完整性审计无结构错误', initialIntegrity.errors === 0, `errors=${initialIntegrity.errors} warnings=${initialIntegrity.warnings}`);

    // 1) 词汇：Preview → Recall
    const preview = tasks.find(t => t.kind === 'new-preview');
    await start(preview.id);
    await cdp.waitFor('!!document.querySelector("[data-preview]") || !!document.querySelector("#back-home")', 12000, 'preview');
    for (let i = 0; i < 80; i++) {
        if (await cdp.eval('!!document.querySelector("#back-home")')) break;
        const r = await cdp.eval(`(()=>{const b=document.querySelector('[data-preview="know"]');if(!b)return 'none';b.click();return 'ok';})()`);
        if (r !== 'ok') throw new Error('preview card missing at ' + i);
        await sleep(55);
    }
    await cdp.click('#back-home');
    await cdp.waitFor('__planTest.snapshot().then(s=>s.plan.tasks.find(t=>t.id===' + JSON.stringify(preview.id) + ')?.status==="done")', 12000, 'preview done');
    const recall = tasks.find(t => t.kind === 'new-recall');
    await start(recall.id);
    await cdp.waitFor('!!document.querySelector("#question-text")', 12000, 'recall');
    await cdp.eval(`(()=>{window.__answerSeed=()=>{const q=document.querySelector('#question-text');if(!q)return 'noq';const p=q.textContent.trim();let target;if(p.startsWith('统一验收释义')){const n=p.slice('统一验收释义'.length);target='unified'+(Number(n)<12?'new':'weak')+n}else{const n=p.replace('unifiednew','').replace('unifiedweak','');target='统一验收释义'+n}const b=[...document.querySelectorAll('.answer')].find(x=>x.querySelector('span')?.textContent===target);if(!b)return 'noopt:'+target;b.click();return 'ok';};return 'ready';})()`);
    for (let i = 0; i < 70; i++) {
        if (await cdp.eval('!!document.querySelector("#back-home")')) break;
        const r = await cdp.eval('window.__answerSeed()');
        if (r !== 'ok') throw new Error('recall answer failed: ' + r);
        await sleep(65);
    }
    await cdp.click('#back-home');
    await cdp.waitFor('__planTest.snapshot().then(s=>s.plan.tasks.find(t=>t.id===' + JSON.stringify(recall.id) + ')?.status==="done")', 12000, 'recall done');
    check('C. 词汇 Preview 与 Recall 均由真实作答完成并写回计划', true, `preview=${preview.id} recall=${recall.id}`);

    // 2) 阅读：预览 → 冷读 → 首读 → 重读 → 全文 → 结果
    const reading = tasks.find(t => t.module === 'reading');
    await start(reading.id);
    await cdp.waitFor('!!document.querySelector("[data-read-start]") || !!document.querySelector("[data-tok]")', 12000, 'reading open');
    if (await cdp.eval('!!document.querySelector("[data-read-start]")'))
        await cdp.click('[data-read-start]');
    await cdp.waitFor('!!document.querySelector("#read-cold-self")', 12000, 'cold test');
    await cdp.set('#read-cold-self', '30');
    await cdp.set('#read-cold-dep', 'D', 'change');
    await cdp.click('[data-read-cold-submit]');
    await cdp.waitFor('!!document.querySelector("[data-read-finish-first]")', 12000, 'first pass');
    await cdp.click('[data-read-finish-first]');
    await cdp.waitFor('!!document.querySelector("#read-reread-self")', 12000, 'reread');
    await cdp.set('#read-reread-self', '60');
    await cdp.set('#read-reread-dep', 'B', 'change');
    await cdp.click('[data-read-reread-done]');
    await cdp.waitFor('!!document.querySelector("#read-whole-main")', 12000, 'whole');
    await cdp.set('#read-whole-main', 'Attention changes with sleep and interest.');
    await cdp.click('[data-read-whole-submit]');
    await cdp.click('[data-read-complete]');
    await cdp.waitFor('!!document.querySelector("#read-result")', 12000, 'reading result');
    await home();
    await cdp.waitFor('__planTest.snapshot().then(s=>s.plan.tasks.find(t=>t.id===' + JSON.stringify(reading.id) + ')?.status==="done")', 12000, 'reading writeback');
    check('D. 阅读完整流程完成并写回计划（只算接触/理解，不提升词汇掌握）', true);

    // 3) 句子：基本结构 → 迁移
    const sentence = tasks.find(t => t.kind === 'sentence-basic-structure');
    const runLab = async (task) => {
        await start(task.id);
        await cdp.waitFor('!!document.querySelector("#lab-sentence")', 15000, 'lab ' + task.kind);
        for (let n = 0; n < 3; n++) {
            for (let i = 0; i < 12; i++) {
                if (await cdp.eval('!!document.querySelector("#lab-tree")')) break;
                await cdp.eval('window.__labTest.answerCorrect()');
                await sleep(220);
                if (await cdp.eval('!!document.querySelector("#lab-next")')) await cdp.click('#lab-next');
                await sleep(180);
            }
            await cdp.waitFor('!!document.querySelector("#lab-tree")', 15000, 'lab tree');
            const label = await cdp.eval('document.querySelector("#lab-next-sentence")?.textContent || ""');
            await cdp.click('#lab-next-sentence');
            if (label.includes('结束')) break;
            await cdp.waitFor('!!document.querySelector("#lab-sentence")', 15000, 'next lab sentence');
        }
        await cdp.waitFor('__planTest.snapshot().then(s=>s.page==="home")', 15000, 'lab finish');
    };
    await runLab(sentence);
    await cdp.waitFor('__planTest.snapshot().then(s=>s.plan.tasks.find(t=>t.id===' + JSON.stringify(sentence.id) + ')?.status==="done")', 12000, 'sentence writeback');
    const transfer = (await snap()).plan.tasks.find(t => t.kind === 'sentence-transfer');
    if (transfer)
        await runLab(transfer);
    check('E. 句子 Lab（含迁移句）由真实步骤完成并写回计划', true, transfer ? 'basic + transfer' : 'basic');

    // 4) 输入：中断 → 刷新 → 恢复同一会话 → 复盘完成
    const input = tasks.find(t => t.module === 'input');
    await start(input.id);
    await cdp.waitFor('!!document.querySelector("[data-session-complete]")', 15000, 'input session');
    if (await cdp.eval('!!document.querySelector("[data-baseline-skip]")')) {
        await cdp.click('[data-baseline-skip]');
        await sleep(500);
    }
    const beforeReload = (await snap()).sessions.input.filter(x => x.plan === input.id);
    await cdp.eval('location.reload()');
    await cdp.waitFor('!!window.__planTest', 30000, 'reload during input');
    await cdp.waitFor('!!document.querySelector("#plan-panel")', 20000, 'home after reload');
    const afterReload = (await snap()).sessions.input.filter(x => x.plan === input.id);
    await start(input.id);
    await cdp.waitFor('!!document.querySelector("[data-session-complete]")', 15000, 'input resumed');
    const resumed = (await snap()).sessions.input.filter(x => x.plan === input.id);
    check('F. 输入中断后刷新能恢复原会话，而不是新建重复会话', beforeReload.length === 1 && afterReload.length === 1 && resumed.filter(x => x.status !== 'completed').length === 1, JSON.stringify({ before: beforeReload.map(x => x.id), after: afterReload.map(x => x.id), resumed: resumed.map(x => [x.id, x.status]) }));
    await cdp.eval(`(()=>{const w=document.querySelector('#refl-watched');if(w){w.value='12';w.dispatchEvent(new Event('input',{bubbles:true}));}const s=document.querySelector('#refl-summary');if(s){s.value='Attention changes with sleep and interest. A short walk can restore focus. I can explain this in my own words.';s.dispatchEvent(new Event('input',{bubbles:true}));}return 'filled';})()`);
    await cdp.click('[data-refl-save]');
    await cdp.waitFor('__inputTest.snapshot().then(s=>s.sessions.some(x=>x.status==="reflection" && x.hasReflection))', 15000, 'reflection saved');
    // 保存复盘后 unitRefresh 还要从 IndexedDB 重新载入并重绘；等按钮就绪，避免用旧 revision 点完成。
    await cdp.waitFor('document.querySelector("#main")?.innerText.includes("状态 reflection")', 15000, 'reflection rendered');
    await cdp.waitFor('!!document.querySelector("[data-session-complete]") && !document.querySelector("[data-session-complete]").disabled', 15000, 'complete button ready');
    await sleep(300);
    await cdp.click('[data-session-complete]');
    await cdp.waitFor('__planTest.snapshot().then(s=>s.plan.tasks.find(t=>t.id===' + JSON.stringify(input.id) + ')?.status==="done")', 15000, 'input writeback');
    check('G. 输入完成复盘后计划任务写回 done', true);

    // 5) 表达
    await home();
    const output = tasks.find(t => t.module === 'output');
    await start(output.id);
    await cdp.waitFor('!!document.querySelector("#out-editor")', 15000, 'output editor');
    await cdp.set('#out-editor', 'Attention is not one fixed ability. It changes with sleep, interest, and the difficulty of the material. A short walk can restore focus, and a clear question can make a long article easier to remember.');
    await sleep(900);
    await cdp.click('#out-submit');
    await cdp.waitFor('__outputTest.snapshot().then(s=>s.attempts.some(x=>x.status!=="draft"))', 15000, 'output submitted');
    await cdp.click('#out-finish');
    await cdp.waitFor('__planTest.snapshot().then(s=>s.plan.tasks.find(t=>t.id===' + JSON.stringify(output.id) + ')?.status==="done")', 15000, 'output writeback');
    check('H. 表达提交/完成后计划任务写回 done', true);

    // 6) 考试
    await home();
    const exam = tasks.find(t => t.module === 'exam');
    await start(exam.id);
    await cdp.waitFor('!!document.querySelector(".exam-session")', 15000, 'exam session');
    const es = await cdp.eval('__examTest.snapshot()');
    const active = es.sessions.find(s => s.id === es.current);
    for (const id of active.items) {
        const it = active.itemsDetail.find(i => i.id === id);
        const value = it.options ? it.key : (it.type === 'translation' ? 'The glass roof built to attract visitors ended up making summers harder to bear.' : 'This is my own short response about attention and learning.');
        await cdp.eval(`__examTest.answer(${JSON.stringify(id)}, ${JSON.stringify(value)})`);
    }
    await cdp.click('#exam-submit');
    await cdp.waitFor('!!document.querySelector(".exam-result")', 15000, 'exam result');
    await cdp.click('#exam-complete');
    await cdp.waitFor('__planTest.snapshot().then(s=>s.plan.tasks.find(t=>t.id===' + JSON.stringify(exam.id) + ')?.status==="done")', 15000, 'exam writeback');
    check('I. 考试提交、复盘、完成并写回计划（迁移证据，不是总分）', true);

    // 7) 收尾（若计划生成）
    await home();
    const closing = (await snap()).plan.tasks.find(t => t.kind === 'closing-recall');
    if (closing) {
        await start(closing.id);
        await cdp.waitFor('!!document.querySelector("#question-text")', 12000, 'closing');
        await cdp.eval(`(()=>{window.__answerSeed=()=>{const q=document.querySelector('#question-text');if(!q)return 'noq';const p=q.textContent.trim();let target;if(p.startsWith('统一验收释义')){const n=p.slice('统一验收释义'.length);target='unified'+(Number(n)<12?'new':'weak')+n}else{const n=p.replace('unifiednew','').replace('unifiedweak','');target='统一验收释义'+n}const b=[...document.querySelectorAll('.answer')].find(x=>x.querySelector('span')?.textContent===target);if(!b)return 'noopt:'+target;b.click();return 'ok';};return 'ready';})()`);
        for (let i = 0; i < 40; i++) {
            if (await cdp.eval('!!document.querySelector("#back-home")')) break;
            const r = await cdp.eval('window.__answerSeed()');
            if (r !== 'ok') break;
            await sleep(60);
        }
        await cdp.click('#back-home');
        if (await cdp.eval('!!document.querySelector("[data-closing]")')) {
            await cdp.click('[data-closing="just"]');
            await sleep(600);
        }
        await cdp.waitFor('__planTest.snapshot().then(s=>s.plan.tasks.find(t=>t.id===' + JSON.stringify(closing.id) + ')?.status==="done")', 12000, 'closing done');
        check('J. 收尾回忆完成并保存难度反馈', true);
    }
    else {
        check('J. 收尾回忆完成并保存难度反馈', true, '本次计划无 closing-recall，跳过');
    }

    // 8) 完成后完整性 + 刷新 + 重新生成
    const doneBefore = (await snap()).plan.tasks.filter(t => t.status === 'done').map(t => t.id);
    const finalIntegrity = await cdp.eval('__planTest.integrity()');
    check('K. 整个旅程后数据完整性无结构错误', finalIntegrity.errors === 0, JSON.stringify({ errors: finalIntegrity.errors, warnings: finalIntegrity.warnings }));
    await cdp.eval('location.reload()');
    await cdp.waitFor('!!window.__planTest', 30000, 'reload after journey');
    const doneAfter = (await snap()).plan.tasks.filter(t => t.status === 'done').map(t => t.id);
    check('L. 刷新后所有已完成任务仍保持 done', doneBefore.every(id => doneAfter.includes(id)), JSON.stringify({ before: doneBefore.length, after: doneAfter.length }));
    await home();
    await cdp.click('#plan-regenerate');
    await sleep(1600);
    const regen = await snap();
    check('M. 重新生成保留已完成任务，不重建证据', doneBefore.every(id => regen.plan.tasks.some(t => t.id === id && t.status === 'done')), JSON.stringify(regen.plan.tasks.map(t => [t.kind, t.status])));
    check('N. 迁移后计划总时长仍不超过预算', regen.plan.tasks.reduce((n, t) => n + (t.minutes || 0), 0) <= 180, `${regen.plan.tasks.reduce((n, t) => n + (t.minutes || 0), 0)}/180`);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await sleep(500);
    cdp.errors.length = 0;
    let overflow = '';
    let errorAt = '';
    for (const page of ['home', 'settings', 'reading', 'input', 'output', 'exam']) {
        await cdp.eval(`document.querySelector('[data-nav="${page}"]')?.click()`);
        await sleep(250);
        if (cdp.errors.length && !errorAt)
            errorAt = `${page}: ${cdp.errors[0].slice(0, 180)}`;
        const m = await cdp.eval('({ sw: document.documentElement.scrollWidth, iw: innerWidth })');
        if (m.sw > m.iw + 1)
            overflow += `${page}:${m.sw}>${m.iw};`;
    }
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await home();
    check('P. 390px 移动视口没有横向溢出', !overflow, overflow || 'home/settings/reading/input/output/exam');
    const unnamed = await cdp.eval('[...document.querySelectorAll("#main button")].filter(b=>!b.textContent.trim() && !b.getAttribute("aria-label")).length');
    check('Q. 主要按钮都有可访问名称（文字或 aria-label）', unnamed === 0, `unnamed=${unnamed}`);
    await cdp.eval('document.querySelector("#theme")?.click()');
    await sleep(250);
    const dark = await cdp.eval('document.documentElement.dataset.theme');
    const darkBg = await cdp.eval('getComputedStyle(document.documentElement).backgroundColor');
    check('S. 深色主题可切换且生效', dark === 'dark' && darkBg !== 'rgb(243, 245, 249)', `${dark} ${darkBg}`);
    await cdp.eval('document.querySelector("#theme")?.click()');
    await sleep(200);
    const light = await cdp.eval('document.documentElement.dataset.theme');
    check('S2. 深色主题可切回浅色', light === 'light', light);
    await cdp.eval('document.querySelector("[data-nav=home]")?.focus()');
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await sleep(150);
    const focus = await cdp.eval('document.activeElement?.getAttribute("data-nav") || document.activeElement?.tagName');
    check('T. Tab 键可移动键盘焦点', focus && focus !== 'BODY', String(focus));
    check('U. 页面无未捕获 JavaScript 错误', cdp.errors.length === 0, errorAt || cdp.errors.slice(0, 2).join(' | '));
    console.log(`\nPhase 13 smoke: ${results.filter(r => r.ok).length}/${results.length}`);
    process.exit(results.every(r => r.ok) ? 0 : 1);
}
catch (e) {
    console.error('SMOKE ERROR', e.message);
    console.error('errors', cdp.errors.slice(0, 5));
    process.exit(2);
}
