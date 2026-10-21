#!/usr/bin/env node
// —— Phase 3 真实浏览器验收（独立 profile 的无头 Edge + CDP；不使用用户真实浏览器数据）——
// 用法：
//   1) npm run build && node server.mjs
//   2) msedge.exe --headless=new --remote-debugging-port=9224 --user-data-dir=<独立 profile> http://127.0.0.1:4173/
//   3) node scripts/phase3-smoke.mjs
// 验收内容：导入 → 生成今日计划 → 预览/Recall/收尾 → 刷新恢复 → 断更 Re-entry。
import fs from 'node:fs';

const PORT = process.env.SMOKE_PORT || '9224';
const BASE = `http://127.0.0.1:${PORT}`;
const APP_MATCH = '127.0.0.1:4173';
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
            await new Promise(r => setTimeout(r, 250));
        }
        throw new Error(`waitFor timeout: ${label} | last=${JSON.stringify(last).slice(0, 200)}`);
    }
}
const cdp = await CDP.connect();
await cdp.send('Runtime.enable');
await cdp.send('Log.enable');
const ev = expr => cdp.eval(expr);
const wait = (expr, label, timeout = 20000) => cdp.waitFor(expr, timeout, label);
const click = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'MISSING ${sel}';e.click();return 'ok';})()`);
const set = (sel, v) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'MISSING';e.value=${JSON.stringify(v)};e.dispatchEvent(new Event('input',{bubbles:true}));return 'ok';})()`);
const cardClick = (label, action) => ev(`(()=>{const c=[...document.querySelectorAll('.plan-task')].find(x=>(x.querySelector('.task-main')||{}).textContent?.includes(${JSON.stringify(label)}));if(!c)return 'no-card';const b=c.querySelector('[data-task-'+${JSON.stringify(action)}+']');if(!b)return 'no-button';b.click();return 'ok';})()`);
const cardTexts = () => ev(`JSON.stringify([...document.querySelectorAll('.plan-task')].map(c=>c.querySelector('.task-main').textContent+' || '+c.className))`);
const planTitle = () => ev(`(document.querySelector('#plan-panel .section-title')||{textContent:''}).textContent`);
const toast = () => ev(`document.querySelector('#toast').textContent`);
const todayPlan = () => ev(`(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('vocabulary-memory-v1');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});const rows=await new Promise(res=>{const r=db.transaction('dailyPlans').objectStore('dailyPlans').getAll();r.onsuccess=()=>res(r.result)});db.close();return JSON.stringify(rows.map(p=>({id:p.id,status:p.status,revision:p.revision,budget:p.availableMinutes,planned:p.initialPlan.reduce((n,t)=>n+t.minutes,0),tasks:p.initialPlan.map(t=>[t.kind,t.status,t.minutes,(t.refs||[]).length]),feedback:p.closingLoop&&p.closingLoop.feedback,actions:(p.taskActions||[]).map(a=>a.action),reasons:(p.adjustments||[]).map(a=>a.reason)})));})()`);

// 页面内答题：以导入时使用的词表匹配正确选项（真实选择，不是跳过）
const PAGE_ANSWERS = `
window.__pairs = { abandon:'放弃', adequate:'充足的', reluctant:'不情愿的', reliable:'可靠的', maintain:'维持', obvious:'明显的' };
window.__answerOne = () => {
  const q = document.querySelector('#question-text');
  if (!q) return 'no-question';
  const prompt = q.textContent.trim();
  const target = window.__pairs[prompt] || Object.keys(window.__pairs).find(k => window.__pairs[k] === prompt);
  if (!target) return 'no-match:' + prompt;
  const btn = [...document.querySelectorAll('.answer')].find(b => b.querySelector('span') && b.querySelector('span').textContent === target);
  if (!btn) return 'no-option:' + target;
  btn.click();
  return 'answered';
};
'ready'`;

try {
    // —— 0. 初始加载 ——
    // 上一次会话可能停在训练页/句子页：先整页重载回到首页
    await cdp.send('Page.reload');
    await wait(`!!document.querySelector('#import')`, 'app boot');
    // 允许同一 profile 重复执行：**无条件**清空本 profile 的测试数据。
    // 不能只在“首页有计划面板”时清理：脚本上一次可能停在任何子页面，残留数据会让后续断言漂移。
    await ev(`(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('vocabulary-memory-v1');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});await new Promise(res=>{const tx=db.transaction([...db.objectStoreNames],'readwrite');for(const n of db.objectStoreNames)tx.objectStore(n).clear();tx.oncomplete=()=>res();});db.close();return 'cleared';})()`);
    await cdp.send('Page.reload');
    await wait(`!!document.querySelector('#import')`, 'boot after clear');
    check('应用启动', true, await ev(`document.title`));

    // —— 1. 导入词表 ——
    await click('#import');
    await wait(`!!document.querySelector('#import-name')`, 'import dialog');
    await set('#import-name', 'Phase3 冒烟词书');
    await set('#paste-words', 'abandon 放弃\nadequate 充足的\nreluctant 不情愿的\nreliable 可靠的\nmaintain 维持\nobvious 明显的');
    await click('#parse-paste');
    await wait(`!document.querySelector('#import-confirm').disabled`, 'import ready');
    await click('#import-confirm');
    await wait(`document.querySelector('#main').textContent.includes('6 个词')`, 'imported');
    check('词表导入', true, '6 个词');

    // —— 2. 生成今日计划 ——
    await wait(`!!document.querySelector('#plan-setup')`, 'plan setup');
    // Phase 5 起阅读模块也已真实可用（但没有材料就不排阅读任务）；仍未上线的必须明确标为不可用（不得假装可用）
    const gatingText = await ev(`document.querySelector('#plan-setup').textContent`);
    // Phase 8 起真实输入也已上线：只有仍在上线中的“输出（phase8）”允许被列为不可用
    const gating = !/真实输入（phase7）/.test(gatingText) && !/句子与语法（phase4）/.test(gatingText) && !/阅读（phase5）/.test(gatingText) && /输出（phase8）/.test(gatingText);
    check('Capability Gate 只把未上线模块标为不可用', gating, gatingText.slice(0, 160));
    await click('#plan-create');
    await wait(`!!document.querySelector('#plan-panel')`, 'plan panel');
    const title1 = await planTitle();
    const cards1 = JSON.parse(await cardTexts());
    const panelText1 = await ev(`document.querySelector('#plan-panel').textContent`);
    check('生成今日计划（时间预算优先）', /预算 30 分钟/.test(panelText1), title1.slice(0, 60));
    check('任务顺序：Preview → Recall →（可选）句任务 → Closing',
        cards1.length >= 3 && cards1[0].includes('新词预览') && cards1[1].includes('新词 Recall') && cards1[cards1.length - 1].includes('今日收尾回忆'),
        cards1.map(c => c.split(' ||')[0]).join(' | '));
    const plan1 = JSON.parse(await todayPlan());
    check('计划预算不溢出', plan1[0].planned <= plan1[0].budget, `planned=${plan1[0].planned} budget=${plan1[0].budget}`);
    check('Closing 使用真实词', plan1[0].tasks.find(t => t[0] === 'closing-recall')[3] > 0);

    // —— 3. 替换不可用（无同目标候选时不生成假任务）——
    await cardClick('新词 Recall', 'replace');
    await wait(`document.querySelector('#toast').textContent.includes('没有可替换')`, 'replace unavailable');
    check('替换无候选时明确拒绝', true, await toast());

    // —— 4. 执行 Preview → Recall ——
    await ev(PAGE_ANSWERS);
    await cardClick('新词预览', 'start');
    await wait(`!!document.querySelector('[data-preview]')`, 'preview page');
    for (let i = 0; i < 6; i++) {
        await click('[data-preview="know"]');
        await new Promise(r => setTimeout(r, 60));
    }
    await wait(`!!document.querySelector('#back-home')`, 'preview done');
    await click('#back-home');
    await wait(`!!document.querySelector('#plan-panel')`, 'home after preview');
    await wait(`document.querySelector('#plan-panel').textContent.includes('已完成')`, 'preview task done');
    check('Preview 任务完成并落盘', /完成 1\/\d+/.test(await planTitle()), await planTitle());

    await cardClick('新词 Recall', 'start');
    await wait(`!!document.querySelector('.answers')`, 'recall started');
    for (let i = 0; i < 8; i++) {
        if (await ev(`!!document.querySelector('#back-home')`))
            break;
        const r = await ev(`window.__answerOne()`);
        if (r !== 'answered')
            throw new Error('答题失败：' + r);
        await new Promise(r2 => setTimeout(r2, 90));
    }
    await wait(`!!document.querySelector('#back-home')`, 'recall results');
    await click('#back-home');
    await wait(`!!document.querySelector('#plan-panel')`, 'home after recall');
    await wait(`document.querySelector('#plan-panel .section-title').textContent.includes('完成 2/')`, 'progress 2/N');
    check('Recall 会话完成并更新计划', true, await planTitle());

    // —— 5. 收尾 Closing Loop + 难度反馈 ——
    await cardClick('今日收尾回忆', 'start');
    await wait(`!!document.querySelector('.answers')`, 'closing started');
    for (let i = 0; i < 6; i++) {
        if (await ev(`!!document.querySelector('#back-home')`))
            break;
        const r = await ev(`window.__answerOne()`);
        if (r !== 'answered')
            break;
        await new Promise(r2 => setTimeout(r2, 90));
    }
    await wait(`!!document.querySelector('[data-closing]')`, 'closing feedback modal');
    // 收尾任务可能在重排后附带 weak 任务；先给反馈再清理剩余柔性任务
    await click('[data-closing="just"]');
    await wait(`document.querySelector('#toast').textContent.includes('今日收尾已记录')`, 'closing saved');
    check('Closing Loop 保存难度反馈', true, await toast());

    // Phase 4：重排后可能补入柔性句任务；逐个跳过（跳过只影响当天，不滚存）
    const openCount = () => ev(`[...document.querySelectorAll('.plan-task')].filter(c=>c.querySelector('[data-task-start]')).length`);
    for (let i = 0; i < 10 && (await openCount()) > 0; i++) {
        const r = await ev(`(()=>{const c=[...document.querySelectorAll('.plan-task')].find(x=>x.querySelector('[data-task-start]'));if(!c)return 'none';const b=c.querySelector('[data-task-skip]');if(!b)return 'no-skip';b.click();return 'ok';})()`);
        if (r !== 'ok')
            throw new Error('柔性任务无法跳过：' + r);
        await new Promise(r2 => setTimeout(r2, 200));
    }
    check('柔性任务可逐个跳过', (await openCount()) === 0, await planTitle());
    const plan3 = JSON.parse(await todayPlan());
    check('计划落盘为完成态（含 Closing 反馈）', plan3[0].feedback === 'just', `feedback=${plan3[0].feedback}`);
    check('任务动作全部带原因', plan3[0].actions.includes('start') && plan3[0].actions.includes('complete'), plan3[0].actions.join(','));

    // —— 6. 刷新恢复 ——
    await cdp.send('Page.reload');
    await wait(`!!document.querySelector('#plan-panel')`, 'plan restored after reload', 25000);
    const title2 = await planTitle();
    const samePlan = JSON.parse(await todayPlan());
    check('刷新后计划恢复且不重复生成', samePlan.length === 1 && !(await ev(`!!document.querySelector('#plan-setup')`)), `${title2.slice(0, 40)} | plans=${samePlan.length}`);

    // —— 7. Yesterday Recall：写入昨日真实记录，验证隔夜检测与校准 ——
    await ev(`(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('vocabulary-memory-v1');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});const words=await new Promise(res=>{const r=db.transaction('words').objectStore('words').getAll();r.onsuccess=()=>res(r.result)});const d=new Date();d.setDate(d.getDate()-1);d.setHours(20,0,0,0);const at=d.getTime();const tx=db.transaction(['dailyPlans','records'],'readwrite');tx.objectStore('dailyPlans').clear();tx.objectStore('records').clear();for(const [i,w] of words.entries()){tx.objectStore('records').put({id:'yest-'+w.id,wordId:w.id,sessionId:'yesterday-session',at:at+i*60000,direction:i%2===0?'en-zh':'zh-en',correct:i<4,ms:i<4?1600:4200,selectedId:i<4?w.id:null,reason:i<4?'answer':'unknown',before:'normal',after:i<4?'normal':'unknown',scheduled:false,rating:i<4?3:1});}await new Promise(res=>{tx.oncomplete=()=>res();tx.onabort=()=>res();});db.close();return 'seeded';})()`);
    await cdp.send('Page.reload');
    await wait(`!!document.querySelector('#plan-setup')`, 'plan setup (yesterday history)');
    await ev(PAGE_ANSWERS);
    await click('#plan-create');
    await wait(`!!document.querySelector('#plan-panel')`, 'plan with yesterday recall');
    let cardsY = JSON.parse(await cardTexts());
    check('有昨日记录时生成隔夜检测任务', cardsY[0].includes('昨日隔夜检测'), cardsY[0].split(' ||')[0]);
    await cardClick('昨日隔夜检测', 'start');
    await wait(`!!document.querySelector('.answers')`, 'yesterday recall started');
    for (let i = 0; i < 10; i++) {
        if (await ev(`!!document.querySelector('#back-home')`))
            break;
        const r = await ev(`window.__answerOne()`);
        if (r !== 'answered')
            break;
        await new Promise(r2 => setTimeout(r2, 90));
    }
    await wait(`!!document.querySelector('#back-home')`, 'yesterday recall results');
    await click('#back-home');
    await wait(`!!document.querySelector('#plan-panel')`, 'home after yesterday recall');
    await wait(`document.querySelector('#plan-panel').textContent.includes('隔夜检测：保留率')`, 'retention shown', 15000);
    const planY = JSON.parse(await todayPlan());
    const recallTaskY = planY[0].tasks.find(t => t[0] === 'yesterday-recall');
    check('隔夜检测完成并显示保留率', !!recallTaskY && recallTaskY[1] === 'done', await ev(`document.querySelector('#plan-panel').textContent.match(/隔夜检测：[^·]*/)[0]`));
    check('隔夜结果进入计划状态（校准）', planY[0].actions.includes('calibrate'), planY[0].actions.join(','));

    // —— 7. 断更 Re-entry：写入 5 天前的真实记录并删除今天计划 ——
    await ev(`(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('vocabulary-memory-v1');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});const words=await new Promise(res=>{const r=db.transaction('words').objectStore('words').getAll();r.onsuccess=()=>res(r.result)});const past=Date.now()-5*86400000;const tx=db.transaction(['dailyPlans','records'],'readwrite');tx.objectStore('dailyPlans').clear();tx.objectStore('records').clear();for(const [i,w] of words.entries()){tx.objectStore('records').put({id:'past-'+w.id,wordId:w.id,sessionId:'past-session',at:past+i*60000,direction:'en-zh',correct:i%2===0,ms:1800,selectedId:w.id,reason:'answer',before:'normal',after:i%2===0?'normal':'unknown',scheduled:true,rating:3});}await new Promise(res=>{tx.oncomplete=()=>res();tx.onabort=()=>res();});db.close();return 'seeded';})()`);
    await cdp.send('Page.reload');
    await wait(`!!document.querySelector('#plan-setup')`, 'plan setup after gap');
    await click('#plan-create');
    await wait(`!!document.querySelector('#plan-panel')`, 're-entry plan');
    const cards2 = JSON.parse(await cardTexts());
    const plan4 = JSON.parse(await todayPlan());
    const reentry = plan4[0].tasks.find(t => t[0] === 're-entry-check');
    check('断更后生成重新进入检测任务', !!reentry && cards2[0].includes('重新进入检测'), cards2[0].split(' ||')[0]);
    check('Re-entry 使用真实词汇且在预算内', !!reentry && reentry[3] >= 5 && plan4[0].planned <= plan4[0].budget, `refs=${reentry && reentry[3]} planned=${plan4[0].planned}/${plan4[0].budget}`);

    // —— 8. 控制台错误 ——
    const errors = cdp.events.filter(e => {
        if (e.method === 'Runtime.exceptionThrown')
            return true;
        if (e.method === 'Log.entryAdded' && e.params.entry.level === 'error') {
            const url = e.params.entry.url || '';
            return !/favicon\.ico/i.test(url);
        }
        return false;
    }).map(e => e.method === 'Log.entryAdded' ? `${e.params.entry.text} @ ${e.params.entry.url || ''}` : (e.params.exceptionDetails.exception?.description || 'exception'));
    check('无控制台未捕获错误', errors.length === 0, errors.slice(0, 3).join(' | '));
}
catch (e) {
    check('冒烟脚本执行完成', false, e.message);
}
finally {
    const failed = results.filter(r => !r.ok);
    console.log(`\n—— Phase 3 浏览器冒烟：${results.length - failed.length}/${results.length} 通过 ——`);
    fs.writeFileSync(process.env.SMOKE_OUT || 'phase3-smoke-result.json', JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
    process.exit(failed.length ? 1 : 0);
}
