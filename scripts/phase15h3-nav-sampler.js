/* Phase 15h.3 · 页面内导航采样器（被 CDP Runtime.evaluate 注入）
   16ms 采样主内容"是否真的看得见"，不是只看 textContent。 */
;(function () {
  var S = window.__h3nav || (window.__h3nav = {})

  function style(e) { return getComputedStyle(e) }

  // 祖先链上 opacity 相乘、visibility 取最低、display:none 直接判不可见
  function vis(el) {
    if (!el) return null
    var op = 1, visible = 'visible', disp = 'block', transform = 'none', z = 'auto'
    var walk = el, depth = 0
    while (walk && walk.nodeType === 1 && depth < 40) {
      var cs = style(walk)
      if (cs.display === 'none') { disp = 'none'; break }
      if (cs.visibility !== 'visible') visible = cs.visibility
      var o = parseFloat(cs.opacity)
      if (!isNaN(o)) op *= o
      if (depth === 0) { transform = cs.transform; z = cs.zIndex }
      walk = walk.parentElement
      depth++
    }
    var r = el.getBoundingClientRect()
    var cx = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1)
    var cy = Math.min(Math.max(r.top + r.height / 2, 0), window.innerHeight - 1)
    var hitEl = document.elementFromPoint(cx, cy)
    var hit = !!(hitEl && (hitEl === el || el.contains(hitEl) || hitEl.contains(el)))
    var onScreen = r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight
    return {
      op: Math.round(op * 1000) / 1000,
      vis: visible,
      disp: disp,
      transform: transform === 'none' ? 'none' : transform.slice(0, 40),
      z: z,
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      onScreen: onScreen,
      hit: hit,
      hitTag: hitEl ? (hitEl.tagName.toLowerCase() + (hitEl.className && typeof hitEl.className === 'string' ? '.' + hitEl.className.split(' ')[0] : '')) : null,
      // 用户能看懂的内容 = 有文本 + 实际可见 + 在视口内 + 命中测试通过
      readable: !!(el && (el.textContent || '').trim().length > 12 && op > 0.35 && visible === 'visible' && disp !== 'none' && onScreen && r.width > 60 && r.height > 24)
    }
  }

  function anims() {
    try {
      return document.getAnimations().filter(function (a) {
        var st = a.playState
        return st === 'running'
      }).map(function (a) {
        var t = a.effect && a.effect.target
        return {
          name: a.animationName || a.transitionProperty || 'anim',
          target: t ? (t.tagName.toLowerCase() + (t.id ? '#' + t.id : '') + (t.className && typeof t.className === 'string' ? '.' + t.className.split(' ')[0] : '')) : '?',
          progress: a.effect && a.effect.getComputedTiming ? Math.round((a.effect.getComputedTiming().progress || 0) * 100) / 100 : null
        }
      }).slice(0, 8)
    } catch (e) { return [] }
  }

  S.start = function (to, pathId, round) {
    var rec = { t0: performance.now(), epoch0: Date.now(), clickAt: 0, returnAt: null, path: pathId, round: round, samples: [] }
    S.rec = rec
    var main = document.querySelector('#main')
    var before = main ? main.firstElementChild : null
    rec.preNode = before ? (before.id || before.className || before.tagName) : null
    var btn = document.querySelector('[data-nav="' + to + '"]')
    rec.clickAt = performance.now()
    if (btn) btn.click()
    rec.timer = setInterval(function () {
      var m = document.querySelector('#main')
      var kids = m ? Array.prototype.slice.call(m.children, 0, 6) : []
      // 取"面积最大且带文本"的那一块做主内容判据，避免首页包裹层/装饰层误判
      var best = null, bestScore = -1
      for (var i = 0; i < kids.length; i++) {
        var r0 = kids[i].getBoundingClientRect()
        var tx = (kids[i].textContent || '').replace(/\s+/g, '').length
        // 只认视口内可见面积，且优先视口上半部分的块：折叠线以下/滚动才出现的块不算"主内容"
        var visW = Math.max(0, Math.min(r0.right, window.innerWidth) - Math.max(r0.left, 0))
        var visH = Math.max(0, Math.min(r0.bottom, window.innerHeight) - Math.max(r0.top, 0))
        var score = visW * visH
        if (r0.top > window.innerHeight * 0.6) score *= 0.25
        if (tx > 12 && score > bestScore) { best = kids[i]; bestScore = score }
      }
      var s = {
        t: Math.round(performance.now() - rec.t0),
        page: document.documentElement.dataset.page || null,
        kids: m ? m.children.length : 0,
        text: m ? (m.textContent || '').replace(/\s+/g, '').length : 0,
        loading: !!document.querySelector('.d-loading, [data-loading="true"], .loading'),
        v: vis(best),
        vFirst: vis(kids[0] || null),
        anyReadable: kids.some(function (k) { var kv = vis(k); return !!(kv && kv.readable) }),
        a: anims()
      }
      if (rec.samples.length < 400) rec.samples.push(s)
    }, 16)
    return true
  }

  S.ret = function (from) {
    var rec = S.rec
    if (!rec) return false
    rec.returnAt = Math.round(performance.now() - rec.t0)
    var btn = document.querySelector('[data-nav="' + from + '"]')
    if (btn) btn.click()
    return true
  }

  S.stop = function () {
    var rec = S.rec
    if (!rec) return null
    clearInterval(rec.timer)
    return { clickAt: rec.clickAt - rec.t0, epoch0: rec.epoch0, returnAt: rec.returnAt, preNode: rec.preNode, samples: rec.samples }
  }
})()
