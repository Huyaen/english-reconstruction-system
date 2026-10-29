/**
 * Phase 15h.3 · 作用域选择器修复（按文件、可审阅）
 *
 * 用法：
 *   node scripts/phase15h3-selector-fix.mjs --dry src/ui/pages/mgmt.css
 *   node scripts/phase15h3-selector-fix.mjs --write src/ui/pages/mgmt.css
 *
 * 只做一件事：把"只由 data-level / data-page / data-theme 组成的祖先链"合并成一个复合选择器。
 * 不删规则、不动声明、不改顺序、不批量替换字符串。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import postcss from 'postcss'
import { splitSelectors, repairScope } from './phase15h3-selector-lib.mjs'

const args = process.argv.slice(2)
const write = args.includes('--write')
const files = args.filter(a => !a.startsWith('--'))
if (!files.length) { console.error('need a css file'); process.exit(2) }

let totalChanged = 0
for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const root = postcss.parse(src, { from: file })
  const changes = []
  root.walkRules(rule => {
    const sels = splitSelectors(rule.selector)
    let touched = false
    const next = sels.map(sel => {
      const fixed = repairScope(sel)
      if (!fixed) return sel
      touched = true
      changes.push({ sel, fixed })
      return fixed
    })
    if (touched) rule.selector = next.join(',\n')
  })
  totalChanged += changes.length
  console.log(`${write ? 'WRITE' : 'DRY'} ${file}: ${changes.length} selector(s)`)
  for (const c of changes.slice(0, 3)) console.log('  - ' + c.sel.replace(/\s+/g, ' ').slice(0, 96))
  if (changes.length > 3) console.log(`  … ${changes.length - 3} more`)
  if (write && changes.length) writeFileSync(file, root.toString())
}
console.log(JSON.stringify({ changedSelectors: totalChanged, mode: write ? 'write' : 'dry' }))
