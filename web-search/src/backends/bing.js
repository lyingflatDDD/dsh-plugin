/**
 * The keyless Bing backend: plain HTTPS GET of the SERP plus local parsing.
 * Bing is the primary keyless fallback on networks where it is reachable
 * (verified on this machine; DuckDuckGo is IP-challenged here).
 * @module dsh-web-search/backends/bing
 */

import { parseBing } from '../parse-bing.js'

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  + ' (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/** Build the Bing backend. */
export function createBingBackend() {
  return {
    name: 'bing',
    available() {
      return true
    },
    /**
     * Fetch and parse one Bing SERP.
     *
     * @param {object} call - `{query, maxResults, signal, config, io}`.
     * @returns parsed sources (possibly empty; empty = backend failure upstream).
     */
    async search({ query, maxResults, config, io, signal }) {
      const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`
        + `&count=${Math.min(Math.max(maxResults ?? 10, 1), 30)}`
      const { status, body } = await io.request(url, {
        headers: {
          'user-agent': BROWSER_UA,
          'accept': 'text/html,application/xhtml+xml',
          'accept-language': 'en-US,en;q=0.9,zh-CN;q=0.8',
        },
        timeoutMs: config.httpTimeoutMs ?? 8000,
        ...signal !== undefined ? { signal } : {},
      })
      if (status < 200 || status >= 300) throw new Error(`bing HTTP ${status}`)
      return parseBing(body, maxResults)
    },
  }
}
