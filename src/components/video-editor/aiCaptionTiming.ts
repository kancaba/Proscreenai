import type { TrimRegion } from './types'

export type CaptionSlot = { startMs: number; endMs: number }

/** Divide playable source time into caption slots without placing text inside trims. */
export function buildCaptionSlots(durationMs: number, trims: TrimRegion[]): CaptionSlot[] {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return []
  const end = Math.round(durationMs)
  const cuts = trims
    .map(({ startMs, endMs }) => ({ startMs: Math.max(0, Math.min(end, Math.round(startMs))), endMs: Math.max(0, Math.min(end, Math.round(endMs))) }))
    .filter((cut) => cut.endMs > cut.startMs)
    .sort((a, b) => a.startMs - b.startMs)
  const kept: CaptionSlot[] = []
  let cursor = 0
  for (const cut of cuts) {
    if (cut.startMs > cursor) kept.push({ startMs: cursor, endMs: cut.startMs })
    cursor = Math.max(cursor, cut.endMs)
  }
  if (cursor < end) kept.push({ startMs: cursor, endMs: end })
  const visibleMs = kept.reduce((sum, span) => sum + span.endMs - span.startMs, 0)
  const targetMs = Math.max(5000, visibleMs / 100)
  return kept.flatMap((span) => {
    const count = Math.ceil((span.endMs - span.startMs) / targetMs)
    return Array.from({ length: count }, (_, index) => ({
      startMs: Math.round(span.startMs + (span.endMs - span.startMs) * index / count),
      endMs: Math.round(span.startMs + (span.endMs - span.startMs) * (index + 1) / count),
    }))
  })
}
