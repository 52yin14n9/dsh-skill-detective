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


test('market and update views retain the explicitly selected temporary session', async () => {
  const service = new SkillDetective({ get: () => undefined, logger: { info() {} } })
  service.listInstalled = async (_workspace, options = {}) => options.sessionId === 'session-one'
    ? [{ name: 'word-docx', managed: true, version: '0.1.0', scope: 'temp', sessionId: 'session-one' }]
    : []
  assert.equal((await service.market('fixture', { sessionId: 'session-one' })).find(row => row.name === 'word-docx').installed, true)
  assert.equal((await service.market('fixture', { sessionId: 'session-two' })).find(row => row.name === 'word-docx').installed, false)
  assert.equal((await service.updates('fixture', { sessionId: 'session-one' })).length, 1)
  assert.equal((await service.updates('fixture', { sessionId: 'session-two' })).length, 0)
})


function recommendationService() {
  const service = new SkillDetective({ get: () => undefined, logger: { info() {} } })
  service.state = { data: { suppressed: {}, sessions: { session: true }, deleted: {} }, async load() { return this.data }, async update(fn) { return fn(this.data) } }
  return service
}

test('each fresh pending recommendation receives a unique ID', async () => {
  const service = recommendationService()
  service.defaultWorkspace = () => '/work'
  let key = 'first'
  service.analyze = async () => ({ actionable: true, need: 'open', needKey: key, label: key, covered: null, candidates: [] })
  await service.onUserMessage({ id: 'session' }, { content: 'First request' })
  const first = service.pending.get('session').id
  key = 'second'
  await service.onUserMessage({ id: 'session' }, { content: 'Second request' })
  const second = service.pending.get('session').id
  assert.match(first, /^[0-9a-f-]{36}$/)
  assert.notEqual(first, second)
})

test('dismiss only clears or suppresses the matching recommendation ID', async () => {
  const service = recommendationService()
  const newer = { id: 'newer', need: 'open', suppressionKey: 'open:newer', label: 'Newer', candidates: [] }
  service.pending.set('session', newer)
  for (const suppress of [false, true]) {
    await service.dismiss('session', 'older', { suppress })
    assert.equal(service.pending.get('session'), newer)
    assert.deepEqual(service.state.data.suppressed, {})
  }
  await service.dismiss('session', '')
  assert.equal(service.pending.get('session'), newer)
  await service.dismiss('session', 'newer')
  assert.equal(service.pending.has('session'), false)
  assert.deepEqual(service.state.data.suppressed, {}, 'Success acknowledgement never persists suppression')
  service.pending.set('session', newer)
  await service.dismiss('session', 'newer', { suppress: true })
  assert.equal(service.pending.has('session'), false)
  assert.equal(service.state.data.suppressed['open:newer'].label, 'Newer')
})

test('a newer pending recommendation survives replacement during suppression persistence', async () => {
  const service = recommendationService()
  service.pending.set('session', { id: 'older', need: 'catalog:older', label: 'Older' })
  let persist
  service.state.update = async fn => { await new Promise(resolve => { persist = resolve }); fn(service.state.data) }
  const dismissal = service.dismiss('session', 'older', { suppress: true })
  const newer = { id: 'newer', need: 'catalog:newer', label: 'Newer' }
  service.pending.set('session', newer)
  persist()
  await dismissal
  assert.equal(service.pending.get('session'), newer)
  assert.equal(service.state.data.suppressed['catalog:older'].label, 'Older')
  assert.equal(service.state.data.suppressed['catalog:newer'], undefined)
})
