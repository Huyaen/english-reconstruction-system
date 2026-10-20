#!/usr/bin/env node
// —— Phase 6 真实浏览器验收（独立 profile 无头 Edge + CDP）——
// 前置：
//   1) npm run build:test && node server.mjs --dir=dist-test --port=4173
//   2) node tools/mock-ai-provider.mjs        （本地 OpenAI-compatible mock，协议级验证）
//   3) msedge --headless=new --remote-debugging-port=9226 --user-data-dir=<独立 profile> http://127.0.0.1:4173/?test=1
// 验收：配置 → 定向句生成 → 校验/质量门 → 句库（ai_unverified）→ 强化阅读 → 保存 → 失败/限流/无 Key 降级。
// 边界：真实 Provider 未验收（无凭据）；这里验的是协议、校验链、隐私与降级，不用 mock 冒充真实供应商成功。
import fs from 'node:fs';

const PORT = process.env.SMOKE_PORT || '9226';
const MOCK = process.env.MOCK_AI || 'http://127.0.0.1:8799';
const BASE = `http://127.0.0.1:${PORT}`;
const APP_URL = process.env.SMOKE_URL || 'http://127.0.0.1:4173/?test=1';
const results = [];
function check(name, ok, detail = '') {
    results.push({ name, ok: !!ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  · ' + detail : ''}`);
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
        throw new Error(`waitFor timeout: ${label} | ${JSON.stringify(last).slice(0, 160)}`);
    }
}

const cdp = await CDP.connect();
await cdp.send('Runtime.enable'); await cdp.send('Log.enable'); await cdp.send('Page.enable'); await cdp.send('Network.enable'); await cdp.send('DOM.enable');
const ev = e => cdp.eval(e);
const wait = (e, l, t = 25000) => cdp.waitFor(e, t, l);
const click = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'MISSING';e.click();return 'ok';})()`);
const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)})||{textContent:''}).textContent`);
const rows = store => ev(`(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('vocabulary-memory-v1');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});const out=await new Promise((res,rej)=>{const r=db.transaction(${JSON.stringify(store)}).objectStore(${JSON.stringify(store)}).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});db.close();return JSON.stringify(out);})()`);
let maxUserChars = 0;
const mockCalls = async () => {
    const calls = await (await fetch(`${MOCK}/__requests`)).json();
    for (const c of calls)
        maxUserChars = Math.max(maxUserChars, Number(c.userChars) || 0);
    return calls;
};
const resetMock = async () => { await fetch(`${MOCK}/__reset`); };

async function setAI(endpoint, model, key) {
    await click('[data-nav="settings"]');
    await wait(`!!document.querySelector('#settings-form')`, 'settings');
    await ev(`(()=>{const f=document.querySelector('#settings-form');
      f.querySelector('[name=endpoint]').value=${JSON.stringify(endpoint)};
      f.querySelector('[name=model]').value=${JSON.stringify(model)};
      f.querySelector('[name=key]').value=${JSON.stringify(key)};
      f.querySelector('[name=rememberKey]').checked=true;
      f.querySelector('[name=structuredMode]').value='auto';
      f.querySelector('[name=aiTimeout]').value='8';
      f.querySelector('[name=aiRetries]').value='2';
      f.querySelector('[name=aiMaxTokens]').value='600';
      f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));
      return 'submitted';})()`);
    await new Promise(r => setTimeout(r, 600));
}

try {
    // —— 0. 干净启动 + 准备弱词/弱语法（真实数据，不是假 mastery）——
    await cdp.send('Page.navigate', { url: APP_URL });
    await wait(`!!document.querySelector('#import')`, 'boot');
    await resetMock();
    check('Phase 6 验收钩子与 mock Provider 可达', !!(await ev('!!window.__readTest')) && (await mockCalls().then(x => Array.isArray(x))));
    await ev(`(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('vocabulary-memory-v1');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});await new Promise(res=>{const tx=db.transaction([...db.objectStoreNames],'readwrite');for(const n of db.objectStoreNames)tx.objectStore(n).clear();tx.oncomplete=()=>res();});db.close();return 'cleared';})()`);
    await cdp.send('Page.reload');
    await wait(`!!document.querySelector('#import')`, 'reload');

    // 通过真实导入对话框建立词库
    await click('#import');
    await ev(`(()=>{const e=document.querySelector('#paste-words');e.value='reconstruct 重建\\nnotebook 笔记本\\ncurrent 水流\\nstation 车站\\nengineer 工程师\\nbridge 桥';e.dispatchEvent(new Event('input',{bubbles:true}));const n=document.querySelector('#import-name');n.value='Phase6 冒烟词书';n.dispatchEvent(new Event('input',{bubbles:true}));return 'ok';})()`);
    await click('#parse-paste');
    await wait(`!document.querySelector('#import-confirm').disabled`, 'import ready');
    await click('#import-confirm');
    await wait(`document.querySelector('#main').textContent.includes('6 个词')`, 'imported');

    // 把其中两个词标记为“不认识”的真实状态，并写入两条语法错题（模拟真实练习结果）
    await ev(`(async()=>{
      const db=await new Promise((res,rej)=>{const r=indexedDB.open('vocabulary-memory-v1');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
      const words=await new Promise((res,rej)=>{const r=db.transaction('words').objectStore('words').getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
      const tx=db.transaction(['words','grammarAttempts'],'readwrite');
      const ws=tx.objectStore('words');
      for(const w of words.slice(0,2)){ w.state={...w.state,level:'unknown',total:3,correct:0,errors:3,lastCorrect:false}; ws.put(w); }
      const g=tx.objectStore('grammarAttempts');
      for(let i=0;i<3;i++) g.put({id:'ga.seed.'+i,conceptId:'clause.adverbial',at:Date.now()-i*60000,correct:false,sourceType:'sentence',sourceId:'seed',errorType:'meaning',durationMs:5000,independent:true,supportLevel:0});
      await new Promise((res,rej)=>{tx.oncomplete=res;tx.onerror=()=>rej(tx.error)});
      db.close(); return 'seeded';})()`);
    await cdp.send('Page.reload');
    await wait(`!!document.querySelector('#import')`, 'seeded reload');

    // —— 1. 配置 Provider（真实设置表单）——
    await setAI(`${MOCK}/v1`, 'mock-valid', 'sk-mock-not-a-real-key');
    check('设置已保存（endpoint/model/key 进入本地设置）', JSON.parse(await rows('meta')).some(m => m.id === 'settings' && m.value?.ai?.model === 'mock-valid'));

    // —— 2. Scenario A：生成定向句 ——
    await click('[data-nav="sentence"]');
    await wait(`!!document.querySelector('#ai-sentence-panel')`, 'sentence page');
    const panelDisabled = await ev(`document.querySelector('[data-ai-sentence]').disabled`);
    check('有真实弱词时“生成定向句”可用', panelDisabled === false);
    await ev(`(()=>{const i=document.querySelector('#ai-sentence-theme');i.value='repairing an old bridge';i.dispatchEvent(new Event('input',{bubbles:true}));return 'ok';})()`);
    await click('[data-ai-sentence]');
    await wait(`!!document.querySelector('#ai-sentence-result blockquote')`, 'sentence result', 60000);
    const sentText = await text('#ai-sentence-result blockquote');
    check('AI 句生成成功并显示正文', sentText.length > 20, sentText.slice(0, 50));
    check('结果标注 AI 生成 / 结构未验证', /AI 生成/.test(await text('#ai-sentence-result')) && /ai_unverified/.test(await text('#ai-sentence-result')));
    check('结果展示 prompt 版本与用量（可追溯）', /sentence\.generate@1\.0\.0/.test(await text('#ai-sentence-result')) && /tokens/.test(await text('#ai-sentence-result')));
    const gens1 = JSON.parse(await rows('aiGenerations'));
    check('生成记录落库（含 promptVersion / provider / usage）', gens1.length === 1 && gens1[0].promptVersion === '1.0.0' && gens1[0].providerHost.includes('127.0.0.1'), JSON.stringify({ n: gens1.length, v: gens1[0]?.promptVersion }));
    check('记录里没有 API Key', !JSON.stringify(gens1).includes('sk-mock'));
    const calls1 = await mockCalls();
    check('请求确实发到 Provider，且带 Authorization', calls1.length >= 1 && calls1[0].auth === 'present', `${calls1.length} 次`);

    // —— 3. 采纳为句库（ai_unverified，不改掌握）——
    const wordsBefore = JSON.parse(await rows('words')).map(w => ({ id: w.id, level: w.state?.level, total: w.state?.total }));
    await click('[data-ai-sentence-adopt]');
    // 句库写入是硬要求；“进入拆句”受 Phase 4 未知词门控约束，可能因生词过多被拒（会 toast 说明）
    await wait(`(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('vocabulary-memory-v1');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});const all=await new Promise((res,rej)=>{const r=db.transaction('sentences').objectStore('sentences').getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});db.close();return all.some(x=>x.sourceType==='ai');})()`, 'adopted', 20000);
    const sentRecs = JSON.parse(await rows('sentences'));
    const aiRec = sentRecs.find(s => s.sourceType === 'ai');
    check('AI 句进入句库并标 ai_unverified', !!aiRec && aiRec.structureProvenance === 'ai_unverified', aiRec?.structureProvenance);
    const wordsAfter = JSON.parse(await rows('words')).map(w => ({ id: w.id, level: w.state?.level, total: w.state?.total }));
    check('生成/采纳不会改变任何词的掌握状态', JSON.stringify(wordsBefore) === JSON.stringify(wordsAfter));

    // —— 4. Scenario B：强化阅读 ——
    await click('[data-nav="reading"]');
    await wait(`!!document.querySelector('#ai-reading-panel')`, 'reading page');
    await ev(`(()=>{const i=document.querySelector('#ai-reading-topic');i.value='river engineering';i.dispatchEvent(new Event('input',{bubbles:true}));return 'ok';})()`);
    await resetMock();
    await click('[data-ai-reading]');
    await wait(`!!document.querySelector('#ai-reading-result h3')`, 'reading result', 60000);
    const readingCard = await text('#ai-reading-result');
    check('强化文章生成成功并显示标题', /Station Notebook/.test(readingCard));
    check('明确标注“AI 生成 · 不是真实语料”', /AI 生成强化材料/.test(readingCard) && /ai_generated/.test(readingCard));
    check('附带阅读题与逐字证据', /阅读题（3）/.test(readingCard) && /证据：/.test(readingCard));
    check('质量门结果可见', /质量门：/.test(readingCard) && /全部检查通过/.test(readingCard), (readingCard.match(/质量门：[^<]*/) || [''])[0].slice(0, 40));
    await click('[data-ai-reading-save]');
    await wait(`!!document.querySelector('#read-preview') || !!document.querySelector('#read-library')`, 'saved reading', 20000);
    const passages = JSON.parse(await rows('passages'));
    const aiPassage = passages.find(p => p.sourceType === 'ai_reinforcement');
    check('强化文章落库：sourceType=ai_reinforcement / reliability=ai_generated', !!aiPassage && aiPassage.sourceReliability === 'ai_generated' && aiPassage.extractionMethod === 'ai_generated', aiPassage ? `${aiPassage.sourceType}/${aiPassage.sourceReliability}` : 'missing');
    check('强化文章可切分段落与句子（能进入阅读流程）', (aiPassage?.paragraphs?.length ?? 0) >= 1 && (aiPassage?.sentences?.length ?? 0) >= 3, `${aiPassage?.paragraphs?.length} 段 / ${aiPassage?.sentences?.length} 句`);

    // —— 5. Scenario E：非法 JSON → 有界重试 → 不落库 ——
    await setAI(`${MOCK}/v1`, 'mock-bad-json', 'sk-mock-not-a-real-key');
    await click('[data-nav="sentence"]');
    await wait(`!!document.querySelector('[data-ai-sentence]')`, 'sentence page 2');
    await resetMock();
    const gensBefore = JSON.parse(await rows('aiGenerations')).length;
    await click('[data-ai-sentence]');
    await wait(`!!document.querySelector('#ai-sentence-result .ai-error')`, 'bad json error', 60000);
    const badCalls = await mockCalls();
    check('非法输出被拒绝并显示可读错误', /不是可解析的 JSON|未通过/.test(await text('#ai-sentence-result')), (await text('#ai-sentence-result')).slice(0, 40));
    check('重试有上限（≤3 次请求）', badCalls.length <= 3 && badCalls.length >= 1, `${badCalls.length} 次`);
    check('失败输出不会写入生成记录', JSON.parse(await rows('aiGenerations')).length === gensBefore);

    // —— 6. Scenario D：429 限流 → 明确报错、不无限重试 ——
    await setAI(`${MOCK}/v1`, 'mock-rate-limit', 'sk-mock-not-a-real-key');
    await click('[data-nav="sentence"]');
    await wait(`!!document.querySelector('[data-ai-sentence]')`, 'sentence page 3');
    await resetMock();
    await click('[data-ai-sentence]');
    await wait(`!!document.querySelector('#ai-sentence-result .ai-error')`, 'rate limit error', 60000);
    const rlCalls = await mockCalls();
    check('429 明确提示限流', /限流|429/.test(await text('#ai-sentence-result')), (await text('#ai-sentence-result')).slice(0, 40));
    check('429 有界重试（≤3 次，不无限扣费）', rlCalls.length <= 3, `${rlCalls.length} 次`);

    // —— 7. Scenario C：没有 Key 时本地功能全部可用、不产生任何请求 ——
    await click('[data-nav="settings"]');
    await wait(`!!document.querySelector('#settings-form')`, 'settings 2');
    await ev(`(()=>{const f=document.querySelector('#settings-form');
      f.querySelector('[name=key]').value='';
      f.querySelector('[name=rememberKey]').checked=false;
      f.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));return 'ok';})()`);
    await new Promise(r => setTimeout(r, 600));
    await resetMock();
    await click('[data-nav="sentence"]');
    await wait(`!!document.querySelector('#ai-sentence-panel')`, 'sentence page 4');
    check('没有 Key 时生成按钮禁用并说明原因', (await ev(`document.querySelector('[data-ai-sentence]').disabled`)) === true && /未配置|Key/.test(await text('#ai-sentence-panel')));
    await click('[data-nav="reading"]');
    await wait(`/read-preview|read-library|read-import/.test(document.querySelector('#main')?.innerHTML||'')`, 'reading works without key');
    check('无 Key 时阅读库仍正常打开（本地功能不受影响）', /阅读|导入|材料/.test(await text('#main')));
    await click('[data-nav="home"]');
    await wait(`!!document.querySelector('#plan-panel, #main')`, 'home');
    check('无 Key 时首页/计划正常渲染', (await text('#main')).length > 50);
    check('无 Key 时没有发出任何 AI 请求', (await mockCalls()).length === 0);

    // —— 8. Scenario F：刷新后材料与记录仍在，不重复生成 ——
    await cdp.send('Page.reload');
    await wait(`!!document.querySelector('#import')`, 'reload 2');
    const gensAfter = JSON.parse(await rows('aiGenerations'));
    const passagesAfter = JSON.parse(await rows('passages'));
    check('刷新后生成记录仍在（可用于复用/审计）', gensAfter.length >= 2, `${gensAfter.length} 条`);
    check('刷新后 AI 强化文章仍在阅读库', passagesAfter.some(p => p.sourceType === 'ai_reinforcement'));
    check('生成记录不含 Key，也不含完整词库', !gensAfter.some(g => JSON.stringify(g).includes('sk-mock')) && !gensAfter.some(g => g.sourceMetadata?.privacy?.includes('sk-')));

    // —— 9. 隐私：请求体最小化 ——
    check('发送内容最小化（不发送完整词库/学习历史）', maxUserChars > 0 && maxUserChars < 6000, `最长 user 消息 ${maxUserChars} 字符`);

    // —— 10. 无未捕获错误 ——
    const errors = cdp.events.filter(e => e.method === 'Runtime.exceptionThrown');
    check('无未捕获 JS 异常', errors.length === 0, `${errors.length} 条`);
} catch (e) {
    check('脚本执行', false, e.message);
} finally {
    const pass = results.filter(r => r.ok).length;
    const fail = results.length - pass;
    fs.mkdirSync('screenshots', { recursive: true });
    fs.writeFileSync('screenshots/phase6-smoke-report.md', [`# Phase 6 AI 强化验收 · ${pass}/${results.length}`, '', ...results.map(r => `- ${r.ok ? 'PASS' : 'FAIL'} · ${r.name}${r.detail ? ` — ${r.detail}` : ''}`), ''].join('\n'), 'utf8');
    console.log(`\n${fail ? 'FAIL' : 'PASS'}  Phase 6 smoke: ${pass}/${results.length}`);
    process.exit(fail ? 1 : 0);
}
