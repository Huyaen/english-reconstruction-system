import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { indexedDB } from 'fake-indexeddb';
import { randomUUID } from 'node:crypto';
import { curatedById, curatedSentenceRecords } from '../src/sentenceSources.ts';
import { buildLabPlan } from '../src/sentenceLab.ts';
import { readStructure } from '../src/sentenceStructure.ts';
import { DB_NAME } from '../src/db.ts';
// Phase 4 UI 集成（jsdom + fake-indexeddb）：真实 DOM、真实 IndexedDB，不触碰浏览器数据。
const NOW = 1700000000000;
const POOL = curatedSentenceRecords(NOW);
async function harness() {
    const output = await build({ entryPoints: ['src/app.ts'], bundle: true, format: 'iife', write: false, loader: { '.css': 'empty' } });
    const dom = new JSDOM('<div id="app"></div><div id="toast"></div><dialog id="modal"></dialog>', { url: 'http://localhost:4173/?proto=legacy', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    Object.assign(w, { indexedDB, structuredClone, TextDecoder, TextEncoder });
    Object.defineProperty(w.crypto, 'randomUUID', { value: randomUUID });
    Object.defineProperty(w.navigator, 'locks', { value: { request: (_n: unknown, _o: unknown, fn: (l: object) => unknown) => fn({}) } });
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; };
    w.eval(output.outputFiles[0].text);
    return dom;
}
async function until(w: JSDOM['window'], fn: () => boolean, what = 'condition') {
    const t = Date.now();
    while (!fn()) {
        if (Date.now() - t > 8000)
            throw Error('UI timeout: ' + what + ' · toast=' + (w.document.querySelector('#toast')?.textContent ?? '') + ' · main=' + (w.document.querySelector('#main')?.textContent?.slice(0, 160) ?? ''));
        await new Promise(r => setTimeout(r, 10));
    }
}
function click(w: JSDOM['window'], selector: string) {
    const e = w.document.querySelector<HTMLElement>(selector);
    assert.ok(e, 'missing ' + selector);
    e.click();
}
function expectedSteps(id: string) {
    const record = curatedById(id)!;
    const structure = readStructure(record.structure, record.id, record.text).structure;
    const plan = buildLabPlan(record, structure, POOL.filter(p => p.id !== id));
    return plan.steps;
}
function idbRows(w: JSDOM['window'], store: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
        const r = w.indexedDB.open(DB_NAME);
        r.onsuccess = () => {
            const db = r.result;
            const tx = db.transaction(store);
            const q = tx.objectStore(store).getAll();
            q.onsuccess = () => { resolve(q.result as any[]); db.close(); };
            q.onerror = () => reject(q.error);
        };
        r.onerror = () => reject(r.error);
    });
}
// 走完一整句；wrongStep 指定的那一步故意答错（并检查 JIT 卡片），其余答对。
// 注意：#lab-next 一律推进到下一步（答错也不会原地重来），因此错误证据会被如实记录。
async function answerSentence(w: JSDOM['window'], id: string, opts: {
    hints?: number;
    wrongStep?: number;
} = {}) {
    const steps = expectedSteps(id);
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        if (opts.wrongStep === i) {
            click(w, `[data-lab-option="${step.options.find(o => o.id !== step.correctId)!.id}"]`);
            await until(w, () => !!w.document.querySelector('.lab-feedback.bad'), `wrong feedback step ${i + 1}`);
            const fb = w.document.querySelector('.lab-feedback')!;
            assert.ok(fb.textContent!.includes('错误类型'), '错误反馈必须给出错误类型');
            assert.ok(fb.textContent!.length > 40, '错误反馈必须具体，而不是只报对错');
            assert.ok(w.document.querySelector('[data-jit]'), '答错后必须能打开知识卡');
            click(w, '[data-jit]');
            await until(w, () => w.document.querySelector('#modal')!.textContent!.includes('规则'), 'jit card');
            assert.ok(w.document.querySelector('#modal')!.textContent!.includes('为什么'));
            click(w, '#jit-back');
        }
        else {
            for (let h = 0; h < (opts.hints ?? 0); h++)
                click(w, '#lab-hint');
            click(w, `[data-lab-option="${step.correctId}"]`);
            await until(w, () => !!w.document.querySelector('.lab-feedback'), `第 ${i + 1} 步反馈`);
        }
        click(w, '#lab-next');
    }
    await until(w, () => !!w.document.querySelector('#lab-tree'), 'lab results');
}
test('Phase 4 UI：句子训练全流程（拆句 → 反馈/JIT → 独立证据 → 迁移 → 看答案不计掌握 → 语法图谱）', async () => {
    const dom = await harness();
    const w = dom.window;
    try {
        await until(w, () => !!w.document.querySelector('#plan-setup, #plan-panel'), 'home');
        click(w, '[data-nav="sentence"]');
        await until(w, () => !!w.document.querySelector('#sentence-page'), 'sentence page');
        const page = w.document.querySelector('#sentence-page')!.textContent!;
        assert.ok(page.includes('练习句'), '句源必须明示 authored 教学句');
        // Phase 16.2：AI 未配置时既不能声称有 AI 句，也不能说「功能没开放」——必须说清是哪一环缺
        assert.ok(page.includes('还没设置 AI 服务'), 'AI 未配置时必须说明原因');
        assert.equal(page.includes('功能还没有开放'), false, '生成功能已实现，不能谎称没开放');
        assert.equal(/AI 生成的句子 \d+%/.test(page), false, '没有 AI 句时不能给出 AI 占比');
        assert.equal(w.document.querySelectorAll('[data-sentence-start]').length >= 12, true, '句库应有 12 条教学句');
        // 1) 独立完成：定语从句句
        click(w, '[data-sentence-start="sen.curated.relative-01"]');
        await until(w, () => !!w.document.querySelector('#lab-sentence'), 'lab start');
        assert.ok(w.document.querySelector('#lab-sentence')!.textContent!.includes('The report'));
        assert.equal(w.document.querySelector('#lab-question')!.textContent!.includes('主语'), true);
        assert.ok(w.document.querySelector('#lab-page')!.textContent!.includes('预教词'), '必须给出预教词，避免被生词卡死');
        // 不给整句翻译
        assert.equal(w.document.querySelector('#main')!.textContent!.includes('我读的那本书'), false);
        await answerSentence(w, 'sen.curated.relative-01');
        const result = w.document.querySelector('#main')!.textContent!;
        assert.ok(result.includes('自己答对') && result.includes('会算进语法掌握'));
        assert.ok(result.includes('结构树'));
        const tokens = [...w.document.querySelectorAll('#lab-tree .token b')].map(e => e.textContent);
        // 结构树按"主句骨架 → 从句"分组（就是拆句顺序），组内保持原词序
        assert.deepEqual(tokens, ['The', 'report', 'is', 'missing.', 'that', 'he', 'wrote', 'about', 'the', 'flood'], '结构树必须先给主句骨架，再给从句');
        assert.equal(w.document.querySelectorAll('#lab-tree .tree-clause').length, 2);
        assert.ok(result.includes('定语从句'), '从句类型必须可见');
        assert.ok(result.includes('整句意思'), '结果页才揭示意义');
        // 证据落库
        const attempts = await idbRows(w, 'sentenceAttempts');
        assert.equal(attempts.length, 1);
        assert.equal(attempts[0].sentenceId, 'sen.curated.relative-01');
        assert.equal(attempts[0].structureCorrect, true);
        assert.equal(attempts[0].maxSupportLevel, 0);
        assert.equal(attempts[0].evidenceClass, 'independent');
        const gr = await idbRows(w, 'grammarAttempts');
        assert.ok(gr.length >= 2, '每个覆盖的语法概念都要落一条证据');
        const concepts = await idbRows(w, 'grammarConcepts');
        const subj = concepts.find(c => c.id === 'structure.subject')!;
        assert.ok(subj.mastery > 0.25, '独立完成后验必须上升');
        const sentences = await idbRows(w, 'sentences');
        assert.equal(sentences.length, 12);
        assert.equal(sentences.find(s => s.id === 'sen.curated.relative-01')!.usedCount, 1, '句库必须记录使用次数');
        const masteryAfterFirst = subj.mastery;
        // 2) 迁移验证：换一句同结构新句，独立完成 → 强证据
        click(w, '#lab-transfer');
        await until(w, () => !!w.document.querySelector('#lab-sentence'), 'transfer sentence');
        const transferText = w.document.querySelector('#lab-sentence')!.textContent!;
        assert.ok(transferText.length > 5 && !transferText.includes('The report'));
        assert.ok(w.document.querySelector('#main')!.textContent!.includes('这句结构一样'));
        const transferId = POOL.find(p => transferText.includes(p.text))!.id;
        await answerSentence(w, transferId);
        assert.ok(w.document.querySelector('#main')!.textContent!.includes('换一句也答对'));
        const attempts2 = await idbRows(w, 'sentenceAttempts');
        assert.equal(attempts2.length, 2);
        assert.equal(attempts2[1].transferOf, 'sen.curated.relative-01', '迁移复测必须记录来源句');
        click(w, '#lab-next-sentence');
        await until(w, () => !!w.document.querySelector('#sentence-page'), 'back to sentence page');
        // 3) 答错一步：如实记为"独立作答错误"（负证据），不得计入掌握
        click(w, '[data-sentence-start="sen.curated.adverbial-01"]');
        await until(w, () => !!w.document.querySelector('#lab-sentence'), 'third sentence');
        await answerSentence(w, 'sen.curated.adverbial-01', { wrongStep: 0 });
        const wrongResult = w.document.querySelector('#main')!.textContent!;
        assert.ok(wrongResult.includes('自己答错了'), '答错必须如实分级');
        assert.ok(wrongResult.includes('会算进语法掌握'), '独立错误应作为负证据影响估算');
        const attempts3 = await idbRows(w, 'sentenceAttempts');
        assert.equal(attempts3.length, 3);
        assert.equal(attempts3[2].structureCorrect, false);
        assert.equal(attempts3[2].evidenceClass, 'error');
        click(w, '#lab-next-sentence');
        await until(w, () => !!w.document.querySelector('#sentence-page'), 'sentence page again');
        // 4) L3 提示后正确 → 只计接触，不推进后验
        const beforeAll = await idbRows(w, 'grammarConcepts');
        click(w, '[data-sentence-start="sen.curated.passive-01"]');
        await until(w, () => !!w.document.querySelector('#lab-sentence'), 'fourth sentence');
        await answerSentence(w, 'sen.curated.passive-01', { hints: 3 });
        const hinted = w.document.querySelector('#main')!.textContent!;
        assert.ok(hinted.includes('不算掌握'), '看答案必须明确不计入掌握');
        assert.ok(hinted.includes('看过解释'));
        const afterAll = await idbRows(w, 'grammarConcepts');
        const touched = beforeAll.filter(b => afterAll.find(a => a.id === b.id)!.attempts > b.attempts);
        assert.ok(touched.length >= 1, '接触次数仍应记录');
        assert.ok(beforeAll.every(b => afterAll.find(a => a.id === b.id)!.mastery === b.mastery), '看答案不得改变任何概念的掌握估算');
        assert.ok(masteryAfterFirst > 0);
        // 5) 语法图谱页：概念、详情、知识卡、真实证据
        click(w, '#lab-next-sentence');
        await until(w, () => !!w.document.querySelector('#sentence-page'), 'sentence page final');
        click(w, '[data-nav="grammar"]');
        await until(w, () => !!w.document.querySelector('#grammar-page'), 'grammar page');
        assert.ok(w.document.querySelectorAll('[data-concept]').length >= 30);
        const grammarText = w.document.querySelector('#grammar-page')!.textContent!;
        assert.ok(grammarText.includes('把句子拆开看'));
        assert.ok(grammarText.includes('概念之间的关系检查通过'), '图谱必须自检通过（无环、无缺失先修）');
        assert.ok(grammarText.includes('需要优先处理'), '有错误的概念必须进入优先处理列表');
        click(w, '[data-concept="clause.relative"]');
        await until(w, () => !!w.document.querySelector('#concept-detail'), 'concept detail');
        const detail = w.document.querySelector('#concept-detail')!.textContent!;
        assert.ok(detail.includes('定语从句'));
        assert.ok(detail.includes('先修'));
        assert.ok(detail.includes('知识卡'));
        assert.ok(detail.includes('最近练过'));
        assert.ok(detail.includes('真实训练句'));
        assert.ok(w.document.querySelectorAll('[data-sentence-start]').length >= 1, '概念页应能跳到真实训练句');
    }
    finally {
        dom.window.close();
    }
});
test('Phase 4 UI：Today 计划包含真实句任务，点击后进入拆句训练', async () => {
    const dom = await harness();
    const w = dom.window;
    try {
        await until(w, () => !!w.document.querySelector('#plan-setup, #plan-panel'), 'home');
        // 导入 6 个词，确保计划里有词汇块
        const paste = w.document.querySelector<HTMLTextAreaElement>('#paste-words');
        if (paste) {
            paste.value = 'abandon 放弃\nadequate 充足的\nreluctant 不情愿的\nreliable 可靠的\nmaintain 维持\nobvious 明显的';
            paste.dispatchEvent(new w.Event('input', { bubbles: true }));
            click(w, '#parse-paste');
            await until(w, () => !w.document.querySelector<HTMLButtonElement>('#import-confirm')!.disabled, 'import ready');
            click(w, '#import-confirm');
            await until(w, () => w.document.querySelector('#main')!.textContent!.includes('6 个词'), 'imported');
        }
        if (!w.document.querySelector('#plan-panel')) {
            click(w, '#plan-create');
            await until(w, () => !!w.document.querySelector('#plan-panel'), 'plan created');
        }
        const plan = w.document.querySelector('#plan-panel')!.textContent!;
        assert.ok(/句子|语法/.test(plan), `计划里必须有真实句任务：${plan.slice(0, 300)}`);
        const sentenceCard = [...w.document.querySelectorAll<HTMLElement>('.plan-task')]
            .find(c => (c.textContent ?? '').includes('句子') || (c.textContent ?? '').includes('语法'));
        assert.ok(sentenceCard, '找不到句子任务卡');
        // 句任务的时间与预算必须自洽
        assert.ok(/分钟/.test(sentenceCard!.textContent!));
        const start = sentenceCard!.querySelector<HTMLElement>('[data-task-start]');
        assert.ok(start, '句子任务必须可开始');
        start!.click();
        await until(w, () => !!w.document.querySelector('#lab-sentence'), 'lab from plan');
        assert.ok(w.document.querySelector('#lab-sentence')!.textContent!.length > 10);
        // 页面里不得出现"未上线"的句子模块文案
        assert.equal(w.document.querySelector('#main')!.textContent!.includes('句子与语法（phase4）'), false);
    }
    finally {
        dom.window.close();
    }
});
