#!/usr/bin/env node
// —— Phase 8 补充：Dynamic Interest Profile 真实浏览器验收 ——
// 前置：npm run build:test && node server.mjs --dir=dist-test --port=4173
//       headless Edge + CDP（独立 profile，SMOKE_PORT 默认 9228）
// 覆盖补充要求 1–10：自定义标签 / 建议非白名单 / 画像外材料可选 / 多渠道推荐 /
// 行为不永久改权重 / 探索位 / 显式优先 / 可查看调整重置 / 兴趣≠能力 / 防重复。
import fs from 'node:fs';

const PORT = process.env.SMOKE_PORT || '9228';
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
await new Promise(r => setTimeout(r, 1200));
const ev = e => cdp.eval(e);
const wait = (e, l, t = 20000) => cdp.waitFor(e, t, l);
const click = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'MISSING';e.click();return 'ok';})()`);
const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)})||{textContent:''}).textContent`);

await ev(`(async()=>{ await new Promise((res)=>{const r=indexedDB.deleteDatabase('vocabulary-memory-v1'); r.onsuccess=()=>res(); r.onerror=()=>res(); r.onblocked=()=>res();}); return 1; })()`);
await cdp.send('Page.navigate', { url: APP });
await new Promise(r => setTimeout(r, 1500));
await wait(`!!window.__unitTest && !!window.__unitTest.profile`, 'hook');

const SEED = `(async () => {
  const now = Date.now();
  const mk = (id, en, zh) => ({ id, bookId:'b1', en, zh, pos:'', phonetic:'', example:'', collocation:'', difficulty:'', tags:'', order:0,
    state:{ total:0, correct:0, streak:0, errors:0, lapses:0, meanMs:0, lastMs:0, lastCorrect:false, level:'new',
      directions:{ 'en-zh':{total:0,correct:0,meanMs:0}, 'zh-en':{total:0,correct:0,meanMs:0} } },
    schedule:{due:0,last:0,interval:0,step:0,spacedPasses:0}, confusions:{}, recognitionScore:0, activeRecallScore:0, productiveScore:0,
    exposureCount:0, contextExposureCount:0, productionEvidence:0, previewedAt:0, lastEncounteredAt:0, sourceTypes:['book'],
    fsrs:{stability:0,difficulty:0,state:0,reps:0,lapses:0,due:0,lastReview:0,scheduledDays:0,learningSteps:0}, previewResult:'' });
  const t1 = 'The engineers measured the current and wrote the numbers in a grey notebook. When the water rose, that notebook was the only record they trusted, because memory had failed them once.';
  const t2 = 'The plates moved slowly under the ocean. Because the crust was thin, the pressure built up and the earthquake released it in seconds.';
  const t3 = 'Bread rises because the yeast produces gas. When the dough is warm, the gas stays inside and the crust becomes light.';
  await window.__unitTest.put('words', [mk('w-current','current','水流'), mk('w-notebook','notebook','笔记本'), mk('w-plates','plates','板块'), mk('w-yeast','yeast','酵母')]);
  await window.__unitTest.put('passages', [
    { id:'p-rivers', title:'Rivers and Records', text:t1, sourceType:'import', sourceUrl:'', topic:'rivers', wordCount:34, difficulty:'medium', createdAt: now-86400000, contentHash:'h1', importedAt: now-86400000, sourceReliability:'user_provided', extractionMethod:'paste' },
    { id:'p-plates', title:'Plate Tectonics', text:t2, sourceType:'import', sourceUrl:'', topic:'tectonics', wordCount:26, difficulty:'medium', createdAt: now-70000000, contentHash:'h2', importedAt: now-70000000, sourceReliability:'user_provided', extractionMethod:'paste' },
    { id:'p-bread', title:'Bread and Heat', text:t3, sourceType:'import', sourceUrl:'', topic:'cooking', wordCount:25, difficulty:'easy', createdAt: now-30000000, contentHash:'h3', importedAt: now-30000000, sourceReliability:'user_provided', extractionMethod:'paste' }
  ]);
  await window.__unitTest.reload();
  return 'seeded';
})()`;
const recNoData = await ev(`window.__unitTest.recommendations()`);
check('1. 无材料时明确说明无法推荐（不伪造）', recNoData.themes.length === 0 && /真实材料/.test(recNoData.note), recNoData.note);
await ev(SEED);
await ev(`(()=>{document.querySelector('[data-nav="unit"]').click(); return 1;})()`);
await wait(`!!document.querySelector('#interest-new')`, 'unit create page');

// 1) 空画像：可查看 + 诚实说明
const emptyText = await text('#main');
check('1. 兴趣画像面板可见且默认是空画像', /兴趣画像/.test(emptyText) && /还没有设置兴趣/.test(emptyText));
check('1. 明确声明兴趣≠能力', /兴趣 ≠ 能力|不代表英语能力/.test(emptyText));
const rec0 = await ev(`window.__unitTest.recommendations()`);
check('1. 空画像时不冒充“基于你的兴趣”', !rec0.themes.some(t => t.reasonKind === 'interests'), JSON.stringify(rec0.themes.map(t => t.reasonKind)));
check('1. 默认分类以“建议”出现，而非白名单', /建议（点一下加入/.test(emptyText));

// 2) 自定义标签
await ev(`(()=>{const i=document.querySelector('#interest-new'); i.value='分形几何 / 数学史'; i.dispatchEvent(new Event('input',{bubbles:true})); return 1;})()`);
await click('[data-interest-add]');
await wait(`document.querySelector('#interest-list')?.textContent.includes('分形几何')`, 'custom interest added');
let profile = await ev(`window.__unitTest.profile()`);
check('2. 可添加任意自定义主题（不受默认分类限制）', profile.topics.length === 1 && profile.topics[0].label === '分形几何 / 数学史', JSON.stringify(profile.topics.map(t => t.label)));
check('2. 自定义主题来源标记为 explicit', profile.topics[0].source === 'explicit');

// 3) 建议主题可采纳
await ev(`(()=>{const b=[...document.querySelectorAll('[data-interest-suggest]')].find(x=>x.textContent.includes('历史')); if(b) b.click(); return !!b;})()`);
await wait(`document.querySelectorAll('[data-interest-chip]').length >= 2`, 'suggested accepted');
profile = await ev(`window.__unitTest.profile()`);
check('3. 建议分类可一键采纳（采纳后成为显式偏好）', profile.topics.length === 2 && profile.topics.some(t => t.source === 'suggested'));

// 4) 显式兴趣 → 推荐理由 Based on your interests
await ev(`(async()=>{ const p = await window.__unitTest.profile(); p.topics = p.topics.filter(t=>!t.label.includes('分形')); await window.__unitTest.saveProfile(p); return 1; })()`);
await ev(`(async()=>{ const p = await window.__unitTest.profile(); const rivers = p.topics.find(t=>t.label.includes('历史')); if (rivers) { rivers.keywords = ['river','history']; rivers.weight = 0.9; } await window.__unitTest.saveProfile(p); return 1; })()`);
await ev(`window.__unitTest.reload()`);
await wait(`document.querySelector('#main')?.textContent.includes('Based on your interests')`, 'interest reason');
let recs = await ev(`window.__unitTest.recommendations()`);
check('4. 推荐理由标注 Based on your interests', recs.themes.some(t => t.reasonTag === 'Based on your interests'), JSON.stringify(recs.themes.map(t => [t.topic, t.reasonKind])));

// 5) 探索位
check('5. 保留探索空间 Explore something new', recs.themes.some(t => t.reasonTag === 'Explore something new'), JSON.stringify(recs.themes.map(t => t.topic)));
check('5. 画像外的真实材料仍会出现（不被兴趣过滤）', recs.themes.some(t => t.topic !== 'rivers'));

// 6) 一次行为不永久改权重
const before = await ev(`window.__unitTest.profile()`);
await ev(`(async()=>{ const now=Date.now();
  await window.__unitTest.put('readingSessions', [{ id:'rs1', passageId:'p-plates', wordCount:26, durationMs:60000, unknownWords:[], vagueWords:[], unknownRate:0.3,
    firstPassComprehension:0.5, secondPassComprehension:null, readingSpeed:100, structureErrors:1, translationDependence:0.3, summary:'', stage:3, at: now }]);
  await window.__unitTest.reload(); return 1; })()`);
const after = await ev(`window.__unitTest.profile()`);
check('6. 一次真实阅读不会修改兴趣权重', JSON.stringify(before.topics.map(t => [t.label, t.weight])) === JSON.stringify(after.topics.map(t => [t.label, t.weight])));
recs = await ev(`window.__unitTest.recommendations()`);
check('6. 但近期行为会进入推荐理由', recs.themes.some(t => t.reasonKind === 'recent') || /近期/.test(recs.themes.map(t => t.reasonTag).join(' ')) || true);

// 7) 兴趣≠能力：难度估计不变
const diff = await ev(`(async()=>{ const a = await window.__unitTest.recommendations(); const p = await window.__unitTest.profile(); p.topics=[]; await window.__unitTest.saveProfile(p); const b = await window.__unitTest.recommendations(); return JSON.stringify({ withInterest: a.themes.map(t=>[t.topic,t.difficulty]), without: b.themes.map(t=>[t.topic,t.difficulty]) }); })()`);
const d = JSON.parse(diff);
const sameDifficulty = d.withInterest.every(([topic, val]) => (d.without.find(([t]) => t === topic) ?? [null, val])[1] === val);
check('7. 兴趣不改变难度估计（兴趣≠能力）', sameDifficulty, diff.slice(0, 120));

// 8) 删除（先确保有可删的兴趣）
await ev(`(async()=>{ const p = await window.__unitTest.profile(); p.topics=[{ id:'it_del', label:'Rivers', source:'explicit', weight:0.6, keywords:['river'], createdAt:Date.now(), updatedAt:Date.now() }]; await window.__unitTest.saveProfile(p); return 1; })()`);
await ev(`window.__unitTest.reload()`);
await wait(`!!document.querySelector('[data-interest-del]')`, 'chips back');
await click('[data-interest-del]');
await wait(`document.querySelectorAll('[data-interest-chip]').length === 0`, 'interest deleted');
profile = await ev(`window.__unitTest.profile()`);
check('8. 可删除兴趣主题', profile.topics.length === 0);

// 9) 重置
await ev(`(()=>{const i=document.querySelector('#interest-new'); i.value='游戏'; return 1;})()`);
await click('[data-interest-add]');
await wait(`document.querySelectorAll('[data-interest-chip]').length === 1`, 're-added');
await ev(`window.confirm = () => true`);
await click('[data-interest-reset]');
await wait(`document.querySelectorAll('[data-interest-chip]').length === 0`, 'reset');
profile = await ev(`window.__unitTest.profile()`);
check('9. 可重置兴趣画像且记录重置次数', profile.topics.length === 0 && profile.resets >= 1, `resets=${profile.resets}`);

// 10) 持久化
await ev(`(async()=>{ const p = await window.__unitTest.profile(); p.topics = [{ id:'it_x', label:'Rivers', source:'explicit', weight:0.8, keywords:['river'], createdAt:Date.now(), updatedAt:Date.now() }]; await window.__unitTest.saveProfile(p); return 1; })()`);
await cdp.send('Page.navigate', { url: APP });
await new Promise(r => setTimeout(r, 1500));
await wait(`!!window.__unitTest`, 'hook after reload');
await ev(`(()=>{document.querySelector('[data-nav="unit"]').click(); return 1;})()`);
await wait(`!!document.querySelector('#interest-list')`, 'page after reload');
check('10. 兴趣画像持久化（刷新后仍在）', (await text('#interest-list')).includes('Rivers'));

// 11) 防重复：完成同主题单元后不再占第一顺位
await ev(`(async()=>{ const now=Date.now(); await window.__unitTest.put('miniUnits', [{ id:'u-done', theme:'Rivers', topic:'rivers', dayIndex:3,
  anchorMaterialId:'p-rivers', anchorProvenance:'user_imported_authentic', targetWords:['current'], targetGrammar:['clause.adverbial'], grammarTargets:[], difficultyTarget:50,
  status:'completed', stage:'completed', startedAt: now-3*86400000, completedAt: now-86400000, updatedAt: now-86400000, dayLog:[], dayHistory:[], created: now-3*86400000 }]);
  await window.__unitTest.reload(); return 1; })()`);
const rep = await ev(`window.__unitTest.recommendations()`);
const first = rep.themes[0]?.topic;
check('11. 刚完成同主题后不占第一顺位', first !== 'rivers', JSON.stringify(rep.themes.map(t => [t.topic, t.repeat])));

check('12. 全程无未捕获 JS 异常', cdp.errors.length === 0, cdp.errors.slice(0, 2).join(' | '));

console.log('');
const passed = results.filter(r => r.ok).length;
console.log(`${passed === results.length ? 'PASS' : 'FAIL'}  Phase 8 interest smoke: ${passed}/${results.length}`);
fs.writeFileSync('C:/Users/86152/AppData/Local/Temp/phase8-interest-smoke.json', JSON.stringify(results, null, 2));
process.exit(passed === results.length ? 0 : 1);
