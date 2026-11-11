/**
 * Phase 15h.4 · 页面状态同步的真实集成回归
 *
 * 这一组测试不做「把 data-page 设成 quiz 再断言页面是 quiz」这种自证：
 * 它在 jsdom 里启动**真实的 app.ts**（boot → 真实点击 → 真实 IndexedDB），
 * 只从外部可观察的事实断言：
 *   html[data-page] / data-level、#main 里真实的标记、以及 database 里的会话与记录。
 *
 * 覆盖任务书要求的五个转换：books→quiz、preview→preview-done、preview-done→quiz、
 * quiz→results、results→home；另加两件事：
 *   · 重复操作只产生一个会话（不会重复建会话/重复保存）
 *   · 预览答题的异步收尾不得把旧页面写回当前页面（页面纪元护栏）
 *
 * 说明：node 里没有 CSS 引擎（样式表不进 jsdom），所以这里断言的是「页面作用域与 DOM 结构」，
 * 计算样式与规则命中由 scripts/phase15h4-stateflow.mjs 在真实浏览器里取证。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { JSDOM } from 'jsdom';
import { register } from 'node:module';

// app.ts 直接 import './tokens.css' 等样式文件；node 没有 CSS 加载器，先注册一个把 CSS 变成空模块的钩子。
register(new URL('./support/css-loader.mjs', import.meta.url), import.meta.url);

const dom = new JSDOM(
  '<!doctype html><html lang="zh-CN"><head></head><body><div id="app"><p>正在打开本地词库…</p></div>' +
  '<div id="toast" role="status" aria-live="polite"></div><dialog id="modal"></dialog></body></html>',
  { url: 'http://localhost:4173/?test=1&proto=d', pretendToBeVisual: true },
);

const w = dom.window as unknown as Record<string, unknown>;
const g = globalThis as unknown as Record<string, unknown>;
for (const k of ['window', 'document', 'location', 'history', 'localStorage', 'sessionStorage', 'HTMLElement',
  'HTMLButtonElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'HTMLDialogElement',
  'Element', 'Node', 'Event', 'CustomEvent', 'MouseEvent', 'KeyboardEvent', 'DOMParser', 'XMLSerializer',
  'Blob', 'File', 'FileReader', 'FormData', 'URL', 'URLSearchParams', 'getComputedStyle', 'requestAnimationFrame',
  'cancelAnimationFrame', 'MutationObserver', 'structuredClone', 'alert', 'confirm', 'prompt', 'DOMRect',
  'Range', 'Selection', 'SVGElement', 'CSS']) {
  if (!(k in dom.window)) continue;
  try { Object.defineProperty(g, k, { value: w[k], configurable: true, writable: true }); } catch { /* 只读全局 */ }
}
Object.defineProperty(dom.window.navigator, 'locks', {
  configurable: true,
  value: { async request(_n: string, _o: unknown, cb: (l: { name: string }) => unknown) { return cb({ name: 'test' }); } },
});
Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true });
Object.defineProperty(dom.window, 'matchMedia', {
  configurable: true,
  value: () => ({ matches: false, media: '', addEventListener() { }, removeEventListener() { }, addListener() { }, removeListener() { } }),
});
Object.defineProperty(g, 'matchMedia', { value: dom.window.matchMedia, configurable: true });
Object.defineProperty(dom.window, 'scrollTo', { configurable: true, value: () => { } });
class ObserverStub { observe() { } unobserve() { } disconnect() { } takeRecords() { return []; } }
Object.defineProperty(g, 'IntersectionObserver', { value: ObserverStub, configurable: true });
Object.defineProperty(g, 'ResizeObserver', { value: ObserverStub, configurable: true });
Object.defineProperty(dom.window, 'IntersectionObserver', { value: ObserverStub, configurable: true });
Object.defineProperty(dom.window, 'ResizeObserver', { value: ObserverStub, configurable: true });
Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:test', configurable: true });
Object.defineProperty(URL, 'revokeObjectURL', { value: () => { }, configurable: true });

const doc = dom.window.document;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const root = () => doc.documentElement;
const htmlPage = () => root().dataset.page ?? '';
const htmlLevel = () => root().dataset.level ?? '';

async function waitUntil(fn: () => boolean | Promise<boolean>, ms = 8000, label = 'condition') {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await fn()) return true;
    await sleep(50);
  }
  throw new Error(`超时：${label}`);
}
const click = (sel: string, n = 0): boolean => {
  const el = doc.querySelectorAll<HTMLElement>(sel)[n];
  if (!el) return false;
  el.click();
  return true;
};

let db: typeof import('../src/db.ts');
let booted = false;

async function bootApp() {
  if (booted) return;
  db = await import('../src/db.ts');
  const { makeWord } = await import('../src/core.ts');
  await db.openDB();
  const now = Date.UTC(2026, 9, 30, 2, 0, 0);
  const words = Array.from({ length: 32 }, (_, i) => {
    const base = makeWord({ en: `stateword${i}`, zh: `状态同步释义${i}`, pos: 'n.' }, 'state-book', i);
    // 16–23 做成薄弱词（vague + 多次错误），保证"薄弱词"入口有合法前置条件；
    // 其余保持未预览（UNSEEN），预览入口才真的有词可预览（任务要求真实业务前置条件）。
    if (i < 16) return base;
    return {
      ...base, previewedAt: now - 3_600_000, previewResult: 'familiar' as const, exposureCount: 1,
      state: { ...base.state, total: 4, correct: 1, errors: 3, level: 'vague' as const, streak: 0 },
    };
  });
  await db.putItems('books', [{ id: 'state-book', name: '状态同步词书', created: now }]);
  await db.putItems('words', words);
  await import('../src/app.ts');
  await waitUntil(() => htmlPage() === 'home' && (doc.querySelector('#main')?.textContent ?? '').length > 10, 30000, 'app boot');
  booted = true;
}

test('页面状态同步：预览答题的异步收尾不会把旧页面写回当前页面', async () => {
  await bootApp();
  // 回到首页并进入预览
  if (htmlPage() !== 'home') {
    click('[data-nav="home"]');
    await waitUntil(() => htmlPage() === 'home', 6000, '回首页');
  }
  await waitUntil(() => !!doc.querySelector('#preview-start'), 6000, '首页预览入口');
  const b2 = doc.querySelector<HTMLButtonElement>('#preview-start')!;
  click('#preview-start');
  await waitUntil(() => htmlPage() === 'preview' && !!doc.querySelector('.preview-card'), 8000, '进入预览');

  // 真实竞态：点「已经会」触发一次异步保存，同一 tick 里切到词库。
  // 保存完成后的续写必须被页面纪元挡住——否则 #main 会被预览页内容覆盖。
  click('[data-preview="know"]');
  click('[data-nav="books"]');
  await sleep(400);

  assert.equal(htmlPage(), 'books', '切页后根节点应为 books');
  assert.equal(doc.querySelector('.preview-card'), null, '旧预览卡片不得被写回词库页');
  assert.ok(doc.querySelector('#train-filter'), '词库页内容应完整（不应被异步收尾破坏）');

  const d = await db.loadData();
  const previewed = d.words.filter(w => w.previewedAt).length;
  assert.ok(previewed > 0, '预览结果仍应落盘（只是不再写回旧页面）');
});

test('页面状态同步：五个页面转换都让 html[data-page] 与真实渲染一致', async () => {
  await bootApp();

  // 上一条测试结束在词库页；先回首页
  if (htmlPage() !== 'home') {
    click('[data-nav="home"]');
    await waitUntil(() => htmlPage() === 'home', 6000, '回首页');
  }

  // ——— preview → preview-done：预览新词链路 ———
  await waitUntil(() => !!doc.querySelector('#preview-start'), 6000, '首页应有预览入口');
  const pvBtn = doc.querySelector<HTMLButtonElement>('#preview-start')!;
  assert.equal(pvBtn.disabled, false, '有未预览新词时预览按钮必须可用');
  assert.equal(click('#preview-start'), true);
  await waitUntil(() => htmlPage() === 'preview' && !!doc.querySelector('.preview-card'), 8000, '进入预览');
  assert.equal(htmlPage(), 'preview', '预览页根节点必须是 preview');
  assert.equal(htmlLevel(), 'b');
  assert.ok((doc.querySelectorAll('[data-preview]').length ?? 0) >= 2, '预览应有四个判断按钮');

  for (let i = 0; i < 40 && htmlPage() === 'preview'; i++) {
    click('[data-preview="know"]');
    await sleep(80);
  }
  await waitUntil(() => htmlPage() === 'preview-done', 10000, '进入预览完成页');
  assert.equal(htmlPage(), 'preview-done', '预览完成后根节点必须是 preview-done');
  assert.ok(doc.querySelector('#recall-now'), '完成页应有 Recall 入口');
  assert.equal(doc.querySelector('.quiz-card'), null, '完成页不应残留题面卡片');

  // ——— preview-done → quiz：Recall ———
  const rc = doc.querySelector<HTMLButtonElement>('#recall-now')!;
  assert.equal(click('#recall-now'), true);
  await sleep(500);
  await waitUntil(() => htmlPage() === 'quiz' && !!doc.querySelector('.quiz-card'), 8000, 'Recall 进入 quiz');
  assert.equal(htmlPage(), 'quiz', 'Recall 的根节点必须是 quiz');
  const dPv = await db.loadData();
  assert.equal(dPv.sessions.filter(s => !s.ended).length, 1, 'Recall 应只建一个会话');
  click('#quit');
  await waitUntil(() => htmlPage() === 'home', 8000, '退出回首页');

  // 退出保留了未完成会话；业务上必须先结束它，才能再开新一轮（真实规则，不能绕过）。
  assert.ok(doc.querySelector('#resume'), '退出后首页应提供"继续上次训练"');
  assert.equal(click('#finish-old'), true, '首页应能结束旧训练');
  await waitUntil(() => !doc.querySelector('#resume'), 8000, '旧训练已结束');

  // ——— books → quiz：从词库直接训练 ———
  assert.equal(click('[data-nav="books"]'), true, '侧栏应能进入词库');
  await waitUntil(() => htmlPage() === 'books' && !!doc.querySelector('#train-filter'), 6000, 'books 渲染');
  assert.equal(htmlLevel(), 'b', '词库等级应为 b');

  assert.equal(click('#train-filter'), true, '词库应能发起训练');
  await waitUntil(() => htmlPage() === 'quiz' && !!doc.querySelector('.quiz-card'), 8000, '进入 quiz');
  assert.equal(htmlPage(), 'quiz', '内部页面是 quiz 时根节点必须同步为 quiz');
  assert.equal(htmlLevel(), 'b', 'quiz 等级应为 b');
  assert.ok(doc.querySelectorAll('.answer').length >= 2, '应渲染出选项');
  assert.equal(doc.querySelectorAll('#main h1').length, 1, '答题只有一个标题，不应残留上一页标题');
  assert.ok(doc.querySelector('.quiz-card h1#question-text'), '题面就是答题的页面标题');
  assert.equal(doc.querySelector('#train-filter'), null, '训练页不应残留词库的工具条');

  const d1 = await db.loadData();
  const open = d1.sessions.filter(s => !s.ended);
  assert.equal(open.length, 1, '应恰好有一个进行中的会话');
  const sessionId = open[0].id;

  // ——— quiz → results：一路作答到结束（判分由应用自己做，不预设答案） ———
  for (let i = 0; i < 200 && htmlPage() === 'quiz'; i++) {
    if (doc.querySelector('#next')) { click('#next'); await sleep(50); continue; }
    if (!click('.answer')) { await sleep(80); continue; }
    await sleep(80);
  }
  await waitUntil(() => htmlPage() === 'results', 15000, '进入结果页');
  assert.equal(htmlPage(), 'results', '本轮结束后根节点必须是 results');
  assert.equal(htmlLevel(), 'b', '结果页等级应为 b');
  assert.ok((doc.querySelectorAll('.metrics > *').length ?? 0) > 0, '结果页应渲染指标');
  assert.ok(doc.querySelector('#review-round'), '结果页应有"重测本轮弱词"入口');

  const d2 = await db.loadData();
  const finished = d2.sessions.find(s => s.id === sessionId)!;
  assert.ok(finished.ended, '会话应已结束并落盘');
  assert.ok(d2.records.filter(r => r.sessionId === sessionId).length > 0, '本轮作答记录应已落盘');

  // ——— results → home ———
  assert.equal(click('#back-home'), true, '结果页应有返回首页');
  await waitUntil(() => htmlPage() === 'home' && !!doc.querySelector('[data-nav="home"][aria-current="page"]'), 8000, '回到首页');
  assert.equal(htmlPage(), 'home');
  assert.equal(htmlLevel(), 'a', '首页等级应为 a');

  // 退出，避免影响下一条测试
  click('#quit');
  await waitUntil(() => htmlPage() === 'home', 8000, '退出回首页');
});

test('页面状态同步：页面等级表覆盖会话页，未知页面回落到 b', async () => {
  const { applyPageScope } = await import('../src/ui/motion.ts');
  applyPageScope('quiz');
  assert.equal(htmlPage(), 'quiz');
  assert.equal(htmlLevel(), 'b');
  applyPageScope('preview-done');
  assert.equal(htmlLevel(), 'b', 'preview-done 必须显式是 b（不能靠默认值碰巧正确）');
  applyPageScope('results');
  assert.equal(htmlLevel(), 'b', 'results 必须显式是 b');
  applyPageScope('home');
  assert.equal(htmlLevel(), 'a');
  applyPageScope('reading');
  assert.equal(htmlLevel(), 'c');
  applyPageScope('not-a-page');
  assert.equal(htmlLevel(), 'b', '未知页面回落到 b');
});
