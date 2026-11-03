/*
 * Voiceovers generated for a project. Each one is kept with the project as soon as it is made, so
 * closing the voiceover panel (or the app) never loses a paid generation that was not yet added
 * to the timeline. The audio files themselves stay in the app's voiceovers folder.
 */

export interface VoiceoverTake {
  id: string;
  /** The generated audio file. */
  path: string;
  durationMs: number;
  /** The script that was read. */
  text: string;
  /** Who read it, e.g. "ElevenLabs · Rachel". */
  voice: string;
  createdAt: number;
}

/** Most takes kept per project; the oldest go first. */
export const MAX_VOICEOVER_TAKES = 40;

/** `takes` with `take` first, without an older copy of the same file, and at most the limit. */
export function addVoiceoverTake(takes: VoiceoverTake[], take: VoiceoverTake): VoiceoverTake[] {
  return [take, ...takes.filter((item) => item.id !== take.id && item.path !== take.path)].slice(0, MAX_VOICEOVER_TAKES);
}

/** Takes read from a saved project; anything malformed is dropped. */
export function normalizeVoiceoverTakes(value: unknown): VoiceoverTake[] {
  if (!Array.isArray(value)) return [];
  const takes = value.flatMap((item): VoiceoverTake[] => {
    const take = (item ?? {}) as Partial<VoiceoverTake>;
    if (typeof take.id !== "string" || typeof take.path !== "string" || !take.path) return [];
    if (typeof take.durationMs !== "number" || !Number.isFinite(take.durationMs) || take.durationMs <= 0) return [];
    return [{
      id: take.id,
      path: take.path,
      durationMs: Math.round(take.durationMs),
      text: typeof take.text === "string" ? take.text : "",
      voice: typeof take.voice === "string" ? take.voice : "",
      createdAt: typeof take.createdAt === "number" && Number.isFinite(take.createdAt) ? take.createdAt : 0,
    }];
  });
  return takes.slice(0, MAX_VOICEOVER_TAKES);
}
