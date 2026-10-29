/**
 * Phase 15h.3 · 监听器 / 观察器生命周期核查
 *
 * 在应用脚本之前注入计数器（Page.addScriptToEvaluateOnNewDocument），统计：
 *   - window / document 上按类型注册的监听器数量（含重复注册）
 *   - ResizeObserver / IntersectionObserver 活实例（构造数 - disconnect 数）
 *   - 未取消的 requestAnimationFrame
 * 然后比较 1 次、10 次、30 次页面进出的状态。
 *
 * 输出：screenshots/phase15h3/lifecycle.json
 */
import { spawn } from 'node:child_process'
import { connect } from 'node:net'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const PORT = Number(process.env.CDP_PORT || 11700)
const PROFILE = join(ROOT, `.p15h3-life-${PORT}`)
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const URL = 'http://127.0.0.1:4173/?test=1&proto=d'
const OUT = join(ROOT, 'screenshots', 'phase15h3')
const sleep = ms => new Promise(r => setTimeout(r, ms))
mkdirSync(OUT, { recursive: true })

const INSTRUMENT = readFileSync(join(ROOT, 'scripts', 'phase15h3-life-instrument.js'), 'utf8')

const waitPort = (p, t = 30000) => new Promise((res, rej) => {
  const t0 = Date.now()
  const tick = () => { const s = connect(p, '127.0.0.1'); s.once('connect', () => { s.destroy(); res() }); s.once('error', () => { s.destroy(); Date.now() - t0 > t ? rej(new Error('devtools timeout')) : setTimeout(tick, 250) }) }
  tick()
})

const main = async () => {
  if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true })
  const edge = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--headless=new',
    '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900', '--no-first-run', URL], { stdio: 'ignore', windowsHide: true })
  let ws
  const report = { url: URL, startedAt: new Date().toISOString(), steps: [] }
  try {
    await waitPort(PORT)
    let tab = null
    for (let i = 0; i < 40 && !tab; i++) {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      tab = list.find(t => t.type === 'page' && t.url.includes('127.0.0.1:4173'))
      if (!tab) await sleep(300)
    }
    ws = new WebSocket(tab.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    let id = 1
    const call = (method, params = {}) => new Promise((res, rej) => {
      const my = ++id
      const on = e => { const m = JSON.parse(e.data); if (m.id === my) { ws.removeEventListener('message', on); res(m) } }
      ws.addEventListener('message', on)
      ws.send(JSON.stringify({ id: my, method, params }))
      setTimeout(() => rej(new Error('cdp timeout ' + method)), 25000)
    })
    const ev = async expr => {
      const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval')
      return r.result?.result?.value
    }
    // 必须在应用脚本之前注入
    await call('Page.enable')
    const inj = await call('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENT })
    report.injectId = inj.result?.identifier ?? null
    await call('Page.reload', { ignoreCache: false })
    report.instrumented = await ev(`typeof window.__life`)
    for (let i = 0; i < 80; i++) { if (await ev(`!!document.documentElement?.dataset?.page && document.querySelectorAll('[data-nav]').length >= 5`)) break; await sleep(300) }
    report.instrumentedAfterBoot = await ev(`typeof window.__life`)
    await sleep(800)

    const probe = async label => {
      const s = await ev(`window.__life.snapshot()`)
      report.steps.push({ label, ...s })
      console.log(`${label.padEnd(16)} pointerup=${s.windowPointerup} pointermove=${s.windowPointermove} document="${JSON.stringify(s.documentListeners)}" RO=${s.resizeObservers} IO=${s.intersectionObservers} raf=${s.pendingRaf} nodes=${s.nodes}`)
      return s
    }

    let navMisses = 0, navHits = 0
    const tour = async (times, pages) => {
      for (let i = 0; i < times; i++) {
        for (const p of pages) {
          const landed = await ev(`(async () => { document.querySelector('[data-nav="${p}"]')?.click(); await new Promise(r => setTimeout(r, 110)); return document.documentElement?.dataset?.page ?? null })()`)
          if (landed === p) navHits++; else navMisses++
        }
        await ev(`(async () => { document.querySelector('[data-nav="home"]')?.click(); await new Promise(r => setTimeout(r, 110)); return true })()`)
      }
    }

    const PAGES = ['books', 'weak', 'sentence', 'reading', 'input', 'output', 'grammar', 'unit', 'diagnostics', 'exam', 'stats', 'ai', 'settings']

    const base = await probe('boot')
    await tour(1, PAGES)
    const one = await probe('after-1x')
    await tour(9, PAGES)
    await sleep(300)
    const ten = await probe('after-10x')
    await tour(20, PAGES)
    await sleep(300)
    const thirty = await probe('after-30x')

    // 页面隐藏/恢复
    try {
      await call('Emulation.setPageScaleFactor', { pageScaleFactor: 1 })
      await ev(`(async () => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); await new Promise(r => setTimeout(r, 300)); return true })()`)
      await probe('hidden')
      await ev(`(async () => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); await new Promise(r => setTimeout(r, 400)); return true })()`)
      await probe('visible-again')
    }
    catch (e) { report.hiddenProbeError = String(e.message) }

    report.nav = { hits: navHits, misses: navMisses }
    report.delta = {
      windowPointerup: thirty.windowPointerup - base.windowPointerup,
      resizeObservers: thirty.resizeObservers - base.resizeObservers,
      intersectionObservers: thirty.intersectionObservers - base.intersectionObservers
    }
    report.ok = report.delta.windowPointerup === 0 && report.delta.resizeObservers <= 0 && report.delta.intersectionObservers <= 0
    writeFileSync(join(OUT, 'lifecycle.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report.delta), 'ok=' + report.ok)
  } finally { try { edge.kill() } catch { } try { ws?.close() } catch { } }
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1) })
