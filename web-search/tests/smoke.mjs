/**
 * One-shot end-to-end smoke test for the chain against real backends.
 * Usage: node tests/smoke.mjs [query]
 * @module dsh-web-search/tests/smoke
 */

import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { loadConfigFile } from '../src/config.js'
import { createChainProvider } from '../src/chain.js'
import { createNodeIo } from '../src/io-node.js'

const query = process.argv[2] ?? 'deepseek harness'
const provider = createChainProvider({
  resolveConfig: () => loadConfigFile(path => readFile(path, 'utf8'), homedir()),
  io: createNodeIo(),
  log: message => console.error(`[chain] ${message}`),
})
const started = Date.now()
const result = await provider.search({ query, maxResults: 5 })
console.log(JSON.stringify({ elapsedMs: Date.now() - started, ...result }, null, 2))
