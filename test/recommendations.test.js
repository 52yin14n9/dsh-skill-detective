import test from 'node:test'
import assert from 'node:assert/strict'
import { __test } from '../index.js'

const { SkillDetective, replacementGroupOf, isReplacementSkill, compareSkillVersions } = __test

test('related file formats are not automatically interchangeable skills', () => {
  for (const [left, right] of [
    ['word-docx', 'markdown-writer'], ['word-docx', 'html-report'],
    ['excel-report', 'csv-tools'], ['excel-report', 'chart-maker'],
    ['json-formatter', 'data-cleaner'], ['api-mock', 'http-client'],
    ['unit-test-helper', 'code-review'],
  ]) assert.equal(isReplacementSkill({ name: left }, { name: right }), false, `${left} vs ${right}`)
  assert.equal(replacementGroupOf({ name: 'word-docx-pro' }), 'word-docx')
  assert.equal(isReplacementSkill({ name: 'word-docx-pro' }, { name: 'word-docx' }), true)
})

test('update comparison follows numeric and prerelease ordering and rejects unknown versions', () => {
  assert.equal(compareSkillVersions('1.10.0', '1.9.9'), 1)
  assert.equal(compareSkillVersions('1.2.0', '99.0.0'), -1)
  assert.equal(compareSkillVersions('1.2.0', '1.2.0-rc.2'), 1)
  assert.equal(compareSkillVersions('1.2.0-rc.10', '1.2.0-rc.2'), 1)
  assert.equal(compareSkillVersions('1.2.0+build.1', '1.2.0+build.2'), 0)
  assert.equal(compareSkillVersions('1.2.0-rc.1', '1.2.0-rc.1.extra'), -1)
  assert.equal(compareSkillVersions('1.2.0-1', '1.2.0-alpha'), -1)
  for (const invalid of ['unknown', '1.2', '01.2.3', '1.2.3-01', '1.2.3-alpha..1', '1.2.3+']) {
    assert.equal(compareSkillVersions(invalid, '1.0.0'), null)
  }
})

test('updates never recommend a catalog downgrade or a different output format', async () => {
  const service = new SkillDetective({ get: () => undefined, logger: { info() {} } })
  service.listInstalled = async () => [
    { name: 'word-docx', managed: true, version: '99.0.0', category: '文档', installs: 0 },
    { name: 'excel-report', managed: true, version: '2.0.1', category: '数据', installs: 0 },
  ]
  const updates = await service.updates('fixture')
  assert.equal(updates[0].newer, null)
  assert.equal(updates[0].suggestion, null)
  assert.equal(updates[1].suggestion, null)
  assert.equal(updates[1].top.name, 'excel-report')
})
