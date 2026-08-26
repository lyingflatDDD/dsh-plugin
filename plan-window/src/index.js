/**
 * `dsh-plan-window` (host half): a client-only plugin.
 *
 * Everything this plugin does lives in the browser half (`./client.js`):
 * it claims the `conversation.composer` chain for plan-review question
 * waits (priority -1, ahead of the shipped question composer) and renders a
 * draggable, resizable review window in `shell.overlay`, letting the user
 * comment on selected plan text and send all comments back as
 * `Keep planning` + `custom` feedback for the model to revise against.
 *
 * The host half owns no service and no state, so this entry is deliberately
 * inert: it exists so the composition row (`~/.dsh/cordis.patch.yml`) has a
 * package to mount, which in turn makes the browser half discovered and
 * served by the dsh client-modules system.
 *
 * @module dsh-plan-window
 */

/** Cordis plugin name used by loader diagnostics. */
export const name = 'dsh-plan-window'

/**
 * No-op host apply: see module doc.
 *
 * @param {import('@deepseek-ai/cordis').Context} _ctx - plugin context (unused).
 * @param {object} _config - composition entry config (unused).
 */
export function apply(_ctx, _config = {}) {}
