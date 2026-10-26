/** Optional fade from black at the start of the video and to black at its end (sound fades with it). */
export interface Fades {
  fadeInMs: number;
  fadeOutMs: number;
}

export const NO_FADES: Fades = { fadeInMs: 0, fadeOutMs: 0 };
/** Durations offered in the editor; 0 turns a fade off. */
export const FADE_CHOICES_MS = [0, 500, 1000, 2000] as const;

export function hasFades(fades: Fades): boolean {
  return fades.fadeInMs > 0 || fades.fadeOutMs > 0;
}

/** Fade settings from a saved project, limited to sensible values. */
export function normalizeFades(value: unknown): Fades {
  const raw = (typeof value === "object" && value !== null ? value : {}) as Partial<Record<keyof Fades, unknown>>;
  const clean = (ms: unknown) => (typeof ms === "number" && Number.isFinite(ms) ? Math.round(Math.min(10000, Math.max(0, ms))) : 0);
  return { fadeInMs: clean(raw.fadeInMs), fadeOutMs: clean(raw.fadeOutMs) };
}

/**
 * How far the picture is faded at `timeMs` of a video `totalMs` long: 0 is untouched, 1 is black.
 * The sound uses 1 minus this as its gain. When both fades together are longer than the video,
 * they share it in proportion so they never overlap.
 */
export function fadeAmount(timeMs: number, totalMs: number, fades: Fades): number {
  if (!(totalMs > 0)) return 0;
  let inMs = Math.max(0, fades.fadeInMs);
  let outMs = Math.max(0, fades.fadeOutMs);
  if (inMs + outMs > totalMs) {
    const share = totalMs / (inMs + outMs);
    inMs *= share;
    outMs *= share;
  }
  let amount = 0;
  if (inMs > 0 && timeMs < inMs) amount = 1 - Math.max(0, timeMs) / inMs;
  if (outMs > 0 && timeMs > totalMs - outMs) amount = Math.max(amount, Math.min(1, (timeMs - (totalMs - outMs)) / outMs));
  return amount;
}
