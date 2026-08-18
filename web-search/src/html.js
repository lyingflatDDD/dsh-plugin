/**
 * Shared HTML/text helpers with zero dependencies: entity decoding, tag
 * stripping, and Bing redirect-URL recovery (`bing.com/ck/a?...&u=a1<base64url>`).
 * Uses only `atob` + `TextDecoder`, so the same file works inside the harness
 * Node process and inside the restricted dynamic-plugin sandbox.
 * @module dsh-web-search/html
 */

/** Named entities worth decoding in titles and snippets. */
const NAMED_ENTITIES = {
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  middot: '·',
  hellip: '…',
  rsquo: '\u2019',
  lsquo: '\u2018',
  ldquo: '\u201c',
  rdquo: '\u201d',
  amp: '&',
}

/**
 * Decode the HTML entities that appear in search-result markup. `&amp;` is
 * decoded last so an already-decoded value cannot be double-unescaped.
 *
 * @param {string} text - raw HTML text (may contain tags/entities).
 * @returns the decoded plain text.
 */
export function decodeEntities(text) {
  if (text === undefined || text === null) return ''
  let out = String(text)
  out = out.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
    try { return String.fromCodePoint(Number.parseInt(hex, 16)) } catch { return '&' + 'amp;' }
  })
  out = out.replace(/&#(\d+);/g, (_, dec) => {
    try { return String.fromCodePoint(Number.parseInt(dec, 10)) } catch { return '&' + 'amp;' }
  })
  for (const [name, value] of Object.entries(NAMED_ENTITIES)) {
    if (name === 'amp') continue
    out = out.split(`&${name};`).join(value)
  }
  out = out.split('&amp;').join('&')
  return out
}

/**
 * Strip HTML tags and collapse whitespace.
 *
 * @param {string} html - markup fragment.
 * @returns tag-free single-spaced text.
 */
export function stripTags(html) {
  if (html === undefined || html === null) return ''
  return String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Clean a title/snippet. Entities are decoded once, tags stripped, then
 * entities decoded again: escaped markup in snippets (`&lt;script&gt;`) must
 * not survive as raw tags, and double-escaped entities still resolve.
 *
 * @param {string} html - markup fragment.
 * @returns cleaned plain text.
 */
export function cleanText(html) {
  return decodeEntities(stripTags(decodeEntities(String(html ?? ''))))
}

/**
 * Decode base64url payload bytes to UTF-8 text. Works with `atob` +
 * `TextDecoder` only, so it runs in the dynamic-plugin sandbox too.
 *
 * @param {string} value - base64 or base64url text (padding optional).
 * @returns the decoded UTF-8 string.
 */
export function decodeUtf8Base64Url(value) {
  let base64 = String(value).replace(/-/g, '+').replace(/_/g, '/')
  while (base64.length % 4 !== 0) base64 += '='
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new TextDecoder('utf-8').decode(bytes)
}

/**
 * Recover the real target URL from a Bing result link. Organic results link
 * through `https://www.bing.com/ck/a?!&p=...&u=a1<base64url>&ntb=1`; the `u`
 * parameter (after the `a1` marker) is the base64url-encoded destination.
 * Non-redirect hrefs pass through unchanged; decode failures fall back to the
 * original href (the redirect still resolves for the user).
 *
 * @param {string} href - raw href attribute value (may contain entities).
 * @returns the best-effort direct URL.
 */
export function decodeBingUrl(href) {
  let url = decodeEntities(String(href)).trim()
  if (url.startsWith('//')) url = `https:${url}`
  if (!url.includes('/ck/')) return url
  const match = /[?&]u=(a[0-9])?([^&]+)/.exec(url)
  if (match === null) return url
  const payload = match[2]
  if (payload === undefined || payload.length === 0) return url
  try {
    const decoded = decodeUtf8Base64Url(payload)
    if (/^https?:\/\//i.test(decoded)) return decoded
  } catch {
    // fall through to the raw redirect
  }
  return url
}

/** Extract the `uddg` target from a DuckDuckGo redirect href, or pass through. */
export function decodeDdgUrl(href) {
  let url = decodeEntities(String(href)).trim()
  if (url.startsWith('//')) url = `https:${url}`
  const match = /[?&]uddg=([^&]+)/.exec(url)
  if (match !== null) {
    try {
      const decoded = decodeURIComponent(match[1])
      if (/^https?:\/\//i.test(decoded)) return decoded
    } catch {
      // fall through to the raw redirect
    }
  }
  return url
}
