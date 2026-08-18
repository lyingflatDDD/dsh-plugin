/**
 * Bing SERP parser (keyless). Splits the page on `<li class="b_algo"` organic
 * result blocks; each block's title anchor lives inside an `<h2>` and links
 * through a `bing.com/ck/a` redirect recovered by {@link decodeBingUrl}. The
 * snippet is the first `b_lineclamp` paragraph (Bing's current caption shape).
 * A layout change yields zero results, which the chain treats as a backend
 * failure and falls through - never fabricated results.
 * @module dsh-web-search/parse-bing
 */

import { cleanText, decodeBingUrl } from './html.js'

/** One organic block anchor: href + inner markup of the h2 title link. */
const TITLE_ANCHOR = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i

/** Current Bing snippet paragraph; legacy fallback uses any caption paragraph. */
const SNIPPET_LINECLAMP = /<p[^>]*class="b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/i
const SNIPPET_CAPTION = /<div[^>]*class="b_caption[^"]*"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i

/**
 * Parse a Bing results page into seam sources.
 *
 * @param {string} html - the SERP HTML body.
 * @param {number} [maxResults] - optional cap applied while collecting.
 * @returns deduped `{url,title,snippet?}` sources (possibly empty).
 */
export function parseBing(html, maxResults) {
  const limit = maxResults === undefined ? Number.POSITIVE_INFINITY : Math.max(1, maxResults)
  const chunks = String(html).split(/<li[^>]+class="b_algo[^"]*"/).slice(1)
  const seen = new Set()
  const sources = []
  for (const chunk of chunks) {
    if (sources.length >= limit) break
    const anchor = TITLE_ANCHOR.exec(chunk)
    if (anchor === null) continue
    const url = decodeBingUrl(anchor[1])
    if (url.length === 0 || seen.has(url)) continue
    // Skip Bing-internal destinations that survived a failed redirect decode.
    if (/^https?:\/\/www\.bing\.com\/ck\//i.test(url)) continue
    seen.add(url)
    const title = cleanText(anchor[2])
    const snippetMatch = SNIPPET_LINECLAMP.exec(chunk) ?? SNIPPET_CAPTION.exec(chunk)
    const snippet = snippetMatch === null ? undefined : cleanText(snippetMatch[1])
    sources.push({
      url,
      ...title.length > 0 ? { title } : {},
      ...snippet !== undefined && snippet.length > 0 ? { snippet } : {},
    })
  }
  return sources
}
