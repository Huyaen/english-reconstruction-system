// —— Phase 13：只读数据完整性审计 ——
// 原则：只报告，不修复、不迁移、不改变学习数据；孤儿引用记为 warning（旧备份可能本来就不完整），
// 结构性错误记为 error（重复 id、时间戳损坏、完成态缺证据）。报告必须显式区分两类。
import type { Data } from './types.ts';
import { dataStores, type DataStoreName } from './db.ts';
export type IntegritySeverity = 'error' | 'warning';
export interface IntegrityIssue {
    code: string;
    severity: IntegritySeverity;
    store: string;
    recordId: string;
    message: string;
}
export interface IntegrityReport {
    ok: boolean;
    errors: number;
    warnings: number;
    checkedRecords: number;
    checkedStores: number;
    issues: IntegrityIssue[];
    byStore: Record<string, {
        errors: number;
        warnings: number;
    }>;
}
const ID_RE = /^[a-zA-Z0-9._:-]{1,160}$/;
const TIMESTAMP_FIELDS: Partial<Record<DataStoreName, readonly string[]>> = {
    words: ['previewedAt', 'lastEncounteredAt'],
    records: ['at'],
    sessions: ['startedAt', 'endedAt'],
    wordExposures: ['at'],
    grammarConcepts: ['nextReviewAt'],
    grammarAttempts: ['at'],
    sentenceAttempts: ['at'],
    passages: ['createdAt'],
    readingSessions: ['at'],
    inputSources: ['createdAt'],
    inputSessions: ['startedAt', 'completedAt', 'at'],
    outputAttempts: ['createdAt', 'updatedAt'],
    dailyPlans: ['createdAt', 'completedAt', 'updatedAt'],
    miniUnits: ['startedAt', 'completedAt'],
    skillSnapshots: ['createdAt', 'at'],
    weeklyDiagnostics: ['createdAt', 'at'],
    libraryItems: ['savedAt'],
    transcripts: ['createdAt'],
    inputEvidence: ['at'],
    aiGenerations: ['createdAt'],
    examMaterials: ['createdAt'],
    examItems: ['createdAt'],
    examSessions: ['createdAt', 'completedAt'],
    examLogs: ['at', 'createdAt'],
};
function bag(d: Data): Record<string, unknown[]> {
    return d as unknown as Record<string, unknown[]>;
}
function idOf(x: unknown): string {
    return x && typeof x === 'object' && typeof (x as {
        id?: unknown;
    }).id === 'string'
        ? (x as {
            id: string;
        }).id
        : '';
}
/**
 * 审计当前 Data。纯函数、无时钟：同一输入永远得到同一报告，便于测试与快照。
 * 不检查“掌握是否正确”这类无法从数据本身证明的语义；只检查引用、结构、时间与完成证据。
 */
export function checkDataIntegrity(data: Data): IntegrityReport {
    const issues: IntegrityIssue[] = [];
    const byStore: Record<string, {
        errors: number;
        warnings: number;
    }> = {};
    let checkedRecords = 0;
    let checkedStores = 0;
    const add = (severity: IntegritySeverity, store: string, code: string, recordId: string, message: string) => {
        issues.push({ severity, store, code, recordId, message });
        byStore[store] ??= { errors: 0, warnings: 0 };
        byStore[store][severity === 'error' ? 'errors' : 'warnings']++;
    };
    const rows = bag(data);
    const ids = new Map<string, Set<string>>();
    for (const store of dataStores) {
        const list = rows[store];
        if (!Array.isArray(list)) {
            add('error', store, 'STORE_MISSING', '', '数据表缺失或不是数组。');
            continue;
        }
        checkedStores++;
        checkedRecords += list.length;
        const seen = new Set<string>();
        ids.set(store, seen);
        for (const record of list) {
            const id = idOf(record);
            if (!id || !ID_RE.test(id) || ['__proto__', 'constructor', 'prototype'].includes(id))
                add('error', store, 'INVALID_ID', id, '记录 id 缺失或格式非法。');
            else if (seen.has(id))
                add('error', store, 'DUPLICATE_ID', id, '同一数据表内 id 重复。');
            else
                seen.add(id);
            if (!record || typeof record !== 'object') {
                add('error', store, 'NOT_OBJECT', id, '记录不是对象。');
                continue;
            }
            const row = record as Record<string, unknown>;
            const rev = row.revision;
            if (rev !== undefined && (!Number.isInteger(rev) || (rev as number) < 0))
                add('error', store, 'BAD_REVISION', id, 'revision 必须是非负整数。');
            for (const field of TIMESTAMP_FIELDS[store] ?? []) {
                const value = row[field];
                if (value === undefined || value === null)
                    continue;
                if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
                    add('error', store, 'BAD_TIMESTAMP', id, `${field} 不是有效时间戳。`);
            }
        }
    }
    const exists = (store: DataStoreName, id: unknown): boolean => typeof id === 'string' && !!ids.get(store)?.has(id);
    const ref = (store: DataStoreName, record: unknown, field: string, target: DataStoreName, severity: IntegritySeverity = 'warning') => {
        const value = (record as Record<string, unknown>)[field];
        if (value === undefined || value === null || value === '')
            return;
        if (typeof value !== 'string' || !exists(target, value))
            add(severity, store, 'DANGLING_REF', idOf(record), `${field} 指向不存在的 ${target}。`);
    };
    // —— 旧核心引用：孤儿引用只报告为 warning；旧备份可能本来不完整，不据此判定数据损坏 ——
    for (const w of data.words ?? [])
        ref('words', w, 'bookId', 'books');
    for (const r of data.records ?? []) {
        ref('records', r, 'wordId', 'words');
        ref('records', r, 'sessionId', 'sessions');
    }
    for (const e of data.wordExposures ?? [])
        ref('wordExposures', e, 'wordId', 'words');
    for (const a of data.grammarAttempts ?? [])
        ref('grammarAttempts', a, 'conceptId', 'grammarConcepts');
    for (const s of data.readingSessions ?? [])
        ref('readingSessions', s, 'passageId', 'passages');
    for (const s of data.inputSessions ?? [])
        ref('inputSessions', s, 'sourceId', 'inputSources');
    for (const e of data.inputEvidence ?? []) {
        ref('inputEvidence', e, 'sessionId', 'inputSessions');
        ref('inputEvidence', e, 'sourceId', 'inputSources');
    }
    for (const t of data.transcripts ?? [])
        ref('transcripts', t, 'sourceId', 'inputSources');
    for (const u of data.miniUnits ?? []) {
        ref('miniUnits', u, 'anchorMaterialId', 'passages');
        for (const id of u.targetWords ?? [])
            if (!exists('words', id))
                add('warning', 'miniUnits', 'DANGLING_REF', u.id, `targetWords 包含不存在的词 ${id}。`);
    }
    for (const o of data.outputAttempts ?? []) {
        ref('outputAttempts', o, 'inputSessionId', 'inputSessions');
        ref('outputAttempts', o, 'readingSessionId', 'readingSessions');
    }
    for (const x of data.examSessions ?? []) {
        for (const id of x.itemIds ?? [])
            if (!exists('examItems', id))
                add('warning', 'examSessions', 'DANGLING_REF', x.id, `itemIds 包含不存在的题 ${id}。`);
    }
    for (const l of data.examLogs ?? [])
        ref('examLogs', l, 'specificationId', 'examSpecifications');
    for (const p of data.dailyPlans ?? []) {
        for (const t of p.initialPlan ?? []) {
            const refs = t.refs ?? [];
            if (t.module === 'vocabulary' || t.module === 'closing' || (!t.module && (t.kind ?? '').includes('recall')))
                for (const id of refs)
                    if (!exists('words', id))
                        add('warning', 'dailyPlans', 'DANGLING_REF', p.id, `任务的词目标不存在：${id}。`);
            if (t.module === 'reading' && refs[0] && !exists('passages', refs[0]))
                add('warning', 'dailyPlans', 'DANGLING_REF', p.id, `任务的文章目标不存在：${refs[0]}。`);
            if (t.module === 'input' && refs[0] && !exists('inputSources', refs[0]))
                add('warning', 'dailyPlans', 'DANGLING_REF', p.id, `任务的输入材料不存在：${refs[0]}。`);
        }
    }
    // —— 完成态必须有对应证据；否则页面会显示“完成”但无法复盘 ——
    for (const s of data.inputSessions ?? [])
        if (s.status === 'completed' && !s.reflection)
            add('error', 'inputSessions', 'DONE_WITHOUT_REFLECTION', s.id, '输入会话已完成但没有复盘记录。');
    for (const s of data.examSessions ?? [])
        if (s.status === 'completed' && !s.completedAt)
            add('error', 'examSessions', 'DONE_WITHOUT_TIME', s.id, '考试会话已完成但缺少完成时间。');
    for (const s of data.readingSessions ?? [])
        if (s.detail?.state === 'completed' && !s.detail?.firstPassEndedAt && !s.detail?.rereadEndedAt)
            add('error', 'readingSessions', 'DONE_WITHOUT_TIME', s.id, '阅读会话已完成但缺少首次/重读完成时间。');
    // —— 同一证据 key 重复会破坏幂等；只检查明确带 key 的阅读证据 ——
    for (const s of data.readingSessions ?? []) {
        const keys = new Set<string>();
        for (const e of s.detail?.evidence ?? []) {
            if (!e?.key)
                continue;
            if (keys.has(e.key))
                add('error', 'readingSessions', 'DUPLICATE_EVIDENCE_KEY', s.id, `阅读证据 key 重复：${e.key}。`);
            keys.add(e.key);
        }
    }
    const errors = issues.filter(x => x.severity === 'error').length;
    const warnings = issues.length - errors;
    return { ok: errors === 0, errors, warnings, checkedRecords, checkedStores, issues, byStore };
}
/** 对话框/日志用的一行摘要；问题明细仍由调用方逐条展示。 */
export function integritySummary(report: IntegrityReport): string {
    if (report.errors === 0 && report.warnings === 0)
        return `已检查 ${report.checkedStores} 张表、${report.checkedRecords} 条记录，未发现结构性问题。`;
    return `已检查 ${report.checkedStores} 张表、${report.checkedRecords} 条记录：${report.errors} 个错误，${report.warnings} 个警告。`;
}
