import { aiErrorMessage } from './aiErrors';
import { useEffect, useMemo, useRef, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/contexts/I18nContext'
import type { TrimRegion } from './types'
import { buildCaptionSlots, type CaptionSlot } from './aiCaptionTiming'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSettings: () => void
  onNarrate: (text: string) => void
  durationMs: number
  trims: TrimRegion[]
  onApply: (captions: { slot: CaptionSlot; text: string }[]) => void
}

type CaptionDraft = { slots: CaptionSlot[]; texts: string[] }
const EMPTY_DRAFT: CaptionDraft = { slots: [], texts: [] }

const copy = {
  tr: { title: 'AI video yazıları', description: 'Konuya göre videonun süresine yayılan kısa yazılar oluşturun. Bunlar konuşma dökümü değildir.', key: 'Modelion API anahtarı', keyPlaceholder: 'Anahtarınızı girin', saveKey: 'Anahtarı kaydet', removeKey: 'Anahtarı sil', saved: 'Anahtar hazır', temporary: 'Bu cihazda güvenli saklama yok; anahtar yalnızca bu oturumda tutulur.', topic: 'Konu', topicPlaceholder: 'Örn. yeni ürünün özelliklerini tanıtan kısa video', tone: 'Üslup', tonePlaceholder: 'Örn. kısa ve enerjik', generate: 'Yazıları oluştur', generating: 'Oluşturuluyor…', apply: 'Zaman çizelgesine ekle', preview: 'Önizleme ve düzenleme', duration: 'Görünür süre', segments: 'yazı', noVideo: 'Önce video açın.', tooLong: 'Bu video için çok fazla yazı bölümü oluşuyor.', required: 'Önce konuyu yazın.', error: 'İşlem başarısız oldu.', applied: 'Yazılar eklendi.' },
  en: { title: 'AI video captions', description: 'Create short on-screen text across your video from a topic. These are not speech transcripts.', key: 'Modelion API key', keyPlaceholder: 'Enter your key', saveKey: 'Save key', removeKey: 'Remove key', saved: 'Key is ready', temporary: 'Secure storage is unavailable; the key is kept for this session only.', topic: 'Topic', topicPlaceholder: 'E.g. a short product feature video', tone: 'Tone', tonePlaceholder: 'E.g. concise and energetic', generate: 'Generate captions', generating: 'Generating…', apply: 'Add to timeline', preview: 'Preview and edit', duration: 'Visible duration', segments: 'captions', noVideo: 'Open a video first.', tooLong: 'This video would need too many caption segments.', required: 'Enter a topic first.', error: 'The request failed.', applied: 'Captions added.' },
  es: { title: 'Textos de vídeo con IA', description: 'Crea textos breves distribuidos por el vídeo a partir de un tema. No son transcripciones.', key: 'Clave API de Modelion', keyPlaceholder: 'Introduce tu clave', saveKey: 'Guardar clave', removeKey: 'Eliminar clave', saved: 'Clave lista', temporary: 'No hay almacenamiento seguro; la clave solo dura esta sesión.', topic: 'Tema', topicPlaceholder: 'Ej. breve vídeo de un producto', tone: 'Tono', tonePlaceholder: 'Ej. breve y enérgico', generate: 'Generar textos', generating: 'Generando…', apply: 'Añadir a la línea de tiempo', preview: 'Vista previa y edición', duration: 'Duración visible', segments: 'textos', noVideo: 'Abre un vídeo primero.', tooLong: 'Este vídeo requiere demasiados segmentos.', required: 'Escribe un tema.', error: 'La solicitud falló.', applied: 'Textos añadidos.' },
  'zh-CN': { title: 'AI 视频文字', description: '根据主题生成覆盖视频时长的简短文字。这不是语音转写。', key: 'Modelion API 密钥', keyPlaceholder: '输入密钥', saveKey: '保存密钥', removeKey: '删除密钥', saved: '密钥已就绪', temporary: '无法安全存储；密钥仅在本次会话中保留。', topic: '主题', topicPlaceholder: '例如：产品功能介绍短片', tone: '语气', tonePlaceholder: '例如：简洁有力', generate: '生成文字', generating: '生成中…', apply: '添加到时间线', preview: '预览并编辑', duration: '可见时长', segments: '条文字', noVideo: '请先打开视频。', tooLong: '此视频需要过多文字片段。', required: '请先输入主题。', error: '请求失败。', applied: '文字已添加。' },
} as const

export function AiCaptionsPanel({ open, onOpenChange, durationMs, trims, onApply, onSettings, onNarrate }: Props) {
  const { locale } = useI18n()
  const c = copy[locale]
  const slots = useMemo(() => buildCaptionSlots(durationMs, trims), [durationMs, trims])
  const visibleSeconds = slots.reduce((sum, slot) => sum + slot.endMs - slot.startMs, 0) / 1000
  const [configured, setConfigured] = useState(false)
  const [topic, setTopic] = useState('')
  const [tone, setTone] = useState('')
  // Captions stay paired with the slots they were generated for, so a timeline
  // change while the dialog is closed can never index past the current slots.
  const [draft, setDraftState] = useState<CaptionDraft>(EMPTY_DRAFT)
  const slotsRef = useRef(slots)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    slotsRef.current = slots
    setDraftState(EMPTY_DRAFT)
  }, [slots])

  useEffect(() => {
    if (!open) return
    let alive = true
    window.electronAPI.modelionKeyStatus().then((status) => {
      if (alive) { setConfigured(status.configured) }
    }).catch(() => { if (alive) setConfigured(false) })
    return () => { alive = false }
  }, [open])

  const generate = async () => {
    if (!topic.trim()) { setError(c.required); return }
    if (!slots.length) { setError(c.noVideo); return }
    if (slots.length > 100) { setError(c.tooLong); return }
    const requestedSlots = slots
    setBusy(true)
    setError('')
    setDraftState(EMPTY_DRAFT)
    try {
      const captions = await window.electronAPI.modelionGenerateCaptions({ topic: topic.trim(), tone: tone.trim(), language: locale, count: requestedSlots.length, durationSeconds: visibleSeconds })
      // Drop results for a timeline that changed while the request was running.
      if (slotsRef.current !== requestedSlots || captions.length !== requestedSlots.length) return
      setDraftState({ slots: requestedSlots, texts: captions })
    } catch (cause) { setError(aiErrorMessage(cause, locale === 'tr')) }
    finally { setBusy(false) }
  }

  const apply = () => {
    if (draft.texts.length !== draft.slots.length || draft.texts.some((text) => !text.trim())) return
    onApply(draft.texts.map((text, index) => ({ slot: draft.slots[index], text: text.trim() })))
    setDraftState(EMPTY_DRAFT)
    onOpenChange(false)
  }

  const field = 'w-full rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm text-slate-100 outline-none focus:border-blue-500'
  const button = 'rounded-lg px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40'
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto border-white/15 bg-[#151519] text-slate-100">
      <DialogHeader><DialogTitle>{c.title}</DialogTitle><DialogDescription className="text-slate-400">{c.description}</DialogDescription></DialogHeader>
      <div className="space-y-4">
        {!configured && <div className="flex items-center justify-between rounded-xl border border-violet-300/20 p-3"><span className="text-xs text-slate-400">{locale === 'tr' ? 'Önce AI bağlantınızı ekleyin.' : 'Connect Modelion to generate text.'}</span><button type="button" onClick={onSettings} className="text-xs text-violet-300">{locale === 'tr' ? 'AI ayarları' : 'AI settings'}</button></div>}
        <div className="grid gap-3 sm:grid-cols-2"><div><label htmlFor="ai-topic" className="mb-1 block text-xs font-medium">{c.topic}</label><textarea id="ai-topic" value={topic} maxLength={1000} rows={3} onChange={(event) => setTopic(event.target.value)} placeholder={c.topicPlaceholder} className={field} /></div>
          <div><label htmlFor="ai-tone" className="mb-1 block text-xs font-medium">{c.tone}</label><input id="ai-tone" value={tone} maxLength={100} onChange={(event) => setTone(event.target.value)} placeholder={c.tonePlaceholder} className={field} />
            <p className="mt-3 text-xs text-slate-400">{c.duration}: {visibleSeconds.toFixed(1)}s · {slots.length} {c.segments}</p></div></div>
        <button type="button" className={`${button} w-full bg-blue-600 text-white hover:bg-blue-500`} disabled={busy || !configured || !slots.length || slots.length > 100} onClick={generate}>{busy ? c.generating : c.generate}</button>
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        {draft.texts.length > 0 && <div className="space-y-2"><h3 className="text-sm font-medium">{c.preview}</h3><button type="button" className={`${button} bg-violet-300/15 text-violet-200`} onClick={() => onNarrate(draft.texts.join(" "))}>{locale === 'tr' ? 'Bu metni seslendir' : 'Narrate this text'}</button>{draft.texts.map((text, index) => <div key={index} className="flex items-center gap-2"><span className="w-24 shrink-0 text-xs tabular-nums text-slate-400">{(draft.slots[index].startMs / 1000).toFixed(1)}–{(draft.slots[index].endMs / 1000).toFixed(1)}s</span><input value={text} maxLength={120} onChange={(event) => setDraftState((previous) => ({ ...previous, texts: previous.texts.map((item, i) => i === index ? event.target.value : item) }))} aria-label={`${c.segments} ${index + 1}`} className={field} /></div>)}<button type="button" className={`${button} w-full bg-emerald-600 text-white hover:bg-emerald-500`} disabled={draft.texts.some((text) => !text.trim())} onClick={apply}>{c.apply}</button></div>}
      </div>
    </DialogContent>
  </Dialog>
}
