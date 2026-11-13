import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { __test as host } from '../index.js'

const clientSource = await readFile(new URL('../client.js', import.meta.url), 'utf8')

function createClient(fetchImpl) {
  let hooks = null
  let client
  const timers = []
  const intervals = []
  const React = {
    Fragment: 'fragment',
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }),
    useState(initial) {
      const owner = hooks
      const index = owner.cursor++
      if (!owner.cells[index]) owner.cells[index] = { value: typeof initial === 'function' ? initial() : initial }
      return [owner.cells[index].value, next => {
        owner.cells[index].value = typeof next === 'function' ? next(owner.cells[index].value) : next
      }]
    },
    useRef(initial) {
      const index = hooks.cursor++
      if (!hooks.cells[index]) hooks.cells[index] = { current: initial }
      return hooks.cells[index]
    },
    useMemo(fn, dependencies) {
      const owner = hooks
      const index = owner.cursor++
      const before = owner.cells[index]
      if (!before || !dependencies || dependencies.some((value, i) => value !== before.dependencies?.[i])) {
        owner.cells[index] = { dependencies, value: fn() }
      }
      return owner.cells[index].value
    },
    useCallback(fn, dependencies) { return React.useMemo(() => fn, dependencies) },
    useEffect(fn, dependencies) {
      const owner = hooks
      const index = owner.cursor++
      const before = owner.cells[index]
      if (!before || dependencies?.some((value, i) => value !== before.dependencies?.[i])) {
        before?.cleanup?.()
        owner.cells[index] = { dependencies }
        owner.effects.push(() => { owner.cells[index].cleanup = fn() })
      }
    },
  }
  const sandbox = {
    URLSearchParams,
    fetch: fetchImpl,
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length },
    clearTimeout: () => {},
    setInterval: fn => { intervals.push(fn); return intervals.length },
    clearInterval: () => {},
    document: { body: { dataset: {} } },
    window: {
      addEventListener() {}, removeEventListener() {},
      __ModuleLoader__: { load(definition) { client = definition.factory(name => {
        assert.equal(name, 'react')
        return React
      }).__test } },
    },
  }
  vm.runInNewContext(clientSource, sandbox, { filename: 'client.js' })
  return {
    client, timers, intervals,
    mount(Component, props) {
      const owner = { cursor: 0, cells: [], effects: [] }
      return {
        render() {
          hooks = owner
          owner.cursor = 0
          const element = Component(props)
          hooks = null
          for (const effect of owner.effects.splice(0)) effect()
          return element
        },
      }
    },
  }
}

function elements(element) {
  if (!element || typeof element !== 'object') return []
  return [element, ...(element.props?.children ?? []).flatMap(elements)]
}
function button(element, label) {
  const found = elements(element).find(node => node.type === 'button' && node.props.children.includes(label))
  assert.ok(found, `Missing button: ${label}`)
  return found
}
const response = payload => ({ ok: true, status: 200, json: async () => payload })
const t = key => key
const plain = value => JSON.parse(JSON.stringify(value))
const flush = () => new Promise(resolve => setImmediate(resolve))
const skill = (instanceId, workspace = '/work/a') => ({
  name: 'same-skill', instanceId, path: `${workspace}/.dsh/skills/same-skill`, scope: 'workspace', workspace, workspaces: [workspace], managed: true, origin: 'user', enabled: true,
})
const settings = installed => ({
  installed, workspace: '/work/a', settings: { defaultScope: 'workspace' }, suppressed: [],
  workspaces: [{ path: '/work/a', title: 'Workspace A' }, { path: '/work/b', title: 'Workspace B' }],
})

test('settings saves workspace-only changes and targets the exact duplicate instance', async () => {
  const calls = []
  const app = createClient(async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return response({ ok: true }) })
  const component = app.mount(app.client.SettingsModal, {
    data: settings([skill('instance-a'), skill('instance-b', '/work/b')]), t, onClose() {}, onSaved() {},
  })
  let view = component.render()
  button(view, 'Workspace B').props.onClick()
  view = component.render()
  await button(view, 'save').props.onClick()
  const changes = calls.filter(call => call.url.endsWith('/scope'))
  assert.equal(changes.length, 1)
  assert.equal(changes[0].body.instanceId, 'instance-a')
  assert.equal(changes[0].body.path, '/work/a/.dsh/skills/same-skill')
  assert.deepEqual(changes[0].body.workspaces, ['/work/a', '/work/b'])
})

test('temporary settings require and transmit an explicit current session', async () => {
  const calls = []
  const app = createClient(async (url, options) => { calls.push({ url, body: JSON.parse(options.body) }); return response({ ok: true }) })
  const component = app.mount(app.client.SettingsModal, {
    data: settings([skill('instance-a')]), sessionId: 'live-session', t, onClose() {}, onSaved() {},
  })
  elements(component.render()).find(node => node.type === 'select').props.onChange({ target: { value: 'temp' } })
  await button(component.render(), 'save').props.onClick()
  assert.equal(calls.find(call => call.url.endsWith('/scope')).body.sessionId, 'live-session')
})

test('global settings disable temporary scope and reject forced invalid saves before requests', async () => {
  const calls = []
  const app = createClient(async (...args) => { calls.push(args); return response({ ok: true }) })
  const component = app.mount(app.client.SettingsModal, { data: settings([skill('instance-a')]), t, onClose() {}, onSaved() {} })
  let view = component.render()
  assert.equal(elements(view).find(node => node.type === 'option' && node.props.value === 'temp').props.disabled, true)
  assert.ok(elements(view).some(node => node.props.children.includes('tempSessionRequired')))
  elements(view).find(node => node.type === 'select').props.onChange({ target: { value: 'temp' } })
  await button(component.render(), 'save').props.onClick()
  assert.equal(calls.length, 0)
})

test('workspace changes respect Windows case equivalence and POSIX case sensitivity', () => {
  const { client } = createClient(async () => response({ ok: true }))
  assert.equal(client.sameWorkspaces(['C:\\Work\\A'], ['c:/work/a/']), true)
  assert.equal(client.sameWorkspaces(['/work/A'], ['/work/a']), false)
})

test('API preserves business error details and can return conflicts for user review', async () => {
  const payload = { ok: false, code: 'name-conflict', message: 'Existing skill', conflict: { instanceId: 'one' } }
  const { client } = createClient(async () => response(payload))
  assert.deepEqual(plain(await client.api('/install', { body: {}, allowFailure: true })), payload)
  await assert.rejects(client.api('/install', { body: {} }), error => error.code === 'name-conflict' && error.payload.conflict.instanceId === 'one')
  assert.equal(client.installFailure({ code: 'none-found' }, t).kind, 'none')
  assert.equal(client.installFailure({ code: 'poison' }, t).kind, 'failed')
  assert.equal(client.installFailure({ code: 'session-unavailable' }, t).message, 'sessionUnavailable')
})

test('committed mutation warnings remain visible without turning success into failure', async () => {
  let route
  const app = createClient(async url => {
    route = url.split('/').pop()
    return response({ ok: true, name: 'fixture', warnings: [`${route}: cleanup requires attention`] })
  })
  const notices = app.mount(app.client.ApiWarnings, { t })
  assert.equal(notices.render(), null)
  for (const endpoint of ['/install', '/remote/install', '/toggle', '/delete', '/scope', '/learn']) {
    const result = await app.client.api(endpoint, { body: {} })
    assert.equal(result.ok, true)
    assert.ok(elements(notices.render()).some(node => node.type === 'li' && node.props.children.includes(`${route}: cleanup requires attention`)))
  }
  assert.ok(elements(notices.render()).some(node => node.props.role === 'status'))
  assert.equal(app.timers.length, 0, 'Warnings remain visible until explicitly dismissed')
  button(notices.render(), 'close').props.onClick()
  assert.equal(notices.render(), null)
})

test('recommendation progress stays pending until the server responds and shows actual failure', async () => {
  let finish
  const requests = []
  const app = createClient(async (url, options) => {
    if (url.endsWith('/pending/latest')) return response({ ok: true, sessionId: 'live-session', pending: { kind: 'recommend', need: 'open', label: 'task', searchText: 'query' } })
    if (url.endsWith('/install')) {
      requests.push(JSON.parse(options.body))
      return new Promise(resolve => { finish = resolve })
    }
    return response({ ok: true })
  })
  const component = app.mount(app.client.DetectiveDock, { t })
  component.render()
  await flush()
  const installation = button(component.render(), 'find').props.onClick()
  const pending = elements(component.render()).filter(node => String(node.props.className ?? '').startsWith('sd-step '))
  assert.equal(pending.length, 1)
  assert.equal(pending[0].props.className, 'sd-step run')
  assert.equal(app.timers.length, 0, 'No timer may manufacture completed installation steps')
  finish(response({ ok: false, code: 'audit-unavailable', message: 'Review service offline' }))
  await installation
  const failure = elements(component.render()).find(node => node.props.role === 'alert')
  assert.ok(failure)
  assert.ok(failure.props.children.some(value => String(value).includes('Review service offline')))
  assert.equal(app.timers.length, 0, 'Failure details are displayed without a timed replay')
  const retry = button(component.render(), 'retry').props.onClick()
  assert.equal(requests[1].text, 'query', 'Retry preserves the original open-ended request')
  finish(response({ ok: false, code: 'audit-unavailable' }))
  await retry
})

test('detail and manager actions transmit exact instance identity and the validated session', async () => {
  const calls = []
  const installed = [skill('instance-a'), skill('instance-b', '/work/b')]
  const app = createClient(async (url, options) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null })
    if (url.includes('/state')) return response({ ok: true, ...settings(installed), sessionId: 'live-session', sessionAvailable: true })
    return response({ ok: true, skill: installed[1], preview: '', tree: [] })
  })
  const manager = app.mount(app.client.ManagerPanel, { t, sessionId: 'live-session' })
  manager.render()
  await flush()
  const row = elements(manager.render()).find(node => typeof node.type === 'function' && node.type.name === 'Row' && node.props.skill.instanceId === 'instance-b')
  assert.ok(row)
  await row.props.onToggle(installed[1])
  const toggle = calls.find(call => call.url.endsWith('/toggle'))
  assert.equal(toggle.body.instanceId, 'instance-b')
  assert.equal(toggle.body.path, installed[1].path)
  assert.equal(toggle.body.sessionId, 'live-session')
  const detail = app.mount(app.client.DetailModal, { skill: installed[1], workspace: '/work/b', sessionId: 'live-session', t, onClose() {} })
  detail.render()
  await flush()
  const detailQuery = new URL(calls.find(call => call.url.includes('/detail?')).url, 'http://test.local').searchParams
  assert.equal(detailQuery.get('instanceId'), 'instance-b')
  assert.equal(detailQuery.get('path'), installed[1].path)
  assert.equal(detailQuery.get('sessionId'), 'live-session')
})

test('global manager explicitly selects a named review session and passes it to settings and install', async () => {
  const calls = []
  const app = createClient(async (url, options) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null })
    if (url.includes('/state')) {
      const id = new URL(url, 'http://test.local').searchParams.get('sessionId') || ''
      return response({ ok: true, ...settings([skill('one')]), sessionId: id, sessionAvailable: id === 'session-two', sessions: [{ id: 'session-one', title: 'First conversation' }, { id: 'session-two', title: 'Selected conversation' }] })
    }
    if (url.includes('/market?')) return response({ ok: true, skills: [{ name: 'fixture', description: 'Fixture skill' }] })
    return response({ ok: true, name: 'fixture' })
  })
  const manager = app.mount(app.client.ManagerPanel, { t })
  manager.render()
  await flush()
  let view = manager.render()
  const picker = elements(view).find(node => node.type === 'select' && node.props['aria-label'] === 'reviewSession')
  assert.equal(picker.props.value, '', 'Never silently choose a recent or first session')
  assert.ok(elements(picker).some(node => node.type === 'option' && node.props.children.includes('Selected conversation')))
  picker.props.onChange({ target: { value: 'session-two' } })
  manager.render()
  await flush()
  view = manager.render()
  assert.ok(calls.some(call => call.url.endsWith('/state?sessionId=session-two')))
  button(view, 'settings').props.onClick()
  const settingsModal = elements(manager.render()).find(node => node.type === app.client.SettingsModal)
  assert.equal(settingsModal.props.sessionId, 'session-two')
  settingsModal.props.onClose()
  button(manager.render(), 'market').props.onClick()
  const marketProps = elements(manager.render()).find(node => node.type === app.client.MarketView).props
  assert.equal(marketProps.sessionId, 'session-two')
  const market = app.mount(app.client.MarketView, { ...marketProps, pushToast() {} })
  market.render()
  await flush()
  await button(market.render(), 'install').props.onClick()
  assert.equal(calls.find(call => call.url.endsWith('/install')).body.sessionId, 'session-two')
})

test('global manager without a usable session explains how to enable one', async () => {
  const app = createClient(async () => response({ ok: true, ...settings([]), sessions: [], sessionAvailable: false, sessionId: '' }))
  const manager = app.mount(app.client.ManagerPanel, { t })
  manager.render()
  await flush()
  const view = manager.render()
  const picker = elements(view).find(node => node.type === 'select' && node.props['aria-label'] === 'reviewSession')
  assert.equal(picker.props.value, '')
  assert.equal(elements(picker).filter(node => node.type === 'option').length, 1)
  assert.ok(elements(view).some(node => node.props.children.includes('reviewSessionHint')))
})

test('a late state response cannot replace the explicitly selected review session', async () => {
  const pending = new Map()
  const sessions = [{ id: 'session-one', title: 'First conversation' }, { id: 'session-two', title: 'Second conversation' }]
  const state = id => response({ ok: true, ...settings([skill('one')]), sessions, sessionId: id, sessionAvailable: Boolean(id) })
  const app = createClient(async url => {
    const id = new URL(url, 'http://test.local').searchParams.get('sessionId') || ''
    return id ? new Promise(resolve => pending.set(id, resolve)) : state('')
  })
  const manager = app.mount(app.client.ManagerPanel, { t })
  manager.render()
  await flush()
  const picker = view => elements(view).find(node => node.type === 'select' && node.props['aria-label'] === 'reviewSession')
  picker(manager.render()).props.onChange({ target: { value: 'session-one' } })
  manager.render()
  picker(manager.render()).props.onChange({ target: { value: 'session-two' } })
  manager.render()
  pending.get('session-two')(state('session-two'))
  await flush()
  pending.get('session-one')(state('session-one'))
  await flush()
  button(manager.render(), 'settings').props.onClick()
  const settingsModal = elements(manager.render()).find(node => node.type === app.client.SettingsModal)
  assert.equal(settingsModal.props.sessionId, 'session-two')
})

test('complete markdown sources survive structural merge including long fenced code and later sections', () => {
  const longCode = `\`\`\`python\n${'print("complete")\n'.repeat(120)}## heading inside code\n\`\`\``
  const sourceText = `---\nname: source\n---\n# Source\n\n## 流程\nFirst paragraph.\n\n${longCode}\n\n## 依赖\nKeep this final dependency.\n\n## 验收\n${'完整验收条件。'.repeat(100)}`
  const peerText = '# Peer\n\n## 使用\nPeer instructions.\n\n## 风险\nDo not drop this final warning.'
  const merged = host.buildMergedSkill({ name: 'source', version: '1.0.0', author: 'local-author' }, sourceText, null, [{ entry: { name: 'peer', author: 'peer-author' }, text: peerText }])
  assert.ok(merged.markdown.includes(sourceText.split('---\n')[2]))
  assert.ok(merged.markdown.includes(longCode))
  assert.ok(merged.markdown.includes(peerText))
  assert.deepEqual(merged.authors, ['local-author', 'peer-author'])
  assert.ok(merged.markdown.includes('未自动验证能力提升'))
})

test('learning with companion assets displays preservation details and never adopts an incomplete skill', async () => {
  const requests = []
  const source = skill('instance-a')
  const message = 'Keep the complete source directory; this document merge is preview-only.'
  const app = createClient(async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) })
    return response({
      ok: true, previewOnly: true, code: 'unsupported-learning-assets', message,
      preserveSources: [{ name: source.name, instanceId: source.instanceId, path: source.path, files: [{ path: 'scripts', type: 'dir' }, { path: 'template.bin', type: 'file' }], reason: 'Keep resource references intact.' }],
    })
  })
  const learning = app.mount(app.client.LearnView, {
    t, workspace: '/work/a', sessionId: 'live-session', installed: [source], onBack() {}, onInstalled() {}, pushToast() {},
  })
  const pick = elements(learning.render()).find(node => node.type === 'button' && String(node.props.className).startsWith('sd-pick'))
  await pick.props.onClick()
  const preview = learning.render()
  assert.ok(elements(preview).some(node => node.props.role === 'alert' && elements(node).some(child => child.props.children.includes(message))))
  assert.ok(elements(preview).some(node => node.props.children.includes(source.path)))
  assert.ok(elements(preview).some(node => node.type === 'li' && node.props.children.includes('scripts/')))
  assert.ok(elements(preview).some(node => node.type === 'li' && node.props.children.includes('template.bin')))
  const adopt = button(preview, 'generateMerged')
  assert.equal(adopt.props.disabled, true)
  await adopt.props.onClick()
  assert.equal(requests.length, 1, 'Even a forced handler invocation must not install a preview-only merge')
  assert.equal(requests[0].body.dryRun, true)
})

test('section parsing keeps fenced headings inside the original section', () => {
  const sections = host.sectionsOf('# Title\n## 流程\n```md\n## not a section\n```\n\n## 验收\nCheck.')
  assert.deepEqual(sections.map(section => section.title), ['流程', '验收'])
  assert.ok(sections[0].content.includes('## not a section'))
})

test('document quality scores do not use popularity as task matching evidence', () => {
  const entry = { name: 'fixture', description: 'Example', body: '# fixture\n\n## 流程\n1. One\n2. Two\n3. Three\n\n## 验收\nCheck.', perm: 'files', installs: 0 }
  assert.equal(host.evaluateSkill(entry).score, host.evaluateSkill({ ...entry, installs: 1_000_000 }).score)
  const { client } = createClient(async () => response({ ok: true }))
  assert.equal(client.zh.matchScore, '文档质量分')
})


test('recommendation dock accepts a second session recommendation after a completed install fades', async () => {
  let pending = { sessionId: 'session-one', pending: { kind: 'recommend', need: 'catalog:first', label: 'first' } }
  const installs = []
  const app = createClient(async (url, options) => {
    if (url.endsWith('/pending/latest')) return response({ ok: true, ...pending })
    if (url.endsWith('/install')) installs.push(JSON.parse(options.body))
    if (url.endsWith('/dismiss')) pending = { pending: null }
    return response({ ok: true, name: 'installed' })
  })
  const dock = app.mount(app.client.DetectiveDock, { t })
  dock.render()
  await flush()
  await button(dock.render(), 'find').props.onClick()
  dock.render()
  app.timers[0].fn()
  app.timers[1].fn()
  assert.equal(dock.render(), null)
  pending = { sessionId: 'session-two', pending: { kind: 'recommend', need: 'catalog:second', label: 'second' } }
  await app.intervals[0]()
  assert.equal(dock.render().props.className, 'sd-dock', 'A new recommendation must not inherit the completed bubble fade')
  await button(dock.render(), 'find').props.onClick()
  assert.deepEqual(installs.map(item => [item.need, item.sessionId]), [['catalog:first', 'session-one'], ['catalog:second', 'session-two']])
})

test('moving a temporary skill to either persistent scope keeps its source session for lookup', () => {
  const { client } = createClient(async () => response({ ok: true }))
  const temporary = { ...skill('temp-instance'), scope: 'temp', sessionId: 'live-session' }
  for (const scope of ['global', 'workspace']) {
    const changes = client.scopeChanges([temporary], { 'temp-instance': { scope, workspaces: ['/work/a'] } }, '/work/a', 'live-session', t)
    assert.equal(changes[0].sessionId, 'live-session')
    assert.equal(changes[0].instanceId, 'temp-instance')
  }
})

test('a partially committed scope save retries only the remaining move', async () => {
  const requests = []
  let failSecond = true
  let refreshed = 0
  const first = skill('first')
  const second = { ...skill('second'), name: 'other', path: '/work/a/.dsh/skills/other' }
  const app = createClient(async (url, options) => {
    const body = JSON.parse(options.body)
    if (url.endsWith('/scope')) {
      requests.push(body.instanceId)
      if (body.instanceId === 'second' && failSecond) return response({ ok: false, code: 'name-conflict', message: 'Target exists' })
    }
    return response({ ok: true })
  })
  const modal = app.mount(app.client.SettingsModal, { data: settings([first, second]), t, onClose() {}, onSaved() { refreshed += 1 } })
  modal.render()
  for (const select of elements(modal.render()).filter(node => node.type === 'select')) select.props.onChange({ target: { value: 'global' } })
  await button(modal.render(), 'save').props.onClick()
  assert.equal(refreshed, 1, 'Refresh committed server state after the partial failure')
  failSecond = false
  await button(modal.render(), 'save').props.onClick()
  assert.deepEqual(requests, ['first', 'second', 'second'])
})


test('scope rows rebase committed identities after refresh and preserve the failed edit', async () => {
  const requests = []
  let failSecond = true
  const first = skill('first')
  const second = { ...skill('second'), name: 'other', path: '/work/a/.dsh/skills/other' }
  const props = { data: settings([first, second]), t, onClose() {}, onSaved() {} }
  const app = createClient(async (url, options) => {
    const body = JSON.parse(options.body)
    if (url.endsWith('/scope')) {
      requests.push(body.instanceId)
      if (body.instanceId === 'second' && failSecond) return response({ ok: false, code: 'name-conflict', message: 'Target exists' })
    }
    return response({ ok: true })
  })
  const modal = app.mount(app.client.SettingsModal, props)
  modal.render()
  for (const select of elements(modal.render()).filter(node => node.type === 'select')) select.props.onChange({ target: { value: 'global' } })
  await button(modal.render(), 'save').props.onClick()
  props.data = settings([{ ...first, instanceId: 'global-first', path: '/global/first', scope: 'global' }, second])
  modal.render()
  const selects = elements(modal.render()).filter(node => node.type === 'select')
  assert.deepEqual(selects.map(node => node.props.value), ['global', 'global'])
  failSecond = false
  await button(modal.render(), 'save').props.onClick()
  assert.deepEqual(requests, ['first', 'second', 'second'])
})


test('dock conflict confirmation and failed retry retain the exact target scope and identity', async () => {
  const requests = []
  const target = { name: 'fixture', instanceId: 'workspace-fixture', path: '/work/a/.dsh/skills/fixture', scope: 'workspace' }
  const app = createClient(async (url, options) => {
    if (url.endsWith('/pending/latest')) return response({ ok: true, sessionId: 'review-session', pending: { kind: 'recommend', need: 'catalog:fixture', label: 'Fixture', searchText: 'original search' } })
    if (url.endsWith('/install')) {
      requests.push(JSON.parse(options.body))
      if (requests.length === 1) return response({ ok: false, code: 'name-conflict', conflict: target })
      if (requests.length === 2) throw new TypeError('Network request failed')
      return response({ ok: true, name: 'fixture' })
    }
    return response({ ok: true })
  })
  const dock = app.mount(app.client.DetectiveDock, { t })
  dock.render()
  await flush()
  await button(dock.render(), 'find').props.onClick()
  await button(dock.render(), 'overwriteInstall').props.onClick()
  await button(dock.render(), 'retry').props.onClick()
  const expected = { need: 'catalog:fixture', sessionId: 'review-session', text: 'original search', conflict: 'overwrite', name: target.name, instanceId: target.instanceId, path: target.path, scope: 'workspace' }
  assert.deepEqual(requests[1], expected, 'The confirmed scope overrides a later defaultScope change')
  assert.deepEqual(requests[2], expected, 'Network retry must keep the same confirmed target')
})


test('dock explicit dismissal suppresses only its displayed recommendation ID', async () => {
  const acknowledgements = []
  const app = createClient(async (url, options) => {
    if (url.endsWith('/pending/latest')) return response({ ok: true, sessionId: 'session', pending: { id: 'displayed', kind: 'recommend', need: 'catalog:fixture', label: 'Fixture' } })
    acknowledgements.push(JSON.parse(options.body))
    return response({ ok: true })
  })
  const dock = app.mount(app.client.DetectiveDock, { t })
  dock.render()
  await flush()
  await button(dock.render(), 'notNow').props.onClick()
  assert.deepEqual(acknowledgements, [{ sessionId: 'session', recommendationId: 'displayed', suppress: true }])
})

test('dock success and covered acknowledgements clear their original IDs without suppression', async () => {
  for (const kind of ['recommend', 'covered']) {
    const acknowledgements = []
    let finishInstall
    const app = createClient(async (url, options) => {
      if (url.endsWith('/pending/latest')) return response({ ok: true, sessionId: 'session', pending: { id: 'displayed', kind, need: 'catalog:fixture', label: 'Fixture', name: 'fixture' } })
      if (url.endsWith('/install')) return new Promise(resolve => { finishInstall = resolve })
      acknowledgements.push(JSON.parse(options.body))
      return response({ ok: true })
    })
    const dock = app.mount(app.client.DetectiveDock, { t })
    dock.render()
    await flush()
    if (kind === 'recommend') {
      const install = button(dock.render(), 'find').props.onClick()
      dock.render()
      finishInstall(response({ ok: true, name: 'fixture' }))
      await install
    }
    assert.deepEqual(acknowledgements, [{ sessionId: 'session', recommendationId: 'displayed', suppress: false }])
  }
})
