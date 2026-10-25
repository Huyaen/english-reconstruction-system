// —— Phase 15d · Living surfaces（v2）——
// 一套很小的动态系统：方向光 + 指针光 / 弹簧按压 / 任务展开 / 呼吸暂停。
// 约束：
//  1) 只写 transform / opacity 与单个元素的 height；文字与点击区域永远不动。
//  2) 只有一个环境光 rAF（且只在指针位于舞台内时运行）；空闲时由 CSS 合成层负责呼吸。
//  3) 页面不可见、窗口失焦或舞台离屏时，整页持续动画暂停（html[data-lights=paused]）。
//  4) reduced-motion 下一律不启动。

const clamp = (v: number, a = 0, b = 1): number => Math.max(a, Math.min(b, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export function livingAllowed(): boolean {
    if (typeof window === 'undefined' || typeof document === 'undefined' || typeof window.matchMedia !== 'function')
        return false;
    try {
        return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    catch {
        return false;
    }
}

type LightNode = HTMLElement | null;

interface Field {
    stage: HTMLElement;
    glare: LightNode;
    key: LightNode;
    spec: LightNode;
    rim: LightNode;
    px: number;
    py: number;
    tx: number;
    ty: number;
    w: number;
    h: number;
    active: boolean;
    raf: number;
}

let field: Field | null = null;
let bound = false;
let resizeObserver: ResizeObserver | null = null;
let stageObserver: IntersectionObserver | null = null;

function idleClass(paused: boolean): void {
    if (typeof document === 'undefined')
        return;
    document.documentElement.dataset.lights = paused ? 'paused' : 'on';
}

let lastFrameAt = 0;

function frame(now = performance.now()): void {
    if (!field)
        return;
    const f = field;
    // 与刷新率无关的阻尼：高刷屏和无头浏览器（250fps）下的手感一致
    const dt = lastFrameAt ? Math.min(0.05, Math.max(0.004, (now - lastFrameAt) / 1000)) : 1 / 60;
    lastFrameAt = now;
    const tau = f.active ? 0.085 : 0.19;
    const k = 1 - Math.exp(-dt / tau);
    f.px = lerp(f.px, f.tx, k);
    f.py = lerp(f.py, f.ty, k);
    const x = f.px * f.w;
    const y = f.py * f.h;
    // 指针到舞台中心的归一化距离：0 中心，1 边缘
    const cx = (f.px - 0.5) * 2, cy = (f.py - 0.5) * 2;
    const dist = clamp(Math.hypot(cx, cy * 0.8), 0, 1.4);
    const focus = clamp(1 - dist / 1.15);

    if (f.glare)
        f.glare.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    if (f.key) {
        // 主光被指针牵引；位移按舞台尺寸换算，小屏同样成立
        const kx = x * 0.86 + f.w * 0.07;
        const ky = y * 0.78 - f.h * 0.22;
        f.key.style.transform = `translate3d(${kx.toFixed(1)}px, ${ky.toFixed(1)}px, 0)`;
    }
    if (f.spec) {
        // 高光方位角跟随指针：反射在指针方向被点亮
        const angle = Math.atan2(cy, cx) * 180 / Math.PI;
        f.spec.style.transform = `translate3d(${(cx * f.w * 0.1).toFixed(1)}px, ${(cy * f.h * 0.08).toFixed(1)}px, 0) rotate(${(angle * 0.32).toFixed(1)}deg)`;
    }

    // 收敛即停：指针停住时不再占用 rAF（下一次 pointermove 会重新 kick）
    const settled = Math.abs(f.px - f.tx) < 0.0012 && Math.abs(f.py - f.ty) < 0.0012;
    if (settled) {
        // 亮度只在进入/离开/收敛时写一次：每帧写 opacity 会触发逐帧样式重算与重绘
        if (f.glare) f.glare.style.opacity = (f.active ? 0.72 + focus * 0.28 : 0).toFixed(2);
        if (f.key) f.key.style.opacity = (0.55 + focus * 0.5).toFixed(2);
        if (f.spec) f.spec.style.opacity = (0.14 + focus * 0.66).toFixed(2);
        if (f.rim) f.rim.style.opacity = (0.35 + clamp(1 - f.py * 1.35) * 0.55).toFixed(2);
        f.raf = 0;
        lastFrameAt = 0;
        return;
    }
    f.raf = requestAnimationFrame(frame);
}

function kick(): void {
    if (!field || field.raf || typeof document === 'undefined' || document.hidden)
        return;
    if (document.documentElement.dataset.lights === 'paused')
        idleClass(false);
    field.raf = requestAnimationFrame(frame);
}

function onPointerMove(ev: PointerEvent): void {
    if (!field || ev.pointerType === 'touch')
        return;
    const rect = field.stage.getBoundingClientRect();
    if (!rect.width || !rect.height)
        return;
    field.w = rect.width;
    field.h = rect.height;
    const inside = ev.clientX >= rect.left - 30 && ev.clientX <= rect.right + 30
        && ev.clientY >= rect.top - 30 && ev.clientY <= rect.bottom + 40;
    if (inside && !field.active) {
        field.active = true;
        field.px = clamp((ev.clientX - rect.left) / rect.width);
        field.py = clamp((ev.clientY - rect.top) / rect.height);
        // 进入时立刻点亮，不等收敛：光要跟着指针「进来」就出现
        if (field.glare) field.glare.style.opacity = '.86';
        if (field.key) field.key.style.opacity = '.78';
        if (field.spec) field.spec.style.opacity = '.55';
        if (field.rim) field.rim.style.opacity = '.62';
    }
    field.active = inside;
    field.tx = clamp((ev.clientX - rect.left) / rect.width);
    field.ty = clamp((ev.clientY - rect.top) / rect.height);
    kick();
}

function onPointerLeave(): void {
    if (!field)
        return;
    field.active = false;
    field.tx = 0.5;
    field.ty = 0.32;
    kick();
}

/* ── 弹簧按压：按下压缩、保持、释放回弹（阻尼 + 惯性） ─────────── */
type PressState = { el: HTMLElement; scale: number; target: number; velocity: number; raf: number; downAt: number };

function pressTrace(): number[] {
    const w = window as unknown as { __pressTrace?: number[] };
    if (!w.__pressTrace)
        w.__pressTrace = [];
    return w.__pressTrace;
}

function bindSpring(el: HTMLElement): void {
    if (el.dataset.springBound)
        return;
    el.dataset.springBound = '1';
    const st: PressState = { el, scale: 1, target: 1, velocity: 0, raf: 0, downAt: 0 };
    const trace = pressTrace();
    const K = 320, C = 20;

    const tick = (): void => {
        const dt = 1 / 60;
        const accel = -K * (st.scale - st.target) - C * st.velocity;
        st.velocity += accel * dt;
        st.scale += st.velocity * dt;
        el.style.transform = `scale(${st.scale.toFixed(4)})`;
        trace.push(+st.scale.toFixed(3), Math.round(performance.now()));
        if (trace.length > 600)
            trace.splice(0, trace.length - 600);
        if (Math.abs(st.scale - st.target) < 0.0015 && Math.abs(st.velocity) < 0.02) {
            st.scale = st.target;
            el.style.transform = st.target === 1 ? '' : `scale(${st.target})`;
            st.raf = 0;
            return;
        }
        st.raf = requestAnimationFrame(tick);
    };
    const run = (): void => {
        if (st.raf)
            return;
        st.raf = requestAnimationFrame(tick);
    };
    const down = (ev?: PointerEvent): void => {
        st.downAt = performance.now();
        st.target = 0.955;
        el.classList.add('is-pressed');
        // 不用 pointer capture：capture 会让「拖出后松开」在按钮上合成 click，
        // 直接触发跳页。释放统一由 window 的 pointerup 兜住。
        void ev;
        run();
    };
    const up = (): void => {
        if (!st.downAt)
            return;
        st.downAt = 0;
        st.target = 1;
        st.velocity = 1.9;    // 释放瞬间向上，形成 1–2% 过冲后收敛
        el.classList.remove('is-pressed');
        run();
    };
    el.addEventListener('pointerdown', ev => down(ev), { passive: true });
    el.addEventListener('pointerup', up, { passive: true });
    el.addEventListener('pointercancel', up, { passive: true });
    window.addEventListener('pointerup', up, { passive: true });
    el.addEventListener('pointerleave', ev => {
        if (ev.buttons === 0)
            up();
    }, { passive: true });
    el.addEventListener('keydown', ev => {
        if ((ev.key === 'Enter' || ev.key === ' ') && !ev.repeat)
            down();
    });
    el.addEventListener('keyup', ev => {
        if (ev.key === 'Enter' || ev.key === ' ')
            up();
    });
    el.addEventListener('blur', up);
}

/* ── 指针游光：按钮表面的高光跟着指针移动 ──────────────────────── */
function bindGlint(btn: HTMLElement): void {
    const glint = btn.querySelector<HTMLElement>('.d-glint');
    if (!glint || btn.dataset.glintBound)
        return;
    btn.dataset.glintBound = '1';
    btn.addEventListener('pointermove', ev => {
        if (ev.pointerType === 'touch')
            return;
        const r = btn.getBoundingClientRect();
        glint.style.transform = `translate3d(${(ev.clientX - r.left).toFixed(1)}px, ${(ev.clientY - r.top).toFixed(1)}px, 0)`;
    }, { passive: true });
    btn.addEventListener('pointerleave', () => {
        glint.style.transform = 'translate3d(50%, -40%, 0)';
    }, { passive: true });
}

/* ── 触控落点光：按住的地方有反光（不模拟持续悬停） ─────────────── */
function bindTouchGlow(el: HTMLElement): void {
    if (el.dataset.tapBound)
        return;
    el.dataset.tapBound = '1';
    let tap: HTMLElement | null = null;

    const show = (ev: PointerEvent): void => {
        if (ev.pointerType === 'mouse')
            return;
        if (!tap) {
            tap = document.createElement('i');
            tap.className = 'd-tap';
            tap.setAttribute('aria-hidden', 'true');
        }
        if (tap.parentElement !== el)
            el.appendChild(tap);
        const r = el.getBoundingClientRect();
        const x = Math.round(ev.clientX - r.left);
        const y = Math.round(ev.clientY - r.top);
        tap.style.transform = `translate3d(${x}px, ${y}px, 0) scale(.4)`;
        void tap.offsetWidth;
        tap.style.transform = `translate3d(${x}px, ${y}px, 0) scale(1)`;
        tap.classList.add('is-on');
        el.classList.add('is-pressed');
    };
    const hide = (): void => {
        tap?.classList.remove('is-on');
        el.classList.remove('is-pressed');
    };
    el.addEventListener('pointerdown', show, { passive: true });
    el.addEventListener('pointerup', hide, { passive: true });
    el.addEventListener('pointercancel', hide, { passive: true });
    el.addEventListener('pointerleave', hide, { passive: true });
}

/* ── 呼吸周期：?breath=9|11|15 供 A/B 录屏；缺省用样式表里的 --d-breath ── */
function bindBreath(): void {
    if (typeof location === 'undefined')
        return;
    const v = new URLSearchParams(location.search).get('breath');
    if (v === '9' || v === '11' || v === '15')
        document.documentElement.dataset.breath = v;
}

/* ── 展开 / 收回：高度用弹簧，内容分层滑入 ─────────────────────── */
type ExpandSample = { t: number; row: number; h: number };

function expandTrace(): ExpandSample[] {
    const w = window as unknown as { __expandTrace?: ExpandSample[] };
    if (!w.__expandTrace)
        w.__expandTrace = [];
    return w.__expandTrace;
}

function bindExpand(row: HTMLElement, index: number): void {
    const head = row.querySelector<HTMLElement>('.d-row-head');
    const detail = row.querySelector<HTMLElement>('.d-row-detail');
    if (!head || !detail || row.dataset.expandBound)
        return;
    row.dataset.expandBound = '1';
    head.setAttribute('role', 'button');
    head.setAttribute('tabindex', '0');
    head.setAttribute('aria-expanded', row.classList.contains('is-open') ? 'true' : 'false');

    let raf = 0;
    let h = row.classList.contains('is-open') ? detail.scrollHeight : 0;
    detail.style.height = `${h}px`;

    const animateChildren = (open: boolean): void => {
        const kids = Array.from(detail.children) as HTMLElement[];
        kids.forEach((kid, i) => {
            if (open) {
                kid.animate([
                    { transform: 'translate3d(0,-8px,0)', opacity: 0 },
                    { transform: 'translate3d(0,0,0)', opacity: 1 },
                ], { duration: 300, delay: 26 * i, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' });
            }
            else {
                kid.animate([
                    { transform: 'translate3d(0,0,0)', opacity: 1 },
                    { transform: 'translate3d(0,-4px,0)', opacity: 0 },
                ], { duration: 130, delay: 12 * i, easing: 'cubic-bezier(.4,0,1,1)', fill: 'both' });
            }
        });
    };

    const springTo = (target: number, open: boolean): void => {
        if (raf)
            cancelAnimationFrame(raf);
        const K = open ? 210 : 300, C = open ? 24 : 30;
        let v = 0;
        const trace = expandTrace();
        const tick = (): void => {
            const dt = 1 / 60;
            v += (-K * (h - target) - C * v) * dt;
            h += v * dt;
            if (open)
                h = Math.min(h, target + 0.6);
            detail.style.height = `${Math.max(0, h).toFixed(2)}px`;
            trace.push({ t: Math.round(performance.now()), row: index, h: +h.toFixed(1) });
            if (trace.length > 1200)
                trace.splice(0, trace.length - 1200);
            if (Math.abs(h - target) < 0.4 && Math.abs(v) < 12) {
                detail.style.height = open ? 'auto' : '0px';
                raf = 0;
                return;
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
    };

    const toggle = (): void => {
        const open = !row.classList.contains('is-open');
        row.classList.toggle('is-open', open);
        head.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (!livingAllowed()) {
            detail.style.height = open ? 'auto' : '0px';
            return;
        }
        const current = detail.getBoundingClientRect().height;
        detail.style.height = 'auto';
        const natural = detail.scrollHeight;
        detail.style.height = `${current}px`;
        h = current;
        animateChildren(open);
        springTo(open ? natural : 0, open);
    };
    // 整行都是可点面：点标题、留白、右侧箭头都能切换；
    // 只有展开区里的操作按钮不触发切换。
    row.addEventListener('click', ev => {
        const t = ev.target as HTMLElement;
        if (t.closest('button[data-task-start],button[data-task-skip],button[data-task-delay],button[data-task-replace]'))
            return;
        if (t.closest('.d-row-detail'))
            return;
        toggle();
    });
    head.addEventListener('keydown', ev => {
        if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            toggle();
        }
    });
}

/** 数字变化时给一个短促的“落位”反馈（真实数字仍来自渲染值）。 */
function popNumbers(root: ParentNode): void {
    if (!livingAllowed())
        return;
    root.querySelectorAll<HTMLElement>('[data-odometer]').forEach(el => {
        if (el.dataset.popBound)
            return;
        el.dataset.popBound = '1';
        const mo = new MutationObserver(() => {
            el.animate([
                { transform: 'translate3d(0, 6px, 0)', opacity: .55 },
                { transform: 'translate3d(0, 0, 0)', opacity: 1 },
            ], { duration: 420, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
        });
        mo.observe(el, { childList: true, characterData: true, subtree: true });
    });
}

export function startLiving(root: ParentNode = document): void {
    if (!livingAllowed())
        return;
    const stage = root.querySelector<HTMLElement>('.d-stage');
    const page = root.querySelector<HTMLElement>('.d-page');
    if (!stage || !page)
        return;
    if (!field || field.stage !== stage) {
        field = {
            stage,
            glare: stage.querySelector<HTMLElement>('.d-glare'),
            key: stage.querySelector<HTMLElement>('.d-key'),
            spec: stage.querySelector<HTMLElement>('.d-spec'),
            rim: stage.querySelector<HTMLElement>('.d-rim'),
            px: 0.5, py: 0.32, tx: 0.5, ty: 0.32,
            w: stage.getBoundingClientRect().width || 1,
            h: stage.getBoundingClientRect().height || 1,
            active: false, raf: 0,
        };
    }
    root.querySelectorAll<HTMLElement>('[data-spring]').forEach(bindSpring);
    root.querySelectorAll<HTMLElement>('.d-cta').forEach(bindGlint);
    root.querySelectorAll<HTMLElement>('[data-expand].d-row').forEach((r, i) => bindExpand(r, i));
    root.querySelectorAll<HTMLElement>('.d-row, .d-cta, .d-row-actions button, .d-quiet').forEach(bindTouchGlow);
    bindBreath();
    popNumbers(root);

    if (!bound) {
        bound = true;
        window.addEventListener('pointermove', onPointerMove, { passive: true });
        document.addEventListener('pointerleave', onPointerLeave, { passive: true });
        const sync = (): void => {
            if (document.hidden) {
                idleClass(true);
                if (field?.raf) {
                    cancelAnimationFrame(field.raf);
                    field.raf = 0;
                }
            }
            else {
                idleClass(false);
                kick();
            }
        };
        document.addEventListener('visibilitychange', sync);
        sync();
        // 不监听 window blur：无头浏览器/截图会话里窗口从不获得焦点，会把呼吸永久暂停。
    }
    if (typeof ResizeObserver === 'function' && !resizeObserver) {
        resizeObserver = new ResizeObserver(() => kick());
        resizeObserver.observe(stage);
    }
    if (typeof IntersectionObserver === 'function' && !stageObserver) {
        // 首次回调可能发生在布局前（isIntersecting=false），不能据此暂停，
        // 否则无头截图/录屏会话里的呼吸会被永久冻结。
        let seenVisible = false;
        stageObserver = new IntersectionObserver(entries => {
            for (const e of entries) {
                if (e.isIntersecting) { seenVisible = true; idleClass(false); }
                else if (seenVisible) idleClass(true);
            }
        }, { threshold: 0.05 });
        stageObserver.observe(stage);
    }
    kick();
}

export function stopLiving(): void {
    if (field?.raf)
        cancelAnimationFrame(field.raf);
    field = null;
}
