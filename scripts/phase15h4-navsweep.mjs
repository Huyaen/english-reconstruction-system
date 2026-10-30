/**
 * Phase 15h.4 · 全站导航作用域扫描
 *
 * 用法：node scripts/phase15h4-navsweep.mjs
 * 目的：enterPage() 统一了 24 处页面写入，这里逐一点击 14 个侧栏入口 + 首页品牌键，
 * 确认每一页的 html[data-page] 与该页真实 DOM 一致（不是只看 page 变量）。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'

const ROOT = process.cwd()
const PORT = Number(process.env.CDP_PORT || 11780)
const PROFILE = join(ROOT, `.p15h4-nav-${PORT}`)
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const URL = 'http://127.0.0.1:4173/?test=1&proto=d'
const OUT = join(ROOT, 'screenshots', 'phase15h4')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const waitPort = p => new Promise((res, rej) => { const t0 = Date.now(); const tick = () => { const s = connect(p, '127.0.0.1'); s.once('connect', () => { s.destroy(); res() }); s.once('error', () => { s.destroy(); Date.now() - t0 > 45000 ? rej(new Error('timeout')) : setTimeout(tick, 250) }) }; tick() })

const main = async () => {
  mkdirSync(OUT, { recursive: true })
  if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true })
  const edge = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--headless=new',
    '--hide-scrollbars', '--window-size=1440,900', '--no-first-run', URL], { stdio: 'ignore', windowsHide: true })
  const report = { rows: [], failures: [] }
  let ws
  try {
    await waitPort(PORT)
    let tab = null
    for (let i = 0; i < 40 && !tab; i++) { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); tab = l.find(t => t.type === 'page' && t.url.includes('4173')); if (!tab) await sleep(300) }
    ws = new WebSocket(tab.webSocketDebuggerUrl)
    await new Promise(r => ws.addEventListener('open', r))
    let id = 0
    const call = (m, p = {}) => new Promise(res => { const my = ++id; const on = e => { const x = JSON.parse(e.data); if (x.id === my) { ws.removeEventListener('message', on); res(x) } }; ws.addEventListener('message', on); ws.send(JSON.stringify({ id: my, method: m, params: p })) })
    const ev = async expr => { const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval'); return r.result?.result?.value }
    await call('Runtime.enable')
    for (let i = 0; i < 240; i++) { if (await ev(`!!(document.documentElement && document.documentElement.dataset.page) && !!window.__pageTest`)) break; await sleep(250) }
    await ev(`(async () => { await window.__planTest.resetDomain(); return await window.__planTest.seedUnified() })()`)
    await sleep(600)

    const navs = await ev(`[...document.querySelectorAll('[data-nav]')].map(b => b.dataset.nav)`)
    for (const p of navs) {
      await ev(`document.querySelector('[data-nav="${p}"]').click()`)
      let ok = false
      for (let i = 0; i < 60; i++) {
        const st = await ev(`({ page: window.__pageTest.state().page, chrome: document.documentElement.dataset.page, level: document.documentElement.dataset.level,
          nav: (document.querySelector('[data-nav].active')||{}).dataset?.nav || '', text: (document.querySelector('#main')?.textContent||'').replace(/\\s+/g,' ').trim().slice(0,40) })`)
        if (st.page === p && st.chrome === p && st.nav === p && st.text.length > 2) { report.rows.push({ nav: p, ...st }); ok = true; break }
        await sleep(100)
      }
      if (!ok) {
        const st = await ev(`({ page: window.__pageTest.state().page, chrome: document.documentElement.dataset.page })`)
        report.failures.push(`${p}: ${JSON.stringify(st)}`)
      }
    }
    // 品牌键回首页
    await ev(`document.querySelector('.brand').click()`)
    let home = false
    for (let i = 0; i < 60; i++) {
      const st = await ev(`({ page: window.__pageTest.state().page, chrome: document.documentElement.dataset.page })`)
      if (st.page === 'home' && st.chrome === 'home') { home = true; break }
      await sleep(100)
    }
    report.brandHome = home
    if (!home) report.failures.push('brand: 未回首页')
  } finally {
    try { ws?.close() } catch { }
    try { edge.kill() } catch { }
    writeFileSync(join(OUT, 'nav-sweep.json'), JSON.stringify(report, null, 1))
    console.log(JSON.stringify({ pages: report.rows.length, brandHome: report.brandHome, failures: report.failures }))
  }
}
main().catch(e => { console.error('FATAL', e?.message ?? e); process.exit(1) })
