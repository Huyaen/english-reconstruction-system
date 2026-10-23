// —— Phase 11：考试练习进入每日计划 ——
// 默认关闭；只有用户显式开启且存在未做过的题时才生成，低优先级、短时长、可跳过。
// 考试不是必修课：任何题做过就不再重复占用计划。
import type { AssessmentItem, ExamSession } from './examTypes.ts';
import { freshExamItems } from './weeklyAssessment.ts';
export interface ExamPlanTask {
    minutes: number;
    itemId: string;
    label: string;
    reasons: string[];
}
export function planExamTask(args: {
    enabled: boolean;
    items: AssessmentItem[];
    sessions: ExamSession[];
    availableMinutes: number;
    now: number;
    preferredSkill?: string | null;
}): ExamPlanTask | null {
    if (!args.enabled || args.availableMinutes < 6)
        return null;
    const fresh = freshExamItems(args.items, args.sessions, { skillPrefix: args.preferredSkill ?? undefined });
    if (!fresh.length)
        return null;
    const pick = fresh.slice().sort((a, b) => a.estimatedTimeMinutes - b.estimatedTimeMinutes || a.id.localeCompare(b.id))[0];
    if (pick.estimatedTimeMinutes > args.availableMinutes)
        return null;
    return {
        minutes: Math.min(10, Math.max(5, pick.estimatedTimeMinutes)),
        itemId: pick.id,
        label: '考试迁移练习 · 1 题',
        reasons: ['exam-fresh-item', args.preferredSkill ? `exam-focus-${args.preferredSkill}` : 'exam-mixed', 'exam-optional'],
    };
}
