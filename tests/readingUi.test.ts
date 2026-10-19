import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { indexedDB } from 'fake-indexeddb';
import { randomUUID } from 'node:crypto';
// Phase 5 UI 集成（jsdom + fake-indexeddb）：完整走一遍“导入→冷读→首读→标记→难句→拆句→重读→全文→收尾→整理生词”。
// 不触碰用户真实浏览器数据；断言全部基于真实 DOM 与真实 IndexedDB 落库结果。
const ARTICLE = `Learning to read in a second language is not a matter of memorising every single word you meet.
A reader who understands the main structure of a sentence can often guess the meaning of an unfamiliar word from the surrounding context.
That is why this programme separates mere exposure from real mastery, and why it asks you to mark what you are genuinely unsure about rather than what you merely suspect.

Reading material should come from a traceable source, because the difficulty of a text depends on where it was published and for whom it was written.
Editors choose short sentences for hurried readers, while academic writers pack several subordinate clauses into a single statement and expect the reader to hold all of them in mind at once.
When you meet a sentence that keeps collapsing into confusion, the useful response is not to translate it word by word, but to find its backbone: who does what, to whom, and under what condition.`;
async function harness() {
    // 与 `npm run build:test` + `?test=1` 一致：测试钩子必须同时满足“测试构建常量”和“显式查询参数”，
    // 生产构建里 testHooksEnabled() 是常量 false，整段钩子会被摇树移除。
    const output = await build({ entryPoints: ['src/app.ts'], bundle: true, format: 'iife', write: false, loader: { '.css': 'empty' }, define: { __ERV2_TEST_HOOKS__: 'true' } });
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
type W = JSDOM['window'];
async function until(w: W, fn: () => boolean, what = 'condition') {
    const t = Date.now();
    while (!fn()) {
        if (Date.now() - t > 8000)
            throw Error('UI timeout: ' + what + ' · toast=' + (w.document.querySelector('#toast')?.textContent ?? '') + ' · main=' + (w.document.querySelector('#main')?.textContent?.slice(0, 200) ?? ''));
        await new Promise(r => setTimeout(r, 10));
    }
}
function click(w: W, selector: string) {
    const e = w.document.querySelector<HTMLElement>(selector);
    assert.ok(e, 'missing ' + selector + '（现有：' + [...w.document.querySelectorAll('[data-tok],[data-mark],[data-difficult],[data-read-lab],button')].map(x => (x as HTMLElement).dataset.tok ?? (x as HTMLElement).dataset.mark ?? (x as HTMLElement).dataset.difficult ?? x.id ?? x.textContent?.slice(0, 12)).slice(0, 24).join(' | ') + '）');
    e.click();
}
function value(w: W, selector: string, v: string) {
    const e = w.document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
    assert.ok(e, 'missing input ' + selector);
    e.value = v;
    e.dispatchEvent(new w.Event('input', { bubbles: true }));
}
function readState(w: W) {
    return (w as unknown as {
        __readTest: {
            state: () => Record<string, unknown>;
        };
    }).__readTest.state();
}
async function table(name: string) {
    const db = await new Promise<IDBDatabase>((resolve, reject) => { const r = indexedDB.open('vocabulary-memory-v1'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    const rows = await new Promise<any[]>((resolve, reject) => { const r = db.transaction(name).objectStore(name).getAll(); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    db.close();
    return rows;
}
test('Phase 5 UI：导入 → 预览 → 冷读 → 首读标记 → 难句拆句 → 重读 → 全文 → 收尾 → 整理生词', async () => {
    const dom = await harness(), w = dom.window;
    try {
        await until(w, () => !!w.document.querySelector('#app'), 'booted');
        await until(w, () => !!w.document.querySelector('[data-nav="reading"]'), 'reading nav');
        click(w, '[data-nav="reading"]');
        await until(w, () => !!w.document.querySelector('#read-paste'), 'reading library');
        assert.ok(w.document.querySelector('#read-import'), '阅读库必须有导入区');
        assert.match(w.document.querySelector('#main')!.textContent!, /还没有阅读材料|导入/, '没有材料时必须引导导入');
        // —— 导入：预览阶段不显示正文 ——
        value(w, '#read-title', '阅读测试文章');
        value(w, '#read-topic', 'education');
        value(w, '#read-paste', ARTICLE);
        click(w, '[data-read-save]');
        await until(w, () => !!w.document.querySelector('#read-preview'), 'preview');
        const previewText = w.document.querySelector('#read-preview')!.textContent!;
        assert.ok(previewText.includes('阅读测试文章'), '预览必须显示标题');
        assert.ok(previewText.includes('education'), '预览必须显示主题');
        assert.equal(previewText.includes('memorising'), false, '预览阶段不得出现正文');
        assert.match(previewText, /先猜一下|猜测/, '预览必须先要求无辅助猜测');
        assert.equal(readState(w).passages, 1, '导入后必须真实落库一篇');
        const passages = await table('passages');
        assert.equal(passages.length, 1);
        assert.equal(passages[0].sourceType, 'pasted_text');
        assert.equal(passages[0].sourceReliability, 'user_provided');
        assert.ok(passages[0].contentHash, '必须记录内容指纹');
        assert.ok((passages[0].sentences ?? []).length >= 5);
        // —— 冷读 ——
        click(w, '[data-read-start]');
        await until(w, () => !!w.document.querySelector('#read-cold-self'), 'cold test');
        value(w, '#read-cold-self', '30');
        value(w, '#read-cold-dep', 'D');
        click(w, '[data-read-cold-submit]');
        await until(w, () => !!w.document.querySelector('[data-tok]'), 'reader');
        assert.equal(readState(w).view, 'reader');
        assert.equal(readState(w).stage, 'reading');
        // —— 首读：标记一个词 + 标一个难句 ——
        const tok = [...w.document.querySelectorAll<HTMLElement>('[data-tok]')].find(b => b.dataset.word === 'memorising');
        assert.ok(tok, '正文必须可点词');
        tok.click();
        click(w, '[data-mark="unknown"]');
        await until(w, () => readState(w).marks === 1, 'mark saved');
        assert.ok(w.document.querySelector('#read-marks'), '侧栏必须列出已标记的词');
        const marks = readState(w).marks as number;
        assert.equal(marks, 1);
        assert.equal((readState(w).evidenceTypes as string[]).includes('vocabulary-obstacle'), true, '标生词必须留下障碍证据');
        const difficultBtn = w.document.querySelector<HTMLElement>('[data-difficult]');
        assert.ok(difficultBtn, '每句必须有“标为难句”入口');
        difficultBtn!.click();
        await until(w, () => !!w.document.querySelector('[data-problem]'), 'problem modal');
        click(w, '[data-problem="subordinate-clause"]');
        await until(w, () => readState(w).difficult === 1, 'difficult saved');
        await until(w, () => !!w.document.querySelector('[data-read-lab]'), 'lab entry');
        // —— 难句 → 拆句训练（自动分析结构 = 只记接触），退出后回到同一段 ——
        click(w, '[data-read-lab]');
        await until(w, () => !!w.document.querySelector('[data-lab-back]'), 'lab page');
        assert.match(w.document.querySelector('#main')!.textContent!, /自动分析|未人工审校|只记接触/, '来自阅读的拆句必须声明结构是自动分析的');
        click(w, '[data-lab-back]');
        await until(w, () => !!w.document.querySelector('[data-tok]'), 'back to reader');
        assert.equal(readState(w).view, 'reader', '退出拆句必须回到阅读');
        assert.equal(readState(w).marks, 1, '回来之后标记必须还在');
        assert.equal(readState(w).difficult, 1);
        // —— 走完首读的所有段落 ——
        let guard = 0;
        while (w.document.querySelector('[data-read-next]') && !w.document.querySelector('[data-read-finish-first]') && guard++ < 30)
            click(w, '[data-read-next]');
        const nextBtn = w.document.querySelector<HTMLElement>('[data-read-next]');
        if (nextBtn && !w.document.querySelector('[data-read-finish-first]'))
            nextBtn.click();
        await until(w, () => !!w.document.querySelector('[data-read-finish-first]'), 'finish first pass');
        click(w, '[data-read-finish-first]');
        await until(w, () => !!w.document.querySelector('#read-reread-self'), 'reread view');
        assert.equal(readState(w).view, 'reread');
        assert.equal(readState(w).stage, 'reread', '进入重读必须真正开始计时（support → reread）');
        // —— 重读 ——
        let nav = 0;
        while (w.document.querySelector('[data-reread-next]') && nav++ < 30) {
            click(w, '[data-reread-next]');
            await new Promise(r => setTimeout(r, 40));
        }
        assert.equal(w.document.querySelector('[data-reread-next]'), null, '重读必须能逐段走完');
        assert.ok(w.document.querySelector('[data-reread-prev]'), '多段文章重读时必须有上一段');
        value(w, '#read-reread-self', '75');
        value(w, '#read-reread-dep', 'B');
        click(w, '[data-read-reread-done]');
        await until(w, () => !!w.document.querySelector('#read-whole-main'), 'whole text view');
        assert.equal(readState(w).firstPass, 30);
        assert.equal(readState(w).secondPass, 75, '首读与重读自评分开记录');
        // —— 全文理解 + 一句话输出 + 收尾 ——
        value(w, '#read-whole-main', '阅读要分清接触与掌握');
        click(w, '[data-read-whole-submit]');
        value(w, '#read-whole-main', '这篇讲阅读方法。');
        click(w, '[data-read-complete]');
        await until(w, () => !!w.document.querySelector('#read-result'), 'result view');
        assert.equal(readState(w).sessionState, 'completed');
        const resultText = w.document.querySelector('#read-result')!.textContent!;
        assert.ok(resultText.includes('首读速度') && resultText.includes('重读速度'), '结果页必须分别展示首读/重读速度');
        assert.ok(resultText.includes('自评'), '自评必须标明是自评');
        const sessions = await table('readingSessions');
        assert.equal(sessions.length, 1, '阅读会话必须真实落库');
        assert.equal(sessions[0].detail.state, 'completed');
        assert.equal(sessions[0].detail.marks.length, 1);
        assert.equal(sessions[0].detail.difficultSentences.length, 1);
        assert.ok(sessions[0].firstPassComprehension === 30 && sessions[0].secondPassComprehension === 75);
        assert.ok(sessions[0].detail.rereadStartedAt && sessions[0].detail.rereadEndedAt, '重读起止时间必须被记录（否则重读速度永远缺失）');
        assert.ok(sessions[0].detail.rereadEndedAt >= sessions[0].detail.rereadStartedAt);
        assert.ok(sessions[0].durationMs >= 0, '总时长只能是首读+重读的真实值');
        // —— 整理生词：没有释义不得入库，补了释义才入库且只算接触 ——
        click(w, '[data-read-words]');
        await until(w, () => !!w.document.querySelector('#read-words'), 'study words view');
        const defInput = w.document.querySelector<HTMLInputElement>('[data-def]');
        assert.ok(defInput, '新词必须要求补释义');
        click(w, '[data-read-words-save]');
        await until(w, () => /还没有释义|没有可入库/.test(w.document.querySelector('#toast')!.textContent!), 'refuse without definition');
        assert.equal((await table('words')).length, 0, '没有释义的新词绝不允许入库');
        await until(w, () => !!w.document.querySelector('[data-def]'), 'study words again');
        const def2 = w.document.querySelector<HTMLInputElement>('[data-def]')!;
        def2.value = '记忆';
        def2.dispatchEvent(new w.Event('input', { bubbles: true }));
        click(w, '[data-read-words-save]');
        await until(w, () => !!w.document.querySelector('#read-import'), 'back to library');
        const words = await table('words');
        assert.equal(words.length, 1, '补了释义的新词必须入库');
        assert.equal(words[0].zh, '记忆');
        assert.equal(words[0].state.total, 0, '阅读只算接触：不得提升掌握证据');
        const exposures = await table('wordExposures');
        assert.equal(exposures.length, 1);
        assert.equal(exposures[0].sourceType, 'reading');
        assert.equal(exposures[0].state, 'unknown');
        const libText = w.document.querySelector('#reading-page')!.textContent!;
        assert.ok(libText.includes('阅读测试文章'), '库里必须能看到这篇文章');
        assert.match(libText, /已读 \d+ 次/, '完成状态必须显示：' + libText.slice(0, 200));
    }
    finally {
        dom.window.close();
    }
});
