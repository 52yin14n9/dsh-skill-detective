import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises'
import { createServer } from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const artifacts = resolve(process.env.DSH_TEST_ARTIFACTS ?? join(project, '../test-artifacts/fix-2026-11-13'))
const root = join(artifacts, `storage-api-${randomUUID()}`)
await mkdir(root, { recursive: true })
process.env.DSH_HOME = join(root, 'dsh-home')
const { apply, __test } = await import('../index.js')
const { JsonStore, StateStore, readJsonFile, writeJsonFile } = __test

test('corrupt or non-object state is preserved and cannot be silently overwritten', async () => {
  for (const [label, contents] of [['syntax', '{broken'], ['array', '[]'], ['null', 'null']]) {
    const file = join(root, `${label}.json`)
    await writeFile(file, contents)
    await assert.rejects(readJsonFile(file), { code: 'state-corrupt' })
    await assert.rejects(writeJsonFile(file, { replacement: true }), { code: 'state-corrupt' })
    assert.equal(await readFile(file, 'utf8'), contents)
  }
  assert.equal(await readJsonFile(join(root, 'missing.json')), null)
  await assert.rejects(readJsonFile(root), error => error.code !== 'ENOENT')
})

test('JSON replacement keeps the last valid backup and no shared temporary file', async () => {
  const file = join(root, 'backup.json')
  await writeJsonFile(file, { counter: 1 })
  await writeJsonFile(file, { counter: 2 })
  assert.deepEqual(await readJsonFile(file), { counter: 2 })
  assert.deepEqual(await readJsonFile(`${file}.bak`), { counter: 1 })
  assert.ok(!(await readdir(root)).some(name => name.endsWith('.tmp')))
})

test('different store instances serialize read-modify-write without losing panel actions', async () => {
  const file = join(root, 'parallel.json')
  const stores = [new JsonStore(file), new JsonStore(file)]
  await Promise.all(Array.from({ length: 16 }, (_, index) => stores[index % 2].update(async data => {
    const before = data.count ?? 0
    await new Promise(resolve => setImmediate(resolve))
    data.count = before + 1
  })))
  assert.equal((await readJsonFile(file)).count, 16)
})

test('failed mutations and failed saves restore both in-memory and persisted state', async () => {
  const file = join(root, 'rollback.json')
  const store = new JsonStore(file)
  await store.update(data => { data.count = 7 })
  await assert.rejects(store.update(data => { data.count = 99; throw new Error('fixture mutation failure') }))
  assert.equal((await store.load()).count, 7)
  assert.equal((await readJsonFile(file)).count, 7)
  const save = store.save
  store.save = async () => { throw new Error('fixture disk failure') }
  await assert.rejects(store.update(data => { data.count = 100 }), /fixture disk failure/)
  assert.equal((await store.load()).count, 7)
  assert.equal((await readJsonFile(file)).count, 7)
  store.save = save
  await store.update(data => { data.count += 1 })
  assert.equal((await readJsonFile(file)).count, 8)
})

test('state metadata retains instance identity and rejects prototype dictionary keys', async () => {
  const file = join(root, 'instances.json')
  const record = { name: 'shared-skill', path: join(root, 'workspace-a/shared-skill'), workspace: join(root, 'workspace-a'), sessionId: 'live', installedAt: Date.now() }
  await writeJsonFile(file, { installs: { 'instance:fixture-a': record }, deleted: { 'instance:fixture-b': { ...record, at: Date.now(), group: 'test' } } })
  const store = new StateStore(file)
  const state = await store.load()
  assert.equal(state.installs['instance:fixture-a'].sessionId, 'live')
  assert.equal(state.deleted['instance:fixture-b'].path, record.path)
  const polluted = store.normalize(JSON.parse('{"installs":{"__proto__":{"installedAt":1}},"sessions":{"constructor":true},"suppressed":{"__proto__":{"at":1}}}'))
  assert.deepEqual(Object.keys(polluted.installs), [])
  assert.deepEqual(Object.keys(polluted.sessions), [])
  assert.deepEqual(Object.keys(polluted.suppressed), [])
  assert.equal({}.installedAt, undefined)
})

test('HTTP routes reject malformed bodies and select exact workspace skill instances', async () => {
  const workspaceA = join(root, 'workspace-a')
  const workspaceB = join(root, 'workspace-b')
  for (const workspace of [workspaceA, workspaceB]) {
    const dir = join(workspace, '.dsh/skills/shared-skill')
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, 'SKILL.md'), `---\nname: shared-skill\ndescription: "${workspace === workspaceA ? 'A' : 'B'}"\n---\n# Fixture\n`)
  }
  const events = new Map(), disposers = []
  let handler
  const scoped = { effect: fn => fn(), skills: { register: () => () => {} } }
  const services = {
    workingDirectory: { defaultDirectory: workspaceA },
    workspaceRegistry: { list: () => [{ path: workspaceA, title: 'A' }, { path: workspaceB, title: 'B' }] },
    skills: { list: async () => [], register: () => () => {} },
    agents: { get: id => id === 'session-live' ? { ctx: scoped } : undefined },
  }
  const ctx = {
    get: name => services[name], logger: { info() {} },
    effect(fn) { const dispose = fn(); if (typeof dispose === 'function') disposers.push(dispose); return dispose },
    on(name, fn) { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); return () => events.get(name).delete(fn) },
    emit(name, ...args) { for (const fn of events.get(name) ?? []) fn(...args) },
    inject(_names, fn) { return fn(ctx) },
    webServer: { register(route) { handler = route.handler; return () => {} } },
  }
  apply(ctx)
  const server = createServer((req, res) => { handler(req, res).catch(error => { res.statusCode = 500; res.end(JSON.stringify({ error: String(error) })) }) })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}/api/dsh-skill-detective`
  const request = async (path, body, headers = {}) => {
    const response = await fetch(`${base}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
      ...(body === undefined ? {} : { body: typeof body === 'string' ? body : JSON.stringify(body) }),
    })
    return { status: response.status, body: await response.json() }
  }
  try {
    for (const body of ['{invalid', 'null', '[]', '7']) assert.equal((await request('/settings', body)).status, 400)
    assert.equal((await request('/settings', '{}', { 'content-type': 'text/plain' })).status, 415)
    assert.equal((await request('/settings', { value: 'x'.repeat(513 * 1024) })).status, 413)
    assert.equal((await request('/settings', {}, { origin: 'https://foreign.invalid' })).status, 403)
    assert.equal((await request('/scan', {})).body.ok, true)
    const query = `?workspace=${encodeURIComponent(workspaceB)}&sessionId=session-live`
    const state = (await request(`/state${query}`)).body
    assert.equal(state.sessionAvailable, true)
    assert.equal(state.sessionId, 'session-live')
    assert.ok(state.sessions.some(session => session.id === 'session-live'))
    const target = state.installed.find(skill => skill.name === 'shared-skill')
    assert.equal(target.workspace, workspaceB)
    assert.ok(target.instanceId)
    const selector = { name: target.name, instanceId: target.instanceId, path: target.path, workspace: workspaceB, sessionId: 'session-live' }
    assert.equal((await request('/toggle', { ...selector, enabled: false })).body.ok, true)
    assert.doesNotMatch(await readFile(join(workspaceA, '.dsh/skills/shared-skill/SKILL.md'), 'utf8'), /disable-model-invocation: true/)
    assert.match(await readFile(join(workspaceB, '.dsh/skills/shared-skill/SKILL.md'), 'utf8'), /disable-model-invocation: true/)
    assert.equal((await request('/scope', { ...selector, scope: 'invalid' })).status, 400)
    assert.equal((await request('/toggle', { ...selector, enabled: 'false' })).status, 400)
    const mismatch = await request('/delete', { ...selector, path: join(workspaceA, '.dsh/skills/shared-skill') })
    assert.ok(mismatch.status >= 400 || mismatch.body.ok === false)
    const unavailable = (await request(`/state?workspace=${encodeURIComponent(workspaceB)}&sessionId=missing`)).body
    assert.equal(unavailable.sessionAvailable, false)
  } finally {
    for (const dispose of disposers.reverse()) await dispose()
    await new Promise(resolve => server.close(resolve))
  }
})
