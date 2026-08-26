/**
 * Unit tests for the GUI settings layering (`web-search-settings.js`).
 * @module dsh-web-search/web-search-settings.test
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULTS, mergeConfig } from '../src/config.js'
import { composeEffectiveConfig } from '../src/web-search-settings.js'

test('composeEffectiveConfig: no user layer keeps the file config', () => {
  const file = mergeConfig({ order: ['tavily'], httpTimeoutMs: 5000 })
  assert.equal(composeEffectiveConfig(file, undefined), file)
})

test('composeEffectiveConfig: user layer wins over the file, per field', () => {
  const file = mergeConfig({ tavilyApiKey: 'file-key', opencliLang: 'zh' })
  const out = composeEffectiveConfig(file, { tavilyApiKey: 'gui-key' })
  assert.equal(out.tavilyApiKey, 'gui-key')
  assert.equal(out.opencliLang, 'zh')
})

test('composeEffectiveConfig: user layer is normalized (unknown order entries dropped)', () => {
  const file = mergeConfig({})
  const out = composeEffectiveConfig(file, { order: ['tavily', 'nonsense', 'brave'] })
  assert.deepEqual(out.order, ['tavily', 'brave'])
})

test('composeEffectiveConfig: user layer with no order still carries the file order', () => {
  const file = mergeConfig({ order: ['bing'] })
  const out = composeEffectiveConfig(file, { searxngBaseUrl: 'https://sx.example' })
  assert.deepEqual(out.order, ['bing'])
  assert.equal(out.searxngBaseUrl, 'https://sx.example')
})

test('composeEffectiveConfig: cleared user field falls back to the file value', () => {
  const file = mergeConfig({ braveApiKey: 'file-key' })
  const withKey = composeEffectiveConfig(file, { braveApiKey: 'gui-key' })
  assert.equal(withKey.braveApiKey, 'gui-key')
  const afterClear = composeEffectiveConfig(file, {})
  assert.equal(afterClear.braveApiKey, 'file-key')
})

test('composeEffectiveConfig: defaults still apply for untouched fields', () => {
  const file = mergeConfig({})
  const out = composeEffectiveConfig(file, { opencliLang: 'zh' })
  assert.equal(out.opencliTimeoutMs, DEFAULTS.opencliTimeoutMs)
  assert.equal(out.httpTimeoutMs, DEFAULTS.httpTimeoutMs)
})