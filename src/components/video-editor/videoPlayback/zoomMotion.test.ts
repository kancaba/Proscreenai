import { describe, expect, it } from "vitest";
import { computeRegionStrength, findDominantRegion } from "./zoomRegionUtils";
import { computeCameraBlur, computeZoomTransform } from "./zoomTransform";

const stageSize = { width: 1920, height: 1080 };
const baseMask = { x: 0, y: 0, width: 1920, height: 1080 };

describe("zoom transition easing", () => {
  const region = { id: "z", startMs: 3000, endMs: 6000, depth: 3 as const, focus: { cx: 0.5, cy: 0.5 } };

  it("starts and ends each transition at rest, without a jump", () => {
    const step = 1000 / 60;
    let previous = 0;
    let maxStep = 0;
    for (let t = 1000; t <= 8000; t += step) {
      const strength = computeRegionStrength(region, t);
      maxStep = Math.max(maxStep, Math.abs(strength - previous));
      previous = strength;
    }
    // A full 0→1 transition spread over ≥1 s never moves more than ~5% per frame.
    expect(maxStep).toBeLessThan(0.05);
  });

  it("is fully zoomed in during the region and out well after it", () => {
    expect(computeRegionStrength(region, 4500)).toBe(1);
    expect(computeRegionStrength(region, 8000)).toBe(0);
  });

  it("starts exactly where the region starts and is over where it ends", () => {
    expect(computeRegionStrength(region, 2999)).toBe(0);
    expect(computeRegionStrength(region, 3000)).toBe(0);
    expect(computeRegionStrength(region, 3100)).toBeGreaterThan(0);
    expect(computeRegionStrength(region, 4000)).toBe(1);
    expect(computeRegionStrength(region, 5000)).toBe(1);
    expect(computeRegionStrength(region, 5500)).toBeLessThan(1);
    expect(computeRegionStrength(region, 6000)).toBeCloseTo(0, 6);
    expect(computeRegionStrength(region, 6001)).toBe(0);
  });

  it("fits both moves inside a short region", () => {
    const short = { ...region, startMs: 1000, endMs: 2000 };
    expect(computeRegionStrength(short, 999)).toBe(0);
    expect(computeRegionStrength(short, 1500)).toBe(1);
    expect(computeRegionStrength(short, 2001)).toBe(0);
  });

  it("pans between connected regions without zooming out in between", () => {
    const first = { ...region, id: "a", startMs: 1000, endMs: 4000 };
    const second = { ...region, id: "b", startMs: 4000, endMs: 7000, focus: { cx: 0.8, cy: 0.8 } };
    for (let t = 3000; t <= 6000; t += 50) {
      const { strength, blendedScale } = findDominantRegion([first, second], t, { connectZooms: true });
      expect(blendedScale ?? (strength >= 0.999 ? 1 : 0)).toBeGreaterThan(0.99);
    }
  });
});

describe("computeCameraBlur", () => {
  it("blurs a zoom radially around the point that stays in place", () => {
    const focus = { cx: 0.25, cy: 0.3 };
    const at = (progress: number) =>
      computeZoomTransform({ stageSize, baseMask, zoomScale: 1.8, zoomProgress: progress, focusX: focus.cx, focusY: focus.cy });
    const blur = computeCameraBlur(at(0.4), at(0.45), 1 / 60, stageSize, 0.35);
    expect(blur.kind).toBe("zoom");
    if (blur.kind !== "zoom") return;

    // The radial centre must be the screen point that does not move between the two frames.
    const prev = at(0.4);
    const next = at(0.45);
    const localBefore = { x: (blur.center.x - prev.x) / prev.scale, y: (blur.center.y - prev.y) / prev.scale };
    const localAfter = { x: (blur.center.x - next.x) / next.scale, y: (blur.center.y - next.y) / next.scale };
    expect(localAfter.x).toBeCloseTo(localBefore.x, 3);
    expect(localAfter.y).toBeCloseTo(localBefore.y, 3);
    expect(blur.strength).toBeGreaterThan(0);
  });

  it("blurs a pan along its direction and leaves a still camera sharp", () => {
    const pan = computeCameraBlur({ scale: 1.8, x: 0, y: 0 }, { scale: 1.8, x: -20, y: 0 }, 1 / 60, stageSize, 0.35);
    expect(pan.kind).toBe("pan");
    if (pan.kind === "pan") {
      expect(pan.blurPx).toBeGreaterThan(1);
      expect(pan.velocity.x).toBeLessThan(0);
    }

    const still = computeCameraBlur({ scale: 1.8, x: -10, y: -5 }, { scale: 1.8, x: -10, y: -5 }, 1 / 60, stageSize, 0.35);
    expect(still.kind).toBe("none");
  });

  it("scales with the motion blur amount and is off at zero", () => {
    const prev = { scale: 1.8, x: 0, y: 0 };
    const next = { scale: 1.8, x: -20, y: 0 };
    const weak = computeCameraBlur(prev, next, 1 / 60, stageSize, 0.2);
    const strong = computeCameraBlur(prev, next, 1 / 60, stageSize, 1);
    expect(weak.kind === "pan" && strong.kind === "pan" && strong.blurPx > weak.blurPx).toBe(true);
    const off = computeCameraBlur(prev, next, 1 / 60, stageSize, 0);
    expect(off.kind === "pan" ? off.blurPx : 0).toBe(0);
  });
});
