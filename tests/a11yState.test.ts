import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { indexedDB } from 'fake-indexeddb';
import { randomUUID } from 'node:crypto';

// Phase 15h.1 无障碍状态测试：断言的是"状态变化"，不是"属性存在"。
// 每一项都对应一个真实业务状态（用户操作后必须改变，未操作时不得预设）。
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
            throw Error('UI timeout: ' + what + ' · main=' + (w.document.querySelector('#main')?.textContent?.slice(0, 160) ?? ''));
        await new Promise(r => setTimeout(r, 10));
    }
}
function click(w: JSDOM['window'], sel: string) {
    const e = w.document.querySelector<HTMLElement>(sel);
    assert.ok(e, 'missing ' + sel);
    e.click();
}
function value(w: JSDOM['window'], sel: string, v: string) {
    const e = w.document.querySelector<HTMLInputElement>(sel);
    assert.ok(e, 'missing ' + sel);
    e.value = v;
    e.dispatchEvent(new w.Event('input', { bubbles: true }));
}
async function seedBook(w: JSDOM['window']) {
    await until(w, () => !!w.document.querySelector('#import'), '#import');
    click(w, '#import');
    await until(w, () => !!w.document.querySelector('#import-name'), 'import dialog');
    value(w, '#import-name', 'a11y 词书');
    value(w, '#paste-words', 'abandon 放弃\nadequate 充足的\nreluctant 不情愿的\nreliable 可靠的\nmaintain 维持\nobvious 明显的');
    click(w, '#parse-paste');
    await until(w, () => !w.document.querySelector<HTMLButtonElement>('#import-confirm')!.disabled, 'import ready');
    click(w, '#import-confirm');
    // 新 UI 以 toast 确认导入（面板不强制关闭），随后以词库页真实出现单词为完成条件
    await until(w, () => (w.document.querySelector('#toast')?.textContent ?? '').includes('已导入'), 'import toast', 8000);
    click(w, '[data-nav="books"]');
    await until(w, () => (w.document.querySelector('#main')?.textContent ?? '').includes('abandon'), 'book rows');
}

test('句子作答：未答时无判定，答后恰好一个正确项，误选项单独标记', async () => {
    const dom = await harness(), w = dom.window;
    await seedBook(w);
    click(w, '[data-nav="sentence"]');
    await until(w, () => !!w.document.querySelector('#sentence-page'), 'sentence page');
    click(w, '[data-sentence-start]');
    await until(w, () => !!w.document.querySelector('#lab-sentence'), 'lab start');

    const before = [...w.document.querySelectorAll('.lab-option')].map(b => b.getAttribute('data-verdict'));
    assert.ok(before.length >= 2, '至少两个选项');
    assert.equal(before.every(v => v === 'pending'), true, `未作答时不得预设判定：${before.join(',')}`);

    const options = [...w.document.querySelectorAll<HTMLElement>('.lab-option')];
    options[0].click();
    await until(w, () => !!w.document.querySelector('.lab-feedback'), 'feedback');

    const after = [...w.document.querySelectorAll<HTMLElement>('.lab-option')].map(b => ({
        verdict: b.getAttribute('data-verdict'),
        picked: b.classList.contains('picked'),
    }));
    assert.equal(after.filter(x => x.verdict === 'correct').length, 1, `答后必须恰有一个正确项：${JSON.stringify(after)}`);
    assert.equal(after.filter(x => x.picked).length, 1, '用户只选了一项');
    const correct = w.document.querySelector('.lab-feedback.ok') !== null;
    assert.equal(after.filter(x => x.verdict === 'wrong').length, correct ? 0 : 1,
        `答${correct ? '对' : '错'}时误选标记数不符：${JSON.stringify(after)}`);
});

test('句法步骤条：data-step 随进度真实递增，data-total 恒定', async () => {
    const dom = await harness(), w = dom.window;
    await seedBook(w);
    click(w, '[data-nav="sentence"]');
    await until(w, () => !!w.document.querySelector('#sentence-page'), 'sentence page');
    click(w, '[data-sentence-start]');
    await until(w, () => !!w.document.querySelector('.lab-progress'), 'progress');

    const first = w.document.querySelector<HTMLElement>('.lab-progress')!;
    const total = first.getAttribute('data-total');
    assert.ok(total && Number(total) >= 2, `data-total 必须是真实总步数：${total}`);
    assert.equal(first.getAttribute('data-step'), '1', '第一步');

    click(w, '[data-lab-option]');
    await until(w, () => !!w.document.querySelector('#lab-next'), 'next button');
    click(w, '#lab-next');
    await until(w, () => {
        const p = w.document.querySelector<HTMLElement>('.lab-progress');
        return !!p && p.getAttribute('data-step') === '2';
    }, 'step advanced to 2');
    assert.equal(w.document.querySelector<HTMLElement>('.lab-progress')!.getAttribute('data-total'), total, '总步数不得随进度变化');
});

test('语法类别筛选：aria-pressed 单选切换（旧选项必须回到 false）', async () => {
    const dom = await harness(), w = dom.window;
    await seedBook(w);
    click(w, '[data-nav="grammar"]');
    await until(w, () => !!w.document.querySelector('#grammar-page'), 'grammar page');

    const chips = [...w.document.querySelectorAll<HTMLElement>('[data-gcat]')];
    assert.ok(chips.length >= 2, '至少两个类别');
    const pressed = chips.filter(c => c.getAttribute('aria-pressed') === 'true');
    assert.equal(pressed.length, 1, `筛选必须单选：${chips.map(c => `${c.dataset.gcat}=${c.getAttribute('aria-pressed')}`).join(' ')}`);

    const target = chips.find(c => c.getAttribute('aria-pressed') !== 'true')!;
    const key = target.dataset.gcat;
    target.click();
    await until(w, () => {
        const now = [...w.document.querySelectorAll<HTMLElement>('[data-gcat]')].find(c => c.dataset.gcat === key);
        return now?.getAttribute('aria-pressed') === 'true';
    }, 'pressed moved');

    const after = [...w.document.querySelectorAll<HTMLElement>('[data-gcat]')];
    assert.equal(after.filter(c => c.getAttribute('aria-pressed') === 'true').length, 1, '切换后仍必须只有一个按下');
    assert.equal(after.find(c => c.dataset.gcat === key)!.getAttribute('aria-pressed'), 'true');
});

test('考试页签：aria-pressed 随切换转移', async () => {
    const dom = await harness(), w = dom.window;
    await seedBook(w);
    click(w, '[data-nav="exam"]');
    await until(w, () => !!w.document.querySelector('[data-exam-tab]'), 'exam tabs');

    const first = w.document.querySelector<HTMLElement>('[data-exam-tab="overview"]')!;
    assert.equal(first.getAttribute('aria-pressed'), 'true', '默认概览页签按下');

    click(w, '[data-exam-tab="practice"]');
    await until(w, () => w.document.querySelector('[data-exam-tab="practice"]')!.getAttribute('aria-pressed') === 'true', 'practice pressed');
    assert.equal(w.document.querySelector('[data-exam-tab="overview"]')!.getAttribute('aria-pressed'), 'false', '旧页签必须释放');
});

test('表达类型：aria-pressed 跟随真实选择，不跟随视觉类', async () => {
    const dom = await harness(), w = dom.window;
    await seedBook(w);
    click(w, '[data-nav="output"]');
    await until(w, () => !!w.document.querySelector('[data-out-type]'), 'output types');

    const chips = [...w.document.querySelectorAll<HTMLElement>('[data-out-type]')];
    // 未开始时没有选中类型是正确语义（0 个 pressed）；先真实选一个，再验证转移
    assert.ok(chips.filter(c => c.getAttribute('aria-pressed') === 'true').length <= 1, '最多一个按下');
    const target = chips.find(c => c.getAttribute('aria-pressed') !== 'true')!;
    const key = target.dataset.outType;
    target.click();
    await until(w, () => w.document.querySelector(`[data-out-type="${key}"]`)!.getAttribute('aria-pressed') === 'true', 'type switched');
    const now = [...w.document.querySelectorAll<HTMLElement>('[data-out-type]')];
    assert.equal(now.filter(c => c.getAttribute('aria-pressed') === 'true').length, 1);
    const active = now.filter(c => c.classList.contains('active'));
    assert.deepEqual(active.map(c => c.dataset.outType), [key], '视觉 active 与 aria-pressed 必须一致');
});

test('诊断证据质量：data-quality 只取真实枚举值', async () => {
    const dom = await harness(), w = dom.window;
    await seedBook(w);
    click(w, '[data-nav="diagnostics"]');
    await until(w, () => !!w.document.querySelector('.diag-metric'), 'diag metrics');

    const allowed = new Set(['verified', 'task-behavior', 'mixed', 'self-report', 'none']);
    const metrics = [...w.document.querySelectorAll<HTMLElement>('.diag-metric[data-quality]')];
    assert.ok(metrics.length >= 3, `诊断指标应有多条：${metrics.length}`);
    for (const m of metrics)
        assert.ok(allowed.has(m.dataset.quality!), `非法质量值 ${m.dataset.quality}（${m.textContent?.slice(0, 24)}）`);
    assert.ok(metrics.every(m => m.hasAttribute('data-evaluability')), '每条指标都要能判断是否可评估');
});

test('表达自动保存：live region 文本随真实保存过程变化', async () => {
    const dom = await harness(), w = dom.window;
    await seedBook(w);
    click(w, '[data-nav="output"]');
    await until(w, () => !!w.document.querySelector('[data-out-start]'), 'output list');
    click(w, '[data-out-start]');
    await until(w, () => !!w.document.querySelector('#out-editor'), 'editor');

    const el = w.document.querySelector<HTMLElement>('#out-save-state')!;
    assert.equal(el.getAttribute('role'), 'status', '保存状态必须是 status');
    assert.equal(el.getAttribute('aria-live'), 'polite', '保存状态必须 polite 播报');

    const seen = new Set<string>([el.textContent ?? '']);
    const obs = new w.MutationObserver(() => seen.add(el.textContent ?? ''));
    obs.observe(el, { childList: true, characterData: true, subtree: true });
    value(w, '#out-editor', 'The city changed quickly, and nobody explained why.');
    const t = Date.now();
    while (seen.size < 2 && Date.now() - t < 4000)
        await new Promise(r => setTimeout(r, 40));
    obs.disconnect();
    assert.ok(seen.size >= 2, `保存状态必须随保存动作变化，实际只见到：${[...seen].join(' | ')}`);
});
