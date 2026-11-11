import { describe, expect, it } from "vitest";
import type { ProposalSet } from "@/lib/agent/proposals";
import { applyProposals, type EditorRegions, mergeTrims, type RegionIds } from "./agentApply";

function ids(): RegionIds {
  let n = 100;
  return { zoom: () => `zoom-${n++}`, trim: () => `trim-${n++}`, speed: () => `speed-${n++}`, annotation: () => `annotation-${n++}`, blur: () => `blur-${n++}`, zIndex: () => n++ };
}

const current: EditorRegions = {
  zooms: [{ id: "zoom-1", startMs: 1000, endMs: 3000, depth: 3, focus: { cx: 0.5, cy: 0.5 } }],
  trims: [{ id: "trim-1", startMs: 9000, endMs: 9500 }],
  speeds: [],
  annotations: [
    { id: "annotation-1", startMs: 0, endMs: 1000, type: "text", content: "old", textContent: "old", position: { x: 10, y: 76 }, size: { width: 80, height: 16 }, style: {} as never, zIndex: 1, generatedBy: "transcript" },
    { id: "annotation-2", startMs: 0, endMs: 1000, type: "text", content: "mine", textContent: "mine", position: { x: 0, y: 0 }, size: { width: 10, height: 10 }, style: {} as never, zIndex: 2 },
  ],
  blurs: [{ id: "blur-1", startMs: 0, endMs: 500, rect: { x: 0, y: 0, width: 0.1, height: 0.1 }, style: "blur", strength: 0.7 }],
};

const set: ProposalSet = {
  replaceZooms: true,
  replaceCaptions: true,
  items: [
    { id: "p1", kind: "zoom", startMs: 2000, endMs: 4000, depth: 2, focus: { cx: 0.2, cy: 0.3 } },
    { id: "p2", kind: "trim", startMs: 9400, endMs: 10000 },
    { id: "p3", kind: "speed", startMs: 12000, endMs: 15000, speed: 2 },
    { id: "p4", kind: "caption", startMs: 0, endMs: 1200, text: "Merhaba." },
    { id: "p5", kind: "text", startMs: 0, endMs: 2500, text: "Giriş", preset: "title" },
  ],
};

describe("applying agent proposals", () => {
  it("applies the chosen proposals, replacing zooms and speech captions", () => {
    const result = applyProposals(current, set, new Set(["p1", "p2", "p3", "p4", "p5"]), ids());
    expect(result.zooms).toEqual([{ id: "zoom-100", startMs: 2000, endMs: 4000, depth: 2, focus: { cx: 0.2, cy: 0.3 } }]);
    expect(result.trims).toEqual([{ id: "trim-1", startMs: 9000, endMs: 10000 }]);
    expect(result.speeds[0]).toMatchObject({ startMs: 12000, speed: 2 });
    const texts = result.annotations.map((a) => [a.textContent, a.generatedBy ?? null]);
    expect(texts).toEqual([["mine", null], ["Merhaba.", "transcript"], ["Giriş", null]]);
    expect(result.annotations[2].style.fontSize).toBe(56);
  });

  it("puts captions at 20 px on the bottom of the frame", () => {
    const caption = applyProposals(current, set, new Set(["p4"]), ids()).annotations.find((a) => a.generatedBy === "transcript");
    expect(caption?.style).toMatchObject({ fontSize: 20, verticalAlign: "bottom" });
    expect((caption?.position.y ?? 0) + (caption?.size.height ?? 0)).toBe(97);
  });

  it("keeps current zooms when no zoom was chosen, and skips colliding additions", () => {
    const keep = applyProposals(current, set, new Set(["p2"]), ids());
    expect(keep.zooms).toEqual(current.zooms);
    expect(keep.annotations).toHaveLength(2);
    const additive = applyProposals(current, { ...set, replaceZooms: false }, new Set(["p1"]), ids());
    expect(additive.zooms).toEqual(current.zooms);
  });

  it("adds chosen blur areas next to the current ones", () => {
    const blur = { id: "b1", kind: "blur" as const, startMs: 1000, endMs: 4000, rect: { x: 0.6, y: 0.1, width: 0.3, height: 0.05 }, style: "pixelate" as const };
    const result = applyProposals(current, { items: [blur], replaceZooms: false, replaceCaptions: false }, new Set(["b1"]), ids());
    expect(result.blurs).toHaveLength(2);
    expect(result.blurs[1]).toMatchObject({ startMs: 1000, endMs: 4000, rect: { x: 0.6, y: 0.1, width: 0.3, height: 0.05 }, style: "pixelate", strength: 0.7 });
    expect(applyProposals(current, { items: [blur], replaceZooms: false, replaceCaptions: false }, new Set(), ids()).blurs).toEqual(current.blurs);
  });

  it("sets the chosen fades and leaves the others as they were", () => {
    const fades: ProposalSet = {
      replaceZooms: false,
      replaceCaptions: false,
      items: [
        { id: "f1", kind: "fade", edge: "out", startMs: 19000, endMs: 20000 },
        { id: "f2", kind: "fade", edge: "in", startMs: 0, endMs: 500 },
      ],
    };
    const withFades = { ...current, fades: { fadeInMs: 2000, fadeOutMs: 0 } };
    expect(applyProposals(withFades, fades, new Set(["f1"]), ids()).fades).toEqual({ fadeInMs: 2000, fadeOutMs: 1000 });
    expect(applyProposals(withFades, fades, new Set(["f1", "f2"]), ids()).fades).toEqual({ fadeInMs: 500, fadeOutMs: 1000 });
    expect(applyProposals(current, fades, new Set(), ids()).fades).toEqual({ fadeInMs: 0, fadeOutMs: 0 });
  });

  it("merges touching cuts", () => {
    expect(mergeTrims([{ id: "a", startMs: 5000, endMs: 6000 }, { id: "b", startMs: 1000, endMs: 2000 }, { id: "c", startMs: 2000, endMs: 2500 }])).toEqual([
      { id: "b", startMs: 1000, endMs: 2500 },
      { id: "a", startMs: 5000, endMs: 6000 },
    ]);
  });
});
