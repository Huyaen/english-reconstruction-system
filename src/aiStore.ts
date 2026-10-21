// —— Phase 6：AI 生成记录与用量（只存元数据与校验后的输出，不存 Key）——
import type { AIGeneration, AIUsageRecord } from './types.ts';
import type { GenMeta } from './aiGenerate.ts';
export interface BudgetState {
    allowed: boolean;
    usedTokens: number;
    limitTokens: number | null;
    dayStart: number;
}
export function startOfDay(at: number): number {
    const d = new Date(at);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}
export function usedTokensToday(gens: AIGeneration[], now: number): number {
    const start = startOfDay(now);
    return gens
        .filter(g => g.createdAt >= start)
        .reduce((sum, g) => sum + (g.usage?.promptTokens ?? 0) + (g.usage?.completionTokens ?? 0), 0);
}
// 预算按 token 计，绝不折算成“看起来真实”的人民币金额（没有可信价格信息）
export function budgetState(gens: AIGeneration[], limitTokens: number | null, now: number): BudgetState {
    const used = usedTokensToday(gens, now);
    return {
        allowed: limitTokens === null || used < limitTokens,
        usedTokens: used,
        limitTokens,
        dayStart: startOfDay(now),
    };
}
export function makeGenerationId(kind: 'sentence' | 'reading' | 'output', contentHash: string, now: number): string {
    return `${kind}-${contentHash}-${now.toString(36)}`;
}
export function buildGeneration(kind: 'sentence' | 'reading' | 'output', output: unknown, meta: GenMeta, quality: {
    ok: boolean;
    notes: string[];
}, now: number): AIGeneration {
    const usage: AIUsageRecord = { promptTokens: meta.usage.promptTokens, completionTokens: meta.usage.completionTokens, estimated: meta.usage.estimated };
    return {
        id: makeGenerationId(kind, meta.contentHash, now),
        kind,
        createdAt: now,
        promptId: meta.promptId,
        promptVersion: meta.promptVersion,
        promptHash: meta.promptHash,
        providerHost: meta.providerHost,
        model: meta.model,
        structuredMode: meta.structuredMode,
        contentHash: meta.contentHash,
        usage,
        output,
        quality,
        sourceMetadata: {
            privacy: meta.privacy,
            attempts: String(meta.attempts),
            generatedAt: new Date(meta.generatedAt).toISOString(),
        },
    };
}
// 已生成过的内容（同一指纹）直接复用，避免重复扣费；也用于“刷新后不重复生成”
export function findReusable(gens: AIGeneration[], kind: 'sentence' | 'reading' | 'output', requestKey: string): AIGeneration | null {
    return [...gens].reverse().find(g => g.kind === kind && (g.output as {
        requestKey?: string;
    } | null)?.requestKey === requestKey) ?? null;
}
export function contentHashes(gens: AIGeneration[], kind: 'sentence' | 'reading' | 'output'): Set<string> {
    return new Set(gens.filter(g => g.kind === kind).map(g => g.contentHash));
}
