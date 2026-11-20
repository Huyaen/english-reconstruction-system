// —— Phase 6：AI 生成记录与用量（只存元数据与校验后的输出，不存 Key）——
import type { AIGeneration, AIUsageRecord } from './types.ts';
import type { GenMeta } from './aiGenerate.ts';
import { aiError, providerHost, type AIProviderConfig } from './aiProvider.ts';
import { putItems } from './db.ts';
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
        .filter(g => g.createdAt >= start && g.sourceMetadata?.metered !== 'true')
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
    const usage: AIUsageRecord = { ...meta.usage };
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
            ...(meta.metered ? { metered: 'true' } : {}),
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

let requestInFlight = false;
export function withUsageBudget(cfg: AIProviderConfig, generations: AIGeneration[]): AIProviderConfig {
    return { ...cfg, meterAttempt: async reservation => {
        if (requestInFlight) throw aiError('busy');
        const now = Date.now();
        const budget = budgetState(generations, cfg.dailyTokenBudget, now);
        if (budget.limitTokens !== null && budget.usedTokens + reservation.promptTokens + reservation.completionTokens > budget.limitTokens)
            throw aiError('budget-exceeded');
        requestInFlight = true;
        const record: AIGeneration = {
            id: `request-${crypto.randomUUID()}`, kind: 'request', createdAt: now, promptId: '', promptVersion: '', promptHash: '',
            providerHost: providerHost(cfg.endpoint), model: cfg.model, structuredMode: '', contentHash: '',
            usage: reservation, output: null, quality: { ok: false, notes: [] }, sourceMetadata: { result: 'pending' },
        };
        try {
            await putItems('aiGenerations', [record]);
            generations.push(record);
        } catch {
            requestInFlight = false;
            throw aiError('usage-storage');
        }
        return async (usage, result) => {
            try {
                const updated = { ...record, usage: usage && !usage.estimated ? usage : reservation,
                    sourceMetadata: { result, usage: usage && !usage.estimated ? 'reported' : 'reserved' } };
                await putItems('aiGenerations', [updated]);
                Object.assign(record, updated);
            } catch { throw aiError('usage-storage'); }
            finally { requestInFlight = false; }
        };
    } };
}

const deepSeekRates: Record<string, [number, number, number]> = {
    'deepseek-flash': [0.006, 0.30, 1.20],
    'deepseek-v4-pro': [0.044, 1.32, 3.96],
};
export function usageTotals(generations: AIGeneration[], since: number) {
    const result = { requests: 0, input: 0, output: 0, cached: 0, reasoning: 0, estimated: 0, peakUsd: 0, unpriced: 0 };
    for (const g of generations) {
        if (g.kind !== 'request' || g.createdAt < since) continue;
        result.requests++;
        const u = g.usage;
        if (u.estimated) { result.estimated++; continue; }
        result.input += u.promptTokens; result.output += u.completionTokens;
        result.cached += u.cacheHitTokens ?? 0; result.reasoning += u.reasoningTokens ?? 0;
        const rates = g.providerHost === 'api.deepseek.com' ? deepSeekRates[g.model] : undefined;
        if (!rates) { result.unpriced++; continue; }
        const hits = u.cacheHitTokens ?? 0;
        result.peakUsd += (hits * rates[0] + (u.promptTokens - hits) * rates[1] + u.completionTokens * rates[2]) / 1e6;
    }
    return result;
}
