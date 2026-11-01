// Phase 16.3 P1（Codex 复验）：句源说明不能承诺「按比例取用」
// 真实行为：`selectSentenceBatch()` 按薄弱语法、难度、生词覆盖、先修关系打分选句，
// 不按 40/40/20 分配；「加入句库」只代表进入候选池，不代表会被选中、更不代表当天计划里有它。
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { indexedDB } from 'fake-indexeddb';
import { randomUUID } from 'node:crypto';
import { DB_NAME } from '../src/db.ts';
import { defaults } from '../src/types.ts';
import { aiGenerationNotice, curatedSentenceRecords, sourceCapabilities } from '../src/sentenceSources.ts';
import { sourceMixNote } from '../src/uiLabels.ts';
import { selectSentence } from '../src/sentenceSelection.ts';
import { assessStructureTrust } from '../src/sentenceTrust.ts';
import { heuristicStructure } from '../src/sentenceStructure.ts';
import type { SentenceRecord } from '../src/types.ts';

const NOW = 1700000000000;
const AI_TEXT = 'The notebook that the engineers kept recorded the current every spring.';

/** 文案里绝对不该出现的承诺（含同义说法） */
const FORBIDDEN = [
    /按比例取用/, /按比例分配/, /按这个比例取/,
    /正好按.*比例/, /计划会.*比例/,
    /一定会被选中/, /必定被选中/, /一定进计划/, /进计划/, /进入当天计划/, /排进当天/,
    /就会算.*掌握/, /算作语法掌握证据/,
];

function aiRecord(id = 'sen.ai.notice'): SentenceRecord {
    return {
        id, text: AI_TEXT, zh: '工程师们留着的那个笔记本每年春天都记录着水流。',
        sourceType: 'ai', sourceId: 'ai.generate', attribution: 'AI 生成（结构未验证）',
        grammarTags: ['clause.relative'], targetWordIds: [],
        theme: 'AI 定向句', difficulty: 2,
        // 真实 AI 句会带预教释义；这里照同样条件给，避免被「生词过多」挡在候选外
        glossary: {
            notebook: '笔记本', engineers: '工程师', kept: '留着（keep 的过去式）',
            recorded: '记录（record 的过去式）', current: '水流', spring: '春天',
        },
        structure: heuristicStructure(id, AI_TEXT), structureProvenance: 'ai_unverified',
        createdBy: 'ai', createdAt: NOW, usedCount: 0, lastUsedAt: 0, notes: 'AI 生成：结构未验证',
    };
}

test('四种状态：数量说对，且不承诺按比例取用/必定进计划', () => {
    const cases = [
        { name: 'AI 未配置、0 句', input: { configured: false, hasTargets: false, aiCount: 0 }, must: /还没有设置 AI 服务/ },
        { name: 'AI 已配置、0 句（还没有薄弱词）', input: { configured: true, hasTargets: false, aiCount: 0 }, must: /先练出几个薄弱词/ },
        { name: 'AI 已配置、0 句（有薄弱词）', input: { configured: true, hasTargets: true, aiCount: 0 }, must: /生成定向句/ },
        { name: 'AI 已配置、1 句', input: { configured: true, hasTargets: true, aiCount: 1 }, must: /1 句 AI 句/ },
        { name: 'AI 已配置、多句', input: { configured: true, hasTargets: true, aiCount: 7 }, must: /7 句 AI 句/ },
    ];
    for (const c of cases) {
        const text = aiGenerationNotice(c.input);
        assert.match(text, c.must, c.name + ' 必须说清自己的状态');
        for (const bad of FORBIDDEN)
            assert.doesNotMatch(text, bad, c.name + ' 出现了不该有的承诺：' + bad);
        // 任何状态都不能暗示「计划自己会生成」
        assert.doesNotMatch(text, /计划会自己生成|自动补足 AI 句/, c.name + ' 不能声称计划自动生成');
    }
    // 有句时数量必须是真实数字，不是「若干」「一批」
    assert.match(aiGenerationNotice({ configured: true, hasTargets: true, aiCount: 3 }), /已经有 3 句 AI 句/);
    // 有句时仍要说明「能不能被选中要看条件」，而不是「已经在计划里」
    assert.match(aiGenerationNotice({ configured: true, hasTargets: true, aiCount: 3 }), /符合学习目标和难度要求时/);
});

test('「加入句库」只能写成候选池，不能写成进计划', () => {
    const zero = aiGenerationNotice({ configured: true, hasTargets: true, aiCount: 0 });
    assert.match(zero, /候选池/, '必须说明加入句库只是进入候选池');
    assert.match(zero, /能不能被选中/, '必须说明是否被选中另有条件');
    // 未配置/无薄弱词这两条也不得用「才会进计划」这种必然语气
    for (const input of [{ configured: false, hasTargets: true, aiCount: 0 }, { configured: true, hasTargets: false, aiCount: 0 }]) {
        const text = aiGenerationNotice(input);
        assert.doesNotMatch(text, /进计划/, '不能承诺必然进计划：' + text);
        assert.match(text, /才有机会被选中/, '应当说「有机会」，不是「一定」：' + text);
    }
});

test('与 sourceMixNote 不再互相矛盾：两边都说「不按比例分配」', () => {
    const counts = { curated: 12, ai: 1 };
    const notice = aiGenerationNotice({ configured: true, hasTargets: true, aiCount: 1 });
    const mix = sourceMixNote({ counts });
    // mix 侧：40/40/20 只是目标
    assert.match(mix, /这是希望句源别太单一的目标，不是现在的出题比例/);
    assert.match(mix, /不按这个比例分配/);
    // notice 侧：不得出现「计划按比例取用」
    assert.doesNotMatch(notice, /按比例/);
    assert.match(notice, /符合学习目标和难度要求时/);
    // 两边都不能声称 AI 句已经在计划里
    assert.doesNotMatch(mix, /已经排进|已经进入计划/);
});

test('行为未变：AI 句仍是符合条件时的候选，且可信度规则不变', () => {
    const ai = aiRecord();
    const base = { words: [], concepts: [], grammarAttempts: [], now: NOW, availableMinutes: 20, energy: 'normal' as const };
    // 只有这一句时，选句必须能选中它——AI 句不会因为来源被排除
    const only = selectSentence({ ...base, sentences: [ai], preferConceptIds: ['clause.relative'] });
    assert.ok(only, 'AI 句必须能作为候选被选中');
    assert.equal(only!.record.id, ai.id);
    assert.equal(only!.source, 'ai', '选中后来源仍标注为 ai');
    // 混在人工句库里时也能在若干次挑选内出现（顺序由薄弱语法/难度决定，不是固定比例）
    const pool = [...curatedSentenceRecords(NOW), ai];
    const rest = [...pool];
    const pickedIds: string[] = [];
    for (let i = 0; i < pool.length; i++) {
        const s = selectSentence({ ...base, sentences: rest, preferConceptIds: ['clause.relative'] });
        if (!s)
            break;
        pickedIds.push(s.record.id);
        const idx = rest.findIndex(r => r.id === s.record.id);
        rest.splice(idx, 1);
    }
    assert.ok(pickedIds.includes(ai.id), 'AI 句必须仍可能被选中（本轮没有改选句算法）：' + pickedIds.join(','));
    // 证据准入规则没有被这次文案修复动过
    const trust = assessStructureTrust(ai);
    assert.equal(trust.trust, 'unverified', 'AI 未核验结构的证据准入必须保持保守');
    assert.equal(trust.provenance, 'ai_unverified');
});

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
function open(w: JSDOM['window']): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const r = w.indexedDB.open(DB_NAME);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
    });
}
async function put(w: JSDOM['window'], store: string, items: unknown[]): Promise<void> {
    const db = await open(w);
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        for (const item of items)
            tx.objectStore(store).put(item);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
    });
}

test('真实页面：AI 已配置且有 1 句时，句源说明按真实数量说话', async () => {
    const first = await boot();
    await put(first.window, 'meta', [{ id: 'settings', value: { ...defaults, endpoint: 'http://127.0.0.1:9/v1', model: 'mock-model', key: 'test-key' } }]);
    await put(first.window, 'sentences', [aiRecord()]);
    first.window.close();

    const dom = await boot();
    const w = dom.window;
    (w.document.querySelector('[data-nav="sentence"]') as HTMLElement).click();
    await until(w, () => !!w.document.querySelector('#source-mix-note'), 'sentence page');
    const main = w.document.querySelector('#main')!;
    const pageText = main.textContent ?? '';

    // 真实渲染出来的文字就是纯函数的输出（不是只对纯函数有效）
    assert.ok(pageText.includes(aiGenerationNotice({ configured: true, hasTargets: true, aiCount: 1 })), '页面必须渲染出同一句说明');
    assert.match(pageText, /已经有 1 句 AI 句/);
    // 页面上不得出现旧的矛盾说法
    for (const bad of FORBIDDEN)
        assert.doesNotMatch(pageText, bad, '页面上出现了旧承诺：' + bad);
    // 与同页的句源说明保持一致（都在解释「不是按比例出题」）
    assert.match(w.document.querySelector('#source-mix-note')!.textContent ?? '', /不按这个比例分配/);
});
