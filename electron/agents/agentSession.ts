import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import { buildCaptionCues } from '../../src/lib/captions/captionCues'
import type { AgentProjectSnapshot } from '../../src/lib/agent/agentSnapshot'
import { type McpTool, textResult } from '../../src/lib/agent/mcpCore'
import {
  addProposals,
  clearProposals,
  type ProposalKind,
  type ProposalSet,
  summarizeProposals,
} from '../../src/lib/agent/proposals'
import { detectInteractionCandidates } from '../../src/components/video-editor/timeline/zoomSuggestionUtils'
import type { CursorTelemetryPoint } from '../../src/components/video-editor/types'
import { detectVideoSpeech, TRANSCRIPTION_LOCALES, type TranscriptionDeps, transcribeVideo } from '../transcription'

const MAX_FRAMES_PER_RUN = 40
const PAGE_LIMIT = 300
const CLICK_TYPES = new Set(['click', 'double-click', 'right-click', 'middle-click'])

export interface AgentSessionOptions {
  snapshot: AgentProjectSnapshot
  initialProposals: ProposalSet
  framesAllowed: boolean
  deps: TranscriptionDeps
  signal: AbortSignal
  /** A tool call started or ended (for the progress list in the editor). */
  onToolCall: (name: string, status: 'started' | 'completed' | 'failed', summary?: string) => void
}

const json = (value: unknown) => textResult(JSON.stringify(value))
const ms = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : undefined)

function windowOf(args: Record<string, unknown>, durationMs: number) {
  const fromMs = Math.max(0, ms(args.fromMs) ?? 0)
  const toMs = Math.min(durationMs, ms(args.toMs) ?? durationMs)
  return { fromMs, toMs }
}

async function readTelemetry(videoPath: string): Promise<CursorTelemetryPoint[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(`${videoPath}.cursor.json`, 'utf8'))
    const samples: unknown[] = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.samples) ? parsed.samples : []
    return samples
      .filter((sample): sample is CursorTelemetryPoint => {
        const point = sample as CursorTelemetryPoint
        return !!point && Number.isFinite(point.timeMs) && Number.isFinite(point.cx) && Number.isFinite(point.cy)
      })
      .sort((a, b) => a.timeMs - b.timeMs)
  } catch {
    return []
  }
}

function extractFrame(ffmpegPath: string, videoPath: string, timeMs: number, signal: AbortSignal): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ['-nostdin', '-v', 'error', '-ss', (timeMs / 1000).toFixed(3), '-i', videoPath, '-frames:v', '1', '-vf', 'scale=768:-2', '-q:v', '5', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1'])
    const chunks: Buffer[] = []
    const abort = () => child.kill('SIGKILL')
    signal.addEventListener('abort', abort, { once: true })
    child.stdout.on('data', (data: Buffer) => chunks.push(data))
    child.stderr.resume()
    child.on('error', reject)
    child.on('close', (code) => {
      signal.removeEventListener('abort', abort)
      const image = Buffer.concat(chunks)
      if (code === 0 && image.length > 0) resolve(image)
      else reject(new Error('Could not read a frame at that time.'))
    })
  })
}

/**
 * The tools one agent run can use. Read tools describe the recording; propose tools only
 * collect suggestions (checked against the project) for the user to review.
 */
export function createAgentSession(options: AgentSessionOptions) {
  const { snapshot, deps, signal } = options
  let proposals = options.initialProposals
  let counter = proposals.items.length
  let framesUsed = 0
  const nextId = () => `proposal-${++counter}`
  const context = { durationMs: snapshot.durationMs, zooms: snapshot.zooms, speeds: snapshot.speeds }
  const locale = TRANSCRIPTION_LOCALES[snapshot.language] ?? TRANSCRIPTION_LOCALES.en

  const traced = (name: string, run: (args: Record<string, unknown>) => Promise<ReturnType<typeof textResult>>) =>
    async (args: Record<string, unknown>) => {
      options.onToolCall(name, 'started')
      try {
        const result = await run(args)
        const first = result.content[0]
        options.onToolCall(name, result.isError ? 'failed' : 'completed', first?.type === 'text' ? first.text.slice(0, 160) : undefined)
        return result
      } catch (error) {
        options.onToolCall(name, 'failed', error instanceof Error ? error.message : String(error))
        throw error
      }
    }

  const propose = (kind: ProposalKind, listKey: string) => async (args: Record<string, unknown>) => {
    const result = addProposals(proposals, kind, args[listKey], context, { replaceExisting: args.replaceExisting === true }, nextId)
    proposals = result.set
    const total = proposals.items.filter((item) => item.kind === kind).length
    const lines = [`Accepted ${result.accepted} ${kind} proposal(s); ${total} ${kind} proposal(s) in total.`]
    if (result.errors.length > 0) lines.push(`Not accepted (fix and call again):\n- ${result.errors.join('\n- ')}`)
    return textResult(lines.join('\n'), result.accepted === 0 && result.errors.length > 0)
  }

  const span = { startMs: { type: 'number', description: 'Start, ms in the source video' }, endMs: { type: 'number', description: 'End, ms in the source video' }, reason: { type: 'string', description: 'Why, in a few words' } }
  const listOf = (properties: Record<string, unknown>, required: string[]) => ({ type: 'array', minItems: 1, items: { type: 'object', properties: { ...span, ...properties }, required: ['startMs', 'endMs', ...required] } })
  const range = { fromMs: { type: 'number', description: 'Optional start of the window (ms)' }, toMs: { type: 'number', description: 'Optional end of the window (ms)' } }
  const read = { readOnlyHint: true, openWorldHint: false }
  const stage = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }

  const tools: McpTool[] = [
    {
      name: 'get_project',
      description: 'The recording and its current edits: duration, cut ranges (trims), zooms, speed changes, speech captions, other on-screen texts, plus your proposals so far. Start here.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: read,
      handler: traced('get_project', async () => json({
        durationMs: snapshot.durationMs,
        aspectRatio: snapshot.aspectRatio,
        spokenLanguage: snapshot.language,
        trims: snapshot.trims,
        zooms: snapshot.zooms,
        speeds: snapshot.speeds,
        captions: snapshot.captions,
        texts: snapshot.texts,
        proposals: summarizeProposals(proposals),
        notes: 'Trims are parts removed from the final video. Zoom depth 1–6 means 1.25x, 1.5x, 1.8x, 2.2x, 3.5x, 5x. Positions are fractions of the frame (0–1) unless noted.',
      })),
    },
    {
      name: 'get_clicks',
      description: 'Mouse clicks recorded with the video (time, position as 0–1 fractions of the frame, kind) and places where the cursor rested. Empty if click tracking was off.',
      inputSchema: { type: 'object', properties: range, additionalProperties: false },
      annotations: read,
      handler: traced('get_clicks', async (args) => {
        const { fromMs, toMs } = windowOf(args, snapshot.durationMs)
        const samples = await readTelemetry(snapshot.videoPath)
        const inWindow = (time: number) => time >= fromMs && time <= toMs
        const clicks = samples
          .filter((sample) => sample.interactionType && CLICK_TYPES.has(sample.interactionType) && inWindow(sample.timeMs))
          .map((sample) => ({ timeMs: Math.round(sample.timeMs), x: Number(sample.cx.toFixed(3)), y: Number(sample.cy.toFixed(3)), kind: sample.interactionType, ...(sample.cursorType === 'text' ? { onText: true } : {}) }))
        const rests = detectInteractionCandidates(samples)
          .filter((candidate) => candidate.kind === 'dwell' && inWindow(candidate.centerTimeMs))
          .map((candidate) => ({ timeMs: Math.round(candidate.centerTimeMs), x: Number(candidate.focus.cx.toFixed(3)), y: Number(candidate.focus.cy.toFixed(3)) }))
        return json({ tracked: samples.length > 0, clicks: clicks.slice(0, PAGE_LIMIT * 2), cursorRests: rests.slice(0, PAGE_LIMIT), ...(clicks.length > PAGE_LIMIT * 2 ? { more: 'Ask for a smaller window (fromMs/toMs) to see the rest.' } : {}) })
      }),
    },
    {
      name: 'get_transcript',
      description: 'What is said in the video, as timed phrases (recognised on this Mac). The first call can take a while. Use fromMs/toMs to page through long videos.',
      inputSchema: { type: 'object', properties: range, additionalProperties: false },
      annotations: read,
      handler: traced('get_transcript', async (args) => {
        const { fromMs, toMs } = windowOf(args, snapshot.durationMs)
        let transcript
        try {
          transcript = await transcribeVideo(deps, snapshot.videoPath, locale, signal)
        } catch (error) {
          return textResult(`No transcript: ${error instanceof Error ? error.message : String(error)}`, true)
        }
        const phrases = buildCaptionCues(transcript.words, { pauseMs: 500, maxChars: 160, maxDurationMs: 12000, lingerMs: 0, locale: snapshot.language })
          .filter((phrase) => phrase.endMs >= fromMs && phrase.startMs <= toMs)
        return json({
          language: snapshot.language,
          note: 'Recognised automatically: no punctuation, some words may be wrong.',
          phrases: phrases.slice(0, PAGE_LIMIT),
          ...(phrases.length > PAGE_LIMIT ? { more: `Continue with fromMs: ${phrases[PAGE_LIMIT].startMs}` } : {}),
        })
      }),
    },
    {
      name: 'get_pauses',
      description: 'Stretches without speech (silence or background noise), from the audio level. Includes the start and end of the video when quiet.',
      inputSchema: { type: 'object', properties: { minMs: { type: 'number', description: 'Shortest pause to list (default 700)' }, ...range }, additionalProperties: false },
      annotations: read,
      handler: traced('get_pauses', async (args) => {
        const { fromMs, toMs } = windowOf(args, snapshot.durationMs)
        const minMs = Math.max(200, ms(args.minMs) ?? 700)
        const { speech } = await detectVideoSpeech(deps, snapshot.videoPath, signal)
        const pauses: Array<{ startMs: number; endMs: number }> = []
        let cursor = 0
        for (const range of [...speech, { startMs: snapshot.durationMs, endMs: snapshot.durationMs }]) {
          if (range.startMs - cursor >= minMs) pauses.push({ startMs: cursor, endMs: Math.min(range.startMs, snapshot.durationMs) })
          cursor = Math.max(cursor, range.endMs)
        }
        const listed = pauses.filter((pause) => pause.endMs >= fromMs && pause.startMs <= toMs)
        return json({ hasSpeech: speech.length > 0, pauses: listed.slice(0, PAGE_LIMIT * 2) })
      }),
    },
    ...(options.framesAllowed
      ? [{
          name: 'get_frame',
          description: `A still image of the video at a time (768 px wide JPEG). At most ${MAX_FRAMES_PER_RUN} per task, so pick moments with care.`,
          inputSchema: { type: 'object', properties: { timeMs: { type: 'number' } }, required: ['timeMs'], additionalProperties: false },
          annotations: read,
          handler: traced('get_frame', async (args: Record<string, unknown>) => {
            const time = ms(args.timeMs)
            if (time === undefined || time < 0 || time > snapshot.durationMs) return textResult(`timeMs must be between 0 and ${snapshot.durationMs}.`, true)
            if (framesUsed >= MAX_FRAMES_PER_RUN) return textResult('Frame limit reached for this task.', true)
            framesUsed += 1
            const image = await extractFrame(deps.getFfmpegPath(), snapshot.videoPath, time, signal)
            return { content: [{ type: 'image' as const, data: image.toString('base64'), mimeType: 'image/jpeg' }, { type: 'text' as const, text: `Frame at ${Math.round(time)} ms.` }] }
          }),
        } satisfies McpTool]
      : []),
    {
      name: 'propose_zooms',
      description: 'Suggest zooms (camera moves in on part of the frame). focusX/focusY: 0–1 point to zoom on. depth 1–6 (3 is a good default). Zooms must not overlap. Pass replaceExisting: true to replace the project\'s current zooms (and your earlier zoom proposals).',
      inputSchema: { type: 'object', properties: { zooms: listOf({ depth: { type: 'integer', minimum: 1, maximum: 6 }, focusX: { type: 'number', minimum: 0, maximum: 1 }, focusY: { type: 'number', minimum: 0, maximum: 1 } }, []), replaceExisting: { type: 'boolean' } }, required: ['zooms'], additionalProperties: false },
      annotations: stage,
      handler: traced('propose_zooms', propose('zoom', 'zooms')),
    },
    {
      name: 'propose_trims',
      description: 'Suggest parts to cut out of the final video.',
      inputSchema: { type: 'object', properties: { trims: listOf({}, []) }, required: ['trims'], additionalProperties: false },
      annotations: stage,
      handler: traced('propose_trims', propose('trim', 'trims')),
    },
    {
      name: 'propose_speed',
      description: 'Suggest playback speed changes (0.25, 0.5, 0.75, 1.25, 1.5, 1.75 or 2). Must not overlap each other or existing speed changes.',
      inputSchema: { type: 'object', properties: { segments: listOf({ speed: { type: 'number', enum: [0.25, 0.5, 0.75, 1.25, 1.5, 1.75, 2] } }, ['speed']) }, required: ['segments'], additionalProperties: false },
      annotations: stage,
      handler: traced('propose_speed', propose('speed', 'segments')),
    },
    {
      name: 'propose_captions',
      description: 'Suggest speech captions (subtitles), at most 200 characters each, not overlapping. Pass replaceExisting: true to replace the current speech captions (and your earlier caption proposals).',
      inputSchema: { type: 'object', properties: { captions: listOf({ text: { type: 'string' } }, ['text']), replaceExisting: { type: 'boolean' } }, required: ['captions'], additionalProperties: false },
      annotations: stage,
      handler: traced('propose_captions', propose('caption', 'captions')),
    },
    {
      name: 'propose_text',
      description: 'Suggest on-screen texts such as titles or labels. style: title, subtitle, label, callout or typing. Optional x/y: top-left corner in percent (0–90) of the frame.',
      inputSchema: { type: 'object', properties: { items: listOf({ text: { type: 'string' }, style: { type: 'string', enum: ['title', 'subtitle', 'label', 'callout', 'typing'] }, x: { type: 'number' }, y: { type: 'number' } }, ['text']) }, required: ['items'], additionalProperties: false },
      annotations: stage,
      handler: traced('propose_text', propose('text', 'items')),
    },
    {
      name: 'review_proposals',
      description: 'List your proposals so far.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: read,
      handler: traced('review_proposals', async () => textResult(summarizeProposals(proposals))),
    },
    {
      name: 'clear_proposals',
      description: 'Remove your proposals of one kind (zoom, trim, speed, caption, text), or all of them when kind is omitted.',
      inputSchema: { type: 'object', properties: { kind: { type: 'string', enum: ['zoom', 'trim', 'speed', 'caption', 'text'] } }, additionalProperties: false },
      annotations: stage,
      handler: traced('clear_proposals', async (args) => {
        proposals = clearProposals(proposals, typeof args.kind === 'string' ? (args.kind as ProposalKind) : undefined)
        return textResult(summarizeProposals(proposals))
      }),
    },
  ]

  return { tools, getProposals: () => proposals }
}
