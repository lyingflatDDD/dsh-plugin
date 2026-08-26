# dsh-web-search

[pi-web-access](https://github.com/nicobailon/pi-web-access) 风格的多后端 web 搜索链，用于替换 DeepSeek Harness（DSH）内置 `web_search` 的后端。在 `ctx.web` seam 上注册一个 `web-search-multi` provider，按配置顺序尝试多个搜索后端，失败自动回退，全部失败才报错。

零依赖：纯 ESM JavaScript（Node >= 20），无构建步骤，无 npm 依赖。

## 后端链（默认顺序）

| 顺序 | 后端 | 需要什么 | 说明 |
| --- | --- | --- | --- |
| 1 | `opencli` | 本机 [opencli](https://github.com/jackwener/opencli) + Chrome（Browser Bridge） | **免 key Google 搜索**：`opencli google search --window background`，经你登录的 Chrome 在后台窗口执行，绕过反爬。实测 ~3s 返回 |
| 2 | `bing` | 无 | 免 key：解析 Bing SERP HTML（`b_algo` 区块 + `ck/a` 重定向 base64url 解码） |
| 3 | `ddg` | 无 | 免 key：`html.duckduckgo.com/html/`（本机网络被 202 挑战，作为其他网络的回退） |
| 4 | `searxng` | `searxngBaseUrl` 配置 | 自建 SearXNG 实例的 JSON API（公共实例大多限流，建议自建） |
| 5 | `brave` | `braveApiKey` 配置 | Brave Search API |
| 6 | `tavily` | `tavilyApiKey` 配置 | Tavily API |

规则：某后端抛错或解析出 0 条结果 -> 自动尝试下一个；全程响应 AbortSignal（工具层 60s 预算）；后端内 URL 去重；**绝不编造结果**。

## 安装（已配置在本机）

挂载方式是 DSH 官方的**用户级 home patch**（`~/.dsh/cordis.patch.yml`），`dsh web` 实时监视该文件、**无需重启即生效**（注意：**插件源码**改动仍需重启 `dsh web`；patch 热重载只影响组合结构）：

```yaml
- insert:
    - id: web-search
      name: dsh-web-search

- id: web
  name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: web-search-multi
```

`dsh-web-search` 需要先作为包安装进 web profile，这样它的**浏览器半身**（`client.js`，经 `dsh.client` 声明）才会被 client-modules 扫描到、伺服到 `/plugins/dsh-web-search/client.js`，并出现在 `window.__DSH_BOOT__`：

```bash
cd ~/code/dsh-plugin
dsh plugin --profile web add link:./web-search     # 或 link: 绝对路径
```

两条 patch 的作用：

1. `insert` 把本插件作为 host 组合的一行挂载（插件 `apply` 时向 `ctx.web` 注册 `web-search-multi` provider，并在宿主 `settings` seam 注册 `web-search` 命名空间）；
2. `id: web` 覆盖把 seam 的 provider 选择从内置钉选的 `deepseek-official` 改为 `web-search-multi`。**必须改这个钉选**：DSH 的 bundle 在 `packages/bundle/base/cordis.patch.yml` 里写死了 `searchProvider: deepseek-official`，且 config 优先于 `$DSH_WEB_SEARCH_PROVIDER` 环境变量，所以环境变量无法切换。

**回滚**：删除或清空 `~/.dsh/cordis.patch.yml`（并把 patch 里第一个 insert 恢复为 `file://` 旧写法即可脱离包依赖）——监视器会卸载插件并恢复 deepseek 原状。

**注意**：不要同时用动态 Cordis 插件注册同名 provider（id 冲突会 `WEB_DUPLICATE_PROVIDER`）；本会话验证用的动态插件已停止。

## GUI 配置（设置 → 插件 → 可配置）

插件在宿主 `settings` seam 注册 `web-search` 命名空间（持久化到 `~/.dsh/settings.yaml`），并在 DSH Web GUI 的**设置 → 插件 → 可配置** tab 渲染一张「Web 搜索链」卡片，可编辑：

| 字段 | 说明 |
| --- | --- |
| 后端顺序 | 逗号分隔的回退链（未知项被忽略） |
| SearXNG 实例地址 | 自建 SearXNG JSON API 地址 |
| Brave API Key / Tavily API Key | secret 字段，不回显；留空保存 = 清除该覆盖 |
| opencli 可执行文件 / 语言 | opencli 后端参数 |
| opencli 超时 / HTTP 超时 | 1000–120000 ms，越界不保存 |

配置分层（每次搜索实时合并）：

```
代码默认值 < ~/.dsh/web-search.json < GUI 用户层（settings.yaml）
```

GUI 里留空保存某字段 = 删除该字段的用户覆盖，回退到 `web-search.json` 的值；两个来源都没有就用代码默认值。改动立即生效、无需重启。

## 配置（可选）：`~/.dsh/web-search.json`

镜像 pi-web-access 的 `~/.pi/web-search.json` 惯例，每次搜索时惰性重读；它是分层配置的**中间层**（代码默认值 < 本文件 < GUI 设置），GUI 里留空保存的字段会回退到这里：

```json
{
  "order": ["opencli", "bing", "ddg", "searxng", "brave", "tavily"],
  "searxngBaseUrl": "",
  "braveApiKey": "",
  "tavilyApiKey": "",
  "opencliBin": "opencli",
  "opencliLang": "",
  "opencliTimeoutMs": 18000,
  "httpTimeoutMs": 8000
}
```

- `order`：回退顺序（未知项被忽略；只保留你配置了的后端）
- `opencliBin`：opencli 可执行文件（PATH 中的名字或绝对路径）
- `opencliLang`：传给 opencli 的 `--lang`（如 `"zh"`）
- 超时上限约束在 1000-120000ms

## opencli 后端要求

- `npm install -g @jackwener/opencli` + Chrome 装 Browser Bridge 扩展（本机已就绪）
- Chrome 需在运行、Bridge daemon 可达（daemon 会自动拉起）
- opencli 不可用时链自动降级到 Bing，无需干预

## 开发

```
web-search/
├── package.json          # 零依赖, "type": "module"; exports["./client"] + dsh.client 声明
├── src/
│   ├── index.js          # Cordis 插件入口：ctx.get('web') 注册链式 provider
│   ├── chain.js          # web-search-multi：回退链 + 去重 + 截断 + abort
│   ├── config.js         # ~/.dsh/web-search.json 读取/合并/校验
│   ├── web-search-settings.js  # settings seam 注册 web-search 命名空间（GUI 卡片的数据源）
│   ├── host-deps.js      # 从 dsh profile node_modules 解析 @deepseek-ai/* 宿主包
│   ├── client.js         # 浏览器半身：设置→插件→可配置 卡片的 hand-written bundle
│   ├── io-node.js        # 原生 fetch + child_process 的 io 适配
│   ├── html.js           # 实体解码/去标签/Bing 重定向 base64url 解码
│   ├── parse-bing.js     # Bing SERP 解析（真实 fixture 驱动）
│   ├── parse-ddg.js      # DDG HTML 解析
│   └── backends/         # opencli / bing / ddg / searxng / brave / tavily
└── tests/                # node:test，用例 + fixtures + smoke.mjs
```

```bash
node --test tests/*.test.mjs     # 单元测试（解析器/链行为/配置合并）
node tests/smoke.mjs "query"     # 真实后端端到端冒烟
```

**修改源码后需重启 `dsh web`**：web bundle 禁用了模块级 HMR，ESM 模块缓存不会因 patch 变更而刷新（patch 文件本身的热重载只影响组合结构）。

## 已知边界

- 搜索引擎 HTML 布局变更会让 bing/ddg 解析返回 0 条 -> 链回退，不会静默出错数据；修 parser 即可（fixture 在 tests/fixtures/）
- 免 key 后端无 SLA；对稳定性有要求请配置 searxng/brave/tavily
- opencli 每次搜索会短暂占用 Chrome 后台标签页
- 本插件不改动 `web_fetch`（范围仅 web_search）
