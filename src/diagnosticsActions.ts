// —— Phase 10：生成/保存诊断 ——
// 所有生成都是确定性的；不因诊断结果自动改写学习权重或计划时长。
import type { Data, DiagnosticPayload, SkillSnapshot, WeeklyDiagnostic } from './types.ts';
import { buildDiagnostics, latestSnapshot, snapshotDate, weekStart, weeklySummary } from './diagnosticsInsight.ts';
import { findSnapshotByDate, findWeeklyByWeek, saveSkillSnapshot, saveWeeklyDiagnostic } from './diagnosticsStore.ts';
import { findMetric } from './diagnosticsCollect.ts';
function legacyFields(payload: DiagnosticPayload) {
    const v = (id: string) => findMetric(payload.metrics, id)?.value ?? null;
    return {
        stableVocabulary: Math.round(v('vocab.stable') ?? 0),
        d1Retention: v('vocab.retention.d1'),
        d7Retention: v('vocab.retention.d7'),
        d30Retention: v('vocab.retention.d30'),
        avgRetrievalMs: v('vocab.retrievalMs'),
        readingUnknownRate: v('reading.unknownRate'),
        readingSpeed: v('reading.speed'),
        sentenceParsing: v('grammar.sentenceStructure'),
        translationDependence: v('translation.mean'),
        captionedComprehension: v('input.captioned'),
        uncaptionedComprehension: v('input.uncaptioned'),
        outputSummary: {
            completed: v('output.completed'),
            independentShare: v('output.independentShare'),
            assistedShare: v('output.assistedShare'),
        },
    };
}
export function buildSnapshotRecord(data: Data, now: number, days = 7): SkillSnapshot {
    const previous = latestSnapshot(data.skillSnapshots);
    const payload = buildDiagnostics(data, { now, days, previous });
    const date = snapshotDate(now);
    const existing = data.skillSnapshots.find(s => s.date === date);
    return {
        id: existing?.id ?? `snap-${date}`,
        date,
        ...legacyFields(payload),
        createdAt: now,
        diagnostics: payload,
    };
}
export async function generateSnapshot(data: Data, now: number, days = 7): Promise<SkillSnapshot> {
    const snapshot = buildSnapshotRecord(data, now, days);
    await saveSkillSnapshot(snapshot);
    return snapshot;
}
export function buildWeeklyRecord(data: Data, now: number, days = 7): WeeklyDiagnostic {
    const previous = latestSnapshot(data.skillSnapshots);
    const payload = buildDiagnostics(data, { now, days, previous });
    const weekOf = snapshotDate(weekStart(now));
    const existing = data.weeklyDiagnostics.find(w => w.weekOf === weekOf);
    return {
        id: existing?.id ?? `week-${weekOf}`,
        weekOf,
        results: payload.metrics,
        summary: weeklySummary(payload),
        createdAt: now,
        diagnostics: payload,
    };
}
export async function generateWeekly(data: Data, now: number, days = 7): Promise<WeeklyDiagnostic> {
    const diag = buildWeeklyRecord(data, now, days);
    await saveWeeklyDiagnostic(diag);
    return diag;
}
/**
 * 应用启动时的“本周诊断”补齐：只补当前周、只写一次。
 * 不修改任何学习计划；计划动作由用户自己点开。
 */
export async function ensureWeeklyDiagnostic(data: Data, now: number): Promise<{
    created: boolean;
    weekly: WeeklyDiagnostic;
}> {
    const weekOf = snapshotDate(weekStart(now));
    const existingDb = await findWeeklyByWeek(weekOf);
    const existing = existingDb ?? data.weeklyDiagnostics.find(w => w.weekOf === weekOf);
    if (existing)
        return { created: false, weekly: existing };
    const weekly = buildWeeklyRecord(data, now);
    await saveWeeklyDiagnostic(weekly);
    return { created: true, weekly };
}
export async function snapshotForToday(data: Data, now: number): Promise<SkillSnapshot | undefined> {
    return (await findSnapshotByDate(snapshotDate(now))) ?? data.skillSnapshots.find(s => s.date === snapshotDate(now));
}
