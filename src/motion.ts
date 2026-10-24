// —— Phase 15 · Motion layer ——
// 只做四件事：入场阶梯、共享元素页面过渡、真实数值计量、定向高光。
// 铁律：动画只走 transform / opacity；不拦截真实操作；reduced-motion 下全部退化为静态。

/** 系统是否允许动效（reduced-motion 优先，绝不覆盖用户设置） */
export function motionAllowed(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function')
        return false;
    try {
        return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    catch {
        return false;
    }
}

/** 在 <html> 上标记动效可用性。CSS 里所有入场动画都以 .motion-ok 为前提：
 *  JS 失败 / 被禁用时内容仍然完整可见（不会留下隐藏内容）。 */
export function markMotionSupport(): void {
    if (typeof document === 'undefined')
        return;
    document.documentElement.classList.toggle('motion-ok', motionAllowed());
}

const STAGGER_LIMIT = 8;
/** Stagger Cascade：短促、有限。只处理每组前 8 项——长列表不播长入场。 */
export function staggerIn(root: ParentNode = document): void {
    if (!motionAllowed())
        return;
    root.querySelectorAll<HTMLElement>('[data-stagger]').forEach(group => {
        const items = Array.from(group.children).slice(0, STAGGER_LIMIT) as HTMLElement[];
        items.forEach((el, i) => {
            el.style.setProperty('--i', String(i));
            el.classList.add('stagger-item');
        });
        requestAnimationFrame(() => requestAnimationFrame(() => {
            items.forEach(el => el.classList.add('is-in'));
        }));
    });
}

const counterValues = new Map<string, number>();

/** Snap Odometer：以上一次真实渲染值为起点，计量到本次真实值。
 *  只读 [data-odometer]（真实数字）与 [data-odometer-key]（稳定键），绝不推测/生成数据。 */
export function animateCounters(root: ParentNode = document, duration = 520): void {
    if (typeof document === 'undefined')
        return;
    root.querySelectorAll<HTMLElement>('[data-odometer]').forEach(el => {
        const key = el.dataset.odometerKey ?? el.dataset.odometer ?? '';
        const to = Number(el.dataset.odometer);
        if (!Number.isFinite(to) || !key) {
            el.textContent = '—';
            return;
        }
        const from = counterValues.get(key);
        counterValues.set(key, to);
        if (from === undefined || from === to || !motionAllowed()) {
            el.textContent = String(to);
            return;
        }
        const start = performance.now();
        const tick = (now: number): void => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            el.textContent = String(Math.round(from + (to - from) * eased));
            if (t < 1)
                requestAnimationFrame(tick);
            else
                el.textContent = String(to);
        };
        requestAnimationFrame(tick);
    });
}

const SPECULAR_MIN = 0.0;
let specularBound = false;
/** Interaction Light：单一光源方向上的高光随指针微移。
 *  只改变叠加高光的位置（背景层），不移动任何文字、不改变点击区域。 */
export function bindSpecular(): void {
    if (specularBound || typeof document === 'undefined')
        return;
    specularBound = true;
    let raf = 0;
    let last: { el: HTMLElement; x: number; y: number } | null = null;
    document.addEventListener('pointermove', event => {
        if (!motionAllowed() || event.pointerType === 'touch')
            return;
        const target = (event.target as HTMLElement | null)?.closest?.('[data-specular]') as HTMLElement | null;
        if (!target)
            return;
        last = { el: target, x: event.clientX, y: event.clientY };
        if (raf)
            return;
        raf = requestAnimationFrame(() => {
            raf = 0;
            if (!last)
                return;
            const rect = last.el.getBoundingClientRect();
            if (!rect.width || !rect.height)
                return;
            const px = Math.max(0, Math.min(1, (last.x - rect.left) / rect.width));
            const py = Math.max(0, Math.min(1, (last.y - rect.top) / rect.height));
            last.el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
            last.el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
            last.el.style.setProperty('--specular', String(Math.max(SPECULAR_MIN, 0.65)));
        });
    }, { passive: true });
    document.addEventListener('pointerleave', () => {
        document.querySelectorAll<HTMLElement>('[data-specular]').forEach(el => el.style.setProperty('--specular', '0'));
    }, { passive: true });
}

/** 每次 render 之后统一初始化（幂等，不重复绑定） */
export function afterRender(root: ParentNode = document): void {
    markMotionSupport();
    staggerIn(root);
    animateCounters(root);
    bindSpecular();
}
