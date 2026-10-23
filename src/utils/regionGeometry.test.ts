import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { validateCaptureRegion } from "./captureRegion";
import {
	captureRegionToRect,
	fitAspect,
	type Handle,
	moveRect,
	rectFromCorner,
	rectPixelSize,
	rectToCaptureRegion,
	resizeRect,
} from "./regionGeometry";

const screen = { width: 1800, height: 1169 };
const inside = (r: { x: number; y: number; width: number; height: number }) =>
	r.x >= -1e-6 && r.y >= -1e-6 && r.x + r.width <= screen.width + 1e-6 && r.y + r.height <= screen.height + 1e-6;

describe("region geometry", () => {
	it("draws a rectangle in any drag direction", () => {
		expect(rectFromCorner({ x: 100, y: 100 }, { x: 400, y: 300 }, screen, null)).toEqual({ x: 100, y: 100, width: 300, height: 200 });
		expect(rectFromCorner({ x: 400, y: 300 }, { x: 100, y: 100 }, screen, null)).toEqual({ x: 100, y: 100, width: 300, height: 200 });
	});

	it("keeps a locked aspect ratio and stays on screen", () => {
		const r = rectFromCorner({ x: 1700, y: 1000 }, { x: 1800, y: 1169 }, screen, 16 / 9);
		expect(r.width / r.height).toBeCloseTo(16 / 9, 5);
		expect(inside(r)).toBe(true);
	});

	it("never moves a selection off screen", () => {
		const moved = moveRect({ x: 100, y: 100, width: 300, height: 200 }, 5000, -5000, screen);
		expect(moved).toEqual({ x: 1500, y: 0, width: 300, height: 200 });
	});

	it("resizes from edges and corners with the opposite side fixed", () => {
		const rect = { x: 100, y: 100, width: 300, height: 200 };
		expect(resizeRect(rect, "e", { x: 600, y: 999 }, screen, null)).toEqual({ x: 100, y: 100, width: 500, height: 200 });
		expect(resizeRect(rect, "nw", { x: 50, y: 50 }, screen, null)).toEqual({ x: 50, y: 50, width: 350, height: 250 });
		const locked = resizeRect(rect, "s", { x: 0, y: 500 }, screen, 1);
		expect(locked.width).toBeCloseTo(locked.height, 5);
	});

	it("reshapes to an aspect ratio around the centre", () => {
		const r = fitAspect({ x: 800, y: 500, width: 200, height: 200 }, 9 / 16, screen);
		expect(r.width / r.height).toBeCloseTo(9 / 16, 5);
		expect(r.x + r.width / 2).toBeCloseTo(900, 5);
	});

	it("converts to the recording region and back", () => {
		const rect = { x: 450, y: 292, width: 900, height: 585 };
		const region = rectToCaptureRegion(rect, screen);
		expect(validateCaptureRegion(region)).not.toBeNull();
		const back = captureRegionToRect(region!, screen);
		expect(back.x).toBeCloseTo(450, 6);
		expect(back.width).toBeCloseTo(900, 6);
		expect(rectToCaptureRegion({ x: 0, y: 0, width: 10, height: 400 }, screen)).toBeNull();
	});

	it("reports the recorded pixel size like the encoder", () => {
		expect(rectPixelSize({ x: 0, y: 0, width: 900, height: 585 }, 2)).toEqual({ width: 1800, height: 1170 });
		expect(rectPixelSize({ x: 0, y: 0, width: 301, height: 201 }, 1)).toEqual({ width: 300, height: 200 });
	});

	it("keeps every resize on screen, with or without a ratio lock", () => {
		const handles: Handle[] = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
		fc.assert(
			fc.property(
				fc.record({ x: fc.integer({ min: 0, max: 1500 }), y: fc.integer({ min: 0, max: 900 }), width: fc.integer({ min: 32, max: 300 }), height: fc.integer({ min: 32, max: 260 }) }),
				fc.constantFrom(...handles),
				fc.record({ x: fc.integer({ min: -500, max: 2500 }), y: fc.integer({ min: -500, max: 2000 }) }),
				fc.constantFrom(null, 16 / 9, 9 / 16, 1, 4 / 3),
				(rect, handle, pointer, aspect) => {
					const result = resizeRect(rect, handle, pointer, screen, aspect);
					expect(inside(result)).toBe(true);
					if (aspect && result.height > 0.5) expect(result.width / result.height).toBeCloseTo(aspect, 3);
				},
			),
		);
	});
});
