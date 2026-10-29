/* Phase 15h.3 · 生命周期计数器（在应用脚本之前注入） */
;(function () {
  var counts = { window: {}, document: {} }
  var ro = 0, io = 0
  var rafPending = new Set()

  function wrapTarget(target, bucket) {
    var origAdd = target.addEventListener.bind(target)
    var origRemove = target.removeEventListener.bind(target)
    target.addEventListener = function (type, fn, opts) {
      bucket[type] = (bucket[type] || 0) + 1
      return origAdd(type, fn, opts)
    }
    target.removeEventListener = function (type, fn, opts) {
      if (bucket[type]) bucket[type]--
      return origRemove(type, fn, opts)
    }
  }
  wrapTarget(window, counts.window)
  wrapTarget(document, counts.document)

  if (typeof ResizeObserver === 'function') {
    var RO = ResizeObserver
    window.ResizeObserver = function (cb) {
      var inst = new RO(cb)
      ro++
      var d = inst.disconnect.bind(inst)
      inst.disconnect = function () { ro--; return d() }
      return inst
    }
  }
  if (typeof IntersectionObserver === 'function') {
    var IO = IntersectionObserver
    window.IntersectionObserver = function (cb, opts) {
      var inst = new IO(cb, opts)
      io++
      var d = inst.disconnect.bind(inst)
      inst.disconnect = function () { io--; return d() }
      return inst
    }
  }
  var raf = window.requestAnimationFrame.bind(window)
  var caf = window.cancelAnimationFrame.bind(window)
  window.requestAnimationFrame = function (fn) {
    var h = raf(function (t) { rafPending.delete(h); fn(t) })
    rafPending.add(h)
    return h
  }
  window.cancelAnimationFrame = function (h) { rafPending.delete(h); return caf(h) }

  window.__life = {
    snapshot: function () {
      return {
        windowPointerup: counts.window.pointerup || 0,
        windowPointermove: counts.window.pointermove || 0,
        windowResize: counts.window.resize || 0,
        documentListeners: {
          visibilitychange: counts.document.visibilitychange || 0,
          pointerleave: counts.document.pointerleave || 0,
          pointerup: counts.document.pointerup || 0,
          keydown: counts.document.keydown || 0
        },
        resizeObservers: ro,
        intersectionObservers: io,
        pendingRaf: rafPending.size,
        nodes: document.getElementsByTagName('*').length,
        page: document.documentElement?.dataset?.page ?? null
      }
    }
  }
})()
