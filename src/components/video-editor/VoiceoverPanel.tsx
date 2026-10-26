import { aiErrorMessage } from './aiErrors';
import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useI18n } from '@/contexts/I18nContext'
import { toFileUrl } from './projectPersistence'
type Provider = 'modelion' | 'fish'
type FishModel = 's2.1-pro-free' | 's2.1-pro' | 'drama-3'
type FishVoice = { id: string; title: string; author: string; languages: string[]; likes: number; sample?: string }
const providerName: Record<Provider, string> = { modelion: 'Modelion', fish: 'Fish Audio' }
const providerDative: Record<Provider, string> = { modelion: 'Modelion’a', fish: 'Fish Audio’ya' }
function stored<T>(key: string, fallback: T, valid: (value: unknown) => value is T): T {
  try { const value = JSON.parse(localStorage.getItem(key) ?? 'null'); return valid(value) ? value : fallback } catch { return fallback }
}
function store(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* preference only */ } }
const isProvider = (value: unknown): value is Provider => value === 'modelion' || value === 'fish'
const isFishModel = (value: unknown): value is FishModel => value === 's2.1-pro-free' || value === 's2.1-pro' || value === 'drama-3'
const isVoice = (value: unknown): value is { id: string; title: string } => typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string' && /^[a-f0-9]{32}$/.test((value as { id: string }).id) && typeof (value as { title?: unknown }).title === 'string'
const cancel = (active: { id: string; provider: Provider }) => void (active.provider === 'fish' ? window.electronAPI.fishAudioCancelSpeech(active.id) : window.electronAPI.modelionCancelSpeech(active.id))
export function VoiceoverPanel({ open, onOpenChange, initialText, onSettings, onAdd, remainingSeconds }: {
  open: boolean; onOpenChange: (open: boolean) => void; initialText: string; onSettings: () => void
  onAdd: (path: string, durationSeconds: number) => void; remainingSeconds: number
}) {
  const { locale } = useI18n(), tr = locale === 'tr'
  const [text, setText] = useState(initialText), [language, setLanguage] = useState(locale === 'tr' ? 'tr' : 'en')
  const [provider, setProvider] = useState<Provider>(() => stored('voiceover.provider', 'modelion', isProvider))
  const [fishModel, setFishModel] = useState<FishModel>(() => stored('voiceover.fishModel', 's2.1-pro-free', isFishModel))
  const [voice, setVoice] = useState<{ id: string; title: string } | null>(() => stored('voiceover.fishVoice', null, isVoice))
  const [configured, setConfigured] = useState<Record<Provider, boolean>>({ modelion: false, fish: false }), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [query, setQuery] = useState(''), [voices, setVoices] = useState<FishVoice[]>([]), [searching, setSearching] = useState(false), [listing, setListing] = useState<'mine' | 'search' | null>(null)
  const [result, setResult] = useState<{ path: string; duration: number } | null>(null)
  const request = useRef<{ id: string; provider: Provider } | null>(null)
  useEffect(() => { if (!open) return; setText(initialText); setResult(null); setError('')
    Promise.all([window.electronAPI.modelionKeyStatus().then(status => status.configured).catch(() => false), window.electronAPI.fishAudioKeyStatus().then(status => status.configured).catch(() => false)]).then(([modelion, fish]) => setConfigured({ modelion, fish })) }, [open, initialText])
  useEffect(() => () => { if (request.current) cancel(request.current) }, [])
  // Voices created in the user's own Fish Audio account are listed first, before any community search.
  useEffect(() => { if (!open || provider !== 'fish' || !configured.fish || voice) return; let alive = true; setSearching(true); setError('')
    window.electronAPI.fishAudioSearchVoices({ query: '', language: 'tr', mine: true }).then(items => { if (alive) { setVoices(items); setListing('mine') } }).catch(cause => { if (alive) setError(aiErrorMessage(cause, tr, 'Fish Audio')) }).finally(() => { if (alive) setSearching(false) })
    return () => { alive = false } }, [open, provider, configured.fish, voice, tr])
  function close(next: boolean) { if (!next && request.current) { cancel(request.current); request.current = null; setBusy(false) } onOpenChange(next) }
  function chooseProvider(next: Provider) { setProvider(next); store('voiceover.provider', next); setResult(null); setError('') }
  function chooseVoice(next: { id: string; title: string } | null) { setVoice(next); store('voiceover.fishVoice', next); setResult(null) }
  async function searchVoices(mine: boolean) {
    // A pasted fish.audio link or bare voice ID selects that voice directly.
    const id = mine ? undefined : query.match(/[a-f0-9]{32}/)?.[0]
    if (id) { chooseVoice({ id, title: id.slice(0, 8) }); setQuery(''); setVoices([]); return }
    setSearching(true); setError('')
    try { setVoices(await window.electronAPI.fishAudioSearchVoices({ query: mine ? '' : query.trim(), language, mine })); setListing(mine ? 'mine' : 'search') } catch (cause) { setError(aiErrorMessage(cause, tr, 'Fish Audio')) } finally { setSearching(false) }
  }
  async function generate() {
    const active = { id: crypto.randomUUID(), provider }; request.current = active; setBusy(true); setResult(null); setError('')
    try {
      const response = provider === 'fish' && voice
        ? await window.electronAPI.fishAudioGenerateSpeech({ text: text.trim(), voiceId: voice.id, model: fishModel, requestId: active.id })
        : await window.electronAPI.modelionGenerateSpeech({ text: text.trim(), language, requestId: active.id })
      if (request.current !== active) return
      const duration = await new Promise<number>((resolve, reject) => {
        const audio = new Audio(toFileUrl(response.path)); const timer = setTimeout(() => { audio.src = ''; reject(new Error('Audio metadata timed out.')) }, 15000)
        audio.onloadedmetadata = () => { clearTimeout(timer); const seconds = audio.duration; audio.src = ''; Number.isFinite(seconds) && seconds > 0 ? resolve(seconds) : reject(new Error('Invalid audio duration.')) }
        audio.onerror = () => { clearTimeout(timer); audio.src = ''; reject(new Error('Generated audio could not be decoded.')) }
      })
      if (request.current === active) setResult({ path: response.path, duration })
    } catch (cause) { if (request.current === active) setError(aiErrorMessage(cause, tr, providerName[active.provider])) }
    finally { if (request.current === active) { request.current = null; setBusy(false) } }
  }
  const fish = provider === 'fish', ready = configured[provider] && (!fish || voice !== null)
  const voiceLabel = fish ? `Fish Audio${voice ? ` · ${voice.title}` : ''}` : 'Ema Lightning'
  return <Dialog open={open} onOpenChange={close}><DialogContent className="max-w-xl border-white/10 bg-[#15151c] text-white"><DialogHeader><DialogTitle>{tr ? 'AI seslendirme' : 'AI voiceover'}</DialogTitle><DialogDescription>{voiceLabel} · {tr ? 'Metninizi yazın veya AI yazılarını kullanın. Sesi dinleyip zaman çizelgesine ekleyin.' : 'Write a script or use AI captions. Preview the voice before adding it to your timeline.'}</DialogDescription></DialogHeader>
    <div role="radiogroup" aria-label={tr ? 'Seslendirme sağlayıcısı' : 'Voice provider'} className="grid grid-cols-2 gap-2 rounded-xl bg-black/20 p-1 text-xs">{(['modelion', 'fish'] as const).map(option => <button key={option} role="radio" aria-checked={provider === option} data-testid={`voice-provider-${option}`} disabled={busy} onClick={() => chooseProvider(option)} className={provider === option ? 'rounded-lg bg-violet-300/20 p-2 text-violet-100' : 'rounded-lg p-2 text-slate-400'}>{option === 'fish' ? 'Fish Audio' : 'Modelion · Ema Lightning'}</button>)}</div>
    {!configured[provider] && <div className="flex items-center justify-between rounded-lg border border-violet-300/20 p-3 text-xs"><span>{tr ? `${providerName[provider]} bağlantısı gerekli.` : `Connect ${providerName[provider]} first.`}</span><button onClick={onSettings} className="text-violet-300">{tr ? 'AI ayarları' : 'AI settings'}</button></div>}
    {fish && configured.fish && <div className="space-y-2 rounded-xl border border-white/10 p-3 text-xs">
      <div className="flex items-center justify-between gap-2"><span className="text-slate-400">{tr ? 'Model' : 'Model'}</span><select aria-label={tr ? 'Fish Audio modeli' : 'Fish Audio model'} disabled={busy} value={fishModel} onChange={event => { const next = event.target.value as FishModel; setFishModel(next); store('voiceover.fishModel', next); setResult(null) }} className="rounded bg-[#252530] p-2"><option value="s2.1-pro-free">{tr ? 'S2.1 Pro Free · ücretsiz test' : 'S2.1 Pro Free · free testing'}</option><option value="s2.1-pro">{tr ? 'S2.1 Pro · ücretli' : 'S2.1 Pro · paid'}</option><option value="drama-3">{tr ? 'Drama 3 · ifadeli, ücretli' : 'Drama 3 · expressive, paid'}</option></select></div>
      {fishModel === 'drama-3' && <div data-testid="drama-hint" className="space-y-1 rounded-lg bg-violet-300/10 p-2 text-[11px] text-slate-300"><p>{tr ? 'Satırın nasıl okunacağını köşeli parantezle, sözcüklerden önce yazın:' : 'Describe how a line is performed in square brackets, before the words:'}</p><code className="block text-violet-200">{tr ? '[heyecanla, gülümseyerek] Yeni özellik geldi! [kısa duraklama] Hemen deneyin.' : '[excitedly, smiling] The new feature is here! [short pause] Try it now.'}</code><p className="text-slate-500">{tr ? 'Belirli sözcükler için: <whisper>…</whisper>, <emphasis>…</emphasis>, <slow>…</slow>, <fast>…</fast>' : 'For specific words: <whisper>…</whisper>, <emphasis>…</emphasis>, <slow>…</slow>, <fast>…</fast>'}</p></div>}
      <div className="flex items-center justify-between gap-2"><span className="text-slate-400">{tr ? 'Ses' : 'Voice'}</span>{voice ? <span className="flex items-center gap-2"><span data-testid="fish-voice" className="text-slate-200">{voice.title}</span><button disabled={busy} onClick={() => chooseVoice(null)} className="text-violet-300">{tr ? 'Değiştir' : 'Change'}</button></span> : <span className="text-amber-300">{tr ? 'Bir ses seçin' : 'Choose a voice'}</span>}</div>
      {!voice && <><form className="flex gap-2" onSubmit={event => { event.preventDefault(); void searchVoices(false) }}><input aria-label={tr ? 'Ses ara' : 'Search voices'} data-testid="fish-voice-search" value={query} maxLength={100} onChange={event => setQuery(event.target.value)} placeholder={tr ? 'Ses adı ara veya fish.audio linki / ID yapıştır' : 'Search by name or paste a fish.audio link / ID'} className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/20 p-2" /><button type="submit" disabled={searching} className="rounded-lg bg-white/10 px-3">{searching ? '…' : (tr ? 'Ara' : 'Search')}</button><button type="button" data-testid="fish-my-voices" disabled={searching} onClick={() => void searchVoices(true)} className={listing === 'mine' ? 'rounded-lg bg-violet-300/20 px-3 text-violet-100' : 'rounded-lg bg-white/10 px-3'}>{tr ? 'Seslerim' : 'My voices'}</button></form>
        {listing && voices.length > 0 && <p className="text-[11px] text-slate-500">{listing === 'mine' ? (tr ? 'Fish Audio hesabınızdaki sesler' : 'Voices in your Fish Audio account') : (tr ? 'Seçili dildeki topluluk sesleri' : 'Community voices in the selected language')}</p>}
        {voices.length > 0 && <ul className="max-h-48 space-y-1 overflow-y-auto">{voices.map(item => <li key={item.id} className="flex items-center gap-2 rounded-lg p-1 hover:bg-white/5"><button onClick={() => chooseVoice({ id: item.id, title: item.title })} className="min-w-0 flex-1 text-left"><span className="block truncate text-slate-200">{item.title}</span><span className="text-[10px] text-slate-500">{[item.author, item.languages.join(', '), item.likes ? `♥ ${item.likes}` : ''].filter(Boolean).join(' · ')}</span></button>{item.sample && <audio controls preload="none" src={item.sample} className="h-7 w-32" />}</li>)}</ul>}
        {!searching && voices.length === 0 && <p className="text-[11px] text-slate-500">{listing === 'mine' ? (tr ? 'Fish Audio hesabınızda henüz hazır bir ses yok. fish.audio’da ses oluşturun veya topluluk seslerinde arayın.' : 'No ready voices in your Fish Audio account yet. Create one on fish.audio or search community voices.') : listing === 'search' ? (tr ? 'Bu dilde eşleşen ses bulunamadı.' : 'No matching voices in this language.') : (tr ? 'Seslerim, Fish Audio hesabınızda oluşturduğunuz sesleri listeler. Arama, seçili dildeki topluluk seslerini bulur.' : 'My voices lists voices you created in Fish Audio. Search finds community voices in the selected language.')}</p>}</>}
      <p className="text-[11px] text-slate-500">{tr ? 'Topluluk seslerini ticari videolarda kullanmadan önce sesin kullanım iznini kontrol edin.' : 'Check a community voice’s usage rights before using it in commercial videos.'}</p>
    </div>}
    <label htmlFor="voiceover-text" className="text-xs text-slate-400">{tr ? 'Seslendirme metni' : 'Voiceover script'}</label><textarea id="voiceover-text" data-testid="voiceover-text" value={text} maxLength={4000} rows={7} disabled={busy} onChange={event => { setText(event.target.value); setResult(null) }} className="w-full resize-y rounded-xl border border-white/15 bg-black/20 p-3 text-sm outline-none focus:border-violet-300" />
    <div className="flex items-center justify-between text-xs text-slate-400"><select aria-label={tr ? 'Seslendirme dili' : 'Voice language'} disabled={busy} value={language} onChange={event => { setLanguage(event.target.value); setResult(null); setVoices([]) }} className="rounded bg-[#252530] p-2"><option value="tr">Türkçe</option><option value="en">English</option></select><span>{text.length}/4000</span></div>
    <p className="text-[11px] text-slate-500">{tr ? `Ses oluşturulduğunda bu metin ${providerDative[provider]} gönderilir; kullanım hesabınıza yansıyabilir.` : `Generating speech sends this script to ${providerName[provider]} and may use account credits.`}</p>
    <button data-testid="generate-speech" disabled={busy || !ready || !text.trim()} onClick={() => void generate()} className="rounded-xl bg-violet-300 px-4 py-3 text-sm font-medium text-black disabled:opacity-40">{busy ? (tr ? 'Ses oluşturuluyor…' : 'Generating speech…') : (tr ? `${fish ? 'Fish Audio' : 'Ema Lightning'} ile seslendir` : `Generate with ${fish ? 'Fish Audio' : 'Ema Lightning'}`)}</button>
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    {result && <div className="space-y-3 rounded-xl border border-emerald-300/20 p-3"><audio controls src={toFileUrl(result.path)} className="w-full" /><p className="text-xs text-slate-400">{result.duration.toFixed(1)} {tr ? 'saniye' : 'seconds'}</p>{result.duration > remainingSeconds && <p className="text-xs text-amber-300">{tr ? 'Ses video sonunu aşıyor. Video sonuna kadar olan bölüm kullanılacak.' : 'The audio exceeds the remaining video. Only the part before the end will be used.'}</p>}<button data-testid="add-voiceover" disabled={remainingSeconds < .1} onClick={() => { onAdd(result.path, result.duration); close(false) }} className="w-full rounded-lg bg-emerald-300/15 p-2 text-sm text-emerald-200">{tr ? 'Oynatma konumuna ekle' : 'Add at playhead'}</button></div>}
  </DialogContent></Dialog>
}
