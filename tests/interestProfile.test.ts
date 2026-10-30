import test from 'node:test';
import assert from 'node:assert/strict';
import type { Data, InterestProfile, MiniUnit, Passage, ReadingSession } from '../src/types.ts';
import { emptyData } from '../src/db.ts';
import { SUGGESTED_INTERESTS, activitySignals, addInterest, emptyProfile, matchInterest, normalizeProfile, removeInterest, renameInterest, resetInterests, setExploration, setInterestWeight, updateInterestKeywords, } from '../src/interestProfile.ts';
import { recommendThemes } from '../src/miniUnitSelection.ts';
const NOW = new Date(2026, 9, 20, 10, 0, 0).getTime();
const DAY = 86400000;
function passage(over: Partial<Passage> = {}): Passage {
    const text = over.text ?? 'The engineers measured the current and wrote the numbers in a grey notebook. When the water rose, that notebook was the only record they trusted, because memory had failed them once. The station stayed open through the worst weeks.';
    return {
        id: over.id ?? 'p1', title: over.title ?? 'Rivers and Records', text,
        sourceType: 'import', sourceUrl: '', topic: over.topic ?? 'rivers',
        wordCount: text.split(/\s+/).length, difficulty: 'medium', createdAt: over.createdAt ?? NOW - DAY,
        contentHash: over.contentHash ?? 'h1', importedAt: over.importedAt ?? NOW - DAY, ...over,
    };
}
function session(passageId: string, at: number): ReadingSession {
    return {
        id: `s-${passageId}-${at}`, passageId, wordCount: 40, durationMs: 60000, unknownWords: [], vagueWords: [],
        unknownRate: 0.2, firstPassComprehension: 0.6, secondPassComprehension: null, readingSpeed: 120,
        structureErrors: 0, translationDependence: 0.2, summary: '', stage: 3, at,
    };
}
function unit(over: Partial<MiniUnit> = {}): MiniUnit {
    return {
        id: over.id ?? 'u1', theme: over.theme ?? 'Rivers', topic: over.topic ?? 'rivers', dayIndex: 0,
        anchorMaterialId: 'p1', targetWords: [], targetGrammar: [], difficultyTarget: null,
        status: 'active', startedAt: NOW - DAY, completedAt: null, dayLog: [], stage: 'active',
        plannedDays: 3, dayHistory: [], createdAt: NOW - DAY, updatedAt: over.updatedAt ?? NOW - DAY, ...over,
    };
}
function data(over: Partial<Data> = {}): Data {
    return { ...emptyData(), ...over } as Data;
}
function rec(profile: InterestProfile, d: Data, minutes = 45) {
    return recommendThemes({
        passages: d.passages, words: d.words, grammar: d.grammarConcepts, units: d.miniUnits,
        now: NOW, availableMinutes: minutes, interest: { profile, signals: activitySignals(d, NOW) },
    });
}
// 1) 自由增删改
test('兴趣可自由添加、改名、删除任意主题（不受默认分类限制）', () => {
    let profile = emptyProfile(NOW);
    const added = addInterest(profile, 'fractal geometry', {}, NOW);
    assert.ok(added.topic);
    profile = added.profile;
    assert.equal(profile.topics.length, 1);
    assert.deepEqual(profile.topics[0].keywords, ['fractal', 'geometry'], '默认关键词按分隔符拆开');
    const renamed = renameInterest(profile, profile.topics[0].id, '分形几何 / 数学史', NOW + 1);
    assert.equal(renamed.profile.topics[0].label, '分形几何 / 数学史');
    profile = renamed.profile;
    assert.ok(matchInterest(profile, '数学史 the story of geometry'), '中文标签也能通过关键词命中');
    const removed = removeInterest(profile, profile.topics[0].id, NOW + 2);
    assert.equal(removed.profile.topics.length, 0);
});
test('重复主题被拒绝；关键词可编辑；权重可调但只由用户操作改变', () => {
    let p = emptyProfile(NOW);
    p = addInterest(p, 'Rivers', {}, NOW).profile;
    const dup = addInterest(p, ' rivers ', {}, NOW);
    assert.ok(dup.error);
    assert.equal(dup.profile.topics.length, 1);
    const kw = updateInterestKeywords(p, p.topics[0].id, ['river', 'water'], NOW);
    assert.deepEqual(kw.profile.topics[0].keywords, ['river', 'water']);
    const w = setInterestWeight(kw.profile, p.topics[0].id, 0.95, NOW);
    assert.equal(w.profile.topics[0].weight, 0.95);
    assert.equal(setExploration(w.profile, 0.5, NOW).profile.exploration, 0.5);
});
// 2) 默认分类只是建议，不是白名单
test('默认分类是建议：未采纳时仍可推荐画像外的真实主题', () => {
    const d = data({ passages: [passage({ topic: 'tectonics', title: 'Plate Tectonics' })] });
    const r = rec(emptyProfile(NOW), d);
    assert.equal(r.themes.length, 1);
    assert.ok(!SUGGESTED_INTERESTS.some(s => s.label === r.themes[0].theme), '推荐主题不需要出现在默认分类里');
    assert.equal(r.themes[0].reasonKind, 'explore');
});
// 3) 与画像无关的材料仍可被选择
test('画像之外的领域仍会被推荐（不按兴趣过滤材料）', () => {
    let p = emptyProfile(NOW);
    p = addInterest(p, 'AI / 科技', { keywords: ['ai', 'machine learning'] }, NOW).profile;
    const d = data({ passages: [passage({ id: 'p2', topic: 'rivers', title: 'Rivers and Records', contentHash: 'h2' })] });
    const r = rec(p, d);
    assert.equal(r.themes.length, 1);
    assert.equal(r.themes[0].reasonKind, 'explore');
});
// 4) 显式偏好优先于行为推断
test('显式兴趣优先于近期行为：兴趣主题排第一，理由为 Based on your interests', () => {
    let p = emptyProfile(NOW);
    p = addInterest(p, '历史 / 人文', { keywords: ['river', 'history'] }, NOW).profile;
    const d = data({
        passages: [passage({ id: 'p-river', topic: 'rivers' }), passage({ id: 'p-ai', topic: 'ai', title: 'Machine Learning Notes', contentHash: 'h2' })],
        readingSessions: [session('p-ai', NOW - 3600000), session('p-ai', NOW - 7200000), session('p-ai', NOW - 10800000)],
    });
    const r = rec(p, d);
    assert.equal(r.themes[0].topic, 'rivers');
    assert.equal(r.themes[0].reasonKind, 'interests');
    assert.equal(r.themes[0].reasonTag, '基于你的兴趣');
    assert.ok(r.themes.some(t => t.reasonKind === 'recent'), '近期行为应体现在另一条推荐上');
});
// 5) 一次点击不永久改变权重
test('一次真实阅读只影响排序，不写入兴趣权重（权重只由用户操作改变）', () => {
    let p = emptyProfile(NOW);
    p = addInterest(p, 'Rivers', { keywords: ['river'] }, NOW).profile;
    const before = JSON.parse(JSON.stringify(p));
    const d = data({ passages: [passage()], readingSessions: [session('p1', NOW - 60000)] });
    const signals = activitySignals(d, NOW);
    assert.ok(signals.topics.length > 0, '行为信号应被识别');
    const r = rec(p, d);
    assert.ok(r.themes.length);
    assert.deepEqual(p, before, '画像对象不能被行为推断改写');
    assert.equal(normalizeProfile(p, NOW).topics[0].weight, before.topics[0].weight);
});
// 6) 探索空间
test('画像非空时保留探索位：至少一条 Explore something new', () => {
    let p = emptyProfile(NOW);
    p = addInterest(p, 'Rivers', { keywords: ['river'] }, NOW).profile;
    const d = data({
        passages: [passage({ id: 'p1', topic: 'rivers' }), passage({ id: 'p2', topic: 'tectonics', title: 'Plate Tectonics', contentHash: 'h2' }), passage({ id: 'p3', topic: 'cooking', title: 'Bread and Heat', contentHash: 'h3' })],
    });
    const r = rec(p, d);
    assert.equal(r.themes.length, 3);
    assert.ok(r.themes.some(t => t.exploration && t.reasonTag === '换个新领域试试'), JSON.stringify(r.themes.map(t => [t.topic, t.reasonKind])));
});
// 7) 当前单元相关
test('进行中的单元主题标记为 Related to your unit', () => {
    const d = data({
        passages: [passage({ id: 'p1', topic: 'rivers' }), passage({ id: 'p2', topic: 'rivers', title: 'River Notes', contentHash: 'h2' })],
        miniUnits: [unit({ id: 'u9', topic: 'rivers', anchorMaterialId: 'p2', stage: 'active' })],
    });
    const r = rec(emptyProfile(NOW), d);
    const rivers = r.themes.find(t => t.topic === 'rivers');
    assert.ok(rivers);
    assert.equal(rivers!.reasonKind, 'unit');
    assert.equal(rivers!.reasonTag, '和你正在做的单元相关');
});
// 8) 查看/调整/重置
test('重置清空画像并保留重置计数；空画像与脏数据都能安全归一化', () => {
    let p = emptyProfile(NOW);
    p = addInterest(p, '游戏', {}, NOW).profile;
    p = addInterest(p, '历史', {}, NOW).profile;
    const reset = resetInterests(p, NOW + 5);
    assert.equal(reset.profile.topics.length, 0);
    assert.equal(reset.profile.resets, 1);
    assert.equal(reset.profile.exploration, 0.34);
    const dirty = normalizeProfile({ topics: [{ label: '  Rivers ', weight: 9 }, { label: 'rivers' }, null, { label: '' }], exploration: 9 });
    assert.equal(dirty.topics.length, 1, '去重 + 丢弃非法项');
    assert.equal(dirty.topics[0].weight, 1, '权重被夹到 0–1');
    assert.ok(dirty.exploration <= 0.6);
});
// 9) 兴趣 ≠ 能力
test('兴趣不参与能力/难度判定：同一材料在不同画像下难度估计一致', () => {
    let p = emptyProfile(NOW);
    p = addInterest(p, 'Rivers', { keywords: ['river'] }, NOW).profile;
    const d = data({ passages: [passage({ id: 'p1', topic: 'rivers' })] });
    const withInterest = rec(p, d).themes[0];
    const without = rec(emptyProfile(NOW), d).themes[0];
    assert.equal(withInterest.estimatedDifficulty, without.estimatedDifficulty);
    assert.equal(withInterest.difficultyConfidence, without.difficultyConfidence);
    assert.equal(withInterest.targetWords.length, without.targetWords.length);
    assert.equal('level' in p.topics[0], false, '画像不包含任何能力字段');
});
// 10) 不反复推荐同一主题的相似内容
test('刚完成同主题单元会被降权并标记 repeat，不反复推相似内容', () => {
    let p = emptyProfile(NOW);
    p = addInterest(p, 'Rivers', { keywords: ['river'] }, NOW).profile;
    const d = data({
        passages: [passage({ id: 'p1', topic: 'rivers' }), passage({ id: 'p2', topic: 'tectonics', title: 'Plate Tectonics', contentHash: 'h2' })],
        miniUnits: [unit({ id: 'u-done', topic: 'rivers', status: 'completed', stage: 'completed', completedAt: NOW - DAY, updatedAt: NOW - DAY })],
    });
    const r = rec(p, d);
    const rivers = r.themes.find(t => t.topic === 'rivers');
    if (rivers)
        assert.equal(rivers.repeat, true, '仍推荐时必须标记重复');
    const first = r.themes[0].topic;
    assert.equal(first, 'tectonics', `刚完成同主题后应让位给其它主题，实际第一是 ${first}`);
});
// 证据不足时必须说明
test('空画像 + 行为不足时明确说明不是精准个性化', () => {
    const d = data({ passages: [passage({ topic: 'rivers' })] });
    const r = rec(emptyProfile(NOW), d);
    assert.match(r.note, /不算个性化|依据有限/);
    assert.equal(activitySignals(d, NOW).sufficient, false);
});
test('行为足够 + 有画像时不再声明依据不足', () => {
    let p = emptyProfile(NOW);
    p = addInterest(p, 'Rivers', { keywords: ['river'] }, NOW).profile;
    const d = data({
        passages: [passage({ id: 'p1', topic: 'rivers' })],
        readingSessions: [session('p1', NOW - 1000), session('p1', NOW - 2000), session('p1', NOW - 3000)],
    });
    const r = rec(p, d);
    assert.equal(activitySignals(d, NOW).sufficient, true);
    assert.equal(/不算精准个性化/.test(r.note), false, `有画像+有行为时不应声明依据不足，实际：${r.note}`);
});
