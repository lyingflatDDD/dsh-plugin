/**
 * Chain behavior tests with fake io/backends: fallback, all-fail aggregation,
 * maxResults caps, config gating, and abort responsiveness.
 * @module dsh-web-search/tests/chain
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { createChainProvider, PROVIDER_ID } from '../src/chain.js'
import { mergeConfig, DEFAULTS } from '../src/config.js'

/** Build a chain over scripted backends; each entry: {name, results?, error?, empty?}. */
function chainWith(scripts, { config = mergeConfig(undefined) } = {}) {
  const log = []
  const backends = scripts.map(script => ({
    name: script.name,
    available: () => script.available !== false,
    async search() {
      if (script.error !== undefined) throw new Error(script.error)
      return script.results ?? []
    },
  }))
  const provider = createChainProvider({
    resolveConfig: async () => config,
    io: {},
    backends,
    log: message => log.push(message),
  })
  return { provider, log }
}

test('chain falls through backend failures to the first working backend', async () => {
  const { provider } = chainWith([
    { name: 'opencli', error: 'bridge down' },
    { name: 'bing', results: [{ url: 'https://a.example', title: 'A' }] },
    { name: 'ddg', results: [{ url: 'https://b.example', title: 'B' }] },
  ])
  const result = await provider.search({ query: 'q' })
  assert.equal(result.sources.length, 1)
  assert.equal(result.sources[0].url, 'https://a.example')
  assert.equal(result.truncated, false)
})

test('zero parsed results counts as a backend failure and falls through', async () => {
  const { provider } = chainWith([
    { name: 'opencli', results: [] },
    { name: 'bing', results: [] },
    { name: 'ddg', results: [{ url: 'https://x.example' }] },
  ])
  const result = await provider.search({ query: 'q' })
  assert.equal(result.sources[0].url, 'https://x.example')
})

test('all-fail throws an aggregated WEB_PROVIDER_ERROR naming each backend', async () => {
  const { provider } = chainWith([
    { name: 'opencli', error: 'spawn ENOENT' },
    { name: 'bing', error: 'HTTP 202' },
  ])
  await assert.rejects(
    () => provider.search({ query: 'q' }),
    error => {
      assert.equal(error.code, 'WEB_PROVIDER_ERROR')
      assert.match(error.message, /opencli: spawn ENOENT/)
      assert.match(error.message, /bing: HTTP 202/)
      return true
    },
  )
})

test('chain respects maxResults and dedupes provider rows', async () => {
  const { provider } = chainWith([
    {
      name: 'opencli',
      results: [
        { url: 'https://a.example' },
        { url: 'https://a.example' },
        { url: 'https://b.example' },
        { url: 'https://c.example' },
      ],
    },
  ])
  const result = await provider.search({ query: 'q', maxResults: 2 })
  assert.deepEqual(result.sources.map(s => s.url), ['https://a.example', 'https://b.example'])
  assert.equal(result.truncated, false)
})

test('config order reorders and unknown entries are dropped by mergeConfig', async () => {
  const config = mergeConfig({ order: ['tavily', 'nope', 'ddg'] })
  assert.deepEqual(config.order, ['tavily', 'ddg'])
  const { provider } = chainWith([
    { name: 'opencli', results: [{ url: 'https://first.example' }] },
    { name: 'ddg', results: [{ url: 'https://ddg.example' }] },
    { name: 'tavily', results: [{ url: 'https://tavily.example' }] },
  ], { config })
  const result = await provider.search({ query: 'q' })
  assert.equal(result.sources[0].url, 'https://tavily.example')
})

test('mergeConfig falls back to defaults on invalid input', () => {
  assert.deepEqual(mergeConfig(null), DEFAULTS)
  assert.deepEqual(mergeConfig('junk'), DEFAULTS)
  assert.deepEqual(mergeConfig({ order: [] }).order, DEFAULTS.order)
  assert.equal(mergeConfig({ httpTimeoutMs: 5 }).httpTimeoutMs, DEFAULTS.httpTimeoutMs)
  const merged = mergeConfig({
    searxngBaseUrl: 'http://localhost:8888/',
    braveApiKey: 'k',
    opencliTimeoutMs: 20000,
  })
  assert.equal(merged.searxngBaseUrl, 'http://localhost:8888/')
  assert.equal(merged.braveApiKey, 'k')
  assert.equal(merged.opencliTimeoutMs, 20000)
})

test('provider aborts before starting any backend when the signal is set', async () => {
  const { provider } = chainWith([{ name: 'opencli', results: [{ url: 'https://a.example' }] }])
  const controller = new AbortController()
  controller.abort(new Error('user cancelled'))
  await assert.rejects(
    () => provider.search({ query: 'q' }, controller.signal),
    error => error.code === 'WEB_ABORTED',
  )
})

test('provider id and availability', () => {
  const { provider } = chainWith([])
  assert.equal(provider.id, PROVIDER_ID)
  assert.equal(provider.available(), true)
})
