import { describe, expect, it } from "vitest";
import {
  activeBlurRegions,
  blurAmountPx,
  type BlurRegion,
  clampBlurRect,
  dragBlurRect,
  MIN_BLUR_SIZE,
  normalizeBlurRegions,
  rectBetween,
} from "./blurRegions";
import { normalizeProjectEditor } from "./projectPersistence";

const area = (id: string, startMs: number, endMs: number): BlurRegion => ({
  id,
  startMs,
  endMs,
  rect: { x: 0.5, y: 0.6, width: 0.2, height: 0.1 },
  style: "blur",
  strength: 0.7,
});

describe("blur area on the frame", () => {
  it("stays on the frame and keeps a usable size", () => {
    expect(clampBlurRect({ x: 0.95, y: -0.2, width: 0.3, height: 0 })).toEqual({ x: 0.7, y: 0, width: 0.3, height: MIN_BLUR_SIZE });
  });

  it("moves without leaving the frame and resizes from an edge or corner", () => {
    const rect = { x: 0.5, y: 0.6, width: 0.2, height: 0.1 };
    expect(dragBlurRect(rect, "move", 0.5, -0.1)).toEqual({ x: 0.8, y: 0.5, width: 0.2, height: 0.1 });
    const grown = dragBlurRect(rect, "se", 0.05, 0.1);
    expect(grown.width).toBeCloseTo(0.25);
    expect(grown.height).toBeCloseTo(0.2);
    // Dragging the left edge past the right one stops at the smallest size.
    const squeezed = dragBlurRect(rect, "w", 0.5, 0);
    expect(squeezed.x + squeezed.width).toBeCloseTo(0.7);
    expect(squeezed.width).toBeCloseTo(MIN_BLUR_SIZE);
  });

  it("is drawn between two points in any direction", () => {
    expect(rectBetween({ x: 0.6, y: 0.4 }, { x: 0.2, y: 0.3 })).toEqual({ x: 0.2, y: 0.3, width: 0.39999999999999997, height: 0.10000000000000003 });
    // Past the frame's edge it stops at the edge.
    const atEdge = rectBetween({ x: 0.9, y: 0.9 }, { x: 1.4, y: 1.2 });
    expect(atEdge.x).toBeCloseTo(0.9);
    expect(atEdge.width).toBeCloseTo(0.1);
  });
});

describe("when and how strongly an area is hidden", () => {
  it("shows areas during their time, and the edited one at any time", () => {
    const regions = [area("blur-1", 1000, 3000), area("blur-2", 2000, 5000)];
    expect(activeBlurRegions(regions, 2500).map((r) => r.id)).toEqual(["blur-1", "blur-2"]);
    expect(activeBlurRegions(regions, 3000).map((r) => r.id)).toEqual(["blur-2"]);
    expect(activeBlurRegions(regions, 500, "blur-2").map((r) => r.id)).toEqual(["blur-2"]);
  });

  it("scales with the area as drawn, so zooming in keeps it just as unreadable", () => {
    expect(blurAmountPx("blur", 0.7, 200)).toBeCloseTo(2 * blurAmountPx("blur", 0.7, 100));
    expect(blurAmountPx("pixelate", 1, 100)).toBeGreaterThan(blurAmountPx("pixelate", 0, 100));
    expect(blurAmountPx("pixelate", 0, 1)).toBe(4);
  });
});

describe("saved projects", () => {
  it("keeps valid blur areas and drops broken ones", () => {
    const saved = [area("blur-1", 1000, 3000), { id: "blur-2", startMs: 5, endMs: 2 }, { ...area("blur-3", 0, 900), style: "x", strength: 4 }];
    expect(normalizeBlurRegions(saved)).toEqual([area("blur-1", 1000, 3000), { ...area("blur-3", 0, 900), style: "blur", strength: 1 }]);
  });

  it("loads them with the project, and older projects have none", () => {
    expect(normalizeProjectEditor({ blurRegions: [area("blur-1", 1000, 3000)] }).blurRegions).toEqual([area("blur-1", 1000, 3000)]);
    expect(normalizeProjectEditor({}).blurRegions).toBeUndefined();
  });
});
