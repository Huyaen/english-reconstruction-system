#!/usr/bin/env node
// —— Phase 12 Full Integration：Today 统一执行器真实浏览器验收 ——
// 前置：npm run build:test；本地服务 4173 指向 dist-test；无头 Edge CDP 9230；?test=1。
// 只使用真实 UI/引擎写入；测试钩子负责播种数据与读取，不伪造完成证据。
const PORT = process.env.SMOKE_PORT || '9230';
const BASE = `http://127.0.0.1:${PORT}`;
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  · ' + String(detail).slice(0, 360) : ''}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.errors = []; ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); clearTimeout(p.t); this.pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } else if (m.method === 'Runtime.exceptionThrown') this.errors.push(m.params.exceptionDetails?.exception?.description ?? 'exception'); else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') this.errors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' ')); }; }
    static async connect() { const list = await (await fetch(`${BASE}/json/list`)).json(); const t = list.find(x => x.type === 'page' && (x.url || '').includes('4173')); if (!t) throw new Error('no app page'); const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); }); return new CDP(ws); }
    send(method, params = {}, timeout = 20000) { return new Promise((res, rej) => { const id = ++this.id; const t = setTimeout(() => { this.pending.delete(id); rej(new Error('cdp timeout ' + method)); }, timeout); this.pending.set(id, { res, rej, t }); this.ws.send(JSON.stringify({ id, method, params })); }); }
    async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 500)); return r.result.value; }
    async waitFor(expr, timeout = 20000, label = expr) { const end = Date.now() + timeout; let last; while (Date.now() < end) { try { last = await this.eval(expr); if (last) return last; } catch (e) { last = 'err:' + e.message; } await sleep(200); } throw new Error('timeout: ' + label + ' last=' + String(last).slice(0, 160)); }
    async click(sel) { return this.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'missing'; e.click(); return 'ok';})()`); }
    async text() { return this.eval('document.querySelector("#main")?.innerText || ""'); }
}
const cdp = await CDP.connect();
try {
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.eval('location.href="http://127.0.0.1:4173/?test=1"');
    await cdp.waitFor('!!(window.__planTest && window.__examTest && document.querySelector("[data-nav=home]"))', 25000, 'boot');
    await cdp.eval('__planTest.resetDomain()');
    const seeded = await cdp.eval('__planTest.seedUnified()');
    await cdp.eval('__planTest.resetPlan()');
    const created = await cdp.eval('__planTest.createPlan(240)');
    const snap0 = await cdp.eval('__planTest.snapshot()');
    const tasks = snap0.plan.tasks;
    const modules = [...new Set(tasks.map(t => t.module))].sort();
    check('A. 今日计划从真实数据生成六类模块', ['exam', 'input', 'output', 'reading', 'sentence', 'vocabulary'].every(m => modules.includes(m)), `${JSON.stringify(seeded)} · ${JSON.stringify(modules)} · ${created.tasks} tasks`);
    check('B. 计划任务带模块标签，非词汇任务不再显示“N 个词”', (await cdp.text()).includes('1 篇文章') && (await cdp.text()).includes('1 份真实材料') && (await cdp.text()).includes('1 个表达任务') && (await cdp.text()).includes('1 道题'));
    check('C. Today 有统一开始入口（不是只有词汇默认页）', await cdp.eval('!!document.querySelector("#start-today")'));

    // —— Input：启动 → 复盘 → 完成 → 回写计划 ——
    const inputTask = tasks.find(t => t.module === 'input');
    check('D. 输入任务路由到 Input Session，并绑定 planTaskId', (await cdp.click(`[data-task-start="${inputTask.id}"]`)) === 'ok' && !!(await cdp.waitFor('document.querySelector("[data-session-complete]")', 12000, 'input session')) && (await cdp.eval('__planTest.snapshot().then(s=>s.inputPlanTaskId)')) === inputTask.id);
    if (await cdp.eval('!!document.querySelector("[data-baseline-skip]")')) {
        await cdp.click('[data-baseline-skip]');
        await cdp.waitFor('__inputTest.snapshot().then(s=>s.sessions.some(x=>x.status!=="completed" && x.baseline==="skipped"))', 10000, 'baseline saved');
        await cdp.waitFor('document.querySelector("#main")?.innerText.includes("已跳过（no_baseline）")', 10000, 'baseline rendered');
    }
    await cdp.eval(`(()=>{const w=document.querySelector('#refl-watched'); if(w){w.value='12';w.dispatchEvent(new Event('input',{bubbles:true}));} const s=document.querySelector('#refl-summary'); if(s){s.value='Attention changes with sleep and interest. A short walk can restore focus. I can explain this in my own words.';s.dispatchEvent(new Event('input',{bubbles:true}));} return 'filled';})()`);
    await cdp.click('[data-refl-save]');
    await cdp.waitFor('__inputTest.snapshot().then(s=>s.sessions.some(x=>x.status==="reflection" && x.hasReflection))', 12000, 'input reflection saved');
    await cdp.waitFor('document.querySelector("#main")?.innerText.includes("状态 reflection")', 12000, 'input reflection rendered');
    await cdp.click('[data-session-complete]');
    await cdp.waitFor('__inputTest.snapshot().then(s=>s.sessions.some(x=>x.status==="completed"))', 12000, 'input completed');
    const inputDone = await cdp.waitFor('__planTest.snapshot().then(s=>s.plan.tasks.find(t=>t.id===' + JSON.stringify(inputTask.id) + ')?.status === "done")', 12000, 'input writeback');
    const inputBound = await cdp.eval('__planTest.snapshot().then(s=>{const a=s.sessions.input.filter(x=>x.plan===' + JSON.stringify(inputTask.id) + '); return {total:a.length,active:a.filter(x=>x.status==="active").length};})');
    check('E. 输入完成后计划任务写回 done，并保留计划绑定', inputDone === true && inputBound.active === 0 && inputBound.total >= 1, `status=${inputDone} · ${JSON.stringify(inputBound)}`);

    // —— Output：启动 → 提交 → 完成 → 回写计划 ——
    await cdp.eval('document.querySelector("[data-nav=home]").click()');
    const outputTask = tasks.find(t => t.module === 'output');
    check('F. 表达任务路由到 Output Lab，并创建绑定 attempt', (await cdp.click(`[data-task-start="${outputTask.id}"]`)) === 'ok' && !!(await cdp.waitFor('document.querySelector("#out-editor")', 12000, 'output editor')) && (await cdp.eval('__planTest.snapshot().then(s=>s.outputAttemptId)')) !== null);
    await cdp.eval(`(()=>{const e=document.querySelector('#out-editor'); e.value='Attention is not one fixed ability. It changes with sleep, interest, and the difficulty of the material. A short walk can restore focus, and a clear question can make a long article easier to remember.'; e.dispatchEvent(new Event('input',{bubbles:true})); return e.value.length;})()`);
    await sleep(800);
    await cdp.click('#out-submit');
    await cdp.waitFor('__outputTest.snapshot().then(s=>s.attempts.some(x=>x.status!=="draft"))', 12000, 'output submitted');
    await cdp.click('#out-finish');
    await cdp.waitFor('__outputTest.snapshot().then(s=>s.attempts.some(x=>x.status==="completed"))', 12000, 'output completed');
    const outputDone = await cdp.waitFor('__planTest.snapshot().then(s=>s.plan.tasks.find(t=>t.id===' + JSON.stringify(outputTask.id) + ')?.status === "done")', 12000, 'output writeback');
    check('G. 表达完成后计划任务写回 done', outputDone === true, `status=${outputDone}`);

    // —— Exam：启动 → 作答 → 提交 → 复盘 → 完成 → 回写计划 ——
    await cdp.eval('document.querySelector("[data-nav=home]").click()');
    const examTask = tasks.find(t => t.module === 'exam');
    check('H. 考试任务路由到 Exam Session，并绑定 planTaskId', (await cdp.click(`[data-task-start="${examTask.id}"]`)) === 'ok' && !!(await cdp.waitFor('document.querySelector(".exam-session")', 12000, 'exam session')) && (await cdp.eval('__planTest.snapshot().then(s=>s.examPlanTaskId)')) === examTask.id);
    let es = await cdp.eval('__examTest.snapshot()');
    const active = es.sessions.find(s => s.id === es.current);
    for (const id of active.items) {
        const it = active.itemsDetail.find(i => i.id === id);
        const value = it.options ? it.key : (it.type === 'translation' ? 'The glass roof built to attract visitors ended up making summers harder to bear.' : 'This is my own short response about attention and learning.');
        await cdp.eval(`__examTest.answer(${JSON.stringify(id)}, ${JSON.stringify(value)})`);
    }
    await cdp.click('#exam-submit');
    await cdp.waitFor('document.querySelector(".exam-result")', 12000, 'exam result');
    await cdp.click('#exam-complete');
    await cdp.waitFor('__examTest.snapshot().then(s=>s.sessions.some(x=>x.status==="completed"))', 12000, 'exam completed');
    const examDone = await cdp.waitFor('__planTest.snapshot().then(s=>s.plan.tasks.find(t=>t.id===' + JSON.stringify(examTask.id) + ')?.status === "done")', 12000, 'exam writeback');
    check('I. 考试完成后计划任务写回 done（迁移证据，不是总分）', examDone === true, `status=${examDone}`);

    // —— Reading / Sentence 只验证路由，不伪造完成 ——
    await cdp.eval('document.querySelector("[data-nav=home]").click()');
    const readingTask = tasks.find(t => t.module === 'reading');
    const sentenceTask = tasks.find(t => t.module === 'sentence');
    // 统一入口：从 Today 的「继续今天的训练」进入下一项，而不是自己找卡片。
    await cdp.click('#start-today');
    const flowPage = await cdp.waitFor('__planTest.snapshot().then(s=>s.page !== "home")', 12000, 'flow route');
    check('J. Today 统一入口自动进入下一项（不回到词汇默认页）', flowPage === true, `page=${await cdp.eval('__planTest.snapshot().then(s=>s.page)')}`);
    await cdp.eval('document.querySelector("[data-nav=home]").click()');
    await cdp.click(`[data-task-start="${readingTask.id}"]`);
    const readingPage = await cdp.waitFor('__planTest.snapshot().then(s=>s.page)', 12000, 'reading route');
    check('K. 阅读任务路由到阅读页，不落到词汇页', readingPage === 'reading', `page=${readingPage}`);
    await cdp.eval('document.querySelector("[data-nav=home]").click()');
    await cdp.click(`[data-task-start="${sentenceTask.id}"]`);
    const sentencePage = await cdp.waitFor('__planTest.snapshot().then(s=>s.page)', 12000, 'sentence route');
    check('L. 句子任务路由到 Sentence Lab，不落到词汇页', sentencePage === 'lab', `page=${sentencePage}`);

    // —— 重新生成未完成部分：保留 done 与 started ——
    await cdp.eval('document.querySelector("[data-nav=home]").click()');
    const before = await cdp.eval('__planTest.snapshot()');
    await cdp.click('#plan-regenerate');
    await sleep(1600);
    const after = await cdp.eval('__planTest.snapshot()');
    const statusOf = (s, id) => s.plan.tasks.find(t => t.id === id)?.status;
    check('M. 重新生成保留已完成任务，不重建证据', statusOf(after, inputTask.id) === 'done' && statusOf(after, outputTask.id) === 'done' && statusOf(after, examTask.id) === 'done');
    check('N. 重新生成保留已开始任务，不复制同类任务', statusOf(after, readingTask.id) === 'started' && statusOf(after, sentenceTask.id) === 'started' && new Set(after.plan.tasks.map(t => t.kind)).size === after.plan.tasks.length, JSON.stringify(after.plan.tasks.map(t => `${t.kind}:${t.status}`)));
    const regenSnap = await cdp.eval('__planTest.snapshot()');
    check('O. 重新生成后预算仍不超限', regenSnap.plan.tasks.reduce((n, t) => n + (t.minutes || 0), 0) <= 240, `${regenSnap.plan.tasks.reduce((n, t) => n + (t.minutes || 0), 0)}/240`);

    // —— 刷新恢复 ——
    const beforeReload = await cdp.eval('__planTest.snapshot()');
    await cdp.eval('location.reload()');
    await cdp.waitFor('!!window.__planTest', 25000, 'reload');
    const afterReload = await cdp.eval('__planTest.snapshot()');
    check('P. 刷新后计划、完成状态和开始状态仍完整', !!afterReload.plan && statusOf(afterReload, inputTask.id) === 'done' && statusOf(afterReload, outputTask.id) === 'done' && statusOf(afterReload, examTask.id) === 'done' && statusOf(afterReload, readingTask.id) === 'started' && statusOf(afterReload, sentenceTask.id) === 'started', JSON.stringify(beforeReload.plan.tasks.map(t => [t.kind, t.status])));
    const reloadedInputs = await cdp.eval('__planTest.snapshot().then(s=>{const a=s.sessions.input.filter(x=>x.plan===' + JSON.stringify(inputTask.id) + '); return {total:a.length,active:a.filter(x=>x.status==="active").length};})');
    check('Q. 刷新后不出现重复活动输入绑定会话', reloadedInputs.active === 0, JSON.stringify(reloadedInputs));
    check('R. 页面无未捕获 JavaScript 错误', cdp.errors.length === 0, cdp.errors.slice(0, 2).join(' | '));
    console.log(`\nPhase 12 Full Integration smoke: ${results.filter(Boolean).length}/${results.length}`);
    process.exit(results.every(Boolean) ? 0 : 1);
}
catch (e) {
    console.error('SMOKE ERROR', e.message);
    console.error('errors', cdp.errors.slice(0, 5));
    process.exit(2);
}
