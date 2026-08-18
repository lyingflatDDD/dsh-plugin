/**
 * Configuration for the search chain, read from `~/.dsh/web-search.json`
 * (mirrors pi-web-access's `~/.pi/web-search.json` convention). The file is
 * optional; every field has a default, and invalid values fall back rather
 * than break the chain.
 * @module dsh-web-search/config
 */

/** Backend names the chain knows. */
export const KNOWN_BACKENDS = ['opencli', 'bing', 'ddg', 'searxng', 'brave', 'tavily']

/** Defaults used when the config file is absent or a field is invalid. */
export const DEFAULTS = {
  order: ['opencli', 'bing', 'ddg', 'searxng', 'brave', 'tavily'],
  searxngBaseUrl: '',
  braveApiKey: '',
  tavilyApiKey: '',
  opencliBin: 'opencli',
  opencliLang: '',
  opencliTimeoutMs: 18000,
  httpTimeoutMs: 8000,
}

/**
 * Validate/merge one parsed config object over {@link DEFAULTS}.
 * Unknown order entries are dropped; a fully-invalid order falls back to the
 * default order. Timeouts are clamped to sane positive bounds.
 *
 * @param {unknown} raw - parsed JSON value (may be anything).
 * @returns a normalized config object.
 */
export function mergeConfig(raw) {
  const config = { ...DEFAULTS }
  if (raw === null || typeof raw !== 'object') return config
  const input = raw

  if (Array.isArray(input.order)) {
    const order = input.order.filter(name => typeof name === 'string' && KNOWN_BACKENDS.includes(name))
    if (order.length > 0) config.order = order
  }
  for (const key of ['searxngBaseUrl', 'braveApiKey', 'tavilyApiKey', 'opencliBin', 'opencliLang']) {
    const value = input[key]
    if (typeof value === 'string' && value.length > 0) config[key] = value
  }
  for (const key of ['opencliTimeoutMs', 'httpTimeoutMs']) {
    const value = input[key]
    if (typeof value === 'number' && Number.isFinite(value) && value >= 1000 && value <= 120000) {
      config[key] = Math.floor(value)
    }
  }
  return config
}

/**
 * Load and normalize `~/.dsh/web-search.json` using Node's fs. Any failure
 * (missing file, unreadable, invalid JSON) yields the defaults.
 *
 * @param {(path: string) => Promise<string>} readText - injected text reader
 *   (keeps this module testable and lets the dynamic plugin substitute its own).
 * @param {string} homeDir - the user's home directory.
 * @returns the normalized config.
 */
export async function loadConfigFile(readText, homeDir) {
  try {
    const text = await readText(`${homeDir}/.dsh/web-search.json`)
    return mergeConfig(JSON.parse(text))
  } catch {
    return { ...DEFAULTS }
  }
}
