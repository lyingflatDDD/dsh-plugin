/**
 * Full-Node io adapters for the permanent plugin: native `fetch` with linked
 * outer-signal + per-request timeout aborts, and `child_process.spawn` capture
 * for the opencli backend. The dynamic-plugin sandbox cannot use these globals
 * and substitutes subprocess/curl-based adapters with the same contract.
 * @module dsh-web-search/io-node
 */

import { spawn } from 'node:child_process'

/** Collect cap for one output stream (bytes). */
const MAX_CAPTURE = 8 * 1024 * 1024

/**
 * Build the io pair used by the permanent plugin.
 *
 * @returns `{request(url, opts), runCapture(argv, timeoutMs)}`.
 */
export function createNodeIo() {
  return {
    /**
     * One HTTP request. Transport errors and timeouts reject; HTTP error
     * statuses resolve so callers decide whether the body is still usable.
     *
     * @param {string} url - target URL.
     * @param {object} [options] - `{method, headers, body, timeoutMs, signal}`.
     * @returns `{status, body}`.
     */
    async request(url, { method = 'GET', headers = {}, body, timeoutMs = 8000, signal } = {}) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs)
      const onAbort = () => controller.abort(signal?.reason)
      if (signal !== undefined) {
        if (signal.aborted) controller.abort(signal.reason)
        signal.addEventListener('abort', onAbort, { once: true })
      }
      try {
        const response = await fetch(url, {
          method,
          headers,
          ...body !== undefined ? { body } : {},
          redirect: 'follow',
          signal: controller.signal,
        })
        const text = await response.text()
        return { status: response.status, body: text }
      } finally {
        clearTimeout(timer)
        if (signal !== undefined) signal.removeEventListener('abort', onAbort)
      }
    },

    /**
     * Run one argv to completion, capturing stdout/stderr.
     *
     * @param {string[]} argv - full argv including the program.
     * @param {number} timeoutMs - kill deadline.
     * @returns `{code, stdout, stderr}`.
     * @throws on spawn failure or timeout.
     */
    runCapture(argv, timeoutMs) {
      return new Promise((resolve, reject) => {
        const child = spawn(argv[0], argv.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] })
        let stdout = ''
        let stderr = ''
        let timedOut = false
        const timer = setTimeout(() => {
          timedOut = true
          child.kill('SIGKILL')
        }, timeoutMs)
        child.stdout.on('data', chunk => {
          if (stdout.length < MAX_CAPTURE) stdout += String(chunk)
        })
        child.stderr.on('data', chunk => {
          if (stderr.length < 262144) stderr += String(chunk)
        })
        child.on('error', error => {
          clearTimeout(timer)
          reject(error)
        })
        child.on('close', code => {
          clearTimeout(timer)
          if (timedOut) reject(new Error(`timeout after ${timeoutMs}ms`))
          else resolve({ code: code ?? -1, stdout, stderr })
        })
      })
    },
  }
}
