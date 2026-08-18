/**
 * The opencli backend: real Google results through the local `opencli` tool
 * driving the user's logged-in Chrome in a background window (the "headless
 * opencli" mode). stdout carries noise (node warnings, update notices), so the
 * JSON array is extracted by bracket scan before parsing.
 * @module dsh-web-search/backends/opencli
 */

/**
 * Extract the first parseable JSON array from noisy CLI output: node warnings
 * and update notices wrap the payload, and bracket characters inside the noise
 * must not be mistaken for the array. Candidates are every `[` paired with the
 * final `]`; the first slice that parses as an array wins.
 *
 * @param {string} text - raw stdout.
 * @returns the parsed array.
 * @throws when no parseable array is present.
 */
export function extractJsonArray(text) {
  const body = String(text)
  const end = body.lastIndexOf(']')
  if (end < 0) throw new Error('no JSON array in output')
  let start = -1
  while ((start = body.indexOf('[', start + 1)) !== -1 && start < end) {
    let parsed
    try {
      parsed = JSON.parse(body.slice(start, end + 1))
    } catch {
      continue
    }
    if (Array.isArray(parsed)) return parsed
  }
  throw new Error('no JSON array in output')
}

/**
 * Build the opencli backend.
 *
 * @param {object} [deps] - optional `{clean}` text cleaner (tests).
 * @returns the backend object: `{name, available, search}`.
 */
export function createOpencliBackend(deps = {}) {
  const clean = deps.clean ?? (text => text)
  return {
    name: 'opencli',
    available() {
      return true
    },
  /**
   * Run `opencli google search <query> --window background -f json`.
   *
   * @param {object} call - `{query, maxResults, signal, config, io}`.
   * @returns sources mapped from opencli's `{type,title,url,snippet}` rows.
   */
    async search({ query, maxResults, config, io }) {
      const limit = Math.min(Math.max(maxResults ?? 10, 1), 20)
      const bin = config.opencliBin || 'opencli'
      const argv = [
        bin, 'google', 'search', query,
        '--window', 'background',
        '-f', 'json',
        '--limit', String(limit),
        ...config.opencliLang ? ['--lang', config.opencliLang] : [],
      ]
      const { code, stdout, stderr } = await io.runCapture(argv, config.opencliTimeoutMs ?? 18000)
      if (code !== 0) {
        const detail = String(stderr ?? '').split('\n').filter(l => l.length > 0).slice(-2).join(' ')
        throw new Error(`opencli exited ${code}${detail.length > 0 ? `: ${detail}` : ''}`)
      }
      const items = extractJsonArray(stdout)
      const sources = []
      const seen = new Set()
      for (const item of items) {
        if (item === null || typeof item !== 'object') continue
        if (item.type !== undefined && item.type !== 'result') continue
        const url = typeof item.url === 'string' ? item.url : ''
        if (url.length === 0 || seen.has(url)) continue
        seen.add(url)
        sources.push({
          url,
          ...typeof item.title === 'string' && item.title.length > 0
            ? { title: clean(item.title) }
            : {},
          ...typeof item.snippet === 'string' && item.snippet.length > 0
            ? { snippet: clean(item.snippet) }
            : {},
        })
      }
      return sources
    },
  }
}
