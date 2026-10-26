import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
const state = vi.hoisted(() => ({ dir: '', handlers: new Map<string, (...args: unknown[]) => Promise<{ path: string }>>() }))
vi.mock('electron', () => ({ app: { getPath: () => state.dir }, safeStorage: { isEncryptionAvailable: () => false }, ipcMain: { handle: (name: string, fn: (...args: unknown[]) => Promise<{ path: string }>) => state.handlers.set(name, fn) } }))
import { registerFishAudioHandlers } from '../../electron/fishAudio'
const event = { sender: { id: 1, once: vi.fn(), removeListener: vi.fn() } }
const call = (name: string, input?: unknown) => state.handlers.get(name)!(event, input)
const voiceId = 'ca7030c407aa4f9f8389484b5314bdf1'
beforeAll(async () => { state.dir = await mkdtemp(path.join(tmpdir(), 'screenmovie-fish-')); registerFishAudioHandlers() })
afterAll(async () => { vi.unstubAllGlobals(); await rm(state.dir, {recursive:true,force:true}) })
describe('Fish Audio speech integration', () => {
  it('requires a key and validates voice, model and text before transmitting', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await expect(call('fish-audio-generate-speech',{text:'Merhaba',voiceId,model:'s2.1-pro-free',requestId:'t-1'})).rejects.toThrow('API key')
    await expect(call('fish-audio-generate-speech',{text:'Merhaba',voiceId:'not-a-voice',model:'s2.1-pro-free',requestId:'t-1'})).rejects.toThrow('Invalid')
    await expect(call('fish-audio-generate-speech',{text:'Merhaba',voiceId,model:'s1',requestId:'t-1'})).rejects.toThrow('Invalid')
    await expect(call('fish-audio-save-key','short')).rejects.toThrow('valid Fish Audio')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('sends the selected voice and model to the TTS API and stores audio without exposing the key', async () => {
    await call('fish-audio-save-key','test-fish-audio-key-only')
    const fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([73,68,51,1,2,3]),{headers:{'content-type':'audio/mpeg'}})); vi.stubGlobal('fetch',fetch)
    const result = await call('fish-audio-generate-speech',{text:' Merhaba ',voiceId,model:'s2.1-pro-free',requestId:'t-2'})
    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe('https://api.fish.audio/v1/tts')
    expect(options.headers.model).toBe('s2.1-pro-free')
    expect(options.headers.Authorization).toBe('Bearer test-fish-audio-key-only')
    expect(JSON.parse(options.body)).toEqual({text:'Merhaba',reference_id:voiceId,format:'mp3',mp3_bitrate:128,normalize:true,latency:'normal'})
    expect((await readFile(result.path)).length).toBe(6)
    expect(path.basename(result.path)).toMatch(/^fish-audio-.*\.mp3$/)
    expect(JSON.stringify(result)).not.toContain('test-fish-audio-key-only')
  })
  it('accepts the directable Drama 3 model and keeps bracket directions in the text', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'audio/mpeg'}})); vi.stubGlobal('fetch',fetch)
    await call('fish-audio-generate-speech',{text:'[heyecanla] Yeni özellik geldi!',voiceId,model:'drama-3',requestId:'t-drama'})
    const [, options] = fetch.mock.calls[0]
    expect(options.headers.model).toBe('drama-3')
    expect(JSON.parse(options.body).text).toBe('[heyecanla] Yeni özellik geldi!')
  })
  it('maps billing, auth and JSON responses to safe errors', async () => {
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{"message":"private"}',{status:402})))
    await expect(call('fish-audio-generate-speech',{text:'Merhaba',voiceId,model:'s2.1-pro',requestId:'t-3'})).rejects.toThrow('balance is insufficient')
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('private',{status:401})))
    await expect(call('fish-audio-generate-speech',{text:'Merhaba',voiceId,model:'s2.1-pro',requestId:'t-4'})).rejects.toThrow('key was rejected')
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('{"message":"private"}',{headers:{'content-type':'application/json'}})))
    await expect(call('fish-audio-generate-speech',{text:'Merhaba',voiceId,model:'s2.1-pro',requestId:'t-5'})).rejects.toThrow('did not return audio')
  })
  it('cancels a running request and releases the single-request limit', async () => {
    vi.stubGlobal('fetch',vi.fn((_url: string, options: RequestInit)=>new Promise((_resolve,reject)=>options.signal?.addEventListener('abort',()=>reject(new Error('aborted'))))))
    const pending = call('fish-audio-generate-speech',{text:'Merhaba',voiceId,model:'s2.1-pro-free',requestId:'t-cancel'})
    const assertion = expect(pending).rejects.toThrow('cancelled')
    await new Promise(resolve=>setTimeout(resolve,5))
    await call('fish-audio-cancel-speech','t-cancel'); await assertion
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('bad',{status:429})))
    await expect(call('fish-audio-generate-speech',{text:'Merhaba',voiceId,model:'s2.1-pro-free',requestId:'t-6'})).rejects.toThrow('rate limit')
  })
  it('lists the account’s own voices without a language filter', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ items: [{ _id: voiceId, title: 'Melis Ses', author: { nickname: 'kaan' }, languages: [], like_count: 0, type: 'tts', state: 'trained' }] })); vi.stubGlobal('fetch', fetch)
    const voices = await call('fish-audio-search-voices',{query:'',language:'tr',mine:true})
    const url = new URL(fetch.mock.calls[0][0])
    expect(url.searchParams.get('self')).toBe('true')
    expect(url.searchParams.has('language')).toBe(false)
    expect(voices).toEqual([{ id: voiceId, title: 'Melis Ses', author: 'kaan', languages: [], likes: 0, sample: undefined }])
    await expect(call('fish-audio-search-voices',{query:'',language:'tr',mine:'yes'})).rejects.toThrow('Invalid')
  })
  it('searches trained TTS voices in the chosen language and drops malformed entries', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ items: [
      { _id: voiceId, title: 'Anlatıcı', author: { nickname: 'kaan' }, languages: ['tr'], like_count: 4, type: 'tts', state: 'trained', samples: [{ audio: 'https://cdn.example/sample.mp3' }] },
      { _id: 'bad', title: 'Broken', type: 'tts', state: 'trained' },
      { _id: 'ab'.repeat(16), title: 'Training', type: 'tts', state: 'training' },
    ] })); vi.stubGlobal('fetch', fetch)
    const voices = await call('fish-audio-search-voices',{query:'anlatıcı',language:'tr'})
    const url = new URL(fetch.mock.calls[0][0])
    expect(url.origin + url.pathname).toBe('https://api.fish.audio/model')
    expect(url.searchParams.get('language')).toBe('tr')
    expect(url.searchParams.get('title')).toBe('anlatıcı')
    expect(voices).toEqual([{ id: voiceId, title: 'Anlatıcı', author: 'kaan', languages: ['tr'], likes: 4, sample: 'https://cdn.example/sample.mp3' }])
  })
})
