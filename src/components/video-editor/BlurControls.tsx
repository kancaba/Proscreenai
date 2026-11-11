import { useScopedT } from '@/contexts/I18nContext'
import { DEFAULT_BLUR_STRENGTH, type BlurRegion, type BlurStyle } from './blurRegions'
import { SliderControl } from './SliderControl'

/** Look of the selected blur area, under its timing in the inspector. */
export function BlurControls({ region, onChange }: {
  region: BlurRegion
  onChange: (patch: Partial<Pick<BlurRegion, 'style' | 'strength'>>) => void
}) {
  const t = useScopedT('editor')
  const styles: Array<{ id: BlurStyle; label: string }> = [
    { id: 'blur', label: t('blurControls.styleBlur', 'Blur') },
    { id: 'pixelate', label: t('blurControls.stylePixelate', 'Pixelate') },
  ]
  return (
    <div className="mt-3 space-y-3 border-t border-white/5 pt-3">
      <div role="radiogroup" aria-label={t('blurControls.styleLabel', 'Style')} className="grid grid-cols-2 gap-1 rounded-lg bg-black/30 p-1">
        {styles.map((style) => (
          <button key={style.id} type="button" role="radio" aria-checked={region.style === style.id} data-testid={`blur-style-${style.id}`}
            onClick={() => onChange({ style: style.id })}
            className={`rounded-md px-2 py-1.5 text-[11px] transition ${region.style === style.id ? 'bg-cyan-300/20 text-cyan-100' : 'text-slate-400 hover:text-slate-200'}`}>
            {style.label}
          </button>
        ))}
      </div>
      <SliderControl label={t('blurControls.strength', 'Strength')} value={Math.round(region.strength * 100)} defaultValue={Math.round(DEFAULT_BLUR_STRENGTH * 100)}
        min={0} max={100} step={1} onChange={(value) => onChange({ strength: value / 100 })}
        formatValue={(value) => `${value}%`} parseInput={(text) => { const value = Number(text.replace('%', '').trim()); return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null }} />
      <p className="text-[10px] leading-snug text-slate-500">
        {t('blurControls.hint', 'The area is drawn on the video itself, so it stays on what it hides when zooming, panning or cropping. Drag it on the preview to move or redraw it.')}
      </p>
    </div>
  )
}
