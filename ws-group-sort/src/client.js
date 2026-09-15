/**
 * Browser half of `dsh-ws-group-sort` (shipped as the package's `./client`
 * export; discovered and served by the dsh client-modules system when the
 * package declares `dsh.client`).
 *
 * WHAT: the shipped workspace browser (ui-workspace's WorkspaceBrowser)
 * renders group sections in stable Host order, while sessions INSIDE each
 * group follow the selected order ("最新对话" = recency with activity
 * promotion). A brand-new conversation therefore bubbles to the top of its
 * own group, but the group itself stays wherever the Host registry placed
 * it. This plugin closes that gap: in grouped + latest order, the group
 * holding the newest visible conversation is promoted to the top of the
 * group list, newest-first throughout, exactly mirroring the in-group
 * session semantics the user already sees.
 *
 * HOW (presentation-only, zero data-flow interference):
 *
 *  - A null-rendering entry in `shell.overlay` (the designated no-visual
 *    seat) subscribes to the two GLOBAL standard hooks every slot component
 *    receives as props — `useSessions` and `useWorkspaces` — and recomputes
 *    a recency rank per group on every data change. Group recency = max
 *    updatedAt over the group's VISIBLE sessions (the shipped visibility
 *    rules mirrored: archived, subagent-origin rows, and blank rows other
 *    than the current selection never count; the ungrouped bucket competes
 *    with real Workspaces on the same terms).
 *  - The current view mode is read from the browser's persisted viewing
 *    store (`dsh.workspace.view.v5`, the exact localStorage contract the
 *    shipped engine store writes); reordering is active ONLY for
 *    groupBy=workspace + orderBy=updated. Any other mode (manual order,
 *    flat list) strips every style the plugin applied and leaves the native
 *    Host order untouched.
 *  - Application is pure inline-CSS on nodes React never style-manages: the
 *    grouped tree container (the `[role=tree]` inside the sidebar's
 *    `[data-slot="sidebar.workspaces"]` outlet anchor — the blessed
 *    addressable seam for dynamic styles) gets display:flex/flex-direction
 *    :column, and each group section gets style.order = its recency rank.
 *    React owns neither node's style prop, so the inline values survive
 *    re-renders; DOM order is never touched (React never fights back, and
 *    unloading restores native order pixel-for-pixel by clearing styles).
 *  - Group sections are identified structurally: a direct tree child whose
 *    first element child is an expandable treeitem (`[role=treeitem]` with
 *    aria-expanded — only workspace headers carry it; session/search rows
 *    do not). Real Workspace headers are draggable and matched to data by
 *    their title text (the Host rejects Workspace name conflicts, so titles
 *    are unique); the non-draggable header is the ungrouped bucket. A
 *    body-level MutationObserver (rAF-debounced) re-applies after DOM-only
 *    changes (view-mode switch, sidebar expand, section add/remove) that
 *    the data hooks do not observe; the apply pass is idempotent and
 *    caches the parsed view-mode by raw localStorage string, so observer
 *    churn from unrelated surfaces costs one string compare per frame.
 *  - Fail-soft by construction: if any section cannot be matched to the
 *    live data (mid-update skew), the pass skips entirely and leaves the
 *    previous styles for a frame; if the sidebar markup ever changes shape,
 *    matching simply finds no sections and the plugin no-ops back to native
 *    behavior instead of breaking the surface.
 *
 * NOT: it never writes Host order (drag-to-reorder in the registry remains
 * durable and untouched — in "最新对话" mode a group drag is as inert as the
 * shipped in-group session sort makes a session drag), never mutates the
 * sessions/workspaces observables, and never touches surfaces outside the
 * sidebar tree (pickers, hover cards, search results stay native).
 *
 * Hand-written bundle (no build step): plain factory + React hooks.
 * @module dsh-ws-group-sort/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-ws-group-sort',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var React = require('react')

    /** localStorage key of the shipped browser's persisted viewing store. */
    var VIEW_STORAGE_KEY = 'dsh.workspace.view.v5'

    /** Rank-map sentinel for the ungrouped bucket (never a workspace title). */
    var UNGROUPED_KEY = '\u0000ungrouped'

    /** localStorage access, guarded for non-browser evaluation (tests). */
    var safeStorage = function () {
      try { return window.localStorage } catch (e) { return null }
    }

    var lastModeRaw = null
    var lastMode = null

    /**
     * Read the browser's persisted view mode (test surface). Mirrors the
     * shipped store's rehydration contract: a missing key falls back to the
     * init defaults (workspace grouping + latest order, i.e. ACTIVE — that
     * is also this plugin's default posture), a corrupt value falls back
     * the same way (the store logs and keeps its init state), and only the
     * exact persisted strings 'flat' / 'manual' switch the modes off.
     * @param {Storage | null} storage
     * @returns {{ groupBy: 'workspace' | 'flat', orderBy: 'manual' | 'updated' }}
     */
    var readViewMode = function (storage) {
      var raw = null
      try { raw = storage === null || storage === undefined ? null : storage.getItem(VIEW_STORAGE_KEY) }
      catch (e) { raw = null }
      if (raw === lastModeRaw && lastMode !== null) return lastMode
      var parsed = undefined
      if (raw !== null) {
        try { parsed = JSON.parse(raw) } catch (e) { parsed = undefined }
      }
      var mode = {
        groupBy: parsed !== undefined && parsed !== null && parsed.groupBy === 'flat' ? 'flat' : 'workspace',
        orderBy: parsed !== undefined && parsed !== null && parsed.orderBy === 'manual' ? 'manual' : 'updated',
      }
      lastModeRaw = raw
      lastMode = mode
      return mode
    }

    /** Shipped session-visibility rule (ui-workspace tree.ts sessionVisible). */
    var memberVisible = function (summary, current, archived) {
      if (summary === null || summary === undefined) return false
      if (archived.has(summary.id)) return false
      if (summary.origin === 'subagent') return false
      if (summary.blank === true && summary.id !== current) return false
      return true
    }

    /**
     * Recency rank per group from live data (test surface).
     * @param { { items: readonly { title: string, sessionIds: readonly string[] }[], archivedSessionIds?: readonly string[] } } workspaces
     * @param { { ids?: readonly string[], byId?: Record<string, { id: string, updatedAt: number, blank?: boolean, origin?: string }>, current?: string } } sessions
     * @returns {Record<string, number>} title → max visible-member updatedAt
     *   ( insertion order: Workspaces in Host order, ungrouped sentinel last —
     *   that order is the tie-break ), groups with no visible session rank
     *   -Infinity and therefore sort last.
     */
    var groupRecency = function (workspaces, sessions) {
      var items = workspaces !== null && workspaces !== undefined && Array.isArray(workspaces.items)
        ? workspaces.items
        : []
      var list = sessions !== null && sessions !== undefined ? sessions : {}
      var byId = list.byId !== null && list.byId !== undefined ? list.byId : {}
      var ids = Array.isArray(list.ids) ? list.ids : []
      var archived = new Set(
        workspaces !== null && workspaces !== undefined && Array.isArray(workspaces.archivedSessionIds)
          ? workspaces.archivedSessionIds
          : [],
      )
      var accounted = new Set()
      var ranks = {}
      var maxOf = function (sessionIds) {
        var max = Number.NEGATIVE_INFINITY
        for (var i = 0; i < sessionIds.length; i++) {
          var id = sessionIds[i]
          var summary = byId[id]
          if (summary === undefined || summary === null) continue
          // Accounted tracks membership exactly like the shipped derivation:
          // an id whose summary landed is claimed even when the row is not
          // visible, so it cannot double-count as ungrouped below.
          accounted.add(id)
          if (!memberVisible(summary, list.current, archived)) continue
          var at = typeof summary.updatedAt === 'number' ? summary.updatedAt : Number(summary.updatedAt)
          if (isFinite(at) && at > max) max = at
        }
        return max
      }
      for (var w = 0; w < items.length; w++) {
        var workspaceIds = Array.isArray(items[w].sessionIds) ? items[w].sessionIds : []
        ranks[items[w].title] = maxOf(workspaceIds)
      }
      ranks[UNGROUPED_KEY] = maxOf(ids.filter(function (id) {
        var summary = byId[id]
        return summary !== undefined && summary !== null && !accounted.has(id)
      }))
      return ranks
    }

    /**
     * Desired visual order of group keys (test surface): recency descending,
     * ties keep insertion (Host) order — a stable sort over the rank map.
     * @returns {string[]} keys, newest group first.
     */
    var orderedKeys = function (ranks) {
      var keys = Object.keys(ranks)
      var position = {}
      for (var i = 0; i < keys.length; i++) position[keys[i]] = i
      keys.sort(function (a, b) {
        var diff = ranks[b] - ranks[a]
        return diff !== 0 ? diff : position[a] - position[b]
      })
      return keys
    }

    /**
     * Assign a visual order value to every section key (test surface).
     * Sections arriving in DOM order with their matched keys get
     * consecutive ranks following `order`; a key absent from `order`
     * (data/DOM skew) fails the whole pass → null, so the caller leaves the
     * previously applied styles untouched for one frame instead of
     * half-sorting the list.
     * @param {readonly string[]} sectionKeys - matched keys, DOM order.
     * @param {readonly string[]} order - desired key order, newest first.
     * @returns {number[] | null} per-section style.order values.
     */
    var planOrders = function (sectionKeys, order) {
      var rankOf = {}
      for (var i = 0; i < order.length; i++) rankOf[order[i]] = i
      var plan = []
      for (var s = 0; s < sectionKeys.length; s++) {
        var rank = rankOf[sectionKeys[s]]
        if (rank === undefined) return null
        plan.push(rank)
      }
      return plan
    }

    /**
     * One group section's data key (test surface over duck-typed elements):
     * the section's first element child must be an expandable treeitem
     * (only workspace headers carry aria-expanded — session rows and search
     * results do not), draggable ones are real Workspaces matched by title
     * (Host titles are unique), the non-draggable one is the ungrouped
     * bucket. Anything else (flat-list rows, search rows, the empty state)
     * returns null and never participates.
     * @param {{ firstElementChild?: unknown }} sectionEl
     * @returns {string | null}
     */
    var sectionKeyOf = function (sectionEl) {
      var first = sectionEl !== null && sectionEl !== undefined ? sectionEl.firstElementChild : undefined
      if (first === null || first === undefined) return null
      try {
        if (first.getAttribute('role') !== 'treeitem') return null
        if (first.hasAttribute('aria-expanded') !== true) return null
        if (first.getAttribute('draggable') !== 'true') return UNGROUPED_KEY
        return String(first.textContent == null ? '' : first.textContent).trim()
      } catch (e) { return null }
    }

    // ---------- DOM application (thin glue; logic above is the test surface) ----------

    /** Nodes this plugin currently styles, for exact teardown. */
    var applied = null // { tree: Element, sections: Element[] }

    /** Resolve the sidebar workspaces outlet anchor (the addressable seam). */
    var findAnchor = function () {
      try {
        return document.querySelector('[data-slot="sidebar.workspaces"]')
      } catch (e) { return null }
    }

    /** Strip every style this plugin applied (exact rollback to native). */
    var clearApplied = function () {
      if (applied === null) return
      try {
        if (applied.tree !== null && applied.tree.isConnected) {
          applied.tree.style.display = ''
          applied.tree.style.flexDirection = ''
        }
        for (var i = 0; i < applied.sections.length; i++) {
          var el = applied.sections[i]
          if (el.isConnected) {
            el.style.order = ''
            el.style.marginTop = ''
          }
        }
      } catch (e) { /* best-effort teardown */ }
      applied = null
    }

    /**
     * One idempotent application pass over the live sidebar tree.
     * @param {Record<string, number> | null} ranks - null deactivates
     *   (mode off): clears styles so the native Host order renders.
     */
    var applyToSidebar = function (ranks) {
      var anchor = findAnchor()
      var tree = null
      try { tree = anchor === null ? null : anchor.querySelector('[role="tree"]') } catch (e) { tree = null }
      if (tree === null || ranks === null) {
        clearApplied()
        return
      }
      var sections = []
      var keys = []
      try {
        for (var i = 0; i < tree.children.length; i++) {
          var child = tree.children[i]
          var key = sectionKeyOf(child)
          if (key !== null && key !== '') {
            sections.push(child)
            keys.push(key)
          }
        }
      } catch (e) {
        clearApplied()
        return
      }
      // A tree with no expandable headers is the flat or search projection
      // (the mode gate already handles those; this is the structural guard
      // that keeps search results untouched even if the persisted mode lies).
      if (sections.length === 0) {
        clearApplied()
        return
      }
      var plan = planOrders(keys, orderedKeys(ranks))
      if (plan === null) return // unmatched section: keep last frame's styles
      if (applied === null || applied.tree !== tree) clearApplied()
      try {
        tree.style.display = 'flex'
        tree.style.flexDirection = 'column'
        for (var s = 0; s < sections.length; s++) {
          sections[s].style.order = String(plan[s])
          // Inter-group spacing is a DOM-adjacency rule (`.groupSection +
          // .groupSection`); visual reordering breaks that adjacency, so the
          // same 4px rhythm is set explicitly — zero only above the
          // visually-first section.
          sections[s].style.marginTop = plan[s] === 0 ? '0px' : '4px'
        }
      } catch (e) {
        clearApplied()
        return
      }
      applied = { tree: tree, sections: sections }
    }

    /**
     * Overlay entry: renders nothing, drives the sidebar sort. Re-renders
     * whenever the sessions or workspaces snapshots change (the same facts
     * the shipped tree renders from), recomputing the ranks; a body-scoped
     * childList observer covers DOM-only transitions the data hooks cannot
     * see (view-mode switch, sidebar expand, section add/remove) and
     * re-applies at most once per animation frame.
     */
    function GroupSorter(props) {
      var sessions = typeof props.useSessions === 'function'
        ? props.useSessions(function (s) { return s })
        : null
      var workspaces = typeof props.useWorkspaces === 'function'
        ? props.useWorkspaces(function (s) { return s })
        : null
      React.useEffect(function () {
        if (sessions === null || workspaces === null) return undefined
        var frame = null
        var cancelled = false
        var raf = typeof requestAnimationFrame === 'function'
          ? requestAnimationFrame
          : function (fn) { fn(); return null }
        var reapply = function () {
          if (cancelled) return
          try {
            var mode = readViewMode(safeStorage())
            applyToSidebar(
              mode.groupBy === 'workspace' && mode.orderBy === 'updated'
                ? groupRecency(workspaces, sessions)
                : null,
            )
          } catch (e) { /* one bad pass never breaks the surface */ }
        }
        var schedule = function () {
          if (cancelled || frame !== null) return
          frame = raf(function () {
            frame = null
            reapply()
          })
        }
        reapply()
        var observer = null
        try {
          observer = new MutationObserver(schedule)
          observer.observe(document.body, { childList: true, subtree: true })
        } catch (e) { /* keep the data-driven path alone */ }
        return function () {
          cancelled = true
          if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame)
          frame = null
          if (observer !== null) observer.disconnect()
          clearApplied()
        }
      }, [sessions, workspaces])
      return null
    }

    /**
     * Mount the sorter.
     * @param ctx - client root context (slots service).
     */
    function apply(ctx) {
      ctx.effect(function () {
        return ctx.slots.inject('shell.overlay', function () {
          return ctx.slots.register(
            { name: 'shell.overlay', id: 'ws-group-sort', order: 101, label: 'Workspace group recency sort' },
            GroupSorter,
          )
        })
      }, 'dsh-ws-group-sort: overlay entry')
    }

    var inject = ['slots']
    exports.apply = apply
    exports.inject = inject
    // Pure helpers exposed for tests only (not part of the plugin contract).
    exports.__testables = {
      VIEW_STORAGE_KEY: VIEW_STORAGE_KEY,
      UNGROUPED_KEY: UNGROUPED_KEY,
      readViewMode: readViewMode,
      groupRecency: groupRecency,
      orderedKeys: orderedKeys,
      planOrders: planOrders,
      sectionKeyOf: sectionKeyOf,
      GroupSorter: GroupSorter,
    }
    return module.exports
  },
})
