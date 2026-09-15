// Smoke + unit tests for dsh-ws-group-sort.
//
// The browser half is a hand-written ModuleLoader bundle (no build step),
// so the pure logic is exercised by evaluating its factory in this process
// with a stubbed loader and a stubbed `require('react')`; the DOM glue
// (observer + inline-style application) stays thin and is covered by manual
// verification in the web GUI — the same posture as plan-window.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const clientSrc = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')

/** Evaluate the bundle and return its module exports. */
function loadClientBundle() {
  let loaded
  const savedWindow = globalThis.window
  globalThis.window = { __ModuleLoader__: { load: (def) => { loaded = def } } }
  try {
    ;(0, eval)(clientSrc)
  } finally {
    if (savedWindow === undefined) delete globalThis.window
    else globalThis.window = savedWindow
  }
  assert.ok(loaded, 'bundle must register itself with __ModuleLoader__')
  assert.equal(loaded.id, 'dsh-ws-group-sort')
  const reactStub = {
    createElement: (...args) => ({ stub: 'element', args }),
    useEffect: () => {},
  }
  const require_ = (id) => {
    if (id === 'react') return reactStub
    throw new Error(`unexpected require: ${id}`)
  }
  return loaded.factory(require_)
}

/** localStorage stub keyed by an in-memory map. */
const memoryStorage = (initial = new Map()) => ({
  getItem: (k) => (initial.has(k) ? initial.get(k) : null),
  setItem: (k, v) => { initial.set(k, v) },
})

const summary = (id, updatedAt, overrides = {}) => ({
  id, updatedAt, blank: false, ...overrides,
})

/** Duck-typed group-section/header pair for sectionKeyOf. */
const section = (headerAttrs, textContent) => ({
  firstElementChild: {
    getAttribute: (name) => headerAttrs[name] ?? null,
    hasAttribute: (name) => Object.hasOwn(headerAttrs, name),
    textContent,
  },
})

test('bundle exports the cordis plugin contract', () => {
  const exports = loadClientBundle()
  assert.equal(typeof exports.apply, 'function')
  assert.deepEqual(exports.inject, ['slots'])
})

test('readViewMode mirrors the persisted viewing-store contract', () => {
  const { readViewMode, VIEW_STORAGE_KEY } = loadClientBundle().__testables
  const storage = memoryStorage()
  // missing key → the shipped init defaults (workspace + latest = ACTIVE)
  assert.deepEqual(readViewMode(storage), { groupBy: 'workspace', orderBy: 'updated' })
  // exact persisted modes round-trip
  storage.setItem(VIEW_STORAGE_KEY, JSON.stringify({ groupBy: 'workspace', orderBy: 'updated' }))
  assert.deepEqual(readViewMode(storage), { groupBy: 'workspace', orderBy: 'updated' })
  storage.setItem(VIEW_STORAGE_KEY, JSON.stringify({ groupBy: 'flat', orderBy: 'updated' }))
  assert.deepEqual(readViewMode(storage), { groupBy: 'flat', orderBy: 'updated' })
  storage.setItem(VIEW_STORAGE_KEY, JSON.stringify({ groupBy: 'workspace', orderBy: 'manual' }))
  assert.deepEqual(readViewMode(storage), { groupBy: 'workspace', orderBy: 'manual' })
  // corrupt value → init defaults (same fallback the engine store takes)
  storage.setItem(VIEW_STORAGE_KEY, '{not json')
  assert.deepEqual(readViewMode(storage), { groupBy: 'workspace', orderBy: 'updated' })
  // missing storage entirely → defaults
  assert.deepEqual(readViewMode(null), { groupBy: 'workspace', orderBy: 'updated' })
})

test('groupRecency ranks groups by their newest visible conversation', () => {
  const { groupRecency, UNGROUPED_KEY } = loadClientBundle().__testables
  const workspaces = {
    items: [
      { title: 'alpha', sessionIds: ['a1', 'a2'] },
      { title: 'beta', sessionIds: ['b1'] },
      { title: 'gamma', sessionIds: ['g1'] },
    ],
    archivedSessionIds: [],
  }
  const sessions = {
    ids: ['a1', 'a2', 'b1', 'g1', 'u1'],
    byId: {
      a1: summary('a1', 100),
      a2: summary('a2', 500), // alpha's newest → 500
      b1: summary('b1', 900), // beta holds the newest conversation
      g1: summary('g1', 50),
      u1: summary('u1', 700), // ungrouped, newer than every workspace
    },
    current: undefined,
  }
  const ranks = groupRecency(workspaces, sessions)
  assert.equal(ranks.alpha, 500)
  assert.equal(ranks.beta, 900)
  assert.equal(ranks.gamma, 50)
  assert.equal(ranks[UNGROUPED_KEY], 700)
})

test('groupRecency mirrors the shipped visibility rules', () => {
  const { groupRecency, UNGROUPED_KEY } = loadClientBundle().__testables
  const workspaces = {
    items: [{ title: 'alpha', sessionIds: ['arch', 'sub', 'blank', 'cur', 'gone'] }],
    archivedSessionIds: ['arch'],
  }
  const sessions = {
    ids: ['arch', 'sub', 'blank', 'cur', 'gone', 'loose'],
    byId: {
      arch: summary('arch', 1000), // archived → invisible
      sub: summary('sub', 900, { origin: 'subagent' }), // subagent row → invisible
      blank: summary('blank', 800, { blank: true }), // blank, not current → invisible
      cur: summary('cur', 400, { blank: true }), // the selected blank counts
      gone: undefined, // account leads the list pull → skipped
      loose: summary('loose', 10), // unaccounted → ungrouped bucket
    },
    current: 'cur',
  }
  const ranks = groupRecency(workspaces, sessions)
  assert.equal(ranks.alpha, 400, 'only the current blank contributes')
  assert.equal(ranks[UNGROUPED_KEY], 10)
})

test('groupRecency puts childless groups last and tolerates empty data', () => {
  const { groupRecency, UNGROUPED_KEY } = loadClientBundle().__testables
  const ranks = groupRecency(
    { items: [{ title: 'empty', sessionIds: [] }, { title: 'live', sessionIds: ['x'] }] },
    { ids: ['x'], byId: { x: summary('x', 42) }, current: undefined },
  )
  assert.equal(ranks.empty, Number.NEGATIVE_INFINITY)
  assert.equal(ranks.live, 42)
  assert.equal(ranks[UNGROUPED_KEY], Number.NEGATIVE_INFINITY)
  // hostile shapes degrade to all-empty ranks instead of throwing
  const barren = groupRecency(null, null)
  assert.deepEqual(Object.keys(barren), [UNGROUPED_KEY])
  assert.equal(barren[UNGROUPED_KEY], Number.NEGATIVE_INFINITY)
})

test('orderedKeys sorts newest-first with host-order ties', () => {
  const { orderedKeys, UNGROUPED_KEY } = loadClientBundle().__testables
  const order = orderedKeys({ alpha: 100, beta: 300, gamma: 100, [UNGROUPED_KEY]: 200 })
  assert.deepEqual(order, ['beta', UNGROUPED_KEY, 'alpha', 'gamma'])
  // alpha/gamma tie at 100 → insertion (host) order alpha then gamma
  // no-visible-session groups trail everything in host order
  const trailing = orderedKeys({ dead1: -Infinity, live: 1, dead2: -Infinity })
  assert.deepEqual(trailing, ['live', 'dead1', 'dead2'])
})

test('planOrders assigns consecutive visual ranks and fails closed on skew', () => {
  const { planOrders } = loadClientBundle().__testables
  // DOM sections matched in any order get the desired relative order
  assert.deepEqual(planOrders(['b', 'a', 'c'], ['a', 'b', 'c']), [1, 0, 2])
  // extra entries in the desired order are harmless
  assert.deepEqual(planOrders(['b'], ['a', 'b', 'c']), [1])
  // a section missing from the data fails the whole pass → keep last frame
  assert.equal(planOrders(['b', 'x'], ['a', 'b']), null)
  assert.deepEqual(planOrders([], []), [])
})

test('sectionKeyOf recognizes only expandable workspace headers', () => {
  const { sectionKeyOf, UNGROUPED_KEY } = loadClientBundle().__testables
  const header = { role: 'treeitem', 'aria-expanded': 'true', draggable: 'true' }
  // real workspace header → its (unique) title
  assert.equal(sectionKeyOf(section(header, '  My Repo ')), 'My Repo')
  // ungrouped bucket: expandable but not draggable
  assert.equal(sectionKeyOf(section({ role: 'treeitem', 'aria-expanded': 'true' }, '未分组')), UNGROUPED_KEY)
  // session / search rows: treeitems without aria-expanded never participate
  assert.equal(sectionKeyOf(section({ role: 'treeitem', 'aria-selected': 'true', draggable: 'true' }, 'a session')), null)
  // flat rows are draggable but not expandable
  assert.equal(sectionKeyOf(section({ role: 'treeitem', draggable: 'true' }, 'row')), null)
  // non-treeitem first child, empty section, null input
  assert.equal(sectionKeyOf(section({ role: 'button' }, 'x')), null)
  assert.equal(sectionKeyOf({ firstElementChild: null }), null)
  assert.equal(sectionKeyOf(null), null)
})

test('GroupSorter renders nothing and survives missing hooks', () => {
  const { GroupSorter } = loadClientBundle().__testables
  const withHooks = GroupSorter({
    useSessions: (sel) => sel({ ids: [], byId: {}, current: undefined }),
    useWorkspaces: (sel) => sel({ items: [] }),
  })
  assert.equal(withHooks, null)
  // degraded composition (hooks absent): render stays inert, effect no-ops
  assert.equal(GroupSorter({}), null)
})

test('host half and package.json shape', async () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.name, 'dsh-ws-group-sort')
  assert.equal(pkg.exports['./client'], './src/client.js')
  assert.deepEqual(pkg.dsh.client, { platform: 'web' })
  const host = await import(new URL('../src/index.js', import.meta.url))
  assert.equal(host.name, 'dsh-ws-group-sort')
  assert.equal(typeof host.apply, 'function')
})

// The application pass must stay purely inline-style on nodes React never
// style-manages (outlet anchor addressing + style.order), never DOM moves.
test('client applies order through the blessed anchor and CSS order only', () => {
  assert.match(clientSrc, /querySelector\('\[data-slot="sidebar\.workspaces"\]'\)/)
  assert.match(clientSrc, /style\.order = String\(plan\[s\]\)/)
  assert.doesNotMatch(clientSrc, /insertBefore|appendChild|removeChild/)
})
