/**
 * Parser and helper unit tests over real captured fixtures.
 * @module dsh-web-search/tests/parse
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { parseBing } from '../src/parse-bing.js'
import { parseDdg } from '../src/parse-ddg.js'
import { decodeBingUrl, decodeDdgUrl, decodeEntities, cleanText } from '../src/html.js'
import { extractJsonArray } from '../src/backends/opencli.js'

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

test('parseBing extracts and decodes organic results from a real SERP', async () => {
  const html = await readFile(join(fixturesDir, 'bing.html'), 'utf8')
  const sources = parseBing(html, 10)
  assert.ok(sources.length >= 8, `expected >=8 results, got ${sources.length}`)
  for (const source of sources) {
    assert.match(source.url, /^https?:\/\//)
    assert.ok(!source.url.includes('bing.com/ck/'), `un-decoded redirect: ${source.url}`)
    assert.ok(source.title !== undefined && source.title.length > 0)
  }
  // The first organic result for "deepseek harness" is the official page.
  assert.equal(sources[0].url, 'https://www.deepseek.com/harness/en/')
  assert.ok(sources[0].title.includes('DeepSeek Harness'))
})

test('parseBing caps at maxResults and tolerates non-SERP HTML', async () => {
  const html = await readFile(join(fixturesDir, 'bing.html'), 'utf8')
  assert.equal(parseBing(html, 3).length, 3)
  assert.equal(parseBing('<html><body>consent wall</body></html>').length, 0)
})

test('decodeBingUrl handles redirect, direct, and protocol-relative hrefs', () => {
  const redirect = 'https://www.bing.com/ck/a?!&&p=x&u=a1aHR0cHM6Ly93d3cuZGVlcHNlZWsuY29tL2hhcm5lc3MvZW4v&ntb=1'
  assert.equal(decodeBingUrl(redirect), 'https://www.deepseek.com/harness/en/')
  // Entities in the raw attribute value must be decoded first.
  const withEntities = 'https://www.bing.com/ck/a?!&amp;&amp;p=x&amp;u=a1aHR0cHM6Ly9naXRodWIuY29tL2RlZXBzZWVrLWFpL2RlZXBzZWVrLWhhcm5lc3M&amp;ntb=1'
  assert.equal(decodeBingUrl(withEntities), 'https://github.com/deepseek-ai/deepseek-harness')
  assert.equal(decodeBingUrl('https://example.com/direct?x=1&amp;y=2'), 'https://example.com/direct?x=1&y=2')
  assert.equal(decodeBingUrl('//example.com/protocol-relative'), 'https://example.com/protocol-relative')
  // Undecodable payload falls back to the raw redirect rather than crashing.
  const broken = 'https://www.bing.com/ck/a?!&&p=x&u=a1%%%&ntb=1'
  assert.equal(decodeBingUrl(broken), broken)
})

test('decodeDdgUrl extracts uddg and passes direct URLs through', () => {
  const redirect = '//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fa%3Fq%3D1%26z%3D2&rut=abc'
  assert.equal(decodeDdgUrl(redirect), 'https://example.com/a?q=1&z=2')
  assert.equal(decodeDdgUrl('https://plain.example/x'), 'https://plain.example/x')
})

test('parseDdg parses the classic DDG layout, dedupes, and strips markup', async () => {
  const html = await readFile(join(fixturesDir, 'ddg.html'), 'utf8')
  const sources = parseDdg(html)
  assert.equal(sources.length, 4)
  assert.equal(sources[0].url, 'https://deepseek.com/harness/en/')
  assert.ok(sources[0].title.includes('Everything is a plugin'))
  // Snippet pairing stays aligned; embedded tags/entities are cleaned.
  assert.ok(sources[1].snippet.includes('open-source agent harness'))
  assert.ok(!sources[1].snippet.includes('<script>'))
  assert.ok(sources[2].snippet.includes('50+ comments'))
  assert.ok(sources[2].title.includes('Reddit'))
})

test('decodeEntities and cleanText behave on mixed content', () => {
  assert.equal(decodeEntities('a &amp; b &lt;c&gt; &#39;q&#39; &quot;d&quot;'), "a & b <c> 'q' \"d\"")
  assert.equal(decodeEntities('caf&#xe9; &hellip;'), 'café …')
  assert.equal(cleanText('  <b>Hello</b> &amp;   <i>world</i> '), 'Hello & world')
})

test('extractJsonArray skips CLI noise around the payload', () => {
  const noisy = '(node:1) [UNDICI-EHPA] Warning: experimental\n  [\n  {"a":1}\n]\n\n  Update available: v1 -> v2\n  Run: npm install -g x\n'
  assert.deepEqual(extractJsonArray(noisy), [{ a: 1 }])
  assert.throws(() => extractJsonArray('no json here'), /no JSON array/)
})
