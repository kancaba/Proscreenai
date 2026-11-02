/*
 * Moving parts of the edit (a part dragged elsewhere on the timeline, or an added video put at the
 * start or the playhead): the video is rebuilt with its pieces in the new order, and every time
 * that points into it (edits, part splits, cursor and key data) moves along with its piece.
 */

export interface SourcePiece {
  startMs: number;
  endMs: number;
}

type Timed = { startMs: number; endMs: number };

/** The video cut at its part splits, in order. */
export function piecesBetween(splits: number[], totalMs: number): SourcePiece[] {
  const points = [...new Set([0, totalMs, ...splits.filter((ms) => ms > 0 && ms < totalMs)])].sort((a, b) => a - b);
  return points.slice(0, -1).map((startMs, index) => ({ startMs, endMs: points[index + 1] }));
}

/** `pieces` with the one at `from` moved so that it ends up at index `to`. */
export function movePiece(pieces: SourcePiece[], from: number, to: number): SourcePiece[] {
  const next = [...pieces];
  const [moved] = next.splice(from, 1);
  if (!moved) return pieces;
  next.splice(Math.max(0, Math.min(next.length, to)), 0, moved);
  return next;
}

/** The pieces of a joined video with the added one (from `addedStartMs` to the end) put at `atMs`. */
export function insertAddedAt(totalMs: number, addedStartMs: number, atMs: number): SourcePiece[] {
  const at = Math.max(0, Math.min(addedStartMs, Math.round(atMs)));
  return [
    { startMs: 0, endMs: at },
    { startMs: addedStartMs, endMs: totalMs },
    { startMs: at, endMs: addedStartMs },
  ].filter((piece) => piece.endMs > piece.startMs);
}

/** Whether the pieces are already in the video's own order (nothing to rebuild). */
export function isInOrder(pieces: SourcePiece[]): boolean {
  return pieces.every((piece, index) => piece.startMs === (index === 0 ? 0 : pieces[index - 1].endMs));
}

/** Pieces that cover the video from 0 once, without gaps, in any order; null for anything else. */
export function validPieces(value: unknown): SourcePiece[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 500) return null;
  const pieces: SourcePiece[] = [];
  for (const piece of value) {
    const { startMs, endMs } = (piece ?? {}) as Partial<SourcePiece>;
    if (typeof startMs !== "number" || typeof endMs !== "number" || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;
    pieces.push({ startMs, endMs });
  }
  const sorted = [...pieces].sort((a, b) => a.startMs - b.startMs);
  return sorted.every((piece, index) => piece.startMs === (index === 0 ? 0 : sorted[index - 1].endMs)) ? pieces : null;
}

export interface Reorder {
  pieces: SourcePiece[];
  /** Where each piece starts in the rebuilt video. */
  starts: number[];
  totalMs: number;
  /** Where a moment of the old video is in the rebuilt one (time after the video's end stays put). */
  time: (ms: number) => number;
}

export function createReorder(pieces: SourcePiece[]): Reorder {
  const starts: number[] = [];
  let totalMs = 0;
  for (const piece of pieces) {
    starts.push(totalMs);
    totalMs += piece.endMs - piece.startMs;
  }
  const time = (ms: number) => {
    if (ms >= totalMs) return ms;
    const index = pieces.findIndex((piece) => ms >= piece.startMs && ms < piece.endMs);
    if (index < 0) return Math.max(0, ms);
    return starts[index] + ms - pieces[index].startMs;
  };
  return { pieces, starts, totalMs, time };
}

/** Things placed at a moment (zooms, texts, sounds) move with the piece their start is in and keep their length. */
export function moveRegions<T extends Timed>(regions: T[], reorder: Reorder): T[] {
  return regions.map((region) => {
    const startMs = reorder.time(region.startMs);
    return { ...region, startMs, endMs: startMs + region.endMs - region.startMs };
  });
}

/**
 * Things that describe the video itself (a cut, a speed) are split at the piece edges and each bit
 * moves with its piece; bits that end up side by side again become one. The first bit keeps the id.
 */
export function splitRegions<T extends Timed & { id: string }>(regions: T[], reorder: Reorder, nextId: () => string): T[] {
  return regions.flatMap((region) => {
    const bits = reorder.pieces
      .map((piece, index) => {
        const startMs = Math.max(region.startMs, piece.startMs);
        const endMs = Math.min(region.endMs, piece.endMs);
        return endMs > startMs ? { startMs: reorder.starts[index] + startMs - piece.startMs, endMs: reorder.starts[index] + endMs - piece.startMs } : null;
      })
      .filter((bit): bit is Timed => bit !== null)
      .sort((a, b) => a.startMs - b.startMs);
    const merged: Timed[] = [];
    for (const bit of bits) {
      const last = merged[merged.length - 1];
      if (last && bit.startMs <= last.endMs) last.endMs = Math.max(last.endMs, bit.endMs);
      else merged.push({ ...bit });
    }
    // Past the video's end (the ending extension) nothing moves.
    if (merged.length === 0) return region.startMs >= reorder.totalMs ? [region] : [];
    return merged.map((bit, index) => ({ ...region, ...(index === 0 ? {} : { id: nextId() }), ...bit }));
  });
}

/** Part splits of the rebuilt video: the edges between pieces and every split that was inside one. */
export function reorderSplits(splits: number[], reorder: Reorder): number[] {
  const moved = [...reorder.starts, ...splits.map(reorder.time)].filter((ms) => ms > 0 && ms < reorder.totalMs);
  return [...new Set(moved)].sort((a, b) => a - b);
}

/** Names of the joined videos where each now starts; empty when only one video is left in a row. */
export function reorderVideoClips(clips: Array<{ name: string; startMs: number }>, reorder: Reorder): Array<{ name: string; startMs: number }> {
  if (clips.length < 2) return [];
  const result: Array<{ name: string; startMs: number; clip: number; endMs: number }> = [];
  reorder.pieces.forEach((piece, index) => {
    // A piece can hold the end of one video and the start of the next.
    clips.forEach((candidate, clip) => {
      const startMs = Math.max(piece.startMs, candidate.startMs);
      const endMs = Math.min(piece.endMs, clips[clip + 1]?.startMs ?? Number.POSITIVE_INFINITY);
      if (endMs <= startMs) return;
      const last = result[result.length - 1];
      // The same video continuing where it left off stays one label.
      if (last && last.clip === clip && last.endMs === startMs) last.endMs = endMs;
      else result.push({ name: candidate.name, startMs: reorder.starts[index] + startMs - piece.startMs, clip, endMs });
    });
  });
  return result.length > 1 ? result.map(({ name, startMs }) => ({ name, startMs })) : [];
}

/** Cursor samples and key times of the rebuilt video. */
export function reorderTelemetry(data: unknown, reorder: Reorder): { version: number; samples: Array<{ timeMs: number } & Record<string, unknown>>; keys: number[] } | null {
  if (!data || typeof data !== "object") return null;
  const record = data as { version?: number; samples?: unknown; keys?: unknown };
  const ownSamples = Array.isArray(data) ? data : Array.isArray(record.samples) ? record.samples : [];
  const samples = (ownSamples as Array<Record<string, unknown>>)
    .filter((sample) => typeof sample?.timeMs === "number" && Number.isFinite(sample.timeMs) && sample.timeMs >= 0)
    .map((sample) => ({ ...sample, timeMs: reorder.time(Math.min(sample.timeMs as number, Math.max(0, reorder.totalMs - 1))) }))
    .sort((a, b) => a.timeMs - b.timeMs);
  const keys = (Array.isArray(data) ? [] : Array.isArray(record.keys) ? record.keys : [])
    .filter((time): time is number => typeof time === "number" && Number.isFinite(time) && time >= 0)
    .map((time) => reorder.time(Math.min(time, Math.max(0, reorder.totalMs - 1))))
    .sort((a, b) => a - b);
  return { version: 2, samples, keys };
}
