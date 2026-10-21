// —— Phase 9：Output Lab 视图（纯 HTML）——
// 原则：编辑区优先；不把巨大统计面板塞进写作页面。
import type { Data, OutputAttempt, OutputFeedback, OutputSupportLevel, OutputTaskSpec, OutputTaskType } from './types.ts';
import { esc } from './ui.ts';
import { OUTPUT_TASK_ORDER, OUTPUT_TASK_TYPES, taskMeta } from './outputTask.ts';
import { SUPPORT_LEVELS, supportLevelZh } from './outputScaffolding.ts';
import { ERROR_LABELS } from './outputFeedback.ts';
import type { RevisionComparison } from './outputRevision.ts';
import type { OutputAnalytics } from './outputAnalytics.ts';
import type { TransferPlan } from './outputTransfer.ts';

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
}

export function outputHubPage(input: OutputHubInput): string {
    const s = input.suggestion;
    const cards = input.candidates.slice(0, 5).map(t => `
      <article class="panel output-card">
        <div class="row spread"><b>${esc(taskMeta(t.taskType).zh)} · ${esc(t.topic)}</b><span class="pill">${esc(srcLabel(t.sourceType))}</span></div>
        <p class="muted">${esc(t.communicationGoal)}</p>
        <p class="muted">${esc(t.reasons.join(' · ') || '自由表达')} · 约 ${t.expectedMinutes} 分钟 · ${t.minWords}–${t.maxWords} 词</p>
        <div class="actions"><button class="primary" data-out-start="${esc(t.id)}">开始写</button></div>
      </article>`).join('');
    const handoffs = input.handoffs.length ? `<section class="panel"><div class="section-title"><h2>从刚才的材料继续</h2><span class="subtle">原文会直接带入，不用重写</span></div>
      <div class="output-handoffs">${input.handoffs.map(h => `<button class="handoff" data-out-handoff="${esc(h.kind)}:${esc(h.id)}">
        <b>${esc(h.label)}</b><small>${esc(h.preview.slice(0, 90))}${h.preview.length > 90 ? '…' : ''}</small><span>带入 Output Lab →</span></button>`).join('')}</div></section>` : '';
    const history = input.analytics.attempts ? `
      <section class="panel"><div class="section-title"><h2>以前的表达</h2><span class="subtle">看变化，不看字数</span></div>
        <div class="output-history">${input.data.outputAttempts.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 8).map(a => `
          <button class="history-row" data-out-open="${esc(a.id)}">
            <b>${esc(taskMeta((a.taskType ?? 'free_expression') as OutputTaskType).zh)}</b>
            <span>${esc((a.finalText || a.originalText || '').slice(0, 70))}</span>
            <small>${esc(a.feedbackStatus ?? 'none')} · ${a.revisions?.length ?? 0} 次修改</small>
          </button>`).join('')}</div></section>` : '';
    const stats = input.analytics.attempts ? `<section class="panel"><div class="section-title"><h2>表达概览</h2><span class="subtle">${esc(input.analytics.sampleNote)}</span></div>
      <div class="metrics">${metric('完成', String(input.analytics.completed), `共 ${input.analytics.attempts} 条记录`)}${metric('独立', String(input.analytics.independent), '无提示、非照抄')}${metric('辅助 / 照抄', `${input.analytics.assisted} / ${input.analytics.copied}`, '证据等级不同')}${metric('迁移 / 延迟', `${input.analytics.transfer} / ${input.analytics.delayed}`, '新语境 / D1')}</div>
      <p class="hint">${esc(input.analytics.meaningDeliveredRate === null ? '意思送达率：insufficient evidence' : `意思送达率 ${Math.round(input.analytics.meaningDeliveredRate * 100)}%（样本很少，只看趋势）`)} · 独立产出词 ${input.analytics.productiveWords} 个</p></section>` : '';

    return `${titleBlock('OUTPUT LAB', '真实表达', '先把意思送出去，再让它更准确。写一句也算完成。')}
    ${input.note ? `<div class="notice">${esc(input.note)}</div>` : ''}
    <section class="panel output-start">
      <div class="section-title"><h2>今天写什么</h2><span class="subtle">${esc(input.minutes)} 分钟 · 状态 ${esc(input.energy)}</span></div>
      <div class="output-types">${OUTPUT_TASK_ORDER.map(t => `<button class="chip ${input.selectedType === t ? 'active' : ''}" data-out-type="${t}">${esc(OUTPUT_TASK_TYPES[t].zh)}</button>`).join('')}</div>
      <div class="form-grid">
        <label>想表达的主题（可选）<input id="out-topic" value="${esc(input.topicDraft)}" placeholder="例如：今天的比赛 / 我最近的一个决定"></label>
      </div>
      ${s ? `<div class="output-suggestion"><b>建议：${esc(taskMeta(s.taskType).zh)} · ${esc(s.topic)}</b>
        <p>${esc(s.communicationGoal)}</p>
        <p class="muted">${esc(s.reasons.join(' · ') || '自由表达')} · 约 ${s.expectedMinutes} 分钟 · 建议 ${s.minWords}–${s.maxWords} 词</p>
        <div class="actions"><button id="out-use-suggestion" class="primary">用这个任务开始</button></div></div>` : ''}
    </section>
    ${handoffs}
    <section class="panel"><div class="section-title"><h2>可选任务</h2><span class="subtle">来自你真实的阅读 / 输入 / 单元</span></div>
      <div class="output-grid">${cards}</div></section>
    ${stats}
    ${history}`;
}

export interface SessionInput {
    attempt: OutputAttempt;
    hint: { level: OutputSupportLevel; title: string; content: string } | null;
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
    return `${titleBlock('OUTPUT LAB', taskMeta(task.taskType).zh, task.communicationGoal, `<button id="out-back" class="secondary">返回 Output Lab</button>`)}
    <div class="output-layout">
      <section class="panel output-editor">
        <div class="section-title"><h2>${esc(task.topic)}</h2><span class="subtle">${esc(srcLabel(task.sourceType))} · 建议 ${task.minWords}–${task.maxWords} 词</span></div>
        <p class="hint">先写你的意思。不会的词可以绕开；写一句也可以提交。</p>
        <textarea id="out-editor" rows="10" ${a.status === 'completed' ? 'readonly' : ''} placeholder="Start with one simple sentence...">${esc(text)}</textarea>
        <div class="row spread"><small class="muted" id="out-count">${countWords(text)} words</small><small class="muted" id="out-save-state">${input.saving ? '保存中…' : '自动保存到本地'}</small></div>
        <div class="actions">
          <button class="secondary" data-out-support="1">关键词</button>
          <button class="secondary" data-out-support="2">句型骨架</button>
          <button class="secondary" data-out-support="3">部分示例</button>
          <button class="text-button" data-out-support="4">完整示范（会降低证据等级）</button>
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
          <p class="muted">${a.repair.meaningPreserved === true ? '主要意思保留（按现有证据判断）' : a.repair.meaningPreserved === false ? '这次没有把主要意思送到' : '证据不足，无法判断意思是否保留'}</p></section>` : ''}
        ${a.revisions?.length ? revisionBlock(a, input.compare) : ''}
        ${input.transfer ? transferBlock(input.transfer) : ''}
      </div>
    </div>`;
}

function feedbackBlock(fb: OutputFeedback, a: OutputAttempt): string {
    const issue = (s: typeof fb.priorityIssues[number]) => `<li><b>${esc(ERROR_LABELS[s.type])}</b>：${esc(s.explanation)}<br><span class="muted">${esc(s.original)} → ${esc(s.proposed || '（自己重写）')}</span></li>`;
    return `<section class="panel">
      <div class="section-title"><h2>反馈</h2><span class="subtle">${esc(fb.sourceProvenance)} · ${esc(fb.promptVersion)}</span></div>
      <div class="feedback-row"><span class="pill">Meaning</span><b>${meaningLabel(fb.meaningAssessment)}</b><small class="muted">依据 ${esc(fb.meaningBasis)} · 置信 ${Math.round(fb.meaningConfidence * 100)}%</small></div>
      ${fb.noCorrectionNeeded ? '<p class="ok-line">No major correction needed：这句话已经能读了。</p>' : `<div class="feedback-row"><span class="pill warn">Major issue</span><ul>${fb.priorityIssues.map(issue).join('') || '<li>没有影响理解的主要问题。</li>'}</ul></div>`}
      <div class="feedback-row"><span class="pill">What worked</span><ul>${fb.strengths.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div>
      ${fb.upgrade ? `<div class="feedback-row"><span class="pill">Suggested revision</span><p>${esc(fb.upgrade.original)}<br>→ ${esc(fb.upgrade.suggested)}</p><p class="muted">${esc(fb.upgrade.why)}</p><small class="muted">${esc(fb.upgrade.changes.join(' · '))}</small></div>` : ''}
      <div class="feedback-row"><span class="pill">Next practice</span><p>${esc(fb.nextPractice)}</p></div>
      <p class="hint">${esc(fb.uncertainty)}</p>
      ${a.feedbackStatus === 'unavailable' || a.feedbackStatus === 'invalid' ? '<p class="warn-line">AI Feedback Unavailable：以上只有本地确定性检查，不是语法诊断。原文已保存。</p>' : ''}
    </section>`;
}

function revisionBlock(a: OutputAttempt, cmp: RevisionComparison | null): string {
    const revisions = a.revisions ?? [];
    const last = revisions[revisions.length - 1]!;
    const kindZh = { self: '自己修改', after_hint: '提示后修改', copied: '照抄建议（不算独立掌握）', after_model: '看示范后改写' }[last.kind];
    return `<section class="panel"><div class="section-title"><h2>修改</h2><span class="subtle">${esc(kindZh)}</span></div>
      <textarea id="out-revision" rows="7" ${a.status === 'completed' ? 'readonly' : ''}>${esc(a.finalText || a.revisionText || '')}</textarea>
      <div class="actions"><button class="primary" id="out-revise" ${a.status === 'completed' ? 'disabled' : ''}>保存修改</button></div>
      ${cmp ? `<p class="muted">修改后 ${cmp.afterWords} 词（原 ${cmp.beforeWords} 词）· 已解决 ${cmp.resolved.length} 处 · 仍有 ${cmp.remaining.length} 处</p>` : ''}
    </section>`;
}

function transferBlock(t: TransferPlan): string {
    return `<section class="panel"><div class="section-title"><h2>迁移练习</h2><span class="subtle">${t.strength === 'strong' ? '新语境 · 强证据' : '语境太近 · 弱证据'}</span></div>
      <p>${esc(t.task.communicationGoal)}</p>
      <p class="muted">${esc(t.notes.join(' · '))}</p>
      <div class="actions"><button class="secondary" data-out-transfer-start="${esc(t.task.id)}">开始迁移</button></div></section>`;
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
    return { free: '自由表达', reading: '来自阅读', input: '来自真实输入', mini_unit: '来自主题单元', vocabulary: '薄弱词', grammar: '薄弱语法', closing_loop: '今日收尾' }[t] ?? t;
}
export function countWords(text: string): number {
    const t = String(text ?? '').trim();
    return t ? t.split(/\s+/).filter(Boolean).length : 0;
}
