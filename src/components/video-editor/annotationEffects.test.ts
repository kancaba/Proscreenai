import { describe, expect, it } from "vitest";
import {
  getAnnotationAnimationState,
  normalizeAnnotationAnimation,
  parseRichText,
  plainRichText,
  revealRuns,
  snapToCenter,
} from "./annotationEffects";

const span = { startMs: 1000, endMs: 5000 };

describe("text animation", () => {
  it("is at rest without an animation and outside the span", () => {
    expect(getAnnotationAnimationState(span, 3000)).toEqual({ opacity: 1, offsetY: 0, scale: 1, reveal: 1 });
    expect(getAnnotationAnimationState({ ...span, animation: { enter: "fade", exit: "fade", durationMs: 400 } }, 500).opacity).toBe(1);
  });

  it("fades in from the span start and out exactly at its end", () => {
    const region = { ...span, animation: { enter: "fade" as const, exit: "fade" as const, durationMs: 400 } };
    expect(getAnnotationAnimationState(region, 1000).opacity).toBe(0);
    expect(getAnnotationAnimationState(region, 1200).opacity).toBeGreaterThan(0.5);
    expect(getAnnotationAnimationState(region, 3000).opacity).toBe(1);
    expect(getAnnotationAnimationState(region, 4800).opacity).toBeLessThan(1);
    expect(getAnnotationAnimationState(region, 5000).opacity).toBe(0);
  });

  it("slides, pops and types", () => {
    const slide = getAnnotationAnimationState({ ...span, animation: { enter: "slide-up", exit: "none", durationMs: 400 } }, 1100);
    expect(slide.offsetY).toBeGreaterThan(0);
    const pop = getAnnotationAnimationState({ ...span, animation: { enter: "pop", exit: "none", durationMs: 400 } }, 1100);
    expect(pop.scale).toBeLessThan(1);
    const typing = getAnnotationAnimationState({ ...span, animation: { enter: "typewriter", exit: "none", durationMs: 2000 } }, 2000);
    expect(typing.reveal).toBeCloseTo(0.5, 5);
    expect(typing.opacity).toBe(1);
  });

  it("fits both animations into a short span", () => {
    const region = { startMs: 0, endMs: 300, animation: { enter: "fade" as const, exit: "fade" as const, durationMs: 1000 } };
    expect(getAnnotationAnimationState(region, 150).opacity).toBeCloseTo(1, 5);
  });

  it("cleans saved animation data", () => {
    expect(normalizeAnnotationAnimation({ enter: "pop", exit: "explode", durationMs: 99999 })).toEqual({ enter: "pop", exit: "none", durationMs: 2000 });
    expect(normalizeAnnotationAnimation({ enter: "none", exit: "none" })).toBeUndefined();
    expect(normalizeAnnotationAnimation("fade")).toBeUndefined();
  });
});

describe("rich text", () => {
  it("parses bold and highlighted words", () => {
    expect(parseRichText("Merhaba **dünya** ve ==yeni== özellik")).toEqual([
      { text: "Merhaba ", bold: false, highlight: false },
      { text: "dünya", bold: true, highlight: false },
      { text: " ve ", bold: false, highlight: false },
      { text: "yeni", bold: false, highlight: true },
      { text: " özellik", bold: false, highlight: false },
    ]);
  });

  it("keeps unmatched markers as typed", () => {
    expect(plainRichText("2 ** 3 = 8")).toBe("2 ** 3 = 8");
    expect(plainRichText("a == b")).toBe("a == b");
    expect(plainRichText("**kalın ==ikisi== birden**")).toBe("kalın ikisi birden");
  });

  it("reveals characters across runs for the typewriter", () => {
    const runs = parseRichText("ab**cd**ef");
    const { visible, hidden } = revealRuns(runs, 0.5);
    expect(visible.map((run) => run.text).join("")).toBe("abc");
    expect(hidden.map((run) => run.text).join("")).toBe("def");
    expect(revealRuns(runs, 1).hidden).toEqual([]);
  });
});

describe("alignment guides", () => {
  const container = { width: 800, height: 450 };
  const box = { width: 200, height: 100 };
  it("centres a box dropped near the middle and leaves others alone", () => {
    expect(snapToCenter({ x: 305, y: 170 }, box, container)).toEqual({ x: 300, y: 175, snappedX: true, snappedY: true });
    expect(snapToCenter({ x: 100, y: 20 }, box, container)).toEqual({ x: 100, y: 20, snappedX: false, snappedY: false });
  });
});
