import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import {
  name,
  inject,
  apply,
  SKILL_NAME,
  skillRoot,
  stripFrontmatter,
  frontmatterField,
  buildContent,
} from '../src/index.js'
const plugin = { name, inject, apply }

const here = dirname(fileURLToPath(import.meta.url))
const root = skillRoot()
const upstreamSkill = join(root, 'SKILL.md')

test('plugin shape: name / inject / apply', () => {
  assert.equal(plugin.name, 'cn-patent-skill')
  assert.deepEqual(plugin.inject, ['skills'])
  assert.equal(typeof plugin.apply, 'function')
})

test('vendored upstream repo is present with its router entry', () => {
  assert.ok(existsSync(upstreamSkill), `missing ${upstreamSkill}; run the clone step from the README`)
  for (const sub of [
    'patent-disclosure',
    'patent-application',
    'patent-docket',
    'patent-search',
    'patent-reader',
    'patent-map',
    'patent-oa',
    'patent-exam-policy',
  ]) {
    assert.ok(existsSync(join(root, 'skills', sub, 'SKILL.md')), `missing subskill ${sub}`)
  }
  assert.ok(existsSync(join(root, 'requirements.txt')), 'main requirements.txt must exist')
})

test('apply registers exactly one well-formed patent-disclosure-skill skill', () => {
  const registrations = []
  const disposers = []
  const ctx = {
    effect(fn, label) {
      assert.equal(typeof label, 'string')
      disposers.push(fn())
      return () => {}
    },
    skills: {
      register(definition) {
        registrations.push(definition)
        return () => {}
      },
    },
  }
  plugin.apply(ctx)
  assert.equal(registrations.length, 1)
  const [skill] = registrations
  assert.equal(skill.name, SKILL_NAME)
  assert.equal(skill.name, 'patent-disclosure-skill')
  assert.equal(skill.source, 'runtime', 'source must be a string or skills.get() rejects the skill')
  assert.ok(skill.description.length > 0, 'description must be non-empty')
  assert.ok(skill.whenToUse.length > 0, 'whenToUse must be non-empty')
  assert.ok(skill.content.length > 2000, 'skill body must be substantial')
  assert.ok(disposers.length === 1 && typeof disposers[0] === 'function', 'one disposer returned')
})

test('skill name is valid kebab-case for the skills registry', () => {
  assert.match(SKILL_NAME, /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
})

test('stripFrontmatter removes the discovery metadata block', () => {
  const raw = readFileSync(upstreamSkill, 'utf8')
  const body = stripFrontmatter(raw)
  assert.ok(!body.startsWith('---'), 'frontmatter fence must be gone')
  assert.ok(!body.includes('user-invocable:'), 'frontmatter fields must not leak into content')
  assert.ok(raw.startsWith('---'), 'upstream SKILL.md still carries frontmatter (fixture sanity)')
})

test('content equals the DSH header prepended to the upstream body', () => {
  const raw = readFileSync(upstreamSkill, 'utf8')
  const expected = buildContent(root)
  const contentViaApply = (() => {
    const registrations = []
    const ctx = {
      effect: fn => { fn(); return () => {} },
      skills: { register: d => { registrations.push(d); return () => {} } },
    }
    plugin.apply(ctx)
    return registrations[0].content
  })()
  assert.equal(contentViaApply, expected, 'apply() must register exactly buildContent()')
  assert.ok(expected.includes(root), 'header must carry the absolute skill root')
  assert.ok(expected.startsWith('# patent-disclosure-skill'), 'header must lead the content')
})

test('upstream frontmatter name matches the registered skill name', () => {
  const raw = readFileSync(upstreamSkill, 'utf8')
  assert.equal(frontmatterField(raw, 'name'), SKILL_NAME)
})

test('content covers the routing table and the checklist anchors', () => {
  const body = buildContent(root)
  for (const anchor of [
    '技能安装根',
    'tech-disclosure',
    '实用新型 / 外观设计交底',
    '中国专利技能',
    'skills/patent-disclosure/SKILL.md',
    'skills/patent-exam-policy/SKILL.md',
    '禁止跨包调用',
    '执行前核对',
  ]) {
    assert.ok(body.includes(anchor), `skill body must mention ${anchor}`)
  }
})
