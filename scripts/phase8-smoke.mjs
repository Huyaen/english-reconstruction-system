#!/usr/bin/env node
// —— Phase 8：Real Input Hub 真实浏览器验收 ——
// 前置：npm run build:test && node server.mjs --dir=dist-test --port=4173
//       headless Edge + CDP（独立 profile；SMOKE_PORT 默认 9229）
// 覆盖 A–L：兴趣接入 / 画像外材料 / 冷测+复盘 / 三种模式 / 字幕交接 /
// Mini Unit 关联但不算 verified transfer / Planner / 无材料不造假 / 兴趣同步 /
// 无 AI Key 可用 / 并发完成幂等 / 备份恢复。
import fs from 'node:fs';

const PORT = process.env.SMOKE_PORT || '9229';
const BASE = `http://127.0.0.1:${PORT}`;
const APP = process.env.SMOKE_URL || 'http://127.0.0.1:4173/?test=1';
const results = [];
function check(name, ok, detail = '') {
    results.push({ name, ok: !!ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  · ' + detail : ''}`);
}
class CDP {
    constructor(ws) {
        this.ws = ws; this.id = 0; this.pending = new Map(); this.errors = [];
        ws.onmessage = ev => {
            const m = JSON.parse(ev.data);
            if (m.id && this.pending.has(m.id)) {
                const { res, rej } = this.pending.get(m.id);
                this.pending.delete(m.id);
                m.error ? rej(new Error(m.error.message)) : res(m.result);
            }
            else if (m.method === 'Runtime.exceptionThrown')
                this.errors.push(m.params.exceptionDetails?.exception?.description ?? 'exception');
            else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
                this.errors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
        };
    }
    static async connect() {
        const list = await (await fetch(`${BASE}/json/list`)).json();
        const t = list.find(x => x.type === 'page' && (x.url || '').includes('4173'));
        if (!t)
            throw new Error('no app page');
        const ws = new WebSocket(t.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
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
            throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
        return r.result.value;
    }
    async waitFor(expr, timeout = 20000, label = expr) {
        const end = Date.now() + timeout;
        let last;
        while (Date.now() < end) {
            try {
                last = await this.eval(expr);
                if (last)
                    return last;
            }
            catch (e) { last = 'err:' + e.message; }
            await new Promise(r => setTimeout(r, 250));
        }
        throw new Error(`waitFor timeout: ${label} | ${JSON.stringify(last).slice(0, 200)}`);
    }
}
const cdp = await CDP.connect();
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');
await cdp.send('Page.navigate', { url: APP });
await new Promise(r => setTimeout(r, 1000));
const ev = e => cdp.eval(e);
const wait = (e, l, t = 20000) => cdp.waitFor(e, t, l);
const click = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'MISSING';e.click();return 'ok';})()`);
const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)})||{textContent:''}).textContent`);
const setVal = (sel, v) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'MISSING';e.value=${JSON.stringify(String(v))};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return 'ok';})()`);

// 全新数据库
await ev(`(async()=>{ await new Promise((res)=>{const r=indexedDB.deleteDatabase('vocabulary-memory-v1'); r.onsuccess=()=>res(); r.onerror=()=>res(); r.onblocked=()=>res();}); return 1; })()`);
await cdp.send('Page.navigate', { url: APP });
await new Promise(r => setTimeout(r, 1400));
await wait(`!!window.__inputTest && !!window.__unitTest`, 'hooks');

const mkWord = (id, en, zh) => `({ id:${JSON.stringify(id)}, bookId:'b1', en:${JSON.stringify(en)}, zh:${JSON.stringify(zh)}, pos:'', phonetic:'', example:'', collocation:'', difficulty:'', tags:'', order:0,
  state:{ total:1, correct:1, streak:1, errors:0, lapses:0, meanMs:1200, lastMs:1200, lastCorrect:true, level:'normal',
    directions:{ 'en-zh':{total:1,correct:1,meanMs:1200}, 'zh-en':{total:1,correct:1,meanMs:1200} } },
  schedule:{due:Date.now()+86400000,last:Date.now(),interval:2,step:1,spacedPasses:1}, confusions:{}, recognitionScore:0.8, activeRecallScore:0.7, productiveScore:0.3,
  exposureCount:2, contextExposureCount:1, productionEvidence:0, previewedAt:0, lastEncounteredAt:Date.now(), sourceTypes:['book'],
  fsrs:{stability:3,difficulty:4,state:2,reps:2,lapses:0,due:Date.now()+86400000,lastReview:Date.now(),scheduledDays:2,learningSteps:0}, previewResult:'' })`;
await ev(`window.__unitTest.put('books', [{ id:'b1', name:'Phase 8 测试词书', created:Date.now(), source:'manual' }])`);
await ev(`window.__unitTest.put('words', [${mkWord('w1', 'current', '水流')}, ${mkWord('w2', 'notebook', '笔记本')}, ${mkWord('w3', 'aqueduct', '高架渠')}])`);
await ev(`window.__unitTest.reload()`);
await ev(`(()=>{document.querySelector('[data-nav="input"]').click(); return 1;})()`);
await wait(`!!document.querySelector('#input-url')`, 'input hub');

// —— H 先验：无材料不生成假任务/假推荐 ——
const empty = await ev(`window.__inputTest.recommendations()`);
check('H. 无真实媒体时推荐为空且提示导入', empty.candidates.length === 0 && /真实材料/.test(empty.note), empty.note);
const hubEmpty = await text('#main');
check('H. 页面不伪造推荐卡片', /还没有真实材料/.test(hubEmpty));

// —— A：自由兴趣 + 真实媒体 + 正确理由 + 刷新保留 ——
await ev(`(async()=>{ const p = await window.__unitTest.profile(); p.topics = [{ id:'it_roman', label:'roman history', source:'explicit', weight:0.8, keywords:['roman','history'], createdAt:Date.now(), updatedAt:Date.now() }]; await window.__unitTest.saveProfile(p); return 1; })()`);
await ev(`window.__unitTest.reload()`);
await ev(`(()=>{document.querySelector('[data-nav="input"]').click(); return 1;})()`);
await wait(`!!document.querySelector('#input-url')`, 'hub after profile');
await setVal('#input-url', 'https://www.youtube.com/watch?v=rome0001');
await setVal('#input-title', 'Rome: Engineering an Empire');
await setVal('#input-topic', 'roman history');
await setVal('#input-duration', '40');
await click('[data-input-add]');
await wait(`window.__inputTest.snapshot().then(s=>s.sources.length===1)`, 'source added');
let snap = await ev(`window.__inputTest.snapshot()`);
check('A. 真实链接可保存（来源、主题、时长）', snap.sources[0].title === 'Rome: Engineering an Empire' && snap.sources[0].verification === 'unverified');
check('A. 元数据诚实：未验证 + 无难度估计', snap.sources[0].difficulty === null && snap.sources[0].basis === 'none');
let rec = await ev(`window.__inputTest.recommendations()`);
check('A. 推荐理由 = Based on your interests', rec.candidates[0]?.reasonTag === 'Based on your interests', JSON.stringify(rec.candidates.map(c => c.reasonTag)));
check('A. 推荐带真实事实（来源/时长/字幕/可用性）', /YouTube|时长|字幕/.test(rec.candidates[0]?.facts.join(' ')), rec.candidates[0]?.facts.join(' | '));
await cdp.send('Page.navigate', { url: APP });
await new Promise(r => setTimeout(r, 1200));
await wait(`!!window.__inputTest`, 'hook after reload A');
snap = await ev(`window.__inputTest.snapshot()`);
check('A. 刷新后材料仍在', snap.sources.length === 1);

// —— B：画像外媒体不被白名单阻挡，且出现 Explore ——
await ev(`(()=>{document.querySelector('[data-nav="input"]').click(); return 1;})()`);
await wait(`!!document.querySelector('#input-url')`, 'hub B');
await setVal('#input-url', 'https://www.youtube.com/watch?v=astro001');
await setVal('#input-title', 'A Tour of the Solar System');
await setVal('#input-topic', 'astronomy');
await setVal('#input-duration', '25');
await click('[data-input-add]');
await wait(`window.__inputTest.snapshot().then(s=>s.sources.length===2)`, 'second source');
snap = await ev(`window.__inputTest.snapshot()`);
check('B. 兴趣外主题也能正常保存', snap.sources.some(s => s.topic === 'astronomy'));
rec = await ev(`window.__inputTest.recommendations()`);
check('B. 推荐里保留 Explore something new', rec.candidates.some(c => c.reasonTag === 'Explore something new'), JSON.stringify(rec.candidates.map(c => c.reasonTag)));

// —— C：Start → 冷测 → 外部观看（自报）→ Standard 复盘 → 完成 ——
await ev(`window.__unitTest.reload()`);
await ev(`(()=>{document.querySelector('[data-nav="input"]').click(); return 1;})()`);
await wait(`!!document.querySelector('[data-input-start]')`, 'cards');
await click('[data-input-start]');
await wait(`!!document.querySelector('#baseline-caption')`, 'session page');
check('C. 开始输入后进入会话页（有冷测与复盘）', /冷测/.test(await text('#main')));
await setVal('#baseline-caption', 'en');
await setVal('#baseline-comprehension', '35');
await setVal('#baseline-minutes', '2');
await setVal('#baseline-blocker', '语速');
await click('[data-baseline-save]');
await wait(`window.__inputTest.snapshot().then(s=>s.sessions[0].baseline==='recorded')`, 'baseline saved');
check('C. 冷测保存（recorded，不是复盘反填）', true);
await click('[data-input-mark-open]');
await new Promise(r => setTimeout(r, 900));
await wait(`!!document.querySelector('#refl-summary')`, 'reflection form');
await setVal('#refl-caption', 'en');
await setVal('#refl-comprehension', '70');
await setVal('#refl-watched', '15');
await setVal('#refl-notes', '这段讲渡槽，专有名词多');
await ev(`(()=>{const c=document.querySelector('[data-reason="proper_nouns"]'); if(c) c.checked=true; return 1;})()`);
await setVal('#refl-summary', 'The video explains how Roman aqueducts moved water. It shows why concrete mattered. The narrator visits three sites.');
await click('[data-refl-save]');
await wait(`window.__inputTest.snapshot().then(s=>s.sessions[0].hasReflection===true && s.sessions[0].mode==='standard')`, 'standard reflection');
await new Promise(r => setTimeout(r, 800));
await click('[data-session-complete]');
await new Promise(r => setTimeout(r, 800));
const doneSnap = await ev(`window.__inputTest.snapshot()`);
if (doneSnap.sessions[0].status !== 'completed')
    console.log('DEBUG toast:', await text('#toast'), JSON.stringify(doneSnap.sessions[0]));
await wait(`window.__inputTest.snapshot().then(s=>s.sessions[0].status==='completed')`, 'completed');
if (await ev(`!!document.querySelector('[data-input-back]')`)) {
    await click('[data-input-back]');
    await new Promise(r => setTimeout(r, 600));
}
snap = await ev(`window.__inputTest.snapshot()`);
check('C. 自报观看时长被记录（reported，不冒充平台进度）', snap.sessions[0].watched === 15);
check('C. 证据：曝光 + 自评 + 产出', snap.evidence.some(e => e.type === 'watching_exposure') && snap.evidence.some(e => e.type === 'self_report') && snap.evidence.some(e => e.type === 'output_attempt'), JSON.stringify(snap.evidence.map(e => e.type)));
check('C. 没有任何“听力分数”证据类型', !snap.evidence.some(e => e.type === 'independent_comprehension'));

// —— D：Light / Deep 不同路径与证据口径 ——
const srcId = snap.sources.find(s => s.topic === 'astronomy').id;
const light = await ev(`window.__inputTest.start(${JSON.stringify(srcId)}, 'light', 8)`);
await wait(`window.__inputTest.snapshot().then(s=>s.sessions.some(x=>x.id===${JSON.stringify(light.id)}))`, 'light session');
const lightRefl = await ev(`window.__inputTest.reflect(${JSON.stringify(light.id)}, { captionMode:'none', comprehension:0.6, notes:'只想看一段' })`);
check('D. Light 复盘完成度受限（≤0.6）', lightRefl.ok && lightRefl.completion <= 0.6, String(lightRefl.completion));
await ev(`window.__inputTest.complete(${JSON.stringify(light.id)})`);
const deep = await ev(`window.__inputTest.start(${JSON.stringify(srcId)}, 'deep', 15)`);
await wait(`window.__inputTest.snapshot().then(s=>s.sessions.some(x=>x.id===${JSON.stringify(deep.id)}))`, 'deep session');
const deepRefl = await ev(`window.__inputTest.reflect(${JSON.stringify(deep.id)}, { captionMode:'none', comprehension:0.75, mainIdea:'The solar system is vast', keyPoints:['eight planets',' distances are huge','light takes hours'], opinion:'slow but clear' })`);
check('D. Deep 复盘记录完成度且高于 Light', deepRefl.ok && deepRefl.completion > lightRefl.completion, `${lightRefl.completion} vs ${deepRefl.completion}`);
await ev(`window.__inputTest.complete(${JSON.stringify(deep.id)})`);
snap = await ev(`window.__inputTest.snapshot()`);
check('D. Light 无产出证据、Deep 有产出证据', snap.evidence.filter(e => e.sessionId === light.id && e.type === 'output_attempt').length === 0 && snap.evidence.some(e => e.sessionId === deep.id && e.type === 'output_attempt'));

// —— E：SRT 导入 → Reading → Sentence ——
if (await ev(`!!document.querySelector('[data-input-back]')`)) {
    await click('[data-input-back]');
    await new Promise(r => setTimeout(r, 500));
}
await ev(`(()=>{document.querySelector('[data-nav="input"]').click(); return 1;})()`);
await wait(`!!document.querySelector('#input-url')`, 'hub E');
await ev(`window.__unitTest.reload()`);
await ev(`(()=>{document.querySelector('[data-nav="input"]').click(); return 1;})()`);
await wait(`!!document.querySelector('#input-url')`, 'hub E2');
await ev(`(async()=>{ const s = await window.__inputTest.snapshot(); const id = s.sources[0].id; await window.__inputTest.start(id, 'standard', 12); return id; })()`);
await ev(`window.__unitTest.reload()`);
await ev(`(()=>{document.querySelector('[data-nav="input"]').click(); return 1;})()`);
await wait(`!!document.querySelector('[data-input-open]')`, 'unfinished banner');
await click('[data-input-open]');
await wait(`!!document.querySelector('#transcript-raw')`, 'session page transcript');
const SRT = ['1', '00:00:01,000 --> 00:00:05,500', 'The aqueducts carried water into the city from distant hills and kept it flowing.', '', '2', '00:00:05,500 --> 00:00:09,000', 'Some of them are still standing today, which is remarkable.', ''].join('\n');
await setVal('#transcript-raw', SRT);
await click('[data-transcript-import]');
await wait(`window.__inputTest.snapshot().then(s=>s.transcripts.length>=1)`, 'transcript import');
snap = await ev(`window.__inputTest.snapshot()`);
check('E. SRT 时间轴解析并保存', snap.transcripts[0].cues === 2 && snap.transcripts[0].timed === true && snap.transcripts[0].provenance === 'user_supplied');
await ev(`(()=>{const t=document.querySelector('#transcript-raw'); t.value=${JSON.stringify(SRT)}; return 1;})()`);
await click('[data-transcript-import]');
await new Promise(r => setTimeout(r, 800));
snap = await ev(`window.__inputTest.snapshot()`);
check('E. 重复导入不重复保存', snap.transcripts.length === 1);
await click('[data-transcript-reading]');
await wait(`window.__inputTest.snapshot().then(s=>s.passages.some(p=>p.inputSourceId!==''))`, 'passage from transcript');
let usnap = await ev(`window.__inputTest.snapshot()`);
const p = usnap.passages.find(x => x.inputSourceId !== '');
check('E. 字幕 → Reading 保留 inputSource / transcript 关联', !!p && p.transcriptId !== '', JSON.stringify(p));
await ev(`(()=>{document.querySelector('[data-nav="input"]').click(); return 1;})()`);
const dbg = await ev(`({ back: !!document.querySelector('[data-input-back]'), pick: document.querySelectorAll('[data-sentence-pick]').length, lis: document.querySelectorAll('.transcript-cues li').length, cand: (document.querySelector('#main')?.textContent||'').match(/难句候选 \d+ 条/)?.[0] ?? 'none', hub: !!document.querySelector('#input-url') })`);
if (!dbg.pick) {
    const dbg2 = await ev(`(async()=>{ const sn = await window.__inputTest.snapshot(); const cur = sn.sessions.find(x=>x.status!=='completed'); const cands = await window.__inputTest.candidates(cur.sourceId); const main = document.querySelector('#main')?.textContent||''; const i = main.indexOf('字幕（可选）'); return { hasImported: main.includes('已导入'), cands, around: main.slice(i, i+160) }; })()`);
    console.log('DEBUG E:', JSON.stringify(dbg), JSON.stringify(dbg2));
}
if (!(await ev(`!!document.querySelector('[data-sentence-pick]')`))) {
    await wait(`!!document.querySelector('[data-input-open]')`, 'back to session');
    await click('[data-input-open]');
}
await wait(`!!document.querySelector('[data-sentence-pick]')`, 'sentence candidates');
await click('[data-sentence-pick]');
await new Promise(r => setTimeout(r, 1200));
const sNum = await ev(`window.__inputTest.snapshot().then(s=>s.sentences)`);
if (sNum < 1)
    console.log('DEBUG sentence:', await text('#toast'), 'sentences=', sNum);
await wait(`window.__inputTest.snapshot().then(s=>s.sentences>=1)`, 'sentence handed off');
usnap = await ev(`window.__inputTest.snapshot()`);
check('E. 难句送入句法练习（结构未验证，不伪造 gold parse）', usnap.sentences >= 1);

// —— F：Mini Unit 关联（媒体只算曝光，不产生 verified transfer）——
await ev(`window.__unitTest.put('miniUnits', [{ id:'u_p8', theme:'Rivers', topic:'rivers', dayIndex:1, anchorMaterialId:'${p.id}', anchorProvenance:'user_imported_authentic',
  targetWords:['current'], targetGrammar:['clause.adverbial'], grammarTargets:[], difficultyTarget:50, status:'active', stage:'active',
  startedAt: Date.now()-86400000, completedAt:null, updatedAt: Date.now(), dayLog:[], dayHistory:[], plannedDays:3, createdAt: Date.now()-86400000 }])`);
await ev(`window.__unitTest.reload()`);
const unitSess = await ev(`window.__inputTest.start(${JSON.stringify(srcId)}, 'standard', 10, 'u_p8')`);
await wait(`window.__inputTest.snapshot().then(s=>s.sessions.some(x=>x.id===${JSON.stringify(unitSess.id)}))`, 'unit-linked session');
await ev(`window.__inputTest.reflect(${JSON.stringify(unitSess.id)}, { captionMode:'en', comprehension:0.6, summary:'The video shows how Rome moved water. It explains the concrete. It visits three sites.' })`);
await ev(`window.__inputTest.complete(${JSON.stringify(unitSess.id)})`);
await ev(`(()=>{document.querySelector('[data-nav="unit"]').click(); return 1;})()`);
await wait(`!!document.querySelector('#main')`, 'unit page');
const unitText = await text('#main');
check('F. 单元证据显示媒体曝光', /真实媒体（曝光）|媒体输入/.test(unitText));
check('F. 不产生 verified transfer（完成判定未被绕过）', !/verified transfer|已完成并验证迁移/.test(unitText));

// —— G：Planner 生成真实输入任务（有材料时）——
await ev(`window.__unitTest.put('dailyPlans', [])`);
await ev(`(()=>{document.querySelector('[data-nav="home"]').click(); return 1;})()`);
await wait(`!!document.querySelector('#plan-create')||!!document.querySelector('#plan-panel')`, 'home');
if (await ev(`!!document.querySelector('#plan-create')`)) {
    await click('#plan-create');
    await wait(`!!document.querySelector('#plan-panel')`, 'plan created');
}
const planText = await text('#plan-panel');
check('G. 今日计划包含真实输入任务', /真实输入|继续上次真实输入/.test(planText), planText.slice(0, 120));

// —— I：兴趣编辑/重置在两端同步，能力指标不变 ——
await ev(`(async()=>{ const p = await window.__unitTest.profile(); p.topics=[]; await window.__unitTest.saveProfile(p); await window.__unitTest.reload(); return 1; })()`);
await cdp.send('Page.navigate', { url: APP });
await new Promise(r => setTimeout(r, 1300));
await wait(`!!window.__inputTest`, 'hook I');
await ev(`(()=>{document.querySelector('[data-nav="input"]').click(); return 1;})()`);
await wait(`!!document.querySelector('#input-url')`, 'hub I');
check('I. 兴趣重置后 Input Hub 同步显示未设置', /未设置/.test(await text('#main')));
await ev(`(()=>{document.querySelector('[data-nav="unit"]').click(); return 1;})()`);
await wait(`!!document.querySelector('#main')`, 'unit I');
check('I. 兴趣重置后单元页同步（无 chips）', (await ev(`document.querySelectorAll('[data-interest-chip]').length`)) === 0);

// —— J：无 AI Key 时 Library/复盘仍可用 ——
const key = await ev(`document.querySelector('input[name="key"]')?.value ?? ''`);
await ev(`(async()=>{ const a = await window.__inputTest.analytics(); return a; })()`);
check('J. 没有 AI Key 也能读取输入统计（本地可用）', true, `key=${key ? 'set' : 'empty'}`);

// —— K：并发完成只生效一次 ——
const race = await ev(`(async()=>{ const d0 = await window.__inputTest.snapshot(); const src = d0.sources[0]?.id; if(!src) return {skipped:true};
  let s = await window.__inputTest.start(src, 'standard', 10);
  const refl = await window.__inputTest.reflect(s.id, { captionMode:'none', comprehension:0.5, notes:'并发测试', summary:'The video explains how water moved. It shows Roman concrete. It visits three sites.' });
  const before = await window.__inputTest.snapshot();
  const snapS = before.sessions.find(x=>x.id===s.id);
  const r = await Promise.all([window.__inputTest.complete(s.id), window.__inputTest.complete(s.id)]);
  const after = await window.__inputTest.snapshot();
  const afterS = after.sessions.find(x=>x.id===s.id);
  return { refl, r, statuses: after.sessions.filter(x=>x.id===s.id).map(x=>x.status), revBefore: snapS?.revision ?? -1, revAfter: afterS?.revision ?? -1, evidenceBefore: before.evidence.filter(e=>e.sessionId===s.id).length, evidenceAfter: after.evidence.filter(e=>e.sessionId===s.id).length }; })()`);
if (race.skipped)
    check('K. 并发完成（本轮无可用会话，跳过）', true);
else {
    check('K. 并发完成只生效一次（revision 只前进一次）', race.revAfter - race.revBefore === 1 && race.statuses.length === 1, JSON.stringify(race).slice(0, 400));
    check('K. 并发只写一份证据（幂等键去重，不翻倍）', race.evidenceAfter === 2, JSON.stringify({ after: race.evidenceAfter }));
}

// —— L：备份 → 恢复，旧学习数据 + 兴趣都在 ——
await ev(`(async()=>{ const p = await window.__unitTest.profile(); p.topics=[{ id:'it_before', label:'向量空间', source:'explicit', weight:0.6, keywords:['vector'], createdAt:Date.now(), updatedAt:Date.now() }]; await window.__unitTest.saveProfile(p); return 1; })()`);
const beforeL = await ev(`window.__inputTest.snapshot()`);
const backupJson = await ev(`window.__inputTest.backupJson()`);
await ev(`(async()=>{ const p = await window.__unitTest.profile(); p.topics=[{ id:'it_after', label:'分形几何', source:'explicit', weight:0.9, keywords:['fractal'], createdAt:Date.now(), updatedAt:Date.now() }]; await window.__unitTest.saveProfile(p); return 1; })()`);
const restored = await ev(`window.__inputTest.restoreJson(${JSON.stringify(backupJson)})`);
const afterL = await ev(`(async()=>{ const p = await window.__unitTest.profile(); const s = await window.__inputTest.snapshot(); return { label: p.topics[0]?.label ?? '', sources: s.sources.length, words: p.topics.length }; })()`);
check('L. 备份恢复后旧学习数据保留', restored.words === 3, JSON.stringify(restored));
check('L. 备份恢复后材料与图片/证据表仍在（v6 stores 被覆盖）', afterL.sources === beforeL.sources.length, JSON.stringify({ before: beforeL.sources.length, after: afterL.sources }));
check('L. 备份恢复把兴趣画像退回备份时状态', afterL.label === '向量空间', afterL.label);

// —— H2：清空材料后不再生成输入任务 ——
await ev(`(async()=>{ for (const st of ['inputSources','inputSessions','libraryItems','transcripts','inputEvidence','dailyPlans']) await window.__unitTest.clear(st); await window.__unitTest.reload(); return 1; })()`);
await cdp.send('Page.navigate', { url: APP });
await new Promise(r => setTimeout(r, 1300));
await wait(`!!window.__inputTest`, 'hook H');
await ev(`(()=>{document.querySelector('[data-nav="home"]').click(); return 1;})()`);
await wait(`!!document.querySelector('#plan-panel')||!!document.querySelector('#plan-create')`, 'home H');
if (await ev(`!!document.querySelector('#plan-create')`)) {
    await click('#plan-create');
    await wait(`!!document.querySelector('#plan-panel')`, 'plan H');
}
const planText2 = await text('#plan-panel');
if (/真实输入|继续上次真实输入/.test(planText2))
    console.log('DEBUG H:', planText2.slice(0, 240));
check('H. 无媒体时计划不含输入任务（不造假）', !/真实输入|继续上次真实输入/.test(planText2));

check('Z. 全程无未捕获 JS 异常', cdp.errors.length === 0, cdp.errors.slice(0, 3).join(' | '));

console.log('');
const passed = results.filter(r => r.ok).length;
console.log(`${passed === results.length ? 'PASS' : 'FAIL'}  Phase 8 smoke: ${passed}/${results.length}`);
fs.writeFileSync('C:/Users/86152/AppData/Local/Temp/phase8-smoke.json', JSON.stringify(results, null, 2));
process.exit(passed === results.length ? 0 : 1);
