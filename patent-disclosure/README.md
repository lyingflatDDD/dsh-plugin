# dsh-patent-disclosure

技术交底书预设包：为 `patent-disclosure`（技术交底书）agent 预设注册 `tech-disclosure`
写作技能——公司六段交底书模板、预审教训沉淀的写作规则、代码仓库挖掘与结构化访谈两套输入流程、
流程图实现代码（matplotlib）自动生成规范、交稿自查清单。

零依赖：纯 ESM JavaScript（Node >= 20），无 npm 依赖，无构建步骤，仅宿主半边（无浏览器 UI）。

## 架构（与 web-search / plan-window 的关键区别）

本包**不走 `~/.dsh/cordis.patch.yml`**。host patch 行是全局的：若把本包插入 host 组合，
`ctx.skills.register()` 会落到全局层，`tech-disclosure` 出现在**所有**会话的技能目录里。

本包通过**预设组合行**挂载（预设行在预设自己的 scope 层解析，runtime skill 只对选择该预设的会话可见）：

```
~/.dsh/.agent-presets/patent-disclosure/agent.cordis.yml   # 预设垫片（standard 副本 + 交底书 persona + 一行引用本包）
        └── - id: disclosure-skill
              name: dsh-patent-disclosure                   # 裸包名，解析到本目录（link 安装）
              # 后备写法：file:///home/cxiao/code/dsh-plugin/patent-disclosure/src/index.js
```

预设目录只能物理存在于 `~/.dsh/.agent-presets/`（roster 的 roots 由 app 强制覆盖，用户 patch
加不进自定义根；目录扫描跳过符号链接），因此仓库持有全部实质内容（本包 + skill 正文），
`~/.dsh` 下只保留 2 文件垫片（`preset.yml` + `agent.cordis.yml`）与 link 安装记录。

## 安装（已配置在本机）

```bash
# 1. 包可按裸名解析（写 ~/.dsh/profiles/web，pnpm link）
cd /home/cxiao/code/dsh-plugin
dsh plugin --profile web add link:./patent-disclosure

# 2. 预设垫片（~/.dsh/.agent-presets/patent-disclosure/：preset.yml + agent.cordis.yml）
#    agent.cordis.yml = shipped standard 预设副本，改 persona 文本，并在 persona 行后加：
#      - id: disclosure-skill
#        name: dsh-patent-disclosure
#    （若会话报 Cannot find package，把 name 换成上面的 file:// 绝对路径写法）
```

设置 → 预设 agent 中出现「技术交底书」；选它开新会话即用。

## 使用

- 开会话时把**代码仓库路径**给 agent（或在仓库目录里开会话）；没有代码也可以，agent 会做结构化访谈。
- 产出：`交底书_<主题>.md` + `flowchart_fig*.py`（可自行修改重跑）+ 生成的 PNG；
  非流程图附图由用户补充（≤3 张占位符）。
- **docx 转换走固定脚本**（agent 也只会调它，不现场写转换代码）：

  ```bash
  python3 scripts/md2docx.py 交底书_<主题>.md [输出.docx]
  ```

  格式已按公司交底书模板固化（黑体标题/宋体正文/表格/代码块/图片居中限宽/图占位），
  调格式改脚本本身即可。图片相对路径按 md 所在目录解析。
- 修改 agent 行为：编辑 `src/skill.md`（方法论/模板/规则都在这里），重启 `dsh web` 后新会话生效。

## 回滚

```bash
rm -rf ~/.dsh/.agent-presets/patent-disclosure          # 删预设垫片（选择器立即消失）
dsh plugin --profile web remove dsh-patent-disclosure    # 卸载链接包
```

## 开发

```
patent-disclosure/
├── package.json          # 零依赖, "type": "module"
├── src/
│   ├── index.js          # 宿主半边：inject ['skills']，注册 tech-disclosure runtime skill
│   └── skill.md          # 技能正文（模板 + 写作规则 + 流程图规范 + 自查清单）
├── scripts/
│   └── md2docx.py        # 固定的交底书 Markdown -> docx 转换脚本（python-docx）
└── tests/
    ├── smoke.mjs         # node:test：插件形状 + 注册对象 + 正文锚点
    ├── test_md2docx.py   # unittest：转换脚本（标题/加粗/表格/图片/代码块/占位）
    └── fixtures/         # sample.md + fig.png 转换样例
```

```bash
node --test tests/smoke.mjs          # 或 npm test
python3 tests/test_md2docx.py        # 转换脚本测试（需 python-docx）
```

源码改动（含 skill.md）需重启 `dsh web` 再开新会话验证（同本仓库其他插件的约定）。
