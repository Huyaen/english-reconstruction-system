// —— Phase 5：阅读 UI 的纯标记生成（不碰 DOM，不读全局状态）——
// 原则：阅读内容是主角。桌面端“主阅读区 + 轻量侧栏”，移动端单列 + 可收起工具。
// 首读前不显示任何译文/答案；辅助必须由用户主动请求（L0–L4）。
import type { Passage, ReadingChunk, ReadingDifficultyReport, ReadingMark, ReadingProblemType, ReadingSession, ReadingSentence, ReadingToken, } from './types.ts';
import type { ReadingMetrics } from './readingAnalytics.ts';
import { stageLabel, READING_LIMITS, maxHelpLevelUsed, sessionProgress } from './readingSession.ts';
import { classificationLabel } from './readingDifficulty.ts';
import { PROBLEM_TYPE_LABELS } from './readingSentences.ts';
import { SUPPORT_LABELS } from './sentenceLab.ts';
export function esc(s: string): string {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
const MARK_LABELS: Record<ReadingMark['judgment'], string> = {
    known: '知道', vague: '模糊', unknown: '不知道', guessed: '根据上下文猜出',
};
export function sourceLabel(p: Passage): string {
    const map: Record<string, string> = {
        pasted_text: '粘贴正文', uploaded_file: '上传文件', uploaded_image: '截图 OCR',
        web_article: '网页文章', curated_real_material: '真实材料', ai_reinforcement: 'AI 生成材料', library_item: '阅读库',
    };
    const base = map[p.sourceType] ?? p.sourceType;
    const rel = p.sourceReliability === 'editorial' ? ' · 编辑来源' : p.sourceReliability === 'authoritative' ? ' · 权威来源' : p.sourceReliability === 'user_provided' ? ' · 用户提供' : '';
    return `${base}${rel}`;
}
export function importPanelHTML(duplicateHint = ''): string {
    return `<section class="panel" id="read-import">
  <div class="section-title">导入阅读材料</div>
  <p class="hint">只接收真实材料：粘贴、上传 TXT/MD/HTML、或从截图 OCR（识别完需要你人工核对）。本阶段不做 PDF/DOCX 解析，也不抓取需要登录或付费的页面。</p>
  ${duplicateHint ? `<p class="hint warn">${esc(duplicateHint)}</p>` : ''}
  <div class="two-col">
    <label>标题（可留空自动取首行）<input id="read-title" placeholder="例：The Cost of Convenience" /></label>
    <label>主题<input id="read-topic" placeholder="例：环境 / 科技 / 教育" /></label>
  </div>
  <label>正文<textarea id="read-paste" rows="10" placeholder="把英文文章正文粘贴到这里……"></textarea></label>
  <p class="hint" id="read-count">0 词</p>
  <label class="hint"><input type="checkbox" id="read-allow-short" /> 不足 60 词也按短文导入（仍要用它练完整流程）</label>
  <div class="actions">
    <button class="primary" data-read-save="paste">预览并保存</button>
    <label class="secondary" style="display:inline-flex;align-items:center;gap:6px">上传文件<input type="file" id="read-file" accept=".txt,.md,.markdown,.text,.html,.htm" hidden /><span data-read-file-label>选择 TXT / MD / HTML</span></label>
    <button class="secondary" data-read-url-open="1">从网址导入</button>
    <button class="secondary" data-read-ocr-open="1">截图 OCR</button>
  </div>
  <div id="read-url-box" hidden>
    <label>文章网址<input id="read-url" placeholder="https://…" /></label>
    <p class="hint">抓取受浏览器 CORS 与站点访问控制限制：失败会明确告诉你原因，不给绕过的“伪成功”。</p>
    <div class="actions"><button class="primary" data-read-fetch="1">尝试抓取</button></div>
    <p class="hint" id="read-url-msg"></p>
  </div>
  <div id="read-ocr-box" hidden>
    <label>截图<input type="file" id="read-image" accept="image/*" /></label>
    <p class="hint" id="read-ocr-msg">OCR 结果会先放进上面的编辑框，核对后再保存。</p>
  </div>
</section>`;
}
export function previewHTML(input: {
    passage: Passage;
    difficulty: ReadingDifficultyReport | null;
    unfinished: ReadingSession | null;
}): string {
    const p = input.passage;
    const d = input.difficulty;
    const minutes = d?.estimatedMinutes ?? Math.max(1, Math.ceil(p.wordCount / 110));
    return `<section class="panel preview-card" id="read-preview">
  <div class="section-title">${esc(p.title)}</div>
  <p class="hint">${esc(sourceLabel(p))}${p.sourceUrl ? ` · ${esc(p.sourceUrl)}` : ''} · ${esc(p.topic)}</p>
  <div class="metrics">
    <div class="metric"><span>词数</span><strong>${p.wordCount}</strong><small>${p.sentences?.length ?? 0} 句 / ${p.paragraphs?.length ?? 0} 段</small></div>
    <div class="metric"><span>预计时间</span><strong>${minutes}</strong><small>按当前速度估算</small></div>
    <div class="metric"><span>难度</span><strong>${d ? d.difficulty.toFixed(1) : '—'}</strong><small>${d ? classificationLabel(d.classification) : '证据不足，未估算'}</small></div>
    <div class="metric"><span>已知词覆盖</span><strong>${d ? `${Math.round(d.knownCoverage * 100)}%` : '—'}</strong><small>${d ? `置信度 ${d.confidence}` : '还没有词库证据'}</small></div>
  </div>
  ${d ? `<ul class="plain-list">${d.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ul>` : ''}
  <p class="hint">开始之前先猜一下：这篇文章大概在讲什么？（先不查词，也不看译文）</p>
  <label>你的猜测（可留空）<input id="read-guess" placeholder="用中文或简单英文写一句" /></label>
  <div class="actions">
    ${input.unfinished ? `<button class="primary" data-read-resume="1">继续上次进度（${esc(sessionProgress(input.unfinished).label)}）</button>` : ''}
    <button class="${input.unfinished ? 'secondary' : 'primary'}" data-read-start="1">开始首读（无辅助）</button>
    <button class="text-button" data-read-back="1">返回阅读库</button>
  </div>
</section>`;
}
function tokenHTML(t: ReadingToken, marks: ReadingMark[]): string {
    const mark = marks.find(m => !m.revokedAt && m.tokenIndex === t.index && m.sentenceIndex === t.sentenceIndex);
    const cls = mark ? `word marked mark-${mark.judgment}` : 'word';
    return `<button class="${cls}" data-tok="${t.index}" data-sent="${t.sentenceIndex}" data-word="${esc(t.normalized)}" title="${mark ? MARK_LABELS[mark.judgment] : '点击标记这个词'}">${esc(t.surface)}</button>`;
}
function sentenceHTML(sentence: ReadingSentence, tokens: ReadingToken[], marks: ReadingMark[]): string {
    const own = tokens.filter(t => t.sentenceIndex === sentence.index);
    if (!own.length)
        return `<span class="rsent">${esc(sentence.text)}</span>`;
    let html = '';
    let cursor = sentence.start;
    for (const t of own) {
        const gap = sentence.text.slice(cursor - sentence.start, t.start - sentence.start);
        if (gap)
            html += esc(gap);
        html += tokenHTML(t, marks);
        cursor = t.end;
    }
    const tail = sentence.text.slice(cursor - sentence.start);
    if (tail)
        html += esc(tail);
    return `<span class="rsent" data-sent="${sentence.index}">${html}</span>`;
}
export function readerHTML(input: {
    passage: Passage;
    session: ReadingSession;
    tokens: ReadingToken[];
    helpText: string;
    showHelp: boolean;
}): string {
    const d = input.session.detail!;
    const chunk: ReadingChunk | undefined = d.chunks[d.chunkIndex];
    const progress = sessionProgress(input.session);
    const sentences = (input.passage.sentences ?? []).filter(s => s.start >= (chunk?.start ?? 0) && s.end <= (chunk?.end ?? 0));
    const marks = d.marks.filter(m => !m.revokedAt);
    const body = sentences.map(s => sentenceHTML(s, input.tokens, marks)).join(' ');
    const marksOfChunk = marks.filter(m => sentences.some(s => s.index === m.sentenceIndex));
    const difficult = d.difficultSentences.filter(x => sentences.some(s => s.index === x.sentenceIndex));
    return `<div class="reading-layout">
  <section class="panel reader-main" id="read-chunk">
    <div class="reader-head">
      <span class="eyebrow">${esc(input.passage.title)}</span>
      <span class="hint">第 ${d.chunkIndex + 1} / ${d.chunks.length} 段 · ${chunk?.wordCount ?? 0} 词 · ${esc(progress.label)}</span>
    </div>
    <div class="reader-text" id="read-text">${body}</div>
    <div class="actions">
      <button class="secondary" data-read-prev="1" ${d.chunkIndex === 0 ? 'disabled' : ''}>上一段</button>
      <button class="primary" data-read-next="1">${d.chunkIndex + 1 >= d.chunks.length ? '读完这一段，说大意' : '下一段'}</button>
      <button class="text-button" data-read-finish-first="1">结束首读</button>
    </div>
    <div id="read-idea-box">
      <label>这一段主要在说什么？（中文可以）<input id="read-idea" placeholder="一句话" /></label>
      <div class="actions"><button class="secondary" data-read-idea-submit="1">记录我的说法</button></div>
    </div>
  </section>
  <aside class="panel reader-side" id="read-side">
    <div class="section-title">这一段</div>
    <p class="hint">点词标记：知道 / 模糊 / 不知道 / 猜出。标记只在这里记接触，不会直接改掌握度。</p>
    <div class="actions" id="read-mark-tools">
      ${Object.entries(MARK_LABELS).map(([k, v]) => `<button class="chip" data-mark="${k}">${v}</button>`).join('')}
      <button class="chip" data-mark-undo="1">撤销</button>
    </div>
    <div id="read-marks">${marksOfChunk.length
        ? `<ul class="plain-list">${marksOfChunk.map(m => `<li><b>${esc(m.surface)}</b> · ${MARK_LABELS[m.judgment]}<button class="text-button" data-unmark="${m.id}">撤销</button></li>`).join('')}</ul>`
        : '<p class="hint">还没有标记。</p>'}</div>
    <div class="section-title">难句</div>
    <div class="actions" id="read-difficult-tools">
      ${sentences.slice(0, 6).map(s => `<button class="chip" data-difficult="${s.index}">第 ${s.index + 1} 句难</button>`).join('')}
    </div>
    <div id="read-difficult">${difficult.length
        ? `<ul class="plain-list">${difficult.map(x => `<li>「${esc(x.text.slice(0, 40))}…」<button class="text-button" data-read-lab="${x.id}">进拆句训练</button></li>`).join('')}</ul>`
        : '<p class="hint">读完一段后，把卡住的句子标出来，可以进句子训练。</p>'}</div>
    <div class="section-title">需要帮助？</div>
    <div class="actions" id="read-help-tools">
      <button class="chip" data-read-help="1">轻提示</button>
      <button class="chip" data-read-help="2">重点提示</button>
      <button class="chip" data-read-help="3">结构解释</button>
      <button class="chip" data-read-help="4">完整讲解</button>
    </div>
    <p class="hint">L3 以上算“看过答案”：本次理解只记接触，不作为掌握证据。</p>
    ${input.showHelp && input.helpText ? `<div class="grammar-card">${input.helpText}</div>` : ''}
    <p class="hint">已用最高辅助：${maxHelpLevelUsed(input.session)}（${esc(SUPPORT_LABELS[maxHelpLevelUsed(input.session)])}）</p>
  </aside>
</div>`;
}
export function coldTestHTML(): string {
    return `<section class="panel" id="read-cold">
  <div class="section-title">先读一遍，不查词也没关系</div>
  <p class="hint">这一遍只记录你现在的真实状态：读得懂多少、有多依赖中文。系统不会把自评当成客观理解率。</p>
  <label>我觉得理解了大概多少？（0–100）<input id="read-cold-self" type="range" min="0" max="100" step="5" value="50" /><output id="read-cold-self-out">50</output></label>
  <label>阅读时的语言状态
    <select id="read-cold-dep">
      <option value="A">A 基本直接读英文</option>
      <option value="B" selected>B 少量中文辅助</option>
      <option value="C">C 大部分需要中文</option>
      <option value="D">D 基本逐词翻译</option>
      <option value="E">E 没读懂</option>
    </select>
  </label>
  <div class="actions"><button class="primary" data-read-cold-submit="1">开始逐段阅读</button></div>
</section>`;
}
export function rereadHTML(input: {
    session: ReadingSession;
    chunkIndex: number;
}): string {
    const session = input.session;
    const d = session.detail!;
    const total = Math.max(1, d.chunks.length);
    const index = Math.max(0, Math.min(total - 1, Math.round(input.chunkIndex)));
    const chunk = d.chunks[index];
    return `<section class="panel" id="read-reread">
  <div class="section-title">重读：这次尽量不看中文</div>
  <p class="hint">之前的解释已收起（需要时可以再点帮助）。目标是检验“现在能不能更顺地直接读懂”。</p>
  <div class="reader-head"><span class="hint">第 ${index + 1}/${total} 段</span>${total > 1 ? `<span class="hint">${index + 1 < total ? '读完这段再点“下一段”' : '这是最后一段：读完就可以记录这次状态'}</span>` : ''}</div>
  <div class="reader-text">${esc(chunk?.text ?? '')}</div>
  <div class="actions">${index > 0 ? '<button class="secondary" data-reread-prev="1">← 上一段</button>' : ''}${index + 1 < total ? '<button class="secondary" data-reread-next="1">下一段 →</button>' : ''}</div>
  <label>现在觉得理解了多少？<input id="read-reread-self" type="range" min="0" max="100" step="5" value="${session.firstPassComprehension ?? 50}" /><output id="read-reread-self-out">${session.firstPassComprehension ?? 50}</output></label>
  <label>语言状态
    <select id="read-reread-dep">
      <option value="A">A 基本直接读英文</option>
      <option value="B">B 少量中文辅助</option>
      <option value="C">C 大部分需要中文</option>
      <option value="D">D 基本逐词翻译</option>
      <option value="E">E 没读懂</option>
    </select>
  </label>
  <div class="actions"><button class="primary" data-read-reread-done="1">完成重读</button></div>
</section>`;
}
export function wholeTextHTML(): string {
    return `<section class="panel" id="read-whole">
  <div class="section-title">全文理解</div>
  <p class="hint">没有标准答案的题不会给你打分——只记录你的回答。自评与客观判定分开标注。</p>
  <label>全文主旨（一句话，中英均可）<input id="read-whole-main" /></label>
  <label>一个关键细节<textarea id="read-whole-detail" rows="2"></textarea></label>
  <label>作者想让你得出什么结论？（可选）<textarea id="read-whole-infer" rows="2"></textarea></label>
  <div class="actions">
    <button class="secondary" data-read-whole-submit="1">记录理解</button>
    <button class="primary" data-read-complete="1">完成这篇文章</button>
  </div>
</section>`;
}
export function resultHTML(input: {
    session: ReadingSession;
    metrics: ReadingMetrics;
    passage: Passage;
}): string {
    const m = input.metrics;
    const d = input.session.detail!;
    const fmt = (v: {
        available: boolean;
        value: unknown;
        note: string;
    }) => v.available ? String(v.value) : '—';
    const marks = d.marks.filter(x => !x.revokedAt);
    return `<section class="panel" id="read-result">
  <div class="section-title">阅读结果 · ${esc(input.passage.title)}</div>
  <div class="metrics">
    <div class="metric"><span>词数</span><strong>${m.wordCount}</strong><small>${esc(stageLabel(d.stage))}</small></div>
    <div class="metric"><span>首读速度</span><strong>${fmt(m.firstPassWpm)}</strong><small>词/分钟（首读）</small></div>
    <div class="metric"><span>重读速度</span><strong>${fmt(m.rereadWpm)}</strong><small>词/分钟（单独统计）</small></div>
    <div class="metric"><span>自评理解</span><strong>${fmt(m.selfReportedFirst)} → ${fmt(m.selfReportedSecond)}</strong><small>自评，不是客观测量</small></div>
    <div class="metric"><span>显式生词率</span><strong>${m.explicitUnknownRate.available ? `${m.explicitUnknownRate.value}%` : '—'}</strong><small>${m.explicitUnknownRate.note}</small></div>
    <div class="metric"><span>标记词</span><strong>${marks.length}</strong><small>不知道 ${m.markedWords} · 模糊 ${m.vagueWords}</small></div>
    <div class="metric"><span>难句</span><strong>${m.difficultSentences}</strong><small>${m.grammarProblems.map(t => PROBLEM_TYPE_LABELS[t as ReadingProblemType] ?? t).join('、') || '未标记'}</small></div>
    <div class="metric"><span>辅助使用</span><strong>${m.supportUsage.helps}</strong><small>最高 L${m.supportUsage.maxLevel}</small></div>
  </div>
  ${m.caveats.length ? `<ul class="plain-list">${m.caveats.map(c => `<li class="hint warn">${esc(c)}</li>`).join('')}</ul>` : ''}
  <div class="actions">
    <button class="primary" data-read-words="1">整理本次生词（${marks.filter(x => x.judgment === 'unknown').length}）</button>
    <button class="secondary" data-read-back="1">返回阅读库</button>
  </div>
</section>`;
}
export function studyWordsHTML(candidates: Array<{
    normalized: string;
    bucket: string;
    occurrences: number;
    contextSentence: string;
    existingWordId: string | null;
    needsDefinition: boolean;
    judgment: string;
}>): string {
    const bucketLabel: Record<string, string> = { core: '核心（进词汇训练）', recognition: '识别（只练认识）', 'low-value': '暂不入计划', 'proper-noun': '专名（只给释义）' };
    return `<section class="panel" id="read-words">
  <div class="section-title">本次生词</div>
  <p class="hint">筛选复用 Phase 2 的学习价值；新词没有释义时先补释义，补完才能进入 Preview / Recall（不会自动提升掌握度）。</p>
  ${candidates.length ? `<ul class="plain-list">${candidates.map(c => `<li>
      <b>${esc(c.normalized)}</b> · ${esc(bucketLabel[c.bucket] ?? c.bucket)} · ${c.occurrences} 次
      ${c.needsDefinition ? `<input data-def="${esc(c.normalized)}" placeholder="补中文释义后入库" /><span class="hint warn">还没有释义，先补上（不编造释义）</span>` : '<span class="hint">已在词库</span>'}
      <div class="hint">${esc(c.contextSentence.slice(0, 140))}</div>
    </li>`).join('')}</ul>` : '<p class="hint">这次没有标记出生词。</p>'}
  <div class="actions"><button class="primary" data-read-words-save="1">保存并加入词汇引擎</button></div>
</section>`;
}
