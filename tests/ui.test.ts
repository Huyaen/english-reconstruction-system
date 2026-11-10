import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { indexedDB } from 'fake-indexeddb';
import { randomUUID } from 'node:crypto';
// DOM integration, not a real-browser rendering test. Browser-only primitives are minimal harness adapters.
async function harness() { const output = await build({ entryPoints: ['src/app.ts'], bundle: true, format: 'iife', write: false, loader: { '.css': 'empty' } }); const dom = new JSDOM('<div id="app"></div><div id="toast"></div><dialog id="modal"></dialog>', { url: 'http://localhost:4173', runScripts: 'outside-only', pretendToBeVisual: true }); const w = dom.window; Object.assign(w, { indexedDB, structuredClone, TextDecoder, TextEncoder }); Object.defineProperty(w.crypto, 'randomUUID', { value: randomUUID }); Object.defineProperty(w.navigator, 'locks', { value: { request: (_n: unknown, _o: unknown, fn: (l: object) => unknown) => fn({}) } }); w.HTMLDialogElement.prototype.showModal = function () { this.open = true; }; w.HTMLDialogElement.prototype.close = function () { this.open = false; }; w.eval(output.outputFiles[0].text); return dom; }
async function until(fn: () => boolean) {
    const t = Date.now();
    while (!fn()) {
        if (Date.now() - t > 4000)
            throw Error('UI condition timed out');
        await new Promise(r => setTimeout(r, 10));
    }
}
function click(w: JSDOM['window'], selector: string) { const e = w.document.querySelector<HTMLElement>(selector); assert.ok(e, 'missing ' + selector); e.click(); }
function value(w: JSDOM['window'], selector: string, v: string) { const e = w.document.querySelector<HTMLInputElement>(selector)!; e.value = v; e.dispatchEvent(new w.Event('input', { bubbles: true })); }
test('real application DOM import, double-start protection, keyboard and reload persistence', async () => {
    const dom = await harness(), w = dom.window;
    try {
        await until(() => !!w.document.querySelector('#import'));
        click(w, '#import');
        await until(() => !!w.document.querySelector('#import-name'));
        value(w, '#import-name', 'UI test book');
        value(w, '#paste-words', 'abandon 放弃\nadequate 充足的\nreluctant 不情愿的\nreliable 可靠的\nmaintain 维持\nobvious 明显的');
        click(w, '#parse-paste');
        await until(() => !w.document.querySelector<HTMLButtonElement>('#import-confirm')!.disabled);
        click(w, '#import-confirm');
        await until(() => w.document.querySelector('#main')!.textContent!.includes('6 个词'));
        // Phase 2: UNSEEN 词不得直接进入 Recall（给出预览提示且不创建 session）
        click(w, '[data-mode="quick"]');
        await until(() => w.document.querySelector('#toast')!.textContent!.includes('预览'));
        assert.equal(w.document.querySelector('.answers'), null, 'unseen words must not start a recall session');
        // 先预览全部 6 个新词，再进入正式训练
        click(w, '#preview-start');
        await until(() => !!w.document.querySelector('[data-preview]'));
        for (let i = 0; i < 6; i++) {
            click(w, '[data-preview="know"]');
            if (i < 5)
                await until(() => (w.document.querySelector('.quiz-top')?.textContent || '').includes(`${i + 2} / 6`));
            else
                await until(() => !!w.document.querySelector('#back-home'));
        }
        click(w, '#back-home');
        await until(() => !!w.document.querySelector('[data-mode="quick"]'));
        click(w, '[data-mode="quick"]');
        click(w, '[data-mode="quick"]');
        await until(() => !!w.document.querySelector('.answers'));
        await new Promise(r => setTimeout(r, 80));
        click(w, '#quit');
        await until(() => !!w.document.querySelector('#resume'));
        // Read resulting persistence through IDB adapter, not app internals.
        const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('vocabulary-memory-v1'); r.onsuccess = () => resolve(r.result); });
        const sessions = await new Promise<any[]>(resolve => { const r = db.transaction('sessions').objectStore('sessions').getAll(); r.onsuccess = () => resolve(r.result); });
        assert.equal(sessions.filter(s => !s.ended).length, 1, 'double clicking must not create duplicate sessions');
        db.close();
        click(w, '#resume');
        await until(() => !!w.document.querySelector('.answers'));
        await new Promise(r => setTimeout(r, 80));
        const pairs: Record<string, string> = { abandon: '放弃', adequate: '充足的', reluctant: '不情愿的', reliable: '可靠的', maintain: '维持', obvious: '明显的' };
        const prompt = w.document.querySelector('#question-text')!.textContent!;
        const correct = pairs[prompt] || Object.keys(pairs).find(k => pairs[k] === prompt)!;
        const button = [...w.document.querySelectorAll<HTMLButtonElement>('.answer')].find(b => b.querySelector('span')!.textContent === correct)!;
        button.click();
        click(w, '[data-nav="books"]');
        await new Promise(r => setTimeout(r, 100));
        assert.ok(w.document.querySelector('.quiz-top'), 'navigation must not replace DOM during answer commit');
        assert.equal(w.document.documentElement.dataset.page, 'quiz');
        assert.equal(w.document.querySelectorAll('#main h1#question-text').length, 1, 'saving leaves a single quiz stimulus');
        await new Promise(r => setTimeout(r, 80));
        w.document.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: ' ', bubbles: true }));
        await until(() => !!w.document.querySelector('#next'));
        assert.match(w.document.querySelector('#feedback')!.textContent!, /已加入复习/);
        click(w, '#quit');
        await until(() => !!w.document.querySelector('#resume'));
        assert.match(w.document.querySelector('.resume')!.textContent!, /已答 2 题/);
        dom.window.close();
        const reopened = await harness();
        try {
            await until(() => !!reopened.window.document.querySelector('#resume'));
            assert.match(reopened.window.document.querySelector('.resume')!.textContent!, /已答 2 题/);
            assert.match(reopened.window.document.querySelector('#main')!.textContent!, /6 个词/);
            const rw = reopened.window;
            click(rw, '#finish-old');
            await until(() => !rw.document.querySelector('#resume'));
            click(rw, '[data-nav="settings"]');
            await until(() => !!rw.document.querySelector('#settings-form'));
            value(rw, '[name="fast"]', '0.1');
            value(rw, '[name="normal"]', '0.2');
            value(rw, '[name="timeout"]', '0.3');
            value(rw, '[name="ratio"]', '0');
            value(rw, '[name="difficulty"]', 'hard');
            value(rw, '[name="feedback"]', '-1');
            const submitEvent = new rw.Event('submit', { bubbles: true, cancelable: true });
            rw.document.querySelector('#settings-form')!.dispatchEvent(submitEvent);
            assert.equal(submitEvent.defaultPrevented, true, 'form default navigation must be prevented synchronously');
            await until(() => rw.document.querySelector('#toast')!.textContent === '设置已保存');
            click(rw, '[data-nav="home"]');
            click(rw, '[data-mode="quick"]');
            await until(() => rw.document.querySelectorAll('.answer').length === 6);
            await new Promise(r => setTimeout(r, 80));
            click(rw, '#pause');
            await until(() => !rw.document.querySelector<HTMLElement>('#pause-cover')!.hidden);
            await new Promise(r => setTimeout(r, 350));
            assert.equal(rw.document.querySelector('#next'), null, 'paused question must not time out');
            click(rw, '#continue');
            await until(() => !!rw.document.querySelector('#next'));
            assert.match(rw.document.querySelector('#feedback')!.textContent!, /没来得及答|超时/);
            rw.document.body.dispatchEvent(new rw.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            await until(() => !rw.document.querySelector('#next'));
            await new Promise(r => setTimeout(r, 120));
            rw.document.body.dispatchEvent(new rw.KeyboardEvent('keydown', { key: '6', bubbles: true }));
            rw.document.body.dispatchEvent(new rw.KeyboardEvent('keydown', { key: '6', repeat: true, bubbles: true }));
            await new Promise(r => setTimeout(r, 70));
            click(rw, '#quit');
            await until(() => !!rw.document.querySelector('#resume'));
            assert.match(rw.document.querySelector('.resume')!.textContent!, /已答 2 题/);
            click(rw, '[data-nav="settings"]');
            value(rw, '[name="ratio"]', '62');
            rw.document.querySelector('#settings-form')!.dispatchEvent(new rw.Event('submit', { bubbles: true, cancelable: true }));
            await new Promise(r => setTimeout(r, 30));
            click(rw, '[data-nav="home"]');
            assert.equal(rw.document.querySelector<HTMLSelectElement>('#range-ratio')!.value, '62');
            // Phase 2: preview 状态、exposure、FSRS 状态与 rating 的持久化验证
            const db2 = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open('vocabulary-memory-v1'); r.onsuccess = () => resolve(r.result); });
            const allWords = await new Promise<any[]>(resolve => { const r = db2.transaction('words').objectStore('words').getAll(); r.onsuccess = () => resolve(r.result); });
            assert.equal(allWords.length, 6);
            assert.ok(allWords.every(x => x.previewedAt > 0), 'all words previewed');
            assert.ok(allWords.every(x => x.previewResult === 'know'));
            const answered = allWords.filter(x => x.state.total > 0);
            assert.ok(answered.length >= 1);
            assert.ok(answered.every(x => x.fsrs.reps > 0), 'FSRS state persisted for answered words');
            const exps = await new Promise<any[]>(resolve => { const r = db2.transaction('wordExposures').objectStore('wordExposures').getAll(); r.onsuccess = () => resolve(r.result); });
            assert.equal(exps.length, 6, 'preview exposures recorded');
            const recs = await new Promise<any[]>(resolve => { const r = db2.transaction('records').objectStore('records').getAll(); r.onsuccess = () => resolve(r.result); });
            assert.ok(recs.length > 0 && recs.every(x => [1, 2, 3, 4].includes(x.rating)), 'FSRS rating recorded');
            db2.close();
        }
        finally {
            reopened.window.close();
        }
    }
    finally {
        dom.window.close();
    }
});
