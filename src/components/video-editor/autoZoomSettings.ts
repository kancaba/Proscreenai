import type { AutoZoomDensity, AutoZoomMode } from "./autoZoom";
import { DEFAULT_ZOOM_DEPTH, type ZoomDepth } from "./types";

/** How new recordings get their automatic zooms; a per-user preference, not project data. */
export interface AutoZoomSettings {
  mode: AutoZoomMode;
  density: AutoZoomDensity;
  depth: ZoomDepth;
}

export const DEFAULT_AUTO_ZOOM_SETTINGS: AutoZoomSettings = {
  mode: "clicks",
  density: "normal",
  depth: DEFAULT_ZOOM_DEPTH,
};

const STORAGE_KEY = "screenmovie.autoZoom";
const MODES: AutoZoomMode[] = ["off", "clicks", "clicksAndPauses"];
const DENSITIES: AutoZoomDensity[] = ["low", "normal", "high"];
const DEPTHS: ZoomDepth[] = [1, 2, 3, 4, 5, 6];

export function normalizeAutoZoomSettings(value: unknown): AutoZoomSettings {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<Record<keyof AutoZoomSettings, unknown>>;
  return {
    mode: MODES.includes(raw.mode as AutoZoomMode) ? (raw.mode as AutoZoomMode) : DEFAULT_AUTO_ZOOM_SETTINGS.mode,
    density: DENSITIES.includes(raw.density as AutoZoomDensity)
      ? (raw.density as AutoZoomDensity)
      : DEFAULT_AUTO_ZOOM_SETTINGS.density,
    depth: DEPTHS.includes(raw.depth as ZoomDepth) ? (raw.depth as ZoomDepth) : DEFAULT_AUTO_ZOOM_SETTINGS.depth,
  };
}

export function loadAutoZoomSettings(): AutoZoomSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return normalizeAutoZoomSettings(stored ? JSON.parse(stored) : null);
  } catch {
    return DEFAULT_AUTO_ZOOM_SETTINGS;
  }
}

export function saveAutoZoomSettings(settings: AutoZoomSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // A preference only; the defaults still work without storage.
  }
}
