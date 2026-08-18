/**
 * The SearXNG backend over a configured instance's JSON API. Only available
 * when `searxngBaseUrl` is set in `~/.dsh/web-search.json`; self-hosted
 * instances (or any instance that permits `format=json`) work. Public
 * instances mostly rate-limit or anti-bot JSON responses (verified), so this
 * is an opt-in backend.
 * @module dsh-web-search/backends/searxng
 */

/** Build the SearXNG backend. */
export function createSearxngBackend() {
  return {
    name: 'searxng',
    available(config) {
      return typeof config.searxngBaseUrl === 'string' && config.searxngBaseUrl.length > 0
    },
    /**
     * Query the instance's JSON search endpoint.
     *
     * @param {object} call - `{query, maxResults, signal, config, io}`.
     * @returns mapped sources.
     */
    async search({ query, maxResults, config, io, signal }) {
      const base = String(config.searxngBaseUrl).replace(/\/+$/, '')
      const url = `${base}/search?q=${encodeURIComponent(query)}&format=json`
      const { status, body } = await io.request(url, {
        headers: { accept: 'application/json' },
        timeoutMs: config.httpTimeoutMs ?? 8000,
        ...signal !== undefined ? { signal } : {},
      })
      if (status < 200 || status >= 300) throw new Error(`searxng HTTP ${status}`)
      const parsed = JSON.parse(body)
      const results = Array.isArray(parsed?.results) ? parsed.results : []
      const seen = new Set()
      const sources = []
      for (const item of results) {
        if (item === null || typeof item !== 'object') continue
        const url2 = typeof item.url === 'string' ? item.url : ''
        if (url2.length === 0 || seen.has(url2)) continue
        seen.add(url2)
        sources.push({
          url: url2,
          ...typeof item.title === 'string' && item.title.length > 0 ? { title: item.title } : {},
          ...typeof item.content === 'string' && item.content.length > 0 ? { snippet: item.content } : {},
          ...typeof item.publishedDate === 'string' && item.publishedDate.length > 0
            ? { publishedAt: item.publishedDate }
            : {},
        })
      }
      return sources
    },
  }
}
