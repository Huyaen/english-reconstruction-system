// —— Phase 8：字幕 → Reading / Sentence 交接 ——
// 复用 Phase 5 的导入与难句管线，不新建第二套文章理解引擎：
//  * 英文 transcript 可以生成 Passage（保留 inputSourceId / transcriptId / caption 时间范围 / provenance）；
//  * 难句走 handoffToSentenceRecord（structure=null, provenance='none'），绝不伪造 gold parse；
//  * 字幕是中文译文时不做“英语原声转录”的解释（provenance 与 language 原样保留）。
import type { CaptionCue, InputSource, Passage, Transcript } from './types.ts';
import { buildPastedDraft, toPassage, type ImportResult, type PassageDraft } from './readingImport.ts';
import { cuesToText } from './transcript.ts';
import { handoffToSentenceRecord } from './sentenceSources.ts';
import type { SentenceRecord } from './types.ts';

export interface TranscriptHandoffOptions {
    title?: string;
    topic?: string;
    now?: number;
    startMs?: number;
    endMs?: number;
}
export function transcriptPassageDraft(transcript: Transcript, source: InputSource, opts: TranscriptHandoffOptions = {}): ImportResult<PassageDraft> {
    if (transcript.language !== 'en')
        return { ok: false, error: { code: 'unsupported-document', message: '只有英文字幕可以进入 Reading Lab。', hint: '中文字幕不能当作英语原声转录。', fallback: ['paste'], stage: 'source-validation' }, stages: [] };
    const text = cuesToText(transcript.cues, { startMs: opts.startMs, endMs: opts.endMs });
    const built = buildPastedDraft({ raw: text, title: opts.title ?? source.title, topic: opts.topic ?? source.topic, allowShort: true });
    if (!built.ok)
        return built;
    const draft: PassageDraft = {
        ...built.value,
        sourceType: 'library_item',
        sourceUrl: source.url,
        sourceName: source.title,
        sourceReliability: transcript.provenance === 'official_subtitle' ? 'authoritative' : transcript.provenance === 'user_supplied' || transcript.provenance === 'manually_transcribed' ? 'user_provided' : 'unknown',
        extractionMethod: 'manual',
        sourceMetadata: {
            inputSourceId: source.id,
            transcriptId: transcript.id,
            captionProvenance: transcript.provenance,
            captionLanguage: transcript.language,
            timeRange: `${opts.startMs ?? 0}-${opts.endMs ?? transcript.cues.reduce((m, c) => Math.max(m, c.endMs), 0)}`,
        },
        notes: [...built.value.notes, `来自字幕导入（${transcript.provenance}），不是平台自动抓取。`],
    };
    return { ...built, value: draft };
}
export function transcriptPassage(transcript: Transcript, source: InputSource, opts: TranscriptHandoffOptions = {}): ImportResult<Passage> {
    const built = transcriptPassageDraft(transcript, source, opts);
    if (!built.ok)
        return built;
    return { ok: true, value: toPassage(built.value, opts.now ?? Date.now()), stages: built.stages };
}
export interface SentenceCandidate {
    text: string;
    startMs: number;
    endMs: number;
    context: string;
}
/** 从字幕里挑出“长得像难句”的片段（启发式，仅用于候选；不声称结构已分析） */
export function sentenceCandidates(transcript: Transcript, opts: { limit?: number; minWords?: number } = {}): SentenceCandidate[] {
    const limit = opts.limit ?? 8;
    const minWords = opts.minWords ?? 12;
    const out: SentenceCandidate[] = [];
    for (let i = 0; i < transcript.cues.length; i++) {
        const cue = transcript.cues[i];
        const words = cue.text.trim().split(/\s+/);
        if (words.length < minWords)
            continue;
        out.push({
            text: cue.text.trim(),
            startMs: cue.startMs,
            endMs: cue.endMs,
            context: [transcript.cues[i - 1]?.text, cue.text, transcript.cues[i + 1]?.text].filter(Boolean).join(' ').slice(0, 300),
        });
        if (out.length >= limit)
            break;
    }
    return out;
}
export function transcriptSentenceRecord(input: { passage: Passage; candidate: SentenceCandidate; now?: number }): { record: SentenceRecord; issues: string[] } {
    return handoffToSentenceRecord({
        sentence: input.candidate.text,
        passageId: input.passage.id,
        sourceSpan: [input.candidate.startMs, input.candidate.endMs],
        unknownWords: [],
        userMarkedDifficulty: true,
        context: input.candidate.context,
    }, input.now ?? Date.now());
}
/** 字幕 → 词汇曝光：只记 Exposure，绝不提升 Mastery（由调用方走 Phase 2 的 exposure 管线） */
export function exposureWordsFromCues(cues: CaptionCue[], limit = 200): string[] {
    const counts = new Map<string, number>();
    for (const cue of cues)
        for (const w of cue.text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [])
            counts.set(w, (counts.get(w) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([w]) => w);
}
