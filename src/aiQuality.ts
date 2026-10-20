// —— Phase 6：AI 内容质量门（生成结果能不能进学习系统的唯一闸门）——
// 八道检查：Schema（在 aiValidate 里）/ 词数 / 目标词 / 目标语法 / 难度理智性 /
//          重复 / 来源归属 / 安全渲染。任何 blocking 失败都拒绝入库（重试或放弃）。
import { containsWord, normalizeForCompare, type ReadingTarget, type SentenceTarget } from './aiValidate.ts';
export interface QualityCheck {
    id: 'schema' | 'word-count' | 'target-words' | 'target-grammar' | 'difficulty' | 'duplicate' | 'attribution' | 'safety' | 'unknown-load';
    label: string;
    ok: boolean;
    blocking: boolean;
    detail: string;
}
export interface QualityReport {
    ok: boolean;
    checks: QualityCheck[];
}
export type DifficultyBand = 'easy' | 'medium' | 'hard';
const BAND_RANK: Record<DifficultyBand, number> = { easy: 0, medium: 1, hard: 2 };
// 语法点的“可见标记”：只对能被可靠观察到的结构给正则；
// 语义型/结构型概念（如“句子主干”“定语从句的先行词定位”）不做正则断言，
// 标为 unverifiable —— 绝不假装验证过。
const MARKERS: Record<string, RegExp> = {
    'clause.relative': /\b(which|who|whom|whose|that)\b/i,
    'clause.object': /\b(that|whether|if|what|who|how)\b/i,
    'clause.adverbial': /\b(when|while|because|although|though|since|unless|if|after|before|as soon as)\b/i,
    'clause.subject': /^(what|whether|that|who|how)\b/i,
    'clause.predicative': /\b(be|is|was|were|seems?|becomes?)\b[^.!?]*\b(that|what|whether|because|why|how)\b/i,
    'nonfinite.gerund': /\b\w+ing\b/i,
    'nonfinite.participle': /\b(\w+ing|\w+ed)\b[ ,]/i,
    'nonfinite.infinitive': /\bto\s+[a-z]+\b/i,
    'verb.tense': /\b(is|are|was|were|has|have|had|will|would|did|does|do)\b/i,
    'verb.aspect': /\b(is|are|was|were|has|have|had)\s+\w+(ing|ed|en)\b/i,
    'verb.passive': /\b(is|are|was|were|be|been|being|has been|have been)\s+\w+(ed|en)\b/i,
    'verb.modal': /\b(can|could|may|might|must|should|would|will|shall)\b/i,
    'phrase.preposition': /\b(in|on|at|by|with|for|from|of|about|under|over|between)\b/i,
    'phrase.preposition-gerund': /\b(in|on|at|by|with|for|from|of|about|without|after|before)\s+\w+ing\b/i,
    'phrase.coordination': /\b(and|or|but|nor|yet|so)\b/i,
    'logic.comparison': /\b(more|most|less|least|-er than|as \w+ as)\b/i,
    'logic.negation': /\b(not|never|no|none|nobody|nothing|neither|nor)\b/i,
    'logic.reference': /\b(it|they|them|this|that|these|those|he|she|his|her|their)\b/i,
    'logic.connection': /\b(however|therefore|moreover|furthermore|nevertheless|instead|meanwhile|thus|hence|so)\b/i,
};
export function grammarMarker(id: string): RegExp | null {
    return MARKERS[id] ?? null;
}
export function grammarObservable(ids: string[]): {
    observable: string[];
    unverifiable: string[];
} {
    return {
        observable: ids.filter(id => MARKERS[id]),
        unverifiable: ids.filter(id => !MARKERS[id]),
    };
}
function words(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
}
function noMarkup(text: string): boolean {
    if (/<\/?[a-z][^>]*>/i.test(text))
        return false;
    if (/javascript:|data:text\/html|onerror\s*=/i.test(text))
        return false;
    // 控制字符（除换行/制表）
    return !/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(text);
}
function bandOfSentence(sentence: string): DifficultyBand {
    const n = words(sentence);
    const clauses = (sentence.match(/\b(which|that|who|because|although|while|if|when|unless|whereas)\b/gi) ?? []).length;
    const score = n + clauses * 6;
    if (score < 16)
        return 'easy';
    if (score < 30)
        return 'medium';
    return 'hard';
}
export interface SentenceQualityContext {
    minWords: number;
    maxWords: number;
    allowedWords: string[];
    grammarIds: string[];
    desired: DifficultyBand;
    existingHashes: Set<string>;
    contentHash: string;
    unknownWords: string[];
    maxUnknownWords: number;
}
export function checkSentenceQuality(v: SentenceTarget, ctx: SentenceQualityContext): QualityReport {
    const checks: QualityCheck[] = [];
    const n = words(v.sentence);
    checks.push({
        id: 'word-count', label: '句子长度', blocking: true,
        ok: n >= ctx.minWords && n <= ctx.maxWords,
        detail: `${n} 词（要求 ${ctx.minWords}–${ctx.maxWords}）`,
    });
    const missing = ctx.allowedWords.filter(w => !containsWord(v.sentence, w));
    checks.push({ id: 'target-words', label: '目标词出现', blocking: true, ok: missing.length === 0, detail: missing.length ? `未出现：${missing.join(', ')}` : '全部出现' });
    const obs = grammarObservable(ctx.grammarIds);
    const grammarMissing = obs.observable.filter(id => !MARKERS[id].test(v.sentence));
    checks.push({
        id: 'target-grammar', label: '目标语法可观察', blocking: true,
        ok: grammarMissing.length === 0,
        detail: grammarMissing.length ? `可观察但未出现：${grammarMissing.join(', ')}` : obs.unverifiable.length ? `已出现；${obs.unverifiable.join(', ')} 无法用规则验证（标为 AI 未验证）` : '全部出现',
    });
    const band = bandOfSentence(v.sentence);
    checks.push({
        id: 'difficulty', label: '难度理智性', blocking: true,
        ok: Math.abs(BAND_RANK[band] - BAND_RANK[ctx.desired]) <= 1,
        detail: `本地估计 ${band}，目标 ${ctx.desired}`,
    });
    checks.push({
        id: 'unknown-load', label: '陌生词负荷', blocking: true,
        ok: ctx.unknownWords.length <= ctx.maxUnknownWords,
        detail: `${ctx.unknownWords.length} 个超出目标词之外的陌生词（上限 ${ctx.maxUnknownWords}）${ctx.unknownWords.length ? '：' + ctx.unknownWords.slice(0, 6).join(', ') : ''}`,
    });
    checks.push({ id: 'duplicate', label: '重复检测', blocking: true, ok: !ctx.existingHashes.has(ctx.contentHash), detail: ctx.existingHashes.has(ctx.contentHash) ? '与已有句子内容相同' : '与已有句子不同' });
    checks.push({ id: 'attribution', label: '来源归属', blocking: true, ok: v.provenance === 'ai', detail: v.provenance === 'ai' ? '标记为 AI 生成（未验证结构）' : '来源标记不正确' });
    checks.push({ id: 'safety', label: '安全渲染', blocking: true, ok: noMarkup(v.sentence), detail: noMarkup(v.sentence) ? '纯文本' : '包含 HTML/脚本/控制字符' });
    return { ok: checks.every(c => c.ok || !c.blocking), checks };
}
export interface ReadingQualityContext {
    minWords: number;
    maxWords: number;
    grammarIds: string[];
    desired: DifficultyBand;
    existingHashes: Set<string>;
    contentHash: string;
    unknownWords: string[];
    maxUnknownWords: number;
}
export function checkReadingQuality(v: ReadingTarget, ctx: ReadingQualityContext): QualityReport {
    const checks: QualityCheck[] = [];
    const n = words(v.passage);
    checks.push({ id: 'word-count', label: '正文长度', blocking: true, ok: n >= ctx.minWords && n <= ctx.maxWords, detail: `${n} 词（要求 ${ctx.minWords}–${ctx.maxWords}）` });
    const missingWords = v.targetWords.filter(w => !containsWord(v.passage, w));
    checks.push({ id: 'target-words', label: '目标词出现', blocking: true, ok: missingWords.length === 0, detail: missingWords.length ? `未出现：${missingWords.join(', ')}` : `${v.targetWords.length} 个目标词全部出现` });
    const obs = grammarObservable(ctx.grammarIds);
    const grammarMissing = obs.observable.filter(id => !MARKERS[id].test(v.passage));
    checks.push({
        id: 'target-grammar', label: '目标语法可观察', blocking: true, ok: grammarMissing.length === 0,
        detail: grammarMissing.length ? `可观察但未出现：${grammarMissing.join(', ')}` : obs.unverifiable.length ? `已出现；${obs.unverifiable.join(', ')} 无法用规则验证` : '全部出现',
    });
    // 题目证据必须逐字来自正文（validator 已查一遍，这里再作为独立检查留痕）
    const badEvidence = v.exercises.filter(e => !normalizeForCompare(v.passage).includes(normalizeForCompare(e.evidenceQuote)));
    checks.push({ id: 'attribution', label: '题目证据可回溯', blocking: true, ok: badEvidence.length === 0, detail: badEvidence.length ? `${badEvidence.length} 题证据不在正文里` : `${v.exercises.length} 题证据全部逐字来自正文` });
    const badAnswers = v.exercises.filter(e => !Number.isInteger(e.answerIndex) || e.answerIndex < 0 || e.answerIndex > 3 || new Set(e.options.map(o => o.toLowerCase())).size !== 4);
    checks.push({ id: 'schema', label: '答案键一致', blocking: true, ok: badAnswers.length === 0, detail: badAnswers.length ? `${badAnswers.length} 题答案/选项有问题` : '答案键与选项一致' });
    const band = bandOfSentence(v.passage.slice(0, 400));
    checks.push({ id: 'difficulty', label: '难度理智性', blocking: true, ok: Math.abs(BAND_RANK[band] - BAND_RANK[ctx.desired]) <= 1, detail: `本地估计 ${band}，目标 ${ctx.desired}` });
    checks.push({ id: 'unknown-load', label: '陌生词负荷', blocking: true, ok: ctx.unknownWords.length <= ctx.maxUnknownWords, detail: `${ctx.unknownWords.length} 个陌生词（上限 ${ctx.maxUnknownWords}）` });
    checks.push({ id: 'duplicate', label: '重复检测', blocking: true, ok: !ctx.existingHashes.has(ctx.contentHash), detail: ctx.existingHashes.has(ctx.contentHash) ? '与已有文章内容相同' : '与已有文章不同' });
    checks.push({ id: 'safety', label: '安全渲染', blocking: true, ok: noMarkup(v.passage) && noMarkup(v.title), detail: noMarkup(v.passage) ? '纯文本' : '包含 HTML/脚本/控制字符' });
    return { ok: checks.every(c => c.ok || !c.blocking), checks };
}
export function summarize(report: QualityReport): string {
    const bad = report.checks.filter(c => !c.ok);
    return bad.length ? bad.map(c => `${c.label}：${c.detail}`).join('；') : '全部检查通过';
}
