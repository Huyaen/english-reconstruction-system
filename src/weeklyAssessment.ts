// —— Phase 11：迁移练习与周测 ——
// 迁移必须换题、换语境；周测只用真实材料/真实词库，缺什么就明确 unavailable。
import type { AssessmentItem, ExamErrorCategory, ExamMaterial, ExamSession, ExamSpecification, WeeklyAssessmentReport } from './examTypes.ts';
import type { Data, Passage } from './types.ts';
import { builtinExamItems } from './examSeed.ts';
import { createExamSession } from './examSession.ts';
export interface ExamAvailability {
    available: boolean;
    reason: string;
    freshItems: AssessmentItem[];
}
/** 只返回“新题”：以前任何测评用过的题都排除；“新语境”优先同一能力的未用题。 */
export function freshExamItems(items: AssessmentItem[], sessions: ExamSession[], opts: {
    category?: string;
    skillPrefix?: string;
    excludeIds?: string[];
} = {}): AssessmentItem[] {
    const used = new Set(sessions.flatMap(s => s.itemIds));
    for (const id of opts.excludeIds ?? [])
        used.add(id);
    return items.filter(i => {
        if (used.has(i.id) || i.purpose === 'weekly')
            return false;
        if (opts.category && i.examCategory !== opts.category)
            return false;
        if (opts.skillPrefix && !i.targetSkills.some(s => s.startsWith(opts.skillPrefix!)))
            return false;
        if (i.questionType === 'listening' && !i.audioUrl)
            return false;
        return true;
    });
}
export function examAvailability(items: AssessmentItem[], sessions: ExamSession[], category?: string): ExamAvailability {
    const fresh = freshExamItems(items, sessions, { category });
    if (!fresh.length)
        return { available: false, reason: '没有未做过的题目；已有题目都做过了，系统不会重复出同一题冒充新题。', freshItems: [] };
    return { available: true, reason: '', freshItems: fresh };
}
export function buildTransferRetest(args: {
    items: AssessmentItem[];
    sessions: ExamSession[];
    errorCategories: ExamErrorCategory[];
    now: number;
    spec: ExamSpecification | null;
    id: string;
}): {
    session: ExamSession | null;
    reason: string;
} {
    const skillPrefix = args.errorCategories.includes('vocabulary') ? 'vocabulary'
        : args.errorCategories.includes('structure') ? 'grammar'
            : args.errorCategories.includes('logic') ? 'reading.' : args.errorCategories.includes('evidence') ? 'reading.evidence' : '';
    // 迁移看能力，不把“2028 尚无专属题”误判为不能复测；来源仍会在会话里标注。
    const candidates = freshExamItems(args.items, args.sessions, { skillPrefix: skillPrefix || undefined });
    if (!candidates.length)
        return { session: null, reason: '没有同能力的未用新题，不能安排迁移复测；不做重复题。' };
    const pick = candidates.slice(0, 1);
    return {
        session: createExamSession({ id: args.id, mode: 'transfer_retest', spec: args.spec, items: pick, now: args.now, timeLimitMinutes: 8, sourceProvenance: 'transfer-new-item' }),
        reason: '',
    };
}
/** 周测不可用时的明确原因；绝不生成空壳“周测完成”。 */
export function weeklyUnavailableReason(d: Data, items: AssessmentItem[], sessions: ExamSession[]): string {
    const fresh = freshExamItems(items, sessions);
    const unread = (d.passages ?? []).filter(p => !(d.readingSessions ?? []).some(r => r.passageId === p.id));
    if (!fresh.length && !unread.length)
        return '没有未做过的题，也没有未读文章；先去阅读库导入一篇真实文章。';
    return '';
}
export interface WeeklyBuild {
    items: AssessmentItem[];
    minutes: number;
    unavailable: {
        section: string;
        reason: string;
    }[];
    readingPassageId: string | null;
}
/** 周测 5 部分；总时长按 Time Budget 收在 15–25 分钟。 */
export function buildWeeklyAssessment(d: Data, items: AssessmentItem[], sessions: ExamSession[], now: number): WeeklyBuild {
    const out: AssessmentItem[] = [];
    const unavailable: {
        section: string;
        reason: string;
    }[] = [];
    const used = new Set(sessions.flatMap(s => s.itemIds));
    // 1. 延迟词汇：从真实词库选已复习过的词，生成 4 选 1；没有足够词就不生成。
    const seenZh = new Set<string>();
    const words = [];
    for (const w of d.words ?? []) {
        const zh = w.zh?.trim();
        if (!zh || !w.en?.trim() || w.state.total <= 0 || seenZh.has(zh))
            continue;
        seenZh.add(zh);
        words.push(w);
        if (words.length >= 12)
            break;
    }
    const pool = [...seenZh];
    if (words.length >= 4 && pool.length >= 4) {
        for (const w of words.slice(0, 3)) {
            const others = pool.filter(z => z !== w.zh.trim()).sort((a, b) => a.localeCompare(b)).slice(0, 3);
            const correct = w.zh.trim();
            // 稳定轮转：同一词库同一时间生成相同顺序；正确项位置不固定。
            const rotation = [...w.id].reduce((n, ch) => n + ch.charCodeAt(0), 0) % 4;
            const base = [correct, ...others];
            const opts = base.map((_, i) => base[(i + rotation) % base.length]);
            out.push({
                id: `wk-vocab-${w.id}-${now}`, examCategory: 'other', examYear: 2026, purpose: 'weekly',
                section: 'weekly', questionType: 'delayed_vocabulary', materialId: null,
                stem: `“${w.en}” 在词库中的中文意思是：`, options: opts.map((text, i) => ({ id: String.fromCharCode(65 + i), text })),
                answerKey: opts.findIndex(x => x === correct) >= 0 ? String.fromCharCode(65 + opts.findIndex(x => x === correct)) : null,
                answerEvidence: `来自你的词库：${w.en} = ${correct}。`, explanation: '延迟词汇检查的是长期保持，不是刚背完的短时记忆。',
                pointValue: 1, estimatedTimeMinutes: 1, difficulty: 'easy', difficultyBasis: '词库自评难度不参与自动判定。',
                targetSkills: ['vocabulary.delayed'], targetWords: [w.en], targetGrammar: [], source: 'generated', license: 'user-data',
                provenance: 'authored', verifiedStatus: 'auto_verified', audioUrl: null, createdAt: now,
            });
        }
    }
    else
        unavailable.push({ section: '延迟词汇', reason: '词库里还没有足够的已复习词（至少 4 个不同释义），本周不生成词汇题。' });
    // 2. 未见句子结构：题库中未使用过的句法题。
    const sentenceItems = items.filter(i => i.purpose === 'weekly' && i.questionType === 'sentence_parsing' && !used.has(i.id)).slice(0, 2);
    if (sentenceItems.length)
        out.push(...sentenceItems);
    else
        unavailable.push({ section: '未见句子', reason: '句法题都已做过；需要新题才能验证迁移。' });
    // 3. 真实文章：优先未读过的 Passage；只要求写主旨+依据，不伪造选择题。
    const unread = (d.passages ?? []).filter(p => !(d.readingSessions ?? []).some(r => r.passageId === p.id));
    const passage: Passage | undefined = unread[0];
    if (passage && passage.text.trim().length > 80) {
        out.push({
            id: `wk-reading-${passage.id}-${now}`, examCategory: 'other', examYear: 2026, purpose: 'weekly',
            section: 'weekly', questionType: 'short_output', materialId: null,
            stem: `阅读下面这篇你尚未读过的文章，用 2–3 句英语写出主旨，并引用一个原文依据。\n\n${passage.title}\n${passage.text.slice(0, 4000)}`,
            options: [], answerKey: null, answerEvidence: '开放作答，以文章本身为准，系统不自动打分。',
            explanation: '周测阅读只检验“能否独立读懂并说明依据”，不做选择题猜测。',
            pointValue: 0, estimatedTimeMinutes: 6, difficulty: 'medium', difficultyBasis: '文章难度用阅读库已有标记，不在此重算。',
            targetSkills: ['reading.main-idea', 'reading.evidence-location'], targetWords: [], targetGrammar: [], source: 'imported',
            license: 'user-imported', provenance: 'user_supplied', verifiedStatus: 'unverified', audioUrl: null, createdAt: now,
            rubric: ['主旨准确', '引用原文依据', '用自己的英语表达'],
        });
    }
    else
        unavailable.push({ section: '真实阅读', reason: '没有未读过的文章；周测不重复使用已读文章，也不拿自编材料冒充真实文章。' });
    // 4. 独立表达
    const output = items.find(i => i.id === 'wk-output-1');
    if (output)
        out.push({ ...output, id: `wk-output-${now}` });
    else
        unavailable.push({ section: '独立表达', reason: '缺少表达题模板。' });
    // 5. 翻译依赖自评
    const reflection = items.find(i => i.id === 'wk-reflection-1');
    if (reflection)
        out.push({ ...reflection, id: `wk-reflection-${now}` });
    else
        unavailable.push({ section: '翻译依赖', reason: '缺少自评项。' });
    let minutes = out.reduce((n, i) => n + i.estimatedTimeMinutes, 0);
    while (minutes > 25 && out.length > 1) {
        const dropIndex = out.map((i, idx) => ({ i, idx })).filter(x => x.i.pointValue === 0 && x.i.questionType === 'short_output').map(x => x.idx)[0];
        if (dropIndex === undefined)
            break;
        const [removed] = out.splice(dropIndex, 1);
        unavailable.push({ section: '可用时间', reason: `为控制在 25 分钟内，移除了「${removed.stem.slice(0, 20)}…」。` });
        minutes = out.reduce((n, i) => n + i.estimatedTimeMinutes, 0);
    }
    return { items: out, minutes: Math.max(15, Math.min(25, minutes)), unavailable, readingPassageId: passage?.id ?? null };
}
export function weeklyReportFrom(session: ExamSession, build: Pick<WeeklyBuild, 'items' | 'minutes' | 'unavailable'>): WeeklyAssessmentReport {
    const answeredTypes = new Set(session.items.filter(i => session.answers[i.id]?.value?.trim()).map(i => i.questionType));
    const objective = session.items.filter(i => i.options.length > 0);
    const correct = objective.filter(i => session.answers[i.id]?.value === i.answerKey).length;
    return {
        id: `war-${session.id}`, sessionId: session.id, createdAt: session.updatedAt,
        minutes: session.timeLimitMinutes, sections: [...new Set(session.items.map(i => i.section === 'weekly' ? sectionLabel(i.questionType) : i.section))],
        answeredSections: [...answeredTypes].map(sectionLabel),
        objectiveCorrect: correct, objectiveTotal: objective.length,
        selfReportedDependence: (session.answers[session.items.find(i => i.questionType === 'reflection')?.id ?? '']?.value) ?? null,
        unavailable: build.unavailable,
        evidenceNote: '周测结果只描述这一次表现；客观题可核对，开放题不自动评分，自评不是能力证明。',
    };
}
function sectionLabel(t: AssessmentItem['questionType']): string {
    return ({
        delayed_vocabulary: '延迟词汇', sentence_parsing: '未见句子', short_output: '真实阅读/表达', reflection: '翻译依赖',
        contextual_grammar: '语法', cloze: '完形', reading_comprehension: '阅读', translation: '翻译', summary_writing: '概要',
        situational_writing: '写作', listening: '听力', vocabulary_in_context: '语境词汇', text_structure: '语篇结构', speaking: '口语',
    } as const)[t] ?? t;
}
export function weeklySession(args: {
    d: Data;
    items: AssessmentItem[];
    sessions: ExamSession[];
    now: number;
    spec: ExamSpecification | null;
    id: string;
}): {
    session: ExamSession | null;
    build: WeeklyBuild;
    reason: string;
} {
    const build = buildWeeklyAssessment(args.d, args.items, args.sessions, args.now);
    if (build.items.length < 3)
        return { session: null, build, reason: weeklyUnavailableReason(args.d, args.items, args.sessions) || '可用部分太少（少于 3 项），本周不生成完整周测。' };
    const session = createExamSession({ id: args.id, mode: 'weekly_assessment', spec: args.spec, items: build.items, now: args.now, timeLimitMinutes: build.minutes, weeklyReportId: `war-${args.id}`, sourceProvenance: 'weekly-real-materials' });
    session.unavailableSections = build.unavailable;
    return { session, build, reason: '' };
}
