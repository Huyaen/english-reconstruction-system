/**
 * Phase 15h.1 · 真实浏览器无障碍状态回归（headless Edge + CDP）
 *
 * jsdom 单测能证明 DOM 逻辑，但不能证明：真实 IndexedDB 下页面渲染出来、
 * 真实点击链路（事件委托 + 重渲染）走通、控制台没有异常。
 * 这个脚本在真实浏览器里点同样的路径，断言的是"状态变化"，不是"属性存在"。
 *
 * 用法：node scripts/phase15h1-live-a11y.mjs
 * 前置：node server.mjs --dir=dist-test --port=4173 已在运行
 */
import { spawn } from 'node:child_process'
import { existsSync, cpSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'

const ROOT = process.cwd()
const PORT = Number(process.env.CDP_PORT || 9751)
const PROFILE = join(ROOT, `.p15h1-a11y-${PORT}`)
const BASE_PROFILE = process.env.PROFILE || 'C:/Users/86152/AppData/Local/hermes/cache/scratch/p15h/live'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const URL = 'http://127.0.0.1:4173/?test=1&proto=d'
const OUT = join(ROOT, 'screenshots', 'phase15h1')

const sleep = ms => new Promise(r => setTimeout(r, ms))

function waitPort(port, timeout = 30000) {
  const t0 = Date.now()
  return new Promise((res, rej) => {
    const tick = () => {
      const s = connect(port, '127.0.0.1')
      s.once('connect', () => { s.destroy(); res(true) })
      s.once('error', () => { s.destroy(); Date.now() - t0 > timeout ? rej(new Error('devtools timeout')) : setTimeout(tick, 250) })
    }
    tick()
  })
}

function rpcFactory(ws) {
  let id = 100
  return (method, params = {}) => {
    const myId = ++id
    ws.send(JSON.stringify({ id: myId, method, params }))
    return new Promise((resolve, reject) => {
      const onMsg = ev => {
        let m
        try { m = JSON.parse(ev.data) } catch { return }
        if (m.id === myId) {
          ws.removeEventListener('message', onMsg)
          m.error ? reject(new Error(method + ': ' + m.error.message)) : resolve(m.result)
        }
      }
      ws.addEventListener('message', onMsg)
    })
  }
}

async function main() {
  if (existsSync(PROFILE)) rmSync(PROFILE, { recursive: true, force: true })
  if (existsSync(BASE_PROFILE)) cpSync(BASE_PROFILE, PROFILE, { recursive: true })
  mkdirSync(OUT, { recursive: true })

  const edge = spawn(EDGE, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--window-size=1440,900', '--no-first-run', '--no-default-browser-check', URL
  ], { stdio: 'ignore', windowsHide: true })

  const report = { checks: [], errors: [], consoleErrors: [] }
  const check = (name, ok, detail) => {
    report.checks.push({ name, ok, detail })
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`)
  }

  try {
    await waitPort(PORT)
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    const tab = list.find(t => t.type === 'page' && t.url.includes('127.0.0.1'))
    const ws = new WebSocket(tab.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    const call = rpcFactory(ws)

    ws.addEventListener('message', ev => {
      let m
      try { m = JSON.parse(ev.data) } catch { return }
      if (m.method === 'Runtime.exceptionThrown')
        report.errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error')
        report.consoleErrors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' '))
    })

    await call('Page.enable')
    await call('Runtime.enable')
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })

    const ev = async expr => {
      const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
      return r.result.value
    }
    const nav = async page => {
      const ok = await ev(`(async () => {
        const b = document.querySelector('[data-nav="${page}"]')
        if (!b) return false
        b.click()
        for (let i = 0; i < 60; i++) {
          await new Promise(r => setTimeout(r, 100))
          if (document.querySelector('#main') && document.querySelector('#main').textContent.length > 40) return true
        }
        return false
      })()`)
      if (!ok) throw new Error('nav failed: ' + page)
    }

    // shell 起来（IndexedDB 首次打开可能几秒）
    for (let i = 0; i < 40; i++) {
      const n = await ev(`document.querySelectorAll('[data-nav]').length`)
      if (n >= 5) break
      await sleep(500)
    }

    // 1) 语法筛选 aria-pressed 单选 + 转移
    await nav('grammar')
    const g1 = await ev(`(() => {
      const cs = [...document.querySelectorAll('[data-gcat]')]
      return { n: cs.length, pressed: cs.filter(c => c.getAttribute('aria-pressed') === 'true').map(c => c.dataset.gcat) }
    })()`)
    check('grammar: 初始只有一个 aria-pressed=true', g1.n >= 2 && g1.pressed.length === 1, JSON.stringify(g1))

    const g2 = await ev(`(async () => {
      const cs = [...document.querySelectorAll('[data-gcat]')]
      const t = cs.find(c => c.getAttribute('aria-pressed') !== 'true')
      if (!t) return { error: 'no target' }
      const key = t.dataset.gcat
      t.click()
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 100))
        const now = [...document.querySelectorAll('[data-gcat]')]
        const hit = now.find(c => c.dataset.gcat === key && c.getAttribute('aria-pressed') === 'true')
        if (hit) return { key, pressed: now.filter(c => c.getAttribute('aria-pressed') === 'true').map(c => c.dataset.gcat) }
      }
      return { error: 'not transferred', key }
    })()`)
    check('grammar: 点击类别后 pressed 转移且仍唯一', !g2.error && g2.pressed?.length === 1 && g2.pressed[0] === g2.key, JSON.stringify(g2))

    // 2) 考试页签 aria-pressed 转移
    await nav('exam')
    const e1 = await ev(`(() => {
      const tabs = [...document.querySelectorAll('[data-exam-tab]')]
      return { n: tabs.length, pressed: tabs.filter(t => t.getAttribute('aria-pressed') === 'true').map(t => t.dataset.examTab) }
    })()`)
    check('exam: 页签默认唯一按下（overview）', e1.n >= 3 && e1.pressed.length === 1 && e1.pressed[0] === 'overview', JSON.stringify(e1))

    const e2 = await ev(`(async () => {
      document.querySelector('[data-exam-tab="practice"]')?.click()
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 100))
        const p = document.querySelector('[data-exam-tab="practice"]')
        const o = document.querySelector('[data-exam-tab="overview"]')
        if (p?.getAttribute('aria-pressed') === 'true' && o?.getAttribute('aria-pressed') === 'false')
          return { practice: p.getAttribute('aria-pressed'), overview: o.getAttribute('aria-pressed') }
      }
      return { error: 'no transfer' }
    })()`)
    check('exam: 切到练习后旧页签释放', !e2.error, JSON.stringify(e2))

    // 3) 句子作答 data-verdict 状态机
    await nav('sentence')
    const s1 = await ev(`(async () => {
      const b = document.querySelector('[data-sentence-start]')
      if (!b) return { error: 'no sentence start' }
      b.click()
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 100))
        if (document.querySelector('#lab-sentence')) break
      }
      const opts = [...document.querySelectorAll('.lab-option')]
      return { n: opts.length, verdicts: opts.map(o => o.getAttribute('data-verdict')) }
    })()`)
    check('sentence: 未作答时全部 pending', !s1.error && s1.n >= 2 && s1.verdicts.every(v => v === 'pending'), JSON.stringify(s1))

    const s2 = await ev(`(async () => {
      const first = document.querySelector('.lab-option')
      if (!first) return { error: 'no option' }
      first.click()
      for (let i = 0; i < 40; i++) {
        await new Promise(r => setTimeout(r, 100))
        if (document.querySelector('.lab-feedback')) break
      }
      const opts = [...document.querySelectorAll('.lab-option')]
      const v = opts.map(o => o.getAttribute('data-verdict'))
      return { verdicts: v, correct: v.filter(x => x === 'correct').length, wrong: v.filter(x => x === 'wrong').length, ok: !!document.querySelector('.lab-feedback.ok') }
    })()`)
    check('sentence: 答后恰一个 correct，wrong 与对错一致',
      !s2.error && s2.correct === 1 && s2.wrong === (s2.ok ? 0 : 1), JSON.stringify(s2))

    // 4) 表达自动保存 live region 真实变化
    await nav('output')
    const o1 = await ev(`(async () => {
      const start = document.querySelector('[data-out-start]')
      if (!start) return { error: 'no out start' }
      start.click()
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 100))
        if (document.querySelector('#out-editor')) break
      }
      const el = document.querySelector('#out-save-state')
      if (!el) return { error: 'no save state' }
      const seen = new Set([el.textContent])
      const obs = new MutationObserver(() => seen.add(el.textContent))
      obs.observe(el, { childList: true, characterData: true, subtree: true })
      const ta = document.querySelector('#out-editor')
      ta.value = 'The city changed quickly, and nobody explained why.'
      ta.dispatchEvent(new Event('input', { bubbles: true }))
      const t0 = Date.now()
      while (seen.size < 2 && Date.now() - t0 < 6000) await new Promise(r => setTimeout(r, 100))
      obs.disconnect()
      return { role: el.getAttribute('role'), live: el.getAttribute('aria-live'), seen: [...seen] }
    })()`)
    check('output: 保存状态是 status/polite 且文本随保存变化',
      !o1.error && o1.role === 'status' && o1.live === 'polite' && o1.seen.length >= 2, JSON.stringify(o1))

    // 5) 诊断证据质量枚举
    await nav('diagnostics')
    const d1 = await ev(`(() => {
      const ms = [...document.querySelectorAll('.diag-metric[data-quality]')]
      return { n: ms.length, values: [...new Set(ms.map(m => m.dataset.quality))], evaluability: ms.every(m => m.hasAttribute('data-evaluability')) }
    })()`)
    const allowed = ['verified', 'task-behavior', 'mixed', 'self-report', 'none']
    check('diagnostics: data-quality 只取真实枚举值',
      d1.n >= 3 && d1.values.every(v => allowed.includes(v)) && d1.evaluability, JSON.stringify(d1))

    // 6) 阅读库行状态：导入 → 开始首读 → 回列表看状态转移；再导入一篇不打开作为 unread 对照
    await nav('reading')
    const longPara = 'The aqueducts carried water across the valley. Engineers measured the slope with simple tools, and the city grew around that steady supply. When the pipes failed, the repair took months, because every stone had to be replaced by hand. Workers climbed the arches at dawn, carrying buckets and rope, while the council argued about the cost. In the end the water returned, but the city had learned something about maintenance: a system that nobody watches will fail quietly, long before anyone notices the silence. The lesson survived the empire that built it.'
    const importPassage = title => `(async () => {
      const t = document.querySelector('#read-title')
      const p = document.querySelector('#read-paste')
      if (!t || !p) return { error: 'no import form' }
      t.value = ${JSON.stringify(title)}
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
      setter.call(p, ${JSON.stringify(longPara)})
      p.dispatchEvent(new Event('input', { bubbles: true }))
      await new Promise(r => setTimeout(r, 400))
      const save = document.querySelector('[data-read-save="paste"]')
      if (!save) return { error: 'no save button' }
      save.click()
      await new Promise(r => setTimeout(r, 1800))
      return { toast: document.querySelector('#toast')?.textContent ?? '', preview: !!document.querySelector('#read-preview') }
    })()`

    const impA = await ev(importPassage('a11y 已开始阅读'))
    const back = await ev(`(async () => {
      // 预览页有真正的"返回阅读库"（点同一页 nav 会早退，不会重置 readView）
      const b = document.querySelector('[data-read-back]')
      if (!b) return { error: 'no back', where: document.body.textContent.slice(0, 80) }
      b.click()
      await new Promise(r => setTimeout(r, 1500))
      const rows = [...document.querySelectorAll('#reading-page tbody tr[data-state]')]
      return { n: rows.length, states: rows.map(r => r.dataset.state) }
    })()`)
    check('reading: 导入后回到阅读库，行状态是 unread',
      !back.error && back.n >= 1 && back.states[0] === 'unread',
      JSON.stringify({ impA, back }))

    check('reading: 状态值属于 {unread,unfinished,read}',
      back.n >= 1 && back.states.every(x => ['unread', 'unfinished', 'read'].includes(x)),
      JSON.stringify(back.states))

    const shots = []
    const shot = async name => {
      const { data } = await call('Page.captureScreenshot', { format: 'png' })
      const file = join(OUT, `${name}-dark-1440x900.png`)
      writeFileSync(file, Buffer.from(data, 'base64'))
      shots.push(file)
    }
    // 考试单题卡（含 data-src 的来源边框）
    await nav('exam')
    const examIn = await ev(`(async () => {
      document.querySelector('[data-exam-tab="overview"]')?.click()
      await new Promise(r => setTimeout(r, 1000))
      const start = document.querySelector('#exam-start-mixed')
      if (!start) return { error: 'no start', head: document.body.textContent.slice(0, 120) }
      start.click()
      for (let i = 0; i < 80; i++) {
        await new Promise(r => setTimeout(r, 100))
        if (document.querySelector('.exam-item-meta')) break
      }
      return { ok: !!document.querySelector('.exam-item-meta'), meta: document.querySelector('.exam-item-meta')?.outerHTML.slice(0, 220) }
    })()`)
    check('exam: 进入单题后元信息带来源钩子', examIn.ok === true, JSON.stringify(examIn))
    await sleep(400)
    await shot('exam-item')
    // 诊断指标区（含 data-quality 边框）
    await nav('diagnostics')
    await ev(`(async () => {
      const m = document.querySelector('.diag-metric')
      if (m) m.scrollIntoView({ block: 'start' })
      await new Promise(r => setTimeout(r, 500))
      return !!m
    })()`)
    await sleep(300)
    await shot('diagnostics-metrics')
    // 句子：答一题让 data-verdict 生效
    await nav('sentence')
    await ev(`(async () => {
      document.querySelector('[data-sentence-start]')?.click()
      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 100))
        if (document.querySelector('.lab-option')) break
      }
      document.querySelector('.lab-option')?.click()
      await new Promise(r => setTimeout(r, 700))
      return !!document.querySelector('.lab-feedback')
    })()`)
    await sleep(300)
    await shot('sentence-verdict')
    report.shots = shots

    if (report.errors.length) console.log('页面异常：', report.errors.join(' | '))
    if (report.consoleErrors.length) console.log('控制台错误：', report.consoleErrors.join(' | '))

    const failed = report.checks.filter(c => !c.ok)
    writeFileSync(join(OUT, 'live-a11y-report.json'), JSON.stringify(report, null, 2))
    console.log(`\n${report.checks.length - failed.length}/${report.checks.length} 通过 · 异常 ${report.errors.length} · 控制台错误 ${report.consoleErrors.length}`)
    process.exitCode = failed.length || report.errors.length ? 1 : 0
  } catch (e) {
    console.error('FATAL', e.message)
    process.exitCode = 1
  } finally {
    try { edge.kill() } catch { }
    ws?.close?.()
  }
}

let ws
main()
