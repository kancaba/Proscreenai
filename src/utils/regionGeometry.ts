import type { CaptureRegion } from "./captureRegion";

/** A rectangle in display points (the selection overlay's CSS pixels). */
export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}
export interface Size {
	width: number;
	height: number;
}
export interface Point {
	x: number;
	y: number;
}
export type Handle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

/** Smallest selectable area, in points. */
export const MIN_REGION_SIZE = 32;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clampPoint = (point: Point, bounds: Size): Point => ({
	x: clamp(point.x, 0, bounds.width),
	y: clamp(point.y, 0, bounds.height),
});

/**
 * Rectangle spanned from a fixed corner to the pointer. With an aspect ratio
 * (width / height) the pointer's longer pull wins and the result stays on screen.
 */
export function rectFromCorner(anchor: Point, pointer: Point, bounds: Size, aspect: number | null): Rect {
	const a = clampPoint(anchor, bounds);
	const p = clampPoint(pointer, bounds);
	const dirX = p.x >= a.x ? 1 : -1;
	const dirY = p.y >= a.y ? 1 : -1;
	let width = Math.abs(p.x - a.x);
	let height = Math.abs(p.y - a.y);
	if (aspect && aspect > 0) {
		const roomX = dirX > 0 ? bounds.width - a.x : a.x;
		const roomY = dirY > 0 ? bounds.height - a.y : a.y;
		if (width / aspect >= height) height = width / aspect;
		else width = height * aspect;
		const fit = Math.min(1, roomX / Math.max(width, 1e-9), roomY / Math.max(height, 1e-9));
		width *= fit;
		height *= fit;
	}
	return {
		x: dirX > 0 ? a.x : a.x - width,
		y: dirY > 0 ? a.y : a.y - height,
		width,
		height,
	};
}

/** Moves a rectangle by a delta without leaving the screen. */
export function moveRect(rect: Rect, dx: number, dy: number, bounds: Size): Rect {
	return {
		...rect,
		x: clamp(rect.x + dx, 0, Math.max(0, bounds.width - rect.width)),
		y: clamp(rect.y + dy, 0, Math.max(0, bounds.height - rect.height)),
	};
}

/** Resizes from one of the eight handles; the opposite edge or corner stays put. */
export function resizeRect(rect: Rect, handle: Handle, pointer: Point, bounds: Size, aspect: number | null): Rect {
	const right = rect.x + rect.width;
	const bottom = rect.y + rect.height;
	const p = clampPoint(pointer, bounds);
	if (handle.length === 2) {
		const anchor = {
			x: handle.includes("w") ? right : rect.x,
			y: handle.includes("n") ? bottom : rect.y,
		};
		return rectFromCorner(anchor, p, bounds, aspect);
	}
	if (handle === "e" || handle === "w") {
		const x0 = handle === "e" ? rect.x : right;
		let width = Math.abs(p.x - x0);
		let height = rect.height;
		let y = rect.y;
		if (aspect) {
			height = width / aspect;
			if (height > bounds.height) {
				height = bounds.height;
				width = height * aspect;
			}
			y = clamp(rect.y + rect.height / 2 - height / 2, 0, bounds.height - height);
		}
		const x = p.x >= x0 ? x0 : x0 - width;
		return { x: clamp(x, 0, bounds.width - width), y, width, height };
	}
	const y0 = handle === "s" ? rect.y : bottom;
	let height = Math.abs(p.y - y0);
	let width = rect.width;
	let x = rect.x;
	if (aspect) {
		width = height * aspect;
		if (width > bounds.width) {
			width = bounds.width;
			height = width / aspect;
		}
		x = clamp(rect.x + rect.width / 2 - width / 2, 0, bounds.width - width);
	}
	const y = p.y >= y0 ? y0 : y0 - height;
	return { x, y: clamp(y, 0, bounds.height - height), width, height };
}

/** Reshapes a rectangle to an aspect ratio around its centre, keeping its area roughly. */
export function fitAspect(rect: Rect, aspect: number, bounds: Size): Rect {
	const area = Math.max(rect.width * rect.height, MIN_REGION_SIZE * MIN_REGION_SIZE);
	let width = Math.sqrt(area * aspect);
	let height = width / aspect;
	const scale = Math.min(1, bounds.width / width, bounds.height / height);
	width *= scale;
	height *= scale;
	const cx = rect.x + rect.width / 2;
	const cy = rect.y + rect.height / 2;
	return {
		x: clamp(cx - width / 2, 0, bounds.width - width),
		y: clamp(cy - height / 2, 0, bounds.height - height),
		width,
		height,
	};
}

export function isUsableRect(rect: Rect | null): rect is Rect {
	return !!rect && rect.width >= MIN_REGION_SIZE && rect.height >= MIN_REGION_SIZE;
}

/** Display-relative region for recording; null for a selection that is too small. */
export function rectToCaptureRegion(rect: Rect, bounds: Size): CaptureRegion | null {
	if (!isUsableRect(rect) || bounds.width <= 0 || bounds.height <= 0) return null;
	const x = clamp(rect.x / bounds.width, 0, 1);
	const y = clamp(rect.y / bounds.height, 0, 1);
	return {
		x,
		y,
		width: clamp(rect.width / bounds.width, 0, 1 - x),
		height: clamp(rect.height / bounds.height, 0, 1 - y),
	};
}

export function captureRegionToRect(region: CaptureRegion, bounds: Size): Rect {
	return {
		x: region.x * bounds.width,
		y: region.y * bounds.height,
		width: region.width * bounds.width,
		height: region.height * bounds.height,
	};
}

/** Recorded size in physical pixels, rounded to even numbers like the encoder. */
export function rectPixelSize(rect: Rect, scaleFactor: number): Size {
	const even = (value: number) => Math.max(2, Math.floor(value / 2) * 2);
	return {
		width: even(Math.round(rect.width) * scaleFactor),
		height: even(Math.round(rect.height) * scaleFactor),
	};
}
