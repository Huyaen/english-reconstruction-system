// —— Phase 9：任务选择（真实来源，不随机凑数）——
// 优先级：当前 Mini Unit → 最近真实输入 → 最近阅读 → 薄弱词/语法 → 用户自选题。
// 兴趣只决定"更想表达什么"，绝不进入难度或能力判定。
import type { Data, OutputTaskSpec, OutputTaskType } from './types.ts';
import { buildTaskSpec, defaultTaskType } from './outputTask.ts';
import { normalizeProfile, interestFor } from './interestProfile.ts';
export interface SelectionInput {
    data: Data;
    now?: number;
    availableMinutes: number;
    energy: 'low' | 'normal' | 'good';
    preferredType?: OutputTaskType | null;
    /** 用户自选主题（自由表达）；不传则从真实来源挑 */
    topic?: string | null;
}
export interface SelectionResult {
    candidates: OutputTaskSpec[];
    task: OutputTaskSpec | null;
    note: string;
}
export function selectOutputTasks(input: SelectionInput): SelectionResult {
    const now = input.now ?? Date.now();
    const minutes = Math.max(3, Math.round(input.availableMinutes));
    const profile = normalizeProfile(input.data.settings.interests, now);
    const out: OutputTaskSpec[] = [];
    const reasons: string[] = [];
    // 1) 当前 Mini Unit：优先真实迁移/复述
    const unit = (input.data.miniUnits ?? []).find(u => u.status === 'active');
    if (unit) {
        const day = unit.dayIndex ?? 1;
        const type: OutputTaskType = day >= 3 ? 'retelling' : 'one_sentence';
        out.push(buildTaskSpec({
            taskType: type,
            topic: unit.topic || unit.theme,
            communicationGoal: day >= 3 ? '用英语复述这次单元的真实材料，并说出你的理解' : '用一句英语说出今天这份材料最重要的意思',
            sourceType: 'mini_unit',
            sourceId: unit.id,
            sourceLabel: unit.anchorTitle || unit.theme,
            targetWords: unit.targetWords.slice(0, 4),
            targetGrammar: unit.targetGrammar.slice(0, 2),
            expectedMinutes: Math.min(minutes, day >= 3 ? 15 : 8),
            difficultyEstimate: 0.4,
            reasons: [`主题单元 Day ${day}：${unit.theme}`],
            now,
            id: `otask_unit_${unit.id}_d${day}`,
        }));
        reasons.push(`当前有主题单元（Day ${day}）`);
    }
    // 2) 最近完成的真实输入（有英文总结）
    const inputs = [...(input.data.inputSessions ?? [])]
        .filter(s => s.status === 'completed' && (s.reflection?.summary || s.reflection?.mainIdea))
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
        .slice(0, 2);
    for (const s of inputs) {
        const src = (input.data.inputSources ?? []).find(x => x.id === s.sourceId);
        const topic = src?.topic || 'the video you watched';
        const interest = interestFor(profile, topic, src?.title ?? '');
        out.push(buildTaskSpec({
            taskType: minutes >= 20 ? 'paragraph_summary' : 'short_summary',
            topic,
            communicationGoal: '用英语介绍这份材料讲了什么，并说出一个你的看法',
            sourceType: 'input',
            sourceId: s.id,
            sourceLabel: src?.title || '输入练习',
            targetWords: [],
            targetGrammar: [],
            expectedMinutes: Math.min(minutes, 12),
            difficultyEstimate: 0.4,
            reasons: [`最近看过：${src?.title || s.sourceId}`, ...(interest ? [`与兴趣「${interest.label}」相关（只影响选题）`] : [])],
            now,
            id: `otask_input_${s.id}`,
        }));
    }
    // 3) 最近阅读：总结或观点
    const readings = [...(input.data.readingSessions ?? [])]
        .filter(r => r.stage >= 3 || r.detail?.stage === 'completed')
        .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
        .slice(0, 2);
    for (const r of readings) {
        const p = (input.data.passages ?? []).find(x => x.id === r.passageId);
        if (!p)
            continue;
        out.push(buildTaskSpec({
            taskType: minutes >= 20 ? 'opinion' : 'short_summary',
            topic: p.topic || p.title,
            communicationGoal: '用英语概括这篇文章的主要意思，或用一句话说明你是否同意作者',
            sourceType: 'reading',
            sourceId: r.id,
            sourceLabel: p.title,
            targetWords: [],
            targetGrammar: [],
            expectedMinutes: Math.min(minutes, 12),
            difficultyEstimate: clamp01((p.estimatedDifficulty ?? 45) / 100),
            reasons: [`最近读过：${p.title}`],
            now,
            id: `otask_reading_${r.id}`,
        }));
    }
    // 4) 薄弱词：在新语境里用出来
    const weak = (input.data.words ?? [])
        .filter(w => w.state.total > 0 && (w.state.errors > 0 || w.state.level === 'unknown' || w.state.level === 'vague'))
        .sort((a, b) => (b.state.errors - a.state.errors) || (a.recognitionScore ?? 0) - (b.recognitionScore ?? 0))
        .slice(0, 3);
    if (weak.length) {
        out.push(buildTaskSpec({
            taskType: 'transformation',
            topic: 'your own example',
            communicationGoal: `用 ${weak.map(w => w.en).join(' / ')} 各写一句和你自己生活有关的句子`,
            sourceType: 'vocabulary',
            sourceId: weak.map(w => w.id).join(','),
            sourceLabel: '薄弱词',
            targetWords: weak.map(w => w.en),
            targetGrammar: [],
            expectedMinutes: Math.min(minutes, 8),
            difficultyEstimate: 0.45,
            reasons: [`薄弱词：${weak.map(w => w.en).join(', ')}`],
            now,
            id: `otask_words_${weak.map(w => w.id).join('_')}`,
        }));
    }
    // 5) 薄弱语法
    const grammar = (input.data.grammarConcepts ?? [])
        .filter(c => c.attempts >= 2 && c.mastery < 0.6)
        .sort((a, b) => a.mastery - b.mastery)
        .slice(0, 2);
    if (grammar.length) {
        out.push(buildTaskSpec({
            taskType: 'transformation',
            topic: 'your own example',
            communicationGoal: `用 ${grammar.map(g => g.name).join(' / ')} 各写一句真实的话`,
            sourceType: 'grammar',
            sourceId: grammar.map(g => g.id).join(','),
            sourceLabel: '薄弱语法',
            targetWords: [],
            targetGrammar: grammar.map(g => g.id),
            expectedMinutes: Math.min(minutes, 8),
            difficultyEstimate: 0.5,
            reasons: [`薄弱语法：${grammar.map(g => g.name).join(', ')}`],
            now,
            id: `otask_grammar_${grammar.map(g => g.id).join('_')}`,
        }));
    }
    // 6) 自由表达（永远可用，不依赖材料）
    const freeTopic = (input.topic ?? '').trim();
    out.push(buildTaskSpec({
        taskType: 'free_expression',
        topic: freeTopic || '今天发生的一件小事',
        communicationGoal: freeTopic ? `用英语表达你对「${freeTopic}」的想法` : '用英语说说今天发生的一件小事',
        sourceType: 'free',
        sourceId: '',
        sourceLabel: '自由表达',
        targetWords: [],
        targetGrammar: [],
        expectedMinutes: Math.min(minutes, 10),
        difficultyEstimate: 0.3,
        reasons: ['自由表达：不需要材料，先写你自己的意思'],
        now,
        id: `otask_free_${freeTopic ? hash(freeTopic) : 'today'}`,
    }));
    // 用户指定了任务类型：只保留该类型（自由表达兜底）
    const filtered = input.preferredType ? out.filter(t => t.taskType === input.preferredType) : out;
    const pool = filtered.length ? filtered : out;
    const candidates = dedupe(pool).sort((a, b) => score(b, minutes, input.energy) - score(a, minutes, input.energy));
    const task = candidates[0] ?? null;
    let note = '';
    if (!task)
        note = '没有可用任务：先写一句你自己的英语也可以。';
    else if (input.data.inputSessions?.length === 0 && input.data.readingSessions?.length === 0)
        note = '还没有阅读或输入材料：这里给的是自由写作，不会假装有材料。';
    return { candidates: candidates.slice(0, 6), task, note };
}
function score(t: OutputTaskSpec, minutes: number, energy: 'low' | 'normal' | 'good'): number {
    let s = 0;
    if (t.sourceType === 'mini_unit')
        s += 50;
    if (t.sourceType === 'input')
        s += 40;
    if (t.sourceType === 'reading')
        s += 30;
    if (t.sourceType === 'vocabulary')
        s += 20;
    if (t.sourceType === 'grammar')
        s += 15;
    if (t.sourceType === 'free')
        s += 5;
    if (t.expectedMinutes <= minutes)
        s += 10;
    else
        s -= (t.expectedMinutes - minutes) * 2;
    if (energy === 'low' && t.taskType !== 'one_sentence')
        s -= 8;
    if (energy === 'good' && (t.taskType === 'paragraph_summary' || t.taskType === 'opinion'))
        s += 4;
    return s;
}
function dedupe(list: OutputTaskSpec[]): OutputTaskSpec[] {
    const seen = new Set<string>();
    const out: OutputTaskSpec[] = [];
    for (const t of list) {
        const key = `${t.taskType}|${t.sourceType}|${t.sourceId}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push(t);
    }
    return out;
}
function clamp01(n: number): number {
    return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0.4));
}
function hash(s: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(36).slice(0, 6);
}
/** 今天默认的任务类型（时间/状态决定，用户可覆盖） */
export function suggestedTypeFor(input: {
    minutes: number;
    energy: 'low' | 'normal' | 'good';
    hasSource: boolean;
    hasUnit: boolean;
}): OutputTaskType {
    return defaultTaskType(input);
}
