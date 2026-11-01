/**
 * Phase 16.2 · 检测器灵敏度与文案状态机测试
 *
 * 这一组测试的意义：Phase 16.1 的「101 文件 0 命中」被证明是假阴性——
 * 用三个受控反例（单行 HTML 里的 saved、跨行模板里的 ai_unverified、toast 里的 saved）
 * 去扫，旧内核全部漏检。所以这里先把「检测器能不能抓到已知坏事」钉死，
 * 再去相信全仓 0 命中。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import fs from 'node:fs';
import path from 'node:path';
import { lintSource, lintVisible, lintProject } from '../scripts/lib/copyLint.mjs';
import * as ui from '../src/uiLabels.ts';
import { sourceCapabilities, effectiveSourceMix } from '../src/sentenceSources.ts';
const ROOT = join(import.meta.dirname, '..');
/** fixture：每一段都是「界面上真的会出现坏文案」的最小复现 */
const FIXTURES: Array<[
    string,
    string,
    string
]> = [
    ['A 单行 HTML 里带 class 的英文枚举', 'const a = `<p class="hint">这个来源现在 saved，不能选。</p>`;', 'saved'],
    ['B 跨行模板里的结构枚举', 'const b = `<p class="chip">\n  结构 ai_unverified\n</p>`;', 'ai_unverified'],
    ['C 单行 HTML + span 包裹', 'const c = `<p><span class="chip">结构 ai_unverified</span></p>`;', 'ai_unverified'],
    ['D 跨行模板里的原因代码', 'const d = `计划已调整：\n  ai-unavailable-reallocated\n`;', 'ai-unavailable-reallocated'],
    ['E toast 里的英文枚举', "toast('这个来源现在 saved，不能选');", 'saved'],
    ['F 整串只有一个 token 的显示函数', "esc('原因：ai-unavailable-reallocated');", 'ai-unavailable-reallocated'],
    ['G 无 class 的 HTML', 'const g = `<p>这个来源现在 saved，不能选。</p>`;', 'saved'],
];
test('检测器灵敏度：7 个受控反例必须全部抓到（旧内核只抓到 2 个）', () => {
    for (const [name, src, token] of FIXTURES) {
        const hits = lintSource(src, 'fixture.ts');
        assert.ok(hits.length > 0, `漏检：${name}`);
        assert.ok(hits.some(h => h.token === token), `${name} 没抓到 ${token}：${JSON.stringify(hits)}`);
    }
});
test('回归钉子：本轮修掉的 7 条真实泄漏，源码里不能再出现', () => {
    // 这一组不是检测机制的替代品：它只钉住「已经漏过一次」的具体字符串，
    // 防止后续改动把它们原样写回来。动态证据仍以 DOM 扫描与真实截图为准。
    const pinned = [
        '状态 active',
        '（${baseline.captionMode}）',
        'Light · 30–60 秒',
        '已收藏到 Library',
        '结构 ai_unverified',
        'ai_generated（不是真实出版物）',
        'authored 教学句',
        '还没有开放',
    ];
    const walk = (dir: string, out: string[] = []): string[] => {
        for (const name of fs.readdirSync(dir)) {
            const p = join(dir, name);
            if (fs.statSync(p).isDirectory())
                walk(p, out);
            else if (name.endsWith('.ts'))
                out.push(p);
        }
        return out;
    };
    const files = walk(join(ROOT, 'src'));
    for (const bad of pinned) {
        const offenders = files.filter(f => fs.readFileSync(f, 'utf8').includes(bad));
        assert.deepEqual(offenders.map(f => f.replace(ROOT, '')), [], `泄漏又被写回来了：${bad}`);
    }
});
test('检测器不误报：学习材料、数据键、比较分支、下拉 value 都放行', () => {
    const ok = [
        "const r = { text: 'The man who came is here.', zh: '来的人在这里。' };",
        "const s = { status: 'active', mode: 'light', sourceType: 'ai' };",
        "if (status === 'active') render();",
        "const opts = ['youtube', 'bilibili', 'article'];",
        "const h = `<select><option value=\"saved\">已保存</option></select>`;",
        "toast('已收藏到素材库');",
        'const c = `<p class="hint">abandon 放弃</p>`;',
    ];
    for (const src of ok)
        assert.deepEqual(lintSource(src, 'ok.ts'), [], src);
});
test('检测器：copy-lint:allow 能按行放行', () => {
    const src = 'const x = "<b>debug code: a-b-c</b>"; // copy-lint:allow reason-code\n';
    assert.deepEqual(lintSource(src, 'demo.ts'), []);
});
test('检测器：全仓扫描 0 命中，且扫描面不只单行引号', () => {
    const r = lintProject(join(ROOT, 'src'), fs, path);
    assert.equal(r.hits, 0, `仍有残留：\n${r.detail.map(h => `${h.file}:${h.line} [${h.rule}] ${h.token}`).join('\n')}`);
    assert.ok(r.files > 80, `扫描文件数异常：${r.files}`);
});
test('映射表覆盖全部内部枚举（漏一个就会原样上屏）', () => {
    assert.deepEqual(Object.keys(ui.INPUT_SESSION_STATUS_TEXT).sort(), ['abandoned', 'active', 'completed', 'created', 'paused', 'reflection']);
    assert.deepEqual(Object.keys(ui.CAPTION_MODE_TEXT).sort(), ['en', 'none', 'other', 'zh']);
    assert.deepEqual(Object.keys(ui.INPUT_MODE_TEXT).sort(), ['deep', 'light', 'standard']);
    assert.deepEqual(Object.keys(ui.INPUT_MODE_SHORT).sort(), ['deep', 'light', 'standard']);
    assert.deepEqual(Object.keys(ui.FEEDBACK_STATUS_TEXT).sort(), ['ai', 'invalid', 'none', 'pending', 'unavailable']);
    for (const map of [ui.INPUT_SESSION_STATUS_TEXT, ui.CAPTION_MODE_TEXT, ui.INPUT_MODE_TEXT, ui.FEEDBACK_STATUS_TEXT, ui.INPUT_MODE_SHORT])
        for (const v of Object.values(map))
            assert.doesNotMatch(String(v), /^[a-z][a-z_-]*$/, `枚举值被直接当文案：${v}`);
});
test('句源说明：40/40/20 只能叫目标，不能说成现在的出题比例', () => {
    const caps = sourceCapabilities({ sentences: [], aiConfigured: true });
    const mix = effectiveSourceMix(caps);
    assert.equal(mix.mix.ai, 0);
    const counts: Record<string, number> = {};
    for (const c of caps)
        counts[c.type] = c.count;
    const note = ui.sourceMixNote({ counts });
    assert.match(note, /目标/, '40/40/20 必须明说是目标');
    assert.match(note, /不是现在的出题比例/, '不能把设计目标说成当前行为');
    assert.doesNotMatch(note, /正好按这个比例出句子/, '选句器并不按这个比例抽题');
    assert.match(note, /一句都没有/, '全部为空时必须如实说空');
});
test('掌握口径说明必须交代「质量」与「两个方向」，不能只说次数', () => {
    assert.match(ui.MASTERY_DISCLAIMER, /质量/);
    assert.match(ui.MASTERY_DISCLAIMER, /两个方向/);
});
