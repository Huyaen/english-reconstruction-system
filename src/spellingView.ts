import { speechControls, stopPronunciation } from './pronunciationView.ts';
import type { SpellingAttempt, Word } from './types.ts';
import { spellingAttempt } from './spelling.ts';
import { esc, pct } from './ui.ts';
import { uid } from './core.ts';

/** 单轮页面复用既有 quiz-card；外部负责范围队列、独立证据保存和导航。 */
export class SpellingPractice {
    private index = 0;
    private assisted = false;
    private retry = false;
    private busy = false;
    private submitted: SpellingAttempt | null = null;
    private started = performance.now();
    private attempts: SpellingAttempt[] = [];
    private assistedRound = false;
    private queue: Word[];
    private firstCount: number;
    constructor(words: Word[], private sessionId: string, private root: HTMLElement, private save: (a: SpellingAttempt) => Promise<void>, private completed: (id: string) => void, private exit: () => void, private isCurrent: () => boolean, private excludedCount: number, assistedRound = false) {
        this.queue = [...words]; this.firstCount = words.length; this.assistedRound = assistedRound;
    }
    render() {
        stopPronunciation();
        if (!this.isCurrent()) return;
        if (this.index >= this.queue.length) { this.result(); return; }
        const word = this.queue[this.index];
        this.root.innerHTML = `<div class="quiz-top"><button id="spelling-exit" class="text-button">结束并返回</button><span>${this.index + 1} / ${this.queue.length}${this.retry ? ' · 错词重练' : ''}${this.assistedRound ? ' · 刚查看词条，辅助巩固' : ''}</span></div><section class="quiz-card"><h1>拼写练习</h1><p class="question" id="spelling-prompt">${esc(word.zh)}</p>${word.pos ? `<p class="subtle">词性：${esc(word.pos)}</p>` : ''}<form id="spelling-form"><label for="spelling-input">输入英文单词或短语</label><input id="spelling-input" name="spelling" type="text" maxlength="500" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-describedby="spelling-rules"><div class="actions"><button type="submit" class="primary" id="spelling-submit">提交 <kbd>Enter</kbd></button><button type="button" class="secondary" id="spelling-reveal">查看标准拼写（辅助作答）</button></div></form><div id="spelling-feedback" role="status" aria-live="polite"></div><p id="spelling-rules" class="hint">大小写参与判定；首尾及连续空白会合并，弯撇号统一为直撇号。连字符、其他标点和词序必须一致。本模式单独记录，不改变原复习计划或掌握度。</p><p class="hint">已排除 ${this.excludedCount} 个歧义或不适用词条。判重依据词库中已有释义，无法识别所有同义表达。</p></section>`;
        const input = this.root.querySelector<HTMLInputElement>('#spelling-input')!;
        input.addEventListener('keydown', e => { if (e.key === 'Enter' && e.isComposing) { e.preventDefault(); e.stopPropagation(); } });
        this.root.querySelector<HTMLFormElement>('#spelling-form')!.onsubmit = e => { e.preventDefault(); void this.submit(input.value); };
        this.root.querySelector<HTMLButtonElement>('#spelling-reveal')!.onclick = () => {
            if (this.busy || this.submitted) return;
            this.assisted = true;
            this.root.querySelector('#spelling-feedback')!.innerHTML = `标准拼写：${esc(word.en)}。本题已标记为辅助作答。${speechControls(word.en)}`;
            input.focus();
        };
        this.root.querySelector<HTMLButtonElement>('#spelling-exit')!.onclick = () => { if (!this.busy) this.exit(); };
        this.started = performance.now(); input.focus();
    }
    private async submit(value: string) {
        if (this.busy || this.submitted || !this.isCurrent()) return;
        const target = this.root.querySelector('#spelling-feedback')!;
        if (!value.trim()) { target.textContent = '请先输入拼写，或查看标准拼写后辅助作答。'; return; }
        this.busy = true;
        const word = this.queue[this.index];
        const attempt = spellingAttempt(word, value, this.sessionId, this.assisted || this.retry || this.assistedRound, this.retry, performance.now() - this.started);
        this.root.querySelector<HTMLButtonElement>('#spelling-submit')!.disabled = true;
        try {
            await this.save(attempt);
            this.attempts.push(attempt); this.submitted = attempt;
            if (!this.isCurrent()) return;
            const input = this.root.querySelector<HTMLInputElement>('#spelling-input')!; input.disabled = true;
            this.root.querySelector<HTMLButtonElement>('#spelling-reveal')!.disabled = true;
            target.innerHTML = `<p class="${attempt.correct ? 'green' : 'error'}">${attempt.assisted ? '辅助作答 · ' : ''}${attempt.correct ? '拼写正确' : '拼写有误'} · 标准拼写：<strong>${esc(word.en)}</strong>${speechControls(word.en)}</p><div class="actions"><button id="spelling-next" class="primary">${this.index + 1 >= this.queue.length ? '查看本轮结果' : '下一题'}</button>${!attempt.correct ? '<button id="spelling-retry" class="secondary">本轮结束后重练此词</button>' : ''}</div>`;
            this.root.querySelector<HTMLButtonElement>('#spelling-next')!.onclick = () => this.next();
            const retry = this.root.querySelector<HTMLButtonElement>('#spelling-retry');
            if (retry) retry.onclick = () => { this.queue.push(word); retry.disabled = true; retry.textContent = '已加入错词重练（辅助）'; };
            this.root.querySelector<HTMLButtonElement>('#spelling-next')!.focus();
        }
        catch (e) {
            if (this.isCurrent()) { target.textContent = `本题未保存，请重试：${e instanceof Error ? e.message : String(e)}`; this.root.querySelector<HTMLButtonElement>('#spelling-submit')!.disabled = false; }
        }
        finally { this.busy = false; }
    }
    private next() { if (!this.submitted || this.busy) return; this.index++; this.retry = this.index >= this.firstCount; this.assisted = false; this.submitted = null; this.render(); }
    private result() {
        const first = this.attempts.filter(a => !a.retry);
        const correct = first.filter(a => a.correct && !a.assisted).length;
        const missed = first.filter(a => !a.correct || a.assisted);
        this.completed(this.sessionId);
        this.root.innerHTML = `<section class="quiz-card"><h1>拼写练习完成</h1><p>首次独立正确率：<strong>${pct(first.length ? correct / first.length : 0)}</strong>（${correct} / ${first.length}）</p><p>辅助作答 ${first.filter(a => a.assisted).length} 题 · 重练 ${this.attempts.filter(a => a.retry).length} 次；辅助与重练不计入首次独立正确数。</p><h2>错词与辅助作答汇总</h2>${missed.length ? `<ul>${missed.map(a => `<li><strong>${esc(a.expected)}</strong> · 你的输入：${esc(a.input)} · ${a.assisted ? '辅助作答' : '拼写有误'}</li>`).join('')}</ul>` : '<p>本轮全部独立拼对。</p>'}<div class="actions">${missed.length ? '<button id="spelling-repeat" class="secondary">重练错词（辅助轮）</button>' : ''}<button id="spelling-home" class="primary">返回首页</button></div><p class="hint">记录已单独保存；本次没有改写原 FSRS、到期时间或选择题学习记录。</p></section>`;
        this.root.querySelector<HTMLButtonElement>('#spelling-home')!.onclick = this.exit;
        const repeat = this.root.querySelector<HTMLButtonElement>('#spelling-repeat');
        if (repeat) repeat.onclick = () => { this.queue = missed.map(a => this.queue.find(w => w.id === a.wordId)!); this.sessionId = uid(); this.attempts = []; this.index = 0; this.firstCount = this.queue.length; this.retry = false; this.assistedRound = true; this.submitted = null; this.render(); };
    }
}
