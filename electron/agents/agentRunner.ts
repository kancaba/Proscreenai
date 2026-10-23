import { imageArtifactPaths } from '../../src/lib/agent/imageArtifacts'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { type AgentErrorCode, type AgentEvent, type AgentToolId, parseAgentLine } from '../../src/lib/agent/agentEvents'
import type { McpTool } from '../../src/lib/agent/mcpCore'
import { startMcpHttpServer } from './mcpHttpServer'
import { toolEnv } from './toolDetection'

/** A whole task may run this long before it is stopped. */
const RUN_TIMEOUT_MS = 20 * 60 * 1000
/** After asking a tool to stop, how long it gets before the process group is killed. */
const STOP_GRACE_MS = 5000

export interface AgentLaunch {
  tool: AgentToolId
  /** Same id for a task and its follow-ups: tools keep their conversations per working folder. */
  conversationId: string
  toolPath: string
  prompt: string
  /** Continue an earlier conversation of the same tool. */
  sessionId?: string
  model?: string
  onImageArtifact?: (path:string) => void
  imageMode?: boolean
  images?: string[]
}

interface Command {
  args: string[]
  env?: Record<string, string>
}

/**
 * Command line for each tool: no built-in tools (shell, files, web), only the Pro Screen AI
 * MCP server, which is allowed without prompts, in an empty working folder.
 */
async function buildCommand(launch: AgentLaunch, mcpUrl: string, workDir: string): Promise<Command> {
  const { prompt, sessionId, model } = launch
  switch (launch.tool) {
    case 'claude':
      return {
        args: [
          '-p', prompt,
          '--output-format', 'stream-json', '--verbose',
          '--mcp-config', JSON.stringify({ mcpServers: { screenmovie: { type: 'http', url: mcpUrl } } }),
          '--strict-mcp-config',
          '--tools', '',
          '--allowedTools', 'mcp__screenmovie',
          '--permission-mode', 'dontAsk',
          ...(sessionId ? ['--resume', sessionId] : []),
          ...(model ? ['--model', model] : []),
        ],
      }
    case 'codex': {
      const options = [
        // `exec resume` has no --sandbox flag; the config key works for both.
        '--json', '--skip-git-repo-check', '-c', 'sandbox_mode="read-only"', '--ignore-user-config', '--ignore-rules',
        ...(launch.imageMode ? ['--enable', 'image_generation'] : []),
        ...(launch.images ?? []).flatMap(file => ['--image', file]),
        ...['shell_tool', 'browser_use', 'computer_use', 'apps', 'plugins', ...(launch.imageMode ? [] : ['image_generation']), 'multi_agent', 'hooks'].flatMap((feature) => ['--disable', feature]),
        '-c', `mcp_servers.screenmovie.url=${JSON.stringify(mcpUrl)}`,
        '-c', 'mcp_servers.screenmovie.default_tools_approval_mode="approve"',
        '-c', 'approval_policy="never"',
        ...(model ? ['-m', model] : []),
      ]
      return { args: sessionId ? ['exec', 'resume', ...options, sessionId, prompt] : ['exec', ...options, '-C', workDir, prompt] }
    }
    case 'cursor': {
      await fs.mkdir(path.join(workDir, '.cursor'), { recursive: true })
      await fs.writeFile(path.join(workDir, '.cursor', 'mcp.json'), JSON.stringify({ mcpServers: { screenmovie: { url: mcpUrl } } }))
      return {
        args: [
          '-p', prompt,
          '--output-format', 'stream-json',
          '--approve-mcps', '--trust', '--mode', 'ask',
          '--workspace', workDir,
          ...(sessionId ? ['--resume', sessionId] : []),
          ...(model ? ['--model', model] : []),
        ],
      }
    }
    case 'opencode':
      return {
        args: ['run', '--format', 'json', '--pure', '--dir', workDir, ...(sessionId ? ['--session', sessionId] : []), ...(model ? ['-m', model] : []), prompt],
        env: {
          OPENCODE_CONFIG_CONTENT: JSON.stringify({
            mcp: { screenmovie: { type: 'remote', url: mcpUrl, enabled: true } },
            permission: { edit: 'deny', bash: 'deny', webfetch: 'deny' },
            tools: { bash: false, edit: false, write: false, patch: false, webfetch: false },
          }),
        },
      }
  }
}

const CONVERSATIONS_DIR = path.join(os.tmpdir(), 'screenmovie-agent')
/** Conversation folders are kept for follow-ups and removed after a day. */
const CONVERSATION_MAX_AGE_MS = 24 * 60 * 60 * 1000

/** An empty working folder for one conversation, reused by its follow-ups. */
async function conversationDir(conversationId: string) {
  await fs.mkdir(CONVERSATIONS_DIR, { recursive: true })
  for (const entry of await fs.readdir(CONVERSATIONS_DIR).catch(() => [] as string[])) {
    if (entry === conversationId) continue
    const dir = path.join(CONVERSATIONS_DIR, entry)
    const stat = await fs.stat(dir).catch(() => null)
    if (stat && Date.now() - stat.mtimeMs > CONVERSATION_MAX_AGE_MS) await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined)
  }
  const dir = path.join(CONVERSATIONS_DIR, conversationId)
  await fs.mkdir(dir, { recursive: true })
  return dir
}

export interface AgentRunHandle {
  cancel: () => void
  done: Promise<{ sessionId?: string; error?: { code: AgentErrorCode; message: string } }>
}

/**
 * Runs one turn of an AI tool against the given Pro Screen AI tools and reports progress.
 * The tool's process group is always stopped when the turn ends, fails or is cancelled.
 */
export async function runAgent(launch: AgentLaunch, tools: McpTool[], instructions: string, onEvent: (event: AgentEvent) => void): Promise<AgentRunHandle> {
  const workDir = await conversationDir(launch.conversationId)
  const server = await startMcpHttpServer(tools, instructions)
  const command = await buildCommand(launch, server.url, workDir)
  const env = { ...(await toolEnv(launch.toolPath)), ...command.env }
  const child = spawn(launch.toolPath, command.args, { cwd: workDir, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })

  let sessionId = launch.sessionId
  let error: { code: AgentErrorCode; message: string } | undefined
  let finished = false
  let stopReason: 'cancelled' | 'timeout' | null = null
  let stderrTail = ''
  let pending = ''

  const killGroup = (signal: NodeJS.Signals) => {
    try {
      if (child.pid) process.kill(-child.pid, signal)
    } catch {
      // Already gone.
    }
  }
  const stop = (reason: 'cancelled' | 'timeout') => {
    if (stopReason || child.exitCode !== null) return
    stopReason = reason
    killGroup('SIGTERM')
    setTimeout(() => killGroup('SIGKILL'), STOP_GRACE_MS).unref()
  }
  const timer = setTimeout(() => stop('timeout'), RUN_TIMEOUT_MS)

  const handle = (line: string) => {
    if(launch.imageMode&&launch.onImageArtifact){try{for(const path of imageArtifactPaths(JSON.parse(line)))launch.onImageArtifact(path)}catch{/* Non JSON output is handled below. */}}
    for (const event of parseAgentLine(launch.tool, line)) {
      if (event.kind === 'session') {
        if (event.id === sessionId) continue
        sessionId = event.id
      }
      if (event.kind === 'error') error ??= { code: event.code, message: event.message }
      if (event.kind === 'finished') finished = true
      // Pro Screen AI's own server reports its tool calls; the tool's view would repeat them.
      if (event.kind === 'tool') continue
      onEvent(event)
    }
  }
  child.stdout.on('data', (data: Buffer) => {
    pending += data.toString()
    let newline = pending.indexOf('\n')
    while (newline >= 0) {
      handle(pending.slice(0, newline))
      pending = pending.slice(newline + 1)
      newline = pending.indexOf('\n')
    }
  })
  child.stderr.on('data', (data: Buffer) => {
    stderrTail = (stderrTail + data.toString()).slice(-4000)
  })

  const done = new Promise<{ sessionId?: string; error?: { code: AgentErrorCode; message: string } }>((resolve) => {
    let settled = false
    const settle = async (code: number | null, spawnError?: Error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (pending.trim()) handle(pending)
      killGroup('SIGKILL')
      await server.close()
      if (stopReason) {
        resolve({ sessionId, error: { code: stopReason, message: stopReason === 'timeout' ? 'The task took too long and was stopped.' : 'Cancelled.' } })
      } else if (spawnError) {
        resolve({ sessionId, error: { code: 'not-found', message: spawnError.message } })
      } else if (error) {
        resolve({ sessionId, error })
      } else if (code !== 0 && !finished) {
        const message = stderrTail.trim().split('\n').slice(-6).join('\n') || `The tool exited with code ${code}.`
        resolve({ sessionId, error: { code: /log ?in|authenticat|unauthori[sz]ed|api key/i.test(message) ? 'auth' : 'failed', message: message.slice(0, 800) } })
      } else {
        resolve({ sessionId })
      }
    }
    child.once('error', (spawnError) => void settle(null, spawnError))
    child.once('close', (code) => void settle(code))
  })

  return { cancel: () => stop('cancelled'), done }
}
