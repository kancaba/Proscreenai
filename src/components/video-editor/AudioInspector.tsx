import { useRef } from 'react'
import { useI18n } from '@/contexts/I18nContext'
import type { AudioRegion } from './types'

export function AudioInspector({ region, onVolumeChange }: { region: AudioRegion; onVolumeChange: (volume: number) => void }) {
  const { locale } = useI18n()
  const tr = locale === 'tr'
  const muted = region.volume === 0
  const previousVolume = useRef(region.volume || 1)
  function toggleMute() {
    if (muted) onVolumeChange(previousVolume.current)
    else { previousVolume.current = region.volume; onVolumeChange(0) }
  }
  return <section className="mb-4 rounded-xl border border-white/10 p-3" aria-label={tr ? 'Ses ayarları' : 'Audio settings'}>
    <h2 className="mb-2 text-xs text-violet-200">{tr ? 'Ses kanalı' : 'Audio track'}</h2>
    <p className="mb-3 truncate text-xs text-slate-400" title={region.audioPath}>{region.audioPath.split(/[\\/]/).pop()}</p>
    <label className="flex items-center justify-between text-xs text-slate-300" htmlFor="track-volume">{tr ? 'Ses seviyesi' : 'Volume'}<output>{Math.round(region.volume * 100)}%</output></label>
    <input id="track-volume" data-testid="audio-volume" type="range" min="0" max="100" step="1" value={Math.round(region.volume * 100)} onChange={event => onVolumeChange(Number(event.target.value) / 100)} className="my-4 h-1.5 w-full cursor-pointer rounded-full bg-white/15 accent-violet-300" />
    <button type="button" data-testid="audio-mute" aria-pressed={muted} onClick={toggleMute} className="rounded bg-white/10 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/20">{muted ? (tr ? 'Sesi aç' : 'Unmute') : (tr ? 'Sessize al' : 'Mute')}</button>
  </section>
}
