// —— Phase 8：字幕文本 → 难度估计（有依据、可解释、低置信度）——
// 只有在有英文 transcript 时才能估计“这份材料对你有多难”；
// 没有 transcript 一律返回 null（绝不根据标题/封面猜）。
import type { InputEvidenceRecord, InputSource, LibraryItem, Transcript, Word } from './types.ts';
export interface InputDifficultyEstimate {
    estimate: number;
    confidence: 'low' | 'none';
    reasons: string[];
    unknownRate: number;
    avgSentenceWords: number;
    basis: 'transcript';
}
export function estimateInputDifficulty(input: {
    transcript: Transcript;
    words: Word[];
    grammarKnown?: string[];
}): InputDifficultyEstimate | null {
    if (!input.transcript.timed || input.transcript.language !== 'en')
        return null;
    const text = input.transcript.cues.map(c => c.text).join(' ');
    const tokens = (text.match(/[A-Za-z][A-Za-z'-]+/g) ?? []).map(t => t.toLowerCase());
    if (tokens.length < 20)
        return null;
    const known = new Set<string>();
    for (const w of input.words) {
        if (w.state.total > 0 || (w.recognitionScore ?? 0) > 0)
            known.add(w.en.toLowerCase());
    }
    const distinct = new Set(tokens);
    let unknown = 0;
    for (const t of distinct)
        if (!known.has(t))
            unknown++;
    const unknownRate = unknown / Math.max(1, distinct.size);
    const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    const avgSentenceWords = sentences.length ? tokens.length / sentences.length : tokens.length;
    const lengthPenalty = Math.min(0.15, Math.max(0, (avgSentenceWords - 12) / 100));
    const estimate = Math.max(0.05, Math.min(0.95, 0.15 + unknownRate * 0.7 + lengthPenalty));
    const reasons = [
        `字幕里 ${distinct.size} 个不同的词，其中 ${unknown} 个不在你的词库掌握记录里（未知率 ${Math.round(unknownRate * 100)}%）`,
        `平均句长 ${avgSentenceWords.toFixed(1)} 词`,
        '依据是字幕文本 + 你的词库记录；没有做语义/语速分析，属于低置信度估计',
    ];
    return { estimate: Math.round(estimate * 100) / 100, confidence: 'low', reasons, unknownRate: Math.round(unknownRate * 100) / 100, avgSentenceWords: Math.round(avgSentenceWords * 10) / 10, basis: 'transcript' };
}
export interface InputSnapshot {
    sources: InputSource[];
    sessions: import('./types.ts').InputSession[];
    transcripts: Transcript[];
    library: LibraryItem[];
    evidence: InputEvidenceRecord[];
}
