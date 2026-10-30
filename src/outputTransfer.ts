// —— Phase 9：迁移与延迟产出 ——
// 迁移必须换语境、换语义内容，不能只换两个词；延迟任务为 D1/D7 预留接口。
import type { OutputTaskSpec, OutputTaskType } from './types.ts';
import { buildTaskSpec } from './outputTask.ts';
/** 迁移语境的池子：与主题无关，靠确定性哈希选，避免"随机出题" */
const CONTEXTS: {
    topic: string;
    goal: string;
}[] = [
    { topic: 'a decision you made this week', goal: '解释你为什么做了这个决定' },
    { topic: 'a game or match you watched', goal: '解释一个战术选择为什么有效' },
    { topic: 'a place in your city', goal: '描述这个地方并说明它为什么重要' },
    { topic: 'a mistake you learned from', goal: '说明发生了什么、你学到什么' },
    { topic: 'a piece of news you remember', goal: '用两三句说明它为什么值得关注' },
    { topic: 'a person who influenced you', goal: '解释这个人做了什么影响了你的选择' },
];
export interface TransferPlan {
    task: OutputTaskSpec;
    /** 迁移强度：语境/语义都换了才算 strong */
    strength: 'strong' | 'weak';
    notes: string[];
    delayDays?: number;
}
/** 为一次已修改的表达生成迁移任务：语境变化 + 语义变化 + 不提前给答案 */
export function buildTransferTask(original: OutputTaskSpec, input: {
    now?: number;
    seed?: string;
    taskType?: OutputTaskType;
} = {}): TransferPlan {
    const now = input.now ?? Date.now();
    const idx = hash(`${input.seed ?? ''}|${original.topic}|${original.id}`) % CONTEXTS.length;
    const ctx = CONTEXTS[idx]!;
    const taskType = input.taskType ?? (original.taskType === 'one_sentence' ? 'one_sentence' : 'short_summary');
    const sameTopic = ctx.topic.toLowerCase() === original.topic.toLowerCase();
    const task = buildTaskSpec({
        taskType,
        topic: ctx.topic,
        communicationGoal: `${ctx.goal}（换一个语境使用这次学到的表达）`,
        sourceType: 'free',
        sourceId: '',
        sourceLabel: `transfer of ${original.id}`,
        targetWords: original.targetWords,
        targetGrammar: original.targetGrammar,
        expectedMinutes: Math.max(5, Math.round(original.expectedMinutes * 0.8)),
        difficultyEstimate: Math.min(1, original.difficultyEstimate + 0.05),
        reasons: ['迁移验证：新语境 + 新内容，不是重复原题'],
        now,
        id: `otask_transfer_${now.toString(36)}`,
    });
    return {
        task,
        strength: sameTopic ? 'weak' : 'strong',
        notes: sameTopic ? ['场景和主题太像：这次只能算弱一点的检验。'] : ['换了场景和内容：自己写完才算真的会用。'],
    };
}
/** 延迟产出：D1/D7 再表达一次相关但不同的意思；不展示原答案 */
export function buildDelayedTask(original: OutputTaskSpec, input: {
    now?: number;
    delayDays?: number;
} = {}): TransferPlan {
    const now = input.now ?? Date.now();
    const delayDays = input.delayDays ?? 1;
    const idx = hash(`${original.id}|delayed|${delayDays}`) % CONTEXTS.length;
    const ctx = CONTEXTS[idx]!;
    const task = buildTaskSpec({
        taskType: original.taskType === 'opinion' ? 'opinion' : 'short_summary',
        topic: ctx.topic,
        communicationGoal: `${ctx.goal}（不看上次的答案，再表达一次）`,
        sourceType: 'free',
        sourceId: '',
        sourceLabel: `delayed ${delayDays}d of ${original.id}`,
        targetWords: original.targetWords,
        targetGrammar: original.targetGrammar,
        expectedMinutes: original.expectedMinutes,
        difficultyEstimate: original.difficultyEstimate,
        reasons: [`延迟产出（D${delayDays}）：检验是否还记得怎么表达`],
        now,
        id: `otask_delayed_${delayDays}_${now.toString(36)}`,
    });
    return {
        task,
        strength: 'strong',
        notes: [`延迟 ${delayDays} 天：不展示原答案，避免背诵式复现。`],
        delayDays,
    };
}
/** 迁移/延迟证据的权重：独立迁移最高，提示后完成次之 */
export function transferWeight(input: {
    independent: boolean;
    assisted: boolean;
    copied: boolean;
    strength: 'strong' | 'weak';
}): number {
    if (input.copied)
        return 0;
    if (input.strength === 'weak')
        return input.independent ? 0.4 : 0.2;
    if (input.independent)
        return 1;
    return input.assisted ? 0.5 : 0.3;
}
/** 迁移任务是否真的换了内容（防止"原句改两个词"冒充迁移） */
export function transferIsGenuine(originalTask: OutputTaskSpec, transferTask: OutputTaskSpec): boolean {
    const topicChanged = originalTask.topic.trim().toLowerCase() !== transferTask.topic.trim().toLowerCase();
    const goalChanged = originalTask.communicationGoal.trim() !== transferTask.communicationGoal.trim();
    return topicChanged && goalChanged;
}
function hash(s: string): number {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h;
}
