/**
 * `dsh-web-search`: register the `web-search-multi` chain provider into the
 * host `web` seam (`ctx.web`). Zero-dependency ESM; no service of its own is
 * published, so a preset row needs no isolate realm.
 *
 * Configuration sources, layered per search:
 *   1. schema defaults in code
 *   2. `~/.dsh/web-search.json` (see README; re-read per search)
 *   3. the `web-search` settings namespace — editable from the DSH web GUI
 *      (设置 → 插件 → 可配置). Cleared GUI fields fall back to the file again.
 *
 * Mount permanently from `~/.dsh/cordis.patch.yml`:
 *   - id: web-search
 *     name: dsh-web-search
 * (installed via `dsh plugin --profile web add link:<this repo>` so the
 * browser half in `client.js` is discovered and served).
 * @module dsh-web-search
 */

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { loadConfigFile } from './config.js'
import { createChainProvider } from './chain.js'
import { createNodeIo } from './io-node.js'
import { installWebSearchSettings, composeEffectiveConfig } from './web-search-settings.js'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-web-search'

/** Read `~/.dsh/web-search.json` (or defaults) for each search. */
async function readFileConfig() {
  return loadConfigFile(
    path => readFile(path, 'utf8'),
    homedir(),
  )
}

/**
 * Register the chain provider with `ctx.web` when the seam is present, and
 * optionally expose its configuration through the Host settings seam.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 * @param {object} config - composition entry config (usually empty).
 */
export function apply(ctx, config = {}) {
  const web = ctx.get('web')
  if (web === undefined) {
    console.error('[dsh-web-search] web service unavailable; plugin idle')
    return
  }

  // GUI-editable settings namespace (best-effort): the user layer, once the
  // GUI writes anything, becomes the top precedence layer over the file.
  let userLayer
  const fileConfigPromise = readFileConfig()
  void (async () => {
    try {
      const fileConfig = await fileConfigPromise
      await installWebSearchSettings(ctx, {
        entry: config,
        fileConfig,
        onUserLayer: layer => {
          userLayer = layer
        },
      })
    } catch (error) {
      console.warn(`[dsh-web-search] settings surface failed to install: ${error.message}`)
    }
  })()

  const provider = createChainProvider({
    resolveConfig: async () => {
      const fileConfig = await readFileConfig()
      if (userLayer === undefined) return fileConfig
      return composeEffectiveConfig(fileConfig, userLayer)
    },
    io: createNodeIo(),
    log: message => console.log(`[dsh-web-search] ${message}`),
  })
  ctx.effect(() => {
    const unregister = web.registerSearchProvider(provider)
    console.log('[dsh-web-search] registered web-search-multi'
      + ' (chain: opencli -> bing -> ddg -> searxng -> brave -> tavily;'
      + ' GUI configurable in Settings → Plugins → Configurable)')
    return () => {
      unregister()
    }
  }, 'dsh-web-search provider registration')
}