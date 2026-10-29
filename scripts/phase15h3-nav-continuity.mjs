/**
 * Phase 15h.3 · 转场连续性同步取证
 *
 * 五条路径 × 3 轮（含 250ms 快速返回）。同一浏览器会话内同时记录三路真值：
 *   1) 页面内 16ms 采样：主内容可见性（祖先 opacity×visibility×display、目标矩形、
 *      elementFromPoint 命中、loading、shared-element 动画状态）
 *   2) CDP Screencast 原始帧（含 metadata.timestamp）
 *   3) 独立 Page.captureScreenshot 序列（请求发起/返回时间 + 耗时）
 *
 * 输出：screenshots/phase15h3/nav-continuity.json
 * 判据不看亮度，只看"主内容区域是否有用户能看懂的内容"。
 */
import { spawn } from 'node:child_process'
import { connect } from 'node:net'
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const PORT = Number(process.env.CDP_PORT || 11600)
const PROFILE = join(ROOT, `.p15h3-nav-${PORT}`)
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const URL = process.env.APP_URL || 'http://127.0.0.1:4173/?test=1&proto=d'
const ROUNDS = Number(process.env.ROUNDS || 3)
const MODE = process.env.MODE || 'screencast'
const SHOT_EVERY = Number(process.env.SHOT_EVERY || 120)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const OUT = join(ROOT, 'screenshots', 'phase15h3')
mkdirSync(OUT, { recursive: true })

// 五条代表性路径（对应审查里出现空白的五段录屏）
const ALL_PATHS = [
  { id: 'data', from: 'home', to: 'stats', shot: 'data' },
  { id: 'mgmt', from: 'home', to: 'settings', shot: 'mgmt' },
  { id: 'sentence', from: 'home', to: 'sentence', shot: 'sentence' },
  { id: 'io', from: 'home', to: 'output', shot: 'io' },
  { id: 'vocab', from: 'home', to: 'books', shot: 'vocab' }
]
const ONLY = (process.env.PATHS || '').split(',').filter(Boolean)
const PATHS = ONLY.length ? ALL_PATHS.filter(p => ONLY.includes(p.id)) : ALL_PATHS

const waitPort = (p, t = 30000) => new Promise((res, rej) => {
  const t0 = Date.now()
  const tick = () => { const s = connect(p, '127.0.0.1'); s.once('connect', () => { s.destroy(); res() }); s.once('error', () => { s.destroy(); Date.now() - t0 > t ? rej(new Error('devtools timeout')) : setTimeout(tick, 250) }) }
  tick()
})

const SAMPLER = readFileSync(join(ROOT, 'scripts', 'phase15h3-nav-sampler.js'), 'utf8')

const main = async () => {
  if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true })
  const edge = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900', '--no-first-run',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', URL], { stdio: 'ignore', windowsHide: true })
  let ws
  const report = { startedAt: new Date().toISOString(), url: URL, port: PORT, rounds: ROUNDS, runs: [], capture: {} }
  try {
    await waitPort(PORT)
    let tab = null
    for (let i = 0; i < 40 && !tab; i++) {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      tab = list.find(t => t.type === 'page' && t.url.includes('127.0.0.1:4173'))
      if (!tab) await sleep(300)
    }
    if (!tab) throw new Error('app tab not found')
    ws = new WebSocket(tab.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    let id = 1
    const pending = new Map()
    const frames = []
    ws.addEventListener('message', e => {
      const m = JSON.parse(e.data)
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
      if (m.method === 'Page.screencastFrame') {
        frames.push({ ts: m.params.metadata.timestamp, sessionId: m.params.sessionId })
        call('Page.screencastFrameAck', { sessionId: m.params.sessionId }).catch(() => { })
      }
    })
    const call = (method, params = {}) => new Promise((res, rej) => {
      const my = ++id
      pending.set(my, res)
      ws.send(JSON.stringify({ id: my, method, params }))
      setTimeout(() => { if (pending.has(my)) { pending.delete(my); rej(new Error('cdp timeout ' + method)) } }, 20000)
    })
    const ev = async expr => {
      const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval error')
      return r.result?.result?.value
    }
    await call('Page.enable')
    await call('Runtime.enable')
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    if (MODE === 'screencast') await call('Page.startScreencast', { format: 'jpeg', quality: 70, everyNthFrame: 1, maxWidth: 1440, maxHeight: 900 })
    report.capture.screencast = { format: 'jpeg', quality: 70, everyNthFrame: 1 }

    for (let i = 0; i < 80; i++) { if (await ev(`!!document.documentElement?.dataset?.page && document.querySelectorAll('[data-nav]').length >= 5`)) break; await sleep(300) }
    await sleep(500)

    for (const path of PATHS) {
      for (let round = 1; round <= ROUNDS; round++) {
        // 回到起点，并且确认真的停在起点（SPA 重载/播种期间点击是空转）
        let atFrom = null
        for (let attempt = 0; attempt < 12; attempt++) {
          atFrom = await ev(`(async () => { document.querySelector('[data-nav="${path.from}"]')?.click(); await new Promise(r => setTimeout(r, 800)); return document.documentElement?.dataset?.page ?? null })()`)
          if (atFrom === path.from) break
          if (attempt === 6) await call('Page.reload', { ignoreCache: false })
          await sleep(600)
        }
        if (atFrom !== path.from) { console.log(`  SKIP ${path.id} r${round}: not at ${path.from} (got ${atFrom})`); continue }
        await sleep(250)
        frames.length = 0
        await ev(SAMPLER)
        await ev(`window.__h3nav.start(${JSON.stringify(path.to)}, ${JSON.stringify(path.id)}, ${round})`)
        const t0 = Date.now()
        const shots = []
        // 独立截图序列（与采样并行，各自记时间）
        if (MODE === 'shots') {
          while (Date.now() - t0 < 1700) {
            const a = await ev(`performance.now()`)
            const req0 = Date.now()
            const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, optimizeForSpeed: true })
            const req1 = Date.now()
            shots.push({ tPage: a, req: req0 - t0, took: req1 - req0, bytes: shot.result?.data ? Math.round(shot.result.data.length * 0.75) : 0 })
            await sleep(Math.max(0, SHOT_EVERY - (req1 - req0)))
          }
        } else {
          await sleep(1700)
        }
        // 快速返回（spatial back）：再点回起点，检查返回过程是否同样连续
        await ev(`window.__h3nav.ret(${JSON.stringify(path.from)})`)
        await sleep(1200)
        const result = await ev(`window.__h3nav.stop()`)
        report.runs.push({
          path: path.id, round,
          clickAt: result.clickAt, epoch0: result.epoch0, returnAt: result.returnAt,
          samples: result.samples,
          frames: frames.map(f => Math.round(f.ts * 1000)),
          shots
        })
        console.log(`  ${path.id} r${round}: samples=${result.samples.length} frames=${frames.length} shots=${shots.length}`)
      }
    }

    writeFileSync(join(OUT, `nav-${MODE}.json`), JSON.stringify(report))
    console.log(JSON.stringify({ mode: MODE, runs: report.runs.length, frames: report.runs.reduce((a, r) => a + r.frames.length, 0), shots: report.runs.reduce((a, r) => a + r.shots.length, 0) }))
  } finally { try { edge.kill() } catch { } try { ws?.close() } catch { } }
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1) })
