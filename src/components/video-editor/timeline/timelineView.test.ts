import { describe, expect, it } from "vitest";
import { followPlayhead, rangeForZoomLevel, zoomLevelForRange } from "./timelineView";

describe("timeline zoom slider", () => {
  it("goes from the whole video to the closest zoom, centred on the playhead", () => {
    expect(rangeForZoomLevel(0, 60000, 300, 30000)).toEqual({ start: 0, end: 60000 });
    const close = rangeForZoomLevel(1, 60000, 300, 30000);
    expect(close.end - close.start).toBeCloseTo(300, 6);
    expect((close.start + close.end) / 2).toBeCloseTo(30000, 6);
    const edge = rangeForZoomLevel(0.5, 60000, 300, 59900);
    expect(edge.end).toBeCloseTo(60000, 6);
  });

  it("maps a range back to the same slider position", () => {
    for (const level of [0, 0.25, 0.5, 0.9, 1]) {
      expect(zoomLevelForRange(rangeForZoomLevel(level, 60000, 300, 10000), 60000, 300)).toBeCloseTo(level, 6);
    }
  });
});

describe("follow playhead", () => {
  const view = { start: 10000, end: 20000 };
  it("leaves the view alone while the playhead is visible", () => {
    expect(followPlayhead(view, 15000, 60000)).toBeNull();
    expect(followPlayhead({ start: 0, end: 60000 }, 59000, 60000)).toBeNull();
  });

  it("pages forward and back when the playhead leaves the view", () => {
    expect(followPlayhead(view, 20500, 60000)).toEqual({ start: 19500, end: 29500 });
    expect(followPlayhead(view, 2000, 60000)).toEqual({ start: 1000, end: 11000 });
    expect(followPlayhead(view, 59990, 60000)).toEqual({ start: 50000, end: 60000 });
  });
});
