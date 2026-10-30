/**
 * Phase 16 · 真实界面文案抓取（审计与验收共用）
 *
 * 用法：OUT=<file> BASE=http://127.0.0.1:4173/?test=1&proto=d node scripts/phase16-capture-copy.mjs
 *       SEED=none 时不调用测试钩子（生产构建验收用，数据要靠真实导入）
 *
 * 抓的是"用户真正看到的东西"：每个状态下 #main 的文本块（带标签/类名，保留层级线索）、
 * 侧栏与顶栏、所有 aria-label / placeholder / title / alt、按钮与输入框的可访问名、以及 toast。
 * 不抓 HTML 源码，避免把注释和死代码当文案。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { connect } from 'node:net'
import { join, dirname } from 'node:path'

const ROOT = process.cwd()
const PORT = Number(process.env.CDP_PORT || 11800)
const BASE = process.env.BASE || 'http://127.0.0.1:4173/?test=1&proto=d'
const SEED = process.env.SEED || 'unified'
const THEME = process.env.THEME || 'dark'
const OUT = process.env.OUT || join(ROOT, 'screenshots', 'phase16', 'copy-live.json')
const PROFILE = join(ROOT, `.p16-profile-${PORT}`)
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const waitPort = p => new Promise((res, rej) => { const t0 = Date.now(); const tick = () => { const s = connect(p, '127.0.0.1'); s.once('connect', () => { s.destroy(); res() }); s.once('error', () => { s.destroy(); Date.now() - t0 > 45000 ? rej(new Error('timeout')) : setTimeout(tick, 250) }) }; tick() })

const main = async () => {
  mkdirSync(dirname(OUT), { recursive: true })
  if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true })
  const edge = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--headless=new',
    '--hide-scrollbars', '--window-size=1440,900', '--no-first-run', BASE], { stdio: 'ignore', windowsHide: true })
  const report = { base: BASE, theme: THEME, seed: SEED, states: {} }
  let ws
  try {
    await waitPort(PORT)
    let tab = null
    for (let i = 0; i < 40 && !tab; i++) { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); tab = l.find(t => t.type === 'page' && t.url.includes('127.0.0.1')); if (!tab) await sleep(300) }
    ws = new WebSocket(tab.webSocketDebuggerUrl)
    await new Promise(r => ws.addEventListener('open', r))
    let id = 0
    const call = (m, p = {}) => new Promise(res => { const my = ++id; const on = e => { const x = JSON.parse(e.data); if (x.id === my) { ws.removeEventListener('message', on); res(x) } }; ws.addEventListener('message', on); ws.send(JSON.stringify({ id: my, method: m, params: p })) })
    const ev = async expr => { const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval'); return r.result?.result?.value }
    await call('Runtime.enable')

    for (let i = 0; i < 240; i++) { if (await ev(`!!(document.documentElement && document.documentElement.dataset.page)`)) break; await sleep(250) }
    if (SEED === 'unified') {
      await ev(`(async () => { const api = window.__planTest; if (!api) return false; await api.resetDomain(); await api.seedUnified(); return true })()`)
      await sleep(400)
    }
    if (THEME !== (await ev(`document.documentElement.dataset.theme`))) { await ev(`document.querySelector('#theme')?.click()`); await sleep(400) }

    /** 把当前界面上的文字按"元素"抓下来，保留标签与类名，便于定位到源码 */
    const grab = () => ev(`(() => {
      const out = { blocks: [], attrs: [], overflow: [] };
      const seen = new Set();
      const push = el => {
        const t = (el.textContent || '').replace(/\\s+/g, ' ').trim();
        if (!t || t.length > 400) return;
        // 只取"叶子块"：自身有文字、且子元素不再各自出文字
        const kids = Array.from(el.children).filter(c => (c.textContent || '').trim().length > 0);
        if (kids.length > 0 && kids.length === el.children.length && (el.textContent||'').length > 60) return;
        const key = el.tagName + '|' + (el.className || '') + '|' + t;
        if (seen.has(key)) return;
        seen.add(key);
        out.blocks.push({ tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 60), text: t });
      };
      document.querySelectorAll('#main *, aside *, header *').forEach(el => { if (el.children.length === 0) push(el) });
      document.querySelectorAll('#main > *').forEach(push);
      for (const el of document.querySelectorAll('[aria-label], [placeholder], [title], [alt], [aria-description]')) {
        for (const a of ['aria-label', 'placeholder', 'title', 'alt', 'aria-description']) {
          const v = el.getAttribute(a);
          if (v && /[\\u4e00-\\u9fff]/.test(v)) out.attrs.push({ a, v, tag: el.tagName.toLowerCase(), cls: String(el.className || '').slice(0, 40) });
        }
      }
      const de = document.documentElement;
      out.overflow = { scrollW: de.scrollWidth, clientW: de.clientWidth, scrollH: de.scrollHeight, clientH: de.clientHeight };
      out.page = de.dataset.page; out.level = de.dataset.level;
      return out;
    })()`)

    const click = sel => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true })()`)
    const settle = async (ms = 2500) => ev(`(async () => { const t0 = performance.now(); let last = -1, since = 0; while (performance.now() - t0 < ${ms}) { const t = (document.querySelector('#main')?.textContent || '').replace(/\\s+/g,''); const running = document.getAnimations().filter(a => a.playState === 'running' && a.effect?.getTiming?.().iterations !== Infinity).length; if (t.length > 8 && running === 0) { if (t.length === last) { if (performance.now() - since > 140) return true } else { last = t.length; since = performance.now() } } else last = -1; await new Promise(r => setTimeout(r, 60)) } return false })()`)
    const snap = async (name) => { await settle(); report.states[name] = await grab() }

    const navs = await ev(`[...document.querySelectorAll('[data-nav]')].map(b => b.dataset.nav)`)
    for (const p of navs) {
      await click(`[data-nav="${p}"]`)
      for (let i = 0; i < 60; i++) { if ((await ev(`document.documentElement.dataset.page`)) === p) break; await sleep(100) }
      await snap(`page:${p}`)
    }

    // 会话态：预览 → 完成 → 记忆测试 → 结果
    await click('[data-nav="home"]'); await sleep(700)
    if (await click('#preview-start')) { await sleep(900); if (await ev(`!!document.querySelector('[data-preview]')`)) await snap('session:preview') }
    for (let i = 0; i < 40; i++) { if (!(await ev(`!!document.querySelector('[data-preview]')`))) break; await click('[data-preview="know"]'); await sleep(160) }
    if (await ev(`!!document.querySelector('#recall-now')`)) await snap('session:preview-done')
    await click('#recall-now'); await sleep(900)
    if (await ev(`!!document.querySelector('.quiz-card')`)) {
      await snap('session:quiz')
      await click('.answer'); await sleep(700)
      await snap('session:quiz-answered')
    }
    for (let i = 0; i < 200; i++) {
      const page = await ev(`document.documentElement.dataset.page`)
      if (page !== 'quiz') break
      if (await ev(`!!document.querySelector('#next')`)) { await click('#next'); await sleep(60); continue }
      if (!(await click('.answer'))) { await sleep(80); continue }
      await sleep(70)
    }
    if ((await ev(`document.documentElement.dataset.page`)) === 'results') await snap('session:results')

    // 对话框：导入 / 计划调整 / 设置里的危险操作面板（只抓文案，不提交）
    await click('[data-nav="books"]'); await sleep(700)
    if (await click('#import')) { await sleep(500); if (await ev(`!!document.querySelector('#modal[open]')`)) await snap('dialog:import'); await ev(`document.querySelector('#modal')?.close()`); await sleep(200) }
    await click('[data-nav="home"]'); await sleep(700)
    if (await click('#hero-adjust')) { await sleep(500); if (await ev(`!!document.querySelector('#modal[open]')`)) await snap('dialog:plan-adjust'); await ev(`document.querySelector('#modal')?.close()`); await sleep(200) }
  } finally {
    try { ws?.close() } catch { }
    try { edge.kill() } catch { }
    writeFileSync(OUT, JSON.stringify(report, null, 1))
    const summary = Object.entries(report.states).map(([k, v]) => `${k}:${v.blocks.length}+${v.attrs.length}`)
    console.log(JSON.stringify({ out: OUT, states: summary }, null, 1))
  }
}
main().catch(e => { console.error('FATAL', e?.message ?? e); process.exit(1) })
