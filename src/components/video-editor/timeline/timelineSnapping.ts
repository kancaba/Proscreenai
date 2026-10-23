export interface TimeSpanLike {
  start: number;
  end: number;
}

/** How close (in screen pixels) an edge must come to a target to snap to it. */
export const SNAP_DISTANCE_PX = 8;

export interface SnapResult {
  span: TimeSpanLike;
  /** The time the span snapped to, for drawing a guide; null when it did not snap. */
  snapTo: number | null;
}

/** Edges an item can snap to: the playhead, the video's ends and every other item's edges. */
export function collectSnapTargets(
  spans: { id: string; start: number; end: number }[],
  excludeId: string,
  playheadMs: number,
  totalMs: number,
): number[] {
  const targets = new Set<number>([0, totalMs]);
  if (Number.isFinite(playheadMs)) targets.add(playheadMs);
  for (const span of spans) {
    if (span.id === excludeId) continue;
    targets.add(span.start);
    targets.add(span.end);
  }
  return [...targets].filter(Number.isFinite);
}

function nearest(value: number, targets: number[], thresholdMs: number) {
  let best: number | null = null;
  for (const target of targets) {
    const distance = Math.abs(target - value);
    if (distance <= thresholdMs && (best === null || distance < Math.abs(best - value))) best = target;
  }
  return best;
}

/** A moved item keeps its length; whichever edge is closest to a target snaps. */
export function snapMovedSpan(span: TimeSpanLike, targets: number[], thresholdMs: number): SnapResult {
  const startTarget = nearest(span.start, targets, thresholdMs);
  const endTarget = nearest(span.end, targets, thresholdMs);
  const startDelta = startTarget === null ? Number.POSITIVE_INFINITY : startTarget - span.start;
  const endDelta = endTarget === null ? Number.POSITIVE_INFINITY : endTarget - span.end;
  if (!Number.isFinite(startDelta) && !Number.isFinite(endDelta)) return { span, snapTo: null };
  const useStart = Math.abs(startDelta) <= Math.abs(endDelta);
  const delta = useStart ? startDelta : endDelta;
  return {
    span: { start: span.start + delta, end: span.end + delta },
    snapTo: useStart ? startTarget : endTarget,
  };
}

/** A resized item snaps only the edge that is being dragged. */
export function snapResizedSpan(
  span: TimeSpanLike,
  original: TimeSpanLike,
  targets: number[],
  thresholdMs: number,
  minDurationMs: number,
): SnapResult {
  const movingStart = Math.abs(span.start - original.start) > Math.abs(span.end - original.end);
  if (movingStart) {
    const target = nearest(span.start, targets, thresholdMs);
    if (target === null || span.end - target < minDurationMs) return { span, snapTo: null };
    return { span: { start: target, end: span.end }, snapTo: target };
  }
  const target = nearest(span.end, targets, thresholdMs);
  if (target === null || target - span.start < minDurationMs) return { span, snapTo: null };
  return { span: { start: span.start, end: target }, snapTo: target };
}
