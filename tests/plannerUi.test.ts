import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { indexedDB } from 'fake-indexeddb';
import { randomUUID } from 'node:crypto';
// Phase 3 UI 集成（jsdom + fake-indexeddb）：不触碰用户真实浏览器学习数据。
async function harness() {
    const output = await build({ entryPoints: ['src/app.ts'], bundle: true, format: 'iife', write: false, loader: { '.css': 'empty' } });
    const dom = new JSDOM('<div id="app"></div><div id="toast"></div><dialog id="modal"></dialog>', { url: 'http://localhost:4173', runScripts: 'outside-only', pretendToBeVisual: true });
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
        if (Date.now() - t > 6000)
            throw Error('UI timeout: ' + what + ' · toast=' + (w.document.querySelector('#toast')?.textContent ?? '') + ' · main=' + (w.document.querySelector('#main')?.textContent?.slice(0, 120) ?? ''));
        await new Promise(r => setTimeout(r, 10));
    }
}
const PAIRS: Record<string, string> = { abandon: '放弃', adequate: '充足的', reluctant: '不情愿的', reliable: '可靠的', maintain: '维持', obvious: '明显的' };
function click(w: JSDOM['window'], selector: string) { const e = w.document.querySelector<HTMLElement>(selector); assert.ok(e, 'missing ' + selector); e.click(); }
function value(w: JSDOM['window'], selector: string, v: string) { const e = w.document.querySelector<HTMLInputElement>(selector)!; e.value = v; e.dispatchEvent(new w.Event('input', { bubbles: true })); }
function card(w: JSDOM['window'], label: string): HTMLElement {
    const c = [...w.document.querySelectorAll<HTMLElement>('.plan-task')].find(x => (x.querySelector('.task-main')?.textContent ?? '').includes(label));
    assert.ok(c, `任务卡缺失：${label}（现有：${[...w.document.querySelectorAll('.plan-task')].map(x => x.textContent?.slice(0, 18)).join(' | ')}）`);
    return c;
}
function clickInCard(w: JSDOM['window'], label: string, action: 'start' | 'skip' | 'delay' | 'replace') {
    const el = card(w, label).querySelector<HTMLElement>(`[data-task-${action}]`);
    assert.ok(el, `${label} 缺少 ${action} 按钮`);
    el.click();
}
async function answerQuestions(w: JSDOM['window'], max: number) {
    for (let i = 0; i < max; i++) {
        if (w.document.querySelector('#back-home'))
            return;
        await until(w, () => !!w.document.querySelector('.answers') || !!w.document.querySelector('#back-home'), 'question or results');
        if (w.document.querySelector('#back-home'))
            return;
        const prompt = w.document.querySelector('#question-text')!.textContent!;
        const target = PAIRS[prompt] ?? Object.keys(PAIRS).find(k => PAIRS[k] === prompt);
        assert.ok(target, '无法匹配题目：' + prompt);
        const btn = [...w.document.querySelectorAll<HTMLButtonElement>('.answer')].find(b => b.querySelector('span')!.textContent === target);
        assert.ok(btn, '找不到正确选项：' + target);
        btn.click();
        await new Promise(r => setTimeout(r, 60));
    }
}
async function plans() {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('vocabulary-memory-v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const rows = await new Promise<any[]>((resolve, reject) => { const r = db.transaction('dailyPlans').objectStore('dailyPlans').getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    db.close();
    return rows;
}
test('Phase 3 UI：生成计划 → 预览 → Recall → 校准/重排 → Closing → 刷新恢复（含跳过/延后/替换不可用）', async () => {
    const dom = await harness(), w = dom.window;
    try {
        await until(w, () => !!w.document.querySelector('#import'), '#import');
        click(w, '#import');
        await until(w, () => !!w.document.querySelector('#import-name'), 'import dialog');
        value(w, '#import-name', '计划测试词书');
        value(w, '#paste-words', 'abandon 放弃\nadequate 充足的\nreluctant 不情愿的\nreliable 可靠的\nmaintain 维持\nobvious 明显的');
        click(w, '#parse-paste');
        await until(w, () => !w.document.querySelector<HTMLButtonElement>('#import-confirm')!.disabled, 'import ready');
        click(w, '#import-confirm');
        await until(w, () => w.document.querySelector('#main')!.textContent!.includes('6 个词'), 'imported');
        // 生成今日计划（默认 30 分钟 / 正常状态）
        assert.ok(w.document.querySelector('#plan-setup'), '未生成计划时应显示预算设置');
        click(w, '#plan-create');
        await until(w, () => !!w.document.querySelector('#plan-panel'), 'plan panel');
        assert.equal(w.document.querySelector('#plan-setup'), null);
        assert.ok(w.document.querySelector('#plan-panel')!.textContent!.includes('预算 30 分钟'));
        const labels = [...w.document.querySelectorAll('.plan-task')].map(c => c.querySelector('.task-main b')!.textContent!);
        // 顺序契约：预览 → Recall → （可选）句子/语法任务 → Closing 末位
        assert.ok(labels[0].includes('新词预览'), `首项必须是新词预览：${labels.join(' | ')}`);
        assert.ok(labels[1].includes('新词回忆'), `第二项必须是新词回忆：${labels.join(' | ')}`);
        assert.equal(labels[labels.length - 1], '今日收尾回忆', 'Closing 必须末位');
        assert.ok(labels.some(l => /句子|语法/.test(l)), `Phase 4 句任务必须进入今日计划：${labels.join(' | ')}`);
        assert.ok(labels.length >= 3 && labels.length <= 6, `任务数量应在合理范围：${labels.join(' | ')}`);
        const totalTasks = labels.length;
        const gating = w.document.querySelector('#plan-panel')!.textContent!;
        assert.equal(gating.includes('句子与语法（phase4）'), false, 'Phase 4 起句子模块已真实可用，不得再列为未上线');
        assert.equal(/阅读（phase5）/.test(gating), false, 'Phase 5 起阅读模块已真实可用，不得再列为未上线');
        assert.equal(/真实输入（phase/.test(gating), false, 'Phase 8 起真实输入已可用，不得再列为未上线');
        assert.equal(/输出（phase/.test(gating), false, 'Phase 9 起真实表达已可用，不得再列为未上线');
        assert.equal(/（disabled-this-session）/.test(gating), false, '没有模块处于会话级禁用');
        // 替换：没有同目标候选时必须明确不可用，不生成假任务
        clickInCard(w, '新词回忆', 'replace');
        await until(w, () => w.document.querySelector('#toast')!.textContent!.includes('没有可替换'), 'replace unavailable toast');
        // 延后：只在本日计划内重排
        clickInCard(w, '新词回忆', 'delay');
        await until(w, () => w.document.querySelector('#toast')!.textContent!.includes('已延后'), 'delay toast');
        assert.ok(card(w, '新词回忆').textContent!.includes('已延后'));
        // 执行 Preview 任务
        clickInCard(w, '新词预览', 'start');
        await until(w, () => !!w.document.querySelector('[data-preview]'), 'preview page');
        for (let i = 0; i < 6; i++) {
            click(w, '[data-preview="know"]');
            await new Promise(r => setTimeout(r, 30));
        }
        await until(w, () => !!w.document.querySelector('#back-home'), 'preview done');
        click(w, '#back-home');
        await until(w, () => !!w.document.querySelector('#plan-panel'), 'home plan panel');
        await until(w, () => card(w, '新词预览').textContent!.includes('已完成'), 'preview task marked done');
        await until(w, () => new RegExp(`完成 1/${totalTasks}`).test(w.document.querySelector('#plan-panel .section-title')!.textContent!), `progress 1/${totalTasks}`);
        // 前置依赖：新词回忆 在预览完成后才可执行
        clickInCard(w, '新词回忆', 'start');
        await until(w, () => !!w.document.querySelector('.answers'), 'recall started');
        await answerQuestions(w, 8);
        await until(w, () => !!w.document.querySelector('#back-home'), 'recall results');
        click(w, '#back-home');
        await until(w, () => !!w.document.querySelector('#plan-panel'), 'back home');
        await until(w, () => card(w, '新词回忆').textContent!.includes('已完成'), 'recall task marked done');
        await until(w, () => new RegExp(`完成 2/${totalTasks}`).test(w.document.querySelector('#plan-panel .section-title')!.textContent!), `progress 2/${totalTasks}`);
        // Regenerate：只重排未完成部分，保留已提交证据
        click(w, '#plan-regenerate');
        await until(w, () => w.document.querySelector('#toast')!.textContent!.includes('重排未完成任务'), 'regenerate toast');
        assert.ok(card(w, '新词预览').textContent!.includes('已完成'), '重排后已完成任务保留');
        assert.ok(card(w, '新词回忆').textContent!.includes('已完成'), '重排后已完成任务保留');
        const closingCard = card(w, '今日收尾回忆');
        assert.ok(closingCard.querySelector('[data-task-start]'), 'Closing 仍可执行');
        assert.equal([...w.document.querySelectorAll('.plan-task')].pop(), closingCard, 'Closing 始终是最后一个任务');
        assert.ok(!closingCard.textContent!.includes('0 个词'), 'Closing 必须使用真实词');
        // Closing Loop
        clickInCard(w, '今日收尾回忆', 'start');
        await until(w, () => !!w.document.querySelector('.answers'), 'closing started');
        await answerQuestions(w, 6);
        await until(w, () => !!w.document.querySelector('[data-closing]'), 'closing feedback');
        click(w, '[data-closing="just"]');
        await until(w, () => w.document.querySelector('#toast')!.textContent!.includes('今日收尾已记录'), 'closing saved');
        await until(w, () => !!w.document.querySelector('#plan-panel'), 'plan panel visible');
        // 重排可能在剩余预算内补入柔性任务（弱词强化 / Phase 4 句任务）：逐个跳过，验证「跳过只影响今天、不滚存」
        const openCount = () => [...w.document.querySelectorAll('.plan-task')].filter(c => c.querySelector('[data-task-start]')).length;
        const skipCount = () => [...w.document.querySelectorAll('.plan-task')].filter(c => c.textContent!.includes('已跳过')).length;
        for (let i = 0; i < 10 && openCount() > 0; i++) {
            const openTask = [...w.document.querySelectorAll<HTMLElement>('.plan-task')].find(c => c.querySelector('[data-task-start]'))!;
            const skipBtn = openTask.querySelector<HTMLElement>('[data-task-skip]');
            assert.ok(skipBtn, `未完成任务必须可跳过：${openTask.textContent!.slice(0, 40)}`);
            const beforeOpen = openCount(), beforeSkipped = skipCount();
            skipBtn!.click();
            await until(w, () => openCount() < beforeOpen && skipCount() > beforeSkipped, 'skip applied');
        }
        await until(w, () => !w.document.querySelector('.plan-task [data-task-start]'), 'no task left open');
        const title = w.document.querySelector('#plan-panel .section-title')!.textContent!;
        const total = w.document.querySelectorAll('.plan-task').length;
        const doneCount = [...w.document.querySelectorAll('.plan-task')].filter(c => c.textContent!.includes('已完成')).length;
        const settled = [...w.document.querySelectorAll('.plan-task')].filter(c => /已完成|已跳过|已替换/.test(c.textContent!)).length;
        assert.match(title, new RegExp(`完成 ${doneCount}/${total}`));
        assert.equal(settled, total, '跳过/替换为当天真实结果，不应留下可执行任务');
        const rows = await plans();
        assert.equal(rows.length, 1, '同一天只应存在一个计划');
        const stored: any = rows[0];
        assert.equal(stored.status, 'completed');
        assert.ok(stored.taskActions.some((a: any) => a.action === 'regenerate'));
        assert.equal(stored.closingLoop.feedback, 'just');
        assert.ok(stored.taskActions.filter((a: any) => a.action === 'start').length >= 3);
        assert.ok(stored.taskActions.filter((a: any) => a.action === 'complete').length >= 3);
        assert.ok(stored.adjustments.length >= 1 && stored.adjustments.every((a: any) => !!a.reason));
        assert.ok(stored.taskActions.some((a: any) => a.action === 'delay'));
        assert.ok(stored.taskActions.some((a: any) => a.action === 'skip'));
        assert.equal(stored.initialPlan.filter((t: any) => t.status === 'skipped').every((t: any) => t.minutes > 0), true);
        assert.equal(stored.revision >= 5, true);
        dom.window.close();
        // 刷新恢复：计划、任务状态、Closing 反馈全部保留；不重复生成
        const reopened = await harness();
        try {
            await until(w, () => !!reopened.window.document.querySelector('#plan-panel'), 'restored plan');
            await until(w, () => !reopened.window.document.querySelector('.plan-task [data-task-start]'), 'restored: nothing open');
            assert.equal(reopened.window.document.querySelector('#plan-setup'), null, '刷新后不得要求重新生成计划');
            const restoredTotal = reopened.window.document.querySelectorAll('.plan-task').length;
            const restoredDone = [...reopened.window.document.querySelectorAll('.plan-task')].filter(c => c.textContent!.includes('已完成')).length;
            const restoredSettled = [...reopened.window.document.querySelectorAll('.plan-task')].filter(c => /已完成|已跳过|已替换/.test(c.textContent!)).length;
            assert.match(reopened.window.document.querySelector('#plan-panel .section-title')!.textContent!, new RegExp(`完成 ${restoredDone}/${restoredTotal}`));
            assert.equal(restoredSettled, restoredTotal);
            assert.ok(card(reopened.window, '今日收尾回忆').textContent!.includes('已完成'));
            assert.equal((await plans()).length, 1);
        }
        finally {
            reopened.window.close();
        }
    }
    finally {
        dom.window.close();
    }
});
test('Phase 3 UI：时间预算自定义与非法输入校验', async () => {
    const dom = await harness(), w = dom.window;
    try {
        await until(w, () => !!w.document.querySelector('#import'), '#import');
        if (w.document.querySelector('#plan-setup')) {
            click(w, '#import');
            await until(w, () => !!w.document.querySelector('#import-name'), 'import dialog');
            value(w, '#import-name', '预算测试词书');
            value(w, '#paste-words', 'abandon 放弃\nadequate 充足的\nreluctant 不情愿的\nreliable 可靠的\nmaintain 维持\nobvious 明显的');
            click(w, '#parse-paste');
            await until(w, () => !w.document.querySelector<HTMLButtonElement>('#import-confirm')!.disabled, 'import ready');
            click(w, '#import-confirm');
            await until(w, () => !!w.document.querySelector('#plan-create'), 'plan setup');
            click(w, '#plan-create');
            await until(w, () => !!w.document.querySelector('#plan-panel'), 'plan created');
        }
        click(w, '[data-nav="settings"]');
        await until(w, () => !!w.document.querySelector('#settings-form'), 'settings');
        click(w, '[data-nav="home"]');
        await until(w, () => !!w.document.querySelector('#plan-panel'), 'plan panel');
        click(w, '#plan-regenerate');
        await until(w, () => /重排未完成任务|不能小于/.test(w.document.querySelector('#toast')!.textContent!), 'regenerate path');
        click(w, '#plan-adjust');
        await until(w, () => !!w.document.querySelector('#adjust-budget'), 'adjust dialog');
        value(w, '#adjust-budget', '0');
        click(w, '#adjust-save');
        await until(w, () => w.document.querySelector('#toast')!.textContent!.includes('不能小于'), 'invalid budget rejected');
        assert.equal((await plans()).length, 1);
    }
    finally {
        dom.window.close();
    }
});
