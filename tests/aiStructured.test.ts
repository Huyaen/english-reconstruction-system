// Phase 6：JSON 修复 / 契约校验 / 质量门 / 用量预算
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractBalanced, parseModelJson, removeTrailingCommas } from '../src/aiJson.ts';
import { containsWord, normalizeForCompare, validateReading, validateSentence } from '../src/aiValidate.ts';
import { checkReadingQuality, checkSentenceQuality, grammarObservable, summarize } from '../src/aiQuality.ts';
import { budgetState, buildGeneration, usedTokensToday, findReusable, startOfDay } from '../src/aiStore.ts';
import type { AIGeneration } from '../src/types.ts';
const SENTENCE_OK = {
    sentence: 'The engineers had reconstructed the bridge before the storm arrived.',
    targetWords: ['reconstruct'],
    grammarTargets: ['clause.adverbial'],
    difficultyNote: '句子 11 词，只有一个状语从句，结构清晰。',
    chinese: '工程师们在暴风雨来临前重建了这座桥。',
    structure: null,
    provenance: 'ai',
};
const SENTENCE_SPEC = { allowedWords: ['reconstruct'], grammarConceptIds: ['clause.adverbial'], minWords: 6, maxWords: 40 };
const PASSAGE = 'The old bridge had been rebuilt twice before the city finally understood the river. Engineers measured the current every spring, and they recorded each flood in a long grey notebook. When the water rose, the notebook was the only thing they trusted.';
function readingOk() {
    return {
        title: 'The River Notebook',
        topic: 'engineering',
        passage: PASSAGE,
        targetWords: ['notebook', 'current'],
        targetGrammar: ['clause.adverbial'],
        difficultyRationale: '句子中等长度，含一个时间状语从句，生词控制在目标词内。',
        exercises: [
            {
                type: 'detail', question: 'What did the engineers measure every spring?', options: ['The bridge', 'The current', 'The notebook', 'The city'],
                answerIndex: 1, explanation: '原文说 engineers measured the current every spring。',
                evidenceQuote: 'Engineers measured the current every spring',
            },
            {
                type: 'main_idea', question: 'What is the passage mainly about?', options: ['Building a new city', 'Trusting recorded measurements', 'A storm', 'A long grey notebook'],
                answerIndex: 1, explanation: '全文围绕记录与信任记录展开。', evidenceQuote: 'the notebook was the only thing they trusted',
            },
            {
                type: 'logic', question: 'Why does the writer mention the notebook?', options: ['To criticise engineers', 'To show what people relied on', 'To sell a product', 'To describe the river'],
                answerIndex: 1, explanation: '笔记本象征他们依赖的记录。', evidenceQuote: 'the notebook was the only thing they trusted',
            },
        ],
    };
}
test('JSON 修复：代码围栏 / 前后废话 / 多余逗号都能救回，坏 JSON 明确失败', () => {
    assert.deepEqual(parseModelJson('{"a":1}'), { ok: true, value: { a: 1 }, repaired: false });
    const fenced = parseModelJson('```json\n{"a":1}\n```');
    assert.equal(fenced.ok, true);
    assert.equal(fenced.repaired, true);
    const chatty = parseModelJson('好的，结果如下：\n{"a": [1,2]}\n希望有帮助。');
    assert.equal(chatty.ok, true);
    assert.deepEqual(chatty.value, { a: [1, 2] });
    const commas = parseModelJson('{"a": [1,2,],}');
    assert.equal(commas.ok, true);
    assert.equal(parseModelJson('totally not json').ok, false);
    assert.equal(parseModelJson('').ok, false);
    assert.equal(parseModelJson('{"a": ').ok, false);
    assert.equal(extractBalanced('x {"a":"}"} y').text, '{"a":"}"}');
    assert.equal(removeTrailingCommas('[1,2,]').text, '[1,2]');
});
test('词形匹配：reconstruct 命中 reconstructed，但 art 不会命中 start', () => {
    assert.equal(containsWord('They reconstructed it.', 'reconstruct'), true);
    assert.equal(containsWord('The reconstruction is done.', 'reconstruct'), true);
    assert.equal(containsWord('Start now.', 'art'), false);
    assert.equal(containsWord('An art show.', 'art'), true);
    assert.equal(normalizeForCompare('  The   Bridge \n fell.  '), 'the bridge fell.');
});
test('句子契约：合法通过；缺字段/多字段/枚举错/目标词越界/语法点不存在 全部拒绝', () => {
    const ok = validateSentence(SENTENCE_OK, SENTENCE_SPEC);
    assert.equal(ok.issues.length, 0, JSON.stringify(ok.issues));
    assert.equal(ok.value?.sentence.includes('reconstructed'), true);
    const missing = validateSentence({ ...SENTENCE_OK, sentence: undefined }, SENTENCE_SPEC);
    assert.ok(missing.issues.some(i => i.path === '$.sentence'));
    const extra = validateSentence({ ...SENTENCE_OK, bonus: 'x' }, SENTENCE_SPEC);
    assert.ok(extra.issues.some(i => /契约之外/.test(i.message)));
    const badEnum = validateSentence({ ...SENTENCE_OK, provenance: 'human' }, SENTENCE_SPEC);
    assert.ok(badEnum.issues.some(i => i.path === '$.provenance'));
    const badWord = validateSentence({ ...SENTENCE_OK, targetWords: ['banana'] }, SENTENCE_SPEC);
    assert.ok(badWord.issues.some(i => /不在允许集合/.test(i.message)));
    const badGrammar = validateSentence({ ...SENTENCE_OK, grammarTargets: ['clause.nope'] }, SENTENCE_SPEC);
    assert.ok(badGrammar.issues.some(i => /不在知识图谱/.test(i.message)));
    const tooShort = validateSentence({ ...SENTENCE_OK, sentence: 'Birds fly.' }, SENTENCE_SPEC);
    assert.ok(tooShort.issues.some(i => /词数/.test(i.message)));
    const html = validateSentence({ ...SENTENCE_OK, sentence: 'Please click this <script>alert(1)</script> link before the storm arrives tonight' }, SENTENCE_SPEC);
    // 句子契约不拦 HTML（质量门拦），但这里至少要能通过结构校验
    assert.equal(html.value?.sentence.includes('<script>'), true);
});
test('阅读契约：证据句必须逐字来自正文；答案键/选项/HTML 都被检查', () => {
    const ok = validateReading(readingOk(), { allowedGrammar: ['clause.adverbial'], minWords: 40, maxWords: 120, minExercises: 3, maxExercises: 4 });
    assert.equal(ok.issues.length, 0, JSON.stringify(ok.issues));
    const fakeQuote = readingOk();
    fakeQuote.exercises[0].evidenceQuote = 'Engineers counted fish every winter';
    const bad = validateReading(fakeQuote, { allowedGrammar: ['clause.adverbial'], minWords: 40, maxWords: 120, minExercises: 3, maxExercises: 4 });
    assert.ok(bad.issues.some(i => /逐字来自正文/.test(i.message)));
    const badIndex = readingOk();
    badIndex.exercises[0].answerIndex = 7;
    assert.ok(validateReading(badIndex, { allowedGrammar: ['clause.adverbial'], minWords: 40, maxWords: 120, minExercises: 3, maxExercises: 4 }).issues.some(i => /answerIndex/.test(i.message)));
    const dupOptions = readingOk();
    dupOptions.exercises[0].options = ['A', 'A', 'B', 'C'];
    assert.ok(validateReading(dupOptions, { allowedGrammar: ['clause.adverbial'], minWords: 40, maxWords: 120, minExercises: 3, maxExercises: 4 }).issues.some(i => /重复/.test(i.message)));
    const withHtml = readingOk();
    withHtml.passage = PASSAGE + ' <img src=x onerror=alert(1)>';
    assert.ok(validateReading(withHtml, { allowedGrammar: ['clause.adverbial'], minWords: 40, maxWords: 120, minExercises: 3, maxExercises: 4 }).issues.some(i => /HTML/.test(i.message)));
    const badGrammar = readingOk();
    badGrammar.targetGrammar = ['clause.invented'];
    assert.ok(validateReading(badGrammar, { allowedGrammar: ['clause.adverbial'], minWords: 40, maxWords: 120, minExercises: 3, maxExercises: 4 }).issues.some(i => /不在知识图谱/.test(i.message)));
});
test('句子质量门：重复 / 陌生词过载 / 语法未出现 / 难度离谱 / 脚本 都能拦住', () => {
    const ctx = { minWords: 6, maxWords: 40, allowedWords: ['reconstruct'], grammarIds: ['clause.adverbial'], desired: 'medium' as const, existingHashes: new Set<string>(), contentHash: 'h1', unknownWords: [], maxUnknownWords: 2 };
    const ok = checkSentenceQuality(SENTENCE_OK as never, ctx);
    assert.equal(ok.ok, true, summarize(ok));
    const dupe = checkSentenceQuality(SENTENCE_OK as never, { ...ctx, existingHashes: new Set(['h1']) });
    assert.equal(dupe.ok, false);
    assert.ok(dupe.checks.some(c => c.id === 'duplicate' && !c.ok));
    const overload = checkSentenceQuality(SENTENCE_OK as never, { ...ctx, unknownWords: ['a', 'b', 'c'] });
    assert.equal(overload.ok, false);
    const noGrammar = checkSentenceQuality({ ...SENTENCE_OK, sentence: 'The engineers rebuilt the bridge yesterday.' } as never, ctx);
    assert.equal(noGrammar.ok, false, '缺状语从句必须判失败');
    const tooHard = checkSentenceQuality({ ...SENTENCE_OK, sentence: 'Although the engineers, who had reconstructed the bridge that the storm had damaged in a way nobody could have predicted, were exhausted, they continued working until every span had been measured again.' } as never, { ...ctx, desired: 'easy' });
    assert.equal(tooHard.ok, false);
    const script = checkSentenceQuality({ ...SENTENCE_OK, sentence: 'They reconstructed it <script>alert(1)</script> before the storm arrived.' } as never, ctx);
    assert.equal(script.ok, false);
    assert.ok(script.checks.some(c => c.id === 'safety' && !c.ok));
});
test('语法可观察性：语义型概念标 unverifiable，不假装验证过', () => {
    const obs = grammarObservable(['clause.relative', 'structure.core']);
    assert.deepEqual(obs.observable, ['clause.relative']);
    assert.deepEqual(obs.unverifiable, ['structure.core']);
});
test('阅读质量门：证据/难度/重复/答案键都生效', () => {
    const v = validateReading(readingOk(), { allowedGrammar: ['clause.adverbial'], minWords: 40, maxWords: 120, minExercises: 3, maxExercises: 4 }).value!;
    const ctx = { minWords: 40, maxWords: 120, grammarIds: ['clause.adverbial'], desired: 'medium' as const, existingHashes: new Set<string>(), contentHash: 'r1', unknownWords: [], maxUnknownWords: 3 };
    const ok = checkReadingQuality(v, ctx);
    assert.equal(ok.ok, true, summarize(ok));
    const dupe = checkReadingQuality(v, { ...ctx, existingHashes: new Set(['r1']) });
    assert.equal(dupe.ok, false);
    const band = checkReadingQuality(v, { ...ctx, desired: 'easy' });
    assert.equal(band.checks.some(c => c.id === 'difficulty'), true);
});
test('生成记录与预算：按 token 计，不伪造货币金额', () => {
    const now = Date.UTC(2026, 9, 20, 4, 0, 0);
    const gen = (id: string, at: number, p: number, c: number): AIGeneration => ({
        id, kind: 'sentence', createdAt: at, promptId: 'sentence.generate', promptVersion: '1.0.0', promptHash: 'h',
        providerHost: 'api.example.com', model: 'm', structuredMode: 'json_object', contentHash: id,
        usage: { promptTokens: p, completionTokens: c, estimated: false }, output: {}, quality: { ok: true, notes: [] }, sourceMetadata: {},
    });
    const gens = [gen('a', now, 100, 50), gen('b', now - 86400000, 900, 900)];
    assert.equal(usedTokensToday(gens, now), 150);
    assert.equal(startOfDay(now) <= now, true);
    assert.equal(budgetState(gens, null, now).allowed, true);
    assert.equal(budgetState(gens, 100, now).allowed, false);
    assert.equal(budgetState(gens, 100, now).usedTokens, 150);
    // 记录里绝不出现 Key
    const rec = buildGeneration('sentence', { sentence: 'x' }, {
        promptId: 'sentence.generate', promptVersion: '1.0.0', promptHash: 'h', providerHost: 'api.example.com', model: 'm',
        structuredMode: 'json_object', attempts: 1, usage: { promptTokens: 1, completionTokens: 2, estimated: false },
        generatedAt: now, contentHash: 'c', privacy: 'only targets',
    }, { ok: true, notes: [] }, now);
    assert.equal(JSON.stringify(rec).includes('sk-'), false);
    assert.equal(findReusable([{ ...rec, output: { requestKey: 'k' } }], 'sentence', 'k')?.id, rec.id);
});
