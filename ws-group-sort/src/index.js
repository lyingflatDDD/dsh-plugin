/**
 * `dsh-ws-group-sort` (host half): a client-only plugin.
 *
 * Everything this plugin does lives in the browser half (`./client.js`):
 * while the sidebar's workspace browser is grouped by Workspace AND ordered
 * by latest activity ("最新对话"), it visually re-sorts the group sections so
 * the group holding the newest conversation renders first — mirroring the
 * per-session recency sort the shipped browser already applies inside each
 * group.
 *
 * The host half owns no service and no state, so this entry is deliberately
 * inert: it exists so the composition row (`~/.dsh/cordis.patch.yml`) has a
 * package to mount, which in turn makes the browser half discovered and
 * served by the dsh client-modules system.
 *
 * @module dsh-ws-group-sort
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-ws-group-sort'

/**
 * No-op host apply: see module doc.
 *
 * @param {import('@deepseek-ai/cordis').Context} _ctx - plugin context (unused).
 * @param {object} _config - composition entry config (unused).
 */
export function apply(_ctx, _config = {}) {}
