import { useRef } from 'react'
import { useI18n } from '@/contexts/I18nContext'
import type { AudioRegion } from './types'

/** Volume, mute and track of the selected audio clip, shown inside its clip card. */
export function AudioClipControls({ region, trackCount, isTrackFree, onVolumeChange, onTrackChange }: {
  region: AudioRegion
  /** Tracks offered in the picker (the tracks in use plus one new). */
  trackCount: number
  isTrackFree: (track: number) => boolean
  onVolumeChange: (volume: number) => void
  onTrackChange: (track: number) => void
}) {
  const { locale } = useI18n()
  const tr = locale === 'tr'
  const muted = region.volume === 0
  const previousVolume = useRef(region.volume || 1)
  const track = region.track ?? 0
  function toggleMute() {
    if (muted) onVolumeChange(previousVolume.current)
    else { previousVolume.current = region.volume; onVolumeChange(0) }
  }
  return <div className="mt-3 space-y-3 border-t border-white/5 pt-3" aria-label={tr ? 'Ses ayarları' : 'Audio settings'}>
    <div>
      <label className="flex items-center justify-between text-[10px] text-slate-400" htmlFor="track-volume">{tr ? 'Ses seviyesi' : 'Volume'}<output className="tabular-nums text-slate-200">{Math.round(region.volume * 100)}%</output></label>
      <div className="mt-1.5 flex items-center gap-2">
        <input id="track-volume" data-testid="audio-volume" type="range" min="0" max="100" step="1" value={Math.round(region.volume * 100)} onChange={event => onVolumeChange(Number(event.target.value) / 100)} className="h-1.5 min-w-0 flex-1 cursor-pointer rounded-full bg-white/15 accent-violet-300" />
        <button type="button" data-testid="audio-mute" aria-pressed={muted} onClick={toggleMute} className="rounded bg-white/10 px-2 py-1 text-[10px] text-slate-200 hover:bg-white/20">{muted ? (tr ? 'Sesi aç' : 'Unmute') : (tr ? 'Sessize al' : 'Mute')}</button>
      </div>
    </div>
    <label className="flex items-center justify-between text-[10px] text-slate-400">{tr ? 'İz' : 'Track'}
      <select data-testid="audio-track" value={track} onChange={event => onTrackChange(Number(event.target.value))} className="rounded bg-[#252530] px-2 py-1 text-[11px] text-slate-200">
        {Array.from({ length: trackCount }, (_, index) => <option key={index} value={index} disabled={index !== track && !isTrackFree(index)}>A{index + 1}{index !== track && !isTrackFree(index) ? (tr ? ' (dolu)' : ' (busy)') : ''}</option>)}
      </select>
    </label>
  </div>
}
