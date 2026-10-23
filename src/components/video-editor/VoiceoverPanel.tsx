import { aiErrorMessage } from './aiErrors';
import { useEffect, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useI18n } from '@/contexts/I18nContext'
import { toFileUrl } from './projectPersistence'
export function VoiceoverPanel({ open, onOpenChange, initialText, onSettings, onAdd, remainingSeconds }: {
  open: boolean; onOpenChange: (open: boolean) => void; initialText: string; onSettings: () => void
  onAdd: (path: string, durationSeconds: number) => void; remainingSeconds: number
}) {
  const { locale } = useI18n(), tr = locale === 'tr'
  const [text, setText] = useState(initialText), [language, setLanguage] = useState(locale === 'tr' ? 'tr' : 'en')
  const [configured, setConfigured] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [result, setResult] = useState<{ path: string; duration: number } | null>(null)
  const request = useRef<string | null>(null)
  useEffect(() => { if (!open) return; setText(initialText); setResult(null); setError(''); window.electronAPI.modelionKeyStatus().then(status => setConfigured(status.configured)).catch(() => setConfigured(false)); }, [open, initialText])
  useEffect(() => () => { if (request.current) void window.electronAPI.modelionCancelSpeech(request.current) }, [])
  function close(next: boolean) { if (!next && request.current) { void window.electronAPI.modelionCancelSpeech(request.current); request.current = null; setBusy(false) } onOpenChange(next) }
  async function generate() {
    const id = crypto.randomUUID(); request.current = id; setBusy(true); setResult(null); setError('')
    try {
      const response = await window.electronAPI.modelionGenerateSpeech({ text: text.trim(), language, requestId: id })
      if (request.current !== id) return
      const duration = await new Promise<number>((resolve, reject) => {
        const audio = new Audio(toFileUrl(response.path)); const timer = setTimeout(() => { audio.src = ''; reject(new Error('Audio metadata timed out.')) }, 15000)
        audio.onloadedmetadata = () => { clearTimeout(timer); const seconds = audio.duration; audio.src = ''; Number.isFinite(seconds) && seconds > 0 ? resolve(seconds) : reject(new Error('Invalid audio duration.')) }
        audio.onerror = () => { clearTimeout(timer); audio.src = ''; reject(new Error('Generated audio could not be decoded.')) }
      })
      if (request.current === id) setResult({ path: response.path, duration })
    } catch (cause) { if (request.current === id) setError(aiErrorMessage(cause, tr)) }
    finally { if (request.current === id) { request.current = null; setBusy(false) } }
  }
  return <Dialog open={open} onOpenChange={close}><DialogContent className="max-w-xl border-white/10 bg-[#15151c] text-white"><DialogHeader><DialogTitle>{tr ? 'AI seslendirme' : 'AI voiceover'}</DialogTitle><DialogDescription>Ema Lightning · {tr ? 'Metninizi yazın veya AI yazılarını kullanın. Sesi dinleyip zaman çizelgesine ekleyin.' : 'Write a script or use AI captions. Preview the voice before adding it to your timeline.'}</DialogDescription></DialogHeader>
    {!configured && <div className="flex items-center justify-between rounded-lg border border-violet-300/20 p-3 text-xs"><span>{tr ? 'Modelion bağlantısı gerekli.' : 'Connect Modelion first.'}</span><button onClick={onSettings} className="text-violet-300">{tr ? 'AI ayarları' : 'AI settings'}</button></div>}
    <label htmlFor="voiceover-text" className="text-xs text-slate-400">{tr ? 'Seslendirme metni' : 'Voiceover script'}</label><textarea id="voiceover-text" data-testid="voiceover-text" value={text} maxLength={4000} rows={7} disabled={busy} onChange={event => { setText(event.target.value); setResult(null) }} className="w-full resize-y rounded-xl border border-white/15 bg-black/20 p-3 text-sm outline-none focus:border-violet-300" />
    <div className="flex items-center justify-between text-xs text-slate-400"><select aria-label={tr ? 'Seslendirme dili' : 'Voice language'} disabled={busy} value={language} onChange={event => { setLanguage(event.target.value); setResult(null) }} className="rounded bg-[#252530] p-2"><option value="tr">Türkçe</option><option value="en">English</option></select><span>{text.length}/4000</span></div>
    <p className="text-[11px] text-slate-500">{tr ? 'Ses oluşturulduğunda bu metin Modelion’a gönderilir; kullanım hesabınıza yansıyabilir.' : 'Generating speech sends this script to Modelion and may use account credits.'}</p>
    <button data-testid="generate-speech" disabled={busy || !configured || !text.trim()} onClick={() => void generate()} className="rounded-xl bg-violet-300 px-4 py-3 text-sm font-medium text-black disabled:opacity-40">{busy ? (tr ? 'Ses oluşturuluyor…' : 'Generating speech…') : (tr ? 'Ema Lightning ile seslendir' : 'Generate with Ema Lightning')}</button>
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    {result && <div className="space-y-3 rounded-xl border border-emerald-300/20 p-3"><audio controls src={toFileUrl(result.path)} className="w-full" /><p className="text-xs text-slate-400">{result.duration.toFixed(1)} {tr ? 'saniye' : 'seconds'}</p>{result.duration > remainingSeconds && <p className="text-xs text-amber-300">{tr ? 'Ses video sonunu aşıyor. Video sonuna kadar olan bölüm kullanılacak.' : 'The audio exceeds the remaining video. Only the part before the end will be used.'}</p>}<button data-testid="add-voiceover" disabled={remainingSeconds < .1} onClick={() => { onAdd(result.path, result.duration); close(false) }} className="w-full rounded-lg bg-emerald-300/15 p-2 text-sm text-emerald-200">{tr ? 'Oynatma konumuna ekle' : 'Add at playhead'}</button></div>}
  </DialogContent></Dialog>
}
