import { app, ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  detectSpeech,
  frameLevelsDb,
  joinWordPieces,
  planChunks,
  snapToSpeech,
  type TimedWord,
  type TimeRange,
} from '../src/lib/captions/speechSegmentation'
import { resolveReadableMediaPath } from './ipcValidation'

const SAMPLE_RATE = 16000
/** Two hours of 16 kHz mono audio is about 230 MB in memory; longer videos are refused. */
const MAX_AUDIO_MS = 2 * 60 * 60 * 1000
export const TRANSCRIPTION_LOCALES: Record<string, string> = { tr: 'tr-TR', en: 'en-US' }

export type TranscriptionErrorCode =
  | 'unsupported-platform'
  | 'unsupported-os'
  | 'unsupported-locale'
  | 'assets-unavailable'
  | 'no-audio'
  | 'no-speech'
  | 'too-long'
  | 'cancelled'
  | 'failed'

export class TranscriptionError extends Error {
  constructor(readonly code: TranscriptionErrorCode, message: string) {
    super(message)
  }
}

export type TranscriptionProgress = {
  requestId: string
  stage: 'audio' | 'model-download' | 'transcribing'
  done?: number
  total?: number
}

export interface TranscriptionDeps {
  getFfmpegPath: () => string
  getHelperPath: () => Promise<string>
}

/** 16 kHz mono PCM of the video's audio, decoded by FFmpeg. */
function decodeAudio(ffmpegPath: string, videoPath: string, signal: AbortSignal): Promise<Int16Array> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ['-nostdin', '-v', 'error', '-i', videoPath, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 's16le', 'pipe:1'])
    const chunks: Buffer[] = []
    let size = 0
    let stderr = ''
    const abort = () => child.kill('SIGKILL')
    signal.addEventListener('abort', abort, { once: true })
    child.stdout.on('data', (data: Buffer) => {
      chunks.push(data)
      size += data.length
      if (size / 2 / SAMPLE_RATE * 1000 > MAX_AUDIO_MS) child.kill('SIGKILL')
    })
    child.stderr.on('data', (data: Buffer) => { stderr = (stderr + data.toString()).slice(-4000) })
    child.on('error', reject)
    child.on('close', (code) => {
      signal.removeEventListener('abort', abort)
      if (signal.aborted) return reject(new TranscriptionError('cancelled', 'Cancelled'))
      if (size / 2 / SAMPLE_RATE * 1000 > MAX_AUDIO_MS) return reject(new TranscriptionError('too-long', 'Automatic captions support videos up to two hours.'))
      if (code !== 0) {
        if (/matches no streams|does not contain any stream|Stream map/i.test(stderr)) {
          return reject(new TranscriptionError('no-audio', 'This video has no audio track.'))
        }
        return reject(new TranscriptionError('failed', stderr.trim() || `FFmpeg exited with ${code}`))
      }
      const buffer = Buffer.concat(chunks, size)
      resolve(new Int16Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.length / 2)))
    })
  })
}

function wavFile(samples: Int16Array) {
  const header = Buffer.alloc(44)
  const dataSize = samples.length * 2
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)
  return Buffer.concat([header, Buffer.from(samples.buffer, samples.byteOffset, dataSize)])
}

type HelperLine =
  | { type: 'assets'; status: 'installed' | 'downloading' }
  | { type: 'chunk'; index: number; pieces: TimedWord[] }
  | { type: 'done' }
  | { type: 'error'; code: TranscriptionErrorCode; message: string }

function runHelper(helperPath: string, manifestPath: string, signal: AbortSignal, onLine: (line: HelperLine) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(helperPath, [manifestPath], { stdio: ['ignore', 'pipe', 'pipe'] })
    let pending = ''
    let failure: TranscriptionError | null = null
    let finished = false
    const abort = () => child.kill('SIGKILL')
    signal.addEventListener('abort', abort, { once: true })
    child.stdout.on('data', (data: Buffer) => {
      pending += data.toString()
      let newline = pending.indexOf('\n')
      while (newline >= 0) {
        const text = pending.slice(0, newline).trim()
        pending = pending.slice(newline + 1)
        newline = pending.indexOf('\n')
        if (!text) continue
        try {
          const line = JSON.parse(text) as HelperLine
          if (line.type === 'error') failure = new TranscriptionError(line.code, line.message)
          else if (line.type === 'done') finished = true
          else onLine(line)
        } catch {
          // Not a protocol line; ignore.
        }
      }
    })
    child.stderr.resume()
    child.on('error', reject)
    child.on('close', (code) => {
      signal.removeEventListener('abort', abort)
      if (signal.aborted) return reject(new TranscriptionError('cancelled', 'Cancelled'))
      if (failure) return reject(failure)
      if (code !== 0 || !finished) return reject(new TranscriptionError('failed', `Speech helper exited with ${code}`))
      resolve()
    })
  })
}

type Progress = (update: Omit<TranscriptionProgress, 'requestId'>) => void
const noProgress: Progress = () => undefined

export interface VideoSpeech {
  durationMs: number
  /** Where someone is speaking (audio level based). */
  speech: TimeRange[]
}

export interface VideoTranscript extends VideoSpeech {
  words: TimedWord[]
}

// Recent results, so the editor and an AI agent do not decode or transcribe the same video twice.
const speechCache = new Map<string, VideoSpeech & { samples?: Int16Array }>()
const transcriptCache = new Map<string, VideoTranscript>()

function remember<T>(cache: Map<string, T>, key: string, value: T, limit = 3) {
  cache.delete(key)
  cache.set(key, value)
  while (cache.size > limit) cache.delete(cache.keys().next().value as string)
}

async function cacheKey(videoPath: string) {
  const stat = await fs.stat(videoPath)
  return `${videoPath}|${stat.size}|${stat.mtimeMs}`
}

async function loadSpeech(deps: TranscriptionDeps, videoPath: string, signal: AbortSignal, progress: Progress) {
  const key = await cacheKey(videoPath)
  const cached = speechCache.get(key)
  if (cached?.samples) return { key, ...cached, samples: cached.samples }
  progress({ stage: 'audio' })
  const samples = await decodeAudio(deps.getFfmpegPath(), videoPath, signal)
  const result = { durationMs: Math.round((samples.length / SAMPLE_RATE) * 1000), speech: detectSpeech(frameLevelsDb(samples, SAMPLE_RATE)) }
  // Only the latest video keeps its audio in memory (for a transcription that follows).
  for (const entry of speechCache.values()) delete entry.samples
  remember(speechCache, key, { ...result, samples })
  return { key, ...result, samples }
}

/** Speech and pauses of a video's audio, without recognising words. */
export async function detectVideoSpeech(deps: TranscriptionDeps, videoPath: string, signal: AbortSignal, progress: Progress = noProgress): Promise<VideoSpeech> {
  const key = await cacheKey(videoPath)
  const cached = speechCache.get(key)
  if (cached) return { durationMs: cached.durationMs, speech: cached.speech }
  const { durationMs, speech } = await loadSpeech(deps, videoPath, signal, progress)
  return { durationMs, speech }
}

/**
 * Words spoken in a video with source-time milliseconds; phrase edges are snapped onto the
 * detected speech. Results are reused for the same file.
 */
export async function transcribeVideo(
  deps: TranscriptionDeps,
  videoPath: string,
  locale: string,
  signal: AbortSignal,
  progress: Progress = noProgress,
): Promise<VideoTranscript> {
  const fileKey = await cacheKey(videoPath)
  const cached = transcriptCache.get(`${fileKey}|${locale}`)
  if (cached) return cached
  const { key, samples, durationMs, speech } = await loadSpeech(deps, videoPath, signal, progress)
  if (speech.length === 0) throw new TranscriptionError('no-speech', 'No speech was found in the audio.')
  const chunks = planChunks(speech, durationMs)
  const transcript = await transcribeChunks(deps, samples, chunks, locale, signal, progress)
  const result = { durationMs, speech, words: snapToSpeech(transcript, speech) }
  remember(transcriptCache, `${key}|${locale}`, result)
  return result
}

/** Recognises each chunk with the speech helper; chunks are at most 30 s because longer input drifts. */
async function transcribeChunks(
  deps: TranscriptionDeps,
  samples: Int16Array,
  chunks: TimeRange[],
  locale: string,
  signal: AbortSignal,
  progress: Progress,
): Promise<TimedWord[]> {
  const workDir = await fs.mkdtemp(path.join(app.getPath('temp'), 'screenmovie-captions-'))
  try {
    const manifestChunks = []
    for (const [index, chunk] of chunks.entries()) {
      const from = Math.floor((chunk.startMs / 1000) * SAMPLE_RATE)
      const to = Math.min(samples.length, Math.ceil((chunk.endMs / 1000) * SAMPLE_RATE))
      const chunkPath = path.join(workDir, `chunk-${index}.wav`)
      await fs.writeFile(chunkPath, wavFile(samples.subarray(from, to)))
      manifestChunks.push({ path: chunkPath, offsetMs: Math.round((from / SAMPLE_RATE) * 1000) })
    }
    const manifestPath = path.join(workDir, 'manifest.json')
    await fs.writeFile(manifestPath, JSON.stringify({ locale, chunks: manifestChunks }))

    const words: TimedWord[] = []
    let done = 0
    progress({ stage: 'transcribing', done, total: chunks.length })
    await runHelper(await deps.getHelperPath(), manifestPath, signal, (line) => {
      if (line.type === 'assets' && line.status === 'downloading') progress({ stage: 'model-download' })
      if (line.type === 'chunk') {
        // Join suffix runs within a chunk only; a chunk always starts a new word.
        words.push(...joinWordPieces(line.pieces))
        done += 1
        progress({ stage: 'transcribing', done, total: chunks.length })
      }
    })
    return words.sort((a, b) => a.startMs - b.startMs)
  } finally {
    await fs.rm(workDir, { recursive: true, force: true })
  }
}

export function registerTranscriptionHandlers(deps: TranscriptionDeps) {
  const running = new Map<string, { controller: AbortController; owner: number }>()

  ipcMain.handle('cancel-transcription', (event, requestId: unknown) => {
    const request = typeof requestId === 'string' ? running.get(requestId) : undefined
    if (request?.owner === event.sender.id) request.controller.abort()
  })

  ipcMain.handle('transcribe-video', async (event, input: { videoPath?: unknown; language?: unknown; requestId?: unknown }) => {
    const requestId = typeof input?.requestId === 'string' && input.requestId.length <= 100 ? input.requestId : null
    const locale = typeof input?.language === 'string' ? TRANSCRIPTION_LOCALES[input.language] : undefined
    if (!requestId || !locale) return { success: false, code: 'failed', message: 'Invalid request.' }
    if (process.platform !== 'darwin') {
      return { success: false, code: 'unsupported-platform', message: 'Automatic captions are available on macOS.' }
    }

    const controller = new AbortController()
    running.set(requestId, { controller, owner: event.sender.id })
    // Closing or reloading the editor stops the work it started.
    const abort = () => controller.abort()
    event.sender.once('destroyed', abort)
    try {
      const videoPath = await resolveReadableMediaPath(input.videoPath)
      const result = await transcribeVideo(deps, videoPath, locale, controller.signal, (update) => {
        if (!event.sender.isDestroyed()) event.sender.send('transcription-progress', { requestId, ...update })
      })
      return { success: true, words: result.words, durationMs: result.durationMs }
    } catch (error) {
      const code: TranscriptionErrorCode = error instanceof TranscriptionError ? error.code : 'failed'
      return { success: false, code, message: error instanceof Error ? error.message : String(error) }
    } finally {
      running.delete(requestId)
      if (!event.sender.isDestroyed()) event.sender.removeListener('destroyed', abort)
    }
  })
}
