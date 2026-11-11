import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { randomUUID } from 'node:crypto';
import { makeWord, question } from '../src/core.ts';
import { applyPreview } from '../src/evidence.ts';
import { createDailyPlan } from '../src/planner.ts';
import { newSession, answer } from '../src/quiz.ts';
import { emptyData, openDB, replaceData, loadData } from '../src/db.ts';

test('boot and reopen keep a partially answered plan task started with the same session and records', async () => {
    const now = Date.now();
    const data = emptyData();
    data.books = [{ id: 'resume-book', name: '隔离恢复测试', created: now }];
    data.words = Array.from({ length: 25 }, (_, i) => makeWord({ en: 'resume' + i, zh: '释义' + i }, 'resume-book', i));
    const { plan } = createDailyPlan({ now, availableMinutes: 60, energy: 'normal', newWordGoal: 20, words: data.words, records: [] });
    const preview = plan.initialPlan.find(t => t.kind === 'new-preview')!;
    const recall = plan.initialPlan.find(t => t.kind === 'new-recall')!;
    preview.status = 'done'; preview.startedAt = now - 2000; preview.completedAt = now - 1000;
    recall.status = 'started'; recall.startedAt = now - 500;
    const ids = new Set(preview.refs);
    data.words = data.words.map(w => ids.has(w.id) ? applyPreview(w, 'know', now - 1000, w.id).word : w);
    const session = newSession(data.words.filter(w => ids.has(w.id)), 'new-recall');
    session.planTaskId = recall.id; session.started = now - 500;
    const first = data.words.find(w => w.id === session.queue[0])!;
    session.question = question(first, data.words, 'en-zh', 'normal');
    const result = answer(session, first, first.id, 500, 'answer', data.settings, now);
    data.words[data.words.findIndex(w => w.id === first.id)] = result.word;
    data.sessions = [result.session]; data.records = [result.record]; data.dailyPlans = [plan];
    await openDB(); await replaceData(data);
    const output = await build({ entryPoints: ['src/app.ts'], bundle: true, format: 'iife', write: false, loader: { '.css': 'empty' } });
    for (let attempt = 0; attempt < 2; attempt++) {
        const dom = new JSDOM('<div id="app"></div><div id="toast"></div><dialog id="modal"></dialog>', { url: 'http://localhost:4173/', runScripts: 'outside-only', pretendToBeVisual: true });
        try {
            const w = dom.window;
            Object.assign(w, { indexedDB, structuredClone, TextDecoder, TextEncoder });
            Object.defineProperty(w.crypto, 'randomUUID', { value: randomUUID });
            Object.defineProperty(w.navigator, 'locks', { value: { request: (_n: unknown, _o: unknown, fn: (l: object) => unknown) => fn({}) } });
            w.eval(output.outputFiles[0].text);
            const limit = Date.now() + 8000;
            while (!w.document.querySelector('#resume') && Date.now() < limit) await new Promise(r => setTimeout(r, 10));
            assert.ok(w.document.querySelector('#resume'));
            const stored = await loadData();
            assert.equal(stored.dailyPlans[0].initialPlan.find(t => t.id === recall.id)?.status, 'started');
            assert.deepEqual(stored.sessions, data.sessions);
            assert.deepEqual(stored.records, data.records);
        } finally { dom.window.close(); }
    }
});
