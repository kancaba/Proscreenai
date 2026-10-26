import type { AudioRegion } from "./types";

/**
 * Applies a timeline span change to an audio clip.
 * Dragging the left edge (end unchanged) trims the start of the sound, so the file offset moves with it;
 * moving the clip or dragging the right edge keeps the offset. A known file length bounds both edges.
 */
export function applyAudioSpanChange(region: AudioRegion, span: { start: number; end: number }): AudioRegion {
  let startMs = Math.round(span.start);
  let endMs = Math.round(span.end);
  const offset = region.sourceStartMs ?? 0;
  const fileMs = region.sourceDurationMs;
  let sourceStartMs = offset;

  if (endMs === region.endMs && startMs !== region.startMs) {
    sourceStartMs = offset + (startMs - region.startMs);
    if (sourceStartMs < 0) {
      // The sound cannot start before the beginning of the file.
      startMs -= sourceStartMs;
      sourceStartMs = 0;
    }
    if (fileMs !== undefined && sourceStartMs > fileMs - 1) {
      startMs -= sourceStartMs - (fileMs - 1);
      sourceStartMs = fileMs - 1;
    }
  } else if (fileMs !== undefined) {
    endMs = Math.min(endMs, startMs + (fileMs - offset));
  }

  return { ...region, startMs, endMs, sourceStartMs: Math.max(0, Math.round(sourceStartMs)) };
}

/** Seconds into the audio file that should be heard at the given timeline time. */
export function audioFileOffsetSeconds(region: AudioRegion, timelineMs: number): number {
  return (timelineMs - region.startMs + (region.sourceStartMs ?? 0)) / 1000;
}
