// —— Phase 8：字幕导入与时间轴（SRT / VTT / TXT）——
// 纪律：
//  * 只解析用户真正提供的文件内容，绝不声称“自动获取了平台字幕”；
//  * provenance 原样保留（user_supplied 永远不会被升级为 official）；
//  * 时间戳不可靠时明确报错，不猜；重叠/乱序只警告并保留原始时间；
//  * TXT 没有时间轴：timed=false，cue 时间全 0，不能当作字幕时间轴使用。
import type { CaptionCue, InputProvenance, Transcript } from './types.ts';
export type TranscriptFormat = 'srt' | 'vtt' | 'txt';
export type TranscriptErrorCode = 'empty' | 'too-large' | 'unsupported-format' | 'invalid-timestamp' | 'no-cues';
export interface TranscriptParseInput {
    raw: string;
    format?: TranscriptFormat | '';
    fileName?: string;
    language?: string;
    provenance?: InputProvenance;
    sourceId?: string;
    now?: number;
}
export type TranscriptParseResult = {
    ok: true;
    transcript: Transcript;
    warnings: string[];
} | {
    ok: false;
    code: TranscriptErrorCode;
    message: string;
    line?: number;
};
export const TRANSCRIPT_LIMITS = { maxChars: 2000000, maxCues: 20000, maxCueChars: 2000 };
export function detectFormat(raw: string, fileName = ''): TranscriptFormat {
    const ext = fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
    if (ext === 'srt')
        return 'srt';
    if (ext === 'vtt')
        return 'vtt';
    if (ext === 'txt' || ext === 'text')
        return 'txt';
    const head = raw.replace(/^\uFEFF/, '').trimStart();
    if (/^WEBVTT/i.test(head))
        return 'vtt';
    if (/-->/.test(head))
        return /^\d+\s*$/m.test(head) ? 'srt' : 'vtt';
    return 'txt';
}
/** 时间戳 → 毫秒；支持 HH:MM:SS,mmm / HH:MM:SS.mmm / MM:SS.mmm；非法返回 null */
export function parseTimestamp(value: string): number | null {
    const m = value.trim().match(/^(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})(?:[.,](\d{1,3}))?$/);
    if (!m)
        return null;
    const h = m[1] === undefined ? 0 : Number(m[1]);
    const min = Number(m[2]);
    const sec = Number(m[3]);
    const ms = m[4] === undefined ? 0 : Number(m[4].padEnd(3, '0'));
    if (min > 59 || sec > 59)
        return null;
    return ((h * 60 + min) * 60 + sec) * 1000 + ms;
}
export function formatTimestamp(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0)
        ms = 0;
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const milli = Math.round(ms % 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(milli).padStart(3, '0')}`;
}
function clean(raw: string): string {
    return raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').replace(/\u200b/g, '');
}
function hashString(s: string): string {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16).padStart(8, '0') + '-' + s.length.toString(16);
}
function cueLines(block: string): {
    times: string;
    text: string;
    marker: string;
} | null {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    const idx = lines.findIndex(l => l.includes('-->'));
    if (idx < 0)
        return null;
    const times = lines[idx];
    const text = lines.slice(idx + 1).join(' ').trim();
    const marker = idx > 0 && /^\d+$/.test(lines[0]) ? lines[0] : lines[0] ?? '';
    return { times, text, marker };
}
export function parseTranscript(input: TranscriptParseInput): TranscriptParseResult {
    const raw = clean(input.raw ?? '');
    if (!raw.trim())
        return { ok: false, code: 'empty', message: '字幕内容为空。' };
    if (raw.length > TRANSCRIPT_LIMITS.maxChars)
        return { ok: false, code: 'too-large', message: `字幕文件过大（上限 ${TRANSCRIPT_LIMITS.maxChars} 字符）。` };
    const format = input.format || detectFormat(raw, input.fileName);
    const language = (input.language || 'en').toLowerCase();
    const provenance: InputProvenance = input.provenance ?? 'user_supplied';
    const warnings: string[] = [];
    const cues: CaptionCue[] = [];
    let timed = format !== 'txt';
    if (format === 'txt') {
        const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
        for (const line of lines) {
            if (line.length > TRANSCRIPT_LIMITS.maxCueChars)
                return { ok: false, code: 'too-large', message: `单行字幕过长（上限 ${TRANSCRIPT_LIMITS.maxCueChars} 字符）。` };
            cues.push({ startMs: 0, endMs: 0, text: line, language, provenance });
        }
    }
    else {
        const body = raw.replace(/^WEBVTT[^\n]*\n?/i, '');
        const blocks = body.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
        let lineNo = 0;
        for (const block of blocks) {
            lineNo += block.split('\n').length + 1;
            if (/^(NOTE|STYLE|REGION)\b/.test(block))
                continue;
            const parsed = cueLines(block);
            if (!parsed)
                continue;
            const [left, rightRaw] = parsed.times.split('-->');
            const right = rightRaw.trim().split(/\s+/)[0];
            const start = parseTimestamp(left);
            const end = parseTimestamp(right);
            if (start === null || end === null)
                return { ok: false, code: 'invalid-timestamp', message: `第 ${lineNo} 行附近的时间戳无法解析：${parsed.times.trim()}`, line: lineNo };
            if (end < start)
                return { ok: false, code: 'invalid-timestamp', message: `第 ${lineNo} 行附近的结束时间早于开始时间。`, line: lineNo };
            const text = parsed.text.replace(/<[^>]+>/g, '').trim();
            if (!text) {
                warnings.push(`第 ${lineNo} 行附近有一条空字幕，已跳过。`);
                continue;
            }
            if (text.length > TRANSCRIPT_LIMITS.maxCueChars)
                return { ok: false, code: 'too-large', message: `单条字幕过长（上限 ${TRANSCRIPT_LIMITS.maxCueChars} 字符）。` };
            cues.push({ startMs: start, endMs: end, text, language, provenance });
            if (cues.length > TRANSCRIPT_LIMITS.maxCues)
                return { ok: false, code: 'too-large', message: `字幕条数过多（上限 ${TRANSCRIPT_LIMITS.maxCues}）。` };
        }
    }
    if (!cues.length)
        return { ok: false, code: 'no-cues', message: '没有解析到任何字幕内容。' };
    // 去重（完全相同的连续时间轴+文本）与乱序检测
    const deduped: CaptionCue[] = [];
    for (const cue of cues) {
        const prev = deduped[deduped.length - 1];
        if (prev && prev.startMs === cue.startMs && prev.endMs === cue.endMs && prev.text === cue.text) {
            warnings.push('发现重复字幕，已合并。');
            continue;
        }
        deduped.push(cue);
    }
    let outOfOrder = false;
    for (let i = 1; i < deduped.length; i++)
        if (deduped[i].startMs < deduped[i - 1].startMs) {
            outOfOrder = true;
            break;
        }
    if (outOfOrder && timed) {
        deduped.sort((a, b) => a.startMs - b.startMs);
        warnings.push('字幕时间轴存在乱序，已按开始时间排序（原始文本未改动）。');
    }
    let overlap = false;
    for (let i = 1; i < deduped.length; i++)
        if (timed && deduped[i].startMs < deduped[i - 1].endMs)
            overlap = true;
    if (overlap)
        warnings.push('字幕时间轴有重叠，已保留原始时间（未裁剪）。');
    const now = input.now ?? Date.now();
    const hash = hashString(`${provenance}|${language}|${format}|${deduped.map(c => `${c.startMs}-${c.endMs}:${c.text}`).join('\n')}`);
    return {
        ok: true, warnings,
        transcript: {
            id: `tr_${hash.slice(0, 10)}`, sourceId: input.sourceId ?? '', language, provenance,
            timed: timed && deduped.some(c => c.endMs > 0), cues: deduped, hash,
            fileName: input.fileName, createdAt: now, updatedAt: now, warnings: warnings.length ? warnings : undefined,
        },
    };
}
export function cuesToText(cues: CaptionCue[], opts: {
    startMs?: number;
    endMs?: number;
} = {}): string {
    const start = opts.startMs ?? -Infinity;
    const end = opts.endMs ?? Infinity;
    return cues.filter(c => c.endMs >= start && c.startMs <= end).map(c => c.text).join(' ').replace(/\s+/g, ' ').trim();
}
export function transcriptStats(t: Transcript): {
    cues: number;
    characters: number;
    durationMinutes: number;
    timed: boolean;
} {
    const characters = t.cues.reduce((n, c) => n + c.text.length, 0);
    const durationMs = t.cues.reduce((m, c) => Math.max(m, c.endMs), 0);
    return { cues: t.cues.length, characters, durationMinutes: Math.round(durationMs / 60000), timed: t.timed };
}
/** 同一 source 下同一内容视为重复导入（返回已有字幕，避免重复 cue 与重复证据） */
export function findDuplicateTranscript(existing: Transcript[], next: {
    sourceId: string;
    hash: string;
}): Transcript | null {
    return existing.find(t => t.sourceId === next.sourceId && t.hash === next.hash) ?? null;
}
