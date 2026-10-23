import { describe, expect, it } from "vitest";
import { changedHistoryKeys, decideHistoryChange, HISTORY_COALESCE_MS } from "./editorHistory";

const base = {
  appearance: { padding: 10, wallpaper: "a", cropRegion: { x: 0, y: 0 } },
  zoomRegions: [],
  trimRegions: [],
  speedRegions: [],
  annotationRegions: [],
  audioRegions: [],
};

describe("changedHistoryKeys", () => {
  it("names each changed appearance setting and region list", () => {
    const next = {
      ...base,
      appearance: { ...base.appearance, padding: 20, cropRegion: { x: 1, y: 0 } },
      zoomRegions: [{ id: "zoom-1" }],
    };
    expect(changedHistoryKeys(base, next)).toEqual(["appearance.padding", "appearance.cropRegion", "zoomRegions"]);
    expect(changedHistoryKeys(base, { ...base })).toEqual([]);
  });
});

describe("decideHistoryChange", () => {
  const none = new Map<string, number>();

  it("folds a slider drag into one undo step", () => {
    const first = decideHistoryChange(["appearance.padding"], 1000, null, none);
    expect(first).toBe("push");
    const during = decideHistoryChange(["appearance.padding"], 1100, { at: 1000, keys: "appearance.padding" }, none);
    expect(during).toBe("merge");
  });

  it("starts a new step for a different setting or after a pause", () => {
    const last = { at: 1000, keys: "appearance.padding" };
    expect(decideHistoryChange(["appearance.borderRadius"], 1100, last, none)).toBe("push");
    expect(decideHistoryChange(["appearance.padding"], 1000 + HISTORY_COALESCE_MS + 1, last, none)).toBe("push");
  });

  it("keeps expected automatic changes out of history, but only those", () => {
    const pending = new Map([["zoomRegions", 2000]]);
    expect(decideHistoryChange(["zoomRegions"], 1500, null, pending)).toBe("absorb");
    // A user edit to something else at the same time is still undoable.
    expect(decideHistoryChange(["zoomRegions", "trimRegions"], 1500, null, pending)).toBe("push");
    // An expectation that was never met expires instead of swallowing a later edit.
    expect(decideHistoryChange(["zoomRegions"], 2500, null, pending)).toBe("push");
  });

  it("ignores changes that do not touch undoable settings", () => {
    expect(decideHistoryChange([], 1000, null, none)).toBe("none");
  });
});
