import { useState } from 'react'
import { BookmarkPlus, Check, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useI18n } from '@/contexts/I18nContext'
import { BUILT_IN_STYLES, parseSavedPresets, type EditorAppearance, type AppearancePreset } from './appearancePresets'

const STORAGE_KEY = 'screenmovie.stylePresets.v1'

export function StylePresets({ appearance, onApply }: {
  appearance: EditorAppearance
  onApply: (appearance: EditorAppearance) => void
}) {
  const { locale } = useI18n()
  const tr = locale === 'tr'
  const [saved, setSaved] = useState(() => parseSavedPresets(localStorage.getItem(STORAGE_KEY)))
  const [name, setName] = useState('')
  const [naming, setNaming] = useState(false)
  function persist(next: AppearancePreset[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      setSaved(next)
      return true
    } catch { toast.error(tr ? 'Stil kaydedilemedi. Depolama alanını kontrol edin.' : 'Could not save preset. Check available storage.'); return false }
  }
  function save() {
    if (!name.trim()) return
    if (persist([{ id: crypto.randomUUID(), name: name.trim().slice(0, 40), appearance: structuredClone(appearance) }, ...saved].slice(0, 6))) {
      setNaming(false); setName('')
    }
  }
  return (
    <section className="workspace-style-presets mb-5" aria-label={tr ? 'Hazır stiller' : 'Style presets'}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-medium text-slate-200">{tr ? 'Hazır stiller' : 'Style presets'}</h2>
        <button type="button" onClick={() => setNaming(!naming)} title={tr ? 'Görünümü kaydet' : 'Save current style'} aria-label={tr ? 'Görünümü kaydet' : 'Save current style'} className="rounded p-1 text-slate-400 hover:bg-white/10 hover:text-white"><BookmarkPlus size={15} /></button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {BUILT_IN_STYLES.map((preset) => (
          <button key={preset.id} type="button" data-testid={`preset-${preset.id}`} aria-pressed={appearance.wallpaper === preset.background && appearance.padding === preset.padding && appearance.borderRadius === preset.borderRadius && appearance.shadowIntensity === preset.shadowIntensity && appearance.aspectRatio === preset.aspectRatio} className="workspace-style-card group min-w-0 text-center" onClick={() => onApply({ ...appearance, wallpaper: preset.background, padding: preset.padding, borderRadius: preset.borderRadius, shadowIntensity: preset.shadowIntensity, aspectRatio: preset.aspectRatio })}>
            <span className="mb-1.5 flex h-12 items-center justify-center rounded-md border border-white/10 group-hover:border-violet-300/70" style={{ background: preset.background }}><span className="h-7 w-9 rounded bg-[#18181d] shadow-lg" /></span>
            <span className="text-[10px] text-slate-400 group-hover:text-white">{tr ? preset.tr : preset.en}</span>
          </button>
        ))}
      </div>
      {naming && <form className="mt-3 flex gap-1.5" onSubmit={(e) => { e.preventDefault(); save() }}><input autoFocus aria-label={tr ? 'Stil adı' : 'Preset name'} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={tr ? 'Stil adı…' : 'Preset name…'} className="min-w-0 flex-1 rounded-md border border-white/15 bg-black/20 px-2 py-1.5 text-xs outline-none focus:border-violet-300" /><button type="submit" disabled={!name.trim()} aria-label={tr ? 'Stili kaydet' : 'Save preset'} className="rounded-md bg-violet-400/20 px-2 text-violet-200 disabled:opacity-30"><Check size={15} /></button></form>}
      {saved.length > 0 && <div className="mt-3 space-y-1 border-t border-white/5 pt-2">{saved.map((preset) => <div key={preset.id} className="flex items-center gap-1"><button type="button" onClick={() => onApply(structuredClone(preset.appearance))} className="flex min-w-0 flex-1 items-center gap-2 rounded p-1 text-left text-[11px] text-slate-300 hover:bg-white/5"><span className="h-4 w-4 shrink-0 rounded" style={{ background: preset.appearance.wallpaper.startsWith('file:') ? '#756495' : preset.appearance.wallpaper }} /><span className="truncate">{preset.name}</span></button><button type="button" aria-label={`${tr ? 'Stili sil' : 'Delete preset'}: ${preset.name}`} onClick={() => persist(saved.filter((item) => item.id !== preset.id))} className="rounded p-1 text-slate-500 hover:text-red-300"><Trash2 size={12} /></button></div>)}</div>}
    </section>
  )
}
