// —— Phase 7：单元日推进与 Planner 交接（纯函数）——
// 这里只决定“今天是哪种学习日、围绕哪份真实材料、给多少辅助”，
// 具体任务如何排（时长、顺序、容量）仍由 Phase 3 的确定性 Planner 决定。
import type { Data, MiniUnit, Passage, UnitEvidenceSummary, UnitSupportLevel } from './types.ts';
import { completedDays, dayKind, dayLabel, nextDay, supportLevelFor, UNIT_RULES } from './miniUnit.ts';
import { collectUnitEvidence } from './miniUnitEvidence.ts';
import { transferCandidates } from './miniUnitSelection.ts';
export interface DayFocusItem {
    id: 'preview' | 'recall' | 'sentence' | 'grammar' | 'reading' | 'transfer' | 'reflection' | 'repair';
    title: string;
    minutes: number;
    why: string;
}
export interface DayPlanSpec {
    day: number;
    kind: ReturnType<typeof dayKind>;
    label: string;
    supportLevel: UnitSupportLevel;
    translationAllowed: boolean;
    focus: DayFocusItem[];
    material: {
        passageId: string;
        kind: 'anchor' | 'transfer' | 'support' | 'none';
        title: string;
        note: string;
    };
    targets: {
        words: string[];
        grammar: string[];
    };
    evidenceGoal: string[];
    aiOptional: {
        kind: 'reading' | 'sentence';
        reason: string;
        reuseKey: string;
    } | null;
    warnings: string[];
}
const clampMinutes = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));
/** 权重按时长分配，保证总和不超过预算（Time Budget First） */
function allocate(budget: number, weights: {
    id: DayFocusItem['id'];
    title: string;
    w: number;
    why: string;
}[]): DayFocusItem[] {
    const totalW = weights.reduce((n, x) => n + x.w, 0) || 1;
    const raw = weights.map(x => ({ ...x, minutes: (budget * x.w) / totalW }));
    const rounded = raw.map(x => ({ ...x, minutes: clampMinutes(x.minutes, 2, Math.max(2, budget)) }));
    let sum = rounded.reduce((n, x) => n + x.minutes, 0);
    // 从最大项逐步削减，直到落在预算内；不会把某项削到 0
    while (sum > budget) {
        const idx = rounded.reduce((best, x, i) => (x.minutes > rounded[best].minutes ? i : best), 0);
        if (rounded[idx].minutes <= 2)
            break;
        rounded[idx].minutes -= 1;
        sum -= 1;
    }
    return rounded.map(x => ({ id: x.id, title: x.title, minutes: x.minutes, why: x.why }));
}
export function planDay(input: {
    unit: MiniUnit;
    day: number;
    availableMinutes: number;
    energy: 'low' | 'normal' | 'good';
    data: Data;
}): DayPlanSpec {
    const { unit, day, data } = input;
    const ev = collectUnitEvidence(data, unit);
    const anchor = data.passages.find(p => p.id === unit.anchorMaterialId);
    const warnings: string[] = [];
    const energyScale = input.energy === 'low' ? 0.7 : input.energy === 'good' ? 1.05 : 1;
    const budget = Math.max(10, Math.round(input.availableMinutes * energyScale));
    const kind = dayKind(day);
    const weakFromHistory = historyWeakWords(unit, ev);
    if (!anchor)
        warnings.push('这份材料已经不在阅读库里了：请重新选一份，否则无法继续');
    if (day === 3) {
        const candidates = transferCandidates(data.passages, unit);
        if (!candidates.length)
            warnings.push('还没有同主题的真实迁移材料：可以先用 AI 强化材料练习，但不会被记为“真实迁移通过”');
    }
    let material: DayPlanSpec['material'] = { passageId: '', kind: 'none', title: '', note: '没有可用材料' };
    let focus: DayFocusItem[] = [];
    let translationAllowed = true;
    let evidenceGoal: string[] = [];
    let aiOptional: DayPlanSpec['aiOptional'] = null;
    if (kind === 'build') {
        if (anchor)
            material = { passageId: anchor.id, kind: 'anchor', title: anchor.title, note: '今天始终围绕这一篇真实材料' };
        translationAllowed = true;
        evidenceGoal = ['一次真实冷测（辅助前）', '目标词首轮暴露', '一句结构复述'];
        focus = allocate(budget, [
            { id: 'preview', title: '材料预览与冷读', w: 3, why: '先看标题/来源/主题，再做一次不看中文的冷测，建立干净基线' },
            { id: 'preview', title: '目标词预览', w: 2, why: `今天的目标词来自 ${anchor?.title ?? '本单元材料'}，共 ${unit.targetWords.length} 个` },
            { id: 'grammar', title: '基础语法支撑', w: 2, why: grammarWhy(unit) },
            { id: 'reading', title: '舒适阅读（允许中文）', w: 4, why: '目标是把支持后理解拉到 80–90%，不是逐句翻译' },
            { id: 'sentence', title: '少量句子精读', w: 2, why: `只挑 ${Math.min(2, unit.targetGrammar.length)} 个含目标结构的句子` },
            { id: 'reflection', title: '收尾复盘', w: 1, why: '写下一句“今天读懂了什么”，作为明天的对照' },
        ]);
        aiOptional = unit.targetWords.length
            ? { kind: 'sentence', reason: '为目标词补 1–2 个例句（可选，不替代真实材料）', reuseKey: aiReuseKey(unit, day) }
            : null;
    }
    else if (kind === 'strengthen') {
        const prev = (unit.dayHistory ?? []).find(d => d.day === 1);
        if (anchor)
            material = { passageId: anchor.id, kind: 'anchor', title: anchor.title, note: '还是这篇材料，但辅助减少' };
        translationAllowed = true;
        evidenceGoal = ['昨天学的词还想得起来', '目标语法的独立作答', '一次结构迁移'];
        focus = allocate(budget, [
            { id: 'recall', title: '昨天的词再想一遍', w: 3, why: prev ? `第 1 天是 ${prev.calendarDate} 做的，先看看隔一晚还记得多少` : '先回想昨天的词' },
            { id: 'grammar', title: '目标语法强化', w: 3, why: grammarWhy(unit) },
            { id: 'sentence', title: '较复杂目标句', w: 3, why: weakFromHistory.length ? `优先用 ${weakFromHistory.slice(0, 3).join('、')} 造/拆句` : '围绕目标词与目标结构' },
            { id: 'reading', title: '成长阅读（少量中文）', w: 4, why: '同一主题、更多结构，目标是 70–85% 支持后理解' },
            { id: 'reflection', title: '收尾复盘', w: 1, why: '对比 Day 1：哪一处不再需要中文' },
        ]);
        aiOptional = { kind: 'reading', reason: '可生成一篇同主题强化短文（标 AI，不替代原有材料）', reuseKey: aiReuseKey(unit, day) };
    }
    else if (kind === 'transfer') {
        const candidates = transferCandidates(data.passages, unit);
        const pick = candidates[0];
        if (pick)
            material = { passageId: pick.id, kind: 'transfer', title: pick.title, note: '这是一篇新的真实材料，用来验证迁移而不是熟悉度' };
        else if (anchor)
            material = { passageId: anchor.id, kind: 'anchor', title: anchor.title, note: '没有新材料：只能重读原来那篇，不能算换了场景' };
        translationAllowed = false;
        evidenceGoal = ['新材料上的独立理解', '目标词在新语境中的识别', '一句话表达主旨'];
        focus = allocate(budget, [
            { id: 'transfer', title: '新材料独立冷读', w: 4, why: pick ? `换一篇同主题真实文章：${pick.title}` : '没有新材料时只重读原来那篇，并标明这不是换场景' },
            { id: 'reading', title: '独立理解题', w: 3, why: '先不看中文，标注不认识的词' },
            { id: 'recall', title: '目标词迁移识别', w: 2, why: '在陌生语境里认出目标词，而不是记住位置' },
            { id: 'grammar', title: '目标结构辨认', w: 2, why: grammarWhy(unit) },
            { id: 'reflection', title: '一句话主旨', w: 2, why: '用英文写一句主旨（写作练习还没做，这里只做简短自评）' },
        ]);
        aiOptional = pick ? null : { kind: 'reading', reason: '缺真实新材料时的 AI 强化练习（会标为 AI-assisted，不算真实迁移）', reuseKey: aiReuseKey(unit, day) };
    }
    else {
        const residual = [...new Set([...(weakFromHistory ?? []), ...ev.forgottenWords])];
        if (anchor)
            material = { passageId: anchor.id, kind: 'anchor', title: anchor.title, note: '只针对残余障碍重读相关段落' };
        translationAllowed = false;
        evidenceGoal = ['残余弱词的独立回忆', '残余语法的独立作答'];
        focus = allocate(budget, [
            { id: 'repair', title: '残余弱词修复', w: 4, why: residual.length ? `仍未稳：${residual.slice(0, 5).join('、')}` : '没有明显残余弱词，做一次快速确认' },
            { id: 'grammar', title: '残余结构修复', w: 3, why: grammarWhy(unit) },
            { id: 'reading', title: '回到材料的关键段落', w: 3, why: '只读与障碍相关的段落，不重跑整套 Day 1' },
            { id: 'reflection', title: '收尾与决定', w: 1, why: '决定完成、继续延长或结束并记录未解决问题' },
        ]);
    }
    return {
        day,
        kind,
        label: dayLabel(day),
        supportLevel: supportLevelFor(day),
        translationAllowed,
        focus,
        material,
        targets: { words: unit.targetWords, grammar: unit.targetGrammar },
        evidenceGoal,
        aiOptional,
        warnings,
    };
}
function grammarWhy(unit: MiniUnit): string {
    const names = (unit.grammarTargets ?? []).map(g => `${g.name}${g.status === 'candidate' ? '（候选，材料中未直接观察到）' : ''}`);
    return names.length ? `目标结构：${names.join('、')}` : '目标结构：材料中的基础主干';
}
function historyWeakWords(unit: MiniUnit, ev: UnitEvidenceSummary): string[] {
    const covered = new Set(ev.wordsCovered);
    const independent = new Set(ev.wordsIndependent);
    return unit.targetWords.filter(w => !independent.has(w)).slice(0, 6).map(w => (covered.has(w) ? `${w}（见过但未独立回忆）` : w));
}
/** AI 复用键：同一 Unit + Day + 目标 + Prompt 版本只生成一次 */
export function aiReuseKey(unit: MiniUnit, day: number, promptVersion = '1.0.0'): string {
    const targets = [...unit.targetWords].sort().join(',');
    const grammar = [...unit.targetGrammar].sort().join(',');
    return `${unit.id}|d${day}|${targets}|${grammar}|${promptVersion}`;
}
export function findReusableGeneration(data: Data, key: string): string | null {
    const hit = data.aiGenerations.find(g => g.sourceMetadata?.unitReuseKey === key && g.quality?.ok);
    return hit?.id ?? null;
}
/** 迁移证据判定：必须是新的真实材料 + 独立完成 */
export function transferEvidence(input: {
    unit: MiniUnit;
    passage: Passage | undefined;
    sessionId: string;
    at: number;
    comprehension: number | null;
    independent: boolean;
    targetWordRecall: number;
    grammarObserved: boolean;
}): NonNullable<MiniUnit['transfer']> {
    const isNewMaterial = !!input.passage && input.passage.id !== input.unit.anchorMaterialId;
    const authentic = !!input.passage && input.passage.sourceType !== 'ai' && input.passage.sourceType !== 'ai_reinforcement';
    return {
        at: input.at,
        passageId: input.passage?.id ?? '',
        materialKind: isNewMaterial && authentic ? 'authentic' : 'ai_assisted',
        independent: input.independent && isNewMaterial,
        comprehension: input.comprehension,
        targetWordRecall: input.targetWordRecall,
        grammarObserved: input.grammarObserved,
        sessionId: input.sessionId,
    };
}
/** 单元层面“今天还剩什么” — 给 UI 直接展示，不写在 Planner 里 */
export function remainingDays(unit: MiniUnit): number {
    return Math.max(0, (unit.plannedDays ?? UNIT_RULES.plannedDays) - completedDays(unit).length);
}
export function dayProgress(unit: MiniUnit): {
    day: number;
    label: string;
    done: number;
} {
    return { day: nextDay(unit), label: dayLabel(nextDay(unit)), done: completedDays(unit).length };
}
