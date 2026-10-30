/**
 * Phase 16 · 生产构建验收（不用任何测试钩子，数据靠真实导入）
 *
 * 用法：node scripts/phase16-prod-accept.mjs
 *   BASE 生产构建地址（默认 http://127.0.0.1:4180/）
 *   THEMES dark,light  WIDTHS 1366,1440,1920
 *
 * 做四件事：
 *  1) 在真实界面里导入一份词书（CSV 走 #import 对话框的真实解析路径），再真实点出今天的计划；
 *  2) 走一遍词汇会话：预览 → 回忆测试 → 结果，并在训练态截图；
 *  3) 逐页巡检 13 个页面：可见文案、aria-label/placeholder/title、横向溢出、控制台错误；
 *  4) 每页在 3 种宽度 × 2 种主题下截图，输出 JSON + PNG。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { connect } from 'node:net'
import { join, dirname } from 'node:path'

const ROOT = process.cwd()
const PORT = Number(process.env.CDP_PORT || 11900)
const BASE = process.env.BASE || 'http://127.0.0.1:4180/'
const THEMES = (process.env.THEMES || 'dark,light').split(',')
const WIDTHS = (process.env.WIDTHS || '1366,1440,1920').split(',').map(Number)
const OUTDIR = join(ROOT, 'screenshots', 'phase16', 'prod')
const PROFILE = join(ROOT, `.p16-prod-${PORT}`)
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const waitPort = p => new Promise((res, rej) => { const t0 = Date.now(); const tick = () => { const s = connect(p, '127.0.0.1'); s.once('connect', () => { s.destroy(); res() }); s.once('error', () => { s.destroy(); Date.now() - t0 > 45000 ? rej(new Error('timeout')) : setTimeout(tick, 250) }) }; tick() })

const CSV = [
  'abandon,放弃',
  'adequate,足够的',
  'bargain,便宜货；讨价还价',
  'cease,停止',
  'deliberate,故意的',
  'emerge,出现',
  'fragile,脆弱的',
  'genuine,真正的',
  'hazard,危险',
  'impose,强加',
  'jeopardize,危及',
  'keen,敏锐的',
  'linger,徘徊',
  'modest,适度的',
  'notion,观念',
  'obscure,晦涩的',
  'persuade,说服',
  'quaint,古雅的',
  'reluctant,不情愿的',
  'subtle,微妙的',
  'tolerate,容忍',
  'undermine,削弱',
  'vague,模糊的',
  'witness,目击',
  'yield,让步；产生',
  'abundant,丰富的',
  'bind,捆绑',
  'contradict,反驳',
  'dedicate,奉献',
  'elaborate,详尽阐述',
  'fundamental,根本的',
  'gradual,逐渐的',
].join('\n')

const main = async () => {
  mkdirSync(OUTDIR, { recursive: true })
  if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true })
  const edge = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--headless=new',
    '--hide-scrollbars', `--window-size=${WIDTHS[1] ?? 1440},900`, '--no-first-run', BASE], { stdio: 'ignore', windowsHide: true })
  const report = { base: BASE, themes: THEMES, widths: WIDTHS, steps: [], pages: {}, sessions: {}, errors: [], ok: false }
  let ws
  const shot = async (name) => {
    const r = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    writeFileSync(join(OUTDIR, name + '.png'), Buffer.from(r.result.data, 'base64'))
  }
  let call
  let ev
  try {
    await waitPort(PORT)
    let tab = null
    for (let i = 0; i < 60 && !tab; i++) {
      const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      tab = l.find(t => t.type === 'page' && t.url.startsWith('http'))
      if (!tab) await sleep(300)
    }
    ws = new WebSocket(tab.webSocketDebuggerUrl)
    await new Promise(r => ws.addEventListener('open', r))
    let id = 0
    call = (m, p = {}) => new Promise(res => { const my = ++id; const on = e => { const x = JSON.parse(e.data); if (x.id === my) { ws.removeEventListener('message', on); res(x) } }; ws.addEventListener('message', on); ws.send(JSON.stringify({ id: my, method: m, params: p })) })
    ev = async expr => { const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval'); return r.result?.result?.value }
    await call('Runtime.enable')
    await call('Page.enable')
    await call('Log.enable')
    ws.addEventListener('message', e => {
      const x = JSON.parse(e.data)
      if (x.method === 'Log.entryAdded' && ['error', 'warning'].includes(x.params.entry.level)) report.errors.push({ level: x.params.entry.level, text: x.params.entry.text, url: x.params.entry.url })
      if (x.method === 'Runtime.exceptionThrown') report.errors.push({ level: 'exception', text: x.params.exceptionDetails.exception?.description ?? x.params.exceptionDetails.text })
    })

    for (let i = 0; i < 240; i++) { if (await ev(`!!(document.documentElement && document.documentElement.dataset.page)`)) break; await sleep(250) }
    await call('Emulation.setDeviceMetricsOverride', { width: Number(WIDTHS[1] ?? 1440), height: 900, deviceScaleFactor: 1, mobile: false })

    const click = sel => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true })()`)
    const settle = async (ms = 3000) => ev(`(async () => { const t0 = performance.now(); let last = -1, since = 0; while (performance.now() - t0 < ${ms}) { const t = (document.querySelector('#main')?.textContent || '').replace(/\\s+/g,''); const running = document.getAnimations().filter(a => a.playState === 'running' && a.effect?.getTiming?.().iterations !== Infinity).length; if (t.length > 8 && running === 0) { if (t.length === last) { if (performance.now() - since > 160) return true } else { last = t.length; since = performance.now() } } else last = -1; await new Promise(r => setTimeout(r, 60)) } return false })()`)

    // ---- 1. 真实导入（走 #import 对话框的解析路径）----
    await click('[data-nav="books"]')
    await sleep(600)
    await click('#import')
    await sleep(500)
    await ev(`(() => {
      const inp = document.querySelector('#import-file');
      const dt = new DataTransfer();
      dt.items.add(new File([${JSON.stringify(CSV)}], 'phase16-accept.csv', { type: 'text/csv' }));
      inp.files = dt.files;
      inp.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`)
    let previewOk = false
    for (let i = 0; i < 40; i++) {
      previewOk = await ev(`(() => { const p = document.querySelector('#import-preview'); const b = document.querySelector('#import-confirm'); return !!p && !!(p.textContent||'').includes('个有效词') && b && !b.disabled })()`)
      if (previewOk) break
      await sleep(200)
    }
    report.steps.push({ step: 'import:preview', ok: previewOk, text: await ev(`document.querySelector('#import-preview')?.textContent ?? ''`) })
    if (previewOk) {
      await shot('01-import-dialog')
      await click('#import-confirm')
      await sleep(1200)
      report.steps.push({ step: 'import:confirm', ok: await ev(`!(document.querySelector('#modal[open]'))`) })
    }

    // ---- 2. 生成今天的计划 ----
    await click('[data-nav="home"]')
    await sleep(800)
    const genSel = await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => /生成|重新生成|开始今天/.test(x.textContent || '')); if (!b) return null; b.setAttribute('data-p16-gen','1'); return b.textContent.trim() })()`)
    if (genSel) { await click('[data-p16-gen="1"]'); await sleep(1500) }
    report.steps.push({ step: 'plan:generate', ok: !!genSel, button: genSel })

    // ---- 3. 逐页巡检（每页 3 宽度 × 2 主题）----
    const grab = () => ev(`(() => {
      const out = { blocks: [], attrs: [], overflowX: [], page: document.documentElement.dataset.page, level: document.documentElement.dataset.level };
      const seen = new Set();
      document.querySelectorAll('#main *, aside *, header *').forEach(el => {
        if (el.children.length) return;
        const t = (el.textContent || '').replace(/\\s+/g, ' ').trim();
        if (!t || t.length > 300) return;
        const k = el.tagName + '|' + t; if (seen.has(k)) return; seen.add(k);
        out.blocks.push(t);
      });
      for (const el of document.querySelectorAll('[aria-label], [placeholder], [title], [alt]')) {
        for (const a of ['aria-label', 'placeholder', 'title', 'alt']) {
          const v = el.getAttribute(a); if (v && /[\\u4e00-\\u9fff]/.test(v)) out.attrs.push(a + '=' + v);
        }
      }
      const de = document.documentElement;
      if (de.scrollWidth > de.clientWidth + 1) out.overflowX.push('html:' + de.scrollWidth + '>' + de.clientWidth);
      // 只看"会被裁掉的文字"：元素自带文字 + 容器会裁切 + 文字实际越界超过 2px。
      // 装饰性容器（无直接文字）与省略号截断不算缺陷。
      document.querySelectorAll('#main *, aside *, header *').forEach(el => {
        const own = [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim());
        if (!own.length) return;
        const cs = getComputedStyle(el);
        const clips = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
        if (!clips || cs.textOverflow === 'ellipsis') return;
        const box = el.getBoundingClientRect();
        let worst = 0;
        for (const n of own) {
          const r = document.createRange(); r.selectNodeContents(n);
          for (const rect of r.getClientRects()) worst = Math.max(worst, rect.right - box.right);
        }
        if (worst > 2) out.overflowX.push(el.tagName + '.' + String(el.className).slice(0, 30) + ':+' + Math.round(worst) + 'px/' + cs.overflowX);
      });
      return out;
    })()`)

    const navs = await ev(`[...document.querySelectorAll('[data-nav]')].map(b => b.dataset.nav)`)
    for (const theme of THEMES) {
      if (theme !== (await ev(`document.documentElement.dataset.theme`))) { await ev(`document.querySelector('#theme')?.click()`); await sleep(700) }
      for (const w of WIDTHS) {
        await call('Emulation.setDeviceMetricsOverride', { width: w, height: w <= 1366 ? 768 : 900, deviceScaleFactor: 1, mobile: false })
        await sleep(350)
        for (const p of navs) {
          await click(`[data-nav="${p}"]`)
          for (let i = 0; i < 80; i++) { if ((await ev(`document.documentElement.dataset.page`)) === p) break; await sleep(80) }
          await settle()
          const g = await grab()
          const key = `${theme}:${w}:${p}`
          report.pages[key] = g
          if (theme === 'dark' && w === Number(WIDTHS[1] ?? 1440)) await shot(`page-${p}`)
        }
      }
    }

    // ---- 4. 真实词汇会话（预览 → 测试 → 结果），单宽度取证 ----
    await call('Emulation.setDeviceMetricsOverride', { width: Number(WIDTHS[1] ?? 1440), height: 900, deviceScaleFactor: 1, mobile: false })
    for (const theme of THEMES) {
      if (theme !== (await ev(`document.documentElement.dataset.theme`))) { await ev(`document.querySelector('#theme')?.click()`); await sleep(700) }
      await click('[data-nav="home"]'); await sleep(800)
      const started = await click('#preview-start')
      report.sessions[theme] = { started }
      if (started) {
        await sleep(900)
        if (await ev(`!!document.querySelector('[data-preview]')`)) { await settle(); await shot(`session-preview-${theme}`); report.sessions[theme].preview = await grab() }
        for (let i = 0; i < 60; i++) { if (!(await ev(`!!document.querySelector('[data-preview]')`))) break; await click('[data-preview="know"]'); await sleep(150) }
        if (await ev(`!!document.querySelector('#recall-now')`)) { await settle(); await shot(`session-preview-done-${theme}`); report.sessions[theme].previewDone = await grab() }
        await click('#recall-now'); await sleep(1000)
        if (await ev(`!!document.querySelector('.quiz-card')`)) {
          await settle(); await shot(`session-quiz-${theme}`); report.sessions[theme].quiz = await grab()
          await click('.answer'); await sleep(800)
          await shot(`session-quiz-answered-${theme}`); report.sessions[theme].quizAnswered = await grab()
        }
        for (let i = 0; i < 300; i++) {
          const page = await ev(`document.documentElement.dataset.page`)
          if (page !== 'quiz') break
          if (await ev(`!!document.querySelector('#next')`)) { await click('#next'); await sleep(70); continue }
          if (!(await click('.answer'))) { await sleep(90); continue }
          await sleep(80)
        }
        if ((await ev(`document.documentElement.dataset.page`)) === 'results') { await settle(); await shot(`session-results-${theme}`); report.sessions[theme].results = await grab() }
      }
    }

    // ---- 5. 阅读：粘贴一篇真实短文并保存 ----
    await click('[data-nav="reading"]'); await sleep(800)
    const pasted = await ev(`(() => {
      const ta = document.querySelector('#read-paste'); if (!ta) return false;
      ta.value = "The city council voted on Tuesday to pedestrianise the stretch of Market Street that runs past the old fish market. Shopkeepers had argued for two years that delivery vans were killing foot traffic; the same shopkeepers now worry that the loading bays will disappear before the barriers do. The council's compromise is modest: barriers go up in March, and the loading bays stay for eighteen months. Whether that is long enough to prove anything is, as one councillor admitted, an open question.";
      ta.dispatchEvent(new Event('input', { bubbles: true }));
      const b = document.querySelector('[data-read-save="paste"]'); if (!b) return false; b.click(); return true;
    })()`)
    await sleep(1500)
    report.steps.push({ step: 'reading:import', ok: pasted, page: await ev(`document.documentElement.dataset.page`) })
    await settle()
    if (await ev(`!!document.querySelector('#reading-surface, #read-paste')`)) await shot('reading-after-import')

    report.ok = report.errors.filter(e => e.level !== 'warning').length === 0
  } catch (e) {
    report.fatal = String(e?.stack ?? e)
  } finally {
    try { ws?.close() } catch { }
    try { edge.kill() } catch { }
    const pages = Object.values(report.pages)
    report.summary = {
      pageViews: pages.length,
      overflowViews: pages.filter(p => p.overflowX.length).length,
      copies: pages.reduce((n, p) => n + p.blocks.length, 0),
      attrs: pages.reduce((n, p) => n + p.attrs.length, 0),
      errors: report.errors.length,
    }
    writeFileSync(join(OUTDIR, 'prod-accept.json'), JSON.stringify(report, null, 1))
    console.log(JSON.stringify({ summary: report.summary, steps: report.steps, ok: report.ok, fatal: report.fatal ?? null }, null, 1))
  }
}
main().catch(e => { console.error('FATAL', e?.message ?? e); process.exit(1) })
