import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { validateBackup } from '../src/db.ts';
import { fnv1a } from '../src/prompts/registry.ts';
import { OUTPUT_PROMPT_VERSION } from '../src/prompts/output.ts';

// Run only against the dedicated v1.4 test build and disposable Edge profile.
const origin = 'http://127.0.0.1:4214';
const fixturePath = process.env.CIJIAN_E2E_REAL_BACKUP;
const outputPath = process.env.CIJIAN_E2E_OUTPUT;
assert.ok(fixturePath && outputPath, 'External backup and output directory are required');
await mkdir(outputPath, { recursive: true });
const targets = await (await fetch('http://127.0.0.1:9414/json/list')).json();
const target = targets.find(t => t.type === 'page' && new URL(t.url).origin === origin && new URL(t.url).searchParams.has('test'));
assert.ok(target, 'Dedicated test origin with ?test=1 is required');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((open, reject) => { ws.onopen = open; ws.onerror = reject; });
let nextId = 0;
const pending = new Map();
ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    const call = pending.get(msg.id);
    if (!call) return;
    pending.delete(msg.id);
    clearTimeout(call.timer);
    if (msg.error) call.reject(new Error(msg.error.message));
    else call.resolve(msg.result);
};
function send(method, params = {}) {
    return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout ${method}`)); }, 25000);
        pending.set(id, { resolve, reject, timer });
        ws.send(JSON.stringify({ id, method, params }));
    });
}
async function evaluate(expression) {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'Browser evaluation failed');
    return r.result.value;
}
async function waitFor(expression) {
    for (let i = 0; i < 120; i++) {
        if (await evaluate(expression)) return;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Missing UI state: ${expression}`);
}
function click(selector) {
    return evaluate(`document.querySelector(${JSON.stringify(selector)}).click(); true`);
}
async function backup() {
    return JSON.parse(await evaluate('window.__inputTest.backupJson()'));
}
const canon = value => Array.isArray(value) ? value.map(canon) : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canon(value[key])])) : value;
function domainHash(value) {
    const ordered = Array.isArray(value) ? value.slice().sort((a, b) => a.id.localeCompare(b.id)) : value;
    return createHash('sha256').update(JSON.stringify(canon(ordered))).digest('hex');
}
const checks = [];
function passed(text) { checks.push(text); console.log(`PASS ${text}`); }
async function shot(selector, name) {
    await evaluate(`(() => {
        document.querySelector('#v14-fixture-banner')?.remove();
        const section = document.querySelector(${JSON.stringify(selector)});
        const banner = document.createElement('p');
        banner.id = 'v14-fixture-banner'; banner.className = 'pill';
        banner.setAttribute('role', 'note');
        section.style.scrollMarginTop = '68px';
        banner.textContent = '隔离验收 · 以下作答和写作反馈是合成夹具';
        section.prepend(banner); section.scrollIntoView({ block: 'start', behavior: 'instant' });
        return true;
    })()`);
    await new Promise(resolve => setTimeout(resolve, 250));
    const image = await send('Page.captureScreenshot', { captureBeyondViewport: false });
    await writeFile(resolve(outputPath, name), Buffer.from(image.data, 'base64'));
}
function dayAt(now, daysAgo) {
    const day = new Date(now);
    day.setDate(day.getDate() - daysAgo);
    day.setHours(10, 0, 0, 0);
    return day.getTime();
}
function addFeedback(data, now, index, age, type, source = 'ai') {
    const id = `fixture-output-${index}`;
    const originalText = type === 'tense' ? 'Yesterday I walk to the park.' : `In example ${index}, I saw a apple.`;
    const original = type === 'tense' ? 'walk' : 'a apple';
    const at = dayAt(now, age);
    const start = originalText.indexOf(original);
    const span = { type, original, proposed: type === 'tense' ? 'walked' : 'an apple', start, end: start + original.length,
        explanation: '隔离夹具的反馈定位', severity: 'major', confidence: 0.95 };
    const feedback = { communicationGoal: 'Describe a scene', meaningAssessment: 'unavailable', meaningBasis: 'unknown', meaningConfidence: 0,
        strengths: ['用一句话交代了事件。'], priorityIssues: [span], corrections: [{ ...span }], grammarConceptIds: [], targetWordIds: [], upgrade: null,
        nextPractice: '读一遍修改后的句子。', feedbackScope: 'language_only', sourceProvenance: 'user_text', uncertainty: '合成夹具', promptVersion: OUTPUT_PROMPT_VERSION, noCorrectionNeeded: false };
    const task = { id: `${id}-task`, taskType: 'one_sentence', topic: '隔离夹具', communicationGoal: 'Describe a scene', sourceType: 'free',
        sourceId: '', sourceLabel: '隔离夹具', targetWords: [], targetGrammar: [], expectedMinutes: 3, difficultyEstimate: 0.5,
        minWords: 3, maxWords: 40, reasons: [], createdAt: at };
    data.outputAttempts.push({ id, task, taskType: task.taskType, prompt: task.communicationGoal, sourceType: 'free', sourceId: '', originalText,
        meaningEvidence: null, grammarEvidence: null, vocabularyEvidence: null, coherenceEvidence: null, repairAbility: null,
        corrections: [], upgradeSuggestion: '', wordCount: originalText.split(/\s+/).length, aiEval: null, createdAt: at, updatedAt: at + 1000,
        completedAt: at + 1000, status: 'completed', supportLevel: 0, feedbackSource: source, feedbackStatus: 'ai', feedback,
        promptVersion: OUTPUT_PROMPT_VERSION, aiGenerationId: `${id}-gen`, revisions: [{ text: originalText.replace(original, span.proposed),
            at: at + 1000, kind: 'self', similarityToSuggestion: 0.5 }] });
    data.aiGenerations.push({ id: `${id}-gen`, kind: 'output', createdAt: at + 1000, promptId: 'output-diagnose', promptVersion: OUTPUT_PROMPT_VERSION,
        promptHash: 'fixture', providerHost: 'example.invalid', model: 'fixture-engine', structuredMode: 'json',
        contentHash: fnv1a(`${originalText.trim().toLowerCase()}|${OUTPUT_PROMPT_VERSION}`), usage: { promptTokens: 0, completionTokens: 0, estimated: true },
        output: { requestKey: `${id}|${OUTPUT_PROMPT_VERSION}|${parseInt(fnv1a(originalText), 16).toString(36)}`, feedback },
        quality: { ok: true, notes: [] }, sourceMetadata: {} });
}
function addRetention(data, now) {
    const addChoice = (word, i, age, correct) => {
        const sessionId = `fixture-choice-${i}-${age}`;
        const at = dayAt(now, age);
        data.sessions.push({ id: sessionId, started: at - 1000, ended: at + 1000, mode: 'review', queue: [word.id], index: 1, answered: 1, correct: +correct, retries: {}, question: null });
        data.records.push({ id: `${sessionId}-record`, wordId: word.id, sessionId, at, direction: i % 2 ? 'zh-en' : 'en-zh', correct,
            ms: 1000, selectedId: correct ? word.id : null, reason: correct ? 'answer' : 'unknown', before: age === 36 ? 'new' : 'normal', after: 'normal', scheduled: age !== 36 });
    };
    data.words.slice(0, 8).forEach((word, i) => {
        addChoice(word, i, 36, true);
        for (const age of [35, 29, 6]) addChoice(word, i, age, i < 6);
        for (const age of [35, 29, 6]) {
            const id = `fixture-spell-${i}-${age}`;
            const correct = i < 4;
            data.spellingAttempts.push({ id, sessionId: `${id}-session`, wordId: word.id, at: dayAt(now, age), input: correct ? word.en : 'different spelling',
                expected: word.en, correct, assisted: i === 7, retry: false, ms: 1000, normalizationVersion: 1 });
        }
        if (i < 5) {
            const id = `fixture-cloze-${i}`;
            const prefix = 'I remember ';
            const correct = i < 4;
            data.clozeAttempts.push({ id, sessionId: `${id}-session`, wordId: word.id, at: dayAt(now, 29),
                input: correct ? word.en : 'another answer', expected: word.en, correct, assisted: false, retry: false, ms: 1000,
                normalizationVersion: 1, passageId: 'fixture-removed-passage', readingSessionId: 'fixture-removed-reading', markId: `${id}-mark`,
                sentenceIndex: 0, sentence: `${prefix}${word.en} today.`, start: prefix.length, end: prefix.length + word.en.length,
                lemma: word.en, markedAt: dayAt(now, 36), source: 'saved-reading', sourceType: 'import', sourceTitle: '隔离合成阅读', sourceUrl: '' });
        }
    });
}
try {
    await evaluate('window.__v14OldDocument = true; true');
    await send('Page.reload');
    await waitFor(`location.origin === '${origin}' && !window.__v14OldDocument && !!window.__inputTest && !!document.querySelector('[data-nav=home]')`);
    const original = JSON.parse(await readFile(fixturePath, 'utf8'));
    validateBackup(original);
    assert.equal(original.version, 9);
    assert.equal(original.data.words.length, 4716);
    assert.ok(!original.data.settings.key && !original.data.settings.ai?.key);
    const restore = value => evaluate(`window.__inputTest.restoreJson(${JSON.stringify(JSON.stringify(value))})`);
    await restore(original);
    const pristine = await backup();
    for (const [key, value] of Object.entries(original.data)) assert.equal(domainHash(pristine.data[key]), domainHash(value), key);
    passed('真实备份在独立 DB9 恢复，4716 个词条及各域一致');

    const seeded = structuredClone(pristine);
    for (const key of ['records', 'sessions', 'spellingAttempts', 'clozeAttempts', 'outputAttempts', 'aiGenerations']) seeded.data[key] = [];
    const now = await evaluate('Date.now()');
    addRetention(seeded.data, now);
    for (const [i, age] of [1, 3, 5, 9, 19].entries()) addFeedback(seeded.data, now, i, age, i === 4 ? 'tense' : 'article');
    addFeedback(seeded.data, now, 5, 2, 'tense', 'mock');
    validateBackup(seeded);
    await restore(seeded);
    const before = await backup();
    await click('[data-nav=output]');
    await waitFor('!!document.querySelector("#out-error-summary")');
    const summary = () => evaluate('document.querySelector("#out-error-summary").textContent');
    const setWindow = days => evaluate(`(() => { const box = document.querySelector('#out-error-window'); box.value = '${days}'; box.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`);
    await setWindow(7);
    const week = await summary();
    assert.match(week, /冠词/);
    assert.match(week, /3 处记录/);
    assert.doesNotMatch(week, /时态/);
    assert.match(week, /已排除 1 条模拟反馈记录/);
    assert.match(week, /重复|反复/);
    assert.doesNotMatch(week, /Yesterday I walk/);
    await setWindow(30);
    assert.notEqual(await summary(), week);
    assert.match(await summary(), /时态/);
    await setWindow(14);
    assert.notEqual(await summary(), week);
    await evaluate('document.querySelector("#out-error-summary details").open = true; true');
    await shot('#out-error-summary', '表达错误汇总.png');
    passed('写作入口 7/14/30 天切换，重复类别和修改例子可见');

    await click('[data-nav=diagnostics]');
    await waitFor('!!document.querySelector("#diag-observed-retention")');
    const card = (mode, window) => evaluate(`document.querySelector('[data-retention-mode=${mode}][data-retention-window=${window}]').textContent`);
    for (const window of ['D1', 'D7', 'D30']) {
        assert.match(await card('recognition', window), /75%/);
        assert.match(await card('recognition', window), /6 \/ 8/);
        assert.match(await card('spelling', window), /57%/);
        assert.match(await card('cloze', window), window === 'D7' ? /80%/ : /无有效复习/);
    }
    assert.match(await evaluate('document.querySelector("#main").textContent'), /旧版保持率/);
    await shot('#diag-observed-retention', '分维度实测保持率.png');
    passed('D1/D7/D30 分模式正确率、无复习留空、旧口径对照');
    const after = await backup();
    for (const [key, value] of Object.entries(before.data)) assert.equal(domainHash(after.data[key]), domainHash(value), key);
    passed('切换报告未写入作答、FSRS、到期、计划或历史状态');
    await restore(after);
    const restored = await backup();
    for (const [key, value] of Object.entries(after.data)) assert.equal(domainHash(restored.data[key]), domainHash(value), key);
    passed('合成历史完整备份恢复，密钥字段为空');
    assert.ok(!restored.data.settings.key && !restored.data.settings.ai?.key);
    await restore(original);
    await writeFile(resolve(outputPath, 'v1.4-e2e.json'), JSON.stringify({ origin, checks, sample: '真实词书只读快照，作答及反馈合成', databaseVersion: 9 }, null, 2));
} finally {
    ws.close();
}
