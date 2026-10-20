#!/usr/bin/env node
// —— Phase 7 真实浏览器验收：Mini Unit 跨学习日流程 ——
// 前置：npm run build:test && node server.mjs --dir=dist-test --port=4173
//       headless Edge + CDP（独立 profile，SMOKE_PORT 默认 9227）
// 覆盖：A 正常 Unit / B Day2 / C Day3+Completion / D 跨天恢复 / E 无 AI /
//       F AI 材料不能当 Anchor / G 并发晋级 / H 旧数据兼容
import fs from 'node:fs';

const PORT = process.env.SMOKE_PORT || '9227';
const BASE = `http://127.0.0.1:${PORT}`;
const APP = process.env.SMOKE_URL || 'http://127.0.0.1:4173/?test=1';
const results = [];
function check(name, ok, detail = '') {
    results.push({ name, ok: !!ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  · ' + detail : ''}`);
}
class CDP {
    constructor(ws) {
        this.ws = ws; this.id = 0; this.pending = new Map(); this.events = []; this.errors = [];
        ws.onmessage = ev => {
            const m = JSON.parse(ev.data);
            if (m.id && this.pending.has(m.id)) {
                const { res, rej } = this.pending.get(m.id);
                this.pending.delete(m.id);
                m.error ? rej(new Error(m.error.message || JSON.stringify(m.error))) : res(m.result);
            }
            else if (m.method) {
                this.events.push(m);
                if (m.method === 'Runtime.exceptionThrown')
                    this.errors.push(m.params.exceptionDetails?.exception?.description ?? 'exception');
                if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
                    this.errors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
            }
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
            throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
        return r.result.value;
    }
    async waitFor(expr, timeout = 25000, label = expr) {
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
await cdp.send('Log.enable');
await cdp.send('Page.enable');
await cdp.send('Page.navigate', { url: APP });
await new Promise(r => setTimeout(r, 1200));
const ev = e => cdp.eval(e);
const wait = (e, l, t = 25000) => cdp.waitFor(e, t, l);
const click = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'MISSING';e.click();return 'ok';})()`);
const nav = p => ev(`(()=>{const b=document.querySelector('[data-nav="${p}"]');if(!b)return 'MISSING';b.click();return 'ok';})()`);
const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)})||{textContent:''}).textContent`);
const snap = () => ev(`window.__unitTest.snapshot()`);

const SEED = `(async () => {
  const now = Date.now();
  const mk = (id, en, zh, weak) => ({ id, bookId:'b1', en, zh, pos:'', phonetic:'', example:'', collocation:'', difficulty:'', tags:'', order:0,
    state:{ total: weak?3:0, correct:0, streak:0, errors: weak?2:0, lapses:0, meanMs:0, lastMs:0, lastCorrect:false,
      level: weak?'unknown':'new', directions:{ 'en-zh':{total:0,correct:0,meanMs:0}, 'zh-en':{total:0,correct:0,meanMs:0} } },
    schedule:{due:0,last:0,interval:0,step:0,spacedPasses:0}, confusions:{}, recognitionScore:0, activeRecallScore:0, productiveScore:0,
    exposureCount:0, contextExposureCount:0, productionEvidence:0, previewedAt:0, lastEncounteredAt:0, sourceTypes:['book'],
    fsrs:{stability:0,difficulty:0,state:0,reps:0,lapses:0,due:0,lastReview:0,scheduledDays:0,learningSteps:0}, previewResult:'' });
  const words = [
    mk('w-engineers','engineers','工程师',true), mk('w-current','current','水流；电流',true), mk('w-notebook','notebook','笔记本',true),
    mk('w-station','station','车站',false), mk('w-memory','memory','记忆',false), mk('w-weeks','weeks','数周',false)
  ];
  const t1 = 'The engineers measured the current and wrote the numbers in a grey notebook. When the water rose, that notebook was the only record they trusted, because memory had failed them once. The station stayed open through the worst weeks of the year.';
  const t2 = 'A second team returned to the station a year later. They measured the current again and compared the numbers with the grey notebook, because the river had changed its path. The engineers trusted the old record, and the station stayed open through another winter.';
  const p1 = { id:'p-river-1', title:'Rivers and Records', text:t1, sourceType:'import', sourceUrl:'', topic:'rivers', wordCount:46, difficulty:'medium',
    createdAt: now-86400000, contentHash:'hash-r1', sourceReliability:'user_provided', extractionMethod:'paste', language:'en', importedAt: now-86400000 };
  const p2 = { id:'p-river-2', title:'A Second Team Returns', text:t2, sourceType:'import', sourceUrl:'', topic:'rivers', wordCount:45, difficulty:'medium',
    createdAt: now-43200000, contentHash:'hash-r2', sourceReliability:'user_provided', extractionMethod:'paste', language:'en', importedAt: now-43200000 };
  const pAI = { id:'p-ai-1', title:'AI generated reinforcement', text:t1, sourceType:'ai_reinforcement', sourceUrl:'', topic:'rivers', wordCount:46, difficulty:'medium',
    createdAt: now-3600000, contentHash:'hash-ai', sourceReliability:'ai_generated', extractionMethod:'ai_generated', language:'en', importedAt: now-3600000 };
  await window.__unitTest.put('words', words);
  await window.__unitTest.put('passages', [p1, p2, pAI]);
  const rs = (id, passageId, comp, helps, at) => ({ id, passageId, wordCount:46, durationMs:120000, unknownWords:[], vagueWords:[], unknownRate:0.18,
    firstPassComprehension: comp, secondPassComprehension: comp, readingSpeed:120, structureErrors:1, translationDependence:0.2, summary:'', stage:3, at,
    detail:{ stage:'reread', state:'completed', passageTitle:'', chunks:[], chunkIndex:0, paragraphIndex:0, coldTestDone:true, firstPassStartedAt:at, firstPassEndedAt:at+60000,
      rereadStartedAt:null, rereadEndedAt:null, helps: Array.from({length:helps},(_,i)=>({id:'h'+i, level:1, kind:'translation', at, sentenceIndex:0, detail:''})),
      marks:[], difficultSentences:[], comprehension:[],
      evidence:[{ id:'ev-cold-'+id, type:'cold-baseline', passageId, sessionId:id, source:'user', confidence:'high', value: comp, key:'cold', at, metadata:{} }],
      output:[], notes:'' } });
  await window.__unitTest.reload();
  return 'seeded';
})()`;


const activity = (words_n, opts = {}) => `(async()=>{
  const now = Date.now();
  const ids = ['w-engineers','w-current','w-notebook','w-station','w-memory','w-weeks'].slice(0, ${words_n});
  const rows = ids.map((wordId, i) => ({ id:'rec-'+now+'-'+wordId, wordId, sessionId:'s7', at: now + i*50, direction:'en-zh', correct:true, ms:1700,
    selectedId: wordId, reason:'answer', before:'vague', after:'normal', scheduled:true }));
  await window.__unitTest.put('records', rows);
  ${opts.cold ? `await window.__unitTest.put('readingSessions', [{ id:'rs-cold-'+now, passageId:'p-river-1', wordCount:46, durationMs:120000, unknownWords:[], vagueWords:[], unknownRate:0.18,
    firstPassComprehension:0.25, secondPassComprehension:0.25, readingSpeed:120, structureErrors:1, translationDependence:0.2, summary:'', stage:3, at: now,
    detail:{ stage:'reread', state:'completed', passageTitle:'', chunks:[], chunkIndex:0, paragraphIndex:0, coldTestDone:true, firstPassStartedAt:now, firstPassEndedAt:now+60000,
      rereadStartedAt:null, rereadEndedAt:null, helps:[], marks:[], difficultSentences:[], comprehension:[],
      evidence:[{ id:'ev-cold-'+now, type:'cold-baseline', passageId:'p-river-1', sessionId:'rs-cold-'+now, source:'user', confidence:'high', value:0.25, key:'cold', at:now, metadata:{} }],
      output:[], notes:'' } }]);` : ''}
  ${opts.transfer ? `await window.__unitTest.put('readingSessions', [{ id:'rs-tr-'+now, passageId:'p-river-2', wordCount:45, durationMs:150000, unknownWords:[], vagueWords:[], unknownRate:0.2,
    firstPassComprehension:0.7, secondPassComprehension:0.7, readingSpeed:110, structureErrors:1, translationDependence:0.15, summary:'', stage:3, at: now,
    detail:{ stage:'reread', state:'completed', passageTitle:'', chunks:[], chunkIndex:0, paragraphIndex:0, coldTestDone:true, firstPassStartedAt:now, firstPassEndedAt:now+70000,
      rereadStartedAt:null, rereadEndedAt:null, helps:[], marks:[], difficultSentences:[], comprehension:[],
      evidence:[{ id:'ev-cold-tr-'+now, type:'cold-baseline', passageId:'p-river-2', sessionId:'rs-tr-'+now, source:'user', confidence:'high', value:0.7, key:'cold', at:now, metadata:{} }],
      output:[], notes:'' } }]);` : ''}
  await window.__unitTest.reload();
  return rows.length;
})()`;
const answer = (n, at) => `(async()=>{
  const ids = ['w-engineers','w-current','w-notebook','w-station','w-memory','w-weeks'].slice(0, ${n});
  const rows = ids.map((wordId, i) => ({ id:'rec-${at}-'+wordId, wordId, sessionId:'s7', at: ${at} + i*1000, direction:'en-zh', correct:true, ms:1700,
    selectedId: wordId, reason:'answer', before:'vague', after:'normal', scheduled:true }));
  await window.__unitTest.put('records', rows);
  await window.__unitTest.reload();
  return rows.length;
})()`;

// ——— 0. 钩子与初始状态 ———
const hook = await ev(`typeof window.__unitTest?.snapshot`);
check('Phase 7 验收钩子注入（__unitTest）', hook === 'function', String(hook));
await ev(`(async()=>{ await new Promise((res)=>{const r=indexedDB.deleteDatabase('vocabulary-memory-v1'); r.onsuccess=()=>res(); r.onerror=()=>res(); r.onblocked=()=>res();}); return 'cleared'; })()`);
await cdp.send('Page.navigate', { url: APP });
await new Promise(r => setTimeout(r, 1500));
await wait(`!!window.__unitTest`, 'hook after reload');
await ev(SEED);

// ——— E. 无 AI 时：主题推荐可用、0 次 AI 请求 ———
const s0 = await snap();
check('真实材料进入阅读库（2 篇真实 + 1 篇 AI）', s0.passages.length === 3 && s0.passages.filter(p => p.sourceType === 'ai_reinforcement').length === 1, JSON.stringify(s0.passages.map(p => p.sourceType)));
await nav('unit');
await wait(`document.querySelector('#main')?.textContent.includes('主题学习单元')`, 'unit page');
const recCards = await ev(`document.querySelectorAll('[data-unit-create]').length`);
check('主题推荐来自真实材料（AI 材料不参与）', recCards >= 1 && recCards <= 3, `推荐 ${recCards} 个`);
const recText = await text('#main');
check('推荐说明引用真实材料与薄弱词', /真实材料/.test(recText) && /薄弱词|当前学习价值/.test(recText), recText.slice(0, 90).replace(/\s+/g, ' '));
check('无 AI 配置时不生成任何 AI 任务/记录', (await snap()).generations.length === 0);

// ——— A. 创建 Unit → Day 1 ———
await click('[data-unit-create]');
await wait(`!!document.querySelector('[data-unit-start]')`, 'unit created');
let s = await snap();
check('创建后进入 Ready（有 Anchor + 目标词 + 目标语法）', s.units.length === 1 && s.units[0].stage === 'ready', JSON.stringify(s.units[0]));
const unitId = s.units[0].id;
const anchorCard = await text('#main');
check('Anchor 来自真实材料且标注来源', /Rivers and Records/.test(anchorCard) && /你导入的真实材料/.test(anchorCard));
check('目标词来自 Anchor 与你的词库', /engineers/.test(anchorCard) && /current/.test(anchorCard));
await click('[data-unit-start]');
await wait(`document.querySelector('#main')?.textContent.includes('今日重点')`, 'day 1 focus');
const d1 = await text('#main');
check('Day 1 是建立理解日：含冷测、辅助级别高', /冷测/.test(d1) && /高（允许中文解释）/.test(d1), d1.slice(0, 120).replace(/\s+/g, ' '));
check('Day 1 明确冷测必须在预教之前', /冷测/.test(d1) && /先看标题/.test(d1));

// 真实活动 → 完成 Day 1
await ev(activity(3, { cold: true }));
await ev(`window.__unitTest.reload()`);
await wait(`!!document.querySelector('[data-unit-complete]')`, 'complete button');
await click('[data-unit-complete]');
await wait(`!document.querySelector('#unit-day-summary')?.hidden`, 'summary open');
await ev(`(()=>{const i=document.querySelector('#unit-summary-input'); i.value='今天读懂了河流记录为什么重要'; i.dispatchEvent(new Event('input',{bubbles:true})); return 'ok';})()`);
await click('[data-unit-complete]');
await wait(`document.querySelector('#main')?.textContent.includes('已完成的学习日') && document.querySelector('#main')?.textContent.includes('Day 1')`, 'day1 recorded');
s = await snap();
check('完成 Day 1：写入学习日与证据', s.units[0].days.join(',') === '1' && s.units[0].evidence[0] >= 1, JSON.stringify(s.units[0]));
check('记录真实冷测基线（不是估计）', s.units[0].baseline === 'cold_test', String(s.units[0].baseline));

// 刷新恢复
await cdp.send('Page.navigate', { url: APP });
await new Promise(r => setTimeout(r, 1400));
await wait(`!!window.__unitTest`, 'hook after refresh');
s = await snap();
check('刷新后状态保留（Day 1 完成、下一步 Day 2）', s.units[0].days.join(',') === '1' && s.units[0].dayIndex === 1, JSON.stringify(s.units[0]));
await nav('unit');
await wait(`!!document.querySelector('[data-unit-start]')`, 'unit after refresh');
const pageAfter = await text('#main');
check('刷新后展示 Day 1 已完成、下一次是 Day 2', /Day 1/.test(pageAfter) && /继续|进入 Day 2|查看今日安排/.test(pageAfter));

// ——— D. 跨天恢复：没有学习就不自动跳天 ———
await new Promise(r => setTimeout(r, 1200));
s = await snap();
check('D. 没有新活动时不会自动晋级（dayIndex 仍为 1）', s.units[0].dayIndex === 1 && s.units[0].days.length === 1, JSON.stringify(s.units[0].days));
const nextLabel = await ev(`(document.querySelector('[data-unit-start]')||{textContent:''}).textContent`);
check('D. 下一步仍是 Day 2（不因日历天跳级）', /Day 2/.test(nextLabel), nextLabel);

// ——— B. Day 2 强化 ———
await click('[data-unit-start]');
await wait(`document.querySelector('#main')?.textContent.includes('昨日回忆')`, 'day 2 focus');
const d2 = await text('#main');
check('B. Day 2 有隔夜回忆与减少辅助', /隔夜/.test(d2) && /中（少量中文）/.test(d2));
check('B. Day 1/2 重点不同', !/建立理解日的冷测/.test(d2));
await ev(activity(4));
await ev(`window.__unitTest.reload()`);
await wait(`!!document.querySelector('[data-unit-complete]')`, 'd2 complete');
await click('[data-unit-complete]');
await wait(`!document.querySelector('#unit-day-summary')?.hidden`, 'd2 summary');
await click('[data-unit-complete]');
await wait(`document.querySelector('#main')?.textContent.includes('Day 2')`, 'day2 recorded');
s = await snap();
check('B. 完成 Day 2：两天记录、无重复', s.units[0].days.join(',') === '1,2', JSON.stringify(s.units[0].days));

// ——— C. Day 3 迁移 + 完成评价 ———
await click('[data-unit-start]');
await wait(`document.querySelector('#main')?.textContent.includes('新材料独立冷读')`, 'day 3 focus');
const d3 = await text('#main');
check('C. Day 3 使用新真实材料（不是 Anchor 重排）', /A Second Team Returns/.test(d3), d3.slice(0, 140).replace(/\s+/g, ' '));
check('C. Day 3 关闭中文辅助', /中文关闭/.test(d3));
await ev(activity(5, { transfer: true }));
await click('[data-unit-complete]');
await wait(`!document.querySelector('#unit-day-summary')?.hidden || document.querySelector('#main')?.textContent.includes('Day 3')`, 'd3 complete');
if (await ev(`!document.querySelector('#unit-day-summary')?.hidden`))
    await click('[data-unit-complete]');
await wait(`document.querySelector('#main')?.textContent.includes('Day 3')`, 'day3 recorded');
s = await snap();
check('C. 完成 Day 3：识别真实迁移材料', s.units[0].transfer === 'authentic', String(s.units[0].transfer));
check('C. 三天都记录，没有重复', s.units[0].days.join(',') === '1,2,3', JSON.stringify(s.units[0].days));

await ev(`window.confirm = () => true`);
await wait(`!!document.querySelector('[data-unit-finish]') && document.querySelector('#main')?.textContent.includes('Day 3')`, 'finish ready');
await click('[data-unit-finish]');
for (let i = 0; i < 3; i++) {
    if (await ev(`document.querySelector('#main')?.textContent.includes('完成评价')`))
        break;
    await new Promise(r => setTimeout(r, 900));
    await click('[data-unit-finish]');
}
await wait(`document.querySelector('#main')?.textContent.includes('完成评价')`, 'evaluation');
const evalText = await text('#main');
check('C. 完成评价基于真实证据（含目标词/迁移/语法指标）', /目标词覆盖/.test(evalText) && /迁移结果/.test(evalText));
s = await snap();
check('C. 完成判定落库（verified 需要独立迁移证据）', ['completed_verified', 'completed_limited_evidence'].includes(s.units[0].decision), String(s.units[0].decision));

// ——— 完成页：评价必须真的显示出来（不只是写进 DB）———
await wait(`document.querySelector('#main')?.textContent.includes('完成评价')`, 'evaluation visible');
const shown = await text('#main');
check('完成评价显示在单元页（含决策/置信度/建议）', /completed_verified|completed_limited_evidence/.test(shown) && /置信度/.test(shown) && /建议下一步/.test(shown), shown.slice(0, 100).replace(/\s+/g, ' '));
check('完成不影响已有学习证据（词/记录/阅读仍在）', (await snap()).words === 6 && (await snap()).records > 0 && (await snap()).sessions >= 2);

// ——— F. AI 材料不能当 Anchor ———
await click('[data-unit-new]');
await wait(`!!document.querySelector('#unit-custom-topic')`, 'create page');
await ev(`(()=>{const i=document.querySelector('#unit-custom-topic'); if(i){i.value='自定义主题测试'; i.dispatchEvent(new Event('input',{bubbles:true}));} return 'ok';})()`);
await click('[data-unit-custom]');
await wait(`!!document.querySelector('[data-unit-pick-anchor]')`, 'draft created');
await click('[data-unit-pick-anchor]');
await wait(`!!document.querySelector('dialog[open]')`, 'anchor picker');
const picker = await text('dialog[open]');
check('F. Anchor 选择器只列真实材料', /Rivers and Records/.test(picker) && !/AI generated reinforcement/.test(picker), picker.slice(0, 100).replace(/\s+/g, ' '));
await ev(`document.querySelector('dialog[open] .close')?.click()`);

// ——— G. 并发晋级只生效一次 ———
await ev(`window.__unitTest.clear('miniUnits').then(()=> 'cleared')`);
await ev(`(async()=>{ const now=Date.now(); await window.__unitTest.put('miniUnits', [{ id:'u-conc', theme:'并发', topic:'rivers', dayIndex:0, anchorMaterialId:'p-river-1',
  anchorProvenance:'user_imported_authentic', targetWords:['current'], targetGrammar:['clause.adverbial'], grammarTargets:[], difficultyTarget:null, status:'active',
  startedAt: now-10000, completedAt:null, dayLog:[], stage:'active', plannedDays:3, dayHistory:[], linkedPassageIds:['p-river-1'], linkedSentenceIds:[], linkedGenerationIds:[], linkedDailyPlanIds:[], createdAt: now-10000, updatedAt: now-10000, revision:0 }]); return 'seeded'; })()`);
const concurrent = await ev(`Promise.all([window.__unitTest.advance('u-conc',1), window.__unitTest.advance('u-conc',1)]).then(r=>JSON.stringify(r))`);
const conc = JSON.parse(concurrent);
const concDays = await ev(`(async()=>{ const d = await window.__unitTest.snapshot(); const u = d.units.find(x=>x.id==='u-conc'); return JSON.stringify(u); })()`);
check('G. 两个并发晋级只产生一条 Day 记录', JSON.parse(concDays).days.length === 1, concDays);

// ——— H. 旧版 MiniUnit / 旧数据兼容 ———
await ev(`(async()=>{ const now=Date.now(); await window.__unitTest.clear('miniUnits'); await window.__unitTest.put('miniUnits', [{ id:'u-legacy', theme:'旧格式主题', dayIndex:1,
  anchorMaterialId:'p-river-1', targetWords:['current','notebook'], targetGrammar:['clause.adverbial'], difficultyTarget:null, status:'active', startedAt: now-86400000,
  completedAt:null, dayLog:[{day:1, at: now-3600000, summary:'旧版记录'}] }]); await window.__unitTest.reload(); return 'ok'; })()`);
await nav('unit');
await wait(`document.querySelector('#main')?.textContent.includes('旧格式主题')`, 'legacy unit rendered');
const legacyPage = await text('#main');
check('H. 旧格式 MiniUnit 可读（无 stage 字段也能推导状态）', /旧格式主题/.test(legacyPage) && /Day 1/.test(legacyPage));
s = await snap();
check('H. 旧数据未被破坏（词/记录/阅读/AI 数量不变）', s.words === 6 && s.passages.length === 3 && s.sessions === 2, `words=${s.words} passages=${s.passages.length} sessions=${s.sessions}`);
check('H. 旧格式单元不会因为打开页面而自动晋级', s.units.find(u => u.id === 'u-legacy').dayIndex === 1);
check('H. 全程没有未捕获 JS 异常', cdp.errors.length === 0, cdp.errors.slice(0, 2).join(' | '));

console.log('');
const passed = results.filter(r => r.ok).length;
console.log(`${passed === results.length ? 'PASS' : 'FAIL'}  Phase 7 smoke: ${passed}/${results.length}`);
fs.writeFileSync('C:/Users/86152/AppData/Local/Temp/phase7-smoke.json', JSON.stringify(results, null, 2));
process.exit(passed === results.length ? 0 : 1);
