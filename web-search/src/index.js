/**
 * `dsh-web-search`: register the `web-search-multi` chain provider into the
 * host `web` seam (`ctx.web`). Zero-dependency ESM; no service of its own is
 * published, so a preset row needs no isolate realm. Configuration lives in
 * `~/.dsh/web-search.json` (see README) and is re-read per search.
 *
 * Mount permanently from a preset row:
 *   - id: web-search
 *     name: /home/cxiao/code/dsh-plugin/web-search/src/index.js
 * @module dsh-web-search
 */

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { loadConfigFile } from './config.js'
import { createChainProvider } from './chain.js'
import { createNodeIo } from './io-node.js'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-web-search'

/** Read `~/.dsh/web-search.json` (or defaults) for each search. */
async function resolveConfig() {
  return loadConfigFile(
    path => readFile(path, 'utf8'),
    homedir(),
  )
}

/**
 * Register the chain provider with `ctx.web` when the seam is present.
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 */
export function apply(ctx) {
  const web = ctx.get('web')
  if (web === undefined) {
    console.error('[dsh-web-search] web service unavailable; plugin idle')
    return
  }
  const provider = createChainProvider({
    resolveConfig,
    io: createNodeIo(),
    log: message => console.log(`[dsh-web-search] ${message}`),
  })
  ctx.effect(() => {
    const unregister = web.registerSearchProvider(provider)
    console.log('[dsh-web-search] registered web-search-multi'
      + ' (chain: opencli -> bing -> ddg -> searxng -> brave -> tavily, configurable)')
    return () => {
      unregister()
    }
  }, 'dsh-web-search provider registration')
}
