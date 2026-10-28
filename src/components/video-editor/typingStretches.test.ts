import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { findTypingStretches, isStretchCut } from "./typingStretches";

/** Key presses every `everyMs` from `fromMs` to `toMs`. */
const typing = (fromMs: number, toMs: number, everyMs = 150) => Array.from({ length: Math.floor((toMs - fromMs) / everyMs) + 1 }, (_, i) => fromMs + i * everyMs);

describe("typing stretches", () => {
  it("finds a typing stretch and keeps a little room around it", () => {
    expect(findTypingStretches(typing(3000, 7000))).toEqual([{ startMs: 2850, endMs: 7300, keys: 27 }]);
  });

  it("ignores shortcuts and short bursts", () => {
    expect(findTypingStretches([1000, 1100, 5000, 9000, 9050])).toEqual([]);
    expect(findTypingStretches(typing(1000, 1600))).toEqual([]);
    expect(findTypingStretches([1000, 1050, 1100, 1150, 1200, 1250])).toEqual([]);
  });

  it("finds a short word typed in a recording", () => {
    // Real key times from a recording: a click-and-type into a field, "amerikan", and a later fix.
    const keys = [5172, 5413, 5673, 5781, 11560, 11656, 11789, 11892, 12040, 12179, 12268, 12454, 12658, 13291, 13386, 13535, 22432, 22694, 22882, 23102, 23959, 24395];
    expect(findTypingStretches(keys).map((s) => [s.startMs, s.endMs, s.keys])).toEqual([[11410, 13935, 12], [22282, 24795, 6]]);
  });

  it("splits typing at long pauses and joins short ones", () => {
    const pauseOf3s = [...typing(0, 3000), ...typing(6000, 9000)];
    expect(findTypingStretches(pauseOf3s).map((s) => [s.startMs, s.endMs])).toEqual([[0, 3400], [5850, 9400]]);
    const pauseOf1s = [...typing(0, 3000), ...typing(4000, 7000)];
    expect(findTypingStretches(pauseOf1s)).toHaveLength(1);
  });

  it("stays inside the video", () => {
    expect(findTypingStretches(typing(1000, 5900), 6000)[0].endMs).toBe(6000);
  });

  it("knows when cuts already remove a stretch", () => {
    expect(isStretchCut({ startMs: 2000, endMs: 4000 }, [{ startMs: 1500, endMs: 4500 }])).toBe(true);
    expect(isStretchCut({ startMs: 2000, endMs: 4000 }, [{ startMs: 2500, endMs: 4500 }])).toBe(false);
  });

  it("returns ordered, separate stretches that cover every press they count", () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: 0, max: 60000 }), { maxLength: 300 }), (times) => {
      const stretches = findTypingStretches(times);
      for (let i = 1; i < stretches.length; i++) expect(stretches[i].startMs).toBeGreaterThan(stretches[i - 1].endMs);
      const counted = stretches.reduce((sum, s) => sum + s.keys, 0);
      const inside = times.filter((t) => stretches.some((s) => t >= s.startMs && t <= s.endMs)).length;
      expect(inside).toBeGreaterThanOrEqual(counted);
    }));
  });
});
