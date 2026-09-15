/**
 * dsh-patent-skill — 宿主半边。
 *
 * 把上游仓库 handsomestWei/patent-disclosure-skill（中国专利 .skill，AgentSkills
 * 标准布局：根 SKILL.md 路由 + skills/patent-* 八个子技能 + Python 工具链）以
 * runtime skill 的形式注册进「技术交底书」预设。
 *
 * 本包【不】进入 `~/.dsh/cordis.patch.yml`：host patch 行是全局的，会把 skill
 * 泄漏给所有会话（与 dsh-patent-disclosure 同一理由）。它只被预设组合行挂载
 * （预设垫片 agent.cordis.yml 引用裸包名 `dsh-patent-skill`），因此
 * ctx.skills.register() 落在该预设自己的 scope 层。
 *
 * 上游仓库整体 vendor 在本包 `vendor/patent-disclosure-skill/`（保留其 .git，
 * 更新 = 在该目录 `git pull` 后重启 `dsh web`）。注册的 skill 正文 =
 * DSH 适配头部（安装根绝对路径 / 工作目录 / 依赖分级 / 与 tech-disclosure 的
 * 分工路由）+ 上游根 SKILL.md 正文（YAML frontmatter 剥离）。
 *
 * 零 npm 依赖、纯 ESM；只用 node: 内置模块。
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Cordis plugin name（loader 诊断用；与旧包的 'patent-disclosure-skill' 区分）。 */
export const name = 'cn-patent-skill'

/** 宿主 skill 注册表；host 组合提供，预设行在其 scope 层内解析。 */
export const inject = ['skills']

/** 注册的 skill 名（沿用上游 SKILL.md frontmatter 的 name，会话内按名加载）。 */
export const SKILL_NAME = 'patent-disclosure-skill'

/** 上游仓库在本包内的 vendor 路径（相对 src/）。 */
const VENDOR_DIR = 'vendor/patent-disclosure-skill'

/** 上游技能安装根（命令相对该根拼接）。 */
export function skillRoot() {
  const here = dirname(fileURLToPath(import.meta.url))
  return join(here, '..', VENDOR_DIR)
}

/** 剥离 SKILL.md 顶部的 YAML frontmatter（Claude/Cursor 的技能发现元数据）。 */
export function stripFrontmatter(raw) {
  if (!raw.startsWith('---')) return raw
  const end = raw.indexOf('\n---', 3)
  if (end === -1) return raw
  const after = raw.indexOf('\n', end + 1)
  return after === -1 ? '' : raw.slice(after + 1)
}

/** 从 frontmatter 取字符串字段的值（引号可选，取不到返回 null）。 */
export function frontmatterField(raw, field) {
  const m = raw.match(new RegExp(`^${field}:\\s*"?([^"\n]+)"?`, 'm'))
  return m ? m[1].trim() : null
}

/**
 * 组装注册正文：DSH 适配头部 + 上游根 SKILL.md 正文。
 *
 * @param {string} root - 上游技能安装根（绝对路径）
 * @returns {string}
 */
export function buildContent(root) {
  const raw = readFileSync(join(root, 'SKILL.md'), 'utf8')
  const header = `# patent-disclosure-skill（上游中国专利技能 · DSH 适配头部）

以下正文来自上游仓库 \`handsomestWei/patent-disclosure-skill\` 的根 \`SKILL.md\`（八个子技能的路由入口）。在 DSH 中先遵守本头部的适配约定，再按正文路由执行：

- **技能安装根**：\`${root}\`（上游仓库快照）。正文与上游文档中的所有相对路径（\`skills/...\`、\`requirements.txt\`、\`docs/...\`）一律相对该根拼接成绝对路径再执行；不要依赖任何厂商环境变量。
- **工作目录**：运行任何 \`python\` 脚本时 cwd 用当前会话工作区；产出按正文约定写工作区 \`outputs/\` 下的对应子目录，绝不写入技能安装根。
- **依赖分级**：Python ≥ 3.9 + pip 是主路径（\`${root}/requirements.txt\`：python-docx、playwright 等）；出图与 CNIPA 查新还需本机 Chrome 或 Edge。首次使用先探测：\`python ${root}/skills/patent-disclosure/tools/browser.py --probe\`，再按探测结果与上游 INSTALL.md 的分级说明安装或降级；CadQuery（STEP 解析）、matplotlib（公式 PNG）、审查答复向量库等可选依赖只在上游各自的门禁确认后安装，不要预先全量安装。
- **与同一预设的 \`tech-disclosure\` 技能分工**：发明交底书（公司六段模板）默认加载 \`tech-disclosure\` 执行，**不要因发明交底自动进入本技能**。本技能负责：实用新型 / 外观设计交底、交底查新、申请文件四件套、案卷会稿（交底+申请一条龙）、著录检索、通俗解读、专利地图、审查答复辅助、政策简报，以及用户点名上游技能或明确需要其独有工具链（mermaid 框图、docx 定稿、CNIPA 检索）的场合。
- **脚本判读**：以退出码与机读前缀（\`EPUB_*\`、\`PROBE:\`、\`BROWSER:\`、\`MERMAID:\`、\`DOCX:\`、\`APPLICATION_*\`、\`DOCKET_*\`、\`MAP_*\`）为准；stderr 有输出不等于失败，禁止据此重跑安装或降级检索。

---

（以下为上游根 SKILL.md 正文）

`
  return header + stripFrontmatter(raw).trimStart()
}

/**
 * 注册 patent-disclosure-skill 路由技能。
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - 预设挂载的 scope context
 */
export function apply(ctx) {
  const root = skillRoot()
  const content = buildContent(root)
  ctx.effect(() => ctx.skills.register({
    name: SKILL_NAME,
    // register() 只给 invocation/provider 兜底；source 必填，缺失时 skill 工具
    // 加载正文会抛 `loaded skill "..." source must be a string`。固定 'runtime'。
    source: 'runtime',
    description:
      '上游中国专利技能（handsomestWei/patent-disclosure-skill）路由入口：实用新型/外观交底、'
      + '交底查新、申请文件四件套、案卷会稿、著录检索、通俗解读、专利地图、审查答复辅助、'
      + '政策简报；附 Python 工具链（mermaid 框图、docx 定稿、CNIPA 检索）。',
    whenToUse:
      '用户需要实用新型/外观设计交底、交底查新、把已有交底改写成申请文件、交底+申请一条龙（案卷）、'
      + '按著录字段检索公布公告、通俗解读专利、专利地图、审查意见答复或政策简报时；或用户点名'
      + ' patent-disclosure-skill / 其子技能入口时。发明交底默认走 tech-disclosure（公司六段模板），'
      + '不要因发明交底自动进入本技能。',
    content,
  }), 'cn-patent-skill (upstream patent-disclosure-skill router)')
}
