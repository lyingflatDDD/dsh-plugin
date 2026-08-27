/**
 * dsh-patent-disclosure — 宿主半边。
 *
 * 为 `patent-disclosure` 预设注册 `tech-disclosure` runtime skill（技术交底书
 * 写作方法论）。本包【不】进入 `~/.dsh/cordis.patch.yml`：host patch 行是全局
 * 的，会把 skill 泄漏给所有会话。它只被预设组合行挂载（preset shim 的
 * agent.cordis.yml 引用 `dsh-patent-disclosure` 裸包名，或本文件的 file://
 * 绝对路径后备写法），因此 ctx.skills.register() 落在该预设的 scope 层，
 * 仅对选择「技术交底书」预设的会话可见。
 *
 * 零依赖、纯 ESM；只用 node: 内置模块。skill 正文在 src/skill.md，apply 时
 * 读取——编辑 skill.md 后需要新的挂载（重启 `dsh web`）才生效，与本仓库其他
 * 插件「源码改动需重启」的约定一致。
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Cordis plugin name（loader 诊断用）。 */
export const name = 'patent-disclosure-skill'

/** 宿主 skill 注册表；host 组合提供，预设行在其 scope 层内解析。 */
export const inject = ['skills']

/** 注册的 skill 名（kebab-case，会话内 `skill tech-disclosure` 加载）。 */
export const SKILL_NAME = 'tech-disclosure'

/**
 * 注册 tech-disclosure skill。
 *
 * @param {import('@deepseek-ai/cordis').Context} ctx - 预设挂载的 scope context
 */
export function apply(ctx) {
  const here = dirname(fileURLToPath(import.meta.url))
  // 挂载时读取而非内联：方法论迭代只改 skill.md，不动本文件。
  const content = readFileSync(join(here, 'skill.md'), 'utf8')
  ctx.effect(() => ctx.skills.register({
    name: SKILL_NAME,
    // register() 只给 invocation/provider 兜底；source 是必填项，缺失时
    // 注册不报错，但 skill 工具加载正文时 validateDefinition() 会抛
    // `loaded skill "..." source must be a string`。runtime 注册固定 'runtime'。
    source: 'runtime',
    description:
      '撰写技术交底书：从代码仓库或结构化访谈中提炼发明方案，按公司六段模板产出草稿，'
      + '自动编写并运行流程图实现代码，产出供专利代理人使用。',
    whenToUse:
      '用户要求写技术交底书/专利交底/整理发明方案，或本会话需要产出、修订交底书文档时。'
      + '开始交底书工作前必读。',
    content,
  }), 'patent-disclosure skill')
}
