/**
 * The Brave Search API backend (requires `braveApiKey` in
 * `~/.dsh/web-search.json`). Endpoint: `api.search.brave.com/res/v1/web/search`.
 * @module dsh-web-search/backends/brave
 */

/** Build the Brave backend. */
export function createBraveBackend() {
  return {
    name: 'brave',
    available(config) {
      return typeof config.braveApiKey === 'string' && config.braveApiKey.length > 0
    },
    /**
     * Query the Brave web-search endpoint.
     *
     * @param {object} call - `{query, maxResults, signal, config, io}`.
     * @returns mapped sources.
     */
    async search({ query, maxResults, config, io, signal }) {
      const count = Math.min(Math.max(maxResults ?? 10, 1), 20)
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`
      const { status, body } = await io.request(url, {
        headers: {
          accept: 'application/json',
          'x-subscription-token': config.braveApiKey,
        },
        timeoutMs: config.httpTimeoutMs ?? 8000,
        ...signal !== undefined ? { signal } : {},
      })
      if (status < 200 || status >= 300) throw new Error(`brave HTTP ${status}`)
      const parsed = JSON.parse(body)
      const results = Array.isArray(parsed?.web?.results) ? parsed.web.results : []
      const seen = new Set()
      const sources = []
      for (const item of results) {
        if (item === null || typeof item !== 'object') continue
        const itemUrl = typeof item.url === 'string' ? item.url : ''
        if (itemUrl.length === 0 || seen.has(itemUrl)) continue
        seen.add(itemUrl)
        sources.push({
          url: itemUrl,
          ...typeof item.title === 'string' && item.title.length > 0 ? { title: item.title } : {},
          ...typeof item.description === 'string' && item.description.length > 0
            ? { snippet: item.description }
            : {},
          ...typeof item.age === 'string' && item.age.length > 0 ? { publishedAt: item.age } : {},
        })
      }
      return sources
    },
  }
}
