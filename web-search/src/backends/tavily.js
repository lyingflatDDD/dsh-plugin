/**
 * The Tavily search API backend (requires `tavilyApiKey` in
 * `~/.dsh/web-search.json`). Endpoint: `api.tavily.com/search`, Bearer auth.
 * @module dsh-web-search/backends/tavily
 */

/** Build the Tavily backend. */
export function createTavilyBackend() {
  return {
    name: 'tavily',
    available(config) {
      return typeof config.tavilyApiKey === 'string' && config.tavilyApiKey.length > 0
    },
    /**
     * POST one search to Tavily.
     *
     * @param {object} call - `{query, maxResults, signal, config, io}`.
     * @returns mapped sources.
     */
    async search({ query, maxResults, config, io, signal }) {
      const url = 'https://api.tavily.com/search'
      const maxResults2 = Math.min(Math.max(maxResults ?? 10, 1), 20)
      const { status, body } = await io.request(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${config.tavilyApiKey}`,
        },
        body: JSON.stringify({
          query,
          max_results: maxResults2,
          search_depth: 'basic',
          include_answer: false,
        }),
        timeoutMs: config.httpTimeoutMs ?? 8000,
        ...signal !== undefined ? { signal } : {},
      })
      if (status < 200 || status >= 300) throw new Error(`tavily HTTP ${status}`)
      const parsed = JSON.parse(body)
      const results = Array.isArray(parsed?.results) ? parsed.results : []
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
          ...typeof item.content === 'string' && item.content.length > 0
            ? { snippet: item.content }
            : {},
        })
      }
      return sources
    },
  }
}
