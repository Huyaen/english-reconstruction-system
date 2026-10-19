import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { openDB, replaceData, emptyData } from '../src/db.ts';
import { buildPastedDraft, toPassage } from '../src/readingImport.ts';
import { parsePassageText, tokenizeSentence } from '../src/readingText.ts';
import { createReadingSession, startColdTest, submitColdTest, startReading, goToChunk, nextChunk, atLastChunk, submitMainIdea, markWord, revokeMark, requestHelp, maxHelpLevelUsed, captureDifficultSentence, linkDifficultSentenceAttempt, finishFirstPass, startReread, finishReread, submitWholeTextItem, submitOutput, completeReadingSession, pauseSession, resumeSession, isResumable, sessionProgress, sentencesOfChunk, isAssisted, READING_STAGES, READING_LIMITS } from '../src/readingSession.ts';
import { computeReadingMetrics, computeReadingTrend, targetDifficultyBand } from '../src/readingAnalytics.ts';
import { previewHTML, readerHTML, coldTestHTML, rereadHTML, wholeTextHTML, resultHTML, studyWordsHTML } from '../src/readingView.ts';
import { savePassage, saveReadingSession, saveReadingProgress, listPassages, listSessions, openSessions, latestOpenSession, queryLibrary } from '../src/readingStore.ts';
import { planReadingTasks, pickPassage, readingUnavailableReason, READING_PLAN } from '../src/readingPlanner.ts';
import { createDailyPlan, planMinutes } from '../src/planner.ts';
import { exposureFromMark, selectStudyCandidates, readingWordSeed } from '../src/readingVocabulary.ts';
import { evidenceKey } from '../src/readingEvidence.ts';
import { makeWord } from '../src/core.ts';
import type { Passage, ReadingSession, Word } from '../src/types.ts';
const NOW = new Date(2026, 9, 19, 10, 0, 0).getTime();
const MIN = 60000;
const ARTICLE = `Learning to read in a second language is not a matter of memorising every single word you meet.
A reader who understands the main structure of a sentence can often guess the meaning of an unfamiliar word from the surrounding context.
That is why this programme separates mere exposure from real mastery, and why it asks you to mark what you are genuinely unsure about rather than what you merely suspect.

Reading material should come from a traceable source, because the difficulty of a text depends on where it was published and for whom it was written.
A short news article and a technical essay of the same length behave very differently, and the difference is not only about vocabulary.
Editors choose short sentences for hurried readers, while academic writers pack several subordinate clauses into a single statement and expect the reader to hold all of them in mind at once.

When you meet a sentence that keeps collapsing into confusion, the useful response is not to translate it word by word, but to find its backbone: who does what, to whom, and under what condition.
Everything else in the sentence hangs off that backbone as decoration, qualification or commentary.
Once the backbone is clear, the rest usually becomes guessable from context, and the paragraph stops feeling like a wall of unfamiliar noise.

Finally, remember that reading is contact rather than proof of knowledge.
Meeting a word in a sentence, even with a dictionary open beside you, tells us only that the word has been encountered, not that it has been learned.
Real evidence of mastery comes later, from retrieving the word without support and using it in your own writing, which is exactly what the later phases of this programme are designed to measure.

`;
function passageOf(raw = ARTICLE, title = '测试文章'): Passage {
    const ok = buildPastedDraft({ raw, title, allowShort: true });
    if (!ok.ok)
        assert.fail('fixture failed: ' + ok.error.message);
    return toPassage(ok.value, NOW);
}
function freshSession(passage = passageOf()): ReadingSession {
    return createReadingSession({ passage, now: NOW, sessionId: 'session-1' });
}
async function freshDB() {
    await openDB();
    await replaceData(emptyData());
}
test('阅读会话状态机：预览→冷读→首读→辅助→重读→全文→收尾，顺序不可跳', () => {
    assert.deepEqual(READING_STAGES, ['preview', 'cold-test', 'reading', 'comprehension', 'support', 'reread', 'whole-text', 'closing', 'completed']);
    const passage = passageOf();
    let s = freshSession(passage);
    assert.equal(s.detail!.stage, 'preview');
    assert.equal(s.detail!.state, 'created');
    assert.equal(s.detail!.coldTestDone, false, '还没冷读就不许进入首读');
    assert.ok(s.detail!.chunks.length >= 1);
    assert.equal(isResumable(s), true);
    s = startColdTest(s);
    assert.equal(s.detail!.stage, 'cold-test');
    s = submitColdTest(s, { selfReport: 35, translationDependence: 'D', mainIdea: '讲阅读方法', now: NOW + MIN });
    assert.equal(s.detail!.stage, 'reading', '冷读提交后才能进入首读');
    assert.equal(s.detail!.coldTestDone, true);
    assert.equal(s.firstPassComprehension, 35);
    assert.equal(s.translationDependence, 3, 'D → 3');
    assert.ok(s.detail!.comprehension.some(c => c.stage === 'cold-test' && c.kind === 'main-idea'));
    assert.ok(s.detail!.evidence.some(e => e.type === 'cold-baseline' && e.confidence === 'low'), '冷读只有自评，证据置信度必须是 low');
    assert.equal(s.detail!.evidence.some(e => e.source === 'self_reported' && e.confidence === 'high'), false, '自评证据置信度绝不允许 high');
    assert.ok(s.detail!.evidence.some(e => e.type === 'translation-dependence' && e.confidence === 'medium'));
    s = startReading(s, NOW + 2 * MIN);
    assert.equal(s.detail!.firstPassStartedAt, NOW + 2 * MIN);
    s = submitMainIdea(s, { text: '这一段说先看结构', language: 'zh', assisted: false, now: NOW + 3 * MIN });
    const idea = s.detail!.comprehension.filter(c => c.kind === 'main-idea').slice(-1)[0];
    assert.equal(idea.assisted, false);
    assert.equal(idea.score, null, '没有可验证答案时不得假装判对');
    assert.equal(idea.scoredBy, 'none');
    s = submitMainIdea(s, { text: '第二段说来源重要', language: 'zh', assisted: true, now: NOW + 4 * MIN });
    assert.equal(s.detail!.comprehension.filter(c => c.kind === 'main-idea').slice(-1)[0].assisted, true);
    s = finishFirstPass(s, NOW + 8 * MIN);
    assert.equal(s.detail!.stage, 'support');
    assert.equal(s.detail!.firstPassEndedAt, NOW + 8 * MIN);
    s = startReread(s, NOW + 9 * MIN);
    assert.equal(s.detail!.stage, 'reread');
    assert.equal(s.detail!.chunkIndex, 0, '重读必须从第一段重新开始');
    s = finishReread(s, { selfReport: 70, translationDependence: 'B', now: NOW + 13 * MIN });
    assert.equal(s.detail!.stage, 'whole-text');
    assert.equal(s.secondPassComprehension, 70);
    s = submitWholeTextItem(s, { kind: 'main-idea', prompt: '全文主旨？', answer: '阅读要分清接触与掌握', language: 'zh', verifiedScore: null, now: NOW + 14 * MIN });
    s = submitWholeTextItem(s, { kind: 'detail', prompt: '作者认为材料来源重要吗？', answer: '重要', language: 'zh', verifiedScore: 1, now: NOW + 15 * MIN });
    const whole = s.detail!.comprehension.filter(c => c.stage === 'whole-text');
    assert.equal(whole.length, 2);
    assert.equal(whole[0].scoredBy, 'none', '没有标准答案的题不得打客观分');
    assert.equal(whole[1].scoredBy, 'verified-key');
    assert.ok(s.detail!.evidence.some(e => e.type === 'detail' && e.source === 'verified_item' && e.confidence === 'high'));
    s = submitOutput(s, { kind: 'one-sentence', text: '这篇讲阅读方法。', language: 'zh', now: NOW + 16 * MIN });
    assert.equal(s.detail!.output.length, 1);
    assert.equal(submitOutput(s, { kind: 'one-sentence', text: '   ', language: 'zh', now: NOW + 16 * MIN }).detail!.output.length, 1, '空输出不得入库');
    s = completeReadingSession(s, { now: NOW + 17 * MIN });
    assert.equal(s.detail!.stage, 'completed');
    assert.equal(s.detail!.state, 'completed');
    assert.equal(s.stage, READING_STAGES.indexOf('completed'));
    assert.equal(isResumable(s), false, '完成的会话不可再继续');
    assert.equal(pauseSession(s).detail!.state, 'completed', '完成后不得被暂停改写状态');
    assert.equal(resumeSession(s).detail!.state, 'completed');
});
test('阅读分块：不切断句子、覆盖全部段落，进度标签可读', () => {
    const passage = passageOf();
    const s = freshSession(passage);
    const chunks = s.detail!.chunks;
    assert.ok(chunks.length >= 2, '两段文章应至少切成 2 块：' + chunks.length);
    const limit = READING_LIMITS.chunkWords.normal;
    const tol = READING_LIMITS.chunkTolerance;
    chunks.forEach(c => {
        if (c.wordCount <= limit + tol)
            return;
        assert.ok(c.paragraphIndexes.length > 1, '超容差的块只允许来自短段合并，绝不能切句子：' + c.wordCount);
        const own = c.paragraphIndexes.map(i => passage.paragraphs![i].wordCount);
        const withoutLast = c.wordCount - own[own.length - 1];
        assert.ok(withoutLast < limit, `合并前必须仍低于目标值（${withoutLast} < ${limit}），否则应单独成块`);
    });
    const covered = new Set(chunks.flatMap(c => c.sentenceIndexes));
    assert.equal(covered.size, passage.sentences!.length, '所有句子都必须属于某个块');
    chunks.forEach(c => {
        assert.equal(c.text, passage.text.slice(c.start, c.end), '块文本必须等于原文切片');
        const own = sentencesOfChunk(passage, c);
        assert.equal(own.length, c.sentenceIndexes.length, '块的句子必须真实存在于原文');
        own.forEach(x => assert.ok(c.text.includes(x.text.trim().slice(0, 20)), '块不得切断句子'));
    });
    const moved = nextChunk(goToChunk(s, 0));
    assert.equal(moved.detail!.chunkIndex, 1);
    assert.equal(goToChunk(s, 999).detail!.chunkIndex, chunks.length - 1, '超出范围必须夹紧');
    assert.equal(goToChunk(s, -5).detail!.chunkIndex, 0);
    assert.equal(atLastChunk(goToChunk(s, chunks.length - 1)), true);
    assert.equal(atLastChunk(s), false);
    assert.ok(sessionProgress(goToChunk(s, chunks.length - 1)).percent >= 0);
    assert.equal(sessionProgress(s).label, '预览', '进度标签必须报告真实阶段');
});
test('首读前不显示全文与译文，解释默认隐藏、需主动请求', () => {
    const passage = passageOf();
    const s = freshSession(passage);
    const preview = previewHTML({ passage, difficulty: null, unfinished: null });
    assert.ok(preview.includes(passage.title), '预览必须有标题');
    assert.ok(preview.includes('测试文章') || preview.includes(passage.topic), '预览必须有来源/主题');
    assert.equal(preview.includes('memorising'), false, '预览不得泄露正文');
    assert.equal(preview.includes('阅读方法'), false, '预览阶段不得给出正文内容');
    assert.match(preview, /先猜一下/, '预览必须要求先做无辅助猜测');
    assert.match(coldTestHTML(), /自评/, '冷读必须先要自评');
    const first = passage.sentences![0];
    const tokens = tokenizeSentence(passage.text, first);
    const hidden = readerHTML({ passage, session: s, tokens, helpText: '主干是 Learning is not a matter', showHelp: false });
    assert.equal(hidden.includes('主干是 Learning'), false, '辅助解释默认必须隐藏');
    const shown = readerHTML({ passage, session: s, tokens, helpText: '主干是 Learning is not a matter', showHelp: true });
    assert.equal(shown.includes('主干是 Learning'), true, '用户主动请求后才显示解释');
    assert.ok(shown.includes('data-tok='), '阅读区必须可点词标记');
    assert.ok(rereadHTML({ session: s, chunkIndex: 0 }).length > 0);
    assert.ok(wholeTextHTML().length > 0);
});
test('词汇标记：替换式幂等、撤销留痕、证据随标记增减', () => {
    const passage = passageOf();
    let s = startReading(startColdTest(freshSession(passage)), NOW);
    const sentence = passage.sentences![0];
    const tokens = tokenizeSentence(passage.text, sentence);
    const target = tokens.find(t => t.normalized === 'memorising');
    assert.ok(target, '测试文本应包含 memorising');
    const first = markWord(s, { paragraphIndex: sentence.paragraphIndex, sentenceIndex: sentence.index, tokenIndex: target!.index, surface: target!.surface, contextSentence: sentence.text, judgment: 'unknown', now: NOW + MIN });
    assert.equal(first.replaced, false);
    s = first.session;
    assert.equal(s.detail!.marks.length, 1);
    assert.equal(s.detail!.evidence.filter(e => e.type === 'vocabulary-obstacle').length, 1);
    const again = markWord(s, { paragraphIndex: sentence.paragraphIndex, sentenceIndex: sentence.index, tokenIndex: target!.index, surface: target!.surface, contextSentence: sentence.text, judgment: 'vague', now: NOW + 2 * MIN });
    assert.equal(again.replaced, true, '同一个词再次点击必须替换而不是新增');
    assert.equal(again.session.detail!.marks.length, 1);
    s = again.session;
    assert.equal(s.detail!.marks[0].judgment, 'vague');
    const known = markWord(s, { paragraphIndex: sentence.paragraphIndex, sentenceIndex: sentence.index, tokenIndex: tokens[0].index, surface: tokens[0].surface, contextSentence: sentence.text, judgment: 'known', now: NOW + 3 * MIN });
    assert.equal(known.session.detail!.evidence.filter(e => e.type === 'vocabulary-obstacle').length, 1, '“认识”不该产生障碍证据');
    s = revokeMark(known.session, known.mark.id, NOW + 4 * MIN);
    assert.equal(s.detail!.marks.filter(m => !m.revokedAt).length, 1, '撤销是软删除：痕迹保留');
    assert.equal(s.detail!.marks.find(m => m.id === known.mark.id)!.revokedAt, NOW + 4 * MIN);
    const revokedUnknown = revokeMark(s, first.mark.id, NOW + 5 * MIN);
    assert.equal(revokedUnknown.detail!.evidence.filter(e => e.type === 'vocabulary-obstacle').length, 0, '撤销生词标记必须同时撤掉障碍证据');
    assert.equal(revokeMark(revokedUnknown, 'not-exist', NOW).detail!.marks.length, 2, '撤销不存在的标记不得改动会话');
    assert.equal(selectStudyCandidates(revokedUnknown.detail!.marks.filter(m => !m.revokedAt), []).length, 0, '撤销的标记不得进入学习候选');
});
test('辅助等级：L0–L2 仍算独立，L3+ 视为看过答案', () => {
    const passage = passageOf();
    let s = startReading(startColdTest(freshSession(passage)), NOW);
    assert.equal(maxHelpLevelUsed(s), 0);
    s = requestHelp(s, { type: 'main-idea-hint', level: 1, now: NOW + MIN });
    assert.equal(maxHelpLevelUsed(s), 1);
    assert.equal(isAssisted(1), false);
    s = requestHelp(s, { type: 'vocabulary', level: 2, concept: 'memorise', now: NOW + 2 * MIN });
    assert.equal(isAssisted(2), false);
    assert.equal(s.detail!.helps.length, 2);
    assert.equal(s.detail!.helps[1].concept, 'memorise');
    s = requestHelp(s, { type: 'sentence-structure', level: 3, now: NOW + 3 * MIN });
    assert.equal(maxHelpLevelUsed(s), 3);
    assert.equal(isAssisted(3), true, 'L3 起视为看过答案，不得再算独立理解');
    assert.equal(READING_LIMITS.maxHelpLevelIndependence, 2);
    const withIdea = submitMainIdea(s, { text: '带辅助的段落大意', language: 'zh', assisted: isAssisted(maxHelpLevelUsed(s)), now: NOW + 4 * MIN });
    assert.equal(withIdea.detail!.comprehension.slice(-1)[0].assisted, true);
    assert.equal(withIdea.detail!.comprehension.slice(-1)[0].kind, 'main-idea');
});
test('难句捕获：结构来源只能是启发式/手工，绝不冒充人工审校', () => {
    const passage = passageOf();
    let s = startReading(startColdTest(freshSession(passage)), NOW);
    const sentence = passage.sentences![1];
    const cap = captureDifficultSentence(s, {
        sentence: { index: sentence.index, paragraphIndex: sentence.paragraphIndex, text: sentence.text, start: sentence.start, end: sentence.end },
        problemTypes: ['subordinate-clause', 'reference'],
        contextBefore: passage.text.slice(Math.max(0, sentence.start - 60), sentence.start),
        contextAfter: '',
        now: NOW + MIN,
    });
    s = cap.session;
    assert.equal(cap.item.structureProvenance, 'heuristic', '真实文章没有人工审校结构，不得写成 gold');
    assert.equal(cap.item.text, sentence.text);
    assert.deepEqual(cap.item.problemTypes, ['subordinate-clause', 'reference']);
    assert.ok(s.detail!.evidence.some(e => e.type === 'grammar-obstacle' && String(e.metadata.provenance) === 'heuristic'));
    const again = captureDifficultSentence(s, {
        sentence: { index: sentence.index, paragraphIndex: sentence.paragraphIndex, text: sentence.text, start: sentence.start, end: sentence.end },
        problemTypes: ['main-structure'], contextBefore: '', contextAfter: '', now: NOW + 2 * MIN,
    });
    assert.equal(again.session.detail!.difficultSentences.length, 1, '同一句不得重复入队');
    assert.deepEqual(again.item.problemTypes.sort(), ['main-structure', 'reference', 'subordinate-clause']);
    s = linkDifficultSentenceAttempt(again.session, again.item.id, 'attempt-9');
    assert.equal(s.detail!.difficultSentences[0].labAttemptId, 'attempt-9');
    const ids = s.detail!.difficultSentences.map(() => 1);
    assert.equal(ids.length, 1);
});
test('首读与重读的速度/理解度分开统计，绝不混算', () => {
    const passage = passageOf();
    let s = startReading(startColdTest(freshSession(passage)), NOW);
    const early = computeReadingMetrics(s);
    assert.equal(early.firstPassWpm.available, false, '还没读完就不该有首读速度');
    assert.ok(early.caveats.some(c => /首读时长缺失/.test(c)));
    s = finishFirstPass(s, NOW + 5 * MIN);
    assert.equal(computeReadingMetrics(s).firstPassWpm.value, Math.round((passage.wordCount / 5) * 10) / 10, '有起止时间时必须按真实时长算');
    const noStart = finishFirstPass(freshSession(passage), NOW + 5 * MIN);
    const mid = computeReadingMetrics(noStart);
    assert.equal(mid.firstPassWpm.available, false, '缺少真实开始时间时不得编造速度');
    assert.equal(mid.firstPassWpm.value, null);
    assert.equal(mid.rereadWpm.available, false);
    let t = submitColdTest(startColdTest(freshSession(passage)), { selfReport: 35, translationDependence: 'D', now: NOW - MIN });
    t = startReading(t, NOW);
    t = finishFirstPass(t, NOW + 5 * MIN);
    t = startReread(t, NOW + 6 * MIN);
    t = finishReread(t, { selfReport: 80, translationDependence: 'B', now: NOW + 9 * MIN });
    const after = computeReadingMetrics(t);
    assert.equal(after.firstPassWpm.available, true);
    assert.equal(after.rereadWpm.available, true);
    assert.equal(after.firstPassWpm.value, Math.round((t.wordCount / 5) * 10) / 10, '首读速度只按首读时长算');
    assert.equal(after.rereadWpm.value, Math.round((t.wordCount / 3) * 10) / 10, '重读速度只按重读时长算');
    assert.notEqual(after.firstPassWpm.value, after.rereadWpm.value);
    assert.equal(after.selfReportedFirst.available, true);
    assert.equal(after.selfReportedFirst.value, 35);
    assert.equal(after.selfReportedSecond.value, 80);
    assert.equal(after.comprehensionDelta.value, 45);
    assert.equal(after.rereadImproved.value, true);
    assert.match(String(after.rereadImproved.note), /仅代表本篇/);
    const noCold = finishReread(startReread(finishFirstPass(startReading(freshSession(passage), NOW), NOW + 5 * MIN), NOW + 6 * MIN), { selfReport: 80, translationDependence: 'B', now: NOW + 9 * MIN });
    const noColdMetrics = computeReadingMetrics(noCold);
    assert.equal(noColdMetrics.selfReportedFirst.available, false, '没有冷读就没有首读自评，禁止用重读自评顶替');
    assert.equal(noColdMetrics.comprehensionDelta.available, false);
    assert.equal(noColdMetrics.rereadImproved.available, false);
    assert.equal(String(after.rereadWpm.note).includes('不能与首读混算'), true);
    const legacy = computeReadingMetrics({ ...t, detail: undefined });
    assert.equal(legacy.firstPassWpm.available, false);
    assert.ok(legacy.caveats.some(c => /旧会话/.test(c)));
    const trend = computeReadingTrend([t]);
    assert.equal(trend.completed, 0, '未收尾的会话不算完成样本');
    assert.match(trend.sampleNote, /样本不可靠|还不可靠|只有 0 篇/);
    const done = completeReadingSession(t, { now: NOW + 10 * MIN });
    const trend2 = computeReadingTrend([done]);
    assert.equal(trend2.completed, 1);
    assert.ok(trend2.avgFirstWpm! > 0);
    assert.match(trend2.sampleNote, /只有 1 篇/);
    assert.equal(targetDifficultyBand([]).band, 'growth');
    assert.equal(targetDifficultyBand([{ comprehension: 40 }]).band, 'comfort');
    assert.equal(targetDifficultyBand([{ comprehension: 90 }]).band, 'growth');
});
test('证据幂等：重复提交冷读/重读不产生重复证据', () => {
    const passage = passageOf();
    let s = startColdTest(freshSession(passage));
    s = submitColdTest(s, { selfReport: 30, translationDependence: 'C', now: NOW + MIN });
    const before = s.detail!.evidence.length;
    const twice = submitColdTest(s, { selfReport: 90, translationDependence: 'A', now: NOW + 2 * MIN });
    assert.equal(twice.detail!.evidence.length, before, '同一幂等键的冷读证据不得重复写入');
    assert.equal(twice.detail!.evidence.filter(e => e.type === 'cold-baseline').length, 1);
    assert.equal(twice.detail!.evidence.find(e => e.type === 'cold-baseline')!.key, evidenceKey('session-1', 'cold-baseline', 'first'));
    assert.equal(twice.detail!.evidence.filter(e => e.type === 'translation-dependence').length, 1);
    let t = finishReread(startReread(finishFirstPass(startReading(twice, NOW + 3 * MIN), NOW + 5 * MIN), NOW + 6 * MIN), { selfReport: 60, translationDependence: 'B', now: NOW + 8 * MIN });
    const rereads = t.detail!.evidence.filter(e => e.type === 'reread-result');
    assert.equal(rereads.length, 1);
    assert.equal(rereads[0].metadata.firstPass, twice.firstPassComprehension, '重读结果必须带上当时的首读自评做对照');
    assert.equal(twice.firstPassComprehension, 90, '重新提交会覆盖平表镜像（UI 只允许提交一次冷读），但基线证据仍是第一次');
    t = finishReread(t, { selfReport: 75, translationDependence: 'A', now: NOW + 9 * MIN });
    assert.equal(t.detail!.evidence.filter(e => e.type === 'reread-result').length, 1, '重读证据同样幂等');
    assert.equal(t.detail!.evidence.filter(e => e.type === 'translation-dependence').length, 2, '首读/重读的翻译依赖是两条独立证据');
});
test('收尾镜像只统计真实发生的数据', () => {
    const passage = passageOf();
    let s = startColdTest(freshSession(passage));
    s = startReading(submitColdTest(s, { selfReport: 40, translationDependence: 'C', now: NOW + MIN }), NOW + 2 * MIN);
    const sentence = passage.sentences![0];
    const tokens = tokenizeSentence(passage.text, sentence);
    const unknownToken = tokens[1];
    s = markWord(s, { paragraphIndex: sentence.paragraphIndex, sentenceIndex: sentence.index, tokenIndex: unknownToken.index, surface: unknownToken.surface, contextSentence: sentence.text, judgment: 'unknown', now: NOW + 3 * MIN }).session;
    const vagueToken = tokens[3];
    s = markWord(s, { paragraphIndex: sentence.paragraphIndex, sentenceIndex: sentence.index, tokenIndex: vagueToken.index, surface: vagueToken.surface, contextSentence: sentence.text, judgment: 'vague', now: NOW + 4 * MIN }).session;
    s = captureDifficultSentence(s, { sentence: { index: sentence.index, paragraphIndex: sentence.paragraphIndex, text: sentence.text, start: sentence.start, end: sentence.end }, problemTypes: ['main-structure'], contextBefore: '', contextAfter: '', now: NOW + 5 * MIN }).session;
    s = finishFirstPass(s, NOW + 10 * MIN);
    s = finishReread(startReread(s, NOW + 11 * MIN), { selfReport: 55, translationDependence: 'C', now: NOW + 14 * MIN });
    s = completeReadingSession(s, { now: NOW + 15 * MIN });
    assert.deepEqual(s.unknownWords, [unknownToken.normalized]);
    assert.deepEqual(s.vagueWords, [vagueToken.normalized]);
    assert.equal(s.unknownRate, Math.round((1 / s.wordCount) * 1000) / 10, '生词率 = 明确的生词 / 全文词数');
    assert.equal(s.structureErrors, 1);
    assert.equal(s.durationMs, (10 - 2 + 14 - 11) * MIN, '总时长 = 首读 + 重读（不含辅助阶段）');
    assert.ok(s.readingSpeed > 0);
    assert.equal(completeReadingSession(s, { now: NOW + 16 * MIN, summary: '自定义总结' }).summary, '自定义总结');
    assert.equal(completeReadingSession(s, { now: NOW + 16 * MIN }).summary, '', '没有输出也没有总结时不得编造总结');
});
test('阅读持久化：文章/会话/接触/词汇单事务落库，可查询可续读', async () => {
    await freshDB();
    const passage = passageOf();
    let s = startReading(startColdTest(freshSession(passage)), NOW);
    const sentence = passage.sentences![0];
    const tokens = tokenizeSentence(passage.text, sentence);
    const content = tokens.find(t => t.normalized === 'memorising')!;
    s = markWord(s, { paragraphIndex: sentence.paragraphIndex, sentenceIndex: sentence.index, tokenIndex: content.index, surface: content.surface, contextSentence: sentence.text, judgment: 'unknown', now: NOW + MIN }).session;
    const word = readingWordSeed('memorising', 'book-1', 3, NOW);
    const candidates = selectStudyCandidates(s.detail!.marks, [word]);
    assert.equal(candidates.length, 1);
    await savePassage(passage);
    await saveReadingProgress({ session: s, words: [word], exposures: [exposureFromMark(s.detail!.marks[0], word.id, NOW + MIN)], passages: [passage] });
    const passages = await listPassages();
    const sessions = await listSessions();
    assert.equal(passages.length, 1);
    assert.equal(passages[0].id, passage.id);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0].detail!.marks.length, 1, '标记必须随会话一起落库');
    assert.equal(openSessions(sessions).length, 1);
    assert.equal(latestOpenSession(sessions)?.id, s.id);
    assert.equal(passageForSplit(passages, sessions[0])?.id, passage.id);
    assert.equal(passageForSplit(passages, null), null);
    const lib = queryLibrary(passages, sessions, { readState: 'unfinished' });
    assert.equal(lib.length, 1);
    assert.equal(lib[0].unfinished?.id, s.id);
    assert.equal(queryLibrary(passages, sessions, { readState: 'read' }).length, 0);
    assert.equal(queryLibrary(passages, sessions, { readState: 'all', text: '测试' }).length, 1);
    assert.equal(queryLibrary(passages, sessions, { readState: 'all', text: '不存在的词' }).length, 0);
    const done = completeReadingSession(s, { now: NOW + 20 * MIN });
    await saveReadingSession(done);
    const after = await listSessions();
    assert.equal(after.length, 1, '同一会话必须是覆盖更新，不是追加新记录');
    assert.equal(after[0].detail!.state, 'completed');
    assert.equal(openSessions(after).length, 0);
    assert.equal(latestOpenSession(after), null);
    assert.equal(queryLibrary(passages, after, { readState: 'read' }).length, 1);
});
test('阅读计划：没有材料就不排任务，未完成会话优先续读，低分才重读', () => {
    const passage = passageOf();
    const open = startReading(startColdTest(freshSession(passage)), NOW);
    const none = planReadingTasks({ passages: [], sessions: [], now: NOW, availableMinutes: 30, energy: 'normal' });
    assert.deepEqual(none, [], '没有文章时绝不能生成阅读任务');
    assert.match(readingUnavailableReason([]), /先导入一篇文章/);
    assert.equal(readingUnavailableReason([passage]), '');
    assert.equal(planReadingTasks({ passages: [passage], sessions: [], now: NOW, availableMinutes: 5, energy: 'normal' }).length, 0, '预算不足时服从 Time Budget First');
    const fresh = planReadingTasks({ passages: [passage], sessions: [], now: NOW, availableMinutes: 40, energy: 'normal' });
    assert.equal(fresh.length, 1);
    assert.equal(fresh[0].kind, 'reading-new');
    assert.ok(fresh[0].label.includes(passage.title));
    assert.ok(fresh[0].minutes >= READING_PLAN.minMinutes && fresh[0].minutes <= READING_PLAN.maxMinutes);
    assert.deepEqual(fresh[0].passageIds, [passage.id]);
    assert.equal(fresh[0].sessionId, null);
    assert.ok(fresh[0].reasons.some(r => /new-material/.test(r)));
    const cont = planReadingTasks({ passages: [passage], sessions: [open], now: NOW, availableMinutes: 40, energy: 'normal' });
    assert.equal(cont[0].kind, 'reading-continue', '有未完成会话必须优先续读');
    assert.equal(cont[0].sessionId, open.id);
    assert.ok(cont[0].reasons.some(r => /progress-\d+%/.test(r)));
    const lowScore = completeReadingSession(finishReread(startReread(finishFirstPass(open, NOW + 5 * MIN), NOW + 6 * MIN), { selfReport: 50, translationDependence: 'D', now: NOW + 9 * MIN }), { now: NOW + 10 * MIN });
    const reread = planReadingTasks({ passages: [passage], sessions: [lowScore], now: NOW, availableMinutes: 40, energy: 'normal' });
    assert.equal(reread[0].kind, 'reading-reread', '上次自评过低时排一次重读');
    assert.ok(reread[0].reasons.some(r => /self-reported-50%/.test(r)));
    const goodScore = { ...lowScore, secondPassComprehension: 88 };
    const next = planReadingTasks({ passages: [passage], sessions: [goodScore], now: NOW, availableMinutes: 40, energy: 'normal' });
    assert.equal(next[0].kind, 'reading-new', '理解度够高时换新文章');
    assert.equal(pickPassage([], []), null);
    assert.equal(pickPassage([passage], [])?.id, passage.id);
    assert.equal(pickPassage([passage], [open])?.id, passage.id, '读完了没有新文章时允许再读旧的，但不会造假文章');
});
test('阅读任务进入今日计划：真实任务、时长受预算约束、无材料时不出现', async () => {
    const passage = passageOf();
    const words: Word[] = Array.from({ length: 30 }, (_, i) => {
        const w = makeWord({ en: `base${i}`, zh: `释义${i}` }, 'book-1', i);
        return { ...w, state: { ...w.state, total: 3, correct: 2, level: 'normal' as const } };
    });
    const empty = createDailyPlan({ now: NOW, availableMinutes: 30, energy: 'normal', words, records: [] }).plan;
    assert.equal(empty.initialPlan.some(t => t.module === 'reading'), false, '没有阅读材料时计划里不得出现阅读任务');
    assert.equal(empty.capabilities!.reading.available, true, '能力已实现，但缺材料时不产生任务');
    assert.equal(empty.capabilities!.reading.requires, null);
    const withMaterial = createDailyPlan({ now: NOW, availableMinutes: 30, energy: 'normal', words, records: [], readingInput: { passages: [passage], sessions: [] } }).plan;
    const reading = withMaterial.initialPlan.filter(t => t.module === 'reading');
    assert.equal(reading.length, 1, '有真实文章时必须排一次真实阅读：' + withMaterial.initialPlan.map(t => t.kind).join(','));
    assert.equal(reading[0].kind, 'reading-new');
    assert.deepEqual(reading[0].refs, [passage.id]);
    assert.ok(reading[0].minutes > 0);
    assert.ok(planMinutes(withMaterial) <= 30 + 1e-6, '总时长不得超预算：' + planMinutes(withMaterial));
    const shifted = createDailyPlan({ now: NOW, availableMinutes: 8, energy: 'low', words, records: [], readingInput: { passages: [passage], sessions: [] } }).plan;
    assert.ok(planMinutes(shifted) <= 8 + 1e-6, '低预算下也必须服从预算');
    const stored = createDailyPlan({ now: NOW, availableMinutes: 30, energy: 'normal', words, records: [], readingInput: { passages: [passage], sessions: [open1(passage)] } }).plan;
    const cont = stored.initialPlan.find(t => t.kind === 'reading-continue');
    assert.ok(cont, '有未完成阅读会话时应排续读：' + stored.initialPlan.map(t => t.kind).join(','));
    assert.ok(planMinutes(stored) <= 30 + 1e-6);
});
function passageForSplit(passages: Passage[], session: ReadingSession | null): Passage | null {
    return passages.find(p => p.id === session?.passageId) ?? null;
}
function open1(passage: Passage): ReadingSession {
    return startReading(startColdTest(createReadingSession({ passage, now: NOW - 3600000, sessionId: 'session-open' })), NOW - 3500000);
}
test('阅读结果页与生词整理页：只呈现真实数据，并把“待补释义”标明', () => {
    const passage = passageOf();
    let s = startReading(startColdTest(freshSession(passage)), NOW);
    const sentence = passage.sentences![0];
    const tokens = tokenizeSentence(passage.text, sentence);
    const content = tokens.find(t => t.normalized === 'memorising')!;
    s = markWord(s, { paragraphIndex: sentence.paragraphIndex, sentenceIndex: sentence.index, tokenIndex: content.index, surface: content.surface, contextSentence: sentence.text, judgment: 'unknown', now: NOW + MIN }).session;
    s = finishFirstPass(s, NOW + 4 * MIN);
    s = finishReread(startReread(s, NOW + 5 * MIN), { selfReport: 60, translationDependence: 'C', now: NOW + 8 * MIN });
    s = completeReadingSession(s, { now: NOW + 9 * MIN });
    const metrics = computeReadingMetrics(s);
    const html = resultHTML({ session: s, metrics, passage });
    assert.ok(html.includes('首读速度') && html.includes('重读速度'), '首读/重读必须并列展示且标明口径');
    assert.ok(html.includes('自评，不是客观测量'), '自评必须标注为自评');
    assert.ok(html.includes('整理本次生词'));
    const candidates = selectStudyCandidates(s.detail!.marks, []);
    const study = studyWordsHTML(candidates);
    assert.ok(study.includes('核心'), '候选桶必须有明确标签');
    assert.ok(study.includes('补释义') || study.includes('待补'), '没有释义的新词必须提示补释义');
});
