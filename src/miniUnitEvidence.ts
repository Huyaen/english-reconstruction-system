// —— Phase 7：Mini Unit 证据汇总（只读真实记录，不做推断式“加分”）——
// 证据口径：
//  - 只统计 unit.startedAt 之后、且与单元目标/材料真实关联的记录；
//  - 生成材料、预览、纯阅读曝光都不算独立掌握证据；
//  - 独立回忆 = 用户在本单元期间对目标词的正确答案（非 timeout / unknown）。
import type { Data, MiniUnit, ReadingSession, UnitEvidenceRef, UnitEvidenceSummary } from './types.ts';
import { completedDays } from './miniUnit.ts';
const after = (at: number | undefined, since: number) => typeof at === 'number' && at >= since;
export function collectUnitEvidence(data: Data, unit: MiniUnit): UnitEvidenceSummary {
    const since = unit.startedAt || unit.createdAt || 0;
    const targetEn = new Set(unit.targetWords.map(w => w.toLowerCase()));
    const targetIds = new Set(data.words.filter(w => targetEn.has(w.en.toLowerCase())).map(w => w.id));
    const anchorId = unit.anchorMaterialId;
    const refs: UnitEvidenceRef[] = [];
    // —— 词汇证据 ——
    const wordsCovered = new Set<string>();
    const wordsIndependent = new Set<string>();
    for (const r of data.records) {
        if (!after(r.at, since) || !targetIds.has(r.wordId))
            continue;
        const w = data.words.find(x => x.id === r.wordId);
        if (!w)
            continue;
        wordsCovered.add(w.en);
        if (r.correct && r.reason === 'answer') {
            wordsIndependent.add(w.en);
            refs.push({ kind: 'word', id: r.id, at: r.at, note: `${w.en} 独立回忆正确` });
        }
    }
    for (const e of data.wordExposures) {
        if (!after(e.at, since) || !targetIds.has(e.wordId))
            continue;
        const w = data.words.find(x => x.id === e.wordId);
        if (w)
            wordsCovered.add(w.en);
    }
    // 目标词中已进入遗忘/未知状态 → 记为忘记
    const forgottenWords = [...targetEn]
        .map(en => data.words.find(w => w.en.toLowerCase() === en))
        .filter((w): w is NonNullable<typeof w> => !!w)
        .filter(w => w.state.level === 'unknown' && w.state.errors > 0)
        .map(w => w.en);
    // —— 语法证据 ——
    const grammarIds = new Set(unit.targetGrammar);
    const grammarMap = new Map<string, {
        attempts: number;
        correct: number;
        independent: boolean;
    }>();
    for (const a of data.grammarAttempts) {
        const id = a.conceptId;
        if (!grammarIds.has(id) || !after(a.at, since))
            continue;
        const row = grammarMap.get(id) ?? { attempts: 0, correct: 0, independent: false };
        row.attempts++;
        if (a.correct)
            row.correct++;
        // 只有“独立作答”才算独立证据（Phase 4 的证据分级；缺省视为普通识别题）
        const independent = a.independent !== false && (a.supportLevel ?? 0) === 0;
        row.independent = row.independent || (a.correct && independent);
        grammarMap.set(id, row);
        refs.push({ kind: 'grammar', id: a.id, at: a.at, note: `${id} ${a.correct ? '正确' : '错误'}` });
    }
    // —— 句子证据 ——
    let sentenceAttempts = 0;
    for (const a of data.sentenceAttempts) {
        const at = a.at ?? a.createdAt;
        if (!after(at, since))
            continue;
        const touched = a.targetWords.some(w => targetEn.has(String(w).toLowerCase())) || a.targetGrammar.some(g => grammarIds.has(g));
        if (!touched)
            continue;
        sentenceAttempts++;
        refs.push({ kind: 'sentence', id: a.id, at, note: '与本单元目标相关的句子作答' });
    }
    // —— 阅读证据 ——
    const anchorSessions: string[] = [];
    const transferSessions: string[] = [];
    let cold: UnitEvidenceSummary['cold'] = unit.baseline ? { unknownRate: unit.baseline.unknownRate, comprehension: unit.baseline.comprehension } : null;
    let supported: UnitEvidenceSummary['supported'] = null;
    let translationDependence = 0;
    const obstacles: string[] = [];
    for (const s of data.readingSessions) {
        if (s.at < since)
            continue;
        if (s.passageId === anchorId) {
            anchorSessions.push(s.id);
            const coldEvidence = s.detail?.evidence.find(e => e.type === 'cold-baseline');
            if (cold && cold.comprehension === null && typeof coldEvidence?.value === 'number')
                cold = { ...cold, comprehension: coldEvidence.value };
            if (!cold && typeof coldEvidence?.value === 'number')
                cold = { unknownRate: s.unknownRate ?? null, comprehension: coldEvidence.value };
            const reread = s.detail?.evidence.filter(e => e.type === 'reread-result');
            const latestReread = reread?.length ? reread[reread.length - 1] : null;
            const comprehension = typeof latestReread?.value === 'number' ? latestReread.value : s.secondPassComprehension ?? s.firstPassComprehension;
            if (typeof comprehension === 'number')
                supported = { comprehension, translationDependence: typeof s.translationDependence === 'number' ? s.translationDependence : null };
            translationDependence = Math.max(translationDependence, s.translationDependence ?? 0);
            readObstacles(s, obstacles);
        }
        else {
            const others = data.passages.find(p => p.id === s.passageId);
            if (!others || others.sourceType === 'ai' || others.sourceType === 'ai_reinforcement')
                continue;
            transferSessions.push(s.id);
        }
    }
    // —— 计划 / 生成 ——
    const planDays = data.dailyPlans.filter(p => p.miniUnitId === unit.id).map(p => p.date);
    const generations = data.aiGenerations.filter(g => g.sourceMetadata?.miniUnitId === unit.id).map(g => g.id);
    const supportReduction = unit.dayHistory?.length
        ? 1 - (['high', 'medium', 'low'].indexOf(unit.dayHistory[unit.dayHistory.length - 1].supportLevel) / 2)
        : 0;
    return {
        unitId: unit.id,
        wordsCovered: [...wordsCovered],
        wordsIndependent: [...wordsIndependent],
        forgottenWords,
        targetWordTotal: unit.targetWords.length,
        independentRecall: wordsIndependent.size,
        grammar: [...grammarMap].map(([conceptId, v]) => ({ conceptId, ...v })),
        anchorSessions,
        transferSessions,
        sentenceAttempts,
        planDays,
        generations,
        cold,
        supported,
        supportReduction: Math.round(supportReduction * 100) / 100,
        translationDependence: Math.round(translationDependence * 100) / 100,
        obstacles: [...new Set(obstacles)].slice(0, 6),
        refs,
    };
}
function readObstacles(s: ReadingSession, out: string[]): void {
    for (const m of s.detail?.marks ?? []) {
        if (m.judgment === 'unknown')
            out.push(`生词：${m.surface}`);
    }
    for (const d of s.detail?.difficultSentences ?? []) {
        out.push(`难句（${d.problemTypes[0] ?? '未归因'}）`);
    }
    for (const e of s.detail?.evidence ?? []) {
        if (e.type === 'grammar-obstacle')
            out.push(`语法障碍：${String(e.key)}`);
    }
}
/** Day 完成所需的真实活动证据 id（打开页面不算） */
export function dayEvidenceIds(data: Data, unit: MiniUnit, day: number): string[] {
    const since = dayStartSince(data, unit, day);
    const ids: string[] = [];
    const targetEn = new Set(unit.targetWords.map(w => w.toLowerCase()));
    for (const r of data.records) {
        if (r.at >= since && r.reason === 'answer' && data.words.some(w => w.id === r.wordId && targetEn.has(w.en.toLowerCase())))
            ids.push(r.id);
    }
    for (const a of data.sentenceAttempts) {
        const at = a.at ?? a.createdAt;
        if (at >= since && a.targetWords.some(w => targetEn.has(String(w).toLowerCase())))
            ids.push(a.id);
    }
    for (const s of data.readingSessions) {
        if (s.at >= since && (s.passageId === unit.anchorMaterialId || (unit.linkedPassageIds ?? []).includes(s.passageId)))
            ids.push(s.id);
    }
    for (const g of data.grammarAttempts) {
        if (g.at >= since && unit.targetGrammar.includes(g.conceptId))
            ids.push(g.id);
    }
    return [...new Set(ids)];
}
/** 某个学习日的起点：上一学习日完成的时刻；没有则用 startedAt */
function dayStartSince(data: Data, unit: MiniUnit, day: number): number {
    const history = unit.dayHistory ?? [];
    const prev = history.filter(d => d.day < day).sort((a, b) => b.day - a.day)[0];
    if (prev)
        return prev.at;
    return unit.startedAt || unit.createdAt || 0;
}
export function completedDayCount(unit: MiniUnit): number {
    return completedDays(unit).length;
}
/** 只有“真实学习活动”才算学习日；仅打开页面不写任何记录 */
export function hasLearningActivity(data: Data, unit: MiniUnit): boolean {
    return dayEvidenceIds(data, unit, Math.max(1, (unit.dayIndex || 0) + 1)).length > 0
        || data.records.some(r => r.at >= (unit.startedAt || 0))
        || data.readingSessions.some(s => s.at >= (unit.startedAt || 0));
}
