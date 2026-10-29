/**
 * Phase 15h.3 · 转场取证分析
 * 读 nav-screencast.json / nav-shots.json，按"主内容区域是否存在用户可理解的内容"判定，
 * 不看整帧亮度。输出每个 run 的空洞时长、通道帧间隔，并给出四类归因。
 *
 * 分类：
 *   APP_BLANK      主内容区无任何可读内容（readable=false 且无飞行层）
 *   DESIGN_FADE    只在透明度过渡期间不可读（有飞行层/旧内容仍在）
 *   CAPTURE_STALL  页面采样可读，但该通道出现长间隔（采集停帧）
 *   LOADING        期间出现真实 loading 状态
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const OUT = join(ROOT, 'screenshots', 'phase15h3')
const THRESH_MS = 100

const load = name => { try { return JSON.parse(readFileSync(join(OUT, name), 'utf8')) } catch { return null } }

const gaps = (times, tolerance = 0) => {
  let max = 0, at = null
  for (let i = 1; i < times.length; i++) {
    const d = times[i] - times[i - 1]
    if (d > max) { max = d; at = times[i - 1] }
  }
  return { max: Math.round(max), at: at === null ? null : Math.round(at) }
}

/** 主内容不可读区间（可读=false 且没有飞行层/旧内容） */
const readableGaps = (samples, until) => {
  const bad = []
  for (const s of samples) {
    if (until !== null && s.t > until) break
    if (!s.page) continue // 采样落在页面上下文丢失的瞬间（重载/播种），不是应用空白
    // 主内容区任一可见块可读即可；单块判据会把"滚动才显现的下半页卡片"误判成空白
    const readable = (s.v && s.v.readable) || s.anyReadable === true
    const plateVisible = s.plate && s.plate.op > 0.15 && s.plate.text > 20
    const travVisible = s.traveler && s.traveler.op > 0.15 && s.traveler.rect[2] > 60 && s.traveler.rect[3] > 30
    if (!readable && !plateVisible && !travVisible) bad.push(s)
  }
  if (!bad.length) return { max: 0, at: null, count: 0, samples: [] }
  // 连续段
  let best = { len: 0, start: null, end: null }
  let runStart = bad[0].t, prev = bad[0].t
  for (let i = 1; i < bad.length; i++) {
    if (bad[i].t - prev > 48) {
      if (prev - runStart > best.len) best = { len: prev - runStart, start: runStart, end: prev }
      runStart = bad[i].t
    }
    prev = bad[i].t
  }
  if (prev - runStart > best.len) best = { len: prev - runStart, start: runStart, end: prev }
  return { max: Math.round(best.len), at: best.start === null ? null : Math.round(best.start), count: bad.length, window: [Math.round(best.start ?? 0), Math.round(best.end ?? 0)] }
}

const analyze = (doc, channel) => {
  const rows = []
  for (const run of doc.runs) {
    const samples = run.samples
    const gap = readableGaps(samples, run.returnAt)
    const returnGap = run.returnAt === null ? { max: 0 } : readableGaps(samples.filter(s => s.t >= run.returnAt), null)
    const firstReadable = (samples.find(s => s.page && s.v && s.v.readable) || {}).t ?? null
    const loadingMs = samples.filter(s => s.loading).length * 16
    let frameGap = { max: 0, at: null }
    let channelCount = 0
    let cadence = null
    if (channel === 'screencast') {
      // 帧时间戳是 epoch ms，采样是相对 rec.t0；用 epoch0 对齐
      const ts = run.frames.map(f => f - (run.epoch0 || 0)).filter(t => t >= -50)
      if (ts.length > 1) frameGap = gaps(ts)
      channelCount = run.frames.length
      cadence = ts.length > 1 ? Math.round((ts[ts.length - 1] - ts[0]) / (ts.length - 1)) : null
    } else {
      const ts = run.shots.map(s => s.req)
      if (ts.length > 1) frameGap = gaps(ts)
      channelCount = run.shots.length
      cadence = run.shots.length > 1 ? Math.round((run.shots[run.shots.length - 1].req - run.shots[0].req) / (run.shots.length - 1)) : null
      frameGap = { ...frameGap, medianTook: run.shots.length ? Math.round(run.shots.map(s => s.took).sort((a, b) => a - b)[Math.floor(run.shots.length / 2)]) : null }
    }
    // 通道最长间隔是否发生在"画面确实在变"的区间：变了却没帧 = 采集停帧
    let stallWithActivity = false
    if (frameGap.max > 300 && frameGap.at !== null) {
      const t1 = frameGap.at, t2 = frameGap.at + frameGap.max
      const win = samples.filter(s => s.t >= t1 - 40 && s.t <= t2 + 40)
      const ops = win.map(s => (s.v && s.v.op) ?? null).filter(v => v !== null)
      const texts = win.map(s => s.text)
      const opRange = ops.length ? Math.max(...ops) - Math.min(...ops) : 0
      const textRange = texts.length ? Math.max(...texts) - Math.min(...texts) : 0
      // 只有主内容本身在变才算采集停帧；环境呼吸光场不算（页面静止时 screencast 本来就不推帧）
      // 门槛：主内容不透明度变化 >0.15 或文本变化 >10 字，才算画面在变却拿不到帧
      stallWithActivity = opRange > 0.15 || textRange > 10
      frameGap.window = [Math.round(t1), Math.round(t2)]
      frameGap.activityDuringGap = stallWithActivity
    }
    let verdict = 'OK'
    if (gap.max >= THRESH_MS) verdict = loadingMs > 0 ? 'LOADING' : 'APP_BLANK'
    else if (loadingMs > 0) verdict = 'LOADING'
    else if (stallWithActivity) verdict = 'CAPTURE_STALL'
    rows.push({
      path: run.path, round: run.round,
      clickAt: Math.round(run.clickAt),
      returnAt: run.returnAt === null ? null : Math.round(run.returnAt),
      samples: samples.length,
      invalidSamples: samples.filter(s => !s.page).length,
      firstReadableAt: firstReadable === null ? null : Math.round(firstReadable),
      blankGap: gap,
      returnBlankGap: returnGap.max,
      loadingMs,
      channel, channelCount, cadenceMs: cadence, channelGap: frameGap,
      verdict
    })
  }
  return rows
}

const summary = rows => {
  const byPath = {}
  for (const r of rows) {
    byPath[r.path] = byPath[r.path] || { rounds: 0, maxBlank: 0, maxReturnBlank: 0, firstReadable: [], channelGapMax: 0, cadence: [], verdicts: [] }
    const s = byPath[r.path]
    s.rounds++
    s.maxBlank = Math.max(s.maxBlank, r.blankGap.max)
    s.maxReturnBlank = Math.max(s.maxReturnBlank, r.returnBlankGap)
    if (r.firstReadableAt !== null) s.firstReadable.push(r.firstReadableAt)
    s.channelGapMax = Math.max(s.channelGapMax, r.channelGap.max || 0)
    if (r.cadenceMs) s.cadence.push(r.cadenceMs)
    s.verdicts.push(r.verdict)
  }
  for (const k of Object.keys(byPath)) {
    const s = byPath[k]
    s.firstReadable = s.firstReadable.length ? { min: Math.min(...s.firstReadable), max: Math.max(...s.firstReadable) } : null
    s.cadence = s.cadence.length ? { min: Math.min(...s.cadence), max: Math.max(...s.cadence) } : null
  }
  return byPath
}

const sc = load('nav-screencast.json')
const sh = load('nav-shots.json')
const result = { thresholdMs: THRESH_MS, generatedAt: new Date().toISOString(), channels: {} }
if (sc) { const rows = analyze(sc, 'screencast'); result.channels.screencast = { rows, summary: summary(rows) } }
if (sh) { const rows = analyze(sh, 'shots'); result.channels.shots = { rows, summary: summary(rows) } }

writeFileSync(join(OUT, 'nav-analysis.json'), JSON.stringify(result, null, 2))

for (const [name, data] of Object.entries(result.channels)) {
  console.log(`\n== ${name} ==`)
  for (const [path, s] of Object.entries(data.summary)) {
    console.log(`${path.padEnd(9)} rounds=${s.rounds} blankMax=${s.maxBlank}ms returnBlank=${s.maxReturnBlank}ms firstReadable=${s.firstReadable ? s.firstReadable.min + '-' + s.firstReadable.max : 'n/a'}ms channelGap=${s.channelGapMax}ms cadence=${s.cadence ? s.cadence.min + '-' + s.cadence.max : 'n/a'}ms verdict=${s.verdicts.join(',')}`)
  }
}
const anyBlank = Object.values(result.channels).some(c => Object.values(c.summary).some(s => s.maxBlank >= THRESH_MS))
console.log('\nAPP_BLANK_DETECTED=' + anyBlank)
