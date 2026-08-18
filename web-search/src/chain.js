/**
 * The chain provider (id `web-search-multi`): one registered WebSearchProvider
 * that tries backends in configured order and falls through on failure or
 * zero-result parses - the pi-web-access "auto" mode over DSH's web seam.
 * Zero results from every backend throws an aggregated error; the provider
 * never fabricates results.
 * @module dsh-web-search/chain
 */

import { createOpencliBackend } from './backends/opencli.js'
import { createBingBackend } from './backends/bing.js'
import { createDdgBackend } from './backends/ddg.js'
import { createSearxngBackend } from './backends/searxng.js'
import { createBraveBackend } from './backends/brave.js'
import { createTavilyBackend } from './backends/tavily.js'
import { cleanText } from './html.js'

/** Stable provider id registered under `ctx.web`. */
export const PROVIDER_ID = 'web-search-multi'

/** Default backend factory order (config may reorder). */
export function createDefaultBackends() {
  return [
    createOpencliBackend({ clean: cleanText }),
    createBingBackend(),
    createDdgBackend(),
    createSearxngBackend(),
    createBraveBackend(),
    createTavilyBackend(),
  ]
}

/** The abort error shape the seam expects (code on a plain Error). */
function abortError(signal) {
  const error = new Error('web search aborted')
  error.code = 'WEB_ABORTED'
  error.cause = signal?.aborted === true ? signal.reason : undefined
  return error
}

/** Truncate to maxResults like the seam does (belt-and-braces). */
function capSources(sources, maxResults) {
  if (maxResults === undefined || sources.length <= maxResults) return sources
  return sources.slice(0, maxResults)
}

/**
 * Build the chain provider.
 *
 * @param {object} options
 * @param {() => Promise<object>} options.resolveConfig - normalized config per search.
 * @param {object} options.io - `{request, runCapture}` transport adapters.
 * @param {Array} [options.backends] - backend list (defaults to all six).
 * @param {(message: string) => void} [options.log] - optional diagnostics sink.
 * @returns the WebSearchProvider for `ctx.web.registerSearchProvider`.
 */
export function createChainProvider({ resolveConfig, io, backends, log }) {
  const all = backends ?? createDefaultBackends()
  return {
    id: PROVIDER_ID,
    available() {
      // Keyless bing/ddg backends are always in the chain.
      return true
    },
    async search(request, signal) {
      if (signal?.aborted === true) throw abortError(signal)
      const config = await resolveConfig()
      const errors = []
      for (const name of config.order) {
        const backend = all.find(candidate => candidate.name === name)
        if (backend === undefined || !backend.available(config)) continue
        if (signal?.aborted === true) throw abortError(signal)
        try {
          const sources = await backend.search({
            query: request.query,
            maxResults: request.maxResults,
            signal,
            config,
            io,
          })
          if (sources.length > 0) {
            // Belt-and-braces dedupe: backends dedupe themselves, but the
            // chain guarantees it regardless of backend implementation.
            const seen = new Set()
            const unique = sources.filter(source => {
              if (seen.has(source.url)) return false
              seen.add(source.url)
              return true
            })
            log?.(`"${request.query}" -> ${unique.length} source(s) via ${name}`)
            return { sources: capSources(unique, request.maxResults), truncated: false }
          }
          errors.push(`${name}: 0 results`)
        } catch (error) {
          if (signal?.aborted === true) throw abortError(signal)
          errors.push(`${name}: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
      const failure = new Error(
        `web-search-multi: every backend failed for "${request.query}" [${errors.join(' | ')}]`,
      )
      failure.code = 'WEB_PROVIDER_ERROR'
      throw failure
    },
  }
}
