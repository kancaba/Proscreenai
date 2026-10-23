export interface TimeSpan { startMs: number; endMs: number }

/** Find room on this track without silently creating overlapping edits. */
export function findAvailableSpan(totalMs: number, playheadMs: number, regions: TimeSpan[], preferredMs = 1500): TimeSpan | null {
  if (!Number.isFinite(totalMs) || totalMs < 100) return null
  const occupied = [...regions].sort((a, b) => a.startMs - b.startMs)
  const gaps: TimeSpan[] = []
  let cursor = 0
  for (const region of occupied) {
    if (region.startMs > cursor) gaps.push({ startMs: cursor, endMs: Math.min(totalMs, region.startMs) })
    cursor = Math.max(cursor, region.endMs)
  }
  if (cursor < totalMs) gaps.push({ startMs: cursor, endMs: totalMs })
  const valid = gaps.filter((gap) => gap.endMs - gap.startMs >= 100)
  const gap = valid.find((gap) => playheadMs >= gap.startMs && playheadMs < gap.endMs)
    ?? valid.find((gap) => gap.startMs >= playheadMs)
    ?? valid[0]
  if (!gap) return null
  // Start exactly at the playhead; if the space after it is short, make the edit
  // shorter rather than moving it earlier than where the user put it.
  if (playheadMs >= gap.startMs && gap.endMs - playheadMs >= Math.min(MIN_PLACED_SPAN_MS, preferredMs)) {
    const startMs = Math.round(playheadMs)
    return { startMs, endMs: Math.round(Math.min(gap.endMs, startMs + preferredMs)) }
  }
  const length = Math.min(preferredMs, gap.endMs - gap.startMs)
  const startMs = Math.round(Math.max(gap.startMs, Math.min(playheadMs, gap.endMs - length)))
  return { startMs, endMs: Math.round(startMs + length) }
}

/** Shortest edit placed at the playhead; with less room it moves back to fit instead. */
export const MIN_PLACED_SPAN_MS = 500
/** New zooms are long enough for a visible zoom-in and zoom-out (up to 1 s each). */
export const DEFAULT_ZOOM_SPAN_MS = 2000

export function validRegionSpan(span: TimeSpan, totalMs: number, otherRegions: TimeSpan[]) {
  return Number.isFinite(span.startMs) && Number.isFinite(span.endMs)
    && span.startMs >= 0 && span.endMs <= totalMs && span.endMs - span.startMs >= 100
    && !otherRegions.some((region) => span.startMs < region.endMs && span.endMs > region.startMs)
}
