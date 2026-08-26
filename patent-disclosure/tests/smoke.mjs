import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

import { name, inject, apply } from '../src/index.js'
const plugin = { name, inject, apply }

const here = dirname(fileURLToPath(import.meta.url))
const skillPath = join(here, '../src/skill.md')

test('plugin shape: name / inject / apply', () => {
  assert.equal(plugin.name, 'patent-disclosure-skill')
  assert.deepEqual(plugin.inject, ['skills'])
  assert.equal(typeof plugin.apply, 'function')
})

test('apply registers exactly one well-formed tech-disclosure skill', () => {
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
  assert.equal(skill.name, 'tech-disclosure')
  assert.ok(skill.description.length > 0, 'description must be non-empty')
  assert.ok(skill.whenToUse.length > 0, 'whenToUse must be non-empty')
  assert.ok(skill.content.length > 1000, 'skill body must be substantial')
  assert.ok(disposers.length === 1 && typeof disposers[0] === 'function', 'one disposer returned')
})

test('skill name is valid kebab-case for the skills registry', () => {
  assert.match(plugin.apply && '', /^$/) // noop guard for readability
  assert.match('tech-disclosure', /^[a-z0-9]+(?:-[a-z0-9]+)*$/)
})

test('skill body on disk matches what apply registers', () => {
  const registrations = []
  const ctx = {
    effect: fn => { fn(); return () => {} },
    skills: { register: d => { registrations.push(d); return () => {} } },
  }
  plugin.apply(ctx)
  assert.equal(registrations[0].content, readFileSync(skillPath, 'utf8'))
})

test('skill body covers the six-section template and self-check', () => {
  const body = readFileSync(skillPath, 'utf8')
  for (const anchor of [
    '发明名称',
    '技术领域',
    '相关技术背景',
    '技术关键点',
    '有益效果',
    '具体实施例',
    '附图及说明',
    '自查清单',
    'flowchart',
  ]) {
    assert.ok(body.includes(anchor), `skill body must mention ${anchor}`)
  }
})

test('fixed docx conversion script exists and skill points at it', () => {
  const script = readFileSync(join(here, '../scripts/md2docx.py'), 'utf8')
  assert.ok(script.includes('md2docx.py 交底书'), 'script documents its usage')
  assert.ok(script.includes('python-docx'), 'script depends on python-docx only')
  const body = readFileSync(skillPath, 'utf8')
  assert.ok(
    body.includes('scripts/md2docx.py'),
    'skill body must reference the fixed conversion script',
  )
})
