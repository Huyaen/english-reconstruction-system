/**
 * Phase 16.1 · 静态文案残留检测（CLI）
 *
 * 用法：node scripts/phase16_1-copy-lint.mjs [--json]
 * 退出码：0 = 无残留；1 = 有残留（打印位置与上下文）
 *
 * 与 Phase 16 的 phase16-forbidden-scan.mjs 的区别：
 *   旧扫描只匹配固定的英文术语白名单，所以英文枚举、阶段号、原因代码全部漏过。
 *   这里改成按「问题形态」检测（kebab 原因码 / snake 枚举 / phase+数字 / 原始状态值 /
 *   英文标题 / 假精度 / 样本比较式），并带豁免表与逐行 copy-lint:allow 放行机制。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintSource, summarize } from './lib/copyLint.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC = join(ROOT, 'src');

/** 学习内容/数据文件：里面的英文是学习材料或真实来源，不属于界面文案 */
const SKIP = new Set([
    'examItems.ts', 'examSeed.ts', 'readingPassages.ts', 'readingSeed.ts', 'sentences.ts',
    'prompts/reading.ts', 'aiPrompt.ts', 'ocr.ts', 'import.ts', 'aiGenerate.ts', 'aiValidate.ts',
    'aiJson.ts', 'aiQuality.ts', 'grammar.ts', 'sentenceStructure.ts',
]);

function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else if (name.endsWith('.ts')) out.push(p);
    }
    return out;
}

const files = walk(SRC).filter(f => !SKIP.has(relative(SRC, f).replace(/\\/g, '/')));
const hits = [];
for (const f of files) hits.push(...lintSource(readFileSync(f, 'utf8'), relative(SRC, f).replace(/\\/g, '/')));
const stat = summarize(hits, files.length);

if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ...stat, detail: hits }, null, 1));
}
else {
    for (const h of hits) console.log(`${h.file}:${h.line} [${h.rule}] ${h.token}\n    ${h.snippet}`);
    console.log(JSON.stringify(stat));
}
process.exit(hits.length ? 1 : 0);
