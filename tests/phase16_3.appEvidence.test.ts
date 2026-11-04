// Phase 16.3：真实应用链路（jsdom + fake-indexeddb + 真实点击 + 真实 IndexedDB）
// 复现审计路径：AI 定向句 → 加入句库 → 进入拆句 → 答题 → 完成 → 查库 → 重载后再看。
// 断言同时覆盖：数据库、内存状态、重载后的语法页、以及「可信结构仍然正常计分」的正控。
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { indexedDB, IDBObjectStore as FakeObjectStore } from 'fake-indexeddb';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DB_NAME, emptyData } from '../src/db.ts';
import { defaults } from '../src/types.ts';
import type { SentenceRecord, Word } from '../src/types.ts';
import { curatedById } from '../src/sentenceSources.ts';
import { buildLabPlan } from '../src/sentenceLab.ts';
import { heuristicStructure, readStructure } from '../src/sentenceStructure.ts';
import { GRAMMAR_CONFIG } from '../src/grammar.ts';
const NOW = 1700000000000;
const AI_TEXT = 'Although the river had risen, the engineers rebuilt the bridge before the storm arrived.';
const AI_ID = 'sen.ai.phase163';
let bundle: string | null = null;
let spyBundle: string | null = null;
async function boot(captureBackups = false): Promise<JSDOM> {
    if (captureBackups && !spyBundle) {
        const out = await build({ entryPoints: ['src/app.ts'], bundle: true, format: 'iife', write: false, loader: { '.css': 'empty' }, plugins: [{ name: 'backup-event-observer', setup(b) {
            b.onLoad({ filter: /[\\/]autoBackup\.ts$/ }, () => ({ contents: `globalThis.__backupEvents = []; export class AutoBackup { state = { enabled: false, status: 'off', error: '' }; restore() {} async checkPermission() {} async run(event) { globalThis.__backupEvents.push(event); } }`, loader: 'js' }));
            b.onLoad({ filter: /[\\/]app\.ts$/ }, async args => ({ contents: await readFile(args.path, 'utf8') + '\n(globalThis as any).__testPaint = paint;', loader: 'ts', resolveDir: process.cwd() + '/src' }));
        } }] });
        spyBundle = out.outputFiles[0].text;
    }
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
    w.eval(captureBackups ? spyBundle! : bundle);
    await until(w, () => !!w.document.querySelector('#plan-setup, #plan-panel, #main'), 'boot');
    return dom;
}
async function until(w: JSDOM['window'], fn: () => boolean, what = 'condition'): Promise<void> {
    const t = Date.now();
    while (!fn()) {
        if (Date.now() - t > 8000)
            throw Error('UI timeout: ' + what + ' · ' + (w.document.querySelector('#main')?.textContent?.slice(0, 200) ?? ''));
        await new Promise(r => setTimeout(r, 10));
    }
}
function click(w: JSDOM['window'], selector: string): void {
    const el = w.document.querySelector<HTMLElement>(selector);
    assert.ok(el, 'missing ' + selector);
    el.click();
}
function open(w: JSDOM['window']): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const r = w.indexedDB.open(DB_NAME);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
    });
}
async function rows(w: JSDOM['window'], store: string): Promise<any[]> {
    const db = await open(w);
    return new Promise((resolve, reject) => {
        const q = db.transaction(store).objectStore(store).getAll();
        q.onsuccess = () => { resolve(q.result as any[]); db.close(); };
        q.onerror = () => reject(q.error);
    });
}
async function clearStores(w: JSDOM['window'], stores: string[]): Promise<void> {
    const db = await open(w);
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(stores, 'readwrite');
        for (const name of stores)
            tx.objectStore(name).clear();
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}
async function put(w: JSDOM['window'], store: string, items: unknown[]): Promise<void> {
    const db = await open(w);
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        const s = tx.objectStore(store);
        for (const item of items)
            s.put(item);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}
function aiSentence(): SentenceRecord {
    return {
        id: AI_ID, text: AI_TEXT, zh: '虽然河水上涨，工程师还是在暴风雨前重建了那座桥。',
        sourceType: 'ai', sourceId: 'ai.generate', attribution: 'AI 生成（结构未验证）',
        grammarTags: ['clause.relative'], targetWordIds: [],
        theme: 'AI 定向句', difficulty: 2,
        structure: heuristicStructure(AI_ID, AI_TEXT), structureProvenance: 'ai_unverified',
        createdBy: 'ai', createdAt: NOW, usedCount: 0, lastUsedAt: 0, notes: 'AI 生成：结构未验证',
    };
}
function weakWord(): Word {
    return {
        id: 'w-keen', bookId: 'b1', en: 'keen', zh: '热衷的', pos: 'adj', phonetic: '', example: '', collocation: '',
        difficulty: 'B1', tags: '', order: 1,
        state: {
            total: 3, correct: 0, streak: 0, errors: 3, lapses: 1, meanMs: 4200, lastMs: 4000, lastCorrect: false,
            level: 'unknown', directions: { 'en-zh': { total: 2, correct: 0, meanMs: 4000 }, 'zh-en': { total: 1, correct: 0, meanMs: 4600 } },
        },
        schedule: { due: NOW, last: NOW, interval: 1, step: 0, spacedPasses: 0 },
        confusions: {}, recognitionScore: 0.2, activeRecallScore: 0.1, productiveScore: 0,
        exposureCount: 0, contextExposureCount: 0, productionEvidence: 0, previewedAt: 0, lastEncounteredAt: 0,
        sourceTypes: [], previewResult: '',
        fsrs: { stability: 0.4, difficulty: 7, state: 1, reps: 3, lapses: 1, due: NOW, lastReview: NOW, scheduledDays: 1, learningSteps: 0 },
    };
}
/** 按 lab plan 逐题答对（真实点击，不用测试钩子改状态） */
async function answerAll(w: JSDOM['window'], record: SentenceRecord): Promise<void> {
    const structure = readStructure(record.structure, record.id, record.text).structure;
    const plan = buildLabPlan(record, structure, []);
    for (let i = 0; i < plan.steps.length; i++) {
        const step = plan.steps[i];
        click(w, `[data-lab-option="${step.correctId}"]`);
        await until(w, () => !!w.document.querySelector('.lab-feedback'), `第 ${i + 1} 步反馈`);
        click(w, '#lab-next');
    }
    await until(w, () => !!w.document.querySelector('#lab-results'), 'results');
}
/** 先启动一次以建库，然后写入合成数据；再次启动时读到的就是这份数据 */
async function seedAndBoot(): Promise<JSDOM> {
    const first = await boot();
    const w0 = first.window;
    await clearStores(w0, ['sentenceAttempts', 'grammarAttempts', 'grammarConcepts', 'words', 'sentences']);
    await put(w0, 'meta', [{ id: 'settings', value: { ...defaults, endpoint: 'http://127.0.0.1:9/v1', model: 'mock-model', key: 'test-key' } }]);
    await put(w0, 'words', [weakWord()]);
    await put(w0, 'sentences', [aiSentence()]);
    first.window.close();
    return boot();
}
test('Phase 16.3：AI 未核验句的练习不计入语法掌握（数据库 / 页面 / 重载一致）', async () => {
    const dom = await seedAndBoot();
    const w = dom.window;
    try {
        click(w, '[data-nav="sentence"]');
        await until(w, () => !!w.document.querySelector('#sentence-page'), 'sentence page');
        assert.ok(w.document.querySelector('#sentence-page')!.textContent!.includes('还没核对'), '句库必须标出这句的结构没核对');
        const beforeConcepts = await rows(w, 'grammarConcepts');
        const beforeAttempts = await rows(w, 'grammarAttempts');
        click(w, `[data-sentence-start="${AI_ID}"]`);
        await until(w, () => !!w.document.querySelector('#lab-sentence'), 'lab start');
        assert.ok(w.document.querySelector('#lab-page')!.textContent!.includes('不会计入语法掌握度'), '练之前就要说明');
        await answerAll(w, aiSentence());
        const result = w.document.querySelector('#main')!.textContent!;
        assert.ok(result.includes('不会计入语法掌握度'), '结果页必须说明不计入语法掌握');
        assert.ok(result.includes('这句的语法结构还没有核对'), '结果页必须说清原因');
        // 数据库：练习记录在，语法证据不在
        const attempts = await rows(w, 'sentenceAttempts');
        assert.equal(attempts.length, 1, '练习本身必须被记录');
        assert.equal(attempts[0].structureTrust, 'unverified');
        assert.equal(attempts[0].masteryEligible, false);
        assert.equal(attempts[0].evidenceClass, 'independent', '答对这件事本身仍如实分级');
        const grammarAttempts = await rows(w, 'grammarAttempts');
        assert.equal(grammarAttempts.length, beforeAttempts.length, '未核验结构不得写入任何语法证据');
        const afterConcepts = await rows(w, 'grammarConcepts');
        for (const b of beforeConcepts) {
            const a = afterConcepts.find(x => x.id === b.id);
            if (a)
                assert.equal(a.mastery, b.mastery, `${b.id} 的掌握度不得被推进`);
        }
        assert.equal(afterConcepts.length, beforeConcepts.length, '不该凭空多出语法概念');
        // 重载：语法页不能因为这次作答就说「练过」
        const dom2 = await boot();
        const w2 = dom2.window;
        click(w2, '[data-nav="grammar"]');
        await until(w2, () => !!w2.document.querySelector('#grammar-page, #main'), 'grammar page');
        const cards = [...w2.document.querySelectorAll('.concept-card')];
        assert.ok(cards.length > 0, '语法页应有概念卡');
        const mastered = cards.filter(c => c.getAttribute('data-band') === 'likely-mastered');
        assert.deepEqual(mastered.map(c => c.textContent?.slice(0, 20)), [], '重载后不得有概念被当成已掌握');
        const core = cards.find(c => c.getAttribute('data-band') === 'unknown');
        assert.ok(core, 'structure.core 之类没练过的概念必须仍是「还没练过」');
        dom2.window.close();
    }
    finally {
        dom.window.close();
    }
});

test('自动备份：句子学习证据保存失败后，结束训练不能触发成功会话备份', async () => {
    const seed = await seedAndBoot(); seed.window.close();
    const dom = await boot(true); const w = dom.window;
    const original = FakeObjectStore.prototype.put;
    try {
        FakeObjectStore.prototype.put = function (...args: Parameters<typeof original>) {
            if (this.name === 'sentenceAttempts') throw new DOMException('isolated quota failure', 'QuotaExceededError');
            return original.apply(this, args);
        };
        click(w, '[data-nav="sentence"]');
        await until(w, () => !!w.document.querySelector('#sentence-page'));
        click(w, `[data-sentence-start="${AI_ID}"]`);
        await until(w, () => !!w.document.querySelector('#lab-sentence'));
        await answerAll(w, aiSentence());
        assert.equal((await rows(w, 'sentenceAttempts')).length, 0);
        click(w, '#lab-next-sentence');
        await until(w, () => !!w.document.querySelector('#sentence-page'));
        const events = (w as unknown as { __backupEvents: string[] }).__backupEvents;
        assert.ok(!events.some(e => e.startsWith('sentence:')), '未保存的句子训练不得宣称已进入自动备份');
    }
    finally { FakeObjectStore.prototype.put = original; dom.window.close(); }
});

test('拼写：后台完整重绘不能替换输入页、丢失输入或泄漏下一题', async () => {
    const seed = await seedAndBoot(); seed.window.close();
    const dom = await boot(true); const w = dom.window;
    try {
        click(w, '[data-mode="spelling"]');
        await until(w, () => !!w.document.querySelector('#spelling-input'));
        const input = w.document.querySelector<HTMLInputElement>('#spelling-input')!;
        input.value = 'my partial spelling'; input.focus();
        (w as unknown as { __testPaint: () => void }).__testPaint();
        assert.equal(w.document.querySelector<HTMLInputElement>('#spelling-input')?.value, 'my partial spelling');
        assert.equal(w.document.activeElement?.id, 'spelling-input');
        assert.ok(!w.document.querySelector('#spelling-feedback')?.textContent);
    }
    finally { dom.window.close(); }
});
test('Phase 16.3：经过人工校对的练习句仍正常计分（正控）', async () => {
    const dom = await seedAndBoot();
    const w = dom.window;
    try {
        click(w, '[data-nav="sentence"]');
        await until(w, () => !!w.document.querySelector('#sentence-page'), 'sentence page');
        click(w, '[data-sentence-start="sen.curated.relative-01"]');
        await until(w, () => !!w.document.querySelector('#lab-sentence'), 'lab start');
        await answerAll(w, curatedById('sen.curated.relative-01')!);
        const result = w.document.querySelector('#main')!.textContent!;
        assert.ok(result.includes('会算进语法掌握'), '可信结构必须照常计分');
        assert.equal(result.includes('不会计入语法掌握度'), false, '可信结构不该出现免责提示');
        const attempts = await rows(w, 'sentenceAttempts');
        const mine = attempts.find(a => a.sentenceId === 'sen.curated.relative-01');
        assert.ok(mine, '必须写入这次练习记录');
        assert.equal(mine.structureTrust, 'verified');
        assert.equal(mine.masteryEligible, true);
        const grammarAttempts = await rows(w, 'grammarAttempts');
        assert.ok(grammarAttempts.length >= 1, '可信结构必须写语法证据');
        const concepts = await rows(w, 'grammarConcepts');
        assert.ok(concepts.some(c => c.mastery > GRAMMAR_CONFIG.bkt.prior), '掌握度应被推进');
    }
    finally {
        dom.window.close();
    }
});
