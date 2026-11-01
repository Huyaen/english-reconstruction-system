// Phase 16.3：AI 目标的展示 / 请求 / 校验 / 保存一致性
// 背景：面板写「定语从句（默认）」而阅读实际发 `clause.adverbial`；保存时又回头重算薄弱语法，
// 于是「目标语法」在句库里变成「—」。这里把四个环节钉在同一条链上。
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { indexedDB } from 'fake-indexeddb';
import { randomUUID } from 'node:crypto';
import { AI_DEFAULT_GRAMMAR, AI_DEFAULT_WORDS, aiTargetPlan, targetRowText } from '../src/aiTargets.ts';
import { DB_NAME } from '../src/db.ts';
import { defaults } from '../src/types.ts';
import type { Word } from '../src/types.ts';
test('目标计划：没有薄弱语法/弱词时补默认值并如实标记', () => {
    const empty = aiTargetPlan({ words: [], grammar: [] });
    assert.deepEqual(empty.grammar.map(g => g.id), [AI_DEFAULT_GRAMMAR.id]);
    assert.deepEqual(empty.words, [...AI_DEFAULT_WORDS]);
    assert.equal(empty.grammarIsDefault, true);
    assert.equal(empty.wordsIsDefault, true);
    assert.match(targetRowText(empty).grammar, /默认/);
    const real = aiTargetPlan({ words: [{ id: 'w1', en: 'keen' }], grammar: [{ id: 'clause.adverbial', name: '状语从句', description: '' }] });
    assert.deepEqual(real.words, ['keen']);
    assert.deepEqual(real.grammar.map(g => g.id), ['clause.adverbial']);
    assert.equal(real.grammarIsDefault, false);
    assert.doesNotMatch(targetRowText(real).grammar, /默认/);
});
function word(): Word {
    return {
        id: 'w-keen', bookId: 'b1', en: 'keen', zh: '热衷的', pos: 'adj', phonetic: '', example: '', collocation: '',
        difficulty: 'B1', tags: '', order: 1,
        state: {
            total: 3, correct: 0, streak: 0, errors: 3, lapses: 1, meanMs: 4200, lastMs: 4000, lastCorrect: false,
            level: 'unknown', directions: { 'en-zh': { total: 2, correct: 0, meanMs: 4000 }, 'zh-en': { total: 1, correct: 0, meanMs: 4600 } },
        },
        schedule: { due: 1700000000000, last: 1700000000000, interval: 1, step: 0, spacedPasses: 0 },
        confusions: {}, recognitionScore: 0.2, activeRecallScore: 0.1, productiveScore: 0,
        exposureCount: 0, contextExposureCount: 0, productionEvidence: 0, previewedAt: 0, lastEncounteredAt: 0,
        sourceTypes: [], previewResult: '',
        fsrs: { stability: 0.4, difficulty: 7, state: 1, reps: 3, lapses: 1, due: 1700000000000, lastReview: 1700000000000, scheduledDays: 1, learningSteps: 0 },
    };
}
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
function click(w: JSDOM['window'], selector: string): void {
    const el = w.document.querySelector<HTMLElement>(selector);
    assert.ok(el, 'missing ' + selector);
    el.click();
}
test('真实请求与保存：面板写的目标 = 发出去的目标 = 存进句库的目标', async () => {
    const first = await boot();
    const w0 = first.window;
    await new Promise<void>((resolve, reject) => {
        const open = w0.indexedDB.open(DB_NAME);
        open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction(['meta', 'words'], 'readwrite');
            tx.objectStore('meta').put({ id: 'settings', value: { ...defaults, endpoint: 'http://ai.local/v1', model: 'mock-model', key: 'k' } });
            tx.objectStore('words').put(word());
            tx.oncomplete = () => { db.close(); resolve(); };
            tx.onerror = () => { db.close(); reject(tx.error); };
        };
    });
    first.window.close();
    const dom = await boot();
    const w = dom.window;
    const sent: string[] = [];
    // 只拦截这一次真实请求：返回一份格式合法、目标词/语法都命中请求集合的响应
    (w as unknown as {
        fetch: unknown;
    }).fetch = async (_url: string, init: {
        body?: string;
    }) => {
        sent.push(String(init?.body ?? ''));
        const content = JSON.stringify({
            sentence: 'She is keen on the plan that the engineers proposed last spring.',
            targetWords: ['keen'], grammarTargets: [AI_DEFAULT_GRAMMAR.id],
            difficultyNote: '中等长度，含一个定语从句，生词只有一个目标词。', chinese: '她很热衷工程师去年春天提出的那个方案。',
            structure: null, provenance: 'ai',
        });
        return {
            ok: true, status: 200,
            text: async () => JSON.stringify({ model: 'mock-model', choices: [{ message: { content } }], usage: { prompt_tokens: 321, completion_tokens: 45 } }),
            headers: { get: () => 'application/json' },
        };
    };
    try {
        click(w, '[data-nav="sentence"]');
        await until(w, () => !!w.document.querySelector('#ai-sentence-panel'), 'sentence page');
        const panelTargets = w.document.querySelector('#ai-sentence-panel .ai-targets')!.textContent!;
        assert.match(panelTargets, /定语从句（默认）/, '没有薄弱语法时面板必须标明是默认目标');
        click(w, '[data-ai-sentence]');
        await until(w, () => !!w.document.querySelector('[data-ai-sentence-adopt]'), 'generated result');
        assert.equal(sent.length, 1, '只能发一次请求');
        assert.match(sent[0], new RegExp(AI_DEFAULT_GRAMMAR.id), '请求里的语法目标必须就是面板显示的那个');
        assert.doesNotMatch(sent[0], /clause\.adverbial/, '不能再偷偷换成别的语法点');
        const card = w.document.querySelector('#ai-sentence-panel')!.textContent!;
        assert.match(card, /基础格式与规则检查/, '内容检查必须限定为规则项');
        assert.match(card, /没有人工核对|尚未人工核对/, '不能把规则检查说成内容全面可靠');
        click(w, '[data-ai-sentence-adopt]');
        await until(w, () => !!w.document.querySelector('#lab-sentence'), 'lab after adopt');
        await new Promise(r => setTimeout(r, 300));
        const rows = await new Promise<any[]>((resolve) => {
            const open = w.indexedDB.open(DB_NAME);
            open.onsuccess = () => {
                const db = open.result;
                const q = db.transaction('sentences').objectStore('sentences').getAll();
                q.onsuccess = () => { db.close(); resolve(q.result as any[]); };
            };
        });
        const saved = rows.find(r => r.sourceType === 'ai');
        assert.ok(saved, 'AI 句子必须存进句库');
        assert.deepEqual(saved.grammarTags, [AI_DEFAULT_GRAMMAR.id], '保存时不得把目标语法丢成空数组');
        assert.match(String(saved.notes), /默认/, '默认目标必须在记录里留痕');
        assert.match(String(saved.notes), /规则检查/, '保存时保留这次检查的结论');
    }
    finally {
        dom.window.close();
    }
});
