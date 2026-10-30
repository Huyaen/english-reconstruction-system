/**
 * Phase 15h · 全站动效与页面等级运行时
 *
 * 职责（只做视图层，不碰业务状态）：
 *  1. 给 <html> 标 data-page / data-level，让 system.css 按场景分配视觉强度；
 *  2. 统一的入场观察器（[data-reveal] → .is-shown），每次渲染前先断开旧观察器；
 *  3. 指针按下反馈（补充 :active 在触摸/键盘触发下的缺失）；
 *  4. prefers-reduced-motion 时整体静默：不注册观察器、不加 data-motion。
 *
 * 约束：这里不排队任何 DOM 写入，也不延迟业务渲染；所有回调都是幂等的。
 */

export type PageLevel = 'a' | 'b' | 'c';

/** 页面 → 视觉等级。A 表现型 / B 交互型 / C 专注与管理型。 */
const LEVELS: Record<string, PageLevel> = {
  home: 'a',
  stats: 'a',
  diagnostics: 'a',
  unit: 'a',
  books: 'b',
  weak: 'b',
  quiz: 'b',
  preview: 'b',
  'preview-done': 'b',
  results: 'b',
  sentence: 'b',
  grammar: 'b',
  input: 'b',
  output: 'b',
  exam: 'b',
  lab: 'b',
  reading: 'c',
  settings: 'c',
  ai: 'c',
};

let observer: IntersectionObserver | null = null;

function reducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return true;
  }
}

/**
 * 只绑定页面作用域（data-page / data-level）。幂等、无副作用、不碰观察器。
 * 供「页面真的切换了」的时刻同步调用：会话类页面（quiz / preview-done / results）
 * 直接写 #main、不走 render()，如果只在这里跟着 paint() 走，根节点就会停在上一个页面。
 */
export function applyPageScope(page: string): void {
  const root = document.documentElement;
  root.dataset.page = page;
  root.dataset.level = LEVELS[page] ?? 'b';
}

/** 每次渲染后调用：幂等，重复调用只重建观察器。 */
export function applyPageChrome(page: string): void {
  const root = document.documentElement;
  applyPageScope(page);

  if (reducedMotion()) {
    delete root.dataset.motion;
    observer?.disconnect();
    observer = null;
    document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-shown'));
    return;
  }
  root.dataset.motion = 'on';

  observer?.disconnect();
  observer = null;
  const targets = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (!targets.length) return;

  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('is-shown');
        observer?.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  targets.forEach((el) => observer!.observe(el));
}

/** 页面离开/重绘前释放观察器，避免旧节点被持续持有。 */
export function disposePageChrome(): void {
  observer?.disconnect();
  observer = null;
}

/**
 * 指针按下反馈：给按钮与可点行加 .is-pressed，抬起/取消/离开时移除。
 * 只作用于真实指针事件，键盘触发交给 :focus-visible 与 :active。
 */
export function installPressFeedback(): void {
  if (typeof document === 'undefined') return;
  const mark = (e: Event) => {
    const t = (e.target as HTMLElement | null)?.closest<HTMLElement>(
      'button, .button, [role="button"], .chip, li[data-row]',
    );
    if (!t || t.hasAttribute('disabled')) return;
    t.classList.add('is-pressed');
    const clear = () => {
      t.classList.remove('is-pressed');
      window.removeEventListener('pointerup', clear);
      window.removeEventListener('pointercancel', clear);
    };
    window.addEventListener('pointerup', clear, { once: true });
    window.addEventListener('pointercancel', clear, { once: true });
  };
  document.addEventListener('pointerdown', mark, { passive: true });
}
