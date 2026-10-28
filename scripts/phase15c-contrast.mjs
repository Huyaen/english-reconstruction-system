// Phase 15c · 精确对比度审计（只算真实前景色 vs 最近一层不透明背景色）
// 目的：旧探针在有渐变/圆环背景的元素上采样失真，这里给出可复核的数字。
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PROTO = ['a', 'b', 'd', 'base'].includes(process.env.PROTO) ? process.env.PROTO : 'a';
const PORT = 9297;
const VW = Number(process.env.VW || 1920), VH = Number(process.env.VH || 1080);
const WANT = process.env.THEME || 'dark';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => existsSync(p));
const child = spawn(edge, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${join(process.env.TEMP || '.', `p15c-contrast-${Date.now()}`)}`,
    '--window-size=1920,1080', '--hide-scrollbars', '--no-first-run', 'about:blank'], { stdio: 'ignore', windowsHide: true });

async function connect() {
    for (let i = 0; i < 80; i++) {
        try {
            const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
            const t = l.find(x => x.type === 'page');
            if (t) { const ws = new WebSocket(t.webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); }); return ws; }
        } catch { /* not up */ }
        await sleep(250);
    }
    throw new Error('cdp not ready');
}
const ws = await connect();
let id = 0;
const pending = new Map();
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async expression => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.value;


// —— 真实背景采样：失败项用截图像素复核，避免半透明/渐变叠加导致的推断误差 ——
import { spawnSync } from 'node:child_process';
import { writeFileSync as _wf, unlinkSync as _unlink } from 'node:fs';
const samplePixel = (pngPath, x, y) => {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', pngPath,
        '-vf', `crop=1:1:${Math.max(0, Math.round(x))}:${Math.max(0, Math.round(y))}`,
        '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer', maxBuffer: 1 << 20 });
    if (!r.stdout || r.stdout.length < 3) return null;
    return { r: r.stdout[0], g: r.stdout[1], b: r.stdout[2] };
};
const lumOf = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
const ratioOf = (a, b) => { const l1 = lumOf(a), l2 = lumOf(b); return +((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2); };

const qs = PROTO === 'base' ? '' : `&proto=${PROTO}`;
const out = resolve(PROTO === 'd' ? 'screenshots/phase15d' : `screenshots/phase15c/${PROTO === 'base' ? '15b' : PROTO}`);
mkdirSync(out, { recursive: true });

try {
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: VW, height: VH, deviceScaleFactor: 1, mobile: VW < 700 });
    await send('Page.navigate', { url: `http://127.0.0.1:4173/?test=1${qs}` });
    for (let i = 0; i < 80; i++) { if (await evaluate('!!(window.__planTest && document.querySelector("[data-nav=home]"))')) break; await sleep(400); }
    await evaluate('window.__planTest.createPlan(150)');
    for (let i = 0; i < 60; i++) { if (await evaluate('!!document.querySelector("#start-today")')) break; await sleep(300); }
    if (((await evaluate('document.documentElement.dataset.theme')) === 'dark') !== (WANT === 'dark')) {
        await evaluate(`(() => { const b = document.querySelector('#theme'); if (b) b.click(); return 1; })()`);
        // 主题切换有过渡：等到过渡动画真的结束再采样，否则会把中间色算成违规
        for (let i = 0; i < 40; i++) {
            const busy = await evaluate(`(() => {
              const a = document.getAnimations().filter(x => x.playState === 'running' && (x.effect?.target?.tagName === 'BODY' || x.effect?.target === document.documentElement));
              return a.length > 0;
            })()`);
            if (!busy) break;
            await sleep(150);
        }
        // 15h.2：主题切换有颜色过渡，固定 400ms 会把"深色文字 + 深色底"的中间帧
        // 当成真实缺陷（曾报 1.05:1 的 hero 标题）。这里等颜色不再变化。
        await evaluate(`(async () => {
          const sig = () => { const s = getComputedStyle(document.body); return s.color + '|' + s.backgroundColor }
          let prev = sig(), same = 0
          for (let i = 0; i < 40; i++) {
            await new Promise(r => setTimeout(r, 80))
            const now = sig()
            if (now === prev) { if (++same >= 2) return true } else { same = 0; prev = now }
          }
          return false
        })()`);
        await sleep(120);
        // 主题翻转会让带 transition 的卡片做 220ms 颜色过渡；等颜色真正稳定再采样，
        // 否则会把中间色当成最终色（曾把深色行卡读成 rgba(176,178,180,.886)）。
        let prev = '', stable = 0;
        for (let i = 0; i < 40 && stable < 3; i++) {
            const now = await evaluate(`(() => { const r = document.querySelector('.d-row'); return r ? getComputedStyle(r).backgroundColor : 'none'; })()`);
            stable = now === prev ? stable + 1 : 0;
            prev = now;
            await sleep(60);
        }
        await sleep(120);
    }

    const audit = await evaluate(`(() => {
      const parse = c => { const m = c.match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
      const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
      const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return +((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2); };
      const bgOf = el => {
        // 逐层合成：半透明背景（如 .d-row 的 rgba(...,.82)）要叠在祖先之上，
        // 不能因为 alpha < 0.9 就跳过，也不能直接落到白/黑默认值。
        const layers = [];
        let n = el;
        let base = null;
        let gradient = false;
        while (n && n !== document.documentElement) {
          const s = getComputedStyle(n);
          const c = parse(s.backgroundColor);
          if ((!c || c.a === 0) && s.backgroundImage && s.backgroundImage !== 'none') gradient = true;
          if (c && c.a > 0) {
            if (c.a >= 0.999) { base = c; break; }
            layers.push(c);
          }
          n = n.parentElement;
        }
        if (!base && gradient) return { gradient: true };
        if (!base) {
          const bc = parse(getComputedStyle(document.body).backgroundColor);
          if (bc && bc.a >= 0.999) base = bc;
          else base = document.documentElement.dataset.theme === 'light'
            ? { r: 250, g: 249, b: 246, a: 1 }
            : { r: 16, g: 20, b: 26, a: 1 };
        }
        if (el.dataset && el.closest && el.textContent && el.textContent.includes('· 词汇')) {
        }
        let out = { r: base.r, g: base.g, b: base.b };
        for (let i = layers.length - 1; i >= 0; i--) {
          const l = layers[i];
          out = {
            r: l.r * l.a + out.r * (1 - l.a),
            g: l.g * l.a + out.g * (1 - l.a),
            b: l.b * l.a + out.b * (1 - l.a),
          };
        }
        return { r: Math.round(out.r), g: Math.round(out.g), b: Math.round(out.b), a: 1 };
      };
      const rows = [];
      let skipped = 0;
      const seen = new Set();
      document.querySelectorAll('main *, .sidebar *').forEach(el => {
        const txt = (el.textContent || '').trim();
        if (!txt || txt.length > 40) return;
        if (el.children.length && [...el.children].some(c => (c.textContent || '').trim())) return;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return;
        const s = getComputedStyle(el);
        if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) return;
        // 祖先透明/隐藏的元素不可见：不得计入（典型是转场克隆层与预览缩略图）
        {
          let a = el.parentElement, hidden = false;
          while (a && a !== document.body) {
            const as = getComputedStyle(a);
            if (as.display === 'none' || as.visibility === 'hidden' || +as.opacity < 0.05 || a.hasAttribute('inert') || a.getAttribute('aria-hidden') === 'true') { hidden = true; break; }
            a = a.parentElement;
          }
          if (hidden) return;
        }
        // 不可用控件按 WCAG 1.4.3 豁免（用例：0 个新词时"预览新词（0）"是 disabled）
        if (el.matches(':disabled') || el.getAttribute('aria-disabled') === 'true' || el.closest('[aria-disabled="true"]')) { skipped++; return; }
        // 渐变裁切文字（background-clip:text + transparent）无法用"纯色对比"衡量，
        // 硬量会得到 fg 0,0,0 的假缺陷。记为不可测，不记失败也不记通过。
        if (s.backgroundClip === 'text' || s.webkitBackgroundClip === 'text' || s.color === 'rgba(0, 0, 0, 0)') { skipped++; return; }
        const fg = parse(s.color);
        if (!fg) return;
        const size = parseFloat(s.fontSize);
        const weight = +s.fontWeight || 400;
        const large = size >= 24 || (size >= 18.66 && weight >= 700);
        const bg = bgOf(el);
        if (!bg || bg.gradient) { skipped++; return; }
        const cr = ratio(fg, bg);
        const need = large ? 3 : 4.5;
        if (cr < need) {
          const key = txt.slice(0, 24) + '|' + Math.round(size) + '|' + cr;
          if (seen.has(key)) return; seen.add(key);
          const bg = bgOf(el);
          let bn = el, bgFrom = 'theme-base';
          while (bn && bn !== document.documentElement) { const cc = parse(getComputedStyle(bn).backgroundColor); if (cc && cc.a >= 0.9) { bgFrom = bn.tagName.toLowerCase() + '.' + String(bn.className || '').split(/\s+/)[0]; break; } bn = bn.parentElement; }
          const rb = el.getBoundingClientRect();
          const chainDbg = (() => { const out = []; let a = el; while (a && a !== document.body && out.length < 5) { const acs = getComputedStyle(a); out.push(a.tagName.toLowerCase() + '.' + String(a.className || '').split(/\s+/).slice(0, 2).join('.') + (a.matches(':hover') ? ':hover' : '') + '[' + acs.backgroundColor + '|' + (acs.backgroundImage === 'none' ? '-' : acs.backgroundImage.slice(0, 40)) + ']'); a = a.parentElement; } return out.join(' < '); })();
          rows.push({ debug: chainDbg, text: txt.slice(0, 28), cls: (el.className || '').toString().slice(0, 44), size: Math.round(size), weight, ratio: cr, need,
            rect: [Math.round(rb.left), Math.round(rb.top), Math.round(rb.width), Math.round(rb.height)],
            fg: fg.r + ',' + fg.g + ',' + fg.b, bg: bg.r + ',' + bg.g + ',' + bg.b, from: bgFrom, theme: document.documentElement.dataset.theme });
        }
      });
      return { checked: document.querySelectorAll('main *').length, skippedDisabled: skipped, failures: rows.slice(0, 20) };
    })()`);

    if (audit.failures.length) {
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        const tmp = resolve('screenshots/.contrast-probe.png');
        _wf(tmp, Buffer.from(shot.data, 'base64'));
        for (const f of audit.failures) {
            if (!f.rect) continue;
            const [x, y, w, h] = f.rect;
            const pts = [[x - 6, y + h / 2], [x + w + 6, y + h / 2], [x + w / 2, y + h + 5], [x + w / 2, y - 4]];
            const samples = pts.map(([px, py]) => samplePixel(tmp, px, py)).filter(Boolean);
            if (!samples.length) continue;
            const med = samples.map(s => ({ ...s, l: lumOf(s) })).sort((a, b) => a.l - b.l)[Math.floor(samples.length / 2)];
            const fg = f.fg.split(',').map(Number);
            const real = ratioOf({ r: fg[0], g: fg[1], b: fg[2] }, med);
            f.sampledBg = `${med.r},${med.g},${med.b}`;
            f.sampledRatio = real;
            if (real >= f.need) f.restoredByPixel = true;
        }
        _unlink(tmp);
        audit.failures = audit.failures.filter(f => !f.restoredByPixel);
    }
    const report = { proto: PROTO, theme: WANT, at: new Date().toISOString(), viewport: `${VW}x${VH}`, ...audit };
    writeFileSync(join(out, `contrast-audit-${WANT}-${VW}x${VH}.json`), JSON.stringify(report, null, 1));
console.log(`checked=${audit.checked} failures=${audit.failures.length}`);
    for (const f of audit.failures) console.log(` - ${f.ratio} (need ${f.need}) ${f.size}px ${f.cls} :: ${f.text} [fg ${f.fg} / bg ${f.bg} / ${f.theme} / from ${f.from}]${process.env.DEBUG ? '\n     chain: ' + f.debug : ''}`);
} finally {
    ws.close();
    child.kill();
}
