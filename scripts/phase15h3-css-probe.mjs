/**
 * Phase 15h.3 · CSS 命中实测（浏览器真值）
 *
 * 对静态清单里每条"作用域选择器"，在 14 个页面 × 深浅主题下测四种计数：
 *   raw      —— 原样（仅去掉 ::before/::after）
 *   struct   —— 再去掉状态伪类（:hover/:focus/:disabled/…），看"结构上是否有目标"
 *   repaired —— 把"作用域属性祖先链"合并到同一个元素后（保持属性数量=特异性）
 *   rightmost—— 只看最右复合选择器（判断目标是否根本不存在）
 *
 * 用法：node scripts/phase15h3-css-probe.mjs
 * 输出：screenshots/phase15h3/css-match.json
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'

const ROOT = process.cwd()
const PORT = Number(process.env.CDP_PORT || 11200)
const PROFILE = join(ROOT, `.p15h3-probe-${PORT}`)
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = 'http://127.0.0.1:4173/?test=1&proto=d'
const PAGES = ['home', 'books', 'weak', 'sentence', 'reading', 'input', 'output', 'grammar', 'unit', 'diagnostics', 'exam', 'stats', 'ai', 'settings']
const THEMES = ['dark', 'light']
const AUDIT = join(ROOT, 'screenshots', 'phase15h3', 'css-rule-audit.json')
const OUT = join(ROOT, 'screenshots', 'phase15h3', 'css-match.json')
const sleep = ms => new Promise(r => setTimeout(r, ms))

const waitPort = (p, t = 30000) => new Promise((res, rej) => {
  const t0 = Date.now()
  const tick = () => { const s = connect(p, '127.0.0.1'); s.once('connect', () => { s.destroy(); res() }); s.once('error', () => { s.destroy(); Date.now() - t0 > t ? rej(new Error('devtools timeout')) : setTimeout(tick, 250) }) }
  tick()
})

const main = async () => {
  const audit = JSON.parse(readFileSync(AUDIT, 'utf8'))
  // 只测需要修的作用域选择器 + 同规则里未坏的兄弟选择器（用于对照）
  const targets = []
  for (const r of audit.rules) {
    r.selectors.forEach((sel, i) => {
      targets.push({ rid: r.id, file: r.file, line: r.line, context: r.context, sel, rep: r.repaired[i], broken: !!r.repaired[i], idx: i })
    })
  }

  if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true })
  mkdirSync(PROFILE, { recursive: true })
  const edge = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900',
    '--no-first-run', '--no-default-browser-check', BASE], { stdio: 'ignore', windowsHide: true })

  let ws
  const result = { viewport: '1440x900', generatedAt: new Date().toISOString(), pages: {}, rules: {} }
  try {
    await waitPort(PORT)
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    const tab = list.find(t => t.type === 'page' && t.url.includes('127.0.0.1'))
    ws = new WebSocket(tab.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    let id = 500
    const call = (method, params = {}) => new Promise(res => {
      const my = ++id
      const on = e => { const m = JSON.parse(e.data); if (m.id === my) { ws.removeEventListener('message', on); res(m) } }
      ws.addEventListener('message', on); ws.send(JSON.stringify({ id: my, method, params }))
    })
    const ev = async expr => {
      const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval error')
      return r.result?.result?.value
    }
    await call('Runtime.enable')
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    for (let i = 0; i < 50; i++) { if ((await ev(`document.querySelectorAll('[data-nav]').length`)) >= 5) break; await sleep(400) }

    await ev(readFileSync(join(ROOT, 'scripts', 'phase15h3-helpers.js'), 'utf8'))


    // 每页进入"有内容的状态"，否则 .lab-option / .concept-card 这类规则全部测成 0
    const SETUP = {
      sentence: `(async () => {
        document.querySelector('[data-sentence-start]')?.click()
        for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 80)); if (document.querySelector('.lab-option')) break }
        return !!document.querySelector('.lab-option')
      })()`,
      grammar: `(async () => {
        for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 80)); if (document.querySelector('.concept-card')) break }
        return !!document.querySelector('.concept-card')
      })()`,
      reading: `(async () => {
        const t = document.querySelector('#read-title'), p = document.querySelector('#read-paste')
        if (t && p) {
          t.value = 'Rule Audit Passage'; t.dispatchEvent(new Event('input', { bubbles: true }))
          p.value = 'The aqueducts carried water across the valley for four centuries. Engineers measured the slope with simple tools, and the city grew around that steady supply. When the pipes failed, the repair took months, because every stone had to be replaced by hand.'
          p.dispatchEvent(new Event('input', { bubbles: true }))
          await new Promise(r => setTimeout(r, 300))
          document.querySelector('[data-read-save="paste"]')?.click()
          await new Promise(r => setTimeout(r, 1200))
          document.querySelector('[data-read-start]')?.click()
          await new Promise(r => setTimeout(r, 1200))
          document.querySelector('[data-read-cold-submit]')?.click()
          for (let i = 0; i < 40; i++) { await new Promise(r => setTimeout(r, 100)); if (document.querySelector('.reader-text, #read-text')) break }
          document.querySelector('.reader-side-toggle, [data-read-side]')?.click()
          await new Promise(r => setTimeout(r, 600))
        }
        return !!document.querySelector('.reader-text, #read-text')
      })()`,
      exam: `(async () => {
        document.querySelector('[data-exam-tab="overview"]')?.click(); await new Promise(r => setTimeout(r, 500));
        document.querySelector('#exam-start-mixed')?.click()
        for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 100)); if (document.querySelector('.exam-option')) break }
        if (!document.querySelector('.exam-option')) { for (let k = 0; k < 6; k++) { document.querySelector('#exam-next')?.click(); await new Promise(r => setTimeout(r, 200)); if (document.querySelector('.exam-option')) break } }
        return !!document.querySelector('.exam-option')
      })()`,
      output: `(async () => {
        document.querySelector('[data-out-start]')?.click()
        for (let i = 0; i < 50; i++) { await new Promise(r => setTimeout(r, 80)); if (document.querySelector('#out-editor')) break }
        return !!document.querySelector('#out-editor')
      })()`,
      input: `(async () => {
        document.querySelector('button.primary')?.click()
        await new Promise(r => setTimeout(r, 900))
        return !!document.querySelector('#main')
      })()`,
      diagnostics: `(async () => {
        document.querySelector('.diag-more summary, details summary')?.click()
        await new Promise(r => setTimeout(r, 400))
        return true
      })()`,
      books: `(async () => {
        document.querySelector('#preview-lib')?.click()
        await new Promise(r => setTimeout(r, 900))
        return true
      })()`,
    }

    const setTheme = async theme => {
      for (let i = 0; i < 4; i++) {
        if ((await ev(`document.documentElement.dataset.theme`)) === theme) return true
        await ev(`document.querySelector('#theme')?.click()`); await sleep(520)
      }
      return false
    }
    const goto = async page => {
      await ev(`(async () => { document.querySelector('[data-nav="${page}"]')?.click(); await new Promise(r => setTimeout(r, 900)); return true })()`)
      return ev(`document.documentElement.dataset.page`)
    }

    for (const theme of THEMES) {
      await setTheme(theme)
      result.pages[theme] = {}
      for (const page of PAGES) {
        const landed = await goto(page)
        const stateReached = SETUP[page] ? await ev(SETUP[page]) : null
        // 单次 evaluate 内测完所有选择器：避免上千次 IPC 把页面状态搅乱
        if (await ev('typeof window.__h3') !== 'object') {
          await ev(readFileSync(join(ROOT, 'scripts', 'phase15h3-helpers.js'), 'utf8'))
        }
        const counts = await ev("window.__h3.measure(" + JSON.stringify(targets.map(t => ({ sel: t.sel, rep: t.rep }))) + ")")
        result.pages[theme][page] = { landed, stateReached }
        targets.forEach((t, ci) => {
          const key = t.rid
          if (!result.rules[key]) result.rules[key] = { file: t.file, line: t.line, context: t.context, selectors: [] }
          const arr = result.rules[key].selectors
          if (!arr[t.idx]) arr[t.idx] = { sel: t.sel, broken: t.broken, rep: t.rep, byTheme: {} }
          const bucket = arr[t.idx].byTheme
          if (!bucket[theme]) bucket[theme] = {}
          bucket[theme][page] = counts[ci]
        })
      }
    }
    writeFileSync(OUT, JSON.stringify(result))
    console.log(JSON.stringify({ themes: THEMES.length, pages: PAGES.length, rules: Object.keys(result.rules).length }))
  } finally { try { edge.kill() } catch { }; try { ws?.close() } catch { } }
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1) })
