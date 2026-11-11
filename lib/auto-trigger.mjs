/**
 * dsh-context-mode auto-trigger: native DeepSeek Harness service entry.
 *
 * Runs the upstream context-mode hook scripts (the same Claude Code-dialect
 * entries the 18 supported platforms use) on DSH's own lifecycle seams,
 * with no Claude Code hook bridge and no hooks.json config file:
 *
 *   DSH seam                  -> context-mode hook
 *   -------------------------  -----------------------------
 *   agent/created              hooks/sessionstart.mjs   (routing block + resume snapshot injected)
 *   tools/pre-execute          hooks/pretooluse.mjs     (big-output tools nudged onto ctx_* tools)
 *   tools/post-execute         hooks/posttooluse.mjs    (session event capture)
 *   agent/turn-stopping        hooks/stop.mjs           (turn-end capture / forced continuation)
 *
 * PreCompact has no DSH bridge seam (upstream compaction is owned by the
 * mulqi-context-compression plugin), so it is out of scope here.
 *
 * Guarantees:
 *   - Zero runtime dependencies (Node builtins only; @deepseek-ai/dsh-llm is
 *     used opportunistically when resolvable, with a plain-object fallback).
 *   - Fail-open on every hook failure: a hook error, timeout, or spawn
 *     failure never blocks, replaces, or crashes the calling turn.
 *   - The `agent/created` listener never throws (a throwing listener vetoes
 *     agent creation in the host), so all its errors are swallowed+logged.
 *
 * Config (the mount row's `config` in cordis.patch.yml; all optional):
 *   enabled          bool    default true — kill switch.
 *   events           obj    per-event toggles: sessionStart, preToolUse,
 *                           postToolUse, stop (default all true).
 *   toolMatcher      regex  matched against the DSH tool name for the
 *                           Pre/PostToolUse gates (default: the big-output
 *                           producers listed below; upstream gating —
 *                           size thresholds, bounded-command allowlist,
 *                           MCP-readiness — still runs inside the hook).
 *   timeoutMs        number  per-hook timeout, default 15000.
 *   configDir        string  CLAUDE_CONFIG_DIR exported to hook processes;
 *                           default $DSH_HOME/context-mode-hooks.
 *   contextModeRoot  string  override the resolved context-mode package
 *                           root (used by tests).
 */

import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

/** Cordis entry identity (diagnostic label in host logs). */
export const name = 'dsh-context-mode-auto'

const ENTRY = 'dsh-context-mode-auto-trigger'

const DEFAULT_TOOL_MATCHER =
  '^(bash|read|grep|glob|web_fetch|webSearch|read_page|platform_search|advanced_search|browser_(content|scrape|snapshot|execute|screenshot))$|^mcp__context_mode__'

const DEFAULT_TIMEOUT_MS = 15000

/** DSH seam -> upstream hook script + Claude-dialect event name. */
const HOOK_SCRIPTS = {
  sessionStart: { script: 'sessionstart.mjs', event: 'SessionStart' },
  preToolUse: { script: 'pretooluse.mjs', event: 'PreToolUse' },
  postToolUse: { script: 'posttooluse.mjs', event: 'PostToolUse' },
  stop: { script: 'stop.mjs', event: 'Stop' },
}

const EVENT_KEYS = Object.keys(HOOK_SCRIPTS)

/**
 * @param {object} ctx Cordis plugin context.
 * @param {object} [userConfig] mount-row config (see module docs).
 * @returns {() => void} disposer for every registration performed here.
 */
export function apply(ctx, userConfig = {}) {
  const cfg = normalizeConfig(userConfig, ctx)
  if (!cfg.enabled) {
    ctx.logger?.info?.(`${ENTRY}: disabled by config; no auto-trigger listeners registered`)
    return () => {}
  }

  const root = cfg.contextModeRoot ?? resolveContextModeRoot()
  if (root === undefined || !existsSync(join(root, 'hooks'))) {
    ctx.logger?.warn?.(
      `${ENTRY}: context-mode package root not resolvable (looked up "context-mode" from ${join(dirname(new URL('.', import.meta.url).pathname))} or config.contextModeRoot); auto-trigger inactive. Install the context-mode dependency or set contextModeRoot.`,
    )
    return () => {}
  }

  // Opportunistic host message factory: frozen, host-stamped UserMessages when
  // @deepseek-ai/dsh-llm is resolvable from the profile; plain object otherwise.
  void ensureMessageFactory()

  // The matcher compiled once here (normalizeConfig guarantees validity);
  // per-call regex construction would re-validate on every tool execution.
  const toolRe = new RegExp(cfg.toolMatcher)
  const disposers = []
  const workdirOf = (agent) => {
    try {
      const wd = ctx.get?.('workingDirectory')
      const session = agent?.session
      if (wd && typeof wd.get === 'function' && session !== undefined) return wd.get(session)
    } catch { /* best effort */ }
    return undefined
  }

  for (const key of EVENT_KEYS) {
    if (!cfg.events[key]) continue
    const hook = HOOK_SCRIPTS[key]
    const scriptPath = join(root, 'hooks', hook.script)
    if (!existsSync(scriptPath)) {
      ctx.logger?.warn?.(`${ENTRY}: hook script missing at ${scriptPath}; event "${key}" skipped`)
      continue
    }
    const run = (agent, extraPayload, signal) =>
      runAndParse(scriptPath, hook.event, {
        ...basePayload(agent, hook.event),
        ...extraPayload,
      }, cfg, workdirOf(agent), signal)
    disposers.push(registerListener(ctx, key, { run, toolRe }))
  }

  return () => {
    for (const dispose of disposers) dispose()
  }
}

/* ---------------------------------------------------------------- config -- */

function normalizeConfig(userConfig, ctx) {
  const events = { sessionStart: true, preToolUse: true, postToolUse: true, stop: true }
  for (const key of EVENT_KEYS) {
    if (typeof userConfig?.events?.[key] === 'boolean') events[key] = userConfig.events[key]
  }

  let matcher = DEFAULT_TOOL_MATCHER
  if (typeof userConfig?.toolMatcher === 'string' && userConfig.toolMatcher.length > 0) {
    try {
      new RegExp(userConfig.toolMatcher)
      matcher = userConfig.toolMatcher
    } catch {
      ctx.logger?.warn?.(`${ENTRY}: invalid toolMatcher regex ${JSON.stringify(userConfig.toolMatcher)}; using the default`)
    }
  }

  const timeoutMs = Number.isFinite(userConfig?.timeoutMs) && userConfig.timeoutMs > 0
    ? userConfig.timeoutMs
    : DEFAULT_TIMEOUT_MS

  const configDir = typeof userConfig?.configDir === 'string' && userConfig.configDir.length > 0
    ? userConfig.configDir
    : join(process.env.DSH_HOME || join(homedir(), '.dsh'), 'context-mode-hooks')

  return {
    enabled: userConfig?.enabled !== false,
    events,
    toolMatcher: matcher,
    timeoutMs,
    configDir,
    contextModeRoot: typeof userConfig?.contextModeRoot === 'string' && userConfig.contextModeRoot.length > 0
      ? userConfig.contextModeRoot
      : undefined,
  }
}

function resolveContextModeRoot() {
  try {
    const require_ = createRequire(import.meta.url)
    // Walk up from the resolved entry point until the directory that actually
    // contains the hooks/ tree (the exports map may point at a build subdir).
    let dir = dirname(require_.resolve('context-mode'))
    for (let i = 0; i < 4; i += 1) {
      if (existsSync(join(dir, 'hooks', 'pretooluse.mjs'))) return dir
      const parent = dirname(dir)
      if (parent === dir) break
      dir = parent
    }
    return undefined
  } catch {
    return undefined
  }
}

/* ------------------------------------------------------------- listeners -- */

/**
 * Register one seam listener. Every body is fail-open: a hook failure must
 * never change the decision of the turn it runs in.
 */
/** ctx.on that always yields a disposer (the host may return undefined). */
function ctxOn(ctx, event, handler) {
  const registered = ctx.on(event, handler)
  return typeof registered === 'function' ? registered : () => {}
}

function registerListener(ctx, key, { run, toolRe }) {
  const log = (level, msg) => {
    const fn = ctx.logger?.[level] ?? ctx.logger?.warn
    fn?.(msg)
  }

  switch (key) {
    case 'sessionStart':
      return ctxOn(ctx, 'agent/created', async ({ agent, source, signal } = {}) => {
        // NEVER throws: a throwing agent/created listener vetoes creation.
        try {
          const out = await run(agent, { source: String(source ?? 'startup') }, signal)
          if (out.additionalContext && typeof agent?.inject === 'function') {
            await agent.inject(makeMessage(out.additionalContext))
          }
        } catch (error) {
          log('warn', `${ENTRY}: sessionStart hook failed (fail-open): ${errMsg(error)}`)
        }
      })

    case 'preToolUse':
      return ctxOn(ctx, 'tools/pre-execute', async (exec, next) => {
        // Each path below calls next() at most once.
        if (!toolRe.test(String(exec?.name ?? ''))) return next()
        let out
        try {
          out = await run(exec.agent, {
            tool_name: exec.name,
            tool_input: exec.arguments,
            tool_use_id: exec.callId,
          }, exec.signal)
        } catch (error) {
          log('warn', `${ENTRY}: preToolUse hook failed (fail-open): ${errMsg(error)}`)
          return next()
        }
        if (out.decision === 'deny' || out.decision === 'block') {
          return { kind: 'deny', reason: out.reason || 'blocked by context-mode PreToolUse auto-trigger' }
        }
        if (out.decision === 'ask') {
          return { kind: 'ask', reason: out.reason || 'approval requested by context-mode PreToolUse auto-trigger' }
        }
        return next()
      })

    case 'postToolUse':
      return ctxOn(ctx, 'tools/post-execute', async (exec, result, next) => {
        if (!toolRe.test(String(exec?.name ?? ''))) return next()
        let out
        try {
          out = await run(exec.agent, {
            tool_name: exec.name,
            tool_input: exec.arguments,
            tool_use_id: exec.callId,
            tool_response: blocksToText(result?.content),
          }, exec.signal)
        } catch (error) {
          log('warn', `${ENTRY}: postToolUse hook failed (fail-open): ${errMsg(error)}`)
          return next()
        }
        if (out.decision === 'deny' || out.decision === 'block') {
          const decision = {
            kind: 'block',
            feedback: [{ type: 'text', text: out.reason || 'blocked by context-mode PostToolUse auto-trigger' }],
          }
          if (out.additionalContext) decision.additionalContexts = [makeMessage(out.additionalContext)]
          return decision
        }
        const downstream = await next()
        if (!out.additionalContext) return downstream
        return { ...downstream, additionalContexts: [makeMessage(out.additionalContext), ...(downstream.additionalContexts ?? [])] }
      })

    case 'stop':
      return ctxOn(ctx, 'agent/turn-stopping', async ({ agent, signal } = {}) => {
        try {
          const out = await run(agent, { stop_hook_active: false }, signal)
          if ((out.decision === 'deny' || out.decision === 'block') && typeof agent?.steer === 'function') {
            agent.steer(makeMessage(out.reason || 'continue: blocked by context-mode Stop auto-trigger'))
          }
        } catch (error) {
          log('warn', `${ENTRY}: stop hook failed (fail-open): ${errMsg(error)}`)
        }
      })

    default:
      throw new Error(`${ENTRY}: unknown event "${key}"`)
  }
}

/* ------------------------------------------------------- hook execution -- */

/** Claude-dialect stdin payload base (field names mirror the host's CC bridge). */
function basePayload(agent, event) {
  return {
    session_id: typeof agent?.id === 'string' ? agent.id : '',
    transcript_path: '',
    hook_event_name: event,
  }
}

/** Flatten content blocks to text (the common case; non-text blocks drop out). */
function blocksToText(content) {
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
}

/**
 * Spawn one hook script with the JSON payload on stdin and decode its
 * Claude-dialect stdout (same parse/merge rules as the host's hook protocol:
 * exit 2 = block with stderr reason; structured stdout only on exit 0;
 * hookSpecificOutput gated on a matching hookEventName; top-level `decision`
 * is `approve`/`block` only).
 */
async function runAndParse(scriptPath, expectedEventName, payload, cfg, cwd, signal) {
  const run = await runScript(scriptPath, payload, {
    cwd,
    env: {
      ...process.env,
      CLAUDE_CONFIG_DIR: cfg.configDir,
      ...(cwd !== undefined ? { CLAUDE_PROJECT_DIR: cwd } : {}),
    },
    timeoutMs: cfg.timeoutMs,
    signal,
  })
  if (run.error) {
    return { error: run.error } // spawn-level failure: no decision, no context
  }
  return parseHookOutput(run.exitCode, run.stdout, run.stderr, expectedEventName)
}

function runScript(scriptPath, payload, { cwd, env, timeoutMs, signal }) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(process.execPath, [scriptPath], {
        cwd: cwd ?? process.cwd(),
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch (error) {
      resolve({ error: errMsg(error) })
      return
    }
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (value) => { if (!settled) { settled = true; resolve(value) } }
    const kill = () => { try { child.kill('SIGKILL') } catch { /* already gone */ } }
    const timer = setTimeout(kill, timeoutMs)
    if (signal?.aborted) kill()
    else signal?.addEventListener?.('abort', kill, { once: true })
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', (error) => { clearTimeout(timer); finish({ error: errMsg(error) }) })
    child.on('close', (code) => { clearTimeout(timer); finish({ exitCode: code, stdout, stderr }) })
    try {
      child.stdin.end(JSON.stringify(payload) + '\n')
    } catch (error) {
      clearTimeout(timer)
      finish({ error: errMsg(error) })
    }
  })
}

/** Decode one hook process outcome into a dialect-neutral decision view. */
function parseHookOutput(exitCode, stdout, stderr, expectedEventName) {
  const out = {
    exitCode,
    stdout: stdout?.trim() ?? '',
    stderr: stderr?.trim() ?? '',
  }
  if (exitCode === 2) {
    out.decision = 'block'
    if (out.stderr.length > 0) out.reason = out.stderr
  }
  if (exitCode === 0 && out.stdout.startsWith('{')) {
    let parsed
    try { parsed = JSON.parse(out.stdout) } catch { parsed = undefined }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const str = (o, k) => (typeof o[k] === 'string' ? o[k] : undefined)
      const bool = (o, k) => (typeof o[k] === 'boolean' ? o[k] : undefined)
      const cont = bool(parsed, 'continue')
      if (cont !== undefined) out.continue = cont
      const stopReason = str(parsed, 'stopReason')
      if (stopReason !== undefined) out.stopReason = stopReason
      const sysMsg = str(parsed, 'systemMessage')
      if (sysMsg !== undefined) out.systemMessage = sysMsg
      // Top-level `decision` is only `approve`/`block`; anything else is ignored.
      const top = str(parsed, 'decision')
      if (top === 'approve') out.decision = 'allow'
      else if (top === 'block') out.decision = 'block'
      const topReason = str(parsed, 'reason')
      if (topReason !== undefined) out.reason = topReason
      const hso = parsed.hookSpecificOutput
      if (hso && typeof hso === 'object' && !Array.isArray(hso)) {
        const eventName = str(hso, 'hookEventName')
        if (eventName !== undefined) out.hookEventName = eventName
        if (expectedEventName !== undefined && eventName !== expectedEventName) {
          /* event-scoped fields discarded; top-level fields above stand */
        } else {
          const permission = str(hso, 'permissionDecision')
          if (permission === 'allow' || permission === 'deny' || permission === 'ask') out.decision = permission
          const permissionReason = str(hso, 'permissionDecisionReason')
          if (permissionReason !== undefined) out.reason = permissionReason
          const additional = str(hso, 'additionalContext')
          if (additional !== undefined) out.additionalContext = additional
        }
      }
    }
  }
  return out
}

/* -------------------------------------------------------- message factory -- */

let messageFactory
/**
 * Prefer the host's `createUserMessage` (frozen, host-stamped identity) when
 * resolvable from the profile's node_modules; otherwise fall back to a plain
 * UserMessage-shaped object (role + text content + fresh id, no source tag).
 */
async function ensureMessageFactory() {
  if (messageFactory !== undefined) return messageFactory
  try {
    const mod = await import('@deepseek-ai/dsh-llm')
    if (typeof mod.createUserMessage === 'function') {
      messageFactory = (text) =>
        mod.createUserMessage({ content: [{ type: 'text', text }] })
    } else {
      messageFactory = null
    }
  } catch {
    messageFactory = null
  }
  return messageFactory
}

function makeMessage(text) {
  // The factory loads fire-and-forget at apply time; while still loading or
  // unavailable, the plain fallback (role + text content + fresh id) is
  // type-valid for user-role messages, which carry no required source tag.
  if (messageFactory !== null && messageFactory !== undefined) {
    try {
      const built = messageFactory(text)
      if (built && typeof built === 'object' && built.role === 'user') return built
    } catch { /* fall through to the plain form */ }
  }
  return plainUserMessage(text)
}

function plainUserMessage(text) {
  return { role: 'user', id: randomUUID(), content: [{ type: 'text', text }] }
}

function errMsg(error) {
  return error instanceof Error ? error.message : String(error)
}

/* Used by tests: expose internals without a public API change. */
export const __internal = Object.freeze({ HOOK_SCRIPTS, DEFAULT_TOOL_MATCHER, DEFAULT_TIMEOUT_MS, parseHookOutput })
