/**
 * Phase 15h.2 · 选择器有效性核查
 * 目的：`[data-level] :is([data-page="x"])` 假设 data-page 在 data-level 的后代上。
 * 如果两者都在 <html> 上，这类选择器永远不匹配 —— 整层页面样式就是死代码。
 * 这里直接问浏览器：哪些规则真的命中了元素。
 */
import { spawn } from 'node:child_process'
import { connect } from 'node:net'
import { join } from 'node:path'
import { writeFileSync, mkdirSync, existsSync, cpSync, rmSync } from 'node:fs'

const ROOT = process.cwd()
const PORT = Number(process.env.CDP_PORT || 10290)
const PROFILE = join(ROOT, `.p15h2-sel-${PORT}`)
const BASE = 'C:/Users/86152/AppData/Local/hermes/cache/scratch/p15h/live'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const URL = 'http://127.0.0.1:4173/?test=1&proto=d'
const sleep = ms => new Promise(r => setTimeout(r, ms))

function waitPort(port, t = 30000) {
  const t0 = Date.now()
  return new Promise((res, rej) => {
    const tick = () => { const s = connect(port, '127.0.0.1'); s.once('connect', () => { s.destroy(); res() }); s.once('error', () => { s.destroy(); Date.now() - t0 > t ? rej(new Error('timeout')) : setTimeout(tick, 250) }) }
    tick()
  })
}

const main = async () => {
  if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true })
  if (existsSync(BASE)) cpSync(BASE, PROFILE, { recursive: true })
  mkdirSync(join(ROOT, 'screenshots', 'phase15h2'), { recursive: true })
  const edge = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--headless=new',
    '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900', '--no-first-run', URL], { stdio: 'ignore', windowsHide: true })
  let ws
  try {
    await waitPort(PORT)
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    const tab = list.find(t => t.type === 'page' && t.url.includes('127.0.0.1'))
    ws = new WebSocket(tab.webSocketDebuggerUrl)
    await new Promise(r => ws.addEventListener('open', r))
    let id = 100
    const call = (method, params = {}) => new Promise(res => {
      const myId = ++id
      const onMsg = e => { const m = JSON.parse(e.data); if (m.id === myId) { ws.removeEventListener('message', onMsg); res(m.result) } }
      ws.addEventListener('message', onMsg); ws.send(JSON.stringify({ id: myId, method, params }))
    })
    await call('Runtime.enable')
    const ev = async expr => (await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value
    for (let i = 0; i < 40; i++) { if (await ev(`document.querySelectorAll('[data-nav]').length`) >= 5) break; await sleep(400) }

    const out = await ev(`(async () => {
      const where = [...document.querySelectorAll('[data-page]')].map(e => e.tagName.toLowerCase() + '#' + (e.id || '') + '[' + e.getAttribute('data-page') + ']')
      const whereLevel = [...document.querySelectorAll('[data-level]')].map(e => e.tagName.toLowerCase() + '[' + e.getAttribute('data-level') + ']')
      // 逐页检查：页面级选择器是否真能命中
      const pages = ['home','books','weak','sentence','reading','input','output','grammar','unit','diagnostics','exam','stats','ai','settings']
      const perPage = {}
      for (const p of pages) {
        document.querySelector('[data-nav="' + p + '"]')?.click()
        await new Promise(r => setTimeout(r, 700))
        const prefixed = [...document.styleSheets].flatMap(ss => { try { return [...ss.cssRules] } catch { return [] } })
          .filter(r => r.selectorText && r.selectorText.includes('[data-level]') && r.selectorText.includes('data-page'))
        let hit = 0
        for (const r of prefixed) {
          try { if (document.querySelector(r.selectorText)) hit++ } catch {}
        }
        perPage[p] = { rulesWithPrefix: prefixed.length, matchedRules: hit, mainNodes: document.querySelectorAll('#main *').length }
      }
      return { where, whereLevel, perPage }
    })()`)
    writeFileSync(join(ROOT, 'screenshots', 'phase15h2', 'selectors.json'), JSON.stringify(out, null, 2))
    console.log(JSON.stringify(out, null, 2).slice(0, 2500))
  } finally { try { edge.kill() } catch {}; try { ws?.close() } catch {} }
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1) })
