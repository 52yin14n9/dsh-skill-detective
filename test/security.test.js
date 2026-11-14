import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const artifacts = resolve(process.env.DSH_TEST_ARTIFACTS || resolve(repo, '../test-artifacts/fix-2026-11-13'))
const run = join(artifacts, `security-${process.pid}-${Date.now()}`)
await mkdir(run, { recursive: true })
process.env.DSH_HOME = join(run, 'dsh-home')
const { __test } = await import('../index.js')
const { AUDIT_CACHE_TTL, AUDIT_POLICY_VERSION, AuditCache, MAX_SKILL_FILE_BYTES,
  REMOTE_REPOS, SkillDetective, checkedRepositoryText, hashFiles, mergeAuditResults, normalizeAuditResult } = __test

const safe = (extra = {}) => ({ verdict: 'safe', severity: 'low', findings: [], summary: 'Read a text fixture', capabilities: ['Read text'], triggers: ['read text'], slug: '', ...extra })
const service = () => {
  const subject = new SkillDetective({
    get(name) {
      if (name === 'agents') return { get: id => id === 'live-fixture' ? { ctx: { effect: fn => fn(), skills: { register() { return () => {} } } } } : undefined }
    },
    logger: { info() {} },
  })
  subject.currentSessionId = 'live-fixture'
  return subject
}
const blob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
const markdown = '---\nname: fixture\ndescription: Read a fixture\n---\n# Fixture\nRead text only.\n'
let nextRepo = 0

function remoteFixture(t, files, options = {}) {
  const owner = 'fixture-owner', repository = `fixture-repo-${++nextRepo}`
  const base = `https://api.github.com/repos/${owner}/${repository}`
  const fixture = {
    files: new Map(Object.entries(files).map(([path, text]) => [path, Buffer.from(text)])),
    revision: 'a'.repeat(40), treeSha: 'b'.repeat(40), requests: [], treeCalls: 0,
  }
  const original = globalThis.fetch
  globalThis.fetch = async input => {
    const url = String(input)
    fixture.requests.push(url)
    if (url === base) return Response.json({ default_branch: 'main' })
    if (url === `${base}/commits/main`) return Response.json({ sha: fixture.revision, commit: { tree: { sha: fixture.treeSha } } })
    if (url.startsWith(`${base}/git/trees/`)) {
      fixture.treeCalls++
      if (options.treeError) return new Response('unavailable', { status: 503 })
      if (options.invalidJson) return new Response('{broken')
      const entries = [...fixture.files].map(([path, bytes]) => ({ path, type: 'blob', mode: '100644', sha: blob(bytes), size: bytes.length }))
      options.mutateTree?.(entries)
      return Response.json({ sha: fixture.treeSha, tree: entries, truncated: options.truncated ?? false })
    }
    let path = ''
    const raw = `/${owner}/${repository}/${fixture.revision}/`
    if (url.includes(raw)) path = decodeURIComponent(url.slice(url.indexOf(raw) + raw.length))
    if (url.startsWith(`${base}/contents/`)) path = decodeURIComponent(url.slice(`${base}/contents/`.length).split('?')[0])
    if (path && fixture.files.has(path)) {
      let bytes = fixture.files.get(path)
      if (options.tamper && (!options.rawOnly || !url.startsWith(base))) bytes = Buffer.from(options.tamper)
      if (url.startsWith(`${base}/contents/`)) return Response.json({ encoding: 'base64', content: bytes.toString('base64') })
      return new Response(bytes)
    }
    throw new Error(`Unexpected network request; real network disabled: ${url}`)
  }
  t.after(() => { globalThis.fetch = original; REMOTE_REPOS.clear() })
  fixture.id = `${owner}/${repository}/fixture`
  return fixture
}

test('audit schema rejects every missing required field and malformed finding', () => {
  for (const field of Object.keys(safe())) {
    const incomplete = safe(); delete incomplete[field]
    assert.equal(normalizeAuditResult(incomplete), null, field)
  }
  for (const invalid of [{}, { ...safe(), verdict: 'unknown' }, { ...safe(), severity: 'unknown' },
    { ...safe(), summary: '' }, { ...safe(), findings: [{ severity: 'high', detail: 'risk' }] },
    { ...safe(), triggers: [42] }]) assert.equal(normalizeAuditResult(invalid), null)
  assert.equal(normalizeAuditResult(safe()).poison, false)
})

test('suspicious and top-level high/critical always block auto-install', () => {
  for (const input of [safe({ verdict: 'suspicious' }), safe({ severity: 'high' }), safe({ severity: 'critical' }), safe({ verdict: 'malicious' })]) {
    const result = normalizeAuditResult(input)
    assert.equal(result.poison, true)
    assert.equal(mergeAuditResults([normalizeAuditResult(safe()), result]).poison, true)
  }
  assert.equal(mergeAuditResults([normalizeAuditResult(safe()), {}]), null)
})

test('high finding after the display limit cannot be discarded', () => {
  const findings = Array.from({ length: 21 }, (_, index) => ({ file: 'SKILL.md', severity: index === 20 ? 'high' : 'medium', rule: `risk-${index}`, detail: 'fixture finding' }))
  const result = normalizeAuditResult(safe({ findings }))
  assert.equal(result.findings.length, 20)
  assert.equal(result.severity, 'high')
  assert.equal(result.poison, true)
})

test('audit cache key changes with file content, path and prompt policy', () => {
  const files = [{ path: 'SKILL.md', text: markdown }]
  const first = hashFiles(files, 'policy A')
  assert.notEqual(first, hashFiles(files, 'policy B'))
  assert.notEqual(first, hashFiles([{ path: 'other.md', text: markdown }], 'policy A'))
  assert.notEqual(first, hashFiles([{ path: 'SKILL.md', text: `${markdown}changed` }], 'policy A'))
})

test('cache read rejects expired verdicts without requiring a write', async () => {
  const now = Date.now(), hash = 'a'.repeat(64), file = join(run, 'expired-cache.json')
  await writeFile(file, JSON.stringify({ version: 2, entries: { [hash]: { ...safe(), at: now - AUDIT_CACHE_TTL, policyVersion: AUDIT_POLICY_VERSION, model: 'fixture' } } }))
  assert.equal(await new AuditCache(file).get(hash, now), null)
})

test('legacy policy caches do not bypass the current review', async () => {
  const hash = 'b'.repeat(64), file = join(run, 'legacy-cache.json')
  await writeFile(file, JSON.stringify({ entries: { [hash]: { ...safe(), at: Date.now(), policyVersion: 'old-policy' } } }))
  assert.equal(await new AuditCache(file).get(hash), null)
})

test('valid cache verdict persists and reloads with its policy', async () => {
  const hash = 'c'.repeat(64), file = join(run, 'valid-cache.json')
  await new AuditCache(file).put(hash, { ...safe(), at: Date.now(), policyVersion: AUDIT_POLICY_VERSION, model: 'fixture' })
  const cached = await new AuditCache(file).get(hash)
  assert.equal(cached.verdict, 'safe')
  assert.equal(cached.policyVersion, AUDIT_POLICY_VERSION)
})

test('review rejects incomplete model JSON without caching it', async () => {
  const subject = service(); let puts = 0
  subject.auditCache = { get: async () => null, put: async () => { puts++ } }
  subject.judge = { json: async () => ({ ok: true, data: {}, model: 'fixture' }) }
  const result = await subject.reviewFiles([{ path: 'SKILL.md', text: markdown }], { sessionId: 'live-fixture' })
  assert.equal(result.ok, false)
  assert.equal(puts, 0)
})

test('review uses actual UTF-8 byte counts before invoking the model', async () => {
  const subject = service(); let calls = 0
  subject.judge = { json: async () => { calls++; return { ok: true, data: safe() } } }
  const text = '中'.repeat(Math.floor(MAX_SKILL_FILE_BYTES / 3) + 1)
  assert.ok(text.length < MAX_SKILL_FILE_BYTES)
  assert.equal((await subject.reviewFiles([{ path: 'SKILL.md', text }])).ok, false)
  assert.equal(calls, 0)
})

test('review refuses a missing live session without a synthetic fallback', async () => {
  const subject = service(); subject.currentSessionId = ''
  let calls = 0
  subject.judge = { json: async () => { calls++; return { ok: true, data: safe() } } }
  subject.auditCache = { get: async () => null, put: async () => {} }
  const result = await subject.reviewFiles([{ path: 'SKILL.md', text: markdown }])
  assert.equal(result.ok, false)
  assert.equal(result.error, 'session-unavailable')
  assert.equal(calls, 0)
})

test('one suspicious audit segment blocks the whole directory', async () => {
  const subject = service(); let calls = 0
  subject.auditCache = { get: async () => null, put: async () => {} }
  subject.judge = { json: async () => ({ ok: true, data: safe(calls++ === 1 ? { verdict: 'suspicious', severity: 'medium' } : {}), model: 'fixture' }) }
  const result = await subject.reviewFiles([{ path: 'SKILL.md', text: 'a'.repeat(100_000) }], { sessionId: 'live-fixture' })
  assert.equal(result.ok, true)
  assert.equal(result.poison, true)
  assert.equal(result.coverage.bytes, 100_000)
  assert.ok(calls >= 3)
})

test('normal nested skill includes scripts and ignores files outside its directory', async t => {
  const fixture = remoteFixture(t, { 'skills/fixture/SKILL.md': markdown, 'skills/fixture/scripts/read.py': 'print("fixture")\n', 'outside/unknown.bin': 'outside' })
  const result = await service().resolveRemote(fixture.id)
  assert.equal(result.ok, true, result.error)
  assert.deepEqual(result.files.map(file => file.path), ['SKILL.md', 'scripts/read.py'])
  assert.equal(result.commit, fixture.revision)
  assert.ok(fixture.requests.some(url => url.includes(`/${fixture.revision}/`)))
})

test('root SKILL.md includes root companions instead of reviewing a single file', async t => {
  const fixture = remoteFixture(t, { 'SKILL.md': markdown, 'scripts/read.py': 'print("fixture")\n', LICENSE: 'MIT\n' })
  const result = await service().resolveRemote(fixture.id)
  assert.equal(result.ok, true, result.error)
  assert.deepEqual(new Set(result.files.map(file => file.path)), new Set(['SKILL.md', 'scripts/read.py', 'LICENSE']))
})

for (const [name, options] of [['unavailable', { treeError: true }], ['invalid JSON', { invalidJson: true }], ['truncated', { truncated: true }]]) {
  test(`${name} repository tree refuses installation before raw download`, async t => {
    const fixture = remoteFixture(t, { 'skills/fixture/SKILL.md': markdown }, options)
    const result = await service().resolveRemote(fixture.id)
    assert.equal(result.ok, false)
    assert.match(result.error, /完整仓库文件清单/)
    assert.equal(fixture.requests.some(url => url.includes('raw.githubusercontent.com')), false)
  })
}

test('unknown file types in the selected directory are refused explicitly', async t => {
  const fixture = remoteFixture(t, { 'skills/fixture/SKILL.md': markdown, 'skills/fixture/template.pdf': '%PDF fixture' })
  const result = await service().resolveRemote(fixture.id)
  assert.equal(result.ok, false)
  assert.match(result.error, /未支持的文件类型/)
})

test('an invalid entry in the repository manifest cannot silently disappear', async t => {
  const fixture = remoteFixture(t, { 'skills/fixture/SKILL.md': markdown }, { mutateTree(entries) { entries.push({ path: 'skills/fixture/hidden.py', type: 'tree', mode: '120000', sha: 'e'.repeat(40) }) } })
  const result = await service().resolveRemote(fixture.id)
  assert.equal(result.ok, false)
  assert.match(result.error, /无效或重复条目/)
})

test('oversized main SKILL.md is blocked using its real UTF-8 byte size', async t => {
  const fixture = remoteFixture(t, { 'skills/fixture/SKILL.md': `${markdown}${'中'.repeat(100_000)}` })
  const result = await service().resolveRemote(fixture.id)
  assert.equal(result.ok, false)
  assert.match(result.error, /单文件字节上限/)
})

test('directory limits reject excess files and UTF-8 totals instead of omitting files', async t => {
  const files = { 'skills/fixture/SKILL.md': markdown }
  for (let index = 0; index < 40; index++) files[`skills/fixture/file-${index}.txt`] = 'fixture'
  const fixture = remoteFixture(t, files)
  const subject = service()
  assert.match((await subject.resolveRemote(fixture.id)).error, /文件数超过/)
  REMOTE_REPOS.clear()
  fixture.files = new Map([
    ['skills/fixture/SKILL.md', Buffer.from(markdown)],
    ['skills/fixture/one.txt', Buffer.from('中'.repeat(85_000))],
    ['skills/fixture/two.txt', Buffer.from('中'.repeat(85_000))],
    ['skills/fixture/three.txt', Buffer.from('中'.repeat(10_000))],
  ])
  const result = await subject.resolveRemote(fixture.id)
  assert.equal(result.ok, false)
  assert.match(result.error, /总字节上限/)
})

test('symlink entries cannot escape complete directory review', async t => {
  const fixture = remoteFixture(t, { 'skills/fixture/SKILL.md': markdown, 'skills/fixture/link.py': '../external' }, { mutateTree(entries) { entries[1].mode = '120000' } })
  const result = await service().resolveRemote(fixture.id)
  assert.equal(result.ok, false)
  assert.match(result.error, /链接或子模块/)
})

test('a substituted raw download is rejected or recovered from a verified API copy', async t => {
  const fixture = remoteFixture(t, { 'skills/fixture/SKILL.md': markdown }, { tamper: 'substituted bytes', rawOnly: true })
  const result = await service().resolveRemote(fixture.id)
  assert.equal(result.ok, true, result.error)
  assert.equal(result.files[0].text, markdown)
  assert.ok(fixture.requests.some(url => url.includes('/contents/')))
})

test('substituted content from every source refuses installation', async t => {
  const fixture = remoteFixture(t, { 'skills/fixture/SKILL.md': markdown }, { tamper: 'substituted bytes' })
  const result = await service().resolveRemote(fixture.id)
  assert.equal(result.ok, false)
  assert.match(result.error, /文件清单不一致/)
})

test('actual multibyte downloads over the file cap are refused', async t => {
  const fixture = remoteFixture(t, { 'skills/fixture/SKILL.md': markdown }, { tamper: '中'.repeat(100_000) })
  const result = await service().resolveRemote(fixture.id)
  assert.equal(result.ok, false)
  assert.match(result.error, /字节上限/)
})

test('blob validation rejects invalid UTF-8 even when its Git hash matches', () => {
  const bytes = Buffer.from([0xff, 0xfe, 0xfd])
  assert.throws(() => checkedRepositoryText(bytes, { sha: blob(bytes), size: bytes.length }))
})

test('branch changes use a fresh immutable commit instead of a stale tree', async t => {
  const fixture = remoteFixture(t, { 'skills/fixture/SKILL.md': markdown })
  const subject = service()
  assert.equal((await subject.resolveRemote(fixture.id)).ok, true)
  fixture.revision = 'c'.repeat(40); fixture.treeSha = 'd'.repeat(40)
  fixture.files.set('skills/fixture/SKILL.md', Buffer.from(`${markdown}New revision.\n`))
  const result = await subject.resolveRemote(fixture.id)
  assert.equal(result.ok, true, result.error)
  assert.equal(result.commit, 'c'.repeat(40))
  assert.match(result.markdown, /New revision/)
  assert.equal(fixture.treeCalls, 2)
})

test('unchanged commit tree cache expires instead of living indefinitely', async t => {
  const fixture = remoteFixture(t, { 'skills/fixture/SKILL.md': markdown })
  const subject = service()
  assert.equal((await subject.resolveRemote(fixture.id)).ok, true)
  for (const cached of REMOTE_REPOS.values()) cached.at = Date.now() - 6 * 60_000
  assert.equal((await subject.resolveRemote(fixture.id)).ok, true)
  assert.equal(fixture.treeCalls, 2)
})


test('reviews never borrow a recently active session, even for cached verdicts', async () => {
  const subject = service()
  let reads = 0, calls = 0
  subject.auditCache = { get: async () => { reads++; return safe() }, put: async () => {} }
  subject.judge = { json: async () => { calls++; return { ok: true, data: safe() } } }
  const files = [{ path: 'SKILL.md', text: markdown }]
  for (const meta of [{}, { sessionId: '' }, { sessionId: 'unknown-session' }]) {
    const result = await subject.reviewFiles(files, meta)
    assert.equal(result.ok, false)
    assert.equal(result.error, 'session-unavailable')
  }
  assert.equal(reads, 0)
  assert.equal(calls, 0)
  assert.equal((await subject.reviewFiles(files, { sessionId: 'live-fixture' })).cached, true)
})

test('verified executable mode survives remote resolution and disk publication', async t => {
  const fixture = remoteFixture(t, { 'skills/fixture/SKILL.md': markdown, 'skills/fixture/scripts/run.sh': '#!/bin/sh\nexit 0\n' }, {
    mutateTree(entries) { entries.find(x => x.path.endsWith('run.sh')).mode = '100755' },
  })
  const subject = service(), resolved = await subject.resolveRemote(fixture.id)
  assert.equal(resolved.ok, true, resolved.error)
  assert.equal(resolved.files.find(x => x.path === 'scripts/run.sh').mode, '100755')
  const dir = join(run, 'published-modes')
  await subject.writeFiles(dir, resolved.files)
  assert.equal(await readFile(join(dir, 'scripts/run.sh'), 'utf8'), '#!/bin/sh\nexit 0\n')
  if (process.platform !== 'win32') {
    assert.equal((await stat(join(dir, 'scripts/run.sh'))).mode & 0o777, 0o755)
    assert.equal((await stat(join(dir, 'SKILL.md'))).mode & 0o777, 0o644)
  }
  await assert.rejects(subject.writeFiles(dir, [{ path: 'invalid.sh', text: 'exit 0', mode: '104755' }]), { code: 'unsafe-mode' })
  assert.notEqual(hashFiles([{ path: 'run.sh', text: 'exit 0', mode: '100755' }]), hashFiles([{ path: 'run.sh', text: 'exit 0', mode: '100644' }]))
})
