import { randomUUID } from 'node:crypto'
import { ipcMain, type WebContents } from 'electron'
import type { AgentRunEvent } from '../../src/lib/agent/agentApi'
import type { AgentToolId } from '../../src/lib/agent/agentEvents'
import { parseAgentSnapshot } from '../../src/lib/agent/agentSnapshot'
import { agentInstructions, buildAgentPrompt } from '../../src/lib/agent/agentTasks'
import { sanitizeProposalSet } from '../../src/lib/agent/proposals'
import { resolveReadableMediaPath } from '../ipcValidation'
import type { TranscriptionDeps } from '../transcription'
import { createAgentSession } from './agentSession'
import { runAgent } from './agentRunner'
import { type AgentToolInfo, detectAgentTools } from './toolDetection'

const TOOL_IDS: AgentToolId[] = ['claude', 'codex', 'cursor', 'opencode']
const DETECTION_MAX_AGE_MS = 60_000


export function registerAgentHandlers(deps: TranscriptionDeps) {
  let detected: { at: number; tools: AgentToolInfo[] } | null = null
  const runs = new Map<string, { cancel: () => void; owner: WebContents }>()

  const detect = async (force: boolean) => {
    if (!force && detected && Date.now() - detected.at < DETECTION_MAX_AGE_MS) return detected.tools
    detected = { at: Date.now(), tools: await detectAgentTools() }
    return detected.tools
  }

  ipcMain.handle('agent-detect-tools', (_event, force?: unknown) => detect(force === true))

  ipcMain.handle('agent-cancel', (event, runId: unknown) => {
    const run = typeof runId === 'string' ? runs.get(runId) : undefined
    if (run && run.owner === event.sender) run.cancel()
  })

  ipcMain.handle('agent-start', async (event, input: Record<string, unknown> | null) => {
    const tool = TOOL_IDS.find((id) => id === input?.tool)
    const request = typeof input?.request === 'string' ? input.request.trim() : ''
    const snapshot = parseAgentSnapshot(input?.snapshot)
    const sessionId = typeof input?.sessionId === 'string' && /^[\w.:-]{1,200}$/.test(input.sessionId) ? input.sessionId : undefined
    const model = typeof input?.model === 'string' && /^[\w./:-]{1,100}$/.test(input.model) ? input.model : undefined
    const framesAllowed = input?.framesAllowed === true
    const conversationId = typeof input?.conversationId === 'string' && /^[\w-]{8,64}$/.test(input.conversationId) ? input.conversationId : null
    if (!tool || !request || request.length > 8000 || !snapshot || !conversationId) {
      return { success: false, code: 'failed', message: 'Invalid request.' }
    }

    try {
      snapshot.videoPath = await resolveReadableMediaPath(snapshot.videoPath)
    } catch {
      return { success: false, code: 'failed', message: 'The video file cannot be read.' }
    }
    const info = (await detect(false)).find((candidate) => candidate.id === tool)
    if (!info?.path || info.status === 'missing') return { success: false, code: 'not-found', message: `${info?.name ?? tool} is not installed.` }
    if (info.status === 'signed-out') return { success: false, code: 'auth', message: `${info.name} is not signed in.` }

    const runId = randomUUID()
    const sender = event.sender
    const send = (runEvent: AgentRunEvent) => {
      if (!sender.isDestroyed()) sender.send('agent-event', { runId, event: runEvent })
    }
    const controller = new AbortController()
    let counter = 0
    const context = { durationMs: snapshot.durationMs, zooms: snapshot.zooms, speeds: snapshot.speeds }
    const session = createAgentSession({
      snapshot,
      initialProposals: sanitizeProposalSet(input?.proposals, context, () => `proposal-carried-${++counter}`),
      framesAllowed,
      deps,
      signal: controller.signal,
      onToolCall: (name, status, detail) => send({ kind: 'tool', name, status, ...(detail ? { detail } : {}) }),
    })
    const instructionInput = { language: snapshot.language, framesAllowed }
    const prompt = sessionId
      ? `Follow-up request from the user:\n${request}\n\nYour earlier proposals are kept (see review_proposals); change or replace them as needed, then summarise.`
      : buildAgentPrompt(request, instructionInput)

    let handle
    try {
      handle = await runAgent({ tool, conversationId, toolPath: info.path, prompt, sessionId, model }, session.tools, agentInstructions(instructionInput), send)
    } catch (error) {
      controller.abort()
      return { success: false, code: 'failed', message: error instanceof Error ? error.message : String(error) }
    }
    runs.set(runId, { cancel: handle.cancel, owner: sender })
    const stopWithWindow = () => handle.cancel()
    sender.once('destroyed', stopWithWindow)
    void handle.done.then((result) => {
      controller.abort()
      runs.delete(runId)
      if (!sender.isDestroyed()) sender.removeListener('destroyed', stopWithWindow)
      send({ kind: 'done', proposals: session.getProposals(), sessionId: result.sessionId, ...(result.error ? { error: result.error } : {}) })
    })
    return { success: true, runId }
  })
}
