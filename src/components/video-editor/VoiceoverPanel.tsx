import { aiErrorMessage } from './aiErrors';
import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useI18n, useScopedT } from '@/contexts/I18nContext'
import { toFileUrl } from './projectPersistence'
import type { VoiceoverTake } from './voiceoverTakes'
type Provider = 'modelion' | 'fish' | 'elevenlabs'
type CloudProvider = Exclude<Provider, 'modelion'>
type Voice = { id: string; title: string; author: string; languages: string[]; likes: number; sample?: string }
type ChosenVoice = { id: string; title: string }
const providerName: Record<Provider, string> = { modelion: 'Modelion', fish: 'Fish Audio', elevenlabs: 'ElevenLabs' }
const providerDative: Record<Provider, string> = { modelion: 'Modelion’a', fish: 'Fish Audio’ya', elevenlabs: 'ElevenLabs’e' }
// Voice providers with a voice picker and model choice. The first model of each is the default.
const cloud: Record<CloudProvider, {
  models: { id: string; key: string; en: string }[]; voiceId: RegExp; pastedId: RegExp; ownFirst: boolean
  hint?: { models: string[]; lines: { key: string; en: string }[] }
  search: (query: string, language: string, mine: boolean) => Promise<Voice[]>
  generate: (input: { text: string; voiceId: string; model: string; language: string; requestId: string }) => Promise<{ path: string }>
  cancel: (requestId: string) => Promise<void>
}> = {
  fish: {
    models: [{ id: 's2.1-pro-free', key: 'modelFishFree', en: 'S2.1 Pro Free · free testing' }, { id: 's2.1-pro', key: 'modelFishPro', en: 'S2.1 Pro · paid' }, { id: 'drama-3', key: 'modelFishDrama', en: 'Drama 3 · expressive, paid' }],
    voiceId: /^[a-f0-9]{32}$/, pastedId: /[a-f0-9]{32}/, ownFirst: true,
    hint: { models: ['drama-3'], lines: [{ key: 'hintFishIntro', en: 'Describe how a line is performed in square brackets, before the words:' }, { key: 'hintFishExample', en: '[excitedly, smiling] The new feature is here! [short pause] Try it now.' }, { key: 'hintFishMore', en: 'For specific words: <whisper>…</whisper>, <emphasis>…</emphasis>, <slow>…</slow>, <fast>…</fast>' }] },
    search: (query, language, mine) => window.electronAPI.fishAudioSearchVoices({ query, language, mine }),
    generate: ({ text, voiceId, model, requestId }) => window.electronAPI.fishAudioGenerateSpeech({ text, voiceId, model: model as 's2.1-pro-free', requestId }),
    cancel: id => window.electronAPI.fishAudioCancelSpeech(id),
  },
  elevenlabs: {
    models: [{ id: 'eleven_v4', key: 'modelElevenV4', en: 'Eleven v4 · highest quality' }, { id: 'eleven_flash_v2_5', key: 'modelElevenFlash', en: 'Flash v2.5 · fast, lower cost' }, { id: 'eleven_multilingual_v2', key: 'modelElevenMultilingual', en: 'Multilingual v2 · stable for long scripts' }],
    voiceId: /^[a-zA-Z0-9]{10,40}$/, pastedId: /^[a-zA-Z0-9]{20}$/, ownFirst: false,
    hint: { models: ['eleven_v4'], lines: [{ key: 'hintElevenIntro', en: 'Direct the delivery with audio tags in square brackets:' }, { key: 'hintElevenExample', en: '[excited] The new feature is here! [whispers] Don’t tell anyone.' }, { key: 'hintElevenMore', en: 'More examples: [laughs], [sighs], [sarcastic], [calm]' }] },
    search: (query, _language, mine) => window.electronAPI.elevenLabsSearchVoices({ query, mine }),
    generate: ({ text, voiceId, model, language, requestId }) => window.electronAPI.elevenLabsGenerateSpeech({ text, voiceId, model: model as 'eleven_v4', language, requestId }),
    cancel: id => window.electronAPI.elevenLabsCancelSpeech(id),
  },
}
const voiceKey: Record<CloudProvider, string> = { fish: 'voiceover.fishVoice', elevenlabs: 'voiceover.elevenlabsVoice' }
const modelKey: Record<CloudProvider, string> = { fish: 'voiceover.fishModel', elevenlabs: 'voiceover.elevenlabsModel' }
function stored<T>(key: string, fallback: T, valid: (value: unknown) => value is T): T {
  try { const value = JSON.parse(localStorage.getItem(key) ?? 'null'); return valid(value) ? value : fallback } catch { return fallback }
}
function store(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* preference only */ } }
const isProvider = (value: unknown): value is Provider => value === 'modelion' || value === 'fish' || value === 'elevenlabs'
const isModelOf = (provider: CloudProvider) => (value: unknown): value is string => cloud[provider].models.some(model => model.id === value)
const isVoiceOf = (provider: CloudProvider) => (value: unknown): value is ChosenVoice => typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string' && cloud[provider].voiceId.test((value as { id: string }).id) && typeof (value as { title?: unknown }).title === 'string'
const cancel = (active: { id: string; provider: Provider }) => void (active.provider === 'modelion' ? window.electronAPI.modelionCancelSpeech(active.id) : cloud[active.provider].cancel(active.id))
type AddAt = 'playhead' | 'start'
export function VoiceoverPanel({ open, onOpenChange, initialText, onSettings, onAdd, remainingSeconds, takes, onTakeCreated, onTakeRemove }: {
  open: boolean; onOpenChange: (open: boolean) => void; initialText: string; onSettings: () => void
  onAdd: (path: string, durationSeconds: number, at: AddAt) => void; remainingSeconds: number
  /** Voiceovers already generated for this project, newest first. */
  takes: VoiceoverTake[]; onTakeCreated: (take: VoiceoverTake) => void; onTakeRemove: (id: string) => void
}) {
  const { locale, t: tFull } = useI18n(), tr = locale === 'tr', t = useScopedT('editor')
  const [text, setText] = useState(initialText), [language, setLanguage] = useState(locale === 'tr' ? 'tr' : 'en')
  const [provider, setProvider] = useState<Provider>(() => stored('voiceover.provider', 'modelion', isProvider))
  const [models, setModels] = useState<Record<CloudProvider, string>>(() => ({ fish: stored(modelKey.fish, cloud.fish.models[0].id, isModelOf('fish')), elevenlabs: stored(modelKey.elevenlabs, cloud.elevenlabs.models[0].id, isModelOf('elevenlabs')) }))
  const [chosen, setChosen] = useState<Record<CloudProvider, ChosenVoice | null>>(() => ({ fish: stored(voiceKey.fish, null, isVoiceOf('fish')), elevenlabs: stored(voiceKey.elevenlabs, null, isVoiceOf('elevenlabs')) }))
  const [configured, setConfigured] = useState<Record<Provider, boolean>>({ modelion: false, fish: false, elevenlabs: false }), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [query, setQuery] = useState(''), [voices, setVoices] = useState<Voice[]>([]), [searching, setSearching] = useState(false), [listing, setListing] = useState<'mine' | 'search' | null>(null)
  const [result, setResult] = useState<{ path: string; duration: number } | null>(null)
  const request = useRef<{ id: string; provider: Provider } | null>(null)
  const active = provider === 'modelion' ? null : provider, voice = active ? chosen[active] : null
  useEffect(() => { if (!open) return; setText(initialText); setResult(null); setError('')
    const check = (status: () => Promise<{ configured: boolean }>) => status().then(value => value.configured).catch(() => false)
    Promise.all([check(window.electronAPI.modelionKeyStatus), check(window.electronAPI.fishAudioKeyStatus), check(window.electronAPI.elevenLabsKeyStatus)]).then(([modelion, fish, elevenlabs]) => setConfigured({ modelion, fish, elevenlabs })) }, [open, initialText])
  useEffect(() => () => { if (request.current) cancel(request.current) }, [])
  // Opening the picker lists the account's voices right away: Fish Audio clones, or the ElevenLabs voice library.
  useEffect(() => { if (!open || !active || !configured[active] || voice) return; let alive = true; const mine = cloud[active].ownFirst; setSearching(true); setError(''); setVoices([])
    cloud[active].search('', 'tr', mine).then(items => { if (alive) { setVoices(items); setListing(mine ? 'mine' : 'search') } }).catch(cause => { if (alive) setError(aiErrorMessage(cause, tFull, providerName[active])) }).finally(() => { if (alive) setSearching(false) })
    return () => { alive = false } }, [open, active, configured, voice, tr])
  function close(next: boolean) { if (!next && request.current) { cancel(request.current); request.current = null; setBusy(false) } onOpenChange(next) }
  function chooseProvider(next: Provider) { setProvider(next); store('voiceover.provider', next); setResult(null); setError(''); setVoices([]); setListing(null); setQuery('') }
  function chooseVoice(next: ChosenVoice | null) { if (!active) return; setChosen(current => ({ ...current, [active]: next })); store(voiceKey[active], next); setResult(null) }
  function chooseModel(next: string) { if (!active) return; setModels(current => ({ ...current, [active]: next })); store(modelKey[active], next); setResult(null) }
  async function searchVoices(mine: boolean) {
    if (!active) return
    // A pasted voice link or bare voice ID selects that voice directly.
    const id = mine ? undefined : query.trim().match(cloud[active].pastedId)?.[0]
    if (id) { chooseVoice({ id, title: id.slice(0, 8) }); setQuery(''); setVoices([]); return }
    setSearching(true); setError('')
    try { setVoices(await cloud[active].search(mine ? '' : query.trim(), language, mine)); setListing(mine ? 'mine' : 'search') } catch (cause) { setError(aiErrorMessage(cause, tFull, providerName[active])) } finally { setSearching(false) }
  }
  async function generate() {
    const current = { id: crypto.randomUUID(), provider }; request.current = current; setBusy(true); setResult(null); setError('')
    try {
      const response = active && voice
        ? await cloud[active].generate({ text: text.trim(), voiceId: voice.id, model: models[active], language, requestId: current.id })
        : await window.electronAPI.modelionGenerateSpeech({ text: text.trim(), language, requestId: current.id })
      const duration = await new Promise<number>((resolve, reject) => {
        const audio = new Audio(toFileUrl(response.path)); const timer = setTimeout(() => { audio.src = ''; reject(new Error('Audio metadata timed out.')) }, 15000)
        audio.onloadedmetadata = () => { clearTimeout(timer); const seconds = audio.duration; audio.src = ''; Number.isFinite(seconds) && seconds > 0 ? resolve(seconds) : reject(new Error('Invalid audio duration.')) }
        audio.onerror = () => { clearTimeout(timer); audio.src = ''; reject(new Error('Generated audio could not be decoded.')) }
      })
      // Kept with the project right away, even if the panel was closed meanwhile: it was paid for.
      onTakeCreated({ id: crypto.randomUUID(), path: response.path, durationMs: Math.round(duration * 1000), text: text.trim(), voice: active && voice ? `${providerName[active]} · ${voice.title}` : 'Ema Lightning', createdAt: Date.now() })
      if (request.current === current) setResult({ path: response.path, duration })
    } catch (cause) { if (request.current === current) setError(aiErrorMessage(cause, tFull, providerName[current.provider])) }
    finally { if (request.current === current) { request.current = null; setBusy(false) } }
  }
  const ready = configured[provider] && (!active || voice !== null)
  const engine = active ? providerName[active] : 'Ema Lightning'
  const hint = active && cloud[active].hint?.models.includes(models[active]) ? cloud[active].hint?.lines.map(line => t(`voiceoverPanel.${line.key}`, line.en)) : undefined
  const add = (path: string, seconds: number, at: AddAt) => { onAdd(path, seconds, at); close(false) }
  const atEnd = remainingSeconds < .1
  const earlier = takes.filter(take => take.path !== result?.path)
  return <Dialog open={open} onOpenChange={close}><DialogContent onInteractOutside={event => event.preventDefault()} className="max-h-[92vh] max-w-xl overflow-y-auto border-white/10 bg-[#15151c] text-white"><DialogHeader><DialogTitle>{t('voiceoverPanel.title', 'AI voiceover')}</DialogTitle><DialogDescription>{engine}{voice ? ` · ${voice.title}` : ''} · {t('voiceoverPanel.description', 'Write a script or use AI captions. Preview the voice before adding it to your timeline.')}</DialogDescription></DialogHeader>
    <div role="radiogroup" aria-label={t('voiceoverPanel.providerLabel', 'Voice provider')} className="grid grid-cols-3 gap-2 rounded-xl bg-black/20 p-1 text-xs">{(['modelion', 'fish', 'elevenlabs'] as const).map(option => <button key={option} role="radio" aria-checked={provider === option} data-testid={`voice-provider-${option}`} disabled={busy} onClick={() => chooseProvider(option)} className={provider === option ? 'rounded-lg bg-violet-300/20 p-2 text-violet-100' : 'rounded-lg p-2 text-slate-400'}>{option === 'modelion' ? 'Modelion · Ema Lightning' : providerName[option]}</button>)}</div>
    {!configured[provider] && <div className="flex items-center justify-between rounded-lg border border-violet-300/20 p-3 text-xs"><span>{t('voiceoverPanel.connectFirst', 'Connect {{provider}} first.', { provider: providerName[provider] })}</span><button onClick={onSettings} className="text-violet-300">{t('voiceoverPanel.aiSettings', 'AI settings')}</button></div>}
    {active && configured[active] && <div className="space-y-2 rounded-xl border border-white/10 p-3 text-xs">
      <div className="flex items-center justify-between gap-2"><span className="text-slate-400">{t('voiceoverPanel.model', 'Model')}</span><select aria-label={t('voiceoverPanel.modelLabel', '{{provider}} model', { provider: providerName[active] })} data-testid="voice-model" disabled={busy} value={models[active]} onChange={event => chooseModel(event.target.value)} className="rounded bg-[#252530] p-2">{cloud[active].models.map(model => <option key={model.id} value={model.id}>{t(`voiceoverPanel.${model.key}`, model.en)}</option>)}</select></div>
      {hint && <div data-testid="voice-direction-hint" className="space-y-1 rounded-lg bg-violet-300/10 p-2 text-[11px] text-slate-300"><p>{hint[0]}</p><code className="block text-violet-200">{hint[1]}</code><p className="text-slate-500">{hint[2]}</p></div>}
      <div className="flex items-center justify-between gap-2"><span className="text-slate-400">{t('voiceoverPanel.voice', 'Voice')}</span>{voice ? <span className="flex items-center gap-2"><span data-testid="cloud-voice" className="text-slate-200">{voice.title}</span><button disabled={busy} onClick={() => chooseVoice(null)} className="text-violet-300">{t('voiceoverPanel.change', 'Change')}</button></span> : <span className="text-amber-300">{t('voiceoverPanel.chooseVoice', 'Choose a voice')}</span>}</div>
      {!voice && <><form className="flex gap-2" onSubmit={event => { event.preventDefault(); void searchVoices(false) }}><input aria-label={t('voiceoverPanel.searchVoices', 'Search voices')} data-testid="voice-search" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} placeholder={t('voiceoverPanel.searchPlaceholder', 'Search by name or paste a voice link / ID')} className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/20 p-2" /><button type="submit" disabled={searching} className="rounded-lg bg-white/10 px-3">{searching ? '…' : (t('voiceoverPanel.search', 'Search'))}</button><button type="button" data-testid="my-voices" disabled={searching} onClick={() => void searchVoices(true)} className={listing === 'mine' ? 'rounded-lg bg-violet-300/20 px-3 text-violet-100' : 'rounded-lg bg-white/10 px-3'}>{t('voiceoverPanel.myVoices', 'My voices')}</button></form>
        {listing && voices.length > 0 && <p className="text-[11px] text-slate-500">{listing === 'mine' ? (t('voiceoverPanel.accountVoices', 'Voices in your {{provider}} account', { provider: providerName[active] })) : active === 'elevenlabs' ? (t('voiceoverPanel.elevenLabsLibrary', 'Your ElevenLabs voice library')) : (t('voiceoverPanel.communityVoices', 'Community voices in the selected language'))}</p>}
        {voices.length > 0 && <ul className="max-h-48 space-y-1 overflow-y-auto">{voices.map(item => <li key={item.id} className="flex items-center gap-2 rounded-lg p-1 hover:bg-white/5"><button onClick={() => chooseVoice({ id: item.id, title: item.title })} className="min-w-0 flex-1 text-left"><span className="block truncate text-slate-200">{item.title}</span><span className="text-[10px] text-slate-500">{[item.author, item.languages.join(', '), item.likes ? `♥ ${item.likes}` : ''].filter(Boolean).join(' · ')}</span></button>{item.sample && <audio controls preload="none" src={item.sample} className="h-7 w-32" />}</li>)}</ul>}
        {!searching && voices.length === 0 && <p className="text-[11px] text-slate-500">{listing === 'mine' ? (t('voiceoverPanel.noAccountVoices', 'No ready voices in your {{provider}} account yet. Create one or use search.', { provider: providerName[active] })) : listing === 'search' ? (t('voiceoverPanel.noMatches', 'No matching voices.')) : (t('voiceoverPanel.listingHelp', 'My voices lists voices you created. Search finds other voices.'))}</p>}</>}
      {active === 'fish' && <p className="text-[11px] text-slate-500">{t('voiceoverPanel.usageRights', 'Check a community voice’s usage rights before using it in commercial videos.')}</p>}
    </div>}
    <label htmlFor="voiceover-text" className="text-xs text-slate-400">{t('voiceoverPanel.script', 'Voiceover script')}</label><textarea id="voiceover-text" data-testid="voiceover-text" value={text} maxLength={4000} rows={7} disabled={busy} onChange={event => { setText(event.target.value); setResult(null) }} className="w-full resize-y rounded-xl border border-white/15 bg-black/20 p-3 text-sm outline-none focus:border-violet-300" />
    <div className="flex items-center justify-between text-xs text-slate-400"><select aria-label={t('voiceoverPanel.language', 'Voice language')} disabled={busy} value={language} onChange={event => { setLanguage(event.target.value); setResult(null) }} className="rounded bg-[#252530] p-2"><option value="tr">Türkçe</option><option value="en">English</option></select><span>{text.length}/4000</span></div>
    <p className="text-[11px] text-slate-500">{t('voiceoverPanel.sendNotice', 'Generating speech sends this script to {{provider}} and may use account credits.', { provider: providerName[provider], providerDative: providerDative[provider] })}</p>
    <button data-testid="generate-speech" disabled={busy || !ready || !text.trim()} onClick={() => void generate()} className="rounded-xl bg-violet-300 px-4 py-3 text-sm font-medium text-black disabled:opacity-40">{busy ? (t('voiceoverPanel.generating', 'Generating speech…')) : (t('voiceoverPanel.generateWith', 'Generate with {{engine}}', { engine }))}</button>
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    {result && <div className="space-y-3 rounded-xl border border-emerald-300/20 p-3"><audio controls src={toFileUrl(result.path)} className="w-full" /><p className="text-xs text-slate-400">{result.duration.toFixed(1)} {t('voiceoverPanel.seconds', 'seconds')}</p>{atEnd ? <p className="text-xs text-amber-300">{t('voiceoverPanel.playheadAtEnd', 'The playhead is at the end of the video. Add it at the start, or close the panel and pick a spot; the voiceover is kept in this project.')}</p> : result.duration > remainingSeconds && <p className="text-xs text-amber-300">{t('voiceoverPanel.exceedsVideo', 'The audio exceeds the remaining video. Only the part before the end will be used.')}</p>}<div className="grid grid-cols-2 gap-2"><button data-testid="add-voiceover" disabled={atEnd} onClick={() => add(result.path, result.duration, 'playhead')} className="rounded-lg bg-emerald-300/15 p-2 text-sm text-emerald-200 disabled:opacity-40">{t('voiceoverPanel.addAtPlayhead', 'Add at playhead')}</button><button data-testid="add-voiceover-start" onClick={() => add(result.path, result.duration, 'start')} className="rounded-lg bg-white/10 p-2 text-sm text-slate-200">{t('voiceoverPanel.addAtStart', 'Add at start')}</button></div><p className="text-[11px] text-slate-500">{t('voiceoverPanel.savedNote', 'This voiceover is saved with the project; you can add it again later from the list.')}</p></div>}
    {earlier.length > 0 && <div data-testid="voiceover-takes" className="space-y-2 rounded-xl border border-white/10 p-3"><p className="text-xs text-slate-400">{t('voiceoverPanel.projectTakes', 'Voiceovers made for this project · {{count}}', { count: earlier.length })}</p>
      <ul className="max-h-60 space-y-2 overflow-y-auto pr-1">{earlier.map(take => <li key={take.id} data-testid="voiceover-take" className="space-y-1 rounded-lg bg-black/20 p-2">
        <div className="flex items-start gap-2"><p title={take.text} className="line-clamp-2 min-w-0 flex-1 text-xs text-slate-200">{take.text || (t('voiceoverPanel.noScript', '(no script)'))}</p><button aria-label={t('voiceoverPanel.removeFromList', 'Remove from list')} title={t('voiceoverPanel.removeFromList', 'Remove from list')} disabled={busy} onClick={() => onTakeRemove(take.id)} className="text-slate-500 hover:text-red-300">✕</button></div>
        <p className="text-[10px] text-slate-500">{[take.voice, `${(take.durationMs / 1000).toFixed(1)} ${t('voiceoverPanel.secondsShort', 's')}`, take.createdAt ? new Date(take.createdAt).toLocaleString(tr ? 'tr-TR' : 'en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''].filter(Boolean).join(' · ')}</p>
        <div className="flex items-center gap-2"><audio controls preload="none" src={toFileUrl(take.path)} className="h-8 min-w-0 flex-1" /><button data-testid="take-add-playhead" disabled={busy || atEnd} onClick={() => add(take.path, take.durationMs / 1000, 'playhead')} className="rounded-lg bg-emerald-300/15 px-2 py-1 text-xs text-emerald-200 disabled:opacity-40">{t('voiceoverPanel.atPlayhead', 'At playhead')}</button><button data-testid="take-add-start" disabled={busy} onClick={() => add(take.path, take.durationMs / 1000, 'start')} className="rounded-lg bg-white/10 px-2 py-1 text-xs text-slate-200">{t('voiceoverPanel.atStart', 'At start')}</button></div>
      </li>)}</ul></div>}
  </DialogContent></Dialog>
}
