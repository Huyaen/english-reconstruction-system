#!/usr/bin/env node
// —— Phase 12：考试记录/分值一致性 真实浏览器验收 ——
// 前置：npm run build:test；server.mjs --dir=dist-test --port=4173；headless Edge CDP 9230。
const PORT = process.env.SMOKE_PORT || '9230';
const BASE = `http://127.0.0.1:${PORT}`;
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  · ' + String(detail).slice(0, 300) : ''}`); };
class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.errors = []; ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); clearTimeout(p.t); this.pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); } else if (m.method === 'Runtime.exceptionThrown') this.errors.push(m.params.exceptionDetails?.exception?.description ?? 'exception'); else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') this.errors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' ')); }; }
    static async connect() { const list = await (await fetch(`${BASE}/json/list`)).json(); const t = list.find(x => x.type === 'page' && (x.url || '').includes('4173')); if (!t) throw new Error('no app page'); const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); }); return new CDP(ws); }
    send(method, params = {}, timeout = 12000) { return new Promise((res, rej) => { const id = ++this.id; const t = setTimeout(() => { this.pending.delete(id); rej(new Error('cdp timeout ' + method)); }, timeout); this.pending.set(id, { res, rej, t }); this.ws.send(JSON.stringify({ id, method, params })); }); }
    async eval(expression) { const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; }
    async waitFor(expr, timeout = 15000, label = expr) { const end = Date.now() + timeout; let last; while (Date.now() < end) { try { last = await this.eval(expr); if (last) return last; } catch (e) { last = 'err:' + e.message; } await new Promise(r => setTimeout(r, 200)); } throw new Error('timeout: ' + label + ' last=' + String(last).slice(0, 160)); }
    async click(sel) { return this.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'missing'; e.click(); return 'ok';})()`); }
    async text() { return this.eval('document.querySelector("#main")?.innerText || ""'); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const setVal = (cdp, sel, value) => cdp.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return 'missing'; e.value=${JSON.stringify(String(value))}; e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return e.value;})()`);
const spring = 'spec-2026-spring-foreign-language';
const y2028 = 'spec-2028-gaokao-foreign-language';
const cdp = await CDP.connect();
try {
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.eval('location.href="http://127.0.0.1:4173/?test=1"');
    await cdp.waitFor('!!(window.__examTest && document.querySelector("[data-nav=exam]"))', 20000, 'boot');
    await cdp.eval('__examTest.resetLogs()');
    await cdp.eval('location.reload()');
    await cdp.waitFor('!!(window.__examTest && document.querySelector("[data-nav=exam]"))', 20000, 'reload');
    await cdp.click('[data-nav="exam"]');
    await cdp.waitFor('document.querySelector("[data-exam-tab=logs]")', 8000, 'exam');
    await cdp.click('[data-exam-tab="logs"]');
    await cdp.waitFor('document.querySelector("#log-spec")', 8000, 'log form');
    check('A. 空表单不显示错误，满分不预填官方分数', (await cdp.eval('document.body.innerText.includes("满分必须大于 0")')) === false && (await cdp.eval('document.querySelector("#log-full").value')) === '', await cdp.eval('document.querySelector("#log-full").value'));

    await setVal(cdp, '#log-spec', spring);
    await sleep(250);
    const prefill = await cdp.eval('({full:document.querySelector("#log-full").value,cat:document.querySelector("#log-category").value,year:document.querySelector("#log-year").value,basis:document.querySelector("#log-basis").innerText})');
    check('B. 官方确认规格联动类别/年份/满分 150', prefill.full === '150' && prefill.cat === 'shanghai-spring-exam-foreign-language' && prefill.year === '2026' && prefill.basis.includes('官方已确认总分'), JSON.stringify(prefill));

    await setVal(cdp, '#log-type', 'mock_exam');
    await setVal(cdp, '#log-name', '区一模');
    await setVal(cdp, '#log-score', '100');
    await setVal(cdp, '#log-full', '120');
    await cdp.click('#log-add');
    await sleep(400);
    let snap = await cdp.eval('__examTest.snapshot()');
    const conflictText = await cdp.text();
    check('C. 官方 150 与本次 120 冲突时阻止保存并要求确认', snap.logs.length === 0 && conflictText.includes('官方已确认总分为 150') && !(await cdp.eval('document.querySelector("#log-ack-wrap").hidden')), `logs=${snap.logs.length}`);

    await cdp.eval('(()=>{const e=document.querySelector("#log-ack"); e.checked=true; e.dispatchEvent(new Event("change",{bubbles:true})); return "ok";})()');
    await cdp.click('#log-add');
    await sleep(500);
    snap = await cdp.eval('__examTest.snapshot()');
    const log1 = snap.logs.find(l => l.name === '区一模');
    check('D. 确认后保存自定义满分，来源仍是 self_reported', !!log1 && log1.full === 120 && log1.score === 100 && log1.source === 'self_reported' && log1.scoreBasis === 'custom_total' && log1.type === 'mock_exam' && log1.category === 'shanghai-spring-exam-foreign-language' && log1.year === 2026, JSON.stringify(log1));
    check('E. 记录表格显示冲突与自报来源', (await cdp.text()).includes('满分与官方规格不一致') && (await cdp.text()).includes('self_reported'));

    await setVal(cdp, '#log-spec', y2028);
    await sleep(250);
    const y28 = await cdp.eval('({full:document.querySelector("#log-full").value,basis:document.querySelector("#log-basis").innerText})');
    check('F. 2028 暂定规格不预填官方分值', y28.full === '' && y28.basis.includes('未知/待确认'), JSON.stringify(y28));
    await setVal(cdp, '#log-name', '2028 模拟');
    await setVal(cdp, '#log-score', '90');
    await setVal(cdp, '#log-full', '100');
    await setVal(cdp, '#log-note', '阅读时间不够');
    await cdp.click('#log-add');
    await sleep(400);
    snap = await cdp.eval('__examTest.snapshot()');
    const log2 = snap.logs.find(l => l.name === '2028 模拟');
    check('G. 暂定规格按实际满分保存，不冒充官方', !!log2 && log2.full === 100 && log2.scoreBasis === 'custom_total' && log2.year === 2028 && y28.basis.includes('未知/待确认'), JSON.stringify(log2));

    await setVal(cdp, '#log-spec', '');
    await setVal(cdp, '#log-type', 'custom');
    await setVal(cdp, '#log-category', 'other');
    await setVal(cdp, '#log-year', '2026');
    await setVal(cdp, '#log-name', '校内自编卷');
    await setVal(cdp, '#log-score', '88');
    await setVal(cdp, '#log-full', '120');
    await cdp.click('#log-add');
    await sleep(400);
    snap = await cdp.eval('__examTest.snapshot()');
    const log3 = snap.logs.find(l => l.name === '校内自编卷');
    check('H. 支持自定义考试与实际满分', !!log3 && log3.type === 'custom' && log3.full === 120 && log3.score === 88 && log3.category === 'other' && log3.year === 2026, JSON.stringify(log3));

    await setVal(cdp, '#log-score', '130');
    await cdp.click('#log-add');
    await sleep(350);
    snap = await cdp.eval('__examTest.snapshot()');
    check('I. 得分超过满分时拒绝保存', snap.logs.length === 3 && (await cdp.text()).includes('0 ≤ 得分 ≤ 满分'), `logs=${snap.logs.length}`);

    const id1 = log1.id;
    await cdp.eval(`(()=>{const b=[...document.querySelectorAll('.exam-log-edit')].find(x=>x.dataset.log===${JSON.stringify(id1)}); b.click(); return 'ok';})()`);
    await cdp.waitFor('document.querySelector("#log-cancel")', 5000, 'edit');
    await setVal(cdp, '#log-score', '99');
    await cdp.click('#log-add');
    await sleep(400);
    snap = await cdp.eval('__examTest.snapshot()');
    const edited = snap.logs.find(l => l.id === id1);
    check('J. 编辑保持类别/年份/满分并更新得分', snap.logs.length === 3 && edited.score === 99 && edited.full === 120 && edited.year === 2026 && edited.category === 'shanghai-spring-exam-foreign-language', JSON.stringify(edited));

    await cdp.eval(`(()=>{const b=[...document.querySelectorAll('.exam-log-del')].find(x=>x.dataset.log===${JSON.stringify(log3.id)}); b.click(); return 'ok';})()`);
    await sleep(400);
    snap = await cdp.eval('__examTest.snapshot()');
    check('K. 删除后只留下两条', snap.logs.length === 2 && !snap.logs.some(l => l.id === log3.id));

    await cdp.eval('location.reload()');
    await cdp.waitFor('!!(window.__examTest && document.querySelector("[data-nav=exam]"))', 20000, 'reload2');
    await cdp.click('[data-nav="exam"]');
    await cdp.waitFor('document.querySelector("[data-exam-tab=logs]")', 8000, 'exam2');
    await cdp.click('[data-exam-tab="logs"]');
    await cdp.waitFor('document.querySelector("#log-spec")', 8000, 'logs2');
    snap = await cdp.eval('__examTest.snapshot()');
    const kept = snap.logs.find(l => l.id === id1);
    check('L. 刷新后类别/年份/满分/自报来源完整保留', snap.logs.length === 2 && kept && kept.full === 120 && kept.year === 2026 && kept.source === 'self_reported', JSON.stringify(kept));

    const exported = await cdp.eval('__examTest.exportLogs()');
    check('M. 导出包含 schema、类别、年份、满分与来源', exported.schema === 'erv2-exam-logs' && exported.logs.length === 2 && exported.logs.every(l => l.scoreSource === 'self_reported' && l.applicableYear && l.fullScore > 0), JSON.stringify(exported.logs.map(l => ({ n: l.examName, y: l.applicableYear, f: l.fullScore }))));
    await cdp.eval('__examTest.resetLogs()');
    const imported = await cdp.eval(`__examTest.importLogs(${JSON.stringify(JSON.stringify(exported))})`);
    snap = await cdp.eval('__examTest.snapshot()');
    check('N. 导入恢复类别/年份/满分/来源', imported.ok && imported.imported === 2 && snap.logs.length === 2 && snap.logs.every(l => l.source === 'self_reported' && l.year && l.full === exported.logs.find(e => e.id === l.id).fullScore), JSON.stringify(imported));

    const note = snap.logs.find(l => l.note)?.note ?? '';
    const diag = await cdp.eval('__diagnosticsTest.snapshot(7)');
    const clueMetric = diag.metrics.find(m => m.id === 'exam.selfReportedLogs');
    check('O. 自评只作线索，自报记录不进入已验证错因', snap.logs.every(l => l.clueOnly === true) && snap.logs.some(l => l.note === '阅读时间不够') && (await cdp.text()).includes('仅线索'), note);
    check('P. 诊断只为自报记录提供线索计数，不生成官方分', !!clueMetric && clueMetric.quality === 'task-behavior' && diag.metrics.find(m => m.id === 'exam.officialScoreEstimate')?.value === null, JSON.stringify({ clue: clueMetric, official: diag.metrics.find(m => m.id === 'exam.officialScoreEstimate') }));
    check('Q. 页面无未捕获 JavaScript 错误', cdp.errors.length === 0, cdp.errors.slice(0, 2).join(' | '));
} catch (e) {
    check('Z. 冒烟执行完成', false, e.message);
} finally {
    const pass = results.filter(Boolean).length;
    console.log(`\nPhase 12 smoke: ${pass}/${results.length}`);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
    if (shot?.data) { const fs = await import('node:fs'); fs.writeFileSync('screenshots/phase12-smoke.png', Buffer.from(shot.data, 'base64')); }
    cdp.ws.close();
    process.exit(pass === results.length ? 0 : 23);
}
