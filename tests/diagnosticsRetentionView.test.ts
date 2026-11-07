import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyData } from '../src/db.ts';
import { buildDiagnostics } from '../src/diagnosticsInsight.ts';
import { diagnosticsPage } from '../src/diagnosticsView.ts';

const now = new Date(2026, 10, 7, 12).getTime();
const data = emptyData();
const payload = buildDiagnostics(data, { now, days: 7 });
const point = {
    label: 'D7', mode: 'recognition', fromDay: 6, toDay: 8,
    correct: 4, denominator: 5, validAttempts: 8, uniqueWords: 5,
    eligibleWords: 12, minSample: 5, rate: 0.8, evaluable: true,
} as const;

test('实时报告展示分维度实测保持率、观察窗口和真实分母', () => {
    const html = diagnosticsPage({ data, payload, days: 7, generatedAt: null, source: 'live', observedRetention: {
        points: [point, { ...point, mode: 'spelling', correct: 1, denominator: 1, validAttempts: 1, uniqueWords: 1, rate: null, evaluable: false },
            { ...point, mode: 'cloze', correct: 0, denominator: 0, validAttempts: 0, uniqueWords: 0, rate: null, evaluable: false }], notes: ['历史选择题辅助行为不可识别'],
    } });
    assert.match(html, /id="diag-observed-retention"/);
    for (const text of ['选择题识别', '非辅助拼写回忆', '原句语境回忆', '第 6–8 天', '80%', '4 / 5', '有效作答 8 次', '独立词 5 个', '样本不足', '无有效复习', '历史选择题辅助行为不可识别']) assert.ok(html.includes(text), text);
    assert.doesNotMatch(html.match(/id="diag-observed-retention"[\s\S]*?<\/section>/)?.[0] ?? '', />0%/);
});

test('历史快照保留旧口径，不用当前数据回填历史新统计', () => {
    const html = diagnosticsPage({ data, payload, days: 7, generatedAt: now, source: 'snapshot' });
    assert.match(html, /旧版保持率/);
    assert.match(html, /24 小时/);
    assert.doesNotMatch(html, /id="diag-observed-retention"/);
});
