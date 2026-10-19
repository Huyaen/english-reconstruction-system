import './style.css';
import type { Data, Word, StudySession, Settings, ReviewRecord, Mastery, DailyPlan, PlanItem, EnergyState, GrammarConcept, SentenceRecord, SentenceStepRecord, SentenceAttempt, SentenceEvidenceClass, GrammarCategory } from './types.ts';
import { openDB, getDB, loadData, replaceData, saveSettings, putItems, saveAnswer, savePreview, backup, validateBackup, emptyData } from './db.ts';
import { makeWord, uid, labels, priority, priorityGrade, shuffle, question, validSettings } from './core.ts';
import { parseFile, parseText, exportWords, type Parsed } from './import.ts';
import { newSession, answer } from './quiz.ts';
import { summary, trend, isWeak, recordStats, dayKey } from './stats.ts';
import { analyze, analysisPayload, endpoint } from './ai.ts';
import { applyPreview, isForgotten, isUnseen, lifecycleOf, LIFECYCLE_LABELS, recallEligible, type PreviewResult } from './evidence.ts';
import { buildNewWordQueue, recommendedNewWordCount } from './pools.ts';
import { effectiveDue, fsrsRetrievability, hasFsrsHistory } from './fsrs.ts';
import { $, esc, pct, seconds, date, toast, download, modal, closeModal, on } from './ui.ts';
import { applyPlanAction, buildReplacement, calibrateAfterRecall, createDailyPlan, evaluateRecallSession, latestLearningAt, moduleCapabilities, MODULES, planProgress, regenerateRemaining, PLANNER_CONFIG, TASK_LABELS, type PlannerInput, type RecallCandidate } from './planner.ts';
import type { StepEvaluation } from './sentenceLab.ts';
import { loadPlan, savePlan, StalePlanError } from './plannerStore.ts';
// —— Phase 4：Sentence Lab 与 Grammar Knowledge Graph ——
import { GRAMMAR_BAND_LABELS, GRAMMAR_CATEGORY_LABELS, type GrammarConceptDef, GRAMMAR_CONFIG, GRAMMAR_TAXONOMY, ancestorConcepts, conceptById, conceptStates, grammarState, prerequisitesSatisfied, validateTaxonomy, weakConcepts, type GrammarConceptState } from './grammar.ts';
import { CLAUSE_LABELS, ROLE_LABELS, clauseForToken, readStructure, structureRows, structureSummary, validateStructure, type SentenceStructure } from './sentenceStructure.ts';
import { EVIDENCE_LABELS, STEP_LABELS, SUPPORT_LABELS, MAX_SUPPORT_LEVEL, buildLabPlan, buildTransferTask, evaluateStep, stepRecord, supportHint, type LabPlan, type LabStep } from './sentenceLab.ts';
import { applyEvidence, justInTimeCard, stepConceptMap, type AttemptDraft } from './sentenceEvidence.ts';
import { curatedSentenceRecords, effectiveSourceMix, generationUnavailableReason, sentenceGenerationFallback, sourceCapabilities, userSentenceRecord } from './sentenceSources.ts';
import { SENTENCE_TASK_LABELS, selectSentenceBatch } from './sentenceSelection.ts';
import { sentenceConceptIds, sentenceConceptNames, sentencesForConcept } from './sentenceGraphMap.ts';
import { ensureGraphData, loadSentences, saveSentences, sentenceAttemptsDesc } from './sentenceStore.ts';
import { saveSentenceEvidence as dbSaveSentenceEvidence } from './db.ts';
let data: Data, page = 'home', bookFilter = '', search = '', levelFilter = '', sort = 'priority', listPage = 0;
let active: StudySession | null = null, feedback = false, busy = false, started = 0, timer: ReturnType<typeof setTimeout> | null = null, paused = false;
let startingSession = false;
let wordMap = new Map<string, Word>();
let elapsedBeforePause = 0;
let previewWords: Word[] = [], previewIndex = 0;
let analysisBusy = false;
// —— Phase 3 状态 ——
let todayPlan: DailyPlan | null = null;
let planBudget: number = PLANNER_CONFIG.budget.default;
let planEnergy: EnergyState = 'normal';
let planBusy = false;
let taskExecution: {
    planTaskId: string;
    kind: string;
    startedAt: number;
    sessionId: string;
} | null = null;
// —— Phase 4 状态 ——
let sentenceRecords: SentenceRecord[] = [];
let grammarCategoryFilter: string = '';
let grammarSelectedConcept = '';
let labSession: LabRun | null = null;
interface LabRun {
    sessionId: string;
    queue: string[];
    index: number;
    planTaskId: string | null;
    planTaskKind: string | null;
    startedAt: number;
    current: {
        sentenceId: string;
        plan: LabPlan;
        stepIndex: number;
        stepRecords: SentenceStepRecord[];
        supportLevel: number;
        answered: string | null;
        evaluation: StepEvaluation | null;
        stepStartedAt: number;
        transferOf: string | null;
        delayed: boolean;
        attempts: number;
        done: boolean;
        result: {
            evidenceClass: string;
            counts: boolean;
            allCorrect: boolean;
            duplicate: boolean;
            conceptIds: string[];
        } | null;
    } | null;
    finished: {
        sentenceId: string;
        correctSteps: number;
        total: number;
        evidenceClass: string;
        conceptIds: string[];
    }[];
}
const navs = [['home', '◫', '今日学习'], ['books', '▤', '我的词库'], ['weak', '◎', '薄弱词'], ['sentence', '❝', '句子训练'], ['grammar', '◈', '语法图谱'], ['stats', '▥', '学习统计'], ['ai', '✦', 'AI 学情'], ['settings', '⚙', '设置与备份']];
function reindex() { wordMap = new Map(data.words.map(w => [w.id, w])); }
function setPage(p: string) {
    if ((page === 'quiz' && busy) || startingSession) {
        toast('正在保存训练，请稍后切换');
        return;
    }
    stopTimer();
    active = null;
    if (p !== 'preview') {
        previewWords = [];
        previewIndex = 0;
    }
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
function render() { shell(); ({ home: home, books: () => library(false), weak: () => library(true), stats: statistics, ai: aiPage, settings: settingsPage, preview: previewPage, sentence: sentencePage, grammar: grammarPage, lab: labPage }[page] || home)(); }
function title(kicker: string, title: string, sub: string, action = '') { return `<div class="page-title"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${sub}</p></div>${action}</div>`; }
function metric(label: string, value: string, note: string) { return `<div class="metric"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`; }
function rangeControls() { return `<div class="range-controls"><label>学习范围<select id="range-book"><option value="">全部词书</option>${data.books.map(b => `<option value="${b.id}" ${bookFilter === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label><label>本轮词量<select id="range-count">${[50, 100, 300, 500, 1000].map(n => `<option value="${n}" ${n === 100 ? 'selected' : ''}>${n} 词</option>`).join('')}</select></label><label>测试方向<select id="range-ratio">${![0, 30, 50, 70, 100].includes(data.settings.ratio) ? `<option value="${data.settings.ratio}" selected>英→中 ${data.settings.ratio}%（自定义）</option>` : ''}<option value="50" ${data.settings.ratio === 50 ? 'selected' : ''}>双向各 50%</option><option value="70" ${data.settings.ratio === 70 ? 'selected' : ''}>英→中 70%</option><option value="30" ${data.settings.ratio === 30 ? 'selected' : ''}>中→英 70%</option><option value="100" ${data.settings.ratio === 100 ? 'selected' : ''}>识别 · 英→中</option><option value="0" ${data.settings.ratio === 0 ? 'selected' : ''}>提取 · 中→英</option></select></label></div>`; }
function home() {
    const s = summary(data), unfinished = data.sessions.find(s => !s.ended);
    $('#main').innerHTML = title('DAILY PRACTICE', '今天，让记忆再深一点', '快速检索，找到弱词，在忘记之前再见一次。', `<button id="import" class="secondary">＋ 导入词书</button>`) + todaySection() + `<div class="metrics">${metric('今日作答', String(s.today.attempts), '覆盖 ' + s.today.unique + ' 个单词')}${metric('今日正确率', s.today.attempts ? pct(s.today.accuracy) : '—', '英中双向检索')}${metric('平均反应', s.today.attempts ? seconds(s.today.meanMs) : '—', '从题目出现到提交')}${metric('有效掌握', String(s.effective), '双向 · 多次间隔验证')}</div>${newWordsPanel()}${unfinished ? `<div class="resume"><span>有一轮未完成的训练 · 已答 ${unfinished.answered} 题</span><button id="resume" class="primary">继续本轮</button><button id="finish-old" class="text-button">结束本轮</button></div>` : ''}<section class="panel practice"><div class="section-title"><h2>开始一轮训练</h2><span class="subtle">${data.words.length} 个词 · ${data.books.length} 本词书</span></div>${rangeControls()}<div class="modes"><button class="mode featured" data-mode="quick"><span class="mode-symbol">↗</span><h3>快速刷词</h3><p>大量扫描，找出不熟的词</p><span class="mode-bottom">开始检索 <b>→</b></span></button><button class="mode" data-mode="due"><span class="mode-symbol">◷</span><h3>今日复习 <em>${s.due}</em></h3><p>优先处理已到期的记忆</p><span class="mode-bottom">巩固记忆 <b>→</b></span></button><button class="mode" data-mode="weak"><span class="mode-symbol">◎</span><h3>弱词强化 <em>${s.weak}</em></h3><p>集中攻克不会和模糊词</p><span class="mode-bottom">开始强化 <b>→</b></span></button><button class="mode" data-mode="random"><span class="mode-symbol">⤨</span><h3>随机抽查</h3><p>检验学过的词是否还记得</p><span class="mode-bottom">抽查记忆 <b>→</b></span></button></div></section><div class="two-col"><section class="panel"><div class="section-title"><h2>记忆分布</h2><span class="subtle">全部词库</span></div>${distribution()}<p class="hint">“熟练”需要双向和间隔测试证据。短时间反复答对不会直接计入长期掌握。</p></section><section class="panel"><div class="section-title"><h2>今日弱词变化</h2></div><div class="weak-change"><div><strong>${s.newWeak}</strong><span>新增弱词</span></div><div><strong class="green">${s.resolved}</strong><span>已转为正常或熟练</span></div></div><p class="hint">按今天首次与最后一次作答状态比较，同一个词不重复计数。</p></section></div>${!data.words.length ? `<div class="empty-note"><strong>从你自己的词书开始</strong><p>支持 TXT、CSV、XLSX 和 JSON。导入至少 6 个不同释义的单词，即可体验全部难度。</p><button class="text-button" id="template">下载词书格式示例</button></div>` : ''}`;
    on('#import', 'click', importDialog);
    bindPlan();
    on('#template', 'click', () => download(new Blob(['\ufeff英文,中文,词性\nabandon,放弃,v.\nadequate,充足的,adj.\nreluctant,不情愿的,adj.\nreliable,可靠的,adj.\nmaintain,维持,v.\nobvious,明显的,adj.']), '词书格式示例.csv'));
    on('#resume', 'click', () => startSession(unfinished!));
    on('#finish-old', 'click', async () => { unfinished!.ended = Date.now(); await putItems('sessions', [unfinished]); render(); });
    on('#preview-start', 'click', () => startPreview());
    on('#reflow-start', 'click', () => startReflow());
    document.querySelectorAll<HTMLElement>('[data-mode]').forEach(b => b.onclick = () => { startMode(b.dataset.mode!).catch(e => toast(e.message)); });
}
function distribution() { return `<div class="distribution">${(['fluent', 'normal', 'vague', 'unknown', 'new'] as Mastery[]).map(l => { const n = data.words.filter(w => w.state.level === l).length; return `<div><span class="dot ${l}"></span><span>${labels[l]}</span><div class="track"><i class="${l}" style="width:${data.words.length ? n / data.words.length * 100 : 0}%"></i></div><b>${n}</b></div>`; }).join('')}</div>`; }
function newWordsPanel(): string {
    const s = summary(data);
    const rec = recommendedNewWordCount({ availableMinutes: 30, energyState: 'normal', d1Retention: null, d7Retention: null, weakLoad: s.weak, dueLoad: s.due });
    const unit = data.miniUnits.find(u => u.status === 'active') ?? null;
    const q = buildNewWordQueue(data.words, { count: rec.recommended, miniUnit: unit });
    const pools = `基础 ${q.breakdown.byPool.foundation} · 主题 ${q.breakdown.byPool.miniUnit} · 遇见 ${q.breakdown.byPool.encountered}`;
    const fb = q.breakdown.fallbackReasons.length ? '（部分词池为空，份额已自动重分配）' : '';
    const reflow = q.breakdown.forgottenCount ? ` · 遗忘回流 ${q.breakdown.forgottenCount} 个优先复习` : '';
    return `<section class="panel new-words"><div class="section-title"><h2>今日新词 · 先预览再测试</h2><span class="subtle">建议 ${rec.recommended} 个（${rec.min}–${rec.max}）</span></div><p class="hint">来源：${pools}${fb} · 按 30 分钟估算（Daily Planner 上线后自动接入）${reflow}</p><div class="actions"><button id="preview-start" class="primary" ${q.breakdown.newCount ? '' : 'disabled'}>预览新词（${q.breakdown.newCount}）</button>${q.breakdown.forgottenCount ? `<button id="reflow-start" class="secondary">复习回流词（${q.breakdown.forgottenCount}）</button>` : ''}</div></section>`;
}
function startPreview() {
    const s = summary(data);
    const rec = recommendedNewWordCount({ availableMinutes: 30, energyState: 'normal', weakLoad: s.weak, dueLoad: s.due });
    const unit = data.miniUnits.find(u => u.status === 'active') ?? null;
    const q = buildNewWordQueue(data.words, { count: rec.recommended, miniUnit: unit });
    const words = q.items.filter(i => i.kind === 'new').map(i => wordMap.get(i.wordId)).filter((w): w is Word => !!w);
    if (!words.length) {
        toast('没有待预览的新词；先导入词书，或稍后再来');
        return;
    }
    previewWords = words;
    previewIndex = 0;
    page = 'preview';
    render();
}
function startReflow() {
    const words = data.words.filter(isForgotten).sort((a, b) => priority(b) - priority(a)).slice(0, 30);
    if (!words.length) {
        toast('当前没有需要回流的遗忘词');
        return;
    }
    void startMode('reflow', words);
}
function previewPage() {
    if (!previewWords.length || previewIndex >= previewWords.length) {
        previewDone();
        return;
    }
    const w = previewWords[previewIndex];
    $('#main').innerHTML = `<div class="quiz-top"><button id="quit" class="text-button">← 结束预览</button><span>${previewIndex + 1} / ${previewWords.length}</span><span></span></div><section class="quiz-card preview-card"><div class="eyebrow">NEW WORD PREVIEW</div><div class="question">${esc(w.en)}</div><p class="subtle">${esc(w.phonetic)} ${esc(w.pos)}</p><h3>${esc(w.zh)}</h3>${w.collocation ? `<p>搭配：${esc(w.collocation)}</p>` : ''}${w.example ? `<blockquote>${esc(w.example)}</blockquote>` : ''}<p class="hint">快速建立第一次编码，不用纠结；稍后立刻用 Recall 检验。Preview 不是正式测试。</p><div class="answers preview-actions"><button class="answer" data-preview="know"><kbd>1</kbd><span>已经会</span></button><button class="answer" data-preview="familiar"><kbd>2</kbd><span>熟悉</span></button><button class="answer" data-preview="unknown"><kbd>3</kbd><span>陌生</span></button><button class="answer" data-preview="skip"><kbd>4</kbd><span>跳过</span></button></div></section>`;
    on('#quit', 'click', previewDone);
    document.querySelectorAll<HTMLElement>('[data-preview]').forEach(b => b.onclick = () => void previewAnswer(b.dataset.preview as PreviewResult));
}
async function previewAnswer(result: PreviewResult) {
    const w = previewWords[previewIndex];
    if (!w)
        return;
    const { word, exposure } = applyPreview(w, result, Date.now(), uid());
    await savePreview(word, exposure);
    data.words[data.words.findIndex(x => x.id === w.id)] = word;
    wordMap.set(w.id, word);
    previewIndex++;
    previewPage();
}
function previewDone() {
    const done = previewWords.slice(0, previewIndex);
    const remain = previewWords.length - previewIndex;
    if (taskExecution && taskExecution.kind === 'new-preview') {
        const exec = taskExecution;
        taskExecution = null;
        void completePlanTask(exec, Math.max(0.5, Math.round((Date.now() - exec.startedAt) / 30000) / 2));
    }
    previewWords = [];
    previewIndex = 0;
    page = 'preview-done';
    $('#main').innerHTML = title('PREVIEW COMPLETE', '第一次编码完成', `已预览 ${done.length} 个词；未预览完的 ${remain} 个已保留，下次可继续。`) + `<div class="actions"><button id="recall-now" class="primary" ${done.length ? '' : 'disabled'}>开始 Recall（${done.length} 词）</button><button id="back-home" class="secondary">返回首页</button></div><p class="hint">Preview 只负责第一次装填；Recall 才检验提取。未预览的新词不会进入正式测试。</p>`;
    on('#recall-now', 'click', () => { void startMode('previewed-recall', done); });
    on('#back-home', 'click', () => setPage('home'));
}
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
        // Phase 2：UNSEEN（从未预览且从未测试）不得进入正式 Recall
        const unseen = words.filter(isUnseen).length;
        if (unseen) {
            words = words.filter(recallEligible);
            if (!words.length) {
                toast('这批词还没有预览过：请先完成「预览新词」');
                return;
            }
            toast(`已跳过 ${unseen} 个未预览新词（先完成「预览新词」）`);
        }
        if (mode === 'due')
            words = words.filter(w => w.state.total && effectiveDue(w, data.settings.schedulingAuthority) <= Date.now());
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
    if (taskExecution)
        taskExecution.sessionId = s.id;
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
    if ((e.target as HTMLElement)?.matches('input,textarea,select') || $<HTMLDialogElement>('#modal').open)
        return;
    if (page === 'preview') {
        const map: Record<string, PreviewResult> = { '1': 'know', '2': 'familiar', '3': 'unknown', '4': 'skip' };
        const result = map[e.key];
        if (!result || e.repeat)
            return;
        e.preventDefault();
        void previewAnswer(result);
        return;
    }
    if (page !== 'quiz')
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
function showResults(s: StudySession) { stopTimer(); page = 'results'; if (taskExecution && taskExecution.sessionId === s.id) {
    const exec = taskExecution;
    taskExecution = null;
    void completePlanTask(exec, Math.max(0.5, Math.round((Date.now() - exec.startedAt) / 30000) / 2));
} const rs = data.records.filter(r => r.sessionId === s.id); const st = recordStats(rs); const ids = new Set(rs.map(r => r.wordId)); const ws = data.words.filter(w => ids.has(w.id)); active = null; $('#main').innerHTML = title('SESSION COMPLETE', '这一轮，记住了多少？', '薄弱词已记录，并安排了下一次复习。') + `<div class="metrics">${metric('本轮作答', String(st.attempts), '含本轮强化重复')}${metric('正确率', pct(st.accuracy), st.unique + ' 个不同单词')}${metric('平均反应', seconds(st.meanMs), '有效作答时间')}${metric('待强化', String(ws.filter(isWeak).length), '按本轮结束后的状态')}</div><div class="actions"><button class="primary" id="review-round">重测本轮弱词</button><button class="secondary" id="round-export">导出本轮弱词</button><button class="secondary" id="back-home">返回首页</button></div><div class="two-col">${(['unknown', 'vague'] as Mastery[]).map(l => `<section class="panel"><h2>${labels[l]}</h2>${wordChips(ws.filter(w => w.state.level === l))}</section>`).join('')}</div><details class="panel"><summary>正常与熟练 · ${ws.filter(w => !isWeak(w)).length} 词</summary>${wordChips(ws.filter(w => !isWeak(w)))}</details>`; on('#review-round', 'click', () => startMode('weak', ws.filter(isWeak))); on('#round-export', 'click', () => download(exportWords(ws.filter(isWeak), 'csv'), '本轮弱词.csv')); on('#back-home', 'click', () => setPage('home')); bindDetails(); }
function wordChips(ws: Word[]) { return ws.length ? `<div class="chips">${ws.map(w => `<button data-detail="${w.id}">${esc(w.en)}</button>`).join('')}</div>` : '<p class="subtle">没有这一类单词</p>'; }
function filtered(weak: boolean) { let ws = data.words.filter(w => (!weak || isWeak(w)) && (!bookFilter || w.bookId === bookFilter) && (!levelFilter || w.state.level === levelFilter) && (!search || `${w.en} ${w.zh} ${w.tags}`.toLowerCase().includes(search.toLowerCase()))); return ws.sort(sort === 'alpha' ? (a, b) => a.en.localeCompare(b.en) : sort === 'due' ? (a, b) => effectiveDue(a, data.settings.schedulingAuthority) - effectiveDue(b, data.settings.schedulingAuthority) : (a, b) => priority(b) - priority(a)); }
function library(weak: boolean) {
    $('#main').innerHTML = title(weak ? 'FOCUSED REVIEW' : 'YOUR WORDBOOKS', weak ? '把薄弱的地方练扎实' : '你的词库', weak ? '不会和模糊词，按照当前复习优先级排列。' : '导入你要学的词，所有记录留在这台设备。', `<button id="import" class="primary">＋ 导入词书</button>`) + `<div class="book-tabs"><button data-book="" class="${!bookFilter ? 'selected' : ''}">全部词书</button>${data.books.map(b => `<button data-book="${b.id}" class="${bookFilter === b.id ? 'selected' : ''}">${esc(b.name)} <small>${data.words.filter(w => w.bookId === b.id).length}</small></button>`).join('')}</div><div class="toolbar"><input id="search" placeholder="搜索单词、释义或标签" aria-label="搜索词库" value="${esc(search)}"><select id="level" aria-label="掌握筛选"><option value="">全部状态</option>${Object.entries(labels).filter(([k]) => !weak || k === 'unknown' || k === 'vague').map(([k, v]) => `<option value="${k}" ${k === levelFilter ? 'selected' : ''}>${v}</option>`).join('')}</select><select id="sort" aria-label="排序"><option value="priority" ${sort === 'priority' ? 'selected' : ''}>优先级排序</option><option value="alpha" ${sort === 'alpha' ? 'selected' : ''}>字母排序</option><option value="due" ${sort === 'due' ? 'selected' : ''}>复习时间排序</option></select><button id="train-filter" class="secondary">测试筛选结果</button><button id="export-filter" class="secondary">导出</button><button id="preview-lib" class="secondary">预览新词</button>${bookFilter ? '<button id="rename-book" class="text-button">重命名</button><button id="delete-book" class="danger-text">删除词书</button>' : ''}</div><section class="panel no-padding" id="word-table"></section>`;
    drawTable(weak);
    on('#import', 'click', importDialog);
    document.querySelectorAll<HTMLElement>('[data-book]').forEach(b => b.onclick = () => { bookFilter = b.dataset.book!; listPage = 0; library(weak); });
    on('#search', 'input', e => { search = (e.target as HTMLInputElement).value; listPage = 0; drawTable(weak); });
    on('#level', 'change', e => { levelFilter = (e.target as HTMLSelectElement).value; listPage = 0; drawTable(weak); });
    on('#sort', 'change', e => { sort = (e.target as HTMLSelectElement).value; drawTable(weak); });
    on('#train-filter', 'click', () => startMode('filtered', filtered(weak).slice(0, 1000)));
    on('#export-filter', 'click', () => exportDialog(filtered(weak)));
    on('#preview-lib', 'click', () => startPreview());
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
function drawTable(weak: boolean) { const ws = filtered(weak), pages = Math.max(1, Math.ceil(ws.length / 50)); listPage = Math.min(listPage, pages - 1); $('#word-table').innerHTML = `<div class="table-scroll"><table><thead><tr><th>单词 / 释义</th><th>掌握状态</th><th>优先级</th><th>正确 / 作答</th><th>平均反应</th><th>下次复习</th></tr></thead><tbody>${ws.slice(listPage * 50, listPage * 50 + 50).map(w => `<tr><td><button class="word-link" data-detail="${w.id}">${esc(w.en)}</button><small>${esc(w.zh)}</small></td><td><span class="badge ${w.state.level}">${labels[w.state.level]}</span> <small class="lifecycle">${LIFECYCLE_LABELS[lifecycleOf(w)]}</small></td><td><b class="priority-${priorityGrade(w)}">${priorityGrade(w)}</b></td><td>${w.state.correct} / ${w.state.total}</td><td>${w.state.total ? seconds(w.state.meanMs) : '—'}</td><td>${w.state.total ? (effectiveDue(w, data.settings.schedulingAuthority) <= Date.now() ? '<span class="due-text">已到期</span>' : date(effectiveDue(w, data.settings.schedulingAuthority))) : '未测试'}</td></tr>`).join('') || '<tr><td colspan="6" class="empty-cell">暂无符合条件的单词。导入词书或调整筛选。</td></tr>'}</tbody></table></div><div class="pagination"><span>共 ${ws.length} 个词 · 每页 50 个</span><div><button id="prev" ${listPage === 0 ? 'disabled' : ''}>上一页</button><span>${listPage + 1} / ${pages}</span><button id="next-page" ${listPage === pages - 1 ? 'disabled' : ''}>下一页</button></div></div>`; on('#prev', 'click', () => { listPage--; drawTable(weak); }); on('#next-page', 'click', () => { listPage++; drawTable(weak); }); bindDetails(); }
function bindDetails() { document.querySelectorAll<HTMLElement>('[data-detail]').forEach(b => b.onclick = () => wordDetail(wordMap.get(b.dataset.detail!)!)); }
function wordDetail(w: Word) {
    const rs = data.records.filter(r => r.wordId === w.id).sort((a, b) => a.at - b.at);
    const r = fsrsRetrievability(w.fsrs, data.settings);
    modal(`<div class="eyebrow">WORD MEMORY</div><h2 class="detail-word">${esc(w.en)}</h2><p>${esc(w.phonetic)} ${esc(w.pos)}</p><h3>${esc(w.zh)}</h3>${w.example ? `<blockquote>${esc(w.example)}</blockquote>` : ''}${w.collocation ? `<p>搭配：${esc(w.collocation)}</p>` : ''}${w.tags ? `<p>标签：${esc(w.tags)}</p>` : ''}<div class="detail-stats"><span>总测试 <b>${w.state.total}</b></span><span>正确 / 错误 <b>${w.state.correct} / ${w.state.total - w.state.correct}</b></span><span>平均反应 <b>${seconds(w.state.meanMs)}</b></span><span>最近反应 <b>${seconds(w.state.lastMs)}</b></span>${Object.entries(w.state.directions).map(([k, v]) => `<span>${k === 'en-zh' ? '英→中' : '中→英'} <b>${v.total ? pct(v.correct / v.total) : '无记录'} · ${v.total} 次</b></span>`).join('')}<span>状态 <b>${labels[w.state.level]}</b></span><span>生命周期 <b>${LIFECYCLE_LABELS[lifecycleOf(w)]}</b></span><span>识别/提取/产出 <b>${w.recognitionScore} / ${w.activeRecallScore} / ${w.productiveScore}</b></span><span>预览 <b>${w.previewedAt ? (w.previewResult === 'skip' ? '已跳过' : w.previewResult === 'know' ? '已会' : w.previewResult === 'familiar' ? '熟悉' : '陌生') : '未预览'}</b></span><span>FSRS <b>${hasFsrsHistory(w.fsrs) ? `S ${w.fsrs.stability.toFixed(1)}d · D ${w.fsrs.difficulty.toFixed(1)} · R ${r === null ? '—' : pct(r)}` : '未开始'}</b></span><span>下次复习 <b>${date(effectiveDue(w, data.settings.schedulingAuthority))}</b></span></div><h3>最近 20 次状态变化</h3><div class="history">${rs.slice(-20).map(r => `<span class="badge ${r.after}" title="${date(r.at)} · ${seconds(r.ms)}">${labels[r.after]}</span>`).join('') || '尚无记录'}</div><h3>容易混淆</h3><p>${Object.entries(w.confusions).sort((a, b) => b[1] - a[1]).map(([id, n]) => `${esc(wordMap.get(id)?.en || '已删除')}（${n}次）`).join('、') || '尚未记录混淆'}</p><div class="actions"><button id="detail-review" class="primary">单独重测</button><button id="edit-word" class="secondary">编辑词条</button></div>`);
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
    $('#main').innerHTML = title('PREFERENCES', '按你的速度来', '时间阈值、测试难度和数据备份，都由你控制。') + `<form id="settings-form"><div class="two-col"><section class="panel"><h2>测试与节奏</h2><div class="form-grid"><label>秒答上限（秒）<input name="fast" type="number" min="0.1" step="0.1" value="${s.fast / 1000}" required></label><label>正常上限（秒）<input name="normal" type="number" min="0.2" step="0.1" value="${s.normal / 1000}" required></label><label>超时（秒）<input name="timeout" type="number" min="0.3" max="120" step="0.1" value="${s.timeout / 1000}" required></label><label>英→中比例（%）<input name="ratio" type="number" min="0" max="100" value="${s.ratio}" required></label><label>难度<select name="difficulty">${[['easy', '简单 · 4项'], ['normal', '普通 · 4项'], ['hard', '困难 · 6项']].map(([v, t]) => `<option value="${v}" ${s.difficulty === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label>答错反馈<select name="feedback">${[[0, '立即下一题'], [500, '停留 0.5 秒'], [1000, '停留 1 秒'], [-1, '手动继续']].map(([v, t]) => `<option value="${v}" ${s.feedback === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label>调度引擎<select name="schedulingAuthority"><option value="fsrs" ${s.schedulingAuthority === 'fsrs' ? 'selected' : ''}>FSRS（默认）</option><option value="legacy" ${s.schedulingAuthority === 'legacy' ? 'selected' : ''}>旧调度器（兼容回滚）</option></select></label><label>目标保留率<input name="requestRetention" type="number" min="0.5" max="0.99" step="0.01" value="${s.requestRetention}" required></label></div><p class="hint">答对立即下一题。正常上限至超时之间为模糊。切换标签页会自动暂停计时。</p></section><section class="panel"><h2>AI API 配置</h2><label>Endpoint<input name="endpoint" type="url" placeholder="https://你的服务地址/v1" value="${esc(s.endpoint)}" autocomplete="off"></label><label>Model Name<input name="model" value="${esc(s.model)}" placeholder="填写供应商提供的模型名称"></label><label>API Key<input name="key" type="password" value="${esc(s.key)}" autocomplete="off" placeholder="仅用于你配置的地址"></label><label class="check"><input name="rememberKey" type="checkbox" ${s.rememberKey ? 'checked' : ''}> 在这台设备记住 Key</label><p class="hint">不勾选则只保留到页面关闭。勾选后明文保存在本地浏览器数据库，完整备份仍会剔除 Key。浏览器直连需要供应商支持 CORS。</p></section></div><button class="primary" type="submit">保存设置</button></form><section class="panel backup-panel"><h2>备份与迁移</h2><p>导出完整 JSON 后可换电脑恢复。请定期备份，浏览器清理和无痕模式可能移除本地数据。</p><div class="actions"><button id="backup" class="primary">导出全部学习数据</button><label class="button secondary">导入备份<input id="restore" type="file" accept=".json" hidden></label><button id="persist" class="secondary">申请持久存储</button><button id="clear" class="danger-text">清空本地数据</button></div><p id="storage-info" class="hint">学习数据按浏览器和站点地址保存。请一直使用相同的 localhost:4173 地址。</p></section>`;
    on('#settings-form', 'submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target as HTMLFormElement);
        const updated: Settings = { ...data.settings, fast: Number(f.get('fast')) * 1000, normal: Number(f.get('normal')) * 1000, timeout: Number(f.get('timeout')) * 1000, ratio: Number(f.get('ratio')), difficulty: f.get('difficulty') as Settings['difficulty'], feedback: Number(f.get('feedback')), endpoint: String(f.get('endpoint') || '').trim(), model: String(f.get('model') || '').trim(), key: String(f.get('key') || '').trim(), rememberKey: f.get('rememberKey') === 'on', schedulingAuthority: (f.get('schedulingAuthority') === 'legacy' ? 'legacy' : 'fsrs') as Settings['schedulingAuthority'], requestRetention: Number(f.get('requestRetention')) };
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
// ———————————————— Phase 3：Today / Daily Planner UI（消费层，不放算法） ————————————————
function todaySection(): string { return todayPlan ? planOverview(todayPlan) : planSetup(); }
function planInput(minutes: number, energy: EnergyState): PlannerInput {
    return {
        now: Date.now(), availableMinutes: minutes, energy, words: data.words, records: data.records, plans: data.dailyPlans,
        miniUnit: data.miniUnits.find(u => u.status === 'active') ?? null, lastActivityAt: latestLearningAt(data.records),
        schedulingAuthority: data.settings.schedulingAuthority,
        sentenceInput: sentenceRecords.length ? {
            sentences: sentenceRecords,
            words: data.words,
            concepts: data.grammarConcepts,
            grammarAttempts: data.grammarAttempts,
            sentenceAttempts: data.sentenceAttempts,
            miniUnit: data.miniUnits.find(u => u.status === 'active') ?? null,
        } : null,
    };
}
function energyLabel(e: EnergyState) { return e === 'low' ? '状态差' : e === 'good' ? '状态好' : '正常'; }
function unavailableModulesText(): string { const caps = moduleCapabilities(); return MODULES.filter(m => !caps[m].available).map(m => `${caps[m].label}（${caps[m].requires}）`).join('、') || '无'; }
function planSetup(): string {
    const presets: number[] = [...PLANNER_CONFIG.budget.presets];
    const custom = !presets.includes(planBudget);
    return `<section class="panel plan-panel" id="plan-setup"><div class="section-title"><h2>今日计划</h2><span class="subtle">时间预算优先</span></div><p class="hint">先选真实可用时间与今天的状态。计划会在同一份预算内安排隔夜检测、到期复习、新词与收尾回忆；不会安排尚未上线的模块。</p><div class="plan-setup"><label>可用时间<select id="plan-budget">${presets.map(n => `<option value="${n}" ${n === planBudget ? 'selected' : ''}>${n} 分钟</option>`).join('')}<option value="custom" ${custom ? 'selected' : ''}>自定义</option></select></label><label>自定义分钟<input id="plan-custom" type="number" min="${PLANNER_CONFIG.budget.min}" max="${PLANNER_CONFIG.budget.max}" step="1" value="${planBudget}" ${custom ? '' : 'disabled'}></label><label>今日状态<select id="plan-energy">${([['low', '状态差'], ['normal', '正常'], ['good', '状态好']] as const).map(([v, t]) => `<option value="${v}" ${planEnergy === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label><button id="plan-create" class="primary" ${planBusy ? 'disabled' : ''}>生成今日计划</button></div><p class="hint">未上线模块不生成假任务：${esc(unavailableModulesText())}</p></section>`;
}
function planOverview(plan: DailyPlan): string {
    const progress = planProgress(plan);
    const recall = plan.yesterdayRecallResult as {
        status?: string;
        evaluation?: {
            retention?: number | null;
            confidence?: string;
        } | null;
    } | null;
    const budgetReasons = ((plan.budget as {
        reasons?: string[];
    } | null)?.reasons ?? []).filter(r => r.startsWith('critical-memory') || r.startsWith('budget') || r.startsWith('order') || r.startsWith('re-entry') || r.startsWith('mini-diagnostic'));
    const recallLine = recall?.status === 'done'
        ? `<p class="hint">隔夜检测：保留率 ${recall.evaluation?.retention == null ? '样本不足' : pct(recall.evaluation.retention)}（${recall.evaluation?.confidence === 'ok' ? '可信' : '低置信'}）· 结果已用于校准今日剩余任务</p>`
        : recall?.status === 'pending' ? '<p class="hint">隔夜检测：待完成（结果会校准今日新词量）</p>' : recall?.status === 'recovery' ? '<p class="hint">已按中断天数安排重新进入检测，不积学习债</p>' : '';
    return `<section class="panel plan-panel" id="plan-panel"><div class="section-title"><h2>今日计划</h2><span class="subtle">剩余 ${progress.remainingMinutes} 分钟 · 完成 ${progress.done}/${progress.total}${progress.skipped ? ` · 跳过 ${progress.skipped}` : ''}</span></div><div class="plan-progress" role="progressbar" aria-valuenow="${Math.round(progress.ratio * 100)}" aria-valuemin="0" aria-valuemax="100"><i style="width:${Math.round(progress.ratio * 100)}%"></i></div><p class="hint">预算 ${plan.availableMinutes} 分钟 · 状态 ${energyLabel(plan.energyState)} · ${esc(budgetReasons.slice(0, 3).join(' · ') || '按真实到期与保留率安排')}</p>${recallLine}<div class="plan-tasks">${plan.initialPlan.map(t => taskCard(t)).join('') || '<p class="subtle">今天没有需要安排的任务。</p>'}</div><div class="actions"><button id="plan-regenerate" class="secondary">重新生成未完成部分</button><button id="plan-adjust" class="text-button">调整预算 / 状态</button></div><p class="hint">已完成任务与已提交的学习证据不会被重建；延后只发生在今天，不成为明天的作业债。</p><p class="hint">未上线模块不生成任务：${esc(unavailableModulesText())}</p></section>`;
}
function taskCard(t: PlanItem): string {
    const statusText: Record<string, string> = { done: '已完成', started: '进行中', skipped: '已跳过', delayed: '已延后', replaced: '已替换' };
    const badge = t.status === 'done' ? 'fluent' : t.status === 'skipped' || t.status === 'replaced' ? 'unknown' : 'vague';
    const startLabel = t.status === 'started' ? '继续' : '开始';
    const actions = t.status === 'done' || t.status === 'replaced' || t.status === 'skipped' ? '' : `<div class="task-buttons"><button class="primary" data-task-start="${esc(t.id)}">${startLabel}</button>${t.flexible ? `<button class="secondary" data-task-replace="${esc(t.id)}">替换</button>` : ''}<button class="text-button" data-task-delay="${esc(t.id)}">延后</button><button class="text-button" data-task-skip="${esc(t.id)}">跳过</button></div>`;
    return `<div class="plan-task ${esc(t.status)}" data-task="${esc(t.id)}"><div class="task-main"><div><b>${esc(t.label ?? TASK_LABELS[t.kind ?? ''] ?? t.kind ?? '任务')}</b><span class="task-minutes">${t.minutes} 分钟</span>${t.critical ? '<span class="badge vague">关键记忆</span>' : ''}${t.flexible ? '<span class="badge normal">可调整</span>' : ''}${statusText[t.status] ? `<span class="badge ${badge}">${statusText[t.status]}</span>` : ''}</div><small>${esc((t.reason ?? []).slice(0, 3).join(' · '))}</small><small>${(t.refs ?? []).length} 个词</small></div>${actions}</div>`;
}
function bindPlan() {
    on('#plan-budget', 'change', e => { const v = (e.target as HTMLSelectElement).value; const custom = document.querySelector<HTMLInputElement>('#plan-custom'); if (custom)
        custom.disabled = v !== 'custom'; if (v !== 'custom')
        planBudget = Number(v);
    else
        custom?.focus(); });
    on('#plan-custom', 'input', e => { planBudget = Number((e.target as HTMLInputElement).value); });
    on('#plan-energy', 'change', e => { planEnergy = (e.target as HTMLSelectElement).value as EnergyState; });
    on('#plan-create', 'click', createPlanFromUI);
    on('#plan-regenerate', 'click', () => void regeneratePlan(todayPlan?.availableMinutes ?? planBudget, todayPlan?.energyState ?? planEnergy));
    on('#plan-adjust', 'click', planAdjustDialog);
    document.querySelectorAll<HTMLElement>('[data-task-start]').forEach(b => b.onclick = () => void startPlanTask(b.dataset.taskStart!));
    document.querySelectorAll<HTMLElement>('[data-task-skip]').forEach(b => b.onclick = () => void planAction(b.dataset.taskSkip!, 'skip'));
    document.querySelectorAll<HTMLElement>('[data-task-delay]').forEach(b => b.onclick = () => void planAction(b.dataset.taskDelay!, 'delay'));
    document.querySelectorAll<HTMLElement>('[data-task-replace]').forEach(b => b.onclick = () => void replacePlanTask(b.dataset.taskReplace!));
}
function upsertPlan(list: DailyPlan[], plan: DailyPlan): DailyPlan[] { const i = list.findIndex(p => p.id === plan.id); const next = [...list]; if (i === -1)
    next.push(plan);
else
    next[i] = plan; return next; }
async function persistPlan(plan: DailyPlan): Promise<DailyPlan | null> {
    if (!todayPlan)
        return null;
    try {
        const saved = await savePlan(plan, todayPlan.revision ?? 0);
        todayPlan = saved;
        data.dailyPlans = upsertPlan(data.dailyPlans, saved);
        return saved;
    }
    catch (e) {
        if (e instanceof StalePlanError) {
            toast(e.message);
            todayPlan = (await loadPlan(dayKey(Date.now()))) ?? todayPlan;
            render();
        }
        else
            toast((e as Error).message);
        return null;
    }
}
async function createPlanFromUI() {
    if (planBusy)
        return;
    if (todayPlan) {
        modal('<h2>今天已有计划</h2><p>同一天不会重复生成计划。需要改变预算或状态时，请使用「调整预算 / 状态」，它只重排未完成部分。</p><div class="actions"><button id="plan-existing-ok" class="primary">知道了</button></div>');
        on('#plan-existing-ok', 'click', closeModal);
        return;
    }
    const custom = document.querySelector<HTMLInputElement>('#plan-custom');
    const budget = Number(custom && !custom.disabled ? custom.value : planBudget);
    const energy = (document.querySelector<HTMLSelectElement>('#plan-energy')?.value ?? planEnergy) as EnergyState;
    planBusy = true;
    try {
        const { plan } = createDailyPlan(planInput(budget, energy));
        const saved = await savePlan(plan, 0);
        todayPlan = saved;
        data.dailyPlans = upsertPlan(data.dailyPlans, saved);
        toast(`今日计划已生成 · ${saved.initialPlan.length} 个任务 · ${saved.availableMinutes} 分钟预算`);
        render();
    }
    finally {
        planBusy = false;
    }
}
async function startPlanTask(taskId: string) {
    if (!todayPlan || planBusy)
        return;
    const task = todayPlan.initialPlan.find(t => t.id === taskId);
    if (!task)
        return;
    const waiting = (task.dependencies ?? []).filter(d => todayPlan!.initialPlan.find(t => t.id === d)?.status !== 'done');
    if (waiting.length) {
        toast('请先完成前置任务（新词需要先预览，再 Recall）');
        return;
    }
    if (task.kind !== 'new-preview' && data.sessions.some(s => !s.ended)) {
        toast('请先继续或结束未完成的训练');
        return;
    }
    if (task.module === 'sentence' || task.kind?.startsWith('sentence-')) {
        const ids = (task.refs ?? []).filter(id => sentenceRecords.some(s => s.id === id));
        if (!ids.length) {
            toast('这个句任务没有可用的真实句子（句库可能已变更）');
            return;
        }
        if (data.sessions.some(s => !s.ended)) {
            toast('请先继续或结束未完成的训练');
            return;
        }
        const started = applyPlanAction(todayPlan, taskId, 'start', { now: Date.now() });
        if (!started.ok) {
            toast(started.reasons.join('；'));
            return;
        }
        const savedPlan = await persistPlan(started.plan);
        if (!savedPlan)
            return;
        startLab(ids, taskId, task.kind ?? 'sentence-basic-structure');
        return;
    }
    const refs = (task.refs ?? []).map(id => wordMap.get(id)).filter((w): w is Word => !!w);
    if (!refs.length) {
        toast('这个任务暂时没有可执行的词（词库可能已变更）');
        return;
    }
    const result = applyPlanAction(todayPlan, taskId, 'start', { now: Date.now() });
    if (!result.ok) {
        toast(result.reasons.join('；'));
        return;
    }
    const saved = await persistPlan(result.plan);
    if (!saved)
        return;
    const exec = { planTaskId: taskId, kind: task.kind ?? '', startedAt: Date.now(), sessionId: '' };
    if (task.kind === 'new-preview') {
        taskExecution = exec;
        previewWords = refs;
        previewIndex = 0;
        page = 'preview';
        shell();
        previewPage();
        return;
    }
    taskExecution = exec;
    await startMode(task.kind ?? 'plan-task', refs);
    if (!active)
        taskExecution = null;
}
async function completePlanTask(exec: {
    planTaskId: string;
    kind: string;
    startedAt: number;
    sessionId: string;
}, actualMinutes: number) {
    if (!todayPlan)
        return;
    const result = applyPlanAction(todayPlan, exec.planTaskId, 'complete', { now: Date.now(), actualMinutes, reason: 'task-completed' });
    if (!result.ok) {
        toast(result.reasons.join('；'));
        return;
    }
    let plan = result.plan;
    if (exec.kind === 'yesterday-recall') {
        const saved = plan.yesterdayRecallResult as {
            sample?: RecallCandidate[];
        } | null;
        const evaluation = evaluateRecallSession(saved?.sample ?? [], data.records, exec.sessionId);
        const calibrated = calibrateAfterRecall(plan, evaluation, { now: Date.now(), words: data.words });
        if (calibrated.ok)
            plan = calibrated.plan;
        toast(evaluation.retention === null ? '隔夜检测完成：样本不足，未推算保留率' : `隔夜保留率 ${pct(evaluation.retention)} · ${evaluation.confidence === 'ok' ? '样本可信' : '低置信'}；今日剩余任务已校准`);
    }
    if (exec.kind === 'closing-recall')
        plan.closingLoop = { ...((plan.closingLoop as Record<string, unknown>) ?? {}), status: 'awaiting-feedback', feedback: null };
    if (exec.kind?.startsWith('sentence-'))
        plan.completedModules = [...new Set([...(plan.completedModules ?? []), 'sentence'])];
    const savedPlan = await persistPlan(plan);
    if (savedPlan && exec.kind === 'closing-recall')
        closingFeedback();
}
async function planAction(taskId: string, action: 'skip' | 'delay') {
    if (!todayPlan)
        return;
    const result = applyPlanAction(todayPlan, taskId, action, { now: Date.now() });
    if (!result.ok) {
        toast(result.reasons.join('；'));
        return;
    }
    const saved = await persistPlan(result.plan);
    if (saved) {
        toast(action === 'skip' ? '已跳过（不滚存为明天作业债）' : '已延后到今天计划的后面');
        render();
    }
}
async function replacePlanTask(taskId: string) {
    if (!todayPlan)
        return;
    const task = todayPlan.initialPlan.find(t => t.id === taskId);
    if (!task)
        return;
    if (!task.flexible) {
        toast('关键记忆任务不能替换，只能跳过或延后');
        return;
    }
    const replacement = buildReplacement(todayPlan, task, data.words, Date.now(), data.settings.schedulingAuthority === 'legacy' ? 'legacy' : 'fsrs', sentenceRecords);
    if (!replacement) {
        toast('当前没有可替换的同目标任务');
        return;
    }
    const result = applyPlanAction(todayPlan, taskId, 'replace', { now: Date.now(), replacement });
    if (!result.ok) {
        toast(result.reasons.join('；'));
        return;
    }
    const saved = await persistPlan(result.plan);
    if (saved) {
        toast('已替换为同目标任务（时间保持 ±30% 内）');
        render();
    }
}
function planAdjustDialog() {
    if (!todayPlan)
        return;
    modal(`<h2>调整今日预算</h2><p>已完成 ${planProgress(todayPlan).doneMinutes} 分钟不可撤回；只会重排未完成部分。</p><label>总预算（分钟）<input id="adjust-budget" type="number" min="${PLANNER_CONFIG.budget.min}" max="${PLANNER_CONFIG.budget.max}" step="1" value="${todayPlan.availableMinutes}"></label><label>今日状态<select id="adjust-energy">${([['low', '状态差'], ['normal', '正常'], ['good', '状态好']] as const).map(([v, t]) => `<option value="${v}" ${todayPlan!.energyState === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label><div class="actions"><button id="adjust-save" class="primary">重新安排未完成部分</button></div>`);
    on('#adjust-save', 'click', async () => {
        const budget = Number(document.querySelector<HTMLInputElement>('#adjust-budget')?.value);
        const energy = (document.querySelector<HTMLSelectElement>('#adjust-energy')?.value ?? 'normal') as EnergyState;
        closeModal();
        await regeneratePlan(budget, energy);
    });
}
async function regeneratePlan(minutes: number, energy: EnergyState) {
    if (!todayPlan || planBusy)
        return;
    const spent = planProgress(todayPlan).doneMinutes;
    if (!Number.isFinite(minutes) || minutes < spent) {
        toast(`新的总预算不能小于已投入的 ${spent} 分钟`);
        return;
    }
    planBusy = true;
    try {
        const result = regenerateRemaining(todayPlan, planInput(minutes, energy));
        const saved = await persistPlan(result.plan);
        if (saved) {
            toast('已按当前预算重排未完成任务');
            render();
        }
    }
    finally {
        planBusy = false;
    }
}
function closingFeedback() {
    modal('<h2>今天的 Closing Loop</h2><p>刚才的收尾回忆已经保存。今天的难度感受会作为明天的计划输入。</p><div class="actions closing-choices"><button data-closing="easy" class="secondary">轻松</button><button data-closing="just" class="primary">刚好</button><button data-closing="hard" class="secondary">偏难</button></div>');
    document.querySelectorAll<HTMLElement>('[data-closing]').forEach(b => b.onclick = () => void saveClosingFeedback(b.dataset.closing!));
}
async function saveClosingFeedback(feedback: string) {
    if (!todayPlan)
        return;
    const plan = structuredClone(todayPlan);
    plan.closingLoop = { ...((plan.closingLoop as Record<string, unknown>) ?? {}), status: 'completed', feedback, answeredAt: Date.now() };
    closeModal();
    const saved = await persistPlan(plan);
    if (saved) {
        toast('今日收尾已记录');
        render();
    }
}
// ==================== Phase 4：Sentence Lab + Grammar Knowledge Graph ====================
const GRAMMAR_ORDER: GrammarCategory[] = ['sentence-structure', 'clauses', 'non-finite', 'verb-system', 'phrases', 'cohesion'];
const ERROR_LABELS: Record<string, string> = {
    'subject-identification': '主语识别',
    'predicate-identification': '谓语识别',
    'object-identification': '宾语识别',
    'modifier-boundary': '修饰成分边界',
    'clause-boundary': '从句边界／类型',
    'nonfinite-role': '非谓语作用',
    'logic-relation': '逻辑关系',
    'meaning-error': '整体意义',
    'no-answer': '未作答',
    'structure-error': '结构判断',
};
function bandClassOf(band: string): string {
    return band === 'likely-mastered' ? 'fluent' : band === 'learning' ? 'normal' : band === 'unknown' ? 'unknown' : 'vague';
}
function grammarStatesNow(): GrammarConceptState[] { return conceptStates(GRAMMAR_TAXONOMY, data.grammarAttempts, Date.now()); }
function stateById(id: string, states: GrammarConceptState[]): GrammarConceptState | undefined { return states.find(s => s.conceptId === id); }
function errorSummary(st: GrammarConceptState): string {
    const top = Object.entries(st.errorTypes).sort((a, b) => b[1] - a[1])[0];
    return top ? `${ERROR_LABELS[top[0]] ?? top[0]} ×${top[1]}` : '无';
}
// —— 语法图谱页 ——
function grammarPage(): void {
    const now = Date.now();
    const states = grammarStatesNow();
    const weak = states.filter(s => s.weak).sort((a, b) => a.p - b.p);
    if (grammarSelectedConcept) {
        conceptDetail(grammarSelectedConcept, states);
        return;
    }
    const taxonomy = validateTaxonomy();
    const metrics = `<div class="metrics">${metric('概念总数', String(GRAMMAR_TAXONOMY.length), '6 个类别 · 显式先修边')}${metric('有证据概念', String(states.filter(s => s.attempts > 0).length), `共 ${states.reduce((n, s) => n + s.attempts, 0)} 条真实拆句证据`)}${metric('薄弱概念', String(weak.length), '按最近错误与掌握后验判定')}${metric('证据较充分', String(states.filter(s => s.band === 'likely-mastered').length), '多证据支持，仍不是保证')}</div>`;
    const cats: Array<GrammarCategory | ''> = ['', ...GRAMMAR_ORDER];
    const filters = cats.map(c => `<button class="chip ${grammarCategoryFilter === c ? 'active' : ''}" data-gcat="${c}">${c ? GRAMMAR_CATEGORY_LABELS[c] : '全部'}</button>`).join('');
    const evidenced = states.filter(s => s.attempts > 0);
    const attemptsTotal = states.reduce((n, s) => n + s.attempts, 0);
    const weakPanel = weak.length ? `<section class="panel"><h2>需要优先处理</h2><p class="hint">排序依据：掌握后验 p 低 + 最近出现重复错误 + 先修是否具备。</p><ul class="weak-grammar">${weak.slice(0, 6).map(s => { const def = conceptById(s.conceptId); return `<li><b>${esc(def?.name ?? s.conceptId)}</b> <span class="badge ${bandClassOf(s.band)}">${pct(s.p)}</span><small>${esc(errorSummary(s))} · ${s.attempts} 次证据</small><span class="row-actions"><button class="secondary small" data-concept="${s.conceptId}">看详情</button><button class="primary small" data-concept-practice="${s.conceptId}">去练习</button></span></li>`; }).join('')}</ul></section>` : `<section class="panel"><h2>还没有足够的语法证据</h2><p class="hint">${evidenced.length ? `已有 ${evidenced.length} 个概念拿到 ${attemptsTotal} 条真实证据，但还没达到"弱项"的判定门槛（≥${GRAMMAR_CONFIG.weak.minAttempts} 次证据且后验 p<${pct(GRAMMAR_CONFIG.weak.threshold)}）；证据不够时不会给你贴标签。` : '完成一次句子拆解后，这里会按概念显示真实掌握情况。初始值为先验 25%，不代表你已经会或不会。'}</p></section>`;
    const groups = GRAMMAR_ORDER
        .filter(c => !grammarCategoryFilter || grammarCategoryFilter === c)
        .map(c => {
        const defs = GRAMMAR_TAXONOMY.filter(d => d.category === c);
        return `<section class="panel grammar-group"><h2>${GRAMMAR_CATEGORY_LABELS[c]}</h2><div class="concept-grid">${defs.map(d => {
            const st = stateById(d.id, states) ?? grammarState(d, data.grammarAttempts, now);
            const sentences = sentencesForConcept(d.id, sentenceRecords).length;
            const prereqChips = d.prerequisiteIds.length
                ? d.prerequisiteIds.map(id => `<button class="chip small" data-concept="${id}">${esc(conceptById(id)?.name ?? id)}</button>`).join('')
                : '<span class="hint">无（根概念）</span>';
            return `<article class="concept-card ${st.weak ? 'weak' : ''}"><header><button class="concept-link" data-concept="${d.id}">${esc(d.name)}</button><span class="badge ${bandClassOf(st.band)}">${GRAMMAR_BAND_LABELS[st.band]}</span></header><p class="hint">${esc(d.description)}</p><p class="concept-prereq"><span class="subtle">先修</span>${prereqChips}</p><div class="concept-metrics"><span>估算 <b>${pct(st.p)}</b></span><span>证据 <b>${st.attempts}</b></span><span>独立正确 <b>${st.independentCorrect}</b></span><span>相关句 <b>${sentences}</b></span></div>${st.weak ? `<p class="hint warn">${esc(errorSummary(st))}</p>` : ''}<div class="row-actions"><button class="secondary small" data-concept-practice="${d.id}">去练习</button></div></article>`;
        }).join('')}</div></section>`;
    }).join('');
    $('#main').innerHTML = `<div id="grammar-page">` + title('GRAMMAR MAP', '语法图谱', '概念之间按先修关系连接：先有主干，再认从句，再想非谓语。掌握度是估算，不是承诺。')
        + metrics + weakPanel + `<section class="panel"><h2>按类别浏览</h2><div class="chips">${filters}</div></section>` + groups
        + `<p class="hint">图谱自检：${taxonomy.ok ? '通过（无环、无缺失先修）' : `发现 ${taxonomy.issues.length} 个问题`} · ${GRAMMAR_CONFIG.taxonomyVersion}</p></div>`;
    document.querySelectorAll<HTMLElement>('[data-gcat]').forEach(b => b.addEventListener('click', () => { grammarCategoryFilter = b.dataset.gcat ?? ''; render(); }));
    document.querySelectorAll<HTMLElement>('[data-concept]').forEach(b => b.addEventListener('click', () => { grammarSelectedConcept = b.dataset.concept ?? ''; render(); }));
    document.querySelectorAll<HTMLElement>('[data-concept-practice]').forEach(b => b.addEventListener('click', () => practiceConcept(b.dataset.conceptPractice ?? '')));
}
function conceptDetail(conceptId: string, states: GrammarConceptState[]): void {
    const def = conceptById(conceptId);
    if (!def) {
        grammarSelectedConcept = '';
        render();
        return;
    }
    const st = stateById(def.id, states) ?? grammarState(def, data.grammarAttempts, Date.now());
    const readiness = prerequisitesSatisfied(def.id, states, GRAMMAR_CONFIG.mastery.learning, GRAMMAR_TAXONOMY);
    const prereq = def.prerequisiteIds.map(id => {
        const p = stateById(id, states);
        const ok = (p?.p ?? 0) >= GRAMMAR_CONFIG.mastery.learning;
        return `<li>${esc(conceptById(id)?.name ?? id)} <span class="badge ${ok ? 'fluent' : 'vague'}">${p ? pct(p.p) : '无证据'}</span>${ok ? '' : ' <small>建议先补</small>'}</li>`;
    }).join('') || '<li>无（根节点）</li>';
    const chain = ancestorConcepts(def.id).map(id => conceptById(id)?.name ?? id);
    const related = def.relatedConceptIds.map(id => conceptById(id)?.name ?? id).filter(Boolean);
    const sentences = sentencesForConcept(def.id, sentenceRecords).slice(0, 5);
    const attempts = data.grammarAttempts.filter(a => a.conceptId === def.id).slice(-6).reverse();
    const card = def.card;
    $('#main').innerHTML = `<div id="concept-detail">` + title('CONCEPT', def.name, `${GRAMMAR_CATEGORY_LABELS[def.category]} · 难度 ${def.difficulty}/3`)
        + `<div class="actions"><button class="secondary" data-concept-back="1">← 返回图谱</button><button class="primary" data-concept-practice="${def.id}">用真实句子练这个概念</button></div>`
        + `<div class="two-col"><section class="panel"><h2>掌握状态</h2><div class="metrics compact">${metric('估算掌握', pct(st.p), GRAMMAR_BAND_LABELS[st.band])}${metric('证据次数', String(st.attempts), `正确 ${st.correct}`)}${metric('独立正确', String(st.independentCorrect), '不看提示、不试错')}${metric('主要错误', errorSummary(st), `${st.delayedAttempts} 次延迟复测`)}</div><p class="hint">判定理由：${esc(st.reasons.join('；') || '尚无足够证据。')}</p><p class="hint">先修状态：${readiness.ok ? '已具备' : `缺少「${readiness.missing.map(id => conceptById(id)?.name ?? id).join('、')}」`}</p><h3>先修概念</h3><ul class="plain-list">${prereq}</ul>${chain.length ? `<p class="hint">完整先修链：${esc(chain.join(' → '))}</p>` : ''}${related.length ? `<p class="hint">易混概念：${esc(related.join('、'))}</p>` : ''}</section>`
        + `<section class="panel"><h2>知识卡（20–60 秒读完）</h2><div class="grammar-card"><p><b>规则</b> ${esc(card.rule)}</p><p><b>为什么</b> ${esc(card.why)}</p><blockquote>${esc(card.example.ok)}${card.example.bad ? `<br><small class="bad-line">✗ ${esc(card.example.bad)}</small>` : ''}${card.example.note ? `<br><small>${esc(card.example.note)}</small>` : ''}</blockquote><p><b>常见错误</b></p><ul class="plain-list">${card.commonErrors.map(e => `<li>${esc(e)}</li>`).join('')}</ul><p><b>迁移提示</b> ${esc(card.transfer)}</p></div></section></div>`
        + `<section class="panel"><h2>真实训练句（${sentences.length}）</h2>${sentences.length ? `<ul class="sentence-mini">${sentences.map(s => `<li><span class="src-badge src-${s.sourceType}">${s.sourceType}</span> ${esc(s.text)}<button class="secondary small" data-sentence-start="${s.id}">练这句</button></li>`).join('')}</ul>` : '<p class="hint">句库中还没有挂这个概念的句子。可以到「句子训练」粘贴你遇到的真实句子。</p>'}</section>`
        + `<section class="panel"><h2>最近证据</h2>${attempts.length ? `<ul class="plain-list">${attempts.map(a => `<li>${date(a.at)} · ${a.correct ? '正确' : '错误'}${a.independent ? ' · 独立' : ` · 辅助 L${a.supportLevel ?? 0}`}${a.transfer ? ' · 迁移' : ''}${a.delayed ? ' · 延迟' : ''}${a.errorType ? ` · ${ERROR_LABELS[a.errorType] ?? a.errorType}` : ''}</li>`).join('')}</ul>` : '<p class="hint">还没有练习记录。</p>'}</section></div>`;
    document.querySelectorAll<HTMLElement>('[data-concept-back]').forEach(b => b.addEventListener('click', () => { grammarSelectedConcept = ''; render(); }));
    document.querySelectorAll<HTMLElement>('[data-concept-practice]').forEach(b => b.addEventListener('click', () => practiceConcept(b.dataset.conceptPractice ?? '')));
    document.querySelectorAll<HTMLElement>('[data-sentence-start]').forEach(b => b.addEventListener('click', () => startLab([b.dataset.sentenceStart ?? ''], null, null)));
}
function practiceConcept(conceptId: string): void {
    const def = conceptById(conceptId);
    const candidates = sentencesForConcept(conceptId, sentenceRecords);
    if (!candidates.length) {
        toast(`句库中还没有挂「${def?.name ?? conceptId}」的句子；先去「句子训练」添加真实句子`);
        return;
    }
    const ordered = [...candidates].sort((a, b) => (a.structureProvenance === 'gold' ? -1 : 1) - (b.structureProvenance === 'gold' ? -1 : 1) || (a.id < b.id ? -1 : 1));
    startLab(ordered.slice(0, 2).map(s => s.id), null, null);
}
// —— 句子训练入口页 ——
function sentencePage(): void {
    const aiConfigured = !!(data.settings.endpoint && data.settings.model && data.settings.key);
    const caps = sourceCapabilities({ sentences: sentenceRecords, aiConfigured, readingAvailable: false });
    const mix = effectiveSourceMix(caps);
    const capabilityRows = caps.map(c => `<li><span class="src-badge src-${c.type}">${esc(c.label)}</span> ${c.available ? `<b>${c.count}</b> 句可用` : `未上线${c.requires ? `（${c.requires}）` : ''}`}</li>`).join('');
    const mixText = Object.entries(mix.mix).filter(([, v]) => v > 0).map(([k, v]) => `${esc(caps.find(c => c.type === k)?.label ?? k)} ${pct(v)}`).join(' · ');
    const rows = [...sentenceRecords].sort((a, b) => b.createdAt - a.createdAt).map(s => {
        const st = readStructure(s.structure, s.id, s.text).structure;
        const summary = structureSummary(st);
        return `<tr><td><span class="src-badge src-${s.sourceType}">${s.sourceType}</span><br><b>${esc(s.text)}</b><small class="zh-line">${esc(s.zh)}</small></td><td>${esc(sentenceConceptNames(s).slice(0, 3).join('、') || '—')}</td><td>${summary.clauseCount} 层 / ${summary.clauseKinds.map(k => CLAUSE_LABELS[k]).join('+')}<br><small>${summary.provenance === 'gold' ? 'gold 结构' : summary.provenance === 'heuristic' ? '启发式（不确定）' : '无结构'}</small></td><td><button class="primary small" data-sentence-start="${s.id}">开始拆句</button>${s.sourceType === 'curated' ? '' : `<button class="danger-text small" data-sentence-del="${s.id}">删除</button>`}</td></tr>`;
    }).join('') || '<tr><td colspan="4" class="empty-cell">句库为空。粘贴一句你最近遇到的真实难句开始。</td></tr>';
    $('#main').innerHTML = `<div id="sentence-page">` + title('SENTENCE LAB', '句子训练', '不是背语法，是拆句：先找主干，再认修饰，再看从句与非谓语。默认不给完整翻译。')
        + `<div class="metrics">${metric('句库', String(sentenceRecords.length), '句源见下表')}${metric('做过拆句', String(data.sentenceAttempts.length), '每次练习都留证据')}${metric('已独立完成', String(data.sentenceAttempts.filter(a => a.structureCorrect && (a.maxSupportLevel ?? 0) === 0).length), '不看提示、一次判断正确')}${metric('句源构成', mix.degraded ? '降级补位' : '目标配比', `${mix.unavailable.length} 个来源当前不可用`)}</div>`
        + `<div class="two-col"><section class="panel"><h2>句源与能力</h2><ul class="plain-list">${capabilityRows}</ul><p class="hint">目标配比：AI 40% · 你自己遇到的句子 40% · 真实材料 20%。当前实际：${mixText || '仅有人工教学句'}。${mix.reasons.length ? `原因：${esc(mix.reasons.join('；'))}` : ''}</p><p class="hint">${esc(generationUnavailableReason(aiConfigured, false))}</p></section>`
        + `<section class="panel"><h2>添加你遇到的真实句子</h2><form id="user-sentence-form"><label>英文原句<textarea id="user-sentence-input" rows="3" required maxlength="400" placeholder="粘贴你在文章、视频或对话里遇到的那一句"></textarea></label><label>中文意思（可选，先自己理解再填）<input id="user-sentence-zh" maxlength="300" placeholder="不填也可以，训练时会先让你自己判断"></label><div class="actions"><button class="primary" type="submit">保存到句库</button><button class="secondary" type="button" id="sentence-quick-start">按当前薄弱点开始训练</button></div></form><p class="hint">没有 gold 结构的句子不会伪造完整句法树：训练会使用带不确定标记的启发式切分，并允许你手动确认成分。</p></section></div>`
        + `<section class="panel"><h2>句库（${sentenceRecords.length}）</h2><div class="table-scroll"><table><thead><tr><th>句子</th><th>目标语法</th><th>结构</th><th>操作</th></tr></thead><tbody>${rows}</tbody></table></div><p class="hint">auto 标记的句子由本应用作者撰写（authored 教学句），不是任何文章原句。</p></section></div>`;
    document.querySelectorAll<HTMLElement>('[data-sentence-start]').forEach(b => b.addEventListener('click', () => startLab([b.dataset.sentenceStart ?? ''], null, null)));
    document.querySelectorAll<HTMLElement>('[data-sentence-del]').forEach(b => b.addEventListener('click', () => void deleteSentence(b.dataset.sentenceDel ?? '')));
    on('#user-sentence-form', 'submit', async (e: Event) => {
        e.preventDefault();
        const text = ($<HTMLTextAreaElement>('#user-sentence-input')).value.trim();
        const zh = ($<HTMLInputElement>('#user-sentence-zh')).value.trim();
        if (!text) {
            toast('请先写一句英文');
            return;
        }
        const { record, issues } = userSentenceRecord(text, zh);
        if (issues.length) {
            toast(issues.join('；'));
            return;
        }
        await saveSentences([record]);
        sentenceRecords = [record, ...sentenceRecords];
        data.sentences = sentenceRecords;
        toast(record.structureProvenance === 'heuristic' ? '已保存；这句没有 gold 结构，训练时会标注结构不确定' : '已保存到句库');
        render();
    });
    on('#sentence-quick-start', 'click', () => {
        const picked = selectSentenceBatch({
            now: Date.now(), sentences: sentenceRecords, words: data.words, concepts: data.grammarConcepts,
            grammarAttempts: data.grammarAttempts, sentenceAttempts: data.sentenceAttempts, availableMinutes: 10,
            energy: 'normal', miniUnit: data.miniUnits.find(u => u.status === 'active') ?? null,
        }, 2);
        if (!picked.length) {
            toast('当前没有符合难度与生词约束的句子');
            return;
        }
        startLab(picked.map((p: {
            record: {
                id: string;
            };
        }) => p.record.id), null, null);
    });
}
async function deleteSentence(id: string): Promise<void> {
    const rec = sentenceRecords.find(s => s.id === id);
    if (!rec || rec.sourceType === 'curated')
        return;
    await openDB();
    const db = getDB();
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('sentences', 'readwrite');
        const r = tx.objectStore('sentences').delete(id);
        r.onsuccess = () => resolve();
        r.onerror = () => reject(r.error);
    });
    sentenceRecords = sentenceRecords.filter(s => s.id !== id);
    data.sentences = sentenceRecords;
    toast('已从句库删除（历史练习证据保留）');
    render();
}
// —— 拆句训练运行 ——
function startLab(sentenceIds: string[], planTaskId: string | null, planTaskKind: string | null): void {
    const queue = sentenceIds.filter(id => sentenceRecords.some(s => s.id === id));
    if (!queue.length) {
        toast('没有可用的真实句子');
        return;
    }
    labSession = { sessionId: `lab-${Date.now().toString(36)}`, queue, index: 0, planTaskId, planTaskKind, startedAt: Date.now(), current: null, finished: [] };
    openLabSentence();
    page = 'lab';
    render();
}
function labRecord(): SentenceRecord | undefined { return sentenceRecords.find(s => s.id === labSession?.current?.sentenceId); }
function openLabSentence(opts: {
    transferOf?: string | null;
    delayed?: boolean;
} = {}): void {
    const session = labSession;
    if (!session)
        return;
    const rec = sentenceRecords.find(s => s.id === session.queue[session.index]);
    if (!rec) {
        labSession = null;
        page = 'sentence';
        render();
        return;
    }
    const structure = readStructure(rec.structure, rec.id, rec.text).structure;
    const plan = buildLabPlan(rec, structure, sentenceRecords.filter(s => s.id !== rec.id));
    session.current = {
        sentenceId: rec.id, plan, stepIndex: 0, stepRecords: [], supportLevel: 0, answered: null, evaluation: null,
        stepStartedAt: Date.now(), transferOf: opts.transferOf ?? null, delayed: !!opts.delayed, attempts: 0, done: false, result: null,
    };
}
function labPage(): void {
    if (!labSession || !labSession.current) {
        sentencePage();
        return;
    }
    const session = labSession;
    const cur = session.current!;
    const rec = labRecord();
    if (!rec) {
        sentencePage();
        return;
    }
    if (cur.done) {
        labResultView(rec);
        return;
    }
    const step = cur.plan.steps[cur.stepIndex];
    const total = cur.plan.steps.length;
    const level = supportHint(step, cur.supportLevel);
    const progress = `<div class="lab-progress"><span>第 ${cur.stepIndex + 1} / ${total} 步</span><span>${STEP_LABELS[step.kind]}</span><span class="badge ${cur.supportLevel === 0 ? 'fluent' : cur.supportLevel >= 3 ? 'vague' : 'normal'}">${SUPPORT_LABELS[cur.supportLevel]}</span></div>`;
    // 作答前只给候选成分，不给"它是主句主语"这类解析——那等于把答案写在选项上
    const options = step.options.map(o => `<button class="lab-option ${cur.answered === o.id ? 'picked' : ''}" data-lab-option="${o.id}" ${cur.answered ? 'disabled' : ''}><b>${esc(o.label)}</b>${cur.answered && o.detail ? `<small>${esc(o.detail)}</small>` : ''}</button>`).join('');
    const feedback = cur.evaluation ? `<div class="lab-feedback ${cur.evaluation.correct ? 'ok' : 'bad'}"><p><b>${cur.evaluation.correct ? '正确' : cur.evaluation.partial ? '部分正确' : '还不准确'}</b> · ${cur.evaluation.correct ? '' : `错误类型：${ERROR_LABELS[cur.evaluation.errorType] ?? cur.evaluation.errorType}`}</p><p>${esc(cur.evaluation.feedback)}</p><p class="hint">${esc(cur.evaluation.nextFocus)}</p><div class="actions">${cur.evaluation.correct ? '' : (step.conceptIds[0] ?? 'structure.core') ? `<button class="secondary" data-jit="${step.conceptIds[0] ?? 'structure.core'}">看 30 秒知识卡</button>` : ''}<button class="primary" id="lab-next">${cur.stepIndex + 1 < total ? '下一步' : '完成这句'}</button></div>${cur.supportLevel >= 3 ? '<p class="hint warn">这句你已看过答案／完整解释：会计入接触次数，但不会算作掌握证据。</p>' : ''}</div>` : '';
    $('#main').innerHTML = `<div id="lab-page">` + title('SENTENCE LAB', `拆句 · ${cur.stepIndex + 1}/${total}`, '先找主干，再看修饰；不确定时可以要提示，但提示会降低这次证据的可信度。')
        + `<div class="actions"><button class="secondary" data-lab-back="1">← 回到句库</button><button class="danger-text" id="lab-skip">跳过这句</button></div>`
        + `<section class="panel lab-panel">${cur.transferOf ? `<p class="hint"><span class="src-badge">迁移验证</span> 这是同一个结构的新句：不看提示，独立判断一次。</p>` : ''}${preTeachHTML(rec)}<div id="lab-sentence" class="lab-sentence">${esc(rec.text)}</div>${progress}
            <h2 id="lab-question">${esc(step.question)}</h2>
            <div class="lab-options">${options}</div>
            <div class="actions"><button class="secondary" id="lab-hint" ${cur.answered ? 'disabled' : ''}>${level.level === 0 ? '需要提示？（会降低证据强度）' : '再给一点提示'}</button><span class="hint" id="lab-level">当前辅助：${level.label}（L${level.level}/${MAX_SUPPORT_LEVEL}）</span></div>
            ${cur.supportLevel > 0 && !cur.answered ? `<p class="hint">提示：${esc(level.hint)}</p>` : ''}
            ${feedback}
        </section>
        <p class="hint">句子来源：${rec.sourceType} · 结构来源：${cur.plan.simplified ? '简化流程（句子较简单）' : readStructure(rec.structure, rec.id, rec.text).structure.provenance}${cur.plan.uncertain ? ' · 结构不确定，已标注' : ''}${cur.plan.notes.length ? ` · ${esc(cur.plan.notes.join('；'))}` : ''}</p></div>`;
    document.querySelectorAll<HTMLElement>('[data-lab-option]').forEach(b => b.addEventListener('click', () => void labAnswer(b.dataset.labOption ?? '')));
    on('#lab-hint', 'click', () => { if (!labSession?.current || labSession.current.answered)
        return; labSession.current.supportLevel = Math.min(MAX_SUPPORT_LEVEL, labSession.current.supportLevel + 1); render(); });
    on('#lab-next', 'click', () => labAdvance());
    on('#lab-skip', 'click', () => labSkip());
    document.querySelectorAll<HTMLElement>('[data-lab-back]').forEach(b => b.addEventListener('click', () => { labSession = null; page = 'sentence'; render(); }));
    document.querySelectorAll<HTMLElement>('[data-jit]').forEach(b => b.addEventListener('click', () => showJitCard(b.dataset.jit ?? '')));
}
async function labAnswer(optionId: string): Promise<void> {
    const session = labSession;
    const cur = session?.current;
    if (!session || !cur || cur.answered)
        return;
    const step = cur.plan.steps[cur.stepIndex];
    const evaluation = evaluateStep(step, optionId, cur.supportLevel);
    cur.stepRecords.push(stepRecord(step.id, optionId, evaluation.correct, cur.supportLevel, Date.now() - cur.stepStartedAt, evaluation.errorType));
    cur.answered = optionId;
    cur.evaluation = evaluation;
    render();
}
function labAdvance(): void {
    const session = labSession;
    const cur = session?.current;
    if (!session || !cur)
        return;
    if (cur.stepIndex + 1 < cur.plan.steps.length) {
        cur.stepIndex++;
        cur.answered = null;
        cur.evaluation = null;
        cur.supportLevel = 0;
        cur.stepStartedAt = Date.now();
        render();
        return;
    }
    void finishLabSentence();
}
function labSkip(): void {
    const session = labSession;
    if (!session)
        return;
    session.index++;
    if (session.index >= session.queue.length) {
        void finishLabSession();
        return;
    }
    openLabSentence();
    render();
}
function showJitCard(conceptId: string): void {
    const session = labSession;
    const cur = session?.current;
    if (!cur?.evaluation)
        return;
    const card = justInTimeCard(conceptId, cur.evaluation);
    if (!card) {
        toast('这个知识点暂时没有卡片');
        return;
    }
    modal(`<div class="eyebrow">JUST-IN-TIME · ${card.seconds}s</div><h2>${esc(card.name)}</h2><p><b>规则</b> ${esc(card.rule)}</p><p><b>为什么</b> ${esc(card.why)}</p><blockquote>${esc(card.example.ok)}${card.example.bad ? `<br><small class="bad-line">✗ ${esc(card.example.bad)}</small>` : ''}${card.example.note ? `<br><small>${esc(card.example.note)}</small>` : ''}</blockquote><p><b>你刚才的错误</b> ${esc(card.trigger)}</p><ul class="plain-list">${card.commonErrors.map(e => `<li>${esc(e)}</li>`).join('')}</ul><p><b>迁移</b> ${esc(card.transfer)}</p><div class="actions"><button class="primary" id="jit-back">回到原句再判断</button></div>`);
    on('#jit-back', 'click', () => closeModal());
}
async function finishLabSentence(): Promise<void> {
    const session = labSession;
    const cur = session?.current;
    const rec = labRecord();
    if (!session || !cur || !rec)
        return;
    const allCorrect = cur.stepRecords.every(r => r.correct);
    const draft: AttemptDraft = {
        sentenceId: rec.id, sentence: rec.text, sourceType: rec.sourceType, sourceId: rec.sourceId,
        targetWords: rec.targetWordIds, grammarConceptIds: sentenceConceptIds(rec), steps: cur.stepRecords,
        durationMs: Math.max(1000, Date.now() - session.startedAt), sessionId: session.sessionId,
        meaningCorrect: cur.stepRecords.filter(r => r.stepId.startsWith('meaning')).every(r => r.correct) ? true : cur.stepRecords.some(r => r.stepId.startsWith('meaning')) ? false : null,
        translationDependence: maxSupportLevelOf(cur.stepRecords), transferOf: cur.transferOf, delayed: cur.delayed,
    };
    const applied = applyEvidence({ concepts: data.grammarConcepts, grammarAttempts: data.grammarAttempts, sentenceAttempts: data.sentenceAttempts }, draft, stepConceptMap(cur.plan.steps), Date.now(), GRAMMAR_TAXONOMY);
    data.grammarConcepts = applied.concepts;
    const newAttempts = applied.grammarAttempts.filter(a => !data.grammarAttempts.some(o => o.id === a.id));
    data.grammarAttempts = applied.grammarAttempts;
    let updatedSentence: SentenceRecord | null = null;
    if (!applied.duplicate) {
        data.sentenceAttempts.push(applied.attempt);
        updatedSentence = { ...rec, usedCount: (rec.usedCount ?? 0) + 1, lastUsedAt: Date.now() };
        sentenceRecords = sentenceRecords.map(s => s.id === rec.id ? updatedSentence! : s);
        data.sentences = sentenceRecords;
        try {
            await dbSaveSentenceEvidence(applied.attempt, newAttempts, applied.concepts.filter(c => applied.updatedConceptIds.includes(c.id)), updatedSentence);
        }
        catch (e) {
            toast(`证据保存失败（本地数据仍保留在内存）：${(e as Error).message}`);
        }
    }
    cur.done = true;
    cur.result = { evidenceClass: applied.evidenceClass, counts: applied.countsTowardMastery, allCorrect, duplicate: applied.duplicate, conceptIds: applied.updatedConceptIds };
    session.finished.push({ sentenceId: rec.id, correctSteps: cur.stepRecords.filter(r => r.correct).length, total: cur.stepRecords.length, evidenceClass: applied.evidenceClass, conceptIds: applied.updatedConceptIds });
    render();
}
function maxSupportLevelOf(steps: SentenceStepRecord[]): number { return steps.reduce((m, s) => Math.max(m, s.supportLevel ?? 0), 0); }
function labResultView(rec: SentenceRecord): void {
    const session = labSession!;
    const cur = session.current!;
    const result = cur.result!;
    const structure = readStructure(rec.structure, rec.id, rec.text).structure;
    const summary = structureSummary(structure);
    const rows = cur.stepRecords.map((r, i) => {
        const step = cur.plan.steps[i];
        return `<tr><td>${i + 1}. ${esc(STEP_LABELS[step?.kind ?? 'subject'])}</td><td>${r.correct ? '<span class="badge fluent">正确</span>' : `<span class="badge unknown">错误</span> <small>${ERROR_LABELS[r.errorType] ?? r.errorType}</small>`}</td><td>L${r.supportLevel ?? 0}</td></tr>`;
    }).join('');
    const transfer = buildTransferTask(rec, sentenceRecords);
    const isLast = session.index + 1 >= session.queue.length;
    $('#main').innerHTML = `<div id="lab-results">` + title('SENTENCE COMPLETE', result.allCorrect ? '这一句，你拆开了' : '这一句还没完全拆开', `证据等级：${EVIDENCE_LABELS[result.evidenceClass as SentenceEvidenceClass]}${result.counts ? '（计入掌握估算）' : '（不计入掌握，只计接触）'}`)
        + `<div class="metrics">${metric('步骤正确', `${cur.stepRecords.filter(r => r.correct).length}/${cur.stepRecords.length}`, cur.plan.simplified ? '简化流程' : '完整流程')}${metric('最高辅助', `L${maxSupportLevelOf(cur.stepRecords)}`, SUPPORT_LABELS[maxSupportLevelOf(cur.stepRecords)])}${metric('结构层级', `${summary.clauseCount} 层`, summary.clauseKinds.map(k => CLAUSE_LABELS[k]).join('+'))}${metric('涉及概念', String(result.conceptIds.length), result.conceptIds.slice(0, 2).map(id => conceptById(id)?.name ?? id).join('、'))}</div>`
        + `<div class="two-col"><section class="panel"><h2>你的步骤</h2><div class="table-scroll"><table><thead><tr><th>步骤</th><th>结果</th><th>辅助</th></tr></thead><tbody>${rows}</tbody></table></div><h2>整句意思</h2><p class="meaning-reveal">${esc(rec.zh)}</p><p class="hint">先自己复述一遍，再对照；这一步不产生掌握证据。</p></section>`
        + `<section class="panel"><h2>结构树</h2>${structureTreeHTML(rec, structure)}</section></div>`
        + `<div class="actions">${transfer ? `<button class="secondary" id="lab-transfer">换一句同结构的新句（迁移验证）</button>` : ''}<button class="primary" id="lab-next-sentence">${isLast ? '结束本次训练' : '下一句'}</button></div>`
        + (transfer ? `<p class="hint">迁移句：${esc(transfer.candidate.text)}（共用 ${transfer.sameGrammar.map(id => conceptById(id)?.name ?? id).join('、')}）</p>` : '') + '</div>';
    on('#lab-next-sentence', 'click', () => { session.index++; if (session.index >= session.queue.length)
        void finishLabSession();
    else {
        openLabSentence();
        render();
    } });
    on('#lab-transfer', 'click', () => {
        if (!transfer)
            return;
        session.queue.splice(session.index + 1, 0, transfer.candidate.id);
        session.index++;
        openLabSentence({ transferOf: rec.id });
        render();
    });
}
// 预教词：authored 教学句自带释义，避免"要练语法却被生词卡死"
function preTeachHTML(rec: SentenceRecord): string {
    const glossary = rec.glossary ?? {};
    const lower = rec.text.toLowerCase();
    // 用字符边界判断，避免  在不同打包/转义环境下失效
    const hasWord = (w: string) => {
        const head = w.split(' ')[0].toLowerCase().replace(/[^a-z']/g, '');
        const at = lower.indexOf(head);
        if (at < 0)
            return false;
        const before = at === 0 ? ' ' : lower[at - 1];
        const after = at + head.length >= lower.length ? ' ' : lower[at + head.length];
        return !/[a-z]/.test(before) && !/[a-z]/.test(after);
    };
    const chips = Object.entries(glossary).filter(([w]) => hasWord(w));
    if (!chips.length)
        return '';
    return `<div class="pret teach"><span class="src-badge">预教词</span> ${chips.map(([w, zh]) => `<span class="token"><b>${esc(w)}</b><small>${esc(zh)}</small></span>`).join(' ')}<p class="hint">先确认这些词的意思，再开始拆句；它们不计入"未知生词"。</p></div>`;
}
function structureTreeHTML(rec: SentenceRecord, structure: SentenceStructure): string {
    const rows = structureRows(structure);
    const clauses = [...structure.clauses].sort((a, b) => a.start - b.start);
    const body = clauses.map(c => `<details class="tree-clause" ${c.parentId ? '' : 'open'}><summary><span class="clause-kind">${CLAUSE_LABELS[c.kind]}</span> <b>${esc(c.label)}</b> <small>词 ${c.start + 1}–${c.end + 1}</small></summary><div class="tree-tokens">${rows.filter(r => r.clauseId === c.id).map(r => `<span class="token role-${r.role}" title="依存：${esc(r.headText)}${r.note ? ` · ${esc(r.note)}` : ''}"><b>${esc(r.text)}</b><small>${r.roleLabel}</small></span>`).join('')}</div></details>`).join('');
    const warn = structure.provenance === 'gold' ? '' : `<p class="hint warn">结构来源是 ${structure.provenance}（confidence ${structure.confidence}）：这不是可靠的完整句法分析，只用于引导你注意成分位置。</p>`;
    return `<div id="lab-tree" class="tree"><p class="hint">先看主句骨架，再看从句／非谓语如何补足（组内保持原词序）。</p>${body}</div>${warn}<p class="hint">${esc(structure.note)}</p>`;
}
async function finishLabSession(): Promise<void> {
    const session = labSession;
    if (!session)
        return;
    const finished = session.finished;
    const minutes = Math.max(0.5, Math.round((Date.now() - session.startedAt) / 30000) / 2);
    const taskId = session.planTaskId;
    const kind = session.planTaskKind;
    labSession = null;
    if (taskId) {
        await completePlanTask({ planTaskId: taskId, kind: kind ?? 'sentence-basic-structure', startedAt: Date.now() - minutes * 60000, sessionId: session.sessionId }, minutes);
        page = 'home';
    }
    else {
        page = 'sentence';
    }
    render();
    toast(`本次完成 ${finished.length} 句 · 用时约 ${Math.round(minutes)} 分钟${finished.length ? ` · ${finished.map(f => `${f.correctSteps}/${f.total}`).join('、')}` : ''}`);
}
// 仅 ?test=1 时暴露测试钩子：验收脚本据此点"正确/错误"选项，生产 DOM 不含任何答案提示
function installTestHook(): void {
    if (!new URLSearchParams(location.search).has('test'))
        return;
    const hook = {
        step: () => {
            const cur = labSession?.current;
            if (!cur)
                return null;
            const step = cur.plan.steps[cur.stepIndex];
            return { index: cur.stepIndex, total: cur.plan.steps.length, kind: step.kind, correctId: step.correctId, answered: !!cur.answered, evidence: cur.result ? cur.result.evidenceClass : '' };
        },
        answerCorrect: () => {
            const cur = labSession?.current;
            if (!cur)
                return false;
            const step = cur.plan.steps[cur.stepIndex];
            const b = document.querySelector<HTMLElement>(`[data-lab-option="${step.correctId}"]`);
            if (!b)
                return false;
            b.click();
            return true;
        },
        answerWrong: () => {
            const cur = labSession?.current;
            if (!cur)
                return false;
            const step = cur.plan.steps[cur.stepIndex];
            const wrong = step.options.find(o => o.id !== step.correctId);
            const b = wrong ? document.querySelector<HTMLElement>(`[data-lab-option="${wrong.id}"]`) : null;
            if (!b)
                return false;
            b.click();
            return true;
        },
    };
    (window as unknown as Record<string, unknown>).__labTest = hook;
}
async function boot() {
    installTestHook();
    await openDB();
    data = await loadData();
    reindex();
    try {
        const graph = await ensureGraphData({ grammarConcepts: data.grammarConcepts, sentences: data.sentences });
        data.grammarConcepts = graph.concepts;
        data.sentences = graph.sentences;
        sentenceRecords = graph.sentences.length ? graph.sentences : curatedSentenceRecords();
    }
    catch (e) {
        sentenceRecords = curatedSentenceRecords();
        console.error('图谱初始化失败', e);
    }
    try {
        todayPlan = (await loadPlan(dayKey(Date.now()))) ?? null;
    }
    catch {
        todayPlan = null;
    }
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
