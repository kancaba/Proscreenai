import type { PlaybackSpeed, SpeedRegion } from "./types";

/*
 * Speed is set on a part of the video (split with C). It is still stored as speed regions,
 * so older projects, whose regions need not line up with parts, keep working unchanged.
 */

type Part = { startMs: number; endMs: number };

/** The part's speed: 1 when no region touches it, "mixed" when regions cover it only in places or differently. */
export function speedOfPart(part: Part, regions: SpeedRegion[]): number | "mixed" {
  const touching = regions.filter((region) => region.endMs > part.startMs && region.startMs < part.endMs);
  if (touching.length === 0) return 1;
  const covering = touching.find((region) => region.startMs <= part.startMs && region.endMs >= part.endMs);
  return covering && touching.length === 1 ? covering.speed : "mixed";
}

/**
 * Gives the part one speed: regions overlapping it are cut back to outside the part (a region
 * reaching past both ends is split in two), then a region exactly over the part is added unless
 * the speed is 1.
 */
export function setPartSpeed(regions: SpeedRegion[], part: Part, speed: PlaybackSpeed | 1, nextId: () => string): SpeedRegion[] {
  const kept = regions.flatMap((region): SpeedRegion[] => {
    if (region.endMs <= part.startMs || region.startMs >= part.endMs) return [region];
    const pieces: SpeedRegion[] = [];
    if (region.startMs < part.startMs) pieces.push({ ...region, endMs: part.startMs });
    if (region.endMs > part.endMs) pieces.push({ ...region, id: pieces.length ? nextId() : region.id, startMs: part.endMs });
    return pieces;
  });
  return speed === 1 ? kept : [...kept, { id: nextId(), startMs: part.startMs, endMs: part.endMs, speed }];
}
