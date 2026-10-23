import { describe, expect, it } from "vitest";
import { DEFAULT_SHORTCUTS, findConflict, mergeWithDefaults } from "./shortcuts";

describe("cut shortcut", () => {
  it("is C by default and does not clash with Cmd/Ctrl + C", () => {
    expect(DEFAULT_SHORTCUTS.addTrim).toEqual({ key: "c" });
    expect(findConflict({ key: "c" }, "addTrim", DEFAULT_SHORTCUTS)).toBeNull();
  });

  it("moves a saved copy of the old T default to C, but keeps a custom key", () => {
    expect(mergeWithDefaults({ addTrim: { key: "t" } }).addTrim).toEqual({ key: "c" });
    expect(mergeWithDefaults({ addTrim: { key: "x" } }).addTrim).toEqual({ key: "x" });
  });
});
