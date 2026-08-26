/**
 * Browser half of `dsh-web-search` (shipped as the package's `./client`
 * export; discovered and served by the dsh client-modules system when the
 * package declares `dsh.client`).
 *
 * Registers one card into the official Plugins settings surface
 * (`settings.plugin.item`, keyed by the `web-search` settings namespace) so
 * 设置 → 插件 → 可配置 shows the search chain's configuration form. Writes go
 * through the Host settings seam (`settings.mutate`) and land in
 * `~/.dsh/settings.yaml`; secret fields are role-marked and never echoed back.
 *
 * Hand-written bundle (no build step): plain factory + React.createElement.
 * @module dsh-web-search/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-web-search',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var React = require('react')

    // Settings namespace the card edits (mirrors the Host half's namespace).
    var SETTINGS_NS = 'web-search'
    // Locale dictionary namespace owned by this bundle.
    var NS = 'dsh.web-search'

    var KNOWN_BACKENDS = ['opencli', 'bing', 'ddg', 'searxng', 'brave', 'tavily']

    var zh = {
      title: 'Web 搜索链',
      description: 'web-search-multi：opencli → Bing → DuckDuckGo → SearXNG → Brave → Tavily 的多后端回退搜索链。',
      statusLoading: '加载中…',
      statusUnavailable: '宿主 settings 不可用：确认 dsh-web-search 宿主插件已加载。',
      order: '后端顺序',
      orderHint: '逗号分隔，按此顺序尝试（未知项会被忽略）',
      searxngBaseUrl: 'SearXNG 实例地址',
      searxngBaseUrlHint: '自建 SearXNG JSON API 地址（如 https://search.example.com）',
      braveApiKey: 'Brave API Key',
      braveApiKeyHint: '留空则回退到文件/默认配置',
      tavilyApiKey: 'Tavily API Key',
      tavilyApiKeyHint: '留空则回退到文件/默认配置',
      opencliBin: 'opencli 可执行文件',
      opencliBinHint: 'PATH 中的名字或绝对路径',
      opencliLang: 'opencli 语言',
      opencliLangHint: '传给 opencli 的 --lang（如 zh）',
      opencliTimeoutMs: 'opencli 超时（毫秒）',
      httpTimeoutMs: 'HTTP 请求超时（毫秒）',
      keySet: '已设置',
      keyUnset: '未设置',
      save: '保存',
      discard: '放弃修改',
      saving: '保存中…',
      saved: '已保存，配置已实时生效',
      expand: '展开',
      collapse: '折叠',
      unsaved: '有未保存修改',
      readOnly: '宿主设置只读，无法保存改动',
      invalidNumber: '无效数字（需在 1000–120000 之间）',
    }
    var en = {
      title: 'Web Search Chain',
      description: 'web-search-multi: opencli → Bing → DuckDuckGo → SearXNG → Brave → Tavily fallback search chain.',
      statusLoading: 'Loading…',
      statusUnavailable: 'Host settings unavailable: make sure the dsh-web-search host plugin is loaded.',
      order: 'Backend order',
      orderHint: 'Comma-separated; tried in this order (unknown entries are ignored)',
      searxngBaseUrl: 'SearXNG instance URL',
      searxngBaseUrlHint: 'Self-hosted SearXNG JSON API base (e.g. https://search.example.com)',
      braveApiKey: 'Brave API Key',
      braveApiKeyHint: 'Leave blank to fall back to file/default config',
      tavilyApiKey: 'Tavily API Key',
      tavilyApiKeyHint: 'Leave blank to fall back to file/default config',
      opencliBin: 'opencli executable',
      opencliBinHint: 'Name on PATH or absolute path',
      opencliLang: 'opencli language',
      opencliLangHint: 'Passed as opencli --lang (e.g. zh)',
      opencliTimeoutMs: 'opencli timeout (ms)',
      httpTimeoutMs: 'HTTP timeout (ms)',
      keySet: 'Set',
      keyUnset: 'Not set',
      save: 'Save',
      discard: 'Discard',
      saving: 'Saving…',
      saved: 'Saved — config is live',
      expand: 'Expand',
      collapse: 'Collapse',
      unsaved: 'Unsaved changes',
      readOnly: 'Host settings are read-only; changes cannot be saved.',
      invalidNumber: 'Invalid number (must be 1000–120000)',
    }

    /** Tiny observable snapshot store (getSnapshot/subscribe pair). */
    function createStore(initial) {
      var state = initial
      var listeners = new Set()
      return {
        getSnapshot: function () { return state },
        subscribe: function (fn) {
          listeners.add(fn)
          return function () { listeners.delete(fn) }
        },
        set: function (next) {
          if (next === state) return
          state = next
          for (var fn of [...listeners]) fn()
        },
        dispose: function () { listeners.clear() },
      }
    }

    /**
     * Bridges the Host settings scope onto a renderer-friendly store. The
     * `face` is the shared settings mirror's describe face (`settingsScope`
     * binder's `describe()`); its `secrets` sidecar is the ONLY wire-truthful
     * source of whether a secret-role field is configured — every value layer
     * is redacted before it reaches the browser.
     */
    function WebSearchCardController(scope, face) {
      this.scope = scope
      this.face = face
      this.store = createStore({ status: 'loading', writable: false, secrets: {} })
      this.disposed = false
      this.off = scope.subscribe(() => this.sync())
      this.offMirror = face !== undefined ? face.subscribe(() => this.sync()) : undefined
      this.sync()
    }
    /** Secret-role configured state: field name -> whether it holds a value. */
    WebSearchCardController.prototype.readSecrets = function () {
      var secrets = {}
      if (this.face === undefined) return secrets
      var mirror = this.face.getSnapshot()
      if (mirror.view === undefined) return secrets
      var view = mirror.view.namespaces.find(
        function (candidate) { return candidate.ns === SETTINGS_NS })
      if (view === undefined || !Array.isArray(view.secrets)) return secrets
      for (var slot of view.secrets) {
        if (slot.path.length === 1 && typeof slot.path[0] === 'string') {
          secrets[slot.path[0]] = slot.set === true
        }
      }
      return secrets
    }
    WebSearchCardController.prototype.sync = function () {
      if (this.disposed) return
      var snap = this.scope.getSnapshot()
      var secrets = this.readSecrets()
      var next
      if (snap.status === 'loading') {
        next = { status: 'loading', writable: false, secrets: secrets }
      } else if (snap.status === 'unavailable') {
        next = { status: 'unavailable', writable: false, secrets: secrets }
      } else {
        next = {
          status: 'ready',
          value: snap.value ?? {},
          base: snap.base ?? {},
          user: snap.user ?? {},
          revision: snap.revision,
          writable: snap.writable,
          secrets: secrets,
        }
      }
      this.store.set(next)
    }
    WebSearchCardController.prototype.inject = function () {
      var self = this
      return { hooks: { webSearchCard: self.store } }
    }
    /** Commit a list of `{ field, value }`; undefined value clears the field. */
    WebSearchCardController.prototype.commit = async function (changes) {
      for (var change of changes) {
        if (change.value === undefined) await this.scope.unset(change.field)
        else await this.scope.set(change.field, change.value)
      }
    }
    WebSearchCardController.prototype.dispose = function () {
      this.disposed = true
      this.off()
      if (this.offMirror !== undefined) this.offMirror()
      this.store.dispose()
    }

    /** Draft mirror of one edit session: field edits + a touched set. */
    function snapshotToDraft(value) {
      var draft = {}
      for (var key of Object.keys(value)) draft[key] = value[key]
      return draft
    }

    function parseOrder(text) {
      return text.split(/[,\s，]+/).map(s => s.trim()).filter(s => s.length > 0)
    }

    /**
     * The card component. Receives `useWebSearchCard` (bound store hook) and
     * `t` (locale) from the slot renderer; the controller lives in this
     * bundle's closure.
     */
    function WebSearchCard(props, controller) {
      var snapshot = typeof props.useWebSearchCard === 'function'
        ? props.useWebSearchCard(s => s)
        : { status: 'unavailable', writable: false }
      var t = typeof props.t === 'function'
        ? props.t
        : function (key) { return (zh[key] ?? en[key] ?? key) }
      var [draft, setDraft] = React.useState(null)
      var [touched, setTouched] = React.useState(null)
      var [saving, setSaving] = React.useState(false)
      var [flash, setFlash] = React.useState(null)
      var [invalidNumbers, setInvalidNumbers] = React.useState({})
      // Like the other plugin cards in the Configurable tab: collapsed by
      // default; the header discloses the form in place.
      var [open, setOpen] = React.useState(false)

      var ready = snapshot.status === 'ready'
      var value = ready ? (snapshot.value ?? {}) : {}
      var secrets = ready ? (snapshot.secrets ?? {}) : {}

      if (draft === null) {
        setDraft(snapshotToDraft(value))
        setTouched(new Set())
      }

      var edit = function (field, raw) {
        var next = { ...draft }
        if (field === 'order') next.order = parseOrder(raw)
        else if (field === 'opencliTimeoutMs' || field === 'httpTimeoutMs') {
          var parsed = Number(raw)
          next[field] = Number.isFinite(parsed) ? parsed : raw
        } else {
          next[field] = raw
        }
        var nextTouched = new Set(touched ?? [])
        nextTouched.add(field)
        setDraft(next)
        setTouched(nextTouched)
        if (flash !== null) setFlash(null)
      }

      var discard = function () {
        setDraft(snapshotToDraft(value))
        setTouched(new Set())
        setInvalidNumbers({})
        if (flash !== null) setFlash(null)
      }

      var save = async function () {
        if (saving || !snapshot.writable) return
        var changes = []
        var invalid = {}
        for (var field of touched ?? []) {
          var raw = draft[field]
          if (field === 'opencliTimeoutMs' || field === 'httpTimeoutMs') {
            var num = Number(raw)
            if (!Number.isFinite(num) || num < 1000 || num > 120000) {
              invalid[field] = true
              continue
            }
            changes.push({ field: field, value: Math.floor(num) })
          } else if (field === 'order') {
            var order = Array.isArray(raw)
              ? raw.filter(name => KNOWN_BACKENDS.includes(name))
              : []
            changes.push({ field: 'order', value: order.length > 0 ? order : undefined })
          } else if (typeof raw === 'string') {
            var trimmed = raw.trim()
            changes.push({ field: field, value: trimmed.length > 0 ? trimmed : undefined })
          } else {
            changes.push({ field: field, value: raw })
          }
        }
        setInvalidNumbers(invalid)
        if (Object.keys(invalid).length > 0) return
        setSaving(true)
        try {
          await controller.commit(changes)
          setTouched(new Set())
          setFlash('saved')
        } catch (error) {
          console.warn('[dsh-web-search] save failed:', error)
        } finally {
          setSaving(false)
        }
      }

      var tField = function (key, fallback) { return t(key) ?? fallback }

      var rowStyle = { marginBottom: '12px' }
      // Theme-token colors: the app flips light/dark variants of these
      // variables, so the card never hardcodes a theme-specific text color.
      var labelStyle = {
        display: 'block', fontSize: '12px', color: 'var(--dsw-alias-label-primary)',
        marginBottom: '4px', fontWeight: 500,
      }
      var hintStyle = {
        display: 'block', fontSize: '11px', color: 'var(--dsw-alias-label-secondary)',
        marginTop: '3px',
      }
      var inputStyle = {
        width: '100%', boxSizing: 'border-box', padding: '6px 10px', borderRadius: '8px',
        border: '1px solid var(--dsw-alias-border-l1)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)', fontSize: '13px',
      }
      var secretBadge = function (key) {
        var set = secrets[key] === true
        return React.createElement('span', {
          style: {
            fontSize: '11px', marginLeft: '8px', padding: '1px 8px', borderRadius: '999px',
            background: set ? 'rgba(52,199,89,.16)' : 'rgba(128,128,128,.15)',
            color: set ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-secondary)',
          },
        }, set ? tField('keySet', '已设置') : tField('keyUnset', '未设置'))
      }
      var textRow = function (field, label, hint) {
        var raw = draft?.[field] ?? ''
        return React.createElement('div', { style: rowStyle },
          React.createElement('label', { style: labelStyle }, label),
          React.createElement('input', {
            type: 'text',
            value: raw,
            disabled: !snapshot.writable || saving,
            style: inputStyle,
            onChange: function (e) { edit(field, e.target.value) },
          }),
          hint === undefined ? null : React.createElement('span', { style: hintStyle }, hint),
        )
      }
      var numberRow = function (field, label) {
        var raw = draft?.[field]
        var rawText = raw === undefined || raw === null || raw === '' ? '' : String(raw)
        var invalid = invalidNumbers?.[field] === true
        return React.createElement('div', { style: rowStyle },
          React.createElement('label', { style: labelStyle }, label),
          React.createElement('input', {
            type: 'number',
            value: rawText,
            min: 1000,
            max: 120000,
            disabled: !snapshot.writable || saving,
            style: { ...inputStyle, ...(invalid ? { borderColor: 'var(--dsw-alias-state-error-primary)' } : {}) },
            onChange: function (e) { edit(field, e.target.value) },
          }),
          invalid ? React.createElement('span', { style: { ...hintStyle, color: 'var(--dsw-alias-state-error-primary)' } }, tField('invalidNumber', '无效数字')) : null,
        )
      }
      var secretRow = function (field, label, hint) {
        var raw = draft?.[field] ?? ''
        return React.createElement('div', { style: rowStyle },
          React.createElement('span', { style: labelStyle }, label, secretBadge(field)),
          React.createElement('input', {
            type: 'password',
            value: raw,
            placeholder: secrets[field] === true ? '••••••••' : '',
            disabled: !snapshot.writable || saving,
            autoComplete: 'off',
            style: inputStyle,
            onChange: function (e) { edit(field, e.target.value) },
          }),
          hint === undefined ? null : React.createElement('span', { style: hintStyle }, hint),
        )
      }

      if (snapshot.status === 'loading') {
        return React.createElement('li', { style: { padding: '16px', listStyle: 'none' } }, tField('statusLoading', '加载中…'))
      }
      if (!ready) {
        return React.createElement('li', { style: { padding: '16px', listStyle: 'none' } }, tField('statusUnavailable', '宿主 settings 不可用'))
      }

      var title = tField('title', 'Web 搜索链')
      var dirty = (touched?.size ?? 0) > 0

      var header = React.createElement('button', {
        type: 'button',
        'aria-expanded': open,
        'aria-label': tField(open ? 'collapse' : 'expand', open ? '折叠' : '展开') + ': ' + title,
        onClick: function () { setOpen(!open) },
        style: {
          width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center',
          gap: '10px', padding: '14px 16px', border: 'none', background: 'transparent',
          cursor: 'pointer', textAlign: 'left', color: 'var(--dsw-alias-label-primary)',
        },
      },
        React.createElement('span', { style: { flex: 1, minWidth: 0 } },
          React.createElement('span', { style: { display: 'block', fontSize: '14px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } }, title),
          React.createElement('span', { style: { display: 'block', fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', marginTop: '2px' } },
            tField('description', 'web-search-multi 搜索后端回退链')),
        ),
        dirty
          ? React.createElement('span', {
            style: {
              flexShrink: 0, fontSize: '11px', padding: '1px 8px', borderRadius: '999px',
              background: 'rgba(255,149,0,.16)', color: 'var(--dsw-alias-state-warn-primary)',
            },
          }, tField('unsaved', '有未保存修改'))
          : null,
        React.createElement('span', { style: { flexShrink: 0, display: 'flex', color: 'var(--dsw-alias-label-secondary)' } },
          React.createElement('svg', {
            width: '14', height: '14', viewBox: '0 0 14 14', 'aria-hidden': true,
            style: { transition: 'transform .15s ease', transform: open ? 'rotate(180deg)' : 'none' },
          }, React.createElement('path', {
            d: 'M3 5l4 4 4-4', fill: 'none', stroke: 'currentColor',
            strokeWidth: '1.5', strokeLinecap: 'round', strokeLinejoin: 'round',
          })),
        ),
      )

      var actions = React.createElement('div', {
        style: { display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'flex-end', marginTop: '4px' },
      },
        flash === 'saved'
          ? React.createElement('span', {
            style: { fontSize: '12px', color: 'var(--dsw-alias-state-success-primary)', marginRight: 'auto' },
          }, tField('saved', '已保存，配置已实时生效'))
          : null,
        React.createElement('button', {
          type: 'button',
          disabled: !snapshot.writable || saving,
          onClick: discard,
          style: {
            padding: '6px 16px', borderRadius: '8px', cursor: 'pointer', fontSize: '13px',
            border: '1px solid var(--dsw-alias-border-l1)', background: 'transparent',
            color: 'var(--dsw-alias-label-primary)',
          },
        }, tField('discard', '放弃修改')),
        React.createElement('button', {
          type: 'button',
          disabled: !snapshot.writable || saving,
          onClick: save,
          style: {
            padding: '6px 16px', borderRadius: '8px', cursor: saving ? 'default' : 'pointer',
            fontSize: '13px', border: 'none', background: 'var(--dsw-alias-brand-primary)', color: '#fff',
            opacity: snapshot.writable ? 1 : 0.5,
          },
        }, saving ? tField('saving', '保存中…') : tField('save', '保存')),
      )

      var body = open
        ? React.createElement('div', { style: { padding: '0 16px 16px' } },
            !snapshot.writable
              ? React.createElement('p', {
                role: 'status',
                style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)', margin: '0 0 10px' },
              }, tField('readOnly', '宿主设置只读，无法保存改动'))
              : null,
            textRow('order', tField('order', '后端顺序'), tField('orderHint', '逗号分隔')),
            textRow('searxngBaseUrl', tField('searxngBaseUrl', 'SearXNG 实例地址'), tField('searxngBaseUrlHint', '')),
            secretRow('braveApiKey', tField('braveApiKey', 'Brave API Key'), tField('braveApiKeyHint', '')),
            secretRow('tavilyApiKey', tField('tavilyApiKey', 'Tavily API Key'), tField('tavilyApiKeyHint', '')),
            textRow('opencliBin', tField('opencliBin', 'opencli 可执行文件'), tField('opencliBinHint', '')),
            textRow('opencliLang', tField('opencliLang', 'opencli 语言'), tField('opencliLangHint', '')),
            numberRow('opencliTimeoutMs', tField('opencliTimeoutMs', 'opencli 超时（毫秒）')),
            numberRow('httpTimeoutMs', tField('httpTimeoutMs', 'HTTP 超时（毫秒）')),
            actions,
          )
        : null

      return React.createElement('li', {
        style: {
          listStyle: 'none',
          border: '1px solid var(--dsw-alias-border-l1)', borderRadius: '12px',
          background: 'var(--dsw-alias-bg-layer-1)',
        },
      }, header, body)
    }

    var controller

    /**
     * Mount the settings card.
     * @param ctx - client root context (slots/locale/settingsScope services).
     */
    function apply(ctx) {
      // register locale dictionaries
      ctx.effect(() => ctx.locale.register(NS, { zh: zh, en: en }), 'dsh-web-search: dictionaries')
      var scope = ctx.settingsScope.bind({ namespace: SETTINGS_NS })
      // The shared mirror's describe face feeds the secret configured-state
      // sidecar (the one truthful secret source a browser can read).
      controller = new WebSearchCardController(scope, ctx.settingsScope.describe())
      try {
        // The slot injection rides this fiber and disposes with it; the card
        // renderer closes over the controller so the component needs no
        // framework wiring beyond the bind useWebSearchCard hook.
        ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
          name: 'settings.plugin.item',
          key: SETTINGS_NS,
          locale: NS,
          inject: () => controller.inject(),
        }, function cardRender(props) {
          return WebSearchCard(props, controller)
        }))
      } catch (error) {
        console.warn('[dsh-web-search] settings card mount failed:', error)
      }
      ctx.effect(() => () => {
        if (controller !== undefined) controller.dispose()
      }, 'dsh-web-search: settings card teardown')
    }

    var inject = ['slots', 'locale', 'settingsScope']
    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})

//# sourceMappingURL=client.js.map