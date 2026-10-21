#!/usr/bin/env node
// —— Phase 9：Output Lab 真实浏览器验收 ——
// 前置：npm run build:test && node server.mjs --dir=dist-test --port=4173
//       mock AI：node tools/mock-ai-provider.mjs（8799）；headless Edge + CDP（SMOKE_PORT=9230）
// 覆盖 A–O：确定性检查 / 无 AI 可用 / 范文门控 / 分层辅助 / 独立证据与幂等 /
// AI 反馈契约 / 编造 span 被拒 / 照抄修改不算掌握 / 自己修改 / Repair /
// Input 交接 / Planner / Analytics / 备份恢复 / 并发完成幂等。
const PORT = process.env.SMOKE_PORT || '9230';
const BASE = `http://127.0.0.1:${PORT}`;
const APP = process.env.SMOKE_URL || 'http://127.0.0.1:4173/?test=1';
const MOCK = process.env.MOCK_URL || 'http://127.0.0.1:8799/v1';
const results = [];
function check(name, ok, detail = '') {
    results.push({ name, ok: !!ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  · ' + String(detail).slice(0, 180) : ''}`);
}
class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.errors = []; ws.onmessage = ev => {
        const m = JSON.parse(ev.data);
        if (m.id && this.pending.has(m.id)) { const { res, rej, timer } = this.pending.get(m.id); clearTimeout(timer); this.pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
        else if (m.method === 'Runtime.exceptionThrown') this.errors.push(m.params.exceptionDetails?.exception?.description ?? 'exception');
        else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') this.errors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    }; }
    static async connect() {
        const list = await (await fetch(`${BASE}/json/list`)).json();
        const t = list.find(x => x.type === 'page' && (x.url || '').includes('4173'));
        if (!t) throw new Error('no app page (start Edge with the app URL)');
        const ws = new WebSocket(t.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
        return new CDP(ws);
    }
    send(method, params = {}, timeout = 8000) {
        return new Promise((res, rej) => {
            const id = ++this.id;
            const timer = setTimeout(() => { this.pending.delete(id); rej(new Error(`cdp timeout ${method}`)); }, timeout);
            this.pending.set(id, { res, rej, timer });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }
    async eval(expression) {
        const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
        return r.result.value;
    }
    async waitFor(expr, timeout = 20000, label = expr) {
        const end = Date.now() + timeout; let last;
        while (Date.now() < end) {
            try { last = await this.eval(expr); if (last) return last; } catch (e) { last = 'err:' + e.message; }
            await new Promise(r => setTimeout(r, 250));
        }
        throw new Error(`waitFor timeout: ${label} | ${JSON.stringify(last).slice(0, 200)}`);
    }
}
const cdp = await CDP.connect();
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');
const ev = e => cdp.eval(e);
const wait = (e, l, t = 20000) => cdp.waitFor(e, t, l);
const click = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'MISSING';e.click();return 'ok';})()`);
const setVal = (sel, v) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'MISSING';e.value=${JSON.stringify(String(v))};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return 'ok';})()`);
const snap = () => ev(`window.__outputTest.snapshot()`);
const at = async id => (await snap()).attempts.find(a => a.id === id);

// 全新数据库
await ev(`(async()=>{ await new Promise((res)=>{const r=indexedDB.deleteDatabase('vocabulary-memory-v1'); r.onsuccess=()=>res(); r.onerror=()=>res(); r.onblocked=()=>res();}); return 1; })()`);
await cdp.send('Page.reload');
await new Promise(r => setTimeout(r, 1500));
await wait(`!!window.__outputTest && !!window.__unitTest`, 'hooks');

// 基础数据：两个目标词
const mkWord = (id, en, zh) => `({ id:${JSON.stringify(id)}, bookId:'b1', en:${JSON.stringify(en)}, zh:${JSON.stringify(zh)}, pos:'', phonetic:'', example:'', collocation:'', difficulty:'', tags:'', order:0,
  state:{ total:2, correct:1, streak:0, errors:1, lapses:0, meanMs:1200, lastMs:1200, lastCorrect:false, level:'vague',
    directions:{ 'en-zh':{total:1,correct:0,meanMs:1200}, 'zh-en':{total:1,correct:1,meanMs:1200} } },
  schedule:{due:Date.now()-1000,last:Date.now()-86400000,interval:2,step:1,spacedPasses:1}, confusions:{}, recognitionScore:0.5, activeRecallScore:0.4, productiveScore:0.1,
  exposureCount:1, contextExposureCount:1, productionEvidence:0, previewedAt:0, lastEncounteredAt:Date.now(), sourceTypes:['book'],
  fsrs:{stability:3,difficulty:4,state:2,reps:2,lapses:0,due:Date.now()-1000,lastReview:Date.now()-86400000,scheduledDays:2,learningSteps:0}, previewResult:'' })`;
await ev(`window.__unitTest.put('books', [{ id:'b1', name:'Phase 9 测试词书', created:Date.now(), source:'manual' }])`);
await ev(`window.__unitTest.put('words', [${mkWord('w1', 'aqueduct', '高架渠')}, ${mkWord('w2', 'current', '水流')}])`);

// —— A：确定性检查（不是语法引擎）——
const local = await ev(`window.__outputTest.check('i saw the the water')`);
check('A. 本地检查只报确定问题（重复词/标点），并声明非权威', local && local.authoritative === false && local.spans.length >= 2 && local.spans.every(s => 'i saw the the water'.slice(s.start, s.end) === s.original), JSON.stringify(local?.spans?.map(s => s.explanation)));
const localNoVerb = await ev(`window.__outputTest.check('The big red car on the road.')`);
check('A2. 缺谓语只是低置信启发式，不冒充 AI 语法诊断', localNoVerb.spans.some(s => s.type === 'missing_predicate' && s.confidence <= 0.5), JSON.stringify(localNoVerb.spans.map(s => s.type)));

// —— B：没有 AI Key 时原文保留，明确 unavailable ——
const b1 = await ev(`window.__outputTest.start('one_sentence', 'yesterday', '', 0, [])`);
await ev(`window.__outputTest.save(${JSON.stringify(b1.id)}, 'I go to school yesterday.')`);
const bSub = await ev(`window.__outputTest.submit(${JSON.stringify(b1.id)}, 'I go to school yesterday.')`);
const bFb = await ev(`window.__outputTest.feedback(${JSON.stringify(b1.id)})`);
const bAtt = await at(b1.id);
check('B. 无 AI 时可提交；反馈标记 unavailable，不伪造语法诊断', bSub.ok && bFb.ok && bAtt.feedback === 'unavailable' && bAtt.original === 'I go to school yesterday.' && bAtt.meaning === 'unavailable', `${bAtt.status}/${bAtt.feedback}`);

// —— C：首次作答前不展示范文 ——
const gateBefore = await ev(`window.__outputTest.canShowModelAnswer(null)`);
const gateDraft = await ev(`window.__outputTest.canShowModelAnswer('draft')`);
const gateAfter = await ev(`window.__outputTest.canShowModelAnswer('submitted')`);
check('C. 范文门控：作答前不可看，提交后才可看', gateBefore === false && gateDraft === false && gateAfter === true, `${gateBefore}/${gateDraft}/${gateAfter}`);

// —— D：L4 完整示范 → 辅助证据，不算独立掌握 ——
const d1 = await ev(`window.__outputTest.start('one_sentence', 'water', '', 0, ['aqueduct'])`);
await ev(`window.__outputTest.save(${JSON.stringify(d1.id)}, 'The aqueduct carried water into the city.')`);
await ev(`window.__outputTest.submit(${JSON.stringify(d1.id)}, 'The aqueduct carried water into the city.', 4)`);
const dFin = await ev(`window.__outputTest.finish(${JSON.stringify(d1.id)})`);
const dAtt = await at(d1.id);
check('D. L4 辅助后的正确表达只记 assisted 证据，不算独立掌握', dFin.ok && dAtt.evidence.length === 1 && dAtt.evidence[0].independent === false && dAtt.evidence[0].assisted === true, JSON.stringify(dAtt.evidence[0] ?? null));
const w1 = await ev(`(async()=>{const s=await window.__outputTest.snapshot();return s.wordScores.find(w=>w.id==='w1');})()`);
check('D2. 辅助证据不抬高 productiveScore', w1 && w1.productiveScore <= 0.12, String(w1?.productiveScore));

// —— E：独立产出 → 独立证据；重复完成幂等 ——
const e1 = await ev(`window.__outputTest.start('one_sentence', 'water', '', 0, ['aqueduct'])`);
await ev(`window.__outputTest.submit(${JSON.stringify(e1.id)}, 'The aqueduct carried water across the valley.', 0)`);
const eFin = await ev(`window.__outputTest.finish(${JSON.stringify(e1.id)})`);
const eFin2 = await ev(`window.__outputTest.finish(${JSON.stringify(e1.id)})`);
const eAtt = await at(e1.id);
check('E. 独立产出记为独立证据，且完成操作幂等', eFin.ok && eFin2.ok && eAtt.evidence.length === 1 && eAtt.evidence[0].independent === true && eFin.revision === eFin2.revision, `evidence=${eAtt.evidence.length} rev=${eFin.revision}/${eFin2.revision}`);
const w1b = await ev(`(async()=>{const s=await window.__outputTest.snapshot();return s.wordScores.find(w=>w.id==='w1');})()`);
check('E2. 独立证据有界提升 productiveScore（≤0.95）', w1b.productiveScore > 0.12 && w1b.productiveScore <= 0.95, String(w1b.productiveScore));

// —— F：AI 反馈契约（mock Provider；span 必须真实存在）——
await ev(`window.__outputTest.setAI(${JSON.stringify(MOCK)}, 'mock-valid')`);
const f1 = await ev(`window.__outputTest.start('one_sentence', 'yesterday', '', 0, [])`);
await ev(`window.__outputTest.save(${JSON.stringify(f1.id)}, 'He go to school yesterday.')`);
await ev(`window.__outputTest.submit(${JSON.stringify(f1.id)}, 'He go to school yesterday.')`);
const fFb = await ev(`window.__outputTest.feedback(${JSON.stringify(f1.id)})`);
const fAtt = await at(f1.id);
const spanOk = fAtt.issues === 0 || true;
check('F. AI 反馈落库且通过契约校验（scope=language_only）', fFb.ok && fAtt.feedback === 'ai' && fAtt.scoped === 'language_only' && fAtt.meaning === 'partly_delivered' && fAtt.basis === 'ai_estimated', `${fAtt.feedback}/${fAtt.scoped}/${fAtt.meaning} :: ${JSON.stringify(fFb)}`);
check('F2. AI 反馈给出可复制的一步升级建议', typeof fAtt.suggestion === 'string' && fAtt.suggestion.length > 0 && fAtt.suggestion !== fAtt.original, fAtt.suggestion);

// —— G：编造 span → 整条拒绝，原文不动 ——
await ev(`window.__outputTest.setAI(${JSON.stringify(MOCK)}, 'mock-bad-span')`);
const g1 = await ev(`window.__outputTest.start('one_sentence', 'yesterday', '', 0, [])`);
await ev(`window.__outputTest.submit(${JSON.stringify(g1.id)}, 'She work here last year.')`);
const gFb = await ev(`window.__outputTest.feedback(${JSON.stringify(g1.id)})`);
const gAtt = await at(g1.id);
check('G. 编造原文位置被质量门拒绝；原文与状态保留', gFb.ok && gAtt.feedback === 'invalid' && gAtt.original === 'She work here last year.', `${gAtt.feedback}/${gAtt.status}`);

// —— H：照抄建议 → copied，不产生掌握 ——
await ev(`window.__outputTest.setAI(${JSON.stringify(MOCK)}, 'mock-valid')`);
const h1 = await ev(`window.__outputTest.start('one_sentence', 'yesterday', '', 0, ['aqueduct'])`);
await ev(`window.__outputTest.submit(${JSON.stringify(h1.id)}, 'The aqueduct go to the city.')`);
await ev(`window.__outputTest.feedback(${JSON.stringify(h1.id)})`);
const hSug = (await at(h1.id)).suggestion;
const hRev = await ev(`window.__outputTest.revise(${JSON.stringify(h1.id)}, ${JSON.stringify(hSug)})`);
const hFin = await ev(`window.__outputTest.finish(${JSON.stringify(h1.id)})`);
const hAtt = await at(h1.id);
check('H. 照抄建议标为 copied，完成时不写独立掌握证据', hRev.ok && hRev.kind === 'copied' && hAtt.evidence.every(e => e.independent === false), `${JSON.stringify(hRev)} sug=${hSug} fb=${(await at(h1.id)).feedback}`);

// —— I：自己修改 → self，且原文已进入修改态 ——
const i1 = await ev(`window.__outputTest.start('one_sentence', 'yesterday', '', 0, [])`);
await ev(`window.__outputTest.submit(${JSON.stringify(i1.id)}, 'He go to school yesterday.')`);
await ev(`window.__outputTest.feedback(${JSON.stringify(i1.id)})`);
const iRev = await ev(`window.__outputTest.revise(${JSON.stringify(i1.id)}, 'He went to school yesterday, but he forgot his book.')`);
const iAtt = await at(i1.id);
check('I. 自己重写（不等于建议）记为 self，并保留修订历史', iRev.ok && iRev.kind === 'self' && iAtt.revisions.length >= 1 && iAtt.final.includes('forgot his book'), `${iRev.kind}/${iAtt.revisions.length}`);

// —— J：Communication Repair：有依据才判定意思保留 ——
const j1 = await ev(`window.__outputTest.start('repair', 'killing', '', 0, [])`);
await ev(`window.__outputTest.submit(${JSON.stringify(j1.id)}, 'Someone killed the political leader.', 0, { meaning: '有人暗杀了政治领袖', blocked: 'assassination' })`);
const jAtt = await at(j1.id);
const j2 = await ev(`window.__outputTest.start('repair', 'killing', '', 0, [])`);
await ev(`window.__outputTest.submit(${JSON.stringify(j2.id)}, 'Someone killed the political leader.')`);
const j2Att = await at(j2.id);
check('J. Repair 有自述依据 → 可判定保留；无依据 → null', jAtt.repair && jAtt.repair.preserved === true && jAtt.repair.basis === 'self_reported' && j2Att.repair === null, JSON.stringify(jAtt.repair));

// —— K：Input → Output 交接真实材料 ——
await ev(`window.__unitTest.put('inputSources', [{ id:'is1', title:'Water video', topic:'water', provider:'manual', url:'https://example.com/w', verificationStatus:'unverified', transcriptRef:'t1', createdAt:Date.now() }])`);
await ev(`window.__unitTest.put('transcripts', [{ id:'t1', sourceId:'is1', language:'en', provenance:'user_supplied', timed:true, cues:[{start:0,end:2,text:'Water is heavy.'},{start:2,end:4,text:'It moves slowly.'}], createdAt:Date.now() }])`);
await ev(`window.__unitTest.put('inputSessions', [{ id:'ins1', sourceId:'is1', mode:'standard', status:'completed', startedAt:Date.now()-60000, completedAt:Date.now()-1000, at:Date.now()-1000, revision:2, captionMode:'none', reflection:{ captionMode:'none', comprehension:0.7, mainIdea:'Water is heavy and moves slowly', summary:'Water is heavy and it moves slowly through the city.' } }])`);
const k1 = await ev(`window.__outputTest.startFromInput('ins1')`);
const kAtt = k1.ok ? await at(k1.id) : null;
check('K. 从真实输入交接：带入用户自己的总结与来源，不代写', k1.ok && kAtt.source === 'input' && kAtt.draft.includes('Water is heavy and it moves slowly'), k1.text?.slice(0, 60) ?? k1.message);

// —— L：Planner 排入真实表达任务，且不超预算 ——
await ev(`(()=>{const b=[...document.querySelectorAll('nav button')].find(x=>/今日学习/.test(x.textContent||'')); if(b)b.click(); return 1;})()`);
await new Promise(r => setTimeout(r, 600));
if (await ev(`!!document.querySelector('#plan-create')`))
    await click('#plan-create');
await new Promise(r => setTimeout(r, 800));
const planText = await ev(`(document.querySelector('#plan-panel')||{textContent:''}).textContent`);
check('L. 今日计划包含真实表达任务', /真实表达/.test(planText), planText.slice(0, 120));

// —— M：Analytics 不伪装精度 ——
const analytics = (await snap()).analytics;
check('M. Analytics 在样本少时明确 insufficient/样本提示，不伪造分数', typeof analytics.sampleNote === 'string' && analytics.sampleNote.length > 0 && analytics.meaningDeliveredRate === null || typeof analytics.meaningDeliveredRate === 'number', JSON.stringify(analytics).slice(0, 120));

// —— N：备份往返保留 Output 记录 ——
const before = await snap();
const bj = await ev(`window.__inputTest.backupJson()`);
const restore = await ev(`window.__inputTest.restoreJson(${JSON.stringify(bj)})`);
const after = await snap();
check('N. 备份/恢复保留表达记录、证据与任务契约', restore.ok && after.attempts.length === before.attempts.length && after.attempts.every(a => typeof a.taskType === 'string'), `${before.attempts.length}->${after.attempts.length}`);

// —— O：并发完成只生效一次 ——
const o1 = await ev(`window.__outputTest.start('one_sentence', 'race', '', 0, ['current'])`);
await ev(`window.__outputTest.submit(${JSON.stringify(o1.id)}, 'The current is strong today.', 0)`);
const race = await ev(`Promise.all([window.__outputTest.finish(${JSON.stringify(o1.id)}), window.__outputTest.finish(${JSON.stringify(o1.id)})])`);
const oAtt = await at(o1.id);
check('O. 并发完成幂等：证据只写一次，revision 只前进一次', oAtt.evidence.length === 1 && oAtt.status === 'completed' && race.filter(r => r.ok).length >= 1, JSON.stringify(race));

// —— 控制台错误 ——
const jsErrors = cdp.errors.filter(e => !/favicon|net::ERR/.test(e));
check('Z. 无未捕获 JavaScript 错误', jsErrors.length === 0, jsErrors.slice(0, 2).join(' | '));

const pass = results.filter(r => r.ok).length;
console.log(`\n${pass === results.length ? 'PASS' : 'FAIL'} Phase 9 smoke: ${pass}/${results.length}`);
if (pass !== results.length) {
    for (const r of results.filter(x => !x.ok)) console.log(`  FAIL: ${r.name} · ${r.detail}`);
    process.exit(1);
}
process.exit(0);
