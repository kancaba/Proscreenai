import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyAudioTimelineChange, audioFileOffsetSeconds, audioRowId, audioTimelineSpan, firstFreeAudioTrack, isAudioActive, MAX_AUDIO_TRACKS, splitAudioRegion, trackOfAudioRow } from "./audioRegionSpan";
import { createCutMap } from "./timeline/editedTime";
import type { AudioRegion } from "./types";

const noCuts = createCutMap([], 60000);
const clip: AudioRegion = { id: "audio-1", startMs: 2000, endMs: 17000, audioPath: "/tmp/voice.mp3", volume: 1, sourceDurationMs: 15000 };

describe("audio clips on a video with cuts", () => {
  // The video loses 5–8 s, which lies under the voiceover.
  const cut = createCutMap([{ id: "trim-1", startMs: 5000, endMs: 8000 }], 60000);

  it("cutting the video under a voiceover does not shorten it", () => {
    expect(audioTimelineSpan(clip, cut)).toEqual({ start: 2000, end: 17000 });
    // At edited-timeline 16 s (source 19 s) the voiceover is still playing its 14th second.
    expect(isAudioActive(clip, 16000, cut)).toBe(true);
    expect(audioFileOffsetSeconds(clip, 16000, cut)).toBe(14);
  });

  it("plays continuously across the cut point", () => {
    // Just before and just after the cut on the edited timeline, the file advances by the same 2 ms.
    expect(audioFileOffsetSeconds(clip, 5001, cut) - audioFileOffsetSeconds(clip, 4999, cut)).toBeCloseTo(0.002);
  });

  it("a cut before the voiceover moves it with the frame it is attached to", () => {
    const later: AudioRegion = { ...clip, startMs: 10000, endMs: 20000 };
    expect(audioTimelineSpan(later, cut)).toEqual({ start: 7000, end: 17000 });
  });

  it("moving a clip on the edited timeline keeps its full length", () => {
    const moved = applyAudioTimelineChange(clip, { start: 4000, end: 19000 }, cut);
    expect(moved.endMs - moved.startMs).toBe(15000);
    expect(audioTimelineSpan(moved, cut)).toEqual({ start: 4000, end: 19000 });
  });

  it("trimming the left edge across the cut trims the start of the sound by the visible amount", () => {
    const trimmed = applyAudioTimelineChange(clip, { start: 6000, end: 17000 }, cut);
    expect(trimmed.sourceStartMs).toBe(4000);
    expect(audioTimelineSpan(trimmed, cut)).toEqual({ start: 6000, end: 17000 });
    expect(audioFileOffsetSeconds(trimmed, 6000, cut)).toBe(4);
  });

  it("splitting at a timeline moment past the cut continues the sound in the second piece", () => {
    const [first, second] = splitAudioRegion(clip, 9000, cut, "audio-2") ?? [];
    expect(audioTimelineSpan(first, cut)).toEqual({ start: 2000, end: 9000 });
    expect(audioTimelineSpan(second, cut)).toEqual({ start: 9000, end: 17000 });
    expect(second.sourceStartMs).toBe(7000);
    expect(splitAudioRegion(clip, 2050, cut, "audio-3")).toBeNull();
  });
});

describe("audio clip trimming", () => {
  it("dragging the left edge cuts the start of the sound, not its end", () => {
    const trimmed = applyAudioTimelineChange(clip, { start: 5000, end: 17000 }, noCuts);
    expect(trimmed).toMatchObject({ startMs: 5000, endMs: 17000, sourceStartMs: 3000 });
    expect(audioFileOffsetSeconds(trimmed, 5000, noCuts)).toBe(3);
    expect(audioFileOffsetSeconds(trimmed, 16999, noCuts)).toBeCloseTo(14.999);
  });

  it("dragging the left edge back restores the trimmed start but never goes before the file start", () => {
    const trimmed = applyAudioTimelineChange(clip, { start: 5000, end: 17000 }, noCuts);
    expect(applyAudioTimelineChange(trimmed, { start: 4000, end: 17000 }, noCuts)).toMatchObject({ startMs: 4000, sourceStartMs: 2000 });
    expect(applyAudioTimelineChange(trimmed, { start: 0, end: 17000 }, noCuts)).toMatchObject({ startMs: 2000, sourceStartMs: 0 });
  });

  it("moving the clip or dragging its right edge keeps the file offset", () => {
    const trimmed = applyAudioTimelineChange(clip, { start: 5000, end: 17000 }, noCuts);
    expect(applyAudioTimelineChange(trimmed, { start: 1000, end: 13000 }, noCuts)).toMatchObject({ startMs: 1000, endMs: 13000, sourceStartMs: 3000 });
    expect(applyAudioTimelineChange(trimmed, { start: 5000, end: 9000 }, noCuts)).toMatchObject({ startMs: 5000, endMs: 9000, sourceStartMs: 3000 });
  });

  it("the right edge cannot extend past the end of the file", () => {
    const trimmed = applyAudioTimelineChange(clip, { start: 5000, end: 17000 }, noCuts);
    expect(applyAudioTimelineChange(trimmed, { start: 5000, end: 30000 }, noCuts).endMs).toBe(17000);
  });

  it("a clip running past the video's end keeps its length when its left edge is trimmed", () => {
    const short = createCutMap([], 10000);
    const long: AudioRegion = { ...clip, startMs: 2000, endMs: 14000, sourceDurationMs: 12000 };
    // The timeline shows it clipped at 10 s; trimming the left edge must not cut the hidden part.
    expect(applyAudioTimelineChange(long, { start: 3000, end: 10000 }, short)).toMatchObject({ startMs: 3000, endMs: 14000, sourceStartMs: 1000 });
  });

  it("clips from older projects without an offset start at the file beginning", () => {
    const legacy: AudioRegion = { id: "audio-2", startMs: 1000, endMs: 4000, audioPath: "/tmp/a.mp3", volume: 1 };
    expect(audioFileOffsetSeconds(legacy, 1500, noCuts)).toBe(0.5);
    expect(applyAudioTimelineChange(legacy, { start: 2500, end: 4000 }, noCuts)).toMatchObject({ sourceStartMs: 1500 });
  });

  it("a left-edge trim always keeps the same sound under the same timeline moment", () => {
    const cut = createCutMap([{ id: "trim-1", startMs: 6000, endMs: 9000 }], 60000);
    fc.assert(fc.property(fc.integer({ min: 0, max: 14000 }), fc.integer({ min: 0, max: 14000 }), (first, second) => {
      const shown = audioTimelineSpan(clip, cut);
      const a = applyAudioTimelineChange(clip, { start: shown.start + first, end: shown.end }, cut);
      const b = applyAudioTimelineChange(a, { start: shown.start + second, end: shown.end }, cut);
      // Whatever the edits, the file second heard at the clip's end is unchanged, and the offset stays in the file.
      expect(audioFileOffsetSeconds(b, audioTimelineSpan(b, cut).end, cut)).toBeCloseTo(audioFileOffsetSeconds(clip, shown.end, cut));
      expect(b.sourceStartMs ?? 0).toBeGreaterThanOrEqual(0);
      expect(b.sourceStartMs ?? 0).toBeLessThan(clip.sourceDurationMs ?? Number.POSITIVE_INFINITY);
    }));
  });
});

describe("audio tracks", () => {
  const at = (id: string, startMs: number, endMs: number, track?: number): AudioRegion => ({ id, startMs, endMs, audioPath: "/a.mp3", volume: 1, ...(track ? { track } : {}) });

  it("puts a new clip on the first track that is free where it lands", () => {
    const regions = [at("a", 0, 5000), at("b", 2000, 6000, 1)];
    expect(firstFreeAudioTrack(regions, { start: 6000, end: 8000 }, noCuts)).toBe(0);
    expect(firstFreeAudioTrack(regions, { start: 1000, end: 3000 }, noCuts)).toBe(2);
    expect(firstFreeAudioTrack(regions, { start: 5500, end: 7000 }, noCuts)).toBe(0);
  });

  it("ignores the clip itself when checking where it can go", () => {
    expect(firstFreeAudioTrack([at("a", 0, 5000)], { start: 1000, end: 2000 }, noCuts, "a")).toBe(0);
  });

  it("maps timeline rows to tracks and back", () => {
    expect(trackOfAudioRow(audioRowId(1))).toBe(1);
    expect(trackOfAudioRow("row-zoom")).toBeUndefined();
    expect(trackOfAudioRow(undefined)).toBeUndefined();
    expect(trackOfAudioRow(audioRowId(99))).toBe(MAX_AUDIO_TRACKS - 1);
  });
});
