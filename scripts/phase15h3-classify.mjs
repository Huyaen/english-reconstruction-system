/**
 * Phase 15h.3 · CSS 规则分类（口径统一版）
 *
 * 审计对象 = "作用域祖先链结构错误"的规则块（例如 `[data-level] [data-page=…]`
 * 这种要求两个属性分布在不同元素上的写法）。全仓共 177 个规则块 / 182 个选择器。
 *
 * 分类只针对这批选择器：
 *   A 真实失效    —— 合并作用域后能命中（目标存在，纯选择器结构错）
 *   B 条件性有效  —— 只在移动端媒体查询内 / 只在交互状态（hover、focus、disabled）命中
 *   C 历史遗留    —— 最右目标在 14 页 × 2 主题里都不存在，且类名/ID 在源码里查不到
 *   D 无法确认    —— 目标可能动态生成，或需要无法合成的状态；保留原因
 * 范围之外的规则（选择器结构正常）记 OK，不混进 A–D。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = process.cwd()
const AUDIT = join(ROOT, 'screenshots', 'phase15h3', 'css-rule-audit.json')
const MATCH = join(ROOT, 'screenshots', 'phase15h3', 'css-match.json')

const audit = JSON.parse(readFileSync(AUDIT, 'utf8'))
const match = JSON.parse(readFileSync(MATCH, 'utf8'))

const srcText = execFileSync('git', ['grep', '-h', '-e', '.', '--', 'src'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).toString()

/** 1440×900 下媒体条件是否适用 */
function mediaApplies(context) {
  for (const c of context) {
    const m = /@media\s*\(([^)]*)\)/.exec(c)
    if (!m) continue
    const body = m[1]
    const maxW = /max-width:\s*(\d+)px/.exec(body)
    const minW = /min-width:\s*(\d+)px/.exec(body)
    if (maxW && 1440 > Number(maxW[1])) return false
    if (minW && 1440 < Number(minW[1])) return false
  }
  return true
}

function identifierSeen(sel) {
  const ident = sel.match(/[.#][A-Za-z_][\w-]*/g) || []
  const bare = ident.map(s => s.slice(1)).filter(s => s.length > 2)
  if (!bare.length) return true // 纯元素/属性选择器：不据此判 C
  return bare.some(n => srcText.includes(n))
}

const countsOf = m => {
  const rows = []
  if (m) for (const theme of Object.keys(m.byTheme)) for (const page of Object.keys(m.byTheme[theme])) rows.push({ theme, page, c: m.byTheme[theme][page] })
  return rows
}

const out = []
for (const r of audit.rules) {
  const measured = match.rules[r.id]
  const applies = mediaApplies(r.context)
  const selRows = r.selectors.map((sel, i) => {
    const m = measured?.selectors?.[i]
    const rows = countsOf(m)
    const max = k => Math.max(0, ...rows.map(x => x.c[k] ?? 0))
    const row = {
      sel, broken: !!r.repaired[i], repaired: r.repaired[i],
      rawMax: max('raw'), structMax: max('struct'), fixedMax: max('fixed'), rightMax: max('right'),
    }
    if (!row.broken) return { ...row, cls: 'OK', reason: '选择器结构正常（作用域属性本来就在同一元素上）' }
    let cls, reason
    if (!applies) { cls = 'B'; reason = '仅在移动端媒体查询内（1440 桌面不适用）' }
    else if (row.fixedMax > 0) { cls = 'A'; reason = `合并作用域后命中 ${row.fixedMax}` }
    else if (row.rightMax > 0) { cls = 'B'; reason = '目标存在，当前状态不命中（hover/focus/disabled 等）' }
    else if (!identifierSeen(sel)) { cls = 'C'; reason = '目标元素与类名在源码中都不存在' }
    else { cls = 'D'; reason = '目标可能动态生成，或需要无法合成的状态' }
    const pages = rows.filter(x => (r.repaired[i] ? (x.c.fixed ?? 0) > 0 : (x.c.raw ?? 0) > 0)).map(x => `${x.theme}/${x.page}`)
    return { ...row, cls, reason, pages }
  })
  const scopeRule = selRows.some(s => s.broken)
  const worst = ['A', 'D', 'B', 'C'].find(c => selRows.some(s => s.cls === c))
  out.push({
    id: r.id, file: r.file, line: r.line, context: r.context, applies,
    scopeRule, selectorText: r.selectorText, declarations: r.declarations,
    class: scopeRule ? worst : 'OK', selectors: selRows,
  })
}

const ruleCount = c => out.filter(r => r.scopeRule && r.class === c).length
const selCount = c => out.reduce((n, r) => n + r.selectors.filter(s => s.cls === c).length, 0)
const scopeRules = out.filter(r => r.scopeRule)
const summary = {
  auditScope: {
    ruleBlocks: scopeRules.length,
    selectors: scopeRules.reduce((n, r) => n + r.selectors.filter(s => s.broken).length, 0),
    topLevel: scopeRules.filter(r => r.context.length === 0).length,
    nested: scopeRules.filter(r => r.context.length > 0).length,
    byFile: Object.fromEntries([...new Set(scopeRules.map(r => r.file))].map(f => [f, scopeRules.filter(r => r.file === f).length])),
  },
  classRules: { A: ruleCount('A'), B: ruleCount('B'), C: ruleCount('C'), D: ruleCount('D') },
  classSelectors: { A: selCount('A'), B: selCount('B'), C: selCount('C'), D: selCount('D') },
  outsideScope: out.filter(r => !r.scopeRule).length,
  mediaSkipped: scopeRules.filter(r => !r.applies).length,
}
audit.classification = { summary, rules: out }
writeFileSync(AUDIT, JSON.stringify(audit, null, 2))
console.log(JSON.stringify(summary, null, 2))
