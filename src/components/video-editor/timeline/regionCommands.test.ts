import { describe, expect, it } from "vitest";
import { nudgeRegion, placeCopy, splitRegion } from "./regionCommands";

const zoom = { id: "zoom-1", startMs: 1000, endMs: 3000, depth: 3, focus: { cx: 0.2, cy: 0.3 } };

describe("region commands", () => {
  it("splitting an audio clip continues the sound in the second piece", () => {
    const audio = { id: "audio-1", startMs: 1000, endMs: 9000, audioPath: "/tmp/voice.mp3", volume: 1, sourceStartMs: 500 };
    const parts = splitRegion(audio, 4000, "audio-2");
    expect(parts?.[0]).toMatchObject({ startMs: 1000, endMs: 4000, sourceStartMs: 500 });
    expect(parts?.[1]).toMatchObject({ id: "audio-2", startMs: 4000, endMs: 9000, sourceStartMs: 3500 });
  });

  it("splits at the playhead into two adjoining regions with the same settings", () => {
    const parts = splitRegion(zoom, 2000, "zoom-2");
    expect(parts).toEqual([
      { ...zoom, endMs: 2000 },
      { ...zoom, id: "zoom-2", startMs: 2000 },
    ]);
    expect(parts?.[1].focus).not.toBe(zoom.focus);
    expect(splitRegion(zoom, 1050, "x")).toBeNull();
    expect(splitRegion(zoom, 3500, "x")).toBeNull();
  });

  it("pastes a copy at the playhead, shortened to free space on non-overlapping tracks", () => {
    const track = [zoom, { id: "zoom-3", startMs: 5000, endMs: 6000 }];
    expect(placeCopy(zoom, track, 4000, 10000, "zoom-4", false)).toMatchObject({ id: "zoom-4", startMs: 4000, endMs: 5000 });
    expect(placeCopy(zoom, track, 1500, 10000, "zoom-4", false)).toBeNull();
    expect(placeCopy(zoom, track, 9500, 10000, "zoom-4", false)).toMatchObject({ startMs: 9500, endMs: 10000 });
  });

  it("lets text and audio copies overlap", () => {
    expect(placeCopy(zoom, [zoom], 1500, 10000, "a-2", true)).toMatchObject({ startMs: 1500, endMs: 3500 });
  });

  it("nudges inside the video and refuses to overlap a neighbour", () => {
    const track = [zoom, { id: "zoom-3", startMs: 3050, endMs: 4000 }];
    expect(nudgeRegion(zoom, -500, track, 10000, false)).toMatchObject({ startMs: 500, endMs: 2500 });
    expect(nudgeRegion(zoom, 100, track, 10000, false)).toBeNull();
    expect(nudgeRegion(zoom, -5000, track, 10000, false)).toMatchObject({ startMs: 0, endMs: 2000 });
    expect(nudgeRegion({ ...zoom, startMs: 0, endMs: 2000 }, -100, track, 10000, false)).toBeNull();
  });
});
