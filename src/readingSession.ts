// —— Phase 5：阅读会话状态机（纯函数；不碰 DOM / DB / AI）——
// 流程：preview → cold-test → reading（逐 chunk）→ comprehension → support → reread → whole-text → closing → completed
// 硬规则：
// 1. 打开文章不显示全文翻译；首读之前只有标题/来源/主题/词数/预计时间。
// 2. 冷读（cold-test）只记录“第一次无辅助的理解状态”，自评永远标记为 self_report。
// 3. 辅助等级 ≥3（结构解释/完整讲解）= 看过答案：只算接触，不算独立理解。
// 4. 所有写入幂等：重复标记同一词只更新判断，不产生第二条 exposure。
import type { DifficultSentence, Passage, ReadingChunk, ReadingComprehensionRecord, ReadingMark, ReadingParagraph, ReadingProblemType, ReadingSession, ReadingSessionDetail, ReadingStage, TranslationDependenceGrade, } from './types.ts';
import { uid } from './core.ts';
import { appendEvidence, evidenceKey, makeEvidence, translationDependenceScore } from './readingEvidence.ts';
import { normalizeToken } from './readingText.ts';
export const READING_STAGES: ReadingStage[] = ['preview', 'cold-test', 'reading', 'comprehension', 'support', 'reread', 'whole-text', 'closing', 'completed'];
export const READING_LIMITS = {
    chunkWords: { weak: 80, normal: 100, strong: 120 },
    chunkTolerance: 25, // 允许为了不切断句子而略超/略少
    maxHelpLevelIndependence: 2, // ≤2 仍可视为独立理解；≥3 视为看过答案
} as const;
export function stageLabel(stage: ReadingStage): string {
    return ({
        preview: '预览', 'cold-test': '冷读', reading: '逐段阅读', comprehension: '说大意',
        support: '针对性辅助', reread: '重读', 'whole-text': '全文理解', closing: '收尾', completed: '已完成',
    })[stage];
}
// —— 分段（chunk）：按句子边界装填，绝不切断句子；短段可合并 ——
export function buildChunks(paragraphs: ReadingParagraph[], ability: keyof typeof READING_LIMITS.chunkWords = 'normal'): ReadingChunk[] {
    const target = READING_LIMITS.chunkWords[ability];
    const tol = READING_LIMITS.chunkTolerance;
    const chunks: ReadingChunk[] = [];
    let current: ReadingChunk | null = null;
    for (const p of paragraphs) {
        if (!p.text.trim())
            continue;
        if (current && current.wordCount < target - tol) {
            // 短段合并：同一段内继续追加
            current.paragraphIndexes.push(p.index);
            current.text = current.text ? `${current.text}\n\n${p.text}` : p.text;
            current.end = p.end;
            current.wordCount += p.wordCount;
            if (current.wordCount >= target)
                chunks.push(current), current = null;
            continue;
        }
        if (current)
            chunks.push(current);
        current = {
            index: chunks.length,
            paragraphIndexes: [p.index],
            sentenceIndexes: [],
            text: p.text,
            start: p.start,
            end: p.end,
            wordCount: p.wordCount,
        };
        if (current.wordCount >= target)
            chunks.push(current), current = null;
    }
    if (current)
        chunks.push(current);
    return chunks.map((c, i) => ({ ...c, index: i }));
}
// 每个 chunk 覆盖的句子索引（由调用方传入全篇句子；按 span 归属）
export function assignSentenceIndexes(chunks: ReadingChunk[], sentences: Array<{
    index: number;
    start: number;
    end: number;
}>): ReadingChunk[] {
    return chunks.map(c => ({
        ...c,
        sentenceIndexes: sentences.filter(s => s.start >= c.start && s.end <= c.end).map(s => s.index),
    }));
}
export function emptyDetail(passage: Passage, chunks: ReadingChunk[]): ReadingSessionDetail {
    return {
        stage: 'preview',
        state: 'created',
        passageTitle: passage.title,
        chunks,
        chunkIndex: 0,
        paragraphIndex: 0,
        coldTestDone: false,
        firstPassStartedAt: null,
        firstPassEndedAt: null,
        rereadStartedAt: null,
        rereadEndedAt: null,
        helps: [],
        marks: [],
        difficultSentences: [],
        comprehension: [],
        evidence: [],
        output: [],
        notes: '',
    };
}
export function createReadingSession(input: {
    passage: Passage;
    now: number;
    ability?: keyof typeof READING_LIMITS.chunkWords;
    sessionId?: string;
}): ReadingSession {
    const chunks = assignSentenceIndexes(buildChunks(input.passage.paragraphs ?? [], input.ability ?? 'normal'), input.passage.sentences ?? []);
    const detail = emptyDetail(input.passage, chunks);
    return {
        id: input.sessionId ?? uid(),
        passageId: input.passage.id,
        wordCount: input.passage.wordCount,
        durationMs: 0,
        unknownWords: [],
        vagueWords: [],
        unknownRate: 0,
        firstPassComprehension: null,
        secondPassComprehension: null,
        readingSpeed: 0,
        structureErrors: 0,
        translationDependence: 0,
        summary: '',
        stage: 0,
        at: input.now,
        detail,
    };
}
function withDetail(session: ReadingSession, patch: Partial<ReadingSessionDetail>): ReadingSession {
    const base = session.detail ?? emptyDetail({ id: session.passageId, title: '', text: '', sourceType: 'import', sourceUrl: '', topic: '', wordCount: session.wordCount, difficulty: '', createdAt: session.at }, []);
    return { ...session, detail: { ...base, ...patch } };
}
export function startColdTest(session: ReadingSession): ReadingSession {
    const s = withDetail(session, { stage: 'cold-test', state: 'active' });
    return { ...s, stage: READING_STAGES.indexOf('cold-test') };
}
// 冷读结果：自评理解程度 + 翻译依赖 + 可选的一句话大意；全部按“自评”记账
export function submitColdTest(session: ReadingSession, input: {
    selfReport: number;
    translationDependence: TranslationDependenceGrade;
    mainIdea?: string;
    language?: 'zh' | 'en' | 'mixed';
    now: number;
}): ReadingSession {
    const selfReport = Math.max(0, Math.min(100, Math.round(input.selfReport)));
    const record: ReadingComprehensionRecord = {
        id: uid(),
        stage: 'cold-test',
        kind: 'self-report',
        prompt: '第一遍读下来，你觉得理解了多少？',
        answer: String(selfReport),
        language: input.language ?? 'zh',
        score: selfReport,
        scoredBy: 'self',
        assisted: false,
        translationDependence: input.translationDependence,
        at: input.now,
    };
    const detail = session.detail!;
    const evidence = appendEvidence(appendEvidence(detail.evidence, makeEvidence({
        type: 'cold-baseline', passageId: session.passageId, sessionId: session.id, source: 'self_reported',
        confidence: 'low', value: selfReport, key: evidenceKey(session.id, 'cold-baseline', 'first'), at: input.now,
        metadata: { translationDependence: input.translationDependence },
    })), makeEvidence({
        type: 'translation-dependence', passageId: session.passageId, sessionId: session.id, source: 'self_reported',
        confidence: 'medium', value: translationDependenceScore(input.translationDependence),
        key: evidenceKey(session.id, 'translation-dependence', 'first'), at: input.now,
        metadata: { grade: input.translationDependence, phase: 'first' },
    }));
    const comprehension = [...detail.comprehension, record];
    if (input.mainIdea && input.mainIdea.trim())
        comprehension.push({
            id: uid(), stage: 'cold-test', kind: 'main-idea', prompt: '这一段主要在说什么？', answer: input.mainIdea.trim(),
            language: input.language ?? 'zh', score: null, scoredBy: 'none', assisted: false,
            translationDependence: null, at: input.now,
        });
    return {
        ...session,
        firstPassComprehension: selfReport,
        translationDependence: translationDependenceScore(input.translationDependence),
        detail: { ...detail, coldTestDone: true, comprehension, evidence, stage: 'reading' },
        stage: READING_STAGES.indexOf('reading'),
    };
}
export function startReading(session: ReadingSession, now: number): ReadingSession {
    const detail = session.detail!;
    return {
        ...session,
        detail: { ...detail, stage: 'reading', state: 'active', firstPassStartedAt: detail.firstPassStartedAt ?? now, chunkIndex: Math.min(detail.chunkIndex, Math.max(0, detail.chunks.length - 1)) },
        stage: READING_STAGES.indexOf('reading'),
    };
}
export function goToChunk(session: ReadingSession, index: number): ReadingSession {
    const detail = session.detail!;
    const max = Math.max(0, detail.chunks.length - 1);
    const chunkIndex = Math.max(0, Math.min(max, Math.round(index)));
    return { ...session, detail: { ...detail, chunkIndex, paragraphIndex: detail.chunks[chunkIndex]?.paragraphIndexes[0] ?? detail.paragraphIndex } };
}
export function nextChunk(session: ReadingSession): ReadingSession {
    return goToChunk(session, (session.detail?.chunkIndex ?? 0) + 1);
}
export function atLastChunk(session: ReadingSession): boolean {
    const d = session.detail;
    return !d || d.chunkIndex >= d.chunks.length - 1;
}
// 段落大意：独立作答 or 带辅助作答，分开记账；没有可验证答案时 score=null（不假装判对）
export function submitMainIdea(session: ReadingSession, input: {
    text: string;
    language: 'zh' | 'en' | 'mixed';
    assisted: boolean;
    now: number;
    chunkIndex?: number;
}): ReadingSession {
    const detail = session.detail!;
    const record: ReadingComprehensionRecord = {
        id: uid(), stage: 'paragraph', kind: 'main-idea', prompt: `第 ${(input.chunkIndex ?? detail.chunkIndex) + 1} 段主要在说什么？`,
        answer: input.text.trim(), language: input.language, score: null, scoredBy: 'none', assisted: input.assisted,
        translationDependence: null, at: input.now,
    };
    const evidence = appendEvidence(detail.evidence, makeEvidence({
        type: input.assisted ? 'assisted-comprehension' : 'independent-comprehension',
        passageId: session.passageId, sessionId: session.id, source: 'self_reported', confidence: 'low',
        value: input.text.trim().slice(0, 280),
        key: evidenceKey(session.id, input.assisted ? 'assisted-comprehension' : 'independent-comprehension', `chunk-${input.chunkIndex ?? detail.chunkIndex}`),
        at: input.now, metadata: { language: input.language, words: input.text.trim().split(/\s+/).length },
    }));
    return { ...session, detail: { ...detail, comprehension: [...detail.comprehension, record], evidence } };
}
// 词汇标记：同一 token 再标记 = 更新判断（不重复计 exposure）
export function markWord(session: ReadingSession, input: {
    paragraphIndex: number;
    sentenceIndex: number;
    tokenIndex: number;
    surface: string;
    lemma?: string | null;
    contextSentence: string;
    judgment: ReadingMark['judgment'];
    now: number;
}): {
    session: ReadingSession;
    mark: ReadingMark;
    replaced: boolean;
} {
    const detail = session.detail!;
    const existing = detail.marks.find(m => !m.revokedAt && m.tokenIndex === input.tokenIndex && m.sentenceIndex === input.sentenceIndex);
    if (existing) {
        const mark: ReadingMark = { ...existing, judgment: input.judgment, at: input.now };
        const marks = detail.marks.map(m => (m.id === existing.id ? mark : m));
        return { session: { ...session, detail: { ...detail, marks } }, mark, replaced: true };
    }
    const mark: ReadingMark = {
        id: uid(),
        passageId: session.passageId,
        sessionId: session.id,
        paragraphIndex: input.paragraphIndex,
        sentenceIndex: input.sentenceIndex,
        tokenIndex: input.tokenIndex,
        surface: input.surface,
        normalized: normalizeToken(input.surface),
        lemma: input.lemma ?? null,
        judgment: input.judgment,
        contextSentence: input.contextSentence,
        at: input.now,
    };
    const evidence = input.judgment === 'unknown' || input.judgment === 'vague'
        ? appendEvidence(detail.evidence, makeEvidence({
            type: 'vocabulary-obstacle', passageId: session.passageId, sessionId: session.id, source: 'task_behaviour',
            confidence: 'high', value: mark.normalized,
            key: evidenceKey(session.id, 'vocabulary-obstacle', `${mark.sentenceIndex}-${mark.tokenIndex}`),
            at: input.now, metadata: { judgment: input.judgment },
        }))
        : detail.evidence;
    return { session: { ...session, detail: { ...detail, marks: [...detail.marks, mark], evidence } }, mark, replaced: false };
}
// 撤销标记：软删除（保留痕迹），并撤掉它带来的障碍证据
export function revokeMark(session: ReadingSession, markId: string, now: number): ReadingSession {
    const detail = session.detail!;
    const target = detail.marks.find(m => m.id === markId);
    if (!target)
        return session;
    const marks = detail.marks.map(m => (m.id === markId ? { ...m, revokedAt: now } : m));
    const key = evidenceKey(session.id, 'vocabulary-obstacle', `${target.sentenceIndex}-${target.tokenIndex}`);
    const evidence = detail.evidence.filter(e => e.key !== key);
    return { ...session, detail: { ...detail, marks, evidence } };
}
export function requestHelp(session: ReadingSession, input: {
    type: 'vocabulary' | 'grammar-card' | 'sentence-structure' | 'main-idea-hint' | 'background';
    level: 0 | 1 | 2 | 3 | 4;
    concept?: string | null;
    now: number;
}): ReadingSession {
    const detail = session.detail!;
    return {
        ...session,
        detail: { ...detail, helps: [...detail.helps, { id: uid(), type: input.type, level: input.level, concept: input.concept ?? null, stage: detail.stage, at: input.now }] },
    };
}
export function maxHelpLevelUsed(session: ReadingSession): number {
    return (session.detail?.helps ?? []).reduce((a, h) => Math.max(a, h.level), 0);
}
// 难句：只记录原文片段与卡点类型；结构来源默认 heuristic/manual，**永不冒充 gold**
export function captureDifficultSentence(session: ReadingSession, input: {
    sentence: {
        index: number;
        paragraphIndex: number;
        text: string;
        start: number;
        end: number;
    };
    problemTypes: ReadingProblemType[];
    contextBefore: string;
    contextAfter: string;
    structureProvenance?: DifficultSentence['structureProvenance'];
    now: number;
}): {
    session: ReadingSession;
    item: DifficultSentence;
} {
    const detail = session.detail!;
    const existing = detail.difficultSentences.find(d => d.start === input.sentence.start && d.end === input.sentence.end);
    if (existing) {
        const merged = { ...existing, problemTypes: [...new Set([...existing.problemTypes, ...input.problemTypes])] };
        return {
            session: { ...session, detail: { ...detail, difficultSentences: detail.difficultSentences.map(d => (d.id === existing.id ? merged : d)) } },
            item: merged,
        };
    }
    const item: DifficultSentence = {
        id: uid(), passageId: session.passageId, sessionId: session.id,
        paragraphIndex: input.sentence.paragraphIndex, sentenceIndex: input.sentence.index,
        text: input.sentence.text, start: input.sentence.start, end: input.sentence.end,
        problemTypes: [...new Set(input.problemTypes)], contextBefore: input.contextBefore, contextAfter: input.contextAfter,
        structureProvenance: input.structureProvenance ?? 'heuristic', at: input.now,
    };
    const evidence = appendEvidence(detail.evidence, makeEvidence({
        type: 'grammar-obstacle', passageId: session.passageId, sessionId: session.id, source: 'task_behaviour',
        confidence: 'high', value: item.text.slice(0, 200),
        key: evidenceKey(session.id, 'grammar-obstacle', `${item.start}-${item.end}`), at: input.now,
        metadata: { problemTypes: item.problemTypes.join(','), provenance: item.structureProvenance },
    }));
    return { session: { ...session, detail: { ...detail, difficultSentences: [...detail.difficultSentences, item], evidence } }, item };
}
export function linkDifficultSentenceAttempt(session: ReadingSession, difficultId: string, attemptId: string): ReadingSession {
    const detail = session.detail!;
    return { ...session, detail: { ...detail, difficultSentences: detail.difficultSentences.map(d => (d.id === difficultId ? { ...d, labAttemptId: attemptId } : d)) } };
}
// 首读结束：记录首读时长，进入 support/reread
export function finishFirstPass(session: ReadingSession, now: number): ReadingSession {
    const detail = session.detail!;
    const started = detail.firstPassStartedAt ?? now;
    return { ...session, detail: { ...detail, stage: 'support', firstPassEndedAt: now, firstPassStartedAt: started } };
}
export function startReread(session: ReadingSession, now: number): ReadingSession {
    const detail = session.detail!;
    return { ...session, detail: { ...detail, stage: 'reread', rereadStartedAt: now, chunkIndex: 0 } };
}
// 重读：默认隐藏之前的解释，只保留主动查看入口
export function finishReread(session: ReadingSession, input: {
    selfReport: number;
    translationDependence: TranslationDependenceGrade;
    now: number;
}): ReadingSession {
    const detail = session.detail!;
    const selfReport = Math.max(0, Math.min(100, Math.round(input.selfReport)));
    const started = detail.rereadStartedAt ?? input.now;
    const record: ReadingComprehensionRecord = {
        id: uid(), stage: 'reread', kind: 'self-report', prompt: '重读一遍之后，现在理解了多少？', answer: String(selfReport),
        language: 'zh', score: selfReport, scoredBy: 'self', assisted: false, translationDependence: input.translationDependence, at: input.now,
    };
    const evidence = appendEvidence(appendEvidence(detail.evidence, makeEvidence({
        type: 'reread-result', passageId: session.passageId, sessionId: session.id, source: 'self_reported', confidence: 'low',
        value: selfReport, key: evidenceKey(session.id, 'reread-result', 'second'), at: input.now,
        metadata: { durationMs: Math.max(0, input.now - started), firstPass: session.firstPassComprehension ?? -1 },
    })), makeEvidence({
        type: 'translation-dependence', passageId: session.passageId, sessionId: session.id, source: 'self_reported', confidence: 'medium',
        value: translationDependenceScore(input.translationDependence), key: evidenceKey(session.id, 'translation-dependence', 'second'),
        at: input.now, metadata: { grade: input.translationDependence, phase: 'second' },
    }));
    return {
        ...session,
        secondPassComprehension: selfReport,
        detail: { ...detail, stage: 'whole-text', rereadStartedAt: started, rereadEndedAt: input.now, comprehension: [...detail.comprehension, record], evidence },
    };
}
// 全文理解：可验证题（有标准答案）与自评分开；没有可靠答案时 score=null
export function submitWholeTextItem(session: ReadingSession, input: {
    kind: 'main-idea' | 'detail' | 'inference';
    prompt: string;
    answer: string;
    language: 'zh' | 'en' | 'mixed';
    verifiedScore: number | null;
    now: number;
}): ReadingSession {
    const detail = session.detail!;
    const record: ReadingComprehensionRecord = {
        id: uid(), stage: 'whole-text', kind: input.kind === 'main-idea' ? 'main-idea' : input.verifiedScore === null ? 'self-report' : 'verified-item',
        prompt: input.prompt, answer: input.answer.trim(), language: input.language,
        score: input.verifiedScore, scoredBy: input.verifiedScore === null ? 'none' : 'verified-key', assisted: false,
        translationDependence: null, at: input.now,
    };
    const type = input.kind === 'main-idea' ? 'main-idea' : input.kind === 'detail' ? 'detail' : 'inference';
    const evidence = appendEvidence(detail.evidence, makeEvidence({
        type, passageId: session.passageId, sessionId: session.id,
        source: input.verifiedScore === null ? 'self_reported' : 'verified_item',
        confidence: input.verifiedScore === null ? 'low' : 'high',
        value: input.verifiedScore === null ? input.answer.trim().slice(0, 280) : input.verifiedScore,
        key: evidenceKey(session.id, type, `${input.kind}-${detail.comprehension.filter(c => c.stage === 'whole-text').length}`),
        at: input.now, metadata: { kind: input.kind, language: input.language },
    }));
    return { ...session, detail: { ...detail, stage: 'whole-text', comprehension: [...detail.comprehension, record], evidence } };
}
export function submitOutput(session: ReadingSession, input: {
    kind: 'one-sentence' | 'short-summary' | 'personal-note';
    text: string;
    language: 'zh' | 'en' | 'mixed';
    now: number;
}): ReadingSession {
    const detail = session.detail!;
    const text = input.text.trim();
    if (!text)
        return session;
    return {
        ...session,
        detail: {
            ...detail,
            output: [...detail.output, { id: uid(), kind: input.kind, text, language: input.language, submittedAt: input.now, scored: false, feedback: '' }],
        },
    };
}
// 收尾：写入平表镜像字段（旧统计继续可用），只统计真实发生过的数据
export function completeReadingSession(session: ReadingSession, input: {
    summary?: string;
    now: number;
}): ReadingSession {
    const detail = session.detail!;
    const marks = detail.marks.filter(m => !m.revokedAt);
    const unknown = [...new Set(marks.filter(m => m.judgment === 'unknown').map(m => m.normalized))];
    const vague = [...new Set(marks.filter(m => m.judgment === 'vague').map(m => m.normalized))];
    const firstMs = detail.firstPassStartedAt && detail.firstPassEndedAt ? Math.max(0, detail.firstPassEndedAt - detail.firstPassStartedAt) : 0;
    const rereadMs = detail.rereadStartedAt && detail.rereadEndedAt ? Math.max(0, detail.rereadEndedAt - detail.rereadStartedAt) : 0;
    const durationMs = firstMs + rereadMs;
    const speed = firstMs > 0 ? Math.round((session.wordCount / (firstMs / 60000)) * 10) / 10 : 0;
    return {
        ...session,
        unknownWords: unknown,
        vagueWords: vague,
        unknownRate: session.wordCount ? Math.round((unknown.length / session.wordCount) * 1000) / 10 : 0,
        durationMs,
        readingSpeed: speed,
        structureErrors: detail.difficultSentences.length,
        summary: input.summary ?? detail.output[0]?.text ?? '',
        stage: READING_STAGES.indexOf('completed'),
        detail: { ...detail, stage: 'completed', state: 'completed' },
    };
}
export function pauseSession(session: ReadingSession): ReadingSession {
    const detail = session.detail;
    if (!detail || detail.state === 'completed')
        return session;
    return { ...session, detail: { ...detail, state: 'paused' } };
}
export function resumeSession(session: ReadingSession): ReadingSession {
    const detail = session.detail;
    if (!detail || detail.state === 'completed')
        return session;
    return { ...session, detail: { ...detail, state: 'active' } };
}
export function isResumable(session: ReadingSession | null | undefined): boolean {
    return !!session && !!session.detail && session.detail.state !== 'completed' && session.detail.state !== 'abandoned';
}
export function sessionProgress(session: ReadingSession): {
    chunksDone: number;
    chunksTotal: number;
    percent: number;
    label: string;
} {
    const detail = session.detail;
    if (!detail)
        return { chunksDone: 0, chunksTotal: 0, percent: 0, label: '未开始' };
    const total = detail.chunks.length;
    const done = Math.min(total, detail.chunkIndex + (detail.stage === 'comprehension' ? 1 : 0));
    const percent = total ? Math.round((done / total) * 100) : 0;
    return { chunksDone: done, chunksTotal: total, percent, label: stageLabel(detail.stage) };
}
// 当前段落内可标记的句子（供 UI 与测试使用）
export function sentencesOfChunk(passage: Passage, chunk: ReadingChunk | undefined) {
    if (!chunk)
        return [];
    const all = passage.sentences ?? [];
    return all.filter(s => s.start >= chunk.start && s.end <= chunk.end);
}
// 判断“这次理解是否在看过答案之后”：辅助等级 ≥3 即视为 assisted
export function isAssisted(level: number): boolean {
    return level >= 3;
}
