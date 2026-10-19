#!/usr/bin/env node
// —— Phase 4 真实浏览器验收（独立 profile 的无头 Edge + CDP；不使用用户真实浏览器数据）——
// 用法：
//   1) npm run build && node server.mjs
//   2) msedge.exe --headless=new --remote-debugging-port=9224 --user-data-dir=<独立 profile> http://127.0.0.1:4173/
//   3) node scripts/phase4-smoke.mjs
// 验收内容：句源能力诚实标示 → 拆句训练（预教词/分层辅助/即时反馈/JIT 卡）→ 证据落库 →
//          结构树与整句意义 → 迁移验证 → 语法图谱 ↔ 真实训练句双向跳转 → 计划内真实句任务。
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
            await new Promise(r => setTimeout(r, 200));
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
const text = sel => ev(`(document.querySelector(${JSON.stringify(sel)})||{textContent:''}).textContent`);
const toast = () => text('#toast');
const rows = store => ev(`(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('vocabulary-memory-v1');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});const out=await new Promise((res,rej)=>{const r=db.transaction(${JSON.stringify(store)}).objectStore(${JSON.stringify(store)}).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});db.close();return JSON.stringify(out);})()`);

// 页面内取当前步骤的正确选项：直接复用应用自己的 lab plan（同一份结构数据，非硬编码答案）
const STEP_PROBE = `
window.__labStep = () => {
  const q = document.querySelector('#lab-question');
  const opts = [...document.querySelectorAll('[data-lab-option]')];
  return JSON.stringify({ question: q ? q.textContent : '', options: opts.map(b => ({ id: b.dataset.labOption, label: b.querySelector('b') ? b.querySelector('b').textContent : '', detail: b.querySelector('small') ? b.querySelector('small').textContent : '' })) });
};
window.__pickByLabel = (labels) => {
  const opts = [...document.querySelectorAll('[data-lab-option]')];
  for (const l of labels) {
    const b = opts.find(x => (x.querySelector('b') || {}).textContent === l);
    if (b) { b.click(); return l; }
  }
  return 'no-match:' + opts.map(b => (b.querySelector('b') || {}).textContent).join('|');
};
window.__level = () => (document.querySelector('#lab-level') || {}).textContent || '';
'ready'`;

try {
    // —— 0. 启动与清理 ——
    // 上一个会话可能停在训练页：先导航到测试模式首页（?test=1 才暴露答题钩子）
    await cdp.send('Page.navigate', { url: 'http://127.0.0.1:4173/?test=1' });
    await wait(`!!document.querySelector('#import, #plan-panel')`, 'app boot');
    // 钩子来自测试构建（npm run build:test → dist-test）。生产构建里整个钩子被摇树移除，
    // 因此本脚本必须跑在测试构建上：node server.mjs --dir=dist-test --port=4173。
    const hasHook = !!(await ev(`!!window.__labTest`));
    check('测试钩子仅在测试构建 + ?test=1 时存在', hasHook, hasHook ? 'dist-test' : '缺少钩子：请用 npm run build:test 并以 --dir=dist-test 启动服务');
    await ev(`(async()=>{const db=await new Promise((res,rej)=>{const r=indexedDB.open('vocabulary-memory-v1');r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});await new Promise(res=>{const tx=db.transaction([...db.objectStoreNames],'readwrite');for(const n of db.objectStoreNames)tx.objectStore(n).clear();tx.oncomplete=()=>res();});db.close();return 'cleared';})()`);
    await cdp.send('Page.reload');
    await wait(`!!document.querySelector('#import')`, 'boot after clear');
    await ev(STEP_PROBE);
    check('应用启动', true, await ev(`document.title`));

    // —— 1. 句子页：句源能力必须诚实 ——
    await click('[data-nav="sentence"]');
    await wait(`!!document.querySelector('#sentence-page')`, 'sentence page');
    const sentencePage = await text('#sentence-page');
    check('句库为 authored 教学句并标注来源', sentencePage.includes('人工教学句') && sentencePage.includes('authored'), sentencePage.slice(0, 60));
    check('AI 未配置时不伪造 AI 句', sentencePage.includes('不会伪造'));
    const bankRows = JSON.parse(await rows('sentences'));
    check('句库落盘 12 条教学句', bankRows.length === 12, `count=${bankRows.length}`);
    check('每条句子都有结构来源标注', bankRows.every(s => s.structureProvenance === 'gold'));
    check('每条句子都有预教词释义', bankRows.every(s => s.glossary && Object.keys(s.glossary).length >= 1));

    // —— 2. 拆句训练：预教词 → 无提示独立完成 ——
    await click('[data-sentence-start="sen.curated.relative-01"]');
    await wait(`!!document.querySelector('#lab-sentence')`, 'lab start');
    const labText = await text('#lab-page');
    check('训练中先给预教词', labText.includes('预教词'));
    check('训练中不给整句翻译', !labText.includes('我读的那本书'));
    const optionDetails = await ev(`[...document.querySelectorAll('[data-lab-option]')].map(b=>b.querySelector('small')?b.querySelector('small').textContent:'')`);
    check('作答前选项不含成分解析（不把答案写在选项上）', (optionDetails || []).every(d => !d), JSON.stringify(optionDetails));
    const steps = [];
    for (let i = 0; i < 12; i++) {
        if (await ev(`!!document.querySelector('#lab-tree')`))
            break;
        const s = JSON.parse(await ev(`window.__labStep()`));
        steps.push(s.question);
        // 选项在作答前不含任何成分解析（防止答案写在选项上），所以由测试钩子点正确项
        const ok = await ev(`window.__labTest.answerCorrect()`);
        if (!ok)
            throw new Error('钩子点击失败（step ' + (i + 1) + '）');
        await wait(`!!document.querySelector('.lab-feedback')`, 'step feedback ' + (i + 1));
        await click('#lab-next');
        await new Promise(r => setTimeout(r, 120));
    }
    await wait(`!!document.querySelector('#lab-tree')`, 'lab results', 25000);
    const resultText = await text('#main');
    check('拆句步骤覆盖主语→谓语→…→整句', steps.length >= 3 && steps[0].includes('主语'), steps.join(' / '));
    check('结果页给出结构树', resultText.includes('结构树'));
    check('结果页才揭示整句意思', resultText.includes('整句意思'));
    const treeTokens = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('#lab-tree .token b')].map(e=>e.textContent))`));
    check('结构树逐词对齐原文', treeTokens.join(' ') === 'The report is missing. that he wrote about the flood', treeTokens.join(' '));
    const sa1 = JSON.parse(await rows('sentenceAttempts'));
    check('无提示全对 → 独立完成证据', sa1.length === 1 && sa1[0].evidenceClass === 'independent', sa1[0] && sa1[0].evidenceClass);
    check('句子证据落库（含结构正确性与辅助级别）', sa1.length === 1 && sa1[0].sentenceId === 'sen.curated.relative-01' && typeof sa1[0].structureCorrect === 'boolean' && typeof sa1[0].maxSupportLevel === 'number', JSON.stringify({ n: sa1.length, cls: sa1[0] && sa1[0].evidenceClass }));
    const ga1 = JSON.parse(await rows('grammarAttempts'));
    check('每个语法概念各留一条证据', ga1.length >= 2, `n=${ga1.length}`);
    const concepts1 = JSON.parse(await rows('grammarConcepts'));
    const subj = concepts1.find(c => c.id === 'structure.subject');
    check('语法概念后验被更新（不是只看不改）', !!subj && subj.attempts >= 1, subj ? `attempts=${subj.attempts} mastery=${subj.mastery.toFixed(3)}` : 'missing');
    const usedSentence = JSON.parse(await rows('sentences')).find(s => s.id === 'sen.curated.relative-01');
    check('句库记录真实使用次数', !!usedSentence && usedSentence.usedCount >= 1, `usedCount=${usedSentence && usedSentence.usedCount}`);

    // —— 3. 迁移验证：换一句同结构新句 ——
    const hasTransfer = await ev(`!!document.querySelector('#lab-transfer')`);
    if (hasTransfer) {
        await click('#lab-transfer');
        await wait(`!!document.querySelector('#lab-sentence')`, 'transfer sentence');
        const transferText = await text('#lab-sentence');
        check('迁移句与训练句不同', !transferText.includes('The report'), transferText.slice(0, 50));
        check('迁移页明确标注迁移验证', (await text('#lab-page')).includes('迁移验证'));
        for (let i = 0; i < 12; i++) {
            if (await ev(`!!document.querySelector('#lab-tree')`))
                break;
            const okT = await ev(`window.__labTest.answerCorrect()`);
            if (!okT)
                throw new Error('钩子点击失败（迁移 step ' + (i + 1) + '）');
            await wait(`!!document.querySelector('.lab-feedback')`, 'transfer feedback ' + (i + 1));
            await click('#lab-next');
            await new Promise(r => setTimeout(r, 120));
        }
        await wait(`!!document.querySelector('#lab-tree')`, 'transfer results', 25000);
        const sa2 = JSON.parse(await rows('sentenceAttempts'));
        check('迁移复测单独留证据并记录来源句', sa2.length === 2 && sa2[1].transferOf === 'sen.curated.relative-01', JSON.stringify(sa2.map(a => a.transferOf || null)));
    }
    else {
        check('迁移验证可用', false, '结果页没有迁移按钮');
    }

    // —— 4. 分层辅助：看过答案不计掌握 ——
    if (await ev(`!!document.querySelector('#lab-next-sentence')`))
        await click('#lab-next-sentence');
    await wait(`!!document.querySelector('#sentence-page')`, 'back to sentence page');
    const beforeConcepts = JSON.parse(await rows('grammarConcepts'));
    await click('[data-sentence-start="sen.curated.passive-01"]');
    await wait(`!!document.querySelector('#lab-sentence')`, 'hint sentence');
    for (let i = 0; i < 12; i++) {
        if (await ev(`!!document.querySelector('#lab-tree')`))
            break;
        await click('#lab-hint');
        await click('#lab-hint');
        await click('#lab-hint');
        const level = await ev(`window.__level()`);
        if (i === 0)
            check('辅助级别递进到 L3（= 看到答案）', level.includes('L3'), level);
        const okH = await ev(`window.__labTest.answerCorrect()`);
        if (!okH)
            throw new Error('钩子点击失败（L3 step ' + (i + 1) + '）');
        await wait(`!!document.querySelector('.lab-feedback')`, 'hint feedback ' + (i + 1));
        await click('#lab-next');
        await new Promise(r => setTimeout(r, 120));
    }
    await wait(`!!document.querySelector('#lab-tree')`, 'hint results', 25000);
    const hintText = await text('#main');
    check('看答案的尝试明确不计入掌握', hintText.includes('不计入掌握'), hintText.slice(0, 60));
    const afterConcepts = JSON.parse(await rows('grammarConcepts'));
    const masteryChanged = afterConcepts.some(a => {
        const b = beforeConcepts.find(x => x.id === a.id);
        return !b || b.mastery !== a.mastery;
    });
    check('看答案不改变任何概念的掌握估算', !masteryChanged);

    // —— 5. 语法图谱 ↔ 真实训练句 ——
    await click('[data-nav="grammar"]');
    await wait(`!!document.querySelector('#grammar-page')`, 'grammar page');
    const grammarText = await text('#grammar-page');
    check('图谱自检通过（无环、无缺失先修）', grammarText.includes('图谱自检：通过'));
    // 证据不足时必须明说"证据不足"，不得用先验值假装掌握；证据够了就必须按弱项排序展示
    const weakHonest = grammarText.includes('需要优先处理') || grammarText.includes('还没有足够的语法证据');
    check('优先处理区要么给真实弱项、要么明说证据不足', weakHonest, grammarText.includes('还没有足够的语法证据') ? '证据不足（如实告知）' : '有弱项列表');
    const conceptCount = await ev(`document.querySelectorAll('[data-concept]').length`);
    check('图谱节点可点击', conceptCount >= 30, `nodes=${conceptCount}`);
    await click('[data-concept="clause.relative"]');
    await wait(`!!document.querySelector('#concept-detail')`, 'concept detail');
    const detailText = await text('#concept-detail');
    check('概念页给出规则/为什么/例子（知识卡）', detailText.includes('知识卡') && detailText.includes('先修'));
    check('概念页展示真实证据而不是空壳', detailText.includes('最近证据'));
    const jumpable = await ev(`document.querySelectorAll('#concept-detail [data-sentence-start]').length`);
    check('概念页可跳到真实训练句', jumpable >= 1, `buttons=${jumpable}`);

    // —— 6. 计划内真实句任务 ——
    await click('[data-nav="home"]');
    await wait(`!!document.querySelector('#plan-setup, #plan-panel')`, 'home');
    if (await ev(`!!document.querySelector('#import')`))
        await click('#import');
    if (await ev(`!!document.querySelector('#import-name')`)) {
        await ev(`(()=>{const e=document.querySelector('#paste-words');e.value='abandon 放弃\\nadequate 充足的\\nreluctant 不情愿的\\nreliable 可靠的\\nmaintain 维持\\nobvious 明显的';e.dispatchEvent(new Event('input',{bubbles:true}));const n=document.querySelector('#import-name');n.value='Phase4 冒烟词书';n.dispatchEvent(new Event('input',{bubbles:true}));return 'ok';})()`);
        await click('#parse-paste');
        await wait(`!document.querySelector('#import-confirm').disabled`, 'import ready');
        await click('#import-confirm');
        await wait(`document.querySelector('#main').textContent.includes('6 个词')`, 'imported');
    }
    if (!(await ev(`!!document.querySelector('#plan-panel')`))) {
        await click('#plan-create');
        await wait(`!!document.querySelector('#plan-panel')`, 'plan created');
    }
    const planText = await text('#plan-panel');
    check('今日计划包含真实句任务', /句子|语法/.test(planText), planText.slice(0, 80));
    const plan = JSON.parse(await rows('dailyPlans'))[0];
    const sentenceTasks = plan.initialPlan.filter(t => t.module === 'sentence');
    check('句任务绑定真实句 id 且在预算内',
        sentenceTasks.length >= 1 && sentenceTasks.every(t => (t.refs || []).length >= 1) && plan.initialPlan.reduce((n, t) => n + t.minutes, 0) <= plan.availableMinutes,
        JSON.stringify(sentenceTasks.map(t => [t.kind, t.refs, t.minutes])));
    const started = await ev(`(()=>{const c=[...document.querySelectorAll('.plan-task')].find(x=>/句子|语法/.test(x.textContent));if(!c)return 'no-card';const b=c.querySelector('[data-task-start]');if(!b)return 'not-startable';b.click();return 'ok';})()`);
    check('句任务可从计划直接开始', started === 'ok', started);
    await wait(`!!document.querySelector('#lab-sentence')`, 'lab from plan', 20000);
    check('从计划进入真实拆句训练', (await text('#lab-page')).includes('预教词'));

    // —— 7. 控制台错误 ——
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
    console.log(`\n—— Phase 4 浏览器冒烟：${results.length - failed.length}/${results.length} 通过 ——`);
    fs.writeFileSync(process.env.SMOKE_OUT || 'phase4-smoke-result.json', JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
    process.exit(failed.length ? 1 : 0);
}
