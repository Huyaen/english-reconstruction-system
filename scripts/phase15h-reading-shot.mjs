/**
 * Phase 15h · 阅读态截图（真实文章，非导入空态）
 *
 * 为什么单独一个脚本：capture 里的 reading 页只截到"导入材料"空态，
 * 而阅读页最该被审查的是**文章正文的排版**（行宽/行高/字号/辅助面板）。
 * 这里用一份自己写的英文样文（不是抓取的真实文章，不冒充来源），
 * 走真实导入表单 → 打开文章 → 截图。
 *
 * 用法：node scripts/phase15h-reading-shot.mjs
 */
import { spawn } from 'node:child_process'
import { mkdirSync, copyFileSync, existsSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'

const ROOT = process.cwd()
const OUT = join(ROOT, 'screenshots', 'phase15h')
const PORT = Number(process.env.CDP_PORT || 9721)
const SRC_PROFILE = join(ROOT, '.p15h-profile')
const PROFILE = join(ROOT, `.p15h-profile-${PORT}`)
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const BASE = 'http://127.0.0.1:4173/?test=1&proto=d'

const PASSAGE = `Every morning, the city wakes up to a small miracle: breakfast arrives before anyone has asked for it. An app remembers what we ordered last Tuesday, another predicts how long the walk to the station will take, and a third quietly reorders the coffee beans we forgot to notice were running out. Convenience, we are told, is the point of the modern city.

But convenience has a cost, and the cost is rarely printed on the receipt. When a service removes a step from our day, it also removes a moment of attention. The walk to the shop used to be where we noticed the season changing; the queue was where we overheard a language we did not speak. Those small frictions were not obstacles to living. They were the texture of it.

This is not an argument for making life harder. It is an argument for noticing what we trade away, and for deciding, deliberately, which frictions are worth keeping. A student who reads a difficult paragraph slowly is not being inefficient. She is building the patience that fast summaries never teach.

The interesting question is not whether we should use these tools. It is which ones deserve to become invisible.`

const ARTICLE_TITLE = 'The Cost of Convenience'

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

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

async function rpc(ws, id, method, params = {}) {
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => {
    const onMsg = ev => {
      let m
      try { m = JSON.parse(ev.data) } catch { return }
      if (m.id === id) { ws.removeEventListener('message', onMsg); m.error ? reject(new Error(method + ': ' + m.error.message)) : resolve(m.result) }
    }
    ws.addEventListener('message', onMsg)
  })
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  if (existsSync(SRC_PROFILE)) {
    const { cpSync, rmSync } = await import('node:fs')
    rmSync(PROFILE, { recursive: true, force: true })
    cpSync(SRC_PROFILE, PROFILE, { recursive: true })
  }
  const edge = spawn(EDGE, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--window-size=1440,900', '--no-first-run', '--no-default-browser-check',
    BASE
  ], { stdio: 'ignore', windowsHide: true })

  try {
    await waitPort(PORT)
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    const page = list.find(t => t.type === 'page' && t.url.includes('127.0.0.1'))
    const ws = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    let id = 10
    const call = (m, p) => rpc(ws, ++id, m, p)
    await call('Page.enable')
    await call('Runtime.enable')
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    await sleep(2600)

    const ev = async expr => {
      const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + (r.exceptionDetails.exception?.description || '').slice(0, 300))
      return r.result.value
    }

    // 进入阅读页
    await ev(`(() => { const b = [...document.querySelectorAll('aside nav button')].find(x => x.textContent.includes('阅读')); b && b.click(); return !!b })()`)
    await sleep(1200)

    // 真实导入：填表 → 提交
    const seeded = await ev(`(async () => {
      const t = document.querySelector('#read-title');
      const p = document.querySelector('#read-paste');
      if (!t || !p) return 'no-form';
      t.value = ${JSON.stringify(ARTICLE_TITLE)};
      t.dispatchEvent(new Event('input', { bubbles: true }));
      p.value = ${JSON.stringify(PASSAGE)};
      p.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
      const save = document.querySelector('[data-read-save="paste"]');
      if (!save) return 'no-save-button';
      save.click();
      await new Promise(r => setTimeout(r, 1500));
      return 'saved';
    })()`)

    // 打开文章
    const opened = await ev(`(async () => {
      const byText = (re) => [...document.querySelectorAll('button')].find(b => re.test(b.textContent));
      const start = document.querySelector('[data-read-start]') || byText(/开始首读/);
      if (!start) return 'no-start';
      start.click();
      await new Promise(r => setTimeout(r, 2600));
      const cold = document.querySelector('[data-read-cold-submit]');
      if (cold) {
        const self = document.querySelector('#read-cold-self');
        if (self) { self.value = 62; self.dispatchEvent(new Event('input', { bubbles: true })); }
        cold.click();
        await new Promise(r => setTimeout(r, 2600));
      }
      if (document.querySelector('#read-text')) return 'reading';
      const main = document.querySelector('#main');
      return 'still:' + (main ? main.innerText.slice(0, 120) : 'no-main').split(String.fromCharCode(10)).join(' ');
    })()`)

    const shots = []
    const snap = async (name) => {
      const r = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
      const buf = Buffer.from(r.data, 'base64')
      const { writeFileSync } = await import('node:fs')
      const p = join(OUT, name)
      writeFileSync(p, buf)
      shots.push({ name, kb: Math.round(buf.length / 1024) })
    }

    await ev(`(async () => {
      if (document.documentElement.getAttribute('data-theme') !== 'dark') { document.querySelector('#theme')?.click(); await new Promise(r => setTimeout(r, 700)) }
      return document.documentElement.getAttribute('data-theme');
    })()`)
    await snap('reading-passage-dark-1440x900.png')
    await ev(`document.querySelector('#theme')?.click()`)
    await sleep(900)
    await snap('reading-passage-light-1440x900.png')

    const probe = await ev(`(() => {
      const el = document.querySelector('#read-text, .reader-text');
      if (!el) return null;
      const c = getComputedStyle(el);
      const w = el.getBoundingClientRect().width;
      const fs = parseFloat(c.fontSize);
      return { width: Math.round(w), fontSize: fs, lineHeight: c.lineHeight, ch: Math.round(w / (fs * 0.5)), cls: el.className };
    })()`)

    console.log(JSON.stringify({ seeded, opened, shots, passage: probe, url: page.url }, null, 1))
    ws.close()
  } finally {
    edge.kill()
  }
}

main().catch(e => { console.error('ERR', e.message); process.exit(1) })
