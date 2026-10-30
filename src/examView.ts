// —— Phase 11：考试迁移 UI（纯 HTML，所有用户文本 esc）——
// 设计底线：不制造“官方分数”；来源/评分状态/不确定性始终显示。
import type { AssessmentItem, ExamLog, ExamSession, ExamSpecification, WeeklyAssessmentReport } from './examTypes.ts';
import { EXAM_LOG_TYPES, examLogCategoryLabel, examLogSpecLabel, examLogTypeLabel, examLogTypeOf } from './examLog.ts';
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
    return `<section class="panel exam-intro"><div class="section-title"><h2>考试练习</h2><span class="subtle">本地 · 不联网评分</span></div>
        <p class="lede">换新题、看错因、隔几天再测。不预测高考分数，答对一次也不算掌握。</p>
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
    const meta = `<div class="exam-item-meta" data-src="${esc(item.provenance)}" data-verified="${esc(item.verifiedStatus)}"><span>${esc(item.questionType)}</span><span>${item.pointValue > 0 ? `${item.pointValue} 分` : '不计客观分'}</span><span data-src="${esc(item.provenance)}">${esc(itemProvenanceLabel(item.provenance))}</span><span>${esc(verifiedLabel(item.verifiedStatus))}</span></div>`;
    return `<section class="panel exam-session"><div class="exam-progress"><div><strong>${prog.answered}/${prog.total}</strong> 已答 · 第 ${index + 1} 题</div><div class="track"><i style="width:${prog.ratio * 100}%"></i></div><span>建议 ${session.timeLimitMinutes} 分钟</span></div>
        ${meta}<h2 class="exam-stem">${esc(item.stem).replace(/\n/g, '<br>')}</h2>${input}
        <div class="exam-nav"><button class="secondary" id="exam-prev" ${index === 0 ? 'disabled' : ''}>上一题</button><button class="secondary" id="exam-next" ${index >= session.items.length - 1 ? 'disabled' : ''}>下一题</button><button class="text-button" id="exam-save">保存并留在此题</button><button class="primary" id="exam-submit">提交测评</button></div>
        <p class="hint">答案自动保存在本地；刷新会恢复。提交后才给客观题打分；开放题只给评分要点，不假装已经打过分了。</p></section>`;
}
export function examResultHtml(session: ExamSession): string {
    const correct = session.items.filter(i => i.options.length && session.answers[i.id]?.value === i.answerKey).length;
    const objective = session.items.filter(i => i.options.length && i.answerKey).length;
    const errors = session.errors.length ? session.errors.map(e => `<article class="exam-error" data-reported="${e.userReported ? '1' : '0'}"><div><span class="badge ${e.confidence}">${esc(errorCategoryLabel(e.category))} · ${esc(errorSubcategoryLabel(e.subcategory))}</span><span class="hint">置信度 ${esc(e.confidence)}${e.userReported ? ' · 用户自报' : ''}</span></div><h4>${esc(e.explanation)}</h4>${e.alternatives.length ? `<p class="hint">也可能是：${e.alternatives.map(a => esc(errorCategoryLabel(a.category))).join(' / ')}</p>` : ''}<p>${esc(e.intervention)}</p><label>修正错因<select class="exam-correct" data-item="${esc(e.itemId)}">${(['vocabulary', 'structure', 'logic', 'evidence', 'overthinking', 'time_pressure', 'uncertain'] as const).map(c => `<option value="${c}" ${c === e.category ? 'selected' : ''}>${esc(errorCategoryLabel(c))}</option>`).join('')}</select></label></article>`).join('') : '<p>没有可归因的错题。</p>';
    return `<section class="panel exam-result"><div class="section-title"><h2>测评结果</h2><span class="badge">${esc(scoreStatusLabel(session.scoreStatus))}</span></div>
        <div class="exam-score"><strong>${session.score === null ? '—' : session.score}</strong><span>/ ${session.maxScore} 客观分</span><small>${esc(session.review || '')}</small></div>
        <p class="hint">客观题 ${correct}/${objective} 正确。${session.scoreStatus === 'partial' ? '含开放题，因此只有部分分，不是整卷成绩。' : ''} 这里没有官方分数，也没有预测分。</p>
        <h3>错因复盘 <span class="subtle">${esc(errorSummary(session.errors))}</span></h3>${errors}
        <div class="exam-actions"><button class="primary" id="exam-complete">完成复盘</button><button class="secondary" id="exam-retest">做一道同类新题</button><button class="text-button" id="exam-back">返回考试首页</button></div>
        <p class="hint">复测只换新题；一次做对不等于掌握，也不会直接改动词汇的掌握程度。</p></section>`;
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
export function examLogsHtml(logs: ExamLog[], specs: ExamSpecification[], editingId = ''): string {
    const today = new Date().toISOString().slice(0, 10);
    const editing = editingId ? logs.find(l => l.id === editingId) ?? null : null;
    const specFor = (l: ExamLog) => l.specId ? specs.find(s => s.id === l.specId) ?? null : null;
    const specNote = (s: ExamSpecification) => s.status === 'official_confirmed' && s.totalScore !== null
        ? `官方已确认总分 ${s.totalScore}；满分可改，但改后必须确认这是自定义计分。`
        : s.totalScore === null
            ? '该规格总分未知/待确认，不预填任何“官方满分”；请填写本次实际满分。'
            : `该规格总分 ${s.totalScore} 只是${s.status === 'provisional' ? '暂定/参考' : '历史参考'}，不是官方确认；按本次实际满分保存。`;
    const selectedSpec = editing?.specId ? specs.find(s => s.id === editing.specId) ?? null : null;
    const category = editing?.examCategory ?? selectedSpec?.examCategory ?? 'other';
    const year = editing?.applicableYear ?? selectedSpec?.applicableYear ?? new Date().getFullYear();
    const scoreBasis = editing?.scoreBasis ?? 'custom_total';
    const rows = logs.slice().sort((a, b) => b.date.localeCompare(a.date)).map(l => {
        const s = specFor(l);
        const conflict = s && s.status === 'official_confirmed' && s.totalScore !== null && l.fullScore !== s.totalScore;
        const basis = l.scoreBasis === 'official_total'
            ? '满分依据：与官方确认总分一致'
            : conflict ? `满分依据：自定义（官方规格总分 ${s.totalScore}）` : '满分依据：自定义 / 本次实际试卷';
        return `<article class="exam-log-item">
            <div class="exam-log-head"><strong>${esc(l.examName || l.name)}</strong><span class="badge">${esc(examLogTypeLabel(examLogTypeOf(l)))}</span><time datetime="${esc(l.date)}">${esc(l.date)}</time></div>
            <div class="exam-log-meta"><span>${esc(examLogCategoryLabel(l.examCategory))} · ${l.applicableYear ?? '年份未记'}</span><span class="exam-log-score">${l.reportedScore} / ${l.fullScore}</span><span>${esc(basis)}</span></div>
            <div class="exam-log-source">来源：<strong>${esc(l.scoreSource ?? 'self_reported')}</strong>（学生自报，未经系统核验）${conflict ? '<span class="exam-log-conflict">满分与官方规格不一致</span>' : ''}</div>
            ${l.selfAssessment ? `<p class="exam-log-clue">自评线索：${esc(l.selfAssessment)} <span>仅线索，不作已验证错因</span></p>` : ''}
            <div class="exam-log-actions"><button class="text-button exam-log-edit" data-log="${esc(l.id)}">编辑</button><button class="text-button exam-log-del" data-log="${esc(l.id)}">删除</button></div>
        </article>`;
    }).join('');
    return `<section class="panel"><div class="section-title"><h2>学校考试记录</h2><span class="subtle">你自己填的 · 没有系统核对</span></div>
        <p class="hint">记录你真实参加过的考试，不要求使用高考分值。校内考试、月考、模拟考试和自定义考试都可以保存；分数只作为事实记录，不反推掌握度、不预测下次分数。</p>
        <div class="exam-log-form">
            <label class="log-date">日期<input type="date" id="log-date" value="${esc(editing?.date ?? today)}"></label>
            <label class="log-type">考试类型<select id="log-type">${EXAM_LOG_TYPES.map(t => `<option value="${t.id}" ${examLogTypeOf(editing ?? { examType: 'school_exam' } as ExamLog) === t.id ? 'selected' : ''}>${t.label}</option>`).join('')}</select></label>
            <label class="log-name"><span class="field-label">考试名称 <span class="req">*</span></span><input type="text" id="log-name" maxlength="80" value="${esc(editing?.examName ?? editing?.name ?? '')}" placeholder="如：高三第一次月考"></label>
            <label class="log-spec">绑定规格（可选）<select id="log-spec"><option value="">自定义 / 不绑定官方规格</option>${specs.map(s => `<option value="${esc(s.id)}" ${editing?.specId === s.id ? 'selected' : ''}>${esc(examLogSpecLabel(s))}</option>`).join('')}</select></label>
            <label class="log-category">考试类别<select id="log-category" ${selectedSpec || editing?.specId ? 'disabled' : ''}>${([
        'shanghai-gaokao-foreign-language-first', 'shanghai-gaokao-foreign-language-second', 'shanghai-spring-exam-foreign-language', 'shanghai-academic-foreign-language', 'other',
    ] as const).map(c => `<option value="${c}" ${category === c ? 'selected' : ''}>${esc(examLogCategoryLabel(c))}</option>`).join('')}</select></label>
            <label class="log-year">适用年份<input type="number" id="log-year" min="2000" max="2100" step="1" value="${year}" ${selectedSpec || editing?.specId ? 'readonly' : ''}></label>
            <label class="log-score">得分<input type="number" id="log-score" min="0" step="0.5" value="${editing?.reportedScore ?? ''}" placeholder="如 102"></label>
            <label class="log-full"><span class="field-label">本次满分 <span class="req">*</span></span><input type="number" id="log-full" min="0.5" step="0.5" value="${editing?.fullScore ?? ''}" placeholder="按实际试卷填写"></label>
            <label class="log-note">自评 / 线索（可选）<input type="text" id="log-note" maxlength="200" value="${esc(editing?.selfAssessment ?? '')}" placeholder="如：阅读时间不够（只作线索）"></label>
            <p id="log-basis" class="exam-log-basis">按本次实际试卷填写满分，不用高考分值代替。</p>
            <label class="exam-log-ack" id="log-ack-wrap"><input type="checkbox" id="log-ack" ${editing?.conflictAcknowledged ? 'checked' : ''}> 我确认：本次满分与官方总分不同，这是自定义/校内计分</label>
            <div class="exam-log-actions"><button class="primary" id="log-add">${editing ? '保存修改' : '保存记录'}</button>${editing ? '<button class="secondary" id="log-cancel">取消编辑</button>' : ''}</div>
        </div>
        <div id="log-conflict" class="exam-log-warning" data-basis="${scoreBasis}" hidden></div>
        <div class="section-title"><h3>全部记录</h3><div class="actions"><button class="secondary" id="exam-logs-export">导出考试记录</button><label class="button secondary">导入考试记录<input id="exam-logs-import" type="file" accept=".json,application/json" hidden></label></div></div>
        ${rows ? `<div class="exam-log-list">${rows}</div>` : '<p class="empty-note">还没有考试记录。保存后可刷新、编辑、删除、导出或随完整备份恢复。</p>'}</section>`;
}
export function specsAuditHtml(specs: ExamSpecification[], items: AssessmentItem[]): string {
    return `<section class="panel"><div class="section-title"><h2>考试规格核对</h2><span class="subtle">以官方来源为准</span></div>
        <table class="exam-table"><thead><tr><th>年份</th><th>类别</th><th>状态</th><th>总分</th><th>来源</th><th>题目</th></tr></thead><tbody>${specs.map(s => `<tr><td>${s.applicableYear}</td><td>${esc(examCategoryLabel(s.examCategory))}</td><td>${esc(statusLabel(s.status))}</td><td>${s.totalScore ?? '—'}</td><td>${s.sourceRefs.length}</td><td>${items.filter(i => i.examCategory === s.examCategory).length}</td></tr>`).join('')}</tbody></table>
        <p class="hint">规格和题目都按版本存在本地；2028 还没有官方文件时，未知项就留空，不拿默认值凑。</p></section>`;
}
