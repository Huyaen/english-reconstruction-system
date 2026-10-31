// —— Phase 10：学情诊断看板（纯 HTML，无副作用）——
// 设计纪律：
//   * 不显示“英语总分”，只显示分域指标 + 分母 + 证据质量。
//   * 不可评估的指标写明原因，不用 0 代替。
//   * 变化只在同长度窗口且两侧达标时显示；否则明确“不可比”。
import type { Data, DiagnosticEvidenceMix, DiagnosticPayload, MetricValue, SkillSnapshot, WeeklyDiagnostic } from './types.ts';
import { esc, date } from './ui.ts';
import { retentionLine } from './diagnosticsInsight.ts';
import { MASTERY_DISCLAIMER } from './uiLabels.ts';
const DOMAIN_LABEL: Record<MetricValue['domain'], string> = {
    vocabulary: '词汇',
    grammar: '语法',
    reading: '阅读',
    input: '输入练习',
    output: '写作练习',
    translation: '要不要先翻译',
    exam: '考试',
};
const QUALITY_LABEL: Record<MetricValue['quality'], string> = {
    verified: '能对上原文',
    'task-behavior': '做题记录',
    mixed: '混合记录',
    'self-report': '自评',
    none: '没有记录',
};
function valueText(m: MetricValue): string {
    if (m.evaluability === 'not-applicable')
        return '不适用';
    if (m.evaluability === 'insufficient' || m.value === null)
        return '记录还不够';
    if (m.kind === 'rate')
        return `${Math.round(m.value * 100)}%`;
    if (m.kind === 'duration')
        return m.id === 'vocab.retrievalMs' ? `${Math.round(m.value)} ms` : `${Math.round(m.value)} 分钟`;
    if (m.kind === 'index')
        return m.value.toFixed(2).replace(/\.00$/, '');
    return String(Math.round(m.value));
}
function sampleText(m: MetricValue): string {
    if (m.evaluability === 'insufficient')
        return m.reasons[0] ?? `只有 ${m.sample} 条记录，不够看`;
    if (m.numerator !== null && m.denominator !== null)
        return `${m.numerator} / ${m.denominator}`;
    return `记录 ${m.sample} 条`;
}
function metricCard(m: MetricValue): string {
    return `<div class="diag-metric ${m.evaluability !== 'evaluable' ? 'is-empty' : ''}" data-quality="${esc(m.quality)}" data-evaluability="${esc(m.evaluability)}">
      <span class="diag-metric-label">${esc(m.label)}</span>
      <strong>${esc(valueText(m))}</strong>
      <small>${esc(sampleText(m))} · ${esc(QUALITY_LABEL[m.quality])}</small>
      <span class="diag-def" title="${esc(m.definition)}">${esc(m.definition)}</span>
    </div>`;
}
function domainCard(domain: MetricValue['domain'], metrics: MetricValue[]): string {
    const list = metrics.filter(m => m.domain === domain);
    const evaluable = list.filter(m => m.evaluability === 'evaluable').length;
    const head = list.slice(0, 4).map(metricCard).join('');
    const rest = list.slice(4);
    return `<section class="panel diag-domain">
      <div class="section-title"><h2>${esc(DOMAIN_LABEL[domain])}</h2><span class="pill">${evaluable}/${list.length} 项有数据</span></div>
      ${list.length ? head + (rest.length ? `<details class="diag-more"><summary>查看其余 ${rest.length} 项指标</summary>${rest.map(metricCard).join('')}</details>` : '') : '<p class="muted">还没有这类记录。</p>'}
    </section>` + (domain === 'vocabulary' ? `<p class="hint diag-mastery-note">${esc(MASTERY_DISCLAIMER)}</p>` : '');
}
function evidenceBar(mix: DiagnosticEvidenceMix): string {
    const total = Math.max(1, mix.verified + mix.taskBehavior + mix.selfReport + mix.inferred);
    const seg = (n: number, cls: string, label: string) => n > 0 ? `<i class="${cls}" style="width:${(n / total * 100).toFixed(1)}%" title="${label} ${n}"></i>` : '';
    const mixTotal = mix.verified + mix.taskBehavior + mix.selfReport + mix.inferred;
    return `<div class="diag-evidence-bar" data-total="${mixTotal}" role="img" aria-label="记录来源：能对上原文 ${mix.verified}，做题 ${mix.taskBehavior}，自评 ${mix.selfReport}，推断 ${mix.inferred}">
      ${seg(mix.verified, 'verified', '能对上原文')}${seg(mix.taskBehavior, 'behavior', '行为')}${seg(mix.selfReport, 'self', '自评')}${seg(mix.inferred, 'inferred', '推断')}
    </div>`;
}
function verdict(payload: DiagnosticPayload): string {
    if (!payload.bottleneck) {
        return `<section class="panel diag-verdict">
          <div class="eyebrow">这段时间的结论</div>
          <h2>暂不下结论</h2>
          <p>${esc(payload.evidence.note)}</p>
          <p class="hint">记录太少时不下结论，也不做比较。多练几次，这里就有东西可看。</p>
        </section>`;
    }
    const b = payload.bottleneck;
    return `<section class="panel diag-verdict">
      <div class="eyebrow">本周期最值得先处理</div>
      <h2>${esc(b.label)}</h2>
      <p>${esc(b.reason)}</p>
      <p class="hint">类别：${esc(DOMAIN_LABEL[b.domain])} · 可信度：${b.confidence === 'medium' ? '中（有做题和可核对记录）' : '低（多是自评，或只有一种来源）'}</p>
    </section>`;
}
function comparisonBlock(payload: DiagnosticPayload): string {
    const changed = payload.comparison.filter(c => c.comparable && c.delta !== null && c.delta !== 0);
    if (!changed.length) {
        return `<section class="panel"><div class="section-title"><h2>和上一段时间比</h2></div><p class="muted">目前没有可比的变化。只有同一个指标、同样长的时间段、两边记录都够，才会做比较；记录不够或时间段不同就不比，变化为 0 也不占地方。</p></section>`;
    }
    const rows = changed.slice(0, 8);
    return `<section class="panel"><div class="section-title"><h2>与上一周期相比</h2><span class="subtle">只列有变化的可比项</span></div>
      <div class="diag-compare diag-compare-head"><span>指标</span><span>上一周期</span><span>本周期</span><span>变化</span></div>
      <div class="diag-compare">${rows.map(c => {
        const m = payload.metrics.find(x => x.id === c.metricId);
        return `<div class="diag-compare-row">
          <span>${esc(c.label)}</span>
          <span>${esc(fmtMetricValue(m, c.previous))}</span>
          <span>${esc(fmtMetricValue(m, c.current))}</span>
          <b class="${c.delta! > 0 ? 'up' : 'down'}">${esc(fmtDelta(m, c.delta!))}</b>
        </div>`;
    }).join('')}</div>
      <p class="hint">差值只说明两个时间段不一样，不能说明原因；材料不同、用过的提示不同，就不要比高低。</p>
    </section>`;
}
function fmtMetricValue(m: MetricValue | undefined, v: number | null): string {
    if (v === null)
        return '—';
    if (!m || m.kind === 'rate')
        return `${Math.round(v * 100)}%`;
    if (m.id === 'vocab.retrievalMs')
        return `${Math.round(v)} ms`;
    if (m.kind === 'duration')
        return `${Math.round(v)} 分钟`;
    if (m.kind === 'index')
        return v.toFixed(2).replace(/\.00$/, '');
    return String(Math.round(v));
}
function fmtDelta(m: MetricValue | undefined, v: number): string {
    const sign = v > 0 ? '+' : '−';
    const abs = Math.abs(v);
    if (!m || m.kind === 'rate')
        return `${sign}${Math.round(abs * 100)} 个百分点`;
    if (m.id === 'vocab.retrievalMs')
        return `${sign}${Math.round(abs)} ms`;
    if (m.kind === 'duration')
        return `${sign}${Math.round(abs)} 分钟`;
    if (m.kind === 'index')
        return `${sign}${abs.toFixed(2)}`;
    return `${sign}${Math.round(abs)}`;
}
function planBlock(payload: DiagnosticPayload): string {
    return `<section class="panel diag-plan"><div class="section-title"><h2>接下来可以做什么</h2><span class="subtle">只是建议，不会自动改计划</span></div>
      ${payload.plan.map(p => `<div class="diag-plan-row">
        <div><b>${esc(p.title)}</b><p class="muted">${esc(p.reason)}</p></div>
        <div class="diag-plan-side"><span>${p.minutes} 分钟</span><button class="text-button" data-diag-action="${esc(p.actionKind)}" data-diag-target="${esc(p.targetId ?? '')}">去完成</button></div>
      </div>`).join('')}
      <p class="hint">这些都是建议；真正排进今天还要看你有多少时间，这里不会偷偷加量。</p>
    </section>`;
}
function history(data: Data): string {
    const snaps = [...data.skillSnapshots].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
    const weeks = [...data.weeklyDiagnostics].sort((a, b) => b.createdAt - a.createdAt).slice(0, 4);
    return `<section class="panel"><div class="section-title"><h2>历史快照</h2><span class="subtle">同一天重复生成会覆盖</span></div>
      ${snaps.length ? `<div class="diag-history">${snaps.map(s => `<button class="text-button" data-diag-snap="${esc(s.id)}">${esc(s.date)} · ${s.diagnostics?.bottleneck ? esc(s.diagnostics.bottleneck.label) : '无短板结论'}</button>`).join('')}</div>` : '<p class="muted">还没有快照。</p>'}
      ${weeks.length ? `<p class="hint">周诊断：${weeks.map(w => esc(w.weekOf)).join(' · ')}</p>` : ''}
    </section>`;
}
export interface DiagnosticsPageInput {
    data: Data;
    payload: DiagnosticPayload;
    days: number;
    generatedAt: number | null;
    source: 'live' | 'snapshot' | 'weekly';
    weekly?: WeeklyDiagnostic;
}
export function diagnosticsPage(input: DiagnosticsPageInput): string {
    const { payload } = input;
    const domains = (['vocabulary', 'grammar', 'reading', 'input', 'output', 'translation', 'exam'] as const);
    return `${`<div class="page-title"><div><div class="eyebrow">学习报告</div><h1>学习报告</h1><p>看最近 ${input.days} 天 · 只看你做了什么，不给英语总分</p></div><div class="actions"><button id="diag-snapshot" class="secondary">保存今天的报告</button><button id="diag-week" class="primary">生成本周报告</button></div></div>`}
      <div class="diag-range"><label>看最近<select id="diag-days">${[7, 14, 30].map(d => `<option value="${d}" ${d === input.days ? 'selected' : ''}>最近 ${d} 天</option>`).join('')}</select></label>
        <span class="muted">${input.source === 'snapshot' ? '正在看当时存下的报告' : input.source === 'weekly' ? `本周报告（${esc(input.weekly?.weekOf ?? '')}）` : '实时预览，不另存报告'}${input.generatedAt ? ` · 生成于 ${date(input.generatedAt)}` : ''}</span></div>
      ${verdict(payload)}
      <section class="panel diag-evidence"><div class="section-title"><h2>记录从哪来</h2><span class="pill">${esc(QUALITY_LABEL[payload.evidence.quality])}</span></div>
        <p>${esc(payload.evidence.note)}</p>
        ${evidenceBar(payload.evidence)}
        <div class="diag-evidence-row"><span title="有标准答案或可核对条目">可核对<b>${payload.evidence.verified}</b></span><span title="真实做题/阅读/表达行为留下的记录">行为<b>${payload.evidence.taskBehavior}</b></span><span title="用户自报的理解度、标记或评价">自评<b>${payload.evidence.selfReport}</b></span><span title="系统推测，仅供参考">推断<b>${payload.evidence.inferred}</b></span><span title="记录来源的种类数">来源<b>${payload.evidence.distinctSources} 类</b></span></div>
      </section>
      <section class="panel diag-retention"><div class="section-title"><h2>还记得多少</h2><span class="subtle">1 天 / 7 天 / 30 天</span></div>
        <p>${esc(retentionLine(payload.retention))}</p>
        <div class="diag-retention-row">${payload.retention.map(p => `<div class="${p.evaluable ? '' : 'is-empty'}"><b>${p.label}</b><strong>${p.evaluable ? `${Math.round((p.rate ?? 0) * 100)}%` : '样本不足'}</strong><small>${p.correct}/${p.total}</small></div>`).join('')}</div>
        <p class="hint">只算第一天学过之后第 1、7、30 天前后那一次复习；错过的不补算，也不估算。</p>
      </section>
      <div class="diag-domains">${domains.map(d => domainCard(d, payload.metrics)).join('')}</div>
      ${comparisonBlock(payload)}
      ${planBlock(payload)}
      <section class="panel diag-disclaimer"><h2>边界</h2><p>${esc(payload.disclaimer)}</p><p class="hint">这一页的结论都来自你本地的记录，不联网也能看。AI 写的解释会标成“未核实”，不算你已经掌握。</p></section>
      ${history(input.data)}`;
}
