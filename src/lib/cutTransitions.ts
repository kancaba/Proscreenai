/** How long the picture (and, in exports, the sound) dissolves across a cut marked for a crossfade. */
export const CUT_CROSSFADE_MS = 300;

/** Frames this close before a crossfade cut are kept, so the last one can be dissolved over the next scene. */
const CAPTURE_LOOKAHEAD_MS = 500;

type Cut = { startMs: number; endMs: number };

/**
 * Picture crossfade across cuts while exporting. Exported frames arrive in source order with cut
 * parts skipped, so a cut was crossed when a frame lands at or after a cut's start while the
 * previous frame was before it. The last frame before the cut is then laid over the following
 * frames with decreasing strength.
 */
export class CutCrossfadeTracker {
  private lastSourceMs: number | null = null;
  private startedAtMs: number | null = null;

  constructor(private readonly cuts: Cut[], private readonly durationMs = CUT_CROSSFADE_MS) {}

  /**
   * For a frame just rendered at `sourceMs` (source time) and `outputMs` (time in the export):
   * `blend` is how strongly to lay the previous scene over it (0 = not at all) and `capture`
   * whether to keep this frame as the scene a coming cut dissolves from.
   */
  step(sourceMs: number, outputMs: number, frameMs: number): { blend: number; capture: boolean } {
    const previous = this.lastSourceMs;
    if (previous !== null && this.cuts.some((cut) => previous < cut.startMs && sourceMs >= cut.startMs)) {
      this.startedAtMs = outputMs;
    }
    this.lastSourceMs = sourceMs;
    let blend = 0;
    if (this.startedAtMs !== null) {
      blend = Math.max(0, 1 - (outputMs - this.startedAtMs + frameMs) / this.durationMs);
      if (blend === 0) this.startedAtMs = null;
    }
    const capture = this.cuts.some((cut) => sourceMs < cut.startMs && cut.startMs - sourceMs <= CAPTURE_LOOKAHEAD_MS);
    return { blend, capture };
  }
}
