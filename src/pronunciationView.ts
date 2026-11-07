import type { Pronunciation, PronunciationLocale } from './pronunciation.ts';
import { esc } from './ui.ts';
let active: Pronunciation | null = null;
let activeDocument: Document | null = null;
let disposeInstalled: (() => void) | null = null;
const speaker = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z"/><path d="M15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/></svg>';
export function speechControls(text: string): string {
    return `<span class="pronunciation" data-pronunciation><button type="button" data-speak="${esc(text)}" aria-label="朗读已显示的英文：${esc(text)}" title="朗读 / 重新播放">${speaker}</button><button type="button" data-speech-stop aria-label="停止朗读" title="停止朗读" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6h12v12H6Z"/></svg></button></span>`;
}
export function refreshPronunciationUI() {
    if (!active || !activeDocument) return;
    activeDocument.querySelectorAll<HTMLButtonElement>('[data-speech-stop]').forEach(b => b.disabled = active!.state === 'idle');
    const note = activeDocument.querySelector('#pronunciation-voice'); if (note) note.textContent = active.description();
}
export function stopPronunciation() { active?.stop(); }
export function installPronunciation(doc: Document, controller: Pronunciation): () => void {
    disposeInstalled?.(); active = controller; activeDocument = doc;
    const click = (e: Event) => {
        const b = (e.target as Element)?.closest?.('button[data-speak],button[data-speech-stop]') as HTMLButtonElement | null;
        if (!b || b.disabled) return;
        if (b.hasAttribute('data-speak')) controller.play(b.dataset.speak!); else controller.stop();
        refreshPronunciationUI();
    };
    const close = () => controller.stop();
    const hidden = () => { if (doc.hidden) controller.stop(); };
    doc.addEventListener('click', click); doc.addEventListener('close', close, true); doc.addEventListener('visibilitychange', hidden);
    doc.defaultView?.addEventListener('pagehide', close); refreshPronunciationUI();
    const dispose = () => { doc.removeEventListener('click', click); doc.removeEventListener('close', close, true); doc.removeEventListener('visibilitychange', hidden); doc.defaultView?.removeEventListener('pagehide', close); controller.stop(); if (active === controller) { active = null; activeDocument = null; disposeInstalled = null; } };
    disposeInstalled = dispose; return dispose;
}
export function pronunciationPanel(locale: PronunciationLocale): string {
    return `<section class="panel"><h2>单词发音</h2><label>英语口音偏好<select id="pronunciation-locale"><option value="en-US" ${locale === 'en-US' ? 'selected' : ''}>美式英语 en-US</option><option value="en-GB" ${locale === 'en-GB' ? 'selected' : ''}>英式英语 en-GB</option></select></label><p id="pronunciation-voice" role="status"></p><p>试听 hello ${speechControls('hello')}</p><p class="hint">使用浏览器原生语音，优先本地英语，再按口音偏好选择；缺少对应本地口音会注明回退。自然音质和多词性读音取决于系统，不能保证词典真人发音质量。联网语音会注明，可能需要网络。播放不产生学习证据。</p></section>`;
}
