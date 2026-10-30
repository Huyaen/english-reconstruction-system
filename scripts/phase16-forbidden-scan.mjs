/**
 * Phase 16 · 禁用词与英文小标题扫描（静态）
 *
 * 用法：node scripts/phase16-forbidden-scan.mjs [--all]
 * 只扫界面源码（src 下会被渲染进 DOM 的文件），不含测试、脚本、学习材料与种子数据。
 * 命中即失败（exit 1），用来防止改回去。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

const ROOT = process.cwd()
// 学习材料 / 数据种子 / 规格数据：这些不是界面文案
const SKIP = [
  'src/examSeed.ts', 'src/examSpecification.ts', 'src/sentenceSources.ts', 'src/grammar.ts',
  'src/examItems.ts', 'src/aiValidate.ts', 'src/aiProvider.ts', 'src/ocr.ts', 'src/import.ts',
  // 发给模型的提示词不是界面文案（用户看不到），不参与禁用词检查
  'src/ai.ts', 'src/prompts/reading.ts',
]
const FILES = []
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (extname(p) === '.ts' || extname(p) === '.html') FILES.push(p)
  }
}
walk(join(ROOT, 'src'))
if (!process.argv.includes('--all')) FILES.push(join(ROOT, 'index.html'))

const RULES = [
  { id: 'term-evidence', re: /证据/g, why: '「证据」→ 记录 / 表现' },
  { id: 'term-module', re: /模块/g, why: '「模块」→ 任务 / 练习' },
  { id: 'term-queue', re: /队列/g, why: '「队列」→ 这一轮' },
  { id: 'term-pool', re: /词池/g, why: '「词池」→ 词库来源' },
  { id: 'term-budget', re: /预算/g, why: '「预算」→ 可用时间' },
  { id: 'term-overnight', re: /隔夜/g, why: '「隔夜检测」→ 昨天学的还记得吗' },
  { id: 'term-retention', re: /保留率/g, why: '「保留率」→ 还记得多少' },
  { id: 'term-encode', re: /编码/g, why: '「编码」→ 第一印象' },
  { id: 'term-recall', re: /\bRecall\b/g, why: '「Recall」→ 回忆测试' },
  { id: 'term-preview', re: /\bPreview\b/g, why: '「Preview」→ 预览' },
  { id: 'term-lifecycle', re: /生命周期/g, why: '「生命周期」→ 学习阶段' },
  { id: 'term-react', re: /反应时间|平均反应/g, why: '「反应时间」→ 用时' },
  { id: 'term-diag', re: /学情诊断|诊断页/g, why: '「学情诊断」→ 学习报告' },
  { id: 'term-transfer-page', re: /考试迁移/g, why: '「考试迁移」→ 考试' },
  { id: 'term-grammar-map', re: /语法图谱/g, why: '「语法图谱」→ 语法' },
  { id: 'term-real-input', re: /真实输入|真实表达/g, why: '「真实输入/真实表达」→ 输入练习 / 写作练习' },
  { id: 'term-ai-xueqing', re: /AI 学情/g, why: '「AI 学情」→ AI 建议' },
  { id: 'term-anchor', re: /\bAnchor\b/g, why: '「Anchor」→ 材料' },
  { id: 'term-mini-unit', re: /Mini Unit/g, why: '「Mini Unit」→ 单元' },
  { id: 'term-hub', re: /Input Hub|Reading Lab|Output Lab|SENTENCE LAB|READING LAB|OUTPUT LAB|GRAMMAR MAP|REAL INPUT|MEMORY INSIGHTS|OPTIONAL INTELLIGENCE|EXAM TRANSFER|LEARNING DIAGNOSTICS|PREVIEW COMPLETE|SESSION COMPLETE|FOCUSED REVIEW|YOUR WORDBOOKS|NEW WORD PREVIEW/g, why: '英文小标题 / 英文页面名' },
  { id: 'term-dev-speak', re: /假任务|伪成功|不构成|门控|收敛|采样|归一化|兜底/g, why: '开发口径外泄' },
]

const hits = []
for (const f of FILES) {
  const rel = relative(ROOT, f).replace(/\\/g, '/')
  if (SKIP.includes(rel)) continue
  const src = readFileSync(f, 'utf8')
  const lines = src.split('\n')
  for (const rule of RULES) {
    lines.forEach((line, i) => {
      if (line.trim().startsWith('//') || line.trim().startsWith('*')) return
      // 只看字符串字面量：注释、类型名、字段名不算界面文案
      const quoted = line.match(/'[^']*'|"[^"]*"|`[^`]*`/g)
      if (!quoted) return
      const text = quoted.join(' | ')
      rule.re.lastIndex = 0
      if (rule.re.test(text)) hits.push({ file: rel, line: i + 1, rule: rule.id, why: rule.why, text: line.trim().slice(0, 130) })
    })
  }
}

const byRule = new Map()
for (const h of hits) byRule.set(h.rule, (byRule.get(h.rule) ?? 0) + 1)
console.log(JSON.stringify({ files: FILES.length, hits: hits.length, byRule: Object.fromEntries(byRule) }, null, 1))
if (hits.length) {
  for (const h of hits.slice(0, 60)) console.log(`${h.file}:${h.line} [${h.rule}] ${h.text}`)
  if (hits.length > 60) console.log(`… 还有 ${hits.length - 60} 处`)
  process.exit(1)
}
