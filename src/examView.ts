// —— Phase 11：考试迁移 UI（纯 HTML，所有用户文本 esc）——
// 设计底线：不制造“官方分数”；来源/评分状态/不确定性始终显示。
import type { AssessmentItem, ExamLog, ExamSession, ExamSpecification, WeeklyAssessmentReport } from './examTypes.ts';
import type { Data } from './types.ts';
import { esc, date } from './ui.ts';
import { examCategoryLabel, statusLabel } from './examSpecification.ts';
import { errorCategoryLabel, errorSubcategoryLabel, errorSummary } from './examErrors.ts';
import { itemProvenanceLabel, verifiedLabel } from './examItems.ts';
import { scoreStatusLabel, sessionProgress } from './examSession.ts';
const fmtDate = (t: number) => new Date(t).toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
export function examOverviewHtml(d: Data, specs: ExamSpecification[], items: AssessmentItem[], sessions: ExamSession[], logs: ExamLog[], planEnabled: boolean): string {
    const cards = specs.map(s => {
        const count = items.filter(i => i.examCategory === s.examCategory).length;
        const sourceLinks = s.sourceRefs.length ? s.sourceRefs.map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noreferrer">${esc(r.title)}</a><span>${esc(r.issuingAuthority)} · ${esc(r.publishedAt || '无日期')} · ${esc(r.sourceType)}</span></li>`).join('') : '<li>暂无官方来源；不能声称已确认。</li>';
        return `<article class="exam-spec ${s.status}">
            <div class="exam-spec-head"><div><span class="eyebrow">${esc(examCategoryLabel(s.examCategory))}</span><h3>${s.applicableYear} · ${esc(statusLabel(s.status))}</h3></div><span class="badge ${s.status}">${s.totalScore === null ? '总分待确认' : `${s.totalScore} 分`}</span></div>
            <p>${esc(s.notes[0] ?? '')}</p>
            <div class="exam-source-line"><b>来源</b>：${s.sourceRefs.length ? s.sourceRefs.map(r => esc(r.issuingAuthority)).filter((v, i, a) => a.indexOf(v) === i).join('、') : '暂无（不可声称官方确认）'}${s.publishedAt ? ` · ${esc(s.publishedAt)}` : ''}</div>
            <dl class="exam-facts"><div><dt>笔试</dt><dd>${s.writtenScore === null ? '待确认' : `${s.writtenScore} 分`}</dd></div><div><dt>听说</dt><dd>${s.listeningSpeakingScore === null ? '待确认' : `${s.listeningSpeakingScore} 分`}</dd></div><div><dt>时长</dt><dd>${s.writtenDurationMinutes === null ? '待确认' : `${s.writtenDurationMinutes} 分钟`}</dd></div><div><dt>题库</dt><dd>${count} 题</dd></div></dl>
            <details><summary>来源与核验</summary><ul class="exam-sources">${sourceLinks}</ul><p class="hint">核验时间：${s.verifiedAt ? fmtDate(s.verifiedAt) : '未记录'} · 置信度：${esc(s.confidence)}</p></details>
        </article>`;
    }).join('');
    return `<section class="panel exam-intro"><div class="section-title"><h2>考试迁移</h2><span class="subtle">本地 · 不联网评分</span></div>
        <p class="lede">这里只做迁移证据：做新题、看错因、隔几天再测。它不预测高考分数，也不把一次正确当成掌握。</p>
        <div class="exam-warning"><strong>2028 规则尚未公布。</strong> 2026 的 115+35 是已确认的历史规则，不能直接当作 2028 的确定结构；本页用“暂定/未知”标出未确认内容，不用默认值填空。</div>
        <div class="exam-actions"><button class="primary" id="exam-start-mixed">开始混合练习</button><button class="secondary" id="exam-start-weekly">生成本周周测</button><label class="switch-line"><input type="checkbox" id="exam-plan-toggle" ${planEnabled ? 'checked' : ''}> ${planEnabled ? '当前已开启：每日计划最多安排 1 道考试题' : '把 1 道考试题加入每日计划（默认关闭）'}</label></div>
        <p class="hint">练习只使用题库中<strong>未做过</strong>的题；做过就换题，不用重复题冒充进步。</p>
    </section>
    <div class="exam-spec-grid">${cards}</div>`;
}
export function examPracticeListHtml(items: AssessmentItem[], sessions: ExamSession[]): string {
    const used = new Set(sessions.flatMap(s => s.itemIds));
    const fresh = items.filter(i => !used.has(i.id) && !(i.questionType === 'listening' && !i.audioUrl));
    const groups = new Map<string, AssessmentItem[]>();
    for (const i of fresh) {
        const k = i.questionType;
        if (!groups.has(k))
            groups.set(k, []);
        groups.get(k)!.push(i);
    }
    const rows = [...groups].map(([type, list]) => `<tr><td>${esc(type)}</td><td>${list.length}</td><td>${list.filter(i => i.options.length).length} 可自动评分</td><td>${esc(itemProvenanceLabel(list[0].provenance))}</td><td>${esc(verifiedLabel(list[0].verifiedStatus))}</td><td>${list.slice(0, 2).map(i => `<button class="text-button exam-pick" data-item="${esc(i.id)}">做这题</button>`).join(' ')}</td></tr>`).join('');
    return `<section class="panel"><div class="section-title"><h2>可用新题</h2><span class="subtle">${fresh.length} 题</span></div>
        ${fresh.length ? `<table class="exam-table"><thead><tr><th>题型</th><th>未做</th><th>可评分</th><th>来源</th><th>审核</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="empty-note">没有未做过的题。系统不会重复出题；可以导入自己的材料或等待新题库。</p>'}
        <p class="hint">听力题没有音频时不会出现在这里，避免“假装听过”。</p></section>`;
}
export function examSessionHtml(session: ExamSession, index: number, draft: string): string {
    const item = session.items[index];
    if (!item)
        return '<p class="empty-note">这次测评没有题目。</p>';
    const prog = sessionProgress(session);
    const options = item.options.map(o => `<label class="exam-option ${draft === o.id ? 'selected' : ''}"><input type="radio" name="exam-answer" value="${esc(o.id)}" ${draft === o.id ? 'checked' : ''}><span class="exam-option-id">${esc(o.id)}</span><span>${esc(o.text)}</span></label>`).join('');
    const input = item.options.length
        ? `<div class="exam-options">${options}</div>`
        : `<textarea id="exam-answer-text" rows="${item.questionType === 'short_output' || item.questionType === 'situational_writing' ? 9 : 5}" placeholder="用英语作答；系统不会把 AI 或自评当成官方分数。">${esc(draft)}</textarea>`;
    const meta = `<div class="exam-item-meta"><span>${esc(item.questionType)}</span><span>${item.pointValue > 0 ? `${item.pointValue} 分` : '不计客观分'}</span><span>${esc(itemProvenanceLabel(item.provenance))}</span><span>${esc(verifiedLabel(item.verifiedStatus))}</span></div>`;
    return `<section class="panel exam-session"><div class="exam-progress"><div><strong>${prog.answered}/${prog.total}</strong> 已答 · 第 ${index + 1} 题</div><div class="track"><i style="width:${prog.ratio * 100}%"></i></div><span>建议 ${session.timeLimitMinutes} 分钟</span></div>
        ${meta}<h2 class="exam-stem">${esc(item.stem).replace(/\n/g, '<br>')}</h2>${input}
        <div class="exam-nav"><button class="secondary" id="exam-prev" ${index === 0 ? 'disabled' : ''}>上一题</button><button class="secondary" id="exam-next" ${index >= session.items.length - 1 ? 'disabled' : ''}>下一题</button><button class="text-button" id="exam-save">保存并留在此题</button><button class="primary" id="exam-submit">提交测评</button></div>
        <p class="hint">答案自动保存在本地；刷新会恢复。提交后客观题才评分，开放题只显示 rubric，不冒充已评分。</p></section>`;
}
export function examResultHtml(session: ExamSession): string {
    const correct = session.items.filter(i => i.options.length && session.answers[i.id]?.value === i.answerKey).length;
    const objective = session.items.filter(i => i.options.length && i.answerKey).length;
    const errors = session.errors.length ? session.errors.map(e => `<article class="exam-error"><div><span class="badge ${e.confidence}">${esc(errorCategoryLabel(e.category))} · ${esc(errorSubcategoryLabel(e.subcategory))}</span><span class="hint">置信度 ${esc(e.confidence)}${e.userReported ? ' · 用户自报' : ''}</span></div><h4>${esc(e.explanation)}</h4>${e.alternatives.length ? `<p class="hint">也可能是：${e.alternatives.map(a => esc(errorCategoryLabel(a.category))).join(' / ')}</p>` : ''}<p>${esc(e.intervention)}</p><label>修正错因<select class="exam-correct" data-item="${esc(e.itemId)}">${(['vocabulary', 'structure', 'logic', 'evidence', 'overthinking', 'time_pressure', 'uncertain'] as const).map(c => `<option value="${c}" ${c === e.category ? 'selected' : ''}>${esc(errorCategoryLabel(c))}</option>`).join('')}</select></label></article>`).join('') : '<p>没有可归因的错题。</p>';
    return `<section class="panel exam-result"><div class="section-title"><h2>测评结果</h2><span class="badge">${esc(scoreStatusLabel(session.scoreStatus))}</span></div>
        <div class="exam-score"><strong>${session.score === null ? '—' : session.score}</strong><span>/ ${session.maxScore} 客观分</span><small>${esc(session.review || '')}</small></div>
        <p class="hint">客观题 ${correct}/${objective} 正确。${session.scoreStatus === 'partial' ? '含开放题，因此只有部分分，不是整卷成绩。' : ''} 这里没有官方分数，也没有预测分。</p>
        <h3>错因复盘 <span class="subtle">${esc(errorSummary(session.errors))}</span></h3>${errors}
        <div class="exam-actions"><button class="primary" id="exam-complete">完成复盘</button><button class="secondary" id="exam-retest">做一道同类新题</button><button class="text-button" id="exam-back">返回考试首页</button></div>
        <p class="hint">复测只换新题验证迁移；一次做对不等于掌握，也不直接改写词汇掌握度。</p></section>`;
}
export function weeklyPanelHtml(build: {
    items: AssessmentItem[];
    minutes: number;
    unavailable: {
        section: string;
        reason: string;
    }[];
}, session: ExamSession | null, report: WeeklyAssessmentReport | null): string {
    const sections = build.items.map(i => `<li><strong>${esc(i.questionType)}</strong><span>${i.estimatedTimeMinutes} 分钟</span><small>${esc(itemProvenanceLabel(i.provenance))}</small></li>`).join('');
    const missing = build.unavailable.map(u => `<li class="missing"><strong>${esc(u.section)}</strong><span>${esc(u.reason)}</span></li>`).join('');
    if (report)
        return `<section class="panel"><div class="section-title"><h2>周测报告</h2><span class="badge">本地</span></div><p>客观题 ${report.objectiveCorrect}/${report.objectiveTotal}；本次 ${report.minutes} 分钟。${report.selfReportedDependence ? `翻译依赖自评：${esc(report.selfReportedDependence)}。` : ''}</p><p class="hint">${esc(report.evidenceNote)}</p></section>`;
    return `<section class="panel"><div class="section-title"><h2>本周周测</h2><span class="subtle">15–25 分钟</span></div><p class="lede">周测用真实词库和未读文章；没有的部分直接标未生成，不拿编造材料凑满。</p>
        <div class="two-col"><div><h3>将包含</h3><ul class="exam-weekly-list">${sections || '<li>暂无可生成部分</li>'}</ul></div><div><h3>不生成</h3><ul class="exam-weekly-list">${missing || '<li>无</li>'}</ul></div></div>
        <p class="hint">预定 ${build.minutes} 分钟。启动时生成固定题目快照；刷新不会换题。</p>
        ${session ? `<button class="primary" id="exam-resume-weekly">继续周测</button>` : `<button class="primary" id="exam-start-weekly-now" ${build.items.length < 3 ? 'disabled' : ''}>开始周测</button>`}</section>`;
}
export function examLogsHtml(logs: ExamLog[], specs: ExamSpecification[]): string {
    const rows = logs.slice().sort((a, b) => b.date.localeCompare(a.date)).map(l => `<tr><td>${esc(l.date)}</td><td>${esc(examCategoryLabel(l.examCategory))}</td><td>${l.reportedScore}/${l.fullScore}</td><td>${esc(l.selfAssessment)}</td><td><button class="text-button exam-log-del" data-log="${esc(l.id)}">删除</button></td></tr>`).join('');
    return `<section class="panel"><div class="section-title"><h2>学校考试记录</h2><span class="subtle">自报 · 非系统验证</span></div>
        <div class="exam-log-form"><label>日期<input type="date" id="log-date" value="${new Date().toISOString().slice(0, 10)}"></label><label>考试<select id="log-category">${specs.map(s => `<option value="${esc(s.examCategory)}">${esc(examCategoryLabel(s.examCategory))} ${s.applicableYear}</option>`).join('')}<option value="other">其他</option></select></label><label>得分<input type="number" id="log-score" min="0" step="0.5" placeholder="如 102"></label><label>满分<input type="number" id="log-full" min="1" step="0.5" value="150"></label><label>自评<input type="text" id="log-note" maxlength="200" placeholder="如：阅读时间不够"></label><button class="primary" id="log-add">保存记录</button></div>
        <p class="hint">学校分数是你提供的事实记录，不是系统测出来的；系统不会用它反推掌握度或预测下次分数。</p>
        ${rows ? `<table class="exam-table"><thead><tr><th>日期</th><th>考试</th><th>分数</th><th>自评</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="empty-note">还没有学校考试记录。</p>'}</section>`;
}
export function specsAuditHtml(specs: ExamSpecification[], items: AssessmentItem[]): string {
    return `<section class="panel"><div class="section-title"><h2>规格审计</h2><span class="subtle">来源优先于记忆</span></div>
        <table class="exam-table"><thead><tr><th>年份</th><th>类别</th><th>状态</th><th>总分</th><th>来源</th><th>题目</th></tr></thead><tbody>${specs.map(s => `<tr><td>${s.applicableYear}</td><td>${esc(examCategoryLabel(s.examCategory))}</td><td>${esc(statusLabel(s.status))}</td><td>${s.totalScore ?? 'null'}</td><td>${s.sourceRefs.length}</td><td>${items.filter(i => i.examCategory === s.examCategory).length}</td></tr>`).join('')}</tbody></table>
        <p class="hint">规格与题目均版本化保存在本地；2028 没有官方文件时，所有未知字段保持 null，不用默认值填空。</p></section>`;
}
