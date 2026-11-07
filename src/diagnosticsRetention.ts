import type { ClozeAttempt, Data, SpellingAttempt } from './types.ts';
import { percent, RATE_MIN_SAMPLE } from './diagnosticsModel.ts';
import { localDayNumber } from './planner.ts';
import { normalizeSpelling } from './spelling.ts';

const windows = [
    { label: 'D1', fromDay: 1, toDay: 1 },
    { label: 'D7', fromDay: 6, toDay: 8 },
    { label: 'D30', fromDay: 27, toDay: 33 },
] as const;
const modes = ['recognition', 'spelling', 'cloze'] as const;
type RetentionMode = typeof modes[number];
type RetentionWindow = typeof windows[number];
export interface ObservedRetentionPoint {
    label: RetentionWindow['label'];
    mode: RetentionMode;
    fromDay: number;
    toDay: number;
    correct: number;
    denominator: number;
    validAttempts: number;
    uniqueWords: number;
    eligibleWords: number;
    minSample: number;
    rate: number | null;
    evaluable: boolean;
}
export interface ObservedRetentionResult {
    points: ObservedRetentionPoint[];
    notes: string[];
}

type StoredAttempt = Pick<SpellingAttempt, 'id' | 'wordId' | 'sessionId' | 'at' | 'correct' | 'ms'>;
interface Attempt extends StoredAttempt {
    eligible: boolean;
}
type RetentionData = Pick<Data, 'words' | 'sessions' | 'records' | 'spellingAttempts' | 'clozeAttempts'>;
const nonAnswerModes = new Set(['preview', 'new-preview', 'exposure', 'audio', 'pronunciation']);
const hasId = (id: unknown): id is string => typeof id === 'string' && id.trim().length > 0;
const isDate = (at: number) => Number.isFinite(at) && at > 0 && at <= 8.64e15;
const earlier = (a: Attempt, b: Attempt) => a.at < b.at || a.at === b.at && a.id < b.id;

function validSpelling(a: SpellingAttempt) {
    return a.normalizationVersion === 1 && typeof a.assisted === 'boolean' && typeof a.retry === 'boolean'
        && typeof a.input === 'string' && !!a.input.trim()
        && typeof a.expected === 'string' && !!a.expected.trim()
        && a.correct === (normalizeSpelling(a.input) === normalizeSpelling(a.expected));
}
function validCloze(a: ClozeAttempt) {
    return a.source === 'saved-reading' && hasId(a.sourceType) && !['ai', 'ai_reinforcement'].includes(a.sourceType)
        && hasId(a.passageId) && hasId(a.readingSessionId) && hasId(a.markId)
        && isDate(a.markedAt) && a.markedAt <= a.at
        && typeof a.sentence === 'string' && Number.isInteger(a.start) && Number.isInteger(a.end)
        && a.start >= 0 && a.start < a.end && a.end <= a.sentence.length
        && a.sentence.slice(a.start, a.end) === a.expected;
}

function firstBySession<T extends StoredAttempt>(
    items: readonly T[],
    valid: (a: T) => boolean,
    eligible: (a: T) => boolean,
): Map<string, Map<string, Attempt>> {
    const byId = new Map<string, Attempt | null>();
    for (const a of items) {
        if (!valid(a))
            continue;
        const included = eligible(a);
        const prior = byId.get(a.id);
        if (prior === undefined)
            byId.set(a.id, { ...a, eligible: included });
        else if (prior && (prior.wordId !== a.wordId || prior.sessionId !== a.sessionId || prior.at !== a.at
            || prior.correct !== a.correct || prior.eligible !== included))
            byId.set(a.id, null);
    }
    const byWord = new Map<string, Map<string, Attempt>>();
    for (const a of byId.values()) {
        if (!a)
            continue;
        let sessions = byWord.get(a.wordId);
        if (!sessions) {
            sessions = new Map();
            byWord.set(a.wordId, sessions);
        }
        const first = sessions.get(a.sessionId);
        if (!first || earlier(a, first))
            sessions.set(a.sessionId, a);
    }
    return byWord;
}

/** 实际作答后的自然日抽样，锚点使用能查到的最早合格作答。 */
export function observedRetentionReport(data: RetentionData, now: number): ObservedRetentionResult {
    const words = new Set(data.words.map(w => w.id).filter(hasId));
    const sessions = new Set(data.sessions.filter(s => !nonAnswerModes.has(s.mode)).map(s => s.id));
    const valid = (a: StoredAttempt) => !!a && hasId(a.id) && words.has(a.wordId) && hasId(a.sessionId)
        && isDate(a.at) && a.at <= now && typeof a.correct === 'boolean' && Number.isFinite(a.ms) && a.ms >= 0;
    const independent = (a: SpellingAttempt) => !a.retry && !a.assisted;
    const attempts: Record<RetentionMode, Map<string, Map<string, Attempt>>> = {
        recognition: firstBySession(data.records, a => valid(a) && sessions.has(a.sessionId)
            && (a.direction === 'en-zh' || a.direction === 'zh-en')
            && (a.selectedId === null || words.has(a.selectedId))
            && (a.reason === 'answer' || (a.reason === 'unknown' || a.reason === 'timeout') && !a.correct),
        a => a.reason !== 'timeout'),
        spelling: firstBySession(data.spellingAttempts, a => valid(a) && validSpelling(a), independent),
        cloze: firstBySession(data.clozeAttempts, a => valid(a) && validSpelling(a) && validCloze(a), independent),
    };
    const nowDay = localDayNumber(now);
    const eligibleWords = windows.map(() => 0);
    const counts = modes.map(() => windows.map(() => ({ validAttempts: 0, correct: 0, denominator: 0 })));
    for (const word of words) {
        const byMode = modes.map(mode => attempts[mode].get(word));
        let anchor = Infinity;
        for (const rounds of byMode)
            for (const a of rounds?.values() ?? [])
                if (a.eligible && a.at < anchor)
                    anchor = a.at;
        if (!Number.isFinite(anchor))
            continue;
        const anchorDay = localDayNumber(anchor);
        windows.forEach((w, i) => {
            if (nowDay - anchorDay >= w.fromDay)
                eligibleWords[i]++;
        });
        byMode.forEach((rounds, modeIndex) => {
            const earliest: Array<Attempt | undefined> = [];
            const modeCounts = counts[modeIndex];
            for (const a of rounds?.values() ?? []) {
                if (!a.eligible)
                    continue;
                const day = localDayNumber(a.at) - anchorDay;
                const i = windows.findIndex(w => day >= w.fromDay && day <= w.toDay);
                if (i === -1)
                    continue;
                modeCounts[i].validAttempts++;
                const prior = earliest[i];
                if (!prior || earlier(a, prior))
                    earliest[i] = a;
            }
            earliest.forEach((a, i) => {
                if (a) {
                    modeCounts[i].denominator++;
                    modeCounts[i].correct += Number(a.correct);
                }
            });
        });
    }
    return {
        points: modes.flatMap((mode, modeIndex) => windows.map((window, i) => {
            const count = counts[modeIndex][i];
            const evaluable = count.denominator >= RATE_MIN_SAMPLE;
            return {
                ...window, mode, ...count, eligibleWords: eligibleWords[i], uniqueWords: count.denominator,
                minSample: RATE_MIN_SAMPLE, evaluable, rate: evaluable ? percent(count.correct, count.denominator) : null,
            };
        })),
        notes: [
            '以每个词有据可查的最早合格作答为起点，按本机自然日统计。只预览、接触或播放发音不会建立起点。D1 取第 1 天，D7 取第 6–8 天，D30 取第 27–33 天。',
            '每轮每词先取首次记录，每个词在同一窗口和题型里再取最早的合格作答。选择题含两个方向，历史记录未注明是否借助提示或播放发音。主动选“不认识”记未答对，超时未作答不入分母。',
            '拼写和已保存阅读原句填空分别统计，只计明确未辅助、未重试的作答。窗口已开始但没有合格作答的词只用于说明覆盖范围。',
            `这些比例只反映实际练到的词，受选题、复习安排和练习机会影响。样本少于 ${RATE_MIN_SAMPLE} 个词时留空。`,
        ],
    };
}
