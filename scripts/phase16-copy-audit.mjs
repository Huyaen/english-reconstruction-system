/**
 * Phase 16 · 全站用户可见文案清单（审计用）
 *
 * 用法：node scripts/phase16-copy-audit.mjs
 * 产出：screenshots/phase16/copy-inventory.json + copy-inventory.md
 *
 * 为什么不用 grep：文案大量写在多行模板字符串里（innerHTML 整段），
 * 单行正则既抓不全也容易把选择器/类名混进来。这里按字符扫描字符串字面量，
 * 记录每个字面量的起止行、内容、以及它所在的函数/模板上下文，供人工逐条判定。
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

const ROOT = process.cwd()
const OUT = join(ROOT, 'screenshots', 'phase16')
const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-test', '.git', 'screenshots', 'review-export', 'coverage'])

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name) || name.startsWith('.')) continue
      walk(p, acc)
    } else if (['.ts', '.html', '.mjs'].includes(extname(p))) {
      acc.push(p)
    }
  }
  return acc
}

/** 逐字符扫描字符串字面量；返回 [{ start, end, line, quote, body }] */
function scanLiterals(src) {
  const out = []
  let i = 0
  let line = 1
  const n = src.length
  const lineAt = (idx) => {
    let l = 1
    for (let k = 0; k < idx; k++) if (src[k] === '\n') l++
    return l
  }
  while (i < n) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '/') { // 行注释
      while (i < n && src[i] !== '\n') i++
      continue
    }
    if (c === '/' && src[i + 1] === '*') {
      i += 2
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) i++
      i += 2
      continue
    }
    if (c === "'" || c === '"' || c === '`') {
      const quote = c
      const start = i
      const startLine = lineAt(start)
      i++
      let body = ''
      while (i < n) {
        if (src[i] === '\\') { body += src[i] + (src[i + 1] ?? ''); i += 2; continue }
        if (src[i] === quote) { i++; break }
        body += src[i]
        i++
      }
      out.push({ start, end: i, line: startLine, quote, body })
      continue
    }
    i++
  }
  return out
}

/** 粗略找出包含该位置的函数名（向上找最近的 `function xxx` / `const xxx =` ) */
function contextOf(src, idx) {
  const head = src.slice(0, idx)
  const re = /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)|(?:^|\n)\s*(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=/g
  let last = ''
  let m
  while ((m = re.exec(head))) last = m[1] || m[2] || ''
  return last
}

const files = walk(ROOT).filter(f => !relative(ROOT, f).startsWith('scripts/'))
const entries = []
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const rel = relative(ROOT, f).replace(/\\/g, '/')
  if (extname(f) === '.html') {
    // HTML：直接抓文本节点与属性值
    for (const m of src.matchAll(/>([^<>{}]+)</g)) {
      const text = m[1].trim()
      if (text && CJK.test(text)) entries.push({ file: rel, line: src.slice(0, m.index).split('\n').length, kind: 'html-text', text })
    }
    for (const m of src.matchAll(/(placeholder|aria-label|title|alt)="([^"]+)"/g)) {
      if (CJK.test(m[2])) entries.push({ file: rel, line: src.slice(0, m.index).split('\n').length, kind: `html-${m[1]}`, text: m[2] })
    }
    continue
  }
  for (const lit of scanLiterals(src)) {
    const body = lit.body
    if (!CJK.test(body)) continue
    // 只保留带中文的片段；模板串里的 HTML 也整段记录，方便按整块改写
    entries.push({
      file: rel,
      line: lit.line,
      kind: lit.quote === '`' ? 'template' : 'string',
      context: contextOf(src, lit.start),
      text: body.length > 1200 ? body.slice(0, 1200) + '…' : body,
    })
  }
}

mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'copy-inventory.json'), JSON.stringify({ generatedAt: new Date().toISOString(), files: files.length, entries }, null, 1))

const byFile = new Map()
for (const e of entries) byFile.set(e.file, [...(byFile.get(e.file) ?? []), e])
const md = ['# 文案清单（自动抽取）', '', `共 ${entries.length} 条含中文的用户可见字面量，分布在 ${byFile.size} 个文件。`, '']
for (const [file, list] of [...byFile.entries()].sort((a, b) => b[1].length - a[1].length)) {
  md.push(`## ${file}（${list.length}）`, '')
  for (const e of list) md.push(`- L${e.line} \`${e.context ?? ''}\` ${e.text.replace(/\s+/g, ' ').slice(0, 160)}`)
  md.push('')
}
writeFileSync(join(OUT, 'copy-inventory.md'), md.join('\n'))

const top = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 14)
console.log(JSON.stringify({ entries: entries.length, files: byFile.size, top: top.map(([f, l]) => `${f}:${l.length}`) }, null, 1))
