import { useEffect, useMemo, useState } from 'react'
import { useItem } from 'dnd-timeline'
import { Film, Scissors } from 'lucide-react'
import { useScopedT } from '@/contexts/I18nContext'
import { toFileUrl } from '../projectPersistence'
import type { TrimRegion } from '../types'
import type { ClipTrackProps } from './TimelineEditor'

const FRAME_COUNT = 8

interface SourceVideoTrackProps {
  path: string
  /** Length of the track on the timeline (the edited length when `clip` is given). */
  durationMs: number
  /** Old-style cut ranges drawn over the track (only without `clip`). */
  trims: TrimRegion[]
  clip?: ClipTrackProps
  selectedCutId?: string | null
  onSelectCut?: (cutId: string) => void
}

/** Source time shown at a point of the edited track. */
function sourceAt(clip: ClipTrackProps | undefined, outMs: number) {
  const segment = clip?.segments.find((part) => outMs >= part.outStart && outMs < part.outEnd) ?? clip?.segments[clip.segments.length - 1]
  return segment ? segment.startMs + Math.min(outMs - segment.outStart, segment.endMs - segment.startMs) : outMs
}

export function SourceVideoTrack({ path, durationMs, trims, clip, selectedCutId = null, onSelectCut }: SourceVideoTrackProps) {
  const t = useScopedT('timeline')
  const { setNodeRef, itemStyle, itemContentStyle } = useItem({ id: 'source-video', span: { start: 0, end: durationMs }, disabled: true, data: { rowId: 'source-video-row' } })
  const [frames, setFrames] = useState<string[]>([])
  // Thumbnails follow the edited video: cut parts are not shown.
  const frameTimes = useMemo(
    () => Array.from({ length: FRAME_COUNT }, (_, index) => sourceAt(clip, ((index + 0.5) * durationMs) / FRAME_COUNT) / 1000),
    [clip, durationMs],
  )
  const frameKey = frameTimes.map((time) => time.toFixed(2)).join(',')
  useEffect(() => {
    let cancelled = false
    if (!path) return
    const video = document.createElement('video'); video.muted = true; video.preload = 'auto'; video.src = toFileUrl(path)
    const canvas = document.createElement('canvas'); canvas.width = 144; canvas.height = 80
    const context = canvas.getContext('2d')
    const times = frameKey.split(',').map(Number)
    const ready = () => {
      if (!context || !Number.isFinite(video.duration) || video.duration <= 0) return
      void (async () => {
        const next: string[] = []
        for (const time of times) {
          if (cancelled) break
          await new Promise<void>(resolve => { const timer = setTimeout(resolve, 2500); video.onseeked = () => { clearTimeout(timer); resolve() }; video.currentTime = Math.min(video.duration - .01, Number.isFinite(time) ? time : 0) })
          if (cancelled) break
          try { context.drawImage(video, 0, 0, 144, 80); next.push(canvas.toDataURL('image/jpeg', .6)) } catch { break }
        }
        if (!cancelled) setFrames(next)
      })()
    }
    video.addEventListener('loadedmetadata', ready, { once: true })
    return () => { cancelled = true; video.pause(); video.removeEventListener('loadedmetadata', ready); video.removeAttribute('src'); video.load() }
  }, [path, frameKey])
  const name = path.split(/[\\/]/).pop() || 'Video'
  const percent = (ms: number) => `${(ms / Math.max(1, durationMs)) * 100}%`

  return <div ref={setNodeRef} style={itemStyle} data-testid="source-video-track" aria-label={`Ana video: ${name}`}><div style={{ ...itemContentStyle, height: 52 }} className="relative overflow-hidden rounded-lg border-2 border-cyan-300/60 bg-cyan-900/30">
    <div className="pointer-events-none absolute inset-0 flex opacity-45">{frames.map((frame,index) => <img key={index} src={frame} alt="" draggable={false} className="h-full min-w-0 flex-1 object-cover" />)}</div>
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-black/55 px-3 py-1 text-[11px] text-cyan-100"><Film size={13} /><span className="truncate font-medium">{name}</span><span className="ml-auto shrink-0 tabular-nums">{(durationMs / 1000).toFixed(1)}s</span></div>
    {!clip && trims.map(trim => <div key={trim.id} title="Kesilen bölüm" className="pointer-events-none absolute inset-y-0 border-x border-red-400/70 bg-red-500/35" style={{ left: `${trim.startMs / durationMs * 100}%`, width: `${(trim.endMs - trim.startMs) / durationMs * 100}%`, backgroundImage: 'repeating-linear-gradient(135deg,transparent,transparent 4px,#ef444433 4px,#ef444433 8px)' }} />)}
    {clip?.segments.map((segment) => {
      const selected = clip.selectedStart === segment.startMs
      return <button
        key={segment.startMs}
        type="button"
        data-testid="clip-segment"
        data-start={segment.startMs}
        aria-pressed={selected}
        title={t('clip.segment', undefined, { start: (segment.startMs / 1000).toFixed(1), end: (segment.endMs / 1000).toFixed(1) })}
        onClick={(event) => { event.stopPropagation(); clip.onSelectSegment(selected ? null : segment.startMs) }}
        className={`absolute inset-y-0 border-x border-cyan-950/80 transition-colors ${selected ? 'z-[5] bg-white/25 ring-2 ring-inset ring-white' : 'hover:bg-white/10'}`}
        style={{ left: percent(segment.outStart), width: percent(segment.outEnd - segment.outStart) }}
      />
    })}
    {/* Speed changes sit on the video they speed up; clicking one selects its part. */}
    {clip?.speeds?.map((badge) => <button
      key={badge.id}
      type="button"
      data-testid="speed-badge"
      data-speed={badge.speed}
      title={`${badge.speed.toLocaleString()}×`}
      onClick={(event) => { event.stopPropagation(); clip.onSelectSpeed?.(badge.id) }}
      className="absolute bottom-1 z-[15] flex h-4 min-w-0 items-center overflow-hidden rounded-full border border-amber-300/50 bg-amber-500/85 px-1.5 text-[9px] font-semibold leading-none text-white shadow hover:bg-amber-400"
      style={{ left: `calc(${percent(badge.outStart)} + 3px)`, maxWidth: `calc(${percent(badge.outEnd - badge.outStart)} - 6px)` }}
    >{badge.speed.toLocaleString()}×</button>)}
    {clip?.speeds?.map((badge) => <div key={`${badge.id}-band`} aria-hidden className="pointer-events-none absolute bottom-0 h-[3px] bg-amber-400/90" style={{ left: percent(badge.outStart), width: percent(badge.outEnd - badge.outStart) }} />)}
    {clip?.markers.map((marker) => {
      const selected = selectedCutId === marker.cutId
      return <button
        key={marker.cutId}
        type="button"
        data-testid="cut-marker"
        data-cut-id={marker.cutId}
        aria-pressed={selected}
        data-crossfade={marker.crossfade ? 'true' : undefined}
        title={t('clip.cut', undefined, { seconds: (marker.lengthMs / 1000).toFixed(1) })}
        onClick={(event) => { event.stopPropagation(); onSelectCut?.(marker.cutId) }}
        className={`absolute bottom-0 top-0 z-20 flex w-3 -translate-x-1/2 items-end justify-center pb-0.5 ${selected ? 'text-white' : 'text-red-300'}`}
        style={{ left: percent(marker.outMs) }}
      >
        <span className={`absolute inset-y-0 left-1/2 -translate-x-1/2 ${marker.crossfade ? 'w-2 bg-gradient-to-r from-transparent via-violet-300 to-transparent' : `w-0.5 ${selected ? 'bg-white' : 'bg-red-400'}`}`} />
        <Scissors size={10} className="relative rounded-sm bg-black/70" />
      </button>
    })}
  </div></div>
}
