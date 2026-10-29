/**
 * Phase 15h.3 · CSS 作用域回归测试
 *
 * 断言的不是"字符串里有某个选择器"，而是：
 *   1) 真实解析当前参与构建的 CSS 后，不存在"作用域属性祖先链"（结构错误）；
 *   2) 把页面层选择器放到真实 DOM 结构（html 上同时有 data-level / data-page）
 *      上用 matches() 实测命中，确认修复后的规则真的能匹配到目标元素。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { JSDOM } from 'jsdom'
import postcss from 'postcss'
// 选择器工具是给采集脚本共用的 .mjs（不单独维护 .d.ts），运行时行为与脚本一致
// @ts-expect-error 无类型声明的脚本模块
import { splitSelectors as splitSelectorsRaw, scopeRunLength as scopeRunLengthRaw } from '../scripts/phase15h3-selector-lib.mjs'
const splitSelectors = splitSelectorsRaw as (text: string) => string[]
const scopeRunLength = scopeRunLengthRaw as (sel: string) => number

const FILES = [
    'src/ui/system.css',
    'src/ui/pages/sentence-grammar.css',
    'src/ui/pages/quiz.css',
    'src/ui/pages/io.css',
    'src/ui/pages/mgmt.css',
    'src/style.css',
    'src/cinematic15d.css'
]

const parse = (file: string) => postcss.parse(readFileSync(file, 'utf8'), { from: file })

test('CSS：不存在作用域属性祖先链（每个作用域规则都能命中同一个 html 元素）', () => {
    const broken: string[] = []
    for (const file of FILES) {
        const root = parse(file)
        root.walkRules(rule => {
            for (const sel of splitSelectors(rule.selector)) {
                if (scopeRunLength(sel) >= 2)
                    broken.push(`${file}: ${sel.trim()}`)
            }
        })
    }
    assert.deepEqual(broken.slice(0, 12), [], `仍有 ${broken.length} 条选择器要求 data-* 分布在不同元素上`)
    assert.equal(broken.length, 0)
})

test('CSS：页面层作用域规则在真实 DOM 上真的命中（拆句选项 / 语法概念卡）', () => {
    const dom = new JSDOM(`<!doctype html><html data-level="B" data-page="sentence" data-theme="dark">
        <body><main id="main">
          <section class="lab-panel">
            <p class="lab-sentence">The report that he wrote about the flood is missing.</p>
            <div class="lab-progress"><span>第 1 / 4 步</span></div>
            <div class="lab-options"><button class="lab-option picked"><b>The report</b><small>主句主语</small></button></div>
          </section>
        </main></body></html>`)
    const { document } = dom.window
    const rules = parse('src/ui/pages/sentence-grammar.css')
    const selectors: string[] = []
    rules.walkRules(rule => { for (const s of splitSelectors(rule.selector)) selectors.push(s) })

    const targets: Array<[string, string]> = [
        ['.lab-option', '拆句选项'],
        ['.lab-sentence', '原句'],
        ['.lab-progress', '步骤条'],
        ['.lab-panel', '训练卡']
    ]
    for (const [cls, label] of targets) {
        const el = document.querySelector(cls)
        assert.ok(el, `${label} 节点应当存在`)
        const hitting = selectors.filter(sel => {
            // 只在"整条选择器都适用"时才算命中：状态伪类单独验证
            try { return (el as Element).matches(sel) } catch { return false }
        })
        assert.ok(hitting.length > 0, `${label} 没有任何页面层规则命中（作用域修复回退）`)
    }

    // 判题态的左轨线型规则必须命中已判题选项
    const opted = document.querySelector('.lab-option') as Element
    opted.setAttribute('data-verdict', 'correct')
    const verdictRules: string[] = []
    rules.walkRules(rule => {
        for (const s of splitSelectors(rule.selector)) {
            if (/data-verdict/.test(s)) verdictRules.push(s)
        }
    })
    assert.ok(verdictRules.length > 0, '判题态规则应当存在')
    const verdictHit = verdictRules.some(s => { try { return opted.matches(s) } catch { return false } })
    assert.ok(verdictHit, '判题态（data-verdict）规则必须命中已判题选项')
})

test('CSS：训练态（quiz）与预览态（preview）的选项规则在真实 DOM 上命中', () => {
    const make = (page: string) => new JSDOM(`<!doctype html><html data-level="B" data-page="${page}" data-theme="dark">
        <body><main id="main"><section class="quiz-card">
          <div class="answer">1 已经会</div>
          <button class="answer"><kbd>2</kbd> 熟悉</button>
        </section></main></body></html>`)
    const rules = parse('src/ui/pages/quiz.css')
    const selectors: string[] = []
    rules.walkRules(r => { for (const s of splitSelectors(r.selector)) selectors.push(s) })
    for (const page of ['quiz', 'preview']) {
        const { document } = make(page).window
        const el = document.querySelector('.answer') as Element
        assert.ok(el, `${page} 页应当有 .answer`)
        const hitting = selectors.filter(sel => { try { return el.matches(sel) } catch { return false } })
        assert.ok(hitting.length > 0, `${page} 页没有任何 quiz.css 规则命中 .answer`)
    }
    // 非训练/预览页不得被 quiz.css 命中（作用域修复不能变成全局泄漏）
    const { document: other } = make('home').window
    const stray = selectors.filter(sel => { try { return (other.querySelector('.answer') as Element).matches(sel) } catch { return false } })
    assert.equal(stray.length, 0, `quiz.css 不应命中首页的 .answer：${stray.slice(0, 3).join(' | ')}`)
})

test('CSS：深色按钮默认接触阴影是低特异性默认值，不得压过组件自身阴影', () => {
    const root = parse('src/ui/system.css')
    let found = false
    root.walkRules(rule => {
        if (!/--contact/.test(rule.toString())) return
        if (!/data-theme="dark"/.test(rule.selector)) return
        found = true
        // Today 主按钮的辉光在 cinematic15d.css，特异性 (0,2,1)；
        // 默认阴影必须更低，否则每次导航都会把辉光抹掉。
        assert.match(rule.selector, /:where\(/, '深色按钮默认阴影必须用 :where() 降低特异性')
    })
    assert.ok(found, '应当存在深色主题默认接触阴影规则')
})

test('CSS：导航入场动画不得从完全透明开始（否则主内容区会裸露背景）', () => {
    // 两条入场动画都会让主内容区从 opacity:0 起步：
    //   p15-enter 动的是 <main> 本身（style.css），p15-arrive 动 #main 的直接子块（system.css）。
    // 实测：只要任一条从 0 开始，导航后主内容区就会裸露背景 200ms 以上。
    const cases: Array<[string, RegExp]> = [
        ['src/ui/system.css', /@keyframes p15-arrive\s*\{[\s\S]*?\n\}/],
        ['src/style.css', /@keyframes p15-enter\{[\s\S]*?to\{[^}]*\}\}/]
    ]
    for (const [file, re] of cases) {
        const src = readFileSync(file, 'utf8')
        const block = src.match(re)
        assert.ok(block, `${file} 中应当存在入场关键帧`)
        const opacity = block![0].match(/(?:from|0%)\s*\{[^}]*opacity:\s*([\d.]+)/)
        assert.ok(opacity, `${file} 入场起点应当声明 opacity`)
        assert.ok(Number(opacity![1]) >= 0.6, `${file} 入场首帧 opacity 不应低于 0.6（实测 ${opacity![1]}）`)
    }
})
