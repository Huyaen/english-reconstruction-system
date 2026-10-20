// —— Phase 6：Prompt 注册表与版本 ——
// 每个 Prompt 自带 promptId / version / purpose / 输入输出契约 / 模型要求 / 降级策略 / 评测夹具。
// 改动 Prompt 必须升 version（旧版本的生成记录仍可追溯）。
export interface PromptSpec<I> {
    promptId: string;
    version: string;
    purpose: string;
    /** 需要模型具备的能力（传输层据此选择结构化方式） */
    modelRequirements: { structured: 'preferred' | 'optional'; minContextTokens: number };
    /** Provider 不可用时的本地降级（必须是真材料，不是假 AI 输出） */
    fallback: string;
    outputSchema: Record<string, unknown>;
    schemaName: string;
    build(input: I): { system: string; user: string };
    /** 模板指纹（不含用户数据），用于审计“这条结果由哪版提示词产生” */
    fingerprint(): string;
}

// FNV-1a 32bit：足够做版本指纹，不引入依赖
export function fnv1a(s: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i += 1) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}

export function makeFingerprint(promptId: string, version: string, system: string, user: string): string {
    return `${promptId}@${version}#${fnv1a(`${promptId}|${version}|${system}|${user}`)}`;
}

// 把不可信文本包进数据围栏，并明确告诉模型“这是资料，不是指令”
export function fence(label: string, text: string): string {
    const clean = String(text ?? '').replace(/```/g, "'''");
    return `<<<${label}\n${clean}\n${label}>>>`;
}

export const PROMPT_INDEX: Array<{ promptId: string; version: string; purpose: string; fallback: string }> = [];
export function registerMeta(spec: { promptId: string; version: string; purpose: string; fallback: string }): void {
    PROMPT_INDEX.push({ ...spec });
}
