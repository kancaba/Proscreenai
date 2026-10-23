import { Container, BlurFilter } from 'pixi.js';
import { MotionBlurFilter } from 'pixi-filters/motion-blur';
import type { ZoomBlurFilter } from 'pixi-filters/zoom-blur';

/** Pan speed (stage px/s) at which directional blur reaches its maximum. */
const PEAK_VELOCITY_PPS = 1500;
/** Directional blur length at full speed and a motion blur amount of 1. */
const MAX_BLUR_PX = 40;
const VELOCITY_THRESHOLD_PPS = 40;
/** Radial blur strength per unit of relative scale change per second, at amount 1. */
const ZOOM_BLUR_PER_SCALE_RATE = 0.2;
const MAX_ZOOM_BLUR_STRENGTH = 0.2;
/** Below this relative scale rate (1/s) the camera is treated as not zooming. */
const MIN_ZOOM_RATE = 0.05;
/** Frames further apart than this (low-fps GIFs at 2x stay below it) are a cut or seek, not motion. */
const MAX_CONTINUOUS_FRAME_GAP_MS = 250;
/** Fraction of the stage around the zoom centre that stays sharp. */
const ZOOM_BLUR_SHARP_RADIUS = 0.12;

type CameraTransform = { scale: number; x: number; y: number };

export type CameraBlur =
  | { kind: 'none'; velocity: { x: number; y: number } }
  | { kind: 'pan'; velocity: { x: number; y: number }; blurPx: number }
  | { kind: 'zoom'; velocity: { x: number; y: number }; center: { x: number; y: number }; strength: number };

/**
 * Decides how the camera moved between two frames. A zoom is a scale change about a
 * fixed point (blurred radially from that point); anything else is blurred along the
 * motion of the content at the stage centre.
 */
export function computeCameraBlur(
  prev: CameraTransform,
  next: CameraTransform,
  dtSeconds: number,
  stageSize: { width: number; height: number },
  amount: number,
): CameraBlur {
  const center = { x: stageSize.width / 2, y: stageSize.height / 2 };
  const localAtCenter = {
    x: (center.x - prev.x) / Math.max(1e-6, prev.scale),
    y: (center.y - prev.y) / Math.max(1e-6, prev.scale),
  };
  const velocity = {
    x: (next.scale * localAtCenter.x + next.x - center.x) / dtSeconds,
    y: (next.scale * localAtCenter.y + next.y - center.y) / dtSeconds,
  };

  const dScale = next.scale - prev.scale;
  const zoomRate = Math.abs(dScale) / Math.max(1e-6, next.scale) / dtSeconds;
  if (zoomRate > MIN_ZOOM_RATE && Math.abs(dScale) > 1e-6) {
    // Point (in camera-parent space) that stays put while the scale changes.
    const local = { x: (prev.x - next.x) / dScale, y: (prev.y - next.y) / dScale };
    const fixed = { x: next.scale * local.x + next.x, y: next.scale * local.y + next.y };
    const nearStage = fixed.x > -stageSize.width * 0.5 && fixed.x < stageSize.width * 1.5
      && fixed.y > -stageSize.height * 0.5 && fixed.y < stageSize.height * 1.5;
    if (nearStage) {
      return {
        kind: 'zoom',
        velocity,
        center: fixed,
        strength: Math.min(MAX_ZOOM_BLUR_STRENGTH, zoomRate * ZOOM_BLUR_PER_SCALE_RATE * amount),
      };
    }
  }

  const speed = Math.hypot(velocity.x, velocity.y);
  if (speed < VELOCITY_THRESHOLD_PPS) {
    return { kind: 'none', velocity };
  }
  const normalised = Math.min(1, speed / PEAK_VELOCITY_PPS);
  return { kind: 'pan', velocity, blurPx: normalised ** 1.5 * MAX_BLUR_PX * amount };
}

function getFilterOrigin(target: Container | null | undefined) {
  if (!target) return { x: 0, y: 0 };
  const bounds = target.getBounds();
  const padding = Math.max(0, ...(Array.isArray(target.filters) ? target.filters : []).map((filter) => filter.padding ?? 0));
  // Pixi clips the filtered area to the viewport, which starts at the stage origin.
  return { x: Math.max(0, bounds.minX - padding), y: Math.max(0, bounds.minY - padding) };
}

function resetMotionBlur(
  blurFilter: BlurFilter | null,
  motionBlurFilter: MotionBlurFilter | null | undefined,
  zoomBlurFilter: ZoomBlurFilter | null | undefined,
) {
  if (motionBlurFilter) {
    motionBlurFilter.velocity = { x: 0, y: 0 };
    motionBlurFilter.kernelSize = 5;
    motionBlurFilter.offset = 0;
  }
  if (zoomBlurFilter) {
    zoomBlurFilter.strength = 0;
    zoomBlurFilter.enabled = false;
  }
  if (blurFilter) {
    blurFilter.blur = 0;
  }
  syncFilterActivity(blurFilter, motionBlurFilter);
}

/**
 * A filter with nothing to do still re-renders the video through an extra texture, which
 * costs time and sharpness; switch each one on only while it has an effect.
 */
function syncFilterActivity(blurFilter: BlurFilter | null, motionBlurFilter: MotionBlurFilter | null | undefined) {
  if (motionBlurFilter) {
    const velocity = motionBlurFilter.velocity;
    motionBlurFilter.enabled = velocity.x !== 0 || velocity.y !== 0;
  }
  if (blurFilter) {
    blurFilter.enabled = blurFilter.blur > 0;
  }
}

export interface MotionBlurState {
  lastFrameTimeMs: number;
  prevCamX: number;
  prevCamY: number;
  prevCamScale: number;
  initialized: boolean;
}

export function createMotionBlurState(): MotionBlurState {
  return {
    lastFrameTimeMs: 0,
    prevCamX: 0,
    prevCamY: 0,
    prevCamScale: 1,
    initialized: false,
  };
}

interface TransformParams {
  cameraContainer: Container;
  blurFilter: BlurFilter | null;
  motionBlurFilter?: MotionBlurFilter | null;
  stageSize: { width: number; height: number };
  baseMask: { x: number; y: number; width: number; height: number };
  zoomScale: number;
  zoomProgress?: number;
  focusX: number;
  focusY: number;
  motionIntensity: number;
  motionVector?: { x: number; y: number };
  isPlaying: boolean;
  motionBlurAmount?: number;
  transformOverride?: AppliedTransform;
  motionBlurState?: MotionBlurState;
  frameTimeMs?: number;
  /** Radial blur used while the camera zooms; directional blur covers pans. */
  zoomBlurFilter?: ZoomBlurFilter | null;
  /** The container the blur filters are attached to (for the filter's origin). */
  filterTarget?: Container | null;
}

interface AppliedTransform {
  scale: number;
  x: number;
  y: number;
}

interface FocusFromTransformGeometry {
  stageSize: { width: number; height: number };
  baseMask: { x: number; y: number; width: number; height: number };
  zoomScale: number;
  x: number;
  y: number;
}

interface ZoomTransformGeometry {
  stageSize: { width: number; height: number };
  baseMask: { x: number; y: number; width: number; height: number };
  zoomScale: number;
  zoomProgress?: number;
  focusX: number;
  focusY: number;
}

export function computeZoomTransform({
  stageSize,
  baseMask,
  zoomScale,
  zoomProgress = 1,
  focusX,
  focusY,
}: ZoomTransformGeometry): AppliedTransform {
  if (
    stageSize.width <= 0 ||
    stageSize.height <= 0 ||
    baseMask.width <= 0 ||
    baseMask.height <= 0
  ) {
    return { scale: 1, x: 0, y: 0 };
  }

  const progress = Math.min(1, Math.max(0, zoomProgress));
  const focusStagePxX = baseMask.x + focusX * baseMask.width;
  const focusStagePxY = baseMask.y + focusY * baseMask.height;
  const stageCenterX = stageSize.width / 2;
  const stageCenterY = stageSize.height / 2;
  const scale = 1 + (zoomScale - 1) * progress;
  const finalX = stageCenterX - focusStagePxX * zoomScale;
  const finalY = stageCenterY - focusStagePxY * zoomScale;

  return {
    scale,
    x: finalX * progress,
    y: finalY * progress,
  };
}

export function computeFocusFromTransform({
  stageSize,
  baseMask,
  zoomScale,
  x,
  y,
}: FocusFromTransformGeometry) {
  if (
    stageSize.width <= 0 ||
    stageSize.height <= 0 ||
    baseMask.width <= 0 ||
    baseMask.height <= 0 ||
    zoomScale <= 0
  ) {
    return { cx: 0.5, cy: 0.5 };
  }

  const stageCenterX = stageSize.width / 2;
  const stageCenterY = stageSize.height / 2;
  const focusStagePxX = (stageCenterX - x) / zoomScale;
  const focusStagePxY = (stageCenterY - y) / zoomScale;

  return {
    cx: (focusStagePxX - baseMask.x) / baseMask.width,
    cy: (focusStagePxY - baseMask.y) / baseMask.height,
  };
}

export function applyZoomTransform({
  cameraContainer,
  blurFilter,
  motionBlurFilter,
  stageSize,
  baseMask,
  zoomScale,
  zoomProgress = 1,
  focusX,
  focusY,
  motionIntensity: _motionIntensity,
  motionVector: _motionVector,
  isPlaying,
  motionBlurAmount = 0,
  transformOverride,
  motionBlurState,
  frameTimeMs,
  zoomBlurFilter,
  filterTarget,
}: TransformParams): AppliedTransform {
  if (
    stageSize.width <= 0 ||
    stageSize.height <= 0 ||
    baseMask.width <= 0 ||
    baseMask.height <= 0
  ) {
    return { scale: 1, x: 0, y: 0 };
  }

  const transform = transformOverride ?? computeZoomTransform({
    stageSize,
    baseMask,
    zoomScale,
    zoomProgress,
    focusX,
    focusY,
  });

  // Apply position & scale to camera container
  cameraContainer.scale.set(transform.scale);
  cameraContainer.position.set(transform.x, transform.y);

  if (motionBlurState && motionBlurFilter && motionBlurAmount > 0 && isPlaying) {
    const now = frameTimeMs ?? performance.now();

    if (!motionBlurState.initialized) {
      motionBlurState.prevCamX = transform.x;
      motionBlurState.prevCamY = transform.y;
      motionBlurState.prevCamScale = transform.scale;
      motionBlurState.lastFrameTimeMs = now;
      motionBlurState.initialized = true;
      resetMotionBlur(blurFilter, motionBlurFilter, zoomBlurFilter);
    } else if (
      now - motionBlurState.lastFrameTimeMs > MAX_CONTINUOUS_FRAME_GAP_MS ||
      now < motionBlurState.lastFrameTimeMs
    ) {
      // A trim cut, seek or stall: the camera jump is not motion, so never blur it.
      motionBlurState.prevCamX = transform.x;
      motionBlurState.prevCamY = transform.y;
      motionBlurState.prevCamScale = transform.scale;
      motionBlurState.lastFrameTimeMs = now;
      resetMotionBlur(blurFilter, motionBlurFilter, zoomBlurFilter);
    } else {
      const dtMs = Math.max(1, now - motionBlurState.lastFrameTimeMs);
      const dtSeconds = dtMs / 1000;
      const prev = {
        scale: motionBlurState.prevCamScale,
        x: motionBlurState.prevCamX,
        y: motionBlurState.prevCamY,
      };
      motionBlurState.lastFrameTimeMs = now;
      motionBlurState.prevCamX = transform.x;
      motionBlurState.prevCamY = transform.y;
      motionBlurState.prevCamScale = transform.scale;

      const blur = computeCameraBlur(prev, transform, dtSeconds, stageSize, motionBlurAmount);

      if (blur.kind === 'zoom' && zoomBlurFilter) {
        // The filter centre is measured from the top-left of the filtered area.
        const parent = cameraContainer.parent;
        const globalCenter = parent ? parent.toGlobal(blur.center) : blur.center;
        const origin = getFilterOrigin(filterTarget);
        zoomBlurFilter.center = { x: globalCenter.x - origin.x, y: globalCenter.y - origin.y };
        zoomBlurFilter.strength = blur.strength;
        zoomBlurFilter.innerRadius = Math.min(stageSize.width, stageSize.height) * ZOOM_BLUR_SHARP_RADIUS;
        zoomBlurFilter.enabled = true;
        motionBlurFilter.velocity = { x: 0, y: 0 };
      } else {
        if (zoomBlurFilter) {
          zoomBlurFilter.strength = 0;
          zoomBlurFilter.enabled = false;
        }
        const pan = blur.kind === 'pan' ? blur.blurPx : 0;
        const dirMag = Math.hypot(blur.velocity.x, blur.velocity.y) || 1;
        motionBlurFilter.velocity = pan > 0
          ? { x: (blur.velocity.x / dirMag) * pan, y: (blur.velocity.y / dirMag) * pan }
          : { x: 0, y: 0 };
        motionBlurFilter.kernelSize = pan > 8 ? 15 : pan > 4 ? 11 : pan > 1.5 ? 9 : 5;
        motionBlurFilter.offset = 0;
      }

      if (blurFilter) {
        blurFilter.blur = 0;
      }
      syncFilterActivity(blurFilter, motionBlurFilter);
    }
  } else {
    resetMotionBlur(blurFilter, motionBlurFilter, zoomBlurFilter);
    if (motionBlurState) {
      motionBlurState.initialized = false;
    }
  }

  return {
    scale: transform.scale,
    x: transform.x,
    y: transform.y,
  };
}

