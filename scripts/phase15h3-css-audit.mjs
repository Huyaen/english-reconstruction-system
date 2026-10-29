/**
 * Phase 15h.3 · CSS 规则权威清单（静态部分）
 *
 * 用 postcss 解析真实参与构建的 CSS，逐条规则输出：
 *   稳定 ID / 来源文件 / 行号 / 选择器 / at-rule 条件组 / 声明数 / 作用域形状
 *
 * 只做"读"：不改任何 CSS。分类需要浏览器实测命中，见 phase15h3-css-probe.mjs。
 *
 * 用法：node scripts/phase15h3-css-audit.mjs
 * 输出：screenshots/phase15h3/css-rule-audit.json（静态骨架）
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import postcss from 'postcss'

const ROOT = process.cwd()

// app.ts 里的真实 import 顺序（层面：先 tokens/style，最后 system + pages）
const ENTRY = [
  'src/tokens.css',
  'src/style.css',
  'src/proto15c.css',
  'src/proto15c-v2.css',
  'src/proto15c-b3.css',
  'src/proto15c-b4.css',
  'src/reading15c.css',
  'src/reading15c-v2.css',
  'src/reading15d.css',
  'src/cinematic15d.css',
  'src/ui/system.css',
  'src/ui/pages/quiz.css',
  'src/ui/pages/mgmt.css',
  'src/ui/pages/reading.css',
  'src/ui/pages/sentence-grammar.css',
  'src/ui/pages/io.css',
  'src/ui/pages/data.css',
]

const SCOPE_ATTRS = ['data-level', 'data-page', 'data-theme']

/** 顶层逗号切分：尊重 (), [], 引号与转义。选择器列表不能用 split(',')。 */
function splitSelectors(text) {
  const out = []
  let depth = 0, quote = null, buf = ''
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote) {
      buf += c
      if (c === '\\') { buf += text[++i] ?? ''; continue }
      if (c === quote) quote = null
      continue
    }
    if (c === '"' || c === "'") { quote = c; buf += c; continue }
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    if (c === ',' && depth === 0) { out.push(buf.trim()); buf = ''; continue }
    buf += c
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

/** 拆复合选择器与组合符（后代、>、+、~ 只在不处于括号内时算） */
function splitCompounds(sel) {
  const parts = []          // { compound, combinatorBefore }
  let depth = 0, quote = null, buf = '', comb = ''
  const push = () => { if (buf.trim()) parts.push({ compound: buf.trim(), combinatorBefore: comb }); buf = '' }
  for (let i = 0; i < sel.length; i++) {
    const c = sel[i]
    if (quote) { buf += c; if (c === '\\') { buf += sel[++i] ?? ''; continue } if (c === quote) quote = null; continue }
    if (c === '"' || c === "'") { quote = c; buf += c; continue }
    if (c === '(' || c === '[') depth++
    else if (c === ')' || c === ']') depth--
    if (depth === 0) {
      if (c === ' ' || c === '\n' || c === '\t') { push(); comb = ' '; continue }
      if (c === '>' || c === '+' || c === '~') { push(); comb = c; continue }
    }
    buf += c
  }
  push()
  return parts
}

/** 复合选择器是否"只由作用域属性构成"（可合并到 <html> 上） */
function isScopeOnly(compound) {
  const t = compound.trim()
  if (!t) return false
  if (/^:is\((.*)\)$/s.test(t)) {
    const inner = t.slice(4, -1)
    return splitSelectors(inner).every(s => isScopeOnly(s))
  }
  // 允许 html 前缀
  const body = t.replace(/^html(?=[[\[])/, '')
  const tokens = body.match(/\[[^\]]+\]/g) || []
  if (!tokens.length) return false
  const rest = body.replace(/\[[^\]]+\]/g, '').trim()
  if (rest) return false
  return tokens.every(tok => SCOPE_ATTRS.some(a => tok.startsWith(`[${a}`)))
}

function scopeAttrsIn(sel) {
  const out = new Set()
  for (const a of SCOPE_ATTRS) if (new RegExp(`\\[${a}[\\]=]`).test(sel) || sel.includes(`[${a}]`)) out.add(a)
  return [...out]
}

/** 生成"合并作用域祖先"后的修复选择器（保持属性数量 => 特异性不变） */
function repairScope(sel) {
  const parts = splitCompounds(sel)
  let k = 0
  while (k < parts.length && isScopeOnly(parts[k].compound)) {
    if (k > 0 && parts[k].combinatorBefore !== ' ') break
    k++
  }
  if (k < 2) return null
  const head = parts.slice(0, k).map(p => p.compound.trim())
  // [data-level] + :is([data-page="a"], [data-page="b"]) => :is([data-level][data-page="a"], ...)
  const attrs = head.filter(h => !h.startsWith(':is('))
  const ises = head.filter(h => h.startsWith(':is('))
  let merged
  if (ises.length) {
    const inner = ises.map(h => h.slice(4, -1)).join(', ')
    merged = ':is(' + splitSelectors(inner).map(s => attrs.join('') + s.trim()).join(', ') + ')'
  } else {
    merged = attrs.join('')
  }
  // html 前缀要去重：:is([data-level][data-page=...]) 已能匹配 html
  const restSel = parts.slice(k).map((p, i) => (i === 0 ? ' ' : ` ${p.combinatorBefore === ' ' ? '' : p.combinatorBefore + ' '}`) + p.compound).join('')
  return merged + restSel
}

const rules = []
let order = 0
for (const [fileIdx, relPath] of ENTRY.entries()) {
  const abs = join(ROOT, relPath)
  const css = readFileSync(abs, 'utf8')
  const root = postcss.parse(css, { from: abs })
  const walk = (node, ctx) => {
    node.each(child => {
      if (child.type === 'atrule') {
        const nextCtx = ctx.concat([`@${child.name} ${child.params}`.trim()])
        if (child.nodes) walk(child, nextCtx)
        return
      }
      if (child.type !== 'rule' || !child.selector) return
      const selectors = splitSelectors(child.selector)
      const scope = selectors.flatMap(scopeAttrsIn)
      if (!scope.length) return
      order++
      rules.push({
        id: `R${String(order).padStart(3, '0')}`,
        file: relPath,
        fileOrder: fileIdx,
        line: child.source?.start?.line ?? 0,
        column: child.source?.start?.column ?? 0,
        context: ctx,
        selectorText: child.selector.trim(),
        selectors,
        declarations: child.nodes.filter(n => n.type === 'decl').length,
        scopeAttrs: [...new Set(scope)],
        scopeOnlyAncestors: selectors.map(s => {
          const parts = splitCompounds(s)
          let k = 0
          while (k < parts.length && isScopeOnly(parts[k].compound)) k++
          return k
        }),
        repaired: selectors.map(repairScope),
        needsRepair: selectors.map(s => repairScope(s) !== null),
      })
    })
  }
  walk(root, [])
}

const out = join(ROOT, 'screenshots', 'phase15h3')
mkdirSync(out, { recursive: true })
const payload = {
  generatedAt: new Date().toISOString(),
  entries: ENTRY.map(f => relative(ROOT, join(ROOT, f)).replace(/\\/g, '/')),
  counts: {
    ruleBlocks: rules.length,
    selectors: rules.reduce((n, r) => n + r.selectors.length, 0),
    brokenSelectors: rules.reduce((n, r) => n + r.needsRepair.filter(Boolean).length, 0),
  },
  rules,
}
writeFileSync(join(out, 'css-rule-audit.json'), JSON.stringify(payload, null, 2))
console.log(JSON.stringify({ ruleBlocks: payload.counts.ruleBlocks, selectors: payload.counts.selectors, brokenSelectors: payload.counts.brokenSelectors }))
