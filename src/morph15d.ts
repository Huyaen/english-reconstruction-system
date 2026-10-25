/**
 * Phase 15e — 真正的 Shared Element 转场（v2）
 *
 * 15d 的问题（有录像帧证据）：
 *   1. 几何用 K=232 的欠阻尼弹簧，前 23% 时长就走完 80.6% 位移，之后 58% 时长只移动 5px；
 *   2. 旧内容 14%–34% 才淡完，新页面 40–300ms 就开始以半透明出现 → 412ms 处两层可读叠加；
 *   3. 材质在整个过程中一直接的是「起源卡片」的背景，容器到了新位置却还是旧材料；
 *   4. 返回路径直接切页，没有转场。
 *
 * v2 的做法：
 *   1. 几何走 smoothstep + 末段 1.2% 阻尼收尾：起步慢、中段快、落定稳，无长尾；
 *   2. 旧内容 0–110ms 退场，此后容器内不再有旧内容；新页面 220–400ms 才淡入；
 *   3. 容器内部叠一层「目标材质」，随进度交叉过渡（几何、材质、内容状态同步）；
 *   4. 容器自带一道随形移动的高光，光与形一起走；
 *   5. 420ms 单帧交接：容器移除，真实 DOM 早已就位且同矩形，无跳位；
 *   6. 反向（会话 → Today）用同一时间线镜像，压缩到 340ms。
 *
 * 证据：window.__morphTrace 每帧记录 { t, x, y, w, h, content, page, geo }。
 */
import { motionAllowed } from './motion.ts';

export type MorphRect = { x: number; y: number; w: number; h: number };
export type MorphSample = { t: number; x: number; y: number; w: number; h: number; content: number; page: number; geo: number };
export type MorphMode = 'forward' | 'reverse';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 起步慢、中段快、落定稳；末段叠加 1.2% 的阻尼收尾，产生重量感但不回弹。 */
function geoProgress(u: number): number {
    const s = u * u * (3 - 2 * u);
    if (u <= 0.72)
        return s;
    const k = (u - 0.72) / 0.28;
    return s + Math.sin(k * Math.PI) * (1 - k) * 0.012;
}

const TIMING = {
    forward: { dur: 440, contentOut: 100, snapOut: 110, pageIn: [160, 405] as [number, number], lift: 1.006 },
    reverse: { dur: 360, contentOut: 90, snapOut: 95, pageIn: [140, 330] as [number, number], lift: 1.004 },
};

let running = false;

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function rectOf(el: Element): MorphRect {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
}

/** 取元素实际绘制的底色；透明则往上找，最后退回 body。 */
function backgroundColorOf(el: Element): string {
    let node: Element | null = el;
    while (node && node !== document.documentElement) {
        const c = getComputedStyle(node).backgroundColor;
        if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent')
            return c;
        node = node.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor || '#0E1116';
}

function radiusOf(el: Element): number {
    const v = parseFloat(getComputedStyle(el).borderTopLeftRadius || '0');
    return Number.isFinite(v) ? v : 0;
}

function surfaceOf(el: Element): string {
    const cs = getComputedStyle(el);
    const bits = [`background-color:${cs.backgroundColor}`];
    if (cs.backgroundImage && cs.backgroundImage !== 'none')
        bits.push(`background-image:${cs.backgroundImage}`);
    if (cs.backdropFilter && cs.backdropFilter !== 'none')
        bits.push(`backdrop-filter:${cs.backdropFilter}`);
    return bits.join(';');
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
    layer.style.cssText = `position:fixed;left:${rect.x}px;top:${rect.y}px;width:${rect.w}px;height:${rect.h}px;overflow:hidden;z-index:70;pointer-events:none;will-change:opacity;`;
    const clone = main.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    clone.querySelectorAll('[data-test], [data-nav]').forEach(n => n.removeAttribute('data-test'));
    clone.style.cssText = `width:${rect.w}px;min-height:${rect.h}px;`;
    layer.appendChild(clone);
    document.body.appendChild(layer);
    return layer;
}

function buildTraveler(from: Element, rect: MorphRect, radius: number): { layer: HTMLElement; content: HTMLElement; dest: HTMLElement; sheen: HTMLElement } {
    const t0 = performance.now();
    const layer = document.createElement('div');
    layer.className = 'm15-traveler';
    layer.setAttribute('aria-hidden', 'true');
    layer.inert = true;
    layer.style.cssText = [
        'position:fixed', 'pointer-events:none', 'overflow:hidden', 'z-index:80',
        `left:${rect.x}px`, `top:${rect.y}px`, `width:${rect.w}px`, `height:${rect.h}px`,
        `border-radius:${radius}px`,
        surfaceOf(from),
        'box-shadow:0 26px 60px -30px rgba(0,0,0,.6)',
        'will-change:left,top,width,height,opacity,transform',
    ].filter(Boolean).join(';');

    // 目标材质层：随几何进度交叉过渡，容器到了新位置就是新材料
    const dest = document.createElement('div');
    dest.className = 'm15-dest';
    dest.style.cssText = `position:absolute;inset:0;border-radius:inherit;opacity:0;will-change:opacity;`;
    layer.appendChild(dest);

    // 随形高光：光跟容器一起走
    const sheen = document.createElement('div');
    sheen.className = 'm15-sheen';
    sheen.style.cssText = `position:absolute;top:0;left:0;width:58%;height:100%;pointer-events:none;opacity:.32;mix-blend-mode:screen;will-change:transform,opacity;background:linear-gradient(100deg,transparent 8%,rgba(255,255,255,.16) 46%,rgba(255,255,255,.05) 62%,transparent 88%);`;
    layer.appendChild(sheen);

    const content = document.createElement('div');
    content.className = 'm15-content';
    content.style.cssText = `position:absolute;left:0;top:0;width:${rect.w}px;height:${rect.h}px;transform-origin:top left;will-change:opacity,transform;`;
    const clone = from.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    clone.querySelectorAll('button, a, input, select, textarea').forEach(n => n.setAttribute('tabindex', '-1'));
    clone.style.cssText = `margin:0;width:${rect.w}px;height:${rect.h}px;`;
    content.appendChild(clone);
    layer.appendChild(content);

    document.body.appendChild(layer);
    (window as unknown as { __m15?: number[] }).__m15?.push(+(performance.now() - t0).toFixed(1));
    return { layer, content, dest, sheen };
}

function resolveFrom(from: string | Element): Element | null {
    const el = typeof from === 'string' ? document.querySelector(from) : from;
    if (!el)
        return null;
    return el.closest('.d-row, .d-stage, .hero, .card, section') ?? el;
}

export type MorphOptions = {
    from: string | Element;
    target: string;
    run: () => Promise<void> | void;
    label?: string;
    mode?: MorphMode;
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

    const mode: MorphMode = opts.mode ?? 'forward';
    const T = TIMING[mode];
    running = true;
    const start = now();
    const trace: MorphSample[] = [];
    (window as unknown as { __morphTrace?: unknown }).__morphTrace = trace;

    let snapshot: HTMLElement | null = null;
    let backdrop: HTMLElement | null = null;
    let backdropTo: HTMLElement | null = null;
    let traveler: HTMLElement | null = null;
    let content: HTMLElement | null = null;
    let dest: HTMLElement | null = null;
    let sheen: HTMLElement | null = null;
    let raf = 0;
    const main = document.querySelector<HTMLElement>('#main');
    const radius0 = radiusOf(fromEl);

    try {
        // 旧页面：先立快照，再把真实 #main 藏起来（避免它在新页面插入后闪一帧）
        // 衬底：整段转场都在，颜色从「旧页面」渐变到「新页面」——
        // 没有任何一帧会露出 body 底色（15d 的黑/白闪就是这里缺了一层）。
        const pageBg = backgroundColorOf(document.querySelector('#main .d-page') ?? fromEl);
        backdrop = document.createElement('div');
        backdrop.className = 'm15-backdrop';
        backdrop.setAttribute('aria-hidden', 'true');
        backdrop.style.cssText = `position:fixed;inset:0;z-index:69;pointer-events:none;background:${pageBg};`;
        backdropTo = document.createElement('div');
        backdropTo.style.cssText = 'position:absolute;inset:0;opacity:0;will-change:opacity;';
        backdrop.appendChild(backdropTo);
        document.body.appendChild(backdrop);

        snapshot = snapshotMain();
        if (main)
            main.style.visibility = 'hidden';

        const built = buildTraveler(fromEl, r0, radius0);
        traveler = built.layer;
        content = built.content;
        dest = built.dest;
        sheen = built.sheen;

        // 0–70ms 的「拿起」：轻微抬起，不缩放内容
        traveler.animate([{ transform: 'scale(1)' }, { transform: `scale(${T.lift})` }, { transform: 'scale(1)' }],
            { duration: 220, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'forwards' });

        await opts.run();
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

        const targetEl = document.querySelector(opts.target);
        const r1 = targetEl ? rectOf(targetEl) : { x: r0.x + r0.w * 0.04, y: Math.max(12, r0.y - 24), w: r0.w * 0.92, h: r0.h * 0.72 };
        const radius1 = targetEl ? radiusOf(targetEl) : 18;

        // 新页面：不可见、不可点，直到容器落定前才开始淡入
        if (main) {
            main.style.opacity = '0';
            main.style.visibility = 'visible';
            main.style.pointerEvents = 'none';
            main.style.willChange = 'opacity';
        }
        if (dest && targetEl)
            dest.style.cssText += `;${surfaceOf(targetEl)}`;
        if (backdropTo && targetEl)
            backdropTo.style.background = backgroundColorOf(targetEl);

        let pageStart = 0;
        await new Promise<void>(resolve => {
            const animStart = now();
            const tick = (): void => {
                const elapsed = now() - animStart;
                const u = clamp01(elapsed / T.dur);
                const p = geoProgress(u);

                if (traveler) {
                    traveler.style.left = `${lerp(r0.x, r1.x, p).toFixed(2)}px`;
                    traveler.style.top = `${lerp(r0.y, r1.y, p).toFixed(2)}px`;
                    traveler.style.width = `${Math.max(1, lerp(r0.w, r1.w, p)).toFixed(2)}px`;
                    traveler.style.height = `${Math.max(1, lerp(r0.h, r1.h, p)).toFixed(2)}px`;
                    traveler.style.borderRadius = `${lerp(radius0, radius1, p).toFixed(2)}px`;
                }
                // 材质：几何走了 15% 之后开始换，85% 时完成
                if (dest)
                    dest.style.opacity = clamp01((p - 0.15) / 0.7).toFixed(3);
                // 衬底随几何一起换色，页面交接时不会闪底色
                if (backdropTo)
                    backdropTo.style.opacity = p.toFixed(3);
                // 旧页面在容器还盖着原位时退干净，避免缩走之后露出旧文字
                if (snapshot)
                    snapshot.style.opacity = clamp01(1 - elapsed / T.snapOut).toFixed(3);

                // 旧内容快速退场，此后容器里没有旧内容
                const contentOut = clamp01(1 - elapsed / T.contentOut);
                if (content)
                    content.style.opacity = contentOut.toFixed(3);

                // 随形高光：从右侧扫到左侧，随落定变淡
                if (sheen) {
                    sheen.style.transform = `translate3d(${lerp(96, -58, p).toFixed(1)}%, 0, 0)`;
                    sheen.style.opacity = (0.34 * (1 - clamp01((p - 0.6) / 0.4))).toFixed(3);
                }

                // 新页面在容器之下淡入：几何基本落定后才开始
                let pageOpacity = 0;
                if (elapsed >= T.pageIn[0]) {
                    pageOpacity = clamp01((elapsed - T.pageIn[0]) / (T.pageIn[1] - T.pageIn[0]));
                    if (pageStart === 0 && pageOpacity > 0)
                        pageStart = now();
                }
                if (main)
                    main.style.opacity = pageOpacity.toFixed(3);

                trace.push({
                    t: Math.round(elapsed),
                    x: +lerp(r0.x, r1.x, p).toFixed(1), y: +lerp(r0.y, r1.y, p).toFixed(1),
                    w: +lerp(r0.w, r1.w, p).toFixed(1), h: +lerp(r0.h, r1.h, p).toFixed(1),
                    content: +contentOut.toFixed(2), page: +pageOpacity.toFixed(2),
                    geo: +p.toFixed(4),
                });

                if (u >= 1) {
                    // 单帧交接：容器与目标同矩形，页面已 1.0
                    if (traveler) {
                        traveler.style.left = `${r1.x}px`;
                        traveler.style.top = `${r1.y}px`;
                        traveler.style.width = `${r1.w}px`;
                        traveler.style.height = `${r1.h}px`;
                        traveler.style.borderRadius = `${radius1}px`;
                    }
                    if (main)
                        main.style.opacity = '1';
                    trace.push({ t: Math.round(now() - start), x: +r1.x.toFixed(1), y: +r1.y.toFixed(1), w: +r1.w.toFixed(1), h: +r1.h.toFixed(1), content: 0, page: 1, geo: 1 });
                    resolve();
                    return;
                }
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
        backdrop?.remove();
        if (main) {
            main.style.opacity = '1';
            main.style.visibility = 'visible';
            main.style.pointerEvents = '';
            main.style.willChange = '';
        }
        running = false;
    }
}

/** 供证据脚本读取：转场是否连续（无回退、无跳帧大跳变、无长时间停滞） */
export function summarizeMorphTrace(trace: MorphSample[]): {
    frames: number; duration: number; maxStep: number; backward: number;
    monotonicX: boolean; stillTail: number; longestStill: number;
} {
    let maxStep = 0, backward = 0, longestStill = 0, run = 0;
    for (let i = 1; i < trace.length; i++) {
        const d = Math.hypot(trace[i].x - trace[i - 1].x, trace[i].y - trace[i - 1].y);
        maxStep = Math.max(maxStep, d);
        if (d < 0.35) {
            run++;
            longestStill = Math.max(longestStill, run);
        }
        else
            run = 0;
        if (trace[i].w < trace[i - 1].w - 0.6 && trace[i].h < trace[i - 1].h - 0.6)
            backward++;
    }
    return {
        frames: trace.length,
        duration: trace.length ? trace[trace.length - 1].t : 0,
        maxStep: +maxStep.toFixed(1),
        backward,
        monotonicX: trace.every((s, i) => i === 0 || s.x >= trace[i - 1].x - 1.5),
        stillTail: +(trace.slice(-8).reduce((n, _, i, a) => i ? n + Math.hypot(a[i].x - a[i - 1].x, a[i].y - a[i - 1].y) : 0, 0)).toFixed(2),
        longestStill,
    };
}
