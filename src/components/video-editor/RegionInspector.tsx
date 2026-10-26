import { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import type { TimeSpan } from './editingTools'

export function RegionInspector({ region, label, onChange, onDelete, crossfade, children }: {
  region: TimeSpan
  label: string
  onChange: (span: TimeSpan) => boolean
  onDelete: () => void
  /** Cuts only: dissolve across the cut instead of jumping. */
  crossfade?: { enabled: boolean; onChange: (enabled: boolean) => void }
  /** Kind-specific controls shown under the timing, e.g. an audio clip's volume and track. */
  children?: React.ReactNode
}) {
  const { locale } = useI18n()
  const tr = locale === 'tr'
  const [start, setStart] = useState((region.startMs / 1000).toFixed(2))
  const [end, setEnd] = useState((region.endMs / 1000).toFixed(2))
  const [invalid, setInvalid] = useState(false)
  useEffect(() => { setStart((region.startMs / 1000).toFixed(2)); setEnd((region.endMs / 1000).toFixed(2)); setInvalid(false) }, [region.startMs, region.endMs])
  function commit() {
    const span = { startMs: Math.round(Number(start.replace(',', '.')) * 1000), endMs: Math.round(Number(end.replace(',', '.')) * 1000) }
    setInvalid(!start.trim() || !end.trim() || !onChange(span))
  }
  return (
    <section className="mb-4 rounded-xl border border-violet-300/20 bg-violet-300/5 p-3" aria-label={tr ? 'Seçili bölge' : 'Selected region'}>
      <div className="mb-3 flex items-center justify-between"><h2 className="text-xs font-medium text-violet-200">{label}</h2><button type="button" onClick={onDelete} aria-label={tr ? 'Bölgeyi sil' : 'Delete region'} className="rounded p-1 text-slate-400 hover:text-red-300"><Trash2 size={14} /></button></div>
      <form onSubmit={(event) => { event.preventDefault(); commit() }}>
        <div className="grid grid-cols-2 gap-2">
          {[{ label: tr ? 'Başlangıç (sn)' : 'Start (sec)', value: start, set: setStart, id: 'region-start' }, { label: tr ? 'Bitiş (sn)' : 'End (sec)', value: end, set: setEnd, id: 'region-end' }].map((field) => <label key={field.id} className="text-[10px] text-slate-400">{field.label}<input data-testid={field.id} aria-invalid={invalid} inputMode="decimal" value={field.value} onChange={(event) => { field.set(event.target.value); setInvalid(false) }} className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-xs tabular-nums text-white outline-none focus:border-violet-300 aria-[invalid=true]:border-red-400" /></label>)}
        </div>
        {invalid && <p role="alert" className="mt-2 text-[10px] text-red-300">{tr ? 'Video sınırları içinde, çakışmayan en az 0,1 sn seçin.' : 'Choose at least 0.1 sec within the video, without overlaps.'}</p>}
        <div className="mt-2 flex items-center justify-between"><span className="text-[10px] text-slate-500">{((region.endMs - region.startMs) / 1000).toFixed(2)} {tr ? 'saniye' : 'seconds'}</span><button type="submit" className="rounded bg-violet-300/15 px-2 py-1 text-[10px] text-violet-200 hover:bg-violet-300/25">{tr ? 'Uygula' : 'Apply'}</button></div>
      </form>
      {children}
      {crossfade && (
        <label className="mt-3 flex cursor-pointer items-center justify-between gap-2 border-t border-white/5 pt-3">
          <span>
            <span className="block text-[11px] text-slate-200">{tr ? 'Çapraz geçiş' : 'Crossfade'}</span>
            <span className="block text-[9px] leading-snug text-slate-500">{tr ? 'Sahneler tak diye atlamak yerine 0,3 sn içinde birbirine karışır.' : 'Scenes blend over 0.3 sec instead of jumping.'}</span>
          </span>
          <input type="checkbox" data-testid="cut-crossfade-toggle" checked={crossfade.enabled} onChange={(event) => crossfade.onChange(event.target.checked)} className="h-4 w-4 accent-violet-300" />
        </label>
      )}
    </section>
  )
}
