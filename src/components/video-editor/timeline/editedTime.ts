/**
 * The timeline shows the video as edited: cut parts are removed and what follows moves up
 * (like a ripple delete in Premiere or Screen Studio). Edits are still stored in source
 * time; these functions convert between the two.
 */

export interface TimeSpan {
  start: number;
  end: number;
}

export interface CutRange {
  id: string;
  startMs: number;
  endMs: number;
  /** Dissolve across this cut instead of jumping (see `TrimRegion.crossfade`). */
  crossfade?: boolean;
}

export interface CutMap {
  /** Cuts merged, sorted and clamped to the video. */
  cuts: CutRange[];
  sourceMs: number;
  outputMs: number;
}

export function createCutMap(trims: CutRange[], sourceMs: number): CutMap {
  const sorted = trims
    .map((trim) => ({ ...trim, startMs: Math.max(0, trim.startMs), endMs: Math.min(sourceMs, trim.endMs) }))
    .filter((trim) => trim.endMs > trim.startMs)
    .sort((a, b) => a.startMs - b.startMs);
  const cuts: CutRange[] = [];
  for (const trim of sorted) {
    const previous = cuts[cuts.length - 1];
    if (previous && trim.startMs <= previous.endMs) {
      previous.endMs = Math.max(previous.endMs, trim.endMs);
      // Overlapping cuts become one; it dissolves if any of them does.
      if (trim.crossfade) previous.crossfade = true;
    } else cuts.push({ ...trim });
  }
  const removed = cuts.reduce((sum, cut) => sum + (cut.endMs - cut.startMs), 0);
  return { cuts, sourceMs, outputMs: Math.max(0, sourceMs - removed) };
}

/** Where a source moment appears on the edited timeline (a cut moment maps to the cut point). */
export function toOutputMs(map: CutMap, sourceMs: number): number {
  let removed = 0;
  for (const cut of map.cuts) {
    if (sourceMs <= cut.startMs) break;
    if (sourceMs < cut.endMs) return cut.startMs - removed;
    removed += cut.endMs - cut.startMs;
  }
  return Math.max(0, Math.min(map.outputMs, sourceMs - removed));
}

/**
 * The source moment for a point on the edited timeline. At a cut point, "after" gives the
 * first kept moment after the cut (where playback continues), "before" the last one before it.
 */
export function toSourceMs(map: CutMap, outputMs: number, bias: "after" | "before" = "after"): number {
  let removed = 0;
  for (const cut of map.cuts) {
    const cutAt = cut.startMs - removed;
    if (outputMs < cutAt || (outputMs === cutAt && bias === "before")) break;
    removed += cut.endMs - cut.startMs;
  }
  return Math.max(0, Math.min(map.sourceMs, outputMs + removed));
}

/** A source span as shown on the edited timeline; null when it is entirely cut out. */
export function spanToOutput(map: CutMap, span: TimeSpan): TimeSpan | null {
  const start = toOutputMs(map, span.start);
  const end = toOutputMs(map, span.end);
  return end - start >= 1 ? { start, end } : null;
}

/** A span moved or resized on the edited timeline, back in source time. */
export function spanToSource(map: CutMap, span: TimeSpan): TimeSpan {
  const start = Math.round(toSourceMs(map, span.start, "after"));
  const end = Math.round(toSourceMs(map, span.end, "before"));
  return { start, end: Math.max(start + 1, end) };
}

export interface ClipSegment {
  /** Source range of this part of the video. */
  startMs: number;
  endMs: number;
  /** Where it sits on the edited timeline. */
  outStart: number;
  outEnd: number;
}

/** The kept parts of the video, split at the user's split points. */
export function clipSegments(map: CutMap, splits: number[]): ClipSegment[] {
  const boundaries = [...new Set([0, map.sourceMs, ...splits.filter((ms) => ms > 0 && ms < map.sourceMs)])].sort((a, b) => a - b);
  const segments: ClipSegment[] = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    let pieces: TimeSpan[] = [{ start: boundaries[index], end: boundaries[index + 1] }];
    for (const cut of map.cuts) {
      pieces = pieces.flatMap((piece) => {
        if (cut.endMs <= piece.start || cut.startMs >= piece.end) return [piece];
        const parts: TimeSpan[] = [];
        if (cut.startMs > piece.start) parts.push({ start: piece.start, end: cut.startMs });
        if (cut.endMs < piece.end) parts.push({ start: cut.endMs, end: piece.end });
        return parts;
      });
    }
    for (const piece of pieces) {
      if (piece.end - piece.start < 1) continue;
      segments.push({ startMs: piece.start, endMs: piece.end, outStart: toOutputMs(map, piece.start), outEnd: toOutputMs(map, piece.start) + (piece.end - piece.start) });
    }
  }
  return segments;
}

/** Cut points on the edited timeline, with the cut they stand for. */
export function cutMarkers(map: CutMap): Array<{ outMs: number; cut: CutRange }> {
  return map.cuts.map((cut) => ({ outMs: toOutputMs(map, cut.startMs), cut }));
}

/** Split points kept sorted, unique and inside the video. */
export function normalizeSplits(splits: unknown, sourceMs: number): number[] {
  if (!Array.isArray(splits)) return [];
  const valid = splits.filter((ms): ms is number => typeof ms === "number" && Number.isFinite(ms) && ms > 0 && (sourceMs <= 0 || ms < sourceMs));
  return [...new Set(valid.map((ms) => Math.round(ms)))].sort((a, b) => a - b);
}
