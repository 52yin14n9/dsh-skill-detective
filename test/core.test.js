import test from 'node:test'
import assert from 'node:assert/strict'

import { __test } from '../index.js'

const {
  buildNeedInput,
  chooseSkillName,
  jsonFromText,
  normalizeAuditResult,
  pruneState,
  safeSessionId,
  sanitizeSkillName,
  setFrontmatterName,
  uniqueSkillName,
} = __test

test('sanitizeSkillName keeps valid names and slugifies the rest', () => {
  assert.equal(sanitizeSkillName('word-docx'), 'word-docx')
  assert.equal(sanitizeSkillName('My Cool Skill'), 'my-cool-skill')
  assert.equal(sanitizeSkillName('  --Hello--World--  '), 'hello-world')
  const chinese = sanitizeSkillName('数据分析助手')
  assert.match(chinese, /^skill-[a-f0-9]{8}$/)
  assert.equal(chinese, sanitizeSkillName('数据分析助手'))
  assert.equal(sanitizeSkillName(''), '')
})

test('uniqueSkillName appends a numeric suffix without colliding', () => {
  const taken = new Set(['pdf-toolkit', 'pdf-toolkit-2'])
  assert.equal(uniqueSkillName('pdf-toolkit', taken), 'pdf-toolkit-3')
  assert.equal(uniqueSkillName('brand-new', taken), 'brand-new')
})

test('jsonFromText accepts bare and fenced replies', () => {
  assert.deepEqual(jsonFromText('{"a":1}'), { a: 1 })
  assert.deepEqual(jsonFromText('前缀\n```json\n{"a":2}\n```\n后缀'), { a: 2 })
  assert.equal(jsonFromText('not json'), null)
})

test('normalizeAuditResult blocks high findings and malicious verdicts', () => {
  const malicious = normalizeAuditResult({ verdict: 'malicious', summary: 'x' })
  assert.equal(malicious.poison, true)
  assert.equal(malicious.severity, 'high')

  const exfiltration = normalizeAuditResult({
    verdict: 'safe',
    severity: 'low',
    findings: [{ file: 'run.sh', severity: 'high', rule: 'exfiltration', detail: 'post .env' }],
  })
  assert.equal(exfiltration.poison, true)

  const clean = normalizeAuditResult({
    verdict: 'safe',
    findings: [],
    summary: '读取表格',
    capabilities: ['读取 xlsx'],
    triggers: ['打开表格'],
    slug: 'Sheet Reader',
  })
  assert.equal(clean.poison, false)
  assert.deepEqual(clean.capabilities, ['读取 xlsx'])
  assert.equal(clean.slug, 'sheet-reader')

  assert.equal(normalizeAuditResult(null), null)
})

test('pruneState bounds every collection that used to grow forever', () => {
  const now = Date.now()
  const old = now - 400 * 86_400_000
  const recent = now - 1_000
  const state = {
    sessions: { old: { at: old }, recent: { at: recent } },
    suppressed: { old: { at: old, label: 'x' }, recent: { at: recent, label: 'y' } },
    deleted: { old: { at: old }, recent: { at: recent } },
    installs: { 'a-skill': { installedAt: recent } },
    discovered: { 'b-skill': { at: old, path: '/x', file: '/x/SKILL.md' } },
  }
  pruneState(state, now)
  assert.deepEqual(Object.keys(state.sessions), ['recent'])
  assert.deepEqual(Object.keys(state.suppressed), ['recent'])
  assert.deepEqual(Object.keys(state.deleted), ['recent'])
  assert.deepEqual(Object.keys(state.installs), ['a-skill'])
  assert.equal(state.discovered, undefined)
})

test('chooseSkillName prefers the model slug for a Chinese label', () => {
  assert.deepEqual(
    chooseSkillName('PDF 处理助手', 'pdf', 'pdf-processing'),
    { name: 'pdf-processing', displayName: 'PDF 处理助手' },
  )
  assert.deepEqual(
    chooseSkillName('My Skill', 'x', ''),
    { name: 'my-skill', displayName: 'My Skill' },
  )
  assert.deepEqual(
    chooseSkillName('pdf-toolkit', 'x', 'ignored'),
    { name: 'pdf-toolkit', displayName: '' },
  )
})

test('safeSessionId cannot escape the temp root', () => {
  const escaped = safeSessionId('../../evil')
  assert.ok(!escaped.includes('/'))
  assert.ok(!escaped.includes('\\'))
  assert.notEqual(escaped, '..')
  assert.equal(safeSessionId(''), 'shared')
  assert.equal(safeSessionId('a/b c'), 'a_b_c')
})

test('setFrontmatterName keeps directory, frontmatter and link in agreement', () => {
  const text = '---\nname: pdf-toolkit\ndescription: "x"\n---\n\n# body\n'
  const renamed = setFrontmatterName(text, 'pdf-toolkit-2')
  assert.match(renamed, /^name: pdf-toolkit-2$/m)
  assert.match(renamed, /description: "x"/)
  assert.match(renamed, /# body/)
  assert.equal(setFrontmatterName('# no frontmatter', 'x'), '# no frontmatter')
})

test('buildNeedInput includes the message, installed summaries and catalog names', () => {
  const prompt = buildNeedInput('帮我做个数据看板', [
    { name: 'sqlite-query', summary: '查询 SQLite 并导出', displayName: '' },
  ])
  assert.match(prompt, /帮我做个数据看板/)
  assert.match(prompt, /sqlite-query/)
  assert.match(prompt, /pdf-toolkit/)
})
