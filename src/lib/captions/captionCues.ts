import type { TimedWord, TimeRange } from "./speechSegmentation";

export interface CaptionCue {
  startMs: number;
  endMs: number;
  text: string;
}

export interface CaptionCueOptions {
  /** Longest caption text; about two lines at subtitle size. */
  maxChars?: number;
  maxDurationMs?: number;
  /** A pause at least this long starts a new caption. */
  pauseMs?: number;
  minDurationMs?: number;
  /** How long a caption may stay after its last word when nothing follows. */
  lingerMs?: number;
  locale?: string;
}

/** Groups recognised words into captions: new caption at a pause, or when one gets too long. */
export function buildCaptionCues(words: TimedWord[], options: CaptionCueOptions = {}): CaptionCue[] {
  const maxChars = options.maxChars ?? 84;
  const maxDurationMs = options.maxDurationMs ?? 6000;
  const pauseMs = options.pauseMs ?? 600;
  const minDurationMs = options.minDurationMs ?? 900;
  const lingerMs = options.lingerMs ?? 300;

  const groups: TimedWord[][] = [];
  for (const word of words) {
    if (!word.text.trim()) continue;
    const group = groups[groups.length - 1];
    const last = group?.[group.length - 1];
    const length = group ? group.reduce((sum, item) => sum + item.text.length + 1, 0) + word.text.length : 0;
    if (!group || word.startMs - last.endMs >= pauseMs || length > maxChars || word.endMs - group[0].startMs > maxDurationMs) {
      groups.push([word]);
    } else {
      group.push(word);
    }
  }

  return groups.map((group, index) => {
    const startMs = group[0].startMs;
    const nextStart = groups[index + 1]?.[0].startMs ?? Number.POSITIVE_INFINITY;
    const spoken = group[group.length - 1].endMs;
    const endMs = Math.min(nextStart, Math.max(spoken + lingerMs, startMs + minDurationMs));
    const text = group.map((word) => word.text).join(" ");
    return {
      startMs,
      endMs: Math.max(spoken, Math.round(endMs)),
      text: text.charAt(0).toLocaleUpperCase(options.locale) + text.slice(1),
    };
  });
}

/** Captions for the parts of the video that are kept: cut ranges are removed from each caption. */
export function captionsOutsideTrims(cues: CaptionCue[], trims: TimeRange[]): CaptionCue[] {
  const sorted = [...trims].sort((a, b) => a.startMs - b.startMs);
  const result: CaptionCue[] = [];
  for (const cue of cues) {
    let pieces: CaptionCue[] = [cue];
    for (const trim of sorted) {
      pieces = pieces.flatMap((piece) => {
        if (trim.endMs <= piece.startMs || trim.startMs >= piece.endMs) return [piece];
        const parts: CaptionCue[] = [];
        if (trim.startMs > piece.startMs) parts.push({ ...piece, endMs: trim.startMs });
        if (trim.endMs < piece.endMs) parts.push({ ...piece, startMs: trim.endMs });
        return parts;
      });
    }
    // A caption cut in two keeps its longer visible part.
    const kept = pieces.filter((piece) => piece.endMs - piece.startMs >= 300);
    if (kept.length > 0) result.push(kept.reduce((a, b) => (b.endMs - b.startMs > a.endMs - a.startMs ? b : a)));
  }
  return result;
}
