import { app, ipcMain, safeStorage } from 'electron'
import fs from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

const KEY_FILE = () => path.join(app.getPath('userData'), 'fish-audio-key.bin')
const API_URL = 'https://api.fish.audio'
// s2.1-pro-free is Fish Audio's no-cost developer tier; s2.1-pro and the directable drama-3 are billed per UTF-8 byte.
export const FISH_AUDIO_MODELS = ['s2.1-pro-free', 's2.1-pro', 'drama-3'] as const
const VOICE_ID = /^[a-f0-9]{32}$/
let sessionKey: string | null = null

function canStoreSecurely() {
  return safeStorage.isEncryptionAvailable() &&
    (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text')
}

async function readKey(): Promise<string | null> {
  if (sessionKey) return sessionKey
  if (!canStoreSecurely()) return null
  try {
    sessionKey = safeStorage.decryptString(await fs.readFile(KEY_FILE()))
    return sessionKey
  } catch {
    return null
  }
}

function statusError(status: number) {
  if (status === 401 || status === 403) return new Error('Fish Audio API key was rejected.')
  if (status === 402) return new Error('Fish Audio balance is insufficient for this model.')
  if (status === 429) return new Error('Fish Audio rate limit reached. Try again shortly.')
  if (status === 503) return new Error('Fish Audio is busy. Try again shortly.')
  return new Error(`Fish Audio request failed (${status}).`)
}

type FishVoice = { id: string; title: string; author: string; languages: string[]; likes: number; sample?: string }

export function registerFishAudioHandlers() {
  ipcMain.handle('fish-audio-key-status', async () => ({ configured: Boolean(await readKey()), persistent: canStoreSecurely() }))

  ipcMain.handle('fish-audio-save-key', async (_event, rawKey: unknown) => {
    if (typeof rawKey !== 'string' || rawKey.trim().length < 16 || rawKey.length > 512 || /\s/.test(rawKey.trim())) {
      throw new Error('Enter a valid Fish Audio API key.')
    }
    const key = rawKey.trim()
    if (canStoreSecurely()) {
      const tmp = `${KEY_FILE()}.${randomUUID()}.tmp`
      await fs.mkdir(path.dirname(KEY_FILE()), { recursive: true })
      try {
        await fs.writeFile(tmp, safeStorage.encryptString(key), { mode: 0o600 })
        await fs.rename(tmp, KEY_FILE())
      } finally {
        await fs.rm(tmp, { force: true })
      }
    } else {
      await fs.rm(KEY_FILE(), { force: true })
    }
    sessionKey = key
    return { configured: true, persistent: canStoreSecurely() }
  })

  ipcMain.handle('fish-audio-clear-key', async () => {
    sessionKey = null
    await fs.rm(KEY_FILE(), { force: true })
    return { configured: false, persistent: canStoreSecurely() }
  })

  ipcMain.handle('fish-audio-search-voices', async (_event, input: { query: string; language: string; mine?: boolean }) => {
    if (!input || typeof input.query !== 'string' || input.query.length > 100 || !['tr', 'en'].includes(input.language) || (input.mine !== undefined && typeof input.mine !== 'boolean')) throw new Error('Invalid voice search.')
    const key = await readKey()
    if (!key) throw new Error('Add your Fish Audio API key in AI settings.')
    const url = new URL('/model', API_URL)
    // Own voices (clones made in this Fish Audio account) are often untagged, so skip the language filter for them.
    if (input.mine) {
      url.searchParams.set('self', 'true')
      url.searchParams.set('page_size', '50')
      url.searchParams.set('sort_by', 'created_at')
    } else {
      url.searchParams.set('page_size', '12')
      url.searchParams.set('sort_by', 'score')
      url.searchParams.set('language', input.language)
    }
    if (input.query.trim()) url.searchParams.set('title', input.query.trim())
    const response = await fetch(url, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(20000) })
    if (!response.ok) throw statusError(response.status)
    const wire = await response.json() as { items?: { _id?: unknown; title?: unknown; author?: { nickname?: unknown }; languages?: unknown; like_count?: unknown; type?: unknown; state?: unknown; samples?: { audio?: unknown }[] }[] }
    return (wire.items ?? []).flatMap((item): FishVoice[] => {
      if (typeof item._id !== 'string' || !VOICE_ID.test(item._id) || typeof item.title !== 'string' || item.type !== 'tts' || item.state !== 'trained') return []
      const sample = item.samples?.find(entry => typeof entry.audio === 'string' && entry.audio.startsWith('https://'))?.audio as string | undefined
      return [{
        id: item._id, title: item.title.slice(0, 80),
        author: typeof item.author?.nickname === 'string' ? item.author.nickname.slice(0, 60) : '',
        languages: Array.isArray(item.languages) ? item.languages.filter((language): language is string => typeof language === 'string').slice(0, 6) : [],
        likes: typeof item.like_count === 'number' ? item.like_count : 0, sample,
      }]
    })
  })

  const speechRequests = new Map<string, { controller: AbortController; owner: number }>()
  ipcMain.handle('fish-audio-cancel-speech', (event, id: string) => {
    const request = speechRequests.get(id)
    if (request?.owner === event.sender.id) request.controller.abort()
  })
  ipcMain.handle('fish-audio-generate-speech', async (event, input: { text: string; voiceId: string; model: string; requestId: string }) => {
    if (!input || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 4000 ||
        typeof input.voiceId !== 'string' || !VOICE_ID.test(input.voiceId) ||
        !(FISH_AUDIO_MODELS as readonly string[]).includes(input.model) ||
        typeof input.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(input.requestId)) throw new Error('Invalid speech options.')
    const key = await readKey()
    if (!key) throw new Error('Add your Fish Audio API key in AI settings.')
    if ([...speechRequests.values()].some(request => request.owner === event.sender.id)) throw new Error('A speech request is already running.')
    const controller = new AbortController()
    speechRequests.set(input.requestId, { controller, owner: event.sender.id })
    const timer = setTimeout(() => controller.abort(), 120000)
    const onDestroyed = () => controller.abort()
    event.sender.once('destroyed', onDestroyed)
    try {
      const response = await fetch(`${API_URL}/v1/tts`, {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', model: input.model },
        body: JSON.stringify({ text: input.text.trim(), reference_id: input.voiceId, format: 'mp3', mp3_bitrate: 128, normalize: true, latency: 'normal' }), signal: controller.signal,
      })
      if (!response.ok) throw statusError(response.status)
      if ((response.headers.get('content-type') ?? '').includes('json')) throw new Error('Fish Audio did not return audio.')
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
      const file = path.join(folder, `fish-audio-${randomUUID()}.mp3`)
      await fs.writeFile(file, Buffer.concat(parts), { mode: 0o600 })
      return { path: file }
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Speech generation cancelled or timed out.')
      // Never include provider bodies or authorization headers in renderer errors.
      throw error instanceof Error ? new Error(error.message) : new Error('Speech generation failed.')
    } finally { clearTimeout(timer); event.sender.removeListener('destroyed', onDestroyed); speechRequests.delete(input.requestId) }
  })
}
