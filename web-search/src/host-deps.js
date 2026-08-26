/**
 * Resolve Host-side packages (`@deepseek-ai/dsh-settings`, `@deepseek-ai/schemastery`)
 * from wherever the running `dsh` installation keeps them.
 *
 * This plugin is mounted from its own working tree (not from inside the dsh
 * profile), so bare imports of `@deepseek-ai/*` cannot resolve through the
 * plugin's own `node_modules` walk-up. The dsh CLI materializes the Host
 * package set under `<DSH_HOME>/profiles/node_modules` (and the profile's own
 * `node_modules`), so we locate the packages there with `createRequire` +
 * explicit `paths`, then dynamic-import by resolved file URL. ESM caches by
 * real path, so the resolved `dsh-settings` instance is the SAME one the
 * loader provides to the settings seam — registration stays singleton-safe.
 * @module dsh-web-search/host-deps
 */

import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)

/** Candidate roots that may contain the Host package set, most specific first. */
export function hostDepRoots() {
  const home = homedir()
  const dshHome = process.env.DSH_HOME !== undefined && process.env.DSH_HOME.length > 0
    ? process.env.DSH_HOME
    : join(home, '.dsh')
  return [
    join(dshHome, 'profiles', 'node_modules'),
    join(dshHome, 'profiles', 'web', 'node_modules'),
    join(home, '.dsh', 'profiles', 'node_modules'),
  ]
}

/**
 * Resolve one Host package to an absolute entry path.
 * @param {string} name - bare package specifier.
 * @returns the resolved entry path, or undefined.
 */
export function resolveHostDep(name) {
  for (const root of hostDepRoots()) {
    try {
      return require.resolve(name, { paths: [root] })
    } catch {
      // try the next root
    }
  }
  try {
    return require.resolve(name)
  } catch {
    return undefined
  }
}

const importCache = new Map()

/**
 * Dynamic-import one Host package, memoized per name.
 * @param {string} name - bare package specifier.
 * @returns a promise of the package namespace.
 */
export async function importHostDep(name) {
  if (importCache.has(name)) return importCache.get(name)
  const promise = (async () => {
    const entry = resolveHostDep(name)
    if (entry === undefined) {
      throw new Error(`[dsh-web-search] cannot resolve "${name}" from dsh profile node_modules`)
    }
    return import(pathToFileURL(entry).href)
  })()
  importCache.set(name, promise)
  return promise
}