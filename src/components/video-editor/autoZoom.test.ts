import { describe, expect, it } from "vitest";
import { buildAutoZoomSpans, countClicks } from "./autoZoom";
import type { CursorTelemetryPoint } from "./types";

function move(timeMs: number, cx: number, cy: number): CursorTelemetryPoint {
  return { timeMs, cx, cy, interactionType: "move" };
}

function click(timeMs: number, cx: number, cy: number): CursorTelemetryPoint {
  return { timeMs, cx, cy, interactionType: "click" };
}

function withMoves(points: CursorTelemetryPoint[], totalMs: number) {
  const moves = Array.from({ length: Math.floor(totalMs / 100) }, (_, index) => move(index * 100, 0.5, 0.5));
  return [...moves, ...points].sort((a, b) => a.timeMs - b.timeMs);
}

describe("buildAutoZoomSpans", () => {
  it("keeps the camera in while clicks continue in the same area", () => {
    const spans = buildAutoZoomSpans(
      withMoves([click(2000, 0.3, 0.4), click(3500, 0.32, 0.42), click(5000, 0.31, 0.38)], 12000),
      12000,
      3,
    );
    expect(spans).toHaveLength(1);
    expect(spans[0].startMs).toBeLessThan(2000);
    // Stays zoomed past the last click instead of zooming out after each one.
    expect(spans[0].endMs).toBeGreaterThan(6000);
  });

  it("zooms out between bursts of activity", () => {
    const spans = buildAutoZoomSpans(withMoves([click(1000, 0.3, 0.3), click(9000, 0.3, 0.3)], 15000), 15000, 3);
    expect(spans).toHaveLength(2);
    expect(spans[1].startMs - spans[0].endMs).toBeGreaterThan(2000);
  });

  it("starts a new region, back to back, when work moves to another part of the screen", () => {
    const spans = buildAutoZoomSpans(withMoves([click(2000, 0.1, 0.2), click(3500, 0.9, 0.8)], 10000), 10000, 3);
    expect(spans).toHaveLength(2);
    expect(spans[0].focus.cx).toBeLessThan(0.5);
    expect(spans[1].focus.cx).toBeGreaterThan(0.5);
    // No overlap and no gap, so connected zooms pan from one to the other.
    expect(spans[1].startMs).toBe(spans[0].endMs);
  });

  it("keeps regions inside the video and drops unusable leftovers", () => {
    const spans = buildAutoZoomSpans(withMoves([click(100, 0.5, 0.5), click(9900, 0.5, 0.5)], 10000), 10000, 3);
    expect(spans).toHaveLength(1);
    expect(spans[0].startMs).toBe(0);
    for (const span of spans) {
      expect(span.endMs).toBeLessThanOrEqual(10000);
    }
  });

  it("falls back to cursor dwell when no clicks were recorded", () => {
    const samples = [
      ...Array.from({ length: 20 }, (_, index) => move(index * 100, 0.1 + index * 0.03, 0.5)),
      ...Array.from({ length: 10 }, (_, index) => move(2000 + index * 100, 0.7, 0.6)),
      ...Array.from({ length: 20 }, (_, index) => move(3000 + index * 100, 0.7 - index * 0.03, 0.2)),
    ];
    const spans = buildAutoZoomSpans(samples, 6000, 3);
    expect(spans.length).toBeGreaterThan(0);
    expect(spans[0].focus.cx).toBeCloseTo(0.7, 1);
  });

  it("returns nothing without telemetry", () => {
    expect(buildAutoZoomSpans([], 10000, 3)).toEqual([]);
    expect(buildAutoZoomSpans(withMoves([click(1000, 0.5, 0.5)], 5000), 0, 3)).toEqual([]);
  });
  it("makes nothing when automatic zoom is off", () => {
    expect(buildAutoZoomSpans(withMoves([click(2000, 0.3, 0.3)], 8000), 8000, 3, { mode: "off" })).toEqual([]);
  });

  it("density changes how readily nearby clicks share one zoom", () => {
    const samples = withMoves([click(2000, 0.3, 0.3), click(5200, 0.3, 0.3)], 15000);
    expect(buildAutoZoomSpans(samples, 15000, 3, { density: "low" })).toHaveLength(1);
    expect(buildAutoZoomSpans(samples, 15000, 3, { density: "high" })).toHaveLength(2);
  });

  it("adds cursor rests to clicks when pauses are included", () => {
    const rest = Array.from({ length: 15 }, (_, index) => ({ timeMs: 10000 + index * 100, cx: 0.8, cy: 0.7, interactionType: "move" as const }));
    const travel = Array.from({ length: 20 }, (_, index) => ({ timeMs: 8000 + index * 100, cx: 0.2 + index * 0.03, cy: 0.5, interactionType: "move" as const }));
    const samples = [click(1000, 0.2, 0.2), ...travel, ...rest].sort((a, b) => a.timeMs - b.timeMs);
    expect(buildAutoZoomSpans(samples, 15000, 3)).toHaveLength(1);
    const withPauses = buildAutoZoomSpans(samples, 15000, 3, { mode: "clicksAndPauses" });
    expect(withPauses.length).toBe(2);
    expect(withPauses[1].focus.cx).toBeGreaterThan(0.6);
  });

  it("counts clicks of every kind", () => {
    expect(countClicks([click(1, 0, 0), move(2, 0, 0), { timeMs: 3, cx: 0, cy: 0, interactionType: "right-click" }])).toBe(2);
  });
});
