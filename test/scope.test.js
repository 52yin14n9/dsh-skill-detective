import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdir, mkdtemp, writeFile, readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repo = dirname(dirname(fileURLToPath(import.meta.url)))
const artifactRoot = process.env.DSH_TEST_ARTIFACTS || resolve(repo, '../test-artifacts/fix-2026-11-13')
await mkdir(artifactRoot, { recursive: true })
const run = await mkdtemp(join(artifactRoot, 'scope-'))
const fixtures = []
let serial = 0
globalThis.fetch = async () => { throw new Error('Scope tests must not access the network') }

after(async () => {
  await writeFile(join(run, 'manifest.json'), JSON.stringify({ node: process.version, source: join(repo, 'index.js'), fixtures }, null, 2))
})

const markdown = (name, marker) => `---\nname: ${name}\ndescription: "${marker}"\n---\n\n# ${name}\n${marker}\n`

async function fixture(t) {
  const dir = await mkdtemp(join(run, 'case-'))
  const home = join(dir, 'dsh-home'), A = join(dir, 'workspace-a'), B = join(dir, 'workspace-b')
  await Promise.all([home, A, B].map(path => mkdir(path, { recursive: true })))
  fixtures.push({ test: t.name, dir, home, A, B })
  t.diagnostic(`Isolated files: ${dir}`)
  const before = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const { __test } = await import(`${pathToFileURL(join(repo, 'index.js')).href}?scope-regression=${++serial}`)
  if (before === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = before
  const active = new Map(), registrations = [], requests = [], agents = new Map()
  let rejectRegistration = false
  let rejectDisposal = false
  const pluginEffects = new Map(), agentEffects = new Map()
  function addSession(id) {
    const skills = new Map()
    active.set(id, skills)
    const effects = []
    agentEffects.set(id, effects)
    agents.set(id, { id, ctx: {
      effect(fn) { const dispose = fn(); effects.push(dispose); return dispose },
      skills: { register(skill) {
        if (rejectRegistration) {
          if (typeof rejectRegistration === 'number') rejectRegistration -= 1
          throw new Error('TEST_REGISTRATION_REJECTED')
        }
        if (skills.has(skill.name)) return () => {} // Live registry: duplicate runtime names are first-wins.
        const token = skill.name
        skills.set(token, skill)
        registrations.push({ kind: 'register', sessionId: id, name: skill.name })
        return () => { if (rejectDisposal) throw new Error('TEST_DISPOSAL_FAILED'); skills.delete(token); registrations.push({ kind: 'dispose', sessionId: id, name: skill.name }) }
      } },
    } })
  }
  addSession('session-1'); addSession('session-2')
  const services = {
    workingDirectory: { defaultDirectory: A },
    workspaceRegistry: { list: () => [{ path: A, title: 'A' }, { path: B, title: 'B' }] },
    skills: { list: async () => [] }, agents: { get: id => agents.get(id), list: () => [...agents.values()] },
  }
  function service() {
    const effects = []
    const value = new __test.SkillDetective({ get: key => services[key], emit() {}, effect(fn) { const dispose = fn(); effects.push(dispose); return dispose }, logger: { info() {} } })
    pluginEffects.set(value, effects)
    value.judge = { json: async request => {
      requests.push(request)
      return { ok: true, model: 'deterministic-local-stub', data: request.maxTokens === 400
        ? { actionable: true, coveredBy: 'shared-skill', suggestedSkill: '', confidence: 1, label: 'test', needKey: 'test', searchQuery: 'test' }
        : { verdict: 'safe', severity: 'low', poison: false, findings: [], summary: 'Deterministic test audit', capabilities: ['test'], triggers: ['test'], slug: '' } }
    } }
    return value
  }
  const detective = service()
  const disposePlugin = async (value = detective) => { for (const dispose of pluginEffects.get(value) || []) await dispose?.() }
  const disposeAgent = async id => { for (const dispose of agentEffects.get(id) || []) await dispose?.(); agents.delete(id) }
  async function put(root, name, marker) {
    const path = join(root, name)
    await mkdir(path, { recursive: true })
    await writeFile(join(path, 'SKILL.md'), markdown(name, marker))
    return path
  }
  const scan = () => detective.scanAll({ reason: 'scope-regression' })
  const selector = skill => ({ instanceId: skill.instanceId, path: skill.path, name: skill.name, workspace: skill.workspace || A, sessionId: skill.sessionId || '' })
  return { ...__test, dir, home, A, B, detective, service, put, scan, selector, services, active, registrations, requests, addSession, disposePlugin, disposeAgent, rejectRegistration: value => { rejectRegistration = value }, rejectDisposal: value => { rejectDisposal = value } }
}

test('a slow scan cannot overwrite an installation committed behind its snapshot', { timeout: 5_000 }, async t => {
  const f = await fixture(t)
  let entered, release, prepared
  const enteredGate = new Promise(resolve => { entered = resolve })
  const releaseGate = new Promise(resolve => { release = resolve })
  const preparedGate = new Promise(resolve => { prepared = resolve })
  const registry = f.detective.registryEntries.bind(f.detective)
  f.detective.registryEntries = async () => { entered(); await releaseGate; return registry() }
  const installPrepared = f.detective.installPrepared.bind(f.detective)
  f.detective.installPrepared = options => { prepared(); return installPrepared(options) }
  const scan = f.scan()
  await enteredGate
  let completed = false
  const install = f.detective.install({ name: 'word-docx', scope: 'workspace', workspace: f.A, sessionId: 'session-1' }).then(result => { completed = true; return result })
  await preparedGate
  try {
    await new Promise(resolve => setTimeout(resolve, 30))
    assert.equal(completed, false, 'installation must wait for the scan transaction')
  } finally { release() }
  const [, result] = await Promise.all([scan, install])
  assert.equal(result.ok, true)
  assert.ok(f.detective.index.data.skills[result.instanceId], 'new installation remains in the index')
  assert.equal(existsSync(result.path), true)
})

test('lazy lookup inside a mutation does not deadlock behind an already queued scan', { timeout: 5_000 }, async t => {
  const f = await fixture(t)
  await f.put(join(f.A, '.dsh', 'skills'), 'shared-skill', 'LAZY_KEEP')
  let entered, release
  const enteredGate = new Promise(resolve => { entered = resolve })
  const releaseGate = new Promise(resolve => { release = resolve })
  const mutation = f.detective.mutateSkills(async () => {
    entered()
    await releaseGate
    return f.detective.selectInstalled('shared-skill', f.A)
  })
  await enteredGate
  const queuedScan = f.detective.scanOnce('concurrent-external-scan')
  release()
  const [selected] = await Promise.all([mutation, queuedScan])
  assert.equal(selected.name, 'shared-skill')
  assert.equal(selected.workspace, f.A)
})

test('an async descendant of a finished mutation still waits for a newer transaction', { timeout: 5_000 }, async t => {
  const f = await fixture(t)
  let schedule, attempted, release
  const scheduleGate = new Promise(resolve => { schedule = resolve })
  const attemptedGate = new Promise(resolve => { attempted = resolve })
  let descendant, ran = false
  await f.detective.mutateSkills(async () => {
    descendant = (async () => {
      await scheduleGate
      attempted()
      return f.detective.mutateSkills(async () => { ran = true })
    })()
  })
  const hold = new Promise(resolve => { release = resolve })
  let entered
  const enteredGate = new Promise(resolve => { entered = resolve })
  const current = f.detective.mutateSkills(async () => { entered(); await hold })
  await enteredGate
  schedule()
  await attemptedGate
  try {
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(ran, false, 'stale asynchronous context must not bypass the queue')
  } finally { release() }
  await Promise.all([current, descendant])
  assert.equal(ran, true)
})

test('old name-keyed index migrates to stable identities and corruption fails closed', async t => {
  const f = await fixture(t)
  const path = await f.put(join(f.A, '.dsh', 'skills'), 'legacy-skill', 'legacy')
  const file = join(f.home, 'skill-detective', 'index.json')
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify({ version: 1, skills: { 'legacy-skill': { name: 'legacy-skill', path, file: join(path, 'SKILL.md'), scope: 'workspace', workspace: f.A, kind: 'local', at: Date.now(), summary: 'preserved summary', customField: 'preserved extension' } } }))
  const index = await f.detective.index.load()
  const record = Object.values(index.skills)[0]
  assert.equal(index.version, 2)
  assert.equal(record.instanceId, f.skillInstanceId(record))
  assert.equal(index.skills[record.instanceId].summary, 'preserved summary')
  assert.equal(record.customField, 'preserved extension')
  await f.detective.index.save()
  assert.equal(Object.values((await f.service().index.load()).skills)[0].instanceId, record.instanceId)
  await writeFile(file, '{broken')
  await assert.rejects(() => f.service().index.load(), { code: 'state-corrupt' })
  assert.equal(await readFile(file, 'utf8'), '{broken')
})

test('scan retains duplicate workspace instances and extra workspace settings never redirect operations', async t => {
  const f = await fixture(t)
  const a = await f.put(join(f.A, '.dsh', 'skills'), 'shared-skill', 'WORKSPACE_A')
  const b = await f.put(join(f.B, '.dsh', 'skills'), 'shared-skill', 'WORKSPACE_B')
  await f.detective.state.update(data => { data.settings.workspaces = [f.A, f.B] })
  await f.scan()
  const listA = await f.detective.listInstalled(f.A), listB = await f.detective.listInstalled(f.B)
  assert.equal(Object.keys(f.detective.index.data.skills).length, 2)
  assert.equal(listA[0].path, a); assert.equal(listB[0].path, b)
  assert.notEqual(listA[0].instanceId, listB[0].instanceId)
  await f.detective.toggle(f.selector(listB[0]), false, f.B)
  assert.doesNotMatch(await readFile(join(a, 'SKILL.md'), 'utf8'), /disable-model-invocation/)
  assert.match(await readFile(join(b, 'SKILL.md'), 'utf8'), /disable-model-invocation: true/)
  await assert.rejects(() => f.detective.remove({ ...f.selector(listA[0]), workspace: f.B }, f.B), { code: 'skill-not-found' })
  await f.detective.remove({ ...f.selector(listB[0]), workspace: f.B }, f.B)
  assert.equal(existsSync(a), true); assert.equal(existsSync(b), false)
  await f.put(join(f.B, '.dsh', 'skills'), 'shared-skill', 'WORKSPACE_B_MOVE')
  await f.scan()
  const copyB = (await f.detective.listInstalled(f.B))[0]
  await f.detective.moveSkill({ ...f.selector(copyB), workspace: f.B }, 'global', [], f.B, '')
  assert.equal(existsSync(a), true); assert.equal(existsSync(b), false)
  assert.match(await readFile(join(f.home, 'skills', 'shared-skill', 'SKILL.md'), 'utf8'), /WORKSPACE_B_MOVE/)
})

test('global and project instances coexist; project wins recommendation and ambiguous names are rejected', async t => {
  const f = await fixture(t)
  const global = await f.put(join(f.home, 'skills'), 'shared-skill', 'GLOBAL')
  const project = await f.put(join(f.A, '.dsh', 'skills'), 'shared-skill', 'PROJECT')
  await f.scan()
  const list = await f.detective.listInstalled(f.A)
  assert.equal(list.length, 2)
  await assert.rejects(() => f.detective.toggle('shared-skill', false, f.A), { code: 'ambiguous-skill' })
  const analysis = await f.detective.analyze('Use shared-skill', f.A, 'session-1')
  assert.equal(analysis.covered.path, project)
  const globalEntry = list.find(x => x.path === global)
  await f.detective.toggle(f.selector(globalEntry), false, f.A)
  assert.doesNotMatch(await readFile(join(project, 'SKILL.md'), 'utf8'), /disable-model-invocation/)
  const b = await f.detective.listInstalled(f.B)
  assert.equal(b[0].path, global)
})

test('nested temp scan preserves sessions and never exposes another session', async t => {
  const f = await fixture(t)
  const first = await f.put(join(f.home, 'skill-detective', 'temp', 'session-1'), 'same-temp', 'SESSION_ONE')
  const second = await f.put(join(f.home, 'skill-detective', 'temp', 'session-2'), 'same-temp', 'SESSION_TWO')
  const empty = join(f.home, 'skill-detective', 'temp', 'empty-session')
  await mkdir(empty, { recursive: true })
  await f.scan()
  assert.equal(Object.keys(f.detective.index.data.skills).length, 2)
  assert.deepEqual((await f.detective.listInstalled(f.A)).map(x => x.name), [])
  assert.equal((await f.detective.listInstalled(f.A, { sessionId: 'session-1' }))[0].path, first)
  assert.equal((await f.detective.listInstalled(f.A, { sessionId: 'session-2' }))[0].path, second)
  assert.equal(existsSync(empty), false)
  await assert.rejects(() => f.detective.remove({ name: 'same-temp', path: first, sessionId: 'session-2' }, f.A), { code: 'skill-not-found' })
})

test('missing or unknown sessions cannot report a temporary skill loaded', async t => {
  const f = await fixture(t)
  for (const sessionId of ['', 'unknown-session']) {
    const result = await f.detective.install({ name: 'word-docx', scope: 'temp', workspace: f.A, sessionId })
    assert.equal(result.ok, false)
    assert.equal(result.code, 'session-unavailable')
    assert.equal(result.steps.some(x => x.id === 'enable' && x.status === 'ok'), false)
  }
  assert.equal(existsSync(join(f.home, 'skill-detective', 'temp')), false)
  assert.equal(f.requests.length, 0)
})

test('remote temporary install validates its session, registers, and releases on removal', async t => {
  const f = await fixture(t)
  let resolutions = 0
  f.detective.resolveRemote = async () => { resolutions++; return { ok: true, files: [{ path: 'SKILL.md', text: markdown('remote-tool', 'REMOTE') }], repo: 'test/repo', path: 'skills/remote-tool', source: 'local-fixture' } }
  const rejected = await f.detective.installRemote('test/repo/remote-tool', f.A, 'remote-tool', { scope: 'temp', sessionId: 'unknown' })
  assert.equal(rejected.ok, false); assert.equal(resolutions, 0)
  const installed = await f.detective.installRemote('test/repo/remote-tool', f.A, 'remote-tool', { scope: 'temp', sessionId: 'session-1' })
  assert.equal(installed.ok, true)
  assert.equal(f.active.get('session-1').size, 1)
  const record = (await f.detective.listInstalled(f.A, { sessionId: 'session-1' }))[0]
  await f.detective.remove({ ...f.selector(record), sessionId: 'session-1' }, f.A)
  assert.equal(f.active.get('session-1').size, 0)
  assert.equal(existsSync(installed.path), false)
})

test('temporary enable/disable and moving away manage scoped registrations', async t => {
  const f = await fixture(t)
  const installed = await f.detective.install({ name: 'word-docx', scope: 'temp', workspace: f.A, sessionId: 'session-1' })
  assert.equal(installed.ok, true)
  const selector = { ...installed, workspace: f.A, sessionId: 'session-1' }
  assert.equal(f.active.get('session-1').size, 1)
  await f.detective.moveSkill(selector, 'temp', [], f.A, 'session-1')
  assert.equal(f.active.get('session-1').size, 1, 'moving to the same scope must not duplicate a live registration')
  await f.detective.toggle(selector, false, f.A)
  assert.equal(f.active.get('session-1').size, 0)
  await f.detective.toggle(selector, true, f.A)
  assert.equal(f.active.get('session-1').size, 1)
  const moved = await f.detective.moveSkill(selector, 'global', [], f.A, '')
  assert.equal(moved.ok, true)
  assert.equal(f.active.get('session-1').size, 0)
  assert.equal(existsSync(installed.path), false)
  assert.equal(existsSync(join(f.home, 'skills', 'word-docx', 'SKILL.md')), true)
})

test('moving a temporary instance between sessions releases only the old registration', async t => {
  const f = await fixture(t)
  const installed = await f.detective.install({ name: 'word-docx', scope: 'temp', workspace: f.A, sessionId: 'session-1' })
  const moved = await f.detective.moveSkill({ ...installed, workspace: f.A, sessionId: 'session-1' }, 'temp', [], f.A, 'session-2')
  assert.equal(moved.ok, true)
  assert.equal(f.active.get('session-1').size, 0)
  assert.equal(f.active.get('session-2').size, 1)
  assert.equal((await f.detective.listInstalled(f.A, { sessionId: 'session-1' })).length, 0)
  assert.equal((await f.detective.listInstalled(f.A, { sessionId: 'session-2' })).length, 1)
})

test('registration failure rolls back a temporary overwrite and preserves the old live registration', async t => {
  const f = await fixture(t)
  const installed = await f.detective.install({ name: 'word-docx', scope: 'temp', workspace: f.A, sessionId: 'session-1' })
  const file = join(installed.path, 'SKILL.md')
  await writeFile(file, markdown('word-docx', 'ORIGINAL_BYTES'))
  const before = await readFile(file, 'utf8')
  f.rejectRegistration(1)
  const result = await f.detective.install({ name: 'word-docx', scope: 'temp', workspace: f.A, sessionId: 'session-1', conflict: 'overwrite', instanceId: installed.instanceId, path: installed.path })
  assert.equal(result.ok, false); assert.equal(result.code, 'temp-registration-failed')
  assert.equal(await readFile(file, 'utf8'), before)
  assert.equal(f.active.get('session-1').size, 1)
  assert.equal(result.steps.some(x => x.id === 'enable' && x.status === 'ok'), false)
})

test('failed scope registration leaves the source directory and metadata intact', async t => {
  const f = await fixture(t)
  const source = await f.put(join(f.B, '.dsh', 'skills'), 'shared-skill', 'SOURCE_B')
  await f.scan()
  const entry = (await f.detective.listInstalled(f.B))[0]
  f.rejectRegistration(true)
  await assert.rejects(() => f.detective.moveSkill({ ...f.selector(entry), workspace: f.B }, 'temp', [], f.B, 'session-1'), { code: 'temp-registration-failed' })
  assert.equal(existsSync(join(source, 'SKILL.md')), true)
  assert.equal(existsSync(join(f.home, 'skill-detective', 'temp', 'session-1', 'shared-skill')), false)
  assert.equal((await f.detective.listInstalled(f.B))[0].instanceId, entry.instanceId)
})

test('disk destination conflicts are checked independently of an empty or stale index', async t => {
  const f = await fixture(t)
  await f.scan()
  const destination = await f.put(join(f.B, '.dsh', 'skills'), 'word-docx', 'UNINDEXED_ORIGINAL')
  const before = await readFile(join(destination, 'SKILL.md'), 'utf8')
  const result = await f.detective.install({ name: 'word-docx', scope: 'workspace', workspace: f.B, sessionId: 'session-1' })
  assert.equal(result.ok, false); assert.equal(result.code, 'name-conflict')
  assert.equal(await readFile(join(destination, 'SKILL.md'), 'utf8'), before)
  assert.equal(result.conflict.path, destination)
})

test('installing the same name in separate workspaces preserves both files and metadata', async t => {
  const f = await fixture(t)
  const a = await f.detective.install({ name: 'word-docx', scope: 'workspace', workspace: f.A, sessionId: 'session-1' })
  const b = await f.detective.install({ name: 'word-docx', scope: 'workspace', workspace: f.B, sessionId: 'session-1' })
  assert.equal(a.ok, true); assert.equal(b.ok, true)
  assert.notEqual(a.instanceId, b.instanceId)
  assert.equal(existsSync(a.path), true); assert.equal(existsSync(b.path), true)
  const restarted = f.service()
  assert.equal((await restarted.listInstalled(f.A))[0].instanceId, a.instanceId)
  assert.equal((await restarted.listInstalled(f.B))[0].instanceId, b.instanceId)
  assert.equal(Object.keys((await restarted.state.load()).installs).length, 2)
})

test('staging write failure never removes the original directory', async t => {
  const f = await fixture(t)
  const original = await f.put(join(f.A, '.dsh', 'skills'), 'word-docx', 'ORIGINAL')
  const file = join(original, 'SKILL.md'), before = await readFile(file, 'utf8')
  const write = f.detective.writeFiles.bind(f.detective)
  f.detective.writeFiles = async (dir, files) => { await write(dir, files); throw new Error('TEST_STAGE_WRITE_FAILED') }
  const result = await f.detective.install({ name: 'word-docx', scope: 'workspace', workspace: f.A, sessionId: 'session-1', conflict: 'overwrite' })
  assert.equal(result.ok, false)
  assert.equal(await readFile(file, 'utf8'), before)
  assert.equal((await readdir(dirname(original))).some(x => x.startsWith('.skill-detective-')), false)
})

test('persistence failure rolls back an overwritten directory and installed metadata', async t => {
  const f = await fixture(t)
  const installed = await f.detective.install({ name: 'word-docx', scope: 'workspace', workspace: f.A, sessionId: 'session-1' })
  const file = join(installed.path, 'SKILL.md')
  await writeFile(file, markdown('word-docx', 'PRESERVE_ME'))
  const oldMetadata = JSON.parse(JSON.stringify(f.detective.state.data.installs))
  const save = f.detective.index.save.bind(f.detective.index)
  let failed = false
  f.detective.index.save = async () => { if (!failed) { failed = true; throw new Error('TEST_INDEX_WRITE_FAILED') } return save() }
  const result = await f.detective.install({ name: 'word-docx', scope: 'workspace', workspace: f.A, sessionId: 'session-1', conflict: 'overwrite', instanceId: installed.instanceId, path: installed.path })
  assert.equal(result.ok, false)
  assert.match(await readFile(file, 'utf8'), /PRESERVE_ME/)
  assert.deepEqual(JSON.parse(JSON.stringify(f.detective.state.data.installs)), oldMetadata)
  assert.deepEqual((await f.service().state.load()).installs, oldMetadata)
})

test('explicit invalid or mismatched workspaces cannot fall back to and alter the default', async t => {
  const f = await fixture(t)
  const original = await f.put(join(f.A, '.dsh', 'skills'), 'shared-skill', 'DEFAULT_KEEP')
  const file = join(original, 'SKILL.md'), before = await readFile(file, 'utf8')
  await f.scan()
  const selected = (await f.detective.listInstalled(f.A))[0]
  const missing = join(f.dir, 'does-not-exist')
  await assert.rejects(() => f.detective.toggle(f.selector(selected), false, missing), { code: 'invalid-workspace' })
  await assert.rejects(() => f.detective.remove('shared-skill', missing), { code: 'invalid-workspace' })
  await assert.rejects(() => f.detective.remove(f.selector(selected), f.B), { code: 'skill-not-found' })
  await assert.rejects(() => f.detective.remove('shared-skill', file), { code: 'invalid-workspace' })
  assert.equal(await readFile(file, 'utf8'), before)
})

test('session directory identities do not collide when session ids sanitize to the same text', async t => {
  const f = await fixture(t)
  const first = 'session/a', second = 'session_a'
  f.addSession(first); f.addSession(second)
  const a = await f.detective.install({ name: 'word-docx', scope: 'temp', workspace: f.A, sessionId: first })
  const b = await f.detective.install({ name: 'word-docx', scope: 'temp', workspace: f.A, sessionId: second })
  assert.equal(a.ok, true); assert.equal(b.ok, true)
  assert.notEqual(a.path, b.path); assert.notEqual(a.instanceId, b.instanceId)
  await f.scan()
  assert.equal((await f.detective.listInstalled(f.A, { sessionId: first }))[0].path, a.path)
  assert.equal((await f.detective.listInstalled(f.A, { sessionId: first }))[0].sessionId, first)
  assert.equal((await f.detective.listInstalled(f.A, { sessionId: second }))[0].path, b.path)
})

test('multi-workspace move refuses collisions before changing any source or destination', async t => {
  const f = await fixture(t)
  const original = await f.put(join(f.home, 'skills'), 'shared-skill', 'GLOBAL_SOURCE')
  const collision = await f.put(join(f.B, '.dsh', 'skills'), 'shared-skill', 'B_KEEP')
  await f.scan()
  const entry = (await f.detective.listInstalled(f.A))[0]
  await assert.rejects(() => f.detective.moveSkill(f.selector(entry), 'workspace', [f.A, f.B], f.A, ''), { code: 'name-conflict' })
  assert.equal(existsSync(original), true)
  assert.equal(existsSync(join(f.A, '.dsh', 'skills', 'shared-skill')), false)
  assert.match(await readFile(join(collision, 'SKILL.md'), 'utf8'), /B_KEEP/)
})

test('need analysis with no explicit live session does not fabricate a route or use saved sessions', async t => {
  const f = await fixture(t)
  await f.scan()
  await f.detective.state.update(data => { data.sessions['session-1'] = { at: Date.now() } })
  const analysis = await f.detective.analyze('Do a task', f.A)
  assert.equal(analysis.actionable, false)
  assert.equal(analysis.error, 'session-unavailable')
  assert.equal(f.requests.length, 0)
})

test('post-commit registration cleanup failures produce warnings without reversing file deletion', async t => {
  const f = await fixture(t)
  const installed = await f.detective.install({ name: 'word-docx', scope: 'temp', workspace: f.A, sessionId: 'session-1' })
  assert.equal(installed.ok, true)
  f.rejectDisposal(true)
  const removed = await f.detective.remove({ ...installed, workspace: f.A, sessionId: 'session-1' }, f.A)
  assert.equal(removed.ok, true)
  assert.equal(existsSync(installed.path), false)
  assert.ok(removed.warnings.some(warning => warning.includes('TEST_DISPOSAL_FAILED')))
  assert.equal(f.active.get('session-1').size, 1, 'the warning reports the registration that could not be disposed')
})

test('learning a source with scripts is preview-only and preserves all original files', async t => {
  const f = await fixture(t)
  const source = await f.put(join(f.A, '.dsh', 'skills'), 'word-docx', 'SOURCE_WITH_SCRIPTS')
  await mkdir(join(source, 'scripts'), { recursive: true })
  const script = join(source, 'scripts', 'render.js')
  await writeFile(script, 'export const original = "KEEP_SCRIPT"\n')
  const before = await readFile(join(source, 'SKILL.md'), 'utf8')
  await f.scan()
  const selected = (await f.detective.listInstalled(f.A))[0]
  const preview = await f.detective.learn(f.selector(selected), f.A, { dryRun: true, sessionId: 'session-1' })
  assert.equal(preview.ok, true)
  assert.equal(preview.previewOnly, true)
  assert.equal(preview.code, 'unsupported-learning-assets')
  assert.ok(preview.preserveSources.some(item => item.path === source && item.files.some(file => file.path === 'scripts')))
  assert.ok(preview.merged.markdown.length > 0)
  const result = await f.detective.learn(f.selector(selected), f.A, { sessionId: 'session-1' })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'unsupported-learning-assets')
  assert.equal(existsSync(join(f.A, '.dsh', 'skills', 'word-docx-pro')), false)
  assert.equal(await readFile(join(source, 'SKILL.md'), 'utf8'), before)
  assert.equal(await readFile(script, 'utf8'), 'export const original = "KEEP_SCRIPT"\n')
  assert.equal(f.requests.length, 0, 'an incomplete standalone draft must not be audited or installed')
})

test('learning preserves installed peer assets; pure Markdown document integration remains available', async t => {
  const f = await fixture(t)
  await f.put(join(f.A, '.dsh', 'skills'), 'word-docx', 'PLAIN_SOURCE')
  const peer = await f.put(join(f.A, '.dsh', 'skills'), 'markdown-writer', 'PEER_WITH_ASSETS')
  await mkdir(join(peer, 'assets'), { recursive: true })
  const asset = join(peer, 'assets', 'template.txt')
  await writeFile(asset, 'KEEP_PEER_ASSET')
  await f.scan()
  const selected = (await f.detective.listInstalled(f.A)).find(item => item.name === 'word-docx')
  const result = await f.detective.learn(f.selector(selected), f.A, { sessionId: 'session-1' })
  assert.equal(result.ok, false)
  assert.equal(result.code, 'unsupported-learning-assets')
  assert.ok(result.preserveSources.some(item => item.name === 'markdown-writer' && item.files.some(file => file.path === 'assets')))
  assert.equal(await readFile(asset, 'utf8'), 'KEEP_PEER_ASSET')
  assert.equal(existsSync(join(f.A, '.dsh', 'skills', 'word-docx-pro')), false)

  const plain = await fixture(t)
  const plainSource = await plain.put(join(plain.A, '.dsh', 'skills'), 'word-docx', 'PLAIN_WORD_DOC')
  const plainPeer = await plain.put(join(plain.A, '.dsh', 'skills'), 'markdown-writer', 'PLAIN_MARKDOWN_DOC')
  await plain.scan()
  const plainSelected = (await plain.detective.listInstalled(plain.A)).find(item => item.name === 'word-docx')
  const integrated = await plain.detective.learn(plain.selector(plainSelected), plain.A, { sessionId: 'session-1' })
  assert.equal(integrated.ok, true)
  assert.equal(existsSync(join(plain.A, '.dsh', 'skills', 'word-docx-pro', 'SKILL.md')), true)
  assert.match(await readFile(join(plainSource, 'SKILL.md'), 'utf8'), /PLAIN_WORD_DOC/)
  assert.match(await readFile(join(plainPeer, 'SKILL.md'), 'utf8'), /PLAIN_MARKDOWN_DOC/)
})


test('temporary overwrite and repeated enable replace a first-wins registration', async t => {
  const f = await fixture(t)
  const installed = await f.detective.install({ name: 'word-docx', scope: 'temp', workspace: f.A, sessionId: 'session-1' })
  const selector = { ...installed, workspace: f.A, sessionId: 'session-1' }
  const result = await f.detective.installPrepared({ name: 'word-docx', files: [{ path: 'SKILL.md', text: markdown('word-docx', 'REPLACEMENT_CONTENT') }], scope: 'temp', workspace: f.A, sessionId: 'session-1', conflict: 'overwrite', selector, verdict: { verdict: 'safe', severity: 'low', summary: 'replacement' } })
  assert.equal(result.ok, true)
  assert.equal(f.active.get('session-1').size, 1)
  assert.match(f.active.get('session-1').get('word-docx').content, /REPLACEMENT_CONTENT/)
  await f.detective.toggle(selector, true, f.A)
  assert.equal(f.active.get('session-1').size, 1)
  assert.match(f.active.get('session-1').get('word-docx').content, /REPLACEMENT_CONTENT/)
  assert.equal(f.active.get('session-1').get('word-docx').resourceBase.path, installed.path)
})

test('failed temporary overwrite persistence restores the old live content', async t => {
  const f = await fixture(t)
  const installed = await f.detective.install({ name: 'word-docx', scope: 'temp', workspace: f.A, sessionId: 'session-1' })
  const before = f.active.get('session-1').get('word-docx').content
  const save = f.detective.index.save.bind(f.detective.index)
  let failed = false
  f.detective.index.save = async () => { if (!failed) { failed = true; throw new Error('TEST_INDEX_WRITE_FAILED') } return save() }
  const result = await f.detective.installPrepared({ name: 'word-docx', files: [{ path: 'SKILL.md', text: markdown('word-docx', 'REPLACEMENT_CONTENT') }], scope: 'temp', workspace: f.A, sessionId: 'session-1', conflict: 'overwrite', selector: installed, verdict: { verdict: 'safe', severity: 'low', summary: 'replacement' } })
  assert.equal(result.ok, false)
  assert.equal(f.active.get('session-1').size, 1)
  assert.equal(f.active.get('session-1').get('word-docx').content, before)
  assert.equal(f.detective.tempRegistrations.size, 1)
})

test('plugin unload cleans registrations and reload can restore and delete them', async t => {
  const f = await fixture(t)
  const installed = await f.detective.install({ name: 'word-docx', scope: 'temp', workspace: f.A, sessionId: 'session-1' })
  await f.disposePlugin()
  assert.equal(f.active.get('session-1').size, 0)
  assert.equal(f.detective.tempRegistrations.size, 0)
  assert.equal(existsSync(join(installed.path, 'SKILL.md')), true)
  const restarted = f.service()
  await restarted.restoreTempFor('session-1')
  await restarted.restoreTempFor('session-1')
  assert.equal(f.active.get('session-1').size, 1)
  assert.equal(restarted.tempRegistrations.size, 1)
  await restarted.remove({ ...installed, workspace: f.A, sessionId: 'session-1' }, f.A)
  assert.equal(f.active.get('session-1').size, 0)
})

test('resumed agents restore only their enabled persisted temporary skills', async t => {
  const f = await fixture(t)
  const enabled = await f.detective.install({ name: 'word-docx', scope: 'temp', workspace: f.A, sessionId: 'session-1' })
  const disabled = await f.detective.install({ name: 'excel-report', scope: 'temp', workspace: f.A, sessionId: 'session-1' })
  await f.detective.toggle({ ...disabled, workspace: f.A, sessionId: 'session-1' }, false, f.A)
  await f.detective.install({ name: 'pdf-toolkit', scope: 'temp', workspace: f.A, sessionId: 'session-2' })
  await f.disposeAgent('session-1')
  assert.equal(f.detective.tempRegistrations.has(enabled.instanceId), false)
  f.addSession('session-1')
  const restarted = f.service()
  await restarted.restoreTempFor('session-1')
  assert.deepEqual([...f.active.get('session-1').keys()], ['word-docx'])
  assert.equal(restarted.tempRegistrations.size, 1)
  await restarted.toggle({ ...enabled, workspace: f.A, sessionId: 'session-1' }, false, f.A)
  assert.equal(f.active.get('session-1').size, 0)
})
