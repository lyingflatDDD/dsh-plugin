/**
 * Browser half of `dsh-plan-window` (shipped as the package's `./client`
 * export; discovered and served by the dsh client-modules system when the
 * package declares `dsh.client`).
 *
 * Replaces the shipped plan-review takeover card (ui-user-questions'
 * PlanReviewPanel, composer chain priority 0) with a free floating window:
 *
 *  - `conversation.composer` chain entry at priority -1 claims ONLY
 *    plan-review question waits (single question, `intent.kind ===
 *    'plan-review'`, plan in `detail`, binary options); every other wait —
 *    generic questions, approvals — falls through untouched. A crash here
 *    degrades to a decline, so the shipped card still catches the wait.
 *  - `shell.overlay` list entry renders the window: drag by header, resize
 *    by the bottom-right handle, close/reopen from the composer strip.
 *    First open centers a viewport-adaptive DEF_W x DEF_H default; geometry
 *    is always clamped to the viewport (at least VIS_W x VIS_H stays
 *    visible, so it can never be dragged off-screen) and survives across
 *    plan re-submissions; the comment list resets per carrier key.
 *  - Comments: select text in the plan body (or hover a block and press
 *    "+") to add a quoted comment card. "Send comments & keep planning"
 *    answers the review question with `['Keep planning'] + custom`
 *    (the exit_plan_mode host reads that as revision feedback); Approve
 *    answers `['Approve']` (plan mode exits); "Chat instead" cancels the
 *    wait (ASK_CANCELLED) and returns the composer.
 *
 * Hand-written bundle (no build step): plain factory + React.createElement.
 * @module dsh-plan-window/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-plan-window',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var React = require('react')

    /** Locale dictionary namespace owned by this bundle. */
    var NS = 'dsh.plan-window'

    var MIN_W = 480
    var MIN_H = 420
    var QUOTE_MAX = 240
    var DEF_W = 920   // first-open default size (viewport-adaptive)
    var DEF_H = 720
    var VIS_W = 160   // visible+grabbable region kept on-screen when clamping
    var VIS_H = 120

    var zh = {
      strip: '计划评审中 · 请在浮动窗口中查看与评论',
      show: '显示窗口',
      hide: '收起窗口',
      title: '计划评审',
      empty: '划选计划文字后松开，或悬停段落点 “＋”，即可添加评论',
      placeholder: '写下你的修改意见…',
      approve: '批准',
      keep: '提交评论并继续规划',
      discuss: '改为对话',
      del: '删除',
      emptyComment: '请先在至少一条评论中写下意见',
      submitting: '提交中…',
    }
    var en = {
      strip: 'Plan review · view & comment in the floating window',
      show: 'Show window',
      hide: 'Hide window',
      title: 'Plan review',
      empty: 'Select text in the plan, or hover a block and press “+”, to add a comment',
      placeholder: 'Write your feedback…',
      approve: 'Approve',
      keep: 'Send comments & keep planning',
      discuss: 'Chat instead',
      del: 'Delete',
      emptyComment: 'Write at least one comment first',
      submitting: 'Submitting…',
    }

    /** Parameterized strings stay local (locale dicts hold plain strings). */
    var STR = {
      zh: {
        badge: function (n) { return String(n) + ' 条评论' },
        blockNo: function (n) { return '第 ' + (n + 1) + ' 段' },
        feedbackTitle: function (n) { return '计划评审意见（共 ' + n + ' 条）：' },
        qo: '「', qc: '」', dash: '——',
      },
      en: {
        badge: function (n) { return String(n) + (n === 1 ? ' comment' : ' comments') },
        blockNo: function (n) { return 'Block ' + (n + 1) },
        feedbackTitle: function (n) { return 'Plan review feedback (' + n + (n === 1 ? ' item' : ' items') + '):' },
        qo: '“', qc: '”', dash: '—',
      },
    }

    /**
     * Shared package store: the composer strip writes the elected carrier
     * here; the overlay window reads it. One pending review at a time (the
     * runtime dispatches one composer wait per session; the UI shows the
     * current session's review).
     */
    var store = {
      wait: null,        // elected PendingWait carrier
      review: null,     // { id, question, plan, approveLabel, declineLabel }
      open: true,
      geo: null,        // window geometry; null until first open (computed centered then), kept across submissions
      commentKey: null, // carrier key the comment list belongs to
      comments: [],     // { cid, blockIndex, quote, text }
      lastAdded: null,
      listeners: new Set(),
    }
    var emit = function () { store.listeners.forEach(function (fn) { fn() }) }
    var subscribe = function (fn) {
      store.listeners.add(fn)
      return function () { store.listeners.delete(fn) }
    }

    /**
     * Narrow a question wait to a renderable plan review (runtime mirror of
     * ui-user-questions' `planReviewOf`; returns null when the generic flow
     * should own the request).
     */
    var asPlanReview = function (wait) {
      try {
        var payload = wait !== null && wait !== undefined ? wait.payload : undefined
        if (payload === null || payload === undefined) return null
        var questions = payload.questions
        if (!Array.isArray(questions) || questions.length !== 1) return null
        var q = questions[0]
        if (q === null || q === undefined) return null
        var intent = q.intent
        if (intent === null || intent === undefined || intent.kind !== 'plan-review') return null
        if (q.detail === undefined) return null
        if (q.multiSelect === true) return null
        var options = Array.isArray(q.options) ? q.options : []
        if (options.length > 2) return null
        var approve = options.find(function (o) { return o !== null && o !== undefined && o.label === intent.approve })
        if (approve === undefined) return null
        var decline = options.find(function (o) { return o !== null && o !== undefined && o.label !== intent.approve })
        return {
          id: q.id,
          question: String(q.question || ''),
          plan: String(q.detail),
          approveLabel: approve.label,
          declineLabel: decline !== undefined ? decline.label : null,
        }
      } catch (e) { return null }
    }

    /** Chain selector: claim the composer ONLY for a plan-review wait. */
    var selectPlanReview = function (props) {
      var list = props !== null && props !== undefined ? props.interactions : undefined
      if (list === null || list === undefined || typeof list.find !== 'function') return null
      return list.find(function (item) {
        if (item === null || item === undefined || item.kind !== 'question') return false
        return asPlanReview(item) !== null
      }) || null
    }

    // ---------- mini markdown renderer (blocks + bold/italic/code spans) ----------

    var parseBlocks = function (text) {
      var lines = String(text).split('\n')
      var blocks = []
      var para = []
      var flushPara = function () {
        if (para.length > 0) { blocks.push({ kind: 'p', text: para.join(' ') }); para = [] }
      }
      var i = 0
      while (i < lines.length) {
        var line = lines[i]
        if (/^\s*```/.test(line)) {
          flushPara()
          var codeBuf = []
          i++
          while (i < lines.length && !/^\s*```/.test(lines[i])) { codeBuf.push(lines[i]); i++ }
          i++
          blocks.push({ kind: 'code', text: codeBuf.join('\n') })
          continue
        }
        var h = /^(#{1,6})\s+(.*)$/.exec(line)
        if (h !== null) { flushPara(); blocks.push({ kind: 'h', level: h[1].length, text: h[2].trim() }); i++; continue }
        if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flushPara(); blocks.push({ kind: 'hr' }); i++; continue }
        var ul = /^\s*[-*+]\s+(.*)$/.exec(line)
        if (ul !== null) {
          flushPara()
          var ulItems = []
          while (i < lines.length) {
            var um = /^\s*[-*+]\s+(.*)$/.exec(lines[i])
            if (um === null) break
            ulItems.push(um[1].trim()); i++
          }
          blocks.push({ kind: 'ul', items: ulItems })
          continue
        }
        var ol = /^\s*\d+[.)]\s+(.*)$/.exec(line)
        if (ol !== null) {
          flushPara()
          var olItems = []
          while (i < lines.length) {
            var om = /^\s*\d+[.)]\s+(.*)$/.exec(lines[i])
            if (om === null) break
            olItems.push(om[1].trim()); i++
          }
          blocks.push({ kind: 'ol', items: olItems })
          continue
        }
        var bq = /^\s*>\s?(.*)$/.exec(line)
        if (bq !== null) {
          flushPara()
          var qBuf = []
          while (i < lines.length) {
            var qm = /^\s*>\s?(.*)$/.exec(lines[i])
            if (qm === null) break
            qBuf.push(qm[1]); i++
          }
          blocks.push({ kind: 'quote', text: qBuf.join(' ').trim() })
          continue
        }
        if (line.trim() === '') { flushPara(); i++; continue }
        para.push(line.trim())
        i++
      }
      flushPara()
      return blocks
    }

    var INLINE_RE = /(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*)|(`[^`]+`)/g
    var inlineChildren = function (text) {
      var src = String(text == null ? '' : text)
      var out = []
      var last = 0
      var key = 0
      var m
      INLINE_RE.lastIndex = 0
      while ((m = INLINE_RE.exec(src)) !== null) {
        if (m.index > last) out.push(src.slice(last, m.index))
        var tok = m[0]
        if (tok.slice(0, 2) === '**') {
          out.push(React.createElement('strong', { key: 'i' + key }, tok.slice(2, -2)))
        } else if (tok.slice(0, 1) === '`') {
          out.push(React.createElement('code', { key: 'i' + key, className: 'plnwin-icode' }, tok.slice(1, -1)))
        } else {
          out.push(React.createElement('em', { key: 'i' + key }, tok.slice(1, -1)))
        }
        key++
        last = m.index + tok.length
      }
      if (last < src.length) out.push(src.slice(last))
      return out
    }

    var blockText = function (block) {
      if (block.kind === 'ul' || block.kind === 'ol') return block.items.join(' / ')
      return block.text !== undefined ? block.text : ''
    }

    var renderBlock = function (block) {
      if (block.kind === 'h') {
        var tag = 'h' + Math.min(block.level + 1, 4)
        return React.createElement(tag, { className: 'plnwin-md-h' }, inlineChildren(block.text))
      }
      if (block.kind === 'ul') {
        return React.createElement('ul', { className: 'plnwin-ul' },
          block.items.map(function (item, idx) {
            return React.createElement('li', { key: 'l' + idx, className: 'plnwin-li' }, inlineChildren(item))
          }))
      }
      if (block.kind === 'ol') {
        return React.createElement('ol', { className: 'plnwin-ol' },
          block.items.map(function (item, idx) {
            return React.createElement('li', { key: 'l' + idx, className: 'plnwin-li' }, inlineChildren(item))
          }))
      }
      if (block.kind === 'code') {
        return React.createElement('pre', { className: 'plnwin-pre' },
          React.createElement('code', null, block.text))
      }
      if (block.kind === 'quote') {
        return React.createElement('blockquote', { className: 'plnwin-quote' }, inlineChildren(block.text))
      }
      if (block.kind === 'hr') {
        return React.createElement('hr', { className: 'plnwin-hr' })
      }
      return React.createElement('div', { className: 'plnwin-p' }, inlineChildren(block.text))
    }

    /**
     * Pure feedback formatter (test surface): entries [{blockIndex, quote,
     * text}] + localized label pack → the `custom` string sent back.
     */
    var formatFeedback = function (entries, L) {
      var lines = [L.feedbackTitle(entries.length)]
      for (var i = 0; i < entries.length; i++) {
        var c = entries[i]
        var quote = c.quote !== '' ? L.qo + c.quote + L.qc : '(' + L.blockNo(c.blockIndex) + ')'
        lines.push(String(i + 1) + '. ' + quote + ' ' + L.dash + ' ' + String(c.text).trim())
      }
      return lines.join('\n')
    }

    /**
     * Wire payloads for the two review decisions (test surface). The
     * plan-review question is SINGLE-select, and apiproxy's
     * `matchesQuestions` enforces XOR: a single-select answer item may carry
     * `selected` or non-empty `custom`, never both (`bad-response`
     * otherwise). So keep-planning sends an EMPTY selected array plus the
     * feedback text — the exit_plan_mode host reads `selected.length !== 1`
     * as keep-planning with `custom` as the feedback either way.
     */
    var approvePayload = function (sessionId, questionId, approveLabel) {
      return {
        ok: true,
        value: {
          sessionId: sessionId,
          answer: { answers: [{ id: questionId, selected: [approveLabel] }] },
        },
      }
    }
    var keepPlanningPayload = function (sessionId, questionId, feedback) {
      return {
        ok: true,
        value: {
          sessionId: sessionId,
          answer: { answers: [{ id: questionId, selected: [], custom: feedback }] },
        },
      }
    }

    // ---------- geometry (centered default + viewport clamping) ----------

    /**
     * Viewport size, guarded: outside a browser (tests) or on any access
     * failure the sizes are Infinity, which degrades every clamp below to
     * its plain lower bound — exactly the pre-clamp behavior.
     */
    var viewportSize = function () {
      try { return { vw: window.innerWidth, vh: window.innerHeight } }
      catch (e) { return { vw: Infinity, vh: Infinity } }
    }

    /**
     * Clamp window geometry to the viewport: size fits the viewport (with an
     * 80x60 floor), and the position always leaves at least VIS_W x VIS_H
     * visible and grabbable, so the window can never be dragged off-screen.
     */
    var clampGeo = function (geo, vw, vh) {
      var w = Math.max(80, Math.min(geo.w, vw))
      var h = Math.max(60, Math.min(geo.h, vh))
      var maxX = Math.max(0, vw - Math.min(w, VIS_W))
      var maxY = Math.max(0, vh - Math.min(h, VIS_H))
      return {
        x: Math.max(0, Math.min(geo.x, maxX)),
        y: Math.max(0, Math.min(geo.y, maxY)),
        w: w, h: h,
      }
    }

    /**
     * First-open geometry: the DEF_W x DEF_H default shrinks to the viewport
     * (48px margin, MIN_W/MIN_H floor), then centers horizontally and
     * vertically. Later opens reuse the stored geometry instead.
     */
    var initialGeo = function (vw, vh) {
      var w = Math.min(DEF_W, Math.max(MIN_W, vw - 48))
      var h = Math.min(DEF_H, Math.max(MIN_H, vh - 48))
      var x = Math.max(0, Math.floor((vw - w) / 2))
      var y = Math.max(0, Math.floor((vh - h) / 2))
      return clampGeo({ x: x, y: y, w: w, h: h }, vw, vh)
    }

    // ---------- components ----------

    /**
     * Composer strip (chain winner): publishes the matched carrier into the
     * shared store and offers the reopen toggle. The window itself lives in
     * shell.overlay.
     */
    function SeatStrip(props) {
      var matched = props !== null && props !== undefined ? props.matched : undefined
      var t = typeof props.t === 'function' ? props.t : function (k) { return zh[k] ?? k }
      var force = React.useState(0)[1]
      React.useEffect(function () { return subscribe(function () { force(function (v) { return v + 1 }) }) }, [])
      React.useEffect(function () {
        var review = asPlanReview(matched)
        if (review === null || matched === undefined) return undefined
        store.wait = matched
        store.review = review
        store.open = true
        if (store.commentKey !== matched.key) {
          store.commentKey = matched.key
          store.comments = []
        }
        emit()
        return function () {
          if (store.wait === matched) {
            store.wait = null
            store.review = null
            emit()
          }
        }
      }, [matched])
      return React.createElement('div', { className: 'plnwin-strip' },
        React.createElement('span', { className: 'plnwin-strip-dot' }),
        React.createElement('span', { className: 'plnwin-strip-text' }, t('strip')),
        React.createElement('button', {
          type: 'button', className: 'plnwin-strip-btn',
          onClick: function () { store.open = !store.open; emit() },
        }, store.open ? t('hide') : t('show')),
      )
    }

    /** Overlay entry: renders the window while a review is pending and open. */
    function PlanWindow(props) {
      var force = React.useState(0)[1]
      React.useEffect(function () { return subscribe(function () { force(function (v) { return v + 1 }) }) }, [])
      if (store.wait === null || store.review === null || !store.open) return null
      return React.createElement(WindowFrame, { key: store.wait.key, wait: store.wait, review: store.review })
    }

    /** The floating window: markdown body + comment rail + decision row. */
    function WindowFrame(props) {
      var wait = props.wait
      var review = props.review
      var L = STR[lang]
      var t = typeof props.t === 'function' ? props.t : function (k) { return (lang === 'en' ? en : zh)[k] ?? k }
      var geoState = React.useState(function () {
        var v0 = viewportSize()
        var g0 = store.geo !== null && store.geo !== undefined ? store.geo : initialGeo(v0.vw, v0.vh)
        store.geo = clampGeo(g0, v0.vw, v0.vh)   // idempotent write-back: reopen & cross-submission memory stays on-screen
        return store.geo
      })
      var geo = geoState[0]
      var setGeo = geoState[1]
      var vp = viewportSize()
      var effGeo = clampGeo(geo, vp.vw, vp.vh)   // effective geometry: what renders and what drags anchor to
      var busyState = React.useState(false)
      var busy = busyState[0]
      var setBusy = busyState[1]
      var errorState = React.useState(null)
      var error = errorState[0]
      var setError = errorState[1]
      var lastAddedState = React.useState(null)
      var setLastAdded = lastAddedState[1]
      var dragState = React.useState(null)
      var drag = dragState[0]
      var setDrag = dragState[1]
      var bodyHolder = React.useState({ current: null })[0]
      var comments = store.comments

      // ----- comments -----
      var addComment = function (blockIndex, quote) {
        var cid = 'c' + String(Date.now()) + String(Math.floor(Math.random() * 10000))
        store.comments = store.comments.concat([{
          cid: cid, blockIndex: blockIndex,
          quote: String(quote == null ? '' : quote).slice(0, QUOTE_MAX),
          text: '',
        }])
        store.lastAdded = cid
        setLastAdded(cid)
        emit()
      }
      var updateComment = function (cid, text) {
        store.comments = store.comments.map(function (c) {
          return c.cid === cid ? Object.assign({}, c, { text: text }) : c
        })
        emit()
      }
      var removeComment = function (cid) {
        store.comments = store.comments.filter(function (c) { return c.cid !== cid })
        emit()
      }
      var hasText = function () {
        for (var i = 0; i < comments.length; i++) {
          if (comments[i].text.trim() !== '') return true
        }
        return false
      }

      // ----- selection commenting (guarded DOM access) -----
      var readSelection = function (ev) {
        try {
          var target = ev.target
          if (target === null || target === undefined || !target.ownerDocument) return null
          var doc = target.ownerDocument
          if (typeof doc.getSelection !== 'function') return null
          var sel = doc.getSelection()
          if (sel === null || sel === undefined || sel.isCollapsed === true) return null
          var text = typeof sel.toString === 'function' ? sel.toString().trim() : ''
          if (text === '') return null
          var node = sel.anchorNode
          if (node === null || node === undefined) return null
          var el = node.nodeType === 1 ? node : node.parentElement
          var container = bodyHolder.current
          if (el === null || el === undefined || container === null || container === undefined) return null
          if (typeof container.contains === 'function' && !container.contains(el)) return null
          var blockEl = typeof el.closest === 'function' ? el.closest('[data-pbi]') : null
          var bi = blockEl !== null && blockEl !== undefined ? Number(blockEl.getAttribute('data-pbi')) : 0
          if (!isFinite(bi) || bi < 0) bi = 0
          return { text: text, blockIndex: bi }
        } catch (e) { return null }
      }
      var onBodyMouseUp = function (ev) {
        var sel = readSelection(ev)
        if (sel === null) return
        addComment(sel.blockIndex, sel.text)
      }

      // ----- drag & resize (pointer capture on the handles themselves) -----
      var beginDrag = function (ev, mode) {
        if (ev.button !== undefined && ev.button !== 0) return
        if (mode === 'move') {
          var target = ev.target
          if (target !== null && target !== undefined && typeof target.closest === 'function'
            && target.closest('button') !== null) return
        }
        var el = ev.currentTarget
        try {
          if (el !== undefined && typeof el.setPointerCapture === 'function') el.setPointerCapture(ev.pointerId)
        } catch (e) { /* capture best-effort */ }
        setDrag({ mode: mode, sx: ev.clientX, sy: ev.clientY, x: effGeo.x, y: effGeo.y, w: effGeo.w, h: effGeo.h })
      }
      var moveDrag = function (ev) {
        if (drag === null) return
        var dx = ev.clientX - drag.sx
        var dy = ev.clientY - drag.sy
        var next
        if (drag.mode === 'move') {
          next = clampGeo({ x: Math.max(0, drag.x + dx), y: Math.max(0, drag.y + dy), w: drag.w, h: drag.h }, vp.vw, vp.vh)
          setGeo(function (g) { return Object.assign({}, g, { x: next.x, y: next.y }) })
        } else {
          next = clampGeo({ x: drag.x, y: drag.y, w: Math.max(MIN_W, drag.w + dx), h: Math.max(MIN_H, drag.h + dy) }, vp.vw, vp.vh)
          setGeo(function (g) { return Object.assign({}, g, { x: next.x, y: next.y, w: next.w, h: next.h }) })
        }
      }
      var endDrag = function (ev) {
        if (drag === null) return
        var el = ev.currentTarget
        try {
          if (el !== undefined && typeof el.releasePointerCapture === 'function') el.releasePointerCapture(ev.pointerId)
        } catch (e) { /* release best-effort */ }
        setDrag(null)
        store.geo = clampGeo(geo, vp.vw, vp.vh)
      }

      // ----- decisions (mirror of the shipped PendingQuestion encoding) -----
      var send = function (payload) {
        if (wait === null || wait === undefined || typeof wait.respond !== 'function') {
          setError('question carrier unavailable')
          return
        }
        setBusy(true)
        setError(null)
        var p
        try { p = Promise.resolve(wait.respond(payload)) } catch (e) {
          setBusy(false)
          setError(String(e && e.message ? e.message : e))
          return
        }
        p.then(function (receipt) {
          if (receipt === null || receipt === undefined || receipt.accepted !== true) {
            var reason = receipt !== null && receipt !== undefined && receipt.reason
              ? String(receipt.reason) : 'response rejected'
            setBusy(false)
            setError(reason)
          }
        }).catch(function (cause) {
          setBusy(false)
          setError(cause instanceof Error ? cause.message : String(cause))
        })
      }
      var approve = function () {
        send(approvePayload(wait.sessionId, review.id, review.approveLabel))
      }
      var keepPlanning = function () {
        if (!hasText()) { setError(t('emptyComment')); return }
        send(keepPlanningPayload(wait.sessionId, review.id, formatFeedback(comments, L)))
      }
      var discuss = function () {
        send({
          ok: false,
          error: { code: 'cancelled', message: 'the user closed this question request', details: {} },
        })
      }

      // ----- render -----
      var blocks = parseBlocks(review.plan)
      var commented = {}
      comments.forEach(function (c) { commented[c.blockIndex] = true })
      var blockRows = []
      for (var bi = 0; bi < blocks.length; bi++) {
        var idx = bi
        var blk = blocks[bi]
        blockRows.push(React.createElement('div', {
          key: 'r' + idx,
          className: 'plnwin-blockrow' + (commented[idx] ? ' plnwin-blockrow-hit' : ''),
          'data-pbi': String(idx),
        },
          React.createElement('button', {
            type: 'button', className: 'plnwin-gutter', title: t('empty'),
            onClick: function () { addComment(idx, blockText(blk)) },
          }, '+'),
          renderBlock(blk),
        ))
      }
      var cards = comments.map(function (c) {
        return React.createElement('div', { key: c.cid, className: 'plnwin-card' },
          React.createElement('div', { className: 'plnwin-card-head' },
            React.createElement('span', { className: 'plnwin-card-block' }, L.blockNo(c.blockIndex)),
            React.createElement('button', {
              type: 'button', className: 'plnwin-card-del', title: t('del'),
              onClick: function () { removeComment(c.cid) },
            }, '×'),
          ),
          c.quote !== '' ? React.createElement('div', { className: 'plnwin-card-quote' }, c.quote) : null,
          React.createElement('textarea', {
            className: 'plnwin-card-input',
            value: c.text,
            rows: 3,
            autoFocus: c.cid === store.lastAdded,
            placeholder: t('placeholder'),
            onChange: function (ev) { updateComment(c.cid, ev.target.value) },
          }),
        )
      })

      return React.createElement('div', {
        className: 'plnwin-window',
        role: 'dialog',
        'aria-label': t('title') + ' — ' + review.question,
        style: { left: effGeo.x + 'px', top: effGeo.y + 'px', width: effGeo.w + 'px', height: effGeo.h + 'px' },
      },
        React.createElement('div', {
          className: 'plnwin-header',
          onPointerDown: function (ev) { beginDrag(ev, 'move') },
          onPointerMove: moveDrag,
          onPointerUp: endDrag,
          onPointerCancel: endDrag,
        },
          React.createElement('span', { className: 'plnwin-title-dot' }),
          React.createElement('span', { className: 'plnwin-title' }, t('title')),
          React.createElement('span', { className: 'plnwin-badge' }, L.badge(comments.length)),
          React.createElement('button', {
            type: 'button', className: 'plnwin-close', 'aria-label': t('hide'), title: t('hide'),
            onClick: function () { store.open = false; emit() },
          }, '×'),
        ),
        React.createElement('div', { className: 'plnwin-main' },
          React.createElement('div', { className: 'plnwin-body', ref: bodyHolder, onMouseUp: onBodyMouseUp },
            blockRows.length > 0 ? blockRows : React.createElement('div', { className: 'plnwin-p' }, review.plan),
          ),
          React.createElement('div', { className: 'plnwin-side' },
            cards.length > 0 ? cards : React.createElement('div', { className: 'plnwin-side-empty' }, t('empty')),
          ),
        ),
        React.createElement('div', { className: 'plnwin-footer' },
          React.createElement('div', { className: 'plnwin-error', role: 'status' }, error !== null ? error : ''),
          React.createElement('div', { className: 'plnwin-footer-actions' },
            React.createElement('button', {
              type: 'button', className: 'plnwin-btn plnwin-btn-ghost', disabled: busy, onClick: discuss,
            }, t('discuss')),
            review.declineLabel !== null
              ? React.createElement('button', {
                type: 'button', className: 'plnwin-btn plnwin-btn-outline',
                disabled: busy || !hasText(),
                title: !hasText() ? t('emptyComment') : '',
                onClick: keepPlanning,
              }, busy ? t('submitting') : t('keep'))
              : null,
            React.createElement('button', {
              type: 'button', className: 'plnwin-btn plnwin-btn-primary', disabled: busy, onClick: approve,
            }, t('approve')),
          ),
        ),
        React.createElement('div', {
          className: 'plnwin-resize',
          onPointerDown: function (ev) { beginDrag(ev, 'resize') },
          onPointerMove: moveDrag,
          onPointerUp: endDrag,
          onPointerCancel: endDrag,
        }),
      )
    }

    // ---------- styles (theme tokens; auto light/dark) ----------
    var CSS = [
      '.plnwin-strip{display:flex;align-items:center;gap:10px;padding:10px 14px;border-radius:12px;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);font-size:13px;color:var(--dsw-alias-label-secondary);margin:0 2px}',
      '.plnwin-strip-dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-brand-primary);flex:none}',
      '.plnwin-strip-text{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.plnwin-strip-btn{margin-left:auto;flex:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);border-radius:8px;padding:4px 12px;font-size:12px;cursor:pointer}',
      '.plnwin-strip-btn:hover{border-color:var(--dsw-alias-brand-primary)}',
      '.plnwin-window{position:fixed;z-index:80;display:flex;flex-direction:column;background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l2);border-radius:14px;box-shadow:0 24px 64px rgba(0,0,0,.3);overflow:hidden;font-size:14px;color:var(--dsw-alias-label-primary)}',
      '.plnwin-header{display:flex;align-items:center;gap:10px;padding:10px 12px 10px 16px;background:var(--dsw-alias-bg-layer-2);border-bottom:1px solid var(--dsw-alias-border-l1);cursor:grab;user-select:none;touch-action:none;flex:none}',
      '.plnwin-header:active{cursor:grabbing}',
      '.plnwin-title-dot{width:9px;height:9px;border-radius:50%;background:var(--dsw-alias-brand-primary);flex:none}',
      '.plnwin-title{font-weight:600;font-size:14px;white-space:nowrap}',
      '.plnwin-badge{font-size:12px;color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:999px;padding:1px 10px;white-space:nowrap}',
      '.plnwin-close{margin-left:auto;border:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:16px;line-height:1;cursor:pointer;border-radius:6px;padding:2px 8px}',
      '.plnwin-close:hover{color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-1)}',
      '.plnwin-main{flex:1;min-height:0;display:flex}',
      '.plnwin-body{flex:1.2;min-width:0;overflow:auto;padding:16px 18px 24px 38px;line-height:1.65}',
      '.plnwin-body ::selection{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 25%,transparent)}',
      '.plnwin-blockrow{position:relative;border-radius:6px}',
      '.plnwin-blockrow-hit{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 7%,transparent)}',
      '.plnwin-gutter{position:absolute;left:-28px;top:2px;width:20px;height:20px;border-radius:50%;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);font-size:14px;line-height:1;cursor:pointer;opacity:0;transition:opacity .12s;padding:0;display:flex;align-items:center;justify-content:center}',
      '.plnwin-blockrow:hover .plnwin-gutter{opacity:1}',
      '.plnwin-md-h{margin:14px 0 8px;font-weight:650;line-height:1.3}',
      '.plnwin-p{margin:8px 0}',
      '.plnwin-ul,.plnwin-ol{margin:8px 0;padding-left:22px}',
      '.plnwin-li{margin:4px 0}',
      '.plnwin-pre{margin:10px 0;padding:10px 12px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;overflow:auto;font-size:12.5px;line-height:1.55;white-space:pre}',
      '.plnwin-quote{margin:10px 0;padding:6px 12px;border-left:3px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary)}',
      '.plnwin-hr{border:none;border-top:1px solid var(--dsw-alias-border-l1);margin:14px 0}',
      '.plnwin-icode{font-family:var(--dsw-alias-font-mono,ui-monospace,SFMono-Regular,Menlo,Consolas,monospace);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l1);border-radius:4px;padding:0 4px;font-size:.92em}',
      '.plnwin-side{flex:.9;min-width:260px;max-width:46%;overflow:auto;padding:14px;border-left:1px solid var(--dsw-alias-border-l1);display:flex;flex-direction:column;gap:10px;background:var(--dsw-alias-bg-base)}',
      '.plnwin-side-empty{color:var(--dsw-alias-label-secondary);font-size:12.5px;line-height:1.6;padding:8px 2px}',
      '.plnwin-card{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px;background:var(--dsw-alias-bg-layer-1);display:flex;flex-direction:column;gap:8px}',
      '.plnwin-card-head{display:flex;align-items:center;justify-content:space-between}',
      '.plnwin-card-block{font-size:11.5px;color:var(--dsw-alias-brand-primary);font-weight:600;letter-spacing:.04em}',
      '.plnwin-card-del{border:none;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:14px;line-height:1;padding:2px 6px;border-radius:5px}',
      '.plnwin-card-del:hover{color:var(--dsw-alias-state-error-primary);background:var(--dsw-alias-bg-layer-2)}',
      '.plnwin-card-quote{font-size:12px;color:var(--dsw-alias-label-secondary);border-left:3px solid var(--dsw-alias-brand-primary);padding:4px 8px;background:var(--dsw-alias-bg-layer-2);border-radius:0 6px 6px 0;max-height:88px;overflow:auto;white-space:pre-wrap;word-break:break-word}',
      '.plnwin-card-input{width:100%;box-sizing:border-box;resize:vertical;min-height:58px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;padding:8px 10px;font:inherit;font-size:13px;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary)}',
      '.plnwin-card-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}',
      '.plnwin-footer{flex:none;display:flex;align-items:center;gap:12px;padding:10px 14px;border-top:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-2)}',
      '.plnwin-error{flex:1;min-width:0;font-size:12px;color:var(--dsw-alias-state-error-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.plnwin-footer-actions{display:flex;gap:8px;flex:none}',
      '.plnwin-btn{border-radius:8px;padding:6px 14px;font-size:13px;cursor:pointer;border:1px solid transparent}',
      '.plnwin-btn:disabled{opacity:.5;cursor:not-allowed}',
      '.plnwin-btn-primary{background:var(--dsw-alias-brand-primary);color:#fff}',
      '.plnwin-btn-outline{background:transparent;border-color:var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary)}',
      '.plnwin-btn-outline:hover:not(:disabled){border-color:var(--dsw-alias-brand-primary)}',
      '.plnwin-btn-ghost{background:transparent;color:var(--dsw-alias-label-secondary)}',
      '.plnwin-btn-ghost:hover:not(:disabled){color:var(--dsw-alias-label-primary)}',
      '.plnwin-resize{position:absolute;right:0;bottom:0;width:18px;height:18px;cursor:nwse-resize;touch-action:none;z-index:5}',
      '.plnwin-resize::after{content:"";position:absolute;right:4px;bottom:4px;width:7px;height:7px;border-right:2px solid var(--dsw-alias-border-l2);border-bottom:2px solid var(--dsw-alias-border-l2)}',
    ].join('\n')

    /** Current language for the parameterized label pack (zh default). */
    var lang = 'zh'

    /**
     * Mount the floating plan-review window.
     * @param ctx - client root context (slots/locale services).
     */
    function apply(ctx) {
      try {
        var snap = ctx.locale.getLocale()
        var id = snap !== null && snap !== undefined ? (snap.id || snap.locale || snap.language) : undefined
        if (typeof id === 'string' && id.slice(0, 2).toLowerCase() === 'en') lang = 'en'
      } catch (e) { /* keep zh */ }

      ctx.effect(function () { return ctx.locale.register(NS, { zh: zh, en: en }) }, 'dsh-plan-window: dictionaries')

      // Package-owned stylesheet: one <style> element, removed with this fiber.
      var styleEl = document.createElement('style')
      styleEl.setAttribute('data-owner', 'dsh-plan-window')
      styleEl.textContent = CSS
      document.head.appendChild(styleEl)
      ctx.effect(function () {
        return function () { styleEl.remove() }
      }, 'dsh-plan-window: styles teardown')

      // Composer chain entry at priority -1: tried before the shipped
      // question composer (priority 0), claiming ONLY plan-review waits.
      ctx.effect(function () {
        return ctx.slots.inject('conversation.composer', function () {
          return ctx.slots.register(
            { name: 'conversation.composer', select: selectPlanReview, priority: -1, locale: NS },
            SeatStrip,
          )
        })
      }, 'dsh-plan-window: composer chain entry')

      // Frame-wide floating layer: the free window itself.
      ctx.effect(function () {
        return ctx.slots.inject('shell.overlay', function () {
          return ctx.slots.register(
            { name: 'shell.overlay', id: 'plan-window', order: 100, label: 'Plan review window', locale: NS },
            PlanWindow,
          )
        })
      }, 'dsh-plan-window: overlay window')
    }

    var inject = ['slots', 'locale']
    exports.apply = apply
    exports.inject = inject
    // Pure helpers exposed for tests only (not part of the plugin contract).
    exports.__testables = {
      asPlanReview: asPlanReview, parseBlocks: parseBlocks, formatFeedback: formatFeedback,
      approvePayload: approvePayload, keepPlanningPayload: keepPlanningPayload, STR: STR,
      clampGeo: clampGeo, initialGeo: initialGeo,
    }
    return module.exports
  },
})
