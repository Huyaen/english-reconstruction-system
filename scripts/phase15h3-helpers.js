/* Phase 15h.3 · 页面内测量助手（由 phase15h3-css-probe.mjs 注入执行）
   独立成文件的原因：把转义留在模板字符串里写过两次都写坏了。 */
(function () {
  var stripPseudoEl = function (s) { return s.replace(/::[a-zA-Z-]+(\([^)]*\))?/g, '') }
  var stripStates = function (s) {
    // 先去掉 :not(:state)：直接删 :disabled 会留下非法的 :not()，selector 解析失败会被
    // 记成"0 命中"，从而把真实失效规则误判成"目标不存在"。
    return s
      .replace(/:not\(\s*:(hover|focus|focus-visible|focus-within|active|disabled|enabled|checked|indeterminate)\s*\)/g, '')
      .replace(/:(hover|focus|focus-visible|focus-within|active|disabled|enabled|checked|indeterminate|visited|target)\b/g, '')
  }
  var lastCompound = function (s) {
    var depth = 0, quote = null, out = '', cur = ''
    for (var i = 0; i < s.length; i++) {
      var c = s[i]
      if (quote) { cur += c; if (c === quote) quote = null; continue }
      if (c === '"' || c === "'") { quote = c; cur += c; continue }
      if (c === '(' || c === '[') depth++
      else if (c === ')' || c === ']') depth--
      if (depth === 0 && (c === ' ' || c === '>' || c === '+' || c === '~')) { out += cur; cur = ''; continue }
      cur += c
    }
    return (cur.trim() || out.trim()) || '*'
  }
  var q = function (s) { try { return document.querySelectorAll(s).length } catch (e) { return -1 } }
  window.__h3 = {
    measure: function (list) {
      return list.map(function (item) {
        var raw = q(stripPseudoEl(item.sel))
        var struct = q(stripPseudoEl(stripStates(item.sel)))
        var fixed = item.rep ? q(stripPseudoEl(stripStates(item.rep))) : null
        var right = q(stripPseudoEl(stripStates(lastCompound(item.sel))))
        return { raw: raw, struct: struct, fixed: fixed, right: right }
      })
    }
  }
})()
