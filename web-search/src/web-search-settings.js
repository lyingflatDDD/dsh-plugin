/**
 * GUI-editable settings namespace for `dsh-web-search`.
 *
 * The plugin registers a `web-search` namespace on the Host `settings` seam
 * (persisted in `~/.dsh/settings.yaml`). The DSH web GUI's
 * 设置 → 插件 → 可配置 surface renders a card for any served namespace that
 * claims a `settings.plugin.item` card (the browser half in `../client.js`),
 * so the search chain's configuration — backend order, SearXNG base URL,
 * Brave/Tavily keys, timeouts — becomes editable in the GUI without touching
 * `~/.dsh/web-search.json` by hand.
 *
 * Layering (per search, live):
 *   schema defaults (code) < `~/.dsh/web-search.json` (file) < GUI user layer
 * The file keeps working as the lower layer; a GUI write wins over it, and
 * clearing a GUI field (unset) falls back to the file again.
 *
 * The Host packages are loaded through `../host-deps.js` so this plugin stays
 * zero-dependency and works whether it is mounted via `file://` or as a
 * profile package.
 * @module dsh-web-search/web-search-settings
 */

import { mergeConfig, KNOWN_BACKENDS, DEFAULTS } from './config.js'
import { importHostDep } from './host-deps.js'

/** Settings namespace of the search chain. */
export const SETTINGS_NS = 'web-search'

/** Whether the settings seam is absent — the plugin keeps the file-only path. */
let settingsAvailable = true

/**
 * The currently authoritative merge order, per search:
 * `{ ...DEFAULTS, ...fileConfig, ...userLayer }`. `userLayer` is undefined
 * until the GUI has written anything.
 * @param {object} fileConfig - normalized `~/.dsh/web-search.json` values.
 * @param {object | undefined} userLayer - raw GUI-written user section.
 * @returns the effective config for one search.
 */
export function composeEffectiveConfig(fileConfig, userLayer) {
  if (userLayer === undefined) return fileConfig
  return mergeConfig({ ...fileConfig, ...userLayer })
}

/**
 * Install the `web-search` settings namespace when the seam is present.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} options
 * @param {object} options.entry - the plugin row's composition config (usually {}).
 * @param {object} options.fileConfig - normalized `~/.dsh/web-search.json` values.
 * @param {(userLayer: object | undefined) => void} [options.onUserLayer] - callback
 *   receiving the raw user section whenever it changes; the plugin uses it to
 *   route search-time resolution through {@link composeEffectiveConfig}.
 * @returns a promise resolving to `false` when the settings seam is absent or
 *   the Host packages cannot be loaded (the plugin keeps file-only behavior).
 */
export async function installWebSearchSettings(ctx, { entry, fileConfig, onUserLayer }) {
  let dshSettings
  let z
  try {
    ;[dshSettings, z] = await Promise.all([
      importHostDep('@deepseek-ai/dsh-settings'),
      importHostDep('@deepseek-ai/schemastery').then(module => module.default),
    ])
  } catch (error) {
    console.warn(`[dsh-web-search] settings surface unavailable: ${error.message}`)
    return false
  }
  const { settingsNamespace } = dshSettings

  const Config = z.object({
    order: z.array(z.string()).default([...KNOWN_BACKENDS]),
    searxngBaseUrl: z.string(),
    braveApiKey: z.string().role('secret'),
    tavilyApiKey: z.string().role('secret'),
    opencliBin: z.string().default(DEFAULTS.opencliBin),
    opencliLang: z.string(),
    opencliTimeoutMs: z.number().min(1000).max(120000).default(DEFAULTS.opencliTimeoutMs),
    httpTimeoutMs: z.number().min(1000).max(120000).default(DEFAULTS.httpTimeoutMs),
  })

  // The namespace's composition `base` = normalized file values, so the form
  // shows today's effective file config with GUI writes marked as overrides.
  const base = mergeConfig({ ...fileConfig, ...entry })

  ctx.inject(['settings'], (sctx) => {
    settingsAvailable = true
    const scope = sctx.settings.register(settingsNamespace(SETTINGS_NS), Config, { base })
    const readUserLayer = () => {
      const descriptor = sctx.settings.describe({ redactSecrets: false })
        .find(candidate => candidate.ns === SETTINGS_NS)
      onUserLayer(descriptor?.user)
    }
    readUserLayer()
    scope.watch(() => readUserLayer())
  })

  return true
}

/** Whether any settings-capable wiring was attempted at all (diagnostics). */
export function isSettingsAvailable() {
  return settingsAvailable
}