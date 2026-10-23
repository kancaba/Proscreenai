export type RegionKind = "zoom" | "trim" | "speed" | "annotation" | "audio";

export interface RegionTarget {
  kind: RegionKind;
  id: string;
}

export type RegionCommand =
  | { type: "copy" }
  | { type: "paste" }
  | { type: "duplicate" }
  | { type: "split" }
  | { type: "delete" }
  | { type: "nudge"; deltaMs: number };

export interface TimedRegion {
  id: string;
  startMs: number;
  endMs: number;
}

/** Shortest piece a split or paste may create. */
export const MIN_REGION_PIECE_MS = 100;

/** Text and audio may stack in lanes; zoom, trim and speed regions may not overlap. */
export const KIND_ALLOWS_OVERLAP: Record<RegionKind, boolean> = {
  zoom: false,
  trim: false,
  speed: false,
  annotation: true,
  audio: true,
};

const overlaps = (a: TimedRegion, b: TimedRegion) => a.startMs < b.endMs && a.endMs > b.startMs;

/** Splits a region at a time into two adjoining regions; null if either piece would be too short. */
export function splitRegion<T extends TimedRegion>(region: T, atMs: number, newId: string): [T, T] | null {
  const at = Math.round(atMs);
  if (at - region.startMs < MIN_REGION_PIECE_MS || region.endMs - at < MIN_REGION_PIECE_MS) return null;
  return [
    { ...region, endMs: at },
    { ...structuredClone(region), id: newId, startMs: at },
  ];
}

/**
 * A copy of `region` starting at `atMs` with the same length, kept inside the video.
 * On tracks without overlaps it is shortened to the free space, or rejected if there is none.
 */
export function placeCopy<T extends TimedRegion>(
  region: T,
  track: TimedRegion[],
  atMs: number,
  totalMs: number,
  newId: string,
  allowOverlap: boolean,
): T | null {
  const length = region.endMs - region.startMs;
  let startMs = Math.max(0, Math.min(Math.round(atMs), totalMs - MIN_REGION_PIECE_MS));
  let endMs = Math.min(totalMs, startMs + length);
  if (!allowOverlap) {
    if (track.some((other) => startMs >= other.startMs && startMs < other.endMs)) return null;
    const next = track.filter((other) => other.startMs >= startMs).sort((a, b) => a.startMs - b.startMs)[0];
    if (next) endMs = Math.min(endMs, next.startMs);
  }
  if (endMs - startMs < MIN_REGION_PIECE_MS) {
    if (allowOverlap) {
      startMs = Math.max(0, endMs - MIN_REGION_PIECE_MS);
    } else {
      return null;
    }
  }
  return { ...structuredClone(region), id: newId, startMs, endMs };
}

/** Moves a region by a delta, inside the video and (where required) without overlapping. */
export function nudgeRegion<T extends TimedRegion>(
  region: T,
  deltaMs: number,
  track: TimedRegion[],
  totalMs: number,
  allowOverlap: boolean,
): T | null {
  const length = region.endMs - region.startMs;
  const startMs = Math.max(0, Math.min(Math.round(region.startMs + deltaMs), totalMs - length));
  const moved = { ...region, startMs, endMs: startMs + length };
  if (moved.startMs === region.startMs) return null;
  if (!allowOverlap && track.some((other) => other.id !== region.id && overlaps(other, moved))) return null;
  return moved;
}
