import { dialog, ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import {
  canJoinWithoutEncoding,
  concatListFile,
  copyJoinArgs,
  encodeJoinArgs,
  ffmpegProgressMs,
  joinedBaseName,
  joinTelemetry,
  parseFfmpegProbe,
  type ProbedVideo,
} from '../src/lib/videoConcat'
import { resolveReadableMediaPath } from './ipcValidation'

// Adding a video to the end of the edit: the current video and the added one are joined into a
// new file in the recordings folder (with their cursor and key data), which the editor then opens
// in place of the current video. The originals stay untouched.

export type AppendVideoResult =
  | { success: true; path: string; offsetMs: number; addedDurationMs: number; totalMs: number; addedName: string; reencoded: boolean }
  | { success: false; canceled?: boolean; error?: string }

type Deps = {
  getFfmpegPath: () => string
  getRecordingsDir: () => Promise<string>
  /** The joined file becomes the video being edited. */
  onJoined: (videoPath: string) => void
}

function probe(ffmpegPath: string, filePath: string): Promise<ProbedVideo> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ['-hide_banner', '-nostdin', '-i', filePath])
    let output = ''
    child.stderr.on('data', (chunk) => { output += String(chunk) })
    child.on('error', reject)
    // Without an output file ffmpeg exits with an error after describing the input.
    child.on('close', () => {
      const probed = parseFfmpegProbe(output)
      if (!probed.video || probed.durationMs <= 0) reject(new Error(`Not a playable video: ${path.basename(filePath)}`))
      else resolve(probed)
    })
  })
}

function runFfmpeg(ffmpegPath: string, args: string[], totalMs: number, onProgress: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ['-hide_banner', ...args])
    let tail = ''
    child.stderr.on('data', (chunk) => {
      const text = String(chunk)
      tail = (tail + text).slice(-4000)
      const doneMs = ffmpegProgressMs(text)
      if (doneMs !== null && totalMs > 0) onProgress(Math.min(1, doneMs / totalMs))
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(tail.trim().split('\n').slice(-3).join('\n') || `ffmpeg exited with code ${code}`))
    })
  })
}

async function readTelemetry(videoPath: string) {
  try {
    return JSON.parse(await fs.readFile(`${videoPath}.cursor.json`, 'utf8'))
  } catch {
    return null
  }
}

const stamp = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

/**
 * A new file for the joined or rebuilt video. Two joins within one second (adding a video and then
 * moving it) would get the same name, and the second would overwrite the file it reads from.
 */
async function newVideoPath(dir: string, currentPath: string, now: Date) {
  const base = path.join(dir, `${joinedBaseName(path.basename(currentPath))}-montaj-${stamp(now)}`)
  for (let attempt = 1; ; attempt += 1) {
    const candidate = attempt === 1 ? `${base}.mp4` : `${base}-${attempt}.mp4`
    if (path.resolve(candidate) === path.resolve(currentPath)) continue
    try {
      await fs.access(candidate)
    } catch {
      return candidate
    }
  }
}

export function registerVideoAppendHandlers(deps: Deps) {
  let busy = false

  ipcMain.handle('append-video', async (event, currentVideo: unknown, addedVideo?: unknown): Promise<AppendVideoResult> => {
    if (busy) return { success: false, error: 'A video is already being added' }
    busy = true
    let outputPath: string | null = null
    let listPath: string | null = null
    try {
      const currentPath = await resolveReadableMediaPath(currentVideo)
      let addedPath: string
      if (addedVideo === undefined) {
        const picked = await dialog.showOpenDialog({
          title: 'Add a video to the end',
          defaultPath: await deps.getRecordingsDir(),
          filters: [{ name: 'Video Files', extensions: ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi'] }],
          properties: ['openFile'],
        })
        if (picked.canceled || picked.filePaths.length === 0) return { success: false, canceled: true }
        addedPath = await resolveReadableMediaPath(picked.filePaths[0])
      } else {
        addedPath = await resolveReadableMediaPath(addedVideo)
      }

      const ffmpegPath = deps.getFfmpegPath()
      const files = [
        { path: currentPath, probe: await probe(ffmpegPath, currentPath) },
        { path: addedPath, probe: await probe(ffmpegPath, addedPath) },
      ]
      const totalMs = files.reduce((sum, file) => sum + file.probe.durationMs, 0)
      const recordingsDir = await deps.getRecordingsDir()
      const now = new Date()
      outputPath = await newVideoPath(recordingsDir, currentPath, now)
      const target = outputPath
      const progress = (fraction: number) => {
        if (!event.sender.isDestroyed()) event.sender.send('video-append-progress', { fraction })
      }

      const reencoded = !canJoinWithoutEncoding(files)
      if (!reencoded) {
        listPath = path.join(recordingsDir, `.montaj-${stamp(now)}.txt`)
        await fs.writeFile(listPath, concatListFile(files.map((file) => file.path)))
        await runFfmpeg(ffmpegPath, copyJoinArgs(listPath, target, files[0].probe.video?.codec ?? 'h264'), totalMs, progress)
      } else if (process.platform === 'darwin') {
        try {
          await runFfmpeg(ffmpegPath, encodeJoinArgs(files, target, 'h264_videotoolbox'), totalMs, progress)
        } catch (error) {
          console.warn('[video-append] Hardware encoding failed, using the software encoder:', error)
          await runFfmpeg(ffmpegPath, encodeJoinArgs(files, target, 'libx264'), totalMs, progress)
        }
      } else {
        await runFfmpeg(ffmpegPath, encodeJoinArgs(files, target, 'libx264'), totalMs, progress)
      }

      const joined = await probe(ffmpegPath, target)
      const offsetMs = files[0].probe.durationMs
      const telemetry = joinTelemetry([
        { data: await readTelemetry(currentPath), offsetMs: 0, durationMs: offsetMs },
        { data: await readTelemetry(addedPath), offsetMs, durationMs: files[1].probe.durationMs },
      ])
      if (telemetry.samples.length > 0 || telemetry.keys.length > 0) {
        await fs.writeFile(`${target}.cursor.json`, JSON.stringify(telemetry))
      }

      deps.onJoined(target)
      outputPath = null
      return {
        success: true,
        path: target,
        offsetMs,
        addedDurationMs: files[1].probe.durationMs,
        totalMs: joined.durationMs,
        addedName: path.basename(addedPath),
        reencoded,
      }
    } catch (error) {
      console.error('[video-append] Failed to add the video:', error)
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    } finally {
      busy = false
      if (listPath) await fs.rm(listPath, { force: true }).catch(() => undefined)
      // A join that failed half-way leaves no file behind.
      if (outputPath) await fs.rm(outputPath, { force: true }).catch(() => undefined)
    }
  })
}
