import { type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from 'react'
import { useItem } from 'dnd-timeline'
import { Film, GripVertical, Hourglass, Keyboard, Scissors } from 'lucide-react'
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
  const videos = clip?.videos ?? []
  const percent = (ms: number) => `${(ms / Math.max(1, durationMs)) * 100}%`

  // Dragging a part (past a few pixels; a plain click still selects it) to another piece edge.
  const trackRef = useRef<HTMLDivElement>(null)
  const justDraggedRef = useRef(false)
  const [drag, setDrag] = useState<{ outStart: number; outEnd: number; atMs: number; target: number } | null>(null)
  const move = clip?.move
  const startDrag = (event: ReactPointerEvent, segment: { startMs: number; outStart: number; outEnd: number }) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!move || move.busy || event.button !== 0 || !rect || rect.width <= 0) return
    event.stopPropagation()
    const startX = event.clientX
    let current: typeof drag = null
    const follow = (moveEvent: PointerEvent) => {
      if (!current && Math.abs(moveEvent.clientX - startX) < 6) return
      const atMs = Math.max(0, Math.min(durationMs, ((moveEvent.clientX - rect.left) / rect.width) * durationMs))
      const target = move.edges.reduce((best, edge) => (Math.abs(edge - atMs) < Math.abs(best - atMs) ? edge : best), move.edges[0])
      current = { outStart: segment.outStart, outEnd: segment.outEnd, atMs, target }
      setDrag(current)
    }
    const stop = (drop: boolean) => {
      window.removeEventListener('pointermove', follow)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      setDrag(null)
      if (!current) return
      // The click that ends a drag does not also select the part.
      justDraggedRef.current = true
      setTimeout(() => { justDraggedRef.current = false }, 0)
      if (drop) move.onMove(segment.startMs, current.target)
    }
    const onUp = () => stop(true)
    const onCancel = () => stop(false)
    window.addEventListener('pointermove', follow)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
  }

  return <div ref={setNodeRef} style={itemStyle} data-testid="source-video-track" aria-label={`Ana video: ${name}`}><div ref={trackRef} style={{ ...itemContentStyle, height: 52 }} className="relative overflow-hidden rounded-lg border-2 border-cyan-300/60 bg-cyan-900/30">
    <div className="pointer-events-none absolute inset-0 flex opacity-45">{frames.map((frame,index) => <img key={index} src={frame} alt="" draggable={false} className="h-full min-w-0 flex-1 object-cover" />)}</div>
    {videos.length > 1
      ? <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[21px] bg-black/55 text-[11px] text-cyan-100">
        {videos.map((video, index) => {
          const end = videos[index + 1]?.outStart ?? durationMs
          return <div key={video.outStart} data-testid="video-label" className="absolute inset-y-0 flex min-w-0 items-center gap-1.5 px-2" style={{ left: percent(video.outStart), width: percent(end - video.outStart) }}>
            <Film size={12} className="shrink-0" /><span className="truncate font-medium">{video.name}</span>
          </div>
        })}
        <span className="absolute right-2 top-1 tabular-nums">{(durationMs / 1000).toFixed(1)}s</span>
      </div>
      : <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center gap-2 bg-black/55 px-3 py-1 text-[11px] text-cyan-100"><Film size={13} /><span className="truncate font-medium">{name}</span><span className="ml-auto shrink-0 tabular-nums">{(durationMs / 1000).toFixed(1)}s</span></div>}
    {/* Where an added video starts. */}
    {videos.slice(1).map((video) => <div key={`boundary-${video.outStart}`} data-testid="video-boundary" aria-hidden className="pointer-events-none absolute inset-y-0 z-[12] w-[3px] -translate-x-1/2 bg-cyan-200 shadow-[0_0_6px_rgba(165,243,252,0.8)]" style={{ left: percent(video.outStart) }} />)}
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
        onPointerDown={(event) => startDrag(event, segment)}
        onClick={(event) => { event.stopPropagation(); if (!justDraggedRef.current) clip.onSelectSegment(selected ? null : segment.startMs) }}
        className={`absolute inset-y-0 border-x border-cyan-950/80 transition-colors ${move && !move.busy ? 'cursor-grab active:cursor-grabbing' : ''} ${selected ? 'z-[5] bg-white/25 ring-2 ring-inset ring-white' : 'hover:bg-white/10'}`}
        style={{ left: percent(segment.outStart), width: percent(segment.outEnd - segment.outStart) }}
      />
    })}
    {/* Typing found while recording; clicking one opens its card to speed it up or cut it. */}
    {clip?.typing?.map((stretch) => {
      const selected = clip.selectedTypingStart === stretch.startMs
      return <button
        key={`typing-${stretch.startMs}`}
        type="button"
        data-testid="typing-stretch"
        data-start={stretch.startMs}
        aria-pressed={selected}
        title={t('clip.typing')}
        onClick={(event) => { event.stopPropagation(); clip.onSelectTyping?.(stretch.startMs) }}
        className={`absolute top-[25px] z-[16] flex h-4 items-center gap-1 overflow-hidden rounded-full px-1.5 text-[9px] font-medium leading-none text-white shadow ${selected ? 'bg-sky-400 ring-2 ring-white' : 'bg-sky-500/80 hover:bg-sky-400'}`}
        style={{ left: `calc(${percent(stretch.outStart)} + 2px)`, width: `max(18px, calc(${percent(stretch.outEnd - stretch.outStart)} - 4px))` }}
      ><Keyboard size={10} className="shrink-0" /></button>
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
    {/* The part being dragged, where it would go, and a handle that follows the pointer. */}
    {drag && <>
      <div aria-hidden className="pointer-events-none absolute inset-y-0 z-[25] border-2 border-dashed border-cyan-200 bg-cyan-300/20" style={{ left: percent(drag.outStart), width: percent(drag.outEnd - drag.outStart) }} />
      <div data-testid="clip-drop-target" data-target={drag.target} aria-hidden className="pointer-events-none absolute inset-y-0 z-[30] w-1 -translate-x-1/2 rounded-full bg-amber-300 shadow-[0_0_10px_rgba(252,211,77,0.9)]" style={{ left: percent(drag.target) }} />
      <div aria-hidden className="pointer-events-none absolute top-1/2 z-[31] flex -translate-x-1/2 -translate-y-1/2 items-center gap-1 rounded-md bg-cyan-200 px-1.5 py-0.5 text-[10px] font-semibold text-cyan-950 shadow-lg" style={{ left: `clamp(48px, ${percent(drag.atMs)}, calc(100% - 48px))` }}><GripVertical size={11} />{t('move.dragging')}</div>
    </>}
  </div></div>
}

/** The time added after the video's end, drawn right after the video on its track. */
export function EndingTrackItem({ startMs, durationMs, mode, onSelect }: { startMs: number; durationMs: number; mode: 'freeze' | 'background'; onSelect: () => void }) {
  const t = useScopedT('timeline')
  const { setNodeRef, itemStyle, itemContentStyle } = useItem({ id: 'video-ending', span: { start: startMs, end: startMs + durationMs }, disabled: true, data: { rowId: 'source-video-row' } })
  const label = t(mode === 'freeze' ? 'ending.freeze' : 'ending.background')
  return <div ref={setNodeRef} style={itemStyle}><div style={{ ...itemContentStyle, height: 52 }}>
    <button
      type="button"
      data-testid="ending-track"
      data-mode={mode}
      title={t('ending.title')}
      onClick={(event) => { event.stopPropagation(); onSelect() }}
      className="flex h-full w-full min-w-0 items-center gap-1.5 overflow-hidden rounded-lg border-2 border-dashed border-cyan-300/50 bg-[repeating-linear-gradient(135deg,#164e6333,#164e6333_6px,#0e7490_6px,#0e749033_12px)] px-2 text-[11px] text-cyan-100 hover:border-cyan-200"
    >
      <Hourglass size={12} className="shrink-0" />
      <span className="truncate font-medium">{label}</span>
      <span className="ml-auto shrink-0 tabular-nums">{(durationMs / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}s</span>
    </button>
  </div></div>
}
