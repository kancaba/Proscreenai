import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
const state = vi.hoisted(() => ({ dir: '', handlers: new Map<string, (...args: unknown[]) => Promise<{ path: string }>>() }))
vi.mock('electron', () => ({ app: { getPath: () => state.dir }, safeStorage: { isEncryptionAvailable: () => false }, ipcMain: { handle: (name: string, fn: (...args: unknown[]) => Promise<{ path: string }>) => state.handlers.set(name, fn) } }))
import { registerElevenLabsHandlers } from '../../electron/elevenLabs'
const event = { sender: { id: 1, once: vi.fn(), removeListener: vi.fn() } }
const call = (name: string, input?: unknown) => state.handlers.get(name)!(event, input)
const voiceId = 'JBFqnCBsd6RMkjVDRZzb'
const speech = (overrides: Record<string, unknown> = {}) => ({ text: 'Merhaba', voiceId, model: 'eleven_v4', language: 'tr', requestId: 'r-1', ...overrides })
const headerOf = (init: RequestInit | undefined, name: string) => new Headers(init?.headers).get(name)
beforeAll(async () => { state.dir = await mkdtemp(path.join(tmpdir(), 'screenmovie-eleven-')); registerElevenLabsHandlers() })
afterAll(async () => { vi.unstubAllGlobals(); await rm(state.dir, {recursive:true,force:true}) })
describe('ElevenLabs speech integration', () => {
  it('requires a stored key and validates voice, model and text before transmitting', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await expect(call('elevenlabs-generate-speech', speech())).rejects.toThrow('API key')
    await expect(call('elevenlabs-generate-speech', speech({ voiceId: 'bad id!' }))).rejects.toThrow('Invalid')
    await expect(call('elevenlabs-generate-speech', speech({ model: 'eleven_v9' }))).rejects.toThrow('Invalid')
    await expect(call('elevenlabs-save-key', 'short')).rejects.toThrow('valid ElevenLabs')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('sends the stored key, voice, model and language to text-to-speech and saves the MP3', async () => {
    // A line pasted straight from .env.local is reduced to the key itself.
    await call('elevenlabs-save-key', 'ELEVENLABS_API_KEY="sk_fake_fixture_key_01"')
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(new Uint8Array([73,68,51,9,9]), { headers: { 'content-type': 'audio/mpeg' } })); vi.stubGlobal('fetch', fetch)
    const result = await call('elevenlabs-generate-speech', speech({ text: ' Merhaba dünya ' }))
    const [url, init] = fetch.mock.calls[0]
    expect(String(url)).toContain(`/v1/text-to-speech/${voiceId}`)
    expect(String(url)).toContain('output_format=mp3_44100_128')
    expect(headerOf(init, 'xi-api-key')).toBe('sk_fake_fixture_key_01')
    expect(JSON.parse(String(init?.body))).toMatchObject({ text: 'Merhaba dünya', model_id: 'eleven_v4', language_code: 'tr' })
    expect((await readFile(result.path)).length).toBe(5)
    expect(path.basename(result.path)).toMatch(/^elevenlabs-.*\.mp3$/)
    expect(JSON.stringify(result)).not.toContain('sk_fake_fixture_key_01')
  })
  it('omits the language code for Multilingual v2', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(new Uint8Array([1,2,3]), { headers: { 'content-type': 'audio/mpeg' } })); vi.stubGlobal('fetch', fetch)
    await call('elevenlabs-generate-speech', speech({ model: 'eleven_multilingual_v2', requestId: 'r-2' }))
    expect(JSON.parse(String(fetch.mock.calls[0][1]?.body)).language_code ?? undefined).toBeUndefined()
  })
  it('maps auth, quota and rate-limit failures to safe errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ detail: { status: 'invalid_api_key', message: 'private' } }, { status: 401 })))
    await expect(call('elevenlabs-generate-speech', speech({ requestId: 'r-3' }))).rejects.toThrow('key was rejected')
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ detail: { status: 'quota_exceeded', message: 'private' } }, { status: 401 })))
    await expect(call('elevenlabs-generate-speech', speech({ requestId: 'r-4' }))).rejects.toThrow('balance is insufficient')
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ detail: { status: 'missing_permissions', message: 'private' } }, { status: 401 })))
    await expect(call('elevenlabs-search-voices', { query: '', mine: true })).rejects.toThrow('missing a required permission')
    expect((await call('elevenlabs-search-voices', { query: 'sar' })) as unknown).toEqual([expect.objectContaining({ id: 'EXAVITQu4vr4xnSDxMaL', title: 'Sarah' })])
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ detail: 'private' }, { status: 429 })))
    await expect(call('elevenlabs-generate-speech', speech({ requestId: 'r-5' }))).rejects.toThrow('rate limit')
  })
  it('lists library voices and personal voices on request', async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => Response.json({ voices: [
      { voice_id: voiceId, name: 'George', labels: { gender: 'male', accent: 'british' }, preview_url: 'https://cdn.example/george.mp3', verified_languages: [{ language: 'tr', model_id: 'eleven_v4' }] },
      { voice_id: 'x', name: 'Broken' },
    ], has_more: false, total_count: 2 })); vi.stubGlobal('fetch', fetch)
    const voices = await call('elevenlabs-search-voices', { query: 'geo', mine: true })
    const url = new URL(String(fetch.mock.calls[0][0]))
    expect(url.pathname).toBe('/v2/voices')
    expect(url.searchParams.get('search')).toBe('geo')
    expect(url.searchParams.get('voice_type')).toBe('personal')
    expect(voices).toEqual([{ id: voiceId, title: 'George', author: 'male, british', languages: ['tr'], likes: 0, sample: 'https://cdn.example/george.mp3' }])
  })
})
