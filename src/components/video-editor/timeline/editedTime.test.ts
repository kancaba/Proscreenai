import { describe, expect, it } from "vitest";
import { clipSegments, createCutMap, cutMarkers, normalizeSplits, spanToOutput, spanToSource, toOutputMs, toSourceMs } from "./editedTime";

// 20 s video with 2–4 s and 10–11 s cut out: 17 s left.
const map = createCutMap([{ id: "b", startMs: 10000, endMs: 11000 }, { id: "a", startMs: 2000, endMs: 4000 }], 20000);

describe("edited timeline", () => {
  it("merges cuts and shortens the video", () => {
    expect(map.outputMs).toBe(17000);
    expect(createCutMap([{ id: "x", startMs: 1000, endMs: 3000 }, { id: "y", startMs: 2500, endMs: 5000 }], 10000).cuts).toEqual([{ id: "x", startMs: 1000, endMs: 5000 }]);
  });

  it("maps moments both ways", () => {
    expect(toOutputMs(map, 1000)).toBe(1000);
    expect(toOutputMs(map, 3000)).toBe(2000); // inside a cut → the cut point
    expect(toOutputMs(map, 5000)).toBe(3000);
    expect(toOutputMs(map, 12000)).toBe(9000);
    expect(toSourceMs(map, 2000)).toBe(4000); // at a cut point playback continues after it
    expect(toSourceMs(map, 2000, "before")).toBe(2000);
    expect(toSourceMs(map, 9000)).toBe(12000);
    for (const out of [0, 500, 1999, 2001, 7000, 8001, 16999]) expect(toOutputMs(map, toSourceMs(map, out))).toBe(out);
  });

  it("maps spans and hides ones that are cut out", () => {
    expect(spanToOutput(map, { start: 1000, end: 5000 })).toEqual({ start: 1000, end: 3000 });
    expect(spanToOutput(map, { start: 2500, end: 3500 })).toBeNull();
    expect(spanToSource(map, { start: 1000, end: 3000 })).toEqual({ start: 1000, end: 5000 });
  });

  it("lists the kept parts, split at split points, and the cut markers", () => {
    const parts = clipSegments(map, [6000]);
    expect(parts.map((p) => [p.startMs, p.endMs, p.outStart, p.outEnd])).toEqual([
      [0, 2000, 0, 2000],
      [4000, 6000, 2000, 4000],
      [6000, 10000, 4000, 8000],
      [11000, 20000, 8000, 17000],
    ]);
    expect(cutMarkers(map).map((m) => [m.outMs, m.cut.id])).toEqual([[2000, "a"], [8000, "b"]]);
  });

  it("cleans split points", () => {
    expect(normalizeSplits([5000.4, 0, 5000, -1, 30000, "x", 1200], 20000)).toEqual([1200, 5000]);
  });
});
