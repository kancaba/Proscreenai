/**
 * Audio-level speech detection used around the speech recogniser: it splits long audio
 * into short chunks at pauses (the recogniser's timings drift on long input) and snaps
 * phrase boundaries back onto the audio. Pure functions over 16-bit mono PCM.
 */

export interface TimeRange {
  startMs: number;
  endMs: number;
}

export interface TimedWord {
  text: string;
  startMs: number;
  endMs: number;
  confidence?: number;
}

export const FRAME_MS = 20;
const SILENT_DB = -100;

/** RMS level of each frame in dBFS (-100 for digital silence). */
export function frameLevelsDb(samples: Int16Array, sampleRate: number, frameMs = FRAME_MS): Float32Array {
  const frameSize = Math.max(1, Math.round((sampleRate * frameMs) / 1000));
  const count = Math.ceil(samples.length / frameSize);
  const levels = new Float32Array(count);
  for (let frame = 0; frame < count; frame += 1) {
    const start = frame * frameSize;
    const end = Math.min(samples.length, start + frameSize);
    let sum = 0;
    for (let index = start; index < end; index += 1) {
      const value = samples[index] / 32768;
      sum += value * value;
    }
    const rms = Math.sqrt(sum / Math.max(1, end - start));
    levels[frame] = rms > 0 ? Math.max(SILENT_DB, 20 * Math.log10(rms)) : SILENT_DB;
  }
  return levels;
}

export interface SpeechDetectionOptions {
  frameMs?: number;
  /** Shorter quiet stretches are pauses inside speech, not silence. */
  minSilenceMs?: number;
  /** Shorter bursts (clicks, bumps) are not speech. */
  minSpeechMs?: number;
  /** How far above the noise floor speech must be. */
  marginDb?: number;
}

function percentile(levels: Float32Array, fraction: number) {
  const sorted = Float32Array.from(levels).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

/**
 * Speech ranges with a threshold that adapts to the recording: a margin above its noise
 * floor (the quietest tenth of frames), capped well below its loud parts so a recording
 * that is mostly speech still finds its pauses.
 */
export function detectSpeech(levels: Float32Array, options: SpeechDetectionOptions = {}): TimeRange[] {
  const frameMs = options.frameMs ?? FRAME_MS;
  const minSilenceFrames = Math.round((options.minSilenceMs ?? 250) / frameMs);
  const minSpeechFrames = Math.round((options.minSpeechMs ?? 80) / frameMs);
  if (levels.length === 0) return [];

  const floor = percentile(levels, 0.1);
  const loud = percentile(levels, 0.9);
  if (loud <= SILENT_DB + 1) return [];
  const threshold = Math.max(-60, Math.min(floor + (options.marginDb ?? 12), loud - 10));

  const ranges: Array<[number, number]> = [];
  let start = -1;
  for (let frame = 0; frame <= levels.length; frame += 1) {
    const voiced = frame < levels.length && levels[frame] > threshold;
    if (voiced && start < 0) start = frame;
    if (!voiced && start >= 0) {
      ranges.push([start, frame]);
      start = -1;
    }
  }

  // Bridge short pauses, then drop bursts too short to be speech.
  const merged: Array<[number, number]> = [];
  for (const range of ranges) {
    const previous = merged[merged.length - 1];
    if (previous && range[0] - previous[1] < minSilenceFrames) previous[1] = range[1];
    else merged.push([...range]);
  }
  return merged
    .filter(([from, to]) => to - from >= minSpeechFrames)
    .map(([from, to]) => ({ startMs: from * frameMs, endMs: to * frameMs }));
}

/**
 * Groups speech into chunks of at most `maxChunkMs`, cut in the middle of pauses.
 * Stretches without speech are left out; continuous speech longer than the limit is cut hard.
 */
export function planChunks(speech: TimeRange[], totalMs: number, maxChunkMs = 30000, padMs = 200): TimeRange[] {
  const pieces: TimeRange[] = [];
  for (const range of speech) {
    for (let start = range.startMs; start < range.endMs; start += maxChunkMs - 2 * padMs) {
      pieces.push({ startMs: start, endMs: Math.min(range.endMs, start + maxChunkMs - 2 * padMs) });
    }
  }

  const chunks: TimeRange[] = [];
  let group: TimeRange[] = [];
  const flush = (nextStartMs: number) => {
    if (group.length === 0) return;
    const previousEnd = chunks.length > 0 ? chunks[chunks.length - 1].endMs : 0;
    const first = group[0];
    const last = group[group.length - 1];
    chunks.push({
      startMs: Math.max(previousEnd, first.startMs - padMs, (previousEnd + first.startMs) / 2),
      endMs: Math.min(totalMs, last.endMs + padMs, (last.endMs + nextStartMs) / 2),
    });
    group = [];
  };
  for (const piece of pieces) {
    if (group.length > 0 && piece.endMs - group[0].startMs + 2 * padMs > maxChunkMs) flush(piece.startMs);
    group.push(piece);
  }
  flush(totalMs);
  return chunks.map((chunk) => ({ startMs: Math.round(chunk.startMs), endMs: Math.round(chunk.endMs) }));
}

/**
 * The recogniser returns text runs; a run that does not start with a space continues the
 * previous word (Turkish suffixes such as "aktar" + "ıyoruz").
 */
export function joinWordPieces(pieces: TimedWord[]): TimedWord[] {
  const words: TimedWord[] = [];
  let continues = false;
  for (const piece of pieces) {
    const text = piece.text.trim();
    const startsWord = !continues || /^\s/.test(piece.text);
    continues = text.length > 0 && !/\s$/.test(piece.text);
    if (!text) continue;
    const previous = words[words.length - 1];
    if (previous && !startsWord) {
      previous.text += text;
      previous.endMs = Math.max(previous.endMs, piece.endMs);
      if (piece.confidence !== undefined) {
        previous.confidence = Math.min(previous.confidence ?? 1, piece.confidence);
      }
      continue;
    }
    words.push({ ...piece, text });
  }
  return words;
}

/**
 * Moves the first word after a pause to the nearest speech onset, and the last word before
 * a pause to the nearest speech end. The recogniser's word timings are close inside a
 * phrase but can be off by half a second at its edges.
 */
export function snapToSpeech(words: TimedWord[], speech: TimeRange[], startWindowMs = 700, endWindowMs = 500): TimedWord[] {
  const snapped = words.map((word) => ({ ...word }));
  let previousEnd: number | null = null;
  for (const word of snapped) {
    const rawEnd = word.endMs;
    let best: number | null = null;
    for (const range of speech) {
      const onset = range.startMs;
      if (Math.abs(onset - word.startMs) > startWindowMs) continue;
      if (previousEnd !== null && onset - previousEnd <= 100) continue;
      if (best === null || Math.abs(onset - word.startMs) < Math.abs(best - word.startMs)) best = onset;
    }
    if (best !== null && best < word.endMs) word.startMs = best;
    previousEnd = rawEnd;
  }

  for (let index = 0; index < snapped.length; index += 1) {
    const word = snapped[index];
    const next = snapped[index + 1]?.startMs ?? null;
    let best: number | null = null;
    for (const range of speech) {
      const offset = range.endMs;
      if (Math.abs(offset - word.endMs) > endWindowMs || offset <= word.startMs) continue;
      if (next !== null && offset > next) continue;
      if (best === null || Math.abs(offset - word.endMs) < Math.abs(best - word.endMs)) best = offset;
    }
    if (best !== null) word.endMs = best;
  }
  return snapped;
}
