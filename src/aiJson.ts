// —— Phase 6：模型输出 JSON 的有界修复 ——
// 只做“恢复明显可变形的部分”：代码围栏、前后废话、多余逗号、BOM。
// 不猜测语义、不补字段、不把非 JSON 硬掰成 JSON；修不好就明确失败。
export interface ParseOutcome {
    ok: boolean;
    value?: unknown;
    repaired: boolean;
    error?: string;
}
function stripFence(s: string): {
    text: string;
    changed: boolean;
} {
    const trimmed = s.trim();
    const m = /^```(?:json|JSON)?\s*\n?([\s\S]*?)\n?```\s*$/.exec(trimmed);
    if (m)
        return { text: m[1].trim(), changed: true };
    return { text: trimmed, changed: false };
}
// 扫描出第一个完整的 {...} 或 [...]（考虑字符串与转义），丢掉前后解说文字
export function extractBalanced(s: string): {
    text: string;
    changed: boolean;
} {
    const start = Math.min(...['{', '['].map(c => {
        const i = s.indexOf(c);
        return i < 0 ? Number.POSITIVE_INFINITY : i;
    }));
    if (!Number.isFinite(start) || start < 0)
        return { text: s, changed: false };
    const open = s[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < s.length; i += 1) {
        const ch = s[i];
        if (inStr) {
            if (esc)
                esc = false;
            else if (ch === '\\')
                esc = true;
            else if (ch === '"')
                inStr = false;
            continue;
        }
        if (ch === '"') {
            inStr = true;
            continue;
        }
        if (ch === open)
            depth += 1;
        else if (ch === close) {
            depth -= 1;
            if (depth === 0) {
                const text = s.slice(start, i + 1);
                return { text, changed: start !== 0 || i !== s.length - 1 };
            }
        }
    }
    return { text: s, changed: false };
}
export function removeTrailingCommas(s: string): {
    text: string;
    changed: boolean;
} {
    let out = '';
    let inStr = false;
    let esc = false;
    let changed = false;
    for (let i = 0; i < s.length; i += 1) {
        const ch = s[i];
        if (inStr) {
            out += ch;
            if (esc)
                esc = false;
            else if (ch === '\\')
                esc = true;
            else if (ch === '"')
                inStr = false;
            continue;
        }
        if (ch === '"') {
            inStr = true;
            out += ch;
            continue;
        }
        if (ch === ',') {
            let j = i + 1;
            while (j < s.length && /\s/.test(s[j]))
                j += 1;
            if (s[j] === '}' || s[j] === ']') {
                changed = true;
                continue;
            }
        }
        out += ch;
    }
    return { text: out, changed };
}
export function parseModelJson(raw: string): ParseOutcome {
    const src = String(raw ?? '').replace(/^\uFEFF/, '');
    if (!src.trim())
        return { ok: false, repaired: false, error: '模型返回了空内容' };
    let repaired = false;
    const fenced = stripFence(src);
    let text = fenced.text;
    repaired ||= fenced.changed;
    try {
        return { ok: true, value: JSON.parse(text), repaired };
    }
    catch { /* 继续修复 */ }
    const balanced = extractBalanced(text);
    if (balanced.changed) {
        text = balanced.text;
        repaired = true;
        try {
            return { ok: true, value: JSON.parse(text), repaired };
        }
        catch { /* 继续修复 */ }
    }
    const commas = removeTrailingCommas(text);
    if (commas.changed) {
        repaired = true;
        try {
            return { ok: true, value: JSON.parse(commas.text), repaired };
        }
        catch { /* 修不好 */ }
    }
    return { ok: false, repaired, error: '模型输出不是可解析的 JSON（已尝试去围栏/提取对象/去尾逗号）' };
}
