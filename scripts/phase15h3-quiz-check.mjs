/**
 * Phase 15h.3 · 训练态（data-page="quiz"）视觉核查
 * quiz.css 的 18 个选择器修好之后第一次生效，必须真的进一次训练会话看结果。
 * books → 训练这批 → .answer → 截图 + 计算样式（深/浅各一次）
 */
import { spawn } from 'node:child_process'
import { connect } from 'node:net'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd(), PORT = Number(process.env.CDP_PORT || 11750)
const PROFILE = join(ROOT, `.p15h3-quiz-${PORT}`)
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const OUT = join(ROOT, 'screenshots', 'phase15h3', 'quiz')
const sleep = ms => new Promise(r => setTimeout(r, ms))
mkdirSync(OUT, { recursive: true })
const waitPort = (p, t = 30000) => new Promise((res, rej) => { const t0 = Date.now(); const tick = () => { const s = connect(p, '127.0.0.1'); s.once('connect', () => { s.destroy(); res() }); s.once('error', () => { s.destroy(); Date.now() - t0 > t ? rej(new Error('devtools timeout')) : setTimeout(tick, 250) }) }; tick() })

const main = async () => {
  if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true })
  const edge = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--headless=new', '--disable-gpu',
    '--hide-scrollbars', '--window-size=1440,900', '--no-first-run', 'http://127.0.0.1:4173/?test=1&proto=d'], { stdio: 'ignore', windowsHide: true })
  let ws
  const out = { styles: {}, shots: [] }
  try {
    await waitPort(PORT)
    let tab = null
    for (let i = 0; i < 40 && !tab; i++) { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); tab = l.find(t => t.type === 'page' && t.url.includes('127.0.0.1:4173')); if (!tab) await sleep(300) }
    ws = new WebSocket(tab.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    let id = 1
    const call = (m, p = {}) => new Promise((res, rej) => { const my = ++id; const on = e => { const x = JSON.parse(e.data); if (x.id === my) { ws.removeEventListener('message', on); res(x) } }; ws.addEventListener('message', on); ws.send(JSON.stringify({ id: my, method: m, params: p })); setTimeout(() => rej(new Error('cdp timeout ' + m)), 20000) })
    const ev = async x => { const r = await call('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval'); return r.result?.result?.value }
    await call('Page.enable'); await call('Runtime.enable')
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    for (let i = 0; i < 80; i++) { if (await ev(`!!document.documentElement?.dataset?.page && document.querySelectorAll('[data-nav]').length >= 5`)) break; await sleep(300) }
    await sleep(500)

    for (const theme of ['dark', 'light']) {
      for (let i = 0; i < 4; i++) { if ((await ev(`document.documentElement.dataset.theme`)) === theme) break; await ev(`document.querySelector('#theme')?.click()`); await sleep(500) }
      // 每次重新从 books 起一个训练会话
      await ev(`(async () => { document.querySelector('[data-nav="books"]')?.click(); await new Promise(r => setTimeout(r, 900)); return document.documentElement.dataset.page })()`)
      out.styles[theme] = out.styles[theme] || {}
      out.styles[theme].pre = await ev(`(() => {
        const b = document.querySelector('#train-filter')
        return { hasButton: !!b, disabled: b ? b.disabled : null, rows: document.querySelectorAll('[data-word], tr[data-id], .word-row').length, page: document.documentElement.dataset.page, toast: document.querySelector('.toast')?.textContent?.slice(0, 40) ?? null }
      })()`)
      const started = await ev(`(async () => {
        document.querySelector('#train-filter')?.click()
        for (let i = 0; i < 80; i++) { await new Promise(r => setTimeout(r, 100)); if (document.querySelector('.answer')) return document.documentElement.dataset.page }
        return document.documentElement.dataset.page
      })()`)
      out.styles[theme] = { ...out.styles[theme], started, probe: await ev(`(() => {
        const q = (s) => document.querySelector(s)
        const pick = (el, props) => { if (!el) return null; const cs = getComputedStyle(el); const o = {}; for (const p of props) o[p] = cs[p]; const r = el.getBoundingClientRect(); o.rect = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)]; return o }
        const props = ['display','gridTemplateColumns','gap','padding','fontSize','fontWeight','borderRadius','backgroundColor','color','borderLeft','minHeight','textAlign']
        return {
          page: document.documentElement.dataset.page,
          answer: pick(q('.answer'), props),
          kbd: pick(q('.answer kbd'), props),
          prompt: pick(q('#quiz-prompt') || q('.quiz-prompt'), props),
          options: document.querySelectorAll('.answer').length,
          previewChips: document.querySelectorAll('[data-preview]').length
        }
      })()`) }
      const shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      writeFileSync(join(OUT, `quiz-${theme}.png`), Buffer.from(shot.result.data, 'base64'))
      out.shots.push(`quiz-${theme}.png`)
      await ev(`document.querySelector('#quit')?.click()`); await sleep(700)
    }
    writeFileSync(join(OUT, 'quiz-styles.json'), JSON.stringify(out, null, 2))
    console.log(JSON.stringify({ shots: out.shots, started: { dark: out.styles.dark?.started, light: out.styles.light?.started } }))
  } finally { try { edge.kill() } catch { } try { ws?.close() } catch { } }
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1) })
