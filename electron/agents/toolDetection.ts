import { spawn } from 'node:child_process'
import { constants as fsConstants } from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { AgentToolId } from '../../src/lib/agent/agentEvents'
export type { AgentToolInfo } from '../../src/lib/agent/agentApi'

import type { AgentToolInfo } from '../../src/lib/agent/agentApi'

interface ToolSpec {
  id: AgentToolId
  name: string
  binaries: string[]
  /** Installs inside app bundles or vendor folders, checked after PATH. */
  extraPaths: string[]
  /** Must appear in `--help` when a binary name is generic (Cursor's `agent`). */
  helpMarker?: string
  signIn?: { args: string[]; signedIn: (output: string, code: number | null) => boolean }
}

const home = os.homedir()

const SPECS: ToolSpec[] = [
  {
    id: 'claude',
    name: 'Claude Code',
    binaries: ['claude'],
    extraPaths: [path.join(home, '.claude', 'local', 'claude')],
    signIn: {
      args: ['auth', 'status'],
      signedIn: (output) => {
        try {
          return JSON.parse(output).loggedIn === true
        } catch {
          return !/not logged in|"loggedIn":\s*false/i.test(output)
        }
      },
    },
  },
  {
    id: 'codex',
    name: 'Codex (ChatGPT)',
    binaries: ['codex'],
    extraPaths: [
      '/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex',
      '/Applications/Codex.app/Contents/Resources/codex',
      path.join(home, 'Applications', 'ChatGPT.app', 'Contents', 'Resources', 'codex-cli', 'bin', 'codex'),
    ],
    signIn: { args: ['login', 'status'], signedIn: (output, code) => code === 0 && /logged in/i.test(output) && !/not logged in/i.test(output) },
  },
  {
    id: 'cursor',
    name: 'Cursor Agent',
    binaries: ['cursor-agent', 'agent'],
    extraPaths: [],
    helpMarker: 'Cursor Agent',
    signIn: { args: ['status'], signedIn: (output, code) => code === 0 && !/not logged in|login required/i.test(output) },
  },
  {
    id: 'opencode',
    name: 'OpenCode',
    binaries: ['opencode'],
    extraPaths: [path.join(home, '.opencode', 'bin', 'opencode')],
  },
]

async function listDirs(parent: string) {
  try {
    const entries = await fs.readdir(parent)
    return entries.sort().reverse().map((entry) => path.join(parent, entry))
  } catch {
    return []
  }
}

/**
 * Folders where command-line tools and Node usually live. Apps opened from Finder get a
 * minimal PATH, so the user's shell setup cannot be relied on.
 */
export async function knownBinaryDirs(): Promise<string[]> {
  const nodeVersions = [
    ...(await listDirs(path.join(home, '.nvm', 'versions', 'node'))).map((dir) => path.join(dir, 'bin')),
    ...(await listDirs(path.join(home, '.local', 'share', 'fnm', 'node-versions'))).map((dir) => path.join(dir, 'installation', 'bin')),
    ...(await listDirs(path.join(home, '.local', 'share', 'mise', 'installs', 'node'))).map((dir) => path.join(dir, 'bin')),
  ]
  return [
    path.join(home, '.local', 'bin'),
    path.join(home, '.opencode', 'bin'),
    path.join(home, '.npm-global', 'bin'),
    path.join(home, '.volta', 'bin'),
    path.join(home, '.bun', 'bin'),
    path.join(home, '.asdf', 'shims'),
    path.join(home, '.local', 'share', 'mise', 'shims'),
    path.join(home, 'Library', 'pnpm'),
    ...nodeVersions,
    '/opt/homebrew/bin',
    '/usr/local/bin',
    '/usr/bin',
    '/bin',
  ]
}

/** PATH for a tool's process: its own folder first, then the usual places (for `#!/usr/bin/env node`). */
export async function toolPathEnv(toolPath: string) {
  const dirs = [path.dirname(toolPath), ...(process.env.PATH ?? '').split(path.delimiter), ...(await knownBinaryDirs())]
  return [...new Set(dirs.filter((dir) => dir && path.isAbsolute(dir)))].join(path.delimiter)
}

async function isExecutable(file: string) {
  try {
    const stat = await fs.stat(file)
    if (!stat.isFile()) return false
    await fs.access(file, fsConstants.X_OK)
    return true
  } catch {
    return false
  }
}

/** Runs a short command with stdin closed, a time limit and capped output. */
export function probe(file: string, args: string[], env: NodeJS.ProcessEnv, timeoutMs = 8000): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    let output = ''
    let settled = false
    const child = spawn(file, args, { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
    const finish = (code: number | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, output })
    }
    const collect = (data: Buffer) => {
      if (output.length < 32768) output += data.toString()
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('error', () => finish(null))
    child.on('close', finish)
    const timer = setTimeout(() => {
      try {
        if (child.pid) process.kill(-child.pid, 'SIGKILL')
      } catch {
        // Already gone.
      }
      finish(null)
    }, timeoutMs)
  })
}

/** Environment for a tool: the user's environment with a usable PATH and without Electron's own switches. */
export async function toolEnv(toolPath: string): Promise<NodeJS.ProcessEnv> {
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: await toolPathEnv(toolPath) }
  for (const key of Object.keys(env)) {
    if (key.startsWith('ELECTRON_') || key === 'NODE_OPTIONS' || key === 'CLAUDECODE' || key === 'CLAUDE_CODE_ENTRYPOINT') delete env[key]
  }
  return env
}

async function findBinary(spec: ToolSpec): Promise<string | null> {
  const dirs = [...(process.env.PATH ?? '').split(path.delimiter), ...(await knownBinaryDirs())]
  const candidates = [...new Set(spec.binaries.flatMap((name) => dirs.filter((dir) => path.isAbsolute(dir)).map((dir) => path.join(dir, name)))), ...spec.extraPaths]
  for (const candidate of candidates) {
    if (!(await isExecutable(candidate))) continue
    if (spec.helpMarker) {
      const help = await probe(candidate, ['--help'], await toolEnv(candidate))
      if (!help.output.includes(spec.helpMarker)) continue
    }
    return candidate
  }
  return null
}

async function inspect(spec: ToolSpec): Promise<AgentToolInfo> {
  const base = { id: spec.id, name: spec.name }
  const file = await findBinary(spec)
  if (!file) return { ...base, status: 'missing' }
  const env = await toolEnv(file)
  const version = await probe(file, ['--version'], env)
  if (version.code !== 0) {
    return { ...base, status: 'error', path: file, detail: version.output.trim().slice(-400) || 'The tool did not start.' }
  }
  const info: AgentToolInfo = { ...base, status: 'ready', path: file, version: version.output.trim().split('\n')[0].slice(0, 80) }
  if (spec.signIn) {
    const status = await probe(file, spec.signIn.args, env)
    if (!spec.signIn.signedIn(status.output, status.code)) return { ...info, status: 'signed-out' }
  }
  return info
}

/** Which supported AI tools are installed, and whether they are signed in. */
export function detectAgentTools(): Promise<AgentToolInfo[]> {
  return Promise.all(SPECS.map(inspect))
}
