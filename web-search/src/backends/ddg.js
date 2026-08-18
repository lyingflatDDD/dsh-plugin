/**
 * The keyless DuckDuckGo backend over `html.duckduckgo.com/html/`. On networks
 * where DDG serves an anomaly/challenge page (HTTP 202 on this machine) the
 * parse yields zero results and the chain falls through to the next backend.
 * @module dsh-web-search/backends/ddg
 */

import { parseDdg } from '../parse-ddg.js'

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  + ' (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

/** Build the DuckDuckGo backend. */
export function createDdgBackend() {
  return {
    name: 'ddg',
    available() {
      return true
    },
    /**
     * Fetch and parse one DuckDuckGo HTML results page.
     *
     * @param {object} call - `{query, maxResults, signal, config, io}`.
     * @returns parsed sources (possibly empty; empty = backend failure upstream).
     */
    async search({ query, maxResults, config, io, signal }) {
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
      const { status, body } = await io.request(url, {
        headers: {
          'user-agent': BROWSER_UA,
          'accept': 'text/html',
          'accept-language': 'en-US,en;q=0.9',
        },
        timeoutMs: config.httpTimeoutMs ?? 8000,
        ...signal !== undefined ? { signal } : {},
      })
      if (status < 200 || status >= 300) throw new Error(`ddg HTTP ${status} (challenge?)`)
      return parseDdg(body, maxResults)
    },
  }
}
