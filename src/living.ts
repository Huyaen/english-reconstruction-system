// —— Phase 15d · Living surfaces ——
// 一套很小的动态系统：指针光场 / 弹簧按压 / 呼吸暂停 / 展开与收回。
// 约束：
//  1) 只写 transform / opacity 与 CSS 变量；文字与点击区域永远不动。
//  2) 只有一个 rAF 循环，且只在指针位于舞台内或动效进行中运行；页面隐藏即停。
//  3) reduced-motion 下一律不启动（CSS 也把持续动画关掉）。

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

interface Field {
    stage: HTMLElement;
    glare: HTMLElement | null;
    lights: HTMLElement | null;
    targetX: number;
    targetY: number;
    x: number;
    y: number;
    w: number;
    h: number;
    lastGx: number;
    lastGy: number;
    active: boolean;
    raf: number;
}

let field: Field | null = null;
let bound = false;
let resizeObserver: ResizeObserver | null = null;

function measure(f: Field): void {
    const rect = f.stage.getBoundingClientRect();
    f.w = rect.width || 1;
    f.h = rect.height || 1;
}

function frame(): void {
    if (!field)
        return;
    const f = field;
    const k = f.active ? 0.16 : 0.08;
    f.x = lerp(f.x, f.targetX, k);
    f.y = lerp(f.y, f.targetY, k);
    const gx = f.x * f.w;
    const gy = f.y * f.h;
    // 只在真的移动超过 0.2px 时写样式，避免无意义的样式失效
    if (f.glare && (Math.abs(gx - f.lastGx) > 0.2 || Math.abs(gy - f.lastGy) > 0.2)) {
        f.lastGx = gx;
        f.lastGy = gy;
        f.glare.style.transform = `translate3d(${gx.toFixed(1)}px, ${gy.toFixed(1)}px, 0)`;
    }
    if (f.glare)
        f.glare.style.opacity = f.active ? '0.92' : '0.12';
    if (f.lights) {
        const tx = ((0.5 - f.x) * 3.4).toFixed(2);
        const ty = ((f.y - 0.5) * 3.4).toFixed(2);
        f.lights.style.transform = `perspective(1200px) rotateX(${ty}deg) rotateY(${tx}deg)`;
    }
    const settled = Math.abs(f.x - f.targetX) < 0.0015 && Math.abs(f.y - f.targetY) < 0.0015;
    if (settled && !f.active) {
        f.raf = 0;
        return;
    }
    f.raf = requestAnimationFrame(frame);
}

function kick(): void {
    if (!field || field.raf)
        return;
    field.raf = requestAnimationFrame(frame);
}

function onPointerMove(ev: PointerEvent): void {
    if (!field || ev.pointerType === 'touch')
        return;
    const rect = field.stage.getBoundingClientRect();
    if (!rect.width || !rect.height)
        return;
    if (Math.abs(rect.width - field.w) > 1 || Math.abs(rect.height - field.h) > 1) {
        field.w = rect.width;
        field.h = rect.height;
    }
    const inside = ev.clientX >= rect.left - 40 && ev.clientX <= rect.right + 40
        && ev.clientY >= rect.top - 40 && ev.clientY <= rect.bottom + 60;
    field.active = inside;
    field.targetX = clamp((ev.clientX - rect.left) / rect.width);
    field.targetY = clamp((ev.clientY - rect.top) / rect.height);
    kick();
}

function onPointerLeave(): void {
    if (!field)
        return;
    field.active = false;
    field.targetX = 0.5;
    field.targetY = 0.34;
    kick();
}

/** 弹簧按压：按下压缩，松开回弹；不改变按钮语义，不阻止点击。 */
function bindSpring(el: HTMLElement): void {
    if (el.dataset.springBound)
        return;
    el.dataset.springBound = '1';
    let downAt = 0;
    const down = (): void => {
        downAt = performance.now();
        el.animate([
            { transform: 'scale(1)' },
            { transform: 'scale(.962)' },
        ], { duration: 110, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' });
    };
    const up = (): void => {
        const held = performance.now() - downAt;
        el.animate([
            { transform: 'scale(.962)' },
            { transform: 'scale(1.014)' },
            { transform: 'scale(1)' },
        ], { duration: Math.min(520, 260 + held * 0.25), easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', fill: 'forwards' });
    };
    el.addEventListener('pointerdown', down, { passive: true });
    el.addEventListener('pointerup', up, { passive: true });
    el.addEventListener('pointercancel', up, { passive: true });
    el.addEventListener('pointerleave', ev => {
        if (ev.buttons === 0)
            up();
    }, { passive: true });
}

/** 展开 / 收回：行内详情用高度 + 位移，收回时先淡出再收高度。 */
function bindExpand(row: HTMLElement): void {
    const head = row.querySelector<HTMLElement>('.d-row-head');
    const detail = row.querySelector<HTMLElement>('.d-row-detail');
    if (!head || !detail || row.dataset.expandBound)
        return;
    row.dataset.expandBound = '1';
    head.setAttribute('role', 'button');
    head.setAttribute('tabindex', '0');
    head.setAttribute('aria-expanded', row.classList.contains('is-open') ? 'true' : 'false');
    const toggle = (): void => {
        const open = !row.classList.contains('is-open');
        row.classList.toggle('is-open', open);
        head.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (!livingAllowed()) {
            detail.style.height = open ? 'auto' : '0px';
            return;
        }
        const from = open ? 0 : detail.scrollHeight;
        const to = open ? detail.scrollHeight : 0;
        detail.style.height = `${from}px`;
        detail.style.overflow = 'hidden';
        const anim = detail.animate(
            [{ height: `${from}px` }, { height: `${to}px` }],
            { duration: open ? 340 : 240, easing: open ? 'cubic-bezier(0.16, 1, 0.3, 1)' : 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
        );
        anim.onfinish = () => {
            detail.style.height = open ? 'auto' : '0px';
            detail.style.overflow = '';
        };
    };
    head.addEventListener('click', ev => {
        // 点行内按钮时不触发展开
        if ((ev.target as HTMLElement).closest('button[data-task-start],button[data-task-skip],button[data-task-delay],button[data-task-replace]'))
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

/** 数字变化时给一个短促的“落位”反馈（真实数字仍来自上一次渲染值）。 */
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
            lights: stage.querySelector<HTMLElement>('.d-lights'),
            targetX: 0.5, targetY: 0.34, x: 0.5, y: 0.34,
            w: stage.getBoundingClientRect().width || 1,
            h: stage.getBoundingClientRect().height || 1,
            lastGx: -1, lastGy: -1,
            active: false, raf: 0,
        };
    }
    root.querySelectorAll<HTMLElement>('[data-spring]').forEach(bindSpring);
    root.querySelectorAll<HTMLElement>('[data-expand].d-row').forEach(bindExpand);
    popNumbers(root);

    if (!bound) {
        bound = true;
        window.addEventListener('pointermove', onPointerMove, { passive: true });
        document.addEventListener('pointerleave', onPointerLeave, { passive: true });
        document.addEventListener('visibilitychange', () => {
            if (!field)
                return;
            if (document.hidden) {
                if (field.raf) {
                    cancelAnimationFrame(field.raf);
                    field.raf = 0;
                }
            }
            else {
                kick();
            }
        });
    }
    if (typeof ResizeObserver === 'function' && !resizeObserver) {
        resizeObserver = new ResizeObserver(() => kick());
        resizeObserver.observe(stage);
    }
    kick();
}

export function stopLiving(): void {
    if (field?.raf)
        cancelAnimationFrame(field.raf);
    field = null;
}
