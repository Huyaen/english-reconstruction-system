// 生成真实英文文章截图 fixture（真实截图，不是画出来的假图）：用于 OCR 端到端验收
import fs from 'node:fs';
const PORT = 9225;
const OUT = 'tests/fixtures/reading-ocr.png';
const BLANK = 'tests/fixtures/reading-blank.png';

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const target = list.find(x => x.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws open failed')); });
let id = 0; const pending = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
  return r.result.value;
};

const ARTICLE = `Why reading slowly can make you faster

Most learners believe that speed comes from reading more words per minute.
In practice, comprehension is limited by how quickly you can hold a
sentence in mind while the next one arrives.

Deliberate reconstruction is slower at first. You rebuild a sentence from
its parts: who does what, to whom, and why. That feels like a step
backwards, yet it is the step that turns passive exposure into a skill.

Spaced repetition helps you keep what you rebuilt. A word met once in an
article is an encounter, not knowledge; the same word met again after a
day, then after a week, becomes something you can actually use.

So the goal is not speed. The goal is a structure strong enough that speed
arrives on its own.`;

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 760, height: 820, deviceScaleFactor: 2, mobile: false });
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;background:#ffffff;color:#111;font:18px/1.65 Georgia,'Times New Roman',serif;padding:40px 46px}
  h1{font-size:26px;margin:0 0 18px;font-family:Helvetica,Arial,sans-serif}
  p{margin:0 0 14px;text-align:left}
  .src{font:13px/1.4 Helvetica,Arial,sans-serif;color:#666;margin-bottom:22px}
</style></head><body>
<h1>Why reading slowly can make you faster</h1>
<div class="src">The Reading Notes · Issue 12 · 2026</div>
${ARTICLE.split('\n\n').slice(1).map(p => `<p>${p.replace(/\n/g, ' ')}</p>`).join('')}
</body></html>`;
await send('Page.navigate', { url: 'data:text/html;charset=utf-8,' + encodeURIComponent(html) });
await new Promise(r => setTimeout(r, 600));
const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
fs.mkdirSync('tests/fixtures', { recursive: true });
fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));

// 纯白图：验证“识别不出文字”不会假装成功
await ev(`(()=>{const c=document.createElement('canvas');c.width=600;c.height=300;document.body.innerHTML='';document.body.appendChild(c);const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,600,300);return c.toDataURL('image/png');})()`);
const white = await send('Page.captureScreenshot', { format: 'png' });
fs.writeFileSync(BLANK, Buffer.from(white.data, 'base64'));

console.log('fixture', OUT, fs.statSync(OUT).size, 'bytes');
console.log('blank  ', BLANK, fs.statSync(BLANK).size, 'bytes');
ws.close();
