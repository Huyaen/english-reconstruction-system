// —— Phase 8：输入练习推荐 ——
// 与 Phase 7 的 单元 推荐共用同一套兴趣画像与四类理由；这里只处理“输入练习材料”。
// 三件事必须分离（禁止合成一个不可解释的黑箱分数）：
//   兴趣 → 排序偏好；能力/难度 → 适配；时间/能量 → 任务规模。
import type { Data, EnergyState, InputSource, InterestProfile } from './types.ts';
import { interestFor, REASON_LABELS, type ActivitySignals, type InterestReasonKind } from './interestProfile.ts';
import { providerLabel } from './inputUrl.ts';
export const INPUT_TARGETS = {
    comfort: { min: 0.8, max: 0.9, label: 'Comfort（目标理解 80–90%）' },
    growth: { min: 0.65, max: 0.8, label: 'Growth（目标理解 65–80%）' },
} as const;
export type InputTarget = keyof typeof INPUT_TARGETS;
export interface InputCandidate {
    sourceId: string;
    title: string;
    url: string;
    provider: string;
    contentType: string;
    topic: string;
    durationMinutes: number;
    availability: 'available' | 'unverified';
    verificationStatus: string;
    captionStatus: string;
    transcriptRef: string | null;
    hasTranscript: boolean;
    difficulty: {
        estimate: number | null;
        basis: 'transcript' | 'none';
        confidence: 'low' | 'none';
    };
    reasonKind: InterestReasonKind;
    reasonTag: string;
    reasonZh: string;
    exploration: boolean;
    repeat: boolean;
    facts: string[];
    target: InputTarget | null;
    fitMinutes: number;
}
export interface RecommendationInput {
    data: Data;
    profile: InterestProfile;
    signals: ActivitySignals;
    now: number;
    availableMinutes: number;
    energy: EnergyState;
    unitDay?: number | null;
}
function targetFor(energy: EnergyState, unitDay?: number | null): InputTarget {
    if (energy === 'low')
        return 'comfort';
    if (energy === 'good' || (unitDay ?? 0) >= 3)
        return 'growth';
    return 'comfort';
}
function difficultyOf(source: InputSource, data: Data): InputCandidate['difficulty'] {
    const transcript = (data.transcripts ?? []).find(t => t.sourceId === source.id && t.id === source.transcriptRef) ?? (data.transcripts ?? []).find(t => t.sourceId === source.id);
    if (!transcript || !transcript.timed) {
        // 没有可靠字幕文本时，绝不猜视频里的词汇难度
        return { estimate: null, basis: 'none', confidence: 'none' };
    }
    if (source.difficultyEstimate !== null && source.difficultyEstimate !== undefined && source.difficultyBasis === 'transcript')
        return { estimate: source.difficultyEstimate, basis: 'transcript', confidence: 'low' };
    return { estimate: null, basis: 'none', confidence: 'none' };
}
function lastSessionOn(data: Data, sourceId: string): number {
    const rows = (data.inputSessions ?? []).filter(s => s.sourceId === sourceId && s.status === 'completed');
    return rows.reduce((m, s) => Math.max(m, s.completedAt ?? 0), 0);
}
export function recommendInputs(input: RecommendationInput): {
    candidates: InputCandidate[];
    note: string;
    sufficient: boolean;
    target: InputTarget;
} {
    const { data, profile, signals, now } = input;
    const target = targetFor(input.energy, input.unitDay);
    const activeUnit = (data.miniUnits ?? []).find(u => u.status === 'active' && u.stage !== 'completed' && u.stage !== 'abandoned');
    const unitTopic = activeUnit ? `${activeUnit.topic ?? ''} ${activeUnit.theme ?? ''}`.toLowerCase() : '';
    const scored: {
        cand: InputCandidate;
        score: number;
    }[] = [];
    for (const source of data.inputSources ?? []) {
        const key = `${source.topic} ${source.title}`;
        const interestHit = interestFor(profile, source.topic, source.title);
        const unitHit = !!unitTopic && (unitTopic.includes(source.topic.toLowerCase()) || source.topic.toLowerCase().includes(activeUnit?.topic ?? '\u0000'));
        const signal = signals.topics.find(t => t.key.includes(source.topic.toLowerCase()) || source.topic.toLowerCase().includes(t.key));
        const lastAt = lastSessionOn(data, source.id);
        const repeat = lastAt > 0 && now - lastAt < 7 * 86400000;
        const hasTranscript = !!(source.transcriptRef || (data.transcripts ?? []).some(t => t.sourceId === source.id));
        const difficulty = difficultyOf(source, data);
        let score = 0;
        if (interestHit)
            score += 4 + interestHit.weight * 2;
        if (unitHit)
            score += 2.5;
        score += 1.5 * (signal?.weight ?? 0);
        if (repeat)
            score -= 2;
        if (hasTranscript)
            score += 0.6;
        else
            score -= 0.2;
        const duration = source.durationMinutes || 0;
        if (duration === 0)
            score += 0.1;
        else if (duration <= input.availableMinutes)
            score += 0.5;
        else if (duration > input.availableMinutes * 2.5)
            score -= 1;
        if (input.energy === 'low' && duration > 45)
            score -= 0.8;
        // 难度适配只在有依据时参与（兴趣不改变难度）
        if (difficulty.estimate !== null) {
            const band = INPUT_TARGETS[target];
            if (difficulty.estimate >= band.min - 0.1 && difficulty.estimate <= band.max + 0.1)
                score += 0.8;
        }
        const reasonKind: InterestReasonKind = interestHit ? 'interests' : unitHit ? 'unit' : (signal?.weight ?? 0) >= 0.25 ? 'recent' : 'explore';
        const reason = REASON_LABELS[reasonKind];
        const facts = [
            `${providerLabel(source.provider as never)} · ${source.contentType ?? '材料'}`,
            `主题：${source.topic}`,
            duration ? `时长：${duration} 分钟` : '时长：未知（未从标题猜测）',
            hasTranscript ? '字幕：已导入（可用于 Reading / Sentence）' : '字幕：无 / 未知（不能假装有字幕）',
            source.verificationStatus === 'unverified' ? '可用性：仅保存链接，未验证播放' : '可用性：用户已确认',
            lastAt ? `上次完成：${Math.floor((now - lastAt) / 86400000)} 天前` : '还没有完成过这次输入',
            difficulty.estimate === null ? '难度：无 transcript 依据，不做估计' : `难度：约 ${Math.round(difficulty.estimate * 100)}%（基于字幕文本估计，low confidence）`,
        ];
        scored.push({
            score,
            cand: {
                sourceId: source.id, title: source.title, url: source.url, provider: source.provider ?? 'other',
                contentType: source.contentType ?? 'other', topic: source.topic, durationMinutes: duration,
                availability: source.verificationStatus === 'unverified' ? 'unverified' : 'available',
                verificationStatus: source.verificationStatus ?? 'unverified', captionStatus: source.subtitleStatus ?? 'unknown',
                transcriptRef: source.transcriptRef ?? null, hasTranscript, difficulty,
                reasonKind, reasonTag: reason.tag, reasonZh: reason.zh, exploration: reasonKind === 'explore', repeat, facts,
                target: hasTranscript ? target : null,
                fitMinutes: Math.min(duration || input.availableMinutes, Math.max(5, input.availableMinutes)),
            },
        });
    }
    scored.sort((a, b) => Number(a.cand.repeat) - Number(b.cand.repeat) || b.score - a.score || a.cand.title.localeCompare(b.cand.title));
    let candidates = scored.slice(0, 3).map(s => s.cand);
    if (profile.topics.length && candidates.length >= 2 && !candidates.some(c => c.exploration)) {
        const explore = scored.find(s => s.cand.exploration && !candidates.includes(s.cand));
        if (explore)
            candidates = [...candidates.slice(0, Math.max(1, candidates.length - 1)), explore.cand];
    }
    if (!candidates.length)
        return { candidates, note: '还没有真实材料：先添加一个你真正想看的链接（任何主题都可以），再开始输入。', sufficient: false, target };
    const personalized = profile.topics.length > 0 || signals.sufficient;
    const note = personalized ? '' : '兴趣画像与做题记录都还很少：这些是按材料本身与可用时间排的，不算精准个性化。';
    return { candidates, note, sufficient: personalized, target };
}
/** 推荐目标与真实理解度的差（只用于解释，不当作能力分数） */
export function targetGap(target: InputTarget, comprehension: number | null): string {
    if (comprehension === null)
        return '没有理解自评，无法比较目标区间。';
    const band = INPUT_TARGETS[target];
    if (comprehension < band.min)
        return `低于 ${band.label} 的目标区间：可以换更短/更熟悉的材料，或打开字幕。`;
    if (comprehension > band.max)
        return `高于 ${band.label}：可以试更难的 Growth 材料。`;
    return `落在 ${band.label} 的目标区间内（自评数据）。`;
}
