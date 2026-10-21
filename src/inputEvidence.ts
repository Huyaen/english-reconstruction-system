// —— Phase 8：输入证据与统计 ——
// 纪律（与 Phase 5/7 一致）：
//  * 观看时长只有自报，属于 exposure，不是掌握；
//  * 自评不是验证，confidence 随模式变化但永远 < 1；
//  * 证据幂等：id = sessionId:type，重复完成不重复写；
//  * 不产生任何“听力分数”，只产生可解释的记录。
import type { Data, InputEvidenceRecord, InputEvidenceType, InputSession, ReadingSession } from './types.ts';
import { REFLECTION_SPECS } from './inputReflection.ts';
export function evidenceId(sessionId: string, type: InputEvidenceType): string {
    return `${sessionId}:${type}`;
}
export function sessionEvidence(session: InputSession, now = Date.now()): InputEvidenceRecord[] {
    if (session.status !== 'completed' || !session.reflection)
        return [];
    const mode = session.reflection.mode;
    const spec = REFLECTION_SPECS[mode];
    const out: InputEvidenceRecord[] = [];
    const reported = session.reportedWatchedMinutes ?? session.watchedMinutes ?? 0;
    if (reported > 0) {
        out.push({
            id: evidenceId(session.id, 'watching_exposure'), sourceId: session.sourceId, sessionId: session.id,
            evidenceType: 'watching_exposure', at: session.completedAt ?? now, confidence: 0.2,
            provenance: 'user_supplied',
            meta: { reportedWatchedMinutes: reported, basis: 'self_report', note: '观看曝光，不等于理解或掌握' },
        });
    }
    out.push({
        id: evidenceId(session.id, 'self_report'), sourceId: session.sourceId, sessionId: session.id,
        evidenceType: 'self_report', at: session.completedAt ?? now, confidence: spec.evidenceConfidence,
        provenance: 'user_supplied',
        meta: {
            mode, captionMode: session.reflection.captionMode, comprehension: session.reflection.comprehension,
            difficultyReasons: session.reflection.difficultyReasons, translationDependence: session.translationDependence ?? null,
            note: session.reflection.captionMode !== 'none' ? '字幕辅助下的自评，不能当作独立听力' : '无字幕自评仍是自报数据',
        },
    });
    const produced = !!(session.reflection.summary || session.reflection.retelling || session.reflection.mainIdea || (session.reflection.keyPoints ?? []).length);
    if (produced) {
        out.push({
            id: evidenceId(session.id, 'output_attempt'), sourceId: session.sourceId, sessionId: session.id,
            evidenceType: 'output_attempt', at: session.completedAt ?? now, confidence: 0.5, provenance: 'user_supplied',
            meta: { mode, hasSummary: !!session.reflection.summary, hasRetelling: !!session.reflection.retelling, hasMainIdea: !!session.reflection.mainIdea, note: '产出记录，未做内容事实评分' },
        });
    }
    return out;
}
export function mergeEvidence(existing: InputEvidenceRecord[], incoming: InputEvidenceRecord[]): {
    items: InputEvidenceRecord[];
    added: InputEvidenceRecord[];
} {
    const seen = new Set(existing.map(e => e.id));
    const added = incoming.filter(e => !seen.has(e.id));
    return { items: [...existing, ...added], added };
}
/** 某次输入产生的证据（按 id 幂等） */
export function evidenceForSession(all: InputEvidenceRecord[], sessionId: string): InputEvidenceRecord[] {
    return all.filter(e => e.sessionId === sessionId).sort((a, b) => a.at - b.at);
}
export function hasIndependentComprehension(all: InputEvidenceRecord[], sessionId: string): boolean {
    return all.some(e => e.sessionId === sessionId && e.evidenceType === 'independent_comprehension');
}
export function inputAnalytics(data: Data, now = Date.now()) {
    const sessions = data.inputSessions ?? [];
    const completed = sessions.filter(s => s.status === 'completed');
    const unfinished = sessions.filter(s => s.status !== 'completed' && s.status !== 'abandoned');
    const reportedMinutes = completed.reduce((n, s) => n + (s.reportedWatchedMinutes ?? 0), 0);
    const captions: Record<string, number> = {};
    for (const s of completed) {
        const mode = s.reflection?.captionMode ?? s.captionMode ?? 'none';
        captions[mode] = (captions[mode] ?? 0) + 1;
    }
    const reasons: Record<string, number> = {};
    for (const s of completed)
        for (const r of s.reflection?.difficultyReasons ?? [])
            reasons[r] = (reasons[r] ?? 0) + 1;
    const comprehensionSeries = completed
        .filter(s => s.reflection?.comprehension !== null && s.reflection?.comprehension !== undefined)
        .sort((a, b) => (a.completedAt ?? 0) - (b.completedAt ?? 0))
        .map(s => ({ at: s.completedAt ?? 0, value: s.reflection!.comprehension as number, mode: s.reflection!.mode }));
    const modeDistribution: Record<string, number> = {};
    for (const s of completed)
        modeDistribution[s.reflection?.mode ?? s.mode] = (modeDistribution[s.reflection?.mode ?? s.mode] ?? 0) + 1;
    const unitMinutes: Record<string, number> = {};
    for (const s of completed)
        if (s.miniUnitId)
            unitMinutes[s.miniUnitId] = (unitMinutes[s.miniUnitId] ?? 0) + (s.reportedWatchedMinutes ?? 0);
    const recentTopics = [...completed].sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)).slice(0, 5).map(s => s.topic);
    // 字幕阅读：只有真正关联到 inputSource 的阅读会话才算（不猜）
    const transcriptReading = (data.readingSessions ?? []).filter((r: ReadingSession) => {
        const p = (data.passages ?? []).find(x => x.id === r.passageId);
        return !!p?.sourceMetadata?.inputSourceId;
    }).length;
    return {
        totalSessions: sessions.length,
        completedSessions: completed.length,
        unfinishedSessions: unfinished.length,
        reportedMinutes,
        minutesLabel: `${reportedMinutes} 分钟（用户自报）`,
        captions, difficultyReasons: reasons, comprehensionSeries, modeDistribution, unitMinutes, recentTopics,
        transcriptReading,
        evidenceCount: (data.inputEvidence ?? []).length,
        note: '全部时长与理解度均为用户自报；观看与自评不构成掌握证据。',
    };
}
