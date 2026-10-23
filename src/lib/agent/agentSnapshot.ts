/** What the editor tells an agent run about the project (validated again in the main process). */
export interface AgentProjectSnapshot {
  videoPath: string;
  durationMs: number;
  /** Spoken language for transcripts and the language of the agent's summary. */
  language: "tr" | "en";
  aspectRatio: string;
  trims: Array<{ startMs: number; endMs: number }>;
  zooms: Array<{ startMs: number; endMs: number; depth: number; focus: { cx: number; cy: number } }>;
  speeds: Array<{ startMs: number; endMs: number; speed: number }>;
  /** Speech captions (made from the transcript). */
  captions: Array<{ startMs: number; endMs: number; text: string }>;
  /** Other on-screen texts. */
  texts: Array<{ startMs: number; endMs: number; text: string }>;
}

const MAX_ITEMS = 3000;
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

function spans<T extends { startMs: number; endMs: number }>(value: unknown, extra: (item: Record<string, unknown>) => Omit<T, "startMs" | "endMs"> | null): T[] {
  if (!Array.isArray(value)) return [];
  const result: T[] = [];
  for (const raw of value.slice(0, MAX_ITEMS)) {
    const item = raw as Record<string, unknown>;
    if (!item || !finite(item.startMs) || !finite(item.endMs) || item.endMs <= item.startMs) continue;
    const rest = extra(item);
    if (rest) result.push({ startMs: Math.round(item.startMs), endMs: Math.round(item.endMs), ...rest } as T);
  }
  return result;
}

const text = (item: Record<string, unknown>) => (typeof item.text === "string" && item.text.trim() ? { text: item.text.trim().slice(0, 500) } : null);

/** Checks a snapshot that came over IPC; null when it is unusable. */
export function parseAgentSnapshot(value: unknown): AgentProjectSnapshot | null {
  const raw = value as Record<string, unknown> | null;
  if (!raw || typeof raw.videoPath !== "string" || !raw.videoPath || !finite(raw.durationMs) || raw.durationMs <= 0) return null;
  return {
    videoPath: raw.videoPath,
    durationMs: Math.round(raw.durationMs),
    language: raw.language === "en" ? "en" : "tr",
    aspectRatio: typeof raw.aspectRatio === "string" ? raw.aspectRatio.slice(0, 20) : "16:9",
    trims: spans(raw.trims, () => ({})),
    zooms: spans(raw.zooms, (item) => {
      const focus = item.focus as { cx?: unknown; cy?: unknown } | undefined;
      return finite(item.depth) && focus && finite(focus.cx) && finite(focus.cy) ? { depth: item.depth, focus: { cx: focus.cx, cy: focus.cy } } : null;
    }),
    speeds: spans(raw.speeds, (item) => (finite(item.speed) ? { speed: item.speed } : null)),
    captions: spans(raw.captions, text),
    texts: spans(raw.texts, text),
  };
}
