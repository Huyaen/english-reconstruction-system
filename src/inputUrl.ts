// —— Phase 8：URL 校验与平台解析（纯函数，无网络）——
// 原则：
//  1) 只接受 http/https；javascript:/data:/file:/blob: 一律拒绝（安全打开）；
//  2) 不信任标题、不猜字幕/时长/语言：解析只做「能从 URL 可靠拿到的信息」；
//  3) 规范化用于去重（去掉追踪参数、统一 host/末尾斜杠）；
//  4) 平台识别失败不算错误——当普通网页处理（provider='web'）。
import type { InputContentType, InputProvider } from './types.ts';

export type UrlErrorCode = 'empty' | 'invalid' | 'unsafe-scheme' | 'credentials' | 'host-missing' | 'too-long';
export interface ParsedInputUrl {
    ok: true;
    /** 用户输入的原始字符串（trim 后） */
    raw: string;
    /** 规范化后的可打开地址 */
    url: string;
    normalizedUrl: string;
    provider: InputProvider;
    videoId: string;
    host: string;
    protocol: 'http:' | 'https:';
}
export interface UrlError {
    ok: false;
    code: UrlErrorCode;
    message: string;
}
const TRACKING_PARAMS = new Set(['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'si', 'feature', 'fbclid', 'gclid', 'spm_id_from', 'vd_source', 'share_source', 'share_medium', 'share_platform', 'from', 'ref', 'ref_src']);
const UNSAFE = new Set(['javascript:', 'data:', 'file:', 'blob:', 'vbscript:', 'about:', 'chrome:', 'edge:']);

export function parseInputUrl(rawInput: string): ParsedInputUrl | UrlError {
    const raw = (rawInput ?? '').trim();
    if (!raw)
        return { ok: false, code: 'empty', message: '请填写材料地址。' };
    if (raw.length > 2000)
        return { ok: false, code: 'too-long', message: '地址过长（超过 2000 字符）。' };
    const lower = raw.toLowerCase();
    for (const scheme of UNSAFE)
        if (lower.startsWith(scheme))
            return { ok: false, code: 'unsafe-scheme', message: `出于安全考虑不接受 ${scheme} 开头的地址。` };
    let candidate = raw;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(candidate))
        candidate = `https://${candidate.replace(/^\/+/, '')}`;
    let u: URL;
    try {
        u = new URL(candidate);
    }
    catch {
        return { ok: false, code: 'invalid', message: '这不是一个有效的网址。' };
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:')
        return { ok: false, code: 'unsafe-scheme', message: '只支持 http / https 链接。' };
    if (u.username || u.password)
        return { ok: false, code: 'credentials', message: '地址里包含用户名或密码，已拒绝保存。' };
    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    if (!host || !host.includes('.'))
        return { ok: false, code: 'host-missing', message: '地址缺少有效的域名。' };
    for (const key of [...u.searchParams.keys()])
        if (TRACKING_PARAMS.has(key.toLowerCase()))
            u.searchParams.delete(key);
    u.hash = '';
    const parsed = classifyPlatform(u);
    const normalizedUrl = canonicalUrl(u, parsed.provider, parsed.videoId);
    return {
        ok: true, raw, url: normalizedUrl || u.toString(), normalizedUrl: normalizedUrl || u.toString(),
        provider: parsed.provider, videoId: parsed.videoId, host, protocol: u.protocol as 'http:' | 'https:',
    };
}
function classifyPlatform(u: URL): { provider: InputProvider; videoId: string } {
    const host = u.hostname.toLowerCase();
    // YouTube
    if (host === 'youtu.be') {
        const id = u.pathname.split('/').filter(Boolean)[0] ?? '';
        return { provider: 'youtube', videoId: safeId(id) };
    }
    if (/(^|\.)youtube\.com$/.test(host) || host === 'youtube-nocookie.com') {
        const v = u.searchParams.get('v') ?? '';
        if (v)
            return { provider: 'youtube', videoId: safeId(v) };
        const m = u.pathname.match(/\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{6,20})/);
        return { provider: 'youtube', videoId: m ? safeId(m[1]) : '' };
    }
    // Bilibili
    if (/(^|\.)bilibili\.com$/.test(host) || host === 'b23.tv') {
        const m = u.pathname.match(/\/(BV[A-Za-z0-9]{8,12}|av\d{1,12})/i);
        return { provider: 'bilibili', videoId: m ? m[1] : '' };
    }
    if (/(^|\.)vimeo\.com$/.test(host)) {
        const m = u.pathname.match(/\/(\d{5,12})/);
        return { provider: 'vimeo', videoId: m ? m[1] : '' };
    }
    return { provider: 'web', videoId: '' };
}
function safeId(id: string): string {
    return /^[A-Za-z0-9_-]{2,24}$/.test(id) ? id : '';
}
function canonicalUrl(u: URL, provider: InputProvider, videoId: string): string {
    if (provider === 'youtube' && videoId)
        return `https://www.youtube.com/watch?v=${videoId}`;
    if (provider === 'bilibili' && videoId)
        return `https://www.bilibili.com/video/${videoId}`;
    if (provider === 'vimeo' && videoId)
        return `https://vimeo.com/${videoId}`;
    const path = u.pathname.replace(/\/+$/, '');
    const search = u.searchParams.toString();
    return `${u.protocol}//${u.hostname}${u.port ? ':' + u.port : ''}${path}${search ? '?' + search : ''}`;
}
/** 安全外部打开：只有 http/https 且无凭据的地址允许 window.open / <a href> */
export function isSafeExternalUrl(url: string): boolean {
    const parsed = parseInputUrl(url);
    return parsed.ok;
}
/** 平台显示名（用于 UI，不是兴趣分类） */
export function providerLabel(provider: InputProvider | undefined): string {
    switch (provider) {
        case 'youtube': return 'YouTube';
        case 'bilibili': return 'Bilibili';
        case 'vimeo': return 'Vimeo';
        case 'web': return '网页';
        default: return '其他来源';
    }
}
/** URL → 内容类型（可由用户覆盖；不改变“任何主题都能用任何媒体类型”） */
export function contentTypeOf(provider: InputProvider, hint?: InputContentType | ''): InputContentType {
    if (hint)
        return hint;
    if (provider === 'youtube')
        return 'youtube';
    if (provider === 'bilibili')
        return 'bilibili';
    if (provider === 'web')
        return 'article';
    if (provider === 'vimeo')
        return 'online_video';
    return 'other';
}
/** 同一材料判定：canonical URL 相同，或同平台同 videoId */
export function sameInputTarget(a: { normalizedUrl?: string; url: string; provider?: string; videoId?: string }, b: { normalizedUrl?: string; url: string; provider?: string; videoId?: string }): boolean {
    const an = a.normalizedUrl ?? (parseInputUrl(a.url) as { normalizedUrl?: string }).normalizedUrl ?? a.url;
    const bn = b.normalizedUrl ?? (parseInputUrl(b.url) as { normalizedUrl?: string }).normalizedUrl ?? b.url;
    if (an && bn && an === bn)
        return true;
    if (a.provider && a.videoId && a.provider === b.provider && a.videoId === b.videoId)
        return true;
    return false;
}
