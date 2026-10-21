// —— Phase 8：真实材料（InputSource）创建与更新 ——
// 纪律：
//  * 只保存用户真正提供的链接与信息；标题/时长/语言不做任何猜测；
//  * 创建时 verificationStatus 恒为 unverified（我们没有真的验证过播放/字幕）；
//  * difficultyEstimate 在没有任何 transcript 前为 null，difficultyBasis='none'；
//  * 重复材料按规范化 URL / 同平台 videoId 判定，不静默覆盖。
import type { InputContentType, InputSource, InputSubtitleStatus } from './types.ts';
import { contentTypeOf, parseInputUrl, sameInputTarget } from './inputUrl.ts';

export type SourceErrorCode = 'empty-title' | 'empty-topic' | 'invalid-url' | 'unsafe-url' | 'duplicate' | 'invalid-duration' | 'invalid-kind';
export type SourceResult = { ok: true; source: InputSource } | { ok: false; code: SourceErrorCode; message: string; existingId?: string };
export interface CreateSourceInput {
    title: string;
    url: string;
    topic: string;
    durationMinutes?: number | null;
    language?: string;
    contentType?: InputContentType | '';
    subtitleStatus?: InputSubtitleStatus;
    notes?: string;
    now?: number;
}
export function createInputSource(input: CreateSourceInput, existing: InputSource[] = []): SourceResult {
    const title = (input.title ?? '').trim();
    const topic = (input.topic ?? '').trim();
    if (!title)
        return { ok: false, code: 'empty-title', message: '请给这份材料一个标题（之后可以改）。' };
    if (title.length > 200)
        return { ok: false, code: 'empty-title', message: '标题过长（上限 200 字）。' };
    if (!topic)
        return { ok: false, code: 'empty-topic', message: '请填写主题（自由文本，任何主题都可以）。' };
    if (topic.length > 60)
        return { ok: false, code: 'empty-topic', message: '主题过长（上限 60 字）。' };
    const url = parseInputUrl(input.url);
    if (!url.ok)
        return { ok: false, code: url.code === 'unsafe-scheme' || url.code === 'credentials' ? 'unsafe-url' : 'invalid-url', message: url.message };
    const dup = existing.find(s => sameInputTarget(s, { url: url.normalizedUrl, normalizedUrl: url.normalizedUrl, provider: url.provider, videoId: url.videoId }));
    if (dup)
        return { ok: false, code: 'duplicate', message: '这份材料已经在你的 Input Library 里了。', existingId: dup.id };
    let duration = Number(input.durationMinutes ?? 0);
    if (!Number.isFinite(duration) || duration < 0)
        duration = 0;
    if (duration > 600)
        return { ok: false, code: 'invalid-duration', message: '时长请填 0–600 分钟（0 = 还不知道，不做猜测）。' };
    const now = input.now ?? Date.now();
    const source: InputSource = {
        id: `src_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        title, kind: kindOf(input.contentType, url.provider), url: url.url, topic,
        durationMinutes: Math.round(duration), difficultyEstimate: null, createdAt: now,
        provider: url.provider, language: (input.language ?? '').trim().toLowerCase() || 'unknown',
        provenance: 'user_supplied', verificationStatus: 'unverified', verifiedAt: null,
        subtitleStatus: input.subtitleStatus ?? 'unknown', transcriptRef: null,
        contentType: contentTypeOf(url.provider, input.contentType),
        notes: (input.notes ?? '').trim().slice(0, 500),
        updatedAt: now, normalizedUrl: url.normalizedUrl, videoId: url.videoId,
        contentHash: url.videoId ? `${url.provider}:${url.videoId}` : `url:${url.normalizedUrl}`,
        difficultyBasis: 'none',
    };
    return { ok: true, source };
}
function kindOf(contentType: InputContentType | '' | undefined, provider: string): InputSource['kind'] {
    const ct = contentTypeOf(provider as never, contentType);
    if (ct === 'article')
        return 'article';
    if (ct === 'game_content' || ct === 'esports')
        return 'game';
    if (ct === 'youtube' || ct === 'bilibili' || ct === 'online_video' || ct === 'documentary' || ct === 'series_clip')
        return 'video';
    return 'other';
}
/** 允许改标题/主题/备注/时长/字幕状态；不允许悄悄改 URL 归属或伪造验证状态 */
export function updateInputSource(source: InputSource, patch: Partial<Pick<InputSource, 'title' | 'topic' | 'notes' | 'durationMinutes' | 'language' | 'contentType' | 'subtitleStatus' | 'transcriptRef' | 'difficultyEstimate' | 'difficultyBasis'>>, now = Date.now()): SourceResult {
    const next: InputSource = { ...source, updatedAt: now };
    if (patch.title !== undefined) {
        const title = patch.title.trim();
        if (!title || title.length > 200)
            return { ok: false, code: 'empty-title', message: '标题不能为空且不超过 200 字。' };
        next.title = title;
    }
    if (patch.topic !== undefined) {
        const topic = patch.topic.trim();
        if (!topic || topic.length > 60)
            return { ok: false, code: 'empty-topic', message: '主题不能为空且不超过 60 字。' };
        next.topic = topic;
    }
    if (patch.notes !== undefined)
        next.notes = patch.notes.slice(0, 500);
    if (patch.durationMinutes !== undefined) {
        if (!Number.isFinite(patch.durationMinutes) || patch.durationMinutes < 0 || patch.durationMinutes > 600)
            return { ok: false, code: 'invalid-duration', message: '时长需在 0–600 分钟之间。' };
        next.durationMinutes = Math.round(patch.durationMinutes);
    }
    if (patch.language !== undefined)
        next.language = patch.language.trim().toLowerCase() || 'unknown';
    if (patch.contentType !== undefined)
        next.contentType = patch.contentType;
    if (patch.subtitleStatus !== undefined)
        next.subtitleStatus = patch.subtitleStatus;
    if (patch.transcriptRef !== undefined)
        next.transcriptRef = patch.transcriptRef;
    // 只有确实基于 transcript 计算时才允许写难度估计，且必须同时标注依据
    if (patch.difficultyEstimate !== undefined) {
        if (patch.difficultyEstimate === null) {
            next.difficultyEstimate = null;
            next.difficultyBasis = 'none';
        }
        else if (patch.difficultyBasis === 'transcript' && patch.difficultyEstimate >= 0 && patch.difficultyEstimate <= 1) {
            next.difficultyEstimate = Math.round(patch.difficultyEstimate * 100) / 100;
            next.difficultyBasis = 'transcript';
        }
        else
            return { ok: false, code: 'invalid-url', message: '没有 transcript 依据时不能写难度估计。' };
    }
    return { ok: true, source: next };
}
/** 材料是否真的可用：有可安全打开的地址（这是唯一可以确认的事实） */
export function isAvailable(source: InputSource): boolean {
    return parseInputUrl(source.url).ok;
}
export function availabilityLabel(source: InputSource): string {
    if (!isAvailable(source))
        return '链接不可用';
    if (source.verificationStatus === 'unverified')
        return '已在浏览器打开验证？未验证';
    return source.verificationStatus === 'metadata_verified' ? '元数据已验证' : '用户已确认';
}
