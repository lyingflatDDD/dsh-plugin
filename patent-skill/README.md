# dsh-patent-skill

上游专利技能适配包：把 [handsomestWei/patent-disclosure-skill](https://github.com/handsomestWei/patent-disclosure-skill)
（中国专利 .skill，AgentSkills 标准布局）以 runtime skill 形式注册进「技术交底书」agent 预设。

上游能力（八个子技能，根 `SKILL.md` 路由）：交底书（发明/实用新型/外观）、申请文件四件套、
案卷会稿（交底+申请一条龙）、著录检索、通俗解读、专利地图、审查答复辅助、政策简报，
附 Python 工具链（mermaid 框图、docx 定稿、CNIPA 公布公告检索、线稿/CAD 投影）。

零 npm 依赖：纯 ESM JavaScript（Node >= 20），无构建步骤，仅宿主半边（无浏览器 UI）。
上游仓库整体 vendor 在 `vendor/patent-disclosure-skill/`（含其 `.git`，便于 `git pull` 更新）。

## 与 dsh-patent-disclosure 的分工（同一预设内两枚技能）

| 技能 | 职责 | 触发 |
| --- | --- | --- |
| `tech-disclosure`（dsh-patent-disclosure） | **发明交底书默认路径**：公司六段模板 + 预审教训规则 + matplotlib 流程图 + 固定 md2docx | 交底书工作默认加载 |
| `patent-disclosure-skill`（本包） | 实用新型/外观交底、交底查新、申请文件、案卷、著录检索、解读、地图、审查答复、政策简报 | 用户点名或需要上游独有工具链时 |

注册正文的头部（`src/index.js` 的 `buildContent`）写明了这条分工与安装根绝对路径、
工作目录、依赖分级约定，之后拼接上游根 `SKILL.md`（剥掉 YAML frontmatter）。

## 架构

与 `dsh-patent-disclosure` 相同：**不走 `~/.dsh/cordis.patch.yml`**（host patch 是全局层，
`ctx.skills.register()` 会泄漏给所有会话），只被预设组合行挂载，技能落在预设自己的 scope 层：

```
~/.dsh/.agent-presets/patent-disclosure/agent.cordis.yml   # 预设垫片
        └── - id: cn-patent-skill
              name: dsh-patent-skill                        # 裸包名，解析到本目录（link 安装）
              # 后备写法：file:///home/cxiao/code/dsh-plugin/patent-skill/src/index.js
```

## 安装

```bash
# 1. 包可按裸名解析（写 ~/.dsh/profiles/web，pnpm link）
cd /home/cxiao/code/dsh-plugin
dsh plugin --profile web add link:./patent-skill

# 2. 预设垫片 agent.cordis.yml 在 disclosure-skill 行后追加：
#      - id: cn-patent-skill
#        name: dsh-patent-skill
#    （若会话报 Cannot find package，把 name 换成上面的 file:// 绝对路径写法）

# 3. 重启 dsh web，新会话选「技术交底书」预设
```

首次 vendored 克隆（本机已完成，新环境需重跑）：

```bash
mkdir -p vendor && git clone --depth 1 \
  https://github.com/handsomestWei/patent-disclosure-skill vendor/patent-disclosure-skill
```

## 上游版本

| 项 | 值 |
| --- | --- |
| 上游版本 | 4.7.0（frontmatter `version`） |
| vendored commit | `9865135dc5fb603372f959745d7712c9a358b609`（2026-09-14，shallow） |
| 更新方式 | `git -C vendor/patent-disclosure-skill pull --depth 1` 后重启 `dsh web` |

## 运行环境（按需，技能自身会探测与分级安装）

- Python ≥ 3.9 + pip；主依赖 `vendor/patent-disclosure-skill/requirements.txt`
  （python-docx、playwright、latex2mathml、PyYAML 等）。
- 出图 / CNIPA 查新需本机 Chrome 或 Edge；探测：
  `python vendor/patent-disclosure-skill/skills/patent-disclosure/tools/browser.py --probe`。
- 可选（各自门禁确认后才装）：CadQuery（STEP）、matplotlib（公式 PNG）、
  patent-oa 向量库、Obsidian（解读入库）。

## 回滚

```bash
# 预设垫片里删掉 cn-patent-skill 行（或整段还原 persona）
dsh plugin --profile web remove dsh-patent-skill
```

## 开发

```
patent-skill/
├── package.json          # 零依赖, "type": "module"
├── src/
│   └── index.js          # 宿主半边：inject ['skills']，注册 patent-disclosure-skill 路由技能
├── vendor/
│   └── patent-disclosure-skill/   # 上游仓库快照（含 .git）
└── tests/
    └── smoke.mjs         # node:test：插件形状 + vendor 完整性 + 注册对象 + 正文组装 + 锚点
```

```bash
npm test
```

源码改动（含 vendor 内上游文件）需重启 `dsh web` 再开新会话验证（同本仓库其他插件的约定）。
