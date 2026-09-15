# dsh-plugin

[DeepSeek Harness（DSH）](https://github.com/deepseek-ai) 的插件集合。每个子目录是一个独立插件：零依赖纯 ESM（Node >= 20）、无构建步骤、`node:test` 测试随包。

## 插件

| 插件 | 说明 |
| --- | --- |
| [`plan-window/`](./plan-window) | **计划评审浮动窗口**：把 `exit_plan_mode` 的固定接管卡替换为可拖拽、可缩放的自由浮动窗口，支持划选计划文字添加评论，一键把全部评论回传给模型修订。纯 Client 插件。 |
| [`web-search/`](./web-search) | **多后端 web 搜索链**（pi-web-access 风格）：在 `ctx.web` seam 注册 `web-search-multi` provider，按序回退 opencli/Google → Bing → DuckDuckGo → SearXNG → Brave → Tavily；带 GUI 设置卡片（设置 → 插件 → 可配置），密钥不回显。 |
| [`patent-disclosure/`](./patent-disclosure) | **技术交底书预设包**：为「技术交底书」agent 预设注册 `tech-disclosure` 写作技能（公司六段交底书模板、预审教训沉淀的写作规则、代码仓库挖掘与结构化访谈两套输入流程、matplotlib 流程图自动生成规范、交稿自查清单），附固定的 md 转 docx 脚本。纯 Host 插件（无浏览器 UI），走预设组合行挂载（不用 `cordis.patch.yml`）。 |
| [`patent-skill/`](./patent-skill) | **上游中国专利技能适配包**：把 [handsomestWei/patent-disclosure-skill](https://github.com/handsomestWei/patent-disclosure-skill)（交底/申请文件/案卷/著录检索/通俗解读/专利地图/审查答复/政策简报，含 mermaid 出图、docx 定稿、CNIPA 检索等 Python 工具链）vendor 进包内，为同一预设注册 `patent-disclosure-skill` 路由技能（发明交底仍默认 `tech-disclosure`）。纯 Host 插件，走预设组合行挂载。 |

## 通用安装方式

各插件的第一步相同：先装进 web profile（plan-window / web-search 借此让浏览器半身被 client-modules 发现；patent-disclosure / patent-skill 无浏览器半身，目的是 pnpm link 后让裸包名能被预设组合行解析）：

```bash
cd ~/code/dsh-plugin
dsh plugin --profile web add link:./<plugin-name>
```

第二步挂载组合行分两条路径：

- **plan-window / web-search**（home patch）：`~/.dsh/cordis.patch.yml` 追加 insert 行（具体见各插件 README）：

  ```yaml
  - insert:
      - id: <plugin-name>
        name: dsh-<plugin-name>
  ```

- **patent-disclosure**（预设组合行）：**不走** home patch——host patch 是全局层，`ctx.skills.register()` 会让技能出现在所有会话；改在预设垫片 `~/.dsh/.agent-presets/patent-disclosure/agent.cordis.yml` 挂载，只对选择该预设的会话可见，详见 [patent-disclosure/README.md](./patent-disclosure)。

## 开发约定

- **依赖**：不强制零依赖——后续开发能用 npm 包就直接引入；存量三插件保持零依赖现状，浏览器半身（`src/client.js`）仍为手写 bundle。
- **测试**：各插件目录下 `npm test`（node:test）；web-search 另有真实后端冒烟 `node tests/smoke.mjs "query"`。
- **源码改动需重启 `dsh web`**：patch 文件热重载只影响组合结构；web bundle 禁用模块级 HMR，ESM 模块缓存不会自动刷新。
- **回滚**：删除 `~/.dsh/cordis.patch.yml` 中对应 insert 行即可，watcher 自动卸载。

## License

MIT（各插件 package.json 声明）。
