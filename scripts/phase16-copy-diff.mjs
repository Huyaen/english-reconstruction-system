/**
 * Phase 16 · 改前/改后界面文案对照 + 真实 DOM 禁用词检查
 * 输入：copy-live-dark.json（改前）、copy-after-dark.json / copy-after-light.json（改后）
 * 输出：copy-diff.json、copy-diff.md
 */
import { readFileSync, writeFileSync } from 'node:fs';

const dir = 'screenshots/phase16/';
const rules = [
  ['内部术语', /证据|模块|队列|词池|预算|隔夜|保留率|编码|装填|提取|迁移|学情|假任务|伪成功|门控|收敛|采样|归一化|兜底|契约|投影|管线/],
  ['英文暴露', /\b(Preview|Recall|Anchor|Mini Unit|Daily|Streak|Output Lab|Reading Lab|Sentence Lab|Input Hub|Exam Transfer|Grammar Map)\b/],
  ['括号英文注释', /（[a-z][a-z .\-]{2,}）/],
  ['系统腔', /提交成功|操作成功|保存成功|加载中\.\.\.|请稍候|系统将|将会自动/],
];

function texts(state) {
  const out = [];
  for (const b of state.blocks ?? []) if (b.text) out.push(b.text);
  for (const [k, v] of Object.entries(state.attrs ?? {})) out.push(`${k}=${v}`);
  return out;
}

function load(f) {
  return JSON.parse(readFileSync(dir + f, 'utf8'));
}

const before = load('copy-live-dark.json');
const afterDark = load('copy-after-dark.json');
const afterLight = load('copy-after-light.json');

const states = Object.keys(before.states ?? before);
const report = { states: {}, liveForbidden: { dark: [], light: [] }, summary: {} };
let removedTotal = 0;
let addedTotal = 0;

for (const s of states) {
  const b = new Set(texts(before.states?.[s] ?? {}));
  const a = new Set(texts(afterDark.states?.[s] ?? {}));
  const removed = [...b].filter(x => !a.has(x));
  const added = [...a].filter(x => !b.has(x));
  removedTotal += removed.length;
  addedTotal += added.length;
  report.states[s] = { removed, added };
}

for (const [theme, data] of [['dark', afterDark], ['light', afterLight]]) {
  for (const s of Object.keys(data.states ?? {})) {
    for (const t of texts(data.states[s])) {
      const stripped = t
        .replace(/as…as|the more…the more|TXT\/MD\/HTML|PDF|DOCX|SVO\w*/g, '')
        .replace(/\bAI\b/g, '')
        .replace(/\b[A-Za-z]+[0-9]*\b/g, m => (/^(unified|new2|Space)$/i.test(m) ? '' : m));
      for (const [name, re] of rules) {
        const m = stripped.match(re);
        if (m) report.liveForbidden[theme].push({ state: s, rule: name, hit: m[0], text: t.slice(0, 120) });
      }
    }
  }
}

report.summary = {
  states: states.length,
  removed: removedTotal,
  added: addedTotal,
  liveForbiddenDark: report.liveForbidden.dark.length,
  liveForbiddenLight: report.liveForbidden.light.length,
};

writeFileSync(dir + 'copy-diff.json', JSON.stringify(report, null, 1));

const md = ['# Phase 16 · 界面文案改前/改后对照', ''];
md.push(`- 状态数：${report.summary.states}`);
md.push(`- 消失的文案：${removedTotal} 条`);
md.push(`- 新增的文案：${addedTotal} 条`);
md.push(`- 真实 DOM 禁用词命中：dark ${report.summary.liveForbiddenDark} / light ${report.summary.liveForbiddenLight}`);
md.push('');
for (const s of states) {
  const r = report.states[s];
  md.push(`## ${s}`);
  md.push('');
  md.push(`| 改前 | 改后 |`);
  md.push(`| --- | --- |`);
  const n = Math.max(r.removed.length, r.added.length);
  for (let i = 0; i < Math.min(n, 40); i++) {
    const esc = x => (x ?? '').replace(/\|/g, '/').replace(/\n/g, ' ').slice(0, 110);
    md.push(`| ${esc(r.removed[i])} | ${esc(r.added[i])} |`);
  }
  md.push('');
}
if (report.liveForbidden.dark.length || report.liveForbidden.light.length) {
  md.push('## 真实 DOM 里的禁用词');
  md.push('');
  for (const theme of ['dark', 'light']) {
    for (const h of report.liveForbidden[theme].slice(0, 60)) {
      md.push(`- [${theme}] ${h.state} · ${h.rule} · \`${h.hit}\` · ${h.text}`);
    }
  }
}
writeFileSync(dir + 'copy-diff.md', md.join('\n'));
console.log(JSON.stringify(report.summary, null, 1));
