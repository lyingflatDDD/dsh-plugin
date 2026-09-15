// Smoke + unit tests for dsh-plan-window.
//
// The browser half is a hand-written ModuleLoader bundle (no build step),
// so the pure logic is exercised by evaluating its factory in this process
// with a stubbed loader and a stubbed `require('react')`; rendering itself
// is covered by manual verification in the web GUI.
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
  assert.equal(loaded.id, 'dsh-plan-window')
  const reactStub = {
    createElement: (...args) => ({ stub: 'element', args }),
    useState: (init) => [typeof init === 'function' ? init() : init, () => {}],
    useEffect: () => {},
  }
  const reactDomStub = {
    createPortal: (el, container) => ({ stub: 'portal', el, container }),
  }
  const require_ = (id) => {
    if (id === 'react') return reactStub
    if (id === 'react-dom') return reactDomStub
    throw new Error(`unexpected require: ${id}`)
  }
  return loaded.factory(require_)
}

/** A plan-review PendingQuestion carrier (kind set by the shipped planReviewOf). */
const wait = (questions, kind = 'plan-review') => ({ kind, key: 'k1', sessionId: 's1', questions })

const planQuestion = (overrides = {}) => ({
  id: 'plan-review',
  header: 'Plan review',
  question: 'Approve this plan and leave plan mode?',
  detail: '# Title\n\nbody',
  options: [
    { label: 'Approve', description: 'a' },
    { label: 'Keep planning', description: 'b' },
  ],
  intent: { kind: 'plan-review', approve: 'Approve' },
  ...overrides,
})

test('bundle exports the cordis plugin contract', () => {
  const exports = loadClientBundle()
  assert.equal(typeof exports.apply, 'function')
  assert.deepEqual(exports.inject, ['slots', 'locale'])
})

test('asPlanReview narrows exactly the plan-review shape', () => {
  const { asPlanReview } = loadClientBundle().__testables
  const review = asPlanReview(wait([planQuestion()]))
  assert.deepEqual(review, {
    id: 'plan-review',
    question: 'Approve this plan and leave plan mode?',
    plan: '# Title\n\nbody',
    approveLabel: 'Approve',
    declineLabel: 'Keep planning',
  })
  // not a question carrier
  assert.equal(asPlanReview(null), null)
  assert.equal(asPlanReview({ questions: [] }), null)
  // two questions, no intent, no detail, multiSelect, 3 options, approve mismatch
  assert.equal(asPlanReview(wait([planQuestion(), planQuestion()])), null)
  assert.equal(asPlanReview(wait([planQuestion({ intent: undefined })])), null)
  assert.equal(asPlanReview(wait([planQuestion({ detail: undefined })])), null)
  assert.equal(asPlanReview(wait([planQuestion({ multiSelect: true })])), null)
  assert.equal(asPlanReview(wait([planQuestion({
    options: [{ label: 'Approve' }, { label: 'Keep planning' }, { label: 'Other' }],
  })])), null)
  assert.equal(asPlanReview(wait([planQuestion({
    intent: { kind: 'plan-review', approve: 'Nonexistent' },
  })])), null)
  // approve-only single option is still claimable (decline absent)
  assert.deepEqual(
    asPlanReview(wait([planQuestion({ options: [{ label: 'Approve' }] })])),
    { id: 'plan-review', question: 'Approve this plan and leave plan mode?', plan: '# Title\n\nbody', approveLabel: 'Approve', declineLabel: null },
  )
})

test('parseBlocks covers the supported markdown shapes', () => {
  const { parseBlocks } = loadClientBundle().__testables
  const blocks = parseBlocks([
    '# Title',
    '',
    'para one',
    'continued line',
    '',
    '- a **bold** item',
    '- b `code` item',
    '',
    '1. first',
    '2. second',
    '',
    '> quoted',
    '',
    '---',
    '',
    '```',
    'code line',
    '```',
  ].join('\n'))
  const kinds = blocks.map((b) => b.kind)
  assert.deepEqual(kinds, ['h', 'p', 'ul', 'ol', 'quote', 'hr', 'code'])
  assert.equal(blocks[0].level, 1)
  assert.equal(blocks[1].text, 'para one continued line')
  assert.deepEqual(blocks[2].items, ['a **bold** item', 'b `code` item'])
  assert.deepEqual(blocks[3].items, ['first', 'second'])
  assert.equal(blocks[6].text, 'code line')
})

test('formatFeedback renders the numbered quoted list', () => {
  const { formatFeedback, STR } = loadClientBundle().__testables
  const out = formatFeedback([
    { blockIndex: 2, quote: 'some text', text: 'make it shorter ' },
    { blockIndex: 0, quote: '', text: 'drop this section' },
  ], STR.zh)
  assert.equal(
    out,
    '计划评审意见（共 2 条）：\n'
    + '1. 「some text」 —— make it shorter\n'
    + '2. (第 1 段) —— drop this section',
  )
})

// The composer chain's owner props (ComposerChainProps) carry the session's
// single effective `pendingInteraction` (undefined without a session). The
// selector must claim it only for a plan-review question carrier and stay
// silent for generic questions, approvals, and empty chains.
test('selectPlanReview claims only the plan-review pendingInteraction', () => {
  const { selectPlanReview } = loadClientBundle().__testables
  const carrier = wait([planQuestion()])
  assert.equal(selectPlanReview({ sessionId: 's1', session: undefined, pendingInteraction: carrier }), carrier)
  assert.equal(selectPlanReview({ pendingInteraction: undefined }), null)
  assert.equal(selectPlanReview(undefined), null)
  // generic question carrier (kind 'question') is not claimed
  assert.equal(selectPlanReview({ pendingInteraction: wait([planQuestion({ intent: undefined })], 'question') }), null)
  // plan-review discriminator without a narrowable batch is not claimed
  assert.equal(selectPlanReview({ pendingInteraction: wait([], 'plan-review') }), null)
  // other pending-interaction domains (e.g. approvals) are not claimed
  assert.equal(selectPlanReview({ pendingInteraction: { kind: 'approval', key: 'a1' } }), null)
})

// Regression: the plan-review question is single-select, and the shipped
// answer flow keeps a single-select answer item to `selected` or a non-empty
// `custom`, never both. Keep-planning must send selected: [] + custom.
test('decision answers satisfy the single-select XOR rule', () => {
  const { approveAnswer, keepPlanningAnswer } = loadClientBundle().__testables
  const approve = approveAnswer('plan-review', 'Approve')
  assert.deepEqual(approve, { answers: [{ id: 'plan-review', selected: ['Approve'] }] })
  assert.equal(approve.answers[0].custom, undefined)

  const keep = keepPlanningAnswer('plan-review', '计划评审意见（共 1 条）：\n1. …')
  assert.deepEqual(keep.answers.map(({ id }) => id), ['plan-review'])
  const keepItem = keep.answers[0]
  assert.deepEqual(keepItem.selected, [])
  assert.equal(typeof keepItem.custom, 'string')
  assert.ok(keepItem.custom.trim() !== '')
})

// Regression (window popped back after switching sessions): the composer
// entry is session-scoped and remounts on every session switch, so its
// election may only auto-open a NEW carrier key. A same-key re-election
// (session switch away and back) must keep the user's hidden state and
// draft comments; only a re-submitted plan (new key) reopens.
test('electReview auto-opens only a new carrier, keeping a user-hidden window hidden', () => {
  const { electReview } = loadClientBundle().__testables
  const freshStore = () => ({
    wait: null, review: null, open: true, openKey: null, geo: null,
    commentKey: null, comments: [], lastAdded: null, listeners: new Set(),
  })
  const carrier = wait([planQuestion()]) // key 'k1'

  const store = freshStore()
  assert.notEqual(electReview(store, carrier), null)
  assert.equal(store.wait, carrier)
  assert.equal(store.open, true, 'first election opens the window')
  assert.equal(store.openKey, 'k1')

  // user hides the window, drafts a comment
  store.open = false
  store.comments = [{ cid: 'c1', blockIndex: 0, quote: '', text: 'tighten step 2' }]

  // session switch away and back: same carrier re-elected by the remount
  assert.notEqual(electReview(store, carrier), null)
  assert.equal(store.open, false, 'same-key remount must NOT reopen a hidden window')
  assert.equal(store.wait, carrier)
  assert.equal(store.comments.length, 1, 'same-key remount must keep draft comments')

  // model re-submits: a new carrier key reopens with a clean comment list
  const resubmitted = { ...carrier, key: 'k2' }
  assert.notEqual(electReview(store, resubmitted), null)
  assert.equal(store.open, true, 'a new review reopens the window')
  assert.equal(store.openKey, 'k2')
  assert.deepEqual(store.comments, [], 'a new review resets the comment list')

  // a non-review carrier is declined without touching the store
  const untouched = freshStore()
  assert.equal(electReview(untouched, { kind: 'question', key: 'x', questions: [] }), null)
  assert.equal(untouched.wait, null)
  assert.equal(untouched.openKey, null)
})

/** Depth-first walk of the stub element tree, collecting elements whose props match. */
function findAll(node, pred, out = []) {
  if (node === null || typeof node !== 'object') return out
  if (node.stub === 'element') {
    const props = node.args[1] ?? {}
    if (pred(props)) out.push(node)
    for (let i = 2; i < node.args.length; i++) findAll(node.args[i], pred, out)
  } else if (Array.isArray(node)) {
    for (const item of node) findAll(item, pred, out)
  }
  return out
}

// Regression: the window's header "x" used to only flip store.open, leaving
// the review wait pending (composer still taken over, window popping back
// after a session switch). It must DISMISS the review - call the carrier's
// cancel() verb, exactly like the footer "Chat instead" button - so the wait
// settles (ASK_CANCELLED), the pending interaction drops the carrier and the
// composer chain falls back to the input bar.
test('window buttons drive the carrier answer/cancel verbs', async () => {
  const { WindowFrame, approveAnswer, keepPlanningAnswer, store } = loadClientBundle().__testables
  const answered = []
  const cancelled = []
  const carrier = {
    kind: 'plan-review',
    key: 'q:1',
    sessionId: 's1',
    questions: [planQuestion()],
    answer: (a) => { answered.push(a); return Promise.resolve() },
    cancel: () => { cancelled.push(true); return Promise.resolve() },
  }
  const review = {
    id: 'plan-review', question: 'Approve this plan and leave plan mode?',
    plan: '# Title\n\nbody', approveLabel: 'Approve', declineLabel: 'Keep planning',
  }

  // one seeded comment so keep-planning is submittable and quoted in feedback
  store.comments = [{ cid: 'c1', blockIndex: 0, quote: 'body', text: 'tighten step 2' }]
  const tree = WindowFrame({ wait: carrier, review })
  const close = findAll(tree, props => props.className === 'plnwin-close')[0]
  assert.ok(close, 'the header close button must render')
  assert.equal(close.args[1].title, '关闭并转为对话')

  store.open = true
  close.args[1].onClick()
  assert.equal(cancelled.length, 1, 'clicking "x" must cancel the pending review')
  assert.equal(store.open, true, '"x" dismisses the review; it must not merely hide the window')

  // the footer "Chat instead" button shares the same dismiss path
  const discuss = findAll(tree, props => props.className === 'plnwin-btn plnwin-btn-ghost')[0]
  assert.ok(discuss, 'the footer Chat-instead button must render')
  discuss.args[1].onClick()
  assert.equal(cancelled.length, 2, 'the footer button sends the same dismissal')

  // approve answers the review with the approve option selected
  const approve = findAll(tree, props => props.className === 'plnwin-btn plnwin-btn-primary')[0]
  assert.ok(approve, 'the approve button must render')
  approve.args[1].onClick()
  assert.deepEqual(answered, [approveAnswer('plan-review', 'Approve')])

  // keep-planning answers with empty selected + the formatted comment text
  const keep = findAll(tree, props => props.className === 'plnwin-btn plnwin-btn-outline')[0]
  assert.ok(keep, 'the keep-planning button must render')
  keep.args[1].onClick()
  assert.equal(answered.length, 2)
  assert.deepEqual(answered[1], keepPlanningAnswer('plan-review', answered[1].answers[0].custom))
  assert.match(answered[1].answers[0].custom, /tighten step 2/)
  assert.deepEqual(answered[1].answers[0].selected, [])
  await Promise.resolve() // let the settlement callbacks run
})

test('clampGeo keeps the window reachable inside the viewport', () => {
  const { clampGeo } = loadClientBundle().__testables
  // in-viewport geometry passes through untouched
  assert.deepEqual(
    clampGeo({ x: 100, y: 50, w: 760, h: 660 }, 1920, 1080),
    { x: 100, y: 50, w: 760, h: 660 },
  )
  // off-screen position: at least 160x120 stays visible and grabbable
  assert.deepEqual(
    clampGeo({ x: 5000, y: 5000, w: 760, h: 660 }, 1920, 1080),
    { x: 1760, y: 960, w: 760, h: 660 },
  )
  // oversized size shrinks to the viewport; negative position clamps to 0
  assert.deepEqual(
    clampGeo({ x: -5, y: -5, w: 5000, h: 5000 }, 1920, 1080),
    { x: 0, y: 0, w: 1920, h: 1080 },
  )
  // small viewport: size fits it, position keeps the visible region
  assert.deepEqual(
    clampGeo({ x: 900, y: 900, w: 500, h: 500 }, 300, 400),
    { x: 140, y: 280, w: 300, h: 400 },
  )
  // tiny viewport below the floor: w/h keep the 80x60 floor, x/y clamp to 0
  assert.deepEqual(
    clampGeo({ x: 10, y: 10, w: 500, h: 500 }, 50, 40),
    { x: 0, y: 0, w: 80, h: 60 },
  )
})

test('initialGeo centers a viewport-adaptive default', () => {
  const { initialGeo, clampGeo } = loadClientBundle().__testables
  // large viewport: the 920x720 default, centered both axes
  const big = initialGeo(1920, 1080)
  assert.deepEqual(big, { x: 500, y: 180, w: 920, h: 720 })
  assert.deepEqual(big, clampGeo(big, 1920, 1080))
  // smaller viewport: viewport minus 48px margin, still centered
  const small = initialGeo(800, 600)
  assert.deepEqual(small, { x: 24, y: 24, w: 752, h: 552 })
  assert.deepEqual(small, clampGeo(small, 800, 600))
  // narrow viewport: MIN_W/MIN_H floor kicks in before clamping
  assert.deepEqual(initialGeo(520, 450), { x: 20, y: 15, w: 480, h: 420 })
})

// Regression: the shell.overlay container is a z-index:20 stacking context
// that caps everything rendered inside it below the host's menus (100),
// modals (1000) and toasts (1100). The window must escape via a
// document.body portal and stack above the app's top layer (1100).
test('window renders topmost via a body portal', () => {
  const bundle = loadClientBundle()
  // the bundle pulls createPortal from react-dom (stubbed above; an
  // unexpected require would have thrown during evaluation)
  assert.match(clientSrc, /require\('react-dom'\)/)
  assert.match(clientSrc, /createPortal\(frame,\s*document\.body\)/)
  const { CSS } = bundle.__testables
  const m = /\.plnwin-window\{[^}]*z-index:(\d+)/.exec(CSS)
  assert.ok(m, '.plnwin-window rule must set a z-index')
  assert.ok(Number(m[1]) > 1100, `z-index ${m[1]} must beat the host top layer (1100)`)
})

test('host half and package.json shape', async () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.name, 'dsh-plan-window')
  assert.equal(pkg.exports['./client'], './src/client.js')
  assert.deepEqual(pkg.dsh.client, { platform: 'web' })
  const host = await import(new URL('../src/index.js', import.meta.url))
  assert.equal(host.name, 'dsh-plan-window')
  assert.equal(typeof host.apply, 'function')
})
