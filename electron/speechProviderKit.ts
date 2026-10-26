import { app, safeStorage } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

// Shared pieces for cloud voiceover providers: an encrypted per-provider API key
// and writing the returned audio stream into the app's voiceovers folder.

export function canStoreSecurely() {
  return safeStorage.isEncryptionAvailable() &&
    (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text')
}

export function createKeyStore(fileName: string, providerName: string, minLength: number) {
  const file = () => path.join(app.getPath('userData'), fileName)
  let sessionKey: string | null = null
  async function read(): Promise<string | null> {
    if (sessionKey) return sessionKey
    if (!canStoreSecurely()) return null
    try {
      sessionKey = safeStorage.decryptString(await fs.readFile(file()))
      return sessionKey
    } catch {
      return null
    }
  }
  async function status() { return { configured: Boolean(await read()), persistent: canStoreSecurely() } }
  async function save(rawKey: unknown) {
    // Keys copied from an env file often arrive as NAME=value or quoted; keep only the value.
    const key = typeof rawKey === 'string' ? rawKey.trim().replace(/^(?:export\s+)?[A-Z][A-Z0-9_]*=/, '').replace(/^(['"])(.*)\1$/, '$2').trim() : ''
    if (typeof rawKey !== 'string' || rawKey.length > 512 || key.length < minLength || /\s/.test(key)) {
      throw new Error(`Enter a valid ${providerName} API key.`)
    }
    if (canStoreSecurely()) {
      const tmp = `${file()}.${randomUUID()}.tmp`
      await fs.mkdir(path.dirname(file()), { recursive: true })
      try {
        await fs.writeFile(tmp, safeStorage.encryptString(key), { mode: 0o600 })
        await fs.rename(tmp, file())
      } finally {
        await fs.rm(tmp, { force: true })
      }
    } else {
      await fs.rm(file(), { force: true })
    }
    sessionKey = key
    return { configured: true, persistent: canStoreSecurely() }
  }
  async function clear() {
    sessionKey = null
    await fs.rm(file(), { force: true })
    return { configured: false, persistent: canStoreSecurely() }
  }
  return { read, status, save, clear }
}

type Sender = { id: number; once: (event: 'destroyed', listener: () => void) => unknown; removeListener: (event: 'destroyed', listener: () => void) => unknown }

/** One running speech request per window, cancellable by its id, aborted after two minutes or when the window closes. */
export function createSpeechRequests() {
  const running = new Map<string, { controller: AbortController; owner: number }>()
  function cancel(sender: Sender, id: string) {
    const request = running.get(id)
    if (request?.owner === sender.id) request.controller.abort()
  }
  async function run<T>(sender: Sender, id: string, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    if ([...running.values()].some(request => request.owner === sender.id)) throw new Error('A speech request is already running.')
    const controller = new AbortController()
    running.set(id, { controller, owner: sender.id })
    const timer = setTimeout(() => controller.abort(), 120000)
    const onDestroyed = () => controller.abort()
    sender.once('destroyed', onDestroyed)
    try {
      return await work(controller.signal)
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Speech generation cancelled or timed out.')
      // Never include provider bodies or authorization headers in renderer errors.
      throw error instanceof Error ? new Error(error.message) : new Error('Speech generation failed.')
    } finally { clearTimeout(timer); sender.removeListener('destroyed', onDestroyed); running.delete(id) }
  }
  return { cancel, run }
}

export async function saveSpeechAudio(stream: ReadableStream<Uint8Array> | null | undefined, filePrefix: string, signal: AbortSignal) {
  const reader = stream?.getReader()
  if (!reader) throw new Error('Speech response was empty.')
  const parts: Uint8Array[] = []; let length = 0
  while (true) {
    const { value, done } = await reader.read(); if (done) break
    length += value.byteLength
    if (length > 40 * 1024 * 1024) { await reader.cancel(); throw new Error('Generated audio is too large.') }
    parts.push(value)
  }
  if (!length || signal.aborted) throw new Error('Speech generation was cancelled.')
  const folder = path.join(app.getPath('userData'), 'voiceovers')
  await fs.mkdir(folder, { recursive: true })
  const file = path.join(folder, `${filePrefix}-${randomUUID()}.mp3`)
  await fs.writeFile(file, Buffer.concat(parts), { mode: 0o600 })
  return file
}
