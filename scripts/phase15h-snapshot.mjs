/**
 * Phase 15h · 渲染后 DOM 快照导出（用于可复现的 impeccable detect）
 *
 * 为什么需要它：`detect <url>` 会与 SPA 竞态——常常扫到脚本渲染前的空壳
 * （实测同一 URL 连跑 4 次得到 1/1/3/1 条）。要拿到真实页面，必须先把渲染后的 DOM
 * 冻结成静态 HTML（剥掉 <script>），再从同一站点托管，让 CSS 正常加载。
 *
 * 输出：dist-test/__snap/<page>-<theme>.html（构建产物目录，构建后需重跑）
 * 用法：node scripts/phase15h-snapshot.mjs
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, cpSync, rmSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'

const ROOT = process.cwd()
const OUT = join(ROOT, 'dist-test', '__snap')
const PORT = Number(process.env.CDP_PORT || 9741)
const PROFILE = join(ROOT, `.p15h-snap-${PORT}`)
// 与 capture 共用同一个已种子化的浏览器 profile（50 词 + 16 条作答），否则词库/统计页是空的
const BASE_PROFILE = process.env.PROFILE || 'C:/Users/86152/AppData/Local/hermes/cache/scratch/p15h/live'
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
const URL = 'http://127.0.0.1:4173/?test=1&proto=d'
const PAGES = ['home', 'books', 'weak', 'sentence', 'reading', 'input', 'output', 'grammar', 'unit', 'diagnostics', 'exam', 'stats', 'ai', 'settings']

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
  if (existsSync(BASE_PROFILE)) {
    rmSync(PROFILE, { recursive: true, force: true })
    cpSync(BASE_PROFILE, PROFILE, { recursive: true })
  }
  mkdirSync(OUT, { recursive: true })
  const edge = spawn(EDGE, [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--headless=new', '--disable-gpu', '--hide-scrollbars',
    '--window-size=1440,900', '--no-first-run', '--no-default-browser-check', URL
  ], { stdio: 'ignore', windowsHide: true })
  const out = { files: [], errors: [] }
  try {
    await waitPort(PORT)
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    const tab = list.find(t => t.type === 'page' && t.url.includes('127.0.0.1'))
    const ws = new WebSocket(tab.webSocketDebuggerUrl)
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej) })
    const call = rpcFactory(ws)
    await call('Page.enable')
    await call('Runtime.enable')
    await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
    // 必须等 shell 真正渲染出来：IndexedDB 首次打开可能 5–10s，只 sleep 会拍到"正在打开本地词库…"
    const ready = await (async () => {
      for (let i = 0; i < 40; i++) {
        const r = await call('Runtime.evaluate', { expression: "document.querySelectorAll('[data-nav]').length", returnByValue: true })
        if ((r.result?.value || 0) >= 5) return r.result.value
        await sleep(500)
      }
      return 0
    })()
    if (!ready) throw new Error('shell never rendered: data-nav buttons = 0')
    const ev = async expr => {
      const r = await call('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text)
      return r.result.value
    }

    const setTheme = async theme => {
      await ev(`(async () => {
        if (document.documentElement.getAttribute('data-theme') !== '${theme}') {
          document.querySelector('#theme')?.click();
          await new Promise(r => setTimeout(r, 700));
        }
        return document.documentElement.getAttribute('data-theme');
      })()`)
    }

    for (const theme of ['dark', 'light']) {
      await setTheme(theme)
      for (const page of PAGES) {
        const html = await ev(`(async () => {
          const b = document.querySelector('[data-nav="${page}"]');
          if (!b) return 'NO_NAV:' + document.querySelectorAll('button').length + '|' + document.body.innerText.slice(0, 70).replace(/\s+/g, ' ');
          b.click();
          await new Promise(r => setTimeout(r, 900));
          const clone = document.documentElement.cloneNode(true);
          clone.querySelectorAll('script, link[rel="preload"], link[rel="modulepreload"]').forEach(n => n.remove());
          return '<!doctype html>' + clone.outerHTML;
        })()`)
        if (typeof html !== 'string' || html.length < 500) {
          out.errors.push(`${page}-${theme}: bad snapshot (${typeof html}, ${html ? html.length : 0}) :: ${String(html).slice(0, 60)}`)
          continue
        }
        const name = `${page}-${theme}.html`
        writeFileSync(join(OUT, name), html)
        out.files.push(name)
      }
    }
    ws.close()
  } finally {
    edge.kill()
  }
  console.log(JSON.stringify(out))
}

main().catch(e => { console.error('ERR', e.message); process.exit(1) })
