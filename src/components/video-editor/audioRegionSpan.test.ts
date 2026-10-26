import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyAudioSpanChange, audioFileOffsetSeconds } from "./audioRegionSpan";
import type { AudioRegion } from "./types";

const clip: AudioRegion = { id: "audio-1", startMs: 2000, endMs: 17000, audioPath: "/tmp/voice.mp3", volume: 1, sourceDurationMs: 15000 };

describe("audio clip trimming", () => {
  it("dragging the left edge cuts the start of the sound, not its end", () => {
    const trimmed = applyAudioSpanChange(clip, { start: 5000, end: 17000 });
    expect(trimmed).toMatchObject({ startMs: 5000, endMs: 17000, sourceStartMs: 3000 });
    // At the new clip start the file plays from 3 s in, and the clip still ends with the file's last second.
    expect(audioFileOffsetSeconds(trimmed, 5000)).toBe(3);
    expect(audioFileOffsetSeconds(trimmed, 16999)).toBeCloseTo(14.999);
  });

  it("dragging the left edge back restores the trimmed start but never goes before the file start", () => {
    const trimmed = applyAudioSpanChange(clip, { start: 5000, end: 17000 });
    expect(applyAudioSpanChange(trimmed, { start: 4000, end: 17000 })).toMatchObject({ startMs: 4000, sourceStartMs: 2000 });
    expect(applyAudioSpanChange(trimmed, { start: 0, end: 17000 })).toMatchObject({ startMs: 2000, sourceStartMs: 0 });
  });

  it("moving the clip or dragging its right edge keeps the file offset", () => {
    const trimmed = applyAudioSpanChange(clip, { start: 5000, end: 17000 });
    expect(applyAudioSpanChange(trimmed, { start: 1000, end: 13000 })).toMatchObject({ startMs: 1000, endMs: 13000, sourceStartMs: 3000 });
    expect(applyAudioSpanChange(trimmed, { start: 5000, end: 9000 })).toMatchObject({ startMs: 5000, endMs: 9000, sourceStartMs: 3000 });
  });

  it("the right edge cannot extend past the end of the file", () => {
    const trimmed = applyAudioSpanChange(clip, { start: 5000, end: 17000 });
    expect(applyAudioSpanChange(trimmed, { start: 5000, end: 30000 }).endMs).toBe(17000);
  });

  it("clips from older projects without an offset start at the file beginning", () => {
    const legacy: AudioRegion = { id: "audio-2", startMs: 1000, endMs: 4000, audioPath: "/tmp/a.mp3", volume: 1 };
    expect(audioFileOffsetSeconds(legacy, 1500)).toBe(0.5);
    expect(applyAudioSpanChange(legacy, { start: 2500, end: 4000 })).toMatchObject({ sourceStartMs: 1500 });
  });

  it("a left-edge trim always keeps the same sound under the same timeline moment", () => {
    fc.assert(fc.property(fc.integer({ min: 0, max: 14000 }), fc.integer({ min: 0, max: 14000 }), (first, second) => {
      const a = applyAudioSpanChange(clip, { start: clip.startMs + first, end: clip.endMs });
      const b = applyAudioSpanChange(a, { start: clip.startMs + second, end: clip.endMs });
      // Whatever the edits, the file second heard at the clip's end is unchanged, and the offset stays in the file.
      expect(audioFileOffsetSeconds(b, b.endMs)).toBeCloseTo(audioFileOffsetSeconds(clip, clip.endMs));
      expect(b.sourceStartMs ?? 0).toBeGreaterThanOrEqual(0);
      expect(b.sourceStartMs ?? 0).toBeLessThan(clip.sourceDurationMs ?? Number.POSITIVE_INFINITY);
    }));
  });
});
