export interface CopyHit {
    file?: string;
    line?: number;
    rule: string;
    token: string;
    text?: string;
    snippet?: string;
}

export const EXEMPT: Set<string>;
export const ENUM_VALUES: string[];
export const EXEMPT_FILES: Set<string>;

export function textOnly(raw: string): string;
export function lintVisible(raw: string, opts?: { ruleAllow?: string[] }): CopyHit[];
export function lintSource(source: string, file: string): CopyHit[];
export function summarize(hits: CopyHit[], files: number): { files: number; hits: number; byRule: Record<string, number> };
export function lintProject(srcDir: string, fsMod: typeof import('node:fs'), pathMod: typeof import('node:path')): {
    files: number;
    hits: number;
    byRule: Record<string, number>;
    detail: CopyHit[];
};
