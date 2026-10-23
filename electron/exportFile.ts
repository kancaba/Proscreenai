import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

export type ExportWriteResult = {
  /** False when the MP4 was saved as rendered because the AAC/faststart pass failed. */
  converted: boolean
}

/** Keep the destination intact until a complete export is ready. */
export async function writeExportFile(
  destination: string,
  data: Uint8Array,
  format: 'mp4' | 'gif',
  ffmpegPath?: string,
): Promise<ExportWriteResult> {
  const staging = await fs.mkdtemp(path.join(path.dirname(destination), '.screenmovie-export-'))
  try {
    const input = path.join(staging, `rendered.${format}`)
    await fs.writeFile(input, data)
    let completed = input
    let converted = format !== 'mp4'
    if (format === 'mp4') {
      const output = path.join(staging, 'completed.mp4')
      try {
        if (!ffmpegPath) throw new Error('FFmpeg is not available')
        // The renderer produces H.264 + Opus. Keep the video untouched, convert
        // audio to AAC and move the index to the front for desktop/web playback.
        // No -shortest: a shorter audio track must not truncate the video.
        await run(ffmpegPath, [
          '-hide_banner', '-loglevel', 'error', '-nostdin', '-y', '-i', input,
          '-map', '0:v:0', '-map', '0:a?', '-c:v', 'copy',
          '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', output,
        ], { timeout: 30 * 60 * 1000, maxBuffer: 4 * 1024 * 1024 })
        completed = output
        converted = true
      } catch (error) {
        // The rendered file is a complete, playable MP4; saving it beats losing the render.
        console.warn('MP4 compatibility conversion failed; saving the rendered file as is:', error)
      }
    }
    await fs.rename(completed, destination)
    return { converted }
  } finally {
    await fs.rm(staging, { recursive: true, force: true }).catch(() => undefined)
  }
}
