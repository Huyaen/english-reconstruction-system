// —— Phase 9：Output → Planner ——
// 只提供"装得进剩余时间"的表达任务；任务本身由 outputSelection 依据真实材料生成。
import type { OutputTaskSpec } from './types.ts';
export interface OutputPlanDescriptor {
    kind: 'output-task';
    minutes: number;
    label: string;
    reasons: string[];
    sourceId: string;
    task: OutputTaskSpec;
}
export function planOutputTask(task: OutputTaskSpec | null, input: {
    now?: number;
    availableMinutes: number;
    energy: 'low' | 'normal' | 'good';
}): OutputPlanDescriptor | null {
    if (!task)
        return null;
    const minutes = Math.round(input.availableMinutes);
    if (minutes < 4)
        return null;
    // 时间不够就缩成"一句话"，而不是排一个写不完的段落任务
    const capped = Math.min(task.expectedMinutes, minutes);
    if (capped < 4)
        return null;
    const label = capped < task.expectedMinutes
        ? `${taskLabel(task.taskType)}（${capped} 分钟：写一句也算完成）`
        : taskLabel(task.taskType);
    return {
        kind: 'output-task',
        minutes: capped,
        label,
        sourceId: task.id,
        reasons: [`output-${task.taskType}`, `output-min-${capped}`, ...task.reasons.map(r => `src:${r}`)],
        task,
    };
}
function taskLabel(type: OutputTaskSpec['taskType']): string {
    switch (type) {
        case 'one_sentence': return '写作：写一句';
        case 'short_summary': return '写作：3–5 句总结';
        case 'paragraph_summary': return '写作：一小段';
        case 'retelling': return '写作：复述';
        case 'opinion': return '写作：说观点';
        case 'free_expression': return '写作：随便写';
        case 'transformation': return '写作：换个句式';
        case 'repair': return '写作：绕开不会的词';
        default: return '写作';
    }
}
