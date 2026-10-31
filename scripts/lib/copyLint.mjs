/**
 * Phase 16.1 · 文案残留检测内核（纯函数，无副作用）
 *
 * 设计目标不是「见到英文就报」，而是只抓那些**普通用户不该看到**的东西：
 *   1) 内部原因代码（ai-unavailable-reallocated）
 *   2) snake_case 枚举（game_content）
 *   3) 开发阶段号（phase5 / Phase 6）
 *   4) 原始状态值（curated / provisional / comfort / gold …）
 *   5) 非教学用途的英文标题（My English Library / GRAMMAR MAP）
 *   6) 假精度（25.0%）与样本比较式（样本 0 < 最少 1）
 *
 * 豁免：英语学习内容、真实来源名、用户输入、必要的技术字段（JSON / CORS / token / FSRS），
 * 以及源码里做「键」用的枚举（后面跟冒号、写在 value=/data-/class= 里）。
 */

/** 允许出现在界面上的英文：品牌、协议、已解释的技术词、英语教学缩写 */
export const EXEMPT = new Set([
    'AI', 'API', 'URL', 'JSON', 'CORS', 'OCR', 'TXT', 'CSV', 'XLSX', 'PDF', 'DOCX', 'HTML', 'MD',
    'YouTube', 'Bilibili', 'Windows', 'Edge', 'Chrome', 'Safari', 'Firefox', 'Android', 'iOS',
    'FSRS', 'BKT', 'SM', 'SVO', 'SVC', 'SVOO', 'SVOC', 'CEFR',
    'OK', 'ID', 'App', 'token', 'Token', 'Mode', 'Schema', 'Endpoint',
]);

/** 内部状态值：出现在可见文案里就是泄漏（英文学习内容不受影响，因为这些词不是单词表里的词） */
export const ENUM_VALUES = [
    'curated', 'provisional', 'comfort', 'growth', 'heuristic', 'official_confirmed', 'historical_reference',
    'gold', 'verified', 'manual', 'ai_unverified', 'saved', 'used', 'archived',
    'youtube', 'bilibili', 'article', 'documentary', 'esports', 'game_content', 'series_clip',
    'online_video', 'other', 'json_object', 'json_schema', 'auto', 'phase5', 'phase6',
];

const REASON_CODE = /(?:^|[^\w-])([a-z]{2,}(?:-[a-z0-9]{2,}){2,})(?=$|[^\w-])/;
const SNAKE = /(?:^|[^\w])([a-z]{2,}(?:_[a-z0-9]{2,}){1,})(?=$|[^\w])/;
const PHASE = /\b(phase|Phase)\s?-?(\d{1,2})\b/;
const FAKE_PRECISION = /\d+\.\d\s?%/;
const SAMPLE_COMPARE = /样本[^，。；]{0,10}[<＜]|最少\s*\d+\s*条/;

/** 把模板/HTML 里的 ${...} 去掉，只留用户会读到的字 */
export function textOnly(raw) {
    return String(raw)
        .replace(/\$\{[^}]*\}/g, '\u0000')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function tokensOf(text) {
    return (text.match(/[A-Za-z][A-Za-z_\-]*/g) || []);
}

/** 判断一个英文片段是不是「整段只有英文」的标题式文案 */
function looksLikeEnglishHeading(text) {
    const t = text.trim();
    if (t.length < 4) return false;
    if (!/^[A-Za-z][A-Za-z\s&/'’.-]*$/.test(t)) return false;
    const words = t.split(/\s+/).filter(Boolean);
    if (!words.length || words.length > 6) return false;
    return words.every(w => EXEMPT.has(w) === false);
}

/**
 * 检测一段「用户可见文本」。
 * @param {string} raw 原始片段（可含 ${} 与标签）
 * @param {{ruleAllow?: string[]}} opts ruleAllow：这一行显式放行的规则（源码里写 copy-lint:allow <rule>）
 * @returns {{rule: string, token: string, text: string}[]}
 */
export function lintVisible(raw, opts = {}) {
    const allow = new Set(opts.ruleAllow || []);
    const text = textOnly(raw);
    const hits = [];
    const push = (rule, token) => {
        if (allow.has(rule)) return;
        if (hits.some(h => h.rule === rule && h.token === token)) return;
        hits.push({ rule, token, text: text.slice(0, 120) });
    };
    const rc = text.match(REASON_CODE);
    if (rc) push('reason-code', rc[1]);
    const sn = text.match(SNAKE);
    if (sn && !ENUM_VALUES.includes(sn[1])) push('snake-case', sn[1]);
    const ph = text.match(PHASE);
    if (ph) push('phase-number', ph[0]);
    for (const tok of tokensOf(text)) {
        if (EXEMPT.has(tok)) continue;
        if (ENUM_VALUES.includes(tok)) push('raw-enum', tok);
    }
    if (looksLikeEnglishHeading(text)) push('english-heading', text);
    const fp = text.match(FAKE_PRECISION);
    if (fp && !/25%/.test(fp[0])) push('fake-precision', fp[0].trim());
    const sc = text.match(SAMPLE_COMPARE);
    if (sc && /[<＜]/.test(sc[0])) push('sample-compare', sc[0].trim());
    return hits;
}

/** 源码里这一行是否处于「用户能看到」的位置 */
function isVisibleLine(line) {
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return false;
    return /innerHTML|<[a-z/][^>]*>|title\(|toast\(|metric\(|modal\(|placeholder|aria-label|esc\(|textContent/.test(line);
}

/** 一行里枚举值是否只是当键/值/类名用（不进入可见文本） */
function isCodePosition(line, token) {
    const idx = line.indexOf(token);
    if (idx < 0) return false;
    const after = line.slice(idx + token.length, idx + token.length + 3);
    const before = line.slice(Math.max(0, idx - 120), idx);
    if (/^\s*:/.test(after)) return true;                 // { curated: … }
    if (/value=|data-|class=|id=|name=/.test(before)) return true;
    if (/===|!==|case\s+$/.test(before)) return true;
    if (/^\s*['"]?\)?[,;]?\s*$/.test(after) && /\(/.test(before)) return true; // f('saved')
    // 枚举数组：['a', 'b'] as const —— 只用于生成 value，不作为可见文案
    if (/\[\s*'[a-z_]+'(?:\s*,\s*'[a-z_]+')*\s*\]\s*as const/.test(line)) return true;
    return false;
}

/**
 * 扫描一个源码文件。
 * @param {string} source 文件内容
 * @param {string} file 文件名（用于报告）
 */
export function lintSource(source, file) {
    const hits = [];
    const lines = source.split('\n');
    lines.forEach((line, i) => {
        const allow = (line.match(/copy-lint:allow\s+([\w-]+)/g) || []).map(s => s.split(/\s+/).pop());
        if (!isVisibleLine(line)) return;
        // 只看引号内含中文或 HTML 的片段，避免把纯代码串当文案
        const lits = line.match(/(['"`])(?:\\.|(?!\1).)*\1/g) || [];
        for (const lit of lits) {
            const body = lit.slice(1, -1);
            if (!/[\u4e00-\u9fff]/.test(body) && !/</.test(body)) continue;
            const localAllow = allow.length ? allow : [];
            const found = lintVisible(body, { ruleAllow: localAllow });
            for (const h of found) {
                if (isCodePosition(line, h.token)) continue;
                hits.push({ file, line: i + 1, rule: h.rule, token: h.token, snippet: line.trim().slice(0, 160) });
            }
        }
    });
    return hits;
}

/** 汇总：{byRule, files, hits} */
export function summarize(hits, files) {
    const byRule = {};
    for (const h of hits) byRule[h.rule] = (byRule[h.rule] || 0) + 1;
    return { files, hits: hits.length, byRule };
}

/** 学习内容/数据文件：英文是学习材料或真实来源，不算界面文案 */
export const EXEMPT_FILES = new Set([
    'examItems.ts', 'examSeed.ts', 'readingPassages.ts', 'readingSeed.ts', 'sentences.ts',
    'prompts/reading.ts', 'aiPrompt.ts', 'ocr.ts', 'import.ts', 'aiGenerate.ts', 'aiValidate.ts',
    'aiJson.ts', 'aiQuality.ts', 'grammar.ts', 'sentenceStructure.ts',
]);

/**
 * 扫整个 src/。返回 {files, hits, byRule, detail}。
 * @param {string} srcDir 绝对路径
 */
export function lintProject(srcDir, fsMod, pathMod) {
    const { readdirSync, readFileSync, statSync } = fsMod;
    const { join, relative } = pathMod;
    const walk = (dir, out = []) => {
        for (const name of readdirSync(dir)) {
            const p = join(dir, name);
            if (statSync(p).isDirectory()) walk(p, out);
            else if (name.endsWith('.ts')) out.push(p);
        }
        return out;
    };
    const files = walk(srcDir).filter(f => !EXEMPT_FILES.has(relative(srcDir, f).replace(/\\/g, '/')));
    const detail = [];
    for (const f of files) detail.push(...lintSource(readFileSync(f, 'utf8'), relative(srcDir, f).replace(/\\/g, '/')));
    return { ...summarize(detail, files.length), detail };
}
