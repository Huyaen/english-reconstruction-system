// —— Phase 7：Mini Unit 视图（只产出 HTML，不碰 IO）——
import type { Data, InterestProfile, MiniUnit, UnitEvidenceSummary } from './types.ts';
import type { ThemeRecommendation } from './miniUnitSelection.ts';
import type { DayPlanSpec } from './miniUnitProgression.ts';
import { completedDays, dayKind, dayLabel, nextDay, plannedDays, readiness, stageOf, UNIT_RULES } from './miniUnit.ts';
import { esc } from './ui.ts';
const STAGE_LABEL: Record<string, string> = {
    draft: '草稿（还没有真实 Anchor）',
    ready: '已就绪',
    active: '进行中',
    paused: '已暂停',
    completed: '已完成',
    abandoned: '已放弃',
};
const PROVENANCE_LABEL: Record<string, string> = {
    authentic_external: '真实外部材料',
    user_imported_authentic: '你导入的真实材料',
    curated_authentic: '精选真实材料',
    ai_generated: 'AI 生成（只能做强化材料）',
    authored_educational: '教学编写材料',
    unknown: '来源未知',
};
const SUPPORT_LABEL = { high: '高（允许中文解释）', medium: '中（少量中文）', low: '低（先独立理解）' } as const;
export function unitNavBadge(unit: MiniUnit | null): string {
    if (!unit)
        return '';
    const s = stageOf(unit);
    if (s === 'completed' || s === 'abandoned')
        return '';
    return String(Math.min(UNIT_RULES.maxDays, completedDays(unit).length + 1));
}
/** 没有进行中的单元：主题推荐 / 创建入口 */
export function unitCreatePage(input: {
    data: Data;
    recommendations: ThemeRecommendation[];
    note: string;
    customTopic: string;
    interest: {
        profile: InterestProfile;
        sufficient: boolean;
        sampleSize: number;
    };
    suggested?: {
        label: string;
    }[];
}): string {
    const authentic = input.data.passages.filter(p => p.sourceType !== 'ai' && p.sourceType !== 'ai_reinforcement');
    const cards = input.recommendations.map((r, i) => `
    <article class="panel unit-theme" data-theme="${esc(r.themeId)}">
      <div class="unit-theme-head">
        <div><div class="section-title">${esc(r.theme)}</div><p class="muted">${esc(r.topic)}</p></div>
        <span class="pill ${r.exploration ? 'warn' : ''}">${esc(r.reasonZh)} · ${esc(r.reasonTag)}</span>
      </div>
      <p>${esc(r.whyRecommended)}</p>
      <p class="muted">${r.repeat ? '⚠ 刚完成过同主题单元：这条推荐已降权，避免重复相似内容。' : ''}${r.insufficientEvidence ? ' 学情证据有限。' : ''} · 约 ${r.estimatedLearningDays} 天</p>
      <div class="ai-targets">
        <span class="muted">目标词 ${r.targetWords.length} 个：</span>
        ${r.targetWords.slice(0, 8).map(w => `<span class="chip">${esc(w.word)}</span>`).join('') || '<span class="muted">（词库尚未覆盖材料中的生词）</span>'}
      </div>
      <div class="ai-targets">
        <span class="muted">目标语法：</span>
        ${r.targetGrammar.map(g => `<span class="chip ${g.status === 'candidate' ? 'warn' : ''}">${esc(g.name)}${g.status === 'candidate' ? '（候选）' : ''}</span>`).join('') || '<span class="muted">材料中未找到可观察结构</span>'}
      </div>
      <ul class="unit-materials">${r.basis.materials.map(m => `<li>${esc(m.title)} · ${m.wordCount} 词 · ${esc(PROVENANCE_LABEL[m.provenance] ?? m.provenance)}</li>`).join('')}</ul>
      <div class="row">
        <button class="primary" data-unit-create="${esc(r.themeId)}">用这个主题开始</button>
        <button data-unit-preview="${i}">查看目标词来源</button>
      </div>
      <div class="unit-preview" id="unit-preview-${i}" hidden>
        <ul>${r.targetWords.map(w => `<li><b>${esc(w.word)}</b> — ${esc(w.reason)}</li>`).join('') || '<li>没有来自你词库的目标词</li>'}</ul>
        <p class="muted">目标语法证据：${r.targetGrammar.map(g => esc(`${g.name}（${g.evidence}）`)).join('；') || '无'}</p>
      </div>
    </article>`).join('');
    return `
    <div class="page-head">
      <h1>Mini Unit · 主题学习单元</h1>
      <p class="muted">围绕一份真实材料，连续 2–4 个学习日：建立理解 → 强化 → 脱离辅助 → 迁移 → 评估。不是一张三日任务表。</p>
    </div>
    ${input.note ? `<div class="callout">${esc(input.note)}</div>` : ''}
    ${input.recommendations.length ? cards : `
      <section class="panel">
        <div class="section-title">还没有可用的主题</div>
        <p>阅读库里没有真实英文材料，系统不会凭空推荐，也不会用 AI 文章冒充 Anchor。</p>
        <ol class="unit-steps">
          <li>去「阅读」页粘贴一段真实英文，或上传文件 / 截图 OCR / 添加真实 URL</li>
          <li>材料进入阅读库后，这里会出现基于真实材料的主题推荐</li>
        </ol>
        <button class="primary" data-unit-open-reading>去阅读库添加材料</button>
      </section>`}
    <section class="panel">
      <div class="section-title">兴趣画像 · Dynamic Interest</div>
      <p class="muted">兴趣只决定“先给你看什么”，不代表英语能力。默认分类只是建议，不是白名单：你可以添加、改名、删除任何主题，也可以随时选与画像无关的材料。</p>
      <div class="ai-targets" id="interest-list">
        ${input.interest.profile.topics.length
        ? input.interest.profile.topics.map(t => `<span class="chip interest" data-interest-chip="${esc(t.id)}">${esc(t.label)}${t.weight >= 0.8 ? ' ★' : ''}<button class="chip-x" data-interest-del="${esc(t.id)}" title="删除">×</button></span>`).join('')
        : '<span class="muted">还没有设置兴趣：推荐只依据材料与真实行为。</span>'}
      </div>
      <div class="row">
        <input id="interest-new" placeholder="添加任意兴趣（例如：中世纪城市 / 独立游戏 / 机器学习史）">
        <button data-interest-add>添加</button>
        <button data-interest-reset>重置画像</button>
      </div>
      <div class="ai-targets">
        <span class="muted">建议（点一下加入，也可以完全不用）：</span>
        ${(input.suggested ?? []).filter(x => !input.interest.profile.topics.some(t => t.label === x.label)).map(x => `<span class="chip" data-interest-suggest="${esc(x.label)}">${esc(x.label)}</span>`).join('') || '<span class="muted">已全部加入</span>'}
      </div>
      <p class="muted">行为证据：${input.interest.sampleSize} 条（近 30 天真实阅读/导入/单元）。${input.interest.sufficient ? '近期行为可以参与排序，但不会永久改变你的显式偏好。' : '不足 3 条，推荐不会声称精准个性化。'} · 探索比例 ${Math.round(input.interest.profile.exploration * 100)}%</p>
      <p class="muted">${input.interest.profile.resets ? `已重置 ${input.interest.profile.resets} 次。` : ''}兴趣 ≠ 能力：它不会改变难度估计、掌握度或计划时长。</p>
    </section>
    <section class="panel">
      <div class="section-title">自定义主题</div>
      <p class="muted">自定义主题仍然必须绑定一份真实 Anchor 材料；没有材料时只会创建草稿，不会开始学习日。</p>
      <div class="row">
        <input id="unit-custom-topic" placeholder="例如：机器学习发展史 / 竞技游戏解说 / 城市与河流" value="${esc(input.customTopic)}">
        <button data-unit-custom>创建草稿</button>
      </div>
      <p class="muted">当前阅读库：真实材料 ${authentic.length} 篇${input.data.passages.length - authentic.length ? ` · AI 生成 ${input.data.passages.length - authentic.length} 篇（不会作为 Anchor）` : ''}</p>
    </section>`;
}
/** 有单元：主界面 */
export function unitPage(input: {
    data: Data;
    unit: MiniUnit;
    spec: DayPlanSpec | null;
    evidence: UnitEvidenceSummary;
    now: number;
}): string {
    const { unit, spec, evidence } = input;
    const stage = stageOf(unit);
    const done = completedDays(unit);
    const day = nextDay(unit);
    const planned = plannedDays(unit);
    const anchor = input.data.passages.find(p => p.id === unit.anchorMaterialId);
    const dots = Array.from({ length: planned }, (_, i) => {
        const n = i + 1;
        const cls = done.includes(n) ? 'done' : n === day && stage === 'active' ? 'current' : '';
        return `<span class="unit-dot ${cls}" title="${esc(dayLabel(n))}">${n}</span>`;
    }).join('');
    const ready = readiness(unit);
    const actionBar = (() => {
        if (stage === 'completed' || stage === 'abandoned')
            return `<button data-unit-new>开始新的 Unit</button>`;
        if (stage === 'paused')
            return `<button class="primary" data-unit-resume>继续</button><button data-unit-abandon>放弃</button>`;
        if (stage === 'draft')
            return `<button class="primary" data-unit-pick-anchor>选择真实 Anchor</button><button data-unit-abandon>放弃草稿</button>`;
        const finishLabel = done.length >= UNIT_RULES.plannedDays ? '结束并评估' : '提前结束并评估';
        return `
          <button class="primary" data-unit-start>${done.includes(day) ? '查看今日安排' : `进入 ${esc(dayLabel(day))}`}</button>
          <button data-unit-complete="${day}" ${done.includes(day) ? 'disabled' : ''}>完成今天（Day ${day}）</button>
          <button data-unit-finish>${finishLabel}</button>
          <button data-unit-pause>暂停</button>
          ${done.length >= UNIT_RULES.plannedDays && planned < UNIT_RULES.maxDays ? '<button data-unit-extend>延长 Day 4</button>' : ''}
          <button data-unit-abandon>放弃</button>`;
    })();
    const history = (unit.dayHistory ?? []).map(d => `
      <li><b>Day ${d.day} · ${esc(d.kind)}</b> <span class="muted">${esc(d.calendarDate)} · 辅助 ${esc(SUPPORT_LABEL[d.supportLevel])}</span>
        <div>${esc(d.summary || '（无摘要）')}</div>
        <div class="muted">目标词覆盖：${d.targetWordsCovered.length ? esc(d.targetWordsCovered.join('、')) : '无'} · 证据 ${d.evidenceIds.length} 条</div>
      </li>`).join('');
    const focusHtml = spec ? `
      <section class="panel">
        <div class="section-title">${esc(spec.label)} · 今日重点</div>
        <p class="muted">辅助级别：${esc(SUPPORT_LABEL[spec.supportLevel])} · 中文${spec.translationAllowed ? '可用（但避免逐句翻译）' : '关闭：先独立理解'}</p>
        ${spec.warnings.map(w => `<div class="callout warn">${esc(w)}</div>`).join('')}
        <ul class="unit-focus">${spec.focus.map(f => `<li><b>${esc(f.title)}</b><span class="muted"> · ${f.minutes} 分钟</span><div class="muted">${esc(f.why)}</div></li>`).join('')}</ul>
        <p><b>今天用这份材料：</b>${spec.material.title ? `${esc(spec.material.title)}（${spec.material.kind === 'anchor' ? 'Anchor' : spec.material.kind === 'transfer' ? '新迁移材料' : '强化材料'}）— ${esc(spec.material.note)}` : '没有可用材料'}</p>
        ${evidence.mediaSessions?.length ? `<p class="muted">媒体输入只作为真实曝光记录（${evidence.mediaSessions.length} 次，${evidence.mediaMinutes ?? 0} 分钟自报），不计入迁移或掌握证据。</p>` : ''}
        ${evidence.outputAttempts?.length ? `<p class="muted">本单元已有 ${evidence.outputAttempts.length} 次真实表达（其中 ${evidence.outputIndependent ?? 0} 次含独立证据）；表达不会自动算完成学习日。</p>` : ''}
      <p class="muted">完成标准：${spec.evidenceGoal.map(g => esc(g)).join('；')}。只有真实作答才算完成，打开页面不算。</p>
        ${spec.material.passageId ? `<button data-unit-open-reading="${esc(spec.material.passageId)}">打开这份材料</button>` : ''}
        ${spec.aiOptional ? `<button data-unit-ai="${esc(spec.aiOptional.kind)}">${spec.aiOptional.kind === 'sentence' ? 'AI 补充例句（可选）' : 'AI 强化短文（可选）'}</button><span class="muted"> · ${esc(spec.aiOptional.reason)}</span>` : ''}
      </section>` : '';
    const evaluation = unit.completionEvaluation;
    const evalHtml = evaluation ? `
      <section class="panel">
        <div class="section-title">完成评价 · ${esc(evaluation.decision)}</div>
        <p class="muted">置信度：${esc(evaluation.confidence)} · ${new Date(evaluation.at).toLocaleString('zh-CN')}</p>
        <ul>${evaluation.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
        <p><b>建议下一步：</b>${evaluation.nextActions.map(a => esc(a)).join('；') || '无'}</p>
        <div class="metrics">
          ${metric('目标词覆盖', `${evaluation.metrics.targetWordsCovered}/${evaluation.metrics.targetWordTotal}`)}
          ${metric('独立回忆', String(evaluation.metrics.independentRecallEvidence))}
          ${metric('语法证据', String(evaluation.metrics.grammarEvidence))}
          ${metric('学习日', String(evaluation.metrics.completedLearningDays))}
          ${metric('迁移结果', evaluation.metrics.transferResult === null ? '无' : `${Math.round(evaluation.metrics.transferResult * 100)}%`)}
        </div>
      </section>` : '';
    return `
    <div class="page-head">
      <h1>${esc(unit.theme)}</h1>
      <p class="muted">${esc(unit.topic || '')} · ${esc(STAGE_LABEL[stage] ?? stage)} · 计划 ${planned} 个学习日</p>
    </div>
    <section class="panel">
      <div class="unit-progress">
        <div class="unit-dots">${dots}</div>
        <div class="muted">有效学习日 ${done.length}/${planned}${done.length ? ` · 已完成：${done.join('、')}` : ''}</div>
      </div>
      <div class="row">${actionBar}</div>
      <div id="unit-day-summary" hidden class="unit-summary">
        <input id="unit-summary-input" placeholder="今天读懂了什么？（可选，会写进这个学习日的记录）">
        <span class="muted">只有真实作答/精读/阅读会话才会被算作完成；写摘要本身不算证据。</span>
      </div>
      ${!ready.ok && stage !== 'completed' && stage !== 'abandoned' ? `<div class="callout warn">还不能开始：${esc(ready.missing.join('；'))}</div>` : ''}
    </section>
    <section class="panel">
      <div class="section-title">Anchor Material</div>
      ${anchor ? `<p><b>${esc(anchor.title)}</b> · ${anchor.wordCount} 词 · ${esc(PROVENANCE_LABEL[unit.anchorProvenance ?? 'unknown'] ?? '')}</p>
        <p class="muted">${esc(anchor.topic || '')} ${anchor.difficulty ? `· 难度：${esc(anchor.difficulty)}` : ''} ${unit.anchorSnapshotRef ? `· 快照 ${esc(unit.anchorSnapshotRef)}` : ''}</p>
        <button data-unit-open-reading="${esc(anchor.id)}">打开 Anchor</button>`
        : '<p>还没有绑定真实材料。AI 生成文章不能作为 Anchor。</p>'}
    </section>
    <section class="panel">
      <div class="section-title">目标词汇与语法</div>
      <div class="ai-targets"><span class="muted">目标词（${unit.targetWords.length}）：</span>${unit.targetWords.map(w => `<span class="chip ${evidence.wordsIndependent.includes(w) ? 'ok' : evidence.wordsCovered.includes(w) ? '' : 'warn'}">${esc(w)}</span>`).join('') || '<span class="muted">无</span>'}</div>
      <ul class="unit-grammar">${(unit.grammarTargets ?? unit.targetGrammar.map(id => ({ conceptId: id, name: id, status: 'candidate' as const, evidence: '' }))).map(g => `<li><b>${esc(g.name)}</b> <span class="pill ${g.status === 'candidate' ? 'warn' : ''}">${g.status === 'verified' ? '材料中已核验' : '候选'}</span><div class="muted">${esc(g.evidence)}</div></li>`).join('') || '<li class="muted">无</li>'}</ul>
    </section>
    ${focusHtml}
    <section class="panel">
      <div class="section-title">已完成的学习日</div>
      ${history ? `<ul class="unit-history">${history}</ul>` : '<p class="muted">还没有完成任何学习日。完成一天需要至少一条真实活动证据。</p>'}
    </section>
    <section class="panel">
      <div class="section-title">当前状态（来自真实记录）</div>
      <div class="metrics">
        ${metric('目标词覆盖', `${evidence.wordsCovered.length}/${unit.targetWords.length}`)}
        ${metric('独立回忆', String(evidence.independentRecall))}
        ${metric('句子作答', String(evidence.sentenceAttempts))}
        ${metric('阅读会话', String(evidence.anchorSessions.length + evidence.transferSessions.length))}
        ${metric('AI 材料', String(evidence.generations.length))}
        ${metric('真实媒体（曝光）', evidence.mediaSessions?.length ? `${evidence.mediaSessions.length} 次 · ${evidence.mediaMinutes ?? 0} 分钟` : '0')}
        ${metric('真实表达', evidence.outputAttempts?.length ? `${evidence.outputAttempts.length} 次` : '0')}
      </div>
      ${evidence.obstacles.length ? `<p><b>未解决：</b>${evidence.obstacles.map(o => esc(o)).join('；')}</p>` : '<p class="muted">暂无记录的未解决障碍</p>'}
      ${unit.baseline ? `<p class="muted">冷测基线：${new Date(unit.baseline.at).toLocaleString('zh-CN')} · 来源 ${unit.baseline.source === 'cold_test' ? '真实冷测' : '估计'}${unit.baseline.comprehension === null ? '' : ` · 理解 ${Math.round(unit.baseline.comprehension * 100)}%`}</p>` : '<p class="muted">还没有冷测基线：Day 1 的冷测必须在详细预教之前完成。</p>'}
      ${unit.transfer ? `<p class="muted">迁移记录：${unit.transfer.materialKind === 'authentic' ? '真实新材料' : 'AI 强化材料'} · ${unit.transfer.independent ? '独立完成' : '有辅助'} · 材料 ${esc(input.data.passages.find(p => p.id === unit.transfer?.passageId)?.title ?? '已删除')}</p>` : ''}
    </section>
    ${evalHtml}`;
}
function metric(label: string, value: string, hint = ''): string {
    return `<div class="metric"><span>${esc(label)}</span><b>${esc(value)}</b>${hint ? `<small>${esc(hint)}</small>` : ''}</div>`;
}
/** 选择 Anchor 的对话框内容 */
export function anchorPicker(input: {
    data: Data;
    unit: MiniUnit;
}): string {
    const rows = input.data.passages
        .filter(p => p.sourceType !== 'ai' && p.sourceType !== 'ai_reinforcement')
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 20);
    return `<h2>选择真实 Anchor 材料</h2>
    <p class="muted">只列出阅读库中的真实材料；AI 生成文章不会出现在这里。</p>
    ${rows.length ? `<ul class="unit-anchors">${rows.map(p => `<li>
        <div><b>${esc(p.title)}</b><div class="muted">${p.wordCount} 词 · ${esc(p.topic || '未标主题')} · ${esc(PROVENANCE_LABEL[provenanceLabelKey(p.sourceType)] ?? '')}</div></div>
        <button data-unit-anchor="${esc(p.id)}">用它作为 Anchor</button></li>`).join('')}</ul>`
        : '<p>阅读库还没有真实材料。先去「阅读」页导入一篇。</p>'}`;
}
function provenanceLabelKey(sourceType: string): string {
    if (sourceType === 'ai' || sourceType === 'ai_reinforcement')
        return 'ai_generated';
    if (sourceType === 'url' || sourceType === 'web_article')
        return 'authentic_external';
    if (sourceType === 'recommended' || sourceType === 'curated_real_material')
        return 'curated_authentic';
    return 'user_imported_authentic';
}
export function dayKindLabel(day: number): string {
    const k = dayKind(day);
    return k === 'build' ? '建立理解' : k === 'strengthen' ? '强化' : k === 'transfer' ? '迁移' : '额外强化';
}
