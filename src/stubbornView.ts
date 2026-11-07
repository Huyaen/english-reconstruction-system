import type { Word } from './types.ts';
import type { StubbornReport } from './stubborn.ts';
import type { ClozeQuestion } from './readingCloze.ts';
import { esc } from './ui.ts';
import { buildSpellingQueue } from './spelling.ts';
import { speechControls } from './pronunciationView.ts';
export function stubbornListHTML(reports: StubbornReport[], words: Word[]): string {
    const byId = new Map(words.map(w => [w.id, w])), seen = new Set<string>();
    const visible = reports.filter(r => byId.has(r.wordId) && !seen.has(r.wordId) && !!seen.add(r.wordId));
    if (!visible.length) return '';
    return `<section class="panel" id="stubborn-list"><h2>有些词可以换个方法练</h2><p class="hint">依据独立、跨日作答提示，不等同于选择题薄弱状态。不强制加任务，可以忽略或在详情中关闭7天。</p>${visible.slice(0, 3).map(r => `<div class="stubborn-row" data-stubborn-word="${esc(r.wordId)}"><div><strong>${esc(byId.get(r.wordId)!.en)}</strong><p>${esc(r.reasons[0].message)}</p></div><button class="secondary" data-detail="${esc(r.wordId)}">查看依据与建议</button></div>`).join('')}${visible.length > 3 ? `<p class="hint">先显示3个，其余${visible.length - 3}个可从词条详情查看。</p>` : ''}</section>`;
}
interface SupportActions {
    loadCloze: () => Promise<ClozeQuestion[]>; spelling: () => void | Promise<void>; cloze: () => void | Promise<void>;
    dismiss: () => void | Promise<void>; current: () => boolean; error: (message: string) => void;
}
export function mountStubbornSupport(root: HTMLElement, word: Word, report: StubbornReport, words: Word[], actions: SupportActions) {
    if (!actions.current()) return;
    const eligible = buildSpellingQueue([word], words), byId = new Map(words.map(w => [w.id, w]));
    const pairs = report.reasons.flatMap(r => r.otherWordId && byId.has(r.otherWordId) ? [byId.get(r.otherWordId)!] : []);
    root.innerHTML = `<h3>换个方法练这个词</h3><ul>${report.reasons.map(r => `<li>${esc(r.message)}</li>`).join('')}</ul>${pairs.length ? `<h4>已有词条释义对照</h4><div class="stubborn-contrast">${[word, ...pairs].map(w => `<div><strong>${esc(w.en)}</strong>${speechControls(w.en)}<p>${esc(w.zh)} ${esc(w.pos)}</p></div>`).join('')}</div><p class="hint">只对照已有词典释义，不编造词义区别或例句。</p>` : ''}<div class="actions">${eligible.words.length ? '<button data-support-spelling class="secondary">练这个词的拼写</button>' : ''}<button data-support-cloze class="secondary" disabled>练这个词的原句填空</button><button data-support-dismiss class="text-button">7天内不提示此词</button></div>${!eligible.words.length ? `<p class="hint">暂不提供单义拼写题：${esc(eligible.excluded[0]?.reason ?? '没有适用词条')}。可先查看完整释义。</p>` : ''}<p data-support-context class="hint">正在核验已保存原句……</p><p data-support-feedback role="status"></p><p class="hint">仅看近60天的独立证据：选择题至少6个会话、跨3天且间隔48小时；拼写/原句至少4轮、跨2天且间隔24小时，辅助与重试不计。提示、关闭和播放声音不修改FSRS、到期日或ReviewRecord；实际练习按原规则记录。</p>`;
    const current = () => root.isConnected && actions.current();
    const bind = (selector: string, run: () => void | Promise<void>) => {
        const button = root.querySelector<HTMLButtonElement>(selector); if (!button) return;
        button.onclick = async () => {
            if (button.disabled || !current()) return; button.disabled = true;
            try { await run(); }
            catch (e) { if (current()) { const message = `操作未保存或未能开始，请重试：${e instanceof Error ? e.message : String(e)}`; root.querySelector('[data-support-feedback]')!.textContent = message; actions.error(message); } }
            finally { if (current()) button.disabled = false; }
        };
    };
    bind('[data-support-spelling]', actions.spelling); bind('[data-support-cloze]', actions.cloze); bind('[data-support-dismiss]', actions.dismiss);
    void actions.loadCloze().then(questions => {
        if (!current()) return; const available = questions.filter(q => q.wordId === word.id);
        root.querySelector<HTMLButtonElement>('[data-support-cloze]')!.disabled = !available.length;
        root.querySelector('[data-support-context]')!.textContent = available.length ? `有${available.length}条已保存可用原句 · 来源：${available[0].sourceTitle}` : '当前没有可用的已保存原句。可先在阅读材料中标记，不编造示例。';
    }).catch(() => { if (current()) root.querySelector('[data-support-context]')!.textContent = '暂时无法核验已保存原句，请稍后重试。'; });
}
