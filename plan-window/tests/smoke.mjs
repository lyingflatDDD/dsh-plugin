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
  const require_ = (id) => {
    if (id === 'react') return reactStub
    throw new Error(`unexpected require: ${id}`)
  }
  return loaded.factory(require_)
}

const wait = (questions) => ({ kind: 'question', key: 'k1', sessionId: 's1', payload: { questions } })

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
  assert.equal(asPlanReview({ payload: {} }), null)
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

// Regression: the plan-review question is single-select, and apiproxy's
// matchesQuestions rejects an answer item carrying BOTH selected and custom
// as `bad-response`. Keep-planning must send selected: [] + custom.
test('decision payloads satisfy the single-select XOR wire rule', () => {
  const { approvePayload, keepPlanningPayload } = loadClientBundle().__testables
  const approve = approvePayload('s1', 'plan-review', 'Approve')
  assert.deepEqual(approve, {
    ok: true,
    value: { sessionId: 's1', answer: { answers: [{ id: 'plan-review', selected: ['Approve'] }] } },
  })
  assert.equal(approve.value.answer.answers[0].custom, undefined)

  const keep = keepPlanningPayload('s1', 'plan-review', '计划评审意见（共 1 条）：\n1. …')
  const keepItem = keep.value.answer.answers[0]
  assert.equal(keep.ok, true)
  assert.equal(keep.value.sessionId, 's1')
  assert.equal(keepItem.id, 'plan-review')
  assert.deepEqual(keepItem.selected, [])
  assert.equal(typeof keepItem.custom, 'string')
  assert.ok(keepItem.custom.trim() !== '')
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

test('host half and package.json shape', async () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(pkg.name, 'dsh-plan-window')
  assert.equal(pkg.exports['./client'], './src/client.js')
  assert.deepEqual(pkg.dsh.client, { platform: 'web' })
  const host = await import(new URL('../src/index.js', import.meta.url))
  assert.equal(host.name, 'dsh-plan-window')
  assert.equal(typeof host.apply, 'function')
})
