import test from 'node:test';
import assert from 'node:assert/strict';
import { CURATED_ATTRIBUTION, curatedById, curatedSentenceRecords, curatedSpecs, effectiveSourceMix, ensureCuratedSentences, generationUnavailableReason, handoffToSentenceRecord, sentenceGenerationFallback, SOURCE_LABELS, sourceCapabilities, TARGET_SOURCE_MIX, userSentenceRecord, validateGenerationRequest, validateGenerationResult, type SentenceGenerationRequest, } from '../src/sentenceSources.ts';
import { validateStructure } from '../src/sentenceStructure.ts';
const NOW = 1700000000000;
const POOL = curatedSentenceRecords(NOW);
test('人工教学句库：数量、来源标注、结构与唯一性', () => {
    assert.equal(POOL.length, 12);
    assert.equal(curatedSpecs().length, 12);
    assert.equal(new Set(POOL.map(s => s.id)).size, 12);
    assert.equal(new Set(POOL.map(s => s.text)).size, 12);
    for (const r of POOL) {
        assert.equal(r.sourceType, 'curated');
        assert.equal(r.createdBy, 'system');
        assert.equal(r.structureProvenance, 'gold');
        assert.ok(r.zh.length > 0);
        assert.ok(r.grammarTags.length > 0);
        assert.ok(r.attribution.includes('作者') || r.attribution.includes('authored'), '必须诚实标注 authored');
        assert.equal(validateStructure(r.structure).ok, true);
        assert.ok(r.difficulty >= 1 && r.difficulty <= 3);
    }
    // 归属说明改成了中文，但必须仍然说清两件事：作者写的、不是文章原句。
    // 这里断言语义而不是英文标记，删掉任何一句都会红。
    assert.ok(CURATED_ATTRIBUTION.includes('作者'), '必须承认是作者写的');
    assert.ok(/不是从文章|非文章/.test(CURATED_ATTRIBUTION), '必须说明不是文章原句');
    // 「非外部语料」这种说法已改成用户能懂的句子，语义断言：不得声称来自外部文章
    assert.ok(/不是从文章里摘|非外部/.test(CURATED_ATTRIBUTION), '不得暗示句子来自外部文章');
});
test('句库种子：只增不改，幂等，不覆盖用户句子', () => {
    const user = userSentenceRecord('The plan actually worked out well.', '这个计划最后确实成功了。', NOW).record;
    const first = ensureCuratedSentences([user], NOW);
    assert.equal(first.length, 13);
    assert.equal(first.filter(s => s.id === user.id).length, 1);
    const again = ensureCuratedSentences(first, NOW + 9999);
    assert.equal(again.length, 13);
    assert.deepEqual(again.find(s => s.id === user.id), user);
    // 已有 curated 记录（带使用统计）不得被重置
    const used = { ...curatedById('sen.curated.passive-01')!, usedCount: 7, lastUsedAt: NOW - 1000 };
    const merged = ensureCuratedSentences([used], NOW);
    assert.equal(merged.find(s => s.id === used.id)!.usedCount, 7);
    assert.equal(merged.find(s => s.id === used.id)!.lastUsedAt, used.lastUsedAt);
});
test('句源能力：AI 未配置时如实标记不可用；配比降级并说明原因', () => {
    const noAi = sourceCapabilities({ sentences: POOL, aiConfigured: false });
    assert.equal(noAi.find(c => c.type === 'ai')!.available, false);
    assert.equal(noAi.find(c => c.type === 'curated')!.available, true);
    assert.equal(noAi.find(c => c.type === 'curated')!.count, 12);
    assert.equal(noAi.find(c => c.type === 'real-material')!.available, false);
    assert.equal(noAi.find(c => c.type === 'reading')!.requires, 'phase5');
    const withAi = sourceCapabilities({ sentences: POOL, aiConfigured: true });
    assert.equal(withAi.find(c => c.type === 'ai')!.available, true);
    const degraded = effectiveSourceMix(noAi);
    assert.equal(degraded.degraded, true);
    assert.equal(degraded.mix.ai, 0);
    assert.ok(degraded.reasons.some(r => r.includes('ai-unavailable')));
    const total = Object.values(degraded.mix).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1) < 1e-6, `配比之和必须为 1，实际 ${total}`);
    const material = { ...POOL[0], id: 'sen.material.1', sourceType: 'real-material' as const, sourceId: 'mat-1', attribution: '真实材料' };
    const reading = { ...POOL[1], id: 'sen.reading.p1.0-20', sourceType: 'reading' as const, sourceId: 'p1', attribution: '阅读交接' };
    const partial = effectiveSourceMix(sourceCapabilities({ sentences: [...POOL, material], aiConfigured: true }));
    assert.equal(partial.mix.ai, TARGET_SOURCE_MIX.ai);
    assert.equal(partial.mix['real-material'], TARGET_SOURCE_MIX.real);
    assert.equal(partial.degraded, true, '阅读来源未注册时必须如实降级');
    assert.ok(partial.reasons.includes('reading-handoff-not-registered'));
    const full = effectiveSourceMix(sourceCapabilities({ sentences: [...POOL, material, reading], aiConfigured: true }));
    assert.equal(full.degraded, false);
    assert.equal(full.mix.ai, TARGET_SOURCE_MIX.ai);
    assert.equal(full.mix.user, TARGET_SOURCE_MIX.user);
    assert.ok(full.mix['real-material'] + full.mix.reading >= TARGET_SOURCE_MIX.real - 1e-9);
    assert.equal(Object.keys(SOURCE_LABELS).length, 6);
});
test('AI 生成契约：请求校验、结果校验、未上线时绝不伪造', () => {
    const req: SentenceGenerationRequest = {
        targetWords: ['abandon'], grammarTargets: ['clause.relative'], theme: '城市',
        userLevel: { vocabulary: 1, grammar: 2 }, targetDifficulty: 2, maxUnknownWords: 2,
        knownVocabularyCoverage: 0.9, promptVersion: 'p1',
    };
    assert.equal(validateGenerationRequest(req).ok, true);
    assert.equal(validateGenerationRequest({ ...req, targetWords: 'abandon' }).ok, false);
    assert.equal(validateGenerationRequest({ ...req, targetDifficulty: 4 }).ok, false);
    assert.equal(validateGenerationRequest({ ...req, maxUnknownWords: 9 }).ok, false);
    assert.equal(validateGenerationRequest({ ...req, promptVersion: '' }).ok, false);
    assert.equal(validateGenerationRequest(null).ok, false);
    const fallback = sentenceGenerationFallback(req, POOL);
    assert.equal(fallback.provider, 'none');
    assert.equal(fallback.sentences.length, 0, 'AI 未上线时不得返回任何"生成"句子');
    assert.ok(fallback.fallbackReason && fallback.fallbackReason.length > 0);
    assert.equal(validateGenerationResult(fallback, req).ok, true);
    const fake = { ...fallback, provider: 'ai', sentences: [{ text: 'A sentence here.', zh: '', grammarTags: ['clause.relative'], targetWords: [], theme: '' }] };
    assert.equal(validateGenerationResult(fake, req).ok, false);
    const mismatched = { requestId: 'r', provider: 'ai', sentences: [{ text: 'The man who came is here.', zh: '', grammarTags: ['clause.object'], targetWords: [], theme: '' }], provenance: { model: 'm', promptVersion: 'p1', generatedAt: NOW }, error: null, fallbackReason: null };
    assert.equal(validateGenerationResult(mismatched as never, req).ok, false, '生成句必须覆盖请求的语法目标');
    assert.ok(generationUnavailableReason(false).includes('不会伪造'));
});
test('用户句子入口：校验无效输入，valid 句带启发式结构标记', () => {
    const bad = userSentenceRecord('too short', '', NOW);
    assert.ok(bad.issues.length > 0);
    assert.equal(userSentenceRecord('', '', NOW).issues.length > 0, true);
    assert.equal(userSentenceRecord('x'.repeat(500), '', NOW).issues.length > 0, true);
    const { record, issues } = userSentenceRecord('The committee rejected the proposal after a long debate.', '委员会在长时间辩论后否决了提案。', NOW);
    assert.deepEqual(issues, []);
    assert.equal(record.sourceType, 'user');
    assert.equal(record.structureProvenance, 'heuristic');
    assert.ok(record.structure);
    assert.ok(record.id.startsWith('sen.user.'));
    // 同一句两次输入 → 同一 id（避免重复堆积）
    assert.equal(userSentenceRecord('The committee rejected the proposal after a long debate.', '', NOW + 1).record.id, record.id);
});
test('阅读交接契约：必须带出处，结构标记为未分析（Phase 5 才实现真实交接）', () => {
    const ok = handoffToSentenceRecord({ sentence: 'The evidence was dismissed by the court.', passageId: 'p-42', sourceSpan: [10, 60], unknownWords: [], userMarkedDifficulty: true, context: '法律' }, NOW);
    assert.deepEqual(ok.issues, []);
    assert.equal(ok.record.sourceType, 'reading');
    assert.equal(ok.record.sourceId, 'p-42');
    assert.equal(ok.record.structureProvenance, 'none');
    assert.equal(ok.record.structure, null);
    assert.equal(ok.record.difficulty, 3);
    const bad = handoffToSentenceRecord({ sentence: '', passageId: '', sourceSpan: [5, 1], unknownWords: [], userMarkedDifficulty: false, context: '' }, NOW);
    assert.ok(bad.issues.length >= 3);
});
