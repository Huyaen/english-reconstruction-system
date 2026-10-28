import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { indexedDB } from 'fake-indexeddb';
import { randomUUID } from 'node:crypto';

// Phase 15h.2 布局/可读性契约。
// 这里断言的是**结构性事实**，不是像素：
//  1. 导航后 #main 在同一 tick 内就必须有内容（占位也算），架构上不允许"裸背景"；
//  2. 考试单选的行序必须是 圆点 → 标识 → 正文（P1 的 893px 输入框把文字顶到最右，
//     根因是 flex 子项被全局 input{width:100%} 拉满，结构断言能守住这个形态）；
//  3. 判题后的选项不得靠内联 opacity 压暗（那样连正确答案也一起变灰）。
async function harness() {
    const output = await build({ entryPoints: ['src/app.ts'], bundle: true, format: 'iife', write: false, loader: { '.css': 'empty' } });
    const dom = new JSDOM('<div id="app"></div><div id="toast"></div><dialog id="modal"></dialog>', { url: 'http://localhost:4173/?test=1', runScripts: 'outside-only', pretendToBeVisual: true });
    const w = dom.window;
    Object.assign(w, { indexedDB, structuredClone, TextDecoder, TextEncoder });
    Object.defineProperty(w.crypto, 'randomUUID', { value: randomUUID });
    Object.defineProperty(w.navigator, 'locks', { value: { request: (_n: unknown, _o: unknown, fn: (l: object) => unknown) => fn({}) } });
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; };
    w.eval(output.outputFiles[0].text);
    return dom;
}
async function until(w: JSDOM['window'], fn: () => boolean, what = 'condition', ms = 6000) {
    const t = Date.now();
    while (!fn()) {
        if (Date.now() - t > ms)
            throw Error('UI timeout: ' + what + ' · main=' + (w.document.querySelector('#main')?.textContent?.slice(0, 120) ?? ''));
        await new Promise(r => setTimeout(r, 10));
    }
}
function click(w: JSDOM['window'], sel: string) {
    const e = w.document.querySelector<HTMLElement>(sel);
    assert.ok(e, 'missing ' + sel);
    e.click();
}

async function toChoiceItem(w: JSDOM['window']) {
    // 练习会话可能先给开放题（没有选项），翻到有选项的题再断言
    for (let i = 0; i < 6; i++) {
        if (w.document.querySelector('.exam-option'))
            return;
        const next = w.document.querySelector<HTMLElement>('#exam-next');
        if (!next)
            break;
        next.click();
        await new Promise(r => setTimeout(r, 120));
    }
}

test('导航后 #main 不允许出现空壳（同步渲染契约）', async () => {
    const { window: w } = await harness();
    await until(w, () => !!w.document.querySelector('#main'));
    const pages = ['books', 'weak', 'sentence', 'reading', 'input', 'output', 'grammar', 'unit', 'diagnostics', 'exam', 'stats', 'ai', 'settings', 'home'];
    for (const p of pages) {
        const btn = w.document.querySelector<HTMLElement>(`[data-nav="${p}"]`);
        assert.ok(btn, 'missing nav ' + p);
        btn.click();
        // 关键：不 await。setPage 必须同步产出内容或占位，否则就会出现"主内容消失"的一帧。
        const main = w.document.querySelector('#main')!;
        assert.ok(main.children.length > 0, `${p}: #main 在点击后立刻是空的`);
        assert.ok((main.textContent ?? '').trim().length > 0, `${p}: #main 没有可读文本（占位也应有）`);
        await new Promise(r => setTimeout(r, 30));
    }
});

test('考试单选的行序是 圆点 → 标识 → 正文，且输入框不是撑满行的 flex 子项', async () => {
    const { window: w } = await harness();
    await until(w, () => !!w.document.querySelector('[data-nav="exam"]'));
    click(w, '[data-nav="exam"]');
    await until(w, () => !!w.document.querySelector('#exam-start-mixed'), 'exam overview');
    click(w, '#exam-start-mixed');
    await until(w, () => !!w.document.querySelector('.exam-item, #exam-next'), 'exam session', 8000);
    await toChoiceItem(w);
    const rows = [...w.document.querySelectorAll<HTMLElement>('.exam-option')];
    assert.ok(rows.length > 0, '没有翻到带选项的题');
    assert.ok(rows.length >= 2, 'expected at least 2 options');
    for (const row of rows) {
        const kids = [...row.children] as HTMLElement[];
        assert.equal(kids[0].tagName, 'INPUT', '第一个子元素必须是 radio');
        assert.equal((kids[0] as HTMLInputElement).type, 'radio');
        assert.equal(kids[1].className, 'exam-option-id', '第二个子元素必须是选项标识');
        assert.ok((kids[2].textContent ?? '').trim().length > 0, '第三个子元素必须是答案正文');
    }
});

test('点选考试选项后整行立刻出现 selected（不只原生圆点）', async () => {
    const { window: w } = await harness();
    await until(w, () => !!w.document.querySelector('[data-nav="exam"]'));
    click(w, '[data-nav="exam"]');
    await until(w, () => !!w.document.querySelector('#exam-start-mixed'), 'exam overview');
    click(w, '#exam-start-mixed');
    await until(w, () => !!w.document.querySelector('.exam-item, #exam-next'), 'exam session', 8000);
    await toChoiceItem(w);
    const input = w.document.querySelector<HTMLInputElement>('.exam-option input[type="radio"]');
    assert.ok(input, '没有翻到带选项的题');
    input.checked = true;
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    const rows = [...w.document.querySelectorAll<HTMLElement>('.exam-option')];
    assert.equal(rows.filter(r => r.classList.contains('selected')).length, 1, '应恰好有一行选中');
    assert.ok(rows[0].classList.contains('selected'));
    // 换选：旧行必须失去 selected
    const second = w.document.querySelectorAll<HTMLInputElement>('.exam-option input[type="radio"]')[1]!;
    second.checked = true;
    second.dispatchEvent(new w.Event('change', { bubbles: true }));
    const after = [...w.document.querySelectorAll<HTMLElement>('.exam-option')];
    assert.equal(after.filter(r => r.classList.contains('selected')).length, 1, '换选后仍只能有一行');
    assert.ok(!after[0].classList.contains('selected'), '旧行必须取消选中');
    assert.ok(after[1].classList.contains('selected'));
});

test('句子判题后的选项带 data-verdict，且不靠内联 opacity 压暗', async () => {
    const { window: w } = await harness();
    await until(w, () => !!w.document.querySelector('[data-nav="sentence"]'));
    click(w, '[data-nav="sentence"]');
    await until(w, () => !!w.document.querySelector('[data-sentence-start]'), 'sentence page');
    click(w, '[data-sentence-start]');
    await until(w, () => w.document.querySelectorAll('.lab-option').length > 0, 'lab options');
    click(w, '.lab-option');
    await until(w, () => !!w.document.querySelector('.lab-feedback'), 'feedback');
    const opts = [...w.document.querySelectorAll<HTMLElement>('.lab-option')];
    assert.ok(opts.length >= 2);
    for (const o of opts) {
        assert.ok(o.getAttribute('data-verdict'), '每个选项都要有真实判定值');
        assert.ok(['correct', 'wrong', 'neutral', 'pending'].includes(o.getAttribute('data-verdict')!));
        const inline = o.getAttribute('style') ?? '';
        assert.ok(!/opacity/i.test(inline), '判定态不得用内联 opacity 压暗（会让正确答案一起变灰）');
    }
    assert.equal(opts.filter(o => o.getAttribute('data-verdict') === 'correct').length, 1, '必须恰好一个正确项');
});
