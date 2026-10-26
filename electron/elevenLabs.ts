import { ipcMain } from 'electron'
import { createKeyStore, createSpeechRequests, saveSpeechAudio } from './speechProviderKit'

// Plain REST like the other providers: the official SDK bundles a WebSocket stack
// (and ~10 MB) into the main process that this request/response use does not need.
const API_URL = 'https://api.elevenlabs.io'
// eleven_v4 is the highest-quality default; flash v2.5 is the faster, cheaper option.
// Multilingual v2 is the long-form-stable previous generation and does not accept a language code.
export const ELEVENLABS_MODELS = ['eleven_v4', 'eleven_flash_v2_5', 'eleven_multilingual_v2'] as const
const VOICE_ID = /^[a-zA-Z0-9]{10,40}$/
const keys = createKeyStore('elevenlabs-key.bin', 'ElevenLabs', 20)

async function readKeyOrThrow() {
  const key = await keys.read()
  if (!key) throw new Error('Add your ElevenLabs API key in AI settings.')
  return key
}

// Provider error bodies stay in the main process; only the detail status is inspected.
async function statusError(response: Response) {
  const body = await response.text().catch(() => '')
  if (/quota_exceeded|payment_required/.test(body)) return new Error('ElevenLabs balance is insufficient for this model.')
  if (/missing_permissions/.test(body)) return new Error('ElevenLabs API key is missing a required permission.')
  if (response.status === 401 || response.status === 403) return new Error('ElevenLabs API key was rejected.')
  if (response.status === 402) return new Error('ElevenLabs balance is insufficient for this model.')
  if (response.status === 429) return new Error('ElevenLabs rate limit reached. Try again shortly.')
  if (response.status === 404 || response.status === 422) return new Error('ElevenLabs rejected this voice or model.')
  return new Error(`ElevenLabs request failed (${response.status}).`)
}

type ElevenVoice = { id: string; title: string; author: string; languages: string[]; likes: number; sample?: string }
// ElevenLabs' own premade voices, offered when a restricted key may not list the voice library.
const PREMADE_VOICES: ElevenVoice[] = [
  { id: 'JBFqnCBsd6RMkjVDRZzb', title: 'George', author: 'ElevenLabs · male, narrative', languages: [], likes: 0 },
  { id: 'EXAVITQu4vr4xnSDxMaL', title: 'Sarah', author: 'ElevenLabs · female, soft', languages: [], likes: 0 },
  { id: 'onwK4e9ZLuTAKqWW03F9', title: 'Daniel', author: 'ElevenLabs · male, authoritative', languages: [], likes: 0 },
  { id: 'XB0fDUnXU5powFXDhCwa', title: 'Charlotte', author: 'ElevenLabs · female, conversational', languages: [], likes: 0 },
]

export function registerElevenLabsHandlers() {
  ipcMain.handle('elevenlabs-key-status', () => keys.status())
  ipcMain.handle('elevenlabs-save-key', (_event, rawKey: unknown) => keys.save(rawKey))
  ipcMain.handle('elevenlabs-clear-key', () => keys.clear())

  ipcMain.handle('elevenlabs-search-voices', async (_event, input: { query: string; mine?: boolean }) => {
    if (!input || typeof input.query !== 'string' || input.query.length > 100 || (input.mine !== undefined && typeof input.mine !== 'boolean')) throw new Error('Invalid voice search.')
    const key = await readKeyOrThrow()
    // The voice library holds ElevenLabs' default voices plus the account's own clones and saved voices.
    const url = new URL('/v2/voices', API_URL)
    url.searchParams.set('page_size', '50')
    url.searchParams.set('sort', 'name')
    url.searchParams.set('sort_direction', 'asc')
    if (input.query.trim()) url.searchParams.set('search', input.query.trim())
    if (input.mine) url.searchParams.set('voice_type', 'personal')
    const response = await fetch(url, { headers: { 'xi-api-key': key }, signal: AbortSignal.timeout(20000) })
    if (!response.ok) {
      const error = await statusError(response)
      // A key without "Voices: Read" can still speak; let it pick a premade voice instead of failing.
      if (!input.mine && /missing a required permission/.test(error.message)) {
        const query = input.query.trim().toLowerCase()
        return PREMADE_VOICES.filter(voice => !query || voice.title.toLowerCase().includes(query))
      }
      throw error
    }
    const wire = await response.json() as { voices?: { voice_id?: unknown; name?: unknown; labels?: Record<string, unknown>; preview_url?: unknown; verified_languages?: { language?: unknown }[] }[] }
    return (wire.voices ?? []).flatMap((voice): ElevenVoice[] => {
      if (typeof voice.voice_id !== 'string' || !VOICE_ID.test(voice.voice_id) || typeof voice.name !== 'string') return []
      const labels = voice.labels ?? {}
      return [{
        id: voice.voice_id, title: voice.name.slice(0, 80),
        author: [labels.gender, labels.accent].filter((label): label is string => typeof label === 'string').join(', ').slice(0, 60),
        languages: (voice.verified_languages ?? []).map(entry => entry.language).filter((language): language is string => typeof language === 'string').slice(0, 6),
        likes: 0, sample: typeof voice.preview_url === 'string' && voice.preview_url.startsWith('https://') ? voice.preview_url : undefined,
      }]
    })
  })

  const speech = createSpeechRequests()
  ipcMain.handle('elevenlabs-cancel-speech', (event, id: string) => speech.cancel(event.sender, id))
  ipcMain.handle('elevenlabs-generate-speech', async (event, input: { text: string; voiceId: string; model: string; language: string; requestId: string }) => {
    if (!input || typeof input.text !== 'string' || !input.text.trim() || input.text.length > 4000 ||
        typeof input.voiceId !== 'string' || !VOICE_ID.test(input.voiceId) ||
        !(ELEVENLABS_MODELS as readonly string[]).includes(input.model) || !['tr', 'en'].includes(input.language) ||
        typeof input.requestId !== 'string' || !/^[a-zA-Z0-9-]{1,64}$/.test(input.requestId)) throw new Error('Invalid speech options.')
    const key = await readKeyOrThrow()
    return speech.run(event.sender, input.requestId, async signal => {
      const url = new URL(`/v1/text-to-speech/${input.voiceId}`, API_URL)
      url.searchParams.set('output_format', 'mp3_44100_128')
      const response = await fetch(url, {
        method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
        body: JSON.stringify({
          text: input.text.trim(), model_id: input.model, apply_text_normalization: 'auto',
          ...(input.model === 'eleven_multilingual_v2' ? {} : { language_code: input.language }),
        }), signal,
      })
      if (!response.ok) throw await statusError(response)
      if ((response.headers.get('content-type') ?? '').includes('json')) throw new Error('ElevenLabs did not return audio.')
      return { path: await saveSpeechAudio(response.body, 'elevenlabs', signal) }
    })
  })
}
