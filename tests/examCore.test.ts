import assert from 'node:assert/strict';
import test from 'node:test';
import fc from 'fast-check';
import { emptyData } from '../src/db.ts';
import { builtinExamItems, builtinMaterials } from '../src/examSeed.ts';
import { builtinSpecifications, validateSpecification, specDisplayLine } from '../src/examSpecification.ts';
import { validateBank, validateItem, objectiveScorable, isChoiceItem } from '../src/examItems.ts';
import { createExamSession, startSession, pauseSession, saveAnswer, submitSession, reviewSession, completeSession, abandonSession, gradeSession, sessionProgress } from '../src/examSession.ts';
import { attributeError, collectErrors, correctError, errorSummary } from '../src/examErrors.ts';
import { buildWeeklyAssessment, weeklySession, weeklyReportFrom, freshExamItems, buildTransferRetest } from '../src/weeklyAssessment.ts';
import { planExamTask } from '../src/examPlanner.ts';
import { examMetrics, examErrorCategoryCounts } from '../src/examDiagnostics.ts';
import type { AssessmentItem, ExamSession } from '../src/examTypes.ts';
const NOW = Date.UTC(2026, 9, 23, 4, 0, 0);
const items = builtinExamItems();
const mats = builtinMaterials();
const specs = builtinSpecifications();
function choice(id: string, key = 'A'): AssessmentItem {
    return {
        id, examCategory: 'shanghai-gaokao-foreign-language-first', examYear: 2026, purpose: 'exam', section: 'written',
        questionType: 'contextual_grammar', materialId: null, stem: 'Choose.', options: [{ id: 'A', text: 'a' }, { id: 'B', text: 'b' }],
        answerKey: key, answerEvidence: 'evidence', explanation: 'because', pointValue: 2, estimatedTimeMinutes: 2, difficulty: 'easy', difficultyBasis: 'authored',
        targetSkills: ['grammar.tense'], targetWords: [], targetGrammar: [], source: 'builtin', license: 'project-authored',
        provenance: 'authored', verifiedStatus: 'verified', audioUrl: null, createdAt: NOW,
    };
}
test('规格：2026 官方分值自洽，2028 不冒充确定规则', () => {
    for (const s of specs)
        assert.equal(validateSpecification(s).ok, true, validateSpecification(s).errors.join(';'));
    const s26 = specs.find(s => s.id === 'spec-2026-spring-foreign-language')!;
    assert.equal(s26.writtenScore! + s26.listeningSpeakingScore!, 150);
    assert.equal(s26.status, 'official_confirmed');
    const s28 = specs.find(s => s.id === 'spec-2028-gaokao-foreign-language')!;
    assert.equal(s28.status, 'provisional');
    assert.equal(s28.totalScore, null);
    assert.equal(s28.writtenScore, null);
    assert.ok(s28.notes.some(n => n.includes('115+35')));
    assert.match(specDisplayLine(s28), /总分待确认/);
    const academic = specs.find(s => s.examCategory === 'shanghai-academic-foreign-language')!;
    assert.equal(academic.totalScore, 100);
    assert.notEqual(academic.id, s26.id);
});
test('规格校验拒绝分值不一致与无来源的官方确认', () => {
    const base = { ...specs[0] };
    assert.equal(validateSpecification({ ...base, writtenScore: 100 }).ok, false);
    assert.equal(validateSpecification({ ...base, sourceRefs: [] }).ok, false);
    assert.equal(validateSpecification({ ...base, applicableYear: 2028, status: 'official_confirmed', publishedAt: '2026-01-01' }).ok, true); // 只要来源明确即可，年份本身不阻止
});
test('题目契约：有效题库通过，伪造答案/来源/重复 ID 被拒绝', () => {
    const v = validateBank(items, mats);
    assert.equal(v.ok, true, v.errors.join(';'));
    assert.equal(objectiveScorable(items.find(i => i.id === 'ex-reading-1')!), true);
    const bad = { ...choice('bad'), answerKey: 'Z' };
    assert.equal(validateItem(bad).ok, false);
    const ai = { ...choice('ai'), provenance: 'ai_generated' as const, verifiedStatus: 'verified' as const };
    assert.equal(validateItem(ai).ok, false);
    const dup = validateBank([choice('x'), choice('x')], []);
    assert.equal(dup.ok, false);
    assert.match(dup.errors.join(' '), /重复/);
    assert.equal(validateItem({ ...choice('m'), materialId: 'nope' }, new Set(['m1'])).ok, false);
});
test('听力无音频不可完成，不被计为新鲜题', () => {
    const listening = items.find(i => i.id === 'ex-listening-1')!;
    assert.equal(listening.audioUrl, null);
    assert.equal(freshExamItems([listening], []).length, 0);
});
test('会话：开始/暂停/保存/提交/幂等/完成', () => {
    let s = createExamSession({ id: 's1', mode: 'mixed_practice', spec: specs[0], items: [choice('q1'), choice('q2', 'B')], now: NOW });
    assert.equal(s.status, 'created');
    s = startSession(s, NOW).session!;
    assert.equal(s.status, 'active');
    s = saveAnswer(s, { itemId: 'q1', value: 'A', timeMs: 3000, now: NOW + 3000 }).session!;
    assert.equal(sessionProgress(s).answered, 1);
    s = pauseSession(s, NOW + 5000).session!;
    assert.equal(s.status, 'paused');
    s = startSession(s, NOW + 6000).session!;
    s = saveAnswer(s, { itemId: 'q2', value: 'B', timeMs: 2000, now: NOW + 8000 }).session!;
    const sub = submitSession(s, NOW + 9000);
    assert.equal(sub.outcome?.score, 4);
    assert.equal(sub.outcome?.status, 'verified_objective');
    const again = submitSession(sub.session!, NOW + 9500);
    assert.equal(again.noop, true);
    assert.equal(again.session!.revision, sub.session!.revision);
    const reviewed = reviewSession(sub.session!, [], '复盘', NOW + 10000).session!;
    const done = completeSession(reviewed, NOW + 11000).session!;
    assert.equal(done.status, 'completed');
    assert.equal(completeSession(done, NOW + 12000).noop, true);
    assert.equal(abandonSession(done, NOW + 13000).ok, false);
});
test('未答题不计算总分；含开放题只能是 partial', () => {
    let s = createExamSession({ id: 's2', mode: 'skill_practice', spec: null, items: [choice('q1'), choice('q2')], now: NOW });
    s = startSession(s, NOW).session!;
    s = saveAnswer(s, { itemId: 'q1', value: 'A', timeMs: 1000, now: NOW + 1000 }).session!;
    const partial = gradeSession(s);
    assert.equal(partial.score, null);
    assert.equal(partial.status, 'partial');
    assert.match(partial.reason, /未作答/);
    const open = items.find(i => i.id === 'ex-translation-1')!;
    let s3 = createExamSession({ id: 's3', mode: 'timed_practice', spec: null, items: [choice('q1'), open], now: NOW });
    s3 = startSession(s3, NOW).session!;
    s3 = saveAnswer(s3, { itemId: 'q1', value: 'A', timeMs: 1000, now: NOW + 1000 }).session!;
    s3 = saveAnswer(s3, { itemId: open.id, value: '译文', timeMs: 1000, now: NOW + 2000 }).session!;
    const r = gradeSession(s3);
    assert.equal(r.status, 'partial');
    assert.equal(r.openItems, 1);
    assert.equal(r.score, 2);
});
test('错因：干扰项证据优先，无证据标 uncertain，用户可修正', () => {
    const item = items.find(i => i.id === 'ex-reading-1')!;
    let s = createExamSession({ id: 'e1', mode: 'review', spec: specs[0], items: [item], now: NOW });
    s = startSession(s, NOW).session!;
    s = saveAnswer(s, { itemId: item.id, value: 'A', timeMs: 5000, now: NOW + 5000 }).session!;
    const err = attributeError(item, s.answers[item.id], s, { now: NOW + 6000 })!;
    assert.equal(err.category, 'logic');
    assert.equal(err.subcategory, 'overgeneralization');
    assert.equal(err.confidence, 'medium');
    assert.ok(err.evidenceRefs.some(r => r.startsWith('distractor:')));
    const corrected = correctError(err, 'evidence', 'incomplete_evidence', NOW + 7000);
    assert.equal(corrected.correctedByUser, true);
    assert.equal(corrected.category, 'evidence');
    const self = attributeError(item, s.answers[item.id], s, { now: NOW + 8000, userCategory: 'vocabulary' })!;
    assert.equal(self.userReported, true);
    assert.equal(self.category, 'vocabulary');
    assert.match(errorSummary([err, corrected]), /逻辑/);
});
test('答对不产生错因；开放题不自动判错', () => {
    const item = items.find(i => i.id === 'ex-reading-1')!;
    let s = createExamSession({ id: 'e2', mode: 'review', spec: null, items: [item], now: NOW });
    s = startSession(s, NOW).session!;
    s = saveAnswer(s, { itemId: item.id, value: item.answerKey!, timeMs: 1000, now: NOW + 1000 }).session!;
    assert.equal(attributeError(item, s.answers[item.id], s, { now: NOW + 2000 }), null);
    const open = items.find(i => i.id === 'ex-writing-1')!;
    assert.equal(attributeError(open, { itemId: open.id, value: 'text', at: NOW, timeMs: 1, helpUsed: false }, s, { now: NOW }), null);
});
test('迁移：只用未见新题；无新题明确拒绝', () => {
    const first = items.filter(i => i.questionType === 'reading_comprehension').slice(0, 1);
    let s = createExamSession({ id: 't1', mode: 'skill_practice', spec: specs[0], items: first, now: NOW });
    s = startSession(s, NOW).session!;
    s = saveAnswer(s, { itemId: first[0].id, value: 'A', timeMs: 1000, now: NOW + 1000 }).session!;
    s = submitSession(s, NOW + 2000).session!;
    const retest = buildTransferRetest({ items, sessions: [s], errorCategories: ['logic'], now: NOW + 3000, spec: specs[0], id: 'tr1' });
    assert.ok(retest.session);
    assert.equal(retest.session!.items.some(i => i.id === first[0].id), false);
    const none = buildTransferRetest({ items: [first[0]], sessions: [s], errorCategories: ['logic'], now: NOW + 4000, spec: specs[0], id: 'tr2' });
    assert.equal(none.session, null);
    assert.match(none.reason, /新题/);
});
test('周测：真实词+未读文章组成 5 部分，时长 15–25；缺材料不造假', () => {
    const d = emptyData();
    d.words = Array.from({ length: 5 }, (_, i) => ({
        id: `w${i}`, bookId: 'b', en: `word${i}`, zh: `释义${i}`, pos: '', phonetic: '', example: '', collocation: '', difficulty: '', tags: '', order: i,
        schedule: { due: 0, last: 0, interval: 0, step: 0, spacedPasses: 0 }, state: { total: 3, correct: 2, streak: 0, errors: 1, lapses: 0, meanMs: 1000, lastMs: 1000, level: 'normal', lastCorrect: true, directions: { 'en-zh': { total: 1, correct: 1, meanMs: 1000 }, 'zh-en': { total: 2, correct: 1, meanMs: 1000 } } },
        confusions: {}, fsrs: null,
    })) as never;
    d.passages = [{ id: 'p1', title: 'Real Article', text: 'A real article about cities and people. '.repeat(6), sourceType: 'import', sourceUrl: 'https://example.com/a', topic: 'city', wordCount: 50, difficulty: 'normal', createdAt: NOW }];
    const build = buildWeeklyAssessment(d, items, [], NOW);
    assert.ok(build.minutes >= 15 && build.minutes <= 25);
    assert.ok(build.items.some(i => i.questionType === 'delayed_vocabulary'));
    assert.ok(build.items.some(i => i.questionType === 'short_output' && i.provenance === 'user_supplied'));
    assert.ok(build.items.some(i => i.questionType === 'reflection'));
    const w = weeklySession({ d, items, sessions: [], now: NOW, spec: specs[0], id: 'wk1' });
    assert.ok(w.session);
    assert.equal(w.session!.mode, 'weekly_assessment');
    const report = weeklyReportFrom(w.session!, w.build);
    assert.equal(report.objectiveTotal >= 3, true);
    assert.match(report.evidenceNote, /不是能力证明/);
    const empty = buildWeeklyAssessment(emptyData(), items, [], NOW);
    assert.ok(empty.unavailable.length >= 2);
    assert.ok(empty.items.length < build.items.length);
});
test('周测不重复已读文章', () => {
    const d = emptyData();
    d.passages = [{ id: 'p1', title: 'Read', text: 'x'.repeat(200), sourceType: 'import', sourceUrl: '', topic: '', wordCount: 1, difficulty: '', createdAt: NOW }];
    d.readingSessions = [{ id: 'rs', passageId: 'p1' }] as never;
    const build = buildWeeklyAssessment(d, items, [], NOW);
    assert.equal(build.items.some(i => i.stem.includes('Read')), false);
    assert.ok(build.unavailable.some(u => u.section === '真实阅读'));
});
test('考试计划默认关闭；有题且开启才出现，且不重复已用题', () => {
    assert.equal(planExamTask({ enabled: false, items, sessions: [], availableMinutes: 60, now: NOW }), null);
    const p = planExamTask({ enabled: true, items, sessions: [], availableMinutes: 60, now: NOW })!;
    assert.ok(p);
    assert.ok(p.minutes >= 5 && p.minutes <= 10);
    const used = createExamSession({ id: 'u1', mode: 'skill_practice', spec: null, items: [items[0]], now: NOW });
    const usedItems = [used];
    const fresh = planExamTask({ enabled: true, items: [items[0]], sessions: usedItems, availableMinutes: 60, now: NOW });
    assert.equal(fresh, null);
});
test('诊断：考试指标有分母，官方分预测明确不可用，不造总分', () => {
    let s = createExamSession({ id: 'm1', mode: 'timed_practice', spec: specs[0], items: [choice('q1'), choice('q2')], now: NOW });
    s = startSession(s, NOW).session!;
    s = saveAnswer(s, { itemId: 'q1', value: 'A', timeMs: 1000, now: NOW + 1000 }).session!;
    s = saveAnswer(s, { itemId: 'q2', value: 'B', timeMs: 1000, now: NOW + 2000 }).session!;
    s = submitSession(s, NOW + 3000).session!;
    const errs = collectErrors(s, { now: NOW + 3000 });
    s = reviewSession(s, errs, '复盘', NOW + 3000).session!;
    s = completeSession(s, NOW + 3000).session!;
    s = { ...s, status: 'completed' };
    const d = emptyData();
    d.examSessions = [s];
    const range = { from: NOW - 86400000, to: NOW + 86400000, days: 1 };
    const ms = examMetrics(d, range);
    const acc = ms.find(m => m.id === 'exam.objectiveAccuracy')!;
    assert.equal(acc.numerator, 1);
    assert.equal(acc.denominator, 2);
    assert.equal(acc.domain, 'exam');
    const official = ms.find(m => m.id === 'exam.officialScoreEstimate')!;
    assert.equal(official.value, null);
    assert.equal(official.evaluability, 'not-applicable');
    assert.equal(examErrorCategoryCounts(d, range).length, 1);
});
test('性质：任何提交分数不超过满分，已回答数不超过题数', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 8 }), fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }), (n, picks) => {
        const its = Array.from({ length: n }, (_, i) => choice(`p${i}`));
        let s: ExamSession = createExamSession({ id: `prop-${n}`, mode: 'mixed_practice', spec: null, items: its, now: NOW });
        s = startSession(s, NOW).session!;
        its.forEach((it, i) => {
            if (picks[i % picks.length])
                s = saveAnswer(s, { itemId: it.id, value: 'A', timeMs: 10, now: NOW + i + 1 }).session!;
        });
        const out = gradeSession(s);
        assert.ok(out.score === null || out.score <= out.maxScore);
        assert.ok(out.answered <= out.total);
        assert.ok(out.correct <= out.total);
    }), { numRuns: 30 });
});
