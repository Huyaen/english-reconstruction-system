// —— Phase 8：Input Hub 应用层编排（读写 + 证据 + 交接）——
// 所有写入都走 inputStore（单事务/revision/幂等）；这里不做展示。
import type { Data, InputSession, InputSource, LibraryItem, Passage, Transcript } from './types.ts';
import { createInputSource, updateInputSource } from './inputSource.ts';
import { parseInputUrl } from './inputUrl.ts';
import { saveToLibrary as saveToLibraryPure, deleteLibraryItem as deleteLibraryPure, markOpened as markOpenedPure, setLibraryCompletion } from './inputLibrary.ts';
import { createInputSession, startInputSession, pauseInputSession, resumeInputSession, beginReflection, completeInputSession, abandonInputSession, recordBaseline } from './inputSession.ts';
import { submitInputReflection } from './inputSession.ts';
import type { ReflectionInput } from './inputReflection.ts';
import { parseTranscript, findDuplicateTranscript, cuesToText } from './transcript.ts';
import { estimateInputDifficulty } from './inputDifficulty.ts';
import { sessionEvidence } from './inputEvidence.ts';
import {
    appendInputEvidence, createSessionRecord, deleteLibraryItemById, saveInputSource, saveLibraryItem,
    saveTranscript, transitionSession,
} from './inputStore.ts';
import { transcriptPassage } from './inputHandoff.ts';

export type ActionResult<T> = { ok: true; value: T } | { ok: false; message: string };
export async function addSource(data: Data, input: Parameters<typeof createInputSource>[0]): Promise<ActionResult<{ source: InputSource; library: LibraryItem }>> {
    const created = createInputSource(input, data.inputSources ?? []);
    if (!created.ok)
        return { ok: false, message: created.message };
    await saveInputSource(created.source);
    const lib = saveToLibraryPure(data.libraryItems ?? [], created.source, input.now ?? Date.now());
    await saveLibraryItem(lib.item);
    return { ok: true, value: { source: created.source, library: lib.item } };
}
export async function patchSource(data: Data, id: string, patch: Parameters<typeof updateInputSource>[1]): Promise<ActionResult<InputSource>> {
    const source = (data.inputSources ?? []).find(s => s.id === id);
    if (!source)
        return { ok: false, message: '找不到这份材料。' };
    const next = updateInputSource(source, patch);
    if (!next.ok)
        return { ok: false, message: next.message };
    await saveInputSource(next.source);
    return { ok: true, value: next.source };
}
export async function saveLibraryAction(data: Data, sourceId: string, now = Date.now()): Promise<ActionResult<LibraryItem>> {
    const source = (data.inputSources ?? []).find(s => s.id === sourceId);
    if (!source)
        return { ok: false, message: '找不到这份材料。' };
    const lib = saveToLibraryPure(data.libraryItems ?? [], source, now);
    await saveLibraryItem(lib.item);
    return { ok: true, value: lib.item };
}
export async function archiveLibraryAction(data: Data, libraryId: string): Promise<ActionResult<LibraryItem>> {
    const item = (data.libraryItems ?? []).find(i => i.id === libraryId);
    if (!item)
        return { ok: false, message: '找不到这条收藏。' };
    const next = { ...item, status: 'archived' as const, updatedAt: Date.now() };
    await saveLibraryItem(next);
    return { ok: true, value: next };
}
export async function deleteLibraryAction(libraryId: string): Promise<ActionResult<true>> {
    await deleteLibraryItemById(libraryId);
    return { ok: true, value: true };
}
export async function markOpenedAction(data: Data, libraryId: string, now = Date.now()): Promise<ActionResult<LibraryItem>> {
    const item = (data.libraryItems ?? []).find(i => i.id === libraryId);
    if (!item)
        return { ok: false, message: '找不到这条收藏。' };
    const next = markOpenedPure([item], item.id, now)[0];
    await saveLibraryItem(next);
    return { ok: true, value: next };
}
export async function setCompletionAction(data: Data, libraryId: string, completion: number): Promise<ActionResult<LibraryItem>> {
    const item = (data.libraryItems ?? []).find(i => i.id === libraryId);
    if (!item)
        return { ok: false, message: '找不到这条收藏。' };
    const next = setLibraryCompletion([item], item.id, completion)[0];
    await saveLibraryItem(next);
    return { ok: true, value: next };
}
export interface TranscriptImportInput {
    sourceId: string;
    raw: string;
    format?: '' | 'srt' | 'vtt' | 'txt';
    fileName?: string;
    language?: string;
    provenance?: Transcript['provenance'];
    now?: number;
}
export async function importTranscriptAction(data: Data, input: TranscriptImportInput): Promise<ActionResult<{ transcript: Transcript; duplicate: boolean; warnings: string[]; difficulty: number | null }>> {
    const source = (data.inputSources ?? []).find(s => s.id === input.sourceId);
    if (!source)
        return { ok: false, message: '找不到这份材料，请先添加链接。' };
    const parsed = parseTranscript({
        raw: input.raw, format: input.format, fileName: input.fileName, language: input.language ?? (source.language === 'unknown' ? 'en' : source.language),
        provenance: input.provenance ?? 'user_supplied', sourceId: source.id, now: input.now,
    });
    if (!parsed.ok)
        return { ok: false, message: parsed.message };
    const dup = findDuplicateTranscript((data.transcripts ?? []).filter(t => t.sourceId === source.id), { sourceId: source.id, hash: parsed.transcript.hash });
    if (dup) {
        return { ok: true, value: { transcript: dup, duplicate: true, warnings: ['这段字幕已经导入过，未重复保存。'], difficulty: null } };
    }
    await saveTranscript(parsed.transcript);
    const estimate = estimateInputDifficulty({ transcript: parsed.transcript, words: data.words ?? [] });
    const subtitleStatus = parsed.transcript.provenance === 'official_subtitle' ? 'official' : parsed.transcript.provenance === 'machine_generated_unverified' ? 'machine' : 'user_supplied';
    const updated = updateInputSource(source, {
        transcriptRef: parsed.transcript.id, subtitleStatus,
        language: parsed.transcript.language,
        ...(estimate ? { difficultyEstimate: estimate.estimate, difficultyBasis: 'transcript' as const } : {}),
    }, input.now ?? Date.now());
    if (updated.ok)
        await saveInputSource(updated.source);
    return { ok: true, value: { transcript: parsed.transcript, duplicate: false, warnings: parsed.warnings, difficulty: estimate?.estimate ?? null } };
}
export async function startInputAction(data: Data, input: { sourceId: string; mode: InputSession['mode']; minutes?: number; miniUnitId?: string | null; now?: number }): Promise<ActionResult<InputSession>> {
    const source = (data.inputSources ?? []).find(s => s.id === input.sourceId);
    if (!source)
        return { ok: false, message: '找不到这份材料。' };
    if (!parseInputUrl(source.url).ok)
        return { ok: false, message: '这份材料的链接不可用，请先修复链接。' };
    const created = createInputSession({ source, mode: input.mode, plannedMinutes: input.minutes, miniUnitId: input.miniUnitId, now: input.now });
    if (!created.ok)
        return { ok: false, message: created.message };
    const started = startInputSession(created.session, { now: input.now });
    const session = started.ok ? started.session : created.session;
    await createSessionRecord(session);
    const lib = saveToLibraryPure(data.libraryItems ?? [], source, input.now ?? Date.now());
    await saveLibraryItem(lib.item);
    return { ok: true, value: session };
}
export type SessionActionKind = 'pause' | 'resume' | 'reflection' | 'abandon' | 'complete';
export async function sessionAction(id: string, expectedRevision: number | undefined, kind: SessionActionKind, now = Date.now()): Promise<ActionResult<InputSession>> {
    const map = {
        pause: (s: InputSession) => pauseInputSession(s, { expectedRevision, now }),
        resume: (s: InputSession) => resumeInputSession(s, { expectedRevision, now }),
        reflection: (s: InputSession) => beginReflection(s, { expectedRevision, now }),
        abandon: (s: InputSession) => abandonInputSession(s, { expectedRevision, now }),
        complete: (s: InputSession) => completeInputSession(s, { expectedRevision, now }),
    } as const;
    const result = await transitionSession(id, expectedRevision, map[kind]);
    if (!result.ok)
        return { ok: false, message: result.message };
    if (kind === 'complete' && !result.noop)
        await appendInputEvidence(sessionEvidence(result.session, now));
    return { ok: true, value: result.session };
}
export async function baselineAction(id: string, expectedRevision: number | undefined, input: Parameters<typeof recordBaseline>[1]): Promise<ActionResult<InputSession>> {
    const result = await transitionSession(id, expectedRevision, s => recordBaseline(s, input));
    if (!result.ok)
        return { ok: false, message: result.message };
    return { ok: true, value: result.session };
}
export async function reflectionAction(id: string, expectedRevision: number | undefined, input: Omit<ReflectionInput, 'mode'> & { mode?: InputSession['mode'] }, now = Date.now()): Promise<ActionResult<InputSession>> {
    const result = await transitionSession(id, expectedRevision, s => submitInputReflection(s, input, { expectedRevision, now }));
    if (!result.ok)
        return { ok: false, message: result.message };
    return { ok: true, value: result.session };
}
/** 字幕 → Reading：生成 Passage（保留来源与时间范围），不新建第二套阅读引擎 */
export async function sendTranscriptToReading(data: Data, input: { sourceId: string; transcriptId: string; title?: string; topic?: string; startMs?: number; endMs?: number; now?: number }): Promise<ActionResult<Passage>> {
    const source = (data.inputSources ?? []).find(s => s.id === input.sourceId);
    const transcript = (data.transcripts ?? []).find(t => t.id === input.transcriptId);
    if (!source || !transcript)
        return { ok: false, message: '找不到字幕或材料。' };
    const built = transcriptPassage(transcript, source, { title: input.title, topic: input.topic, startMs: input.startMs, endMs: input.endMs, now: input.now });
    if (!built.ok)
        return { ok: false, message: built.error.message };
    return { ok: true, value: built.value };
}
export function transcriptText(data: Data, transcriptId: string): string {
    const t = (data.transcripts ?? []).find(x => x.id === transcriptId);
    return t ? cuesToText(t.cues) : '';
}
