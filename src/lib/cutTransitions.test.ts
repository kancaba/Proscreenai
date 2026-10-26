import { describe, expect, it } from "vitest";
import { createCutMap } from "@/components/video-editor/timeline/editedTime";
import { CUT_CROSSFADE_MS, CutCrossfadeTracker } from "./cutTransitions";

/** Runs 30 fps frames of a video with 2–4 s cut out and returns each frame's step. */
function run(crossfade: boolean) {
  const cuts = createCutMap([{ id: "trim-1", startMs: 2000, endMs: 4000, crossfade }], 10000).cuts.filter((cut) => cut.crossfade);
  const tracker = new CutCrossfadeTracker(cuts);
  const frameMs = 1000 / 30;
  const steps: Array<{ sourceMs: number; outputMs: number; blend: number; capture: boolean }> = [];
  let outputMs = 0;
  for (let sourceMs = 0; sourceMs < 6000; sourceMs += frameMs) {
    if (sourceMs >= 2000 && sourceMs < 4000) continue;
    steps.push({ sourceMs, outputMs, ...tracker.step(sourceMs, outputMs, frameMs) });
    outputMs += frameMs;
  }
  return steps;
}

describe("crossfade across cuts in exports", () => {
  it("keeps the frames just before the cut and dissolves them over the next scene", () => {
    const steps = run(true);
    const firstAfterCut = steps.findIndex((step) => step.sourceMs >= 4000);
    expect(steps[firstAfterCut - 1].capture).toBe(true);
    expect(steps[firstAfterCut].blend).toBeGreaterThan(0.85);
    // The blend fades steadily and ends within the crossfade length.
    const blends = steps.slice(firstAfterCut).map((step) => step.blend);
    for (let i = 1; i < blends.length; i++) expect(blends[i]).toBeLessThanOrEqual(blends[i - 1]);
    const lastBlended = steps.slice(firstAfterCut).filter((step) => step.blend > 0).at(-1)!;
    expect(lastBlended.outputMs - steps[firstAfterCut].outputMs).toBeLessThan(CUT_CROSSFADE_MS);
  });

  it("leaves cuts without a crossfade as a hard cut", () => {
    expect(run(false).every((step) => step.blend === 0 && !step.capture)).toBe(true);
  });

  it("dissolves a merged cut when any of its overlapping cuts asks for it", () => {
    const map = createCutMap([{ id: "a", startMs: 1000, endMs: 3000 }, { id: "b", startMs: 2500, endMs: 4000, crossfade: true }], 10000);
    expect(map.cuts).toEqual([{ id: "a", startMs: 1000, endMs: 4000, crossfade: true }]);
  });
});
