import { describe, expect, it } from "vitest";
import { groupMoveDelta, moveRegionGroup, nudgeRegion, placeCopy, splitRegion } from "./regionCommands";

const zoom = { id: "zoom-1", startMs: 1000, endMs: 3000, depth: 3, focus: { cx: 0.2, cy: 0.3 } };

describe("region commands", () => {
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

describe("moving several regions together", () => {
  const a = { id: "a", startMs: 1000, endMs: 2000 };
  const b = { id: "b", startMs: 5000, endMs: 6000 };
  const c = { id: "c", startMs: 8000, endMs: 9000 };

  it("keeps the whole group inside the video", () => {
    const group = [{ region: a, totalMs: 10000 }, { region: b, totalMs: 10000 }];
    expect(groupMoveDelta(group, 500)).toBe(500);
    // b can go 4000 ms further, a only 1000 ms back.
    expect(groupMoveDelta(group, 9000)).toBe(4000);
    expect(groupMoveDelta(group, -3000)).toBe(-1000);
    expect(groupMoveDelta([], 500)).toBe(0);
  });

  it("moves the chosen regions and refuses to land on others where overlap is not allowed", () => {
    expect(moveRegionGroup([a, b, c], new Set(["a", "b"]), 1000, false)).toEqual([
      { id: "a", startMs: 2000, endMs: 3000 },
      { id: "b", startMs: 6000, endMs: 7000 },
      c,
    ]);
    // b would land on c.
    expect(moveRegionGroup([a, b, c], new Set(["a", "b"]), 2500, false)).toBeNull();
    // Texts, sounds and blurs may stack.
    expect(moveRegionGroup([a, b, c], new Set(["a", "b"]), 2500, true)?.[1]).toEqual({ id: "b", startMs: 7500, endMs: 8500 });
    // Moving past each other inside the group is fine: they all move by the same amount.
    expect(moveRegionGroup([a, b], new Set(["a", "b"]), 4000, false)).not.toBeNull();
  });
});

