/**
 * Phase 15h.3 · 修复前后对照采集
 *
 * 用法：node scripts/phase15h3-visual-diff.mjs before|after
 * 产出：screenshots/phase15h3/<tag>/*.png + styles-<tag>.json
 *
 * 为什么不能只看"命中数变大"：这些规则首先生效，会改布局。
 * 所以每个状态同时存截图与关键元素的计算样式（布局、颜色、线型、border、grid/flex）。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'

const ROOT = process.cwd()
const TAG = process.argv[2] || 'before'
const PORT = Number(process.env.CDP_PORT || 11400)
const SIZE = process.env.SIZE || '1440x900'
const [VW, VH] = SIZE.split('x').map(Number)
const PROFILE = join(ROOT, `.p15h3-shot-${PORT}`)
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const URL = 'http://127.0.0.1:4173/?test=1&proto=d'
const OUT = join(ROOT, 'screenshots', 'phase15h3', TAG)
const sleep = ms => new Promise(r => setTimeout(r, ms))

const PROPS = ['display', 'gridTemplateColumns', 'flexDirection', 'gap', 'padding', 'borderLeft', 'borderRadius', 'backgroundColor', 'backgroundImage', 'color', 'opacity', 'boxShadow', 'fontSize', 'fontWeight', 'minHeight', 'transform']

const waitPort = (p, t = 30000) => new Promise((res, rej) => {
  const t0 = Date.now()
  const tick = () => { const s = connect(p, '127.0.0.1'); s.once('connect', () => { s.destroy(); res() }); s.once('error', () => { s.destroy(); Date.now() - t0 > t ? rej(new Error('devtools timeout')) : setTimeout(tick, 250) }) }
  tick()
})

const main = async () => {
  mkdirSync(OUT, { recursive: true })
  if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true })
  const edge = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--headless=new',
    '--disable-gpu', '--hide-scrollbars', `--window-size=${VW},${VH}`, '--no-first-run', URL], { stdio: 'ignore', windowsHide: true })
  const report = { tag: TAG, shots: [], styles: {} }
  let ws
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
    let id = 700
    const call = (method, params = {}) => new Promise(res => {
      const my = ++id
      const on = e => { const m = JSON.parse(e.data); if (m.id === my) { ws.removeEventListener('message', on); res(m) } }
      ws.addEventListener('message', on); ws.send(JSON.stringify({ id: my, method, params }))
    })
    const ev = async expr => {
      const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval')
      return r.result?.result?.value
    }
    const shot = async name => {
      const r = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      writeFileSync(join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64'))
      report.shots.push(name)
    }
    await call('Runtime.enable')
    await call('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false })
    // 关键：等应用真的初始化（data-page 已挂上），否则点导航是空转
    for (let i = 0; i < 80; i++) {
      const ok = await ev(`!!document.documentElement.dataset.page && document.querySelectorAll('[data-nav]').length >= 5`)
      if (ok) break
      await sleep(300)
    }
    await sleep(300)
    report.bootPage = await ev(`document.documentElement.dataset.page`)


    const waitFor = async (sel, ms = 6000) => {
      const t0 = Date.now()
      while (Date.now() - t0 < ms) {
        if (await ev(`!!document.querySelector(${JSON.stringify(sel)})`)) return true
        await sleep(100)
      }
      return false
    }
    const stable = async (ms = 5000) => {
      await ev(`(async () => {
        const t0 = performance.now(); let last = -1, since = 0
        while (performance.now() - t0 < ${ms}) {
          const h = document.querySelector('#main')
          const txt = (h?.textContent || '').replace(/\\s+/g, '')
          const running = document.getAnimations().filter(a => a.playState === 'running' && a.effect?.getTiming?.().iterations !== Infinity).length
          if (txt.length > 20 && running === 0) { if (txt.length === last) { if (performance.now() - since > 150) return true } else { last = txt.length; since = performance.now() } }
          else last = -1
          await new Promise(r => setTimeout(r, 60))
        }
        return false
      })()`)
    }

    const theme = async t => { for (let i = 0; i < 4; i++) { if ((await ev(`document.documentElement.dataset.theme`)) === t) return; await ev(`document.querySelector('#theme')?.click()`); await sleep(520) } }
    const nav = async p => {
      for (let attempt = 0; attempt < 3; attempt++) {
        await ev(`(async () => { document.querySelector('[data-nav="${p}"]')?.click(); await new Promise(r => setTimeout(r, 900)); return true })()`)
        const now = await ev(`document.documentElement.dataset.page`)
        if (now === p) return true
        await sleep(300)
      }
      report.failed = [...(report.failed || []), 'nav:' + p + ' (page=' + (await ev(`document.documentElement.dataset.page`)) + ', href=' + (await ev(`location.href`)) + ')']
      return false
    }
    report.overflow = {}
    const dump = async (name, sels) => {
      const rows = await ev(`(() => {
        const props = ${JSON.stringify(PROPS)};
        const out = {};
        for (const sel of ${JSON.stringify(sels)}) {
          const el = document.querySelector(sel);
          if (!el) { out[sel] = null; continue; }
          const s = getComputedStyle(el);
          const o = {};
          for (const p of props) o[p] = s[p];
          const r = el.getBoundingClientRect();
          out[sel] = { rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)], ...o };
        }
        return out;
      })()`)
      report.styles[name] = rows
      report.overflow[name] = await ev(`(() => { const d = document.documentElement; return { scrollW: d.scrollWidth, clientW: d.clientWidth, over: d.scrollWidth > d.clientWidth + 1 } })()`)
    }

    for (const t of (process.env.THEME ? [process.env.THEME] : ['dark', 'light'])) {
      // 上一轮可能已经进入训练态、甚至完成会话自动回到 Today；重载重置 SPA 状态
      await theme(t)
      // 句子训练：未作答
      await nav('sentence'); await stable()
      let lab = false
      for (let k = 0; k < 3 && !lab; k++) {
        await ev(`(async () => { document.querySelector('[data-sentence-start]')?.click(); return true })()`)
        lab = await waitFor('.lab-option', 3000)
      }
      if (!lab) report.failed = [...(report.failed || []), `sentence-${t}`]
      await stable()
      await shot(`sentence-idle-${t}`)
      await dump(`sentence-idle-${t}`, ['.lab-panel', '.lab-option', '.lab-progress', '.lab-sentence'])
      // 句子训练：判题后
      await ev(`(async () => { document.querySelector('.lab-option')?.click(); await new Promise(r => setTimeout(r, 700)); return true })()`)
      await sleep(250)
      await shot(`sentence-answered-${t}`)
      await dump(`sentence-answered-${t}`, ['.lab-option', '.lab-option[data-verdict="correct"]', '.lab-feedback', '.lab-next'])
      // 语法图谱
      await nav('grammar'); await stable()
      if (!await waitFor('.concept-card')) report.failed = [...(report.failed || []), `grammar-${t}`]
      await shot(`grammar-${t}`)
      await dump(`grammar-${t}`, ['.concept-card', '.concept-grid', '.grammar-cluster'])
      // 输入
      await nav('input'); await stable()
      await shot(`input-${t}`)
      await dump(`input-${t}`, ['#main .panel', '#main button.primary'])
      // 表达
      await nav('output'); await stable()
      await ev(`(async () => { document.querySelector('[data-out-start]')?.click(); return true })()`)
      if (!await waitFor('#out-editor')) report.failed = [...(report.failed || []), `output-${t}`]
      await stable()
      await shot(`output-${t}`)
      await dump(`output-${t}`, ['#out-editor', '#out-save-state', '.handoff', '.out-type-chip'])
      // 设置
      await nav('settings'); await stable()
      await shot(`settings-${t}`)
      await dump(`settings-${t}`, ['#main button.danger', '.backup-panel'])
      // 首页（金属层，跑一遍确保没被连带改坏）
      await nav('home'); await stable()
      await shot(`home-${t}`)
      await dump(`home-${t}`, ['.d-cta', '.d-page'])
    }

    writeFileSync(join(ROOT, 'screenshots', 'phase15h3', `styles-${TAG}.json`), JSON.stringify(report, null, 2))
    console.log(JSON.stringify({ tag: TAG, shots: report.shots.length, states: Object.keys(report.styles).length }))
  } finally { try { edge.kill() } catch { }; try { ws?.close() } catch { } }
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1) })
