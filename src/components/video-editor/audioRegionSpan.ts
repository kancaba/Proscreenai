import { type CutMap, toOutputMs, toSourceMs, type TimeSpan } from "./timeline/editedTime";
import { MIN_REGION_PIECE_MS } from "./timeline/regionCommands";
import type { AudioRegion } from "./types";

/*
 * An added audio clip is attached to the video moment where it starts (startMs, source time)
 * and then plays its full length (endMs - startMs) without gaps, even where the video under it
 * is cut. Cutting the video therefore moves the clip with its start frame but never shortens it.
 */

/** Audio tracks the timeline offers (A1 … A8). */
export const MAX_AUDIO_TRACKS = 8;

/** Row id of an audio track on the timeline, and the track of such a row id. */
export const audioRowId = (track: number) => `row-audio-${track}`;
export function trackOfAudioRow(rowId: string | undefined): number | undefined {
  const match = rowId?.match(/^row-audio-(\d+)$/);
  return match ? Math.min(MAX_AUDIO_TRACKS - 1, Number(match[1])) : undefined;
}

/** The first track where a clip spanning `span` on the edited timeline overlaps nothing. */
export function firstFreeAudioTrack(regions: AudioRegion[], span: TimeSpan, map: CutMap, excludeId?: string): number {
  for (let track = 0; track < MAX_AUDIO_TRACKS; track++) {
    const busy = regions.some((region) => {
      if (region.id === excludeId || (region.track ?? 0) !== track) return false;
      const other = audioTimelineSpan(region, map);
      return span.end > other.start && span.start < other.end;
    });
    if (!busy) return track;
  }
  return MAX_AUDIO_TRACKS - 1;
}

/** Where the clip sits on the edited timeline. */
export function audioTimelineSpan(region: AudioRegion, map: CutMap): TimeSpan {
  const start = toOutputMs(map, region.startMs);
  return { start, end: start + (region.endMs - region.startMs) };
}

/** Whether the clip is heard at a moment of the edited timeline. */
export function isAudioActive(region: AudioRegion, timelineMs: number, map: CutMap): boolean {
  const span = audioTimelineSpan(region, map);
  return timelineMs >= span.start && timelineMs < span.end;
}

/** Seconds into the audio file that should be heard at a moment of the edited timeline. */
export function audioFileOffsetSeconds(region: AudioRegion, timelineMs: number, map: CutMap): number {
  return (timelineMs - toOutputMs(map, region.startMs) + (region.sourceStartMs ?? 0)) / 1000;
}

/** Moves the file offset with the clip's start, kept inside the file. */
function trimStart(region: AudioRegion, start: number, previousStart: number) {
  const fileMs = region.sourceDurationMs;
  let offset = (region.sourceStartMs ?? 0) + (start - previousStart);
  if (offset < 0) {
    // The sound cannot start before the beginning of the file.
    start -= offset;
    offset = 0;
  }
  if (fileMs !== undefined && offset > fileMs - 1) {
    start -= offset - (fileMs - 1);
    offset = fileMs - 1;
  }
  return { start, offset: Math.round(offset) };
}

/**
 * Applies a span moved or resized on the edited timeline.
 * Dragging the left edge (end unchanged) trims the start of the sound, so the file offset moves with it;
 * moving the clip or dragging the right edge keeps the offset. A known file length bounds the right edge.
 */
export function applyAudioTimelineChange(region: AudioRegion, span: TimeSpan, map: CutMap): AudioRegion {
  const shown = audioTimelineSpan(region, map);
  let start = Math.round(span.start);
  let end = Math.round(span.end);
  let offset = region.sourceStartMs ?? 0;
  // The timeline draws a clip that runs past the video's end clipped at the end.
  const shownEnd = Math.round(Math.min(shown.end, map.outputMs));
  if (end === shownEnd && start !== shown.start) {
    end = shown.end;
    ({ start, offset } = trimStart(region, start, shown.start));
  } else if (region.sourceDurationMs !== undefined) {
    end = Math.min(end, start + (region.sourceDurationMs - offset));
  }
  const startMs = Math.round(toSourceMs(map, start, "after"));
  return { ...region, startMs, endMs: startMs + Math.max(1, end - start), sourceStartMs: offset };
}

/** Splits a clip at a moment of the edited timeline; the second piece continues the sound. */
export function splitAudioRegion(region: AudioRegion, atTimelineMs: number, map: CutMap, newId: string): [AudioRegion, AudioRegion] | null {
  const span = audioTimelineSpan(region, map);
  const at = Math.round(atTimelineMs);
  if (at - span.start < MIN_REGION_PIECE_MS || span.end - at < MIN_REGION_PIECE_MS) return null;
  const secondStart = Math.round(toSourceMs(map, at, "after"));
  return [
    { ...region, endMs: region.startMs + (at - span.start) },
    { ...structuredClone(region), id: newId, startMs: secondStart, endMs: secondStart + (span.end - at), sourceStartMs: (region.sourceStartMs ?? 0) + (at - span.start) },
  ];
}
