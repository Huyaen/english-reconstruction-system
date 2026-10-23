// —— Phase 10：诊断 → 计划优先级（显式、可回退、不改时长）——
// 只调整“柔性任务”的先后顺序；critical 记忆任务与 closing 的顺序不变。
// 诊断本身不自动改变计划权重：调用方必须显式传入 bottleneck。
import type { DiagnosticBottleneck, PlanItem } from './types.ts';
const DOMAIN_MODULE: Record<DiagnosticBottleneck['domain'], string> = {
    vocabulary: 'vocabulary',
    grammar: 'sentence',
    reading: 'reading',
    translation: 'reading',
    input: 'input',
    output: 'output',
    exam: 'exam',
};
export function boostFor(focus: DiagnosticBottleneck, module: string | undefined): number {
    return module === DOMAIN_MODULE[focus.domain] ? 20 : 0;
}
export function applyDiagnosticFocus(tasks: PlanItem[], focus: DiagnosticBottleneck | null | undefined): PlanItem[] {
    if (!focus)
        return tasks;
    const critical = tasks.filter(t => t.critical || !t.flexible);
    const flexible = tasks
        .filter(t => !t.critical && t.flexible)
        .map((task, index) => ({ task, index, score: (task.priority ?? 0) + boostFor(focus, task.module) }))
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map(x => x.task);
    return [...critical, ...flexible];
}
