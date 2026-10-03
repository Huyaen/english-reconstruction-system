import './style.css';
import type { Data, Word, StudySession, Settings, ReviewRecord, Mastery } from './types.ts';
import { openDB, loadData, replaceData, saveSettings, putItems, saveAnswer, backup, validateBackup, emptyData } from './db.ts';
import { makeWord, uid, labels, priority, priorityGrade, shuffle, question, validSettings } from './core.ts';
import { parseFile, parseText, exportWords, type Parsed } from './import.ts';
import { newSession, answer } from './quiz.ts';
import { summary, trend, isWeak, recordStats, dayKey } from './stats.ts';
import { analyze, analysisPayload, endpoint } from './ai.ts';
import { $, esc, pct, seconds, date, toast, download, modal, closeModal, on } from './ui.ts';
let data: Data, page = 'home', bookFilter = '', search = '', levelFilter = '', sort = 'priority', listPage = 0;
let active: StudySession | null = null, feedback = false, busy = false, started = 0, timer: ReturnType<typeof setTimeout> | null = null, paused = false;
let startingSession = false;
let wordMap = new Map<string, Word>();
let elapsedBeforePause = 0;
let analysisBusy = false;
const navs = [['home', '◫', '今日学习'], ['books', '▤', '我的词库'], ['weak', '◎', '薄弱词'], ['stats', '▥', '学习统计'], ['ai', '✦', 'AI 学情'], ['settings', '⚙', '设置与备份']];
function reindex() { wordMap = new Map(data.words.map(w => [w.id, w])); }
function setPage(p: string) {
    if ((page === 'quiz' && busy) || startingSession) {
        toast('正在保存训练，请稍后切换');
        return;
    }
    stopTimer();
    active = null;
    page = p;
    listPage = 0;
    render();
}
function stopTimer() {
    if (timer)
        clearTimeout(timer);
    timer = null;
}
function shell() {
    document.documentElement.dataset.theme = data.settings.theme;
    $('#app').innerHTML = `<aside><a class="brand" href="#"><span class="brand-icon">词</span><span>词间<small>把词留在记忆里</small></span></a><nav>${navs.map(([id, icon, title]) => `<button data-nav="${id}" class="${page === id ? 'active' : ''}"><span>${icon}</span>${title}</button>`).join('')}</nav><div class="aside-foot"><span class="local-dot"></span> 本地学习空间<small>每次作答自动保存</small></div></aside><div class="workspace"><header><span>${navs.find(n => n[0] === page)?.[2] || '专注训练'}</span><div><span class="date-label">${new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}</span><button id="theme" class="icon-button" aria-label="切换深浅色">${data.settings.theme === 'light' ? '☾' : '☀'}</button></div></header><main id="main"></main></div>`;
    document.querySelectorAll<HTMLElement>('[data-nav]').forEach(b => b.onclick = () => setPage(b.dataset.nav!));
    on('.brand', 'click', e => { e.preventDefault(); setPage('home'); });
    on('#theme', 'click', async () => { const s = { ...data.settings, theme: data.settings.theme === 'light' ? 'dark' : 'light' } as Settings; await saveSettings(s); data.settings = s; document.documentElement.dataset.theme = s.theme; $('#theme').textContent = s.theme === 'light' ? '☾' : '☀'; });
}
function render() { shell(); ({ home: home, books: () => library(false), weak: () => library(true), stats: statistics, ai: aiPage, settings: settingsPage }[page] || home)(); }
function title(kicker: string, title: string, sub: string, action = '') { return `<div class="page-title"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${sub}</p></div>${action}</div>`; }
function metric(label: string, value: string, note: string) { return `<div class="metric"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`; }
function rangeControls() { return `<div class="range-controls"><label>学习范围<select id="range-book"><option value="">全部词书</option>${data.books.map(b => `<option value="${b.id}" ${bookFilter === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label><label>本轮词量<select id="range-count">${[50, 100, 300, 500, 1000].map(n => `<option value="${n}" ${n === 100 ? 'selected' : ''}>${n} 词</option>`).join('')}</select></label><label>测试方向<select id="range-ratio">${![0, 30, 50, 70, 100].includes(data.settings.ratio) ? `<option value="${data.settings.ratio}" selected>英→中 ${data.settings.ratio}%（自定义）</option>` : ''}<option value="50" ${data.settings.ratio === 50 ? 'selected' : ''}>双向各 50%</option><option value="70" ${data.settings.ratio === 70 ? 'selected' : ''}>英→中 70%</option><option value="30" ${data.settings.ratio === 30 ? 'selected' : ''}>中→英 70%</option><option value="100" ${data.settings.ratio === 100 ? 'selected' : ''}>识别 · 英→中</option><option value="0" ${data.settings.ratio === 0 ? 'selected' : ''}>提取 · 中→英</option></select></label></div>`; }
function home() {
    const s = summary(data), unfinished = data.sessions.find(s => !s.ended);
    $('#main').innerHTML = title('DAILY PRACTICE', '今天，让记忆再深一点', '快速检索，找到弱词，在忘记之前再见一次。', `<button id="import" class="secondary">＋ 导入词书</button>`) + `<div class="metrics">${metric('今日作答', String(s.today.attempts), '覆盖 ' + s.today.unique + ' 个单词')}${metric('今日正确率', s.today.attempts ? pct(s.today.accuracy) : '—', '英中双向检索')}${metric('平均反应', s.today.attempts ? seconds(s.today.meanMs) : '—', '从题目出现到提交')}${metric('有效掌握', String(s.effective), '双向 · 多次间隔验证')}</div>${unfinished ? `<div class="resume"><span>有一轮未完成的训练 · 已答 ${unfinished.answered} 题</span><button id="resume" class="primary">继续本轮</button><button id="finish-old" class="text-button">结束本轮</button></div>` : ''}<section class="panel practice"><div class="section-title"><h2>开始一轮训练</h2><span class="subtle">${data.words.length} 个词 · ${data.books.length} 本词书</span></div>${rangeControls()}<div class="modes"><button class="mode featured" data-mode="quick"><span class="mode-symbol">↗</span><h3>快速刷词</h3><p>大量扫描，找出不熟的词</p><span class="mode-bottom">开始检索 <b>→</b></span></button><button class="mode" data-mode="due"><span class="mode-symbol">◷</span><h3>今日复习 <em>${s.due}</em></h3><p>优先处理已到期的记忆</p><span class="mode-bottom">巩固记忆 <b>→</b></span></button><button class="mode" data-mode="weak"><span class="mode-symbol">◎</span><h3>弱词强化 <em>${s.weak}</em></h3><p>集中攻克不会和模糊词</p><span class="mode-bottom">开始强化 <b>→</b></span></button><button class="mode" data-mode="random"><span class="mode-symbol">⤨</span><h3>随机抽查</h3><p>检验学过的词是否还记得</p><span class="mode-bottom">抽查记忆 <b>→</b></span></button></div></section><div class="two-col"><section class="panel"><div class="section-title"><h2>记忆分布</h2><span class="subtle">全部词库</span></div>${distribution()}<p class="hint">“熟练”需要双向和间隔测试证据。短时间反复答对不会直接计入长期掌握。</p></section><section class="panel"><div class="section-title"><h2>今日弱词变化</h2></div><div class="weak-change"><div><strong>${s.newWeak}</strong><span>新增弱词</span></div><div><strong class="green">${s.resolved}</strong><span>已转为正常或熟练</span></div></div><p class="hint">按今天首次与最后一次作答状态比较，同一个词不重复计数。</p></section></div>${!data.words.length ? `<div class="empty-note"><strong>从你自己的词书开始</strong><p>支持 TXT、CSV、XLSX 和 JSON。导入至少 6 个不同释义的单词，即可体验全部难度。</p><button class="text-button" id="template">下载词书格式示例</button></div>` : ''}`;
    on('#import', 'click', importDialog);
    on('#template', 'click', () => download(new Blob(['\ufeff英文,中文,词性\nabandon,放弃,v.\nadequate,充足的,adj.\nreluctant,不情愿的,adj.\nreliable,可靠的,adj.\nmaintain,维持,v.\nobvious,明显的,adj.']), '词书格式示例.csv'));
    on('#resume', 'click', () => startSession(unfinished!));
    on('#finish-old', 'click', async () => { unfinished!.ended = Date.now(); await putItems('sessions', [unfinished]); render(); });
    document.querySelectorAll<HTMLElement>('[data-mode]').forEach(b => b.onclick = () => { startMode(b.dataset.mode!).catch(e => toast(e.message)); });
}
function distribution() { return `<div class="distribution">${(['fluent', 'normal', 'vague', 'unknown', 'new'] as Mastery[]).map(l => { const n = data.words.filter(w => w.state.level === l).length; return `<div><span class="dot ${l}"></span><span>${labels[l]}</span><div class="track"><i class="${l}" style="width:${data.words.length ? n / data.words.length * 100 : 0}%"></i></div><b>${n}</b></div>`; }).join('')}</div>`; }
async function startMode(mode: string, explicit?: Word[]) {
    if (startingSession)
        return;
    startingSession = true;
    try {
        await startModeOnce(mode, explicit);
    }
    finally {
        startingSession = false;
    }
}
async function startModeOnce(mode: string, explicit?: Word[]) {
    if (data.sessions.some(s => !s.ended)) {
        toast('请先继续或结束首页的未完成训练');
        return;
    }
    const range = document.querySelector<HTMLSelectElement>('#range-book')?.value ?? bookFilter;
    bookFilter = range;
    const count = Number(document.querySelector<HTMLSelectElement>('#range-count')?.value || 100);
    const ratio = Number(document.querySelector<HTMLSelectElement>('#range-ratio')?.value ?? data.settings.ratio);
    data.settings.ratio = ratio;
    await saveSettings(data.settings);
    let words = explicit || data.words.filter(w => !range || w.bookId === range);
    if (!explicit) {
        if (mode === 'due')
            words = words.filter(w => w.state.total && w.schedule.due <= Date.now());
        if (mode === 'weak')
            words = words.filter(isWeak);
        if (mode === 'random')
            words = words.filter(w => w.state.total);
        words = mode === 'due' || mode === 'weak' ? words.sort((a, b) => priority(b) - priority(a)) : shuffle(words);
        words = words.slice(0, count);
    }
    if (!words.length) {
        toast('这个范围暂时没有可测试的词');
        return;
    }
    question(words[0], data.words, ratio === 0 ? 'zh-en' : 'en-zh', data.settings.difficulty);
    const s = newSession(words, mode);
    await putItems('sessions', [s]);
    data.sessions.push(s);
    await startSession(s);
}
async function startSession(s: StudySession) { active = s; page = 'quiz'; shell(); await showQuestion(); }
async function showQuestion() {
    stopTimer();
    feedback = false;
    paused = false;
    elapsedBeforePause = 0;
    busy = true;
    if (!active)
        return;
    if (active.index >= active.queue.length) {
        active.ended = Date.now();
        await putItems('sessions', [active]);
        showResults(active);
        return;
    }
    try {
        if (!active.question) {
            const w = wordMap.get(active.queue[active.index])!;
            active.question = question(w, data.words, Math.random() * 100 < data.settings.ratio ? 'en-zh' : 'zh-en', data.settings.difficulty);
            await putItems('sessions', [active]);
        }
        const q = active.question, w = wordMap.get(q.wordId)!;
        $('#main').innerHTML = `<div class="quiz-top"><button id="quit" class="text-button">← 保存并退出</button><span>${active.index + 1} / ${active.queue.length}</span><button id="pause" class="text-button">暂停</button></div><div class="quiz-progress"><i style="width:${active.index / active.queue.length * 100}%"></i></div><section class="quiz-card"><div class="eyebrow">${q.direction === 'en-zh' ? 'ENGLISH → 中文' : '中文 → ENGLISH'}</div><div id="question-text" class="question">${esc(q.direction === 'en-zh' ? w.en : w.zh)}</div><p class="subtle">选出对应的${q.direction === 'en-zh' ? '中文释义' : '英文单词'}</p><div class="answers">${q.options.map((id, i) => { const option = wordMap.get(id)!; return `<button class="answer" data-answer="${id}"><kbd>${i + 1}</kbd><span>${esc(q.direction === 'en-zh' ? option.zh : option.en)}</span></button>`; }).join('')}</div><button id="unknown" class="unknown">不知道 <kbd>Space</kbd></button><div id="feedback" aria-live="polite"></div><div id="pause-cover" hidden><h2>已暂停</h2><p>暂停时间不计入反应时间</p><button id="continue" class="primary">继续答题</button></div></section><div class="quiz-hint">数字键选择 · 空格不知道 · Enter 下一题</div>`;
        document.querySelectorAll<HTMLButtonElement>('[data-answer]').forEach(b => b.onclick = () => { void submit(b.dataset.answer!, 'answer'); });
        on('#unknown', 'click', () => submit(null, 'unknown'));
        on('#quit', 'click', () => setPage('home'));
        on('#pause', 'click', pauseQuiz);
        on('#continue', 'click', resumeQuiz);
        // Start clock only after the new DOM has reached a paint boundary.
        await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        if (page !== 'quiz' || !active)
            return;
        busy = false;
        started = performance.now();
        timer = setTimeout(() => void submit(null, 'timeout'), data.settings.timeout);
    }
    catch (e) {
        busy = false;
        stopTimer();
        toast((e as Error).message);
        setPage('home');
    }
}
async function submit(selectedId: string | null, reason: ReviewRecord['reason']) {
    if (!active || busy || feedback || paused || !active.question)
        return;
    busy = true;
    stopTimer();
    const s = active, w = wordMap.get(s.question!.wordId)!;
    const ms = reason === 'timeout' ? data.settings.timeout : performance.now() - started + elapsedBeforePause;
    const result = answer(s, w, selectedId, ms, reason, data.settings);
    try {
        await saveAnswer(result.word, result.record, result.session);
    }
    catch {
        busy = false;
        paused = true;
        $('#feedback').innerHTML = '<p class="error">保存失败，已暂停。请检查存储空间，恢复后再答；本题未计入。</p>';
        $('#pause-cover').hidden = false;
        return;
    }
    data.words[data.words.findIndex(x => x.id === w.id)] = result.word;
    wordMap.set(w.id, result.word);
    data.records.push(result.record);
    data.sessions[data.sessions.findIndex(x => x.id === s.id)] = result.session;
    active = result.session;
    if (result.record.correct) {
        busy = false;
        await showQuestion();
        return;
    }
    feedback = true;
    busy = false;
    document.querySelectorAll<HTMLButtonElement>('.answer').forEach(b => { b.disabled = true; b.classList.toggle('correct', b.dataset.answer === w.id); b.classList.toggle('wrong', b.dataset.answer === selectedId); });
    $('#unknown').setAttribute('disabled', '');
    $('#feedback').innerHTML = `<div class="answer-feedback"><strong>${esc(w.en)} · ${esc(w.zh)}</strong><span>${reason === 'timeout' ? '超时' : reason === 'unknown' ? '已加入复习' : '已记录错词'} · ${seconds(result.record.ms)}</span><button id="next" class="primary">下一题 <kbd>Enter</kbd></button></div>`;
    on('#next', 'click', nextQuestion);
    if (data.settings.feedback >= 0)
        timer = setTimeout(() => void nextQuestion(), data.settings.feedback);
}
async function nextQuestion() {
    if (!feedback || busy)
        return;
    feedback = false;
    stopTimer();
    await showQuestion();
}
function pauseQuiz() {
    if (page !== 'quiz' || busy || paused || feedback)
        return;
    stopTimer();
    elapsedBeforePause += performance.now() - started;
    paused = true;
    $('#pause-cover').hidden = false;
}
function resumeQuiz() {
    if (!paused || busy)
        return;
    paused = false;
    $('#pause-cover').hidden = true;
    started = performance.now();
    timer = setTimeout(() => void submit(null, 'timeout'), Math.max(0, data.settings.timeout - elapsedBeforePause));
}
document.addEventListener('visibilitychange', () => {
    if (document.hidden)
        pauseQuiz();
});
let lastKeyAt = 0;
document.addEventListener('keydown', e => {
    if (page !== 'quiz' || (e.target as HTMLElement)?.matches('input,textarea,select') || $<HTMLDialogElement>('#modal').open)
        return;
    if (!['1', '2', '3', '4', '5', '6', ' ', 'Enter'].includes(e.key))
        return;
    e.preventDefault();
    if (e.repeat || performance.now() - lastKeyAt < 110)
        return;
    lastKeyAt = performance.now();
    if (e.key === 'Enter') {
        if (paused)
            resumeQuiz();
        else
            void nextQuestion();
        return;
    }
    if (feedback)
        return;
    if (e.key === ' ')
        void submit(null, 'unknown');
    else {
        const id = active?.question?.options[Number(e.key) - 1];
        if (id)
            void submit(id, 'answer');
    }
});
function showResults(s: StudySession) { stopTimer(); page = 'results'; const rs = data.records.filter(r => r.sessionId === s.id); const st = recordStats(rs); const ids = new Set(rs.map(r => r.wordId)); const ws = data.words.filter(w => ids.has(w.id)); active = null; $('#main').innerHTML = title('SESSION COMPLETE', '这一轮，记住了多少？', '薄弱词已记录，并安排了下一次复习。') + `<div class="metrics">${metric('本轮作答', String(st.attempts), '含本轮强化重复')}${metric('正确率', pct(st.accuracy), st.unique + ' 个不同单词')}${metric('平均反应', seconds(st.meanMs), '有效作答时间')}${metric('待强化', String(ws.filter(isWeak).length), '按本轮结束后的状态')}</div><div class="actions"><button class="primary" id="review-round">重测本轮弱词</button><button class="secondary" id="round-export">导出本轮弱词</button><button class="secondary" id="back-home">返回首页</button></div><div class="two-col">${(['unknown', 'vague'] as Mastery[]).map(l => `<section class="panel"><h2>${labels[l]}</h2>${wordChips(ws.filter(w => w.state.level === l))}</section>`).join('')}</div><details class="panel"><summary>正常与熟练 · ${ws.filter(w => !isWeak(w)).length} 词</summary>${wordChips(ws.filter(w => !isWeak(w)))}</details>`; on('#review-round', 'click', () => startMode('weak', ws.filter(isWeak))); on('#round-export', 'click', () => download(exportWords(ws.filter(isWeak), 'csv'), '本轮弱词.csv')); on('#back-home', 'click', () => setPage('home')); bindDetails(); }
function wordChips(ws: Word[]) { return ws.length ? `<div class="chips">${ws.map(w => `<button data-detail="${w.id}">${esc(w.en)}</button>`).join('')}</div>` : '<p class="subtle">没有这一类单词</p>'; }
function filtered(weak: boolean) { let ws = data.words.filter(w => (!weak || isWeak(w)) && (!bookFilter || w.bookId === bookFilter) && (!levelFilter || w.state.level === levelFilter) && (!search || `${w.en} ${w.zh} ${w.tags}`.toLowerCase().includes(search.toLowerCase()))); return ws.sort(sort === 'alpha' ? (a, b) => a.en.localeCompare(b.en) : sort === 'due' ? (a, b) => a.schedule.due - b.schedule.due : (a, b) => priority(b) - priority(a)); }
function library(weak: boolean) {
    $('#main').innerHTML = title(weak ? 'FOCUSED REVIEW' : 'YOUR WORDBOOKS', weak ? '把薄弱的地方练扎实' : '你的词库', weak ? '不会和模糊词，按照当前复习优先级排列。' : '导入你要学的词，所有记录留在这台设备。', `<button id="import" class="primary">＋ 导入词书</button>`) + `<div class="book-tabs"><button data-book="" class="${!bookFilter ? 'selected' : ''}">全部词书</button>${data.books.map(b => `<button data-book="${b.id}" class="${bookFilter === b.id ? 'selected' : ''}">${esc(b.name)} <small>${data.words.filter(w => w.bookId === b.id).length}</small></button>`).join('')}</div><div class="toolbar"><input id="search" placeholder="搜索单词、释义或标签" aria-label="搜索词库" value="${esc(search)}"><select id="level" aria-label="掌握筛选"><option value="">全部状态</option>${Object.entries(labels).filter(([k]) => !weak || k === 'unknown' || k === 'vague').map(([k, v]) => `<option value="${k}" ${k === levelFilter ? 'selected' : ''}>${v}</option>`).join('')}</select><select id="sort" aria-label="排序"><option value="priority" ${sort === 'priority' ? 'selected' : ''}>优先级排序</option><option value="alpha" ${sort === 'alpha' ? 'selected' : ''}>字母排序</option><option value="due" ${sort === 'due' ? 'selected' : ''}>复习时间排序</option></select><button id="train-filter" class="secondary">测试筛选结果</button><button id="export-filter" class="secondary">导出</button>${bookFilter ? '<button id="rename-book" class="text-button">重命名</button><button id="delete-book" class="danger-text">删除词书</button>' : ''}</div><section class="panel no-padding" id="word-table"></section>`;
    drawTable(weak);
    on('#import', 'click', importDialog);
    document.querySelectorAll<HTMLElement>('[data-book]').forEach(b => b.onclick = () => { bookFilter = b.dataset.book!; listPage = 0; library(weak); });
    on('#search', 'input', e => { search = (e.target as HTMLInputElement).value; listPage = 0; drawTable(weak); });
    on('#level', 'change', e => { levelFilter = (e.target as HTMLSelectElement).value; listPage = 0; drawTable(weak); });
    on('#sort', 'change', e => { sort = (e.target as HTMLSelectElement).value; drawTable(weak); });
    on('#train-filter', 'click', () => startMode('filtered', filtered(weak).slice(0, 1000)));
    on('#export-filter', 'click', () => exportDialog(filtered(weak)));
    on('#rename-book', 'click', () => {
        const b = data.books.find(b => b.id === bookFilter)!;
        modal(`<h2>重命名词书</h2><input id="book-name" value="${esc(b.name)}" maxlength="100"><button id="rename-save" class="primary">保存</button>`);
        on('#rename-save', 'click', async () => {
            const name = $<HTMLInputElement>('#book-name').value.trim();
            if (!name)
                throw Error('名称不能为空');
            const updated = { ...b, name };
            await putItems('books', [updated]);
            b.name = name;
            closeModal();
            library(weak);
        });
    });
    on('#delete-book', 'click', deleteBookDialog);
}
function drawTable(weak: boolean) { const ws = filtered(weak), pages = Math.max(1, Math.ceil(ws.length / 50)); listPage = Math.min(listPage, pages - 1); $('#word-table').innerHTML = `<div class="table-scroll"><table><thead><tr><th>单词 / 释义</th><th>掌握状态</th><th>优先级</th><th>正确 / 作答</th><th>平均反应</th><th>下次复习</th></tr></thead><tbody>${ws.slice(listPage * 50, listPage * 50 + 50).map(w => `<tr><td><button class="word-link" data-detail="${w.id}">${esc(w.en)}</button><small>${esc(w.zh)}</small></td><td><span class="badge ${w.state.level}">${labels[w.state.level]}</span></td><td><b class="priority-${priorityGrade(w)}">${priorityGrade(w)}</b></td><td>${w.state.correct} / ${w.state.total}</td><td>${w.state.total ? seconds(w.state.meanMs) : '—'}</td><td>${w.state.total ? (w.schedule.due <= Date.now() ? '<span class="due-text">已到期</span>' : date(w.schedule.due)) : '未测试'}</td></tr>`).join('') || '<tr><td colspan="6" class="empty-cell">暂无符合条件的单词。导入词书或调整筛选。</td></tr>'}</tbody></table></div><div class="pagination"><span>共 ${ws.length} 个词 · 每页 50 个</span><div><button id="prev" ${listPage === 0 ? 'disabled' : ''}>上一页</button><span>${listPage + 1} / ${pages}</span><button id="next-page" ${listPage === pages - 1 ? 'disabled' : ''}>下一页</button></div></div>`; on('#prev', 'click', () => { listPage--; drawTable(weak); }); on('#next-page', 'click', () => { listPage++; drawTable(weak); }); bindDetails(); }
function bindDetails() { document.querySelectorAll<HTMLElement>('[data-detail]').forEach(b => b.onclick = () => wordDetail(wordMap.get(b.dataset.detail!)!)); }
function wordDetail(w: Word) {
    const rs = data.records.filter(r => r.wordId === w.id).sort((a, b) => a.at - b.at);
    modal(`<div class="eyebrow">WORD MEMORY</div><h2 class="detail-word">${esc(w.en)}</h2><p>${esc(w.phonetic)} ${esc(w.pos)}</p><h3>${esc(w.zh)}</h3>${w.example ? `<blockquote>${esc(w.example)}</blockquote>` : ''}${w.collocation ? `<p>搭配：${esc(w.collocation)}</p>` : ''}${w.tags ? `<p>标签：${esc(w.tags)}</p>` : ''}<div class="detail-stats"><span>总测试 <b>${w.state.total}</b></span><span>正确 / 错误 <b>${w.state.correct} / ${w.state.total - w.state.correct}</b></span><span>平均反应 <b>${seconds(w.state.meanMs)}</b></span><span>最近反应 <b>${seconds(w.state.lastMs)}</b></span>${Object.entries(w.state.directions).map(([k, v]) => `<span>${k === 'en-zh' ? '英→中' : '中→英'} <b>${v.total ? pct(v.correct / v.total) : '无记录'} · ${v.total} 次</b></span>`).join('')}<span>当前状态 <b>${labels[w.state.level]}</b></span><span>下次复习 <b>${date(w.schedule.due)}</b></span></div><h3>最近 20 次状态变化</h3><div class="history">${rs.slice(-20).map(r => `<span class="badge ${r.after}" title="${date(r.at)} · ${seconds(r.ms)}">${labels[r.after]}</span>`).join('') || '尚无记录'}</div><h3>容易混淆</h3><p>${Object.entries(w.confusions).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${esc(wordMap.get(id)?.en || '已删除')}（${n}次）`).join('、') || '尚未记录混淆'}</p><div class="actions"><button id="detail-review" class="primary">单独重测</button><button id="edit-word" class="secondary">编辑词条</button></div>`);
    on('#detail-review', 'click', async () => { closeModal(); await startMode('single', [w]); });
    on('#edit-word', 'click', () => {
        modal(`<h2>编辑 ${esc(w.en)}</h2><p class="hint">修改释义不会重置学习记录。</p><label>中文释义<textarea id="edit-zh">${esc(w.zh)}</textarea></label><label>词性<input id="edit-pos" value="${esc(w.pos)}"></label><label>标签<input id="edit-tags" value="${esc(w.tags)}"></label><button id="edit-save" class="primary">保存修改</button>`);
        on('#edit-save', 'click', async () => {
            const zh = $<HTMLTextAreaElement>('#edit-zh').value.trim();
            if (!zh)
                throw Error('释义不能为空');
            const updated = { ...w, zh, pos: $<HTMLInputElement>('#edit-pos').value, tags: $<HTMLInputElement>('#edit-tags').value };
            await putItems('words', [updated]);
            data.words[data.words.findIndex(x => x.id === w.id)] = updated;
            reindex();
            closeModal();
            render();
        });
    });
}
function exportDialog(ws: Word[]) { modal(`<h2>导出 ${ws.length} 个单词</h2><p>导出当前筛选结果。迁移学习记录请使用设置中的完整备份。</p><div class="actions">${['txt', 'csv', 'xlsx'].map(ext => `<button data-export="${ext}" class="secondary">${ext.toUpperCase()}</button>`).join('')}</div>`); document.querySelectorAll<HTMLElement>('[data-export]').forEach(b => b.onclick = () => { download(exportWords(ws, b.dataset.export!), '词间词表.' + b.dataset.export); closeModal(); }); }
function importDialog() {
    let parsed: Parsed | null = null;
    modal(`<h2>导入你的词书</h2><p>支持 TXT / CSV / XLSX / JSON。Excel 读取第一个工作表。</p><label>词书名称<input id="import-name" placeholder="例如：高中核心词汇" maxlength="100"></label><label class="file-box">选择词书文件<input id="import-file" type="file" accept=".txt,.csv,.tsv,.xlsx,.xls,.json"></label><details><summary>也可以直接粘贴词表</summary><textarea id="paste-words" rows="6" placeholder="abandon 放弃&#10;adequate 充足的"></textarea><button id="parse-paste" class="secondary">预览粘贴内容</button></details><div id="import-preview"></div><div class="actions"><button id="import-confirm" class="primary" disabled>确认导入</button></div>`);
    const preview = (p: Parsed) => { parsed = p; $('#import-preview').innerHTML = `<p><b>${p.rows.length}</b> 个有效词 · ${p.duplicates} 个重复已跳过 · ${p.errors.length} 个格式问题</p><div class="preview-list">${p.rows.slice(0, 8).map(r => `<div><b>${esc(r.en)}</b><span>${esc(r.zh)}</span></div>`).join('')}</div>${p.errors.length ? `<details><summary>查看格式问题</summary><pre>${esc(p.errors.slice(0, 100).join('\n'))}</pre></details>` : ''}<p class="hint">相同英文在同一次导入中保留第一条。不同词书各自保存学习进度。</p>`; $<HTMLButtonElement>('#import-confirm').disabled = !p.rows.length; };
    on('#import-file', 'change', async () => {
        parsed = null;
        $<HTMLButtonElement>('#import-confirm').disabled = true;
        const f = $<HTMLInputElement>('#import-file').files?.[0];
        if (!f)
            return;
        $('#import-preview').textContent = '正在读取词书…';
        if (!$<HTMLInputElement>('#import-name').value)
            $<HTMLInputElement>('#import-name').value = f.name.replace(/\.[^.]+$/, '');
        try {
            preview(await parseFile(f));
        }
        catch (e) {
            $('#import-preview').textContent = '未能解析文件';
            throw e;
        }
    });
    on('#parse-paste', 'click', () => preview(parseText($<HTMLTextAreaElement>('#paste-words').value, 'txt')));
    on('#import-confirm', 'click', async () => {
        if (!parsed?.rows.length)
            return;
        const name = $<HTMLInputElement>('#import-name').value.trim() || '我的词书';
        $<HTMLButtonElement>('#import-confirm').disabled = true;
        const book = { id: uid(), name, created: Date.now() };
        const words = parsed.rows.map((r, i) => makeWord(r, book.id, i));
        const next = { ...data, books: [...data.books, book], words: [...data.words, ...words] };
        try {
            await replaceData(next);
            data = next;
            reindex();
            closeModal();
            render();
            toast(`已导入 ${words.length} 个单词`);
            navigator.storage?.persist?.().catch(() => false);
        }
        catch (e) {
            $<HTMLButtonElement>('#import-confirm').disabled = false;
            throw e;
        }
    });
}
function deleteBookDialog() {
    const b = data.books.find(b => b.id === bookFilter)!;
    modal(`<h2>删除「${esc(b.name)}」？</h2><p>这会删除词书、其中单词及对应学习记录。删除前建议导出完整备份。</p><button id="before-delete" class="secondary">先导出完整备份</button><button id="delete-confirm" class="danger">确认删除</button>`);
    on('#before-delete', 'click', exportBackup);
    on('#delete-confirm', 'click', async () => {
        if (data.sessions.some(s => !s.ended))
            throw Error('请先结束未完成的训练，再删除词书');
        const ids = new Set(data.words.filter(w => w.bookId === b.id).map(w => w.id));
        const next = structuredClone(data);
        next.books = next.books.filter(x => x.id !== b.id);
        next.words = next.words.filter(w => !ids.has(w.id));
        next.wordExposures = next.wordExposures.filter(e => !ids.has(e.wordId));
        for (const w of next.words)
            for (const id of ids)
                delete w.confusions[id];
        next.records = next.records.filter(r => !ids.has(r.wordId)).map(r => ({ ...r, selectedId: r.selectedId && ids.has(r.selectedId) ? null : r.selectedId }));
        next.sessions = next.sessions.map(s => ({ ...s, queue: s.queue.filter(id => !ids.has(id)), index: s.queue.slice(0, s.index).filter(id => !ids.has(id)).length, question: null, retries: Object.fromEntries(Object.entries(s.retries).filter(([id]) => !ids.has(id))) }));
        await replaceData(next);
        data = next;
        bookFilter = '';
        reindex();
        closeModal();
        render();
    });
}
function statistics() { const s = summary(data); $('#main').innerHTML = title('MEMORY INSIGHTS', '看见记忆的变化', '统计来自实际作答记录；没有学习数据的日期保持空白。') + `<div class="metrics">${metric('累计作答', String(data.records.length), '全部历史记录')}${metric('测试过的词', String(data.words.filter(w => w.state.total).length), '去重后的词条')}${metric('有效掌握', String(s.effective), '当前未逾期的熟练词')}${metric('待复习', String(s.due), '按每个词独立调度')}</div><div class="two-col"><section class="panel"><h2>双向表现</h2>${Object.entries(s.directions).map(([k, v]) => `<div class="direction-stat"><b>${k === 'en-zh' ? '英文 → 中文' : '中文 → 英文'}</b><strong>${v.attempts ? pct(v.accuracy) : '—'}</strong><span>${v.attempts} 次 · ${seconds(v.meanMs)}</span></div>`).join('')}<p class="hint">两种方向都是选择题。中→英成绩不能代替独立拼写能力。</p></section><section class="panel"><h2>掌握分布</h2>${distribution()}</section></div><section class="panel"><div class="section-title"><h2>长期趋势</h2><select id="trend-days" aria-label="趋势时间"><option value="7">最近 7 天</option><option value="30">最近 30 天</option></select></div><div id="trend"></div></section><p class="hint">有效掌握采用保守规则：跨间隔测试、双向表现与复习到期时间共同判断，是估算值。它不代表经过标准化测量的词汇量。</p>`; drawTrend(7); on('#trend-days', 'change', e => drawTrend(Number((e.target as HTMLSelectElement).value))); }
function drawTrend(days: number) { const rows = trend(data, days), max = Math.max(1, ...rows.map(r => r.attempts)); $('#trend').innerHTML = `<div class="chart" aria-label="每日作答次数">${rows.map(r => `<div class="bar-col"><span>${r.attempts || ''}</span><div class="bar" style="height:${Math.max(2, r.attempts / max * 120)}px" title="${r.date}：${r.attempts}次"></div><small>${r.date.slice(5)}</small></div>`).join('')}</div><div class="table-scroll"><table><thead><tr><th>日期</th><th>作答</th><th>正确率</th><th>平均反应</th><th>进入熟练次数</th><th>到期答错次数</th></tr></thead><tbody>${rows.filter(r => r.attempts).map(r => `<tr><td>${r.date}</td><td>${r.attempts}</td><td>${pct(r.accuracy)}</td><td>${seconds(r.meanMs)}</td><td>${r.gained}</td><td>${r.forgotten}</td></tr>`).join('') || '<tr><td colspan="6">这段时间还没有学习记录</td></tr>'}</tbody></table></div>`; }
function aiPage() {
    const configured = !!(data.settings.endpoint && data.settings.model && data.settings.key);
    $('#main').innerHTML = title('OPTIONAL INTELLIGENCE', '让数据给出下一步', 'AI 分析是可选功能，基础学习与复习无需联网。') + `<section class="panel ai-intro"><div class="ai-mark">✦</div><h2>分析你的真实学习记录</h2><p>发送汇总指标、最近 30 天趋势，以及最多 60 个薄弱词和混淆记录到你配置的 API。不会发送完整词书或逐题历史。</p><p class="hint">报告提供建议，不会自动修改设置。API 按供应商规则计费。</p><div class="actions"><button id="analyze" class="primary" ${analysisBusy ? 'disabled' : ''}>${analysisBusy ? '正在分析…' : '生成学情报告'}</button><button id="payload" class="secondary">查看将发送的数据</button><button id="ai-config" class="text-button">${configured ? '修改 API 配置' : '先配置 API'}</button></div></section><div id="reports">${[...data.analyses].sort((a, b) => b.at - a.at).map(a => `<section class="panel report"><div class="section-title"><h2>${date(a.at)}</h2><span>${esc(a.model)} · ${a.sampleSize} 次作答</span></div><div class="report-text">${esc(a.text)}</div></section>`).join('') || '<div class="empty-note">暂无报告。先完成一轮训练，再生成分析。</div>'}</div>`;
    on('#ai-config', 'click', () => setPage('settings'));
    on('#payload', 'click', () => modal(`<h2>将发送的数据</h2><pre>${esc(JSON.stringify(analysisPayload(data), null, 2))}</pre>`));
    on('#analyze', 'click', async () => {
        if (analysisBusy)
            return;
        if (!data.records.length)
            throw Error('先完成一些作答，再分析真实数据');
        if (!configured)
            throw Error('请先在设置中保存 API 配置');
        analysisBusy = true;
        aiPage();
        try {
            const sourceData = data;
            const report = await analyze(sourceData);
            if (data !== sourceData) {
                toast('数据已发生替换，请基于当前数据重新分析');
                return;
            }
            await putItems('analyses', [report]);
            data.analyses.push(report);
            toast('学情报告已保存');
        }
        finally {
            analysisBusy = false;
            if (page === 'ai')
                aiPage();
        }
    });
}
function settingsPage() {
    const s = data.settings;
    $('#main').innerHTML = title('PREFERENCES', '按你的速度来', '时间阈值、测试难度和数据备份，都由你控制。') + `<form id="settings-form"><div class="two-col"><section class="panel"><h2>测试与节奏</h2><div class="form-grid"><label>秒答上限（秒）<input name="fast" type="number" min="0.1" step="0.1" value="${s.fast / 1000}" required></label><label>正常上限（秒）<input name="normal" type="number" min="0.2" step="0.1" value="${s.normal / 1000}" required></label><label>超时（秒）<input name="timeout" type="number" min="0.3" max="120" step="0.1" value="${s.timeout / 1000}" required></label><label>英→中比例（%）<input name="ratio" type="number" min="0" max="100" value="${s.ratio}" required></label><label>难度<select name="difficulty">${[['easy', '简单 · 4项'], ['normal', '普通 · 4项'], ['hard', '困难 · 6项']].map(([v, t]) => `<option value="${v}" ${s.difficulty === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label>答错反馈<select name="feedback">${[[0, '立即下一题'], [500, '停留 0.5 秒'], [1000, '停留 1 秒'], [-1, '手动继续']].map(([v, t]) => `<option value="${v}" ${s.feedback === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div><p class="hint">答对立即下一题。正常上限至超时之间为模糊。切换标签页会自动暂停计时。</p></section><section class="panel"><h2>AI API 配置</h2><label>Endpoint<input name="endpoint" type="url" placeholder="https://你的服务地址/v1" value="${esc(s.endpoint)}" autocomplete="off"></label><label>Model Name<input name="model" value="${esc(s.model)}" placeholder="填写供应商提供的模型名称"></label><label>API Key<input name="key" type="password" value="${esc(s.key)}" autocomplete="off" placeholder="仅用于你配置的地址"></label><label class="check"><input name="rememberKey" type="checkbox" ${s.rememberKey ? 'checked' : ''}> 在这台设备记住 Key</label><p class="hint">不勾选则只保留到页面关闭。勾选后明文保存在本地浏览器数据库，完整备份仍会剔除 Key。浏览器直连需要供应商支持 CORS。</p></section></div><button class="primary" type="submit">保存设置</button></form><section class="panel backup-panel"><h2>备份与迁移</h2><p>导出完整 JSON 后可换电脑恢复。请定期备份，浏览器清理和无痕模式可能移除本地数据。</p><div class="actions"><button id="backup" class="primary">导出全部学习数据</button><label class="button secondary">导入备份<input id="restore" type="file" accept=".json" hidden></label><button id="persist" class="secondary">申请持久存储</button><button id="clear" class="danger-text">清空本地数据</button></div><p id="storage-info" class="hint">学习数据按浏览器和站点地址保存。请一直使用相同的 localhost:4173 地址。</p></section>`;
    on('#settings-form', 'submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target as HTMLFormElement);
        const updated: Settings = { ...data.settings, fast: Number(f.get('fast')) * 1000, normal: Number(f.get('normal')) * 1000, timeout: Number(f.get('timeout')) * 1000, ratio: Number(f.get('ratio')), difficulty: f.get('difficulty') as Settings['difficulty'], feedback: Number(f.get('feedback')), endpoint: String(f.get('endpoint') || '').trim(), model: String(f.get('model') || '').trim(), key: String(f.get('key') || '').trim(), rememberKey: f.get('rememberKey') === 'on' };
        if (!validSettings(updated))
            throw Error('阈值需满足：0 < 秒答 < 正常 < 超时 ≤ 120 秒');
        if (updated.endpoint)
            endpoint(updated.endpoint);
        await saveSettings(updated);
        data.settings = updated;
        toast('设置已保存');
    });
    on('#backup', 'click', exportBackup);
    on('#restore', 'change', async () => {
        const f = $<HTMLInputElement>('#restore').files?.[0];
        if (!f)
            return;
        if (f.size > 250 * 1024 * 1024)
            throw Error('备份超过250 MB，请联系开发者分批迁移');
        const restored = validateBackup(JSON.parse(await f.text()));
        modal(`<h2>恢复这份备份？</h2><p>包含 ${restored.books.length} 本词书、${restored.words.length} 个词、${restored.records.length} 条学习记录。恢复将替换当前设备的数据。</p><div class="actions"><button id="restore-before" class="secondary">先导出当前数据</button><button id="restore-confirm" class="primary">确认替换并恢复</button></div>`);
        on('#restore-before', 'click', exportBackup);
        on('#restore-confirm', 'click', async () => { await replaceData(restored); data = restored; reindex(); bookFilter = ''; closeModal(); render(); toast('备份已恢复，请重新填写 API Key'); });
    });
    on('#persist', 'click', async () => { const ok = await navigator.storage?.persist?.(); toast(ok ? '浏览器已允许持久存储；仍建议定期备份' : '浏览器暂未批准；数据仍会保存，请保持备份'); });
    on('#clear', 'click', () => {
        modal('<h2>清空全部本地数据？</h2><p>此操作不可撤回。输入「清空」确认。</p><input id="clear-text" aria-label="输入清空确认"><div class="actions"><button id="clear-backup" class="secondary">先导出备份</button><button id="clear-confirm" class="danger">确认清空</button></div>');
        on('#clear-backup', 'click', exportBackup);
        on('#clear-confirm', 'click', async () => {
            if ($<HTMLInputElement>('#clear-text').value !== '清空')
                throw Error('请输入「清空」');
            const next = emptyData();
            await replaceData(next);
            data = next;
            reindex();
            bookFilter = '';
            closeModal();
            render();
            toast('已清空本地数据');
        });
    });
}
function exportBackup() { download(new Blob([backup(data)], { type: 'application/json' }), `词间完整备份-${dayKey(Date.now())}.json`); toast('备份已导出（不含 API Key）'); }
async function boot() {
    await openDB();
    data = await loadData();
    reindex();
    render();
    if (data.migration && Date.now() - data.migration.at < 10 * 60 * 1000)
        setTimeout(() => toast(`本地数据库已从 v${data.migration!.from} 升级到 v${data.migration!.to}；建议立即导出一次完整备份`), 600);
}
if (navigator.locks) {
    void navigator.locks.request('vocabulary-memory-writer', { ifAvailable: true }, async (lock) => {
        if (!lock) {
            $('#app').innerHTML = '<div class="startup-error"><h1>词间已在另一个窗口打开</h1><p>为避免学习记录互相覆盖，请关闭另一个窗口后刷新。</p><button onclick="location.reload()">刷新</button></div>';
            return;
        }
        try {
            await boot();
            await new Promise(() => { });
        }
        catch (e) {
            $('#app').textContent = '无法打开本地数据库：' + (e as Error).message;
        }
    });
}
else {
    $('#app').textContent = '此浏览器缺少安全的多窗口存储锁，请使用较新的 Chrome、Edge、Firefox 或 Safari。';
}
