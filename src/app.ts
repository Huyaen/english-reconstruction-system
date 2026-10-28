import './tokens.css';
import { applyPageChrome, disposePageChrome, installPressFeedback } from './ui/motion.ts';
import './style.css';
import './proto15c.css';
import './proto15c-v2.css';
import './proto15c-b3.css';
import './proto15c-b4.css';
import './reading15c.css';
import './reading15c-v2.css';
import './reading15d.css';
import './cinematic15d.css';
import './ui/system.css';
import './ui/pages/quiz.css';
import './ui/pages/mgmt.css';
import './ui/pages/reading.css';
import './ui/pages/sentence-grammar.css';
import './ui/pages/io.css';
import './ui/pages/data.css';
import { protoTodayHTML, protoTodayD, protoTaskViews, type ProtoContext, type ProtoId, type ProtoTaskInput } from './protoToday';
import { startLiving, stopLiving, livingAllowed } from './living';
import type { Data, Word, StudySession, Settings, ReviewRecord, Mastery, DailyPlan, PlanItem, EnergyState, GrammarConcept, SentenceRecord, SentenceStepRecord, SentenceAttempt, SentenceEvidenceClass, GrammarCategory } from './types.ts';
import { testHooksEnabled, pwaEnabled } from './testMode.ts';
import { afterRender } from './motion.ts';
import { morphNavigate, morphBusy } from './morph15d.ts';
// —— Phase 5：Reading Lab ——
import type { Passage, ReadingSession, ReadingToken, ReadingMark, ReadingDifficultyReport, WordExposure, DifficultSentence, ReadingProblemType } from './types.ts';
import { parsePassageText, sentenceAtSpan, tokenizeSentence, countWords } from './readingText.ts';
import { buildPastedDraft, buildUrlDraft, buildImageDraft, buildManualImageDraft, classifyFetchFailure, findDuplicate, importFromFile, ocrCapability, toPassage, type PassageDraft } from './readingImport.ts';
import { checkImage, classifyOcrFailure } from './ocr.ts';
import { OcrError, ocrService, ocrServiceWithPaths } from './ocrEngine.ts';
// —— Phase 6：AI 强化（Provider / 生成 / 质量门 / 记录）——
import { AIError, normalizeAIConfig, validateAIConfig, type AIErrorInfo, type AIProviderConfig } from './aiProvider.ts';
import { generateReading, generateSentence, EVIDENCE_NOTE } from './aiGenerate.ts';
import { summarize as summarizeQuality } from './aiQuality.ts';
import { budgetState, buildGeneration, contentHashes } from './aiStore.ts';
import type { AIGeneration, AISettings } from './types.ts';
import { estimateReadingDifficulty, classificationLabel } from './readingDifficulty.ts';
// —— Phase 7：Mini Unit（跨学习日主题单元）——
import type { MiniUnit } from './types.ts';
import { collectUnitEvidence } from './miniUnitEvidence.ts';
import { applyUnitEvent, dayLabel, nextDay, stageOf } from './miniUnit.ts';
import { applyTransition } from './miniUnitStore.ts';
import { unitCreatePage, unitPage, anchorPicker } from './miniUnitView.ts';
import * as unitActions from './miniUnitActions.ts';
import { SUGGESTED_INTERESTS, addInterest, normalizeProfile, removeInterest, renameInterest, resetInterests } from './interestProfile.ts';
import { activitySignals as inputActivitySignals } from './interestProfile.ts';
import * as inputActions from './inputActions.ts';
import { filterLibrary, setLibraryStatus } from './inputLibrary.ts';
import { recommendInputs } from './inputRecommendation.ts';
import { inputAnalytics } from './inputEvidence.ts';
import { inputHubPage, inputSessionPage } from './inputView.ts';
import { selectOutputTasks } from './outputSelection.ts';
import { countWords as outputWords } from './outputTask.ts';
import { buildSupportHint, recordSupport, emptySupport } from './outputScaffolding.ts';
import { outputHubPage, outputSessionPage, type HandoffCard } from './outputView.ts';
import { createOutputAttempt, saveDraft, submitOutput as submitOutputAttempt, requestOutputFeedback, reviseOutput, finishOutput, attachRepair, handoutFromInput } from './outputActions.ts';
import { outputAnalytics } from './outputAnalytics.ts';
import { compareRevision } from './outputRevision.ts';
import { buildTransferTask as buildOutputTransfer } from './outputTransfer.ts';
import { evaluateRepair } from './outputRepair.ts';
import { buildTaskSpec as buildOutputTask, canShowModelAnswer } from './outputTask.ts';
import { localChecks } from './outputDiagnosis.ts';
// —— Phase 11：考试迁移与统一测评（消费层）——
import type { AssessmentItem, ExamErrorCategory, ExamLog, ExamLogType, ExamSession, ExamSpecification, WeeklyAssessmentReport } from './examTypes.ts';
import { ensureExamContent, saveExamSession, saveExamLog, deleteExamLog, clearExamLogs, getExamBank, clearExamSessions } from './examStore.ts';
import { createExamSession, startSession as startExamSession, saveAnswer as saveExamAnswer, submitSession, reviewSession, completeSession, pauseSession, scoreStatusLabel, gradeSession } from './examSession.ts';
import { collectErrors, correctError, errorCategoryLabel } from './examErrors.ts';
import { freshExamItems, buildWeeklyAssessment, weeklySession, weeklyReportFrom, buildTransferRetest, type WeeklyBuild } from './weeklyAssessment.ts';
import { planExamTask } from './examPlanner.ts';
import { examOverviewHtml, examPracticeListHtml, examSessionHtml, examResultHtml, weeklyPanelHtml, examLogsHtml, specsAuditHtml } from './examView.ts';
import { EXAM_LOG_TYPES, examLogSpecLabel, examLogTypeLabel, examLogTypeOf, officialTotalForSpec, validateExamLogDraft, sanitizeExamLog, exportExamLogs, parseExamLogsExport } from './examLog.ts';
import { transcriptText } from './inputActions.ts';
import { planInputMinutes, suggestMode } from './inputSession.ts';
import { captionCaveat } from './inputReflection.ts';
import { sentenceCandidates, transcriptSentenceRecord } from './inputHandoff.ts';
import { providerLabel } from './inputUrl.ts';
import type { CaptionMode, InputMode } from './types.ts';
import type { InterestProfile } from './types.ts';
import { createReadingSession, submitColdTest, startReading, submitMainIdea, markWord, revokeMark, requestHelp, captureDifficultSentence, linkDifficultSentenceAttempt, finishFirstPass, startReread, finishReread, submitWholeTextItem, submitOutput, completeReadingSession, sessionProgress, nextChunk, goToChunk, isResumable, stageLabel, maxHelpLevelUsed } from './readingSession.ts';
import { selectStudyCandidates, buildHandoffPlan, exposureFromMark, readingWordSeed, readyForTraining, explicitUnknownRate, type StudyCandidate } from './readingVocabulary.ts';
import { difficultSentenceRecord, PROBLEM_TYPE_LABELS, returnTarget, type LabReturnTarget } from './readingSentences.ts';
import { computeReadingMetrics, computeReadingTrend, targetDifficultyBand } from './readingAnalytics.ts';
import { queryLibrary, savePassage, saveReadingProgress, latestOpenSession, passageOf, type LibraryQuery } from './readingStore.ts';
import { importPanelHTML, previewHTML, coldTestHTML, readerHTML, rereadHTML, wholeTextHTML, resultHTML, studyWordsHTML, esc as resc, sourceLabel } from './readingView.ts';
import { openDB, getDB, loadData, replaceData, saveSettings, putItems, saveAnswer, savePreview, backup, validateBackup, emptyData } from './db.ts';
import { originNotice, type OriginNotice } from './origin.ts';
import { checkDataIntegrity, integritySummary } from './integrity.ts';
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
// —— Phase 12 Full Integration：Today 计划唯一执行契约 ——
import { taskModule, taskTargetLabel, taskUnavailableReason, taskEvidence, nextOpenTask } from './taskExecutor.ts';
// —— Phase 4：Sentence Lab 与 Grammar Knowledge Graph ——
import { GRAMMAR_BAND_LABELS, GRAMMAR_CATEGORY_LABELS, type GrammarConceptDef, GRAMMAR_CONFIG, GRAMMAR_TAXONOMY, ancestorConcepts, conceptById, conceptStates, grammarState, prerequisitesSatisfied, validateTaxonomy, weakConcepts, type GrammarConceptState } from './grammar.ts';
import { CLAUSE_LABELS, ROLE_LABELS, clauseForToken, heuristicStructure, readStructure, structureRows, structureSummary, validateStructure, type SentenceStructure } from './sentenceStructure.ts';
import { EVIDENCE_LABELS, STEP_LABELS, SUPPORT_LABELS, MAX_SUPPORT_LEVEL, buildLabPlan, buildTransferTask, evaluateStep, stepRecord, supportHint, type LabPlan, type LabStep } from './sentenceLab.ts';
import { applyEvidence, justInTimeCard, stepConceptMap, type AttemptDraft } from './sentenceEvidence.ts';
import { curatedSentenceRecords, effectiveSourceMix, generationUnavailableReason, sentenceGenerationFallback, sourceCapabilities, userSentenceRecord } from './sentenceSources.ts';
import { SENTENCE_TASK_LABELS, selectSentenceBatch } from './sentenceSelection.ts';
import { sentenceConceptIds, sentenceConceptNames, sentencesForConcept } from './sentenceGraphMap.ts';
import { ensureGraphData, loadSentences, saveSentences, sentenceAttemptsDesc } from './sentenceStore.ts';
import { saveSentenceEvidence as dbSaveSentenceEvidence } from './db.ts';
import { diagnosticsPage } from './diagnosticsView.ts';
import { buildDiagnostics, latestSnapshot } from './diagnosticsInsight.ts';
import { generateSnapshot, generateWeekly } from './diagnosticsActions.ts';
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
// 跨模块任务绑定：领域会话完成时据此回写计划；离开页面后仍保留，直到任务完成/重新开始。
let inputPlanTaskId: string | null = null;
let outputPlanTaskId: string | null = null;
let examPlanTaskId: string | null = null;
let taskStarting = false;
// 用户从「开始今天的训练」进入后，领域会话完成自动回到 Today，继续下一项。
let trainingFlow = false;
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
    ungraded?: boolean;
    returnTo?: LabReturnTarget | null;
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
// —— Phase 5 状态（阅读）——
type ReadView = 'library' | 'preview' | 'cold' | 'reader' | 'reread' | 'whole' | 'result' | 'words';
let readView: ReadView = 'library';
/** 阅读辅助面板是否展开（移动端为底部面板）。折叠不重绘，因此不会丢阅读位置。
 *  窄屏默认收起，否则浮层会盖住正文。 */
let readSideOpen = typeof window !== 'undefined' && window.matchMedia ? !window.matchMedia('(max-width: 980px)').matches : true;
/** 用户是否手动开合过辅助面板；没有时由视口宽度决定默认值。 */
let readSideToggled = false;
let sheetEscBound = false;
let sideResizeBound = false;
let readPassage: Passage | null = null;
let readDraft: PassageDraft | null = null;
let readSession: ReadingSession | null = null;
let readDifficulty: ReadingDifficultyReport | null = null;
let readTokens: ReadingToken[] = [];
let readSelectedToken: ReadingToken | null = null;
let readHelpState: {
    show: boolean;
    text: string;
} = { show: false, text: '' };
let readCandidates: StudyCandidate[] = [];
let readLibraryQuery: LibraryQuery = { readState: 'all' };
let readMessage = '';
let readingTask: {
    planTaskId: string;
    startedAt: number;
} | null = null;
let labReturn: (LabReturnTarget & {
    planTaskId?: string;
}) | null = null;
const navs = [['home', '◫', '今日学习'], ['books', '▤', '我的词库'], ['weak', '◎', '薄弱词'], ['sentence', '❝', '句子训练'], ['reading', '❖', '阅读'], ['input', '▶', '真实输入'], ['output', '✎︎', '真实表达'], ['grammar', '◈', '语法图谱'], ['unit', '◐', '主题单元'], ['diagnostics', '◮', '学情诊断'], ['exam', '⌘', '考试迁移'], ['stats', '▥', '学习统计'], ['ai', '✧︎', 'AI 学情'], ['settings', '⚙︎', '设置与备份']];
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
    vtPending = true;
    render();
}
function stopTimer() {
    if (timer)
        clearTimeout(timer);
    timer = null;
}
function shell() {
    document.documentElement.dataset.theme = data.settings.theme;
    const nav = navs.map(([id, icon, name]) => `<button data-nav="${id}" class="${page === id ? 'active' : ''}"${page === id ? ' aria-current="page"' : ''}><span aria-hidden="true">${icon}</span>${name}</button>`).join('');
    $('#app').innerHTML = `<a class="skip-link" href="#main">跳到主要内容</a>
<div class="app-shell">
  <aside>
    <a class="brand" href="#"><span class="brand-icon" aria-hidden="true">词</span><span>词间<small>把词留在记忆里</small></span></a>
    <nav aria-label="主导航">${nav}</nav>
    <div class="aside-foot"><span class="local-dot" aria-hidden="true"></span>本地学习空间<small>每次作答自动保存</small></div>
  </aside>
  <div class="workspace">
    <header><span>${navs.find(n => n[0] === page)?.[2] || '专注训练'}</span><div class="topbar-meta"><span class="date-label">${(() => { const d = new Date(); return `${d.getMonth() + 1} 月 ${d.getDate()} 日 · ${d.toLocaleDateString('zh-CN', { weekday: 'long' })}`; })()}</span><button id="theme" class="icon-button" aria-label="切换深浅色">${data.settings.theme === 'light' ? '☾' : '☀'}</button></div></header>
    <main id="main" tabindex="-1"></main>
  </div>
</div>`;
    document.querySelectorAll<HTMLElement>('[data-nav]').forEach(b => b.onclick = () => setPage(b.dataset.nav!));
    on('.brand', 'click', e => { e.preventDefault(); setPage('home'); });
    on('#theme', 'click', async () => { const s = { ...data.settings, theme: data.settings.theme === 'light' ? 'dark' : 'light' } as Settings; await saveSettings(s); data.settings = s; document.documentElement.dataset.theme = s.theme; $('#theme').textContent = s.theme === 'light' ? '☾' : '☀'; });
}
let lastRenderKey = '';
let vtPending = false;
/** Phase 15c 原型开关：?proto=a|b。没有参数时保持 15b 界面（测试与冒烟依赖默认路径）。 */
const PROTO: ProtoId | null = (() => {
    try {
        const v = new URLSearchParams(location.search).get('proto');
        // Phase 15h：电影感界面成为默认路径；?proto=legacy 保留 15b 旧界面作为回退。
        if (v === 'legacy' || v === 'off' || v === 'a' || v === 'b')
            return null;
        if (v === 'd')
            return 'd';
        return 'd';
    }
    catch {
        return 'd';
    }
})();
function applyProtoAttr(): void {
    try {
        const el = document.documentElement;
        if (PROTO)
            el.dataset.proto = PROTO;
        else
            delete el.dataset.proto;
    }
    catch {
        /* 非浏览器实现忽略 */
    }
}
function renderKey(): string { return page === 'reading' ? `${page}:${readView}` : page; }
/** 页面过渡只在页面/子视图真的切换时发生；同一视图重绘保持滚动位置。 */
function render(): void {
    vtPending = false;
    paint();
}
function paint(): void {
    const prev = lastRenderKey;
    const y = window.scrollY;
    disposePageChrome();
    applyProtoAttr();
    shell();
    ({ home: home, books: () => library(false), weak: () => library(true), stats: statistics, ai: aiPage, settings: settingsPage, preview: previewPage, sentence: sentencePage, reading: readingPage, grammar: grammarPage, lab: labPage, unit: unitPageApp, input: inputPageApp, output: outputPageApp, diagnostics: diagnosticsPageApp, exam: examPageApp }[page] || home)();
    // 原型路径：有些会话页要先异步取数据，第一帧会是空的；用一块安静的占位代替黑屏。
    if (PROTO && page !== 'home') {
        const m = document.querySelector<HTMLElement>('#main');
        if (m && !m.textContent?.trim())
            m.innerHTML = `<div class="d-loading" role="status" aria-live="polite"><i class="d-loading-mark"></i><p>正在准备这一项…</p></div>`;
    }
    bindAI();
    lastRenderKey = renderKey();
    try {
        const top = prev === lastRenderKey ? y : 0;
        if (top !== window.scrollY)
            window.scrollTo({ top, left: 0, behavior: 'auto' });
    }
    catch {
        /* 非浏览器实现（测试环境）忽略 */
    }
    applyPageChrome(page);
    afterRender();
    // 页面切换的运动：只在这一帧之后播放，不延迟任何 DOM 写入（测试与业务代码依赖同步渲染）
    const main = document.querySelector<HTMLElement>('#main');
    if (main && prev && prev !== lastRenderKey) {
        main.classList.remove('p15-enter');
        void main.offsetWidth;
        main.classList.add('p15-enter');
    }
}
function title(kicker: string, title: string, sub: string, action = '') {
    // 15h 复核：eyebrow 原本压在 h1 上方，占掉标题上的黄金位，且检测器判 kicker-above-heading。
    // 它的信息（YOUR WORDBOOKS / FOCUSED REVIEW）属于元信息，不是标题——移到 h1 之后。
    return `<div class="page-title"><div><h1>${title}</h1><div class="eyebrow">${kicker}</div><p>${sub}</p></div>${action}</div>`;
}
/** 计划理由码 → 人话。计划层只给内部码，界面不能直接暴露。 */
function humanReason(raw: string): string {
    const m = raw.match(/^([a-z0-9-]+?)(?:\((.*?)\)|:(.*))?$/);
    const code = m?.[1] ?? raw;
    const arg = m?.[2] ?? m?.[3] ?? '';
    if (code.startsWith('re-entry-missed'))
        return `中断 ${arg} 天后先做重新进入检测`;
    if (code.startsWith('mini-diagnostic-missed'))
        return '先做一次小诊断找回状态';
    if (code.startsWith('budget-clamped'))
        return `预算已收敛到 ${arg.split('->')[1] ?? arg} 分钟`;
    if (code.startsWith('critical-memory-sampled'))
        return '到期记忆优先，只取一部分';
    if (code.startsWith('pool-limited'))
        return '词池不足，按实际取词';
    if (code.startsWith('diagnostic-focus'))
        return '针对当前瓶颈';
    if (code.startsWith('sentence-block') || code.startsWith('reading-block'))
        return '';
    const map: Record<string, string> = {
        'order-memory-first': '记忆优先排序', 'order-new-first': '新词优先排序',
        'budget-closing-only': '预算只够收尾回忆',
        'budget-tight-skip-recall': '预算紧，跳过隔夜检测',
        'budget-tight-skip-reentry': '预算紧，跳过重新进入检测',
        'new-deferred-budget': '新词因预算顺延到明天',
        'd1-sample-low': '隔夜样本还少', 'd7-sample-low': '一周样本还少',
        'low-confidence': '保留率证据偏少', 'energy-invalid-normalized': '状态已按正常处理',
        'no-valid-overnight-evidence': '还没有可信的隔夜证据',
        'no-yesterday-evidence': '昨天没有可比证据',
        'first-use-normal-baseline': '首次使用，按常规起步',
        'one-day-gap-normal-resume': '隔一天回来，按常规继续',
        'same-day-continue': '同一天继续',
        'recovery-replaces-recall': '中断后先做重新进入检测',
        'retention-unavailable': '保留率暂不可用',
        'sentence-no-eligible-source': '没有可用句子', 'sentence-deferred-budget': '句子因预算顺延',
        'reading-no-material': '没有阅读材料', 'reading-nothing-scheduled': '今天不排阅读',
        'reading-deferred-budget': '阅读因预算顺延',
        'input-no-material': '没有真实输入材料', 'input-nothing-scheduled': '今天不排输入',
        'output-deferred-budget': '表达因预算顺延',
        'exam-deferred-budget': '考试练习因预算顺延',
        'already-started': '已开始，继续完成', 'task-started': '已开始',
        'critical-task-skipped-by-user': '你跳过了关键记忆任务',
        'flexible-task-skipped': '已跳过（可调整任务）',
        'delayed-within-today': '已延后到今天稍后',
        'task-replaced': '已替换为同等任务', 'replace-unavailable': '暂无等价替代',
        'due-now': '已到期', 'overdue': '已过期', 'budget-fit': '与预算匹配',
        'weak-first': '弱词优先', 'new-word': '今天的新词',
    };
    return map[code] ?? '';
}
function humanReasons(list: string[] | undefined, max = 3): string {
    const out: string[] = [];
    for (const raw of list ?? []) {
        const text = humanReason(raw);
        if (text && !out.includes(text))
            out.push(text);
        if (out.length >= max)
            break;
    }
    return out.join(' · ');
}
function metric(label: string, value: string, note: string) { return `<div class="metric"><span>${label}</span><strong>${value}</strong><small>${note}</small></div>`; }
function metricNum(label: string, value: number, note: string, key: string) { return `<div class="metric"><span>${label}</span><strong data-odometer="${value}" data-odometer-key="${key}">${value}</strong><small>${note}</small></div>`; }
function rangeControls() { return `<div class="range-controls"><label>学习范围<select id="range-book"><option value="">全部词书</option>${data.books.map(b => `<option value="${b.id}" ${bookFilter === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></label><label>本轮词量<select id="range-count">${[50, 100, 300, 500, 1000].map(n => `<option value="${n}" ${n === 100 ? 'selected' : ''}>${n} 词</option>`).join('')}</select></label><label>测试方向<select id="range-ratio">${![0, 30, 50, 70, 100].includes(data.settings.ratio) ? `<option value="${data.settings.ratio}" selected>英→中 ${data.settings.ratio}%（自定义）</option>` : ''}<option value="50" ${data.settings.ratio === 50 ? 'selected' : ''}>双向各 50%</option><option value="70" ${data.settings.ratio === 70 ? 'selected' : ''}>英→中 70%</option><option value="30" ${data.settings.ratio === 30 ? 'selected' : ''}>中→英 70%</option><option value="100" ${data.settings.ratio === 100 ? 'selected' : ''}>识别 · 英→中</option><option value="0" ${data.settings.ratio === 0 ? 'selected' : ''}>提取 · 中→英</option></select></label></div>`; }
function home() {
    const s = summary(data), unfinished = data.sessions.find(x => !x.ended);
    if (PROTO) {
        protoHome(s);
        return;
    }
    $('#main').innerHTML = `<div class="today">
  ${todayHero(s)}
  ${todaySection()}
  <div class="metrics" data-stagger>
    ${metricNum('今日作答', s.today.attempts, '覆盖 ' + s.today.unique + ' 个单词', 'today-attempts')}
    ${metric('今日正确率', s.today.attempts ? pct(s.today.accuracy) : '—', '英中双向检索')}
    ${metric('平均反应', s.today.attempts ? seconds(s.today.meanMs) : '—', '从题目出现到提交')}
    ${metricNum('有效掌握', s.effective, '双向 · 多次间隔验证', 'effective-mastery')}
  </div>
  ${unfinished ? `<div class="resume"><span>有一轮未完成的训练 · 已答 ${unfinished.answered} 题</span><button id="resume" class="primary">继续本轮</button><button id="finish-old" class="text-button">结束本轮</button></div>` : ''}
  <section class="panel practice">
    <div class="section-title"><h2>自己再练一轮</h2><span class="subtle">${data.words.length} 个词 · ${data.books.length} 本词书</span></div>
    ${rangeControls()}
    <div class="modes" data-stagger>
      <button class="mode featured" data-mode="quick"><span class="mode-symbol" aria-hidden="true">↗</span><h3>快速刷词</h3><p>大量扫描，找出不熟的词</p><span class="mode-bottom">开始检索 <b>→</b></span></button>
      <button class="mode" data-mode="due"><span class="mode-symbol" aria-hidden="true">◷</span><h3>今日复习 <em>${s.due}</em></h3><p>优先处理已到期的记忆</p><span class="mode-bottom">巩固记忆 <b>→</b></span></button>
      <button class="mode" data-mode="weak"><span class="mode-symbol" aria-hidden="true">◎</span><h3>弱词强化 <em>${s.weak}</em></h3><p>集中攻克不会和模糊词</p><span class="mode-bottom">开始强化 <b>→</b></span></button>
      <button class="mode" data-mode="random"><span class="mode-symbol" aria-hidden="true">⤨</span><h3>随机抽查</h3><p>检验学过的词是否还记得</p><span class="mode-bottom">抽查记忆 <b>→</b></span></button>
    </div>
  </section>
  ${newWordsPanel()}
  <div class="two-col">
    <section class="panel"><div class="section-title"><h2>记忆分布</h2><span class="subtle">全部词库</span></div>${distribution()}<p class="hint">“熟练”需要双向和间隔测试证据。短时间反复答对不会直接计入长期掌握。</p></section>
    <section class="panel"><div class="section-title"><h2>今日弱词变化</h2></div><div class="weak-change"><div><strong>${s.newWeak}</strong><span>新增弱词</span></div><div><strong class="green">${s.resolved}</strong><span>今天修好的</span></div></div><p class="hint">弱词来自真实错误与“模糊”自评；修好需要后续再答对。</p></section>
  </div>
</div>`;
    on('#import', 'click', importDialog);
    bindPlan();
    on('#hero-adjust', 'click', planAdjustDialog);
    on('#template', 'click', () => download(new Blob(['\ufeff英文,中文,词性\nabandon,放弃,v.\nadequate,充足的,adj.\nreluctant,不情愿的,adj.\nreliable,可靠的,adj.\nmaintain,维持,v.\nobvious,明显的,adj.']), '词书格式示例.csv'));
    on('#resume', 'click', () => startSession(unfinished!));
    on('#finish-old', 'click', async () => { unfinished!.ended = Date.now(); await putItems('sessions', [unfinished]); render(); });
    on('#preview-start', 'click', () => startPreview());
    on('#reflow-start', 'click', () => startReflow());
    document.querySelectorAll<HTMLElement>('[data-mode]').forEach(b => b.onclick = () => { startMode(b.dataset.mode!).catch(e => toast(e.message)); });
}
/** 今日 Hero：整页只有一个主角任务，其余信息退到清单里。 */
function todayHero(s: ReturnType<typeof summary>): string {
    const plan = todayPlan;
    const next = plan ? nextOpenTask(plan) : null;
    const progress = plan ? planProgress(plan) : null;
    const done = !!plan && !next;
    const headline = done ? '今天的任务已经做完。' : plan ? `今天还剩 ${progress!.remainingMinutes} 分钟。` : '先给今天留一段时间。';
    const sub = done
        ? '证据都保留着：明天的隔夜检测会告诉你真正留下了多少。'
        : next
            ? `先做这一项的原因：${esc(humanReasons(next.reason) || '按真实到期与保留率安排')}。`
            : '选一个今天真实能用的时间。计划只在预算内安排拿得到证据的任务。';
    const label = next ? esc(next.label ?? TASK_LABELS[next.kind ?? ''] ?? next.kind ?? '下一项') : '';
    const body = next
        ? `<div class="hero-next is-enter"><div class="next-copy"><span class="next-meta">下一项 · ${esc(moduleName(taskModule(next)))} · ${next.minutes} 分钟</span><b class="next-title">${label}</b><span class="next-note">${esc(taskTargetLabel(next))}</span></div><button id="start-today" class="primary hero-start">${next.status === 'started' ? '继续这一项' : '开始今天的训练'}</button></div>`
        : done
            ? `<div class="hero-next is-done"><div class="next-copy"><b class="next-title">今天的计划已完成 ${progress!.done}/${progress!.total}</b><span class="next-note">已完成的任务与证据都保留；跳过 / 替换不会冒充学习证据。</span></div><button id="hero-adjust" class="text-button">调整明天</button></div>`
            : `<div class="hero-next is-empty"><div class="next-copy"><b class="next-title">还没有今天的计划</b><span class="next-note">在下面选好预算与状态，生成后这里会显示下一项。</span></div></div>`;
    return `<section class="today-hero${done ? ' is-complete' : ''}" data-specular>
  <div class="today-hero-core">
    <div class="hero-top">
      <div class="hero-copy">
        <h1 class="hero-title">${headline}</h1>
        <p class="hero-sub">${sub}</p>
      </div>
      <button id="import" class="hero-quiet">＋ 导入词书</button>
    </div>
    ${body}
  </div>
</section>`;
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
    on('#back-home', 'click', () => backToToday('#main .preview-card, #main .quiz-card, #main .reader-main, #main .exam-card, #main .lab-card, #main > *'));
}

/** 学习页 → Today：反向共享元素转场（非 15d 界面时直接切页）。 */
function backToToday(from: string): void {
    const run = (): void => { setPage('home'); };
    if (document.documentElement.dataset.proto === 'd')
        void morphNavigate({ from, target: '[data-morph-dest="today"]', run, mode: 'reverse' });
    else
        run();
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
    if (taskExecution) {
        taskExecution.sessionId = s.id;
        s.planTaskId = taskExecution.planTaskId;
        await putItems('sessions', [s]);
    }
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
        on('#quit', 'click', () => backToToday('.quiz-card'));
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
    document.querySelectorAll<HTMLButtonElement>('.answer').forEach(b => { b.disabled = true; b.classList.toggle('correct', b.dataset.answer === w.id); b.classList.toggle('is-correct', b.dataset.answer === w.id); b.classList.toggle('wrong', b.dataset.answer === selectedId); b.classList.toggle('is-wrong', b.dataset.answer === selectedId); });
    $('#unknown').setAttribute('disabled', '');
    $('#feedback').innerHTML = `<div class="answer-feedback bad" role="status"><div class="feedback-copy"><strong>${esc(w.en)} · ${esc(w.zh)}</strong><span>${reason === 'timeout' ? '超时未答' : reason === 'unknown' ? '标记为不知道，已加入复习' : '已记录错词'} · ${seconds(result.record.ms)}</span></div><button id="next" class="primary">下一题 <kbd>Enter</kbd></button></div>`;
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
function showResults(s: StudySession) {
    stopTimer();
    page = 'results';
    if (taskExecution && taskExecution.sessionId === s.id) {
        const exec = taskExecution;
        taskExecution = null;
        void completePlanTask(exec, Math.max(0.5, Math.round((Date.now() - exec.startedAt) / 30000) / 2));
    }
    else if (s.planTaskId) {
        // 刷新后恢复的会话：仍然把同一领域证据回写到原计划任务。
        const planTask = todayPlan?.initialPlan.find(t => t.id === s.planTaskId);
        if (planTask)
            void completePlanTask({ planTaskId: planTask.id, kind: planTask.kind ?? s.mode, startedAt: planTask.startedAt ?? s.started, sessionId: s.id }, Math.max(0.5, Math.round((Date.now() - s.started) / 30000) / 2));
    }
    const rs = data.records.filter(r => r.sessionId === s.id);
    const st = recordStats(rs);
    const ids = new Set(rs.map(r => r.wordId));
    const ws = data.words.filter(w => ids.has(w.id));
    active = null;
    $('#main').innerHTML = title('SESSION COMPLETE', '这一轮，记住了多少？', '薄弱词已记录，并安排了下一次复习。') + `<div class="metrics">${metric('本轮作答', String(st.attempts), '含本轮强化重复')}${metric('正确率', pct(st.accuracy), st.unique + ' 个不同单词')}${metric('平均反应', seconds(st.meanMs), '有效作答时间')}${metric('待强化', String(ws.filter(isWeak).length), '按本轮结束后的状态')}</div><div class="actions"><button class="primary" id="review-round">重测本轮弱词</button><button class="secondary" id="round-export">导出本轮弱词</button><button class="secondary" id="back-home">返回首页</button></div><div class="two-col">${(['unknown', 'vague'] as Mastery[]).map(l => `<section class="panel"><h2>${labels[l]}</h2>${wordChips(ws.filter(w => w.state.level === l))}</section>`).join('')}</div><details class="panel"><summary>正常与熟练 · ${ws.filter(w => !isWeak(w)).length} 词</summary>${wordChips(ws.filter(w => !isWeak(w)))}</details>`;
    on('#review-round', 'click', () => startMode('weak', ws.filter(isWeak)));
    on('#round-export', 'click', () => download(exportWords(ws.filter(isWeak), 'csv'), '本轮弱词.csv'));
    on('#back-home', 'click', () => setPage('home'));
    bindDetails();
}
function wordChips(ws: Word[]) { return ws.length ? `<div class="chips">${ws.map(w => `<button data-detail="${w.id}">${esc(w.en)}</button>`).join('')}</div>` : '<p class="subtle">没有这一类单词</p>'; }
function filtered(weak: boolean) { let ws = data.words.filter(w => (!weak || isWeak(w)) && (!bookFilter || w.bookId === bookFilter) && (!levelFilter || w.state.level === levelFilter) && (!search || `${w.en} ${w.zh} ${w.tags}`.toLowerCase().includes(search.toLowerCase()))); return ws.sort(sort === 'alpha' ? (a, b) => a.en.localeCompare(b.en) : sort === 'due' ? (a, b) => effectiveDue(a, data.settings.schedulingAuthority) - effectiveDue(b, data.settings.schedulingAuthority) : (a, b) => priority(b) - priority(a)); }
function library(weak: boolean) {
    // 15h 复核 P0：薄弱词与词库曾共用同一模板（只换标题），用户切了侧栏却得到同一张屏，
    // 本页唯一意图（复习弱词）被降级成工具栏第三个次要按钮，最亮的却是无关的"导入"。
    // 这里给薄弱词一条自己的首屏：一个复习启动器 + 唯一的金属主行动；导入降级到工具栏。
    const weakWords = weak ? filtered(true) : [];
    const launcher = weak
        ? `<section class="panel review-launcher">
  <div class="review-launcher-copy">
    <span class="review-kicker">这一页只做一件事</span>
    <strong>${weakWords.length ? `${weakWords.length} 个词等着再练一次` : '还没有需要强化的词'}</strong>
    <span class="subtle">${weakWords.length ? '按当前优先级排序；答错的词会立刻回到本轮队列。' : '先在词库里记录几次真实作答，薄弱词会自己出现。'}</span>
  </div>
  ${weakWords.length
            ? '<button id="review-start" class="primary">开始复习</button>'
            : '<button id="import-weak" class="primary">导入词书</button>'}
</section>`
        : '';
    $('#main').innerHTML = title(weak ? 'FOCUSED REVIEW' : 'YOUR WORDBOOKS', weak ? '把薄弱的地方练扎实' : '你的词库', weak ? '不会和模糊词，按当前复习优先级排列。' : '导入你要学的词，所有记录留在这台设备。', weak ? '' : `<button id="import" class="primary">＋ 导入词书</button>`) + launcher + `${weak ? `<details class="weak-ledger"><summary>查看这 ${weakWords.length} 个词的明细</summary><div class="weak-ledger-body">` : ''}<div class="book-tabs"><button data-book="" class="${!bookFilter ? 'selected' : ''}">全部词书</button>${data.books.map(b => `<button data-book="${b.id}" class="${bookFilter === b.id ? 'selected' : ''}">${esc(b.name)} <small>${data.words.filter(w => w.bookId === b.id).length}</small></button>`).join('')}</div><div class="toolbar"><input id="search" placeholder="搜索单词、释义或标签" aria-label="搜索词库" value="${esc(search)}"><select id="level" aria-label="掌握筛选"><option value="">全部状态</option>${Object.entries(labels).filter(([k]) => !weak || k === 'unknown' || k === 'vague').map(([k, v]) => `<option value="${k}" ${k === levelFilter ? 'selected' : ''}>${v}</option>`).join('')}</select><select id="sort" aria-label="排序"><option value="priority" ${sort === 'priority' ? 'selected' : ''}>优先级排序</option><option value="alpha" ${sort === 'alpha' ? 'selected' : ''}>字母排序</option><option value="due" ${sort === 'due' ? 'selected' : ''}>复习时间排序</option></select><span class="toolbar-actions">${weak ? '<button id="import" class="secondary">导入词书</button>' : ''}<button id="train-filter" class="secondary">训练这批</button><button id="export-filter" class="secondary">导出</button><button id="preview-lib" class="secondary">预览新词</button></span>${bookFilter ? '<button id="rename-book" class="text-button">重命名</button><button id="delete-book" class="danger-text">删除词书</button>' : ''}</div><section class="panel no-padding" id="word-table"></section>${weak ? '</div></details>' : ''}`;
    drawTable(weak);
    on('#import', 'click', importDialog);
    on('#review-start', 'click', () => startMode('weak', filtered(true).slice(0, 1000)));
    on('#import-weak', 'click', importDialog);
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
function drawTable(weak: boolean) { const ws = filtered(weak), pages = Math.max(1, Math.ceil(ws.length / 50)); listPage = Math.min(listPage, pages - 1); $('#word-table').innerHTML = `<div class="table-scroll"><table><thead><tr><th>单词 / 释义</th><th>掌握状态</th><th>优先级</th><th>正确 / 作答</th><th>平均反应</th><th>下次复习</th></tr></thead><tbody>${ws.slice(listPage * 50, listPage * 50 + 50).map(w => `<tr><td><button class="word-link" data-detail="${w.id}">${esc(w.en)}</button><small>${esc(w.zh)}</small></td><td><span class="badge ${w.state.level}">${labels[w.state.level]}</span> <small class="lifecycle">${LIFECYCLE_LABELS[lifecycleOf(w)]}</small></td><td><b class="priority-${priorityGrade(w)}">${priorityGrade(w)}</b></td><td>${w.state.correct} / ${w.state.total}</td><td>${w.state.total ? seconds(w.state.meanMs) : '—'}</td><td>${w.state.total ? (effectiveDue(w, data.settings.schedulingAuthority) <= Date.now() ? '<span class="due-text">已到期</span>' : date(effectiveDue(w, data.settings.schedulingAuthority))) : '未测试'}</td></tr>`).join('') || `<tr><td colspan="6" class="empty-cell"><div class="empty-state"><strong>没有符合条件的单词</strong><span>导入词书，或把搜索与筛选清空再看一遍。</span><div class="actions"><button id="empty-import" class="primary">导入词书</button><button id="empty-clear" class="secondary">清除筛选</button></div></div></td></tr>`}</tbody></table></div><div class="pagination"><span>共 ${ws.length} 个词 · 每页 50 个</span><div><button id="prev" ${listPage === 0 ? 'disabled' : ''}>上一页</button><span>${listPage + 1} / ${pages}</span><button id="next-page" ${listPage === pages - 1 ? 'disabled' : ''}>下一页</button></div></div>`; on('#prev', 'click', () => { listPage--; drawTable(weak); }); on('#next-page', 'click', () => { listPage++; drawTable(weak); }); bindDetails();
 on('#empty-import', 'click', importDialog);
 on('#empty-clear', 'click', () => { search = ''; bookFilter = ''; levelFilter = ''; listPage = 0; drawTable(weak); });
 }
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
// ===== Phase 9：Output Lab（逻辑在 output*.ts，这里只做绑定）=====
let outputAttemptId: string | null = null;
let outputSelectedType = null as import('./types.ts').OutputTaskType | null;
let outputTopicDraft = '';
let outputHintLevel = null as import('./types.ts').OutputSupportLevel | null;
let outputHintCache: ReturnType<typeof buildSupportHint> | null = null;
// ===== Phase 10：学情诊断 =====
let diagDays = 7;
let diagSource: 'live' | 'snapshot' | 'weekly' = 'live';
let diagSnapshotId: string | null = null;
let diagWeeklyId: string | null = null;
let diagBusy = false;
let outputMessage = '';
let outputSaveTimer: ReturnType<typeof setTimeout> | undefined;
let outputCandidates: ReturnType<typeof selectOutputTasks>['candidates'] = [];
let outputHandoffSeed: {
    text: string;
    task: import('./types.ts').OutputTaskSpec;
    inputSessionId: string | null;
} | null = null;
function outputMinutesNow(): number {
    return Math.max(5, Math.min(60, todayPlan?.availableMinutes ?? planBudget ?? 20));
}
function outputHandoffs(): HandoffCard[] {
    const cards: HandoffCard[] = [];
    const pendingInput = [...data.inputSessions]
        .filter(s => s.status === 'completed' && (s.reflection?.summary || s.reflection?.retelling || s.reflection?.mainIdea))
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0];
    if (pendingInput) {
        const h = handoutFromInput(data, pendingInput.id);
        if (h.ok)
            cards.push({ kind: 'input', id: pendingInput.id, label: `真实输入：${h.value.meta.sourceLabel || pendingInput.title}`, preview: h.value.text, taskType: 'short_summary' });
    }
    const reading = [...data.readingSessions].sort((a, b) => (b.at ?? 0) - (a.at ?? 0))[0];
    if (reading) {
        const p = data.passages.find(x => x.id === reading.passageId);
        if (p)
            cards.push({ kind: 'reading', id: reading.id, label: `阅读：${p.title}`, preview: '用一句或三句话概括这篇文章的意思', taskType: 'short_summary' });
    }
    const unit = data.miniUnits.find(u => u.status === 'active');
    if (unit)
        cards.push({ kind: 'unit', id: unit.id, label: `主题单元 Day ${unit.dayIndex}：${unit.theme}`, preview: '用英语复述新材料，并说出你的理解', taskType: unit.dayIndex >= 3 ? 'retelling' : 'one_sentence' });
    return cards;
}
function outputPageApp(): void {
    if (outputAttemptId) {
        const attempt = data.outputAttempts.find(a => a.id === outputAttemptId);
        if (attempt) {
            const cmp = attempt.revisions?.length ? compareRevision(attempt.originalText, attempt.finalText || attempt.revisionText || '', attempt.feedback ?? null) : null;
            const transfer = attempt.status === 'completed' && attempt.task ? buildOutputTransfer(attempt.task, { now: Date.now(), seed: attempt.id }) : null;
            $('#main').innerHTML = outputSessionPage({
                attempt,
                hint: outputHintLevel && outputHintCache ? { level: outputHintLevel, title: outputHintCache.title, content: outputHintCache.content } : null,
                message: outputMessage,
                compare: cmp,
                transfer,
                saving: false,
            });
            bindOutputSession(attempt);
            return;
        }
        outputAttemptId = null;
    }
    const sel = selectOutputTasks({ data, now: Date.now(), availableMinutes: outputMinutesNow(), energy: planEnergy, preferredType: outputSelectedType, topic: outputTopicDraft });
    outputCandidates = sel.candidates;
    const analytics = outputAnalytics(data);
    $('#main').innerHTML = outputHubPage({
        data, suggestion: sel.task, candidates: sel.candidates, note: sel.note,
        handoffs: outputHandoffs(), analytics,
        selectedType: outputSelectedType, topicDraft: outputTopicDraft,
        minutes: outputMinutesNow(), energy: planEnergy,
    });
    bindOutputHub();
}
function bindOutputHub(): void {
    document.querySelectorAll<HTMLElement>('[data-out-type]').forEach(b => b.onclick = () => {
        const t = b.dataset.outType as import('./types.ts').OutputTaskType;
        outputSelectedType = outputSelectedType === t ? null : t;
        render();
    });
    on('#out-topic', 'change', (e) => { outputTopicDraft = (e.target as HTMLInputElement).value; render(); });
    on('#out-use-suggestion', 'click', () => {
        if (outputCandidates[0])
            void startOutputTask(outputCandidates[0]);
    });
    document.querySelectorAll<HTMLElement>('[data-out-start]').forEach(b => b.onclick = () => {
        const t = outputCandidates.find(x => x.id === b.dataset.outStart);
        if (t)
            void startOutputTask(t);
    });
    document.querySelectorAll<HTMLElement>('[data-out-open]').forEach(b => b.onclick = () => {
        outputAttemptId = b.dataset.outOpen ?? null;
        outputHintLevel = null;
        outputMessage = '';
        render();
    });
    document.querySelectorAll<HTMLElement>('[data-out-handoff]').forEach(b => b.onclick = () => {
        const [kind, id] = (b.dataset.outHandoff ?? '').split(':');
        if (kind === 'input') {
            const h = handoutFromInput(data, id!);
            if (!h.ok) {
                toast(h.message);
                return;
            }
            outputHandoffSeed = { text: h.value.text, task: h.value.task, inputSessionId: id! };
            void startOutputTask(h.value.task, h.value.text, id!);
        }
        else if (kind === 'reading') {
            const r = data.readingSessions.find(x => x.id === id);
            const p = r ? data.passages.find(x => x.id === r.passageId) : null;
            const task = { id: `otask_reading_${id}`, taskType: 'short_summary' as const, topic: p?.topic || p?.title || 'the article', communicationGoal: '用 3–5 句英语概括这篇文章，并说出一个你的看法', sourceType: 'reading' as const, sourceId: id!, sourceLabel: p?.title ?? '阅读', targetWords: [], targetGrammar: [], expectedMinutes: 12, difficultyEstimate: 0.45, minWords: 25, maxWords: 90, reasons: [`最近读过：${p?.title ?? id}`], interestOnly: true, createdAt: Date.now() };
            void startOutputTask(task, '', null, id!);
        }
        else if (kind === 'unit') {
            const cand = selectOutputTasks({ data, now: Date.now(), availableMinutes: outputMinutesNow(), energy: planEnergy }).candidates.find(x => x.sourceType === 'mini_unit');
            if (cand)
                void startOutputTask(cand, '', null, null, kind === 'unit' ? id! : null);
        }
    });
}
async function startOutputTask(task: import('./types.ts').OutputTaskSpec, initialDraft = '', inputSessionId: string | null = null, readingSessionId: string | null = null, miniUnitId: string | null = null, planTaskId: string | null = null): Promise<void> {
    const linkedUnit = miniUnitId ?? (task.sourceType === 'mini_unit' ? task.sourceId : null);
    if (planTaskId)
        outputPlanTaskId = planTaskId;
    const created = await createOutputAttempt({ task, initialDraft, inputSessionId, readingSessionId, miniUnitId: linkedUnit, dailyPlanTaskId: planTaskId, sourceProvenance: initialDraft ? 'user_text+input_summary' : 'user_text' });
    if (!created.ok) {
        toast(created.message);
        return;
    }
    outputAttemptId = created.value.id;
    outputHintLevel = null;
    outputHintCache = null;
    outputMessage = '';
    await unitRefresh();
}
function outputMaterial(attempt: import('./types.ts').OutputAttempt): string {
    if (attempt.readingSessionId) {
        const r = data.readingSessions.find(x => x.id === attempt.readingSessionId);
        return r ? (data.passages.find(p => p.id === r.passageId)?.text.slice(0, 2500) ?? '') : '';
    }
    if (attempt.inputSessionId) {
        const sess = data.inputSessions.find(x => x.id === attempt.inputSessionId);
        if (!sess)
            return '';
        const src = data.inputSources.find(x => x.id === sess.sourceId);
        const ref = sess.transcriptRef ?? src?.transcriptRef ?? '';
        return ref ? transcriptText(data, ref).slice(0, 2500) : '';
    }
    return '';
}
function bindOutputSession(attempt: import('./types.ts').OutputAttempt): void {
    const editor = document.querySelector<HTMLTextAreaElement>('#out-editor');
    const rev = document.querySelector<HTMLTextAreaElement>('#out-revision');
    const flush = async () => {
        if (!editor || attempt.status === 'completed')
            return;
        const text = editor.value;
        const r = await saveDraft(attempt.id, attempt.revision, text);
        if (r.ok) {
            outputMessage = '';
            data = await loadData();
        }
        else
            outputMessage = r.message;
    };
    if (editor) {
        editor.oninput = () => {
            const c = document.querySelector('#out-count');
            if (c)
                c.textContent = `${outputWords(editor.value)} words`;
            const st = document.querySelector('#out-save-state');
            if (st)
                st.textContent = '保存中…';
            if (outputSaveTimer)
                clearTimeout(outputSaveTimer);
            outputSaveTimer = setTimeout(async () => {
                await flush();
                const s2 = document.querySelector('#out-save-state');
                if (s2)
                    s2.textContent = '已保存到本地';
            }, 600);
        };
    }
    document.querySelectorAll<HTMLElement>('[data-out-support]').forEach(b => b.onclick = () => {
        const level = Number(b.dataset.outSupport) as import('./types.ts').OutputSupportLevel;
        outputHintLevel = level;
        outputHintCache = buildSupportHint(attempt.task!, level);
        attempt.support = recordSupport(attempt.support ?? emptySupport(editor?.value ?? ''), outputHintCache, editor?.value ?? '');
        attempt.supportLevel = level;
        render();
    });
    on('#out-submit', 'click', async () => {
        if (outputSaveTimer)
            clearTimeout(outputSaveTimer);
        await flush();
        const text = editor?.value ?? '';
        const supportLevel = (outputHintLevel ?? 0) as import('./types.ts').OutputSupportLevel;
        // 自动保存会推进 revision；提交必须使用最新记录，否则会把用户自己的保存误判成并发冲突。
        const latest = (await loadData()).outputAttempts.find(a => a.id === attempt.id);
        if (!latest) {
            toast('找不到这条表达记录');
            return;
        }
        const r = await submitOutputAttempt(attempt.id, latest.revision, text, {
            supportLevel,
            support: attempt.support ?? emptySupport(text),
            hintsUsed: attempt.support?.requestedHints ?? [],
        });
        if (!r.ok) {
            toast(r.message);
            return;
        }
        const meaning = document.querySelector<HTMLInputElement>('#out-repair-meaning')?.value ?? '';
        const blocked = document.querySelector<HTMLInputElement>('#out-repair-blocked')?.value ?? '';
        if (attempt.task?.taskType === 'repair' && meaning.trim()) {
            const ev = evaluateRepair({ intendedMeaning: meaning, blockedExpression: blocked, userAlternative: text, basis: 'self_reported', targetWord: attempt.targetWords?.[0] ?? null, supportLevel, now: Date.now(), source: 'user' });
            await attachRepair(attempt.id, r.value.revision, ev.record);
        }
        outputMessage = '已保存初稿。可以先自己检查，或请求语言反馈。';
        await unitRefresh();
    });
    on('#out-feedback', 'click', async () => {
        const fresh = data.outputAttempts.find(a => a.id === attempt.id);
        if (!fresh)
            return;
        const r = await requestOutputFeedback(attempt.id, fresh.revision, {
            data,
            materialText: outputMaterial(fresh),
            grammarConceptIds: data.grammarConcepts.map(c => c.id),
            targetWordIds: (fresh.targetWords ?? []).map(en => data.words.find(w => w.en.toLowerCase() === en.toLowerCase())?.id).filter((x): x is string => !!x),
        });
        if (!r.ok) {
            toast(r.message);
            return;
        }
        outputMessage = r.value.message;
        await unitRefresh();
    });
    on('#out-revise', 'click', async () => {
        const fresh = data.outputAttempts.find(a => a.id === attempt.id);
        if (!fresh || !rev)
            return;
        const r = await reviseOutput(attempt.id, fresh.revision, rev.value, { suggestion: fresh.feedback?.upgrade?.suggested ?? null, supportLevel: (outputHintLevel ?? 0) as import('./types.ts').OutputSupportLevel });
        if (!r.ok) {
            toast(r.message);
            return;
        }
        outputMessage = '修改已保存。';
        await unitRefresh();
    });
    on('#out-finish', 'click', async () => {
        const fresh = data.outputAttempts.find(a => a.id === attempt.id);
        if (!fresh)
            return;
        const planTaskId = fresh.dailyPlanTaskId ?? outputPlanTaskId;
        const r = await finishOutput(attempt.id, fresh.revision, data);
        if (!r.ok) {
            toast(r.message);
            return;
        }
        outputMessage = '这次表达已完成。证据按独立性记录；照抄或完整示范不会算作独立掌握。';
        if (planTaskId) {
            const planTask = todayPlan?.initialPlan.find(t => t.id === planTaskId);
            outputPlanTaskId = null;
            await completePlanTask({
                planTaskId,
                kind: planTask?.kind ?? 'output-task',
                startedAt: planTask?.startedAt ?? fresh.createdAt,
                sessionId: attempt.id,
            }, Math.max(0.5, planTask?.minutes ?? Math.round((Date.now() - fresh.createdAt) / 60000)));
        }
        await unitRefresh();
    });
    on('#out-back', 'click', () => { outputAttemptId = null; outputHintLevel = null; outputMessage = ''; render(); });
    document.querySelectorAll<HTMLElement>('[data-out-transfer-start]').forEach(b => b.onclick = () => {
        const t = buildOutputTransfer(attempt.task!, { now: Date.now(), seed: attempt.id }).task;
        void createOutputAttempt({ task: t, transferOf: attempt.id, sourceProvenance: 'user_text' }).then(async (r) => {
            if (!r.ok) {
                toast(r.message);
                return;
            }
            outputAttemptId = r.value.id;
            outputHintLevel = null;
            outputMessage = '迁移任务：换一个语境，不看上次答案再表达一次。';
            await unitRefresh();
        });
    });
}
// ===== Phase 8：Real Input Hub（逻辑在 input*.ts，这里只做绑定）=====
let inputSessionId: string | null = null;
let inputModeDraft: InputMode | null = null;
let inputFilterState = { search: '', status: 'all', captions: 'any', contentType: 'all' };
function inputEnergy(): 'low' | 'normal' | 'good' {
    return (todayPlan?.energyState as 'low' | 'normal' | 'good' | undefined) ?? 'normal';
}
function inputBudgetMinutes(): number {
    return Math.max(5, Math.min(240, todayPlan?.availableMinutes ?? planBudget ?? 30));
}
function inputSourceById(id: string | null | undefined) {
    return id ? data.inputSources.find(s => s.id === id) : undefined;
}
function inputSessionById(id: string | null) {
    return id ? data.inputSessions.find(s => s.id === id) : undefined;
}
function inputUnfinished() {
    return data.inputSessions
        .filter(s => s.status && s.status !== 'completed' && s.status !== 'abandoned')
        .sort((a, b) => (b.startedAt ?? b.createdAt) - (a.startedAt ?? a.createdAt));
}
function inputRecent() {
    return data.inputSessions
        .filter(s => s.status === 'completed')
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
}
function diagnosticsPageApp(): void {
    const now = Date.now();
    let payload;
    let source: 'live' | 'snapshot' | 'weekly' = diagSource;
    let generatedAt: number | null = null;
    let weekly: import('./types.ts').WeeklyDiagnostic | undefined;
    if (diagSource === 'snapshot') {
        const snap = data.skillSnapshots.find(s => s.id === diagSnapshotId);
        if (snap?.diagnostics) {
            payload = snap.diagnostics;
            generatedAt = snap.createdAt;
        }
        else {
            source = 'live';
            payload = buildDiagnostics(data, { now, days: diagDays, previous: latestSnapshot(data.skillSnapshots) });
        }
    }
    else if (diagSource === 'weekly') {
        weekly = data.weeklyDiagnostics.find(w => w.id === diagWeeklyId);
        if (weekly?.diagnostics) {
            payload = weekly.diagnostics;
            generatedAt = weekly.createdAt;
        }
        else {
            source = 'live';
            payload = buildDiagnostics(data, { now, days: diagDays, previous: latestSnapshot(data.skillSnapshots) });
        }
    }
    else {
        payload = buildDiagnostics(data, { now, days: diagDays, previous: latestSnapshot(data.skillSnapshots) });
    }
    $('#main').innerHTML = diagnosticsPage({ data, payload, days: diagDays, generatedAt, source, weekly });
    bindDiagnostics();
}
function bindDiagnostics(): void {
    on('#diag-days', 'change', (e) => {
        diagDays = Number((e.target as HTMLSelectElement).value) || 7;
        diagSource = 'live';
        render();
    });
    on('#diag-snapshot', 'click', async () => {
        if (diagBusy)
            return;
        diagBusy = true;
        try {
            const snap = await generateSnapshot(data, Date.now(), diagDays);
            data = await loadData();
            reindex();
            diagSource = 'live';
            toast(`已保存 ${snap.date} 的诊断快照`);
            render();
        }
        catch (err) {
            toast(err instanceof Error ? err.message : '快照保存失败');
        }
        finally {
            diagBusy = false;
        }
    });
    on('#diag-week', 'click', async () => {
        if (diagBusy)
            return;
        diagBusy = true;
        try {
            const week = await generateWeekly(data, Date.now(), diagDays);
            data = await loadData();
            reindex();
            diagSource = 'weekly';
            diagWeeklyId = week.id;
            toast(`已生成本周诊断（${week.weekOf}）`);
            render();
        }
        catch (err) {
            toast(err instanceof Error ? err.message : '周诊断生成失败');
        }
        finally {
            diagBusy = false;
        }
    });
    document.querySelectorAll<HTMLElement>('[data-diag-snap]').forEach(b => b.onclick = () => {
        diagSnapshotId = b.dataset.diagSnap!;
        diagSource = 'snapshot';
        render();
    });
    document.querySelectorAll<HTMLElement>('[data-diag-action]').forEach(b => b.onclick = () => {
        const kind = b.dataset.diagAction;
        if (kind === 'open-reading')
            setPage('reading');
        else if (kind === 'open-sentence')
            setPage('sentence');
        else if (kind === 'open-output')
            setPage('output');
        else if (kind === 'open-input')
            setPage('input');
        else
            toast('先积累一些真实记录，再回来看诊断。');
    });
}
function inputPageApp(): void {
    const session = inputSessionById(inputSessionId);
    if (session) {
        const source = inputSourceById(session.sourceId);
        const transcript = data.transcripts.find(t => t.sourceId === session.sourceId && (t.id === (session.transcriptRef ?? source?.transcriptRef) || !session.transcriptRef));
        inputModeDraft = inputModeDraft ?? session.mode;
        $('#main').innerHTML = inputSessionPage({
            data, session, source, transcript,
            candidates: transcript ? sentenceCandidates(transcript, { limit: 6, minWords: 8 }) : [],
            captionCaveat: captionCaveat(session.reflection?.captionMode ?? session.captionMode),
        });
        bindInputSession(session, source, transcript);
        return;
    }
    const now = Date.now();
    const profile = normalizeProfile(data.settings.interests, now);
    const signals = inputActivitySignals(data, now);
    const rec = recommendInputs({
        data, profile, signals, now, availableMinutes: inputBudgetMinutes(), energy: inputEnergy(),
        unitDay: activeUnitInData()?.dayIndex ?? null,
    });
    const library = filterLibrary(data.libraryItems, {
        search: inputFilterState.search,
        status: inputFilterState.status === 'all' ? 'all' : inputFilterState.status as 'saved' | 'used' | 'archived',
        captions: inputFilterState.captions === 'all' ? 'any' : inputFilterState.captions as 'any' | 'has' | 'none' | 'unknown',
        contentType: inputFilterState.contentType,
    }, now);
    $('#main').innerHTML = inputHubPage({
        data, candidates: rec.candidates, note: rec.note, target: rec.target,
        unfinished: inputUnfinished(), recent: inputRecent(), library,
        analytics: inputAnalytics(data, now),
        filter: inputFilterState,
        interestLabels: profile.topics.map(t => t.label),
    });
    bindInputHub();
}
function bindInputHub(): void {
    const refresh = () => void unitRefresh();
    on('[data-input-add]', 'click', async () => {
        const url = document.querySelector<HTMLInputElement>('#input-url')?.value ?? '';
        const title = document.querySelector<HTMLInputElement>('#input-title')?.value ?? '';
        const topic = document.querySelector<HTMLInputElement>('#input-topic')?.value ?? '';
        const duration = Number(document.querySelector<HTMLInputElement>('#input-duration')?.value ?? 0);
        const language = document.querySelector<HTMLSelectElement>('#input-language')?.value ?? 'en';
        const contentType = (document.querySelector<HTMLSelectElement>('#input-content-type')?.value ?? '') as never;
        const result = await inputActions.addSource(data, { title, url, topic, durationMinutes: duration, language, contentType });
        if (!result.ok) {
            toast(result.message);
            return;
        }
        toast('已加入 Input Hub。开始输入时会记录真实复盘，不会自动“学会”。');
        await refresh();
    });
    document.querySelectorAll<HTMLElement>('[data-input-start]').forEach(b => b.onclick = async () => {
        const sourceId = b.dataset.inputStart!;
        const mode = suggestMode({ energy: inputEnergy(), unitDay: activeUnitInData()?.dayIndex ?? null });
        const source = inputSourceById(sourceId);
        const minutes = planInputMinutes({ availableMinutes: inputBudgetMinutes(), durationMinutes: source?.durationMinutes ?? 0, mode }).watchMinutes;
        const started = await inputActions.startInputAction(data, { sourceId, mode, minutes, miniUnitId: activeUnitInData()?.id ?? null });
        if (!started.ok) {
            toast(started.message);
            return;
        }
        inputSessionId = started.value.id;
        inputModeDraft = started.value.mode;
        await refresh();
    });
    document.querySelectorAll<HTMLElement>('[data-input-open]').forEach(b => b.onclick = async () => {
        inputSessionId = b.dataset.inputOpen!;
        inputModeDraft = null;
        render();
    });
    document.querySelectorAll<HTMLElement>('[data-input-library]').forEach(b => b.onclick = async () => {
        const result = await inputActions.saveLibraryAction(data, b.dataset.inputLibrary!);
        toast(result.ok ? '已收藏到 Library（收藏不等于看完）' : result.message);
        await refresh();
    });
    document.querySelectorAll<HTMLElement>('[data-library-source]').forEach(b => b.onclick = async () => {
        const sourceId = b.dataset.librarySource;
        if (!sourceId)
            return;
        const mode = suggestMode({ energy: inputEnergy(), unitDay: activeUnitInData()?.dayIndex ?? null });
        const source = inputSourceById(sourceId);
        const minutes = planInputMinutes({ availableMinutes: inputBudgetMinutes(), durationMinutes: source?.durationMinutes ?? 0, mode }).watchMinutes;
        const started = await inputActions.startInputAction(data, { sourceId, mode, minutes, miniUnitId: activeUnitInData()?.id ?? null });
        if (!started.ok) {
            toast(started.message);
            return;
        }
        inputSessionId = started.value.id;
        inputModeDraft = started.value.mode;
        await refresh();
    });
    document.querySelectorAll<HTMLElement>('[data-library-archive]').forEach(b => b.onclick = async () => {
        const result = await inputActions.archiveLibraryAction(data, b.dataset.libraryArchive!);
        toast(result.ok ? '已归档（材料与学习记录都保留）' : result.message);
        await refresh();
    });
    document.querySelectorAll<HTMLElement>('[data-library-delete]').forEach(b => b.onclick = async () => {
        if (!confirm('从 Library 删除这条收藏？材料本身与已有学习记录不会被删除。'))
            return;
        await inputActions.deleteLibraryAction(b.dataset.libraryDelete!);
        await refresh();
    });
    on('#input-search', 'input', e => {
        inputFilterState.search = (e.target as HTMLInputElement).value;
        render();
    });
    on('#input-status', 'change', e => {
        inputFilterState.status = (e.target as HTMLSelectElement).value;
        render();
    });
    on('#input-captions', 'change', e => {
        inputFilterState.captions = (e.target as HTMLSelectElement).value;
        render();
    });
    on('#input-type', 'change', e => {
        inputFilterState.contentType = (e.target as HTMLSelectElement).value;
        render();
    });
    on('[data-input-goto-interest]', 'click', () => setPage('unit'));
}
function bindInputSession(session: NonNullable<ReturnType<typeof inputSessionById>>, source: ReturnType<typeof inputSourceById>, transcript: ReturnType<typeof data.transcripts.find>): void {
    const refresh = () => void unitRefresh();
    const rev = () => inputSessionById(session.id)?.revision ?? session.revision;
    const caption = (id: string) => (document.querySelector<HTMLSelectElement>(id)?.value ?? 'none') as CaptionMode;
    on('[data-input-back]', 'click', () => { inputSessionId = null; inputModeDraft = null; render(); });
    on('[data-input-mark-open]', 'click', async () => {
        const lib = data.libraryItems.find(i => i.sourceId === session.sourceId);
        if (lib)
            await inputActions.markOpenedAction(data, lib.id);
        toast('已记录“打开过”。这不算看完，也不产生任何能力证据。');
        await refresh();
    });
    on('[data-baseline-save]', 'click', async () => {
        const comprehension = Number(document.querySelector<HTMLInputElement>('#baseline-comprehension')?.value ?? 0) / 100;
        const watched = Number(document.querySelector<HTMLInputElement>('#baseline-minutes')?.value ?? 0);
        const blocker = document.querySelector<HTMLInputElement>('#baseline-blocker')?.value ?? '';
        const result = await inputActions.baselineAction(session.id, rev(), { captionMode: caption('#baseline-caption'), comprehension, blocker, watchedMinutes: watched });
        toast(result.ok ? '冷测已记录（这是自报基线，不是能力分数）' : result.message);
        await refresh();
    });
    on('[data-baseline-skip]', 'click', async () => {
        const result = await inputActions.baselineAction(session.id, rev(), { captionMode: 'none', comprehension: null, skipped: true });
        toast(result.ok ? '已跳过冷测，记录为 no_baseline' : result.message);
        await refresh();
    });
    document.querySelectorAll<HTMLElement>('[data-mode]').forEach(b => b.onclick = () => {
        inputModeDraft = b.dataset.mode as InputMode;
        render();
    });
    on('[data-session-pause]', 'click', async () => {
        const r = await inputActions.sessionAction(session.id, rev(), 'pause');
        toast(r.ok ? '已暂停，可以稍后继续' : r.message);
        await refresh();
    });
    on('[data-session-resume]', 'click', async () => {
        const r = await inputActions.sessionAction(session.id, rev(), 'resume');
        toast(r.ok ? '已继续' : r.message);
        await refresh();
    });
    on('[data-session-abandon]', 'click', async () => {
        if (!confirm('放弃这次输入？已填写的复盘不会当作完成证据。'))
            return;
        const r = await inputActions.sessionAction(session.id, rev(), 'abandon');
        toast(r.ok ? '已放弃这次输入' : r.message);
        await refresh();
    });
    on('[data-refl-save]', 'click', async () => {
        const mode = (inputModeDraft ?? session.mode) as InputMode;
        const watchedRaw = document.querySelector<HTMLInputElement>('#refl-watched')?.value ?? '';
        const payload = {
            mode,
            captionMode: caption('#refl-caption'),
            comprehension: Number(document.querySelector<HTMLInputElement>('#refl-comprehension')?.value ?? 0) / 100,
            notes: document.querySelector<HTMLInputElement>('#refl-notes')?.value ?? '',
            difficultyReasons: [...document.querySelectorAll<HTMLInputElement>('[data-reason]:checked')].map(i => i.dataset.reason!),
            reportedWatchedMinutes: watchedRaw ? Number(watchedRaw) : null,
            summary: document.querySelector<HTMLTextAreaElement>('#refl-summary')?.value,
            mainIdea: document.querySelector<HTMLInputElement>('#refl-main')?.value,
            keyPoints: (document.querySelector<HTMLTextAreaElement>('#refl-points')?.value ?? '').split('\n').map(x => x.trim()).filter(Boolean),
            opinion: document.querySelector<HTMLInputElement>('#refl-opinion')?.value,
            retelling: document.querySelector<HTMLTextAreaElement>('#refl-retelling')?.value,
        };
        const r = await inputActions.reflectionAction(session.id, rev(), payload);
        toast(r.ok ? '复盘已保存（原文保留；不做无依据的内容评分）' : r.message);
        await refresh();
    });
    on('[data-session-complete]', 'click', async () => {
        const planTaskId = session.dailyPlanTaskId ?? inputPlanTaskId;
        const r = await inputActions.sessionAction(session.id, rev(), 'complete');
        if (!r.ok) {
            toast(r.message);
            return;
        }
        toast('这次输入已完成：只记录曝光与自评，不会自动提高能力');
        if (planTaskId) {
            const planTask = todayPlan?.initialPlan.find(t => t.id === planTaskId);
            inputPlanTaskId = null;
            await completePlanTask({
                planTaskId,
                kind: planTask?.kind ?? 'input-session',
                startedAt: planTask?.startedAt ?? session.startedAt ?? Date.now(),
                sessionId: r.value.id,
            }, Math.max(0.5, Math.round(((r.value.reportedWatchedMinutes ?? 0) || session.plannedMinutes || 0))));
        }
        await refresh();
    });
    on('[data-transcript-import]', 'click', async () => {
        const raw = document.querySelector<HTMLTextAreaElement>('#transcript-raw')?.value ?? '';
        const provenance = (document.querySelector<HTMLSelectElement>('#transcript-provenance')?.value ?? 'user_supplied') as never;
        const language = document.querySelector<HTMLSelectElement>('#transcript-language')?.value ?? 'en';
        if (!raw.trim()) {
            toast('请先选择文件或粘贴字幕内容。');
            return;
        }
        const r = await inputActions.importTranscriptAction(data, { sourceId: session.sourceId, raw, provenance, language });
        if (!r.ok) {
            toast(r.message);
            return;
        }
        toast(r.value.duplicate ? '这段字幕已经导入过，未重复保存。' : `字幕已导入：${r.value.transcript.cues.length} 条${r.value.warnings.length ? '（' + r.value.warnings[0] + '）' : ''}`);
        await refresh();
    });
    const fileInput = document.querySelector<HTMLInputElement>('#transcript-file');
    if (fileInput)
        fileInput.onchange = () => {
            const file = fileInput.files?.[0];
            if (!file)
                return;
            const reader = new FileReader();
            reader.onload = async () => {
                const text = String(reader.result ?? '');
                const provenance = (document.querySelector<HTMLSelectElement>('#transcript-provenance')?.value ?? 'user_supplied') as never;
                const language = document.querySelector<HTMLSelectElement>('#transcript-language')?.value ?? 'en';
                const r = await inputActions.importTranscriptAction(data, { sourceId: session.sourceId, raw: text, fileName: file.name, provenance, language });
                toast(r.ok ? (r.value.duplicate ? '这段字幕已经导入过。' : `已从 ${file.name} 导入 ${r.value.transcript.cues.length} 条字幕`) : r.message);
                await refresh();
            };
            reader.readAsText(file, 'utf-8');
        };
    on('[data-transcript-reading]', 'click', async () => {
        if (!transcript) {
            toast('还没有字幕可送。');
            return;
        }
        const r = await inputActions.sendTranscriptToReading(data, { sourceId: session.sourceId, transcriptId: transcript.id });
        if (!r.ok) {
            toast(r.message);
            return;
        }
        await putItems('passages', [r.value]);
        toast('已生成阅读材料（保留来源与字幕时间范围），去 Reading Lab 继续。');
        await unitRefresh();
        setPage('reading');
    });
    on('[data-transcript-sentences]', 'click', () => toast(transcript ? '难句候选在下方；送入句法练习时结构标记为“未验证”，不会伪造 gold parse。' : '没有字幕。'));
    document.querySelectorAll<HTMLElement>('[data-sentence-pick]').forEach(b => b.onclick = async () => {
        if (!transcript) {
            toast('没有字幕。');
            return;
        }
        const idx = Number(b.dataset.sentencePick);
        const cands = sentenceCandidates(transcript, { limit: 6, minWords: 8 });
        const cand = cands[idx];
        if (!cand) {
            toast('候选句已变化，请刷新。');
            return;
        }
        const built = await inputActions.sendTranscriptToReading(data, { sourceId: session.sourceId, transcriptId: transcript.id });
        if (!built.ok) {
            toast(built.message);
            return;
        }
        await putItems('passages', [built.value]);
        const { record } = transcriptSentenceRecord({ passage: built.value, candidate: cand });
        await putItems('sentences', [record]);
        toast('已送入句法练习（结构未验证，仅引导练习）。');
        await unitRefresh();
    });
}
// ===== Phase 7：Mini Unit 页面（逻辑在 miniUnit*.ts，这里只做绑定）=====
let unitCustomTopic = '';
let unitSummaryDraft = '';
/** 完成后默认仍显示刚结束的单元（否则完成评价看不见）；点“开始新的 Unit”才回到创建页 */
let unitShowCreate = false;
function activeUnitInData(): MiniUnit | null {
    const open = data.miniUnits
        .filter(u => stageOf(u) === 'draft' || stageOf(u) === 'ready' || stageOf(u) === 'active' || stageOf(u) === 'paused')
        .sort((a, b) => (b.updatedAt ?? b.startedAt) - (a.updatedAt ?? a.startedAt));
    return open[0] ?? null;
}
function unitBudget(): {
    minutes: number;
    energy: 'low' | 'normal' | 'good';
} {
    const today = data.dailyPlans.find(p => p.date === dayKey(Date.now()));
    return {
        minutes: Math.max(15, Math.min(180, today?.availableMinutes ?? 45)),
        energy: (today?.energyState as 'low' | 'normal' | 'good' | undefined) ?? 'normal',
    };
}
async function unitRefresh(): Promise<void> {
    data = await loadData();
    reindex();
    render();
}
function latestFinishedUnit(): MiniUnit | null {
    const closed = data.miniUnits
        .filter(u => stageOf(u) === 'completed' || stageOf(u) === 'abandoned')
        .sort((a, b) => (b.completedAt ?? b.updatedAt ?? 0) - (a.completedAt ?? a.updatedAt ?? 0));
    return closed[0] ?? null;
}
function unitPageApp() {
    const openUnit = activeUnitInData();
    const unit = openUnit ?? (unitShowCreate ? null : latestFinishedUnit());
    if (!unit) {
        const { minutes } = unitBudget();
        const profile = normalizeProfile(data.settings.interests, Date.now());
        const rec = unitActions.unitRecommendations(data, Date.now(), minutes, profile);
        const finished = latestFinishedUnit();
        $('#main').innerHTML = unitCreatePage({
            data, recommendations: rec.themes, note: rec.note, customTopic: unitCustomTopic,
            interest: { profile, sufficient: rec.signals.sufficient, sampleSize: rec.signals.sampleSize },
            suggested: SUGGESTED_INTERESTS,
        })
            + (finished ? `<section class="panel"><div class="section-title">上一个单元</div><p class="muted">${esc(finished.theme)} · ${finished.completionEvaluation?.decision ?? '已结束'}</p><button data-unit-view-last>查看上一个单元</button></section>` : '');
        on('[data-unit-view-last]', 'click', () => { unitShowCreate = false; render(); });
        document.querySelectorAll<HTMLElement>('[data-unit-create]').forEach(b => b.onclick = () => {
            const theme = rec.themes.find(t => t.themeId === b.dataset.unitCreate);
            if (!theme)
                return;
            unitActions.createFromTheme({ data, recommendation: theme, now: Date.now(), availableMinutes: minutes, energy: unitBudget().energy })
                .then(r => {
                if (!r.ok) {
                    toast(r.error!);
                    return;
                }
                toast(r.note!);
                unitShowCreate = false;
                return unitRefresh();
            });
        });
        document.querySelectorAll<HTMLElement>('[data-unit-preview]').forEach(b => b.onclick = () => {
            const box = document.querySelector<HTMLElement>(`#unit-preview-${b.dataset.unitPreview}`);
            if (box)
                box.hidden = !box.hidden;
        });
        on('#unit-custom-topic', 'input', (e) => { unitCustomTopic = (e.target as HTMLInputElement).value; });
        document.querySelectorAll<HTMLElement>('[data-unit-custom]').forEach(b => b.onclick = () => {
            unitActions.createCustomDraft({ data, topic: unitCustomTopic, now: Date.now() })
                .then(r => {
                if (!r.ok) {
                    toast(r.error!);
                    return;
                }
                toast(r.note!);
                unitCustomTopic = '';
                unitShowCreate = false;
                return unitRefresh();
            });
        });
        document.querySelectorAll<HTMLElement>('[data-unit-open-reading]').forEach(b => b.onclick = () => setPage('reading'));
        const saveInterests = (next: InterestProfile) => {
            const s = { ...data.settings, interests: next } as Settings;
            return saveSettings(s).then(() => { data.settings = s; render(); });
        };
        const applyInterest = (change: {
            profile: InterestProfile;
            error?: string;
        }) => {
            if (change.error) {
                toast(change.error);
                return;
            }
            void saveInterests(change.profile);
        };
        document.querySelectorAll<HTMLElement>('[data-interest-del]').forEach(b => b.onclick = (e) => {
            e.stopPropagation();
            applyInterest(removeInterest(profile, b.dataset.interestDel!, Date.now()));
        });
        document.querySelectorAll<HTMLElement>('[data-interest-chip]').forEach(b => b.onclick = () => {
            const current = profile.topics.find(t => t.id === b.dataset.interestChip);
            const label = prompt('修改兴趣主题（留空则保持不变）', current?.label ?? '');
            if (!label || label === current?.label)
                return;
            applyInterest(renameInterest(profile, b.dataset.interestChip!, label, Date.now()));
        });
        document.querySelectorAll<HTMLElement>('[data-interest-suggest]').forEach(b => b.onclick = () => {
            applyInterest(addInterest(profile, b.dataset.interestSuggest!, { source: 'suggested' }, Date.now()));
        });
        on('[data-interest-add]', 'click', () => {
            const input = document.querySelector<HTMLInputElement>('#interest-new');
            const label = input?.value.trim() ?? '';
            if (!label)
                return;
            applyInterest(addInterest(profile, label, {}, Date.now()));
        });
        on('[data-interest-reset]', 'click', () => {
            if (!confirm('重置兴趣画像？会清空所有兴趣主题（不影响学习记录与已有单元）。'))
                return;
            applyInterest(resetInterests(profile, Date.now()));
        });
        return;
    }
    const budget = unitBudget();
    const stage = stageOf(unit);
    const spec = stage === 'active' || stage === 'paused' ? unitActions.todaySpec(data, unit, budget.minutes, budget.energy) : null;
    const evidence = collectUnitEvidence(data, unit);
    $('#main').innerHTML = unitPage({ data, unit, spec, evidence, now: Date.now() });
    const run = (p: Promise<unitActions.ActionResult>, after?: () => void) => {
        void p.then(r => {
            if (!r.ok) {
                toast(r.error!);
                return;
            }
            if (r.note)
                toast(r.note);
            after?.();
            return unitRefresh();
        }).catch(e => toast(e instanceof Error ? e.message : String(e)));
    };
    on('[data-unit-start]', 'click', () => run(unitActions.startToday(unit, Date.now())));
    on('[data-unit-complete]', 'click', () => {
        unitSummaryDraft = '';
        const box = document.querySelector<HTMLElement>('#unit-day-summary');
        if (box && box.hidden === false) {
            run(unitActions.completeToday({ data, unit, now: Date.now(), summary: unitSummaryDraft }));
            return;
        }
        if (box)
            box.hidden = false;
    });
    on('#unit-summary-input', 'input', (e) => { unitSummaryDraft = (e.target as HTMLInputElement).value; });
    on('[data-unit-pause]', 'click', () => run(unitActions.pauseUnit(unit, '用户暂停', Date.now())));
    on('[data-unit-resume]', 'click', () => run(unitActions.resumeUnit(unit, Date.now())));
    on('[data-unit-extend]', 'click', () => run(unitActions.extendUnit(unit, '仍有残余弱词', Date.now())));
    on('[data-unit-abandon]', 'click', () => {
        if (confirm('放弃这个 Mini Unit？已产生的学习证据会保留，但单元会标记为放弃。'))
            run(unitActions.abandonUnit(unit, '用户放弃', Date.now()));
    });
    on('[data-unit-finish]', 'click', () => {
        const ev = collectUnitEvidence(data, unit);
        const decision = ev.independentRecall > 0 ? undefined : 'user_ended';
        const msg = confirm('现在结束并评估这个单元？评估只使用真实证据；缺少真实迁移证据时不会标记为已验证完成。') ? 'ok' : '';
        if (msg)
            run(unitActions.finishUnit({ data, unit, now: Date.now(), decision }));
    });
    on('[data-unit-pick-anchor]', 'click', () => {
        const d = modal(anchorPicker({ data, unit }));
        d.querySelectorAll<HTMLElement>('[data-unit-anchor]').forEach(b => b.onclick = () => {
            closeModal();
            run(unitActions.attachAnchor({ data, unit, passageId: b.dataset.unitAnchor!, now: Date.now() }));
        });
    });
    on('[data-unit-new]', 'click', () => { unitShowCreate = true; render(); });
    document.querySelectorAll<HTMLElement>('[data-unit-open-reading]').forEach(b => b.onclick = () => {
        const id = b.dataset.unitOpenReading;
        const passage = id ? data.passages.find(x => x.id === id) : undefined;
        if (passage)
            openReadingMaterial(passage, null);
        else
            setPage('reading');
    });
    const aiBtn = document.querySelector<HTMLElement>('[data-unit-ai]');
    if (aiBtn)
        aiBtn.onclick = () => {
            const ready = aiReady();
            if (!ready.ok) {
                toast(ready.reason);
                return;
            }
            const key = unitActions.aiMetadata(unit, nextDay(unit), '1.0.0').unitReuseKey;
            const reuse = data.aiGenerations.find(g => g.sourceMetadata?.unitReuseKey === key && g.quality?.ok);
            if (reuse) {
                toast(`本单元 Day ${nextDay(unit)} 已生成过合格材料，复用记录 ${reuse.id}（不重复请求）`);
                return;
            }
            toast('请在对应页面使用 AI 生成：AI 材料会以 AI 标记保存，不会冒充真实 Anchor');
            setPage(aiBtn.dataset.unitAi === 'reading' ? 'reading' : 'sentence');
        };
}
function statistics() { const s = summary(data); $('#main').innerHTML = title('MEMORY INSIGHTS', '看见记忆的变化', '统计来自实际作答记录；没有学习数据的日期保持空白。') + `<div class="metrics">${metric('累计作答', String(data.records.length), '全部历史记录')}${metric('测试过的词', String(data.words.filter(w => w.state.total).length), '去重后的词条')}${metric('有效掌握', String(s.effective), '当前未逾期的熟练词')}${metric('待复习', String(s.due), '按每个词独立调度')}</div><div class="two-col"><section class="panel"><h2>双向表现</h2>${Object.entries(s.directions).map(([k, v]) => `<div class="direction-stat"><b>${k === 'en-zh' ? '英文 → 中文' : '中文 → 英文'}</b><strong>${v.attempts ? pct(v.accuracy) : '—'}</strong><span>${v.attempts} 次 · ${seconds(v.meanMs)}</span></div>`).join('')}<p class="hint">两种方向都是选择题。中→英成绩不能代替独立拼写能力。</p></section><section class="panel"><h2>掌握分布</h2>${distribution()}</section></div><section class="panel"><div class="section-title"><h2>长期趋势</h2><select id="trend-days" aria-label="趋势时间"><option value="7">最近 7 天</option><option value="30">最近 30 天</option></select></div><div id="trend"></div></section><p class="hint">有效掌握采用保守规则：跨间隔测试、双向表现与复习到期时间共同判断，是估算值。它不代表经过标准化测量的词汇量。</p>`; drawTrend(7); on('#trend-days', 'change', e => drawTrend(Number((e.target as HTMLSelectElement).value))); }
function drawTrend(days: number) { const rows = trend(data, days), max = Math.max(1, ...rows.map(r => r.attempts)); $('#trend').innerHTML = `<div class="chart" aria-label="每日作答次数">${rows.map(r => `<div class="bar-col"><span>${r.attempts || ''}</span><div class="bar${r.attempts ? '' : ' is-zero'}" style="height:${r.attempts ? Math.max(6, r.attempts / max * 120) : 0}px" title="${r.date}：${r.attempts}次"></div><small>${r.date.slice(5)}</small></div>`).join('')}</div><div class="table-scroll"><table><thead><tr><th>日期</th><th>作答</th><th>正确率</th><th>平均反应</th><th>进入熟练次数</th><th>到期答错次数</th></tr></thead><tbody>${rows.filter(r => r.attempts).map(r => `<tr><td>${r.date}</td><td>${r.attempts}</td><td>${pct(r.accuracy)}</td><td>${seconds(r.meanMs)}</td><td>${r.gained}</td><td>${r.forgotten}</td></tr>`).join('') || '<tr><td colspan="6">这段时间还没有学习记录</td></tr>'}</tbody></table></div>`; }
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
function originPanelHTML(o: OriginNotice) {
    return `<section class="panel" id="origin-panel" data-origin-current="${esc(o.current)}" data-origin-canonical="${esc(o.canonical)}" data-origin-same="${o.same}"><h2>数据地址</h2><p>${esc(o.message)}</p>${o.same ? '' : `<p class="hint warn">不同地址的学习数据不会自动合并；迁移前先在当前地址导出完整备份，再到推荐地址导入。应用不会自动跳转或搬动数据。</p><div class="actions"><a class="button secondary" href="${esc(o.canonical)}/">在推荐地址打开</a></div>`}</section>`;
}
function settingsPage() {
    const s = data.settings;
    const origin = originNotice();
    $('#main').innerHTML = title('PREFERENCES', '按你的速度来', '时间阈值、测试难度和数据备份，都由你控制。') + `<form id="settings-form"><div class="two-col"><section class="panel"><h2>测试与节奏</h2><div class="form-grid"><label>秒答上限（秒）<input name="fast" type="number" min="0.1" step="0.1" value="${s.fast / 1000}" required></label><label>正常上限（秒）<input name="normal" type="number" min="0.2" step="0.1" value="${s.normal / 1000}" required></label><label>超时（秒）<input name="timeout" type="number" min="0.3" max="120" step="0.1" value="${s.timeout / 1000}" required></label><label>英→中比例（%）<input name="ratio" type="number" min="0" max="100" value="${s.ratio}" required></label><label>难度<select name="difficulty">${[['easy', '简单 · 4项'], ['normal', '普通 · 4项'], ['hard', '困难 · 6项']].map(([v, t]) => `<option value="${v}" ${s.difficulty === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label>答错反馈<select name="feedback">${[[0, '立即下一题'], [500, '停留 0.5 秒'], [1000, '停留 1 秒'], [-1, '手动继续']].map(([v, t]) => `<option value="${v}" ${s.feedback === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label>调度引擎<select name="schedulingAuthority"><option value="fsrs" ${s.schedulingAuthority === 'fsrs' ? 'selected' : ''}>FSRS（默认）</option><option value="legacy" ${s.schedulingAuthority === 'legacy' ? 'selected' : ''}>旧调度器（兼容回滚）</option></select></label><label>目标保留率<input name="requestRetention" type="number" min="0.5" max="0.99" step="0.01" value="${s.requestRetention}" required></label></div><p class="hint">答对立即下一题。正常上限至超时之间为模糊。切换标签页会自动暂停计时。</p></section><section class="panel"><h2>AI API 配置</h2><label>Endpoint<input name="endpoint" type="url" placeholder="https://你的服务地址/v1" value="${esc(s.endpoint)}" autocomplete="off"></label><label>Model Name<input name="model" value="${esc(s.model)}" placeholder="填写供应商提供的模型名称"></label><label>API Key<input name="key" type="password" value="${esc(s.key)}" autocomplete="off" placeholder="仅用于你配置的地址"></label><label class="check"><input name="rememberKey" type="checkbox" ${s.rememberKey ? 'checked' : ''}> 在这台设备记住 Key</label>
<label>结构化输出<select name="structuredMode">${[['auto', '自动（JSON Mode → Schema → 文本）'], ['json_object', '仅 JSON Mode'], ['json_schema', '仅 JSON Schema'], ['text', '仅纯文本抽取']].map(([v, t]) => `<option value="${v}" ${(s.ai?.structuredMode ?? 'auto') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
<div class="form-grid"><label>超时（秒）<input name="aiTimeout" type="number" min="3" max="180" value="${Math.round((s.ai?.timeoutMs ?? 45000) / 1000)}"></label><label>重试上限<input name="aiRetries" type="number" min="0" max="3" value="${s.ai?.maxRetries ?? 2}"></label><label>最大输出 tokens<input name="aiMaxTokens" type="number" min="64" max="8000" value="${s.ai?.maxOutputTokens ?? 1200}"></label><label>每日 token 上限<input name="aiBudget" type="number" min="0" placeholder="留空 = 不限" value="${s.ai?.dailyTokenBudget ?? ''}"></label></div>
<p class="hint">不勾选记住 Key 则只保留到页面关闭。勾选后明文保存在本地浏览器数据库，完整备份仍会剔除 Key。浏览器直连需要供应商支持 CORS。预算按 token 计，不折算货币金额（没有可信价格信息）。</p></section></div><button class="primary" type="submit">保存设置</button></form>${originPanelHTML(origin)}<section class="panel backup-panel"><h2>备份与迁移</h2><p>导出完整 JSON 后可换电脑恢复。请定期备份，浏览器清理和无痕模式可能移除本地数据。</p><div class="actions"><button id="backup" class="primary">导出全部学习数据</button><label class="button secondary">导入备份<input id="restore" type="file" accept=".json" hidden></label><button id="persist" class="secondary">申请持久存储</button><button id="check-integrity" class="secondary">检查数据完整性</button><button id="clear" class="danger-text">清空本地数据</button></div><p id="storage-info" class="hint">学习数据按浏览器和站点地址保存。请一直使用相同的 localhost:4173 地址。</p></section>`;
    on('#settings-form', 'submit', async (e) => {
        e.preventDefault();
        const f = new FormData(e.target as HTMLFormElement);
        const updated: Settings = { ...data.settings, fast: Number(f.get('fast')) * 1000, normal: Number(f.get('normal')) * 1000, timeout: Number(f.get('timeout')) * 1000, ratio: Number(f.get('ratio')), difficulty: f.get('difficulty') as Settings['difficulty'], feedback: Number(f.get('feedback')), endpoint: String(f.get('endpoint') || '').trim(), model: String(f.get('model') || '').trim(), key: String(f.get('key') || '').trim(), rememberKey: f.get('rememberKey') === 'on', schedulingAuthority: (f.get('schedulingAuthority') === 'legacy' ? 'legacy' : 'fsrs') as Settings['schedulingAuthority'], requestRetention: Number(f.get('requestRetention')), ai: { ...(data.settings.ai ?? { endpoint: '', model: '', key: '', structuredMode: 'auto', timeoutMs: 45000, maxRetries: 2, maxOutputTokens: 1200, temperature: 0.7, concurrency: 1, dailyTokenBudget: null }), endpoint: String(f.get('endpoint') || '').trim(), model: String(f.get('model') || '').trim(), key: String(f.get('key') || '').trim(), structuredMode: (String(f.get('structuredMode') || 'auto') as AISettings['structuredMode']), timeoutMs: Math.max(3000, Math.min(180000, Number(f.get('aiTimeout') || 45) * 1000)), maxRetries: Math.max(0, Math.min(3, Number(f.get('aiRetries') ?? 2))), maxOutputTokens: Math.max(64, Math.min(8000, Number(f.get('aiMaxTokens') ?? 1200))), dailyTokenBudget: String(f.get('aiBudget') ?? '').trim() === '' ? null : Math.max(0, Number(f.get('aiBudget'))) } };
        if (!validSettings(updated))
            throw Error('阈值需满足：0 < 秒答 < 正常 < 超时 ≤ 120 秒');
        if (updated.endpoint)
            endpoint(updated.endpoint);
        await saveSettings(updated);
        data.settings = updated;
        toast('设置已保存');
    });
    on('#backup', 'click', exportBackup);
    const integrityIssueHTML = (report: ReturnType<typeof checkDataIntegrity>) => report.issues.slice(0, 12).map(i => `<li><b>${i.severity === 'error' ? '错误' : '警告'}</b> · ${esc(i.store)}${i.recordId ? ` / ${esc(i.recordId)}` : ''} · ${esc(i.message)}</li>`).join('') + (report.issues.length > 12 ? `<li>另有 ${report.issues.length - 12} 条问题未展开。</li>` : '');
    on('#check-integrity', 'click', () => {
        const report = checkDataIntegrity(data);
        modal(`<h2>数据完整性检查</h2><p>${esc(integritySummary(report))}</p>${report.issues.length ? `<ul class="integrity-issues">${integrityIssueHTML(report)}</ul>` : '<p class="hint">只读检查，不会修改任何学习记录。</p>'}<div class="actions"><button class="primary" onclick="document.querySelector('#modal').close()">关闭</button></div>`);
    });
    on('#restore', 'change', async () => {
        const input = $<HTMLInputElement>('#restore');
        const f = input.files?.[0];
        if (!f)
            return;
        try {
            if (f.size > 250 * 1024 * 1024)
                throw Error('备份超过 250 MB，请联系开发者分批迁移。');
            const restored = validateBackup(JSON.parse(await f.text()));
            const report = checkDataIntegrity(restored);
            const integrityNote = report.errors > 0
                ? `<p class="error">完整性检查发现 ${report.errors} 个结构错误：${esc(integritySummary(report))}。恢复是可撤销替换操作，请你确认后才会写入；当前数据在你确认前不会被改动。</p>`
                : report.warnings
                    ? `<p class="hint">${esc(integritySummary(report))} 警告不会阻止恢复，但可能表示旧数据缺少引用。</p>`
                    : '';
            modal(`<h2>恢复这份备份？</h2><p>包含 ${restored.books.length} 本词书、${restored.words.length} 个词、${restored.records.length} 条学习记录。恢复将替换当前设备的数据。</p>${integrityNote}<div class="actions"><button id="restore-before" class="secondary">先导出当前数据</button><button id="restore-confirm" class="primary">确认替换并恢复</button></div>`);
            on('#restore-before', 'click', exportBackup);
            on('#restore-confirm', 'click', async () => {
                try {
                    await replaceData(restored);
                    data = restored;
                    reindex();
                    bookFilter = '';
                    closeModal();
                    render();
                    toast('备份已恢复，请重新填写 API Key');
                }
                catch (e) {
                    toast(e instanceof Error ? `恢复失败：${e.message}` : '恢复失败，现有数据未被替换');
                }
            });
        }
        catch (e) {
            toast(e instanceof Error ? `无法读取备份：${e.message}` : '无法读取备份，现有数据未改动');
        }
        finally {
            input.value = '';
        }
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
        readingInput: data.passages.length ? { passages: data.passages, sessions: data.readingSessions } : null,
        inputInput: data.inputSources.length ? { sources: data.inputSources, sessions: data.inputSessions } : null,
        outputTask: selectOutputTasks({ data, now: Date.now(), availableMinutes: minutes, energy }).task,
        examTask: planExamTask({ enabled: data.settings.exam?.planEnabled ?? false, items: data.examItems, sessions: data.examSessions, availableMinutes: minutes, now: Date.now() }),
        diagnosticFocus: latestSnapshot(data.skillSnapshots)?.diagnostics?.bottleneck ?? null,
    };
}
function energyLabel(e: EnergyState) { return e === 'low' ? '状态差' : e === 'good' ? '状态好' : '正常'; }
function unavailableModulesText(): string { const caps = moduleCapabilities(); return MODULES.filter(m => !caps[m].available).map(m => `${caps[m].label}（${caps[m].requires}）`).join('、') || '无'; }
function planSetup(): string {
    const presets: number[] = [...PLANNER_CONFIG.budget.presets];
    const custom = !presets.includes(planBudget);
    return `<section class="panel plan-panel" id="plan-setup"><div class="section-title"><h2>今日计划</h2><span class="subtle">时间预算优先</span></div><p class="hint">先选真实可用时间与今天的状态。计划会在同一份预算内安排隔夜检测、到期复习、新词与收尾回忆；不会安排尚未上线的模块。</p><div class="plan-setup"><label>可用时间<select id="plan-budget">${presets.map(n => `<option value="${n}" ${n === planBudget ? 'selected' : ''}>${n} 分钟</option>`).join('')}<option value="custom" ${custom ? 'selected' : ''}>自定义</option></select></label><label>自定义分钟<input id="plan-custom" type="number" min="${PLANNER_CONFIG.budget.min}" max="${PLANNER_CONFIG.budget.max}" step="1" value="${planBudget}" ${custom ? '' : 'disabled'}></label><label>今日状态<select id="plan-energy">${([['low', '状态差'], ['normal', '正常'], ['good', '状态好']] as const).map(([v, t]) => `<option value="${v}" ${planEnergy === v ? 'selected' : ''}>${t}</option>`).join('')}</select></label><button id="plan-create" class="primary" ${planBusy ? 'disabled' : ''}>生成今日计划</button></div><p class="hint">${esc(unavailableTasksText())}；没有真实目标时不会生成假任务。</p></section>`;
}
function moduleName(m: ReturnType<typeof taskModule>): string {
    return ({ vocabulary: '词汇', sentence: '句子', reading: '阅读', input: '输入', output: '表达', exam: '考试', closing: '收尾', unsupported: '未知' } as const)[m];
}
function unavailableTasksText(): string {
    const missing: string[] = [];
    if (!data.words.length)
        missing.push('词汇（词库为空）');
    if (!sentenceRecords.length)
        missing.push('句子（没有真实句子）');
    if (!data.passages.length)
        missing.push('阅读（没有文章）');
    if (!data.inputSources.length)
        missing.push('输入（没有真实材料）');
    if (!selectOutputTasks({ data, now: Date.now(), availableMinutes: 20, energy: planEnergy }).candidates.length)
        missing.push('表达（没有真实来源）');
    if (!(data.settings.exam?.planEnabled ?? false))
        missing.push('考试（未开启每日考试练习）');
    else if (!(data.examItems ?? []).length)
        missing.push('考试（题库为空）');
    return missing.length ? `当前不生成：${missing.join('、')}` : '六类模块均有可执行目标';
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
    return `<section class="panel plan-panel" id="plan-panel">
  <div class="section-title"><h2>今天的顺序</h2><span class="subtle">剩余 ${progress.remainingMinutes} / ${plan.availableMinutes} 分钟 · 完成 ${progress.done}/${progress.total}${progress.skipped ? ` · 跳过 ${progress.skipped}` : ''}</span></div>
  <div class="plan-progress" role="progressbar" aria-valuenow="${Math.round(progress.ratio * 100)}" aria-valuemin="0" aria-valuemax="100" aria-label="今日计划进度"><i style="width:${Math.round(progress.ratio * 100)}%"></i></div>
  <p class="hint">预算 ${plan.availableMinutes} 分钟 · 状态 ${energyLabel(plan.energyState)} · ${esc(humanReasons(budgetReasons) || '按真实到期与保留率安排')}</p>
  ${recallLine}
  <div class="plan-tasks" data-stagger>${(() => { const nextId = nextOpenTask(plan)?.id; return plan.initialPlan.map(t => taskCard(t, nextId)).join(''); })() || '<p class="subtle">今天没有需要安排的任务。</p>'}</div>
  <div class="actions"><button id="plan-regenerate" class="secondary">重新生成未完成部分</button><button id="plan-adjust" class="text-button">调整预算 / 状态</button></div>
  <p class="hint">已完成任务与已提交的学习证据不会被重建；延后只发生在今天，不成为明天的作业债。</p>
  <p class="hint">${esc(unavailableTasksText())}；任务只使用真实材料，不生成假任务。</p>
</section>`;
}
function taskCard(t: PlanItem, nextId?: string): string {
    const statusText: Record<string, string> = { done: '已完成', started: '进行中', skipped: '已跳过', delayed: '已延后', replaced: '已替换' };
    const badge = t.status === 'done' ? 'fluent' : t.status === 'skipped' || t.status === 'replaced' ? 'unknown' : 'vague';
    const startLabel = t.status === 'started' ? '继续' : '开始';
    const actions = t.status === 'done' || t.status === 'replaced' || t.status === 'skipped' ? '' : `<div class="task-buttons"><button class="secondary" data-task-start="${esc(t.id)}">${startLabel}</button>${t.flexible ? `<button class="text-button" data-task-replace="${esc(t.id)}">替换</button>` : ''}<button class="text-button" data-task-delay="${esc(t.id)}">延后</button><button class="text-button" data-task-skip="${esc(t.id)}">跳过</button></div>`;
    return `<div class="plan-task ${esc(t.status)}" data-task="${esc(t.id)}">
  <span class="task-state" aria-hidden="true"></span>
  <div class="task-main">
    <div class="task-head"><b>${esc(t.label ?? TASK_LABELS[t.kind ?? ''] ?? t.kind ?? '任务')}</b>${nextId && t.id === nextId ? '<span class="badge is-next">下一项</span>' : ''}<span class="task-minute">${t.minutes} 分钟</span><span class="badge normal">${esc(moduleName(taskModule(t)))}</span>${t.critical ? '<span class="badge vague">关键记忆</span>' : ''}${t.flexible ? '<span class="badge normal badge-flex">可调整</span>' : ''}${statusText[t.status] ? `<span class="badge ${badge}">${statusText[t.status]}</span>` : ''}</div>
    ${humanReasons(t.reason) ? `<small>${esc(humanReasons(t.reason))}</small>` : ''}
    <small>${esc(taskTargetLabel(t))}</small>
  </div>
  ${actions}
</div>`;
}
function bindPlan() {
    on('#plan-budget', 'change', e => {
        const v = (e.target as HTMLSelectElement).value;
        const custom = document.querySelector<HTMLInputElement>('#plan-custom');
        if (custom)
            custom.disabled = v !== 'custom';
        if (v !== 'custom')
            planBudget = Number(v);
        else
            custom?.focus();
    });
    on('#plan-custom', 'input', e => { planBudget = Number((e.target as HTMLInputElement).value); });
    on('#plan-energy', 'change', e => { planEnergy = (e.target as HTMLSelectElement).value as EnergyState; });
    on('#plan-create', 'click', createPlanFromUI);
    on('#plan-regenerate', 'click', () => void regeneratePlan(todayPlan?.availableMinutes ?? planBudget, todayPlan?.energyState ?? planEnergy));
    on('#start-today', 'click', () => void startTodayTraining());
    on('#plan-adjust', 'click', planAdjustDialog);
    document.querySelectorAll<HTMLElement>('[data-task-start]').forEach(b => b.onclick = () => {
        if (morphBusy())
            return;
        void morphNavigate({
            from: b, target: '#main .preview-card, #main .quiz-card, #main .reader-main, #main .exam-card, #main .lab-card',
            run: () => startPlanTask(b.dataset.taskStart!),
        });
    });
    document.querySelectorAll<HTMLElement>('[data-task-skip]').forEach(b => b.onclick = () => void planAction(b.dataset.taskSkip!, 'skip'));
    document.querySelectorAll<HTMLElement>('[data-task-delay]').forEach(b => b.onclick = () => void planAction(b.dataset.taskDelay!, 'delay'));
    document.querySelectorAll<HTMLElement>('[data-task-replace]').forEach(b => b.onclick = () => void replacePlanTask(b.dataset.taskReplace!));
}
/** 刚完成的任务在 Today 路线上闪一次（只在回到 Today 时生效，一次性）。 */
function pulseJustCompleted(): void {
    let id: string | null = null;
    try { id = sessionStorage.getItem('d.justDone'); } catch { return; }
    if (!id)
        return;
    try { sessionStorage.removeItem('d.justDone'); } catch { /* ignore */ }
    if (page !== 'home')
        return;
    const seg = document.querySelector<HTMLElement>(`.d-seg[data-seg="${CSS.escape(id)}"]`);
    if (!seg || !livingAllowed())
        return;
    seg.classList.add('is-just-done');
    window.setTimeout(() => seg.classList.remove('is-just-done'), 1250);
}

function upsertPlan(list: DailyPlan[], plan: DailyPlan): DailyPlan[] {
    const i = list.findIndex(p => p.id === plan.id);
    const next = [...list];
    if (i === -1)
        next.push(plan);
    else
        next[i] = plan;
    return next;
}
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
async function startPlanTask(taskId: string, fromFlow = false): Promise<void> {
    if (taskStarting) {
        toast('任务正在打开，请稍候');
        return;
    }
    taskStarting = true;
    try {
        await startPlanTaskOnce(taskId, fromFlow);
    }
    finally {
        taskStarting = false;
    }
}
async function startPlanTaskOnce(taskId: string, fromFlow = false): Promise<void> {
    if (!todayPlan || planBusy)
        return;
    const task = todayPlan.initialPlan.find(t => t.id === taskId);
    if (!task)
        return;
    const module = taskModule(task);
    if (module === 'unsupported') {
        toast('这个任务来自未知模块，应用不会把它当成词汇任务执行；请重新生成今日计划');
        return;
    }
    const unavailable = taskUnavailableReason(task, data);
    if (unavailable) {
        toast(unavailable);
        return;
    }
    const waiting = (task.dependencies ?? []).filter(d => todayPlan!.initialPlan.find(t => t.id === d)?.status !== 'done');
    if (waiting.length) {
        toast('请先完成前置任务（新词需要先预览，再 Recall）');
        return;
    }
    // 同一个领域只能有一个活动会话；输入/阅读/表达/考试各自有独立状态机与恢复入口。
    if ((module === 'vocabulary' || module === 'closing') && data.sessions.some(s => !s.ended)) {
        toast('请先继续或结束未完成的词汇训练');
        return;
    }
    if (fromFlow)
        trainingFlow = true;
    const markStarted = async (): Promise<boolean> => {
        const startedPlan = applyPlanAction(todayPlan!, taskId, 'start', { now: Date.now() });
        if (!startedPlan.ok) {
            toast(startedPlan.reasons.join('；'));
            return false;
        }
        const saved = await persistPlan(startedPlan.plan);
        return !!saved;
    };
    // 重复点击/刷新后继续：同一计划任务已有进行中的领域会话时，恢复而不是新建。
    if (module === 'sentence' && labSession?.planTaskId === taskId) {
        page = 'lab';
        render();
        return;
    }
    if (module === 'output') {
        const activeOut = data.outputAttempts.find(a => a.status !== 'completed' && a.dailyPlanTaskId === taskId);
        if (activeOut) {
            outputAttemptId = activeOut.id;
            page = 'output';
            render();
            return;
        }
    }
    if (module === 'exam') {
        const activeExam = data.examSessions.find(x => ['created', 'active', 'paused'].includes(x.status) && x.dailyPlanTaskId === taskId);
        if (activeExam) {
            examSessionId = activeExam.id;
            page = 'exam';
            render();
            return;
        }
    }
    if (module === 'reading') {
        const passageId = (task.refs ?? [])[0] ?? '';
        const passage = data.passages.find(p => p.id === passageId);
        if (!passage) {
            toast('这篇文章已不在阅读库（可能被删除）');
            return;
        }
        if (!(await markStarted()))
            return;
        readingTask = { planTaskId: taskId, startedAt: Date.now() };
        openReadingMaterial(passage, task.targetSessionId ?? null);
        return;
    }
    if (module === 'sentence') {
        const ids = (task.refs ?? []).filter(id => sentenceRecords.some(s => s.id === id));
        if (!ids.length) {
            toast('这个句任务没有可用的真实句子（句库可能已变更）');
            return;
        }
        if (!(await markStarted()))
            return;
        startLab(ids, taskId, task.kind ?? 'sentence-basic-structure');
        return;
    }
    if (module === 'input') {
        const sourceId = (task.refs ?? [])[0] ?? '';
        const source = data.inputSources.find(s => s.id === sourceId);
        if (!source) {
            toast('这份输入材料已不在 Input Hub');
            return;
        }
        const existing = data.inputSessions
            .filter(s => s.sourceId === sourceId && s.status !== 'completed' && s.status !== 'abandoned')
            .find(s => s.id === task.targetSessionId) ?? data.inputSessions
            .filter(s => s.sourceId === sourceId && s.status !== 'completed' && s.status !== 'abandoned')
            .sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0))[0] ?? null;
        if (!(await markStarted()))
            return;
        inputPlanTaskId = taskId;
        if (existing) {
            if (existing.dailyPlanTaskId !== taskId) {
                const linked = { ...existing, dailyPlanTaskId: taskId, updatedAt: Date.now() };
                await putItems('inputSessions', [linked as never]);
                data = await loadData();
                reindex();
            }
            inputSessionId = existing.id;
            inputModeDraft = existing.mode;
            page = 'input';
            render();
            return;
        }
        const mode = suggestMode({ energy: inputEnergy(), unitDay: activeUnitInData()?.dayIndex ?? null });
        const minutes = Math.max(1, Math.round(task.minutes));
        const startedInput = await inputActions.startInputAction(data, {
            sourceId, mode, minutes, miniUnitId: activeUnitInData()?.id ?? null, dailyPlanTaskId: taskId,
        });
        if (!startedInput.ok) {
            inputPlanTaskId = null;
            toast(startedInput.message);
            return;
        }
        data = await loadData();
        reindex();
        inputSessionId = startedInput.value.id;
        inputModeDraft = startedInput.value.mode;
        page = 'input';
        render();
        return;
    }
    if (module === 'output') {
        const wantedId = (task.refs ?? [])[0] ?? '';
        const sel = selectOutputTasks({ data, now: Date.now(), availableMinutes: task.minutes, energy: planEnergy });
        const candidate = sel.candidates.find(c => c.id === wantedId) ?? (sel.task?.id === wantedId ? sel.task : null);
        if (!candidate) {
            toast('这个表达任务在当前材料下已不可用；请重新生成今日计划');
            return;
        }
        if (!(await markStarted()))
            return;
        outputPlanTaskId = taskId;
        page = 'output';
        outputAttemptId = null;
        await startOutputTask(candidate, '', null, null, null, taskId);
        return;
    }
    if (module === 'exam') {
        const itemId = (task.refs ?? [])[0] ?? '';
        if (!(await markStarted()))
            return;
        examPlanTaskId = taskId;
        page = 'exam';
        await startExamItems([itemId], taskId);
        return;
    }
    // 词汇/收尾：refs 必须真实存在，否则明确失败。
    const refs = (task.refs ?? []).map(id => wordMap.get(id)).filter((w): w is Word => !!w);
    if (!refs.length) {
        toast('这个任务暂时没有可执行的词（词库可能已变更）');
        return;
    }
    if (!(await markStarted()))
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
async function startTodayTraining(): Promise<void> {
    if (morphBusy())
        return;
    // 录屏专用钩子：press 片段要单独展示「按下/保持/松开/回弹」，不能顺带跳页
    if ((window as unknown as { __noNavClick?: boolean }).__noNavClick)
        return;
    if (!todayPlan) {
        toast('先生成今日计划');
        return;
    }
    trainingFlow = true;
    const next = nextOpenTask(todayPlan);
    if (!next) {
        toast('今天的计划已经全部完成');
        page = 'home';
        render();
        return;
    }
    await morphNavigate({
        from: '#start-today', target: '#main .preview-card, #main .quiz-card, #main .reader-main, #main .exam-card, #main .lab-card',
        run: () => startPlanTask(next.id, true),
    });
}
async function completePlanTask(exec: {
    planTaskId: string;
    kind: string;
    startedAt: number;
    sessionId: string;
}, actualMinutes: number): Promise<boolean> {
    if (!todayPlan)
        return false;
    const task = todayPlan.initialPlan.find(t => t.id === exec.planTaskId);
    if (!task) {
        toast('找不到这个计划任务，可能已重新生成');
        return false;
    }
    if (task.status === 'done')
        return true;
    // 领域写入可能发生在另一个事务里；完成前读一次最新数据，避免用旧快照判断证据。
    data = await loadData();
    reindex();
    const evidence = taskEvidence(task, data, { planTaskId: exec.planTaskId, startedAt: exec.startedAt, sessionId: exec.sessionId });
    if (!evidence.ok) {
        toast(`未标记完成：${evidence.reason}`);
        return false;
    }
    const result = applyPlanAction(todayPlan, exec.planTaskId, 'complete', { now: Date.now(), actualMinutes, reason: `task-completed:${evidence.module}` });
    if (!result.ok) {
        toast(result.reasons.join('；'));
        return false;
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
    plan.completedModules = [...new Set([...(plan.completedModules ?? []), taskModule(task)])];
    const savedPlan = await persistPlan(plan);
    if (savedPlan && exec.kind === 'closing-recall')
        closingFeedback();
    if (savedPlan) {
        // 路线段的一次性完成反馈：只做视觉，不改任何学习证据
        try { sessionStorage.setItem('d.justDone', exec.planTaskId); } catch { /* 隐私模式忽略 */ }
    }
    if (savedPlan && trainingFlow) {
        page = 'home';
        render();
    }
    return !!savedPlan;
}
// 启动恢复对账：领域会话已完成、但计划仍停在 started 时，用真实证据补写 done。
// 没有证据的 started 不自动完成，也不清空——重新进入任务会恢复原会话。
async function reconcilePlanEvidence(): Promise<void> {
    if (!todayPlan)
        return;
    let plan = todayPlan;
    let changed = false;
    for (const task of todayPlan.initialPlan.filter(t => t.status === 'started')) {
        const evidence = taskEvidence(task, data, { planTaskId: task.id, startedAt: task.startedAt ?? 0, sessionId: '' });
        if (!evidence.ok)
            continue;
        const r = applyPlanAction(plan, task.id, 'complete', { now: Date.now(), actualMinutes: task.minutes, reason: `reconciled:${evidence.module}` });
        if (r.ok) {
            plan = r.plan;
            plan.completedModules = [...new Set([...(plan.completedModules ?? []), taskModule(task)])];
            changed = true;
        }
    }
    if (!changed)
        return;
    try {
        const saved = await savePlan(plan, todayPlan.revision ?? 0);
        todayPlan = saved;
        data.dailyPlans = upsertPlan(data.dailyPlans, saved);
    }
    catch {
        // 对账失败不阻塞启动；原计划保留，用户仍可继续任务。
    }
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
    const floor = Math.max(spent, PLANNER_CONFIG.budget.min);
    if (!Number.isFinite(minutes) || minutes < floor) {
        toast(`新的总预算不能小于 ${floor} 分钟${spent ? `（已投入 ${spent} 分钟）` : ''}`);
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
    const filters = cats.map(c => `<button class="chip ${grammarCategoryFilter === c ? 'active' : ''}" aria-pressed="${grammarCategoryFilter === c}" data-gcat="${c}">${c ? GRAMMAR_CATEGORY_LABELS[c] : '全部'}</button>`).join('');
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
            return `<article class="concept-card ${st.weak ? 'weak' : ''}" data-band="${st.band}"><header><button class="concept-link" data-concept="${d.id}">${esc(d.name)}</button><span class="badge ${bandClassOf(st.band)}">${GRAMMAR_BAND_LABELS[st.band]}</span></header><p class="hint">${esc(d.description)}</p><p class="concept-prereq"><span class="subtle">先修</span>${prereqChips}</p><div class="concept-metrics"><span>估算 <b>${pct(st.p)}</b></span><span>证据 <b>${st.attempts}</b></span><span>独立正确 <b>${st.independentCorrect}</b></span><span>相关句 <b>${sentences}</b></span></div>${st.weak ? `<p class="hint warn">${esc(errorSummary(st))}</p>` : ''}<div class="row-actions"><button class="secondary small" data-concept-practice="${d.id}">去练习</button></div></article>`;
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
        + aiSentencePanelHTML()
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
function startLab(sentenceIds: string[], planTaskId: string | null, planTaskKind: string | null, opts: {
    ungraded?: boolean;
    returnTo?: LabReturnTarget | null;
} = {}): void {
    const queue = sentenceIds.filter(id => sentenceRecords.some(s => s.id === id));
    if (!queue.length) {
        toast('没有可用的真实句子');
        return;
    }
    labSession = { sessionId: `lab-${Date.now().toString(36)}`, queue, index: 0, planTaskId, planTaskKind, startedAt: Date.now(), current: null, finished: [], ungraded: !!opts.ungraded, returnTo: opts.returnTo ?? null };
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
        sentenceId: rec.id, plan, stepIndex: 0, stepRecords: [], supportLevel: session.ungraded ? MAX_SUPPORT_LEVEL : 0, answered: null, evaluation: null,
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
    const progress = `<div class="lab-progress" data-step="${cur.stepIndex + 1}" data-total="${total}"><span>第 ${cur.stepIndex + 1} / ${total} 步</span><span>${STEP_LABELS[step.kind]}</span><span class="badge ${cur.supportLevel === 0 ? 'fluent' : cur.supportLevel >= 3 ? 'vague' : 'normal'}">${SUPPORT_LABELS[cur.supportLevel]}</span></div>`;
    // 作答前只给候选成分，不给"它是主句主语"这类解析——那等于把答案写在选项上
    const options = step.options.map(o => {
        const verdict = !cur.answered ? 'pending'
            : o.id === step.correctId ? 'correct'
                : o.id === cur.answered ? 'wrong'
                    : 'neutral';
        return `<button class="lab-option ${cur.answered === o.id ? 'picked' : ''}" data-verdict="${verdict}" data-lab-option="${o.id}" ${cur.answered ? 'disabled' : ''}><b>${esc(o.label)}</b>${cur.answered && o.detail ? `<small>${esc(o.detail)}</small>` : ''}</button>`;
    }).join('');
    const feedback = cur.evaluation ? `<div class="lab-feedback ${cur.evaluation.correct ? 'ok' : 'bad'}"><p><b>${cur.evaluation.correct ? '正确' : cur.evaluation.partial ? '部分正确' : '还不准确'}</b> · ${cur.evaluation.correct ? '' : `错误类型：${ERROR_LABELS[cur.evaluation.errorType] ?? cur.evaluation.errorType}`}</p><p>${esc(cur.evaluation.feedback)}</p><p class="hint">${esc(cur.evaluation.nextFocus)}</p><div class="actions">${cur.evaluation.correct ? '' : (step.conceptIds[0] ?? 'structure.core') ? `<button class="secondary" data-jit="${step.conceptIds[0] ?? 'structure.core'}">看 30 秒知识卡</button>` : ''}<button class="primary" id="lab-next">${cur.stepIndex + 1 < total ? '下一步' : '完成这句'}</button></div>${cur.supportLevel >= 3 ? '<p class="hint warn">这句你已看过答案／完整解释：会计入接触次数，但不会算作掌握证据。</p>' : ''}${session.ungraded ? '<p class="hint warn">这句来自阅读材料，结构是自动分析的（没有人工审校）：本次只记接触，不推进语法掌握度。</p>' : ''}</div>` : '';
    $('#main').innerHTML = `<div id="lab-page">` + title('SENTENCE LAB', `拆句 · ${cur.stepIndex + 1}/${total}`, '先找主干，再看修饰；不确定时可以要提示，但提示会降低这次证据的可信度。')
        + `<div class="actions"><button class="secondary" data-lab-back="1">${session.returnTo ? '← 回到阅读' : '← 回到句库'}</button><button class="danger-text" id="lab-skip">跳过这句</button></div>`
        + `<section class="panel lab-panel">${session.ungraded ? '<p class="hint warn">这句来自你的阅读材料：结构是自动分析的（没有人工审校），所以本次只记接触，不推进语法掌握度。</p>' : ''}${cur.transferOf ? `<p class="hint"><span class="src-badge">迁移验证</span> 这是同一个结构的新句：不看提示，独立判断一次。</p>` : ''}${preTeachHTML(rec)}<div id="lab-sentence" class="lab-sentence" lang="en">${esc(rec.text)}</div>${progress}
            <h2 id="lab-question">${esc(step.question)}</h2>
            <div class="lab-options">${options}</div>
            <div class="actions"><button class="secondary" id="lab-hint" ${cur.answered ? 'disabled' : ''}>${level.level === 0 ? '需要提示？（会降低证据强度）' : '再给一点提示'}</button><span class="hint" id="lab-level">当前辅助：${level.label}（L${level.level}/${MAX_SUPPORT_LEVEL}）</span></div>
            ${cur.supportLevel > 0 && !cur.answered ? `<p class="hint">提示：${esc(level.hint)}</p>` : ''}
            ${feedback}
        </section>
        <p class="hint">句子来源：${rec.sourceType} · 结构来源：${cur.plan.simplified ? '简化流程（句子较简单）' : readStructure(rec.structure, rec.id, rec.text).structure.provenance}${cur.plan.uncertain ? ' · 结构不确定，已标注' : ''}${cur.plan.notes.length ? ` · ${esc(cur.plan.notes.join('；'))}` : ''}</p></div>`;
    document.querySelectorAll<HTMLElement>('[data-lab-option]').forEach(b => b.addEventListener('click', () => void labAnswer(b.dataset.labOption ?? '')));
    on('#lab-hint', 'click', () => {
        if (!labSession?.current || labSession.current.answered)
            return;
        labSession.current.supportLevel = Math.min(MAX_SUPPORT_LEVEL, labSession.current.supportLevel + 1);
        render();
    });
    on('#lab-next', 'click', () => labAdvance());
    on('#lab-skip', 'click', () => labSkip());
    document.querySelectorAll<HTMLElement>('[data-lab-back]').forEach(b => b.addEventListener('click', () => {
        if (labReturnToReading())
            return;
        labSession = null;
        page = 'sentence';
        render();
    }));
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
        cur.supportLevel = session.ungraded ? MAX_SUPPORT_LEVEL : 0;
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
    on('#lab-next-sentence', 'click', () => {
        session.index++;
        if (session.index >= session.queue.length)
            void finishLabSession();
        else {
            openLabSentence();
            render();
        }
    });
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
    const body = clauses.map(c => `<details class="tree-clause" data-clause-id="${esc(c.id)}" data-clause-kind="${esc(c.kind)}" data-root="${c.kind === 'main' ? '1' : '0'}" open><summary><span class="clause-kind">${CLAUSE_LABELS[c.kind]}</span> <b>${esc(c.label)}</b> <small>词 ${c.start + 1}–${c.end + 1}</small></summary><div class="tree-tokens">${rows.filter(r => r.clauseId === c.id).map(r => `<span class="token role-${r.role}" data-clause-id="${esc(r.clauseId)}" title="依存：${esc(r.headText)}${r.note ? ` · ${esc(r.note)}` : ''}"><b>${esc(r.text)}</b><small>${r.roleLabel}</small></span>`).join('')}</div></details>`).join('');
    const warn = structure.provenance === 'gold' ? '' : `<p class="hint warn">结构来源是 ${structure.provenance}（confidence ${structure.confidence}）：这不是可靠的完整句法分析，只用于引导你注意成分位置。</p>`;
    return `<div id="lab-tree" class="tree" data-provenance="${esc(structure.provenance)}"><p class="hint">先看主句骨架，再看从句／非谓语如何补足（组内保持原词序）。</p>${body}</div>${warn}<p class="hint">${esc(structure.note)}</p>`;
}
async function finishLabSession(): Promise<void> {
    const session = labSession;
    if (!session)
        return;
    const finished = session.finished;
    const minutes = Math.max(0.5, Math.round((Date.now() - session.startedAt) / 30000) / 2);
    const taskId = session.planTaskId;
    const kind = session.planTaskKind;
    const returnTo = session.returnTo ?? null;
    labSession = null;
    // Phase 5：从阅读里进来的难句，练完回原段落，保留阅读进度
    if (returnTo && readSession && readPassage) {
        const last = finished[finished.length - 1];
        if (last) {
            const difficult = readSession.detail?.difficultSentences.find(d => d.id === returnTo.difficultId);
            if (difficult) {
                const attempt = data.sentenceAttempts.filter(a => a.sentenceId === last.sentenceId).slice(-1)[0];
                upsertReadSession(linkDifficultSentenceAttempt(readSession, difficult.id, attempt?.id ?? ''));
                await persistReading();
            }
        }
        labReturnToReading();
        return;
    }
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
// 测试钩子：仅在测试构建（npm run build:test → dist-test）且 URL 带 ?test=1 时才暴露。
// 生产构建里 testHooksEnabled() 是常量 false，整个钩子（含 __labTest 赋值）会被摇树移除，
// 因此生产环境既没有答案入口，也没有任何可绕过学习状态校验的写能力（Phase 5.0 安全加固）。
function installTestHook(): void {
    if (!testHooksEnabled() || !new URLSearchParams(location.search).has('test'))
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
    // Phase 5：阅读状态只读快照（不给任何写库/绕过校验的能力）
    const readHook = {
        state: () => ({
            view: readView,
            passageId: readPassage?.id ?? null,
            sessionId: readSession?.id ?? null,
            passageTitle: readPassage?.title ?? '',
            chunkIndex: readSession?.detail?.chunkIndex ?? 0,
            chunks: readSession?.detail?.chunks.length ?? 0,
            stage: readSession?.detail?.stage ?? '',
            sessionState: readSession?.detail?.state ?? '',
            marks: (readSession?.detail?.marks ?? []).filter(m => !m.revokedAt).length,
            revoked: (readSession?.detail?.marks ?? []).filter(m => m.revokedAt).length,
            difficult: readSession?.detail?.difficultSentences.length ?? 0,
            evidence: readSession?.detail?.evidence.length ?? 0,
            evidenceTypes: [...new Set((readSession?.detail?.evidence ?? []).map(e => e.type))],
            helps: readSession?.detail?.helps.length ?? 0,
            maxHelpLevel: maxHelpLevelUsed(readSession ?? ({} as ReadingSession)),
            comprehension: readSession?.detail?.comprehension.length ?? 0,
            passages: data.passages.length,
            sessions: data.readingSessions.length,
            exposures: data.wordExposures.filter(e => e.sourceType === 'reading').length,
            firstPass: readSession?.firstPassComprehension ?? null,
            secondPass: readSession?.secondPassComprehension ?? null,
        }),
        library: () => queryLibrary(data.passages, data.readingSessions, { readState: 'all' }).map(r => ({ id: r.passage.id, title: r.passage.title, hash: r.passage.contentHash ?? '', completed: r.completed })),
    };
    (window as unknown as Record<string, unknown>).__readTest = readHook;
    // Phase 7 验收钩子：只做“种子数据 / 读取真实状态 / 并发推进”，不改变业务规则
    (window as unknown as Record<string, unknown>).__unitTest = {
        async snapshot() {
            const d = await loadData();
            return {
                units: d.miniUnits.map(u => ({ id: u.id, stage: stageOf(u), dayIndex: u.dayIndex, days: (u.dayHistory ?? []).map(x => x.day), evidence: (u.dayHistory ?? []).map(x => x.evidenceIds.length), plannedDays: u.plannedDays ?? 3, baseline: u.baseline?.source ?? null, transfer: u.transfer?.materialKind ?? null, decision: u.completionEvaluation?.decision ?? null })),
                words: d.words.length, passages: d.passages.map(p => ({ id: p.id, sourceType: p.sourceType, hash: p.contentHash ?? '' })),
                records: d.records.length, grammar: d.grammarAttempts.length, sessions: d.readingSessions.length,
                generations: d.aiGenerations.map(g => ({ id: g.id, miniUnitId: g.sourceMetadata?.miniUnitId ?? '', key: g.sourceMetadata?.unitReuseKey ?? '' })),
                plans: d.dailyPlans.map(p => ({ date: p.date, unitId: p.miniUnitId ?? '', items: p.initialPlan.length })),
            };
        },
        async put(store: string, rows: unknown[]) { await putItems(store as never, rows); },
        async clear(store: string) {
            await openDB();
            const tx = getDB().transaction(store, 'readwrite');
            tx.objectStore(store).clear();
            await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
        },
        async advance(id: string, day: number) {
            const t = await applyTransition(id, (current) => {
                if (nextDay(current) !== day)
                    return null;
                const r = applyUnitEvent(current, { type: 'complete-day', day, calendarDate: dayKey(Date.now()), summary: '并发测试', evidenceIds: [`ev-${id}-${day}`], wordsCovered: [], now: Date.now() });
                return r.ok ? r.unit : null;
            });
            return { dayIndex: t.dayIndex, days: (t.dayHistory ?? []).length };
        },
        async reload() { data = await loadData(); reindex(); render(); },
        async profile() {
            const d = await loadData();
            return normalizeProfile(d.settings.interests, Date.now());
        },
        async recommendations() {
            const d = await loadData();
            const profile = normalizeProfile(d.settings.interests, Date.now());
            const rec = unitActions.unitRecommendations(d, Date.now(), 45, profile);
            return { note: rec.note, sufficient: rec.signals.sufficient, sampleSize: rec.signals.sampleSize,
                themes: rec.themes.map(t => ({ topic: t.topic, reasonKind: t.reasonKind, reasonTag: t.reasonTag, exploration: t.exploration, repeat: t.repeat, difficulty: t.estimatedDifficulty })) };
        },
        async saveProfile(profile: unknown) {
            const s = { ...data.settings, interests: profile } as Settings;
            await saveSettings(s);
            data.settings = s;
            return 'saved';
        },
    };
    // Phase 8 验收钩子：真实 IndexedDB + 真实 UI 路径；只读/可控写入，不伪造证据
    (window as unknown as Record<string, unknown>).__inputTest = {
        async snapshot() {
            const d = await loadData();
            return {
                sources: d.inputSources.map(x => ({ id: x.id, title: x.title, topic: x.topic, provider: x.provider, verification: x.verificationStatus, transcript: x.transcriptRef ?? '', difficulty: x.difficultyEstimate, basis: x.difficultyBasis })),
                sessions: d.inputSessions.map(x => ({ id: x.id, sourceId: x.sourceId, status: x.status, hasReflection: !!x.reflection, mode: x.reflection?.mode ?? x.mode, watched: x.reportedWatchedMinutes ?? 0, caption: x.reflection?.captionMode ?? x.captionMode, baseline: x.baseline?.status ?? 'none', unit: x.miniUnitId ?? '', revision: x.revision ?? 1 })),
                transcripts: d.transcripts.map(x => ({ id: x.id, sourceId: x.sourceId, cues: x.cues.length, timed: x.timed, provenance: x.provenance, language: x.language })),
                library: d.libraryItems.map(x => ({ id: x.id, sourceId: x.sourceId ?? '', status: x.status, completion: x.completion ?? 0 })),
                evidence: d.inputEvidence.map(x => ({ sessionId: x.sessionId, type: x.evidenceType, confidence: x.confidence })),
                passages: d.passages.map(p => ({ id: p.id, inputSourceId: p.sourceMetadata?.inputSourceId ?? '', transcriptId: p.sourceMetadata?.transcriptId ?? '' })),
                sentences: d.sentences.length,
                plans: d.dailyPlans.map(p => ({ date: p.date, input: p.initialPlan.filter(t => t.module === 'input').length })),
            };
        },
        async recommendations() {
            const d = await loadData();
            const profile = normalizeProfile(d.settings.interests, Date.now());
            const rec = recommendInputs({ data: d, profile, signals: inputActivitySignals(d, Date.now()), now: Date.now(), availableMinutes: 30, energy: 'normal' });
            return { note: rec.note, target: rec.target, candidates: rec.candidates.map(c => ({ sourceId: c.sourceId, topic: c.topic, reasonKind: c.reasonKind, reasonTag: c.reasonTag, exploration: c.exploration, repeat: c.repeat, difficulty: c.difficulty.estimate, facts: c.facts })) };
        },
        async analytics() { return inputAnalytics(await loadData(), Date.now()); },
        async candidates(sourceId: string) {
            const d = await loadData();
            const t = d.transcripts.find(x => x.sourceId === sourceId);
            if (!t)
                return { cues: [], candidates: [] };
            return { cues: t.cues.map(c => ({ text: c.text, words: c.text.trim().split(/\s+/).length })), candidates: sentenceCandidates(t, { limit: 6, minWords: 8 }).map(c => c.text) };
        },
        async backupJson() { return backup(await loadData()); },
        async restoreJson(text: string) {
            const parsed = validateBackup(JSON.parse(text));
            await replaceData(parsed);
            data = await loadData();
            reindex();
            render();
            return { ok: true, words: data.words.length, interests: data.settings.interests?.topics.length ?? 0, sources: data.inputSources.length };
        },
        async start(sourceId: string, mode: 'light' | 'standard' | 'deep' = 'standard', minutes = 12, unitId: string | null = null) {
            const r = await inputActions.startInputAction(await loadData(), { sourceId, mode, minutes, miniUnitId: unitId });
            return r.ok ? { ok: true, id: r.value.id } : { ok: false, message: r.message };
        },
        async reflect(id: string, payload: Record<string, unknown>) {
            const d = await loadData();
            const s = d.inputSessions.find(x => x.id === id);
            if (!s)
                return { ok: false, message: 'missing' };
            const r = await inputActions.reflectionAction(id, s.revision, payload as never);
            return r.ok ? { ok: true, revision: r.value.revision, completion: r.value.reflection?.completion ?? 0 } : { ok: false, message: r.message };
        },
        async complete(id: string) {
            const d = await loadData();
            const s = d.inputSessions.find(x => x.id === id);
            if (!s)
                return { ok: false, message: 'missing' };
            const r = await inputActions.sessionAction(id, s.revision, 'complete');
            return r.ok ? { ok: true, status: r.value.status } : { ok: false, message: r.message };
        },
    };
    // Phase 9 验收钩子：仅测试构建存在（__ERV2_TEST_HOOKS__），生产会被摇树移除
    (window as unknown as Record<string, unknown>).__outputTest = {
        async snapshot() {
            const d = await loadData();
            return {
                attempts: d.outputAttempts.map(a => ({
                    id: a.id, taskType: a.taskType ?? '', source: a.sourceType, sourceId: a.sourceId ?? '',
                    status: a.status ?? 'draft', revision: a.revision ?? 1, draft: a.draftText ?? '',
                    final: a.finalText ?? '', original: a.originalText ?? '', words: a.wordCount ?? 0,
                    feedback: a.feedbackStatus ?? 'none', source2: a.feedbackSource ?? 'none',
                    supportLevel: a.supportLevel ?? 0, evidence: a.productiveEvidence ?? [],
                    revisions: (a.revisions ?? []).map(r => ({ kind: r.kind, sim: r.similarityToSuggestion })),
                    meaning: a.feedback?.meaningAssessment ?? '', basis: a.feedback?.meaningBasis ?? '',
                    suggestion: a.feedback?.upgrade?.suggested ?? '', scoped: a.feedback?.feedbackScope ?? '',
                    repair: a.repair ? { preserved: a.repair.meaningPreserved, basis: a.repair.evidenceBasis } : null,
                    issues: a.feedback?.priorityIssues?.length ?? 0, completed: a.completedAt ?? null,
                    transferOf: a.transferOf ?? null, readingSessionId: a.readingSessionId ?? null,
                    inputSessionId: a.inputSessionId ?? null,
                })),
                analytics: outputAnalytics(d),
                wordScores: d.words.map(w => ({ id: w.id, en: w.en, productiveScore: w.productiveScore ?? 0, productionEvidence: w.productionEvidence ?? 0 })),
                candidates: selectOutputTasks({ data: d, now: Date.now(), availableMinutes: 20, energy: 'normal' }).candidates.map(c => ({ id: c.id, type: c.taskType, source: c.sourceType, sourceId: c.sourceId })),
                plans: d.dailyPlans.map(p => ({ date: p.date, output: p.initialPlan.filter(t => t.module === 'output').length })),
                settings: { endpoint: d.settings.ai?.endpoint ?? '', model: d.settings.ai?.model ?? '' },
            };
        },
        async start(type: string, topic: string, initialText = '', level = 0, targetWords: string[] = []) {
            const task = buildOutputTask({ taskType: type as never, topic, sourceType: 'free', now: Date.now(), targetWords, targetGrammar: [] });
            const r = await createOutputAttempt({ task, initialDraft: initialText, sourceProvenance: 'user_text' });
            if (!r.ok)
                return { ok: false, message: r.message };
            if (level)
                await submitOutputAttempt(r.value.id, r.value.revision, initialText, { supportLevel: level as never });
            return { ok: true, id: r.value.id };
        },
        async startFromInput(sessionId: string) {
            const d = await loadData();
            const h = handoutFromInput(d, sessionId);
            if (!h.ok)
                return { ok: false, message: h.message };
            const r = await createOutputAttempt({ task: h.value.task, initialDraft: h.value.text, inputSessionId: sessionId, sourceProvenance: 'user_text+input_summary' });
            return r.ok ? { ok: true, id: r.value.id, text: h.value.text } : { ok: false, message: r.message };
        },
        async save(id: string, text: string) {
            const d = await loadData();
            const a = d.outputAttempts.find(x => x.id === id);
            if (!a)
                return { ok: false, message: 'missing' };
            const r = await saveDraft(id, a.revision, text);
            return r.ok ? { ok: true, revision: r.value.revision } : { ok: false, message: r.message };
        },
        async submit(id: string, text: string, level = 0, repair?: {
            meaning: string;
            blocked: string;
        }) {
            const d = await loadData();
            const a = d.outputAttempts.find(x => x.id === id);
            if (!a)
                return { ok: false, message: 'missing' };
            const r = await submitOutputAttempt(id, a.revision, text, { supportLevel: level as never });
            if (!r.ok)
                return { ok: false, message: r.message };
            if (repair && a.task) {
                const ev = evaluateRepair({ intendedMeaning: repair.meaning, blockedExpression: repair.blocked, userAlternative: text, basis: 'self_reported', supportLevel: level as never, now: Date.now(), source: 'user' });
                await attachRepair(id, r.value.revision, ev.record);
            }
            return { ok: true, revision: r.value.revision, status: r.value.status };
        },
        async feedback(id: string) {
            const d = await loadData();
            const a = d.outputAttempts.find(x => x.id === id);
            if (!a)
                return { ok: false, message: 'missing' };
            const r = await requestOutputFeedback(id, a.revision, {
                data: d, materialText: outputMaterial(a),
                grammarConceptIds: d.grammarConcepts.map(c => c.id),
                targetWordIds: (a.targetWords ?? []).map(en => d.words.find(w => w.en.toLowerCase() === en.toLowerCase())?.id).filter((x): x is string => !!x),
            });
            return r.ok ? { ok: true, message: r.value.message, status: r.value.attempt.feedbackStatus ?? '' } : { ok: false, message: r.message };
        },
        async revise(id: string, text: string) {
            const d = await loadData();
            const a = d.outputAttempts.find(x => x.id === id);
            if (!a)
                return { ok: false, message: 'missing' };
            const r = await reviseOutput(id, a.revision, text, { suggestion: a.feedback?.upgrade?.suggested ?? null, supportLevel: (a.supportLevel ?? 0) as never });
            return r.ok ? { ok: true, revision: r.value.revision, kind: (r.value.revisions ?? []).slice(-1)[0]?.kind ?? '' } : { ok: false, message: r.message };
        },
        async finish(id: string) {
            const d = await loadData();
            const a = d.outputAttempts.find(x => x.id === id);
            if (!a)
                return { ok: false, message: 'missing' };
            const r = await finishOutput(id, a.revision, d);
            return r.ok ? { ok: true, status: r.value.status, evidence: r.value.productiveEvidence?.length ?? 0, revision: r.value.revision } : { ok: false, message: r.message };
        },
        async transfer(id: string) {
            const d = await loadData();
            const a = d.outputAttempts.find(x => x.id === id);
            if (!a || !a.task)
                return { ok: false, message: 'missing' };
            const plan = buildOutputTransfer(a.task, { now: Date.now(), seed: a.id });
            const r = await createOutputAttempt({ task: plan.task, transferOf: a.id, sourceProvenance: 'user_text' });
            return r.ok ? { ok: true, id: r.value.id, topic: plan.task.topic, strength: plan.strength } : { ok: false, message: r.message };
        },
        async setAI(endpoint: string, model: string) {
            const d = await loadData();
            d.settings.ai = { ...(d.settings.ai ?? {}), endpoint, model, key: 'test-key', structuredMode: 'auto' } as never;
            await saveSettings(d.settings);
            data = await loadData();
            return { ok: true };
        },
        async clearAI() {
            const d = await loadData();
            d.settings.ai = { ...(d.settings.ai ?? {}), key: '' } as never;
            await saveSettings(d.settings);
            data = await loadData();
            return { ok: true };
        },
        check(text: string) { return localChecks(text); },
        canShowModelAnswer: (status: string | null, level = 0) => canShowModelAnswer(status ? { status, supportLevel: level } : null),
    };
    // Phase 10 验收钩子：仅测试构建存在，生产被摇树移除
    (window as unknown as Record<string, unknown>).__diagnosticsTest = {
        async snapshot(days = 7) {
            const d = await loadData();
            const payload = buildDiagnostics(d, { now: Date.now(), days, previous: latestSnapshot(d.skillSnapshots) });
            return {
                days,
                metrics: payload.metrics.map(m => ({ id: m.id, domain: m.domain, value: m.value, evaluability: m.evaluability, quality: m.quality, numerator: m.numerator, denominator: m.denominator, sample: m.sample })),
                retention: payload.retention,
                evidence: payload.evidence,
                bottleneck: payload.bottleneck,
                plan: payload.plan,
                comparison: payload.comparison,
                disclaimer: payload.disclaimer,
                snapshots: d.skillSnapshots.map(s => ({ id: s.id, date: s.date, hasPayload: !!s.diagnostics })),
                weekly: d.weeklyDiagnostics.map(w => ({ id: w.id, weekOf: w.weekOf, hasPayload: !!w.diagnostics })),
            };
        },
        async generate(days = 7) {
            const snap = await generateSnapshot(await loadData(), Date.now(), days);
            const d = await loadData();
            return { ok: true, id: snap.id, date: snap.date, count: d.skillSnapshots.length, hasPayload: !!snap.diagnostics };
        },
        async weekly(days = 7) {
            const week = await generateWeekly(await loadData(), Date.now(), days);
            const d = await loadData();
            return { ok: true, id: week.id, weekOf: week.weekOf, count: d.weeklyDiagnostics.length, hasPayload: !!week.diagnostics };
        },
        async plan(days = 7, minutes = 40) {
            const d = await loadData();
            const focus = buildDiagnostics(d, { now: Date.now(), days }).bottleneck;
            const { plan } = createDailyPlan({ ...planInput(minutes, 'normal'), diagnosticFocus: focus });
            return { focus: focus?.domain ?? null, order: plan.initialPlan.map(t => ({ module: t.module ?? '', priority: t.priority ?? 0, minutes: t.minutes, reason: t.reason ?? [] })), reasons: ((plan.budget as {
                    reasons?: string[];
                } | null)?.reasons ?? []) };
        },
    };
    // Phase 11 验收钩子：仅测试构建存在；生产被摇树移除
    (window as unknown as Record<string, unknown>).__examTest = {
        async snapshot() {
            const d = await loadData();
            return {
                specs: (d.examSpecifications ?? []).map(s => ({ id: s.id, year: s.applicableYear, category: s.examCategory, status: s.status, total: s.totalScore, written: s.writtenScore, oral: s.listeningSpeakingScore, sources: s.sourceRefs.length })),
                items: (d.examItems ?? []).map(i => ({ id: i.id, type: i.questionType, provenance: i.provenance, verified: i.verifiedStatus, options: i.options.length, key: i.answerKey })),
                sessions: (d.examSessions ?? []).map(x => ({ id: x.id, mode: x.mode, status: x.status, items: x.itemIds, itemsDetail: x.items.map(i => ({ id: i.id, type: i.questionType, options: i.options.length, key: i.answerKey })), answers: Object.keys(x.answers).length, score: x.score, scoreStatus: x.scoreStatus, errors: x.errors.map(e => ({ item: e.itemId, category: e.category, confidence: e.confidence })), unavailable: x.unavailableSections ?? [], weeklyReportId: x.weeklyReportId ?? null })),
                logs: (d.examLogs ?? []).map(l => ({ id: l.id, date: l.date, name: l.examName ?? l.name, type: l.examType ?? 'school_exam', category: l.examCategory, year: l.applicableYear ?? null, specId: l.specId ?? null, score: l.reportedScore, full: l.fullScore, source: l.scoreSource ?? l.source, scoreBasis: l.scoreBasis ?? 'custom_total', clueOnly: l.clueOnly ?? true, conflictAcknowledged: l.conflictAcknowledged ?? false, note: l.selfAssessment })),
                planEnabled: d.settings.exam?.planEnabled ?? false,
                current: examSessionId,
                words: d.words.length,
                reviewedWords: d.words.filter(w => w.state.total > 0).length,
                wordSample: d.words.slice(0, 20).map(w => ({ en: w.en, zh: w.zh, total: w.state.total })),
            };
        },
        async seedWeekly() {
            const d = await loadData();
            const now = Date.now();
            if (new Set(d.words.filter(w => w.state.total > 0).map(w => w.zh.trim())).size < 4) {
                const words = Array.from({ length: 8 }, (_, i) => ({
                    id: `seed-w${i}-${now}`, bookId: 'seed-book', en: `seedword${i}`, zh: `种子释义${i}`, pos: 'n.', phonetic: '', example: '', collocation: '', difficulty: '', tags: '', order: i,
                    schedule: { due: 0, last: now, interval: 1, step: 1, spacedPasses: 1 },
                    state: { total: 3, correct: 2, streak: 1, errors: 1, lapses: 0, meanMs: 1200, lastMs: 1100, level: 'normal', lastCorrect: true, directions: { 'en-zh': { total: 2, correct: 1, meanMs: 1200 }, 'zh-en': { total: 1, correct: 1, meanMs: 1200 } } },
                    confusions: {}, fsrs: null,
                }));
                await putItems('books', [{ id: 'seed-book', name: '周测种子词书', created: now }]);
                await putItems('words', words);
            }
            if (!(d.passages ?? []).length) {
                await putItems('passages', [{ id: 'seed-passage', title: 'Seed Article', text: 'A short article about attention and learning. '.repeat(10), sourceType: 'import', sourceUrl: 'https://example.com/seed', topic: 'learning', wordCount: 70, difficulty: 'normal', createdAt: now }]);
            }
            data = await loadData();
            return { words: data.words.length, passages: data.passages.length };
        },
        async resetSessions() { await clearExamSessions(); data = await loadData(); examSessionId = ''; return { ok: true }; },
        async resetLogs() { await clearExamLogs(); data = await loadData(); examLogEditingId = ''; return { ok: true }; },
        async exportLogs() { return exportExamLogs(await loadData().then(d => d.examLogs ?? [])); },
        async importLogs(text: string) {
            const parsed = parseExamLogsExport(text, examSpecList());
            for (const log of parsed.logs)
                await saveExamLog(log);
            data = await loadData();
            return { ok: parsed.ok, imported: parsed.logs.length, errors: parsed.errors };
        },
        async weeklyPreview() { const d = await loadData(); const b = buildWeeklyAssessment(d, d.examItems ?? [], d.examSessions ?? [], Date.now()); return { items: b.items.map(i => ({ id: i.id, type: i.questionType, stem: i.stem.slice(0, 40) })), minutes: b.minutes, unavailable: b.unavailable }; },
        async startWeekly() { await startWeeklyExam(); return { ok: !!examSessionId, id: examSessionId }; },
        async startMixed() {
            const fresh = freshExamItems(data.examItems ?? [], data.examSessions ?? []);
            if (!fresh.length)
                return { ok: false };
            await startExamItems(fresh.slice(0, 6).map(i => i.id));
            return { ok: !!examSessionId, id: examSessionId };
        },
        async answer(itemId: string, value: string) {
            const cur = currentExam();
            if (!cur)
                return { ok: false };
            const r = saveExamAnswer(cur, { itemId, value, timeMs: 1000, now: Date.now() });
            if (!r.session)
                return { ok: false };
            await persistExam(r.session, cur.revision);
            return { ok: true };
        },
        async submit() {
            const cur = currentExam();
            if (!cur)
                return { ok: false };
            await submitExamFlow(cur);
            return { ok: true, status: currentExam()?.status };
        },
        async complete() {
            const cur = currentExam();
            if (!cur)
                return { ok: false };
            await completeExamFlow(cur);
            return { ok: true, status: currentExam()?.status };
        },
        async setPlan(on: boolean) { const d = await loadData(); d.settings.exam = { planEnabled: on }; await saveSettings(d.settings); data = await loadData(); return { ok: true, on: data.settings.exam?.planEnabled ?? false }; },
    };
    // OCR 验收钩子：只暴露“跑一次识别 / 释放”，不改学习证据；用于失败注入与超时验证
    (window as unknown as Record<string, unknown>).__ocrTest = {
        async recognize(file: Blob, opts: {
            timeoutMs?: number;
        } = {}) {
            try {
                const r = await ocrService.recognize(file, opts);
                return { ok: true, text: r.text, confidence: r.confidence, loaded: ocrService.loaded };
            }
            catch (e) {
                return { ok: false, code: e instanceof OcrError ? e.failure.code : 'unknown', message: e instanceof OcrError ? e.failure.message : String(e) };
            }
        },
        // 失败注入：把资源指到一个不存在的地址，验证真实引擎的报错与分类（不是 mock）
        async recognizeWithPaths(file: Blob, paths: Record<string, string>, opts: {
            timeoutMs?: number;
        } = {}) {
            const svc = ocrServiceWithPaths(paths);
            try {
                const r = await svc.recognize(file, opts);
                return { ok: true, text: r.text, confidence: r.confidence };
            }
            catch (e) {
                return { ok: false, code: e instanceof OcrError ? e.failure.code : 'unknown', message: e instanceof OcrError ? e.failure.message : String(e) };
            }
            finally {
                await svc.dispose();
            }
        },
        async dispose() { await ocrService.dispose(); return { loaded: ocrService.loaded }; },
        loaded() { return ocrService.loaded; },
    };
}
// ———————————————— Phase 5：Reading Lab UI（消费层；算法都在 reading*.ts 里） ————————————————
function readingDifficultyFor(passage: Passage): ReadingDifficultyReport {
    const weak = weakConcepts(GRAMMAR_TAXONOMY, data.grammarAttempts).length;
    return estimateReadingDifficulty({
        sentences: passage.sentences ?? [], text: passage.text,
        model: {
            words: data.words, grammarWeakCount: weak,
            knownVocabSize: data.words.filter(w => (w.state?.total ?? 0) > 0).length,
        },
    });
}
function refreshReadTokens(): void {
    if (!readSession || !readPassage)
        return;
    const chunk = readSession.detail?.chunks[readSession.detail.chunkIndex];
    const sentences = readPassage.sentences ?? [];
    const inChunk = sentences.filter(x => chunk && x.start >= chunk.start && x.end <= chunk.end);
    readTokens = inChunk.flatMap(x => tokenizeSentence(readPassage!.text, x));
}
function upsertReadSession(session: ReadingSession): void {
    const exists = data.readingSessions.some(s => s.id === session.id);
    data.readingSessions = exists ? data.readingSessions.map(s => (s.id === session.id ? session : s)) : [...data.readingSessions, session];
    readSession = session;
}
async function persistReading(extra: {
    words?: Word[];
    exposures?: WordExposure[];
    passages?: Passage[];
} = {}): Promise<void> {
    if (!readSession)
        return;
    try {
        await saveReadingProgress({ session: readSession, ...extra });
        upsertReadSession(readSession);
    }
    catch (e) {
        toast(`阅读进度保存失败（本地内存仍保留）：${(e as Error).message}`);
    }
}
function readingHelpText(level: number, sentenceText: string): string {
    if (!sentenceText)
        return '';
    if (level <= 1)
        return '<p class="hint">先找谓语：哪个词带时态/语态？再问“谁做了这件事”。</p>';
    const analysis = heuristicStructureFor(sentenceText);
    const main = analysis.clauses.find(c => c.parentId === null) ?? analysis.clauses[0];
    const mainText = main ? `${main.start}–${main.end}` : '';
    const clauseList = analysis.clauses.map(c => `<li>${c.kind === 'main' ? '主句' : CLAUSE_LABELS[c.kind]}：词 ${c.start + 1}–${c.end + 1}${c.parentId ? '（依附上文）' : ''}</li>`).join('');
    if (level === 2)
        return `<p class="hint">主干在词 ${mainText.split('–').map(n => Number(n) + 1).join('–') || '?'}：先把这一截读成一句话，再挂修饰。</p>`;
    if (level === 3)
        return `<div class="grammar-card"><p><b>结构（自动分析，可能不准）</b></p><ul class="plain-list">${clauseList}</ul><p class="hint">从句不能独立成句：先读主句，再把从句当成一个“大形容词/大状语”。</p></div>`;
    return `<div class="grammar-card"><p><b>完整讲解（自动分析，可能不准）</b></p><ul class="plain-list">${clauseList}</ul><p class="hint">读法：主句 → 从句引导词 → 从句内部主谓 → 非谓语挂在哪。看完这段讲解后，本次理解只记接触。</p></div>`;
}
function heuristicStructureFor(text: string) {
    return readStructure(heuristicStructure(uid(), text), '', text).structure!;
}
function openReadingMaterial(passage: Passage, sessionId: string | null): void {
    readPassage = passage;
    readDifficulty = readingDifficultyFor(passage);
    readMessage = '';
    readHelpState = { show: false, text: '' };
    readSelectedToken = null;
    const existing = sessionId ? data.readingSessions.find(s => s.id === sessionId) ?? null : null;
    const unfinished = existing && isResumable(existing) ? existing : latestOpenSession(data.readingSessions.filter(s => s.passageId === passage.id));
    readSession = unfinished ?? null;
    readView = 'preview';
    page = 'reading';
    render();
}
function readingPage(): void {
    if (page !== 'reading')
        return;
    if (readView === 'preview' && readPassage)
        return readingPreview();
    if (readView === 'cold' && readSession)
        return readingCold();
    if (readView === 'reader' && readSession && readPassage)
        return readingReader();
    if (readView === 'reread' && readSession)
        return readingReread();
    if (readView === 'whole' && readSession)
        return readingWhole();
    if (readView === 'result' && readSession && readPassage)
        return readingResult();
    if (readView === 'words' && readSession)
        return readingWords();
    return readingLibrary();
}
function readingLibrary(): void {
    const rows = queryLibrary(data.passages, data.readingSessions, readLibraryQuery);
    const trend = computeReadingTrend(data.readingSessions);
    const open = latestOpenSession(data.readingSessions);
    const list = rows.slice(0, 30).map(r => `<tr data-state="${r.unfinished ? 'unfinished' : r.completed ? 'read' : 'unread'}">
      <td><b>${resc(r.passage.title)}</b><br><small class="hint">${resc(sourceLabel(r.passage))} · ${resc(r.passage.topic)} · ${r.passage.wordCount} 词${r.completed ? ` · 已读 ${r.completed} 次` : ''}${r.unfinished ? ` · <span class="badge vague">未完成 ${sessionProgress(r.unfinished).percent}%</span>` : ''}</small></td>
      <td>${r.passage.estimatedDifficulty ? r.passage.estimatedDifficulty.toFixed(1) : '—'}</td>
      <td><button class="primary small" data-read-open="${r.passage.id}">${r.unfinished ? '继续阅读' : r.completed ? '再读一次' : '开始阅读'}</button></td>
    </tr>`).join('') || '<tr><td colspan="3" class="empty-cell">还没有阅读材料。先在下面导入一篇真实英文文章。</td></tr>';
    $('#main').innerHTML = `<div id="reading-page">${title('READING LAB', '阅读', '先直接读英文；只有在真的卡住时才要辅助。阅读不会自动提高任何单词的掌握度。')}
      <div class="metrics">
        ${metric('阅读库', String(data.passages.length), '真实导入的材料')}
        ${metric('完成阅读', String(trend.completed), trend.sampleNote)}
        ${metric('首读速度', trend.avgFirstWpm === null ? '—' : String(trend.avgFirstWpm), '词/分钟（估算）')}
        ${metric('显式生词率', trend.avgExplicitUnknownRate === null ? '—' : `${trend.avgExplicitUnknownRate}%`, '只统计你标记过的词')}
      </div>
      ${open ? `<section class="panel"><div class="section-title">上次没读完</div><p class="hint">${resc(open.detail?.passageTitle ?? '')} · ${esc(sessionProgress(open).label)} · ${sessionProgress(open).percent}%</p><div class="actions"><button class="primary" data-read-resume-open="${open.id}">继续阅读</button></div></section>` : ''}
      ${readMessage ? `<p class="hint warn">${resc(readMessage)}</p>` : ''}
      ${importPanelHTML()}
      ${aiReadingPanelHTML()}
      <section class="panel"><div class="section-title">阅读库</div>
        <div class="actions">
          <input id="read-search" placeholder="搜索标题或正文" value="${resc(readLibraryQuery.text ?? '')}" />
          <select id="read-filter"><option value="all"${readLibraryQuery.readState === 'all' ? ' selected' : ''}>全部</option><option value="unread"${readLibraryQuery.readState === 'unread' ? ' selected' : ''}>未读</option><option value="unfinished"${readLibraryQuery.readState === 'unfinished' ? ' selected' : ''}>未完成</option><option value="read"${readLibraryQuery.readState === 'read' ? ' selected' : ''}>已读</option></select>
        </div>
        <div class="table-scroll"><table><thead><tr><th>文章</th><th>难度</th><th>操作</th></tr></thead><tbody>${list}</tbody></table></div>
      </section></div>`;
    wireReadingLibrary();
}
function wireReadingLibrary(): void {
    const paste = document.querySelector<HTMLTextAreaElement>('#read-paste');
    const count = document.querySelector<HTMLElement>('#read-count');
    const updateCount = () => {
        if (!paste || !count)
            return;
        const parsed = parsePassageText(paste.value);
        count.textContent = `${parsed.wordCount} 词 · ${parsed.paragraphs.length} 段 · ${parsed.sentences.length} 句`;
    };
    paste?.addEventListener('input', updateCount);
    updateCount();
    on('#read-search', 'input', e => { readLibraryQuery = { ...readLibraryQuery, text: (e.target as HTMLInputElement).value }; render(); });
    on('#read-filter', 'change', e => { readLibraryQuery = { ...readLibraryQuery, readState: (e.target as HTMLSelectElement).value as LibraryQuery['readState'] }; render(); });
    document.querySelectorAll<HTMLElement>('[data-read-open]').forEach(b => b.addEventListener('click', () => {
        const p = data.passages.find(x => x.id === b.dataset.readOpen);
        if (p)
            openReadingMaterial(p, null);
    }));
    document.querySelectorAll<HTMLElement>('[data-read-resume-open]').forEach(b => b.addEventListener('click', () => {
        const s = data.readingSessions.find(x => x.id === b.dataset.readResumeOpen);
        const p = s ? data.passages.find(x => x.id === s.passageId) : null;
        if (s && p)
            openReadingMaterial(p, s.id);
    }));
    document.querySelectorAll<HTMLElement>('[data-read-file-label]').forEach(b => b.addEventListener('click', () => document.querySelector<HTMLInputElement>('#read-file')?.click()));
    on('#read-file', 'change', async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file)
            return;
        const text = await file.text();
        if (paste)
            paste.value = text;
        updateCount();
        const res = importFromFile({ name: file.name, data: text });
        readMessage = res.ok ? `已读取 ${file.name}：${res.value.wordCount} 词，点“预览并保存”继续。` : `${res.error.message}${res.error.hint ? `（${res.error.hint}）` : ''}`;
        render();
    });
    on('[data-read-save]', 'click', async () => {
        const title = document.querySelector<HTMLInputElement>('#read-title')?.value ?? '';
        const topic = document.querySelector<HTMLInputElement>('#read-topic')?.value ?? '';
        const raw = paste?.value ?? '';
        const shortOk = document.querySelector<HTMLInputElement>('#read-allow-short')?.checked ?? false;
        const res = buildPastedDraft({ raw, title, topic, allowShort: shortOk });
        if (!res.ok) {
            readMessage = `${res.error.message}${res.error.hint ? `（${res.error.hint}）` : ''}`;
            render();
            return;
        }
        await saveDraftAndPreview(res.value);
    });
    on('[data-read-url-open]', 'click', () => { document.querySelector<HTMLElement>('#read-url-box')?.removeAttribute('hidden'); });
    on('[data-read-fetch]', 'click', async () => {
        const url = document.querySelector<HTMLInputElement>('#read-url')?.value ?? '';
        const msg = document.querySelector<HTMLElement>('#read-url-msg');
        if (msg)
            msg.textContent = '正在抓取……';
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        try {
            const resp = await fetch(url, { signal: controller.signal, credentials: 'omit' });
            clearTimeout(timer);
            if (!resp.ok) {
                const failure = classifyFetchFailure({ status: resp.status });
                if (msg)
                    msg.textContent = `${failure.message}${failure.hint}`;
                return;
            }
            const html = await resp.text();
            const res = buildUrlDraft({ url, html });
            if (!res.ok) {
                if (msg)
                    msg.textContent = `${res.error.message}${res.error.hint}`;
                return;
            }
            await saveDraftAndPreview(res.value);
        }
        catch (err) {
            clearTimeout(timer);
            const aborted = (err as Error).name === 'AbortError';
            const failure = classifyFetchFailure({ timedOut: aborted, cors: !aborted });
            if (msg)
                msg.textContent = `${failure.message}${failure.hint}`;
        }
    });
    on('[data-read-ocr-open]', 'click', () => {
        document.querySelector<HTMLElement>('#read-ocr-box')?.removeAttribute('hidden');
    });
    // —— 截图 OCR（Phase 5.1）：本地识别 → 用户可改 → 必须确认 → 才入库 ——
    let ocrFile: File | null = null;
    let ocrAbort: AbortController | null = null;
    let ocrMode: 'local' | 'manual' = 'local';
    let ocrConfidence: number | null = null;
    const ocrQ = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel);
    const ocrToggle = (sel: string, show: boolean) => {
        const el = ocrQ<HTMLElement>(sel);
        if (el)
            el.hidden = !show;
    };
    const ocrSay = (html: string) => {
        const m = ocrQ<HTMLElement>('#read-ocr-msg');
        if (m)
            m.innerHTML = html;
    };
    const ocrReset = () => {
        ocrToggle('[data-read-ocr-run]', false);
        ocrToggle('[data-read-ocr-cancel]', false);
        ocrToggle('[data-read-ocr-manual]', false);
        ocrToggle('#read-ocr-progress', false);
        ocrToggle('#read-ocr-edit-wrap', false);
        ocrToggle('#read-ocr-confirm-wrap', false);
        ocrToggle('#read-ocr-save-wrap', false);
    };
    on('#read-image', 'change', () => {
        const input = document.querySelector<HTMLInputElement>('#read-image');
        const file = input?.files?.[0] ?? null;
        ocrFile = file;
        ocrMode = 'local';
        ocrConfidence = null;
        ocrReset();
        const preview = ocrQ<HTMLImageElement>('#read-ocr-preview');
        if (preview) {
            preview.hidden = true;
            preview.removeAttribute('src');
        }
        if (!file) {
            ocrSay('没有选中图片。');
            return;
        }
        const bad = checkImage({ name: file.name, type: file.type, size: file.size });
        if (bad) {
            ocrSay(`${resc(bad.message)} ${resc(bad.hint)}`);
            ocrToggle('[data-read-ocr-manual]', true);
            ocrToggle('#read-ocr-edit-wrap', true);
            return;
        }
        if (preview) {
            preview.src = URL.createObjectURL(file);
            preview.hidden = false;
        }
        ocrSay(`${resc(file.name)} · ${(file.size / 1024).toFixed(0)}KB。点“开始本地识别”：图片只会在这台设备上被读取，不会上传。`);
        ocrToggle('[data-read-ocr-run]', true);
    });
    on('[data-read-ocr-run]', 'click', async () => {
        const file = ocrFile;
        if (!file)
            return;
        ocrMode = 'local';
        ocrConfidence = null;
        ocrAbort = new AbortController();
        const bar = ocrQ<HTMLProgressElement>('#read-ocr-progress');
        if (bar) {
            bar.hidden = false;
            bar.value = 0;
        }
        ocrToggle('[data-read-ocr-run]', false);
        ocrToggle('[data-read-ocr-cancel]', true);
        ocrToggle('#read-ocr-edit-wrap', false);
        ocrToggle('#read-ocr-save-wrap', false);
        ocrToggle('#read-ocr-confirm-wrap', false);
        ocrSay('正在加载 OCR 引擎和英文模型（首次约 3MB，之后会缓存）……');
        try {
            const res = await ocrService.recognize(file, {
                signal: ocrAbort.signal,
                onProgress: p => {
                    if (bar)
                        bar.value = p.progress;
                    const msg = ocrQ<HTMLElement>('#read-ocr-msg');
                    if (msg)
                        msg.textContent = `${p.label} —— 识别在本机进行，图片没有离开这台设备。`;
                },
            });
            ocrConfidence = res.confidence === null ? null : res.confidence / 100;
            const box = ocrQ<HTMLTextAreaElement>('#read-ocr-text');
            if (box)
                box.value = res.text;
            ocrToggle('#read-ocr-edit-wrap', true);
            ocrToggle('#read-ocr-confirm-wrap', true);
            ocrToggle('#read-ocr-save-wrap', true);
            ocrToggle('[data-read-ocr-manual]', true);
            const conf = res.confidence === null ? '引擎未给出置信度' : `引擎置信度 ${Math.round(res.confidence)}%`;
            ocrSay(`识别完成（${resc(conf)}，${res.text.length} 个字符）。OCR 一定会有错字：请逐句核对、直接修改，再勾选确认。`);
        }
        catch (err) {
            const failure = err instanceof OcrError ? err.failure : classifyOcrFailure(err);
            ocrSay(`<strong>${resc(failure.message)}</strong><br>${resc(failure.hint)}`);
            ocrToggle('[data-read-ocr-manual]', true);
            if (failure.code !== 'aborted') {
                ocrToggle('[data-read-ocr-run]', true);
                const box = ocrQ<HTMLTextAreaElement>('#read-ocr-text');
                if (box && !box.value)
                    ocrToggle('#read-ocr-edit-wrap', true);
            }
        }
        finally {
            ocrAbort = null;
            ocrToggle('[data-read-ocr-cancel]', false);
            const bar2 = ocrQ<HTMLProgressElement>('#read-ocr-progress');
            if (bar2)
                bar2.hidden = true;
        }
    });
    on('[data-read-ocr-cancel]', 'click', () => {
        ocrAbort?.abort();
        ocrSay('正在取消……（引擎会一起释放，不会留在后台跑）');
    });
    on('[data-read-ocr-manual]', 'click', () => {
        ocrMode = 'manual';
        ocrConfidence = null;
        ocrToggle('#read-ocr-edit-wrap', true);
        ocrToggle('#read-ocr-confirm-wrap', true);
        ocrToggle('#read-ocr-save-wrap', true);
        const box = ocrQ<HTMLTextAreaElement>('#read-ocr-text');
        if (box && !box.value)
            box.placeholder = '把截图里的英文照着录入到这里……';
        ocrSay('手动录入：照着截图打字。保存后会记为“人工转录”，不会假装是 OCR 识别出来的。');
        box?.focus();
    });
    on('[data-read-ocr-save]', 'click', async () => {
        const file = ocrFile;
        const box = ocrQ<HTMLTextAreaElement>('#read-ocr-text');
        const confirmed = ocrQ<HTMLInputElement>('#read-ocr-confirm')?.checked === true;
        if (!file || !box)
            return;
        if (!confirmed) {
            ocrSay('请先核对下面的文字、改掉错字，并勾选“我已核对”。OCR 结果未经核对不能入库。');
            return;
        }
        const res = ocrMode === 'local'
            ? buildImageDraft({ text: box.value, imageName: file.name, method: 'local', confidence: ocrConfidence ?? undefined, userConfirmed: true, allowShort: true })
            : buildManualImageDraft({ text: box.value, imageName: file.name, userConfirmed: true, allowShort: true });
        if (!res.ok) {
            ocrSay(`${resc(res.error.message)} ${resc(res.error.hint)}`);
            return;
        }
        await saveDraftAndPreview(res.value);
    });
}
async function saveDraftAndPreview(draft: PassageDraft): Promise<void> {
    const dupe = findDuplicate(draft, data.passages);
    if (dupe) {
        readMessage = `这篇内容与《${dupe.title}》相同（同一指纹 ${draft.contentHash}）：已存在就不会重复创建。`;
        openReadingMaterial(dupe, null);
        toast('检测到重复文章：已打开原有那篇');
        return;
    }
    const passage = toPassage(draft);
    passage.estimatedDifficulty = readingDifficultyFor(passage).difficulty;
    try {
        await savePassage(passage);
    }
    catch (e) {
        readMessage = `保存失败：${(e as Error).message}`;
        render();
        return;
    }
    data.passages = [passage, ...data.passages];
    readMessage = '';
    openReadingMaterial(passage, null);
    toast(`已保存《${passage.title}》（${passage.wordCount} 词 / ${passage.sentences?.length ?? 0} 句）`);
}
function readingPreview(): void {
    if (!readPassage)
        return readingLibrary();
    const p = readPassage;
    const unfinished = readSession && isResumable(readSession) ? readSession : null;
    $('#main').innerHTML = `<div id="reading-page">${title('READING', '阅读预览', '先看材料与难度，再决定要不要现在读；首读前不会给你译文。')}
      ${previewHTML({ passage: p, difficulty: readDifficulty, unfinished })}
      ${unfinished ? `<p class="hint">上次读到第 ${(unfinished.detail?.chunkIndex ?? 0) + 1}/${unfinished.detail?.chunks.length ?? 0} 段（${esc(stageLabel(unfinished.detail?.stage ?? 'reading'))}）。</p>` : ''}</div>`;
    document.querySelectorAll<HTMLElement>('[data-read-back]').forEach(b => b.addEventListener('click', () => { readView = 'library'; readPassage = null; readSession = null; render(); }));
    on('[data-read-start]', 'click', async () => {
        if (!readPassage)
            return;
        const ability = (readDifficulty?.classification === 'too-hard' ? 'weak' : readDifficulty?.classification === 'comfort' ? 'strong' : 'normal') as 'weak' | 'normal' | 'strong';
        const session = createReadingSession({ passage: readPassage, now: Date.now(), ability });
        if (readingTask)
            session.dailyPlanTaskId = readingTask.planTaskId;
        const guess = document.querySelector<HTMLInputElement>('#read-guess')?.value?.trim() ?? '';
        upsertReadSession(session);
        if (guess)
            readSession = submitOutput(session, { kind: 'personal-note', text: guess, language: /[\u4e00-\u9fff]/.test(guess) ? 'zh' : 'en', now: Date.now() });
        await persistReading();
        readView = 'cold';
        render();
    });
    on('[data-read-resume]', 'click', () => {
        if (!readSession) {
            readView = 'library';
            render();
            return;
        }
        readSession = { ...readSession, detail: readSession.detail ? { ...readSession.detail, state: 'active' } : readSession.detail };
        readView = readSession.detail?.coldTestDone ? 'reader' : 'cold';
        if (readView === 'reader') {
            readSession = startReading(readSession, Date.now());
            refreshReadTokens();
        }
        render();
    });
}
function readingCold(): void {
    if (!readSession)
        return readingLibrary();
    $('#main').innerHTML = `<div id="reading-page">${title('READING', `冷读：${resc(readPassage?.title ?? '')}`, '这一遍不看译文、不查词。读完（或读不下去）再记录真实状态。')}${coldTestHTML()}</div>`;
    const range = document.querySelector<HTMLInputElement>('#read-cold-self');
    const out = document.querySelector<HTMLOutputElement>('#read-cold-self-out');
    range?.addEventListener('input', () => {
        if (out)
            out.textContent = range.value;
    });
    on('[data-read-cold-submit]', 'click', async () => {
        if (!readSession)
            return;
        const self = Number(range?.value ?? 50);
        const dep = (document.querySelector<HTMLSelectElement>('#read-cold-dep')?.value ?? 'B') as 'A' | 'B' | 'C' | 'D' | 'E';
        let next = submitColdTest(readSession, { selfReport: self, translationDependence: dep, now: Date.now() });
        next = startReading(next, Date.now());
        upsertReadSession(next);
        refreshReadTokens();
        await persistReading();
        readView = 'reader';
        render();
    });
}
function readingReader(): void {
    if (!readSession || !readPassage)
        return readingLibrary();
    const chunk = readSession.detail?.chunks[readSession.detail.chunkIndex];
    const helpText = readHelpState.show ? readHelpState.text : '';
    $('#main').innerHTML = `<div id="reading-page">${readerHTML({ passage: readPassage, session: readSession, tokens: readTokens, helpText, showHelp: readHelpState.show, sideOpen: readSideOpen })}</div>`;
    document.querySelectorAll<HTMLElement>('[data-tok]').forEach(b => b.addEventListener('click', () => {
        const idx = Number(b.dataset.tok);
        readSelectedToken = readTokens.find(t => t.index === idx) ?? null;
        document.querySelectorAll<HTMLElement>('[data-tok]').forEach(x => x.classList.remove('selected'));
        b.classList.add('selected');
        toast(readSelectedToken ? `已选中「${readSelectedToken.surface}」，再点一个标记` : '');
    }));
    document.querySelectorAll<HTMLElement>('[data-mark]').forEach(b => b.addEventListener('click', async () => {
        if (!readSession || !readSelectedToken) {
            toast('先点正文里的一个词');
            return;
        }
        const judgment = (b.dataset.mark ?? 'unknown') as ReadingMark['judgment'];
        const sentence = (readPassage!.sentences ?? []).find(s => s.index === readSelectedToken!.sentenceIndex);
        const result = markWord(readSession, {
            paragraphIndex: readSelectedToken.paragraphIndex, sentenceIndex: readSelectedToken.sentenceIndex,
            tokenIndex: readSelectedToken.index, surface: readSelectedToken.surface,
            contextSentence: sentence?.text ?? '', judgment, now: Date.now(),
        });
        upsertReadSession(result.session);
        await persistReading();
        toast(result.replaced ? `已把「${readSelectedToken.surface}」改成「${judgment === 'unknown' ? '不知道' : judgment === 'vague' ? '模糊' : judgment === 'known' ? '知道' : '猜出'}」` : '已记录');
        render();
    }));
    document.querySelectorAll<HTMLElement>('[data-unmark]').forEach(b => b.addEventListener('click', async () => {
        if (!readSession)
            return;
        upsertReadSession(revokeMark(readSession, b.dataset.unmark ?? '', Date.now()));
        await persistReading();
        render();
    }));
    document.querySelectorAll<HTMLElement>('[data-difficult]').forEach(b => b.addEventListener('click', () => {
        const sentenceIndex = Number(b.dataset.difficult);
        const sentence = (readPassage!.sentences ?? []).find(s => s.index === sentenceIndex);
        if (!sentence || !readSession)
            return;
        modal(`<h2>这句哪里卡住？</h2><p class="hint">${resc(sentence.text.slice(0, 160))}</p>
          <div class="actions">${(Object.keys(PROBLEM_TYPE_LABELS) as ReadingProblemType[]).map(t => `<button class="chip" data-problem="${t}">${PROBLEM_TYPE_LABELS[t]}</button>`).join('')}</div>`);
        document.querySelectorAll<HTMLElement>('[data-problem]').forEach(pb => pb.addEventListener('click', async () => {
            const types = [pb.dataset.problem as ReadingProblemType];
            const before = readPassage!.text.slice(Math.max(0, sentence.start - 160), sentence.start).trim();
            const after = readPassage!.text.slice(sentence.end, Math.min(readPassage!.text.length, sentence.end + 160)).trim();
            const result = captureDifficultSentence(readSession!, { sentence, problemTypes: types, contextBefore: before, contextAfter: after, now: Date.now() });
            upsertReadSession(result.session);
            await persistReading();
            closeModal();
            toast('已标记为难句，可以进拆句训练');
            render();
        }));
    }));
    document.querySelectorAll<HTMLElement>('[data-read-lab]').forEach(b => b.addEventListener('click', () => void openReadingLab(b.dataset.readLab ?? '')));
    document.querySelectorAll<HTMLElement>('[data-read-help]').forEach(b => b.addEventListener('click', async () => {
        if (!readSession)
            return;
        const level = Number(b.dataset.readHelp) as 1 | 2 | 3 | 4;
        const sentence = (readPassage!.sentences ?? []).find(s => (readSelectedToken && s.index === readSelectedToken.sentenceIndex) || s.start >= (chunk?.start ?? 0));
        const type = level <= 2 ? 'grammar-card' : 'sentence-structure';
        upsertReadSession(requestHelp(readSession, { type, level, concept: null, now: Date.now() }));
        readHelpState = { show: true, text: readingHelpText(level, sentence?.text ?? '') };
        await persistReading();
        render();
    }));
    on('[data-read-idea-submit]', 'click', async () => {
        if (!readSession)
            return;
        const text = document.querySelector<HTMLInputElement>('#read-idea')?.value?.trim() ?? '';
        if (!text) {
            toast('先写一句你的理解');
            return;
        }
        upsertReadSession(submitMainIdea(readSession, { text, language: /[\u4e00-\u9fff]/.test(text) ? 'zh' : 'en', assisted: maxHelpLevelUsed(readSession) >= 3, now: Date.now() }));
        await persistReading();
        toast('已记录这一段的理解');
        render();
    });
    on('[data-read-prev]', 'click', () => {
        if (readSession) {
            upsertReadSession(goToChunk(readSession, (readSession.detail?.chunkIndex ?? 0) - 1));
            refreshReadTokens();
            render();
        }
    });
    on('[data-read-next]', 'click', async () => {
        if (!readSession)
            return;
        const detail = readSession.detail!;
        if (detail.chunkIndex + 1 >= detail.chunks.length) {
            await enterReread();
            return;
        }
        upsertReadSession(nextChunk(readSession));
        refreshReadTokens();
        await persistReading();
        render();
    });
    on('[data-read-finish-first]', 'click', async () => {
        if (!readSession)
            return;
        await enterReread();
    });
    // 辅助面板：只切 data-side，不重绘 → 阅读位置与选中词都保留
    document.querySelectorAll<HTMLElement>('[data-reader-side-toggle]').forEach(b => b.addEventListener('click', () => {
        readSideToggled = true;
        readSideOpen = !readSideOpen;
        const surface = document.querySelector<HTMLElement>('.reading-surface');
        if (surface)
            surface.dataset.side = readSideOpen ? 'open' : 'closed';
        document.querySelectorAll<HTMLElement>('[data-reader-side-toggle]').forEach(x => x.setAttribute('aria-expanded', String(readSideOpen)));
        if (readSideOpen)
            document.querySelector<HTMLElement>('#read-side button, #read-side a, #read-side input')?.focus();
        else
            document.querySelector<HTMLElement>('.reader-bar [data-reader-side-toggle]')?.focus();
    }));
    // 视口变化时，未被用户手动开合过的面板跟随"桌面展开 / 窄屏收起"
    if (!sideResizeBound) {
        sideResizeBound = true;
        window.addEventListener('resize', () => {
            if (readSideToggled || page !== 'reading' || readView !== 'reader')
                return;
            const narrow = window.matchMedia?.('(max-width: 980px)').matches ?? false;
            readSideOpen = !narrow;
            const surface = document.querySelector<HTMLElement>('.reading-surface');
            if (surface)
                surface.dataset.side = narrow ? 'closed' : 'open';
            document.querySelectorAll<HTMLElement>('[data-reader-side-toggle]').forEach(x => x.setAttribute('aria-expanded', String(!narrow)));
        });
    }
    if (!sheetEscBound) {
        sheetEscBound = true;
        document.addEventListener('keydown', e => {
            if (e.key !== 'Escape' || page !== 'reading' || readView !== 'reader' || !readSideOpen)
                return;
            const sheet = document.querySelector<HTMLElement>('.reading-surface[data-side="open"]');
            if (!sheet || !window.matchMedia?.('(max-width: 980px)').matches)
                return;
            readSideOpen = false;
            sheet.dataset.side = 'closed';
            document.querySelector<HTMLElement>('.reader-bar [data-reader-side-toggle]')?.focus();
        });
    }
}
// 从难句训练回到阅读：保留阅读进度与标记，只是回到同一个段落
function labReturnToReading(): boolean {
    const target = labReturn;
    if (!target || !readSession || !readPassage)
        return false;
    labSession = null;
    labReturn = null;
    readSession = goToChunk(readSession, target.chunkIndex);
    refreshReadTokens();
    readSelectedToken = null;
    readHelpState = { show: false, text: '' };
    readView = 'reader';
    page = 'reading';
    render();
    toast(`已回到原段落（第 ${(readSession.detail?.chunkIndex ?? 0) + 1} 段）；阅读进度与标记都在`);
    return true;
}
async function openReadingLab(difficultId: string): Promise<void> {
    if (!readSession || !readPassage)
        return;
    const difficult = readSession.detail?.difficultSentences.find(d => d.id === difficultId);
    if (!difficult) {
        toast('找不到这句难句记录');
        return;
    }
    const record = difficultSentenceRecord({ difficult, passage: readPassage, now: Date.now(), existingId: `reading.${readPassage.id}.${difficult.start}` });
    const exists = sentenceRecords.some(s => s.id === record.id);
    if (!exists) {
        await saveSentences([record]);
        sentenceRecords = [record, ...sentenceRecords];
        data.sentences = sentenceRecords;
    }
    labReturn = { ...returnTarget(readSession, difficult, readSession.detail?.chunkIndex ?? 0), planTaskId: readingTask?.planTaskId };
    startLab([record.id], null, null, { ungraded: record.structureProvenance !== 'gold', returnTo: labReturn });
    toast('这句的结构是自动分析的：本次只记接触，不推进语法掌握度');
}
// 进入重读：先结束首读（support），再真正开始重读计时——否则重读速度永远是 0
async function enterReread(): Promise<void> {
    if (!readSession)
        return;
    upsertReadSession(startReread(finishFirstPass(readSession, Date.now()), Date.now()));
    await persistReading();
    readView = 'reread';
    render();
}
function readingReread(): void {
    if (!readSession)
        return readingLibrary();
    const chunkIndex = readSession.detail?.chunkIndex ?? 0;
    $('#main').innerHTML = `<div id="reading-page">${title('READING', '重读', '辅助已收起。先自己读一遍，再记录这次的真实状态。')}${rereadHTML({ session: readSession, chunkIndex })}</div>`;
    document.querySelectorAll<HTMLElement>('[data-reread-prev]').forEach(b => b.addEventListener('click', async () => {
        if (!readSession)
            return;
        upsertReadSession(goToChunk(readSession, (readSession.detail?.chunkIndex ?? 0) - 1));
        await persistReading();
        render();
    }));
    document.querySelectorAll<HTMLElement>('[data-reread-next]').forEach(b => b.addEventListener('click', async () => {
        if (!readSession)
            return;
        upsertReadSession(goToChunk(readSession, (readSession.detail?.chunkIndex ?? 0) + 1));
        await persistReading();
        render();
    }));
    const range = document.querySelector<HTMLInputElement>('#read-reread-self');
    const out = document.querySelector<HTMLOutputElement>('#read-reread-self-out');
    range?.addEventListener('input', () => {
        if (out)
            out.textContent = range.value;
    });
    on('[data-read-reread-done]', 'click', async () => {
        if (!readSession)
            return;
        const self = Number(range?.value ?? 50);
        const dep = (document.querySelector<HTMLSelectElement>('#read-reread-dep')?.value ?? 'B') as 'A' | 'B' | 'C' | 'D' | 'E';
        upsertReadSession(finishReread(readSession, { selfReport: self, translationDependence: dep, now: Date.now() }));
        await persistReading();
        readView = 'whole';
        render();
    });
}
function readingWhole(): void {
    if (!readSession)
        return readingLibrary();
    $('#main').innerHTML = `<div id="reading-page">${title('READING', '全文理解', '没有标准答案的部分只记录你的回答；系统不会假装给你打分。')}${wholeTextHTML()}</div>`;
    on('[data-read-whole-submit]', 'click', async () => {
        if (!readSession)
            return;
        let s = readSession;
        const main = document.querySelector<HTMLInputElement>('#read-whole-main')?.value?.trim() ?? '';
        const detailAnswer = document.querySelector<HTMLTextAreaElement>('#read-whole-detail')?.value?.trim() ?? '';
        const infer = document.querySelector<HTMLTextAreaElement>('#read-whole-infer')?.value?.trim() ?? '';
        const lang = (t: string): 'zh' | 'en' | 'mixed' => /[\u4e00-\u9fff]/.test(t) ? (/[A-Za-z]{3,}/.test(t) ? 'mixed' : 'zh') : 'en';
        if (main)
            s = submitWholeTextItem(s, { kind: 'main-idea', prompt: '全文主旨', answer: main, language: lang(main), verifiedScore: null, now: Date.now() });
        if (detailAnswer)
            s = submitWholeTextItem(s, { kind: 'detail', prompt: '关键细节', answer: detailAnswer, language: lang(detailAnswer), verifiedScore: null, now: Date.now() });
        if (infer)
            s = submitWholeTextItem(s, { kind: 'inference', prompt: '推论', answer: infer, language: lang(infer), verifiedScore: null, now: Date.now() });
        upsertReadSession(s);
        await persistReading();
        toast('已记录');
        render();
    });
    on('[data-read-complete]', 'click', async () => {
        if (!readSession)
            return;
        const summary = document.querySelector<HTMLInputElement>('#read-whole-main')?.value?.trim() ?? '';
        const done = completeReadingSession(readSession, { summary, now: Date.now() });
        upsertReadSession(done);
        await persistReading();
        const planTaskId = readingTask?.planTaskId ?? done.dailyPlanTaskId ?? '';
        if (planTaskId) {
            const planTask = todayPlan?.initialPlan.find(t => t.id === planTaskId);
            const minutes = Math.max(1, Math.round((Date.now() - (readingTask?.startedAt ?? planTask?.startedAt ?? done.at)) / 60000));
            await completePlanTask({ planTaskId, kind: 'reading', startedAt: readingTask?.startedAt ?? planTask?.startedAt ?? done.at, sessionId: done.id }, minutes);
            readingTask = null;
        }
        readView = 'result';
        render();
    });
}
function readingResult(): void {
    if (!readSession || !readPassage)
        return readingLibrary();
    const tokens = readPassage.text.match(/[A-Za-z0-9]+(?:['’\-][A-Za-z0-9]+)*/g) ?? [];
    const byWord = new Map(data.words.map(w => [w.en.trim().toLowerCase(), w]));
    const metrics = computeReadingMetrics(readSession, { tokens, lookup: n => byWord.get(n) });
    $('#main').innerHTML = `<div id="reading-page">${title('READING', '阅读结果', '看的是真实记录：自评、速度、标记、难句各自独立标注。')}${resultHTML({ session: readSession, metrics, passage: readPassage })}</div>`;
    document.querySelectorAll<HTMLElement>('[data-read-back]').forEach(b => b.addEventListener('click', () => { readView = 'library'; readPassage = null; readSession = null; render(); }));
    on('[data-read-words]', 'click', () => {
        if (!readSession)
            return;
        readCandidates = selectStudyCandidates(readSession.detail?.marks ?? [], data.words);
        readView = 'words';
        render();
    });
}
function readingWords(): void {
    if (!readSession)
        return readingLibrary();
    $('#main').innerHTML = `<div id="reading-page">${title('READING', '整理生词', '只把值得学的词交给词汇引擎；新词必须先有释义才能进入 Preview / Recall。')}${studyWordsHTML(readCandidates)}</div>`;
    document.querySelectorAll<HTMLElement>('[data-read-back]').forEach(b => b.addEventListener('click', () => { readView = 'result'; render(); }));
    on('[data-read-words-save]', 'click', async () => {
        if (!readSession)
            return;
        const plan = buildHandoffPlan(readCandidates);
        const now = Date.now();
        // 用户在页面上填的释义：按 data-def 直接收集（不用 CSS.escape，兼容性更稳，也不依赖选择器转义）
        const defs = new Map<string, string>();
        document.querySelectorAll<HTMLInputElement>('[data-def]').forEach(input => {
            const key = input.dataset.def ?? '';
            const v = input.value.trim();
            if (key && v)
                defs.set(key, v);
        });
        const newWords: Word[] = [];
        const exposures: WordExposure[] = [];
        let needsDefinition = 0;
        for (const c of readCandidates) {
            if (c.bucket === 'proper-noun' || c.bucket === 'low-value')
                continue;
            const def = defs.get(c.normalized) ?? '';
            let word = data.words.find(w => w.en.trim().toLowerCase() === c.normalized);
            if (!word) {
                if (!def) {
                    needsDefinition++;
                    continue;
                }
                word = readingWordSeed(c.surface, data.books[0]?.id ?? 'reading', 5000 + newWords.length, now);
                word = { ...word, zh: def, previewResult: 'needs-definition' };
                newWords.push(word);
            }
            else if (!readyForTraining(word) && def) {
                word = { ...word, zh: def };
                newWords.push(word);
            }
            const mark = readSession.detail?.marks.find(m => !m.revokedAt && m.normalized === c.normalized);
            if (mark)
                exposures.push(exposureFromMark(mark, word.id, now));
        }
        if (!newWords.length && !plan.link.length) {
            toast(needsDefinition ? `有 ${needsDefinition} 个新词还没有释义：先补释义再保存` : '没有可入库的词');
            return;
        }
        data.words = [...data.words, ...newWords];
        if (newWords.length)
            await putItems('words', newWords);
        await persistReading({ exposures, words: newWords });
        reindex();
        toast(`已入库 ${newWords.length} 个新词；${needsDefinition ? `${needsDefinition} 个缺释义未入库；` : ''}阅读只计接触，不会自动提升掌握度`);
        readView = 'library';
        render();
    });
}
// —— Phase 5 UI 结束 ——
// ———————————————————— Phase 11：考试迁移 UI（消费层） ————————————————————
// 纪律：这里不计算掌握、不预测分数；只把考试规格、题库、会话与复盘串起来。
let examTab: 'overview' | 'practice' | 'weekly' | 'logs' | 'specs' = 'overview';
let examSessionId = '';
let examLogEditingId = '';
let examIndex = 0;
let examDraft = '';
let examBusy = false;
function examSpecList(): ExamSpecification[] { return data.examSpecifications ?? []; }
function examItemList(): AssessmentItem[] { return data.examItems ?? []; }
function examSessionList(): ExamSession[] { return data.examSessions ?? []; }
function examLogList() { return data.examLogs ?? []; }
async function reloadExam(): Promise<void> { data = await loadData(); }
function examSpecFor(item: AssessmentItem | undefined): ExamSpecification | null {
    if (!item)
        return null;
    return examSpecList().find(s => s.examCategory === item.examCategory) ?? examSpecList().find(s => s.applicableYear === 2026) ?? null;
}
async function persistExam(next: ExamSession, prevRevision: number): Promise<ExamSession> {
    const r = await saveExamSession(next, prevRevision);
    await reloadExam();
    if (!r.ok) {
        toast('这次测评已在另一个窗口更新，已刷新最新状态');
        return r.session ?? next;
    }
    return next;
}
async function startExamItems(ids: string[], planTaskId: string | null = null): Promise<void> {
    const d = await loadData();
    const items = (d.examItems ?? []).filter(i => ids.includes(i.id));
    if (!items.length) {
        toast('没有可用的新题');
        return;
    }
    const now = Date.now();
    let s = createExamSession({ id: `exam-${now}-${Math.random().toString(36).slice(2, 7)}`, mode: items.length > 1 ? 'mixed_practice' : 'skill_practice', spec: examSpecFor(items[0]), items, now, dailyPlanTaskId: planTaskId });
    const created = await saveExamSession(s);
    if (!created.ok) {
        toast('无法创建测评');
        return;
    }
    const started = startExamSession(s, now);
    if (!started.session) {
        toast(started.message ?? '无法开始');
        return;
    }
    s = started.session;
    await saveExamSession(s, created.session?.revision);
    await reloadExam();
    examSessionId = s.id;
    examIndex = 0;
    examDraft = '';
    examTab = 'practice';
    render();
}
async function startWeeklyExam(): Promise<void> {
    const d = await loadData();
    const build = buildWeeklyAssessment(d, d.examItems ?? [], d.examSessions ?? [], Date.now());
    const r = weeklySession({ d, items: d.examItems ?? [], sessions: d.examSessions ?? [], now: Date.now(), spec: examSpecList().find(s => s.applicableYear === 2026) ?? null, id: `weekly-${Date.now()}` });
    if (!r.session) {
        toast(r.reason || '本周无法生成周测');
        return;
    }
    const created = await saveExamSession(r.session);
    if (!created.ok) {
        toast('无法创建周测');
        return;
    }
    const started = startExamSession(r.session, Date.now());
    if (!started.session) {
        toast(started.message ?? '无法开始');
        return;
    }
    await saveExamSession(started.session, created.session?.revision);
    await reloadExam();
    examSessionId = r.session.id;
    examIndex = 0;
    examDraft = '';
    examTab = 'weekly';
    render();
}
function currentExam(): ExamSession | undefined { return examSessionList().find(s => s.id === examSessionId); }
function readExamDraft(s: ExamSession): string {
    const item = s.items[examIndex];
    if (!item)
        return '';
    if (item.options.length)
        return document.querySelector<HTMLInputElement>('input[name="exam-answer"]:checked')?.value ?? s.answers[item.id]?.value ?? '';
    return document.querySelector<HTMLTextAreaElement>('#exam-answer-text')?.value ?? s.answers[item.id]?.value ?? '';
}
async function saveExamDraft(s: ExamSession): Promise<ExamSession> {
    const item = s.items[examIndex];
    if (!item)
        return s;
    const value = readExamDraft(s);
    const r = saveExamAnswer(s, { itemId: item.id, value, timeMs: Date.now() - s.startedAt, now: Date.now() });
    if (!r.session)
        return s;
    return persistExam(r.session, s.revision);
}
async function submitExamFlow(s: ExamSession): Promise<void> {
    if (examBusy)
        return;
    examBusy = true;
    try {
        const saved = await saveExamDraft(s);
        const savedRevision = saved.revision;
        const sub = submitSession(saved, Date.now());
        if (!sub.ok || !sub.session) {
            toast(sub.message ?? '提交失败');
            return;
        }
        let next = sub.session;
        const errors = collectErrors(next, { now: Date.now() });
        const rev = reviewSession(next, errors, sub.outcome?.reason ?? '', Date.now());
        if (rev.session)
            next = rev.session;
        await persistExam(next, savedRevision);
        examDraft = '';
        render();
    }
    finally {
        examBusy = false;
    }
}
async function completeExamFlow(s: ExamSession): Promise<void> {
    const r = completeSession(s, Date.now());
    if (!r.session) {
        toast(r.message ?? '无法完成');
        return;
    }
    let saved = await saveExamSession(r.session, s.revision);
    // 双击/慢渲染可能让第一次写入落后一个 revision；用最新记录重试一次，仍失败才提示。
    if (!saved.ok && saved.stale && saved.session) {
        const retry = completeSession(saved.session, Date.now());
        if (retry.session)
            saved = await saveExamSession(retry.session, saved.session.revision);
    }
    await reloadExam();
    if (!saved.ok) {
        toast('完成状态未保存；已刷新，请重试');
        render();
        return;
    }
    if (s.dailyPlanTaskId) {
        const planTask = todayPlan?.initialPlan.find(t => t.id === s.dailyPlanTaskId);
        examPlanTaskId = null;
        await completePlanTask({
            planTaskId: s.dailyPlanTaskId,
            kind: planTask?.kind ?? 'exam-practice',
            startedAt: planTask?.startedAt ?? s.createdAt,
            sessionId: s.id,
        }, Math.max(0.5, planTask?.minutes ?? s.timeLimitMinutes));
    }
    render();
}
async function retestExam(s: ExamSession): Promise<void> {
    const d = await loadData();
    const r = buildTransferRetest({ items: d.examItems ?? [], sessions: d.examSessions ?? [], errorCategories: s.errors.map(e => e.category), now: Date.now(), spec: examSpecFor(s.items[0]), id: `retest-${Date.now()}` });
    if (!r.session) {
        toast(r.reason);
        return;
    }
    await startExamItems(r.session.items.map(i => i.id));
    toast('已用一道未做过的新题做迁移复测');
}
function examTabsHtml(): string {
    return `<div class="exam-tabs">${([['overview', '考试概览'], ['practice', '练习'], ['weekly', '周测'], ['logs', '学校记录'], ['specs', '规格审计']] as const).map(([id, label]) => `<button data-exam-tab="${id}" class="${examTab === id ? 'active' : ''}" aria-pressed="${examTab === id}">${label}</button>`).join('')}</div>`;
}
function examPageApp(): void {
    const specs = examSpecList();
    const items = examItemList();
    const sessions = examSessionList();
    const logs = examLogList();
    const s = currentExam();
    let body = '';
    if (s) {
        if (['submitted', 'reviewed', 'completed'].includes(s.status)) {
            let report: WeeklyAssessmentReport | null = null;
            if (s.mode === 'weekly_assessment' && s.status === 'completed') {
                const build = { items: s.items, minutes: s.timeLimitMinutes, unavailable: s.unavailableSections ?? [] };
                report = weeklyReportFrom(s, build);
            }
            body = (s.mode === 'weekly_assessment' && report ? weeklyPanelHtml({ items: s.items, minutes: s.timeLimitMinutes, unavailable: s.unavailableSections ?? [] }, s, report) : examResultHtml(s));
            // 周测完成也给出完整结果入口
            if (s.mode === 'weekly_assessment' && report)
                body += examResultHtml(s);
        }
        else
            body = examSessionHtml(s, Math.min(examIndex, s.items.length - 1), s.answers[s.items[examIndex]?.id ?? '']?.value ?? examDraft);
    }
    else if (examTab === 'weekly') {
        const build = buildWeeklyAssessment(data, items, sessions, Date.now());
        const existing = sessions.find(x => x.mode === 'weekly_assessment' && ['active', 'created', 'paused', 'submitted', 'reviewed'].includes(x.status));
        const report = sessions.find(x => x.mode === 'weekly_assessment' && x.status === 'completed');
        body = weeklyPanelHtml(build, existing ?? null, report ? weeklyReportFrom(report, { items: report.items, minutes: report.timeLimitMinutes, unavailable: report.unavailableSections ?? [] }) : null);
    }
    else if (examTab === 'logs')
        body = examLogsHtml(logs, specs, examLogEditingId);
    else if (examTab === 'specs')
        body = specsAuditHtml(specs, items);
    else if (examTab === 'practice')
        body = examPracticeListHtml(items, sessions);
    else
        body = examOverviewHtml(data, specs, items, sessions, logs, data.settings.exam?.planEnabled ?? false);
    $('#main').innerHTML = title('EXAM TRANSFER', '把练习迁移到考试', '换题、换语境、看错因。这里不产生官方分数，也不预测高考成绩。', s ? '<button id="exam-exit" class="secondary">退出当前测评</button>' : '') + examTabsHtml() + body;
    document.querySelectorAll<HTMLElement>('[data-exam-tab]').forEach(b => b.onclick = () => {
        if (currentExam() && !['submitted', 'reviewed', 'completed'].includes(currentExam()!.status)) {
            toast('先提交或退出当前测评');
            return;
        }
        examSessionId = '';
        examTab = b.dataset.examTab as typeof examTab;
        render();
    });
    on('#exam-exit', 'click', async () => {
        const cur = currentExam();
        if (!cur) {
            examSessionId = '';
            render();
            return;
        }
        if (['submitted', 'reviewed', 'completed'].includes(cur.status)) {
            examSessionId = '';
            render();
            return;
        }
        const r = await pauseSession(cur, Date.now());
        if (r.session)
            await persistExam(r.session, cur.revision);
        examSessionId = '';
        render();
        toast('已暂停，可稍后从概览继续');
    });
    on('#exam-start-mixed', 'click', async () => {
        const fresh = freshExamItems(items, sessions).filter(i => i.options.length || i.questionType === 'translation' || i.questionType === 'summary_writing' || i.questionType === 'situational_writing');
        if (!fresh.length) {
            toast('没有未做过的题');
            return;
        }
        await startExamItems(fresh.slice(0, 6).map(i => i.id));
    });
    on('#exam-start-weekly', 'click', () => { examTab = 'weekly'; render(); });
    on('#exam-start-weekly-now', 'click', startWeeklyExam);
    on('#exam-resume-weekly', 'click', () => {
        const w = sessions.find(x => x.mode === 'weekly_assessment' && ['active', 'paused', 'created'].includes(x.status));
        if (w) {
            examSessionId = w.id;
            examIndex = 0;
            render();
        }
    });
    on('#exam-plan-toggle', 'change', async () => {
        const el = document.querySelector<HTMLInputElement>('#exam-plan-toggle')!;
        data.settings.exam = { planEnabled: el.checked };
        await saveSettings(data.settings);
        await reloadExam();
        toast(el.checked ? '已允许每日计划安排 1 道考试题' : '已关闭考试练习题');
        render();
    });
    document.querySelectorAll<HTMLElement>('.exam-pick').forEach(b => b.onclick = () => startExamItems([b.dataset.item!]));
    on('#exam-prev', 'click', async () => {
        const cur = currentExam();
        if (!cur)
            return;
        await saveExamDraft(cur);
        examIndex = Math.max(0, examIndex - 1);
        render();
    });
    on('#exam-next', 'click', async () => {
        const cur = currentExam();
        if (!cur)
            return;
        await saveExamDraft(cur);
        examIndex = Math.min(cur.items.length - 1, examIndex + 1);
        render();
    });
    on('#exam-save', 'click', async () => {
        const cur = currentExam();
        if (!cur)
            return;
        await saveExamDraft(cur);
        toast('已保存到本机');
    });
    on('#exam-submit', 'click', async () => {
        const cur = currentExam();
        if (cur)
            await submitExamFlow(cur);
    });
    // 15h.2：单选选中态必须立刻落在整行上。模板里已按 draft 输出 .selected，
    // 但点选 radio 不会触发重渲染（草稿只在「下一题 / 保存 / 提交」时落盘），
    // 于是行高亮永远不出现，只剩原生 3px 圆点。这里只同步视图类，不写业务状态。
    document.querySelectorAll<HTMLElement>('.exam-option input[type="radio"]').forEach(input => {
        input.addEventListener('change', () => {
            document.querySelectorAll<HTMLElement>('.exam-option').forEach(row => {
                const own = row.querySelector<HTMLInputElement>('input[type="radio"]');
                row.classList.toggle('selected', !!own?.checked);
            });
        });
    });
    on('#exam-complete', 'click', async () => {
        const cur = currentExam();
        if (cur)
            await completeExamFlow(cur);
    });
    on('#exam-retest', 'click', async () => {
        const cur = currentExam();
        if (cur)
            await retestExam(cur);
    });
    on('#exam-back', 'click', () => { examSessionId = ''; examTab = 'overview'; render(); });
    document.querySelectorAll<HTMLSelectElement>('.exam-correct').forEach(sel => sel.onchange = async () => {
        const cur = currentExam();
        if (!cur)
            return;
        const record = cur.errors.find(e => e.itemId === sel.dataset.item);
        if (!record)
            return;
        const updated = correctError(record, sel.value as ExamErrorCategory, record.subcategory, Date.now());
        const next = { ...cur, errors: cur.errors.map(e => e.itemId === record.itemId ? updated : e), revision: cur.revision + 1, updatedAt: Date.now() };
        await persistExam(next, cur.revision);
        render();
    });
    if (examTab === 'logs' && !examSessionId) {
        const readLogDraft = (): import('./examLog.ts').ExamLogDraft => ({
            date: document.querySelector<HTMLInputElement>('#log-date')!.value,
            examType: document.querySelector<HTMLSelectElement>('#log-type')!.value as ExamLogType,
            name: document.querySelector<HTMLInputElement>('#log-name')!.value.trim(),
            specId: document.querySelector<HTMLSelectElement>('#log-spec')!.value,
            examCategory: document.querySelector<HTMLSelectElement>('#log-category')!.value as ExamSpecification['examCategory'],
            applicableYear: Number(document.querySelector<HTMLInputElement>('#log-year')!.value) || null,
            fullScore: Number(document.querySelector<HTMLInputElement>('#log-full')!.value),
            reportedScore: Number(document.querySelector<HTMLInputElement>('#log-score')!.value),
            selfAssessment: document.querySelector<HTMLInputElement>('#log-note')!.value.trim(),
            conflictAcknowledged: document.querySelector<HTMLInputElement>('#log-ack')!.checked,
            editingId: examLogEditingId || undefined,
        });
        let logTouched = false;
        const paintLogCheck = (): void => {
            const draft = readLogDraft();
            const v = validateExamLogDraft(draft, specs);
            const spec = v.spec;
            const basis = document.querySelector<HTMLElement>('#log-basis');
            if (basis) {
                basis.textContent = spec
                    ? spec.status === 'official_confirmed' && spec.totalScore !== null
                        ? `官方已确认总分 ${spec.totalScore}；可以改成实际满分，但必须确认是自定义计分。`
                        : spec.totalScore === null
                            ? '该规格总分未知/待确认，不预填官方满分；请填本次实际满分。'
                            : `规格参考总分 ${spec.totalScore} 未获官方确认；按本次实际满分保存。`
                    : '按本次实际试卷填写，不用高考分值代替。';
                basis.classList.toggle('custom', v.scoreBasis === 'custom_total');
            }
            const box = document.querySelector<HTMLElement>('#log-conflict');
            if (box) {
                const show = logTouched || !!examLogEditingId;
                const messages = show ? [...v.errors.map(e => `<p class="exam-log-error">${esc(e)}</p>`), ...v.warnings.map(w => `<p>${esc(w)}</p>`)] : [];
                box.className = `exam-log-warning${v.blockedConflict ? ' blocked' : ''}`;
                box.dataset.basis = v.scoreBasis;
                box.hidden = messages.length === 0;
                box.innerHTML = messages.join('');
            }
            const ack = document.querySelector<HTMLElement>('#log-ack-wrap');
            if (ack)
                ack.hidden = !v.blockedConflict;
        };
        const syncLogSpec = (prefill: boolean): void => {
            const spec = specs.find(s => s.id === document.querySelector<HTMLSelectElement>('#log-spec')!.value) ?? null;
            const category = document.querySelector<HTMLSelectElement>('#log-category')!;
            const year = document.querySelector<HTMLInputElement>('#log-year')!;
            const full = document.querySelector<HTMLInputElement>('#log-full')!;
            if (spec) {
                category.value = spec.examCategory;
                category.disabled = true;
                year.value = String(spec.applicableYear);
                year.readOnly = true;
                if (prefill) {
                    const official = officialTotalForSpec(spec);
                    full.value = official === null ? '' : String(official);
                }
            }
            else {
                category.disabled = false;
                year.readOnly = false;
            }
            paintLogCheck();
        };
        on('#log-spec', 'change', () => syncLogSpec(true));
        ['#log-category', '#log-year', '#log-score', '#log-full', '#log-note', '#log-ack'].forEach(sel => {
            document.querySelector(sel)?.addEventListener('input', () => { logTouched = true; paintLogCheck(); });
            document.querySelector(sel)?.addEventListener('change', () => { logTouched = true; paintLogCheck(); });
        });
        paintLogCheck();
        on('#log-add', 'click', async () => {
            logTouched = true;
            const draft = readLogDraft();
            const v = validateExamLogDraft(draft, specs);
            paintLogCheck();
            if (!v.ok) {
                toast(v.errors[0]);
                return;
            }
            const prev = examLogEditingId ? logs.find(l => l.id === examLogEditingId) : null;
            const now = Date.now();
            const log: ExamLog = {
                id: prev?.id ?? `log-${now}`,
                date: draft.date,
                name: draft.name,
                examName: draft.name,
                examType: draft.examType,
                examCategory: v.spec?.examCategory ?? draft.examCategory,
                specId: v.spec?.id ?? null,
                applicableYear: v.spec?.applicableYear ?? draft.applicableYear,
                fullScore: draft.fullScore,
                reportedScore: draft.reportedScore,
                sectionResults: prev?.sectionResults ?? [],
                errorTypes: [],
                selfAssessment: draft.selfAssessment,
                source: 'self_reported',
                scoreSource: 'self_reported',
                scoreBasis: v.scoreBasis,
                conflictAcknowledged: v.blockedConflict ? draft.conflictAcknowledged : false,
                clueOnly: true,
                createdAt: prev?.createdAt ?? now,
                updatedAt: now,
            };
            try {
                await saveExamLog(log);
            }
            catch (e) {
                toast(e instanceof Error ? e.message : '保存失败');
                return;
            }
            examLogEditingId = '';
            await reloadExam();
            render();
            toast(draft.conflictAcknowledged && v.blockedConflict ? '已保存为自定义计分；来源仍是 self_reported' : '已保存：自报记录，不是系统验证成绩');
        });
        on('#log-cancel', 'click', () => { examLogEditingId = ''; render(); });
        document.querySelectorAll<HTMLElement>('.exam-log-edit').forEach(b => b.onclick = () => {
            examLogEditingId = b.dataset.log!;
            render();
        });
        document.querySelectorAll<HTMLElement>('.exam-log-del').forEach(b => b.onclick = async () => {
            await deleteExamLog(b.dataset.log!);
            if (examLogEditingId === b.dataset.log)
                examLogEditingId = '';
            await reloadExam();
            render();
        });
        on('#exam-logs-export', 'click', () => {
            const payload = exportExamLogs(examLogList());
            download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `考试记录-${new Date().toISOString().slice(0, 10)}.json`);
            toast('已导出考试记录（含类别、年份、满分与 self_reported 来源）');
        });
        document.querySelector<HTMLInputElement>('#exam-logs-import')?.addEventListener('change', async (ev) => {
            const file = (ev.target as HTMLInputElement).files?.[0];
            if (!file)
                return;
            const parsed = parseExamLogsExport(await file.text(), specs);
            if (!parsed.ok) {
                toast(parsed.errors[0] ?? '导入失败');
                return;
            }
            for (const log of parsed.logs)
                await saveExamLog(log);
            await reloadExam();
            render();
            toast(`已导入 ${parsed.logs.length} 条；${parsed.errors.length} 条被拒绝`);
        });
    }
}
async function boot() {
    installTestHook();
    installPressFeedback();
    await openDB();
    data = await loadData();
    try {
        await ensureExamContent();
        data = await loadData();
    }
    catch (e) {
        console.error('考试题库初始化失败', e);
    }
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
        await reconcilePlanEvidence();
    }
    catch {
        todayPlan = null;
    }
    installPlanTestHook();
    render();
    if (data.migration && Date.now() - data.migration.at < 10 * 60 * 1000)
        setTimeout(() => toast(`本地数据库已从 v${data.migration!.from} 升级到 v${data.migration!.to}；建议立即导出一次完整备份`), 600);
}
// Phase 12 Full Integration 验收钩子：仅测试构建（?test=1）存在。
// 它只播种真实结构的数据（词/文章/输入/考试），不写任何“已完成”标记；
// 计划完成仍必须走真实领域会话与 taskEvidence。
function installPlanTestHook(): void {
    if (!testHooksEnabled() || !new URLSearchParams(location.search).has('test'))
        return;
    const api = {
        async seedUnified() {
            const now = Date.now();
            const words = Array.from({ length: 24 }, (_, i) => {
                const w = makeWord({ en: i < 12 ? `unifiednew${i}` : `unifiedweak${i}`, zh: `统一验收释义${i}` }, 'seed-unified-book', i);
                if (i >= 12) {
                    return {
                        ...w, previewedAt: now - 3600000, previewResult: 'familiar' as const, exposureCount: 1,
                        state: { ...w.state, total: 4, correct: 1, errors: 3, level: 'vague' as const, streak: 0, directions: { 'en-zh': { total: 2, correct: 1, meanMs: 1200 }, 'zh-en': { total: 2, correct: 0, meanMs: 1300 } } },
                    };
                }
                return w;
            });
            await putItems('books', [{ id: 'seed-unified-book', name: '统一验收词书', created: now }]);
            await putItems('words', words);
            const text = 'Attention is not a single ability. It changes with sleep, interest and the difficulty of the material. ' +
                'A short walk can restore focus, and a clear question can make a long article easier to remember. ' +
                'The useful test is whether you can explain the main idea in your own words after a day.';
            const passage = {
                id: 'seed-unified-passage', title: 'Attention and Learning', text, sourceType: 'import' as const,
                sourceUrl: 'https://example.com/attention', topic: 'learning', wordCount: text.split(/\s+/).length,
                difficulty: 'normal' as const, createdAt: now, sourceName: '统一验收', language: 'en' as const,
                paragraphs: [{ index: 0, text, start: 0, end: text.length, wordCount: text.split(/\s+/).length }],
                sentences: [{ index: 0, paragraphIndex: 0, text, start: 0, end: text.length, wordCount: text.split(/\s+/).length }],
                sourceReliability: 'user_supplied' as const, extractionMethod: 'paste' as const, contentHash: 'seed-unified-passage', userEdited: false, importedAt: now,
            };
            await putItems('passages', [passage]);
            await putItems('readingSessions', [{ id: 'seed-unified-reading', passageId: passage.id, at: now - 7200000, stage: 4, wordCount: passage.wordCount, unknownWords: [], vagueWords: [], unknownRate: 0, durationMs: 600000, readingSpeed: 100, structureErrors: 0, summary: 'Attention changes with context.', detail: { state: 'completed', stage: 'completed', passageTitle: passage.title, firstPassStartedAt: now - 7800000, firstPassEndedAt: now - 7200000, rereadStartedAt: now - 7000000, rereadEndedAt: now - 6600000, marks: [], difficultSentences: [], comprehension: [], helps: [], evidence: [], output: [], chunks: [], chunkIndex: 0, paragraphIndex: 0, coldTestDone: true, notes: '' } } as never]);
            const d0 = await loadData();
            if (!(d0.inputSources ?? []).some(s => s.id === 'seed-unified-input')) {
                const src = await inputActions.addSource(d0, { title: 'A real talk about attention', url: 'https://example.com/talk', topic: 'attention', durationMinutes: 18, language: 'en', contentType: 'online_video' });
                if (src.ok) {
                    const d1 = await loadData();
                    const saved = (d1.inputSources ?? []).find(s => s.title === 'A real talk about attention');
                    if (saved && saved.id !== 'seed-unified-input') {
                        await putItems('inputSources', [{ ...saved, id: 'seed-unified-input' }]);
                    }
                }
            }
            data = await loadData();
            data.settings.exam = { planEnabled: true };
            await saveSettings(data.settings);
            await ensureExamContent();
            data = await loadData();
            reindex();
            return { words: data.words.length, passages: data.passages.length, inputSources: data.inputSources.length, sentences: sentenceRecords.length, examItems: data.examItems?.length ?? 0 };
        },
        async resetDomain() {
            const names = ['sessions', 'inputSessions', 'outputAttempts', 'examSessions', 'readingSessions'];
            await new Promise<void>((resolve, reject) => {
                const tx = getDB().transaction(names, 'readwrite');
                for (const n of names)
                    tx.objectStore(n).clear();
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
            inputSessionId = null;
            outputAttemptId = null;
            examSessionId = '';
            readSession = null;
            readPassage = null;
            data = await loadData();
            reindex();
            render();
            return { ok: true };
        },
        async resetPlan() {
            if (todayPlan) {
                await new Promise<void>((resolve, reject) => {
                    const tx = getDB().transaction('dailyPlans', 'readwrite');
                    tx.objectStore('dailyPlans').delete(todayPlan!.id);
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                });
            }
            todayPlan = null;
            trainingFlow = false;
            inputPlanTaskId = null;
            outputPlanTaskId = null;
            examPlanTaskId = null;
            page = 'home';
            render();
            return { ok: true };
        },
        async createPlan(minutes = 240) {
            if (todayPlan)
                return { ok: true, existing: true, id: todayPlan.id, tasks: todayPlan.initialPlan.length };
            const { plan } = createDailyPlan(planInput(minutes, 'normal'));
            const saved = await savePlan(plan, 0);
            todayPlan = saved;
            data.dailyPlans = upsertPlan(data.dailyPlans, saved);
            page = 'home';
            render();
            return { ok: true, existing: false, id: saved.id, tasks: saved.initialPlan.length, modules: [...new Set(saved.initialPlan.map(t => t.module))] };
        },
        async snapshot() {
            const d = await loadData();
            return {
                page,
                plan: todayPlan ? {
                    id: todayPlan.id, status: todayPlan.status, revision: todayPlan.revision,
                    tasks: todayPlan.initialPlan.map(t => ({ id: t.id, module: t.module, kind: t.kind, status: t.status, minutes: t.minutes, refs: t.refs ?? [], startedAt: t.startedAt ?? null, completedAt: t.completedAt ?? null, targetSessionId: t.targetSessionId ?? null })),
                } : null,
                inputSessionId, outputAttemptId, examSessionId: examSessionId,
                inputPlanTaskId, outputPlanTaskId, examPlanTaskId,
                sessions: { now: Date.now(), input: (d.inputSessions ?? []).map(x => ({ id: x.id, source: x.sourceId, status: x.status, plan: x.dailyPlanTaskId ?? null, started: x.startedAt ?? null, completed: x.completedAt ?? null, reflection: !!x.reflection })), output: (d.outputAttempts ?? []).map(x => ({ id: x.id, status: x.status, plan: x.dailyPlanTaskId ?? null, created: x.createdAt })), exam: (d.examSessions ?? []).map(x => ({ id: x.id, status: x.status, plan: x.dailyPlanTaskId ?? null, created: x.createdAt, items: x.itemIds })) },
            };
        },
        async resetFlow() { trainingFlow = false; inputPlanTaskId = null; outputPlanTaskId = null; examPlanTaskId = null; page = 'home'; render(); return { ok: true }; },
        integrity() { return checkDataIntegrity(data); },
        async evidenceFor(taskId: string) {
            const task = todayPlan?.initialPlan.find(t => t.id === taskId);
            if (!task)
                return { ok: false, reason: 'missing-task' };
            const d = await loadData();
            const sessionId = task.module === 'input'
                ? (d.inputSessions ?? []).filter(x => x.dailyPlanTaskId === task.id).sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))[0]?.id ?? ''
                : task.module === 'output'
                    ? (d.outputAttempts ?? []).find(x => x.dailyPlanTaskId === task.id)?.id ?? ''
                    : task.module === 'exam'
                        ? (d.examSessions ?? []).find(x => x.dailyPlanTaskId === task.id)?.id ?? ''
                        : '';
            return taskEvidence(task, d, { planTaskId: task.id, startedAt: task.startedAt ?? 0, sessionId });
        },
    };
    (window as unknown as Record<string, unknown>).__planTest = api;
}
// —— Phase 13：未捕获错误不能静默消失；保留控制台细节，给用户可理解的出口 ——
let lastRuntimeNoticeAt = 0;
function reportRuntimeError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error ?? '未知错误');
    console.error('运行时错误', error);
    const now = Date.now();
    if (now - lastRuntimeNoticeAt < 3000)
        return;
    lastRuntimeNoticeAt = now;
    toast(`运行出错：${message.slice(0, 120)}。数据仍保存在本机，可刷新页面重试。`);
}
window.addEventListener('unhandledrejection', event => reportRuntimeError(event.reason));
window.addEventListener('error', event => reportRuntimeError(event.error ?? event.message));
function fatalStartup(message: string): void {
    $('#app').innerHTML = `<div class="startup-error"><h1>无法打开本地数据</h1><p>${esc(message)}</p><p class="hint">学习数据仍保存在此浏览器；可先关闭其他窗口，再刷新重试。</p><button id="startup-retry" class="primary">刷新重试</button></div>`;
    $('#startup-retry').addEventListener('click', () => location.reload());
}
// 生产构建注册离线外壳；测试构建不注册，避免 service worker 缓存干扰验收。
if (pwaEnabled() && 'serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(error => console.error('离线外壳注册失败', error));
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
            fatalStartup(e instanceof Error ? e.message : String(e));
        }
    });
}
else {
    $('#app').textContent = '此浏览器缺少安全的多窗口存储锁，请使用较新的 Chrome、Edge、Firefox 或 Safari。';
}
// ———————————————————— Phase 6：AI 强化（消费层） ————————————————————
// 纪律：这里只做 UI 与持久化；生成/校验/质量门都在 ai*.ts 里；
//       AI 结果一律标 ai_unverified / ai_generated，绝不写掌握证据。
let aiTheme = '';
let aiReadingTopic = '';
let aiRunning: AbortController | null = null;
let aiDelegated = false;
let aiSentenceResult: {
    text: string;
    zh: string;
    meta: Record<string, unknown>;
    quality: string;
} | null = null;
let aiReadingResult: {
    title: string;
    topic: string;
    passage: string;
    exercises: Array<{
        question: string;
        options: string[];
        answerIndex: number;
        evidenceQuote: string;
    }>;
    meta: Record<string, unknown>;
    quality: string;
    contentHash: string;
} | null = null;
function aiSettings(): AISettings {
    const s = data.settings;
    const legacy = { endpoint: s.endpoint, model: s.model, key: s.rememberKey ? s.key : (s.ai?.key ?? s.key) };
    return {
        endpoint: s.ai?.endpoint ?? legacy.endpoint,
        model: s.ai?.model ?? legacy.model,
        key: s.ai?.key ?? legacy.key,
        structuredMode: s.ai?.structuredMode ?? 'auto',
        timeoutMs: s.ai?.timeoutMs ?? 45000,
        maxRetries: s.ai?.maxRetries ?? 2,
        maxOutputTokens: s.ai?.maxOutputTokens ?? 1200,
        temperature: s.ai?.temperature ?? 0.7,
        concurrency: s.ai?.concurrency ?? 1,
        dailyTokenBudget: s.ai?.dailyTokenBudget ?? null,
        knownMode: s.ai?.knownMode,
    };
}
function aiConfig(): AIProviderConfig {
    return normalizeAIConfig(aiSettings());
}
function aiReady(): {
    ok: boolean;
    reason: string;
} {
    const bad = validateAIConfig(aiConfig());
    if (bad)
        return { ok: false, reason: bad.message };
    return { ok: true, reason: '' };
}
function aiWeakWords(): Word[] {
    return data.words.filter(isWeak).sort((a, b) => priority(b) - priority(a)).slice(0, 3);
}
function aiWeakGrammar(): Array<{
    id: string;
    name: string;
    description: string;
}> {
    return weakConcepts(GRAMMAR_TAXONOMY, data.grammarAttempts).slice(0, 2).map(w => {
        const def = conceptById(w.conceptId);
        return { id: w.conceptId, name: w.name, description: def?.description ?? w.name };
    });
}
function aiErrorBlock(info: AIErrorInfo, issues: string[] = []): string {
    return `<div class="ai-error"><strong>${esc(info.message)}</strong><p>${esc(info.hint)}</p>${issues.length ? `<ul>${issues.slice(0, 6).map(i => `<li>${esc(i)}</li>`).join('')}</ul>` : ''}<p class="hint">本地功能不受影响：词库、复习、authored 教学句、真实阅读材料与今日计划仍然可用。</p></div>`;
}
function aiMetaLine(meta: Record<string, unknown>): string {
    const usage = (meta.usage ?? {}) as {
        promptTokens?: number;
        completionTokens?: number;
        estimated?: boolean;
    };
    return `<p class="hint">${esc(String(meta.promptId))}@${esc(String(meta.promptVersion))} · 指纹 ${esc(String(meta.promptHash).slice(-8))} · ${esc(String(meta.model))}（${esc(String(meta.providerHost))}）· ${esc(String(meta.structuredMode))} · 第 ${esc(String(meta.attempts))} 次通过 · 用量 ${usage.promptTokens ?? 0}+${usage.completionTokens ?? 0} tokens${usage.estimated ? '（估算）' : ''}</p>`;
}
function aiSentencePanelHTML(): string {
    const ready = aiReady();
    const weak = aiWeakWords();
    const grammar = aiWeakGrammar();
    const disabled = !ready.ok || weak.length === 0;
    const why = !ready.ok ? ready.reason : weak.length === 0 ? '还没有弱词：先做几轮检索或阅读标记，AI 才知道该练什么。' : '';
    return `<section class="panel" id="ai-sentence-panel">
    <div class="section-title"><h2>AI 定向句</h2><span class="chip">AI 生成 · 结构未验证</span></div>
    <p class="hint">用你当前的真实薄弱词与语法点造一句练习句。${esc(EVIDENCE_NOTE)}</p>
    <div class="ai-targets">目标词：${weak.length ? weak.map(w => `<span class="chip">${esc(w.en)}</span>`).join('') : '<em>无</em>'}　语法：${grammar.length ? grammar.map(g => `<span class="chip">${esc(g.name)}</span>`).join('') : '<em>无</em>'}</div>
    <label>场景 / 主题<input id="ai-sentence-theme" maxlength="60" placeholder="例如：修一座旧桥" value="${esc(aiTheme)}"></label>
    <div class="actions"><button class="primary" data-ai-sentence ${disabled ? 'disabled' : ''}>生成定向句</button><button class="secondary" data-ai-cancel hidden>取消</button></div>
    ${why ? `<p class="hint">${esc(why)}</p>` : `<p class="hint">将发送：目标词 ${weak.length} 个、语法点 ${grammar.length} 个、主题与你填写的场景。不会发送完整词库、学习历史或备份。</p>`}
    <div id="ai-sentence-result">${aiSentenceResultHTML()}</div></section>`;
}
function aiSentenceResultHTML(): string {
    if (!aiSentenceResult)
        return '';
    const r = aiSentenceResult;
    return `<div class="ai-result"><blockquote>${esc(r.text)}</blockquote>${r.zh ? `<p class="hint">${esc(r.zh)}</p>` : ''}
    <p><span class="chip">AI 生成</span> <span class="chip">结构 ai_unverified</span></p>
    <p class="hint">质量门：${esc(r.quality)}</p>${aiMetaLine(r.meta)}
    <div class="actions"><button class="primary" data-ai-sentence-adopt>加入句库并开始练习</button></div></div>`;
}
function aiReadingPanelHTML(): string {
    const ready = aiReady();
    const weak = aiWeakWords();
    const grammar = aiWeakGrammar();
    const obstacles = aiObstacles();
    const disabled = !ready.ok || (weak.length === 0 && grammar.length === 0);
    const why = !ready.ok ? ready.reason : disabled ? '还没有可用的薄弱词/语法点：先读一篇真实文章并标记障碍。' : '';
    return `<section class="panel" id="ai-reading-panel">
    <div class="section-title"><h2>AI 强化阅读</h2><span class="chip">AI 生成 · 不是真实语料</span></div>
    <p class="hint">针对你真实遇到的阅读障碍生成一篇略高于当前水平的短文，练完再回到真实材料验证。</p>
    <div class="ai-targets">目标词：${weak.length ? weak.map(w => `<span class="chip">${esc(w.en)}</span>`).join('') : '<em>无</em>'}　语法：${grammar.length ? grammar.map(g => `<span class="chip">${esc(g.name)}</span>`).join('') : '<em>无</em>'}</div>
    <label>主题<input id="ai-reading-topic" maxlength="60" placeholder="例如：river engineering" value="${esc(aiReadingTopic)}"></label>
    ${obstacles.length ? `<p class="hint">将围绕这些真实障碍：${obstacles.map(o => esc(o)).join('；')}</p>` : ''}
    <div class="actions"><button class="primary" data-ai-reading ${disabled ? 'disabled' : ''}>生成强化文章</button><button class="secondary" data-ai-cancel hidden>取消</button></div>
    ${why ? `<p class="hint">${esc(why)}</p>` : ''}
    <div id="ai-reading-result">${aiReadingResultHTML()}</div></section>`;
}
function aiReadingResultHTML(): string {
    if (!aiReadingResult)
        return '';
    const r = aiReadingResult;
    return `<div class="ai-result"><h3>${esc(r.title)}</h3>
    <p class="hint"><span class="chip">AI 生成强化材料</span> 来源可靠性：ai_generated（不是真实出版物）</p>
    <div class="ai-passage">${r.passage.split(/\n{2,}/).map(p => `<p>${esc(p)}</p>`).join('')}</div>
    <details><summary>阅读题（${r.exercises.length}）</summary>${r.exercises.map((e, i) => `<div class="ai-ex"><strong>${i + 1}. ${esc(e.question)}</strong><ol>${e.options.map((o, j) => `<li${j === e.answerIndex ? ' class="ok"' : ''}>${esc(o)}</li>`).join('')}</ol><p class="hint">证据：${esc(e.evidenceQuote)}</p></div>`).join('')}</details>
    <p class="hint">质量门：${esc(r.quality)}</p>${aiMetaLine(r.meta)}
    <div class="actions"><button class="primary" data-ai-reading-save>保存并开始阅读</button></div></div>`;
}
function aiObstacles(): string[] {
    const last = [...data.readingSessions].filter(s => (s as unknown as {
        detail?: {
            difficult?: Array<{
                problemType?: string;
            }>;
        };
    }).detail).pop();
    const detail = (last as unknown as {
        detail?: {
            difficult?: Array<{
                problemType?: string;
            }>;
        };
    } | undefined)?.detail;
    const types = (detail?.difficult ?? []).map(d => d.problemType).filter(Boolean) as string[];
    return [...new Set(types)].slice(0, 3).map(t => PROBLEM_TYPE_LABELS[t as keyof typeof PROBLEM_TYPE_LABELS] ?? t);
}
async function aiGenerateSentence(): Promise<void> {
    const cfg = aiConfig();
    const bad = validateAIConfig(cfg);
    const box = $('#ai-sentence-result');
    if (!box)
        return;
    if (bad) {
        box.innerHTML = aiErrorBlock(bad);
        return;
    }
    const budget = budgetState(data.aiGenerations, cfg.dailyTokenBudget, Date.now());
    if (!budget.allowed) {
        box.innerHTML = aiErrorBlock({ code: 'budget-exceeded', message: '今天的 AI 用量已达上限。', hint: `已用 ${budget.usedTokens} / ${budget.limitTokens} tokens；可调高上限或明天再用。`, retryable: false, status: null });
        return;
    }
    const weak = aiWeakWords();
    const grammar = aiWeakGrammar();
    if (!weak.length) {
        box.innerHTML = aiErrorBlock({ code: 'missing-model', message: '还没有弱词。', hint: '先做几轮词卡检索或读一篇文章并标记障碍，再来生成定向句。', retryable: false, status: null });
        return;
    }
    aiRunning = new AbortController();
    const btn = document.querySelector<HTMLButtonElement>('[data-ai-sentence]');
    const cancel = document.querySelector<HTMLElement>('[data-ai-cancel]');
    const sendNote = document.querySelector<HTMLElement>('#ai-sentence-panel .hint');
    if (btn)
        btn.disabled = true;
    if (cancel)
        cancel.hidden = false;
    box.innerHTML = '<p class="hint">正在生成（最多 3 次校验尝试）……</p>';
    try {
        const r = await generateSentence({
            targetWords: weak.map(w => w.en),
            targetGrammar: grammar.map(g => ({ id: g.id, name: g.name, description: g.description })),
            theme: aiTheme || 'daily life',
            level: 'B1',
            minWords: 8, maxWords: 22,
            knownSample: data.words.filter(w => (w.state?.total ?? 0) > 0).slice(0, 20).map(w => w.en),
            knownCount: data.words.filter(w => (w.state?.total ?? 0) > 0).length,
            miniUnit: data.miniUnits.find(u => u.status === 'active')?.theme ?? null,
            maxUnknownWords: 3,
            desired: 'medium',
            unknownWords: [],
            existingHashes: contentHashes(data.aiGenerations, 'sentence'),
        }, cfg, { knownMode: aiSettings().knownMode }, aiRunning.signal);
        if (!r.ok) {
            box.innerHTML = aiErrorBlock(r.error, r.issues);
            toast('生成失败：' + r.error.message);
            return;
        }
        aiSentenceResult = { text: r.value.sentence, zh: r.value.chinese ?? '', meta: r.meta as unknown as Record<string, unknown>, quality: summarizeQuality(r.quality) };
        const now = Date.now();
        const rec = buildGeneration('sentence', { ...r.value }, r.meta, { ok: true, notes: [summarizeQuality(r.quality)] }, now);
        await putItems('aiGenerations', [rec]);
        data.aiGenerations.push(rec);
        box.innerHTML = aiSentenceResultHTML();
        toast('已生成（AI 材料，不会提升掌握度）');
    }
    catch (e) {
        box.innerHTML = aiErrorBlock(e instanceof AIError ? e.info : { code: 'unknown' as never, message: String((e as Error).message), hint: '可重试。', retryable: true, status: null });
    }
    finally {
        aiRunning = null;
        if (btn)
            btn.disabled = false;
        if (cancel)
            cancel.hidden = true;
        void sendNote;
    }
}
async function aiAdoptSentence(): Promise<void> {
    if (!aiSentenceResult)
        return;
    const text = aiSentenceResult.text.trim();
    const now = Date.now();
    const id = `sen.ai.${Math.abs([...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)).toString(36)}`;
    if (sentenceRecords.some(x => x.id === id || x.text === text)) {
        toast('这句已经在句库里了');
        return;
    }
    const record: SentenceRecord = {
        id, text, zh: aiSentenceResult.zh,
        sourceType: 'ai', sourceId: 'ai.generate', attribution: 'AI 生成（结构未验证）',
        grammarTags: aiWeakGrammar().map(g => g.id), targetWordIds: aiWeakWords().map(w => w.id),
        theme: aiTheme || 'AI 定向句', difficulty: 2,
        structure: heuristicStructure(`sen.ai.${now}`, text), structureProvenance: 'ai_unverified',
        createdBy: 'ai', createdAt: now, usedCount: 0, lastUsedAt: 0,
        notes: 'AI 生成：结构未验证，仅用于有提示的探索；不作为自动语法评分依据。',
    };
    await saveSentences([record]);
    sentenceRecords = [record, ...sentenceRecords];
    data.sentences = sentenceRecords;
    toast('已加入句库（标注 AI 未验证结构）');
    startLab([record.id], null, null);
}
async function aiGenerateReading(): Promise<void> {
    const cfg = aiConfig();
    const bad = validateAIConfig(cfg);
    const box = $('#ai-reading-result');
    if (!box)
        return;
    if (bad) {
        box.innerHTML = aiErrorBlock(bad);
        return;
    }
    const budget = budgetState(data.aiGenerations, cfg.dailyTokenBudget, Date.now());
    if (!budget.allowed) {
        box.innerHTML = aiErrorBlock({ code: 'budget-exceeded', message: '今天的 AI 用量已达上限。', hint: `已用 ${budget.usedTokens} / ${budget.limitTokens} tokens。`, retryable: false, status: null });
        return;
    }
    const weak = aiWeakWords();
    const grammar = aiWeakGrammar();
    if (!weak.length && !grammar.length) {
        box.innerHTML = aiErrorBlock({ code: 'missing-model', message: '还没有阅读障碍或弱项。', hint: '先读一篇真实文章，标记不会的词与读不懂的句子。', retryable: false, status: null });
        return;
    }
    aiRunning = new AbortController();
    const btn = document.querySelector<HTMLButtonElement>('[data-ai-reading]');
    const cancel = document.querySelector<HTMLElement>('[data-ai-cancel]');
    if (btn)
        btn.disabled = true;
    if (cancel)
        cancel.hidden = false;
    box.innerHTML = '<p class="hint">正在生成强化文章（会校验证据句、目标词与难度）……</p>';
    try {
        const r = await generateReading({
            topic: aiReadingTopic || 'a small town by a river',
            obstacles: aiObstacles(),
            targetWords: (weak.length ? weak.map(w => w.en) : ['notebook', 'current']).slice(0, 4),
            targetGrammar: (grammar.length ? grammar : [{ id: 'clause.adverbial', name: '状语从句' }]).map(g => ({ id: g.id, name: g.name })),
            targetWordCount: 150, level: 'B1',
            originalDifficulty: 'medium', desiredDifficulty: 'medium',
            sourceExcerpt: '', exerciseCount: 3,
            grammarIds: (grammar.length ? grammar : [{ id: 'clause.adverbial', name: '状语从句' }]).map(g => g.id),
            minWords: 90, maxWords: 230, minExercises: 3, maxExercises: 4,
            maxUnknownWords: 8, desired: 'medium',
            unknownWords: [], existingHashes: contentHashes(data.aiGenerations, 'reading'),
        }, cfg, { knownMode: aiSettings().knownMode }, aiRunning.signal);
        if (!r.ok) {
            box.innerHTML = aiErrorBlock(r.error, r.issues);
            toast('生成失败：' + r.error.message);
            return;
        }
        aiReadingResult = {
            title: r.value.title, topic: r.value.topic, passage: r.value.passage,
            exercises: r.value.exercises.map(e => ({ question: e.question, options: e.options, answerIndex: e.answerIndex, evidenceQuote: e.evidenceQuote })),
            meta: r.meta as unknown as Record<string, unknown>, quality: summarizeQuality(r.quality), contentHash: r.meta.contentHash,
        };
        const rec = buildGeneration('reading', { ...r.value }, r.meta, { ok: true, notes: [summarizeQuality(r.quality)] }, Date.now());
        await putItems('aiGenerations', [rec]);
        data.aiGenerations.push(rec);
        box.innerHTML = aiReadingResultHTML();
        toast('已生成强化文章（不是真实语料）');
    }
    catch (e) {
        box.innerHTML = aiErrorBlock(e instanceof AIError ? e.info : { code: 'unknown' as never, message: String((e as Error).message), hint: '可重试。', retryable: true, status: null });
    }
    finally {
        aiRunning = null;
        if (btn)
            btn.disabled = false;
        if (cancel)
            cancel.hidden = true;
    }
}
async function aiSaveReading(): Promise<void> {
    if (!aiReadingResult)
        return;
    const now = Date.now();
    const parsed = parsePassageText(aiReadingResult.passage);
    const passage: Passage = {
        id: uid(), title: aiReadingResult.title, text: aiReadingResult.passage,
        sourceType: 'ai_reinforcement', sourceUrl: '', topic: aiReadingResult.topic,
        wordCount: countWords(aiReadingResult.passage), difficulty: 'medium', createdAt: now,
        sourceName: 'AI 强化生成（非真实语料）', language: 'en',
        paragraphs: parsed.paragraphs, sentences: parsed.sentences,
        sourceReliability: 'ai_generated', extractionMethod: 'ai_generated',
        contentHash: aiReadingResult.contentHash, userEdited: false, importedAt: now,
        sourceMetadata: { origin: 'ai_reinforcement', prompt: String(aiReadingResult.meta.promptVersion ?? ''), model: String(aiReadingResult.meta.model ?? '') },
    };
    passage.estimatedDifficulty = readingDifficultyFor(passage).difficulty;
    await savePassage(passage);
    data.passages.push(passage);
    aiReadingResult = null;
    openReadingMaterial(passage, null);
    toast('已保存为 AI 强化阅读材料（可随时删除）');
}
function bindAI(): void {
    on('#ai-sentence-panel input#ai-sentence-theme', 'input', (e: Event) => { aiTheme = (e.target as HTMLInputElement).value; });
    on('#ai-reading-panel input#ai-reading-topic', 'input', (e: Event) => { aiReadingTopic = (e.target as HTMLInputElement).value; });
    if (aiDelegated)
        return;
    aiDelegated = true;
    // 结果区是动态插入的：用一次性委托，避免每渲染一次就重复绑定
    document.addEventListener('click', (e: Event) => {
        const t = e.target as HTMLElement | null;
        if (!t)
            return;
        if (t.closest('[data-ai-sentence-adopt]'))
            void aiAdoptSentence();
        else if (t.closest('[data-ai-reading-save]'))
            void aiSaveReading();
        else if (t.closest('[data-ai-cancel]')) {
            aiRunning?.abort();
            toast('正在取消……');
        }
        else if (t.closest('[data-ai-sentence]'))
            void aiGenerateSentence();
        else if (t.closest('[data-ai-reading]'))
            void aiGenerateReading();
    });
}

/* ════════════════════════════════════════════════════════════════════════════
   Phase 15c · 原型页装配（只在 ?proto=a|b 时走到这里）
   业务动作全部复用既有实现：bindPlan() 负责开始/跳过/延后/替换/调整，
   其余与默认首页一致，避免原型悄悄改变学习流程或数据写入。
   ════════════════════════════════════════════════════════════════════════════ */
function protoBelow(s: ReturnType<typeof summary>, unfinished: StudySession | undefined, plan: DailyPlan | null): string {
    return `<div class="proto-below">
  ${plan ? '' : `<section class="proto-setup">${planSetup()}</section>`}
  ${unfinished ? `<div class="resume"><span>有一轮未完成的训练 · 已答 ${unfinished.answered} 题</span><button id="resume" class="primary">继续本轮</button><button id="finish-old" class="text-button">结束本轮</button></div>` : ''}
  <section class="panel practice">
    <div class="section-title"><h2>自己再练一轮</h2><span class="subtle">${data.words.length} 个词 · ${data.books.length} 本词书</span></div>
    ${rangeControls()}
    <div class="modes" data-stagger>
      <button class="mode featured" data-mode="quick"><span class="mode-symbol" aria-hidden="true">↗</span><h3>快速刷词</h3><p>大量扫描，找出不熟的词</p><span class="mode-bottom">开始检索 <b>→</b></span></button>
      <button class="mode" data-mode="due"><span class="mode-symbol" aria-hidden="true">◷</span><h3>今日复习 <em>${s.due}</em></h3><p>优先处理已到期的记忆</p><span class="mode-bottom">巩固记忆 <b>→</b></span></button>
      <button class="mode" data-mode="weak"><span class="mode-symbol" aria-hidden="true">◎</span><h3>弱词强化 <em>${s.weak}</em></h3><p>集中攻克不会和模糊词</p><span class="mode-bottom">开始强化 <b>→</b></span></button>
      <button class="mode" data-mode="random"><span class="mode-symbol" aria-hidden="true">⤨</span><h3>随机抽查</h3><p>检验学过的词是否还记得</p><span class="mode-bottom">抽查记忆 <b>→</b></span></button>
    </div>
  </section>
  ${newWordsPanel()}
  <div class="two-col">
    <section class="panel"><div class="section-title"><h2>记忆分布</h2><span class="subtle">全部词库</span></div>${distribution()}<p class="hint">“熟练”需要双向和间隔测试证据。短时间反复答对不会直接计入长期掌握。</p></section>
    <section class="panel"><div class="section-title"><h2>今日弱词变化</h2></div><div class="weak-change"><div><strong>${s.newWeak}</strong><span>新增弱词</span></div><div><strong class="green">${s.resolved}</strong><span>今天修好的</span></div></div><p class="hint">弱词来自真实错误与“模糊”自评；修好需要后续再答对。</p></section>
  </div>
</div>`;
}

function protoHome(s: ReturnType<typeof summary>): void {
    const plan = todayPlan;
    const next = plan ? nextOpenTask(plan) : null;
    const prog = plan ? planProgress(plan) : null;
    const unfinished = data.sessions.find(x => !x.ended);
    const views = plan
        ? protoTaskViews({
            tasks: plan.initialPlan as unknown as ProtoTaskInput[],
            nextId: next?.id ?? null,
            labelOf: (t: ProtoTaskInput) => t.label ?? TASK_LABELS[t.kind ?? ''] ?? t.kind ?? '任务',
            moduleOf: (t: ProtoTaskInput) => moduleName(taskModule(t as never)),
            noteOf: (t: ProtoTaskInput) => taskTargetLabel(t as never),
            reasonOf: (t: ProtoTaskInput) => humanReasons(t.reason),
        })
        : [];
    const used = plan && prog ? Math.max(0, plan.availableMinutes - prog.remainingMinutes) : 0;
    const ctx: ProtoContext = {
        proto: PROTO!,
        hasPlan: !!plan,
        budget: plan?.availableMinutes ?? planBudget,
        usedMinutes: used,
        remainingMinutes: prog?.remainingMinutes ?? planBudget,
        done: prog?.done ?? 0,
        total: prog?.total ?? 0,
        skipped: prog?.skipped ?? 0,
        ratio: prog?.ratio ?? 0,
        next: views.find(v => v.isNext) ?? null,
        tasks: views,
        reason: next ? humanReasons(next.reason) || '按真实到期与保留率安排' : '',
        emptyNote: '',
    };
    if (PROTO === 'd') {
        stopLiving();
        $('#main').innerHTML = protoTodayD(ctx) + protoBelow(s, unfinished, plan);
        on('#import', 'click', importDialog);
        bindPlan();
        on('#hero-adjust', 'click', planAdjustDialog);
        on('#resume', 'click', () => startSession(unfinished!));
        on('#finish-old', 'click', async () => { unfinished!.ended = Date.now(); await putItems('sessions', [unfinished]); render(); });
        on('#preview-start', 'click', () => startPreview());
        on('#reflow-start', 'click', () => startReflow());
        document.querySelectorAll<HTMLElement>('[data-mode]').forEach(b => b.onclick = () => { startMode(b.dataset.mode!).catch(e => toast(e.message)); });
        startLiving($('#main') as HTMLElement);
        pulseJustCompleted();
        return;
    }
    $('#main').innerHTML = protoTodayHTML(ctx) + protoBelow(s, unfinished, plan);
    on('#import', 'click', importDialog);
    bindPlan();
    on('#hero-adjust', 'click', planAdjustDialog);
    on('#resume', 'click', () => startSession(unfinished!));
    on('#finish-old', 'click', async () => { unfinished!.ended = Date.now(); await putItems('sessions', [unfinished]); render(); });
    on('#preview-start', 'click', () => startPreview());
    on('#reflow-start', 'click', () => startReflow());
    document.querySelectorAll<HTMLElement>('[data-mode]').forEach(b => b.onclick = () => { startMode(b.dataset.mode!).catch(e => toast(e.message)); });
}
