# dsh-plugin

[DeepSeek Harness（DSH）](https://github.com/deepseek-ai) 的插件集合。每个子目录是一个独立插件：零依赖纯 ESM（Node >= 20）、无构建步骤、`node:test` 测试随包。

## 插件

| 插件 | 说明 |
| --- | --- |
| [`plan-window/`](./plan-window) | **计划评审浮动窗口**：把 `exit_plan_mode` 的固定接管卡替换为可拖拽、可缩放的自由浮动窗口，支持划选计划文字添加评论，一键把全部评论回传给模型修订。纯 Client 插件。 |
| [`web-search/`](./web-search) | **多后端 web 搜索链**（pi-web-access 风格）：在 `ctx.web` seam 注册 `web-search-multi` provider，按序回退 opencli/Google → Bing → DuckDuckGo → SearXNG → Brave → Tavily；带 GUI 设置卡片（设置 → 插件 → 可配置），密钥不回显。 |

## 通用安装方式

两个插件都走 DSH 官方安装路径：先装进 web profile（让浏览器半身被 client-modules 发现），再在用户级 home patch（`~/.dsh/cordis.patch.yml`）挂载组合行：

```bash
cd ~/code/dsh-plugin
dsh plugin --profile web add link:./<plugin-name>
```

`~/.dsh/cordis.patch.yml` 追加（具体见各插件 README）：

```yaml
- insert:
    - id: <plugin-name>
      name: dsh-<plugin-name>
```

## 开发约定

- **零依赖**：不引入 npm 运行时依赖；浏览器半身（`src/client.js`）为手写 bundle。
- **测试**：各插件目录下 `npm test`（node:test）；web-search 另有真实后端冒烟 `node tests/smoke.mjs "query"`。
- **源码改动需重启 `dsh web`**：patch 文件热重载只影响组合结构；web bundle 禁用模块级 HMR，ESM 模块缓存不会自动刷新。
- **回滚**：删除 `~/.dsh/cordis.patch.yml` 中对应 insert 行即可，watcher 自动卸载。

## License

MIT（各插件 package.json 声明）。
