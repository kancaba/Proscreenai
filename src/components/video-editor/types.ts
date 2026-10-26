export type ZoomDepth = 1 | 2 | 3 | 4 | 5 | 6;

export interface ZoomFocus {
  cx: number; // normalized horizontal center (0-1)
  cy: number; // normalized vertical center (0-1)
}

export interface ZoomRegion {
  id: string;
  startMs: number;
  endMs: number;
  depth: ZoomDepth;
  focus: ZoomFocus;
}

export interface CursorTelemetryPoint {
  timeMs: number;
  cx: number;
  cy: number;
  interactionType?: 'move' | 'click' | 'double-click' | 'right-click' | 'middle-click' | 'mouseup';
  cursorType?: 'arrow' | 'text' | 'pointer' | 'crosshair' | 'open-hand' | 'closed-hand' | 'resize-ew' | 'resize-ns' | 'not-allowed';
}

export interface CursorVisualSettings {
  size: number;
  smoothing: number;
  motionBlur: number;
  clickBounce: number;
}

export const DEFAULT_CURSOR_SIZE = 3.0;
export const DEFAULT_CURSOR_SMOOTHING = 0.67;
export const DEFAULT_CURSOR_MOTION_BLUR = 0.35;
export const DEFAULT_CURSOR_CLICK_BOUNCE = 2.5;
/** Zooms are smooth without blur by default; blur is an opt-in effect. */
export const DEFAULT_ZOOM_MOTION_BLUR = 0;
/** Strength used when the zoom blur is switched on. */
export const ZOOM_MOTION_BLUR_ON = 0.35;

export interface TrimRegion {
  id: string;
  startMs: number;
  endMs: number;
}

export type AnnotationType = 'text' | 'image' | 'figure';

export type ArrowDirection = 'up' | 'down' | 'left' | 'right' | 'up-right' | 'up-left' | 'down-right' | 'down-left';

export interface FigureData {
  arrowDirection: ArrowDirection;
  color: string;
  strokeWidth: number;
}

export interface AnnotationPosition {
  x: number;
  y: number;
}

export interface AnnotationSize {
  width: number;
  height: number;
}

export interface AnnotationTextStyle {
  color: string;
  backgroundColor: string;
  fontSize: number; // pixels
  fontFamily: string;
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  textDecoration: 'none' | 'underline';
  textAlign: 'left' | 'center' | 'right';
  /** Drop shadow behind the letters. Optional: older projects have none. */
  textShadow?: AnnotationTextShadow;
  /** Outline around the letters in px (0 = none). */
  strokeWidth?: number;
  strokeColor?: string;
  /** Colour for ==highlighted== words. */
  highlightColor?: string;
}

export type AnnotationTextShadow = 'none' | 'soft' | 'strong';
export type AnnotationEnterAnimation = 'none' | 'fade' | 'slide-up' | 'pop' | 'typewriter';
export type AnnotationExitAnimation = 'none' | 'fade' | 'slide-down' | 'pop';

/** How a text appears at the start of its timeline span and leaves at the end. */
export interface AnnotationAnimation {
  enter: AnnotationEnterAnimation;
  exit: AnnotationExitAnimation;
  durationMs: number;
}

export const DEFAULT_ANNOTATION_ANIMATION: AnnotationAnimation = {
  enter: 'none',
  exit: 'none',
  durationMs: 400,
};

function getDefaultAnnotationFontFamily() {
  if (typeof navigator !== 'undefined' && /mac/i.test(navigator.platform)) {
    return '"SF Pro Display", "SF Pro Text", -apple-system, BlinkMacSystemFont, sans-serif';
  }

  return 'Inter, system-ui, sans-serif';
}

export interface AnnotationRegion {
  id: string;
  startMs: number;
  endMs: number;
  type: AnnotationType;
  content: string; // Legacy - still used for current type
  textContent?: string; // Separate storage for text
  imageContent?: string; // Separate storage for image data URL
  position: AnnotationPosition;
  size: AnnotationSize;
  style: AnnotationTextStyle;
  zIndex: number;
  figureData?: FigureData;
  animation?: AnnotationAnimation;
  /** Set on captions made from the video's speech, so a new run can replace them. */
  generatedBy?: "transcript";
}

export const DEFAULT_ANNOTATION_POSITION: AnnotationPosition = {
  x: 50,
  y: 50,
};

export const DEFAULT_ANNOTATION_SIZE: AnnotationSize = {
  width: 30,
  height: 20,
};

export const DEFAULT_ANNOTATION_STYLE: AnnotationTextStyle = {
  color: '#ffffff',
  backgroundColor: 'transparent',
  fontSize: 32,
  fontFamily: getDefaultAnnotationFontFamily(),
  fontWeight: 'bold',
  fontStyle: 'normal',
  textDecoration: 'none',
  textAlign: 'center',
};

export const DEFAULT_FIGURE_DATA: FigureData = {
  arrowDirection: 'right',
  color: '#2563EB',
  strokeWidth: 4,
};



export interface CropRegion {
  x: number; 
  y: number; 
  width: number; 
  height: number; 
}

export const DEFAULT_CROP_REGION: CropRegion = {
  x: 0,
  y: 0,
  width: 1,
  height: 1,
};

export interface AudioRegion {
  id: string;
  startMs: number;
  endMs: number;
  audioPath: string;
  volume: number;
  /** Where in the audio file the clip starts; trimming the clip's left edge moves this. Defaults to 0. */
  sourceStartMs?: number;
  /** Full length of the audio file, when known, so a clip cannot extend past the file's end. */
  sourceDurationMs?: number;
}

export type PlaybackSpeed = 0.25 | 0.5 | 0.75 | 1.25 | 1.5 | 1.75 | 2;

export interface SpeedRegion {
  id: string;
  startMs: number;
  endMs: number;
  speed: PlaybackSpeed;
}

export const SPEED_OPTIONS: Array<{ speed: PlaybackSpeed; label: string }> = [
  { speed: 0.25, label: "0.25×" },
  { speed: 0.5, label: "0.5×" },
  { speed: 0.75, label: "0.75×" },
  { speed: 1.25, label: "1.25×" },
  { speed: 1.5, label: "1.5×" },
  { speed: 1.75, label: "1.75×" },
  { speed: 2, label: "2×" },
];

export const DEFAULT_PLAYBACK_SPEED: PlaybackSpeed = 1.5;

export const ZOOM_DEPTH_SCALES: Record<ZoomDepth, number> = {
  1: 1.25,
  2: 1.5,
  3: 1.8,
  4: 2.2,
  5: 3.5,
  6: 5.0,
};

export const DEFAULT_ZOOM_DEPTH: ZoomDepth = 3;

export function clampFocusToDepth(focus: ZoomFocus, _depth: ZoomDepth): ZoomFocus {
  return {
    cx: clamp(focus.cx, 0, 1),
    cy: clamp(focus.cy, 0, 1),
  };
}

function clamp(value: number, min: number, max: number) {
  if (Number.isNaN(value)) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}

