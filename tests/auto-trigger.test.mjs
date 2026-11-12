/**
 * Tests for the native auto-trigger service (lib/auto-trigger.mjs).
 *
 * The service spawns the upstream context-mode hook scripts; these tests run
 * STUB scripts from a temp fixture root (config.contextModeRoot) and a fake
 * Cordis context. No host, no network, no node_modules required.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { apply, __internal } from '../lib/auto-trigger.mjs'

/* ----------------------------------------------------------- fixtures -- */

// Stub hook body: reads the JSON payload on stdin, records it to
// $CM_MARKER_DIR/$CM_MARKER_NAME.json (the spawn inherits process.env), then
// runs the canned EMIT expression (stdout writes / exit codes / stderr).
const markerWrite = `
const { writeFileSync: wf } = await import('node:fs')
const { join: j } = await import('node:path')
const chunks = []
process.stdin.on('data', (c) => chunks.push(c))
process.stdin.on('end', async () => {
  let payload = {}
  try { payload = JSON.parse(chunks.join('')) } catch {}
  const dir = process.env.CM_MARKER_DIR
  if (dir) { try { wf(j(dir, process.env.CM_MARKER_NAME + '.json'), JSON.stringify(payload)) } catch {} }
  ${'__EMIT__'}
})
`

function stubFor(event, emit) {
  // `event` scopes the marker name; the stub body itself is event-agnostic.
  void event
  return markerWrite.replace('__EMIT__', emit)
}

function fixtureRoot(stubs) {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-cm-auto-'))
  mkdirSync(join(dir, 'hooks'))
  for (const [script, body] of Object.entries(stubs)) writeFileSync(join(dir, 'hooks', script), body)
  return dir
}

function makeCtx() {
  const listeners = new Map()
  const ctx = {
    listeners,
    warnings: [],
    on(event, fn) {
      const arr = listeners.get(event) ?? []
      arr.push(fn)
      listeners.set(event, arr)
      return () => {}
    },
    get() { return undefined },
    logger: {
      warn: (m) => ctx.warnings.push(m),
      info: () => {},
    },
  }
  return ctx
}

function fire(ctx, event, ...args) {
  const list = ctx.listeners.get(event) ?? []
  assert.equal(list.length, 1, `expected exactly one ${event} listener`)
  return list[0](...args)
}

function fakeAgent(extra = {}) {
  const injected = []
  const steered = []
  return {
    id: 'sess-0001',
    inject: async (m) => { injected.push(m) },
    steer: (m) => { steered.push(m) },
    injected,
    steered,
    ...extra,
  }
}

function markerDir() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-cm-marker-'))
  return dir
}

/* ------------------------------------------------------------- tests -- */

test('registers one listener per enabled event by default', () => {
  const root = fixtureRoot({
    'sessionstart.mjs': stubFor('SessionStart', 'process.exit(0)'),
    'pretooluse.mjs': stubFor('PreToolUse', 'process.exit(0)'),
    'posttooluse.mjs': stubFor('PostToolUse', 'process.exit(0)'),
    'stop.mjs': stubFor('Stop', 'process.exit(0)'),
  })
  const ctx = makeCtx()
  const dispose = apply(ctx, { contextModeRoot: root, configDir: markerDir() })
  try {
    for (const event of ['agent/created', 'tools/pre-execute', 'tools/post-execute', 'agent/turn-stopping']) {
      assert.ok(ctx.listeners.has(event), `missing ${event}`)
    }
  } finally {
    dispose()
    rmSync(root, { recursive: true, force: true })
  }
})

test('enabled:false registers nothing', () => {
  const root = fixtureRoot({ 'pretooluse.mjs': stubFor('PreToolUse', 'process.exit(0)') })
  const ctx = makeCtx()
  const dispose = apply(ctx, { enabled: false, contextModeRoot: root })
  try {
    assert.equal(ctx.listeners.size, 0)
  } finally {
    dispose()
    rmSync(root, { recursive: true, force: true })
  }
})

test('an unresolvable context-mode root registers nothing and warns', () => {
  const empty = mkdtempSync(join(tmpdir(), 'dsh-cm-empty-'))
  const ctx = makeCtx()
  const dispose = apply(ctx, { contextModeRoot: empty })
  try {
    assert.equal(ctx.listeners.size, 0)
    assert.ok(ctx.warnings.some((w) => w.includes('not resolvable')))
  } finally {
    dispose()
    rmSync(empty, { recursive: true, force: true })
  }
})

test('pre-tool: non-matching tool name skips the hook entirely', async () => {
  const root = fixtureRoot({ 'pretooluse.mjs': stubFor('PreToolUse', 'process.exit(0)') })
  const markers = markerDir()
  process.env.CM_MARKER_DIR = markers
  process.env.CM_MARKER_NAME = 'pre'
  const ctx = makeCtx()
  const dispose = apply(ctx, { contextModeRoot: root, configDir: markers })
  try {
    const nextCalls = []
    const next = async () => { nextCalls.push(1); return { kind: 'allow' } }
    const decision = await fire(ctx, 'tools/pre-execute', { name: 'todo_write', arguments: {}, callId: 'c1' }, next)
    assert.deepEqual(decision, { kind: 'allow' })
    assert.equal(nextCalls.length, 1)
    assert.equal(existsSync(join(markers, 'pre.json')), false, 'hook must not spawn for non-matching tools')
  } finally {
    dispose()
    delete process.env.CM_MARKER_DIR
    delete process.env.CM_MARKER_NAME
    rmSync(root, { recursive: true, force: true })
    rmSync(markers, { recursive: true, force: true })
  }
})

test('pre-tool: upstream deny decision becomes a PreToolDecision deny', async () => {
  const root = fixtureRoot({
    'pretooluse.mjs': stubFor('PreToolUse',
      `process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: 'use ctx_execute instead of raw bash' } }))
       process.exit(0)`),
  })
  const markers = markerDir()
  process.env.CM_MARKER_DIR = markers
  process.env.CM_MARKER_NAME = 'pre'
  const ctx = makeCtx()
  const agent = fakeAgent()
  const dispose = apply(ctx, { contextModeRoot: root, configDir: markers })
  try {
    let nextCalled = false
    const next = async () => { nextCalled = true; return { kind: 'allow' } }
    const decision = await fire(ctx, 'tools/pre-execute',
      { name: 'bash', arguments: { command: 'find / -name x' }, callId: 'c2', agent }, next)
    assert.equal(nextCalled, false, 'a deny decision must not delegate downstream')
    assert.deepEqual(decision, { kind: 'deny', reason: 'use ctx_execute instead of raw bash' })
    const payload = JSON.parse(readFileSync(join(markers, 'pre.json'), 'utf8'))
    assert.equal(payload.hook_event_name, 'PreToolUse')
    assert.equal(payload.tool_name, 'bash')
    assert.equal(payload.session_id, 'sess-0001')
    assert.equal(payload.tool_use_id, 'c2')
  } finally {
    dispose()
    delete process.env.CM_MARKER_DIR
    delete process.env.CM_MARKER_NAME
    rmSync(root, { recursive: true, force: true })
    rmSync(markers, { recursive: true, force: true })
  }
})

test('pre-tool: ask without a reason gets the canonical reason', async () => {
  const root = fixtureRoot({
    'pretooluse.mjs': stubFor('PreToolUse',
      `process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask' } }))
       process.exit(0)`),
  })
  const ctx = makeCtx()
  const dispose = apply(ctx, { contextModeRoot: root, configDir: markerDir() })
  try {
    const decision = await fire(ctx, 'tools/pre-execute',
      { name: 'read', arguments: {}, callId: 'c3' }, async () => ({ kind: 'allow' }))
    assert.deepEqual(decision, { kind: 'ask', reason: 'approval requested by context-mode PreToolUse auto-trigger' })
  } finally {
    dispose()
    rmSync(root, { recursive: true, force: true })
  }
})

test('post-tool: additionalContext is prepended to the downstream decision', async () => {
  const root = fixtureRoot({
    'posttooluse.mjs': stubFor('PostToolUse',
      `process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: 'big output auto-indexed' } }))
       process.exit(0)`),
  })
  const ctx = makeCtx()
  const dispose = apply(ctx, { contextModeRoot: root, configDir: markerDir() })
  try {
    const downstream = { kind: 'accept' }
    const decision = await fire(ctx, 'tools/post-execute',
      { name: 'grep', arguments: {}, callId: 'c4' },
      { content: [{ type: 'text', text: 'out' }] },
      async () => downstream)
    assert.equal(decision.kind, 'accept')
    assert.equal(decision.additionalContexts.length, 1)
    assert.equal(decision.additionalContexts[0].role, 'user')
    assert.equal(decision.additionalContexts[0].content[0].text, 'big output auto-indexed')
    assert.ok(decision.additionalContexts[0].id, 'message carries an identity')
  } finally {
    dispose()
    rmSync(root, { recursive: true, force: true })
  }
})

test('post-tool: exit-2 stderr becomes a block decision (no downstream)', async () => {
  const root = fixtureRoot({
    'posttooluse.mjs': stubFor('PostToolUse', `process.stderr.write('quota exceeded'); process.exit(2)`),
  })
  const ctx = makeCtx()
  const dispose = apply(ctx, { contextModeRoot: root, configDir: markerDir() })
  try {
    let nextCalled = false
    const decision = await fire(ctx, 'tools/post-execute',
      { name: 'bash', arguments: {}, callId: 'c5' },
      { content: [] },
      async () => { nextCalled = true; return { kind: 'accept' } })
    assert.equal(nextCalled, false)
    assert.equal(decision.kind, 'block')
    assert.equal(decision.feedback[0].text, 'quota exceeded')
  } finally {
    dispose()
    rmSync(root, { recursive: true, force: true })
  }
})

test('session-start: additionalContext is injected into the agent', async () => {
  const root = fixtureRoot({
    'sessionstart.mjs': stubFor('SessionStart',
      `process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'routing-block' } }))
       process.exit(0)`),
  })
  const markers = markerDir()
  process.env.CM_MARKER_DIR = markers
  process.env.CM_MARKER_NAME = 'created'
  const ctx = makeCtx()
  const agent = fakeAgent()
  const dispose = apply(ctx, { contextModeRoot: root, configDir: markers })
  try {
    await fire(ctx, 'agent/created', { agent, source: 'resume' })
    assert.equal(agent.injected.length, 1)
    assert.equal(agent.injected[0].content[0].text, 'routing-block')
    const payload = JSON.parse(readFileSync(join(markers, 'created.json'), 'utf8'))
    assert.equal(payload.source, 'resume')
  } finally {
    dispose()
    delete process.env.CM_MARKER_DIR
    delete process.env.CM_MARKER_NAME
    rmSync(root, { recursive: true, force: true })
    rmSync(markers, { recursive: true, force: true })
  }
})

test('stop: upstream deny steers the agent to continue', async () => {
  const root = fixtureRoot({
    'stop.mjs': stubFor('Stop',
      `process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'Stop', permissionDecision: 'deny', permissionDecisionReason: 'pending capture' } }))
       process.exit(0)`),
  })
  const ctx = makeCtx()
  const agent = fakeAgent()
  const dispose = apply(ctx, { contextModeRoot: root, configDir: markerDir() })
  try {
    await fire(ctx, 'agent/turn-stopping', { agent, turn: 2 })
    assert.equal(agent.steered.length, 1)
    assert.equal(agent.steered[0].content[0].text, 'pending capture')
  } finally {
    dispose()
    rmSync(root, { recursive: true, force: true })
  }
})

test('fail-open: a hook that exits 1 never changes the pre decision', async () => {
  const root = fixtureRoot({ 'pretooluse.mjs': stubFor('PreToolUse', `process.stderr.write('boom'); process.exit(1)`) })
  const ctx = makeCtx()
  const dispose = apply(ctx, { contextModeRoot: root, configDir: markerDir() })
  try {
    let nextCalls = 0
    const next = async () => { nextCalls += 1; return { kind: 'allow' } }
    const decision = await fire(ctx, 'tools/pre-execute', { name: 'bash', arguments: {}, callId: 'c6' }, next)
    assert.deepEqual(decision, { kind: 'allow' })
    assert.equal(nextCalls, 1)
  } finally {
    dispose()
    rmSync(root, { recursive: true, force: true })
  }
})

test('timeout: a hanging hook is killed and treated as neutral', async () => {
  const root = fixtureRoot({ 'pretooluse.mjs': stubFor('PreToolUse', `setTimeout(() => {}, 30000)`) })
  const ctx = makeCtx()
  const dispose = apply(ctx, { contextModeRoot: root, configDir: markerDir(), timeoutMs: 400 })
  try {
    let nextCalls = 0
    const next = async () => { nextCalls += 1; return { kind: 'allow' } }
    const decision = await fire(ctx, 'tools/pre-execute', { name: 'bash', arguments: {}, callId: 'c7' }, next)
    assert.deepEqual(decision, { kind: 'allow' })
    assert.equal(nextCalls, 1)
  } finally {
    dispose()
    rmSync(root, { recursive: true, force: true })
  }
})

test('per-event toggles only register the enabled seams', () => {
  const root = fixtureRoot({
    'sessionstart.mjs': stubFor('SessionStart', 'process.exit(0)'),
    'pretooluse.mjs': stubFor('PreToolUse', 'process.exit(0)'),
    'posttooluse.mjs': stubFor('PostToolUse', 'process.exit(0)'),
    'stop.mjs': stubFor('Stop', 'process.exit(0)'),
  })
  const ctx = makeCtx()
  // Toggles merge over the all-enabled default: disabling three seams must
  // leave exactly the unlisted one (preToolUse) registered.
  const dispose = apply(ctx, { contextModeRoot: root, configDir: markerDir(), events: { sessionStart: false, postToolUse: false, stop: false } })
  try {
    assert.deepEqual([...ctx.listeners.keys()].sort(), ['tools/pre-execute'])
  } finally {
    dispose()
    rmSync(root, { recursive: true, force: true })
  }
})

test('parse: out-of-band top-level deny is ignored (host-protocol rule)', () => {
  const out = __internal.parseHookOutput(0, JSON.stringify({ decision: 'deny', reason: 'x' }), '', 'PreToolUse')
  assert.equal(out.decision, undefined, 'top-level "deny" is not a valid decision')
})

test('parse: a mismatched hookEventName discards event-scoped fields', () => {
  const out = __internal.parseHookOutput(0, JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: 'stale' },
  }), '', 'PostToolUse')
  assert.equal(out.additionalContext, undefined)
  assert.equal(out.hookEventName, 'PreToolUse', 'the claim itself is still recorded')
})

test('parse: malformed stdout stays plain text, no decision', () => {
  const out = __internal.parseHookOutput(0, 'not json', '', 'Stop')
  assert.equal(out.decision, undefined)
  assert.equal(out.stdout, 'not json')
})

test('session-start: CC-dialect tool names are rewritten to the DSH prefix by default', async () => {
  const root = fixtureRoot({
    'sessionstart.mjs': stubFor('SessionStart',
      `process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: 'call mcp__plugin_context-mode_context-mode__ctx_search now' } }))
       process.exit(0)`),
  })
  const ctx = makeCtx()
  const agent = fakeAgent()
  const dispose = apply(ctx, { contextModeRoot: root, configDir: markerDir() })
  try {
    await fire(ctx, 'agent/created', { agent, source: 'startup' })
    assert.equal(agent.injected.length, 1)
    assert.equal(agent.injected[0].content[0].text, 'call mcp__context_mode__ctx_search now')
  } finally {
    dispose()
    rmSync(root, { recursive: true, force: true })
  }
})

test('tool-name rewrite: disabled verbatim, or pointed at a custom mount prefix', async () => {
  const cc = 'mcp__plugin_context-mode_context-mode__ctx_search'
  const emit = `process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: ${JSON.stringify(cc)} } }))\nprocess.exit(0)`
  {
    const root = fixtureRoot({ 'sessionstart.mjs': stubFor('SessionStart', emit) })
    const ctx = makeCtx()
    const agent = fakeAgent()
    const dispose = apply(ctx, { contextModeRoot: root, configDir: markerDir(), toolNameRewrite: false })
    try {
      await fire(ctx, 'agent/created', { agent })
      assert.equal(agent.injected[0].content[0].text, cc)
    } finally {
      dispose()
      rmSync(root, { recursive: true, force: true })
    }
  }
  {
    const root = fixtureRoot({ 'sessionstart.mjs': stubFor('SessionStart', emit) })
    const ctx = makeCtx()
    const agent = fakeAgent()
    const dispose = apply(ctx, { contextModeRoot: root, configDir: markerDir(), dshToolPrefix: 'mcp__cm__' })
    try {
      await fire(ctx, 'agent/created', { agent })
      assert.equal(agent.injected[0].content[0].text, 'mcp__cm__ctx_search')
    } finally {
      dispose()
      rmSync(root, { recursive: true, force: true })
    }
  }
})

test('stop: a repeated block steers one agent at most once', async () => {
  const root = fixtureRoot({
    'stop.mjs': stubFor('Stop',
      `process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'Stop', permissionDecision: 'deny', permissionDecisionReason: 'pending capture' } }))
       process.exit(0)`),
  })
  const ctx = makeCtx()
  const agent = fakeAgent()
  const dispose = apply(ctx, { contextModeRoot: root, configDir: markerDir() })
  try {
    await fire(ctx, 'agent/turn-stopping', { agent, turn: 1 })
    await fire(ctx, 'agent/turn-stopping', { agent, turn: 2 })
    await fire(ctx, 'agent/turn-stopping', { agent, turn: 3 })
    assert.equal(agent.steered.length, 1, 'only the first block may force continuation')
  } finally {
    dispose()
    rmSync(root, { recursive: true, force: true })
  }
})

test('hook spawn env carries CONTEXT_MODE_PLATFORM=dsh', async () => {
  const root = fixtureRoot({
    'pretooluse.mjs': stubFor('PreToolUse',
      `process.stdout.write('{}')
       wf(j(dir, 'env.json'), JSON.stringify({ platform: process.env.CONTEXT_MODE_PLATFORM }))
       process.exit(0)`),
  })
  const markers = markerDir()
  process.env.CM_MARKER_DIR = markers
  process.env.CM_MARKER_NAME = 'pre'
  const ctx = makeCtx()
  const agent = fakeAgent()
  const dispose = apply(ctx, { contextModeRoot: root, configDir: markers })
  try {
    const decision = await fire(ctx, 'tools/pre-execute',
      { name: 'bash', arguments: {}, callId: 'c8', agent }, async () => ({ kind: 'allow' }))
    assert.equal(decision.kind, 'allow')
    const env = JSON.parse(readFileSync(join(markers, 'env.json'), 'utf8'))
    assert.equal(env.platform, 'dsh')
  } finally {
    dispose()
    delete process.env.CM_MARKER_DIR
    delete process.env.CM_MARKER_NAME
    rmSync(root, { recursive: true, force: true })
    rmSync(markers, { recursive: true, force: true })
  }
})
