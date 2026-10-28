/**
 * Phase 15h.2 · 通用样式探针
 * 用法：node scripts/phase15h2-eval.mjs home ".hero-start" "backgroundColor,backgroundImage,color,boxShadow"
 * 为什么单独写：P1 的每一条都要用真实计算样式确认，不能靠读 CSS 猜（伪元素/继承/内联都会改结果）。
 */
import { spawn } from 'node:child_process'
import { existsSync, cpSync, rmSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'

const ROOT = process.cwd()
const PORT = Number(process.env.CDP_PORT || 10690)
const PROFILE = join(ROOT, `.p15h2-eval-${PORT}`)
const BASE = 'C:/Users/86152/AppData/Local/hermes/cache/scratch/p15h/live'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const PROTO = process.env.PROTO || 'd'
const PAGE = process.argv[2] || 'home';
const SEL = process.argv[3] || '.hero-start'
const PROPS = (process.argv[4] || 'color,backgroundColor,backgroundImage,opacity').split(',')
const THEME = process.env.THEME || 'dark'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const waitPort = (p, t = 30000) => new Promise((res, rej) => { const t0 = Date.now(); const tick = () => { const s = connect(p, '127.0.0.1'); s.once('connect', () => { s.destroy(); res() }); s.once('error', () => { s.destroy(); Date.now() - t0 > t ? rej(new Error('timeout')) : setTimeout(tick, 250) }) }; tick() })

const main = async () => {
  if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true })
  if (existsSync(BASE)) cpSync(BASE, PROFILE, { recursive: true })
  const edge = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900', '--no-first-run', `http://127.0.0.1:4173/?test=1${PROTO === 'base' ? '' : '&proto=' + PROTO}`], { stdio: 'ignore', windowsHide: true })
  let ws
  try {
    await waitPort(PORT)
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    const tab = list.find(t => t.type === 'page' && t.url.includes('127.0.0.1'))
    ws = new WebSocket(tab.webSocketDebuggerUrl)
    await new Promise(r => ws.addEventListener('open', r))
    let id = 200
    const call = (method, params = {}) => new Promise(res => { const my = ++id; const on = e => { const m = JSON.parse(e.data); if (m.id === my) { ws.removeEventListener('message', on); res(m) } }; ws.addEventListener('message', on); ws.send(JSON.stringify({ id: my, method, params })) })
    const ev = async expr => (await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    for (let i = 0; i < 40; i++) { if ((await ev(`document.querySelectorAll('[data-nav]').length`)) >= 5) break; await sleep(400) }
    await ev(`(async () => { for (let i = 0; i < 4; i++) { if (document.documentElement.dataset.theme === '${THEME}') return; document.querySelector('#theme')?.click(); await new Promise(r => setTimeout(r, 520) } })()`)
    await ev(`(async () => { document.querySelector('[data-nav="${PAGE}"]')?.click(); await new Promise(r => setTimeout(r, 1200)); return true })()`)
    const out = await ev(`(() => {
      const el = document.querySelector(${JSON.stringify(SEL)});
      if (!el) return { error: 'not found' };
      const s = getComputedStyle(el);
      const props = ${JSON.stringify(PROPS)}.map(p => [p, s[p]]);
      const before = getComputedStyle(el, '::before');
      const after = getComputedStyle(el, '::after');
      return { sel: ${JSON.stringify(SEL)}, text: (el.textContent || '').trim().slice(0, 40),
        props, before: { bg: before.backgroundColor, bgImage: before.backgroundImage, inset: before.inset, content: before.content },
        after: { bg: after.backgroundColor, bgImage: after.backgroundImage, content: after.content },
        parentBg: getComputedStyle(el.parentElement).backgroundColor, parentImg: getComputedStyle(el.parentElement).backgroundImage,
        rect: { w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) } };
    })()`)
    console.log(JSON.stringify(out, null, 2))
  } finally { try { edge.kill() } catch { }; try { ws?.close() } catch { } }
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1) })
