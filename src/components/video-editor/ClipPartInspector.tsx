import { Gauge, Scissors } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import type { PlaybackSpeed } from './types'

const SPEEDS: Array<PlaybackSpeed | 1> = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]
const seconds = (ms: number, locale: string) => `${(ms / 1000).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`

/** The selected part of the video (split with C): its speed and cutting it out. */
export function ClipPartInspector({ index, part, speed, canCut, onSpeedChange, onCut }: {
  index: number
  /** Source range and where it sits on the edited timeline. */
  part: { startMs: number; endMs: number; outStart: number; outEnd: number }
  speed: number | 'mixed'
  canCut: boolean
  onSpeedChange: (speed: PlaybackSpeed | 1) => void
  onCut: () => void
}) {
  const { locale } = useI18n()
  const tr = locale === 'tr'
  const lengthMs = part.endMs - part.startMs
  const unit = tr ? 'sn' : 's'
  return (
    <section className="mb-4 rounded-xl border border-cyan-300/20 bg-cyan-300/5 p-3" aria-label={tr ? 'Video parçası' : 'Video part'} data-testid="clip-part-inspector">
      <h2 className="text-xs font-medium text-cyan-100">{tr ? `Video parçası ${index + 1}` : `Video part ${index + 1}`}</h2>
      <p className="mt-0.5 text-[10px] tabular-nums text-slate-400">{seconds(part.outStart, locale)} – {seconds(part.outEnd, locale)} {unit}</p>
      <div className="mt-3 flex items-center gap-1.5 text-[11px] text-slate-200"><Gauge size={13} className="text-amber-300" />{tr ? 'Hız' : 'Speed'}</div>
      <div role="radiogroup" aria-label={tr ? 'Parçanın hızı' : 'Part speed'} className="mt-2 grid grid-cols-4 gap-1.5">
        {SPEEDS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={speed === option}
            data-testid={`part-speed-${option}`}
            onClick={() => onSpeedChange(option)}
            className={speed === option
              ? 'rounded-lg border border-amber-400 bg-amber-500/90 py-1.5 text-[11px] font-semibold text-white'
              : 'rounded-lg border border-white/5 bg-white/5 py-1.5 text-[11px] text-slate-300 hover:border-white/15 hover:bg-white/10'}
          >
            {option.toLocaleString(locale)}×
          </button>
        ))}
      </div>
      <p className="mt-2 text-[10px] leading-snug text-slate-500">
        {speed === 'mixed'
          ? (tr ? 'Bu parçanın içinde farklı hızlar var. Bir hız seçince bütün parçaya uygulanır.' : 'This part has different speeds inside. Picking one applies it to the whole part.')
          : (tr ? `Süre: ${seconds(lengthMs, locale)} ${unit}${speed !== 1 ? ` → ${seconds(lengthMs / speed, locale)} ${unit}` : ''}` : `Length: ${seconds(lengthMs, locale)} ${unit}${speed !== 1 ? ` → ${seconds(lengthMs / speed, locale)} ${unit}` : ''}`)}
      </p>
      <button type="button" onClick={onCut} disabled={!canCut} data-testid="clip-part-cut" className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-400/20 bg-red-500/10 py-1.5 text-[11px] text-red-300 hover:bg-red-500/20 disabled:opacity-40">
        <Scissors size={12} />{tr ? 'Parçayı videodan çıkar (Delete)' : 'Cut this part out (Delete)'}
      </button>
    </section>
  )
}
