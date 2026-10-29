/** Phase 15h.3 · 选择器作用域工具（审计、修复、回归测试共用一份实现） */

/** 顶层逗号切分：尊重 (), [], 引号与转义 */
export function splitSelectors(text) {
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

/** 拆复合选择器与组合符 */
export function splitCompounds(sel) {
  const parts = []
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

const SCOPE_ATTRS = ['data-level', 'data-page', 'data-theme']

/** 复合选择器是否只由作用域属性构成（这些属性其实都挂在 <html> 上） */
export function isScopeOnly(compound) {
  const t = compound.trim()
  if (!t) return false
  if (/^:is\((.*)\)$/s.test(t)) return splitSelectors(t.slice(4, -1)).every(isScopeOnly)
  const body = t.replace(/^html(?=[.[])/, '')
  const tokens = body.match(/\[[^\]]+\]/g) || []
  if (!tokens.length) return false
  if (body.replace(/\[[^\]]+\]/g, '').trim()) return false
  return tokens.every(tok => SCOPE_ATTRS.some(a => tok.startsWith(`[${a}`)))
}

/** 作用域祖先链长度（>=2 就是结构错误） */
export function scopeRunLength(sel) {
  const parts = splitCompounds(sel)
  let k = 0
  while (k < parts.length && isScopeOnly(parts[k].compound)) {
    if (k > 0 && parts[k].combinatorBefore !== ' ') break
    k++
  }
  return k
}

/**
 * 把"作用域属性祖先链"合并到同一个元素上：
 *   [data-level] :is([data-page="a"], [data-page="b"]) .x
 *   → :is([data-level][data-page="a"], [data-level][data-page="b"]) .x
 * 属性数量不变 ⇒ 特异性不变，级联顺序不变。
 */
export function repairScope(sel) {
  const parts = splitCompounds(sel)
  const k = scopeRunLength(sel)
  if (k < 2) return null
  const head = parts.slice(0, k).map(p => p.compound.trim())
  const attrs = head.filter(h => !h.startsWith(':is('))
  const ises = head.filter(h => h.startsWith(':is('))
  let merged
  if (ises.length) {
    const inner = ises.map(h => h.slice(4, -1)).join(', ')
    merged = ':is(' + splitSelectors(inner).map(s => attrs.join('') + s.trim()).join(', ') + ')'
  } else {
    merged = attrs.join('')
  }
  const rest = parts.slice(k).map((p, i) => (i === 0 ? ' ' : ` ${p.combinatorBefore === ' ' ? '' : p.combinatorBefore + ' '}`) + p.compound).join('')
  return merged + rest
}
