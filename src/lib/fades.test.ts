import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { fadeAmount, hasFades, NO_FADES, normalizeFades } from "./fades";

describe("video fades", () => {
  const fades = { fadeInMs: 1000, fadeOutMs: 2000 };

  it("starts black, clears over the fade-in and is untouched in the middle", () => {
    expect(fadeAmount(0, 10000, fades)).toBe(1);
    expect(fadeAmount(500, 10000, fades)).toBe(0.5);
    expect(fadeAmount(1000, 10000, fades)).toBe(0);
    expect(fadeAmount(5000, 10000, fades)).toBe(0);
  });

  it("darkens over the fade-out and ends black", () => {
    expect(fadeAmount(8000, 10000, fades)).toBe(0);
    expect(fadeAmount(9000, 10000, fades)).toBe(0.5);
    expect(fadeAmount(10000, 10000, fades)).toBe(1);
  });

  it("does nothing when both fades are off", () => {
    expect(hasFades(NO_FADES)).toBe(false);
    expect(fadeAmount(0, 10000, NO_FADES)).toBe(0);
    expect(fadeAmount(10000, 10000, NO_FADES)).toBe(0);
  });

  it("shares a too-short video between the two fades without overlapping", () => {
    // 1 s in + 2 s out on a 1.5 s video: 0.5 s in, 1 s out.
    expect(fadeAmount(250, 1500, fades)).toBe(0.5);
    expect(fadeAmount(500, 1500, fades)).toBe(0);
    expect(fadeAmount(1000, 1500, fades)).toBe(0.5);
  });

  it("always stays between 0 and 1", () => {
    fc.assert(fc.property(fc.integer({ min: -1000, max: 20000 }), fc.integer({ min: 1, max: 20000 }), fc.integer({ min: 0, max: 5000 }), fc.integer({ min: 0, max: 5000 }), (time, total, fadeInMs, fadeOutMs) => {
      const amount = fadeAmount(time, total, { fadeInMs, fadeOutMs });
      expect(amount).toBeGreaterThanOrEqual(0);
      expect(amount).toBeLessThanOrEqual(1);
    }));
  });

  it("reads saved projects safely, including ones without fades", () => {
    expect(normalizeFades(undefined)).toEqual(NO_FADES);
    expect(normalizeFades({ fadeInMs: 1000, fadeOutMs: -5 })).toEqual({ fadeInMs: 1000, fadeOutMs: 0 });
    expect(normalizeFades({ fadeInMs: "1", fadeOutMs: 99999 })).toEqual({ fadeInMs: 0, fadeOutMs: 10000 });
  });
});
