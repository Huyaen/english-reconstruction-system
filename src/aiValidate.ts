// —— Phase 6：结构化输出的严格校验 ——
// 只接受“完全符合契约”的对象：缺字段、类型错、枚举错、多余字段、字数越界、
// 引用不存在的目标词/语法点、证据句不在原文里 —— 一律拒绝（不猜测、不静默修补）。
export interface Issue {
    path: string;
    message: string;
}
export interface SentenceTarget {
    sentence: string;
    targetWords: string[];
    grammarTargets: string[];
    difficultyNote: string;
    chinese: string | null;
    structure: {
        clauses: Array<{
            subject: string;
            verb: string;
            object?: string;
            modifiers?: string[];
        }>;
    } | null;
    provenance: 'ai';
}
export interface ExerciseTarget {
    type: 'main_idea' | 'detail' | 'reference' | 'logic' | 'inference';
    question: string;
    options: string[];
    answerIndex: number;
    explanation: string;
    evidenceQuote: string;
}
export interface ReadingTarget {
    title: string;
    topic: string;
    passage: string;
    targetWords: string[];
    targetGrammar: string[];
    difficultyRationale: string;
    exercises: ExerciseTarget[];
}
export interface SentenceSpec {
    allowedWords: string[];
    grammarConceptIds: string[];
    maxWords: number;
    minWords: number;
}
export interface ReadingSpec {
    allowedGrammar: string[];
    minWords: number;
    maxWords: number;
    minExercises: number;
    maxExercises: number;
}
const EX_TYPES = ['main_idea', 'detail', 'reference', 'logic', 'inference'] as const;
export function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function keysOf(v: Record<string, unknown>): string[] {
    return Object.keys(v).sort();
}
function checkExactKeys(v: Record<string, unknown>, required: string[], optional: string[], path: string, issues: Issue[]): void {
    for (const k of required)
        if (!(k in v))
            issues.push({ path: `${path}.${k}`, message: '缺少必需字段' });
    for (const k of keysOf(v))
        if (!required.includes(k) && !optional.includes(k))
            issues.push({ path: `${path}.${k}`, message: '出现契约之外的字段' });
}
function str(v: unknown, path: string, issues: Issue[], min: number, max: number): string {
    if (typeof v !== 'string') {
        issues.push({ path, message: '必须是字符串' });
        return '';
    }
    const t = v.trim();
    if (t.length < min)
        issues.push({ path, message: `太短（至少 ${min} 字符）` });
    if (t.length > max)
        issues.push({ path, message: `太长（最多 ${max} 字符）` });
    return t;
}
function strArray(v: unknown, path: string, issues: Issue[], min: number, max: number): string[] {
    if (!Array.isArray(v)) {
        issues.push({ path, message: '必须是数组' });
        return [];
    }
    if (v.length < min)
        issues.push({ path, message: `至少需要 ${min} 项` });
    if (v.length > max)
        issues.push({ path, message: `最多 ${max} 项` });
    const out: string[] = [];
    v.forEach((x, i) => {
        if (typeof x !== 'string' || !x.trim())
            issues.push({ path: `${path}[${i}]`, message: '必须是非空字符串' });
        else
            out.push(x.trim());
    });
    if (new Set(out.map(x => x.toLowerCase())).size !== out.length)
        issues.push({ path, message: '存在重复项' });
    return out;
}
function wordCount(text: string): number {
    return text.trim().split(/\s+/).filter(Boolean).length;
}
export function containsWord(haystack: string, word: string): boolean {
    const w = word.trim().toLowerCase();
    if (!w)
        return false;
    const escaped = w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // 允许词形变化/派生（reconstruct → reconstructed/reconstruction），
    // 但要求左边界不是字母：不会把 "art" 误判成命中 "start"。
    return new RegExp(`(^|[^a-z])${escaped}[a-z]{0,6}([^a-z]|$)`, 'i').test(haystack);
}
// 归一化空白后比较，避免模型把空格/换行改了就当作证据
export function normalizeForCompare(s: string): string {
    return s.replace(/\s+/g, ' ').replace(/[“”"]/g, '"').replace(/[‘’']/g, "'").trim().toLowerCase();
}
export function validateSentence(v: unknown, spec: SentenceSpec): {
    value?: SentenceTarget;
    issues: Issue[];
} {
    const issues: Issue[] = [];
    if (!isRecord(v))
        return { issues: [{ path: '$', message: '输出必须是 JSON 对象' }] };
    checkExactKeys(v, ['sentence', 'targetWords', 'grammarTargets', 'difficultyNote', 'chinese', 'structure', 'provenance'], [], '$', issues);
    const sentence = str(v.sentence, '$.sentence', issues, 8, 320);
    const words = wordCount(sentence);
    if (sentence && (words < spec.minWords || words > spec.maxWords))
        issues.push({ path: '$.sentence', message: `句子词数 ${words} 超出范围 ${spec.minWords}–${spec.maxWords}` });
    if (sentence && !/[A-Za-z]/.test(sentence))
        issues.push({ path: '$.sentence', message: '句子不含英文' });
    const targetWords = strArray(v.targetWords, '$.targetWords', issues, 1, Math.max(1, spec.allowedWords.length));
    const allowed = new Set(spec.allowedWords.map(w => w.toLowerCase()));
    for (const w of targetWords)
        if (!allowed.has(w.toLowerCase()))
            issues.push({ path: '$.targetWords', message: `目标词不在允许集合里：${w}` });
    const grammarTargets = strArray(v.grammarTargets, '$.grammarTargets', issues, 1, Math.max(1, spec.grammarConceptIds.length));
    const grammarSet = new Set(spec.grammarConceptIds);
    for (const g of grammarTargets)
        if (!grammarSet.has(g))
            issues.push({ path: '$.grammarTargets', message: `语法点不在知识图谱里：${g}` });
    const difficultyNote = str(v.difficultyNote, '$.difficultyNote', issues, 8, 400);
    let chinese: string | null = null;
    if (v.chinese !== null) {
        if (typeof v.chinese !== 'string')
            issues.push({ path: '$.chinese', message: '必须是字符串或 null' });
        else
            chinese = str(v.chinese, '$.chinese', issues, 1, 400);
    }
    let structure: SentenceTarget['structure'] = null;
    if (v.structure !== null) {
        if (!isRecord(v.structure) || !Array.isArray(v.structure.clauses))
            issues.push({ path: '$.structure', message: '必须是 { clauses: [...] } 或 null' });
        else {
            const clauses: NonNullable<SentenceTarget['structure']>['clauses'] = [];
            v.structure.clauses.slice(0, 6).forEach((c, i) => {
                if (!isRecord(c)) {
                    issues.push({ path: `$.structure.clauses[${i}]`, message: '必须是对象' });
                    return;
                }
                const subject = str(c.subject, `$.structure.clauses[${i}].subject`, issues, 1, 120);
                const verb = str(c.verb, `$.structure.clauses[${i}].verb`, issues, 1, 120);
                const object = typeof c.object === 'string' ? c.object.trim() : undefined;
                const modifiers = Array.isArray(c.modifiers) ? c.modifiers.filter(x => typeof x === 'string').slice(0, 4) : undefined;
                clauses.push({ subject, verb, ...(object ? { object } : {}), ...(modifiers?.length ? { modifiers } : {}) });
            });
            structure = { clauses };
        }
    }
    if (v.provenance !== 'ai')
        issues.push({ path: '$.provenance', message: 'provenance 必须是 "ai"' });
    if (issues.length)
        return { issues };
    return { value: { sentence, targetWords, grammarTargets, difficultyNote, chinese, structure, provenance: 'ai' }, issues };
}
export function validateReading(v: unknown, spec: ReadingSpec): {
    value?: ReadingTarget;
    issues: Issue[];
} {
    const issues: Issue[] = [];
    if (!isRecord(v))
        return { issues: [{ path: '$', message: '输出必须是 JSON 对象' }] };
    checkExactKeys(v, ['title', 'topic', 'passage', 'targetWords', 'targetGrammar', 'difficultyRationale', 'exercises'], [], '$', issues);
    const title = str(v.title, '$.title', issues, 2, 120);
    const topic = str(v.topic, '$.topic', issues, 2, 60);
    const passage = str(v.passage, '$.passage', issues, spec.minWords * 4, spec.maxWords * 9);
    const words = wordCount(passage);
    if (passage && (words < spec.minWords || words > spec.maxWords))
        issues.push({ path: '$.passage', message: `正文词数 ${words} 超出范围 ${spec.minWords}–${spec.maxWords}` });
    if (/<\/?[a-z][^>]*>/i.test(passage) || /javascript:/i.test(passage))
        issues.push({ path: '$.passage', message: '正文包含 HTML/脚本片段（必须纯文本）' });
    const targetWords = strArray(v.targetWords, '$.targetWords', issues, 1, 12);
    const targetGrammar = strArray(v.targetGrammar, '$.targetGrammar', issues, 1, 8);
    const grammarSet = new Set(spec.allowedGrammar);
    for (const g of targetGrammar)
        if (!grammarSet.has(g))
            issues.push({ path: '$.targetGrammar', message: `语法点不在知识图谱里：${g}` });
    const difficultyRationale = str(v.difficultyRationale, '$.difficultyRationale', issues, 10, 500);
    const exercises: ExerciseTarget[] = [];
    if (!Array.isArray(v.exercises))
        issues.push({ path: '$.exercises', message: '必须是数组' });
    else {
        if (v.exercises.length < spec.minExercises || v.exercises.length > spec.maxExercises)
            issues.push({ path: '$.exercises', message: `题目数量需在 ${spec.minExercises}–${spec.maxExercises} 之间` });
        v.exercises.forEach((ex, i) => {
            const p = `$.exercises[${i}]`;
            if (!isRecord(ex)) {
                issues.push({ path: p, message: '必须是对象' });
                return;
            }
            checkExactKeys(ex, ['type', 'question', 'options', 'answerIndex', 'explanation', 'evidenceQuote'], [], p, issues);
            if (!EX_TYPES.includes(ex.type as ExerciseTarget['type']))
                issues.push({ path: `${p}.type`, message: `type 必须是 ${EX_TYPES.join('/')}` });
            const question = str(ex.question, `${p}.question`, issues, 6, 300);
            const options = strArray(ex.options, `${p}.options`, issues, 4, 4);
            const answerIndex = Number(ex.answerIndex);
            if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= Math.max(1, options.length))
                issues.push({ path: `${p}.answerIndex`, message: 'answerIndex 必须是 0–3 的整数' });
            const explanation = str(ex.explanation, `${p}.explanation`, issues, 6, 400);
            const evidenceQuote = str(ex.evidenceQuote, `${p}.evidenceQuote`, issues, 8, 400);
            if (evidenceQuote && passage && !normalizeForCompare(passage).includes(normalizeForCompare(evidenceQuote)))
                issues.push({ path: `${p}.evidenceQuote`, message: '证据句必须逐字来自正文（不能是模型编的）' });
            if (new Set(options.map(o => o.toLowerCase())).size !== options.length)
                issues.push({ path: `${p}.options`, message: '选项不能重复' });
            exercises.push({ type: ex.type as ExerciseTarget['type'], question, options, answerIndex, explanation, evidenceQuote });
        });
    }
    if (issues.length)
        return { issues };
    return { value: { title, topic, passage, targetWords, targetGrammar, difficultyRationale, exercises }, issues };
}
// 目标词/目标语法必须真的出现在生成内容里（大小写与词形宽松，但不放宽到“根本没出现”）
export function missingTargets(text: string, words: string[], grammarMarkers: Record<string, RegExp>): {
    missingWords: string[];
    missingGrammar: string[];
} {
    const missingWords = words.filter(w => !containsWord(text, w));
    const missingGrammar = Object.entries(grammarMarkers).filter(([, re]) => !re.test(text)).map(([id]) => id);
    return { missingWords, missingGrammar };
}
