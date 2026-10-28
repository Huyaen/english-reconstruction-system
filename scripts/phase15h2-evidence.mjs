/**
 * Phase 15h.2 · 稳定态证据采集
 *
 * 与 15h 的 capture 脚本的区别：
 *  - 每个页面都过"稳定态门控"（文本非空 + 无 loading + 无运行中动画 + 150ms 文本不再变化），
 *    不再用固定 sleep 赌渲染速度（diagnostics 曾因此只拍到半页）。
 *  - 除 14 页静帧外，还拍真实交互态：考试作答、句子判题前后、表达自动保存、
 *    阅读正文 + 辅助面板（真的导入文章并进入阅读器，不停在导入页）。
 *
 * 用法：node scripts/phase15h2-evidence.mjs
 * 输出：screenshots/phase15h2/stills/*、screenshots/phase15h2/interaction/*
 */
import { spawn } from 'node:child_process'
import { existsSync, cpSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'

const ROOT = process.cwd()
const PORT = Number(process.env.CDP_PORT || 10390)
const PROFILE = join(ROOT, `.p15h2-ev-${PORT}`)
const BASE_PROFILE = process.env.PROFILE || 'C:/Users/86152/AppData/Local/hermes/cache/scratch/p15h/live'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const URL = 'http://127.0.0.1:4173/?test=1&proto=d'
const STILLS = join(ROOT, 'screenshots', 'phase15h2', 'stills')
const INTER = join(ROOT, 'screenshots', 'phase15h2', 'interaction')
const PAGES = ['home', 'books', 'weak', 'sentence', 'reading', 'input', 'output', 'grammar', 'unit', 'diagnostics', 'exam', 'stats', 'ai', 'settings']
const THEMES = (process.env.THEMES || 'dark,light').split(',')
const sleep = ms => new Promise(r => setTimeout(r, ms))

const ARTICLE_TITLE = 'The Slow Repair of a Water System'
const PASSAGE = `The aqueducts carried water across the valley for four centuries. Engineers measured the slope with simple tools, and the city grew around that steady supply. When the pipes failed, the repair took months, because every stone had to be replaced by hand. Workers climbed the arches at dawn, carrying buckets and rope, while the council argued about the cost. In the end the water returned, but the city had learned something about maintenance: a system that nobody watches will fail quietly, long before anyone notices the silence. The lesson survived the empire that built it, and it survives in the way we still inspect the pipes beneath our streets.`

function waitPort(port, timeout = 30000) {
  const t0 = Date.now()
  return new Promise((res, rej) => {
    const tick = () => {
      const s = connect(port, '127.0.0.1')
      s.once('connect', () => { s.destroy(); res() })
      s.once('error', () => { s.destroy(); Date.now() - t0 > timeout ? rej(new Error('devtools timeout')) : setTimeout(tick, 250) })
    }
    tick()
  })
}

const main = async () => {
  if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true })
  if (existsSync(BASE_PROFILE)) cpSync(BASE_PROFILE, PROFILE, { recursive: true })
  mkdirSync(STILLS, { recursive: true }); mkdirSync(INTER, { recursive: true })

  const edge = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900',
    '--no-first-run', '--no-default-browser-check', URL], { stdio: 'ignore', windowsHide: true })
  const report = { stills: [], interaction: [], readyMs: {}, problems: [] }
  let ws
  try {
    await waitPort(PORT)
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    const tab = list.find(t => t.type === 'page' && t.url.includes('127.0.0.1'))
    ws = new WebSocket(tab.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    let id = 100
    const call = (method, params = {}) => new Promise(res => {
      const myId = ++id
      const onMsg = e => { const m = JSON.parse(e.data); if (m.id === myId) { ws.removeEventListener('message', onMsg); res(m) } }
      ws.addEventListener('message', onMsg); ws.send(JSON.stringify({ id: myId, method, params }))
    })
    const ev = async expr => {
      const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval error')
      return r.result?.result?.value
    }
    const shot = async (dir, name) => {
      const r = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      writeFileSync(join(dir, name), Buffer.from(r.result.data, 'base64'))
      return name
    }
    await call('Page.enable'); await call('Runtime.enable')
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    for (let i = 0; i < 40; i++) { if ((await ev(`document.querySelectorAll('[data-nav]').length`)) >= 5) break; await sleep(400) }

    const setTheme = async theme => {
      for (let i = 0; i < 4; i++) {
        if ((await ev(`document.documentElement.dataset.theme`)) === theme) return
        await ev(`document.querySelector('#theme')?.click()`); await sleep(520)
      }
    }
    // 稳定态门控：返回耗时与文本长度
    const navStable = async page => {
      const r = await ev(`(async () => {
        const t0 = performance.now()
        const b = document.querySelector('[data-nav="${page}"]')
        if (!b) return { error: 'no-nav' }
        b.click()
        let last = -1, since = 0
        while (performance.now() - t0 < 7000) {
          const h = document.querySelector('#main')
          const txt = (h?.textContent || '').replace(/\\s+/g, '')
          const loading = !!document.querySelector('#main .d-loading, #main .loading-state')
          const running = document.getAnimations().filter(a => a.playState === 'running' && a.effect?.getTiming?.().iterations !== Infinity).length
          if (txt.length > 20 && !loading && running === 0) {
            if (txt.length === last) { if (performance.now() - since > 150) return { ms: Math.round(performance.now() - t0), textLen: txt.length } }
            else { last = txt.length; since = performance.now() }
          } else { last = -1 }
          await new Promise(r => setTimeout(r, 60))
        }
        return { error: 'not-stable', textLen: (document.querySelector('#main')?.textContent || '').length }
      })()`)
      return r
    }

    // ── 1. 14 页 × 深浅 静帧 ────────────────────────────────
    for (const theme of THEMES) {
      await setTheme(theme)
      for (const page of PAGES) {
        const r = await navStable(page)
        if (r?.error) report.problems.push({ page, theme, ...r })
        report.readyMs[`${page}-${theme}`] = r?.ms ?? null
        const name = `${page}-${theme}-1440x900.png`
        await shot(STILLS, name)
        report.stills.push({ page, theme, name, readyMs: r?.ms ?? null, textLen: r?.textLen ?? null })
      }
    }

    // ── 2. 考试作答（深色）────────────────────────────────
    await setTheme('dark')
    await navStable('exam')
    await ev(`(async () => {
      document.querySelector('[data-exam-tab="overview"]')?.click(); await new Promise(r => setTimeout(r, 800));
      document.querySelector('#exam-start-mixed')?.click();
      for (let i = 0; i < 80; i++) { await new Promise(r => setTimeout(r, 80)); if (document.querySelector('.exam-option')) break }
      return true
    })()`)
    await sleep(300)
    report.interaction.push(await shot(INTER, 'exam-question-dark-1440x900.png'))
    const answered = await ev(`(async () => {
      const opt = document.querySelector('.exam-option')
      opt?.click()
      await new Promise(r => setTimeout(r, 500))
      const sel = document.querySelector('.exam-option.selected')
      return { selected: !!sel, checked: !!document.querySelector('.exam-option input:checked'), rows: document.querySelectorAll('.exam-option').length }
    })()`)
    report.examAnswered = answered
    await sleep(200)
    report.interaction.push(await shot(INTER, 'exam-answered-dark-1440x900.png'))

    // ── 3. 句子判题前/后 ──────────────────────────────────
    await navStable('sentence')
    await ev(`(async () => {
      document.querySelector('[data-sentence-start]')?.click()
      for (let i = 0; i < 80; i++) { await new Promise(r => setTimeout(r, 80)); if (document.querySelector('.lab-option')) break }
      return true
    })()`)
    await sleep(250)
    report.interaction.push(await shot(INTER, 'sentence-before-dark-1440x900.png'))
    const verdict = await ev(`(async () => {
      document.querySelector('.lab-option')?.click()
      await new Promise(r => setTimeout(r, 800))
      const opts = [...document.querySelectorAll('.lab-option')]
      return opts.map(o => ({ v: o.getAttribute('data-verdict'), op: Number(getComputedStyle(o).opacity) }))
    })()`)
    report.verdict = verdict
    await sleep(200)
    report.interaction.push(await shot(INTER, 'sentence-after-dark-1440x900.png'))

    // ── 4. 表达：输入 + 自动保存 ───────────────────────────
    await navStable('output')
    const outState = await ev(`(async () => {
      const start = document.querySelector('[data-out-start]')
      if (!start) return { error: 'no-start' }
      start.click()
      for (let i = 0; i < 80; i++) { await new Promise(r => setTimeout(r, 80)); if (document.querySelector('#out-editor')) break }
      const ta = document.querySelector('#out-editor')
      ta.value = 'The city kept its water because someone checked the pipes every spring, long before anything broke.'
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      const seen = new Set([document.querySelector('#out-save-state')?.textContent])
      const el = document.querySelector('#out-save-state')
      const obs = new MutationObserver(() => seen.add(el.textContent))
      obs.observe(el, { childList: true, characterData: true, subtree: true })
      const t0 = Date.now()
      while (Date.now() - t0 < 4000) { await new Promise(r => setTimeout(r, 80)); if (seen.size >= 2) break }
      obs.disconnect()
      return { role: el.getAttribute('role'), live: el.getAttribute('aria-live'), seen: [...seen], words: document.querySelector('#out-count')?.textContent }
    })()`)
    report.output = outState
    await sleep(200)
    report.interaction.push(await shot(INTER, 'output-typing-dark-1440x900.png'))

    // ── 5. 阅读：真实导入 → 首读 → 正文 + 辅助面板 ──────────
    await navStable('reading')
    const seeded = await ev(`(async () => {
      const t = document.querySelector('#read-title')
      const p = document.querySelector('#read-paste')
      if (!t || !p) return { error: 'no-form' }
      t.value = ${JSON.stringify(ARTICLE_TITLE)}
      t.dispatchEvent(new Event('input', { bubbles: true }))
      p.value = ${JSON.stringify(PASSAGE)}
      p.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise(r => setTimeout(r, 400))
      document.querySelector('[data-read-save="paste"]')?.click()
      await new Promise(r => setTimeout(r, 1600))
      return { toast: document.querySelector('#toast')?.textContent || '', preview: !!document.querySelector('#read-preview') }
    })()`)
    report.readingSeed = seeded
    const opened = await ev(`(async () => {
      document.querySelector('[data-read-start]')?.click()
      for (let i = 0; i < 100; i++) { await new Promise(r => setTimeout(r, 100)); if (document.querySelector('.reader-text, #read-text')) break }
      const cold = document.querySelector('[data-read-cold-submit]')
      if (cold) {
        const self = document.querySelector('#read-cold-self')
        if (self) { self.value = 62; self.dispatchEvent(new Event('input', { bubbles: true })) }
        cold.click()
        for (let i = 0; i < 100; i++) { await new Promise(r => setTimeout(r, 100)); if (document.querySelector('.reader-text, #read-text')) break }
      }
      const txt = document.querySelector('.reader-text, #read-text')
      return { reading: !!txt, textLen: (txt?.textContent || '').replace(/\\s+/g, '').length, where: document.documentElement.dataset.page }
    })()`)
    report.readingOpen = opened
    await sleep(400)
    report.interaction.push(await shot(INTER, 'reading-article-dark-1440x900.png'))
    const panel = await ev(`(async () => {
      const toggle = document.querySelector('.reader-side-toggle, [data-read-side]')
      if (!toggle) return { error: 'no-toggle' }
      if (toggle.getAttribute('aria-expanded') !== 'true') toggle.click()
      await new Promise(r => setTimeout(r, 700))
      const side = document.querySelector('.reader-side')
      return { expanded: toggle.getAttribute('aria-expanded'), sideVisible: !!side && side.getBoundingClientRect().width > 40, sideWidth: side ? Math.round(side.getBoundingClientRect().width) : 0 }
    })()`)
    report.readingPanel = panel
    await sleep(250)
    report.interaction.push(await shot(INTER, 'reading-panel-dark-1440x900.png'))

    writeFileSync(join(ROOT, 'screenshots', 'phase15h2', 'evidence-manifest.json'), JSON.stringify(report, null, 2))
    const bad = report.stills.filter(s => !s.readyMs)
    console.log(JSON.stringify({ stills: report.stills.length, interaction: report.interaction.length, notStable: bad.length, problems: report.problems.slice(0, 3) }))
  } finally { try { edge.kill() } catch { }; try { ws?.close() } catch { } }
}
main().catch(e => { console.error('FATAL', e.message); process.exit(1) })
