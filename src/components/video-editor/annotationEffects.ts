import {
  type AnnotationAnimation,
  type AnnotationEnterAnimation,
  type AnnotationExitAnimation,
  type AnnotationRegion,
  type AnnotationTextShadow,
  type AnnotationTextStyle,
  DEFAULT_ANNOTATION_ANIMATION,
} from "./types";

// Shared by the editor preview (CSS) and the exporter (canvas) so both draw text the same way.

export const ENTER_ANIMATIONS: AnnotationEnterAnimation[] = ["none", "fade", "slide-up", "pop", "typewriter"];
export const EXIT_ANIMATIONS: AnnotationExitAnimation[] = ["none", "fade", "slide-down", "pop"];
export const MIN_ANIMATION_MS = 100;
export const MAX_ANIMATION_MS = 2000;
export const DEFAULT_HIGHLIGHT_COLOR = "#facc15";

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const easeOutCubic = (t: number) => 1 - (1 - clamp01(t)) ** 3;

export function normalizeAnnotationAnimation(value: unknown): AnnotationAnimation | undefined {
  if (!value || typeof value !== "object") return undefined;
  const raw = value as Partial<AnnotationAnimation>;
  const enter = ENTER_ANIMATIONS.includes(raw.enter as AnnotationEnterAnimation) ? (raw.enter as AnnotationEnterAnimation) : "none";
  const exit = EXIT_ANIMATIONS.includes(raw.exit as AnnotationExitAnimation) ? (raw.exit as AnnotationExitAnimation) : "none";
  const durationMs = Number.isFinite(raw.durationMs)
    ? Math.min(MAX_ANIMATION_MS, Math.max(MIN_ANIMATION_MS, Math.round(raw.durationMs as number)))
    : DEFAULT_ANNOTATION_ANIMATION.durationMs;
  return enter === "none" && exit === "none" ? undefined : { enter, exit, durationMs };
}

export interface AnnotationAnimationState {
  opacity: number;
  /** Vertical offset as a share of the text box height (positive = down). */
  offsetY: number;
  scale: number;
  /** Share of characters shown (typewriter); 1 = all. */
  reveal: number;
}

const RESTING: AnnotationAnimationState = { opacity: 1, offsetY: 0, scale: 1, reveal: 1 };

/**
 * Appearance of a text at a time. The enter animation plays from the start of its
 * timeline span, the exit animation finishes exactly at the end of the span.
 */
export function getAnnotationAnimationState(
  region: Pick<AnnotationRegion, "startMs" | "endMs" | "animation">,
  timeMs: number,
): AnnotationAnimationState {
  const animation = region.animation;
  if (!animation || timeMs < region.startMs || timeMs > region.endMs) return RESTING;
  const span = region.endMs - region.startMs;
  const bothAnimate = animation.enter !== "none" && animation.exit !== "none";
  const duration = Math.max(1, Math.min(animation.durationMs, bothAnimate ? span / 2 : span));
  const state = { ...RESTING };

  const enter = easeOutCubic((timeMs - region.startMs) / duration);
  switch (animation.enter) {
    case "fade":
      state.opacity *= enter;
      break;
    case "slide-up":
      state.opacity *= enter;
      state.offsetY += (1 - enter) * 0.3;
      break;
    case "pop":
      state.opacity *= enter;
      state.scale *= 0.8 + 0.2 * enter;
      break;
    case "typewriter":
      state.reveal = clamp01((timeMs - region.startMs) / duration);
      break;
  }

  const exit = easeOutCubic((region.endMs - timeMs) / duration);
  switch (animation.exit) {
    case "fade":
      state.opacity *= exit;
      break;
    case "slide-down":
      state.opacity *= exit;
      state.offsetY += (1 - exit) * 0.3;
      break;
    case "pop":
      state.opacity *= exit;
      state.scale *= 0.8 + 0.2 * exit;
      break;
  }
  return state;
}

export interface RichTextRun {
  text: string;
  bold: boolean;
  highlight: boolean;
}

const MARKERS = [
  { token: "**", key: "bold" as const },
  { token: "==", key: "highlight" as const },
];

/**
 * Light inline formatting: **bold** and ==highlight==. A marker without a closing
 * partner is shown as typed, so ordinary text is never swallowed.
 */
export function parseRichText(text: string): RichTextRun[] {
  const runs: RichTextRun[] = [];
  const active = { bold: false, highlight: false };
  let buffer = "";
  const flush = () => {
    if (!buffer) return;
    const last = runs[runs.length - 1];
    if (last && last.bold === active.bold && last.highlight === active.highlight) last.text += buffer;
    else runs.push({ text: buffer, ...active });
    buffer = "";
  };
  let index = 0;
  while (index < text.length) {
    const marker = MARKERS.find((candidate) => text.startsWith(candidate.token, index));
    if (marker) {
      const closes = active[marker.key] || text.indexOf(marker.token, index + marker.token.length) !== -1;
      if (closes) {
        flush();
        active[marker.key] = !active[marker.key];
        index += marker.token.length;
        continue;
      }
    }
    buffer += text[index];
    index += 1;
  }
  flush();
  return runs;
}

export const plainRichText = (text: string) => parseRichText(text).map((run) => run.text).join("");

/** Runs cut to the first `reveal` share of characters (for the typewriter effect). */
export function revealRuns(runs: RichTextRun[], reveal: number): { visible: RichTextRun[]; hidden: RichTextRun[] } {
  const total = runs.reduce((sum, run) => sum + run.text.length, 0);
  let remaining = reveal >= 1 ? total : Math.floor(total * clamp01(reveal));
  const visible: RichTextRun[] = [];
  const hidden: RichTextRun[] = [];
  for (const run of runs) {
    if (remaining >= run.text.length) {
      visible.push(run);
      remaining -= run.text.length;
    } else {
      if (remaining > 0) visible.push({ ...run, text: run.text.slice(0, remaining) });
      hidden.push({ ...run, text: run.text.slice(Math.max(0, remaining)) });
      remaining = 0;
    }
  }
  return { visible, hidden };
}

export interface TextShadowParams {
  color: string;
  blur: number;
  offsetY: number;
}

export function getTextShadow(shadow: AnnotationTextShadow | undefined): TextShadowParams | null {
  if (shadow === "soft") return { color: "rgba(0,0,0,0.55)", blur: 8, offsetY: 2 };
  if (shadow === "strong") return { color: "rgba(0,0,0,0.85)", blur: 14, offsetY: 3 };
  return null;
}

export function getStroke(style: AnnotationTextStyle): { width: number; color: string } | null {
  const width = Number.isFinite(style.strokeWidth) ? Math.min(12, Math.max(0, style.strokeWidth as number)) : 0;
  return width > 0 ? { width, color: style.strokeColor || "#000000" } : null;
}

export interface TextStylePreset {
  id: string;
  tr: string;
  en: string;
  style: Partial<AnnotationTextStyle>;
  animation?: AnnotationAnimation;
}

/** One-click looks for common uses; they only change style and animation, never the text. */
export const TEXT_STYLE_PRESETS: TextStylePreset[] = [
  {
    id: "title",
    tr: "Başlık",
    en: "Title",
    style: { fontSize: 56, fontWeight: "bold", color: "#ffffff", backgroundColor: "transparent", textShadow: "strong", strokeWidth: 0, textAlign: "center" },
    animation: { enter: "pop", exit: "fade", durationMs: 450 },
  },
  {
    id: "subtitle",
    tr: "Alt yazı",
    en: "Subtitle",
    style: { fontSize: 28, fontWeight: "normal", color: "#ffffff", backgroundColor: "#000000b3", textShadow: "none", strokeWidth: 0, textAlign: "center" },
    animation: { enter: "fade", exit: "fade", durationMs: 250 },
  },
  {
    id: "label",
    tr: "Etiket",
    en: "Label",
    style: { fontSize: 22, fontWeight: "bold", color: "#111827", backgroundColor: "#ffffff", textShadow: "soft", strokeWidth: 0, textAlign: "center" },
    animation: { enter: "slide-up", exit: "fade", durationMs: 350 },
  },
  {
    id: "callout",
    tr: "Vurgu",
    en: "Callout",
    style: { fontSize: 40, fontWeight: "bold", color: "#ffffff", backgroundColor: "transparent", strokeWidth: 3, strokeColor: "#111827", highlightColor: DEFAULT_HIGHLIGHT_COLOR, textShadow: "soft", textAlign: "center" },
    animation: { enter: "pop", exit: "pop", durationMs: 350 },
  },
  {
    id: "typing",
    tr: "Daktilo",
    en: "Typewriter",
    style: { fontSize: 30, fontWeight: "normal", color: "#e5e7eb", backgroundColor: "#111827e6", textShadow: "none", strokeWidth: 0, textAlign: "left" },
    animation: { enter: "typewriter", exit: "fade", durationMs: 1200 },
  },
];

/** Distance (px) at which a dragged box snaps to the frame's centre lines. */
const CENTER_SNAP_PX = 8;

/** Box position after dropping: centred on an axis when close enough to the middle. */
export function snapToCenter(position: { x: number; y: number }, box: { width: number; height: number }, container: { width: number; height: number }) {
  const centerX = (container.width - box.width) / 2;
  const centerY = (container.height - box.height) / 2;
  return {
    x: Math.abs(position.x - centerX) <= CENTER_SNAP_PX ? centerX : position.x,
    y: Math.abs(position.y - centerY) <= CENTER_SNAP_PX ? centerY : position.y,
    snappedX: Math.abs(position.x - centerX) <= CENTER_SNAP_PX,
    snappedY: Math.abs(position.y - centerY) <= CENTER_SNAP_PX,
  };
}
