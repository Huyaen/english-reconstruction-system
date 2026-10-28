/**
 * Phase 15h.2 · 导航期主内容状态探测（P0 取证）
 *
 * 逐帧记录导航后 #main 的真实 DOM 与计算样式，用来区分：
 *   1) 应用真的渲染了空内容（children/text 为 0）
 *   2) 内容存在但不可见（opacity 0 / 未 reveal / 被遮罩）
 *   3) 应用自己的加载占位（.d-loading）
 *   4) 转场层（.is-flash / 共享元素飞行层）
 *
 * 输出：screenshots/phase15h2/nav-probe.json
 * 用法：node scripts/phase15h2-navprobe.mjs [rounds]
 */
import { spawn } from 'node:child_process'
import { existsSync, cpSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'

const ROOT = process.cwd()
const PORT = Number(process.env.CDP_PORT || 9761)
const PROFILE = join(ROOT, `.p15h2-probe-${PORT}`)
const BASE_PROFILE = process.env.PROFILE || 'C:/Users/86152/AppData/Local/hermes/cache/scratch/p15h/live'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/?test=1&proto=d'
const OUT = join(ROOT, 'screenshots', 'phase15h2')
const ROUNDS = Number(process.argv[2] || 3)
const PAGES = ['books', 'weak', 'sentence', 'grammar', 'reading', 'input', 'output', 'unit', 'diagnostics', 'exam', 'stats', 'ai', 'settings', 'home']

const sleep = ms => new Promise(r => setTimeout(r, ms))

function waitPort(port, timeout = 30000) {
  const t0 = Date.now()
  return new Promise((res, rej) => {
    const tick = () => {
      const s = connect(port, '127.0.0.1')
      s.once('connect', () => { s.destroy(); res(true) })
      s.once('error', () => { s.destroy(); Date.now() - t0 > timeout ? rej(new Error('devtools timeout')) : setTimeout(tick, 250) })
    }
    tick()
  })
}
function rpcFactory(ws) {
  let id = 100
  return (method, params = {}) => {
    const myId = ++id
    ws.send(JSON.stringify({ id: myId, method, params }))
    return new Promise((resolve, reject) => {
      const onMsg = ev => {
        let m
        try { m = JSON.parse(ev.data) } catch { return }
        if (m.id === myId) {
          ws.removeEventListener('message', onMsg)
          m.error ? reject(new Error(method + ': ' + m.error.message)) : resolve(m.result)
        }
      }
      ws.addEventListener('message', onMsg)
    })
  }
}

async function main() {
  if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true })
  if (existsSync(BASE_PROFILE)) cpSync(BASE_PROFILE, PROFILE, { recursive: true })
  mkdirSync(OUT, { recursive: true })

  const edge = spawn(EDGE, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--window-size=1440,900', '--no-first-run', '--no-default-browser-check', URL
  ], { stdio: 'ignore', windowsHide: true })

  const report = { url: URL, rounds: ROUNDS, navigations: [], consoleErrors: [], exceptions: [] }
  let ws
  try {
    await waitPort(PORT)
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    const tab = list.find(t => t.type === 'page' && t.url.includes('127.0.0.1'))
    ws = new WebSocket(tab.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    const call = rpcFactory(ws)
    ws.addEventListener('message', ev => {
      let m
      try { m = JSON.parse(ev.data) } catch { return }
      if (m.method === 'Runtime.exceptionThrown')
        report.exceptions.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
        report.consoleErrors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' '))
    })
    await call('Page.enable')
    await call('Runtime.enable')
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    const ev = async expr => {
      const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
      return r.result.value
    }

    for (let i = 0; i < 40; i++) {
      const n = await ev(`document.querySelectorAll('[data-nav]').length`)
      if (n >= 5) break
      await sleep(500)
    }

    // 采样器：点击后立刻开始 rAF 采样，记录每帧 #main 的真实状态
    const sample = page => `(async () => {
      const out = []
      const t0 = performance.now()
      const el = document.querySelector('#main')
      const read = () => {
        const m = document.querySelector('#main')
        const first = m?.firstElementChild
        const cs = first ? getComputedStyle(first) : null
        const mcs = m ? getComputedStyle(m) : null
        const txt = (m?.textContent || '').replace(/\\s+/g, '')
        return {
          t: Math.round(performance.now() - t0),
          children: m ? m.children.length : -1,
          textLen: txt.length,
          mainOpacity: mcs ? Number(mcs.opacity) : -1,
          firstTag: first ? first.tagName.toLowerCase() : '',
          firstOpacity: cs ? Number(cs.opacity) : -1,
          firstTransform: cs ? cs.transform : '',
          loading: !!document.querySelector('#main .d-loading, #main .loading-state'),
          flash: !!document.querySelector('.is-flash, .morph-flight, .morph-plate'),
          revealPending: document.querySelectorAll('#main [data-reveal]:not(.is-shown)').length,
          revealTotal: document.querySelectorAll('#main [data-reveal]').length,
          vis: document.visibilityState,
          scrollH: document.documentElement.scrollHeight
        }
      }
      out.push({ ...read(), phase: 'before' })
      const btn = document.querySelector('[data-nav="${page}"]')
      if (!btn) return { error: 'no nav' }
      btn.click()
      await new Promise(res => {
        const tick = () => {
          out.push({ ...read(), phase: 'after' })
          if (performance.now() - t0 < 2600) requestAnimationFrame(tick)
          else res()
        }
        requestAnimationFrame(tick)
      })
      return { page: '${page}', frames: out }
    })()`

    for (let round = 1; round <= ROUNDS; round++) {
      for (const page of PAGES) {
        // 每次都从一个非目标页出发，才是真实"切换"
        const from = page === 'home' ? 'stats' : 'home'
        await ev(`(async () => { document.querySelector('[data-nav="${from}"]')?.click(); await new Promise(r => setTimeout(r, 700)); return true })()`)
        const res = await ev(sample(page))
        if (res?.error) { report.navigations.push({ round, page, error: res.error }); continue }
        const frames = res.frames.filter(f => f.phase === 'after')
        // 空窗：children 0 或 文本 < 12 个非空白字符
        const emptyIdx = frames.map((f, i) => ({ f, i })).filter(({ f }) => f.children === 0 || f.textLen < 12)
        const invisibleIdx = frames.filter(f => f.firstOpacity === 0 && f.textLen >= 12)
        const loadingIdx = frames.filter(f => f.loading)
        const firstGood = frames.findIndex(f => f.children > 0 && f.textLen >= 12 && f.firstOpacity > 0.9 && !f.loading)
        report.navigations.push({
          round, page,
          frames: frames.length,
          emptyMs: emptyIdx.length ? frames[emptyIdx[emptyIdx.length - 1].i].t - frames[emptyIdx[0].i].t : 0,
          emptyFirstMs: emptyIdx.length ? frames[emptyIdx[0].i].t : null,
          emptyFrames: emptyIdx.length,
          invisibleFrames: invisibleIdx.length,
          invisibleMs: invisibleIdx.length ? invisibleIdx[invisibleIdx.length - 1].t - invisibleIdx[0].t : 0,
          loadingFrames: loadingIdx.length,
          loadingMs: loadingIdx.length ? loadingIdx[loadingIdx.length - 1].t - loadingIdx[0].t : 0,
          firstGoodMs: firstGood >= 0 ? frames[firstGood].t : null,
          maxRevealPending: Math.max(...frames.map(f => f.revealPending)),
          revealTotal: Math.max(...frames.map(f => f.revealTotal)),
          minTextLen: Math.min(...frames.map(f => f.textLen)),
          sample: frames.filter((_, i) => i % 6 === 0).map(f => `${f.t}ms c${f.children} t${f.textLen} o${f.firstOpacity}${f.loading ? ' L' : ''}${f.revealPending ? ' r' + f.revealPending + '/' + f.revealTotal : ''}`)
        })
      }
    }

    // 关键页面稳定态截图（相同构建、等待内容真正出现）
    report.stable = {}
    for (const page of ['stats', 'grammar', 'output', 'sentence', 'diagnostics']) {
      await ev(`(async () => {
        document.querySelector('[data-nav="${page}"]')?.click()
        const t0 = performance.now()
        while (performance.now() - t0 < 4000) {
          const m = document.querySelector('#main')
          const first = m?.firstElementChild
          const op = first ? Number(getComputedStyle(first).opacity) : 0
          const txt = (m?.textContent || '').replace(/\\s+/g, '')
          if (txt.length > 40 && op > 0.9 && !document.querySelector('#main .d-loading')) break
          await new Promise(r => setTimeout(r, 60))
        }
        return true
      })()`)
      const { data } = await call('Page.captureScreenshot', { format: 'png' })
      const file = join(OUT, `probe-${page}.png`)
      writeFileSync(file, Buffer.from(data, 'base64'))
      report.stable[page] = file
    }

    writeFileSync(join(OUT, 'nav-probe.json'), JSON.stringify(report, null, 2))
    const summary = report.navigations.map(n => `${n.page}#${n.round} empty=${n.emptyMs}ms inv=${n.invisibleMs}ms load=${n.loadingMs}ms good=${n.firstGoodMs}ms`)
    console.log(summary.join('\n'))
    console.log(`\nexceptions=${report.exceptions.length} consoleErrors=${report.consoleErrors.length}`)
  } finally {
    try { edge.kill() } catch { }
    try { ws?.close() } catch { }
  }
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1) })
