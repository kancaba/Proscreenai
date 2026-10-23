import { detectInteractionCandidates } from "./timeline/zoomSuggestionUtils";
import {
  type CursorTelemetryPoint,
  clampFocusToDepth,
  ZOOM_DEPTH_SCALES,
  type ZoomDepth,
  type ZoomFocus,
} from "./types";

export interface AutoZoomSpan {
  startMs: number;
  endMs: number;
  focus: ZoomFocus;
}

/** What drives automatic zooms: nothing, clicks, or clicks plus places the cursor rests. */
export type AutoZoomMode = "off" | "clicks" | "clicksAndPauses";
/** How readily activity becomes a zoom: fewer, longer zooms or more, shorter ones. */
export type AutoZoomDensity = "low" | "normal" | "high";

export interface AutoZoomOptions {
  mode?: AutoZoomMode;
  density?: AutoZoomDensity;
}

/** Clicks closer together than this keep the camera zoomed in. */
export const AUTO_ZOOM_MERGE_GAP_MS = 2500;

interface DensityTuning {
  mergeGapMs: number;
  holdMs: number;
  reach: number;
}

const DENSITY_TUNING: Record<AutoZoomDensity, DensityTuning> = {
  low: { mergeGapMs: 4000, holdMs: 3000, reach: 0.6 },
  normal: { mergeGapMs: AUTO_ZOOM_MERGE_GAP_MS, holdMs: 2400, reach: 0.45 },
  high: { mergeGapMs: 1500, holdMs: 1800, reach: 0.35 },
};
/**
 * A zoom region starts this long before its first click. The zoom-in begins at the
 * region start (up to 1 s), so the camera is in by the time the click happens.
 */
const LEAD_MS = 900;
const MIN_REGION_MS = 1800;
/** Shorter leftovers (e.g. a click in the last moments of the video) are not worth a zoom. */
const MIN_USABLE_REGION_MS = 1200;
/** A cursor rest this close to a click is the same moment and adds nothing. */
const PAUSE_NEAR_CLICK_MS = 1000;

const CLICK_TYPES = new Set<CursorTelemetryPoint["interactionType"]>(["click", "double-click", "right-click"]);

type ZoomEvent = { timeMs: number; focus: ZoomFocus };

/** Number of clicks in the telemetry (what the post-recording notice reports). */
export function countClicks(samples: CursorTelemetryPoint[]): number {
  return samples.filter((sample) => CLICK_TYPES.has(sample.interactionType)).length;
}

function collectEvents(samples: CursorTelemetryPoint[], includePauses: boolean): ZoomEvent[] {
  const clicks = samples
    .filter((sample) => CLICK_TYPES.has(sample.interactionType))
    .map((sample) => ({ timeMs: sample.timeMs, focus: { cx: sample.cx, cy: sample.cy } }));
  if (clicks.length > 0 && !includePauses) {
    return clicks;
  }

  // Cursor rests; also the fallback when no clicks were recorded (e.g. no input permission).
  const pauses = detectInteractionCandidates(samples)
    .map((candidate) => ({ timeMs: candidate.centerTimeMs, focus: candidate.focus }))
    .filter((pause) => !clicks.some((click) => Math.abs(click.timeMs - pause.timeMs) < PAUSE_NEAR_CLICK_MS));
  return [...clicks, ...pauses];
}

/**
 * Turns cursor telemetry into zoom regions the way a person would edit them: zoom in
 * when the user starts clicking, stay in while they keep working in the same area,
 * and zoom out once activity stops. Work in another part of the screen starts a new
 * region, which connected zooms turn into a pan.
 */
export function buildAutoZoomSpans(
  samples: CursorTelemetryPoint[],
  totalMs: number,
  depth: ZoomDepth,
  options: AutoZoomOptions = {},
): AutoZoomSpan[] {
  const mode = options.mode ?? "clicks";
  if (mode === "off" || totalMs <= 0 || samples.length < 2) {
    return [];
  }

  const tuning = DENSITY_TUNING[options.density ?? "normal"];
  const events = collectEvents(samples, mode === "clicksAndPauses")
    .filter((event) => event.timeMs >= 0 && event.timeMs <= totalMs)
    .sort((a, b) => a.timeMs - b.timeMs);
  const reach = tuning.reach / ZOOM_DEPTH_SCALES[depth];

  const groups: Array<{ firstMs: number; lastMs: number; sumX: number; sumY: number; count: number }> = [];
  for (const event of events) {
    const group = groups[groups.length - 1];
    if (group && event.timeMs - group.lastMs <= tuning.mergeGapMs) {
      const distance = Math.hypot(
        event.focus.cx - group.sumX / group.count,
        event.focus.cy - group.sumY / group.count,
      );
      if (distance <= reach) {
        group.lastMs = event.timeMs;
        group.sumX += event.focus.cx;
        group.sumY += event.focus.cy;
        group.count += 1;
        continue;
      }
    }
    groups.push({
      firstMs: event.timeMs,
      lastMs: event.timeMs,
      sumX: event.focus.cx,
      sumY: event.focus.cy,
      count: 1,
    });
  }

  const spans: AutoZoomSpan[] = [];
  for (const group of groups) {
    const startMs = Math.max(0, Math.round(group.firstMs - LEAD_MS));
    const endMs = Math.min(totalMs, Math.round(Math.max(group.lastMs + tuning.holdMs, startMs + MIN_REGION_MS)));
    const focus = clampFocusToDepth({ cx: group.sumX / group.count, cy: group.sumY / group.count }, depth);

    const previous = spans[spans.length - 1];
    if (previous && startMs < previous.endMs) {
      // Hand over directly to the next area; if little is left of the previous
      // region, go straight to the new one instead of a brief stop.
      if (startMs - previous.startMs < MIN_USABLE_REGION_MS) {
        spans.pop();
        spans.push({ startMs: previous.startMs, endMs, focus });
        continue;
      }
      previous.endMs = startMs;
    }

    if (endMs - startMs >= MIN_USABLE_REGION_MS) {
      spans.push({ startMs, endMs, focus });
    }
  }

  return spans;
}
