import test from 'node:test';
import assert from 'node:assert/strict';
import type { Data, DailyPlan, PlanItem } from '../src/types.ts';
import { completedTaskCount, nextOpenTask, taskEvidence, taskModule, taskTargetLabel, taskUnavailableReason } from '../src/taskExecutor.ts';
const NOW = 1700000000000;
function task(patch: Partial<PlanItem>): PlanItem {
    return { id: 't1', module: 'vocabulary', minutes: 5, status: 'started', note: '', refs: ['w1'], kind: 'due-review', startedAt: NOW, ...patch };
}
function data(patch: unknown): Data {
    return patch as Data;
}
test('任务模块归一化：未知 kind 绝不回退成词汇', () => {
    assert.equal(taskModule(task({ module: 'input', kind: 'input-session' })), 'input');
    assert.equal(taskModule(task({ module: 'reading', kind: 'reading-new' })), 'reading');
    assert.equal(taskModule(task({ module: '', kind: 'sentence-basic-structure' })), 'sentence');
    assert.equal(taskModule(task({ module: '', kind: 'output-task' })), 'output');
    assert.equal(taskModule(task({ module: '', kind: 'exam-practice' })), 'exam');
    assert.equal(taskModule(task({ module: '', kind: 'closing-recall' })), 'closing');
    assert.equal(taskModule(task({ module: '', kind: 'mystery-task' })), 'unsupported');
    assert.equal(taskUnavailableReason(task({ module: '', kind: 'mystery-task' }), data({}))?.includes('未知模块'), true);
});
test('任务目标描述按模块区分，不把阅读/输入/考试说成“N 个词”', () => {
    assert.equal(taskTargetLabel(task({ module: 'reading', kind: 'reading-new', refs: ['p1'] })), '1 篇文章');
    assert.equal(taskTargetLabel(task({ module: 'input', kind: 'input-session', refs: ['s1'] })), '1 份真实材料');
    assert.equal(taskTargetLabel(task({ module: 'output', kind: 'output-task', refs: ['o1'] })), '1 个表达任务');
    assert.equal(taskTargetLabel(task({ module: 'exam', kind: 'exam-practice', refs: ['e1'] })), '1 道题');
    assert.equal(taskTargetLabel(task({ module: 'sentence', kind: 'sentence-basic-structure', refs: ['s1', 's2'] })), '2 句');
});
test('完成必须有本次真实证据；无证据、旧证据、未完成会话都拒绝', () => {
    const base = data({
        records: [],
        wordExposures: [],
        sentenceAttempts: [],
        readingSessions: [],
        inputSessions: [],
        outputAttempts: [],
        examSessions: [],
    });
    assert.equal(taskEvidence(task({}), base, { planTaskId: 't1', startedAt: NOW, sessionId: 's1' }).ok, false);
    const old = data({ records: [{ id: 'r0', wordId: 'w1', sessionId: 's1', at: NOW - 1000, correct: true }] });
    assert.equal(taskEvidence(task({}), old, { planTaskId: 't1', startedAt: NOW, sessionId: 's1' }).ok, false);
    const fresh = data({ records: [{ id: 'r1', wordId: 'w1', sessionId: 's1', at: NOW + 1000, correct: true }] });
    assert.equal(taskEvidence(task({}), fresh, { planTaskId: 't1', startedAt: NOW, sessionId: 's1' }).ok, true);
});
test('阅读/输入/输出/考试的完成证据只看 completed 会话', () => {
    const readingTask = task({ module: 'reading', kind: 'reading-new', refs: ['p1'] });
    const reading = data({ readingSessions: [{ id: 'r1', passageId: 'p1', at: NOW, detail: { state: 'active' } }] });
    assert.equal(taskEvidence(readingTask, reading, { planTaskId: 't1', startedAt: NOW, sessionId: 'r1' }).ok, false);
    (reading.readingSessions as any)[0].detail = { state: 'completed' };
    assert.equal(taskEvidence(readingTask, reading, { planTaskId: 't1', startedAt: NOW, sessionId: 'r1' }).ok, true);
    const inputTask = task({ module: 'input', kind: 'input-session', refs: ['s1'] });
    const input = data({ inputSessions: [{ id: 'i1', sourceId: 's1', status: 'active', startedAt: NOW, completedAt: null, reflection: null }] });
    assert.equal(taskEvidence(inputTask, input, { planTaskId: 't1', startedAt: NOW, sessionId: 'i1' }).ok, false);
    (input.inputSessions as any)[0] = { ...input.inputSessions![0], status: 'completed', completedAt: NOW + 100, reflection: { summary: 'x' } };
    assert.equal(taskEvidence(inputTask, input, { planTaskId: 't1', startedAt: NOW, sessionId: 'i1' }).ok, true);
    const outputTask = task({ module: 'output', kind: 'output-task', refs: ['o1'] });
    const output = data({ outputAttempts: [{ id: 'o1', status: 'submitted', createdAt: NOW + 1, dailyPlanTaskId: 't1' }] });
    assert.equal(taskEvidence(outputTask, output, { planTaskId: 't1', startedAt: NOW }).ok, false);
    output.outputAttempts![0].status = 'completed';
    assert.equal(taskEvidence(outputTask, output, { planTaskId: 't1', startedAt: NOW }).ok, true);
    const examTask = task({ module: 'exam', kind: 'exam-practice', refs: ['e1'] });
    const exam = data({ examSessions: [{ id: 'x1', status: 'reviewed', createdAt: NOW + 1, dailyPlanTaskId: 't1', itemIds: ['e1'] }] });
    assert.equal(taskEvidence(examTask, exam, { planTaskId: 't1', startedAt: NOW }).ok, false);
    exam.examSessions![0].status = 'completed';
    assert.equal(taskEvidence(examTask, exam, { planTaskId: 't1', startedAt: NOW }).ok, true);
});
test('同一计划任务有多次历史记录时，取本次开始之后的最新已完成证据', () => {
    const outputTask = task({ module: 'output', kind: 'output-task', refs: ['o1'] });
    const oldOutput = data({ outputAttempts: [
            { id: 'old', status: 'completed', createdAt: NOW - 500, dailyPlanTaskId: 't1' },
            { id: 'new', status: 'completed', createdAt: NOW + 500, dailyPlanTaskId: 't1' },
        ] });
    assert.equal(taskEvidence(outputTask, oldOutput, { planTaskId: 't1', startedAt: NOW }).evidenceId, 'new');
    const examTask = task({ module: 'exam', kind: 'exam-practice', refs: ['e1'] });
    const oldExam = data({ examSessions: [
            { id: 'old', status: 'completed', createdAt: NOW - 500, dailyPlanTaskId: 't1', itemIds: ['e1'] },
            { id: 'new', status: 'completed', createdAt: NOW + 500, dailyPlanTaskId: 't1', itemIds: ['e1'] },
        ] });
    assert.equal(taskEvidence(examTask, oldExam, { planTaskId: 't1', startedAt: NOW }).evidenceId, 'new');
});
test('Preview 只认本次 exposure；句子只认本次 session attempt', () => {
    const preview = task({ kind: 'new-preview', refs: ['w1'] });
    const d = data({ wordExposures: [{ id: 'x1', wordId: 'w1', at: NOW + 1, sourceType: 'preview' }] });
    assert.equal(taskEvidence(preview, d, { planTaskId: 't1', startedAt: NOW }).ok, true);
    assert.equal(taskEvidence(preview, data({ wordExposures: [{ id: 'x2', wordId: 'w1', at: NOW - 1, sourceType: 'preview' }] }), { planTaskId: 't1', startedAt: NOW }).ok, false);
    const st = task({ module: 'sentence', kind: 'sentence-basic-structure', refs: ['s1'] });
    const attempts = data({ sentenceAttempts: [{ id: 'a1', sentenceId: 's1', sessionId: 'lab1', at: NOW + 1 }] });
    assert.equal(taskEvidence(st, attempts, { planTaskId: 't1', startedAt: NOW, sessionId: 'lab1' }).ok, true);
    assert.equal(taskEvidence(st, attempts, { planTaskId: 't1', startedAt: NOW, sessionId: 'other' }).ok, false);
});
test('nextOpenTask 优先恢复进行中任务；完成数只统计 done', () => {
    const plan = {
        initialPlan: [
            { id: 'a', status: 'pending' },
            { id: 'b', status: 'started' },
            { id: 'c', status: 'done' },
            { id: 'd', status: 'skipped' },
        ],
    } as DailyPlan;
    assert.equal(nextOpenTask(plan)?.id, 'b');
    assert.equal(completedTaskCount(plan), 1);
});
