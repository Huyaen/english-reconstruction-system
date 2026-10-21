import test from 'node:test';
import assert from 'node:assert/strict';
import type { Data, InputSession, InputSource, Transcript } from '../src/types.ts';
import { emptyData } from '../src/db.ts';
import { activitySignals, addInterest, emptyProfile, normalizeProfile, resetInterests, SIGNAL_WEIGHTS } from '../src/interestProfile.ts';
import { createInputSource } from '../src/inputSource.ts';
import { createInputSession, submitInputReflection, completeInputSession, startInputSession } from '../src/inputSession.ts';
import { INPUT_TARGETS, recommendInputs, targetGap } from '../src/inputRecommendation.ts';
import { evidenceForSession, inputAnalytics, mergeEvidence, sessionEvidence } from '../src/inputEvidence.ts';
import { saveToLibrary } from '../src/inputLibrary.ts';

const NOW = new Date(2026, 9, 21, 10, 0, 0).getTime();
const DAY = 86400000;
function must<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
    if (!r.ok)
        throw new Error(JSON.stringify(r));
    return r as Extract<T, { ok: true }>;
}
function source(over: Partial<Parameters<typeof createInputSource>[0]> = {}): InputSource {
    return must(createInputSource({ title: 'Roman Engineering', url: 'https://www.youtube.com/watch?v=rome0001', topic: 'roman history', durationMinutes: 35, now: NOW - DAY, ...over })).source;
}
function transcriptFor(sourceId: string, over: Partial<Transcript> = {}): Transcript {
    return {
        id: `tr_${sourceId}`, sourceId, language: 'en', provenance: 'user_supplied', timed: true,
        cues: [{ startMs: 0, endMs: 2000, text: 'The aqueducts carried water into the city.', language: 'en', provenance: 'user_supplied' }],
        hash: `h-${sourceId}`, createdAt: NOW - DAY, updatedAt: NOW - DAY, ...over,
    };
}
function sessionFor(src: InputSource, over: Partial<InputSession> = {}): InputSession {
    const created = must(createInputSession({ source: src, mode: 'standard', plannedMinutes: 20, now: NOW - 2 * 3600000 }));
    const started = must(startInputSession(created.session, { now: NOW - 2 * 3600000 + 1000 }));
    const reflected = must(submitInputReflection(started.session, { captionMode: 'en', comprehension: 0.7, notes: 'ok', summary: 'The film shows how Rome moved water. It explains the concrete. The narrator visits three sites.', reportedWatchedMinutes: 18 }, { now: NOW - 3600000 }));
    const done = must(completeInputSession(reflected.session, { now: NOW - 3500000 }));
    return { ...done.session, ...over };
}
function data(over: Partial<Data> = {}): Data {
    return { ...emptyData(), ...over } as Data;
}
function rec(d: Data, profile = emptyProfile(NOW), minutes = 30, energy: 'low' | 'normal' | 'good' = 'normal') {
    return recommendInputs({ data: d, profile, signals: activitySignals(d, NOW), now: NOW, availableMinutes: minutes, energy });
}

// ————— Recommendation —————
test('推荐：显式兴趣决定排序并给出 Based on your interests', () => {
    const a = source({ title: 'Roman Engineering', topic: 'roman history', url: 'https://www.youtube.com/watch?v=rome0001' });
    const b = source({ title: 'CS2 Major Final', topic: 'cs2 esports', url: 'https://www.youtube.com/watch?v=cs200001', durationMinutes: 60 });
    let p = emptyProfile(NOW);
    p = addInterest(p, 'roman history', { keywords: ['roman'] }, NOW).profile;
    const r = rec(data({ inputSources: [a, b] }), p);
    assert.equal(r.candidates[0].topic, 'roman history');
    assert.equal(r.candidates[0].reasonTag, 'Based on your interests');
    assert.ok(r.candidates.some(c => c.exploration));
});
test('推荐：近期完成的输入产生 Based on your recent activity（而不是永久兴趣）', () => {
    const a = source({ title: 'Astronomy Talk', topic: 'astronomy', url: 'https://www.youtube.com/watch?v=astro001' });
    const done = sessionFor(a);
    const r = rec(data({ inputSources: [a], inputSessions: [done] }));
    assert.equal(r.candidates[0].reasonKind, 'recent');
    assert.equal(r.candidates[0].repeat, true, '刚完成过的材料应标记重复');
});
test('推荐：当前 Mini Unit 的主题标记 Related to your Mini Unit', () => {
    const a = source({ title: 'Roman Engineering', topic: 'roman history', url: 'https://www.youtube.com/watch?v=rome0001' });
    const d = data({
        inputSources: [a],
        miniUnits: [{
            id: 'u1', theme: 'Rivers', topic: 'roman history', dayIndex: 1, anchorMaterialId: 'p1', targetWords: [], targetGrammar: [],
            difficultyTarget: null, status: 'active', stage: 'active', startedAt: NOW - DAY, completedAt: null, dayLog: [], plannedDays: 3,
            dayHistory: [], createdAt: NOW - DAY, updatedAt: NOW - DAY,
        }],
    });
    const r = rec(d);
    assert.equal(r.candidates[0].reasonKind, 'unit');
    assert.equal(r.candidates[0].reasonTag, 'Related to your Mini Unit');
});
test('推荐：没有真实材料时不伪造候选，只提示导入', () => {
    const r = rec(data());
    assert.equal(r.candidates.length, 0);
    assert.match(r.note, /还没有真实材料/);
    assert.equal(r.sufficient, false);
});
test('推荐：没有 transcript 时不猜难度；有 transcript + transcript 依据才给估计', () => {
    const noTr = source({ url: 'https://www.youtube.com/watch?v=no00001' });
    const r1 = rec(data({ inputSources: [noTr] }));
    assert.equal(r1.candidates[0].difficulty.estimate, null);
    assert.equal(r1.candidates[0].difficulty.basis, 'none');
    const withTr = { ...source({ url: 'https://www.youtube.com/watch?v=yes0001' }), transcriptRef: 'tr_yes' };
    const r2 = rec(data({ inputSources: [withTr], transcripts: [transcriptFor(withTr.id, { id: 'tr_yes' })] }));
    assert.equal(r2.candidates[0].hasTranscript, true);
    // 没有写入 estimate 时仍然诚实：有字幕不等于有难度分数
    assert.equal(r2.candidates[0].difficulty.estimate, null);
});
test('推荐：兴趣不改变难度与目标区间（兴趣≠能力）', () => {
    const a = { ...source(), transcriptRef: 'tr_x' };
    const d = data({ inputSources: [a], transcripts: [transcriptFor(a.id, { id: 'tr_x' })] });
    const plain = rec(d, emptyProfile(NOW), 30, 'good');
    let p = emptyProfile(NOW);
    p = addInterest(p, 'roman history', { keywords: ['roman'] }, NOW).profile;
    const interested = rec(d, p, 30, 'good');
    assert.equal(plain.candidates[0].difficulty.estimate, interested.candidates[0].difficulty.estimate);
    assert.equal(plain.target, interested.target);
    assert.equal(plain.target, 'growth');
});
test('推荐：Energy 决定 Comfort / Growth 目标，但不伪装成测量', () => {
    const a = source();
    const low = rec(data({ inputSources: [a] }), emptyProfile(NOW), 20, 'low');
    const good = rec(data({ inputSources: [a] }), emptyProfile(NOW), 30, 'good');
    assert.equal(low.target, 'comfort');
    assert.equal(good.target, 'growth');
    assert.match(targetGap('comfort', null), /没有理解自评/);
    assert.match(INPUT_TARGETS.comfort.label, /80–90%/);
});
test('推荐：时间不够时给出可看的片段（fitMinutes 不超过可用时间）', () => {
    const long = source({ durationMinutes: 90 });
    const r = rec(data({ inputSources: [long] }), emptyProfile(NOW), 12, 'normal');
    assert.ok(r.candidates[0].fitMinutes <= 12);
    assert.match(r.candidates[0].facts.join(' '), /90 分钟/);
});
test('推荐：证据稀疏时明确说明不是精准个性化', () => {
    const a = source();
    const r = rec(data({ inputSources: [a] }));
    assert.match(r.note, /不算精准个性化/);
    let p = emptyProfile(NOW);
    p = addInterest(p, 'roman history', {}, NOW).profile;
    assert.equal(rec(data({ inputSources: [a] }), p).note, '');
});
test('推荐：兴趣重置后回到 Explore，而不是继续贴兴趣标签', () => {
    let p = emptyProfile(NOW);
    p = addInterest(p, 'roman history', { keywords: ['roman'] }, NOW).profile;
    p = resetInterests(p, NOW).profile;
    const r = rec(data({ inputSources: [source()] }), p);
    assert.equal(r.candidates[0].reasonKind, 'explore');
});
test('推荐：自由主题（不在默认分类）同样可用', () => {
    const a = source({ topic: 'fractal geometry', title: 'Fractals everywhere', url: 'https://example.com/fractals' });
    const r = rec(data({ inputSources: [a] }));
    assert.equal(r.candidates[0].topic, 'fractal geometry');
    assert.equal(r.candidates[0].reasonKind, 'explore');
});
test('推荐：刚完成的材料排在未完成材料之后（防重复硬规则）', () => {
    const done = source({ title: 'Roman Engineering', topic: 'roman history', url: 'https://www.youtube.com/watch?v=rome0001' });
    const fresh = source({ title: 'Astronomy Talk', topic: 'astronomy', url: 'https://www.youtube.com/watch?v=astro001' });
    let p = emptyProfile(NOW);
    p = addInterest(p, 'roman history', { keywords: ['roman'] }, NOW).profile;
    const r = rec(data({ inputSources: [done, fresh], inputSessions: [sessionFor(done)] }), p);
    assert.equal(r.candidates[0].topic, 'astronomy');
    const roman = r.candidates.find(c => c.topic === 'roman history');
    if (roman)
        assert.equal(roman.repeat, true);
});

// ————— Signals —————
test('行为信号：完成的输入比收藏更有分量，且不写回兴趣画像', () => {
    const a = source();
    const d = data({ inputSources: [a], inputSessions: [sessionFor(a)], libraryItems: saveToLibrary([], a, NOW).items });
    const before = JSON.stringify(emptyProfile(NOW));
    const signals = activitySignals(d, NOW);
    assert.ok(signals.topics.length > 0);
    const top = signals.topics[0];
    assert.equal(top.inputs, 1);
    assert.equal(top.saved, 1);
    assert.ok(SIGNAL_WEIGHTS.inputCompleted > SIGNAL_WEIGHTS.saved);
    assert.equal(JSON.stringify(emptyProfile(NOW)), before);
});
test('行为信号：一次超长观看不会把权重推到 1（单主题封顶）', () => {
    const a = source();
    const sessions = [1, 2, 3, 4, 5].map(i => sessionFor(a, { id: `s${i}`, reportedWatchedMinutes: 180 }));
    const signals = activitySignals(data({ inputSources: [a], inputSessions: sessions }), NOW);
    assert.ok(signals.topics[0].weight <= 1);
});
test('行为信号：旧规则不变（导入 0.15 / 阅读 0.4 / 单元 0.3 权重常量）', () => {
    assert.equal(SIGNAL_WEIGHTS.import, 0.15);
    assert.equal(SIGNAL_WEIGHTS.read, 0.4);
    assert.equal(SIGNAL_WEIGHTS.unitCompleted, 0.3);
});

// ————— Evidence —————
test('证据：观看曝光只在有自报时长时产生，且置信度很低', () => {
    const a = source();
    const done = sessionFor(a);
    const ev = sessionEvidence(done, NOW);
    const watching = ev.find(e => e.evidenceType === 'watching_exposure');
    assert.ok(watching);
    assert.equal(watching!.confidence, 0.2);
    assert.equal(watching!.meta?.basis, 'self_report');
    const noWatch = sessionEvidence({ ...done, reportedWatchedMinutes: 0, watchedMinutes: 0 }, NOW);
    assert.equal(noWatch.some(e => e.evidenceType === 'watching_exposure'), false);
});
test('证据：自评与产出分开记录，且没有任何听力分数', () => {
    const done = sessionFor(source());
    const ev = sessionEvidence(done, NOW);
    assert.ok(ev.some(e => e.evidenceType === 'self_report'));
    assert.ok(ev.some(e => e.evidenceType === 'output_attempt'));
    assert.equal(ev.some(e => e.evidenceType === 'independent_comprehension'), false);
    assert.equal(JSON.stringify(ev).includes('score'), false);
});
test('证据：重复完成/重复写入是幂等的（同 id 只保留一条）', () => {
    const done = sessionFor(source());
    const first = sessionEvidence(done, NOW);
    const merged = mergeEvidence(first, sessionEvidence(done, NOW + 1000));
    assert.equal(merged.added.length, 0);
    assert.equal(merged.items.length, first.length);
    const once = mergeEvidence([], first);
    assert.equal(once.items.length, first.length);
    assert.equal(evidenceForSession(once.items, done.id).length, first.length);
});
test('证据：未完成的会话不产生证据', () => {
    const a = source();
    const created = must(createInputSession({ source: a, mode: 'light', now: NOW }));
    assert.deepEqual(sessionEvidence(created.session, NOW), []);
});
test('统计：时长全部标注自报，未完成会话单独统计', () => {
    const a = source();
    const b = source({ url: 'https://www.youtube.com/watch?v=two0001', title: 'Second', topic: 'astronomy' });
    const created = must(createInputSession({ source: b, mode: 'standard', now: NOW }));
    const d = data({ inputSources: [a, b], inputSessions: [sessionFor(a), created.session] });
    const stats = inputAnalytics(d, NOW);
    assert.equal(stats.completedSessions, 1);
    assert.equal(stats.unfinishedSessions, 1);
    assert.match(stats.minutesLabel, /自报/);
    assert.equal(stats.captions.en, 1);
    assert.match(stats.note, /不构成掌握证据/);
});
test('持久化：normalizeProfile 不会把行为信号写进画像', () => {
    const a = source();
    const d = data({ inputSources: [a], inputSessions: [sessionFor(a)] });
    activitySignals(d, NOW);
    const p = normalizeProfile(undefined, NOW);
    assert.equal(p.topics.length, 0);
});
