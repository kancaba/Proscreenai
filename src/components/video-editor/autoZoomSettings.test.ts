import { describe, expect, it } from "vitest";
import { DEFAULT_AUTO_ZOOM_SETTINGS, normalizeAutoZoomSettings } from "./autoZoomSettings";

describe("auto zoom settings", () => {
  it("keeps valid values and replaces anything else with defaults", () => {
    expect(normalizeAutoZoomSettings({ mode: "off", density: "high", depth: 5 })).toEqual({
      mode: "off",
      density: "high",
      depth: 5,
    });
    expect(normalizeAutoZoomSettings({ mode: "always", density: 2, depth: 9 })).toEqual(DEFAULT_AUTO_ZOOM_SETTINGS);
    expect(normalizeAutoZoomSettings(null)).toEqual(DEFAULT_AUTO_ZOOM_SETTINGS);
  });
});
