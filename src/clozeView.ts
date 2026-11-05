import type { ClozeAttempt } from './types.ts';
import type { ClozeQuestion } from './readingCloze.ts';
import { clozeAttempt } from './readingCloze.ts';
import { uid } from './core.ts';
import { esc, pct } from './ui.ts';
export class ClozePractice {
    private index = 0; private busy = false; private assisted = false; private submitted = false;
    private started = performance.now(); private completed = false; private sessionId = uid();
    private attempts: ClozeAttempt[] = []; private firstCount: number;
    constructor(private queue: ClozeQuestion[], private root: HTMLElement, private save: (a: ClozeAttempt) => Promise<void>, private finish: (id: string) => void,
        private exit: () => void, private source: (q: ClozeQuestion) => void, private current: () => boolean, private excluded: number) { this.queue = [...queue]; this.firstCount = queue.length; }
    render() {
        if (!this.current()) return;
        if (this.index >= this.queue.length) { this.result(); return; }
        const q = this.queue[this.index], retry = this.index >= this.firstCount;
        this.root.innerHTML = `<div class="quiz-top"><button id="cloze-exit" class="text-button">结束并返回</button><span>${this.index + 1} / ${this.queue.length}${retry ? ' · 辅助重练' : ''}</span></div><section class="quiz-card"><h1>阅读原句填空</h1><p id="cloze-sentence" class="question">${esc(q.masked)}</p><p id="cloze-definition">${esc(q.zh)} ${esc(q.pos)}</p><p>请回忆标记过的原文词形，大小写、连字符和撇号参与判定。</p><form id="cloze-form"><label for="cloze-input">输入原句中的英文形式</label><input id="cloze-input" maxlength="500" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false"><div class="actions"><button id="cloze-submit" type="submit" class="primary">提交 Enter</button><button id="cloze-hint" type="button" class="secondary">词头提示（辅助）</button><button id="cloze-reveal" type="button" class="secondary">查看答案（辅助）</button></div></form><div id="cloze-feedback" role="status" aria-live="polite"></div><button id="cloze-source" class="text-button">回到阅读原文（结束本轮）</button><p class="hint">仅来自已保存阅读标记，已排除 ${this.excluded} 条不可靠题目。释义过滤不能识别词库外所有同义表达；本题按已保存原文作答。每题提交后保存；退出或刷新结束本轮，未提交输入不记成绩。记录独立保存，不改变 FSRS 或选择题记录。</p></section>`;
        this.assisted = retry; this.submitted = false; this.started = performance.now();
        const input = this.root.querySelector<HTMLInputElement>('#cloze-input')!;
        input.onkeydown = e => { if (e.key === 'Enter' && e.isComposing) { e.preventDefault(); e.stopPropagation(); } };
        this.root.querySelector<HTMLFormElement>('#cloze-form')!.onsubmit = e => { e.preventDefault(); void this.submit(input.value); };
        for (const [id, text] of [['cloze-hint', `词头：${q.lemma}。本题记为辅助作答。`], ['cloze-reveal', `原文词形：${q.expected}。本题记为辅助作答。`]]) this.root.querySelector<HTMLButtonElement>(`#${id}`)!.onclick = () => { if (this.busy || this.submitted) return; this.assisted = true; this.root.querySelector('#cloze-feedback')!.textContent = text; input.focus(); };
        this.root.querySelector<HTMLButtonElement>('#cloze-exit')!.onclick = () => { if (!this.busy) this.exit(); };
        this.root.querySelector<HTMLButtonElement>('#cloze-source')!.onclick = () => { if (!this.busy) this.source(q); };
        input.focus();
    }
    private async submit(input: string) {
        if (this.busy || this.submitted || !this.current()) return;
        const feedback = this.root.querySelector('#cloze-feedback')!;
        if (!input.trim()) { feedback.textContent = '请先输入原文词形。'; return; }
        this.busy = true; const q = this.queue[this.index];
        const attempt = clozeAttempt(q, input, this.sessionId, this.assisted, this.index >= this.firstCount, performance.now() - this.started);
        this.root.querySelector<HTMLButtonElement>('#cloze-submit')!.disabled = true;
        try {
            await this.save(attempt); this.attempts.push(attempt); this.submitted = true;
            if (!this.current()) return;
            this.root.querySelector<HTMLInputElement>('#cloze-input')!.disabled = true;
            feedback.innerHTML = `<p class="${attempt.correct ? 'green' : 'error'}">${attempt.assisted ? '辅助作答 · ' : ''}${attempt.correct ? '原文词形正确' : '与原文词形不同'} · 标准答案：${esc(q.expected)}</p><button id="cloze-next" class="primary">下一题 / 查看结果</button>${!attempt.correct ? '<button id="cloze-retry" class="secondary">加入错词重练（辅助）</button>' : ''}`;
            this.root.querySelector<HTMLButtonElement>('#cloze-next')!.onclick = () => { if (this.busy) return; this.index++; this.render(); };
            const retry = this.root.querySelector<HTMLButtonElement>('#cloze-retry'); if (retry) retry.onclick = () => { this.queue.push(q); retry.disabled = true; };
            this.root.querySelector<HTMLButtonElement>('#cloze-next')!.focus();
        } catch (e) { if (this.current()) { feedback.textContent = `本题未保存，请重试：${e instanceof Error ? e.message : String(e)}`; this.root.querySelector<HTMLButtonElement>('#cloze-submit')!.disabled = false; } }
        finally { this.busy = false; }
    }
    private result() {
        if (!this.completed) { this.completed = true; this.finish(this.sessionId); }
        const first = this.attempts.filter(a => !a.retry), correct = first.filter(a => a.correct && !a.assisted), wrong = first.filter(a => !a.correct || a.assisted);
        this.root.innerHTML = `<section class="quiz-card"><h1>原句填空完成</h1><p>首次独立正确率：${pct(correct.length / Math.max(1, first.length))}（${correct.length} / ${first.length}）</p><p>辅助 ${first.filter(a => a.assisted).length} 题 · 重练 ${this.attempts.filter(a => a.retry).length} 次；均不提高首次独立正确数。</p><h2>错词与辅助作答</h2><ul>${wrong.map(a => `<li>${esc(a.expected)} · 你的输入：${esc(a.input)} · ${a.assisted ? '辅助' : '与原文不同'}</li>`).join('')}</ul><button id="cloze-home" class="primary">返回首页</button><p>独立语境证据已保存，未改写旧 FSRS、掌握度或 ReviewRecord。</p></section>`;
        this.root.querySelector<HTMLButtonElement>('#cloze-home')!.onclick = this.exit;
    }
}
