import { ipcMain } from 'electron'
import { createKeyStore, createSpeechRequests, saveSpeechAudio } from './speechProviderKit'

const API_URL = 'https://api.fish.audio'
// s2.1-pro-free is Fish Audio's no-cost developer tier; s2.1-pro and the directable drama-3 are billed per UTF-8 byte.
export const FISH_AUDIO_MODELS = ['s2.1-pro-free', 's2.1-pro', 'drama-3'] as const
const VOICE_ID = /^[a-f0-9]{32}$/
const keys = createKeyStore('fish-audio-key.bin', 'Fish Audio', 16)
const readKey = keys.read

function statusError(status: number) {
  if (status === 401 || status === 403) return new Error('Fish Audio API key was rejected.')
  if (status === 402) return new Error('Fish Audio balance is insufficient for this model.')
  if (status === 429) return new Error('Fish Audio rate limit reached. Try again shortly.')
  if (status === 503) return new Error('Fish Audio is busy. Try again shortly.')
  return new Error(`Fish Audio request failed (${status}).`)
}

type FishVoice = { id: string; title: string; author: string; languages: string[]; likes: number; sample?: string }

export function registerFishAudioHandlers() {
  ipcMain.handle('fish-audio-key-status', () => keys.status())
  ipcMain.handle('fish-audio-save-key', (_event, rawKey: unknown) => keys.save(rawKey))
  ipcMain.handle('fish-audio-clear-key', () => keys.clear())

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

  const speech = createSpeechRequests()
  ipcMain.handle('fish-audio-cancel-speech', (event, id: string) => speech.cancel(event.sender, id))
  ipcMain.handle('fish-audio-generate-speech', async (event, input: { text: string; voiceId: string; model: string; requestId: string }) => {
    if (!input || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 4000 ||
        typeof input.voiceId !== 'string' || !VOICE_ID.test(input.voiceId) ||
        !(FISH_AUDIO_MODELS as readonly string[]).includes(input.model) ||
        typeof input.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(input.requestId)) throw new Error('Invalid speech options.')
    const key = await readKey()
    if (!key) throw new Error('Add your Fish Audio API key in AI settings.')
    return speech.run(event.sender, input.requestId, async signal => {
      const response = await fetch(`${API_URL}/v1/tts`, {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', model: input.model },
        body: JSON.stringify({ text: input.text.trim(), reference_id: input.voiceId, format: 'mp3', mp3_bitrate: 128, normalize: true, latency: 'normal' }), signal,
      })
      if (!response.ok) throw statusError(response.status)
      if ((response.headers.get('content-type') ?? '').includes('json')) throw new Error('Fish Audio did not return audio.')
      return { path: await saveSpeechAudio(response.body, 'fish-audio', signal) }
    })
  })
}
