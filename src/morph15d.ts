/**
 * Phase 15g — Anchored Container Transform（v3）
 *
 * 15f 的问题（用户逐帧评审 + 本轮 CDP/gdigrab 三路复核）：
 *   1. 反向转场传的是 '#main > *' → 整个学习页当容器飞，视觉上就是「整页缩小」；
 *   2. 旧页快照与飞行容器同时可见，旧页还是整页克隆 → 同一条信息出现两次；
 *   3. 快照 330ms 开始 80ms 内淡完，新页在同一段里从 0 冲到 1 → 「啪」地换页；
 *   4. 快照与容器的材质各自过渡，容器到了新位置仍带着旧材料；
 *   5. 多个光层各自扫描，转场前后的明暗难以归因。
 *
 * v3 的规则：
 *   1. **只有任务容器走**：锚点 = [data-morph-anchor]，落点 = target 选择器；页面底板不缩放不位移。
 *   2. 旧页只留一张不透明底板（整页克隆），其中锚点槽位被挖掉 —— 不会出现两份同样的文字。
 *   3. 新页在底板之下，**从不改 opacity**：run() 立刻执行（DOM 同步更新不变），
 *      底板最后以 4 级离焦 + 透明度渐隐交出画面。
 *   4. 容器自带材质交换：几何走 12% 起，目标材质交叉到 .58，圆角/阴影/高光同一条进度曲线。
 *   5. 可中断：Escape 或重复点击都收敛到终点，不会留下半透明的壳。
 *
 * 证据：window.__morphTrace 每帧记录 { t, x, y, w, h, geo, content, plate, blur }。
 */
import { motionAllowed } from './motion.ts';

export type MorphRect = { x: number; y: number; w: number; h: number };
export type MorphSample = {
    t: number; x: number; y: number; w: number; h: number;
    geo: number; content: number; plate: number; blur: number;
};
export type MorphMode = 'forward' | 'reverse';

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 起步慢、中段快、落定稳；末段 1% 阻尼收尾，有重量但不回弹。 */
function geoProgress(u: number): number {
    const s = u * u * (3 - 2 * u);
    if (u <= 0.74)
        return s;
    const k = (u - 0.74) / 0.26;
    return s + Math.sin(k * Math.PI) * (1 - k) * 0.010;
}

const TIMING = {
    forward: { dur: 470, contentOut: 165, plateFade: [300, 440] as [number, number], dissolve: 88 },
    reverse: { dur: 400, contentOut: 140, plateFade: [250, 372] as [number, number], dissolve: 84 },
};

let running = false;
let abortRequested = false;

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

function rectOf(el: Element): MorphRect {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function backgroundColorOf(el: Element): string {
    let node: Element | null = el;
    while (node && node !== document.documentElement) {
        const c = getComputedStyle(node).backgroundColor;
        if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent')
            return c;
        node = node.parentElement;
    }
    return getComputedStyle(document.body).backgroundColor || '#0C0F13';
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
    return bits.join(';');
}

/** 锚点：优先 data-morph-anchor，其次 .d-stage/.d-now，最后才是给定元素 */
function resolveAnchor(from: string | Element): HTMLElement | null {
    const base = typeof from === 'string' ? document.querySelector<HTMLElement>(from) : (from as HTMLElement);
    if (!base)
        return null;
    return base.closest<HTMLElement>('[data-morph-anchor]') ?? base.closest<HTMLElement>('.d-stage, .d-now') ?? base;
}

/** 冻结克隆里的动画，避免快照把呼吸相位从 0 重放一遍 */
/**
 * 克隆层的动画处理：**不动**。
 * 试过 animation-play-state: paused —— 克隆是全新元素，暂停等于把每个灯光层按在 0% 相位，
 * 整页比真实页暗一档（实测均值 34 → 25），转场一开始就像被人压暗了。
 * 让它们照常跑，470ms 内的相位差看不出来，也不会有整体压暗。
 */
function freezeAnimations(_root: HTMLElement): void {
    /* 故意留空 */
}

/** 旧页底板：整页克隆，锚点槽位挖空，不缩放不位移 */
function buildPlate(anchor: HTMLElement | null): HTMLElement | null {
    const main = document.querySelector<HTMLElement>('#main');
    if (!main)
        return null;
    const layer = document.createElement('div');
    layer.className = 'm15-plate';
    layer.setAttribute('aria-hidden', 'true');
    layer.inert = true;
    layer.style.cssText = [
        'position:fixed', 'inset:0', 'z-index:70', 'pointer-events:none', 'overflow:hidden',
        'background:inherit',
        'will-change:opacity,filter', 'transform:translateZ(0)',
    ].join(';');

    // 克隆整个 body（不是 #main）：页面底色、环境光场、外框都在 #main 之外，
    // 只克隆 #main 会让底板比真实页面暗一档（实测 33 → 22，差 11 级）。
    const clone = document.body.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.m15-plate, .m15-traveler').forEach(n => n.remove());
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    clone.querySelectorAll('[data-test], [data-nav]').forEach(n => n.removeAttribute('data-test'));
    clone.style.cssText = `position:absolute;left:0;top:${-window.scrollY}px;width:${window.innerWidth}px;margin:0;`;
    // 槽位挖空：同一段内容不能在底板和飞行容器里各出现一次
    if (anchor) {
        const first = anchor.className ? anchor.className.trim().split(/\s+/)[0] : '';
        const slot = clone.querySelector<HTMLElement>('[data-morph-anchor]')
            ?? (first ? clone.querySelector<HTMLElement>('.' + first) : null);
        if (slot && slot !== clone)
            slot.style.visibility = 'hidden';
    }
    freezeAnimations(clone);
    layer.appendChild(clone);
    document.body.appendChild(layer);
    return layer;
}

type Traveler = { layer: HTMLElement; content: HTMLElement; dest: HTMLElement; sheen: HTMLElement };

function buildTraveler(from: HTMLElement, rect: MorphRect, radius: number): Traveler {
    const layer = document.createElement('div');
    layer.className = 'm15-traveler';
    layer.setAttribute('aria-hidden', 'true');
    layer.inert = true;
    layer.style.cssText = [
        'position:fixed', 'pointer-events:none', 'overflow:hidden', 'z-index:80',
        `left:${rect.x}px`, `top:${rect.y}px`, `width:${rect.w}px`, `height:${rect.h}px`,
        `border-radius:${radius}px`,
        surfaceOf(from),
        'box-shadow:0 0 0 0 rgba(0,0,0,0)',
        'will-change:left,top,width,height,border-radius,opacity',
        'isolation:isolate',
    ].join(';');

    const dest = document.createElement('div');
    dest.className = 'm15-dest';
    dest.style.cssText = 'position:absolute;inset:0;border-radius:inherit;opacity:0;will-change:opacity;';
    layer.appendChild(dest);

    // 随形高光：按容器自身比例取位置，形变时高光跟着一起变
    const sheen = document.createElement('div');
    sheen.className = 'm15-sheen';
    sheen.style.cssText = 'position:absolute;top:-20%;left:0;width:64%;height:140%;pointer-events:none;opacity:.28;mix-blend-mode:screen;will-change:transform,opacity;background:linear-gradient(100deg,transparent 10%,rgba(255,255,255,.20) 44%,rgba(255,255,255,.06) 60%,transparent 90%);';
    layer.appendChild(sheen);

    const content = document.createElement('div');
    content.className = 'm15-content';
    content.style.cssText = `position:absolute;left:0;top:0;width:${rect.w}px;height:${rect.h}px;transform-origin:top left;will-change:opacity;`;
    const clone = from.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    clone.querySelectorAll('button, a, input, select, textarea').forEach(n => n.setAttribute('tabindex', '-1'));
    clone.style.cssText = `margin:0;width:${rect.w}px;height:${rect.h}px;`;
    freezeAnimations(clone);
    content.appendChild(clone);
    layer.appendChild(content);

    document.body.appendChild(layer);
    return { layer, content, dest, sheen };
}

function shadowAt(p: number): string {
    const y = lerp(14, 34, p), b = lerp(34, 96, p), s = lerp(-18, -64, p), a = lerp(0.34, 0.72, p);
    return `0 ${y.toFixed(1)}px ${b.toFixed(1)}px ${s.toFixed(1)}px rgba(0,0,0,${a.toFixed(2)})`;
}

export type MorphOptions = {
    from: string | Element;
    target: string;
    run: () => Promise<void> | void;
    label?: string;
    mode?: MorphMode;
};

/** 立即收敛到终点（Escape / 页面隐藏 / 新导航打断时用） */
export function finishMorph(): void {
    abortRequested = true;
}

export function morphBusy(): boolean {
    return running;
}

export async function morphNavigate(opts: MorphOptions): Promise<void> {
    const enabled = typeof document !== 'undefined' && document.documentElement.dataset.proto === 'd';
    const anchor = resolveAnchor(opts.from);
    if (!enabled || !motionAllowed() || !anchor || running) {
        await opts.run();
        return;
    }
    const r0 = rectOf(anchor);
    if (r0.w < 40 || r0.h < 40) {
        await opts.run();
        return;
    }

    const mode: MorphMode = opts.mode ?? 'forward';
    const T = TIMING[mode];
    const start = now();
    const trace: MorphSample[] = [];
    (window as unknown as { __morphTrace?: unknown }).__morphTrace = trace;
    running = true;
    abortRequested = false;

    const radius0 = radiusOf(anchor);
    let plate: HTMLElement | null = null;
    let traveler: HTMLElement | null = null;
    let content: HTMLElement | null = null;
    let dest: HTMLElement | null = null;
    let sheen: HTMLElement | null = null;
    let raf = 0;
    const onKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape')
            abortRequested = true;
    };
    window.addEventListener('keydown', onKey, true);
    // 页面被隐藏时 rAF 会停：让转场直接收敛，别把动画挂在后台
    const onHide = (): void => { if (document.hidden) abortRequested = true; };
    document.addEventListener('visibilitychange', onHide);

    try {
        plate = buildPlate(anchor);
        const tv = buildTraveler(anchor, r0, radius0);
        traveler = tv.layer;
        content = tv.content;
        dest = tv.dest;
        sheen = tv.sheen;

        // DOM 立刻更新：不推迟、不排队，Task Executor 的同步语义不变
        await opts.run();
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

        // 目标卡片可能还在「加载中」：这段延时正是 15f 录屏里那片近黑的来源。
        // 底板不透明地盖着，容器在槽位里悬着等它出现，用户看不到加载页。
        const waitStart = now();
        let targetEl = document.querySelector<HTMLElement>(opts.target);
        if (traveler)
            traveler.style.transform = 'scale(1.006)';
        while (!targetEl && now() - waitStart < 1400) {
            await new Promise<void>(r => setTimeout(r, 40));
            targetEl = document.querySelector<HTMLElement>(opts.target);
        }
        if (traveler)
            traveler.style.transform = '';
        const r1 = targetEl ? rectOf(targetEl) : { x: r0.x, y: Math.max(12, r0.y - 20), w: r0.w, h: r0.h * 0.86 };
        const radius1 = targetEl ? radiusOf(targetEl) : radius0;
        if (dest && targetEl)
            dest.style.cssText += ';' + surfaceOf(targetEl);

        await new Promise<void>(resolve => {
            const animStart = now();
            let lastBlur = -1;
            const tick = (): void => {
                const elapsed = now() - animStart;
                const u = clamp01(elapsed / T.dur);
                const p = abortRequested ? 1 : geoProgress(u);

                if (traveler) {
                    traveler.style.left = `${lerp(r0.x, r1.x, p).toFixed(2)}px`;
                    traveler.style.top = `${lerp(r0.y, r1.y, p).toFixed(2)}px`;
                    traveler.style.width = `${Math.max(1, lerp(r0.w, r1.w, p)).toFixed(2)}px`;
                    traveler.style.height = `${Math.max(1, lerp(r0.h, r1.h, p)).toFixed(2)}px`;
                    traveler.style.borderRadius = `${lerp(radius0, radius1, p).toFixed(2)}px`;
                    traveler.style.boxShadow = shadowAt(p);
                }
                // 材质交换：几何走了 12% 之后开始，88% 完成；容器到落点时已经是目标材料
                if (dest)
                    dest.style.opacity = (0.58 * clamp01((p - 0.12) / 0.76)).toFixed(3);
                const contentOut = 1 - clamp01(elapsed / T.contentOut);
                if (content)
                    content.style.opacity = contentOut.toFixed(3);
                if (sheen) {
                    sheen.style.transform = `translate3d(${lerp(58, -66, p).toFixed(1)}%, 0, 0)`;
                    sheen.style.opacity = (0.30 * (1 - clamp01((p - 0.55) / 0.45))).toFixed(3);
                }

                // 底板：失焦 + 变暗（不缩放），最后一段才隐去
                const fade = clamp01((elapsed - T.plateFade[0]) / (T.plateFade[1] - T.plateFade[0]));
                const blurStep = Math.round(clamp01(p) * 4) * 3.5;   // 0/3.5/7/10.5/14，只重栅格 5 次
                if (plate) {
                    if (blurStep !== lastBlur && !/noblur/.test(location.search)) {
                        plate.style.filter = `blur(${blurStep}px) brightness(${(1 - 0.16 * p).toFixed(3)})`;
                        lastBlur = blurStep;
                    }
                    plate.style.opacity = (1 - fade).toFixed(3);
                }

                trace.push({
                    t: Math.round(elapsed),
                    x: +lerp(r0.x, r1.x, p).toFixed(1), y: +lerp(r0.y, r1.y, p).toFixed(1),
                    w: +lerp(r0.w, r1.w, p).toFixed(1), h: +lerp(r0.h, r1.h, p).toFixed(1),
                    geo: +p.toFixed(4), content: +contentOut.toFixed(2),
                    plate: +(1 - fade).toFixed(2), blur: blurStep,
                });

                if (u >= 1 || abortRequested) {
                    if (traveler) {
                        traveler.style.left = `${r1.x}px`;
                        traveler.style.top = `${r1.y}px`;
                        traveler.style.width = `${r1.w}px`;
                        traveler.style.height = `${r1.h}px`;
                        traveler.style.borderRadius = `${radius1}px`;
                    }
                    if (plate)
                        plate.style.opacity = '0';
                    trace.push({
                        t: Math.round(now() - start), x: +r1.x.toFixed(1), y: +r1.y.toFixed(1),
                        w: +r1.w.toFixed(1), h: +r1.h.toFixed(1), geo: 1, content: 0, plate: 0, blur: 14,
                    });
                    resolve();
                    return;
                }
                raf = requestAnimationFrame(tick);
            };
            raf = requestAnimationFrame(tick);
        });

        // 落定后壳淡出，把真实卡片交出来——卡片早已在下面同矩形，不会跳位
        if (traveler) {
            traveler.animate([{ opacity: 1 }, { opacity: 0 }],
                { duration: T.dissolve, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
            await new Promise<void>(r => setTimeout(r, T.dissolve));
        }
    }
    finally {
        if (raf)
            cancelAnimationFrame(raf);
        window.removeEventListener('keydown', onKey, true);
        document.removeEventListener('visibilitychange', onHide);
        traveler?.remove();
        plate?.remove();
        running = false;
        abortRequested = false;
    }
}

/** 供证据脚本读取：转场是否连续（无回退、无跳变、无长时间停滞、底板是否提前消失） */
export function summarizeMorphTrace(trace: MorphSample[]): {
    frames: number; duration: number; maxStep: number; backward: number;
    monotonicX: boolean; stillTail: number; longestStill: number; earlyPlateGone: number;
} {
    let maxStep = 0, backward = 0, longestStill = 0, run = 0, earlyPlateGone = 0;
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
        if (trace[i].plate === 0 && trace[i].geo < 0.8)
            earlyPlateGone++;
    }
    return {
        frames: trace.length,
        duration: trace.length ? trace[trace.length - 1].t : 0,
        maxStep: +maxStep.toFixed(1),
        backward,
        monotonicX: trace.every((s, i) => i === 0 || s.x >= trace[i - 1].x - 1.5),
        stillTail: +(trace.slice(-8).reduce((n, _, i, a) => i ? n + Math.hypot(a[i].x - a[i - 1].x, a[i].y - a[i - 1].y) : 0, 0)).toFixed(2),
        longestStill,
        earlyPlateGone,
    };
}
