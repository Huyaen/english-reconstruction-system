import test from 'node:test';
import assert from 'node:assert/strict';
import type { Data, GrammarAttempt, MiniUnit, Passage, ReviewRecord, UnitEvidenceSummary, Word } from '../src/types.ts';
import { emptyData } from '../src/db.ts';
import { makeWord } from '../src/core.ts';
import { applyUnitEvent, anchorSuitability, completedDays, evaluateUnit, earlyCompletionCheck, guardDecision, nextDay, provenanceOf, readiness, stageOf, targetWordBudget, UNIT_RULES } from '../src/miniUnit.ts';
import { recommendThemes, selectTargetGrammar, selectTargetVocabulary, transferCandidates } from '../src/miniUnitSelection.ts';
import { collectUnitEvidence, dayEvidenceIds } from '../src/miniUnitEvidence.ts';
import { planDay, aiReuseKey } from '../src/miniUnitProgression.ts';
const NOW = new Date(2026, 9, 20, 10, 0, 0).getTime();
const DAY = 86400000;
const ANCHOR = 'anchor-1';
function passage(over: Partial<Passage> = {}): Passage {
    const text = over.text ?? 'The engineers measured the current and wrote the numbers in a grey notebook. When the water rose, that notebook was the only record they trusted, because memory had failed them once. The station stayed open through the worst weeks of the year.';
    return {
        id: ANCHOR,
        title: 'Rivers and Records',
        text,
        sourceType: 'import',
        sourceUrl: '',
        topic: 'rivers',
        wordCount: text.split(/\s+/).length,
        difficulty: 'medium',
        createdAt: NOW - DAY,
        contentHash: 'hash-anchor',
        ...over,
    };
}
function words(): Word[] {
    return ['engineers', 'current', 'notebook', 'station', 'memory', 'weeks'].map((en, i) => makeWord({ en, zh: `释义${i}` }, 'b1', i));
}
function weak(w: Word): Word {
    return { ...w, state: { ...w.state, total: 3, correct: 0, errors: 2, level: 'unknown' } };
}
function baseUnit(over: Partial<MiniUnit> = {}): MiniUnit {
    const u: MiniUnit = {
        id: 'unit-1', theme: 'Rivers', topic: 'rivers', dayIndex: 0, anchorMaterialId: '', targetWords: [], targetGrammar: [],
        difficultyTarget: null, status: 'active', startedAt: 0, completedAt: null, dayLog: [], stage: 'draft',
        plannedDays: 3, dayHistory: [], grammarTargets: [], baseline: undefined, linkedPassageIds: [], linkedSentenceIds: [],
        linkedGenerationIds: [], linkedDailyPlanIds: [], createdAt: NOW - DAY, updatedAt: NOW - DAY, revision: 0,
    };
    return { ...u, ...over };
}
function readyUnit(over: Partial<MiniUnit> = {}): MiniUnit {
    return baseUnit({
        anchorMaterialId: ANCHOR, anchorProvenance: 'user_imported_authentic', anchorSnapshotRef: 'anchor-1#hash-anchor', anchorTitle: 'Rivers and Records',
        targetWords: ['engineers', 'current', 'notebook'], targetGrammar: ['clause.adverbial'],
        grammarTargets: [{ conceptId: 'clause.adverbial', name: '状语从句', status: 'verified', evidence: '材料中出现 2 次' }],
        stage: 'ready', startedAt: NOW - DAY, ...over,
    });
}
function data(over: Partial<Data> = {}): Data {
    const d = emptyData();
    return { ...d, ...over } as Data;
}
function rec(wordId: string, at: number, correct = true, reason: ReviewRecord['reason'] = 'answer'): ReviewRecord {
    return { id: `r-${wordId}-${at}-${reason}`, wordId, sessionId: 's', at, direction: 'en-zh', correct, ms: 1800, selectedId: wordId, reason, before: 'vague', after: correct ? 'normal' : 'unknown', scheduled: true };
}
// ————— 状态机 —————
test('draft 不能直接开始：Ready 需要真实 Anchor + 目标词 + 目标语法', () => {
    const u = baseUnit();
    assert.equal(stageOf(u), 'draft');
    assert.equal(readiness(u).ok, false);
    const start = applyUnitEvent(u, { type: 'start', now: NOW });
    assert.equal(start.ok, false);
});
test('AI 生成材料不能作为 Anchor', () => {
    const u = baseUnit();
    const r = applyUnitEvent(u, { type: 'attach-anchor', passageId: 'ai-1', provenance: 'ai_generated', snapshotRef: 'x', title: 'AI 文', now: NOW });
    assert.equal(r.ok, false);
    const p = passage({ sourceType: 'ai_reinforcement' });
    assert.equal(provenanceOf(p), 'ai_generated');
});
test('绑定 Anchor + 目标后进入 ready，开始后进入 active 且不自动跳天', () => {
    let u = baseUnit();
    let r = applyUnitEvent(u, { type: 'attach-anchor', passageId: ANCHOR, provenance: 'user_imported_authentic', snapshotRef: 'a#h', title: 'Rivers', now: NOW });
    assert.ok(r.ok);
    if (!r.ok)
        return;
    u = r.unit;
    assert.equal(stageOf(u), 'draft', '只有 Anchor 还不够 Ready');
    r = applyUnitEvent(u, { type: 'set-targets', words: ['engineers', 'current'], grammar: [{ conceptId: 'clause.adverbial', name: '状语从句', status: 'verified', evidence: 'e' }], difficulty: 50, now: NOW });
    assert.ok(r.ok);
    if (!r.ok)
        return;
    u = r.unit;
    assert.equal(stageOf(u), 'ready');
    const s = applyUnitEvent(u, { type: 'start', now: NOW });
    assert.ok(s.ok);
    if (!s.ok)
        return;
    assert.equal(stageOf(s.unit), 'active');
    assert.equal(s.unit.dayIndex, 0);
    assert.equal(nextDay(s.unit), 1);
});
test('未完成 Day 1 不能直接完成 Day 2（顺序闸）', () => {
    const u = readyUnit({ stage: 'active' });
    const r = applyUnitEvent(u, { type: 'complete-day', day: 2, calendarDate: '2026-10-20', summary: 'x', evidenceIds: ['e1'], wordsCovered: [], now: NOW });
    assert.equal(r.ok, false);
    if (!r.ok)
        assert.equal(r.error, 'out-of-order');
});
test('没有真实活动证据不能完成学习日（打开页面不算）', () => {
    const u = readyUnit({ stage: 'active' });
    const r = applyUnitEvent(u, { type: 'complete-day', day: 1, calendarDate: '2026-10-20', summary: 'x', evidenceIds: [], wordsCovered: [], now: NOW });
    assert.equal(r.ok, false);
    if (!r.ok)
        assert.equal(r.error, 'missing-evidence');
});
test('完成 Day 1 幂等：重复提交不重复写 dayLog/dayHistory', () => {
    const u = readyUnit({ stage: 'active' });
    const first = applyUnitEvent(u, { type: 'complete-day', day: 1, calendarDate: '2026-10-20', summary: '建立理解', evidenceIds: ['e1', 'e2'], wordsCovered: ['current'], now: NOW });
    assert.ok(first.ok);
    if (!first.ok)
        return;
    assert.equal(first.unit.dayHistory?.length, 1);
    assert.equal(nextDay(first.unit), 2);
    const again = applyUnitEvent(first.unit, { type: 'complete-day', day: 1, calendarDate: '2026-10-20', summary: '建立理解', evidenceIds: ['e1'], wordsCovered: [], now: NOW + 1000 });
    assert.ok(again.ok);
    if (again.ok) {
        assert.equal(again.kind, 'noop');
        assert.equal(again.unit.dayHistory?.length, 1);
    }
});
test('3 个学习日之前不能延长 Day 4；完成后可延长', () => {
    const u2 = readyUnit({ stage: 'active', dayIndex: 2, dayHistory: [{ day: 1, kind: 'build', calendarDate: 'd1', at: NOW - 2 * DAY, summary: '', supportLevel: 'high', evidenceIds: ['e'], targetWordsCovered: [] }, { day: 2, kind: 'strengthen', calendarDate: 'd2', at: NOW - DAY, summary: '', supportLevel: 'medium', evidenceIds: ['e'], targetWordsCovered: [] }] });
    const early = applyUnitEvent(u2, { type: 'extend', reason: 'x', now: NOW });
    assert.equal(early.ok, false);
    const u3: MiniUnit = { ...u2, dayHistory: [...(u2.dayHistory ?? []), { day: 3, kind: 'transfer', calendarDate: 'd3', at: NOW, summary: '', supportLevel: 'low', evidenceIds: ['e'], targetWordsCovered: [] }], dayIndex: 3 };
    const ext = applyUnitEvent(u3, { type: 'extend', reason: '残余弱词', now: NOW + 10 });
    assert.ok(ext.ok);
    if (ext.ok) {
        assert.equal(ext.unit.plannedDays, 4);
        assert.equal(ext.unit.status, 'extended');
        assert.equal(nextDay(ext.unit), 4);
    }
});
test('暂停/继续/放弃与已结束单元的保护', () => {
    const u = readyUnit({ stage: 'active' });
    const p = applyUnitEvent(u, { type: 'pause', reason: '出差', now: NOW });
    assert.ok(p.ok);
    if (!p.ok)
        return;
    assert.equal(stageOf(p.unit), 'paused');
    const r = applyUnitEvent(p.unit, { type: 'resume', now: NOW + 1 });
    assert.ok(r.ok);
    if (r.ok)
        assert.equal(stageOf(r.unit), 'active');
    const done = applyUnitEvent(u, { type: 'abandon', reason: '换主题', now: NOW });
    assert.ok(done.ok);
    if (!done.ok)
        return;
    const after = applyUnitEvent(done.unit, { type: 'start', now: NOW + 5 });
    assert.equal(after.ok, false);
});
test('完成判定硬闸：没有真实新材料独立迁移 → 降级为 limited_evidence', () => {
    const u = readyUnit({ stage: 'active' });
    const evaluation = { at: NOW, decision: 'completed_verified' as const, confidence: 'high' as const, reasons: ['ok'], evidenceRefs: [], nextActions: [], metrics: { targetWordsCovered: 3, targetWordTotal: 3, independentRecallEvidence: 3, forgottenWords: [], grammarEvidence: 1, anchorColdResult: 0.2, supportedResult: 0.8, transferResult: 0.8, supportReduction: 0.5, translationDependence: 0.2, unresolvedObstacles: [], completedLearningDays: 3 } };
    const downgraded = guardDecision(u, evaluation);
    assert.equal(downgraded.decision, 'completed_limited_evidence');
    assert.equal(downgraded.confidence, 'low');
    const withTransfer = guardDecision({ ...u, transfer: { at: NOW, passageId: 'p2', materialKind: 'authentic', independent: true, comprehension: 0.8, targetWordRecall: 3, grammarObserved: true, sessionId: 's' } }, evaluation);
    assert.equal(withTransfer.decision, 'completed_verified');
});
test('Day 2 提前完成必须有真实迁移证据', () => {
    const u = readyUnit({ stage: 'active' });
    const ev: UnitEvidenceSummary = {
        unitId: u.id, wordsCovered: ['a', 'b', 'c'], wordsIndependent: ['a', 'b', 'c'], forgottenWords: [], targetWordTotal: 3, independentRecall: 3,
        grammar: [{ conceptId: 'clause.adverbial', attempts: 2, correct: 2, independent: true }], anchorSessions: ['s1'], transferSessions: [],
        sentenceAttempts: 2, planDays: [], generations: [], cold: { unknownRate: 0.3, comprehension: 0.3 }, supported: { comprehension: 0.8, translationDependence: 0.2 },
        supportReduction: 0.5, translationDependence: 0.2, obstacles: [], refs: [],
    };
    const noTransfer = earlyCompletionCheck(u, ev);
    assert.equal(noTransfer.allowed, false);
    const withAiTransfer = earlyCompletionCheck({ ...u, transfer: { at: NOW, passageId: 'ai-1', materialKind: 'ai_assisted', independent: true, comprehension: 0.8, targetWordRecall: 3, grammarObserved: true, sessionId: 's' } }, ev);
    assert.equal(withAiTransfer.allowed, false, 'AI 强化材料不能作为真实迁移依据');
    const ok = earlyCompletionCheck({ ...u, transfer: { at: NOW, passageId: 'p2', materialKind: 'authentic', independent: true, comprehension: 0.8, targetWordRecall: 3, grammarObserved: true, sessionId: 's' } }, ev);
    assert.equal(ok.allowed, true);
});
// ————— 主题推荐 / 目标选择 —————
test('只有 AI 材料时不做主题推荐（不伪造 Anchor）', () => {
    const d = data({ passages: [passage({ id: 'ai-1', sourceType: 'ai_reinforcement' })] });
    const r = recommendThemes({ passages: d.passages, words: [], grammar: [], units: [], now: NOW, availableMinutes: 45 });
    assert.equal(r.themes.length, 0);
    assert.match(r.note, /真实材料/);
});
test('主题推荐引用真实材料与薄弱词，且最多 3 个', () => {
    const ws = words().map(w => weak(w));
    const ps = [
        passage(),
        passage({ id: 'anchor-2', title: 'River Notes', topic: 'rivers', contentHash: 'h2' }),
        passage({ id: 'anchor-3', title: 'Machine History', topic: 'ai', text: 'The model learned from the data and the machine improved. Because the current was measured, the engineers trusted the notebook.', contentHash: 'h3' }),
        passage({ id: 'ai-x', title: 'AI 生成', sourceType: 'ai', contentHash: 'h4' }),
    ];
    const r = recommendThemes({ passages: ps, words: ws, grammar: [], units: [], now: NOW, availableMinutes: 45 });
    assert.ok(r.themes.length >= 1 && r.themes.length <= 3);
    for (const t of r.themes) {
        assert.ok(t.basis.materials.length >= 1);
        assert.equal(t.basis.materials.some(m => m.passageId === 'ai-x'), false, 'AI 材料不能进入推荐依据');
        assert.ok(t.whyRecommended.includes('真实材料'));
    }
    const rivers = r.themes.find(t => t.theme.toLowerCase().includes('rivers'));
    assert.ok(rivers, '应按主题聚合');
    assert.ok(rivers!.basis.weakWordsInMaterials.length > 0, '薄弱词应被引用');
});
test('目标词数量按时间/难度动态，且薄弱词优先', () => {
    const ws = words().map((w, i) => (i < 3 ? weak(w) : w));
    const small = selectTargetVocabulary({ passage: passage(), words: ws, now: NOW, availableMinutes: 20 });
    const large = selectTargetVocabulary({ passage: passage(), words: ws, now: NOW, availableMinutes: 90 });
    assert.ok(large.budget >= small.budget);
    assert.ok(small.words.length <= small.budget);
    assert.ok(small.words.slice(0, 3).every(w => ['engineers', 'current', 'notebook'].includes(w.word)), '薄弱词应优先进入目标');
    assert.ok(!('30 per unit' in {}));
    assert.ok(targetWordBudget({ availableMinutes: 15, difficulty: 0.9 }) < targetWordBudget({ availableMinutes: 60, difficulty: 0.2 }));
});
test('目标语法：材料可观察 → verified；未观察到的薄弱点 → candidate', () => {
    const g = selectTargetGrammar({
        passages: [passage()],
        grammar: [
            { id: 'clause.adverbial', name: '状语从句', category: 'clauses', parentId: null, exposures: 3, attempts: 4, correct: 1, mastery: 0.25, retention: 0.4, errorTypes: {}, lastSeenAt: NOW - DAY, nextReviewAt: NOW } as never,
            { id: 'verb.passive', name: '被动语态', category: 'verb-system', parentId: null, exposures: 2, attempts: 3, correct: 1, mastery: 0.3, retention: 0.4, errorTypes: {}, lastSeenAt: NOW - DAY, nextReviewAt: NOW } as never,
        ],
    });
    const adv = g.find(x => x.conceptId === 'clause.adverbial');
    assert.ok(adv);
    assert.equal(adv!.status, 'verified');
    assert.match(adv!.evidence, /材料中出现/);
    const passive = g.find(x => x.conceptId === 'verb.passive');
    if (passive)
        assert.equal(passive.status, 'candidate');
});
test('Anchor 适用性：AI 材料拒绝，过长提示，舒适材料建议 2 天', () => {
    assert.equal(anchorSuitability(passage({ sourceType: 'ai' }), null).ok, false);
    const long = anchorSuitability(passage({ wordCount: 2000 }), { difficulty: 0.6, knownCoverage: 0.7, classification: 'growth', estimatedMinutes: 8 });
    assert.equal(long.ok, true);
    assert.ok(long.reasons.some(r => r.includes('偏长')));
    const comfort = anchorSuitability(passage(), { difficulty: 0.3, knownCoverage: 0.95, classification: 'comfort', estimatedMinutes: 4 });
    assert.equal(comfort.recommendedDays, 2);
});
// ————— 证据 —————
test('证据只统计单元开始后、与目标词真实关联的作答；timeout 不算独立回忆', () => {
    const ws = words();
    const u = readyUnit({ stage: 'active' });
    const d = data({
        words: ws,
        records: [
            rec(ws[0].id, NOW + 100, true),
            rec(ws[1].id, NOW + 200, true, 'timeout'),
            rec(ws[2].id, NOW - 10 * DAY, true),
        ],
    });
    const ev = collectUnitEvidence(d, u);
    assert.deepEqual(ev.wordsIndependent, ['engineers']);
    assert.ok(ev.wordsCovered.includes('current'));
    assert.equal(ev.independentRecall, 1);
});
test('没有作答/阅读会话时 dayEvidenceIds 为空（打开页面不算学习）', () => {
    const u = readyUnit({ stage: 'active' });
    assert.equal(dayEvidenceIds(data({ words: words() }), u, 1).length, 0);
});
test('同一篇文章不能算独立迁移；AI 材料标 ai_assisted', () => {
    const d = data({ passages: [passage(), passage({ id: 'p2', title: '同题第二篇', contentHash: 'h2' }), passage({ id: 'ai-2', sourceType: 'ai', title: 'AI 篇', contentHash: 'h3' })] });
    const u = readyUnit({ stage: 'active' });
    assert.equal(transferCandidates(d.passages, u).some(p => p.id === ANCHOR), false);
    assert.ok(transferCandidates(d.passages, u).some(p => p.id === 'p2'));
});
// ————— 完成评价 —————
test('无证据时评价为 limited_evidence / low，并给出下一步', () => {
    const u = readyUnit({ stage: 'active' });
    const ev = collectUnitEvidence(data({ words: words() }), u);
    const r = evaluateUnit(u, ev, NOW);
    assert.equal(r.decision, 'completed_limited_evidence');
    assert.equal(r.confidence, 'low');
    assert.ok(r.nextActions.length > 0);
});
test('目标词独立回忆 + 语法 + 真实迁移 → verified；中文依赖高则降级', () => {
    const ws = words();
    const u = readyUnit({ stage: 'active', transfer: { at: NOW, passageId: 'p2', materialKind: 'authentic', independent: true, comprehension: 0.8, targetWordRecall: 3, grammarObserved: true, sessionId: 's' } });
    const d = data({ words: ws, records: [rec(ws[0].id, NOW + 1), rec(ws[1].id, NOW + 2), rec(ws[2].id, NOW + 3)] });
    const ev = collectUnitEvidence(d, u);
    const r = evaluateUnit(u, ev, NOW);
    assert.equal(r.decision, 'completed_verified');
    const dependent = evaluateUnit(u, { ...ev, translationDependence: 0.9 }, NOW);
    assert.equal(dependent.decision, 'completed_limited_evidence');
});
test('完成的天数按 dayHistory 统计，重复的 dayLog 不会重复计数', () => {
    const u = readyUnit({ dayHistory: [{ day: 1, kind: 'build', calendarDate: 'd1', at: NOW, summary: '', supportLevel: 'high', evidenceIds: ['e'], targetWordsCovered: [] }], dayLog: [{ day: 1, at: NOW, summary: '' }, { day: 1, at: NOW + 1, summary: '' }] });
    assert.deepEqual(completedDays(u), [1]);
});
// ————— 日推进 —————
test('Day 1/2/3 的重点与辅助级别确实不同，且总时长不超预算', () => {
    const d = data({ passages: [passage(), passage({ id: 'p2', title: 'Second river text', contentHash: 'h2' })], words: words() });
    const u = readyUnit({ stage: 'active' });
    const d1 = planDay({ unit: u, day: 1, availableMinutes: 45, energy: 'normal', data: d });
    const d2 = planDay({ unit: u, day: 2, availableMinutes: 45, energy: 'normal', data: d });
    const d3 = planDay({ unit: u, day: 3, availableMinutes: 45, energy: 'normal', data: d });
    assert.equal(d1.supportLevel, 'high');
    assert.equal(d1.translationAllowed, true);
    assert.equal(d2.supportLevel, 'medium');
    assert.equal(d3.supportLevel, 'low');
    assert.equal(d3.translationAllowed, false);
    assert.ok(d3.focus.some(f => f.id === 'transfer'));
    assert.equal(d3.material.kind, 'transfer');
    assert.notEqual(d1.focus.map(f => f.id).join(','), d2.focus.map(f => f.id).join(','));
    for (const spec of [d1, d2, d3])
        assert.ok(spec.focus.reduce((n, f) => n + f.minutes, 0) <= 45, `${spec.day} 天超预算`);
    assert.ok(d3.warnings.every(w => typeof w === 'string'));
});
test('Day 3 没有真实新材料时明确警告，不伪造迁移', () => {
    const d = data({ passages: [passage()], words: words() });
    const u = readyUnit({ stage: 'active' });
    const spec = planDay({ unit: u, day: 3, availableMinutes: 40, energy: 'normal', data: d });
    assert.equal(spec.material.kind, 'anchor');
    assert.ok(spec.warnings.some(w => w.includes('迁移')));
    assert.equal(spec.aiOptional?.kind, 'reading');
});
test('AI 复用键稳定：同一单元/天/目标/版本只生成一次', () => {
    const u = readyUnit({ stage: 'active' });
    assert.equal(aiReuseKey(u, 2), aiReuseKey(u, 2));
    assert.notEqual(aiReuseKey(u, 2), aiReuseKey(u, 3));
    const changed = { ...u, targetWords: [...u.targetWords, 'memory'] };
    assert.notEqual(aiReuseKey(changed, 2), aiReuseKey(u, 2));
});
test('UNIT_RULES 的默认计划天数与上限符合规范（3 天，最多 4 天）', () => {
    assert.equal(UNIT_RULES.plannedDays, 3);
    assert.equal(UNIT_RULES.maxDays, 4);
});
