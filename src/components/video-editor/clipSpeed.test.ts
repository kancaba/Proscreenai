import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { setPartSpeed, speedOfPart } from "./clipSpeed";
import type { SpeedRegion } from "./types";

const part = { startMs: 2000, endMs: 4000 };
const ids = () => { let n = 10; return () => `speed-${n++}`; };

describe("speed set on a part of the video", () => {
  it("reads 1 for a part without speed changes and the speed of a region over the part", () => {
    expect(speedOfPart(part, [])).toBe(1);
    expect(speedOfPart(part, [{ id: "s", startMs: 2000, endMs: 4000, speed: 2 }])).toBe(2);
    expect(speedOfPart(part, [{ id: "s", startMs: 0, endMs: 6000, speed: 1.5 }])).toBe(1.5);
  });

  it("reads mixed when an older region covers only some of the part", () => {
    expect(speedOfPart(part, [{ id: "s", startMs: 3000, endMs: 5000, speed: 2 }])).toBe("mixed");
    expect(speedOfPart(part, [{ id: "a", startMs: 2000, endMs: 3000, speed: 2 }, { id: "b", startMs: 3000, endMs: 4000, speed: 2 }])).toBe("mixed");
  });

  it("puts one region exactly over the part", () => {
    expect(setPartSpeed([], part, 2, ids())).toEqual([{ id: "speed-10", startMs: 2000, endMs: 4000, speed: 2 }]);
  });

  it("speed 1 removes the speed change from the part only", () => {
    const regions: SpeedRegion[] = [{ id: "s", startMs: 1000, endMs: 5000, speed: 1.5 }];
    expect(setPartSpeed(regions, part, 1, ids())).toEqual([
      { id: "s", startMs: 1000, endMs: 2000, speed: 1.5 },
      { id: "speed-10", startMs: 4000, endMs: 5000, speed: 1.5 },
    ]);
  });

  it("cuts older regions back to outside the part and leaves others alone", () => {
    const regions: SpeedRegion[] = [{ id: "a", startMs: 500, endMs: 2500, speed: 0.5 }, { id: "b", startMs: 3500, endMs: 4500, speed: 2 }, { id: "c", startMs: 5000, endMs: 6000, speed: 1.25 }];
    expect(setPartSpeed(regions, part, 1.75, ids())).toEqual([
      { id: "a", startMs: 500, endMs: 2000, speed: 0.5 },
      { id: "b", startMs: 4000, endMs: 4500, speed: 2 },
      { id: "c", startMs: 5000, endMs: 6000, speed: 1.25 },
      { id: "speed-10", startMs: 2000, endMs: 4000, speed: 1.75 },
    ]);
  });

  it("always leaves the part at the chosen speed with no overlapping regions", () => {
    const region = fc.record({ startMs: fc.integer({ min: 0, max: 7000 }), length: fc.integer({ min: 1, max: 3000 }), speed: fc.constantFrom(0.25, 0.5, 2) });
    fc.assert(fc.property(fc.array(region, { maxLength: 5 }), fc.constantFrom(1, 0.5, 2), (raw, speed) => {
      const regions = raw.map((r, i) => ({ id: `r${i}`, startMs: r.startMs, endMs: r.startMs + r.length, speed: r.speed as SpeedRegion["speed"] }));
      const result = setPartSpeed(regions, part, speed as SpeedRegion["speed"] | 1, ids());
      expect(speedOfPart(part, result)).toBe(speed);
      expect(new Set(result.map((r) => r.id)).size).toBe(result.length);
      for (const r of result) expect(r.endMs).toBeGreaterThan(r.startMs);
    }));
  });
});
