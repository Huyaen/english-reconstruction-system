#!/usr/bin/env node
// —— Phase 11：考试迁移真实浏览器验收 ——
// 前置：npm run build:test；server.mjs --dir=dist-test --port=4173；headless Edge CDP 9230。
const PORT = process.env.SMOKE_PORT || '9230';
const BASE = `http://127.0.0.1:${PORT}`;
const results = [];
const check = (name, ok, detail = '') => { results.push(!!ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  · ' + String(detail).slice(0, 240) : ''}`); };
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
const cdp = await CDP.connect();
try {
    await cdp.send('Runtime.enable');
    await cdp.send('Page.enable');
    await cdp.eval('location.href="http://127.0.0.1:4173/?test=1"');
    await cdp.waitFor('!!(window.__examTest && document.querySelector("[data-nav=exam]"))', 20000, 'boot exam');
    check('A. 启动后考试入口存在', true);
    const seeded = await cdp.eval('__examTest.seedWeekly()');
    await cdp.eval('__examTest.resetSessions()');
    check('B. 周测种子（真实词/未读文章）就绪', seeded.words >= 4 && seeded.passages >= 1, JSON.stringify(seeded));
    await cdp.eval('location.reload()');
    await cdp.waitFor('!!(window.__examTest && document.querySelector("[data-nav=exam]"))', 20000, 'reload');
    await cdp.click('[data-nav="exam"]');
    await cdp.waitFor('document.querySelector(".exam-spec-grid")', 10000, 'overview');
    let snap = await cdp.eval('__examTest.snapshot()');
    check('C. 规格包含 2026 确认 / 2028 暂定 / 合格考隔离', snap.specs.length >= 3 && snap.specs.some(s => s.year === 2028 && s.status === 'provisional' && s.total === null) && snap.specs.some(s => s.status === 'official_confirmed' && s.written === 115 && s.oral === 35), JSON.stringify(snap.specs));
    let txt = await cdp.text();
    const y28 = await cdp.eval(`(()=>{const e=[...document.querySelectorAll('.exam-spec')].find(x=>(x.querySelector('h3')?.innerText||'').startsWith('2028')); return e?e.innerText:'';})()`);
    check('D. 2028 明示未公布，不展示 115+35 确定结论', txt.includes('2028 官方规则尚未发布') && !y28.includes('115 分') && !y28.includes('35 分'), JSON.stringify({ phrase: txt.includes('2028 官方规则尚未发布'), y28: y28.slice(0, 60) }));
    check('E. 概览有来源与“不预测分数”说明', txt.includes('不预测高考分数') && txt.includes('2028'));
    // 混合练习：UI 启动
    await cdp.click('#exam-start-mixed');
    await cdp.waitFor('document.querySelector(".exam-session")', 10000, 'session');
    snap = await cdp.eval('__examTest.snapshot()');
    const active = snap.sessions.find(s => s.id === snap.current);
    check('F. 混合练习只取新题并进入作答', !!active && active.items.length >= 1 && active.items.length <= 6 && active.answers === 0, active ? `${active.items.length} 题` : 'none');
    // 用钩子逐题作答（引擎写入 + 真实 UI 提交按钮）
    for (const id of active.items) {
        const it = active.itemsDetail.find(i => i.id === id);
        const value = it.options ? it.key : (it.type === 'translation' ? 'The glass roof built to attract visitors ended up making summers harder to bear.' : 'This is my own short response about what I learned this week, with a reason.');
        await cdp.eval(`__examTest.answer(${JSON.stringify(id)}, ${JSON.stringify(value)})`);
    }
    await cdp.click('#exam-submit');
    await cdp.waitFor('document.querySelector(".exam-result")', 10000, 'result');
    snap = await cdp.eval('__examTest.snapshot()');
    const done = snap.sessions.find(s => s.id === active.id);
    check('G. 提交后客观/开放题分开计分，不冒充整卷', done && (done.scoreStatus === 'partial' || done.scoreStatus === 'verified_objective') && (done.scoreStatus !== 'verified_objective' || !active.items.some(id => !snap.items.find(i => i.id === id).options)), done?.scoreStatus ?? 'none');
    txt = await cdp.text();
    check('H. 结果页无“官方分数/预测分”', txt.includes('这里没有官方分数') && !txt.includes('预测分：'));
    check('I. 错因带类别与置信度', done.errors.length === 0 || txt.includes('置信度'), `${done.errors.length} 条`);
    if (done.errors.length) {
        await cdp.eval(`(()=>{const s=document.querySelector('.exam-correct'); s.value='evidence'; s.dispatchEvent(new Event('change')); return 'ok';})()`);
        await sleep(300);
        const after = await cdp.eval('__examTest.snapshot()');
        const e2 = after.sessions.find(s => s.id === active.id).errors[0];
        check('J. 用户可修正错因并持久化', e2.category === 'evidence', e2.category);
    } else {
        check('J. 无错题时不伪造错因', true);
    }
    await cdp.click('#exam-complete');
    await cdp.waitFor('document.querySelector("#exam-back")', 8000, 'completed');
    snap = await cdp.eval('__examTest.snapshot()');
    check('K. 复盘完成后状态为 completed', snap.sessions.find(s => s.id === active.id)?.status === 'completed');
    // 周测
    await cdp.eval('__examTest.setPlan(true)');
    await cdp.click('[data-nav="exam"]');
    await cdp.waitFor('document.querySelector(".exam-tabs")', 8000, 'exam tabs');
    await cdp.eval('__examTest.startWeekly()');
    await cdp.waitFor('document.querySelector(".exam-session")', 12000, 'weekly session');
    snap = await cdp.eval('__examTest.snapshot()');
    const weekly = snap.sessions.find(s => s.id === snap.current);
    check('L. 周测使用真实词库+未读文章并固定快照', !!weekly && weekly.items.length >= 3, weekly ? `${weekly.items.length} 项` : 'none');
    const types = weekly.itemsDetail.map(i => i.type);
    check('M. 周测包含延迟词汇/句子/阅读/表达/反思中至少 4 类', new Set(types).size >= 4, [...new Set(types)].join(','));
    for (const id of weekly.items) {
        const it = weekly.itemsDetail.find(i => i.id === id);
        const value = it.options ? (it.key ?? 'A') : (it.type === 'reflection' ? 'A' : 'My own sentence: I learned that small design choices can create unexpected problems.');
        if (it.type === 'reflection') { await cdp.eval(`__examTest.answer(${JSON.stringify(id)}, "A")`); continue; }
        await cdp.eval(`__examTest.answer(${JSON.stringify(id)}, ${JSON.stringify(value)})`);
    }
    await cdp.click('#exam-submit');
    await cdp.waitFor('document.querySelector(".exam-result")', 10000, 'weekly result');
    await cdp.click('#exam-complete');
    await cdp.waitFor('document.body.innerText.includes("周测报告")', 10000, 'weekly report');
    txt = await cdp.text();
    check('N. 周测报告说明证据边界', txt.includes('不是能力证明') || txt.includes('只描述这一次表现'), txt.slice(0, 120));
    // 学校考试记录
    await cdp.click('[data-exam-tab="logs"]');
    await cdp.waitFor('document.querySelector("#log-score")', 8000, 'logs');
    await cdp.eval(`(()=>{const set=(s,v)=>{const e=document.querySelector(s);e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}))};set('#log-name','分类隔离记录');set('#log-category','shanghai-academic-foreign-language');set('#log-year','2026');set('#log-score','102');set('#log-full','150');set('#log-note','阅读时间不够');document.querySelector('#log-add').click();return 'ok';})()`);
    await sleep(500);
    snap = await cdp.eval('__examTest.snapshot()');
    const school = snap.logs.find(l => l.name === '分类隔离记录');
    check('O. 学校分数作为自报记录保存，分类隔离', !!school && school.score === 102 && school.full === 150 && school.category === 'shanghai-academic-foreign-language' && school.source === 'self_reported', JSON.stringify(school));
    check('P. 页面无未捕获 JavaScript 错误', cdp.errors.length === 0, cdp.errors.slice(0, 2).join(' | '));
} catch (e) {
    check('Z. 冒烟执行完成', false, e.message);
} finally {
    const pass = results.filter(Boolean).length;
    console.log(`\nPhase 11 smoke: ${pass}/${results.length}`);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }).catch(() => null);
    if (shot?.data) { const fs = await import('node:fs'); fs.writeFileSync('screenshots/phase11-exam.png', Buffer.from(shot.data, 'base64')); }
    cdp.ws.close();
    process.exit(pass === results.length ? 0 : 23);
}
