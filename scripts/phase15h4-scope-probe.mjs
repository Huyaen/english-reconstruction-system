/**
 * Phase 15h.4 · 修复前后的页面作用域对照（不依赖 __pageTest）
 *
 * 用法：TAG=before|after node scripts/phase15h4-scope-probe.mjs
 * 产出：screenshots/phase15h4/scope-<TAG>-<theme>.json
 *
 * 为什么单独写一个：修复前的代码没有 __pageTest 钩子，但对照必须用同一套动作、同一套读数。
 * 所以这里只用「页面自己暴露的东西」作判据：
 *   html[data-page] / data-level / #main 里实际是什么标记 / 该页专属规则的真实命中 / 关键计算样式。
 * 内部 page 不读——修复前的缺陷恰恰是它们不一致，用 DOM 标记反推内部实际渲染的是哪一页即可。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'

const ROOT = process.cwd()
const TAG = process.env.TAG || 'after'
const THEME = process.env.THEME || 'dark'
const PORT = Number(process.env.CDP_PORT || 11760)
const PROFILE = join(ROOT, `.p15h4-scope-${PORT}`)
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const URL = 'http://127.0.0.1:4173/?test=1&proto=d'
const OUT = join(ROOT, 'screenshots', 'phase15h4')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const waitPort = (p, t = 45000) => new Promise((res, rej) => {
  const t0 = Date.now()
  const tick = () => { const s = connect(p, '127.0.0.1'); s.once('connect', () => { s.destroy(); res() }); s.once('error', () => { s.destroy(); Date.now() - t0 > t ? rej(new Error('timeout')) : setTimeout(tick, 250) }) }
  tick()
})

const main = async () => {
  mkdirSync(OUT, { recursive: true })
  if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true })
  const edge = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--headless=new',
    '--hide-scrollbars', '--window-size=1440,900', '--no-first-run', URL], { stdio: 'ignore', windowsHide: true })
  const report = { tag: TAG, theme: THEME, steps: [] }
  let ws
  try {
    await waitPort(PORT)
    let tab = null
    for (let i = 0; i < 40 && !tab; i++) { const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); tab = l.find(t => t.type === 'page' && t.url.includes('4173')); if (!tab) await sleep(300) }
    if (!tab) throw new Error('no tab')
    ws = new WebSocket(tab.webSocketDebuggerUrl)
    await new Promise(r => ws.addEventListener('open', r))
    let id = 0
    const call = (m, p = {}) => new Promise(res => { const my = ++id; const on = e => { const x = JSON.parse(e.data); if (x.id === my) { ws.removeEventListener('message', on); res(x) } }; ws.addEventListener('message', on); ws.send(JSON.stringify({ id: my, method: m, params: p })) })
    const ev = async expr => { const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval'); return r.result?.result?.value }
    await call('Runtime.enable')
    for (let i = 0; i < 240; i++) { if (await ev(`!!(document.documentElement && document.documentElement.dataset.page) && !!window.__planTest`)) break; await sleep(250) }

    const snap = async name => {
      const s = await ev(`(() => {
        const root = document.documentElement;
        const main = document.querySelector('#main');
        const st = sel => { const el = document.querySelector(sel); if (!el) return null; const c = getComputedStyle(el); return { maxWidth: c.maxWidth, padding: c.padding, borderRadius: c.borderRadius, fontSize: c.fontSize, color: c.color, opacity: c.opacity, width: c.width, height: c.height } };
        const scopeHits = page => {
          let total = 0, hits = 0;
          const walk = rules => { for (const r of rules) { if (r.cssRules && !r.selectorText) { walk(r.cssRules); continue }
            const sel = r.selectorText; if (!sel || !sel.includes('data-page="' + page + '"')) continue;
            total++; try { if (document.querySelectorAll(sel.replace(/::?(after|before|marker)[a-z-]*/g, '')).length) hits++ } catch {} } };
          for (const sh of document.styleSheets) { try { walk(sh.cssRules) } catch {} }
          return { total, hits };
        };
        return {
          dataPage: root.dataset.page || '', level: root.dataset.level || '', theme: root.dataset.theme || '',
          dom: {
            quizCard: !!main?.querySelector('.quiz-card'), answers: main?.querySelectorAll('.answer').length ?? 0,
            progress: !!main?.querySelector('.quiz-progress'), pauseCover: !!main?.querySelector('#pause-cover'),
            recallBtn: !!main?.querySelector('#recall-now'), metrics: main?.querySelectorAll('.metrics').length ?? 0,
            previewCard: !!main?.querySelector('.preview-card'), panelSummaries: main?.querySelectorAll('.panel summary').length ?? 0,
            h1: main?.querySelector('h1')?.textContent?.trim() || '',
          },
          scope: { quiz: scopeHits('quiz'), preview: scopeHits('preview'), 'preview-done': scopeHits('preview-done'), results: scopeHits('results') },
          style: { quizCard: st('.quiz-card'), question: st('.question'), answer: st('.answer'), main: st('#main'), metrics: st('.metrics'), recallBtn: st('#recall-now') },
        };
      })()`)
      report.steps.push({ name, ...s })
    }
    const click = sel => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true })()`)
    const waitFor = async (sel, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await ev(`!!document.querySelector(${JSON.stringify(sel)})`)) return true; await sleep(90) } return false }
    const waitText = async (ms = 5000) => ev(`(async () => { const t0 = performance.now(); let last = -1, since = 0; while (performance.now() - t0 < ${ms}) { const t = (document.querySelector('#main')?.textContent || '').replace(/\\s+/g, ''); const running = document.getAnimations().filter(a => a.playState === 'running' && a.effect?.getTiming?.().iterations !== Infinity).length; if (t.length > 10 && running === 0) { if (t.length === last) { if (performance.now() - since > 140) return true } else { last = t.length; since = performance.now() } } else last = -1; await new Promise(r => setTimeout(r, 60)) } return false })()`)

    await ev(`(async () => { await window.__planTest.resetDomain(); return await window.__planTest.seedUnified() })()`)
    if (THEME !== (await ev(`document.documentElement.dataset.theme`))) { await click('#theme'); await sleep(400) }

    // 1) 词库直接训练
    await click('[data-nav="books"]'); await sleep(900)
    await click('#train-filter'); await waitFor('[data-answer]'); await waitText()
    await snap('books-to-quiz')

    // 2) 答错一次，看判分态材料
    const q = await ev(`(() => { const b = document.querySelector('.answer'); return b ? b.dataset.answer : null })()`)
    if (q) { await click(`[data-answer="${q}"]`); await waitFor('.answer-feedback'); await waitText() }
    await snap('quiz-answered')

    // 3) 结果页
    const btn = await ev(`!!document.querySelector('#quit')`)
    if (btn) { await click('#quit'); await sleep(900) }
    await click('#resume'); await waitFor('[data-answer]'); await waitText()
    for (let i = 0; i < 60; i++) {
      const inQuiz = await ev(`!!document.querySelector('.quiz-card')`)
      if (!inQuiz) break
      const correct = await ev(`(() => { const c = document.querySelector('.answer.is-correct'); if (c) { c.click(); return true } return false })()`)
      if (!correct) {
        // 未判分：点选项后由应用判分；用上一题记录判断是否继续
        await click('.answer')
      }
      await sleep(180)
      if (await ev(`!!document.querySelector('#next')`)) { await click('#next'); await sleep(200) }
    }
    await waitText()
    await snap('quiz-finished')

    // 4) 预览 → 完成
    await ev(`window.__planTest.seedUnified()`)
    await click('[data-nav="home"]'); await sleep(900)
    await click('#preview-start'); await waitFor('[data-preview]'); await waitText()
    await snap('preview')
    for (let i = 0; i < 40; i++) {
      if (!(await ev(`!!document.querySelector('[data-preview]')`))) break
      await click('[data-preview="know"]'); await sleep(180)
    }
    await waitFor('#recall-now'); await waitText()
    await snap('preview-done')
  } finally {
    try { ws?.close() } catch { }
    try { edge.kill() } catch { }
    writeFileSync(join(OUT, `scope-${TAG}-${THEME}.json`), JSON.stringify(report, null, 1))
    console.log(JSON.stringify(report.steps.map(s => ({
      name: s.name, dataPage: s.dataPage, level: s.level,
      domQuiz: s.dom.quizCard, answers: s.dom.answers, recall: s.dom.recallBtn, metrics: s.dom.metrics,
      quizScope: `${s.scope.quiz.hits}/${s.scope.quiz.total}`,
      previewScope: `${s.scope.preview.hits}/${s.scope.preview.total}`,
      doneScope: `${s.scope['preview-done'].hits}/${s.scope['preview-done'].total}`,
      resultsScope: `${s.scope.results.hits}/${s.scope.results.total}`,
      cardMaxW: s.style.quizCard?.maxWidth ?? null,
    })), null, 1))
  }
}
main().catch(e => { console.error('FATAL', e?.message ?? e); process.exit(1) })
