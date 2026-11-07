export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export const $ = <T extends HTMLElement = HTMLElement>(q: string) => document.querySelector<T>(q)!;
/** 百分比：一律取整。一位小数会让 11 次作答的 27.3% 看起来像精确测量。 */
export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const seconds = (v: number) => `${(v / 1000).toFixed(2)} 秒`;
export const date = (v: number) => v ? new Date(v).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '尚未测试';
export function toast(text: string) { $('#toast').textContent = text; $('#toast').classList.add('show'); setTimeout(() => $('#toast').classList.remove('show'), 5000); }
export function download(blob: Blob, name: string) { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000); }
export function modal(html: string) {
    const d = $<HTMLDialogElement>('#modal');
    d.innerHTML = `<button class="close" aria-label="关闭">×</button>${html}`;
    const heading = d.querySelector('h1, h2, h3');
    if (heading) {
        heading.id ||= 'modal-title';
        d.setAttribute('aria-labelledby', heading.id);
    }
    else {
        d.removeAttribute('aria-labelledby');
    }
    d.querySelector('.close')!.addEventListener('click', () => d.close());
    if (!d.open)
        d.showModal();
    return d;
}
export function closeModal() { $<HTMLDialogElement>('#modal').close(); }
export function on(id: string, event: string, fn: (e: Event) => unknown) {
    document.querySelector(id)?.addEventListener(event, e => {
        try {
            Promise.resolve(fn(e)).catch(error => toast(error instanceof Error ? error.message : String(error)));
        }
        catch (error) {
            toast(error instanceof Error ? error.message : String(error));
        }
    });
}
