// —— Phase 8：Input Hub 视图（纯 HTML，无副作用）——
import type { Data, InputSession, InputSource, InputSubtitleStatus, LibraryItem, Transcript } from './types.ts';
import type { InputCandidate } from './inputRecommendation.ts';
import { esc, date } from './ui.ts';
import { providerLabel } from './inputUrl.ts';
import { REFLECTION_SPECS, DIFFICULTY_REASONS, DIFFICULTY_REASON_LABELS, reflectionLabel, captionCaveat } from './inputReflection.ts';
import { formatTimestamp, transcriptStats } from './transcript.ts';
import type { SentenceCandidate } from './inputHandoff.ts';
export interface HubInput {
    data: Data;
    candidates: InputCandidate[];
    note: string;
    target: string;
    unfinished: InputSession[];
    recent: InputSession[];
    library: LibraryItem[];
    analytics: ReturnType<typeof import('./inputEvidence.ts').inputAnalytics>;
    filter: {
        search: string;
        status: string;
        captions: string;
        contentType: string;
    };
    interestLabels: string[];
}
const FACT_PILL = (text: string, cls = '') => `<span class="pill ${cls}">${esc(text)}</span>`;
export function inputHubPage(input: HubInput): string {
    const active = input.unfinished[0];
    const returnBanner = active
        ? `<section class="panel today-return"><div><b>继续上次输入</b><p class="muted">${esc(active.title)} · ${esc(active.topic)} · ${active.status === 'paused' ? '已暂停' : '进行中'}</p></div><button class="primary" data-input-open="${esc(active.id)}">继续</button></section>`
        : input.recent[0]
            ? `<section class="panel today-return"><div><b>今天还有一段没填完</b><p class="muted">上次完成：${esc(input.recent[0].title)}（${date(input.recent[0].completedAt ?? 0)}）。想再来一次，或换一个真实材料？</p></div><button data-input-open="${esc(input.recent[0].id)}">查看记录</button></section>`
            : '';
    const cards = input.candidates.length
        ? input.candidates.map(c => `
        <article class="panel input-card" data-candidate="${esc(c.sourceId)}">
          <b>${esc(c.title)}</b>
          <div class="input-reason">${FACT_PILL(c.reasonZh, c.exploration ? 'warn' : '')}</div>
          <p class="muted">${c.facts.map(f => esc(f)).join(' · ')}</p>
          ${c.repeat ? '<p class="muted">⚠ 最近完成过这份材料：已降权，避免重复。</p>' : ''}
          <div class="actions">
            <button class="primary" data-input-start="${esc(c.sourceId)}">开始输入</button>
            <a class="button secondary" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer">打开链接</a>
            <button class="text-button" data-input-library="${esc(c.sourceId)}">收藏</button>
          </div>
        </article>`).join('')
        : `<section class="panel"><b>还没有真实材料</b><p class="muted">这里不会给你塞视频。先加一个你真的想看的链接，什么主题都行，不用和兴趣一致。</p></section>`;
    const libRows = input.library.length
        ? input.library.map(i => `
        <div class="library-row" data-library-row="${esc(i.id)}">
          <div><b>${esc(i.title)}</b><p class="muted">${esc(i.topic)} · ${providerLabel(i.contentType as never) === '其他来源' ? esc(i.contentType ?? '') : esc(i.contentType ?? '')} · ${i.durationMinutes ? i.durationMinutes + ' 分钟' : '时长未知'} · ${esc(i.status)}${(i.completion ?? 0) > 0 ? ` · 完成 ${Math.round((i.completion ?? 0) * 100)}%` : ''}</p></div>
          <div class="actions">
            <a class="button secondary" href="${esc(i.url)}" target="_blank" rel="noopener noreferrer">打开</a>
            <button class="text-button" data-library-source="${esc(i.sourceId ?? '')}">开始</button>
            <button class="text-button" data-library-archive="${esc(i.id)}">归档</button>
            <button class="text-button danger-text" data-library-delete="${esc(i.id)}">删除</button>
          </div>
        </div>`).join('')
        : '<p class="muted">收藏夹还是空的。加过的材料会自动出现在这里。</p>';
    return `
    <div class="page-title"><div><div class="eyebrow">输入练习</div><h1>输入练习</h1><p>看你真正想看的英文内容，记录看得怎么样——不是每段视频都要做题。</p></div></div>
    ${returnBanner}
    <section class="panel">
      <div class="section-title">推荐媒体 <small class="muted">今天的目标：${esc(input.target)}｜兴趣只影响顺序，不影响能不能用</small></div>
      ${input.note ? `<p class="muted">${esc(input.note)}</p>` : ''}
      <div class="input-grid">${cards}</div>
      <p class="muted">兴趣画像：${input.interestLabels.length ? input.interestLabels.map(l => `<span class="chip">${esc(l)}</span>`).join('') : '未设置（推荐仍可用，只是不做个性化）'} <button class="text-button" data-input-goto-interest>管理兴趣</button></p>
    </section>
    <section class="panel">
      <div class="section-title">添加材料</div>
      <div class="form-grid">
        <label>链接<input id="input-url" placeholder="https://www.youtube.com/watch?v=... / https://www.bilibili.com/video/BV..." autocomplete="off"></label>
        <label>标题<input id="input-title" placeholder="例如：Rome: Engineering an Empire" maxlength="200"></label>
        <label>主题（自由文本）<input id="input-topic" placeholder="例如：罗马史 / CS2 / 天文 / 分形几何" maxlength="60"></label>
        <label>时长（分钟，0 = 不知道）<input id="input-duration" type="number" min="0" max="600" value="0"></label>
        <label>语言<select id="input-language"><option value="en">英语</option><option value="zh">中文</option><option value="other">其他</option></select></label>
        <label>类型<select id="input-content-type">${[['', '自动判断'], ['youtube', 'YouTube'], ['bilibili', 'Bilibili'], ['online_video', '在线视频'], ['documentary', '纪录片'], ['esports', '电竞'], ['game_content', '游戏内容'], ['series_clip', '剧集片段'], ['article', '文章'], ['other', '其他']].map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
      </div>
      <p class="muted">只保存链接与你自己填写的信息：不抓取视频、不猜字幕/时长/语言。标题和时长都可以之后改。</p>
      <button class="primary" data-input-add>加入材料库</button>
    </section>
    <section class="panel">
      <div class="section-title">My English Library</div>
      <div class="toolbar">
        <input id="input-search" placeholder="搜索标题/主题/备注" value="${esc(input.filter.search)}">
        <select id="input-status"><option value="all">全部状态</option>${['saved', 'used', 'archived'].map(v => `<option value="${v}" ${input.filter.status === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <select id="input-captions"><option value="any">全部字幕状态</option>${[['has', '有字幕'], ['none', '明确无字幕'], ['unknown', '未知']].map(([v, t]) => `<option value="${v}" ${input.filter.captions === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
        <select id="input-type"><option value="all">全部类型</option>${['youtube', 'bilibili', 'article', 'documentary', 'esports', 'game_content', 'series_clip', 'online_video', 'other'].map(v => `<option value="${v}" ${input.filter.contentType === v ? 'selected' : ''}>${v}</option>`).join('')}</select>
      </div>
      <div class="library-list">${libRows}</div>
    </section>
    <section class="panel">
      <div class="section-title">输入情况 <small class="muted">时长和理解度都是你自己填的</small></div>
      <div class="stat-row">
        ${[['完成的输入', input.analytics.completedSessions], ['未完成', input.analytics.unfinishedSessions], ['自报时长', input.analytics.reportedMinutes + ' 分钟'], ['字幕阅读', input.analytics.transcriptReading]].map(([k, v]) => `<div class="stat"><span class="muted">${k}</span><b>${v}</b></div>`).join('')}
      </div>
      <p class="muted">${esc(input.analytics.note)}</p>
      ${input.analytics.comprehensionSeries.length ? `<p class="muted">理解自评趋势：${input.analytics.comprehensionSeries.map(p => `${Math.round((p.value ?? 0) * 100)}%`).join(' → ')}（自报，不代表能力考试分数）</p>` : ''}
      ${Object.keys(input.analytics.captions).length ? `<p class="muted">字幕分布：${Object.entries(input.analytics.captions).map(([k, v]) => `${k} × ${v}`).join(' · ')}</p>` : ''}
    </section>`;
}
export interface SessionPageInput {
    data: Data;
    session: InputSession;
    source: InputSource | undefined;
    transcript: Transcript | undefined;
    candidates: SentenceCandidate[];
    captionCaveat: string;
}
export function inputSessionPage(input: SessionPageInput): string {
    const s = input.session;
    const status = s.status ?? 'created';
    const refl = s.reflection;
    const baseline = s.baseline;
    const stats = input.transcript ? transcriptStats(input.transcript) : null;
    return `
    <div class="page-title"><div><div class="eyebrow">这次输入</div><h1>${esc(s.title)}</h1><p>${esc(s.topic)} · ${s.durationMinutes ? s.durationMinutes + ' 分钟' : '时长未知'} · 计划 ${s.plannedMinutes ?? '—'} 分钟 · 状态 ${status}</p></div>
      <button class="secondary" data-input-back>返回材料库</button></div>
    <section class="panel">
      <div class="actions">
        <a class="button primary" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" data-input-external>在外部打开并观看</a>
        <button class="secondary" data-input-mark-open>我已打开</button>
        ${status === 'active' ? '<button class="secondary" data-session-pause>暂停</button>' : status === 'paused' ? '<button class="secondary" data-session-resume>继续</button>' : ''}
        ${status !== 'completed' && status !== 'abandoned' ? '<button class="text-button danger-text" data-session-abandon>放弃这次</button>' : ''}
      </div>
      <p class="muted">播放器是平台的，这里只记你回来填的内容。观看时长由你自己填，不会假装是平台统计的。</p>
    </section>
    ${!baseline || (baseline.status !== 'recorded' && baseline.status !== 'skipped') ? `
    <section class="panel">
      <div class="section-title">冷测（第一次观看前，1–2 分钟）</div>
      <p class="muted">先看 1–2 分钟真实视频，再填写。可以跳过；跳过就记为“没有基线”，不会拿看完之后的感受倒填。</p>
      <div class="form-grid">
        <label>字幕模式<select id="baseline-caption">${captionOptions(baseline?.captionMode ?? 'none')}</select></label>
        <label>大概听懂（%）<input id="baseline-comprehension" type="number" min="0" max="100" value="40"></label>
        <label>实际观看（分钟）<input id="baseline-minutes" type="number" min="0" max="600" value="2"></label>
        <label>最大障碍<input id="baseline-blocker" placeholder="例如：语速 / 连读 / 词不认识" maxlength="200"></label>
      </div>
      <div class="actions"><button class="primary" data-baseline-save>保存冷测</button><button class="text-button" data-baseline-skip>跳过冷测</button></div>
    </section>` : `<section class="panel"><b>冷测</b><p class="muted">${baseline.status === 'recorded' ? `已记录：听懂约 ${Math.round((baseline.comprehension ?? 0) * 100)}%（${baseline.captionMode}）` : '已跳过（no_baseline）'} · ${date(baseline.at)}</p></section>`}
    <section class="panel">
      <div class="section-title">复盘</div>
      <p class="muted">${esc(input.captionCaveat)}</p>
      <div class="actions">
        ${(['light', 'standard', 'deep'] as const).map(m => `<button class="${s.mode === m ? 'primary' : 'secondary'}" data-mode="${m}">${reflectionLabel(m)}</button>`).join('')}
      </div>
      <div class="form-grid">
        <label>字幕模式<select id="refl-caption">${captionOptions(refl?.captionMode ?? s.captionMode ?? 'none')}</select></label>
        <label>理解自评（%）<input id="refl-comprehension" type="number" min="0" max="100" value="${Math.round((refl?.comprehension ?? 0.6) * 100)}"></label>
        <label>自报观看时长（分钟）<input id="refl-watched" type="number" min="0" max="600" value="${s.reportedWatchedMinutes ?? ''}" placeholder="你实际看了多久"></label>
        <label>备注<input id="refl-notes" value="${esc(refl?.notes ?? '')}" maxlength="1000" placeholder="哪里没听懂"></label>
      </div>
      <div class="ai-targets">${DIFFICULTY_REASONS.map(r => `<label class="check"><input type="checkbox" data-reason="${r}" ${refl?.difficultyReasons?.includes(r) ? 'checked' : ''}> ${DIFFICULTY_REASON_LABELS[r]}</label>`).join('')}</div>
      ${s.mode === 'standard' ? `<label>英文总结（3–5 句，保存原文；不做内容事实评分）<textarea id="refl-summary" rows="4">${esc(refl?.summary ?? '')}</textarea></label>` : ''}
      ${s.mode === 'deep' ? `
        <label>Main Idea<input id="refl-main" value="${esc(refl?.mainIdea ?? '')}"></label>
        <label>三个要点（每行一个）<textarea id="refl-points" rows="4">${esc((refl?.keyPoints ?? []).join('\n'))}</textarea></label>
        <label>Personal Opinion<input id="refl-opinion" value="${esc(refl?.opinion ?? '')}"></label>
        <label>Short Retelling<textarea id="refl-retelling" rows="3">${esc(refl?.retelling ?? '')}</textarea></label>` : ''}
      <div class="actions">
        <button class="primary" data-refl-save>保存复盘</button>
        <button class="secondary" data-session-complete>完成这次输入</button>
      </div>
      <p class="muted">轻量复盘只有你的自评；标准或深度模式里的总结算写作记录，不等于掌握。</p>
    </section>
    <section class="panel">
      <div class="section-title">字幕（可选） <small class="muted">只解析你自己提供的文件</small></div>
      ${input.transcript
        ? `<p class="muted">已导入 ${input.transcript.cues.length} 条字幕 · ${stats?.durationMinutes ?? 0} 分钟 · 时间轴 ${input.transcript.timed ? '有' : '无'} · 来源 ${esc(input.transcript.provenance)}</p>
           <div class="actions">
             <button class="secondary" data-transcript-reading>送到阅读里练</button>
             <button class="text-button" data-transcript-sentences>查看难句候选</button>
           </div>
           ${input.candidates.length ? `<ul class="transcript-cues">${input.candidates.map((c, i) => `<li><span class="cue-time">${formatTimestamp(c.startMs)}</span><span class="cue-text">${esc(c.text)}</span> <button class="text-button" data-sentence-pick="${i}">送入句法练习</button></li>`).join('')}</ul>` : ''}`
        : `<p class="muted">支持 SRT / VTT / TXT。没有字幕也可以只做复盘；我们不会假装自动抓取平台字幕。</p>`}
      <label class="file-box">选择字幕文件<input id="transcript-file" type="file" accept=".srt,.vtt,.txt"></label>
      <label>或粘贴字幕<textarea id="transcript-raw" rows="4" placeholder="1&#10;00:00:01,000 --> 00:00:03,000&#10;The aqueducts carried water..."></textarea></label>
      <div class="form-grid">
        <label>来源<select id="transcript-provenance">${[['user_supplied', '我自己提供的字幕'], ['official_subtitle', '平台官方字幕'], ['manually_transcribed', '我手工转录'], ['machine_generated_unverified', '机器生成（未验证）'], ['unknown', '不确定']].map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
        <label>语言<select id="transcript-language"><option value="en">英语</option><option value="zh">中文</option><option value="other">其他</option></select></label>
      </div>
      <button class="secondary" data-transcript-import>导入字幕</button>
    </section>
    ${s.status === 'completed' ? `<section class="panel"><b>已完成</b><p class="muted">${date(s.completedAt ?? 0)} · 自报 ${s.reportedWatchedMinutes ?? 0} 分钟 · 模式 ${s.reflection?.mode ?? s.mode} · 完成度 ${Math.round((s.reflection?.completion ?? 0) * 100)}%</p><p class="muted">记下的只有：看过的记录 + 你的自评${s.reflection?.summary ? ' + 写下的总结' : ''}。这不会自动提高听力或词汇掌握。</p></section>` : ''}
    ${s.miniUnitId ? `<section class="panel"><b>关联 单元</b><p class="muted">这次输入记到了 ${esc(s.miniUnitId)} 的单元里，但只算参与，不算已经会迁移。</p></section>` : ''}`;
}
function captionOptions(current: string): string {
    return [['none', '无字幕'], ['en', '英文字幕'], ['zh', '中文字幕'], ['other', '其他语言']].map(([v, t]) => `<option value="${v}" ${current === v ? 'selected' : ''}>${t}</option>`).join('');
}
export function subtitleStatusLabel(status: InputSubtitleStatus | undefined): string {
    return status === 'official' ? '官方字幕' : status === 'user_supplied' ? '你提供的字幕' : status === 'machine' ? '机器生成（未验证）' : status === 'none' ? '明确无字幕' : '字幕未知';
}
export const INPUT_SPEC_COPY = {
    light: `${REFLECTION_SPECS.light.minutes[0]}–${REFLECTION_SPECS.light.minutes[1]} 分钟`,
    standard: `${REFLECTION_SPECS.standard.minutes[0]}–${REFLECTION_SPECS.standard.minutes[1]} 分钟`,
    deep: `${REFLECTION_SPECS.deep.minutes[0]}–${REFLECTION_SPECS.deep.minutes[1]} 分钟`,
};
