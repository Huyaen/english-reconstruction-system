#!/usr/bin/env node
// Phase 16.3：历史数据影响识别（只读）
// 用法：node scripts/phase16_3-legacy-audit.mjs <备份或导出.json> [--json out.json]
//
// 这份工具只做识别与说明，绝不写库、不删除、不回写、不重算掌握度。
// 判断依据（可核查的事实，不是字段名的联想）：
//   1) 句子 attempt 自带 structureTrust（16.3 之后写入）→ 明确
//   2) 16.3 之前没有这个字段：看句子记录的结构来源（ai_unverified / heuristic / none）与来源类型
//   3) 语法 attempt 的 id 形如 `<sentenceAttemptId>.<conceptId>`，可以回指到具体那一次练习
// 无法判断的部分（例如句子已被删除、attempt 与句子对不上）单独列出，不猜。
import { readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (!args.length) {
    console.error('用法: node scripts/phase16_3-legacy-audit.mjs <备份.json> [--json out.json]');
    process.exit(2);
}
const file = args[0];
const outIdx = args.indexOf('--json');
const outFile = outIdx >= 0 ? args[outIdx + 1] : null;

const raw = JSON.parse(readFileSync(file, 'utf8'));
// 兼容完整备份（{ data: {...} }）与直接导出（{ sentences, ... }）
const data = raw.data ?? raw;
const sentences = data.sentences ?? [];
const attempts = data.sentenceAttempts ?? [];
const grammarAttempts = data.grammarAttempts ?? [];
const concepts = data.grammarConcepts ?? [];

const sentenceById = new Map(sentences.map(s => [s.id, s]));
const UNTRUSTED_PROVENANCE = new Set(['ai_unverified', 'heuristic', 'none', 'manual']);
const grammarById = new Map(grammarAttempts.map(a => [a.id, a]));
const usedGrammarIds = new Set();

const rows = attempts.map(a => {
    const record = sentenceById.get(a.sentenceId ?? a.sourceId ?? '');
    const trust = a.structureTrust ?? null; // 16.3 之后才有
    const provenance = record?.structureProvenance ?? a.structureProvenance ?? null;
    const sourceType = a.sourceType ?? record?.sourceType ?? null;
    // 这次练习产生的语法证据（id 前缀回指）
    const links = grammarAttempts.filter(g => typeof g.id === 'string' && g.id.startsWith(`${a.id}.`));
    links.forEach(g => usedGrammarIds.add(g.id));
    const contributed = links.length > 0;
    let verdict;
    if (trust === 'verified')
        verdict = 'counted-by-design';
    else if (trust === 'unverified')
        verdict = 'blocked-by-design';
    else if (provenance && UNTRUSTED_PROVENANCE.has(provenance))
        verdict = contributed ? 'legacy-likely-unverified-and-counted' : 'legacy-likely-unverified';
    else if (!record)
        verdict = 'unknown-sentence-missing';
    else
        verdict = contributed ? 'legacy-possibly-trusted' : 'legacy-no-grammar-evidence';
    return {
        attemptId: a.id, sentenceId: a.sentenceId ?? null, sourceType, provenance, trust,
        at: a.at ?? a.createdAt ?? null, evidenceClass: a.evidenceClass ?? null,
        grammarEvidenceIds: links.map(g => g.id), contributedToMastery: contributed, verdict,
    };
});

const byVerdict = {};
for (const r of rows) byVerdict[r.verdict] = (byVerdict[r.verdict] ?? 0) + 1;

// 哪些概念可能被错误证据影响：按 conceptId 汇总 legacy 且已计分的 attempt
const conceptImpact = new Map();
for (const r of rows) {
    if (r.verdict !== 'legacy-likely-unverified-and-counted')
        continue;
    for (const id of r.grammarEvidenceIds) {
        const ga = grammarById.get(id);
        if (!ga)
            continue;
        const prev = conceptImpact.get(ga.conceptId) ?? { conceptId: ga.conceptId, evidence: 0, correct: 0 };
        prev.evidence += 1;
        if (ga.correct)
            prev.correct += 1;
        conceptImpact.set(ga.conceptId, prev);
    }
}
const orphanGrammarAttempts = grammarAttempts.filter(g => !usedGrammarIds.has(g.id));

const report = {
    generatedAt: new Date().toISOString(),
    source: file,
    readOnly: true,
    note: '这份报告只做识别，不修改任何数据。历史记录不会被删除、回写或重算。',
    totals: {
        sentenceAttempts: attempts.length,
        grammarAttempts: grammarAttempts.length,
        concepts: concepts.length,
        sentences: sentences.length,
        sentencesWithoutRecord: rows.filter(r => r.verdict === 'unknown-sentence-missing').length,
    },
    byVerdict,
    identifiable: {
        legacyUnverifiedCounted: rows.filter(r => r.verdict === 'legacy-likely-unverified-and-counted'),
        legacyUnverifiedNotCounted: rows.filter(r => r.verdict === 'legacy-likely-unverified').length,
        newBlocked: rows.filter(r => r.verdict === 'blocked-by-design').length,
        newCounted: rows.filter(r => r.verdict === 'counted-by-design').length,
    },
    conceptImpact: [...conceptImpact.values()].sort((a, b) => b.evidence - a.evidence),
    uncertain: {
        missingSentenceRecords: rows.filter(r => r.verdict === 'unknown-sentence-missing').map(r => r.attemptId),
        orphanGrammarAttempts: orphanGrammarAttempts.slice(0, 200).map(g => g.id),
        orphanGrammarAttemptsTotal: orphanGrammarAttempts.length,
        possiblyTrustedLegacy: rows.filter(r => r.verdict === 'legacy-possibly-trusted').length,
    },
    affectedReports: [
        '语法页的「大概掌握 / 练得比较稳 / 薄弱点」（来自 grammarState 的 BKT 后验）',
        '学习诊断里的语法类指标（如果有按概念汇总）',
        '每周诊断的短板排序（weakConcepts）',
        'AI 定向句/强化阅读挑选「薄弱语法」的输入',
    ],
};

if (outFile)
    writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');

console.log(JSON.stringify({
    readOnly: true,
    totals: report.totals,
    byVerdict,
    legacyUnverifiedCounted: report.identifiable.legacyUnverifiedCounted.length,
    conceptImpact: report.conceptImpact.slice(0, 10),
    orphanGrammarAttempts: report.uncertain.orphanGrammarAttemptsTotal,
    note: report.note,
}, null, 2));
