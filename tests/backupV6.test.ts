import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backup, emptyData, validateBackup, DB_VERSION } from '../src/db.ts';
// 真实缺陷回归：validateBackup 曾用 `[a-zA-Z0-9_-]` 校验 model store 的 id，
// 而句库的默认 id（sen.curated.*）含 "."、输入证据的幂等键含 ":"，
// 导致「自己导出的备份自己恢复不了」。这里锁住两条路径。
test('默认句库 id（含点）能通过备份校验', () => {
    const d = emptyData();
    d.sentences.push({
        id: 'sen.curated.adverbial-01',
        text: 'Although it rained they continued the work.',
        zh: '尽管下雨，他们还是继续了工作。',
        sourceType: 'curated',
        sourceId: 'curated-bank',
        attribution: 'authored',
        grammarTags: ['clause.adverbial'],
        targetWordIds: [],
        theme: '坚持',
        difficulty: 3,
        structure: null,
        structureProvenance: 'none',
        createdBy: 'system',
        createdAt: Date.now(),
        usedCount: 0,
        lastUsedAt: 0,
        notes: '',
    });
    const restored = validateBackup(JSON.parse(backup(d)));
    assert.equal(restored.sentences.length, 1);
    assert.equal(restored.sentences[0]!.id, 'sen.curated.adverbial-01');
});
test('输入证据 id（含冒号）能通过备份校验，且旧库版本仍被拒绝', () => {
    const d = emptyData();
    d.inputEvidence.push({
        id: 'ins_abc123:watched',
        sessionId: 'ins_abc123',
        sourceId: 'src_abc123',
        evidenceType: 'watching_exposure',
        at: Date.now(),
        confidence: 0.4,
        provenance: 'user_supplied',
        meta: { minutes: 12 },
    });
    const restored = validateBackup(JSON.parse(backup(d)));
    assert.equal(restored.inputEvidence.length, 1);
    assert.equal(restored.inputEvidence[0]!.id, 'ins_abc123:watched');
    const bad = { format: 'vocabulary-memory', version: DB_VERSION + 1, data: d };
    assert.throws(() => validateBackup(bad), /备份结构无效/);
});
