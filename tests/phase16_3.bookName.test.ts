// P2 取证：首页「范围」下拉里的 `scan` 到底是什么
// 结论先写在这里，测试只负责把结论钉死：
//   · 「范围」「全部词书」是界面文案，中文；
//   · `scan` 是**词书名**——导入时没填名称，默认取文件名去扩展名（scan.csv → scan），
//     属于用户数据，原样显示，不翻译、不改写、不进文案规范。
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { indexedDB } from 'fake-indexeddb';
import { randomUUID } from 'node:crypto';
import { DB_NAME } from '../src/db.ts';

let bundle: string | null = null;
async function boot(): Promise<JSDOM> {
    if (!bundle) {
        const out = await build({ entryPoints: ['src/app.ts'], bundle: true, format: 'iife', write: false, loader: { '.css': 'empty' } });
        bundle = out.outputFiles[0].text;
    }
    const dom = new JSDOM('<div id="app"></div><div id="toast"></div><dialog id="modal"></dialog>', {
        url: 'http://localhost:4173/?proto=legacy', runScripts: 'outside-only', pretendToBeVisual: true,
    });
    const w = dom.window;
    Object.assign(w, { indexedDB, structuredClone, TextDecoder, TextEncoder });
    Object.defineProperty(w.crypto, 'randomUUID', { value: randomUUID });
    Object.defineProperty(w.navigator, 'locks', { value: { request: (_n: unknown, _o: unknown, fn: (l: object) => unknown) => fn({}) } });
    w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
    w.HTMLDialogElement.prototype.close = function () { this.open = false; };
    w.eval(bundle);
    await until(w, () => !!w.document.querySelector('#main'), 'boot');
    return dom;
}
async function until(w: JSDOM['window'], fn: () => boolean, what = 'condition'): Promise<void> {
    const t = Date.now();
    while (!fn()) {
        if (Date.now() - t > 10000)
            throw Error('UI timeout: ' + what + ' · ' + (w.document.querySelector('#main')?.textContent?.slice(0, 200) ?? ''));
        await new Promise(r => setTimeout(r, 10));
    }
}
function seedBooks(w: JSDOM['window'], books: { id: string; name: string; created: number }[]): Promise<void> {
    return new Promise((resolve, reject) => {
        const open = w.indexedDB.open(DB_NAME);
        open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction('books', 'readwrite');
            for (const b of books)
                tx.objectStore('books').put(b);
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
        };
        open.onerror = () => reject(open.error);
    });
}

test('范围下拉：界面文字是中文，书名原样显示（用户数据不翻译）', async () => {
    const first = await boot();
    // 这个名字就是用户自己的文件名，故意用英文，断言它必须原样出现
    await seedBooks(first.window, [{ id: 'bk-scan', name: 'scan', created: 1700000000000 }]);
    first.window.close();

    const dom = await boot();
    const w = dom.window;
    const select = w.document.querySelector<HTMLSelectElement>('#range-book');
    assert.ok(select, '首页必须能取到「范围」下拉');
    // 控件的自带标签是中文
    assert.equal(select.closest('label')?.textContent?.trim().startsWith('范围'), true, '控件标签应为「范围」');
    const options = [...select.options].map(o => o.textContent?.trim());
    assert.equal(options[0], '全部词书', '第一项必须是界面自带的中文选项');
    // 书名是数据：原样显示，既不能被翻译，也不能被「美化」成别的字
    assert.ok(options.includes('scan'), '词书名应原样出现：' + JSON.stringify(options));
    const opt = [...select.options].find(o => o.textContent?.trim() === 'scan')!;
    assert.equal(opt.value, 'bk-scan', '选项 value 仍指向词书 id，筛选行为不变');

});

test('这个词名的来历：导入时没填名称，默认取文件名去扩展名（scan.csv → scan）', async () => {
    const dom = await boot();
    const w = dom.window;
    (w.document.querySelector('[data-nav="books"]') as HTMLElement).click();
    await until(w, () => !!w.document.querySelector('#import'), 'books page');
    (w.document.querySelector('#import') as HTMLElement).click();
    await until(w, () => !!w.document.querySelector('#import-file'), 'import modal');

    const input = w.document.querySelector<HTMLInputElement>('#import-file')!;
    const nameBox = w.document.querySelector<HTMLInputElement>('#import-name')!;
    assert.equal(nameBox.value, '', '一开始名称是空的，等文件来填');
    const file = new w.File(['keep,保持\n'], 'scan.csv', { type: 'text/csv' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new w.Event('change', { bubbles: true }));
    await until(w, () => nameBox.value.length > 0, 'default book name');

    assert.equal(nameBox.value, 'scan', '默认名称 = 文件名去掉扩展名，这就是下拉里 scan 的来源');
    // 用户可以在确认前改成中文名；这里只证明「默认值」这一条路径
    nameBox.value = '我的扫描词表';
    assert.equal(nameBox.value, '我的扫描词表', '名称可编辑，说明它是数据不是界面文案');
    // 不在这里 close：文件解析是异步的，提前关窗会让应用的回调在测试结束后继续跑

});
