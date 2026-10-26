import { ipcMain } from 'electron'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

// Waveform peaks for timeline audio clips. FFmpeg decodes the file to low-rate mono PCM
// and the main process reduces it to a few dozen peak values per second.
const SAMPLE_RATE = 8000
export const PEAKS_PER_SECOND = 50
const MAX_AUDIO_MS = 2 * 60 * 60 * 1000
const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.opus', '.flac', '.webm', '.mp4', '.mov', '.caf', '.aiff', '.aif'])

export type AudioWaveform = { durationMs: number; peaksPerSecond: number; peaks: number[] }

/** Normalized (0–1) absolute peak per bucket, scaled so the loudest bucket reaches 1. */
export function computePeaks(samples: Int16Array, sampleRate: number, peaksPerSecond: number): number[] {
  const bucket = Math.max(1, Math.round(sampleRate / peaksPerSecond))
  const peaks: number[] = []
  let loudest = 0
  for (let start = 0; start < samples.length; start += bucket) {
    let peak = 0
    const end = Math.min(samples.length, start + bucket)
    for (let i = start; i < end; i++) {
      const value = Math.abs(samples[i])
      if (value > peak) peak = value
    }
    peaks.push(peak)
    if (peak > loudest) loudest = peak
  }
  return loudest ? peaks.map(peak => Math.round((peak / loudest) * 1000) / 1000) : peaks
}

function decodeMono(ffmpegPath: string, audioPath: string): Promise<Int16Array> {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpegPath, ['-nostdin', '-v', 'error', '-i', audioPath, '-map', '0:a:0', '-vn', '-ac', '1', '-ar', String(SAMPLE_RATE), '-f', 's16le', 'pipe:1'])
    const chunks: Buffer[] = []
    let size = 0
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), 60000)
    child.stdout.on('data', (data: Buffer) => {
      chunks.push(data)
      size += data.length
      if (size / 2 / SAMPLE_RATE * 1000 > MAX_AUDIO_MS) child.kill('SIGKILL')
    })
    child.stderr.on('data', (data: Buffer) => { stderr = (stderr + data.toString()).slice(-2000) })
    child.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code !== 0) return reject(new Error(stderr.trim() ? 'Audio could not be decoded.' : `FFmpeg exited with ${code}`))
      const buffer = Buffer.concat(chunks, size)
      resolve(new Int16Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.length / 2)))
    })
  })
}

export function registerAudioWaveformHandlers(getFfmpegPath: () => string) {
  const cache = new Map<string, Promise<AudioWaveform>>()
  ipcMain.handle('audio-waveform', async (_event, audioPath: unknown) => {
    if (typeof audioPath !== 'string' || !path.isAbsolute(audioPath) || !AUDIO_EXTENSIONS.has(path.extname(audioPath).toLowerCase())) throw new Error('Invalid audio file.')
    const stat = await fs.stat(audioPath)
    if (!stat.isFile() || stat.size > 1024 * 1024 * 1024) throw new Error('Invalid audio file.')
    const key = `${audioPath}:${stat.size}:${stat.mtimeMs}`
    let pending = cache.get(key)
    if (!pending) {
      pending = decodeMono(getFfmpegPath(), audioPath).then(samples => ({
        durationMs: Math.round(samples.length / SAMPLE_RATE * 1000), peaksPerSecond: PEAKS_PER_SECOND, peaks: computePeaks(samples, SAMPLE_RATE, PEAKS_PER_SECOND),
      }))
      cache.set(key, pending)
      pending.catch(() => cache.delete(key))
      if (cache.size > 64) cache.delete(cache.keys().next().value as string)
    }
    return pending
  })
}
