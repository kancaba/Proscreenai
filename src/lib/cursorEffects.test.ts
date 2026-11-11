import { describe, expect, it } from "vitest";
import {
	CLICK_EFFECT_MS,
	clickEffectShapes,
	DEFAULT_CURSOR_EFFECTS,
	hasCursorEffects,
	normalizeCursorEffects,
} from "./cursorEffects";

describe("cursor effects", () => {
	it("starts off and reads saved settings safely", () => {
		expect(normalizeCursorEffects(undefined)).toEqual(DEFAULT_CURSOR_EFFECTS);
		expect(hasCursorEffects(DEFAULT_CURSOR_EFFECTS)).toBe(false);
		const saved = normalizeCursorEffects({
			click: "warp",
			clickColor: "#38BDF8",
			clickSize: 9,
			cursor: "halo",
			cursorColor: "red",
		});
		expect(saved).toEqual({
			click: "warp",
			clickColor: "#38bdf8",
			clickSize: 2,
			cursor: "halo",
			cursorColor: DEFAULT_CURSOR_EFFECTS.cursorColor,
		});
		expect(hasCursorEffects(saved)).toBe(true);
		expect(normalizeCursorEffects({ click: "explode" }).click).toBe("off");
	});

	it("plays each click effect once and then stops", () => {
		for (const style of ["ripple", "pulse", "burst", "warp"] as const) {
			const early = clickEffectShapes(style, 30, 40);
			expect(early.length).toBeGreaterThan(0);
			expect(early.every((shape) => shape.alpha > 0)).toBe(true);
			expect(clickEffectShapes(style, CLICK_EFFECT_MS + 1, 40)).toEqual([]);
		}
		expect(clickEffectShapes("off", 30, 40)).toEqual([]);
		expect(clickEffectShapes("ripple", -5, 40)).toEqual([]);
	});

	it("grows outward and fades as it plays", () => {
		const radius = (age: number) => {
			const ring = clickEffectShapes("ripple", age, 40)[0];
			return ring.kind === "ring" ? ring : null;
		};
		expect(radius(400)!.radius).toBeGreaterThan(radius(50)!.radius);
		expect(radius(400)!.alpha).toBeLessThan(radius(50)!.alpha);
		const rays = clickEffectShapes("burst", 100, 40);
		expect(rays).toHaveLength(8);
		// Bigger size, bigger effect.
		const small = clickEffectShapes("pulse", 200, 20)[0];
		const big = clickEffectShapes("pulse", 200, 40)[0];
		expect(big.kind === "disc" && small.kind === "disc" && big.radius > small.radius).toBe(true);
	});
});
