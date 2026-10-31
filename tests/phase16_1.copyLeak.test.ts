/**
 * Phase 16.1 · 文案泄漏防回归
 *
 * 上一轮的教训：phase16-forbidden-scan 只匹配固定英文术语白名单，所以
 *   ai-unavailable-reallocated / game_content / phase5 / curated / comfort / My English Library
 * 全部漏过，还给出了「0 命中」的假安全感。
 *
 * 这一组测试做三件事：
 *   1) 负控：把已知的坏文案喂给检测器，必须报出来（防止检测器退化成 no-op）；
 *   2) 正控：学习内容、品牌名、技术字段必须豁免（防止变成「见英文就报」）；
 *   3) 全量：扫真实 src/，要求 0 残留；并锁死展示映射表里不含内部值。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { lintVisible, lintSource, lintProject } from '../scripts/lib/copyLint.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test('负控：内部原因代码必须被检出', () => {
    const hits = lintVisible('计划比例现在是：练习句 60%。原因：ai-unavailable-reallocated');
    assert.ok(hits.some(h => h.rule === 'reason-code'), JSON.stringify(hits));
});

test('负控：snake_case 枚举与原始状态值必须被检出', () => {
    assert.ok(lintVisible('全部类型 game_content').some(h => h.rule === 'snake-case' || h.rule === 'raw-enum'));
    assert.ok(lintVisible('今天是 comfort').some(h => h.rule === 'raw-enum'));
    assert.ok(lintVisible('条目 curated').some(h => h.rule === 'raw-enum'));
});

test('负控：阶段号、英文标题、假精度、样本比较式必须被检出', () => {
    assert.ok(lintVisible('从阅读带过来的句子 未上线（phase5）').some(h => h.rule === 'phase-number'));
    assert.ok(lintVisible('My English Library').some(h => h.rule === 'english-heading'));
    assert.ok(lintVisible('大概掌握 25.0%').some(h => h.rule === 'fake-precision'));
    assert.ok(lintVisible('样本 0 < 最少 1，不展示为结论。').some(h => h.rule === 'sample-compare'));
});

test('正控：学习内容、品牌名与已解释技术词必须豁免', () => {
    for (const ok of ['abandon 放弃', 'YouTube · 纪录片', '主谓宾（SVO）', 'API 密钥', 'JSON Mode', 'AI 服务地址', '作答 12 次 · 正确率 83%'])
        assert.deepEqual(lintVisible(ok), [], ok);
});

test('正控：模板里的 ${...} 与 HTML 标签不产生误报', () => {
    assert.deepEqual(lintVisible('<span class="badge">${labels[w.state.level]}</span>'), []);
});

test('默认放行：行内 copy-lint:allow 能压掉特定规则', () => {
    const src = 'const x = "<b>debug code: a-b-c</b>"; // copy-lint:allow reason-code\n';
    assert.deepEqual(lintSource(src, 'demo.ts'), []);
});

test('全量：src/ 没有内部代码、阶段号、英文枚举残留', () => {
    const r = lintProject(join(ROOT, 'src'), fs, path);
    assert.equal(r.hits, 0, `仍有残留：\n${r.detail.map(h => `${h.file}:${h.line} [${h.rule}] ${h.token} :: ${h.snippet}`).join('\n')}`);
    assert.ok(r.files > 80, `扫描文件数异常：${r.files}`);
});

test('展示映射表：只允许把内部值当键，不允许把内部值当文案', async () => {
    const mod = await import('../src/uiLabels.ts');
    for (const [k, v] of Object.entries(mod.CAPABILITY_NEED_TEXT))
        assert.ok(!/phase/i.test(String(v)), `能力缺口说明仍含阶段号：${k} → ${v}`);
    for (const map of [mod.SOURCE_TEXT, mod.STRUCTURE_TEXT, mod.INPUT_TYPE_TEXT, mod.PRIORITY_TEXT])
        for (const v of Object.values(map)) assert.ok(!/^[a-z][a-z_-]*$/.test(String(v)), `枚举值被直接当文案：${v}`);
    assert.ok(mod.PRIORITY_LEGEND.includes('不是分数'), '优先度说明缺失或未解释字母含义');
});

test('输入筛选的下拉标签覆盖全部枚举（不静默漏项）', async () => {
    const mod = await import('../src/uiLabels.ts');
    assert.deepEqual(Object.keys(mod.INPUT_STATUS_TEXT).sort(), ['archived', 'saved', 'used']);
    assert.deepEqual(Object.keys(mod.INPUT_TYPE_TEXT).sort(), ['article', 'bilibili', 'documentary', 'esports', 'game_content', 'online_video', 'other', 'series_clip', 'youtube']);
    for (const v of Object.values(mod.INPUT_TYPE_TEXT)) assert.ok(!/^[a-z_]+$/.test(v), `枚举仍是原值：${v}`);
});
