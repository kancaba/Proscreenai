/** A stretch of the recording where the user was typing (source time, ms). */
export interface TypingStretch {
  startMs: number;
  endMs: number;
  /** How many key presses it holds. */
  keys: number;
}

export interface TypingOptions {
  /** Presses closer than this belong to the same stretch. */
  maxGapMs: number;
  /** Shorter bursts (a shortcut, a quick fix) are not typing. */
  minDurationMs: number;
  minKeys: number;
  /** Room kept before the first and after the last press, so the start and the result stay visible. */
  padBeforeMs: number;
  padAfterMs: number;
}

export const DEFAULT_TYPING_OPTIONS: TypingOptions = { maxGapMs: 1500, minDurationMs: 700, minKeys: 5, padBeforeMs: 150, padAfterMs: 400 };

/** Groups key press times (ms, any order) into typing stretches, inside 0…`videoMs` when given. */
export function findTypingStretches(keyTimes: number[], videoMs?: number, options: TypingOptions = DEFAULT_TYPING_OPTIONS): TypingStretch[] {
  const times = keyTimes.filter((time) => Number.isFinite(time) && time >= 0).sort((a, b) => a - b);
  const groups: number[][] = [];
  for (const time of times) {
    const group = groups[groups.length - 1];
    if (group && time - group[group.length - 1] <= options.maxGapMs) group.push(time);
    else groups.push([time]);
  }
  const stretches: TypingStretch[] = [];
  for (const group of groups) {
    const first = group[0];
    const last = group[group.length - 1];
    if (last - first < options.minDurationMs || group.length < options.minKeys) continue;
    const startMs = Math.max(0, Math.round(first - options.padBeforeMs));
    const endMs = Math.round(videoMs !== undefined ? Math.min(videoMs, last + options.padAfterMs) : last + options.padAfterMs);
    const previous = stretches[stretches.length - 1];
    // Padding can make neighbours touch; keep them as one stretch.
    if (previous && startMs <= previous.endMs) {
      previous.endMs = Math.max(previous.endMs, endMs);
      previous.keys += group.length;
    } else if (endMs > startMs) {
      stretches.push({ startMs, endMs, keys: group.length });
    }
  }
  return stretches;
}

/** Whether cuts already remove the whole stretch. */
export function isStretchCut(stretch: { startMs: number; endMs: number }, trims: Array<{ startMs: number; endMs: number }>): boolean {
  return trims.some((trim) => trim.startMs <= stretch.startMs && trim.endMs >= stretch.endMs);
}
