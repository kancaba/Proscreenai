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

  it("shows sped-up parts as long as they play", () => {
    // 20 s video, 4 s–8 s at 4×, 12 s–14 s cut, 14 s–16 s at 2× right after the cut.
    const sped = createCutMap([{ id: "c", startMs: 12000, endMs: 14000 }], 20000, [
      { startMs: 4000, endMs: 8000, speed: 4 },
      { startMs: 14000, endMs: 16000, speed: 2 },
    ]);
    expect(sped.outputMs).toBe(4000 + 1000 + 4000 + 1000 + 4000);
    expect(toOutputMs(sped, 6000)).toBe(4500);
    expect(toOutputMs(sped, 8000)).toBe(5000);
    expect(toOutputMs(sped, 13000)).toBe(9000); // inside the cut → the cut point
    expect(toOutputMs(sped, 15000)).toBe(9500);
    expect(toSourceMs(sped, 4500)).toBe(6000);
    expect(toSourceMs(sped, 9000)).toBe(14000);
    expect(toSourceMs(sped, 9000, "before")).toBe(12000);
    for (const out of [0, 3999, 4250, 5000, 8999, 9001, 10500, 13999]) expect(toOutputMs(sped, toSourceMs(sped, out))).toBeCloseTo(out, 6);
    expect(clipSegments(sped, []).map((p) => [p.startMs, p.endMs, p.outStart, p.outEnd])).toEqual([
      [0, 12000, 0, 9000],
      [14000, 20000, 9000, 14000],
    ]);
    expect(spanToOutput(sped, { start: 4000, end: 8000 })).toEqual({ start: 4000, end: 5000 });
  });

  it("is unchanged by 1× speeds", () => {
    expect(createCutMap(map.cuts, 20000, [{ startMs: 0, endMs: 9000, speed: 1 }])).toEqual(map);
  });

  it("cleans split points", () => {
    expect(normalizeSplits([5000.4, 0, 5000, -1, 30000, "x", 1200], 20000)).toEqual([1200, 5000]);
  });
});
