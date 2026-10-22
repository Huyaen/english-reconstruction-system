#!/usr/bin/env node
// —— Phase 10：学情诊断真实浏览器验收 ——
// 前置：npm run build:test；node server.mjs --dir=dist-test --port=4173；
//       headless Edge + CDP（SMOKE_PORT=9230）。
// 覆盖：指标/分母、D1-D7-D30、证据质量、短板、快照/周诊断幂等、页面渲染、计划焦点、无总分。
const PORT = process.env.SMOKE_PORT || '9230';
const BASE = `http://127.0.0.1:${PORT}`;
const results = [];
function check(name, ok, detail = '') {
    results.push({ name, ok: !!ok, detail });
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  · ' + String(detail).slice(0, 220) : ''}`);
}
class CDP {
    constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.errors = []; ws.onmessage = ev => {
        const m = JSON.parse(ev.data);
        if (m.id && this.pending.has(m.id)) { const { res, rej, timer } = this.pending.get(m.id); clearTimeout(timer); this.pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
        else if (m.method === 'Runtime.exceptionThrown') this.errors.push(m.params.exceptionDetails?.exception?.description ?? 'exception');
        else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') this.errors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
    }; }
    static async connect() {
        const list = await (await fetch(`${BASE}/json/list`)).json();
        const t = list.find(x => x.type === 'page' && (x.url || '').includes('4173'));
        if (!t) throw new Error('no app page (start Edge with http://127.0.0.1:4173/?test=1)');
        const ws = new WebSocket(t.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
        return new CDP(ws);
    }
    send(method, params = {}, timeout = 8000) {
        return new Promise((res, rej) => {
            const id = ++this.id;
            const timer = setTimeout(() => { this.pending.delete(id); rej(new Error(`cdp timeout ${method}`)); }, timeout);
            this.pending.set(id, { res, rej, timer });
            this.ws.send(JSON.stringify({ id, method, params }));
        });
    }
    async eval(expression) {
        const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
        return r.result.value;
    }
    async waitFor(expr, timeout = 20000, label = expr) {
        const end = Date.now() + timeout; let last;
        while (Date.now() < end) {
            try { last = await this.eval(expr); if (last) return last; } catch (e) { last = 'err:' + e.message; }
            await new Promise(r => setTimeout(r, 250));
        }
        throw new Error(`waitFor timeout: ${label} | ${JSON.stringify(last).slice(0, 200)}`);
    }
}
const cdp = await CDP.connect();
await cdp.send('Runtime.enable');
await cdp.send('Page.enable');
const ev = e => cdp.eval(e);
const wait = (e, l, t = 20000) => cdp.waitFor(e, t, l);
const click = sel => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'MISSING';e.click();return 'ok';})()`);
const setVal = (sel, v) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'MISSING';e.value=${JSON.stringify(String(v))};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));return 'ok';})()`);
const snap = () => ev(`window.__diagnosticsTest.snapshot(7)`);

const DAY = 86400000;
const now = Date.now();
await ev(`(async()=>{ await new Promise((res)=>{const r=indexedDB.deleteDatabase('vocabulary-memory-v1'); r.onsuccess=()=>res(); r.onerror=()=>res(); r.onblocked=()=>res();}); return 1; })()`);
await cdp.send('Page.reload');
await new Promise(r => setTimeout(r, 1500));
await wait(`!!window.__diagnosticsTest && !!window.__unitTest`, 'hooks');

const word = (id, en) => ({
    id, bookId: 'b1', en, zh: '释义', pos: '', phonetic: '', example: '', collocation: '', difficulty: '', tags: '', order: 0,
    state: { total: 5, correct: 5, streak: 2, errors: 0, lapses: 0, meanMs: 1100, lastMs: 1000, lastCorrect: true, level: 'fluent', directions: { 'en-zh': { total: 5, correct: 5, meanMs: 1000 }, 'zh-en': { total: 5, correct: 5, meanMs: 1200 } } },
    schedule: { due: now, last: now - DAY, interval: 3, step: 2, spacedPasses: 3 }, confusions: {},
    recognitionScore: 90, activeRecallScore: 85, productiveScore: 60, exposureCount: 5, contextExposureCount: 3, productionEvidence: 4,
    previewedAt: 0, lastEncounteredAt: now, sourceTypes: ['book'],
    fsrs: { stability: 5, difficulty: 4, state: 2, reps: 4, lapses: 0, due: now, lastReview: now - DAY, scheduledDays: 3, learningSteps: 0 }, previewResult: '',
});
const review = (id, wordId, at, correct) => ({ id, wordId, sessionId: 's1', at, direction: 'en-zh', correct, ms: 1000 + (id.length * 100), selectedId: null, reason: 'answer', before: 'new', after: 'normal', scheduled: true });
const exposure = (id, wordId, at) => ({ id, wordId, at, sourceType: 'reading', sourceId: 'p1', state: 'unknown', sentence: '', counted: true });

const words = Array.from({ length: 16 }, (_, i) => word(`w${i + 1}`, `word${i + 1}`));
const exposures = [];
const records = [];
// D1：3 天前首次出现，第 1 天复习 4/5 正确
for (let i = 0; i < 5; i++) { exposures.push(exposure(`d1e${i}`, `w${i + 1}`, now - 3 * DAY)); records.push(review(`d1r${i}`, `w${i + 1}`, now - 2 * DAY + 3600000, i < 4)); }
// D7：8 天前首次出现，第 7 天复习 2/5 正确（最大短板）
for (let i = 0; i < 5; i++) { exposures.push(exposure(`d7e${i}`, `w${i + 6}`, now - 8 * DAY)); records.push(review(`d7r${i}`, `w${i + 6}`, now - 1 * DAY + 1800000, i < 2)); }
// D30：40 天前首次出现，第 30 天复习 5/6 正确
for (let i = 0; i < 6; i++) { exposures.push(exposure(`d30e${i}`, `w${i + 11}`, now - 40 * DAY)); records.push(review(`d30r${i}`, `w${i + 11}`, now - 10 * DAY, i < 5)); }

const concepts = [{ id: 'g.past', name: '一般过去时', parentId: null, exposures: 6, attempts: 6, correct: 2, mastery: 0.3, retention: 0.3, errorTypes: {}, lastSeenAt: now, nextReviewAt: now, createdAt: now - DAY }];
const grammar = Array.from({ length: 6 }, (_, i) => ({ id: `ga${i}`, conceptId: 'g.past', at: now - DAY + i, correct: i < 2, sourceType: 'curated', sourceId: 'x', errorType: i < 2 ? '' : 'tense', durationMs: 2000, independent: true }));
const reading = [{
    id: 'rs1', passageId: 'p1', wordCount: 300, durationMs: 300000, unknownWords: [], vagueWords: [], unknownRate: 0.3,
    firstPassComprehension: 50, secondPassComprehension: null, readingSpeed: 60, structureErrors: 0, translationDependence: 2, summary: '', stage: 3, at: now - DAY,
    detail: {
        stage: 'reading', state: 'completed', passageTitle: 'Aqueducts', chunks: [], chunkIndex: 0, paragraphIndex: 0, coldTestDone: true,
        firstPassStartedAt: now - DAY, firstPassEndedAt: now - DAY + 300000, rereadStartedAt: null, rereadEndedAt: null, helps: [],
        marks: Array.from({ length: 10 }, (_, i) => ({ id: `m${i}`, passageId: 'p1', sessionId: 'rs1', paragraphIndex: 0, sentenceIndex: 0, tokenIndex: i, surface: 'word', normalized: 'word', lemma: 'word', judgment: i < 3 ? 'unknown' : 'known', contextSentence: '', at: now - DAY })),
        difficultSentences: [],
        comprehension: [
            { id: 'c1', stage: 'whole-text', kind: 'verified-item', prompt: 'main idea', answer: 'water', language: 'en', score: 80, scoredBy: 'verified-key', assisted: false, translationDependence: null, at: now - DAY },
            { id: 'c2', stage: 'whole-text', kind: 'verified-item', prompt: 'detail', answer: 'stone', language: 'en', score: 80, scoredBy: 'verified-key', assisted: false, translationDependence: null, at: now - DAY },
            { id: 'c3', stage: 'cold-test', kind: 'self-report', prompt: '理解多少', answer: '50', language: 'zh', score: 50, scoredBy: 'self', assisted: false, translationDependence: 'C', at: now - DAY },
        ],
        evidence: [{ id: 'e1', type: 'translation-dependence', passageId: 'p1', sessionId: 'rs1', source: 'self_reported', confidence: 'medium', value: 2, key: 'k', at: now - DAY, metadata: { grade: 'C' } }],
        output: [], notes: '',
    },
}];
const inputSessions = [{
    id: 'is1', sourceId: 'src1', title: 'Real video', url: 'https://example.com/v', topic: 'water', durationMinutes: 12, watchedMinutes: 10,
    captionMode: 'en', comprehension: 70, difficultyReasons: [], outputAttemptId: '', notes: '', mode: 'standard', createdAt: now - 2 * DAY, completedAt: now - 2 * DAY + 600000, status: 'completed',
    reportedWatchedMinutes: 10,
}];
const outputAttempts = [{
    id: 'o1', prompt: 'Describe water', sourceType: 'free', sourceId: '', originalText: 'Water moves.', meaningEvidence: null, grammarEvidence: null,
    vocabularyEvidence: null, coherenceEvidence: null, repairAbility: null, corrections: [], upgradeSuggestion: '', wordCount: 2, aiEval: null,
    createdAt: now - DAY, completedAt: now - DAY, finalText: 'Water moves through stone.', supportLevel: 0, taskType: 'one_sentence',
    productiveEvidence: [
        ...Array.from({ length: 5 }, (_, i) => ({ id: `oe${i}`, wordId: 'w1', outputAttemptId: 'o1', textSpan: 'moves', context: '', independent: true, assisted: false, copied: false, correctness: 'correct', confidence: 0.6, evidenceSource: 'output_independent', at: now - DAY })),
        ...Array.from({ length: 5 }, (_, i) => ({ id: `oc${i}`, wordId: 'w2', outputAttemptId: 'o1', textSpan: 'stone', context: '', independent: true, assisted: false, copied: true, correctness: 'correct', confidence: 0.6, evidenceSource: 'output_copied', at: now - DAY })),
    ],
}];

await ev(`window.__unitTest.put('books', [{ id:'b1', name:'诊断测试', created:${now} }])`);
await ev(`window.__unitTest.put('words', ${JSON.stringify(words)})`);
await ev(`window.__unitTest.put('wordExposures', ${JSON.stringify(exposures)})`);
await ev(`window.__unitTest.put('records', ${JSON.stringify(records)})`);
await ev(`window.__unitTest.put('grammarConcepts', ${JSON.stringify(concepts)})`);
await ev(`window.__unitTest.put('grammarAttempts', ${JSON.stringify(grammar)})`);
await ev(`window.__unitTest.put('readingSessions', ${JSON.stringify(reading)})`);
await ev(`window.__unitTest.put('inputSessions', ${JSON.stringify(inputSessions)})`);
await ev(`window.__unitTest.put('outputAttempts', ${JSON.stringify(outputAttempts)})`);
await ev(`location.reload()`);
await new Promise(r => setTimeout(r, 1800));
await wait(`!!window.__diagnosticsTest`, 'hooks after seed');

let s = await snap();
const metric = id => s.metrics.find(m => m.id === id);
check('A. 指标带分母与样本，稳定词汇来自生命周期', metric('vocab.stable')?.value === 16 && metric('vocab.stable')?.sample === 16, JSON.stringify(metric('vocab.stable')));
check('B. D1/D7/D30 按窗口分桶且样本达标', s.retention.find(p => p.label === 'D1')?.total === 5 && s.retention.find(p => p.label === 'D7')?.rate === 0.4, JSON.stringify(s.retention));
check('C. 阅读未知词率只认显式标记', metric('reading.unknownRate')?.value === 0.3 && metric('reading.unknownRate')?.denominator === 10, JSON.stringify(metric('reading.unknownRate')));
check('D. 产出独立占比排除照抄', metric('output.independentShare')?.value === 0.5 && metric('output.independentShare')?.denominator === 10, JSON.stringify(metric('output.independentShare')));
check('E. 证据构成包含可核对条目，来源不止一类', s.evidence.verified === 2 && s.evidence.distinctSources >= 3, JSON.stringify(s.evidence));
check('F. 短板有指标依据（D7 或独立语法）', !!s.bottleneck && ['vocabulary', 'grammar'].includes(s.bottleneck.domain), JSON.stringify(s.bottleneck));
check('G. 不可评估指标没有假 0 值', s.metrics.filter(m => m.evaluability === 'insufficient').every(m => m.value === null), `insufficient=${s.metrics.filter(m => m.evaluability === 'insufficient').length}`);
check('H. 生成今日快照并携带明细', (await ev(`window.__diagnosticsTest.generate(7)`)).hasPayload === true);
const gen1 = await ev(`window.__diagnosticsTest.generate(7)`);
const gen2 = await ev(`window.__diagnosticsTest.generate(7)`);
check('I. 同日重复生成不堆记录', gen1.id === gen2.id && gen2.count === 1, JSON.stringify(gen2));
const week1 = await ev(`window.__diagnosticsTest.weekly(7)`);
const week2 = await ev(`window.__diagnosticsTest.weekly(7)`);
check('J. 周诊断幂等且固定周一', week1.id === week2.id && week2.weekOf === '2026-10-19' && week2.count === 1, JSON.stringify(week2));

await click(`[data-nav="diagnostics"]`);
await wait(`document.querySelector('#main h1')?.textContent === '学情诊断'`, 'diagnostics page');
const pageText = await ev(`document.querySelector('#main').innerText`);
check('K. 页面渲染结论、证据与边界', pageText.includes('最值得先处理') && pageText.includes('证据构成') && pageText.includes('不构成一个“英语总分”'));
check('L. 页面不出现单一总分', !/英语总分\s*[:：]?\s*\d/.test(pageText));
const cards = await ev(`document.querySelectorAll('.diag-metric').length`);
check('M. 分域指标卡片存在', cards >= 12, `cards=${cards}`);
await click('#diag-snapshot');
await new Promise(r => setTimeout(r, 1200));
check('N. 页内生成快照后仍留在诊断页', (await ev(`document.querySelector('#main h1')?.textContent`)) === '学情诊断');
const focusPlan = await ev(`window.__diagnosticsTest.plan(7, 45)`);
check('O. 诊断焦点进入计划理由', focusPlan.reasons.includes('diagnostic-focus-grammar') || focusPlan.reasons.includes('diagnostic-focus-vocabulary'), JSON.stringify(focusPlan.focus));
check('P. 无未捕获 JavaScript 错误', cdp.errors.length === 0, cdp.errors.join(' | '));

console.log(`\nPhase 10 smoke: ${results.filter(r => r.ok).length}/${results.length}`);
process.exit(results.every(r => r.ok) ? 0 : 1);
