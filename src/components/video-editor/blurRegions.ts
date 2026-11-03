/*
 * Blurred areas of the recording (an ID number, a name, a password on screen). An area is placed
 * on the recorded frame itself, so it stays on what it hides when the edit zooms, pans or crops.
 */

/** A rectangle on the recorded frame, as fractions (0–1) of its width and height. */
export interface BlurRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BlurStyle = "blur" | "pixelate";

export interface BlurRegion {
  id: string;
  startMs: number;
  endMs: number;
  rect: BlurRect;
  style: BlurStyle;
  /** 0 (light) to 1 (fully unreadable). */
  strength: number;
}

/** Smallest area side, as a fraction of the frame. */
export const MIN_BLUR_SIZE = 0.01;
export const DEFAULT_BLUR_STRENGTH = 0.7;
export const DEFAULT_BLUR_RECT: BlurRect = { x: 0.4, y: 0.42, width: 0.2, height: 0.08 };
/** New blurs last until the area on screen usually changes. */
export const DEFAULT_BLUR_SPAN_MS = 4000;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** The rectangle kept on the frame and at least the smallest size. */
export function clampBlurRect(rect: BlurRect): BlurRect {
  const width = Math.min(1, Math.max(MIN_BLUR_SIZE, rect.width));
  const height = Math.min(1, Math.max(MIN_BLUR_SIZE, rect.height));
  return {
    x: Math.min(1 - width, clamp01(rect.x)),
    y: Math.min(1 - height, clamp01(rect.y)),
    width,
    height,
  };
}

export type BlurHandle = "move" | "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** The rectangle after dragging it (`move`) or one of its edges or corners by a fraction of the frame. */
export function dragBlurRect(rect: BlurRect, handle: BlurHandle, dx: number, dy: number): BlurRect {
  if (handle === "move") {
    return {
      ...rect,
      x: Math.min(1 - rect.width, Math.max(0, rect.x + dx)),
      y: Math.min(1 - rect.height, Math.max(0, rect.y + dy)),
    };
  }
  let left = rect.x;
  let top = rect.y;
  let right = rect.x + rect.width;
  let bottom = rect.y + rect.height;
  // Each edge stops at the frame and at the smallest size from the opposite edge.
  if (handle.includes("w")) left = Math.min(right - MIN_BLUR_SIZE, Math.max(0, left + dx));
  if (handle.includes("e")) right = Math.max(left + MIN_BLUR_SIZE, Math.min(1, right + dx));
  if (handle.includes("n")) top = Math.min(bottom - MIN_BLUR_SIZE, Math.max(0, top + dy));
  if (handle.includes("s")) bottom = Math.max(top + MIN_BLUR_SIZE, Math.min(1, bottom + dy));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The rectangle between two points dragged out on the frame; past its edge it stops at the edge. */
export function rectBetween(from: { x: number; y: number }, to: { x: number; y: number }): BlurRect {
  const a = { x: clamp01(from.x), y: clamp01(from.y) };
  const b = { x: clamp01(to.x), y: clamp01(to.y) };
  return clampBlurRect({
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  });
}

/** Areas shown at a moment; `alsoId` (the one being edited) is shown at any time. */
export function activeBlurRegions(regions: BlurRegion[], timeMs: number, alsoId?: string | null): BlurRegion[] {
  return regions.filter((region) => region.id === alsoId || (timeMs >= region.startMs && timeMs < region.endMs));
}

/**
 * How strongly an area is blurred or pixelated, in screen pixels, from its short side as drawn.
 * Tied to the drawn size so the area looks the same zoomed in, zoomed out and in the export.
 */
export function blurAmountPx(style: BlurStyle, strength: number, shortSidePx: number): number {
  const level = clamp01(strength);
  if (style === "pixelate") return Math.max(4, shortSidePx * (0.12 + 0.38 * level));
  return Math.max(2, shortSidePx * (0.08 + 0.32 * level));
}

/** Blurs read from a saved project; anything malformed is dropped. */
export function normalizeBlurRegions(value: unknown): BlurRegion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): BlurRegion[] => {
    const region = (item ?? {}) as Partial<BlurRegion>;
    const rect = (region.rect ?? {}) as Partial<BlurRect>;
    const numbers = [region.startMs, region.endMs, rect.x, rect.y, rect.width, rect.height];
    if (typeof region.id !== "string" || !numbers.every((n) => typeof n === "number" && Number.isFinite(n))) return [];
    const startMs = Math.max(0, Math.round(region.startMs as number));
    const endMs = Math.round(region.endMs as number);
    if (endMs <= startMs) return [];
    return [{
      id: region.id,
      startMs,
      endMs,
      rect: clampBlurRect(rect as BlurRect),
      style: region.style === "pixelate" ? "pixelate" : "blur",
      strength: typeof region.strength === "number" && Number.isFinite(region.strength) ? clamp01(region.strength) : DEFAULT_BLUR_STRENGTH,
    }];
  });
}
