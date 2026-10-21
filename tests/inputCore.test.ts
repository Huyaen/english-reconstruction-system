import test from 'node:test';
import assert from 'node:assert/strict';
import type { InputSource } from '../src/types.ts';
import { createInputSource, isAvailable, updateInputSource } from '../src/inputSource.ts';
import { contentTypeOf, isSafeExternalUrl, parseInputUrl, providerLabel, sameInputTarget } from '../src/inputUrl.ts';
import { deleteLibraryItem, filterLibrary, libraryItemFromSource, libraryStats, linkLibraryToUnit, markOpened, saveToLibrary, setLibraryCompletion, setLibraryStatus, } from '../src/inputLibrary.ts';
import { abandonInputSession, beginReflection, canTransition, completeInputSession, createInputSession, pauseInputSession, planInputMinutes, recordBaseline, resumeInputSession, startInputSession, suggestMode, submitInputReflection, } from '../src/inputSession.ts';
import { captionCaveat, DIFFICULTY_REASONS, REFLECTION_SPECS, validateReflection } from '../src/inputReflection.ts';
import { cuesToText, detectFormat, findDuplicateTranscript, formatTimestamp, parseTimestamp, parseTranscript, transcriptStats } from '../src/transcript.ts';
import { sentenceCandidates, transcriptPassage, transcriptSentenceRecord } from '../src/inputHandoff.ts';
const NOW = new Date(2026, 9, 21, 10, 0, 0).getTime();
/** 断言 ok 并返回成功分支（避免 SessionResult 联合类型在每个断言里重复收窄） */
function must<T extends {
    ok: boolean;
}>(r: T): Extract<T, {
    ok: true;
}> {
    if (!r.ok)
        throw new Error(`expected ok, got ${JSON.stringify(r)}`);
    return r as Extract<T, {
        ok: true;
    }>;
}
function src(over: Partial<Parameters<typeof createInputSource>[0]> = {}): InputSource {
    const r = createInputSource({ title: 'Rome: Engineering an Empire', url: 'https://www.youtube.com/watch?v=abc123XYZ_-', topic: 'roman history', durationMinutes: 42, now: NOW, ...over });
    assert.equal(r.ok, true, JSON.stringify(r));
    return (r as {
        ok: true;
        source: InputSource;
    }).source;
}
const SRT = `1
00:00:01,000 --> 00:00:03,500
The aqueducts carried water into the city.

2
00:00:03,500 --> 00:00:06,000
Some of them are still standing today.

3
01:02:03,250 --> 01:02:05,000
Even the engineers were surprised by that.
`;
const VTT = `WEBVTT

NOTE this is a comment

cue-1
00:00:01.000 --> 00:00:04.000 align:start position:0%
The aqueducts carried water into the city.

cue-2
00:00:04.000 --> 00:00:07.500
Some of them are still standing today.
`;
// ————— URL / Source —————
test('URL：YouTube 各种写法被规范化成同一个地址', () => {
    for (const raw of ['https://youtu.be/abc123XYZ_-?si=track', 'https://www.youtube.com/shorts/abc123XYZ_-', 'youtube.com/watch?v=abc123XYZ_-&utm_source=x']) {
        const p = parseInputUrl(raw);
        assert.equal(p.ok, true, raw);
        if (p.ok) {
            assert.equal(p.provider, 'youtube');
            assert.equal(p.videoId, 'abc123XYZ_-');
            assert.equal(p.normalizedUrl, 'https://www.youtube.com/watch?v=abc123XYZ_-');
        }
    }
});
test('URL：Bilibili / 通用网页 / 无效地址 / 不安全协议', () => {
    const b = parseInputUrl('https://www.bilibili.com/video/BV1xx411c7mD?spm_id_from=333.999');
    assert.ok(b.ok && b.provider === 'bilibili' && b.videoId === 'BV1xx411c7mD');
    const w = parseInputUrl('https://example.com/article/story?utm_campaign=z');
    assert.ok(w.ok && w.provider === 'web' && !w.url.includes('utm'));
    assert.equal(parseInputUrl('not a url').ok, false);
    assert.equal(parseInputUrl('javascript:alert(1)').ok, false);
    assert.equal(parseInputUrl('data:text/html,<b>x</b>').ok, false);
    assert.equal(parseInputUrl('https://user:pass@example.com/a').ok, false);
    assert.equal(parseInputUrl('').ok, false);
});
test('URL：安全打开只允许 http/https（无凭据）', () => {
    assert.equal(isSafeExternalUrl('https://www.youtube.com/watch?v=abc123XYZ_-'), true);
    assert.equal(isSafeExternalUrl('javascript:alert(1)'), false);
    assert.equal(isSafeExternalUrl('file:///C:/secret.txt'), false);
    assert.equal(providerLabel('bilibili'), 'Bilibili');
    assert.equal(contentTypeOf('web'), 'article');
});
test('Source：创建时 metadata 诚实（unverified / 无难度估计）', () => {
    const s = src();
    assert.equal(s.verificationStatus, 'unverified');
    assert.equal(s.difficultyEstimate, null);
    assert.equal(s.difficultyBasis, 'none');
    assert.equal(s.provenance, 'user_supplied');
    assert.equal(s.subtitleStatus, 'unknown');
    assert.equal(s.provider, 'youtube');
    assert.equal(s.contentType, 'youtube');
    assert.equal(isAvailable(s), true);
});
test('Source：同一地址重复添加被拒绝并指向已有材料', () => {
    const a = src();
    const dup = createInputSource({ title: '另一个标题', url: 'https://youtu.be/abc123XYZ_-', topic: 'history', now: NOW }, [a]);
    assert.equal(dup.ok, false);
    if (!dup.ok) {
        assert.equal(dup.code, 'duplicate');
        assert.equal(dup.existingId, a.id);
    }
    assert.equal(sameInputTarget(a, { url: 'https://www.youtube.com/watch?v=abc123XYZ_-&t=10' }), true);
});
test('Source：缺标题/主题、危险链接、超长时长都被拒绝', () => {
    assert.equal(createInputSource({ title: '', url: 'https://example.com/a', topic: 'x' }).ok, false);
    assert.equal(createInputSource({ title: 'a', url: 'https://example.com/a', topic: '' }).ok, false);
    assert.equal(createInputSource({ title: 'a', url: 'javascript:alert(1)', topic: 'x' }).ok, false);
    assert.equal(createInputSource({ title: 'a', url: 'https://example.com/a', topic: 'x', durationMinutes: 9999 }).ok, false);
});
test('Source：没有 transcript 依据不能写难度估计', () => {
    const s = src();
    const bad = updateInputSource(s, { difficultyEstimate: 0.5 }, NOW + 1);
    assert.equal(bad.ok, false);
    const good = updateInputSource(s, { difficultyEstimate: 0.5, difficultyBasis: 'transcript' }, NOW + 1);
    assert.ok(good.ok && good.source.difficultyEstimate === 0.5 && good.source.difficultyBasis === 'transcript');
});
test('Source：可改标题/主题/备注，但不改 URL 归属', () => {
    const s = src();
    const r = updateInputSource(s, { title: '  New title  ', topic: 'history', notes: 'x'.repeat(900) }, NOW + 5);
    assert.ok(r.ok);
    assert.equal(r.source.title, 'New title');
    assert.equal((r.source.notes ?? '').length, 500);
    assert.equal(r.source.url, s.url);
});
// ————— Library —————
test('Library：保存幂等，归档后再次保存回到 saved', () => {
    const s = src();
    const a = saveToLibrary([], s, NOW);
    assert.equal(a.created, true);
    assert.equal(a.items.length, 1);
    const b = saveToLibrary(a.items, s, NOW + 10);
    assert.equal(b.created, false);
    assert.equal(b.items.length, 1);
    const archived = setLibraryStatus(b.items, b.item.id, 'archived');
    const c = saveToLibrary(archived, s, NOW + 20);
    assert.equal(c.item.status, 'saved');
});
test('Library：搜索、主题筛选、时长与字幕筛选、完成度、Mini Unit 关联', () => {
    const s1 = src();
    const s2 = src({ title: 'Esports final', url: 'https://www.bilibili.com/video/BV1xx411c7mD', topic: 'cs2 esports', durationMinutes: 90 });
    let items = saveToLibrary([], s1, NOW).items;
    items = saveToLibrary(items, s2, NOW).items;
    assert.equal(filterLibrary(items, { search: 'esports' }).length, 1);
    assert.equal(filterLibrary(items, { topic: 'roman' }).length, 1);
    assert.equal(filterLibrary(items, { maxMinutes: 50 }).length, 1);
    assert.equal(filterLibrary(items, { captions: 'unknown' }).length, 2);
    items = setLibraryCompletion(items, items[0].id, 0.5, NOW);
    assert.equal(filterLibrary(items, { completion: 'partial' }).length, 1);
    items = linkLibraryToUnit(items, items[0].id, 'u1', NOW);
    assert.equal(filterLibrary(items, { miniUnitId: 'u1' }).length, 1);
    assert.equal(libraryStats(items).total, 2);
});
test('Library：打开记录、删除不影响其它条目', () => {
    const s = src();
    let items = saveToLibrary([], s, NOW).items;
    items = markOpened(items, items[0].id, NOW + 100);
    assert.equal(items[0].lastOpenedAt, NOW + 100);
    const after = deleteLibraryItem(items, items[0].id);
    assert.equal(after.length, 0);
    assert.equal(libraryItemFromSource(s).topic, s.topic);
});
// ————— Session —————
function session() {
    const s = src();
    return { source: s, session: must(createInputSession({ source: s, mode: 'standard', plannedMinutes: 20, now: NOW })).session };
}
test('Session：create → start → pause → resume → reflection → complete', () => {
    const { session: s0 } = session();
    assert.equal(s0.status, 'created');
    const started = must(startInputSession(s0, { now: NOW + 1 }));
    assert.equal(started.session.status, 'active');
    const paused = must(pauseInputSession(started.session, { now: NOW + 2 }));
    assert.equal(paused.session.status, 'paused');
    const resumed = must(resumeInputSession(paused.session, { now: NOW + 3 }));
    assert.equal(resumed.session.status, 'active');
    const refl = must(beginReflection(resumed.session, { now: NOW + 4 }));
    const sub = must(submitInputReflection(refl.session, { captionMode: 'en', comprehension: 0.7, difficultyReasons: ['speed'], summary: 'The video explains how Roman aqueducts worked. It shows why concrete mattered.', reportedWatchedMinutes: 18 }, { now: NOW + 5 }));
    assert.equal(sub.session.status, 'reflection');
    assert.equal(sub.session.watchedMinutes, 18);
    const done = must(completeInputSession(sub.session, { now: NOW + 6 }));
    assert.equal(done.session.status, 'completed');
    assert.equal((done.session.revision ?? 0) > 1, true);
});
test('Session：非法转换被拒绝（created 不能直接 complete，completed 不能再 pause）', () => {
    const { session: s0 } = session();
    const bad = completeInputSession(s0, { now: NOW });
    assert.equal(bad.ok, false);
    if (!bad.ok)
        assert.equal(bad.code, 'illegal-transition');
    const active = must(startInputSession(s0, { now: NOW })).session;
    const done = completeInputSession({ ...active, status: 'reflection', reflection: { mode: 'light', captionMode: 'none', comprehension: null, difficultyReasons: [], notes: '', completion: 0.4, savedAt: NOW } }, { now: NOW });
    assert.ok(done.ok);
    const again = pauseInputSession(done.session, { now: NOW + 1 });
    assert.equal(again.ok, false);
});
test('Session：重复完成是幂等 noop，不重复写时长', () => {
    const { session: s0 } = session();
    const s1 = must(startInputSession(s0, { now: NOW })).session;
    const s2 = must(submitInputReflection(s1, { mode: 'light', captionMode: 'none', comprehension: 0.5, notes: 'x' }, { now: NOW + 1 })).session;
    const done = must(completeInputSession(s2, { now: NOW + 2 }));
    const twice = must(completeInputSession(done.session, { now: NOW + 3 }));
    assert.equal(twice.noop, true);
    assert.equal(twice.session.revision, done.session.revision);
    assert.equal(twice.session.watchedMinutes, done.session.watchedMinutes);
});
test('Session：revision 冲突被拒绝（两个标签页）', () => {
    const { session: s0 } = session();
    const s1 = must(startInputSession(s0, { now: NOW })).session;
    const stale = pauseInputSession(s1, { expectedRevision: 1, now: NOW + 1 });
    assert.equal(stale.ok, false);
    if (!stale.ok)
        assert.equal(stale.code, 'stale');
    const ok = pauseInputSession(s1, { expectedRevision: s1.revision, now: NOW + 1 });
    assert.ok(ok.ok);
});
test('Session：允许只看片段（计划分钟数小于视频时长），放弃后可重新开始', () => {
    const s = src({ durationMinutes: 40 });
    const plan = planInputMinutes({ availableMinutes: 12, durationMinutes: 40, mode: 'standard' });
    assert.ok(plan.watchMinutes <= 12 && plan.watchMinutes >= 1);
    const created = must(createInputSession({ source: s, mode: 'standard', plannedMinutes: plan.watchMinutes, now: NOW }));
    const abandoned = must(abandonInputSession(created.session, { now: NOW + 1 }));
    assert.equal(abandoned.session.status, 'abandoned');
    const restart = must(abandonInputSession(abandoned.session, { now: NOW + 2 }));
    assert.equal(restart.noop, true);
});
test('Session：模式建议与合法状态表', () => {
    assert.equal(suggestMode({ energy: 'low' }), 'light');
    assert.equal(suggestMode({ energy: 'normal' }), 'standard');
    assert.equal(suggestMode({ energy: 'good' }), 'deep');
    assert.equal(suggestMode({ energy: 'normal', unitDay: 3 }), 'deep');
    assert.equal(canTransition('created', 'active'), true);
    assert.equal(canTransition('completed', 'active'), false);
});
// ————— Reflection —————
test('Reflection：Light 只给有限完成度，不要求写总结', () => {
    const r = validateReflection({ mode: 'light', captionMode: 'en', comprehension: 0.6, notes: 'ok', now: NOW });
    assert.ok(r.ok);
    assert.ok(r.reflection.completion <= REFLECTION_SPECS.light.completionCap);
    assert.equal(r.reflection.summary, undefined);
});
test('Reflection：Standard 必须 3–5 句总结，原文保存，不做内容评分', () => {
    const bad = validateReflection({ mode: 'standard', captionMode: 'en', comprehension: 0.7, summary: 'Too short.' });
    assert.equal(bad.ok, false);
    const good = validateReflection({ mode: 'standard', captionMode: 'en', comprehension: 0.7, summary: 'The video explains aqueducts. It shows how concrete helped. The narrator visits three sites.' });
    assert.ok(good.ok);
    assert.equal(good.reflection.summary, 'The video explains aqueducts. It shows how concrete helped. The narrator visits three sites.');
});
test('Reflection：Deep 允许跳过部分项目，但完成度反映缺口', () => {
    const partial = validateReflection({ mode: 'deep', captionMode: 'none', comprehension: 0.8, mainIdea: 'Roman engineering', keyPoints: ['a', 'b'] });
    assert.ok(partial.ok);
    const full = validateReflection({ mode: 'deep', captionMode: 'none', comprehension: 0.8, mainIdea: 'Roman engineering', keyPoints: ['a', 'b', 'c'], opinion: 'I liked it', retelling: 'They built aqueducts.' });
    assert.ok(full.ok);
    assert.ok(full.reflection.completion > partial.reflection.completion);
    const empty = validateReflection({ mode: 'deep', captionMode: 'none', comprehension: 0.8 });
    assert.equal(empty.ok, false);
});
test('Reflection：字幕模式与难度原因口径', () => {
    const r = validateReflection({ mode: 'light', captionMode: 'zh', comprehension: 0.9, difficultyReasons: ['vocabulary', 'bogus'] });
    assert.equal(r.ok, false);
    const ok = validateReflection({ mode: 'light', captionMode: 'zh', comprehension: 0.9, difficultyReasons: [...DIFFICULTY_REASONS] });
    assert.ok(ok.ok);
    assert.equal(ok.reflection.captionMode, 'zh');
    assert.match(captionCaveat('zh'), /不能当作英语听力能力证据/);
});
// ————— Transcript —————
test('Transcript：SRT 解析（含跨小时、毫秒、多行文本）', () => {
    const r = parseTranscript({ raw: SRT, sourceId: 's1', provenance: 'user_supplied', now: NOW });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.transcript.cues.length, 3);
    assert.equal(r.transcript.cues[0].startMs, 1000);
    assert.equal(r.transcript.cues[2].startMs, 3723250);
    assert.equal(r.transcript.timed, true);
    assert.equal(r.transcript.provenance, 'user_supplied');
    assert.equal(formatTimestamp(3723250), '01:02:03,250');
    assert.equal(parseTimestamp('01:02:03.250'), 3723250);
});
test('Transcript：VTT 解析（WEBVTT 头、NOTE、cue 设置）', () => {
    const r = parseTranscript({ raw: VTT, sourceId: 's1', format: 'vtt', now: NOW });
    assert.ok(r.ok, JSON.stringify(r));
    assert.equal(r.transcript.cues.length, 2);
    assert.equal(r.transcript.cues[1].endMs, 7500);
    assert.equal(detectFormat(VTT), 'vtt');
    assert.equal(detectFormat(SRT), 'srt');
});
test('Transcript：TXT 没有时间轴（timed=false），不能冒充字幕时间轴', () => {
    const r = parseTranscript({ raw: 'The aqueducts carried water.\nSome are still standing.', format: 'txt', now: NOW });
    assert.ok(r.ok);
    assert.equal(r.transcript.timed, false);
    assert.equal(r.transcript.cues[0].startMs, 0);
});
test('Transcript：非法时间戳 / 结束早于开始 / 空字幕被明确拒绝', () => {
    const bad = parseTranscript({ raw: '1\n00:00:01,000 --> 00:00:0X,500\nhello\n', format: 'srt' });
    assert.equal(bad.ok, false);
    if (!bad.ok)
        assert.equal(bad.code, 'invalid-timestamp');
    const reversed = parseTranscript({ raw: '1\n00:00:05,000 --> 00:00:02,000\nhello\n', format: 'srt' });
    assert.equal(reversed.ok, false);
    const empty = parseTranscript({ raw: '1\n00:00:01,000 --> 00:00:02,000\n\n', format: 'srt' });
    assert.equal(empty.ok, false);
    assert.equal(parseTranscript({ raw: '   ' }).ok, false);
});
test('Transcript：重叠保留原时间并警告，重复条合并', () => {
    const raw = `1
00:00:01,000 --> 00:00:05,000
first line

2
00:00:04,000 --> 00:00:07,000
second line

3
00:00:04,000 --> 00:00:07,000
second line
`;
    const r = parseTranscript({ raw, format: 'srt' });
    assert.ok(r.ok);
    assert.equal(r.transcript.cues.length, 2);
    assert.ok(r.warnings.some(w => /重叠/.test(w)));
    assert.ok(r.warnings.some(w => /重复/.test(w)));
});
test('Transcript：provenance 不会被升级，重复导入可识别', () => {
    const a = parseTranscript({ raw: SRT, sourceId: 's1', provenance: 'machine_generated_unverified', now: NOW });
    assert.ok(a.ok);
    assert.equal(a.transcript.provenance, 'machine_generated_unverified');
    const b = parseTranscript({ raw: SRT, sourceId: 's1', provenance: 'machine_generated_unverified', now: NOW + 1 });
    assert.ok(b.ok);
    assert.ok(findDuplicateTranscript([a.transcript], { sourceId: 's1', hash: b.transcript.hash }));
    assert.equal(findDuplicateTranscript([a.transcript], { sourceId: 's2', hash: b.transcript.hash }), null);
});
test('Transcript：统计与文本抽取（时间范围）', () => {
    const r = parseTranscript({ raw: SRT, format: 'srt' });
    assert.ok(r.ok);
    const stats = transcriptStats(r.transcript);
    assert.equal(stats.cues, 3);
    assert.ok(stats.characters > 50);
    assert.ok(stats.durationMinutes >= 60);
    const part = cuesToText(r.transcript.cues, { startMs: 0, endMs: 4000 });
    assert.match(part, /aqueducts/);
    assert.doesNotMatch(part, /engineers/);
});
test('Transcript → Reading：保留 inputSource / transcript / 时间范围 / provenance', () => {
    const s = src();
    const r = parseTranscript({ raw: SRT, sourceId: s.id, provenance: 'user_supplied', now: NOW });
    assert.ok(r.ok);
    const p = transcriptPassage(r.transcript, s, { now: NOW });
    assert.ok(p.ok, JSON.stringify(p));
    assert.equal(p.value.sourceType, 'library_item');
    assert.equal(p.value.sourceUrl, s.url);
    assert.equal(p.value.sourceMetadata?.inputSourceId, s.id);
    assert.equal(p.value.sourceMetadata?.transcriptId, r.transcript.id);
    assert.equal(p.value.sourceReliability, 'user_provided');
});
test('Transcript → Reading：中文字幕不能当作英语原声转录', () => {
    const s = src();
    const r = parseTranscript({ raw: SRT, sourceId: s.id, language: 'zh', provenance: 'user_supplied' });
    assert.ok(r.ok);
    const p = transcriptPassage(r.transcript, s);
    assert.equal(p.ok, false);
});
test('Transcript → Sentence：候选句与记录都不伪造 gold 结构', () => {
    const s = src();
    const r = parseTranscript({ raw: SRT, sourceId: s.id, provenance: 'user_supplied' });
    assert.ok(r.ok);
    const p = transcriptPassage(r.transcript, s);
    assert.ok(p.ok);
    const cands = sentenceCandidates(r.transcript, { minWords: 5 });
    assert.ok(cands.length > 0);
    const { record, issues } = transcriptSentenceRecord({ passage: p.value, candidate: cands[0], now: NOW });
    assert.deepEqual(issues, []);
    assert.equal(record.structure, null);
    assert.equal(record.structureProvenance, 'none');
    assert.equal(record.sourceType, 'reading');
    assert.match(record.attribution, /passage/);
});
