// —— Phase 9：Output Lab 视图（纯 HTML）——
// 原则：编辑区优先；不把巨大统计面板塞进写作页面。
import type { Data, OutputAttempt, OutputFeedback, OutputSupportLevel, OutputTaskSpec, OutputTaskType } from './types.ts';
import { conceptById } from './grammar.ts';
import { sentencesForConcept } from './sentenceGraphMap.ts';
import { esc } from './ui.ts';
import { FEEDBACK_STATUS_TEXT } from './uiLabels.ts';
import { OUTPUT_TASK_ORDER, OUTPUT_TASK_TYPES, taskMeta } from './outputTask.ts';
import { SUPPORT_LEVELS, supportLevelZh } from './outputScaffolding.ts';
import { ERROR_LABELS } from './outputFeedback.ts';
import type { RevisionComparison } from './outputRevision.ts';
import { outputErrorSummary, type OutputAnalytics, type OutputErrorSummaryDays } from './outputAnalytics.ts';
import type { TransferPlan } from './outputTransfer.ts';

/** 精力状态：界面上只说人话，不暴露 low/normal/good */
const energyWord = (e: 'low' | 'normal' | 'good') => e === 'low' ? '有点累' : e === 'good' ? '状态好' : '正常';
export interface HandoffCard {
    kind: 'reading' | 'input' | 'unit';
    id: string;
    label: string;
    preview: string;
    taskType: OutputTaskType;
}
export interface OutputHubInput {
    data: Data;
    suggestion: OutputTaskSpec | null;
    candidates: OutputTaskSpec[];
    note: string;
    handoffs: HandoffCard[];
    analytics: OutputAnalytics;
    selectedType: OutputTaskType | null;
    topicDraft: string;
    minutes: number;
    energy: 'low' | 'normal' | 'good';
    errorSummaryDays?: OutputErrorSummaryDays;
    errorSummaryNow?: number;
}
export function outputHubPage(input: OutputHubInput): string {
    const s = input.suggestion;
    const cards = input.candidates.slice(0, 5).map(t => `
      <article class="panel output-card">
        <div class="row spread"><b>${esc(taskMeta(t.taskType).zh)} · ${esc(t.topic)}</b><span class="pill">${esc(srcLabel(t.sourceType))}</span></div>
        <p class="muted">${esc(t.communicationGoal)}</p>
        <p class="muted">${esc(t.reasons.join(' · ') || '自由写')} · 约 ${t.expectedMinutes} 分钟 · ${t.minWords}–${t.maxWords} 词</p>
        <div class="actions"><button class="primary" data-out-start="${esc(t.id)}">开始写</button></div>
      </article>`).join('');
    const handoffs = input.handoffs.length ? `<section class="panel"><div class="section-title"><h2>从刚才的材料继续</h2><span class="subtle">原文会直接带入，不用重写</span></div>
      <div class="output-handoffs">${input.handoffs.map(h => `<button class="handoff" data-out-handoff="${esc(h.kind)}:${esc(h.id)}">
        <b>${esc(h.label)}</b><small>${esc(h.preview.slice(0, 90))}${h.preview.length > 90 ? '…' : ''}</small><span>带进写作练习 →</span></button>`).join('')}</div></section>` : '';
    const history = input.analytics.attempts ? `
      <section class="panel"><div class="section-title"><h2>以前的表达</h2><span class="subtle">看变化，不看字数</span></div>
        <div class="output-history">${input.data.outputAttempts.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 8).map(a => {
        const tag = a.task ? 'button' : 'div';
        return `<${tag} class="history-row"${a.task ? ` data-out-open="${esc(a.id)}"` : ''}>
            <b>${esc(taskMeta((a.taskType ?? 'free_expression') as OutputTaskType).zh)}</b>
            <span>${esc((a.finalText || a.originalText || '').slice(0, 70))}</span>
            <small>${esc(a.feedbackSource === 'mock' ? '模拟反馈' : FEEDBACK_STATUS_TEXT[a.feedbackStatus ?? 'none'] ?? '没有 AI 反馈')} · ${a.revisions?.length ?? 0} 次修改</small>
          </${tag}>`;
    }).join('')}</div></section>` : '';
    const stats = input.analytics.attempts ? `<section class="panel"><div class="section-title"><h2>表达概览</h2><span class="subtle">${esc(input.analytics.sampleNote)}</span></div>
      <div class="metrics">${metric('完成', String(input.analytics.completed), `共 ${input.analytics.attempts} 条记录`)}${metric('独立', String(input.analytics.independent), '无提示、非照抄')}${metric('辅助 / 照抄', `${input.analytics.assisted} / ${input.analytics.copied}`, '自己写的程度不同')}${metric('迁移 / 延迟', `${input.analytics.transfer} / ${input.analytics.delayed}`, '新语境 / D1')}</div>
      <p class="hint">${esc(input.analytics.meaningDeliveredRate === null ? '意思送达率：可用的 AI 反馈还不够' : `AI 估计的意思送达率 ${Math.round(input.analytics.meaningDeliveredRate * 100)}%（仅供参考）`)} · 独立产出词 ${input.analytics.productiveWords} 个</p></section>` : '';
    return `${titleBlock('写作练习', '写作练习', '先把意思写出来，再让它更准确。写一句也算完成。')}
    ${input.note ? `<div class="notice">${esc(input.note)}</div>` : ''}
    <section class="panel output-start">
      <div class="section-title"><h2>今天写什么</h2><span class="subtle">${esc(input.minutes)} 分钟 · 状态 ${energyWord(input.energy)}</span></div>
      <div class="output-types">${OUTPUT_TASK_ORDER.map(t => `<button class="chip ${input.selectedType === t ? 'active' : ''}" aria-pressed="${input.selectedType === t}" data-out-type="${t}">${esc(OUTPUT_TASK_TYPES[t].zh)}</button>`).join('')}</div>
      <div class="form-grid">
        <label>想表达的主题（可选）<input id="out-topic" value="${esc(input.topicDraft)}" placeholder="例如：今天的比赛 / 我最近的一个决定"></label>
      </div>
      ${s ? `<div class="output-suggestion"><b>建议：${esc(taskMeta(s.taskType).zh)} · ${esc(s.topic)}</b>
        <p>${esc(s.communicationGoal)}</p>
        <p class="muted">${esc(s.reasons.join(' · ') || '自由写')} · 约 ${s.expectedMinutes} 分钟 · 建议 ${s.minWords}–${s.maxWords} 词</p>
        <div class="actions"><button id="out-use-suggestion" class="primary">用这个任务开始</button></div></div>` : ''}
    </section>
    ${handoffs}
    <section class="panel"><div class="section-title"><h2>可选任务</h2><span class="subtle">来自你真实的阅读 / 输入 / 单元</span></div>
      <div class="output-grid">${cards}</div></section>
    ${stats}
    ${errorSummaryBlock(outputErrorSummary(input.data, input.errorSummaryDays, input.errorSummaryNow), input.data.sentences)}
    ${history}`;
}
const ERROR_SUMMARY_LABELS = {
    ...ERROR_LABELS,
    sentence_punctuation: '句末标点', repeated_word: '相邻重复词', sentence_capitalization: '句首大写',
    long_sentence_hint: '句子可能过长', missing_predicate_hint: '谓语可能需要复核',
};
const ERROR_SUMMARY_SOURCES = {
    ai: '通过质量门的 AI', deterministic: '本地规则', heuristic: '启发式提示',
};
const ERROR_PRACTICE_CONCEPT: Readonly<Record<string, string>> = {
    tense: 'verb.tense', missing_subject: 'structure.subject', missing_predicate: 'structure.predicate', reference: 'logic.reference',
};
function errorSummaryBlock(summary: ReturnType<typeof outputErrorSummary>, sentences: Data['sentences']): string {
    const { days, coverage, categories, recommendations } = summary;
    const counts = coverage.submitted
        ? `<p>共 ${coverage.submitted} 个已提交任务，其中 ${coverage.independent} 个有无提示写作记录。</p>
           <p class="muted">通过质量门的 AI 覆盖 ${coverage.ai} 个（独立 ${coverage.independentAi} 个） · 本地规则检查 ${coverage.deterministic} 个 · 启发式提示涉及 ${coverage.heuristic} 个 · 学习者自述 ${coverage.selfReported} 个 · AI 无法评估 ${coverage.unassessable} 个</p>`
        : '<p class="muted">这段时间没有可用的写作提交，证据不足。</p>';
    const details = categories.map(({ key, source, occurrences, tasks, denominator, independentTasks, independentDenominator, examples }) => `
      <details class="output-card">
        <summary><b>${ERROR_SUMMARY_LABELS[key]}</b> · ${ERROR_SUMMARY_SOURCES[source]} · ${occurrences} 处${source === 'heuristic' ? '待核对提示' : '记录'} · 涉及 ${tasks} / ${denominator} 个已检查任务${independentDenominator ? `（独立 ${independentTasks} / ${independentDenominator} 个）` : '（独立样本不足）'}${independentTasks >= 2 ? ' · 独立任务中重复出现' : ''}</summary>
        <ul>${examples.map(e => `<li>
          ${e.context !== e.original ? `<p class="muted">上下文 <q>${esc(e.context)}</q></p>` : ''}
          <p><q>${esc(e.original)}</q>${e.proposed ? ` → <q>${esc(e.proposed)}</q>` : ''}</p>
          <p class="muted">${esc(e.explanation)}</p>
          ${e.canOpen ? `<button class="text-button" type="button" data-out-open="${esc(e.attemptId)}">打开原练习 · ${esc(e.topic)} · ${esc(new Date(e.at).toLocaleDateString('zh-CN'))}</button>` : `<small class="muted">${esc(e.topic)} · ${esc(new Date(e.at).toLocaleDateString('zh-CN'))}</small>`}
        </li>`).join('')}</ul>
      </details>`).join('');
    const practice = recommendations.length ? `<h3>接下来复看</h3><ul>${recommendations.map(({ key, source, independentTasks, independentDenominator, example }) => {
        const conceptId = ERROR_PRACTICE_CONCEPT[key];
        const concept = conceptId && sentencesForConcept(conceptId, sentences).length ? conceptById(conceptId) : undefined;
        return `<li><b>${ERROR_SUMMARY_LABELS[key]}</b> · ${ERROR_SUMMARY_SOURCES[source]}在 ${independentTasks} / ${independentDenominator} 个独立任务中发现。
        <p><q>${esc(example.original)}</q>${example.proposed ? ` → <q>${esc(example.proposed)}</q>` : ''}。先看原练习中的上下文，再换个场景写一句，检查同类问题。</p>
        <button class="text-button" type="button" data-out-open="${esc(example.attemptId)}">复看原练习</button>
        ${concept ? `<button class="secondary" type="button" data-out-grammar="${esc(concept.id)}">练习${esc(concept.name)}</button>` : ''}</li>`;
    }).join('')}</ul>`
        : '<p class="hint">至少要有 3 个同来源检查过的独立任务，且同类问题出现在其中至少 2 个任务里，才会建议复看。</p>';
    return `<section id="out-error-summary" class="panel" aria-labelledby="out-error-heading">
      <div class="section-title"><h2 id="out-error-heading">表达错误复盘</h2><select id="out-error-window" aria-label="表达错误复盘时间范围">${([7, 14, 30] as const).map(n => `<option value="${n}"${days === n ? ' selected' : ''}>最近 ${n} 天</option>`).join('')}</select></div>
      ${counts}
      ${coverage.mockExcluded ? `<p class="muted">已排除 ${coverage.mockExcluded} 条模拟反馈记录。</p>` : ''}
      <p class="hint">按任务创建日统计，含今天。修改和重评仍属原任务。AI 反馈的结构和原文引用通过检查，判断仅供参考。本地规则只检查可观察的形式，启发式提示需要自己核对。自述只说明学习者的感受或原意。缺少、失败或无效的反馈属于 AI 无法评估。</p>
      ${details || (coverage.submitted ? '<p class="muted">目前没有可汇总的错误实例。缺少反馈的提交仍保留在覆盖说明中。</p>' : '')}
      ${practice}
    </section>`;
}
export interface SessionInput {
    attempt: OutputAttempt;
    hint: {
        level: OutputSupportLevel;
        title: string;
        content: string;
    } | null;
    message: string;
    compare: RevisionComparison | null;
    transfer: TransferPlan | null;
    saving: boolean;
}
export function outputSessionPage(input: SessionInput): string {
    const a = input.attempt;
    const task = a.task!;
    const text = a.status === 'draft' || a.status === 'revised' ? (a.draftText ?? a.originalText) : (a.finalText || a.originalText);
    const fb = a.feedback ?? null;
    return `${titleBlock('写作练习', taskMeta(task.taskType).zh, task.communicationGoal, `<button id="out-back" class="secondary">返回写作列表</button>`)}
    <div class="output-layout">
      <section class="panel output-editor">
        <div class="section-title"><h2>${esc(task.topic)}</h2><span class="subtle">${esc(srcLabel(task.sourceType))} · 建议 ${task.minWords}–${task.maxWords} 词</span></div>
        <p class="hint">先写你的意思。不会的词可以绕开；写一句也可以提交。</p>
        <textarea id="out-editor" rows="10" ${a.status === 'completed' ? 'readonly' : ''} placeholder="先写一句最简单的，也算开始……">${esc(text)}</textarea>
        <div class="row spread"><small class="muted" id="out-count">${countWords(text)} 词</small><small class="muted" id="out-save-state" role="status" aria-live="polite">${input.saving ? '保存中…' : '自动保存到本地'}</small></div>
        <div class="actions">
          <button class="secondary" data-out-support="1">关键词</button>
          <button class="secondary" data-out-support="2">句型骨架</button>
          <button class="secondary" data-out-support="3">部分示例</button>
          <button class="text-button" data-out-support="4">完整示范（用过就不算独立写）</button>
        </div>
        ${input.hint ? `<div class="hint-box"><b>L${input.hint.level} · ${esc(input.hint.title)}</b><pre>${esc(input.hint.content)}</pre></div>` : ''}
        ${task.taskType === 'repair' ? `<div class="form-grid">
          <label>你本来想说什么（中文可以）<input id="out-repair-meaning" placeholder="例如：有人暗杀了政治领袖"></label>
          <label>卡住的那个英语词（可选）<input id="out-repair-blocked" placeholder="例如：assassination"></label>
        </div>` : ''}
        ${input.message ? `<div class="notice">${esc(input.message)}</div>` : ''}
        <div class="actions">
          <button class="primary" id="out-submit" ${a.status === 'completed' ? 'disabled' : ''}>提交并检查意思</button>
          <button class="secondary" id="out-feedback" ${a.status === 'completed' ? 'disabled' : ''}>请求语言反馈${a.feedbackStatus === 'ai' ? '（已有）' : ''}</button>
          <button class="text-button" id="out-finish" ${a.status === 'completed' ? 'disabled' : ''}>完成这次表达</button>
        </div>
      </section>
      <div class="output-side">
        ${fb ? feedbackBlock(fb, a) : `<section class="panel"><div class="section-title"><h2>反馈</h2></div><p class="muted">提交后会先检查意思是否传达到，再给最多 3 个重点。没有 AI 时也会保留原文并给出本地格式检查。</p></section>`}
        ${a.repair ? `<section class="panel"><div class="section-title"><h2>Communication Repair</h2></div>
          <p>你本来想说：${esc(a.repair.blockedExpression || a.repair.intendedMeaning)}</p>
          <p>你写的替代：${esc(a.repair.userAlternative)}</p>
          <p class="muted">${a.repair.meaningPreserved === true ? '主要意思保住了（按现有记录判断）' : a.repair.meaningPreserved === false ? '这次没有把主要意思送到' : '记录不够，判断不了意思是否保留'}</p></section>` : ''}
        ${a.revisions?.length ? revisionBlock(a, input.compare) : ''}
        ${input.transfer ? transferBlock(input.transfer) : ''}
      </div>
    </div>`;
}
function feedbackBlock(fb: OutputFeedback, a: OutputAttempt): string {
    const issue = (s: typeof fb.priorityIssues[number]) => `<li><b>${esc(ERROR_LABELS[s.type])}</b>：${esc(s.explanation)}<br><span class="muted">${esc(s.original)} → ${esc(s.proposed || '（自己重写）')}</span></li>`;
    return `<section class="panel">
      <div class="section-title"><h2>反馈</h2><span class="subtle">${esc(fb.sourceProvenance)} · ${esc(fb.promptVersion)}</span></div>
      <div class="feedback-row"><span class="pill">意思</span><b>${meaningLabel(fb.meaningAssessment)}</b><small class="muted">依据 ${esc(fb.meaningBasis)} · 置信 ${Math.round(fb.meaningConfidence * 100)}%</small></div>
      ${fb.noCorrectionNeeded ? '<p class="ok-line">不用大改：这句已经能读了。</p>' : `<div class="feedback-row"><span class="pill warn">主要问题</span><ul>${fb.priorityIssues.map(issue).join('') || '<li>没有影响理解的主要问题。</li>'}</ul></div>`}
      <div class="feedback-row"><span class="pill">What worked</span><ul>${fb.strengths.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>
      ${fb.upgrade ? `<div class="feedback-row"><span class="pill">Suggested revision</span><p>${esc(fb.upgrade.original)}<br>→ ${esc(fb.upgrade.suggested)}</p><p class="muted">${esc(fb.upgrade.why)}</p><small class="muted">${esc(fb.upgrade.changes.join(' · '))}</small></div>` : ''}
      <div class="feedback-row"><span class="pill">Next practice</span><p>${esc(fb.nextPractice)}</p></div>
      <p class="hint">${esc(fb.uncertainty)}</p>
      ${a.feedbackStatus === 'unavailable' || a.feedbackStatus === 'invalid' ? '<p class="warn-line">AI 反馈这次不可用：上面只有本机做的确定性检查，不是语法诊断。原文已保存。</p>' : ''}
    </section>`;
}
function revisionBlock(a: OutputAttempt, cmp: RevisionComparison | null): string {
    const revisions = a.revisions ?? [];
    const last = revisions[revisions.length - 1]!;
    const kindZh = { self: '自己修改', after_hint: '提示后修改', copied: '照抄建议（不算自己写的）', after_model: '看示范后改写' }[last.kind];
    return `<section class="panel"><div class="section-title"><h2>修改</h2><span class="subtle">${esc(kindZh)}</span></div>
      <textarea id="out-revision" rows="7" ${a.status === 'completed' ? 'readonly' : ''}>${esc(a.finalText || a.revisionText || '')}</textarea>
      <div class="actions"><button class="primary" id="out-revise" ${a.status === 'completed' ? 'disabled' : ''}>保存修改</button></div>
      ${cmp ? `<p class="muted">修改后 ${cmp.afterWords} 词（原 ${cmp.beforeWords} 词）· 已解决 ${cmp.resolved.length} 处 · 仍有 ${cmp.remaining.length} 处</p>` : ''}
    </section>`;
}
function transferBlock(t: TransferPlan): string {
    return `<section class="panel"><div class="section-title"><h2>迁移练习</h2><span class="subtle">${t.strength === 'strong' ? '换了场景 · 更能说明问题' : '场景太像 · 说服力弱'}</span></div>
      <p>${esc(t.task.communicationGoal)}</p>
      <p class="muted">${esc(t.notes.join(' · '))}</p>
      <div class="actions"><button class="secondary" data-out-transfer-start="${esc(t.task.id)}">换场景再写一次</button></div></section>`;
}
function titleBlock(kicker: string, title: string, sub: string, action = ''): string {
    return `<div class="page-title"><div><div class="eyebrow">${esc(kicker)}</div><h1>${esc(title)}</h1><p>${esc(sub)}</p></div>${action}</div>`;
}
function metric(label: string, value: string, note: string): string {
    return `<div class="metric"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`;
}
function meaningLabel(v: OutputFeedback['meaningAssessment']): string {
    return v === 'delivered' ? '意思传达到了' : v === 'partly_delivered' ? '部分传达到' : v === 'not_delivered' ? '这次没有传到' : '无法判断（AI 不可用）';
}
function srcLabel(t: OutputTaskSpec['sourceType']): string {
    return { free: '来自自由写', reading: '来自阅读', input: '来自输入练习', mini_unit: '来自主题单元', vocabulary: '薄弱词', grammar: '薄弱语法', closing_loop: '今日收尾' }[t] ?? t;
}
export function countWords(text: string): number {
    const t = String(text ?? '').trim();
    return t ? t.split(/\s+/).filter(Boolean).length : 0;
}
