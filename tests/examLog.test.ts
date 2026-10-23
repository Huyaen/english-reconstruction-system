import test from 'node:test';
import assert from 'node:assert/strict';
import { builtinSpecifications } from '../src/examSpecification.ts';
import { exportExamLogs, officialTotalForSpec, parseExamLogsExport, sanitizeExamLog, validateExamLogDraft, type ExamLogDraft } from '../src/examLog.ts';
import type { ExamLog } from '../src/examTypes.ts';
const specs = builtinSpecifications();
const spring = specs.find(s => s.id === 'spec-2026-spring-foreign-language')!;
const target2028 = specs.find(s => s.id === 'spec-2028-gaokao-foreign-language')!;
const NOW = Date.UTC(2026, 9, 23, 6, 0, 0);
function draft(over: Partial<ExamLogDraft> = {}): ExamLogDraft {
    return {
        date: '2026-10-23', examType: 'monthly_exam', name: '高三第一次月考',
        specId: spring.id, examCategory: spring.examCategory, applicableYear: spring.applicableYear,
        fullScore: 150, reportedScore: 102, selfAssessment: '阅读时间不够',
        conflictAcknowledged: false, ...over,
    };
}
test('官方确认规格：满分一致才按 official_total；不一致必须显式确认', () => {
    const ok = validateExamLogDraft(draft(), specs);
    assert.equal(ok.ok, true);
    assert.equal(ok.scoreBasis, 'official_total');
    assert.equal(ok.blockedConflict, false);
    const changed = validateExamLogDraft(draft({ fullScore: 120, reportedScore: 100 }), specs);
    assert.equal(changed.ok, false);
    assert.equal(changed.blockedConflict, true);
    assert.match(changed.errors.join(' '), /官方总分不一致|自定义计分/);
    const ack = validateExamLogDraft(draft({ fullScore: 120, reportedScore: 100, conflictAcknowledged: true }), specs);
    assert.equal(ack.ok, true);
    assert.equal(ack.scoreBasis, 'custom_total');
    assert.match(ack.warnings.join(' '), /120/);
});
test('provisional/unknown 规格不得预填或冒充官方满分', () => {
    assert.equal(target2028.totalScore, null);
    assert.equal(officialTotalForSpec(target2028), null);
    const v = validateExamLogDraft(draft({ specId: target2028.id, examCategory: target2028.examCategory, applicableYear: target2028.applicableYear, fullScore: 100, reportedScore: 88 }), specs);
    assert.equal(v.ok, true);
    assert.equal(v.scoreBasis, 'custom_total');
    assert.match(v.warnings.join(' '), /未知|待确认/);
    assert.doesNotMatch(v.warnings.join(' '), /官方已确认总分/);
});
test('类别/年份必须与绑定规格一致', () => {
    const v = validateExamLogDraft(draft({ examCategory: 'other' }), specs);
    assert.equal(v.ok, false);
    assert.match(v.errors.join(' '), /类别.*不一致/);
    const y = validateExamLogDraft(draft({ applicableYear: 2028 }), specs);
    assert.equal(y.ok, false);
    assert.match(y.errors.join(' '), /年份.*不一致/);
});
test('自定义考试允许实际满分，但必须有名称和年份；得分始终 0..满分', () => {
    const custom = validateExamLogDraft(draft({ examType: 'custom', specId: '', examCategory: 'other', applicableYear: 2026, fullScore: 120, reportedScore: 88, name: '校内自编卷' }), specs);
    assert.equal(custom.ok, true);
    assert.equal(custom.scoreBasis, 'custom_total');
    assert.match(custom.warnings.join(' '), /未绑定|实际/);
    const noName = validateExamLogDraft(draft({ examType: 'custom', specId: '', examCategory: 'other', applicableYear: 2026, fullScore: 120, name: '  ' }), specs);
    assert.equal(noName.ok, false);
    const noYear = validateExamLogDraft(draft({ examType: 'custom', specId: '', examCategory: 'other', applicableYear: null, fullScore: 120 }), specs);
    assert.equal(noYear.ok, false);
    for (const score of [-1, 121, 151]) {
        const bad = validateExamLogDraft(draft({ fullScore: 120, reportedScore: score, conflictAcknowledged: true }), specs);
        assert.equal(bad.ok, false, `score ${score}`);
        assert.match(bad.errors.join(' '), /0 ≤ 得分 ≤ 满分/);
    }
});
test('写入/导入闸门强制 self_reported 来源与线索标记，拒绝越界分数', () => {
    const raw: ExamLog = {
        id: 'log-x', date: '2026-10-23', name: '月考', examName: '高三第一次月考', examType: 'monthly_exam',
        examCategory: spring.examCategory, specId: spring.id, applicableYear: 2026,
        fullScore: 150, reportedScore: 102, sectionResults: [], errorTypes: ['vocabulary'], selfAssessment: '阅读时间不够',
        source: 'official', scoreSource: 'self_reported', scoreBasis: 'custom_total', clueOnly: false, createdAt: NOW, updatedAt: NOW,
    };
    const r = sanitizeExamLog(raw, specs);
    assert.equal(r.ok, true);
    if (!r.ok)
        return;
    assert.equal(r.log.source, 'self_report');
    assert.equal(r.log.scoreSource, 'self_reported');
    assert.equal(r.log.clueOnly, true);
    assert.deepEqual(r.log.errorTypes, []);
    assert.equal(r.log.scoreBasis, 'official_total');
    assert.equal(r.log.examType, 'monthly_exam');
    assert.equal(r.log.applicableYear, 2026);
    assert.equal(sanitizeExamLog({ ...raw, reportedScore: 151 }, specs).ok, false);
    assert.equal(sanitizeExamLog({ ...raw, fullScore: 0 }, specs).ok, false);
});
test('导出/导入保持类别、年份、满分、类型与来源', () => {
    const log = sanitizeExamLog({
        id: 'log-e', date: '2026-10-23', name: '模拟考', examName: '区模拟考', examType: 'mock_exam',
        examCategory: target2028.examCategory, specId: target2028.id, applicableYear: 2028,
        fullScore: 120, reportedScore: 90, sectionResults: [], errorTypes: [], selfAssessment: '时间不够',
        source: 'self_report', scoreSource: 'self_reported', scoreBasis: 'custom_total', clueOnly: true, createdAt: NOW,
    }, specs);
    assert.equal(log.ok, true);
    if (!log.ok)
        return;
    const text = JSON.stringify(exportExamLogs([log.log]));
    const parsed = parseExamLogsExport(text, specs);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.errors.length, 0);
    const got = parsed.logs[0];
    assert.equal(got.examType, 'mock_exam');
    assert.equal(got.examCategory, target2028.examCategory);
    assert.equal(got.applicableYear, 2028);
    assert.equal(got.fullScore, 120);
    assert.equal(got.reportedScore, 90);
    assert.equal(got.scoreSource, 'self_reported');
    assert.equal(got.clueOnly, true);
    assert.equal(parseExamLogsExport('{}', specs).ok, false);
});
