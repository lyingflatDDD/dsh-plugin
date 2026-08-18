/**
 * DuckDuckGo HTML (html.duckduckgo.com) parser (keyless). The endpoint emits a
 * stable classic layout: `a.result__a` title links (sometimes behind a
 * `duckduckgo.com/l/?uddg=<encoded>` redirect) paired in order with
 * `a.result__snippet` blocks.
 * @module dsh-web-search/parse-ddg
 */

import { cleanText, decodeDdgUrl } from './html.js'

const TITLE_ANCHOR = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
const SNIPPET_ANCHOR = /<a[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi

/**
 * Parse a DuckDuckGo HTML results page into seam sources.
 *
 * @param {string} html - the results HTML body.
 * @param {number} [maxResults] - optional cap applied while collecting.
 * @returns deduped `{url,title,snippet?}` sources (possibly empty).
 */
export function parseDdg(html, maxResults) {
  const limit = maxResults === undefined ? Number.POSITIVE_INFINITY : Math.max(1, maxResults)
  const body = String(html)
  const snippets = []
  for (const match of body.matchAll(SNIPPET_ANCHOR)) snippets.push(cleanText(match[1]))

  const seen = new Set()
  const sources = []
  let index = 0
  for (const match of body.matchAll(TITLE_ANCHOR)) {
    if (sources.length >= limit) break
    const url = decodeDdgUrl(match[1])
    index += 1
    if (url.length === 0 || seen.has(url)) continue
    // Skip DDG's own redirect targets that failed to decode.
    if (/^https?:\/\/duckduckgo\.com\/l\//i.test(url)) continue
    seen.add(url)
    const title = cleanText(match[2])
    const snippet = snippets[index - 1]
    sources.push({
      url,
      ...title.length > 0 ? { title } : {},
      ...snippet !== undefined && snippet.length > 0 ? { snippet } : {},
    })
  }
  return sources
}
