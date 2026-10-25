/**
 * Phase 15d — 真正的 Shared Element 转场（容器变形，非整页淡入）
 *
 * 旧实现（motion.ts playFlip）是一个空 div 从旧位置缩到新标题后淡出，
 * 页面本身在同一帧整体替换 —— 观感就是「突变 + 淡入」。
 *
 * 这里换成 Material Container Transform 的做法：
 *   1. 出发卡片的**真实克隆**留在屏幕原位（容器 + 内容），旧页面整体做一层快照淡出；
 *   2. 克隆容器用弹簧积分把 left/top/width/height/border-radius 连续变形到目标卡片矩形；
 *   3. 内容在 45% 处淡出，目标内容在容器快照之下淡入，最后交接给真实 DOM；
 *   4. 全过程只写一个 fixed 层的几何属性 + 两层 opacity，不触碰正文与交互元素。
 *
 * 证据：window.__morphTrace 记录每帧 { t, x, y, w, h, content, page }，
 * 用于验证「连续、单调、无跳变」而不是靠肉眼。
 */
import { motionAllowed } from './motion.ts';

export type MorphRect = { x: number; y: number; w: number; h: number };
export type MorphSample = { t: number; x: number; y: number; w: number; h: number; content: number; page: number };

type Spring = { value: number; target: number; velocity: number };

const K = 232;        // 刚度：约 520–620ms 落定
const C = 26;         // 阻尼：接近临界，允许 1–2% 过冲
const CONTENT_FADE_START = 0.14;
const CONTENT_FADE_END = 0.34;
const PAGE_IN_DELAY = 40;

let running = false;

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function rectOf(el: Element): MorphRect {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function radiusOf(el: Element): number {
    const v = parseFloat(getComputedStyle(el).borderTopLeftRadius || '0');
    return Number.isFinite(v) ? v : 0;
}

function springTo(target: number, value: number): Spring {
    return { value, target, velocity: 0 };
}

function stepSpring(s: Spring, dt: number): void {
    const accel = -K * (s.value - s.target) - C * s.velocity;
    s.velocity += accel * dt;
    s.value += s.velocity * dt;
}

function settled(s: Spring): boolean {
    return Math.abs(s.value - s.target) < 0.35 && Math.abs(s.velocity) < 6;
}

/** 复制主内容区做「离场页面」快照：只读、不可点、无 id，避免查询冲突 */
function snapshotMain(): HTMLElement | null {
    const main = document.querySelector<HTMLElement>('#main');
    if (!main)
        return null;
    const rect = rectOf(main);
    const layer = document.createElement('div');
    layer.className = 'm15-snapshot';
    layer.setAttribute('aria-hidden', 'true');
    layer.inert = true;
    layer.style.cssText = `position:fixed;left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px;overflow:hidden;z-index:70;pointer-events:none;will-change:opacity,transform;`;
    const clone = main.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    clone.querySelectorAll('[data-test], [data-nav]').forEach(n => { n.removeAttribute('data-test'); });
    clone.style.cssText = `width:${rect.w}px;min-height:${rect.h}px;`;
    layer.appendChild(clone);
    document.body.appendChild(layer);
    return layer;
}

function buildTraveler(from: Element, rect: MorphRect, radius: number): { layer: HTMLElement; content: HTMLElement } {
    const t0 = performance.now();
    const cs = getComputedStyle(from);
    const layer = document.createElement('div');
    layer.className = 'm15-traveler';
    layer.setAttribute('aria-hidden', 'true');
    layer.inert = true;
    layer.style.cssText = [
        'position:fixed', 'pointer-events:none', 'overflow:hidden', 'z-index:80',
        `left:${rect.x}px`, `top:${rect.y}px`, `width:${rect.w}px`, `height:${rect.h}px`,
        `border-radius:${radius}px`,
        `background-color:${cs.backgroundColor}`,
        cs.backgroundImage !== 'none' ? `background-image:${cs.backgroundImage}` : '',
        `box-shadow:${cs.boxShadow === 'none' ? '0 24px 60px -28px rgba(0,0,0,.55)' : cs.boxShadow}`,
        'will-change:left,top,width,height,opacity',
    ].filter(Boolean).join(';');
    const content = document.createElement('div');
    content.className = 'm15-content';
    content.style.cssText = `width:${rect.w}px;height:${rect.h}px;transform-origin:top left;will-change:opacity,transform;`;
    const clone = from.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    clone.querySelectorAll('button, a, input, select, textarea').forEach(n => n.setAttribute('tabindex', '-1'));
    clone.style.cssText = `margin:0;width:${rect.w}px;height:${rect.h}px;`;
    content.appendChild(clone);
    layer.appendChild(content);
    document.body.appendChild(layer);
    (window as unknown as { __m15?: number[] }).__m15?.push(+(performance.now() - t0).toFixed(1));
    return { layer, content };
}

function resolveFrom(from: string | Element): Element | null {
    const el = typeof from === 'string' ? document.querySelector(from) : from;
    if (!el)
        return null;
    return el.closest('.d-stage, .hero, .card, section') ?? el;
}

export type MorphOptions = {
    from: string | Element;
    target: string;
    run: () => Promise<void> | void;
    label?: string;
};

export async function morphNavigate(opts: MorphOptions): Promise<void> {
    const enabled = typeof document !== 'undefined' && document.documentElement.dataset.proto === 'd';
    const fromEl = resolveFrom(opts.from);
    if (!enabled || !motionAllowed() || !fromEl || running) {
        await opts.run();
        return;
    }
    const r0 = rectOf(fromEl);
    if (r0.w < 40 || r0.h < 40) {
        await opts.run();
        return;
    }
    running = true;
    const start = now();
    const trace: MorphSample[] = [];
    (window as unknown as { __morphTrace?: unknown }).__morphTrace = trace;

    let snapshot: HTMLElement | null = null;
    let traveler: HTMLElement | null = null;
    let content: HTMLElement | null = null;
    let raf = 0;
    const main = document.querySelector<HTMLElement>('#main');

    try {
        snapshot = snapshotMain();
        const radius0 = radiusOf(fromEl);

        // 先立起克隆层：点击当帧就能看到「卡片被拿起」，而不是等页面切换完才出现
        const built = buildTraveler(fromEl, r0, radius0);
        traveler = built.layer;
        content = built.content;
        // 点击当帧的「拿起」：轻微抬起 + 阴影加深，提示这张卡已经进入转场
        traveler.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.006)' }],
            { duration: 200, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });

        await opts.run();
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

        const targetEl = document.querySelector(opts.target);
        const r1 = targetEl ? rectOf(targetEl) : { x: r0.x + r0.w * 0.04, y: Math.max(12, r0.y - 24), w: r0.w * 0.92, h: r0.h * 0.72 };
        const radius1 = targetEl ? radiusOf(targetEl) : 18;

        if (main) {
            main.style.opacity = '0';
            main.style.willChange = 'opacity';
        }
        if (snapshot) {
            snapshot.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.985)' }],
                { duration: 300, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' });
        }

        const sx = springTo(r1.x, r0.x), sy = springTo(r1.y, r0.y);
        const sw = springTo(r1.w, r0.w), sh = springTo(r1.h, r0.h);
        const sr = springTo(radius1, radius0);

        await new Promise<void>(resolve => {
            let last = now();
            let pageIn = -1;
            const animStart = now();
            const tick = (): void => {
                const t = now();
                const dt = Math.min(0.032, (t - last) / 1000);
                last = t;
                const elapsed = t - animStart;
                stepSpring(sx, dt); stepSpring(sy, dt); stepSpring(sw, dt); stepSpring(sh, dt); stepSpring(sr, dt);

                if (traveler) {
                    traveler.style.left = `${sx.value.toFixed(2)}px`;
                    traveler.style.top = `${sy.value.toFixed(2)}px`;
                    traveler.style.width = `${sw.value.toFixed(2)}px`;
                    traveler.style.height = `${sh.value.toFixed(2)}px`;
                    traveler.style.borderRadius = `${Math.max(0, sr.value).toFixed(2)}px`;
                }

                const progress = Math.min(1, elapsed / 620);
                const contentOpacity = progress <= CONTENT_FADE_START
                    ? 1
                    : progress >= CONTENT_FADE_END ? 0 : 1 - (progress - CONTENT_FADE_START) / (CONTENT_FADE_END - CONTENT_FADE_START);
                if (content)
                    content.style.opacity = contentOpacity.toFixed(3);

                // 新页面在容器快照之下淡入
                let pageOpacity = 0;
                if (main) {
                    const pageT = Math.max(0, elapsed - PAGE_IN_DELAY) / 260;
                    pageOpacity = Math.max(0, Math.min(1, pageT));
                    main.style.opacity = pageOpacity.toFixed(3);
                    if (pageIn < 0 && pageOpacity > 0)
                        pageIn = t;
                }
                if (traveler)
                    traveler.style.opacity = (1 - Math.max(0, (progress - 0.30) / 0.32) * 0.98).toFixed(3);

                trace.push({
                    t: Math.round(elapsed), x: +sx.value.toFixed(1), y: +sy.value.toFixed(1),
                    w: +sw.value.toFixed(1), h: +sh.value.toFixed(1),
                    content: +contentOpacity.toFixed(2), page: +pageOpacity.toFixed(2),
                });

                const done = progress >= 1 && settled(sx) && settled(sy) && settled(sw) && settled(sh);
                if (done || elapsed > 1400) {
                    // 交接前对齐到目标矩形，避免最后 1–12px 的跳位
                    if (traveler) {
                        traveler.style.left = `${r1.x}px`;
                        traveler.style.top = `${r1.y}px`;
                        traveler.style.width = `${r1.w}px`;
                        traveler.style.height = `${r1.h}px`;
                        traveler.style.borderRadius = `${radius1}px`;
                    }
                    trace.push({ t: Math.round(t - start), x: +r1.x.toFixed(1), y: +r1.y.toFixed(1), w: +r1.w.toFixed(1), h: +r1.h.toFixed(1), content: 0, page: 1 });
                    resolve();
                }
                else
                    raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
        });
    }
    finally {
        if (raf)
            cancelAnimationFrame(raf);
        traveler?.remove();
        snapshot?.remove();
        if (main) {
            main.style.opacity = '1';
            main.style.willChange = '';
        }
        running = false;
    }
}

/** 供证据脚本读取：转场是否连续（无回退、无跳帧大跳变） */
export function summarizeMorphTrace(trace: MorphSample[]): { frames: number; duration: number; maxStep: number; backward: number; monotonicX: boolean } {
    let maxStep = 0, backward = 0;
    for (let i = 1; i < trace.length; i++) {
        const d = Math.hypot(trace[i].x - trace[i - 1].x, trace[i].y - trace[i - 1].y);
        maxStep = Math.max(maxStep, d);
        if (trace[i].w < trace[i - 1].w - 0.6 && trace[i].h < trace[i - 1].h - 0.6)
            backward++;
    }
    return {
        frames: trace.length,
        duration: trace.length ? trace[trace.length - 1].t : 0,
        maxStep: +maxStep.toFixed(1),
        backward,
        monotonicX: trace.every((s, i) => i === 0 || s.x >= trace[i - 1].x - 1.5),
    };
}
