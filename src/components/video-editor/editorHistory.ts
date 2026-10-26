/** Changes to the same setting closer together than this (a slider drag) form one undo step. */
export const HISTORY_COALESCE_MS = 400;
/** How long an automatic change (e.g. generated zooms) waits to be kept out of undo history. */
export const AUTOMATIC_CHANGE_WINDOW_MS = 1500;

// Undoable editor values compared as a whole (regions, the recording volume and fades).
const REGION_KEYS = ["zoomRegions", "trimRegions", "speedRegions", "annotationRegions", "audioRegions", "sourceAudioVolume", "fades", "clipSplits"] as const;

export type HistoryContent = {
  appearance: object;
} & Record<(typeof REGION_KEYS)[number], unknown>;

/** Names of the undoable settings that differ, e.g. `appearance.padding` or `zoomRegions`. */
export function changedHistoryKeys(previous: HistoryContent, next: HistoryContent): string[] {
  const keys: string[] = [];
  const before = previous.appearance as Record<string, unknown>;
  const after = next.appearance as Record<string, unknown>;
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) keys.push(`appearance.${key}`);
  }
  for (const key of REGION_KEYS) {
    if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) keys.push(key);
  }
  return keys;
}

export type HistoryDecision = "none" | "absorb" | "merge" | "push";

/**
 * Decides how a state change enters undo history:
 * - `absorb`: an expected automatic change, kept out of history;
 * - `merge`: the same setting changing again within a drag, folded into the last step;
 * - `push`: a new undo step.
 */
export function decideHistoryChange(
  changedKeys: string[],
  now: number,
  lastChange: { at: number; keys: string } | null,
  pendingAutomatic: Map<string, number>,
): HistoryDecision {
  if (changedKeys.length === 0) return "none";
  if (changedKeys.every((key) => (pendingAutomatic.get(key) ?? 0) >= now)) return "absorb";
  if (lastChange && now - lastChange.at < HISTORY_COALESCE_MS && lastChange.keys === changedKeys.join("|")) {
    return "merge";
  }
  return "push";
}
