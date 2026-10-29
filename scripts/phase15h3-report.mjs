/**
 * Phase 15h.3 · 生成逐规则机器可读清单（合并修复前分类 + 修复后实测）
 *
 * 输入：screenshots/phase15h3/css-rule-audit-before.json（HEAD 状态，含 A/B/C/D 分类）
 *       screenshots/phase15h3/css-rule-audit-after.json（当前工作树，结构缺陷应为 0）
 *       screenshots/phase15h3/css-match-after.json（修复后 14 页 × 2 主题命中数）
 * 输出：screenshots/phase15h3/css-rule-audit.json（最终交付版）
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = join(process.cwd(), 'screenshots', 'phase15h3')
const read = f => JSON.parse(readFileSync(join(OUT, f), 'utf8'))

const before = read('css-rule-audit-before.json')
const after = read('css-rule-audit-after.json')
const brokenBefore = before['rules'].filter(r => (r['needsRepair'] || []).some(Boolean)).length
const selBrokenBefore = before['rules'].reduce((a, r) => a + (r['needsRepair'] || []).filter(Boolean).length, 0)
const selBrokenAfter = after['rules'].reduce((a, r) => a + (r['needsRepair'] || []).filter(Boolean).length, 0)
const matchAfter = read('css-match-after.json')

const VISUAL = {
    'lab-option': { where: '拆句训练 · 选项行', change: 'flex → grid，padding 0/16 → 11/16，字号 13 → 14，gap 8 → 3，去掉顶部高光（深浅一致）' },
    'lab-sentence': { where: '拆句训练 · 原句卡', change: '底色改为哑光下沉面 + 金属左轨，内边距 16/18 → 22/28，字号 22 → 24（Reading 字体）' },
    'lab-progress': { where: '拆句训练 · 步骤条', change: '从纯文字行变成带边框的步骤条（浅/深各自底色），字号 13 → 12' },
    'lab-feedback': { where: '拆句训练 · 判题反馈', change: '反馈块改为渐变 + 左轨，正文 16 → 13px；判题态对比度 12.57–17.98 → 7.14–17.98，仍 ≥ AA' },
    'concept-card': { where: '语法图谱 · 概念卡', change: 'gap 6 → 8，卡片宽 331 → 335、高 272 → 299，栅格列宽随之变化' },
    'concept-grid': { where: '语法图谱 · 卡片网格', change: '列宽 330.7 → 334.7（三列等宽保持）' },
    'd-cta': { where: 'Today · 主按钮', change: '深色默认接触阴影一开始抹掉了辉光；改为 :where() 低特异性后辉光恢复（=修复前一致）' }
}

/** 修复后每条选择器的实测命中（取所有页面/主题的最大值） */
const rawById = new Map()
for (const [key, rule] of Object.entries(matchAfter.rules || {})) {
    let max = 0
    for (const sel of rule.selectors || []) {
        for (const pages of Object.values(sel.byTheme || {})) {
            for (const counts of Object.values(pages || {})) {
                if (counts && typeof counts.raw === 'number') max = Math.max(max, counts.raw)
                if (counts && typeof counts.fixed === 'number') max = Math.max(max, counts.fixed)
            }
        }
    }
    rawById.set(key, max)
}

const needsById = new Map()
for (const r of before.rules) needsById.set(r.id, (r.needsRepair || []).filter(Boolean).length)
const classesById = new Map()
for (const r of before.classification.rules) classesById.set(r.id, r)

const entries = []
for (const rule of after.rules) {
    const cls = classesById.get(rule.id) || null
    const sels = (rule.selectors || []).map(s => ({ sel: s }))
    const classes = new Set()
    for (const s of sels) {
        const m = /\.([a-z0-9-]+)/gi
        let x
        while ((x = m.exec(s.sel || s.selector || ''))) classes.add(x[1])
    }
    const visual = [...classes].map(c => VISUAL[c]).filter(Boolean)
    entries.push({
        id: rule.id,
        file: rule.file,
        line: rule.line,
        condition: rule.condition || 'none',
        selector: rule.selectorText,
        selectorCount: sels.length,
        neededRepair: needsById.get(rule.id) || 0,
        scopeAttributes: ['data-level', 'data-page', 'data-theme'].filter(a => (rule.selectorText || '').includes(a)),
        targetPages: cls?.pages || rule.pages || [],
        targetState: cls?.state || 'default / state pseudo-classes only',
        classBefore: cls?.class || 'outside-scope',
        classReason: cls?.reason || '选择器不需要作用域合并',
        rawHitsBefore: cls?.rawMax ?? null,
        repairedHitsBefore: cls?.fixedMax ?? null,
        rawHitsAfter: rawById.get(rule.id) ?? 0,
        genericFallback: visual.length ? 'measured (see visualChange)' : 'not measured',
        overriddenByHigherSpecificity: null,
        visualImpact: visual.length ? 'layout+color' : 'none-measured',
        visualChange: visual.map(v => `${v.where}：${v.change}`),
        fix: rule.file.endsWith('system.css') ? 'scope-merged + specificity reduced (:where)' : 'scope-merged',
        verified: (rawById.get(rule.id) ?? 0) > 0 ? 'matched-live' : (cls?.class === 'B' ? 'conditional (state/media)' : 'not-matched-in-probed-states')
    })
}

const summary = {
    generatedAt: new Date().toISOString(),
    reconciliation: {
        cssRuleBlocksInBuild: after.ruleBlocks,
        selectorsInBuild: after.selectors,
        brokenSelectorsBefore: selBrokenBefore,
        brokenSelectorsAfter: selBrokenAfter,
        auditScopeRuleBlocks: before.classification.summary.auditScope.ruleBlocks,
        auditScopeSelectors: before.classification.summary.auditScope.selectors,
        topLevel: before.classification.summary.auditScope.topLevel,
        nested: before.classification.summary.auditScope.nested,
        byFile: before.classification.summary.auditScope.byFile,
        classRules: before.classification.summary.classRules,
        classSelectors: before.classification.summary.classSelectors,
        outsideScopeRules: before.classification.summary.outsideScope,
        mediaSkipped: before.classification.summary.mediaSkipped,
        codexComparison: {
            codexRuleBlocks: 176,
            codexTopLevel: 169,
            codexNested: 7,
            delta: '176 = 页面层 144+16+15+1；177 = 176 + system.css 的深色按钮接触阴影规则（共享层，Codex 未计入页面层）',
            topLevel: '170 = 169 + 上面这 1 条共享层规则；nested 7 双方一致（均在 @media (max-width:900px) 内）'
        }
    },
    counts: {
        ruleBlocksAudited: entries.length,
        selectorsAudited: entries.reduce((a, e) => a + e.selectorCount, 0),
        brokenSelectorsBefore: selBrokenBefore,
        brokenSelectorsAfter: selBrokenAfter,
        confirmedDead: before.classification.summary.classRules.A,
        conditional: before.classification.summary.classRules.B,
        unreachable: before.classification.summary.classRules.C,
        unknown: before.classification.summary.classRules.D,
        ruleBlocksNeedingRepair: entries.filter(e => e.neededRepair > 0).length,
        ruleBlocksTouchingChangedComponents: entries.filter(e => e.visualImpact !== 'none-measured').length,
        repairedRuleBlocksTouchingChangedComponents: entries.filter(e => e.visualImpact !== 'none-measured' && e.neededRepair > 0).length,
        measuredVisualChangedElements: Object.keys(VISUAL).length,
        verifiedLiveAmongRepaired: entries.filter(e => e.neededRepair > 0 && e.verified === 'matched-live').length,
        verifiedConditionalAmongRepaired: entries.filter(e => e.neededRepair > 0 && e.verified.startsWith('conditional')).length,
        verifiedUnmatchedAmongRepaired: entries.filter(e => e.neededRepair > 0 && e.verified.startsWith('not-matched')).length
    },
    entries
}

writeFileSync(join(OUT, 'css-rule-audit.json'), JSON.stringify(summary, null, 2))
console.log(JSON.stringify(summary.counts, null, 2))
console.log(JSON.stringify(summary.reconciliation.classRules))
