/**
 * Phase 16.1 · 文案改动后的排版回归：3 宽度 × 2 主题 × 14 页的溢出/裁切检查
 * 只读生产构建；截图写到 SHOTS。判定：文字被容器裁掉 > 2px，或文档横向溢出 > 2px。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'

const BASE = process.env.BASE || 'http://127.0.0.1:4191/'
const OUT = process.env.OUT || 'screenshots/phase16_1/overflow.json'
const SHOTS = process.env.SHOTS || 'screenshots/phase16_1'
const PORT = Number(process.env.CDP_PORT || 12120)
const PROFILE = process.env.PROFILE || 'C:/Users/86152/AppData/Local/hermes/cache/scratch/p16_1/profile-ov'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const CSV = Array.from({ length: 26 }, (_, i) => `w${i + 1},释义${i + 1}`).join('\n')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const waitPort = p => new Promise((res, rej) => { const t0 = Date.now(); const tick = () => { const s = connect(p, '127.0.0.1'); s.once('connect', () => { s.destroy(); res() }); s.once('error', () => { s.destroy(); Date.now() - t0 > 45000 ? rej(new Error('timeout')) : setTimeout(tick, 250) }) }; tick() })

mkdirSync(SHOTS, { recursive: true })
if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true })
const edge = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--headless=new', '--hide-scrollbars', '--window-size=1440,900', '--no-first-run', BASE], { stdio: 'ignore', windowsHide: true })
const out = { views: 0, clipped: [], docOverflow: [], errors: [] }
let ev, call, ws
const metrics = { width: 1440, height: 900 }
try {
  await waitPort(PORT)
  let tab = null
  for (let i = 0; i < 80 && !tab; i++) { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); tab = l.find(t => t.type === 'page' && t.url.startsWith('http')); if (!tab) await sleep(300) }
  ws = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r))
  let id = 0
  call = (m, p = {}) => new Promise(res => { const my = ++id; const on = e => { const x = JSON.parse(e.data); if (x.id === my) { ws.removeEventListener('message', on); res(x) } }; ws.addEventListener('message', on); ws.send(JSON.stringify({ id: my, method: m, params: p })) })
  ev = async e => (await call('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result?.result?.value
  await call('Runtime.enable'); await call('Page.enable'); await call('Log.enable')
  ws.addEventListener('message', e => { const x = JSON.parse(e.data); if (x.method === 'Log.entryAdded' && x.params.entry.level === 'error') out.errors.push(x.params.entry.text) })
  for (let i = 0; i < 240; i++) { if (await ev(`!!document.documentElement.dataset.page`)) break; await sleep(250) }
  await call('Emulation.setDeviceMetricsOverride', { ...metrics, deviceScaleFactor: 1, mobile: false })
  await ev(`document.querySelector('[data-nav="books"]').click()`); await sleep(600)
  await ev(`document.querySelector('#import').click()`); await sleep(350)
  await ev(`(() => { const inp = document.querySelector('#import-file'); const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(CSV)}], 'ov.csv', { type: 'text/csv' })); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  for (let i = 0; i < 40; i++) { if (await ev(`(() => { const b = document.querySelector('#import-confirm'); return b && !b.disabled })()`)) break; await sleep(200) }
  await ev(`document.querySelector('#import-confirm').click()`); await sleep(1000)
  await ev(`document.querySelector('[data-nav="home"]').click()`); await sleep(600)
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /生成今天的计划/.test(x.textContent || '')); b?.click() })()`); await sleep(1500)

  const navs = await ev(`[...document.querySelectorAll('[data-nav]')].map(b => b.dataset.nav)`)
  const measure = () => ev(`(() => {
    const bad = [];
    const de = document.documentElement;
    const skip = el => el.closest('[hidden], .d-field, [aria-hidden="true"], #modal');
    for (const el of document.querySelectorAll('#main *, aside *, header *')) {
      if (skip(el)) continue;
      const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
      if (!own.length) continue;
      const cs = getComputedStyle(el);
      if (!(cs.overflowX === 'hidden' || cs.overflowX === 'clip')) continue;
      if (cs.textOverflow === 'ellipsis') continue;
      const box = el.getBoundingClientRect();
      let worst = 0, dir = '';
      for (const n of own) { const r = document.createRange(); r.selectNodeContents(n); for (const rect of r.getClientRects()) { const d = rect.right - box.right; if (d > worst) { worst = d; dir = 'right' } } }
      if (worst > 2) bad.push({ el: el.tagName.toLowerCase() + '.' + String(el.className).slice(0, 28), over: Math.round(worst), text: (el.textContent || '').trim().slice(0, 60) });
    }
    return { bad, doc: de.scrollWidth - de.clientWidth, vw: de.clientWidth };
  })()`)

  for (const theme of ['dark', 'light']) {
    if ((await ev(`document.documentElement.dataset.theme`)) !== theme) { await ev(`document.querySelector('#theme')?.click()`); await sleep(800) }
    for (const w of [1366, 1440, 1920]) {
      const h = w === 1366 ? 768 : 900;
      await call('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false })
      await sleep(220)
      for (const nav of navs) {
        await ev(`document.querySelector('[data-nav="${nav}"]').click()`)
        for (let i = 0; i < 60; i++) { if ((await ev(`document.documentElement.dataset.page`)) === nav) break; await sleep(60) }
        await sleep(w === 1440 ? 420 : 260)
        const m = await measure()
        out.views++
        for (const b of m.bad) out.clipped.push({ theme, width: w, page: nav, ...b })
        if (m.doc > 2) out.docOverflow.push({ theme, width: w, page: nav, over: m.doc })
        if (w === 1440) {
          const r = await call('Page.captureScreenshot', { format: 'png' })
          writeFileSync(join(SHOTS, `page-${nav}-${theme}.png`), Buffer.from(r.result.data, 'base64'))
        }
      }
    }
  }
} catch (e) { out.fatal = String(e?.stack ?? e) } finally {
  try { ws?.close() } catch { }
  try { edge.kill() } catch { }
  writeFileSync(OUT, JSON.stringify(out, null, 1))
  console.log(JSON.stringify({ out: OUT, views: out.views, clipped: out.clipped.length, docOverflow: out.docOverflow.length, errors: out.errors.length, fatal: out.fatal ?? null }))
  if (out.clipped.length) console.log(JSON.stringify(out.clipped.slice(0, 8), null, 1))
}
