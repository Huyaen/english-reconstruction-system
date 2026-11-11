import { InkField } from './inkField.ts';

export type MotionPreference = 'expressive' | 'focus';
type Beat = 'enter' | 'select' | 'right' | 'wrong' | 'neutral';
const preferenceKey = 'cijian.motion-preference.v1';
const rhythm = { fold: 660, focus: 155, right: 490, wrong: 620, select: 320 } as const;
const ease = 'cubic-bezier(.18,.83,.18,1)';

/** Owns visual work only. Callbacks never submit, schedule, or save learning data. */
class InkMotion {
  private field: InkField | null = null;
  private target: HTMLElement | null = null;
  private view: AbortController | null = null;
  private animations = new Map<HTMLElement, Animation>();
  private reduced: MediaQueryList | null = null;
  private initialized = false;
  private resize: ResizeObserver | null = null;
  private stored: MotionPreference = 'expressive';

  init() {
    if (this.initialized) return;
    this.initialized = true;
    try { this.stored = localStorage.getItem(preferenceKey) === 'focus' ? 'focus' : 'expressive'; } catch { /* private storage unavailable */ }
    this.reduced = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    this.reduced?.addEventListener('change', () => this.sync());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.quiet(); });
    window.addEventListener('pagehide', () => this.reset(true));
    window.addEventListener('pageshow', event => {
      if (event.persisted) this.mount(document.querySelector<HTMLElement>('#main'));
    });
    this.sync();
  }

  get preference() { return this.stored; }
  get expressive() { return !this.reduced?.matches && this.stored === 'expressive'; }

  setPreference(value: MotionPreference) {
    this.stored = value;
    try { localStorage.setItem(preferenceKey, value); } catch { /* session preference remains active */ }
    this.sync();
  }

  private sync() {
    document.documentElement.dataset.inkMotion = this.reduced?.matches ? 'reduced' : this.stored;
    this.quiet();
    if (!this.expressive) { this.field?.dispose(); this.field = null; }
  }

  mount(root: HTMLElement | null) {
    if (!root) return;
    this.init();
    this.reset();
    const controller = new window.AbortController();
    this.view = controller;
    const options = { signal: controller.signal };
    const target = root.querySelector<HTMLElement>('[data-ink-word]');
    if (target) {
      this.target = target;
      const refresh = () => {
        if (this.field && this.expressive && target.isConnected) this.field.fit(target);
      };
      const input = (event: PointerEvent) => {
        if (!this.expressive || document.hidden || !target.isConnected) return;
        if (event.type === 'pointermove' && event.pointerType !== 'mouse' && !event.buttons) return;
        if (!this.field) this.field = new InkField();
        if (!this.field.canvas.isConnected) this.field.fit(target);
        this.field.input(event.clientX, event.clientY, event.type === 'pointerdown');
      };
      target.addEventListener('pointermove', input, options);
      target.addEventListener('pointerdown', input, options);
      window.addEventListener('resize', refresh, options);
      window.visualViewport?.addEventListener('resize', refresh, options);
      document.fonts?.addEventListener('loadingdone', refresh, options);
      if (typeof ResizeObserver === 'function') {
        this.resize = new ResizeObserver(refresh);
        this.resize.observe(target);
      }
    }
    const rail = root.querySelector<HTMLElement>('[data-ink-rail]');
    if (rail) this.rail(rail, controller);
  }

  pulse() {
    if (!this.expressive || !this.target?.isConnected || document.hidden || typeof requestAnimationFrame !== 'function') return;
    const box = this.target.getBoundingClientRect();
    if (!box.width || !box.height) return;
    this.field ??= new InkField();
    this.field.fit(this.target);
    this.field.input(box.left + box.width * .4, box.top + box.height * .6, true);
  }

  beat(host: HTMLElement | null, kind: Beat, reverse = false, keyboard = false) {
    if (!host || this.reduced?.matches || host.ownerDocument.hidden || typeof host.animate !== 'function') return;
    this.animations.get(host)?.cancel();
    const layer = host.ownerDocument.createElement('i');
    layer.className = 'ink-beat ink-beat-' + kind;
    layer.setAttribute('aria-hidden', 'true');
    host.classList.add('ink-anchor');
    host.append(layer);
    const strong = this.expressive && !keyboard;
    const sign = reverse ? -1 : 1;
    let frames: Keyframe[];
    let duration: number;
    if (kind === 'enter' && strong) {
      frames = [
        { transform: `perspective(700px) rotateX(${sign * 27}deg) translateZ(-65px)`, opacity: .78, clipPath: 'polygon(0 0,100% 0,84% 20%,10% 35%)' },
        { transform: 'perspective(700px) rotateX(-3deg)', opacity: .48, clipPath: 'polygon(0 0,100% 0,100% 100%,0 100%)', offset: .58 },
        { transform: 'none', opacity: 0, clipPath: 'polygon(0 0,100% 0,100% 100%,0 100%)' }
      ];
      duration = rhythm.fold;
    } else if (kind === 'wrong' && strong) {
      frames = [{ transform: 'scaleX(.08) skewX(-29deg)', opacity: .75 },
        { transform: 'scaleX(.86) skewX(-12deg)', opacity: .64, offset: .36 },
        { transform: 'scaleX(.24)', opacity: .28, offset: .72 }, { transform: 'scaleX(0)', opacity: 0 }];
      duration = rhythm.wrong;
    } else {
      frames = [{ transform: 'scaleX(.03)', opacity: .76 },
        { transform: 'scaleX(1)', opacity: .5, offset: .52 }, { transform: 'scaleX(1)', opacity: 0 }];
      duration = strong ? (kind === 'right' ? rhythm.right : rhythm.select) : rhythm.focus;
    }
    const animation = layer.animate(frames, { duration, easing: ease });
    this.animations.set(host, animation);
    void animation.finished.catch(() => {}).finally(() => {
      layer.remove();
      if (this.animations.get(host) === animation) this.animations.delete(host);
    });
  }

  /** Only render real, non-zero counts on a changed statistics window. */
  series(root: HTMLElement) {
    if (!this.expressive || document.hidden) return;
    this.quiet();
    root.querySelectorAll<HTMLElement>('.chart .bar:not(.is-zero)').forEach((bar, index) => {
      const motion = bar.animate([{ transform: 'scaleY(.55)' }, { transform: 'none' }], {
        duration: 320, delay: Math.min(index * 12, 72), easing: ease,
      });
      this.animations.set(bar, motion);
      void motion.finished.catch(() => {}).finally(() => {
        if (this.animations.get(bar) === motion) this.animations.delete(bar);
      });
    });
  }

  /** Capture only the visible working set. Stable IDs link old and new rows. */
  rows(root: HTMLElement) {
    const boxes = new Map<string, number>();
    if (!this.expressive || document.hidden) return boxes;
    for (const row of root.querySelectorAll<HTMLElement>('[data-ink-row]')) {
      if (boxes.size === 14) break;
      const box = row.getBoundingClientRect();
      if (box.height && box.bottom >= 0 && box.top <= innerHeight) boxes.set(row.dataset.inkRow!, box.top);
    }
    return boxes;
  }

  reflow(root: HTMLElement, previous: Map<string, number>) {
    if (!this.expressive || !previous.size) return;
    for (const row of root.querySelectorAll<HTMLElement>('[data-ink-row]')) {
      const before = previous.get(row.dataset.inkRow!);
      if (before === undefined || typeof row.animate !== 'function') continue;
      const delta = before - row.getBoundingClientRect().top;
      if (Math.abs(delta) < 1 || Math.abs(delta) > 240) continue;
      const motion = row.animate([{ transform: `translateY(${delta}px)` }, { transform: 'none' }], { duration: 320, easing: ease });
      this.animations.set(row, motion);
      void motion.finished.catch(() => {}).finally(() => {
        if (this.animations.get(row) === motion) this.animations.delete(row);
      });
    }
  }

  quiet() {
    this.field?.stop();
    for (const [host, animation] of this.animations) {
      animation.cancel();
      host.querySelectorAll(':scope > .ink-beat').forEach(layer => layer.remove());
    }
    this.animations.clear();
  }

  reset(dispose = false) {
    this.quiet();
    this.view?.abort(); this.view = null;
    this.resize?.disconnect(); this.resize = null;
    this.target = null;
    if (dispose) { this.field?.dispose(); this.field = null; }
    else this.field?.release();
  }

  private rail(rail: HTMLElement, controller: AbortController) {
    const options = { signal: controller.signal };
    let drag: { pointer: number; x: number; start: number; at: number; speed: number; moved: boolean } | null = null;
    let raf = 0, suppressClick = false;
    const stop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
    controller.signal.addEventListener('abort', () => {
      stop();
      if (drag && rail.hasPointerCapture(drag.pointer)) rail.releasePointerCapture(drag.pointer);
      drag = null;
    }, { once: true });
    const items = () => Array.from(rail.querySelectorAll<HTMLButtonElement>('[data-ink-stop]'));
    const focusItem = (button: HTMLButtonElement) => {
      stop();
      items().forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      const pane = document.getElementById(button.dataset.inkStop!);
      if (pane) {
        pane.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
        pane.focus({ preventScroll: true });
        this.beat(pane, 'select');
      }
    };
    rail.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      stop(); suppressClick = false;
      drag = { pointer: event.pointerId, x: event.clientX, start: event.clientX, at: performance.now(), speed: 0, moved: false };
    }, options);
    rail.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointer || (!drag.moved && Math.abs(event.clientX - drag.start) < 6)) return;
      if (!drag.moved) { drag.moved = true; rail.setPointerCapture(event.pointerId); }
      const now = performance.now(), dx = drag.x - event.clientX;
      drag.speed = Math.max(-2, Math.min(2, dx / Math.max(8, now - drag.at)));
      const atEdge = (rail.scrollLeft <= 0 && dx < 0) || (rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 1 && dx > 0);
      rail.scrollLeft += atEdge ? dx * .24 : dx;
      drag.x = event.clientX; drag.at = now;
    }, options);
    const release = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointer) return;
      const { moved, speed, pointer, at } = drag;
      drag = null;
      if (rail.hasPointerCapture(pointer)) rail.releasePointerCapture(pointer);
      suppressClick = moved;
      if (!moved || event.type !== 'pointerup' || !this.expressive) return;
      let last = performance.now(), velocity = speed * Math.exp(-(last - at) / 125);
      const step = (now: number) => {
        raf = 0;
        if (document.hidden || !rail.isConnected || !this.expressive) return;
        const dt = Math.min(32, now - last), left = rail.scrollLeft;
        last = now; rail.scrollLeft += velocity * dt;
        velocity *= Math.exp(-dt / 125);
        if (Math.abs(velocity) > .025 && Math.abs(rail.scrollLeft - left) > .1) {
          raf = requestAnimationFrame(step);
          return;
        }
        const buttons = items();
        if (!buttons.length) return;
        const initial = rail.scrollLeft, limit = rail.scrollWidth - rail.clientWidth;
        const positions = buttons.map(button => Math.min(limit, button.offsetLeft - buttons[0].offsetLeft));
        const nearest = positions.reduce((best, x) => Math.abs(x - initial) < Math.abs(best - initial) ? x : best, initial > limit / 2 ? limit : 0);
        if (Math.abs(nearest - initial) < 2) return;
        const snap = (time: number) => {
          raf = 0;
          if (document.hidden || !rail.isConnected || !this.expressive) return;
          const t = Math.min(1, (time - now) / 210);
          rail.scrollLeft = initial + (nearest - initial) * (1 - (1 - t) ** 3);
          if (t < 1) raf = requestAnimationFrame(snap);
        };
        raf = requestAnimationFrame(snap);
      };
      raf = requestAnimationFrame(step);
    };
    rail.addEventListener('pointerup', release, options);
    rail.addEventListener('pointercancel', release, options);
    rail.addEventListener('lostpointercapture', release, options);
    rail.addEventListener('wheel', stop, { ...options, passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); }, options);
    rail.addEventListener('click', event => {
      if (suppressClick && event.detail) { suppressClick = false; event.preventDefault(); return; }
      const item = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-ink-stop]');
      if (item) focusItem(item);
    }, options);
    rail.addEventListener('keydown', event => {
      const buttons = items(), i = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (i < 0) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault(); if (!event.repeat) focusItem(buttons[i]); return;
      }
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault(); stop();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
        Math.max(0, Math.min(buttons.length - 1, i + (event.key === 'ArrowRight' ? 1 : -1)));
      buttons[next].focus();
    }, options);
  }
}

export const inkMotion = new InkMotion();
