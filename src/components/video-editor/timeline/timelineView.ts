export interface ViewRange {
  start: number;
  end: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Visible range for a zoom slider position (0 = whole video, 1 = closest zoom),
 * on a logarithmic scale so each step feels the same, centred on `centerMs`.
 */
export function rangeForZoomLevel(level: number, totalMs: number, minSpanMs: number, centerMs: number): ViewRange {
  if (totalMs <= 0) return { start: 0, end: 0 };
  const minSpan = Math.min(minSpanMs, totalMs);
  const span = totalMs * (minSpan / totalMs) ** clamp(level, 0, 1);
  const start = clamp(centerMs - span / 2, 0, totalMs - span);
  return { start, end: start + span };
}

/** Slider position (0–1) that shows the given range. */
export function zoomLevelForRange(range: ViewRange, totalMs: number, minSpanMs: number): number {
  const minSpan = Math.min(minSpanMs, totalMs);
  const span = range.end - range.start;
  if (totalMs <= 0 || minSpan >= totalMs || span <= 0) return 0;
  return clamp(Math.log(span / totalMs) / Math.log(minSpan / totalMs), 0, 1);
}

/**
 * Keeps the playhead in view while it moves: when it leaves the visible range,
 * the view pages so the playhead sits near the left edge. Null when no change is needed.
 */
export function followPlayhead(range: ViewRange, playheadMs: number, totalMs: number): ViewRange | null {
  const span = range.end - range.start;
  if (span <= 0 || span >= totalMs) return null;
  const margin = span * 0.02;
  if (playheadMs >= range.start && playheadMs <= range.end - margin) return null;
  const start = clamp(playheadMs - span * 0.1, 0, totalMs - span);
  return start === range.start ? null : { start, end: start + span };
}
