/**
 * Time added after the video's end: the last frame stays on screen (or only the background
 * shows) so captions and added sound can run on past the recording.
 */
export interface EndingHold {
  durationMs: number;
  /** "freeze" keeps the last frame; "background" shows the background without the video. */
  mode: "freeze" | "background";
}

export const NO_ENDING: EndingHold = { durationMs: 0, mode: "freeze" };
/** Lengths offered in the editor; 0 turns the extension off. */
export const ENDING_CHOICES_MS = [0, 2000, 3000, 5000, 10000] as const;
export const MAX_ENDING_MS = 60000;

/** The extension from a saved project, limited to sensible values. */
export function normalizeEnding(value: unknown): EndingHold {
  const raw = (typeof value === "object" && value !== null ? value : {}) as Partial<Record<keyof EndingHold, unknown>>;
  const durationMs = typeof raw.durationMs === "number" && Number.isFinite(raw.durationMs) ? Math.round(Math.min(MAX_ENDING_MS, Math.max(0, raw.durationMs))) : 0;
  return { durationMs, mode: raw.mode === "background" ? "background" : "freeze" };
}
