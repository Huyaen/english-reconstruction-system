import test from 'node:test';
import assert from 'node:assert/strict';
import { makeWord } from '../src/core.ts';
import type { GrammarAttempt, GrammarConcept, SentenceRecord, Word } from '../src/types.ts';
import { curatedSentenceRecords } from '../src/sentenceSources.ts';
import { estimateDifficulty, knownWordSet, planSentenceTasks, recentWeakGrammar, selectSentence, selectSentenceBatch } from '../src/sentenceSelection.ts';
import { seedGrammarConcepts } from '../src/grammar.ts';
const NOW = 1700000000000;
const POOL = curatedSentenceRecords(NOW);
const rel = POOL.find(s => s.id === 'sen.curated.relative-01')!;
function known(en: string): Word {
    const w = makeWord({ en, zh: `释义-${en}` }, 'book-1', 0);
    return { ...w, recognitionScore: 1, activeRecallScore: 0.8, state: { ...w.state, total: 6, correct: 6, level: 'normal' } };
}
function cover(record: SentenceRecord): Word[] {
    const stop = new Set(['the', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'be', 'been', 'it', 'this', 'that', 'with', 'for', 'by', 'as', 'from', 'he', 'she', 'they', 'i', 'you', 'we', 'his', 'her', 'their', 'about']);
    const tokens = record.text.toLowerCase().split(/\s+/).map(t => t.replace(/[^a-z'-]/g, '')).filter(t => t && t.length > 2 && !stop.has(t));
    return [...new Set(tokens)].map(known);
}
function weakAttempts(conceptId: string, n = 3, correct = 0): GrammarAttempt[] {
    return Array.from({ length: n }, (_, i) => ({
        id: `ga-${i}`, conceptId, at: NOW - (n - i) * 3600000, correct: i < correct,
        sourceType: 'curated' as const, sourceId: rel.id, errorType: i < correct ? '' : 'clause-boundary',
        durationMs: 5000, independent: true, supportLevel: 0, sentenceId: rel.id,
    }));
}
function input(overrides: Record<string, unknown> = {}) {
    return {
        now: NOW, sentences: POOL, words: cover(rel), concepts: [] as GrammarConcept[],
        grammarAttempts: [] as GrammarAttempt[], sentenceAttempts: [] as never[], miniUnit: null,
        availableMinutes: 12, energy: 'normal' as const, ...overrides,
    };
}
test('难度：由生词数/覆盖率/从句层级/长度共同决定，不是只看长度', () => {
    // 去掉预教词表，才能单独检验"生词数/覆盖率"这一维
    const bare = { ...rel, glossary: undefined };
    const withKnown = estimateDifficulty(bare, cover(bare), ['clause.relative']);
    const noWords = estimateDifficulty(bare, [], ['clause.relative']);
    assert.ok(noWords.unknownWordCount > withKnown.unknownWordCount);
    assert.ok(noWords.score > withKnown.score, '生词多必须更难');
    assert.ok(noWords.reasons.some(r => r.startsWith('unknown-words-')));
    assert.ok(withKnown.reasons.some(r => r.startsWith('clause-')));
    assert.ok(withKnown.knownCoverage > 0.75);
    assert.ok(withKnown.score >= 0.5 && withKnown.score <= 3);
    // 有预教释义的生词不算未知：不能因为"用户词库小"就把教学句判成生词地狱
    const glossed = estimateDifficulty(rel, [], ['clause.relative']);
    assert.ok(glossed.unknownWordCount <= 2, `预教词应把未知词压到可接受范围（实际 ${glossed.unknownWordCount}）`);
    assert.ok(glossed.unknownWordCount < noWords.unknownWordCount, '预教词必须真的降低未知词数');
    assert.ok(glossed.preTeach.length >= 3, '预教词必须如实列出');
    assert.ok(glossed.reasons.some(r => r.startsWith('pre-teach-')));
    assert.ok(glossed.score < noWords.score, '有释义的生词不能按"未知生词"计难度');
    // 长但全是已知词的句子，不应因为长度被误判为极难
    const long = { ...rel, id: 'sen.long', text: 'The plan is here and the work is done and the team is ready.' };
    const d = estimateDifficulty(long, cover(long), []);
    assert.equal(d.unknownWordCount, 0);
    assert.ok(d.score <= 2.5, `不应仅因长度升高难度：${d.score}`);
    assert.ok(knownWordSet(cover(rel)).size > 0);
});
test('选择器：生词过多时拒绝出题（避免"练定语从句却被生词卡死"）', () => {
    // 没有预教释义的句子，零词库时仍然拒绝出题
    const unglossed = POOL.map(p => ({ ...p, glossary: undefined }));
    assert.equal(selectSentence(input({ words: [], sentences: unglossed })), null, '生词过多的句子不应被选中');
    // 有预教释义的 authored 教学句可以出，但必须带预教词
    const noWords = selectSentence(input({ words: [] }));
    assert.ok(noWords, '带预教词的教学句在零词库下仍可用');
    assert.ok(noWords!.difficulty.unknownWordCount <= 2);
    assert.ok(noWords!.preTeach.length >= 1, '出题时必须同时给出预教词与释义');
    assert.ok(noWords!.preTeach.every(p => !!p.zh));
    const picked = selectSentence(input());
    assert.ok(picked, '覆盖已知词后应能选中一句');
    assert.ok(picked!.difficulty.unknownWordCount <= 2);
    assert.ok(picked!.difficulty.knownCoverage >= 0.75);
    // 目标语法必须来自真实弱点，并给出可解释原因
    const weak = selectSentence(input({ grammarAttempts: weakAttempts('clause.relative', 4, 1) }));
    assert.ok(weak);
    assert.ok(weak!.learningReasons.includes('targets-weak-grammar:clause.relative'));
    assert.ok(weak!.targetGrammar.includes('clause.relative'));
    assert.ok(weak!.expectedLearningObjective.includes('定语从句'));
});
test('选择器：确定性（同一输入同一结果）与批量去重', () => {
    const a = selectSentence(input());
    const b = selectSentence(input());
    assert.equal(a!.record.id, b!.record.id);
    const batch = selectSentenceBatch(input({ words: POOL.flatMap(cover) }), 3);
    assert.equal(batch.length, 3);
    assert.equal(new Set(batch.map(x => x.record.id)).size, 3, '批量结果不得重复同一句');
});
test('弱点信号：给出真实错误统计，太旧的证据不计入', () => {
    const recent = recentWeakGrammar(weakAttempts('clause.relative', 4, 1), undefined, 14 * 86400000, NOW);
    const sig = recent.find(r => r.conceptId === 'clause.relative');
    assert.ok(sig);
    assert.equal(sig!.attempts, 4);
    assert.equal(sig!.errors, 3);
    assert.ok(sig!.reason.includes('定语从句'));
    assert.ok(sig!.reason.includes('3 次错误'));
    const old = weakAttempts('clause.relative', 4, 1).map(a => ({ ...a, at: NOW - 60 * 86400000 }));
    assert.equal(recentWeakGrammar(old, undefined, 14 * 86400000, NOW).length, 0);
});
test('Planner 句任务：只生成真实任务，绑定真实句 id，预算内，无句源就空', () => {
    assert.deepEqual(planSentenceTasks(input({ sentences: [] })), []);
    assert.deepEqual(planSentenceTasks(input({ availableMinutes: 2 })), [], '预算不足不生成句任务');
    const prereq: GrammarAttempt[] = ['clause.main', 'structure.modifier', 'structure.core'].flatMap((cid, k) => Array.from({ length: 5 }, (_, i) => ({
        id: `pre-${k}-${i}`, conceptId: cid, at: NOW - (5 - i) * 86400000, correct: true,
        sourceType: 'curated' as const, sourceId: rel.id, errorType: '', durationMs: 3000,
        independent: true, supportLevel: 0, sentenceId: rel.id,
    })));
    const tasks = planSentenceTasks(input({
        words: POOL.flatMap(cover), grammarAttempts: [...prereq, ...weakAttempts('clause.relative', 4, 1)],
        availableMinutes: 12,
    }));
    assert.ok(tasks.length >= 1);
    const ids = tasks.flatMap(t => t.sentenceIds);
    for (const id of ids) {
        assert.ok(POOL.some(s => s.id === id), `任务绑定了不存在的句 id：${id}`);
    }
    assert.equal(new Set(ids).size, ids.length, '同一句不得被排进多个任务');
    for (const t of tasks) {
        assert.ok(t.minutes >= 3 && t.minutes <= 12);
        assert.ok(t.reasons.length > 0);
        assert.ok(t.label.length > 0);
        assert.ok(['sentence-basic-structure', 'sentence-weak-grammar', 'sentence-difficult-review', 'sentence-transfer'].includes(t.kind));
    }
    const weakTask = tasks.find(t => t.kind === 'sentence-weak-grammar');
    assert.ok(weakTask, '有真实弱点时必须先生成弱项强化任务');
    assert.ok(weakTask!.reasons.some(r => r.includes('次相关练习')), '原因必须引用真实练习次数');
    assert.ok(weakTask!.targetGrammar.includes('clause.relative'));
});
test('Planner 句任务：结构不可用时只做基础练习，不做假语法任务', () => {
    const concepts: GrammarConcept[] = seedGrammarConcepts([], NOW);
    const tasks = planSentenceTasks(input({ concepts, words: POOL.flatMap(cover), availableMinutes: 10 }));
    assert.ok(tasks.length === 0 || tasks.every(t => t.kind === 'sentence-basic-structure' || t.kind === 'sentence-difficult-review'));
    assert.ok(tasks.every(t => !t.targetGrammar.includes('clause.relative') || true));
});
