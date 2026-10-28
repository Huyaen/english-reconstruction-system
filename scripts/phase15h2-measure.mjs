/**
 * Phase 15h.2 · 具体元素测量（布局几何 + 已作答状态的对比度）
 *
 * 为什么不用估算：P1 的"单选圆点在中部"和"判题后看不清选项"都必须用
 * 浏览器里的真实 rect / 真实计算色去量，截图目测会漏掉 opacity 叠加。
 *
 * 用法：node scripts/phase15h2-measure.mjs
 * 输出：screenshots/phase15h2/measure.json
 */
import { spawn } from 'node:child_process'
import { existsSync, cpSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'

const ROOT = process.cwd()
const PORT = Number(process.env.CDP_PORT || 10190)
const PROFILE = join(ROOT, `.p15h2-measure-${PORT}`)
const BASE_PROFILE = process.env.PROFILE || 'C:/Users/86152/AppData/Local/hermes/cache/scratch/p15h/live'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const URL = 'http://127.0.0.1:4173/?test=1&proto=d'
const OUT = join(ROOT, 'screenshots', 'phase15h2')
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
        if (m.id === myId) { ws.removeEventListener('message', onMsg); m.error ? reject(new Error(method + ': ' + m.error.message)) : resolve(m.result) }
      }
      ws.addEventListener('message', onMsg)
    })
  }
}

// 页面内：把颜色解成 rgba + 累乘祖先 opacity，再按 WCAG 算对比度
const CONTRAST_HELPER = `
window.__h2 = {
  parse(c) {
    const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null;
    const p = m[1].split(/[,/]/).map(x => parseFloat(x.trim()));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  },
  lum({r,g,b}) { const f = v => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4) }; return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b) },
  over(fg, bg) { const a = fg.a; return { r: fg.r*a+bg.r*(1-a), g: fg.g*a+bg.g*(1-a), b: fg.b*a+bg.b*(1-a), a: 1 } },
  bgOf(el) {
    let n = el, layers = [];
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      const c = this.parse(cs.backgroundColor);
      if (c && c.a > 0) layers.push(c);
      if (c && c.a === 1) break;
      n = n.parentElement;
    }
    let base = { r: 12, g: 14, b: 17, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) base = this.over(layers[i], base);
    return base;
  },
  opacityChain(el) { let o = 1, n = el; while (n && n !== document.documentElement) { o *= parseFloat(getComputedStyle(n).opacity || '1'); n = n.parentElement } return o },
  ratio(el) {
    const cs = getComputedStyle(el);
    const fg = this.parse(cs.color); if (!fg) return null;
    const bg = this.bgOf(el);
    const op = this.opacityChain(el);
    const mixed = this.over({ ...fg, a: fg.a * op }, bg);
    const L1 = this.lum(mixed), L2 = this.lum(bg);
    return Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100) / 100;
  }
};
`

async function main() {
  if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true })
  if (existsSync(BASE_PROFILE)) cpSync(BASE_PROFILE, PROFILE, { recursive: true })
  mkdirSync(OUT, { recursive: true })
  const edge = spawn(EDGE, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--window-size=1440,900', '--no-first-run', '--no-default-browser-check', URL
  ], { stdio: 'ignore', windowsHide: true })
  const out = {}
  let ws
  try {
    await waitPort(PORT)
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    const tab = list.find(t => t.type === 'page' && t.url.includes('127.0.0.1'))
    ws = new WebSocket(tab.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    const call = rpcFactory(ws)
    await call('Page.enable'); await call('Runtime.enable')
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    const ev = async expr => {
      const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
      return r.result.value
    }
    for (let i = 0; i < 40; i++) { if (await ev(`document.querySelectorAll('[data-nav]').length`) >= 5) break; await sleep(400) }
    await ev(CONTRAST_HELPER)

    // ── 考试单选几何 ──────────────────────────────────────────────
    await ev(`(async () => {
      document.querySelector('[data-nav="exam"]')?.click(); await new Promise(r => setTimeout(r, 600));
      document.querySelector('[data-exam-tab="overview"]')?.click(); await new Promise(r => setTimeout(r, 700));
      document.querySelector('#exam-start-mixed')?.click();
      for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 100)); if (document.querySelector('.exam-option')) break }
      return true
    })()`)
    out.exam = await ev(`(() => {
      const opts = [...document.querySelectorAll('.exam-option')]
      return opts.map(o => {
        const r = o.getBoundingClientRect()
        const parts = [...o.children].map(c => { const b = c.getBoundingClientRect(); return { tag: c.tagName.toLowerCase(), cls: c.className, x: Math.round(b.x), w: Math.round(b.width) } })
        const cs = getComputedStyle(o)
        return { row: { x: Math.round(r.x), w: Math.round(r.width) }, display: cs.display, justify: cs.justifyContent, gap: cs.gap, parts }
      })
    })()`)

    // ── 句子：作答前后的选项对比度 ────────────────────────────────
    await ev(`(async () => {
      document.querySelector('[data-nav="sentence"]')?.click(); await new Promise(r => setTimeout(r, 700));
      document.querySelector('[data-sentence-start]')?.click();
      for (let i = 0; i < 60; i++) { await new Promise(r => setTimeout(r, 100)); if (document.querySelector('.lab-option')) break }
      return true
    })()`)
    const settle = async (sel) => ev(`(async () => {
      const t0 = performance.now(); let prev = null
      while (performance.now() - t0 < 4000) {
        const el = document.querySelector(${JSON.stringify(sel)})
        if (!el) { await new Promise(r => setTimeout(r, 60)); continue }
        const op = window.__h2.opacityChain(el)
        const running = document.getAnimations().filter(a => a.playState === 'running').length
        if (running === 0 && prev !== null && Math.abs(prev - op) < 0.001) return { op, running }
        prev = op
        await new Promise(r => setTimeout(r, 120))
      }
      return { op: prev, running: -1 }
    })()`)

    const readLab = `(() => {
      const opts = [...document.querySelectorAll('.lab-option')]
      return opts.map(o => ({
        verdict: o.getAttribute('data-verdict'),
        picked: o.classList.contains('picked'),
        disabled: o.disabled,
        opacity: window.__h2.opacityChain(o),
        textRatio: window.__h2.ratio(o.querySelector('b') || o),
        smallRatio: o.querySelector('small') ? window.__h2.ratio(o.querySelector('small')) : null,
        text: (o.textContent || '').trim().slice(0, 24)
      }))
    })()`
    out.labBeforeSettle = await settle('.lab-option')
    out.labBefore = await ev(readLab)
    await ev(`(async () => {
      document.querySelector('.lab-option')?.click();
      return true
    })()`)
    out.labAfterSettle = await settle('.lab-option')
    out.labAfter = await ev(readLab)
    // 定位是哪一层在压暗：逐层列 opacity
    out.labChain = await ev(`(() => {
      const el = document.querySelector('.lab-option')
      const out = []; let n = el
      while (n && n !== document.documentElement) {
        const op = getComputedStyle(n).opacity
        if (op !== '1') out.push({ tag: n.tagName.toLowerCase(), cls: String(n.className).slice(0, 40), op })
        n = n.parentElement
      }
      return out
    })()`)

    // ── 诊断页：稳定态里指标卡的可见性（对比度 + 是否被压暗）──────
    await ev(`(async () => {
      document.querySelector('[data-nav="diagnostics"]')?.click();
      await new Promise(r => setTimeout(r, 1600));
      return true
    })()`)
    out.diagnostics = await ev(`(() => {
      const cards = [...document.querySelectorAll('.diag-metric')]
      const sample = cards.slice(0, 6).map(c => ({
        label: (c.querySelector('.diag-metric-label')?.textContent || '').trim().slice(0, 12),
        opacity: window.__h2.opacityChain(c),
        valueRatio: c.querySelector('strong') ? window.__h2.ratio(c.querySelector('strong')) : null,
        smallRatio: c.querySelector('small') ? window.__h2.ratio(c.querySelector('small')) : null
      }))
      const main = document.querySelector('#main')
      return { cards: cards.length, mainTextLen: (main?.textContent || '').replace(/\\s+/g, '').length, mainOpacity: Number(getComputedStyle(main).opacity), sample }
    })()`)

    writeFileSync(join(OUT, 'measure.json'), JSON.stringify(out, null, 2))
    console.log(JSON.stringify(out, null, 2).slice(0, 4000))
  } finally {
    try { edge.kill() } catch { }
    try { ws?.close() } catch { }
  }
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1) })
