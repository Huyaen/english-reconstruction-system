/**
 * Phase 16.2 · 文案残留检测内核（纯函数，无副作用）
 *
 * Phase 16.1 的版本按「行」判断可见性，有三个已被实测证明的盲区（fixture A–G 只抓到 2 个）：
 *   1) 跨行模板字符串整段拿不到 —— 而这个项目的界面文案大量写在跨行模板里；
 *   2) 行内出现 class= / value= / data- 就把整行当成代码位置 —— HTML 字符串几乎每行都有；
 *   3) 整串只有一个 token 且在函数调用里（esc('原因：ai-…')）被当成代码。
 * 这一版改成：用 TypeScript AST 取真正的字符串字面量，再按节点位置判定它会不会进 DOM。
 *
 * 判定顺序（先命中的先用）：
 *   含 '<'（HTML 模板）              → 可见（先剥掉不可见属性，只留文字与 title/aria-label/placeholder/alt）
 *   挂在学习内容字段上              → 不可见（text/zh/en/passage/quote/question… 是学习材料，不归文案规范管）
 *   挂在数据字段上                  → 不可见（id/type/sourceType/status/mode/basis/className…）
 *   比较运算符 / case 分支           → 不可见
 *   bare 枚举数组                    → 不可见
 *   可见函数参数（esc/toast/title/metric/modal…）→ 可见
 *   其它调用 / 标识符初值            → 含中文才算可见（英文单词很可能只是键）
 */
import { createRequire } from 'node:module';

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
    'gold', 'verified', 'manual', 'ai_unverified', 'saved', 'used', 'archived', 'authored', 'self_reported',
    'youtube', 'bilibili', 'article', 'documentary', 'esports', 'game_content', 'series_clip',
    'online_video', 'other', 'json_object', 'json_schema', 'auto', 'phase5', 'phase6',
];

/**
 * 短枚举值（active / none / light…）：单看一个词根英语单词没区别，只有出现在
 * 「状态 active」「（none）」「Light · 30–60 秒」这种位置才算泄漏。
 */
const CONTEXT_ENUM = /(?:状态|模式|字幕|来源|类型|难度|深度|级别|阶段)\s*[:：]?\s*(active|created|paused|reflection|completed|abandoned|none|en|zh|other|light|standard|deep|free|user|ai|saved|used|archived|curated|gold|verified|manual)\b/;
const PAREN_ENUM = /[（(]\s*(none|active|created|paused|reflection|completed|abandoned|en|zh|other|light|standard|deep|curated|gold|verified|manual|saved|used|archived)\s*[）)]/;
const ENGLISH_MODE = /\b(Light|Standard|Deep)\s*·/;

const REASON_CODE = /(?:^|[^\w-])([a-z]{2,}(?:-[a-z0-9]{2,}){2,})(?=$|[^\w-])/;
const SNAKE = /(?:^|[^\w])([a-z]{2,}(?:_[a-z0-9]{2,}){1,})(?=$|[^\w])/;
const PHASE = /\b(phase|Phase)\s?-?(\d{1,2})\b/;
const FAKE_PRECISION = /\d+\.\d\s?%/;
const SAMPLE_COMPARE = /样本[^，。；]{0,10}[<＜]|最少\s*\d+\s*条/;

/** 只保留文字：去掉 ${...}、标签、实体；属性值按属性名决定留不留 */
export function textOnly(raw) {
    const s = String(raw)
        .replace(/\$\{[^}]*\}/g, '\u0000')
        .replace(/<[^>]*>/g, m => {
            const keep = (m.match(/(?:title|aria-label|placeholder|alt)\s*=\s*(?:"([^"]*)"|'([^']*)')/g) || [])
                .map(a => {
                    const mm = a.match(/=\s*(?:"([^"]*)"|'([^']*)')/);
                    return mm ? (mm[1] || mm[2] || '') : '';
                })
                .join(' ');
            return ` ${keep} `;
        })
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/https?:\/\/\S+/gi, ' ');
    return s.replace(/\u0000/g, ' ').replace(/\s+/g, ' ').trim();
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
 * @param {{ruleAllow?: string[]}} opts ruleAllow：显式放行的规则（源码里写 copy-lint:allow <rule>）
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
    const ce = text.match(CONTEXT_ENUM);
    if (ce) push('raw-enum', ce[1]);
    const pe = text.match(PAREN_ENUM);
    if (pe) push('raw-enum', pe[1]);
    const em = text.match(ENGLISH_MODE);
    if (em) push('english-mode-name', em[0]);
    if (looksLikeEnglishHeading(text)) push('english-heading', text);
    const fp = text.match(FAKE_PRECISION);
    if (fp && !/25%/.test(fp[0])) push('fake-precision', fp[0].trim());
    const sc = text.match(SAMPLE_COMPARE);
    if (sc && /[<＜]/.test(sc[0])) push('sample-compare', sc[0].trim());
    return hits;
}

/** 学习材料字段：英文是内容，不是界面文案 */
const CONTENT_KEYS = new Set(['text', 'sentence', 'zh', 'en', 'word', 'example', 'passage', 'quote', 'original', 'translation', 'question', 'options', 'answer', 'body', 'content', 'meaning', 'definition', 'prompt', 'instruction', 'title', 'name', 'title_zh', 'note_zh', 'summary', 'goal', 'communicationGoal', 'purpose', 'reasons', 'preview', 'why', 'rule', 'transfer', 'commonErrors', 'trigger']);
/** 数据字段：这些键上的值是内部值，不上屏 */
const DATA_KEYS = new Set(['id', 'key', 'code', 'type', 'kind', 'source', 'sourceType', 'provenance', 'status', 'mode', 'basis', 'className', 'class', 'value', 'href', 'url', 'src', 'role', 'dataset', 'tag', 'level', 'reason', 'version', 'promptId', 'promptVersion', 'promptHash', 'model', 'providerHost', 'structuredMode', 'captionMode', 'difficulty', 'quality', 'state', 'action', 'selector', 'path', 'dir', 'ext', 'lang', 'theme', 'color', 'size', 'variant', 'intent', 'phase', 'icon', 'html', 'css', 'encoding', 'mime', 'existingId', 'requestId', 'sourceLabel', 'contentHash', 'enLabel']);
/** 可见文案助手函数 */
// 只列真正会把参数写进 DOM 的助手；不要把 span/div/section 这类 HTML 标签名放进来：
// 本项目的 HTML 都写在模板字符串里，而 section()/label() 在别处是数据构造函数（examSpecification 就是这么写的）。
const VISIBLE_CALLS = new Set(['esc', 'escAttr', 'title', 'toast', 'metric', 'modal', 'confirmModal', 'promptModal', 'errorBlock', 'emptyState', 'ariaLabel']);
/** 纯代码助手：参数是键/选择器/枚举 */
const CODE_CALLS = new Set(['push', 'warn', 'error', 'log', 'debug', 'assert', 'byId', 'qs', 'qsa', 'closest', 'querySelector', 'querySelectorAll', 'getElementById', 'createElement', 'addEventListener', 'removeEventListener', 'getAttribute', 'setAttribute', 'classList', 'includes', 'startsWith', 'endsWith', 'indexOf', 'match', 'test', 'split', 'join', 'replace', 'slice', 'Number', 'String', 'Boolean', 'parseInt', 'parseFloat', 'setItem', 'getItem', 'removeItem', 'require', 'dispatchEvent', 'navigate']);

function keyName(node) {
    if (node && node.name && typeof node.name.getText === 'function')
        return node.name.getText().replace(/^['"]|['"]$/g, '');
    return '';
}

/**
 * 判断一个字面量会不会进 DOM（导出仅供测试/诊断）。
 * @returns {'visible'|'code'}
 */
export function classify(node, text, ts) {
    const hasCjk = /[\u4e00-\u9fff]/.test(text || '');
    if (typeof text === 'string' && text.includes('<')) return 'visible'; // HTML 模板
    let p = node.parent;
    while (p) {
        if (ts.isPropertyAssignment(p) || ts.isPropertyDeclaration(p)) {
            const k = keyName(p);
            if (CONTENT_KEYS.has(k) || DATA_KEYS.has(k)) return 'code';
            return hasCjk || /\s/.test(String(text).trim()) ? 'visible' : 'code';
        }
        if (ts.isBinaryExpression(p)) {
            const op = p.operatorToken.getText();
            if (/^(===|!==|==|!=|<|>|<=|>=)$/.test(op)) return 'code';
            return hasCjk ? 'visible' : 'code';
        }
        if (ts.isCaseClause(p) || ts.isCaseBlock(p)) return 'code';
        if (ts.isArrayLiteralExpression(p)) {
            const t = String(text || '').trim();
            if (/^[a-z][a-z0-9_-]*$/i.test(t) && !/\s/.test(t)) return 'code';
            return hasCjk ? 'visible' : 'code';
        }
        if (ts.isCallExpression(p)) {
            const callee = p.expression;
            let name = '';
            if (callee && ts.isIdentifier(callee)) name = callee.getText();
            else if (callee && ts.isPropertyAccessExpression(callee)) name = callee.name.getText();
            if (VISIBLE_CALLS.has(name)) return 'visible';
            if (CODE_CALLS.has(name)) return 'code';
            return hasCjk ? 'visible' : 'code';
        }
        if (ts.isReturnStatement(p) || ts.isArrowFunction(p) || ts.isBlock(p) || ts.isSourceFile(p)) break;
        p = p.parent;
    }
    return hasCjk ? 'visible' : 'code';
}

let cachedTs = null;
const nodeRequire = createRequire(import.meta.url);
function loadTs() {
    if (cachedTs === null) {
        try {
            cachedTs = nodeRequire('typescript');
        }
        catch {
            cachedTs = false;
        }
    }
    return cachedTs || null;
}

/**
 * 扫描一个源码文件（AST 版）。
 * @param {string} source 文件内容
 * @param {string} file 文件名（用于报告）
 */
export function lintSource(source, file) {
    const hits = [];
    const ts = loadTs();
    if (!ts) return hits;
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const lines = source.split('\n');
    // copy-lint:allow <rule> 按行生效
    const allowByLine = new Map();
    lines.forEach((line, i) => {
        const found = (line.match(/copy-lint:allow\s+([\w-]+)/g) || []).map(s => s.split(/\s+/).pop());
        if (found.length) allowByLine.set(i, found);
    });
    const visit = node => {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
            const text = ts.isTemplateExpression(node)
                ? node.head.text + node.templateSpans.map(s => ' ' + s.literal.text).join('')
                : node.text;
            if (classify(node, text, ts) === 'visible') {
                const pos = sf.getLineAndCharacterOfPosition(node.getStart(sf));
                for (const h of lintVisible(text, { ruleAllow: allowByLine.get(pos.line) || [] }))
                    hits.push({ file, line: pos.line + 1, rule: h.rule, token: h.token, snippet: (lines[pos.line] || '').trim().slice(0, 160) });
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(sf);
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
    'prompts/reading.ts', 'prompts/output.ts', 'prompts/sentence.ts', 'aiPrompt.ts', 'ocr.ts', 'import.ts', 'aiGenerate.ts', 'aiValidate.ts',
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
