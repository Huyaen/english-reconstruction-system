export type PronunciationLocale = 'en-US' | 'en-GB';
export function selectEnglishVoice(voices: SpeechSynthesisVoice[], locale: PronunciationLocale): SpeechSynthesisVoice | null {
    const lang = (v: SpeechSynthesisVoice) => v.lang.replace(/_/g, '-').toLowerCase();
    const score = (v: SpeechSynthesisVoice) => (v.localService ? 1000 : 0) + (lang(v) === locale.toLowerCase() ? 100 : 0)
        + (/natural|neural|premium|enhanced/i.test(v.name) ? 30 : 0) + (v.default ? 5 : 0);
    return [...voices].filter(v => /^en(?:-|$)/i.test(lang(v))).sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name) || a.voiceURI.localeCompare(b.voiceURI))[0] ?? null;
}
export class Pronunciation {
    state: 'idle' | 'starting' | 'speaking' = 'idle';
    private epoch = 0;
    private current: SpeechSynthesisUtterance | null = null;
    private startTimer?: ReturnType<typeof setTimeout>;
    private endTimer?: ReturnType<typeof setTimeout>;
    private voicesChanged = () => this.changed();
    constructor(private synth: SpeechSynthesis | undefined, private create: (text: string) => SpeechSynthesisUtterance,
        private notify: (message: string) => void, public locale: PronunciationLocale = 'en-US', private changed: () => void = () => {}) {
        this.synth?.addEventListener('voiceschanged', this.voicesChanged);
    }
    description(): string {
        if (!this.synth) return '当前浏览器不支持原生朗读。';
        try {
            const v = selectEnglishVoice(this.synth.getVoices(), this.locale);
            return v ? `${v.name} · ${v.lang} · ${v.localService ? '本地语音' : '系统联网语音'}${v.lang.toLowerCase() !== this.locale.toLowerCase() ? '（英语口音回退）' : ''}`
                : '尚未获取英语语音；可稍后重试，或在系统语音设置中安装英语语音。';
        } catch (e) { return `语音加载失败：${e instanceof Error ? e.message : String(e)}`; }
    }
    setLocale(locale: PronunciationLocale) { this.stop(); this.locale = locale; this.changed(); }
    private clearTimers() { clearTimeout(this.startTimer); clearTimeout(this.endTimer); this.startTimer = this.endTimer = undefined; }
    stop(): boolean {
        this.epoch++; this.clearTimers();
        try { if (this.current) this.synth?.cancel(); this.current = null; this.state = 'idle'; this.changed(); return true; }
        catch (e) { this.notify(`系统未能停止朗读：${e instanceof Error ? e.message : String(e)}`); return false; }
    }
    play(text: string) {
        if (!this.stop()) return;
        if (!this.synth) { this.notify('当前浏览器不支持原生朗读。'); return; }
        if (!text.trim() || text.length > 500) { this.notify('词条为空或过长，无法朗读。'); return; }
        try {
            const voice = selectEnglishVoice(this.synth.getVoices(), this.locale);
            if (!voice) { this.notify('尚未获取英语语音。请稍候重试，或在系统语音设置中安装英语语音。'); return; }
            if (voice.lang.toLowerCase() !== this.locale.toLowerCase() || !voice.localService) this.notify(`本次使用 ${voice.lang} · ${voice.localService ? '本地语音' : '系统联网语音'}：${voice.name}`);
            const utterance = this.create(text), token = this.epoch;
            utterance.voice = voice; utterance.lang = voice.lang; utterance.rate = 1; utterance.pitch = 1;
            this.current = utterance; this.state = 'starting'; this.changed();
            const valid = () => token === this.epoch && this.current === utterance;
            const finish = (message: string) => { if (!valid()) return; this.clearTimers(); this.current = null; this.state = 'idle'; this.changed(); this.notify(message); };
            const timeout = () => { if (valid()) { this.stop(); this.notify('系统朗读超时，未确认播放完成；请重试或检查英语语音。'); } };
            utterance.onstart = () => {
                if (!valid() || this.state !== 'starting') return;
                clearTimeout(this.startTimer); this.startTimer = undefined; this.state = 'speaking'; this.changed();
                this.notify(`正在朗读 · ${voice.name}`);
                this.endTimer = setTimeout(timeout, Math.min(90000, 10000 + text.length * 250));
            };
            utterance.onend = () => finish(this.state === 'speaking' ? '朗读结束。' : '系统未确认开始朗读，请检查英语语音。');
            utterance.onerror = e => finish(`朗读失败：${e.error}。请重试或检查系统英语语音。`);
            this.startTimer = setTimeout(timeout, 7000);
            this.synth.speak(utterance);
        } catch (e) { this.stop(); this.notify(`朗读失败：${e instanceof Error ? e.message : String(e)}`); }
    }
    destroy() { this.stop(); this.synth?.removeEventListener('voiceschanged', this.voicesChanged); }
}
