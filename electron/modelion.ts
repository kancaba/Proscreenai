import { app, ipcMain, safeStorage } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const KEY_FILE = () => path.join(app.getPath('userData'), 'modelion-key.bin')
const GATEWAY_URL = 'https://gateway.tr-west-1.modelion.ai/v1/chat/completions'
let sessionKey: string | null = null

function canStoreSecurely() {
  return safeStorage.isEncryptionAvailable() &&
    (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text')
}

async function readKey(): Promise<string | null> {
  if (sessionKey) return sessionKey
  if (!canStoreSecurely()) return null
  try {
    const encrypted = await fs.readFile(KEY_FILE())
    sessionKey = safeStorage.decryptString(encrypted)
    return sessionKey
  } catch {
    return null
  }
}

type GenerationInput = { topic: string; tone: string; language: string; count: number; durationSeconds: number }

export function registerModelionHandlers() {
  ipcMain.handle('modelion-key-status', async () => ({ configured: Boolean(await readKey()), persistent: canStoreSecurely() }))

  ipcMain.handle('modelion-save-key', async (_event, rawKey: unknown) => {
    if (typeof rawKey !== 'string' || rawKey.trim().length < 12 || rawKey.length > 512) {
      throw new Error('Enter a valid Modelion API key.')
    }
    const key = rawKey.trim()
    if (canStoreSecurely()) {
      const encrypted = safeStorage.encryptString(key)
      await fs.mkdir(path.dirname(KEY_FILE()), { recursive: true })
      await fs.writeFile(KEY_FILE(), encrypted, { mode: 0o600 })
    } else {
      await fs.rm(KEY_FILE(), { force: true })
    }
    sessionKey = key
    return { configured: true, persistent: canStoreSecurely() }
  })

  ipcMain.handle('modelion-clear-key', async () => {
    sessionKey = null
    await fs.rm(KEY_FILE(), { force: true })
    return { configured: false, persistent: canStoreSecurely() }
  })

  const speechRequests = new Map<string, { controller: AbortController; owner: number }>()
  ipcMain.handle('modelion-cancel-speech', (event, id: string) => {
    const request = speechRequests.get(id)
    if (request?.owner === event.sender.id) request.controller.abort()
  })
  ipcMain.handle('modelion-generate-speech', async (event, input: { text: string; language: string; requestId: string }) => {
    if (!input || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 4000 ||
        !['tr','en'].includes(input.language) || typeof input.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(input.requestId)) throw new Error('Invalid speech options.')
    const key = await readKey()
    if (!key) throw new Error('Add your Modelion API key in AI settings.')
    if ([...speechRequests.values()].some(request => request.owner === event.sender.id)) throw new Error('A speech request is already running.')
    const controller = new AbortController()
    speechRequests.set(input.requestId, { controller, owner: event.sender.id })
    const timer = setTimeout(() => controller.abort(), 120000)
    const onDestroyed = () => controller.abort()
    event.sender.once('destroyed', onDestroyed)
    try {
      const response = await fetch('https://gateway.tr-west-1.modelion.ai/v1/audio/speech', {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'tts/ema-lightning', input: input.text.trim(), language: input.language, response_format: 'mp3' }), signal: controller.signal,
      })
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Modelion API key or speech model access was rejected.' : response.status === 429 ? 'Modelion rate limit reached. Try again shortly.' : `Speech generation failed (${response.status}).`)
      const type = response.headers.get('content-type') ?? ''
      if (!type.startsWith('audio/') && !type.startsWith('application/octet-stream')) throw new Error('Modelion did not return audio.')
      const reader = response.body?.getReader()
      if (!reader) throw new Error('Speech response was empty.')
      const parts: Uint8Array[] = []; let length = 0
      while (true) {
        const { value, done } = await reader.read(); if (done) break
        length += value.byteLength
        if (length > 40 * 1024 * 1024) { await reader.cancel(); throw new Error('Generated audio is too large.') }
        parts.push(value)
      }
      if (!length || controller.signal.aborted) throw new Error('Speech generation was cancelled.')
      const folder = path.join(app.getPath('userData'), 'voiceovers')
      await fs.mkdir(folder, { recursive: true })
      const file = path.join(folder, `ema-lightning-${randomUUID()}.mp3`)
      await fs.writeFile(file, Buffer.concat(parts), { mode: 0o600 })
      return { path: file }
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Speech generation cancelled or timed out.')
      // Never include provider bodies or authorization headers in renderer errors.
      throw error instanceof Error ? new Error(error.message) : new Error('Speech generation failed.')
    } finally { clearTimeout(timer); event.sender.removeListener('destroyed', onDestroyed); speechRequests.delete(input.requestId) }
  })

  ipcMain.handle('modelion-generate-captions', async (_event, input: GenerationInput) => {
    const key = await readKey()
    if (!key) throw new Error('Add your Modelion API key first.')
    if (!input || typeof input.topic !== 'string' || !input.topic.trim() || input.topic.length > 1000 ||
        typeof input.tone !== 'string' || input.tone.length > 100 ||
        typeof input.language !== 'string' || input.language.length > 40 ||
        !Number.isInteger(input.count) || input.count < 1 || input.count > 100 ||
        !Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0 || input.durationSeconds > 3600) {
      throw new Error('Invalid generation options.')
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 45000)
    try {
      const response = await fetch(GATEWAY_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'modelion/auto',
          stream: false,
          temperature: 0.7,
          messages: [
            { role: 'system', content: `You write short on-screen narrative captions for videos. Return ONLY a JSON object with a "captions" array of exactly ${input.count} strings. Each string must be a complete, distinct thought, at most 85 characters, with no numbering or timestamps. Write in ${input.language}. No markdown.` },
            { role: 'user', content: `Topic: ${input.topic.trim()}\nTone: ${input.tone}\nVideo duration: ${input.durationSeconds.toFixed(1)} seconds. The captions will be timed evenly across visible video sections. Do not claim to transcribe speech.` },
          ],
        }),
        signal: controller.signal,
      })
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) throw new Error('Modelion rejected this API key or model access.')
        if (response.status === 429) throw new Error('Modelion rate limit reached. Try again shortly.')
        throw new Error(`Modelion request failed (${response.status}).`)
      }
      const wire = await response.json() as { choices?: { message?: { content?: unknown } }[] }
      const content = wire.choices?.[0]?.message?.content
      if (typeof content !== 'string') throw new Error('Modelion returned no text.')
      const match = content.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('Modelion returned an invalid caption list.')
      const parsed = JSON.parse(match[0]) as { captions?: unknown }
      if (!Array.isArray(parsed.captions) || parsed.captions.length !== input.count ||
          !parsed.captions.every((item): item is string => typeof item === 'string' && item.trim().length > 0 && item.length <= 120)) {
        throw new Error('Modelion returned an invalid caption list. Generate again.')
      }
      return parsed.captions.map((item) => item.trim())
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Modelion took too long to respond.')
      throw error
    } finally {
      clearTimeout(timeout)
    }
  })
}
