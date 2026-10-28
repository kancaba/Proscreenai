import { Keyboard, Scissors } from 'lucide-react'
import { useI18n } from '@/contexts/I18nContext'
import type { PlaybackSpeed } from './types'

const SPEEDS: Array<PlaybackSpeed | 1> = [1, 2, 3, 4]
const seconds = (ms: number, locale: string) => (ms / 1000).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** A stretch where the user was typing while recording: speed it up or cut it, alone or all at once. */
export function TypingInspector({ index, total, stretch, speed, onSpeedChange, onCut, onSpeedAll, onCutAll }: {
  index: number
  total: number
  /** Source range and where it sits on the edited timeline. */
  stretch: { startMs: number; endMs: number; outStart: number; outEnd: number }
  speed: number | 'mixed'
  onSpeedChange: (speed: PlaybackSpeed | 1) => void
  onCut: () => void
  onSpeedAll: (speed: PlaybackSpeed) => void
  onCutAll: () => void
}) {
  const { locale } = useI18n()
  const tr = locale === 'tr'
  const unit = tr ? 'sn' : 's'
  const lengthMs = stretch.endMs - stretch.startMs
  return (
    <section className="mb-4 rounded-xl border border-sky-300/25 bg-sky-300/5 p-3" aria-label={tr ? 'Yazma bölümü' : 'Typing'} data-testid="typing-inspector">
      <h2 className="flex items-center gap-1.5 text-xs font-medium text-sky-100"><Keyboard size={13} />{tr ? `Yazma bölümü ${index + 1} / ${total}` : `Typing ${index + 1} of ${total}`}</h2>
      <p className="mt-0.5 text-[10px] tabular-nums text-slate-400">
        {seconds(stretch.outStart, locale)} – {seconds(stretch.outEnd, locale)} {unit} · {seconds(lengthMs, locale)} {unit}
        {typeof speed === 'number' && speed !== 1 ? ` → ${seconds(lengthMs / speed, locale)} ${unit}` : ''}
      </p>
      <div role="radiogroup" aria-label={tr ? 'Yazma hızı' : 'Typing speed'} className="mt-3 grid grid-cols-4 gap-1.5">
        {SPEEDS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={speed === option}
            data-testid={`typing-speed-${option}`}
            onClick={() => onSpeedChange(option)}
            className={speed === option
              ? 'rounded-lg border border-sky-300 bg-sky-400/80 py-1.5 text-[11px] font-semibold text-white'
              : 'rounded-lg border border-white/5 bg-white/5 py-1.5 text-[11px] text-slate-300 hover:border-white/15 hover:bg-white/10'}
          >
            {option}×
          </button>
        ))}
      </div>
      {speed === 'mixed' && <p className="mt-2 text-[10px] text-slate-500">{tr ? 'Bu bölümde farklı hızlar var; bir hız seçince tümüne uygulanır.' : 'This stretch has different speeds; picking one applies it to all of it.'}</p>}
      <button type="button" onClick={onCut} data-testid="typing-cut" className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-400/20 bg-red-500/10 py-1.5 text-[11px] text-red-300 hover:bg-red-500/20">
        <Scissors size={12} />{tr ? 'Bu bölümü kes' : 'Cut this stretch'}
      </button>
      {total > 1 && (
        <div className="mt-3 border-t border-white/5 pt-3">
          <p className="text-[10px] text-slate-400">{tr ? `Tüm yazma bölümleri (${total})` : `All typing (${total})`}</p>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            <button type="button" data-testid="typing-all-2" onClick={() => onSpeedAll(2)} className="rounded-lg bg-white/5 py-1.5 text-[11px] text-slate-200 hover:bg-white/10">2×</button>
            <button type="button" data-testid="typing-all-4" onClick={() => onSpeedAll(4)} className="rounded-lg bg-white/5 py-1.5 text-[11px] text-slate-200 hover:bg-white/10">4×</button>
            <button type="button" data-testid="typing-all-cut" onClick={onCutAll} className="rounded-lg bg-red-500/10 py-1.5 text-[11px] text-red-300 hover:bg-red-500/20">{tr ? 'Hepsini kes' : 'Cut all'}</button>
          </div>
        </div>
      )}
      <p className="mt-2 text-[9px] leading-snug text-slate-500">{tr ? 'Kayıt sırasında yalnızca tuşa basılan anlar saklanır; hangi tuşa basıldığı ya da ne yazıldığı kaydedilmez.' : 'Only the moments keys were pressed are kept while recording; which keys, or what was typed, is never stored.'}</p>
    </section>
  )
}
