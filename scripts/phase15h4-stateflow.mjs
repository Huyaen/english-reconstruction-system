/**
 * Phase 15h.4 · 页面状态同步的真实业务路径验收
 *
 * 用法：THEME=dark|light node scripts/phase15h4-stateflow.mjs
 * 产出：screenshots/phase15h4/flow-<theme>.json + screenshots/phase15h4/<theme>/*.png
 *
 * 判据（每个检查点都记，不靠单点通过就宣布流程通过）：
 *   1. __pageTest.state().page（内部 page） === html[data-page]（视觉作用域）
 *   2. data-level 与页面等级表一致
 *   3. #main 里真的是这一页的内容（标题文本 / 专属元素）
 *   4. 页面专属 CSS 的真实命中：从构建后样式表的 CSSOM 取出含 data-page="<页>" 的规则，
 *      逐条对真实 DOM 求命中数。伪元素规则按宿主元素计（::after/::before 不能进 querySelectorAll），
 *      状态依赖规则（:hover/:active/:disabled/:not(:empty)/.is-correct/.is-wrong/[open]）单独标注，
 *      不计入「意外 0 命中」。
 *   5. 关键元素计算样式（卡片材质、选项宽高、✓/✕ 内容、进度条宽度）
 *   6. 业务副作用：会话/预览是否真的落盘（内部状态 + 退出后能否恢复）
 *
 * 纪律：所有状态都由真实点击产生。本脚本只读 __pageTest（只读钩子），
 * 不写 data-page、不调内部函数改状态、不改题面、不跳过判分。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'

const ROOT = process.cwd()
const THEME = process.env.THEME || 'dark'
const PORT = Number(process.env.CDP_PORT || 11700)
const SIZE = process.env.SIZE || '1440x900'
const [VW, VH] = SIZE.split('x').map(Number)
const PROFILE = join(ROOT, `.p15h4-profile-${PORT}`)
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const URL = 'http://127.0.0.1:4173/?test=1&proto=d'
const OUT = join(ROOT, 'screenshots', 'phase15h4')
const SHOTS = join(OUT, THEME)
const sleep = ms => new Promise(r => setTimeout(r, ms))

const STYLE_PROPS = ['display', 'gridTemplateColumns', 'maxWidth', 'width', 'height', 'padding', 'marginTop',
  'marginBottom', 'borderRadius', 'borderLeftWidth', 'backgroundColor', 'backgroundImage',
  'color', 'opacity', 'boxShadow', 'fontSize', 'minHeight', 'transform']

const waitPort = (p, t = 45000) => new Promise((res, rej) => {
  const t0 = Date.now()
  const tick = () => {
    const s = connect(p, '127.0.0.1')
    s.once('connect', () => { s.destroy(); res() })
    s.once('error', () => { s.destroy(); Date.now() - t0 > t ? rej(new Error('devtools timeout')) : setTimeout(tick, 250) })
  }
  tick()
})

const main = async () => {
  mkdirSync(SHOTS, { recursive: true })
  if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true })
  const edge = spawn(EDGE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`, '--headless=new',
    '--hide-scrollbars', `--window-size=${VW},${VH}`, '--no-first-run', URL], { stdio: 'ignore', windowsHide: true })

  const report = { theme: THEME, size: SIZE, t0: Date.now(), steps: [], failures: [], consoleErrors: [] }
  let ws
  try {
    await waitPort(PORT)
    let tab = null
    for (let i = 0; i < 40 && !tab; i++) {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
      tab = list.find(t => t.type === 'page' && t.url.includes('127.0.0.1:4173'))
      if (!tab) await sleep(300)
    }
    if (!tab) throw new Error('app tab not found')
    ws = new WebSocket(tab.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    let id = 100
    const call = (method, params = {}) => new Promise(res => {
      const my = ++id
      const on = e => { const m = JSON.parse(e.data); if (m.id === my) { ws.removeEventListener('message', on); res(m) } }
      ws.addEventListener('message', on)
      ws.send(JSON.stringify({ id: my, method, params }))
    })
    const ev = async expr => {
      const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'eval')
      return r.result?.result?.value
    }
    const shot = async name => {
      const r = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      if (!r.result?.data) { report.failures.push(`shot:${name}`); return }
      writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(r.result.data, 'base64'))
    }
    await call('Runtime.enable')
    await call('Page.enable')
    await call('Log.enable')
    ws.addEventListener('message', e => {
      const m = JSON.parse(e.data)
      if (m.method === 'Log.entryAdded' && m.params?.entry?.level === 'error') report.consoleErrors.push(String(m.params.entry.text).slice(0, 160))
      if (m.method === 'Runtime.exceptionThrown') report.consoleErrors.push(String(m.params?.exceptionDetails?.text ?? '').slice(0, 160))
    })
    await call('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: false })

    // 冷启动（全新 profile）要等 IndexedDB 打开 + 图谱初始化 + 首帧渲染；60s 上限，必须看到只读钩子
    let booted = false
    for (let i = 0; i < 240; i++) {
      booted = await ev(`!!document.documentElement.dataset.page && document.querySelectorAll('[data-nav]').length >= 5 && !!window.__pageTest`)
      if (booted) break
      await sleep(250)
    }
    if (!booted) throw new Error('app did not boot within 60s')
    report.bootWaitMs = Date.now() - report.t0

    // 播种：真实结构数据（12 未预览新词 + 12 薄弱词），并清空领域会话，保证各入口前置条件成立
    const seeded = await ev(`(async () => {
      const api = window.__planTest;
      if (!api) return { ok: false, message: 'no __planTest' };
      await api.resetDomain();
      const r = await api.seedUnified();
      return { ok: true, ...r };
    })()`)
    report.seeded = seeded
    if (!seeded?.ok) throw new Error('seed failed: ' + JSON.stringify(seeded))

    const theme = async t => {
      for (let i = 0; i < 4; i++) {
        if ((await ev(`document.documentElement.dataset.theme`)) === t) return true
        await ev(`document.querySelector('#theme')?.click()`)
        await sleep(420)
      }
      return (await ev(`document.documentElement.dataset.theme`)) === t
    }
    await theme(THEME)

    const waitFor = async (sel, ms = 8000) => {
      const t0 = Date.now()
      while (Date.now() - t0 < ms) { if (await ev(`!!document.querySelector(${JSON.stringify(sel)})`)) return true; await sleep(80) }
      return false
    }
    const settle = async (ms = 4000) => {
      await ev(`(async () => {
        const t0 = performance.now(); let last = -1, since = 0;
        while (performance.now() - t0 < ${ms}) {
          const t = (document.querySelector('#main')?.textContent || '').replace(/\\s+/g, '');
          const running = document.getAnimations().filter(a => a.playState === 'running' && a.effect?.getTiming?.().iterations !== Infinity).length;
          if (t.length > 10 && running === 0) { if (t.length === last) { if (performance.now() - since > 140) return true } else { last = t.length; since = performance.now() } }
          else last = -1;
          await new Promise(r => setTimeout(r, 60));
        }
        return false;
      })()`)
    }
    const state = () => ev(`window.__pageTest.state()`)

    /** 页面专属 CSS 的真实命中。伪元素按宿主算；状态依赖规则单列，不计入意外 0。 */
    const cssHits = page => ev(`(() => {
      const STATE = /:hover|:active|:focus|:disabled|:not\\(:empty\\)|\\.is-correct|\\.is-wrong|\\[open\\]|\\[hidden\\]|:checked/;
      const own = [];
      const walk = rules => {
        for (const r of rules) {
          if (r.cssRules && !r.selectorText) { walk(r.cssRules); continue }
          const raw = r.selectorText;
          if (!raw || !raw.includes('data-page="${page}"')) continue;
          const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
          let hits = 0, pseudo = false, stateful = false, err = '';
          for (let part of parts) {
            if (STATE.test(part)) { stateful = true; continue }
            const host = part.replace(/::?(after|before|marker|placeholder|selection|-webkit-[a-z-]+)/g, '');
            if (host !== part) pseudo = true;
            try { hits += document.querySelectorAll(host).length } catch (e) { err = String(e).slice(0, 60) }
          }
          // 内容依赖：宿主元素在这一页确实不存在（例如种子词没有例句 → 没有 blockquote），
          // 这与"作用域失效"是两回事：作用域失效时宿主存在却不匹配。
          let contentDependent = false;
          if (hits === 0 && !stateful && parts.length) {
            const tail = parts[parts.length - 1].replace(/::?(after|before|marker)/g, '').split(/\\s+/).pop().replace(/^[>+~]+/, '');
            try { contentDependent = !!tail && !document.querySelector(tail) } catch { contentDependent = false }
          }
          own.push({ sel: raw.replace(/\\s+/g, ' ').slice(0, 130), hits, pseudo, stateful, contentDependent, err });
        }
      };
      for (const sh of document.styleSheets) { try { walk(sh.cssRules) } catch { /* 跨域样式表 */ } }
      const unexpected = own.filter(r => r.hits === 0 && !r.stateful && !r.err && !r.contentDependent);
      return { total: own.length, matched: own.filter(r => r.hits > 0).length, zero: unexpected.length,
        unexpected: unexpected.map(r => r.sel),
        contentDependent: own.filter(r => r.contentDependent).map(r => r.sel),
        stateful: own.filter(r => r.stateful).length };
    })()`)

    const styles = async (sels) => ev(`(() => {
      const props = ${JSON.stringify(STYLE_PROPS)};
      const out = {};
      for (const sel of ${JSON.stringify(sels)}) {
        const el = document.querySelector(sel);
        if (!el) { out[sel] = null; continue }
        const s = getComputedStyle(el), o = {};
        for (const p of props) o[p] = s[p];
        const after = getComputedStyle(el, '::after');
        o['::after.content'] = after.content;
        o['::after.color'] = after.color;
        out[sel] = o;
      }
      return out;
    })()`)

    const checkpoint = async (name, extra = {}) => {
      await settle()
      const st = await state()
      const chrome = await ev(`({ page: document.documentElement.dataset.page || '', level: document.documentElement.dataset.level || '',
        theme: document.documentElement.dataset.theme || '', h1: document.querySelector('#main h1')?.textContent?.trim() || '',
        mainText: (document.querySelector('#main')?.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120),
        resume: !!document.querySelector('#resume'), navActive: Array.from(document.querySelectorAll('[data-nav].active')).map(b => b.dataset.nav) })`)
      const step = { name, ...extra, internal: st, chrome, consistent: st.page === chrome.page, cssScope: await cssHits(st.page) }
      step.levelOk = st.level === chrome.level
      if (!step.consistent) report.failures.push(`${name}: 内部 page=${st.page} 但 data-page=${chrome.page}`)
      if (!step.levelOk) report.failures.push(`${name}: level 不同步 (${st.level} / ${chrome.level})`)
      if (step.cssScope.zero > 0) report.failures.push(`${name}: ${step.cssScope.zero} 条页面规则意外 0 命中`)
      report.steps.push(step)
      await shot(name)
      return step
    }

    const click = async sel => ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true })()`)
    /** 等到「page 已经是 p」且「#main 里渲染的确实是这一页」——只用 page 判断会点到上一页的按钮。 */
    const renderedAs = async p => ev(`(() => {
      if (document.documentElement.dataset.page !== ${JSON.stringify(p)}) return false;
      const m = document.querySelector('#main');
      if (!m || !m.textContent || m.textContent.trim().length < 2) return false;
      if (document.querySelector('#main .d-loading')) return false;
      const nav = document.querySelector('[data-nav].active');
      const navId = nav ? nav.dataset.nav : '';
      return ${JSON.stringify(p)} === 'quiz' || ${JSON.stringify(p)} === 'results' || ${JSON.stringify(p)} === 'preview-done'
        ? true : navId === ${JSON.stringify(p)};
    })()`)
    const waitPage = async (p, ms = 15000) => {
      const t0 = Date.now()
      while (Date.now() - t0 < ms) { if (await renderedAs(p)) return true; await sleep(100) }
      return false
    }
    const clickNav = async p => {
      if (!(await click(`[data-nav="${p}"]`))) { report.failures.push(`nav missing: ${p}`); return false }
      if (await waitPage(p)) return true
      report.failures.push(`nav stuck: ${p}`)
      return false
    }
    /** 依次答对到本轮结束；返回最终 page（应为 results）。 */
    const answerAllCorrect = async (label, limit = 80) => {
      for (let i = 0; i < limit; i++) {
        const st = await state()
        if (st.page !== 'quiz') return st.page
        const q = await ev(`window.__pageTest.question()`)
        if (!q) { await sleep(140); continue }
        await click(`[data-answer="${q.wordId}"]`)
        for (let w = 0; w < 40; w++) {
          const now = await state()
          if (now.page !== 'quiz') break
          if (now.feedback) break
          if (now.session && now.session.index !== st.session?.index) break
          await sleep(90)
        }
        const nxt = await state()
        if (nxt.page !== 'quiz') return nxt.page
        if (nxt.feedback) { await click('#next'); await sleep(200) }
        if (i === limit - 1) report.failures.push(`${label}: 未在 ${limit} 题内结束`)
      }
      return (await state()).page
    }
    /** 开始新一轮之前必须没有未完成会话（否则应用会拒绝并 toast，流程会假通过）。 */
    const assertNoUnfinished = async label => {
      const has = await ev(`!!document.querySelector('#resume')`)
      if (has) report.failures.push(`${label}: 首页仍有未完成会话，前置条件不成立`)
      return !has
    }

    await settle()

    // ————— 入口 A：词库 → 直接训练 → 答错 → 下一题 → 答对 —————
    await clickNav('books')
    await checkpoint('A1-books')
    await click('#train-filter')
    if (!(await waitFor('[data-answer]'))) report.failures.push('A2: 训练没进题面')
    await checkpoint('A2-quiz-enter')

    const q1 = await ev(`window.__pageTest.question()`)
    const wrongId = q1.options.find(o => o !== q1.wordId)
    await click(`[data-answer="${wrongId}"]`)
    await waitFor('.answer-feedback')
    await checkpoint('A3-quiz-wrong', {
      question: q1, picked: wrongId,
      feedback: await ev(`document.querySelector('#feedback')?.textContent?.replace(/\\s+/g,' ').trim().slice(0,140) || ''`),
      verdict: await ev(`(() => {
        const c = document.querySelector('.answer.is-correct'), w = document.querySelector('.answer.is-wrong');
        return {
          correctMark: c ? getComputedStyle(c, '::after').content : null,
          wrongMark: w ? getComputedStyle(w, '::after').content : null,
          correctIsAnswer: c?.dataset.answer === ${JSON.stringify(q1.wordId)},
          wrongIsPicked: w?.dataset.answer === ${JSON.stringify(wrongId)},
          correctColor: c ? getComputedStyle(c).color : null,
          others: Array.from(document.querySelectorAll('.answer')).filter(b => b !== c && b !== w).map(b => ({ opacity: getComputedStyle(b).opacity, color: getComputedStyle(b).color })),
        };
      })()`),
      styles: await styles(['.quiz-card', '.answer.is-correct', '.answer.is-wrong', '#feedback .answer-feedback', '#next']),
    })

    await click('#next')
    await waitFor('[data-answer]')
    await click('#pause')
    await checkpoint('A4-quiz-paused', { pauseCoverHidden: await ev(`document.querySelector('#pause-cover')?.hidden`) })
    await click('#continue')
    await sleep(240)
    await checkpoint('A5-quiz-resumed', { pauseCoverHidden: await ev(`document.querySelector('#pause-cover')?.hidden`) })

    const q2 = await ev(`window.__pageTest.question()`)
    await click(`[data-answer="${q2.wordId}"]`)
    await sleep(700)
    await checkpoint('A6-quiz-correct-advanced', { question: q2, indexAfter: (await state()).session?.index })

    // ————— 训练退出 → 返回 Today；首页应出现 resume（会话未丢） —————
    await click('#quit')
    if (!(await waitPage('home'))) report.failures.push('A7: 退出后没回首页')
    await checkpoint('A7-quit-home')

    // ————— 入口 D：已有未完成训练 → 恢复 → 结果页 —————
    await click('#resume')
    if (!(await waitFor('[data-answer]'))) report.failures.push('D1: 恢复没进题面')
    await checkpoint('D1-resume-quiz', { resumeIndex: (await state()).session?.index })
    let done = await answerAllCorrect('D')
    if (done !== 'results') report.failures.push(`D2: 期望 results，实际 ${done}`)
    await checkpoint('D2-results', { styles: await styles(['#main', '.metrics', '.actions', '.panel summary']) })

    // ————— 结果页 → 再次训练 —————
    await click('#review-round')
    if (!(await waitFor('[data-answer]'))) report.failures.push('D3: 再次训练没进题面')
    await checkpoint('D3-results-again-quiz')
    await click('#quit')
    if (!(await waitPage('home'))) report.failures.push('D4: 再次训练退出后没回首页')
    await checkpoint('D4-back-home-from-quiz')

    // ————— 结果页 → 返回首页（先把上一轮未完成会话收尾，否则新一轮会被业务规则拒绝） —————
    await click('#resume')
    if (!(await waitFor('[data-answer]'))) report.failures.push('D5: 二次恢复没进题面')
    done = await answerAllCorrect('D5')
    if (done !== 'results') report.failures.push(`D5: 期望 results，实际 ${done}`)
    await click('#back-home')
    if (!(await waitPage('home'))) report.failures.push('D6: 结果页返回首页失败')
    await checkpoint('D6-results-back-home')

    // ————— 入口 C：薄弱词 → 训练 → 结果 —————
    // D 轮已经把这些种子弱词练成了"会"，薄弱词池会真的空掉（截图实证：0 个词、只有导入按钮）。
    // 这里重新播种同一份合成词表恢复前置条件，而不是绕过业务判断。
    await assertNoUnfinished('C')
    await ev(`window.__planTest.seedUnified()`)
    await clickNav('weak')
    const weakCount = await ev(`document.querySelectorAll('#main .review-launcher strong').length ? (document.querySelector('#main .review-launcher strong').textContent||'') : ''`)
    report.weakLauncher = weakCount
    await checkpoint('C1-weak')
    await click('#review-start')
    if (!(await waitFor('[data-answer]'))) {
      report.failures.push('C2: 薄弱词训练没进题面')
      report.diagC2 = {
        toast: await ev(`document.querySelector('#toast')?.textContent || ''`),
        hasBtn: await ev(`!!document.querySelector('#review-start')`),
        state: await state(),
        wordsOnPage: await ev(`document.querySelectorAll('.weak-ledger-body, [data-row], .chips button').length`),
      }
    }
    await checkpoint('C2-weak-quiz')
    done = await answerAllCorrect('C')
    if (done !== 'results') report.failures.push(`C3: 期望 results，实际 ${done}`)
    await checkpoint('C3-weak-results')
    await click('#back-home')
    if (!(await waitPage('home'))) report.failures.push('C4: 结果页返回首页失败')
    await checkpoint('C4-results-back-home')

    // ————— 入口 B：预览新词 → 完成预览 → Recall → 结果 —————
    // 同上：前面的训练消耗了新词池，重新播种恢复"有待预览新词"这个前置条件。
    await assertNoUnfinished('B')
    await ev(`window.__planTest.seedUnified()`)
    await clickNav('home')
    if (!(await click('#preview-start'))) report.failures.push('B1: 首页没有预览入口')
    if (!(await waitFor('[data-preview]'))) report.failures.push('B1: 预览没进')
    await checkpoint('B1-preview')
    let previews = 0
    for (let i = 0; i < 40; i++) {
      const st = await state()
      if (st.page !== 'preview') break
      await click('[data-preview="know"]')
      previews++
      await sleep(200)
    }
    if (!(await waitFor('#recall-now'))) report.failures.push('B2: 预览结束没到 preview-done')
    await checkpoint('B2-preview-done', { previews, styles: await styles(['#main', '#recall-now', '.actions']) })

    await click('#recall-now')
    if (!(await waitFor('[data-answer]'))) report.failures.push('B3: Recall 没进题面')
    await checkpoint('B3-recall-quiz')
    done = await answerAllCorrect('B')
    if (done !== 'results') report.failures.push(`B4: 期望 results，实际 ${done}`)
    await checkpoint('B4-recall-results', { styles: await styles(['#main', '.metrics']) })
    await click('#back-home')
    if (!(await waitPage('home'))) report.failures.push('B5: 结果页返回首页失败')
    await checkpoint('B5-home')

    report.summary = {
      steps: report.steps.length,
      inconsistent: report.steps.filter(s => !s.consistent).map(s => s.name),
      levelMismatch: report.steps.filter(s => !s.levelOk).map(s => s.name),
      pagesSeen: [...new Set(report.steps.map(s => s.internal.page))],
      failures: report.failures,
      consoleErrors: report.consoleErrors.slice(0, 10),
    }
  } finally {
    try { ws?.close() } catch { }
    try { edge.kill() } catch { }
    writeFileSync(join(OUT, `flow-${THEME}.json`), JSON.stringify(report, null, 1))
    const s = report.summary || {}
    console.log(JSON.stringify({
      theme: report.theme, steps: s.steps, pagesSeen: s.pagesSeen,
      inconsistent: s.inconsistent, levelMismatch: s.levelMismatch,
      failures: s.failures, consoleErrors: s.consoleErrors?.length,
    }))
  }
}

main().catch(e => { console.error('FATAL', e?.message ?? e); process.exit(1) })
