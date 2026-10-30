// Phase 6：生成编排（真实校验链 + 有界重试 + 不落库失败输出）
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateReading, generateSentence, EVIDENCE_NOTE } from '../src/aiGenerate.ts';
import { PROMPT_INDEX } from '../src/prompts/registry.ts';
import { READING_PROMPT } from '../src/prompts/reading.ts';
import { SENTENCE_PROMPT } from '../src/prompts/sentence.ts';
import type { AIProviderConfig } from '../src/aiProvider.ts';
const CFG: AIProviderConfig = {
    endpoint: 'https://api.example.com/v1', model: 'm', key: 'k', structuredMode: 'auto',
    timeoutMs: 3000, maxRetries: 2, maxOutputTokens: 800, temperature: 0.7, concurrency: 1, dailyTokenBudget: null,
};
const SENT = { sentence: 'The engineers had reconstructed the bridge before the storm arrived.', targetWords: ['reconstruct'], grammarTargets: ['clause.adverbial'], difficultyNote: '11 词，一个状语从句，结构清晰。', chinese: '工程师们在暴风雨前重建了桥。', structure: null, provenance: 'ai' };
const PASSAGE = 'The old bridge had been rebuilt twice before the city finally understood the river. Engineers measured the current every spring, and they recorded each flood in a long grey notebook. When the water rose, the notebook was the only thing they trusted.';
const READ = {
    title: 'The River Notebook', topic: 'engineering', passage: PASSAGE, targetWords: ['notebook', 'current'], targetGrammar: ['clause.adverbial'],
    difficultyRationale: '中等长度，含时间状语从句，生词限于目标词。',
    exercises: [
        { type: 'detail', question: 'What did the engineers measure every spring?', options: ['The bridge', 'The current', 'The notebook', 'The city'], answerIndex: 1, explanation: '原文写了 measure the current every spring。', evidenceQuote: 'Engineers measured the current every spring' },
        { type: 'main_idea', question: 'What is the passage mainly about?', options: ['A new city', 'Trusting written records', 'A storm', 'A grey notebook'], answerIndex: 1, explanation: '结尾强调记录是唯一可信的东西。', evidenceQuote: 'the notebook was the only thing they trusted' },
        { type: 'logic', question: 'Why mention the notebook?', options: ['To criticise engineers', 'To show what people relied on', 'To sell something', 'To describe the river'], answerIndex: 1, explanation: '笔记本代表他们依赖的记录。', evidenceQuote: 'the notebook was the only thing they trusted' },
    ],
};
const sentenceJob = {
    targetWords: ['reconstruct'], targetGrammar: [{ id: 'clause.adverbial', name: '状语从句', description: 'when/before/after 引导' }],
    theme: 'repairing an old bridge', level: 'B1', minWords: 6, maxWords: 40,
    knownSample: ['bridge', 'storm'], knownCount: 900, miniUnit: null,
    maxUnknownWords: 2, desired: 'medium' as const, unknownWords: [], existingHashes: new Set<string>(),
};
const readingJob = {
    topic: 'river engineering', obstacles: ['时间状语从句读不清'], targetWords: ['notebook', 'current'],
    targetGrammar: [{ id: 'clause.adverbial', name: '状语从句' }], targetWordCount: 60, level: 'B1',
    originalDifficulty: 'medium', desiredDifficulty: 'medium', sourceExcerpt: '', exerciseCount: 3,
    grammarIds: ['clause.adverbial'], minWords: 40, maxWords: 120, minExercises: 3, maxExercises: 4,
    maxUnknownWords: 3, desired: 'medium' as const, unknownWords: [], existingHashes: new Set<string>(),
};
const reply = (text: string) => ({ ok: true, status: 200, text: async () => JSON.stringify({ model: 'served', choices: [{ message: { content: text } }], usage: { prompt_tokens: 30, completion_tokens: 20 } }) });
const err = (status: number, body: string) => ({ ok: false, status, text: async () => body });
const seq = (items: Array<ReturnType<typeof reply> | ReturnType<typeof err>>) => {
    let i = 0;
    return (async () => items[Math.min(i++, items.length - 1)]) as unknown as typeof fetch;
};
test('Prompt 注册表：两个 Prompt 有 id/版本/指纹，版本写在结果元数据里', () => {
    const ids = PROMPT_INDEX.map(p => p.promptId);
    assert.ok(ids.includes('sentence.generate'));
    assert.ok(ids.includes('reading.reinforce'));
    assert.match(SENTENCE_PROMPT.version, /^\d+\.\d+\.\d+$/);
    assert.match(SENTENCE_PROMPT.fingerprint(), /^sentence\.generate@1\.0\.0#[0-9a-f]{8}$/);
    assert.notEqual(SENTENCE_PROMPT.fingerprint(), READING_PROMPT.fingerprint());
    assert.ok(SENTENCE_PROMPT.build(sentenceJob).system.length > 100);
});
test('句子生成：首次通过则 attempts=1，元数据完整、用量真实', async () => {
    const r = await generateSentence(sentenceJob, CFG, { fetchImpl: seq([reply(JSON.stringify(SENT))]) });
    assert.equal(r.ok, true);
    if (!r.ok)
        return;
    assert.equal(r.meta.attempts, 1);
    assert.equal(r.meta.promptId, 'sentence.generate');
    assert.equal(r.meta.promptVersion, '1.0.0');
    assert.match(r.meta.promptHash, /^sentence\.generate@/);
    assert.equal(r.meta.usage.promptTokens, 30);
    assert.equal(r.value.provenance, 'ai');
    assert.equal(r.quality.ok, true);
    assert.equal(JSON.stringify(r).includes('sk-'), false, '结果元数据不得含 Key');
});
test('第一次输出坏 JSON → 修正重试后成功（attempts=2）', async () => {
    const r = await generateSentence(sentenceJob, CFG, { fetchImpl: seq([reply('这不是 JSON'), reply(JSON.stringify(SENT))]) });
    assert.equal(r.ok, true);
    if (r.ok)
        assert.equal(r.meta.attempts, 2);
});
test('连续不合格：最多 3 次就停（不无限循环），并保留问题清单', async () => {
    const r = await generateSentence(sentenceJob, CFG, { fetchImpl: seq([reply('nope')]) });
    assert.equal(r.ok, false);
    if (!r.ok) {
        assert.equal(r.attempts, 3);
        assert.ok(r.issues.length > 0);
        assert.ok(r.error.message.length > 0);
    }
});
test('质量门失败（目标词没出现）会重试并以失败结束', async () => {
    const bad = { ...SENT, sentence: 'The engineers rebuilt the bridge before the storm arrived.' };
    const r = await generateSentence(sentenceJob, CFG, { fetchImpl: seq([reply(JSON.stringify(bad))]) });
    assert.equal(r.ok, false);
    if (!r.ok)
        assert.ok(r.issues.some(i => /目标词|未出现/.test(i)), JSON.stringify(r.issues));
});
test('鉴权失败立即返回（attempts=1），不会因为重试浪费额度', async () => {
    let calls = 0;
    const fetchImpl = (async () => { calls += 1; return err(401, '{"error":"bad key"}'); }) as unknown as typeof fetch;
    const r = await generateSentence(sentenceJob, CFG, { fetchImpl, sleep: async () => { } });
    assert.equal(r.ok, false);
    assert.equal(r.attempts, 1);
    assert.equal(calls, 1);
    if (!r.ok)
        assert.equal(r.error.code, 'auth');
});
test('取消生成：错误码 aborted，且不再继续尝试', async () => {
    const ac = new AbortController();
    const hang = ((_u: string, init: RequestInit) => new Promise((_res, rej) => {
        init.signal?.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    })) as unknown as typeof fetch;
    const p = generateSentence(sentenceJob, CFG, { fetchImpl: hang }, ac.signal);
    setTimeout(() => ac.abort(), 10);
    const r = await p;
    assert.equal(r.ok, false);
    if (!r.ok)
        assert.equal(r.error.code, 'aborted');
});
test('阅读强化：合法输出通过质量门，题目证据逐字来自正文', async () => {
    const r = await generateReading(readingJob, CFG, { fetchImpl: seq([reply(JSON.stringify(READ))]) });
    assert.equal(r.ok, true, r.ok ? '' : JSON.stringify((r as {
        issues: string[];
    }).issues));
    if (r.ok) {
        assert.equal(r.meta.promptId, 'reading.reinforce');
        assert.equal(r.value.exercises.length, 3);
        assert.equal(r.quality.checks.find(c => c.id === 'attribution')?.ok, true);
    }
    assert.match(EVIDENCE_NOTE, /不会让你“自动学会”/);
});
test('阅读强化：编造证据句 → 校验失败并重试，最终不通过', async () => {
    const fake = JSON.parse(JSON.stringify(READ));
    fake.exercises[0].evidenceQuote = 'Engineers counted fish every winter';
    const r = await generateReading(readingJob, CFG, { fetchImpl: seq([reply(JSON.stringify(fake))]) });
    assert.equal(r.ok, false);
    if (!r.ok)
        assert.ok(r.issues.some(i => /逐字来自正文/.test(i)), JSON.stringify(r.issues));
});
test('阅读强化：答案键越界/选项重复被拦', async () => {
    const bad = JSON.parse(JSON.stringify(READ));
    bad.exercises[1].answerIndex = 9;
    const r = await generateReading(readingJob, CFG, { fetchImpl: seq([reply(JSON.stringify(bad))]) });
    assert.equal(r.ok, false);
});
