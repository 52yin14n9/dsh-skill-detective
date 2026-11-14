import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, symlink, lstat, readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { __test } from '../index.js'

const artifactRoot = resolve(process.env.DSH_TEST_ARTIFACTS || '../test-artifacts/fix-2026-11-13')
await mkdir(artifactRoot, { recursive: true })
const run = await mkdtemp(join(artifactRoot, 'symlink-safety-'))
const fixtures = []
after(async () => { await writeFile(join(run, 'manifest.json'), JSON.stringify(fixtures, null, 2)) })
const markdown = '---\nname: linked-skill\ndescription: outside sentinel\n---\n\nOriginal external content\n'

async function fixture(t) {
  const dir = await mkdtemp(join(run, 'case-'))
  fixtures.push({ test: t.name, dir })
  const skill = join(dir, 'skills', 'linked-skill'), outside = join(dir, 'outside')
  await mkdir(skill, { recursive: true }); await mkdir(outside)
  const sentinel = join(outside, 'SKILL.md')
  await writeFile(sentinel, markdown)
  const service = new __test.SkillDetective({ get() {}, emit() {}, logger: { info() {} } })
  service.normalizeWorkspace = () => dir
  const index = { skills: {} }, state = { installs: {}, deleted: {} }
  service.index = { data: index, load: async () => index, update: async fn => fn(index), save: async () => {} }
  service.state = { data: state, load: async () => state, update: async fn => fn(state), save: async () => {} }
  service.registryEntries = async () => []
  service.scanRoots = () => [{ root: join(dir, 'skills'), scope: 'workspace', workspace: dir }]
  const record = { name: 'linked-skill', instanceId: 'test-instance', path: skill, scope: 'workspace', workspace: dir, managed: true }
  service.selectInstalled = async () => record
  return { dir, skill, outside, sentinel, service, record, index, state }
}

async function link(t, target, path, type = 'file') {
  try {
    await symlink(target, path, type === 'dir' && process.platform === 'win32' ? 'junction' : type)
    if (!(await lstat(path)).isSymbolicLink()) {
      t.skip('Filesystem backend materialized the requested link as an ordinary entry')
      return false
    }
    return true
  }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip(`Symbolic links unavailable: ${error.code}`); return false }
    throw error
  }
}

const rejected = error => error.code === 'unsafe-symlink'

test('toggle rejects a linked SKILL.md without modifying the external file', async t => {
  const f = await fixture(t)
  if (!await link(t, f.sentinel, join(f.skill, 'SKILL.md'))) return
  await assert.rejects(f.service.toggle(f.record, false, f.dir), rejected)
  assert.equal(await readFile(f.sentinel, 'utf8'), markdown)
  assert.equal((await lstat(join(f.skill, 'SKILL.md'))).isSymbolicLink(), true)
})

test('atomic publish rejects a copied SKILL.md link before writing or replacing the directory', async t => {
  const f = await fixture(t)
  if (!await link(t, f.sentinel, join(f.skill, 'SKILL.md'))) return
  await assert.rejects(f.service.atomicPublish(f.skill, [{ path: 'SKILL.md', text: 'Changed' }], { copyFrom: f.skill, overwrite: true }), rejected)
  assert.equal(await readFile(f.sentinel, 'utf8'), markdown)
  assert.equal((await lstat(join(f.skill, 'SKILL.md'))).isSymbolicLink(), true)
  assert.deepEqual(await readdir(join(f.dir, 'skills')), ['linked-skill'])
})

test('atomic publish rejects writes through copied directory links', async t => {
  const f = await fixture(t)
  await writeFile(join(f.skill, 'SKILL.md'), markdown)
  if (!await link(t, f.outside, join(f.skill, 'references'), 'dir')) return
  await assert.rejects(f.service.atomicPublish(f.skill, [{ path: 'references/SKILL.md', text: 'Changed' }], { copyFrom: f.skill, overwrite: true }), rejected)
  assert.equal(await readFile(f.sentinel, 'utf8'), markdown)
  assert.deepEqual(await readdir(join(f.dir, 'skills')), ['linked-skill'])
})

test('scan does not index a skill with a linked main file', async t => {
  const f = await fixture(t)
  if (!await link(t, f.sentinel, join(f.skill, 'SKILL.md'))) return
  const result = await f.service.scanAll()
  assert.equal(result.total, 0)
  assert.deepEqual(f.index.skills, {})
  assert.equal(await readFile(f.sentinel, 'utf8'), markdown)
})

test('scope move rejects a linked main file before copying it', async t => {
  const f = await fixture(t)
  if (!await link(t, f.sentinel, join(f.skill, 'SKILL.md'))) return
  await assert.rejects(f.service.moveSkill(f.record, 'global', [], f.dir, ''), rejected)
  assert.equal(await readFile(f.sentinel, 'utf8'), markdown)
  assert.equal((await lstat(join(f.skill, 'SKILL.md'))).isSymbolicLink(), true)
})

test('delete rejects a skill directory reached through a linked parent', async t => {
  const f = await fixture(t)
  const externalSkill = join(f.outside, 'linked-skill')
  await mkdir(externalSkill); await writeFile(join(externalSkill, 'SKILL.md'), markdown)
  const alias = join(f.dir, 'alias')
  if (!await link(t, f.outside, alias, 'dir')) return
  f.record.path = join(alias, 'linked-skill')
  await assert.rejects(f.service.remove(f.record, f.dir), rejected)
  assert.equal(await readFile(join(externalSkill, 'SKILL.md'), 'utf8'), markdown)
})

test('delete removes a local directory containing links without touching their targets', async t => {
  const f = await fixture(t)
  await writeFile(join(f.skill, 'SKILL.md'), markdown)
  if (!await link(t, f.outside, join(f.skill, 'references'), 'dir')) return
  f.index.skills[f.record.instanceId] = f.record
  const result = await f.service.remove(f.record, f.dir)
  assert.equal(result.ok, true)
  assert.equal(await readFile(f.sentinel, 'utf8'), markdown)
  await assert.rejects(lstat(f.skill), { code: 'ENOENT' })
})
