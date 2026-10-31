/**
 * Phase 16.1 · 真实 DOM 文案残留检查（生产构建、独立 profile、合成数据）
 *
 * 与静态 lint 分工：
 *   · 静态 lint：所有字符串字面量（含没被渲染到的分支）
 *   · 本脚本：用户此刻真正看到的文本、下拉选项、标题元素、以及动态生成的字符串
 *
 * 用法：
 *   BASE=http://127.0.0.1:4191/ OUT=... SHOTS=... node scripts/phase16_1-dom-scan.mjs
 * 退出码：0 无残留 / 1 有残留（附状态、元素、坐标）
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'
import { lintVisible } from './lib/copyLint.mjs'

const BASE = process.env.BASE || 'http://127.0.0.1:4191/'
const OUT = process.env.OUT || 'screenshots/phase16_1/dom-scan.json'
const SHOTS = process.env.SHOTS || 'screenshots/phase16_1'
const PORT = Number(process.env.CDP_PORT || 12110)
const PROFILE = process.env.PROFILE || 'C:/Users/86152/AppData/Local/hermes/cache/scratch/p16_1/profile'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const CSV = Array.from({ length: 24 }, (_, i) => `w${i + 1},释义${i + 1}`).join('\n')
/** 选项文字来自用户数据（书名单）的下拉，不参与文案检查 */
const USER_DATA_SELECTS = new Set(['range-book'])

const sleep = ms => new Promise(r => setTimeout(r, ms))
const waitPort = p => new Promise((res, rej) => { const t0 = Date.now(); const tick = () => { const s = connect(p, '127.0.0.1'); s.once('connect', () => { s.destroy(); res() }); s.once('error', () => { s.destroy(); Date.now() - t0 > 45000 ? rej(new Error('timeout')) : setTimeout(tick, 250) }) }; tick() })

mkdirSync(SHOTS, { recursive: true })
if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true })
const edge = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--headless=new', '--hide-scrollbars', '--window-size=1440,1000', '--no-first-run', BASE], { stdio: 'ignore', windowsHide: true })

const report = { base: BASE, states: 0, hits: [], selects: [], headings: [], errors: [], covered: [] }
let ev, call, ws

const grab = () => ev(`(() => {
  const main = document.querySelector('#main');
  const text = main ? main.innerText : '';
  const heads = [...document.querySelectorAll('#main h1, #main h2, #main h3, #main h4, #main th, #main summary, aside h1, aside .brand')]
    .map(e => ({ tag: e.tagName.toLowerCase(), text: e.innerText.replace(/\\s+/g, ' ').trim().slice(0, 80) }));
  const selects = [...document.querySelectorAll('select')].map(s => ({
    id: s.id || null,
    label: (s.getAttribute('aria-label') || s.closest('label')?.innerText?.split('\\n')[0] || '').replace(/\\s+/g, ' ').trim(),
    options: [...s.options].map(o => o.text.trim()),
  }));
  return { page: document.documentElement.dataset.page, text, heads, selects };
})()`)

const shot = async name => {
  const r = await call('Page.captureScreenshot', { format: 'png' })
  writeFileSync(join(SHOTS, name + '.png'), Buffer.from(r.result.data, 'base64'))
}
const click = sel => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true })()`)
const settle = async (ms = 2500) => ev(`(async () => { const t0 = performance.now(); while (performance.now() - t0 < ${ms}) { if (document.getAnimations().filter(a => a.playState === 'running').length === 0) return true; await new Promise(r => setTimeout(r, 60)) } return false })()`)

try {
  await waitPort(PORT)
  let tab = null
  for (let i = 0; i < 80 && !tab; i++) { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); tab = l.find(t => t.type === 'page' && t.url.startsWith('http')); if (!tab) await sleep(300) }
  ws = new WebSocket(tab.webSocketDebuggerUrl)
  await new Promise(r => ws.addEventListener('open', r))
  let id = 0
  call = (m, p = {}) => new Promise(res => { const my = ++id; const on = e => { const x = JSON.parse(e.data); if (x.id === my) { ws.removeEventListener('message', on); res(x) } }; ws.addEventListener('message', on); ws.send(JSON.stringify({ id: my, method: m, params: p })) })
  ev = async e => { const r = await call('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.text); return r.result?.result?.value }
  await call('Runtime.enable'); await call('Page.enable'); await call('Log.enable')
  ws.addEventListener('message', e => { const x = JSON.parse(e.data); if (x.method === 'Log.entryAdded' && x.params.entry.level === 'error') report.errors.push(x.params.entry.text); if (x.method === 'Runtime.exceptionThrown') report.errors.push(x.params.exceptionDetails.text) })
  for (let i = 0; i < 240; i++) { if (await ev(`!!document.documentElement.dataset.page`)) break; await sleep(250) }
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })

  // 真实导入 + 计划
  await click('[data-nav="books"]'); await sleep(600)
  await click('#import'); await sleep(400)
  await ev(`(() => { const inp = document.querySelector('#import-file'); const dt = new DataTransfer(); dt.items.add(new File([${JSON.stringify(CSV)}], 'scan.csv', { type: 'text/csv' })); inp.files = dt.files; inp.dispatchEvent(new Event('change', { bubbles: true })) })()`)
  for (let i = 0; i < 40; i++) { if (await ev(`(() => { const b = document.querySelector('#import-confirm'); return b && !b.disabled })()`)) break; await sleep(200) }
  await click('#import-confirm'); await sleep(1200)
  await click('[data-nav="home"]'); await sleep(700)
  await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /生成今天的计划/.test(x.textContent || '')); b?.click() })()`)
  await sleep(1600)

  const navs = await ev(`[...document.querySelectorAll('[data-nav]')].map(b => b.dataset.nav)`)
  for (const theme of ['dark', 'light']) {
    if ((await ev(`document.documentElement.dataset.theme`)) !== theme) { await ev(`document.querySelector('#theme')?.click()`); await sleep(800) }
    for (const nav of navs) {
      await click(`[data-nav="${nav}"]`)
      for (let i = 0; i < 80; i++) { if ((await ev(`document.documentElement.dataset.page`)) === nav) break; await sleep(70) }
      await settle()
      const g = await grab()
      report.states++
      report.covered.push(`${theme}:${nav}`)
      for (const h of lintVisible(g.text)) report.hits.push({ state: `${theme}:${nav}`, scope: 'text', ...h })
      for (const head of g.heads) {
        if (!head.text) continue
        report.headings.push({ state: `${theme}:${nav}`, ...head })
        for (const h of lintVisible(head.text)) report.hits.push({ state: `${theme}:${nav}`, scope: `${head.tag}`, ...h })
      }
      for (const s of g.selects) {
        report.selects.push({ state: `${theme}:${nav}`, ...s })
        // 书单/素材名是用户自己导入的数据，不当作界面文案
        if (USER_DATA_SELECTS.has(s.id)) continue
        for (const opt of s.options) for (const h of lintVisible(opt)) report.hits.push({ state: `${theme}:${nav}`, scope: `select#${s.id}`, ...h })
      }
      if (theme === 'dark') await shot(`page-${nav}`)
    }
    // 训练态
    await click('[data-nav="home"]'); await sleep(600)
    if (await click('#preview-start')) {
      await sleep(700); report.states++
      if (await ev(`!!document.querySelector('[data-preview]')`)) {
        for (const h of lintVisible(await ev(`document.querySelector('#main').innerText`))) report.hits.push({ state: `${theme}:preview`, scope: 'text', ...h })
        await shot(`session-preview-${theme}`)
      }
      for (let i = 0; i < 60; i++) { if (!(await ev(`!!document.querySelector('[data-preview]')`))) break; await click('[data-preview="know"]'); await sleep(110) }
      if (await ev(`!!document.querySelector('#recall-now')`)) {
        report.states++
        for (const h of lintVisible(await ev(`document.querySelector('#main').innerText`))) report.hits.push({ state: `${theme}:preview-done`, scope: 'text', ...h })
        await shot(`session-preview-done-${theme}`)
        await click('#recall-now'); await sleep(900)
      }
      if (await ev(`!!document.querySelector('.answer')`)) {
        report.states++
        for (const h of lintVisible(await ev(`document.querySelector('#main').innerText`))) report.hits.push({ state: `${theme}:quiz`, scope: 'text', ...h })
        await shot(`session-quiz-${theme}`)
        await ev(`document.querySelectorAll('.answer')[3]?.click()`); await sleep(700)
        for (const h of lintVisible(await ev(`document.querySelector('#main').innerText`))) report.hits.push({ state: `${theme}:quiz-answered`, scope: 'text', ...h })
        await shot(`session-answered-${theme}`)
        for (let i = 0; i < 400; i++) {
          if ((await ev(`document.documentElement.dataset.page`)) !== 'quiz') break
          if (await ev(`!!document.querySelector('#next')`)) { await click('#next'); await sleep(60); continue }
          if (!(await click('.answer'))) { await sleep(80); continue }
          await sleep(70)
        }
        if ((await ev(`document.documentElement.dataset.page`)) === 'results') {
          report.states++
          for (const h of lintVisible(await ev(`document.querySelector('#main').innerText`))) report.hits.push({ state: `${theme}:results`, scope: 'text', ...h })
          await shot(`session-results-${theme}`)
        }
      }
    }
  }
  // 对话框（会动态生成文案）
  await click('[data-nav="settings"]'); await sleep(800)
  const dialogs = [['#clear', 'clear'], ['#check-integrity', 'integrity']]
  for (const [sel, name] of dialogs) {
    if (!(await click(sel))) continue
    await sleep(600)
    const t = await ev(`document.querySelector('#modal')?.innerText || ''`)
    report.states++
    for (const h of lintVisible(t)) report.hits.push({ state: `dialog:${name}`, scope: 'modal', ...h })
    await shot(`dialog-${name}`)
    await ev(`document.querySelector('.modal-backdrop')?.click()`); await sleep(300)
  }
  await click('[data-nav="home"]'); await sleep(600)
  if (await click('#plan-adjust')) {
    await sleep(600)
    const t = await ev(`document.querySelector('#modal')?.innerText || ''`)
    report.states++
    for (const h of lintVisible(t)) report.hits.push({ state: 'dialog:adjust', scope: 'modal', ...h })
    await shot('dialog-adjust')
    await ev(`document.querySelector('.modal-backdrop')?.click()`)
  }
} catch (e) {
  report.fatal = String(e?.stack ?? e)
} finally {
  try { ws?.close() } catch { }
  try { edge.kill() } catch { }
  writeFileSync(OUT, JSON.stringify(report, null, 1))
  console.log(JSON.stringify({
    out: OUT, states: report.states, hits: report.hits.length,
    byRule: report.hits.reduce((a, h) => (a[h.rule] = (a[h.rule] || 0) + 1, a), {}),
    selects: report.selects.length, errors: report.errors.length, fatal: report.fatal ?? null,
  }))
  process.exit(report.hits.length ? 1 : 0)
}
