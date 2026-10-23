import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
const state = vi.hoisted(() => ({ dir: '', handlers: new Map<string, (...args: any[]) => any>() }))
vi.mock('electron', () => ({ app: { getPath: () => state.dir }, safeStorage: { isEncryptionAvailable: () => false }, ipcMain: { handle: (name: string, fn: (...args: any[]) => any) => state.handlers.set(name, fn) } }))
import { registerModelionHandlers } from '../../electron/modelion'
const event = { sender: { id: 1, once: vi.fn(), removeListener: vi.fn() } }
const call = (name: string, input?: unknown) => state.handlers.get(name)!(event, input)
beforeAll(async () => { state.dir = await mkdtemp(path.join(tmpdir(), 'screenmovie-ai-')); registerModelionHandlers() })
afterAll(async () => { vi.unstubAllGlobals(); await rm(state.dir, {recursive:true,force:true}) })
describe('Modelion speech integration', () => {
  it('requires a configured key and validates text before transmitting', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await expect(call('modelion-generate-speech',{text:'Merhaba',language:'tr',requestId:'test-1'})).rejects.toThrow('API key')
    await expect(call('modelion-generate-speech',{text:'x'.repeat(4001),language:'tr',requestId:'test-1'})).rejects.toThrow('Invalid')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('uses the verified Ema Lightning API and stores audio without exposing the key', async () => {
    await call('modelion-save-key','test-modelion-key-only')
    const fetch = vi.fn().mockResolvedValue(new Response(new Uint8Array([73,68,51,1,2,3]),{headers:{'content-type':'audio/mpeg'}})); vi.stubGlobal('fetch',fetch)
    const result = await call('modelion-generate-speech',{text:'Merhaba',language:'tr',requestId:'test-2'})
    const [url, options] = fetch.mock.calls[0]
    expect(url).toBe('https://gateway.tr-west-1.modelion.ai/v1/audio/speech')
    expect(JSON.parse(options.body)).toEqual({model:'tts/ema-lightning',input:'Merhaba',language:'tr',response_format:'mp3'})
    expect((await readFile(result.path)).length).toBe(6)
    expect(JSON.stringify(result)).not.toContain('test-modelion-key-only')
  })
  it('rejects non-audio responses and hides provider error bodies', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":"private provider body"}',{headers:{'content-type':'application/json'}})))
    await expect(call('modelion-generate-speech',{text:'Merhaba',language:'tr',requestId:'test-3'})).rejects.toThrow('did not return audio')
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('private provider body',{status:403})))
    await expect(call('modelion-generate-speech',{text:'Merhaba',language:'tr',requestId:'test-4'})).rejects.toThrow('access was rejected')
  })
  it('cancels a running request and releases the single-request limit', async () => {
    vi.stubGlobal('fetch',vi.fn((_url,options)=>new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('aborted'))))))
    const pending = call('modelion-generate-speech',{text:'Merhaba',language:'tr',requestId:'test-cancel'})
    const assertion = expect(pending).rejects.toThrow('cancelled')
    await new Promise(resolve=>setTimeout(resolve,5))
    await call('modelion-cancel-speech','test-cancel'); await assertion
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('bad',{status:429})))
    await expect(call('modelion-generate-speech',{text:'Merhaba',language:'tr',requestId:'test-5'})).rejects.toThrow('rate limit')
  })
})
