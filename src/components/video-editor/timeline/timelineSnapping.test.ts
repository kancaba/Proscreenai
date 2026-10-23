import { describe, expect, it } from "vitest";
import { collectSnapTargets, snapMovedSpan, snapResizedSpan } from "./timelineSnapping";

const spans = [
  { id: "a", start: 1000, end: 3000 },
  { id: "b", start: 5000, end: 6000 },
];

describe("timeline snapping", () => {
  it("collects the playhead, video ends and other items' edges", () => {
    expect(collectSnapTargets(spans, "a", 4200, 10000).sort((x, y) => x - y)).toEqual([0, 4200, 5000, 6000, 10000]);
  });

  it("snaps a moved item by its closest edge and keeps its length", () => {
    const targets = collectSnapTargets(spans, "c", 4200, 10000);
    expect(snapMovedSpan({ start: 3050, end: 4050 }, targets, 100)).toEqual({ span: { start: 3000, end: 4000 }, snapTo: 3000 });
    expect(snapMovedSpan({ start: 3150, end: 4180 }, targets, 100)).toEqual({ span: { start: 3170, end: 4200 }, snapTo: 4200 });
    expect(snapMovedSpan({ start: 7000, end: 8000 }, targets, 100)).toEqual({ span: { start: 7000, end: 8000 }, snapTo: null });
  });

  it("snaps only the dragged edge when resizing", () => {
    const targets = collectSnapTargets(spans, "c", 4200, 10000);
    expect(snapResizedSpan({ start: 3500, end: 4950 }, { start: 3500, end: 4000 }, targets, 100, 100)).toEqual({ span: { start: 3500, end: 5000 }, snapTo: 5000 });
    expect(snapResizedSpan({ start: 2960, end: 4000 }, { start: 3500, end: 4000 }, targets, 100, 100)).toEqual({ span: { start: 3000, end: 4000 }, snapTo: 3000 });
  });

  it("never snaps a resize below the minimum length", () => {
    expect(snapResizedSpan({ start: 3000, end: 3060 }, { start: 3000, end: 3500 }, [3010], 100, 100).snapTo).toBeNull();
  });
});
