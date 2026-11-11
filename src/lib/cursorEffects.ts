/*
 * Click effects and cursor styles drawn over the recording's cursor. They are shapes (rings,
 * discs, rays) computed here and drawn by the cursor renderer, so the preview and the export match.
 * Everything is optional: projects without these settings look as before.
 */

export type ClickEffectStyle = "off" | "ripple" | "pulse" | "burst" | "warp";
export type CursorStyle = "system" | "halo" | "dot" | "ring";

export interface CursorEffects {
	click: ClickEffectStyle;
	/** Hex colour of the click effect. */
	clickColor: string;
	/** 0.5–2, relative to the cursor's size. */
	clickSize: number;
	cursor: CursorStyle;
	/** Hex colour of the halo, dot or ring cursor. */
	cursorColor: string;
}

export const CLICK_EFFECT_STYLES: ClickEffectStyle[] = ["off", "ripple", "pulse", "burst", "warp"];
export const CURSOR_STYLES: CursorStyle[] = ["system", "halo", "dot", "ring"];
export const EFFECT_COLORS = ["#ffffff", "#facc15", "#38bdf8", "#a78bfa", "#f472b6", "#34d399"];

export const DEFAULT_CURSOR_EFFECTS: CursorEffects = {
	click: "off",
	clickColor: "#ffffff",
	clickSize: 1,
	cursor: "system",
	cursorColor: "#facc15",
};

/** How long a click effect plays. */
export const CLICK_EFFECT_MS = 600;

const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function normalizeCursorEffects(value: unknown): CursorEffects {
	const x = (value ?? {}) as Partial<CursorEffects>;
	return {
		click: CLICK_EFFECT_STYLES.includes(x.click as ClickEffectStyle)
			? (x.click as ClickEffectStyle)
			: DEFAULT_CURSOR_EFFECTS.click,
		clickColor:
			typeof x.clickColor === "string" && HEX.test(x.clickColor)
				? x.clickColor.toLowerCase()
				: DEFAULT_CURSOR_EFFECTS.clickColor,
		clickSize:
			typeof x.clickSize === "number" && Number.isFinite(x.clickSize)
				? clamp(x.clickSize, 0.5, 2)
				: DEFAULT_CURSOR_EFFECTS.clickSize,
		cursor: CURSOR_STYLES.includes(x.cursor as CursorStyle)
			? (x.cursor as CursorStyle)
			: DEFAULT_CURSOR_EFFECTS.cursor,
		cursorColor:
			typeof x.cursorColor === "string" && HEX.test(x.cursorColor)
				? x.cursorColor.toLowerCase()
				: DEFAULT_CURSOR_EFFECTS.cursorColor,
	};
}

/** Whether the settings change anything compared with the plain recorded cursor. */
export const hasCursorEffects = (effects: CursorEffects) =>
	effects.click !== "off" || effects.cursor !== "system";

export const hexToNumber = (hex: string) => Number.parseInt(hex.replace("#", ""), 16);

/** A shape around a point, in px. */
export type EffectShape =
	| { kind: "ring"; radius: number; width: number; alpha: number }
	| { kind: "disc"; radius: number; alpha: number }
	| { kind: "ray"; angle: number; from: number; to: number; width: number; alpha: number };

const easeOut = (t: number) => 1 - (1 - t) ** 3;

/**
 * The shapes of a click effect `ageMs` after the click, around the click point. `base` is the
 * effect's radius in px (the cursor's height times the chosen size). Empty once it has played.
 */
export function clickEffectShapes(
	style: ClickEffectStyle,
	ageMs: number,
	base: number,
): EffectShape[] {
	if (style === "off" || ageMs < 0 || ageMs > CLICK_EFFECT_MS || base <= 0) return [];
	const t = ageMs / CLICK_EFFECT_MS;
	const fade = 1 - t;
	switch (style) {
		case "ripple": {
			const second = Math.max(0, (ageMs - 110) / (CLICK_EFFECT_MS - 110));
			return [
				{
					kind: "ring",
					radius: base * (0.25 + 1.15 * easeOut(t)),
					width: base * 0.11 * fade + 1,
					alpha: 0.9 * fade,
				},
				...(second > 0 && second < 1
					? [
							{
								kind: "ring" as const,
								radius: base * (0.2 + 0.85 * easeOut(second)),
								width: base * 0.07 * (1 - second) + 1,
								alpha: 0.6 * (1 - second),
							},
						]
					: []),
			];
		}
		case "pulse":
			return [
				{ kind: "disc", radius: base * (0.35 + 0.65 * easeOut(t)), alpha: 0.38 * fade },
				{
					kind: "ring",
					radius: base * (0.35 + 0.65 * easeOut(t)),
					width: base * 0.05 + 1,
					alpha: 0.7 * fade,
				},
			];
		case "burst": {
			const grow = easeOut(t);
			return Array.from({ length: 8 }, (_, i) => ({
				kind: "ray" as const,
				angle: (i / 8) * Math.PI * 2 - Math.PI / 2,
				from: base * (0.45 + 0.55 * grow),
				to: base * (0.75 + 0.75 * grow),
				width: base * 0.09 * fade + 1,
				alpha: fade,
			}));
		}
		case "warp": {
			// A shock wave: a bright flash, a thick fast ring that thins out and a slower echo.
			const flash = Math.max(0, 1 - t * 4);
			return [
				...(flash > 0 ? [{ kind: "disc" as const, radius: base * 0.55, alpha: 0.5 * flash }] : []),
				{
					kind: "ring",
					radius: base * (0.3 + 1.5 * easeOut(t)),
					width: base * 0.32 * fade ** 2 + 1,
					alpha: 0.85 * fade,
				},
				{
					kind: "ring",
					radius: base * (0.2 + 0.8 * easeOut(t)),
					width: base * 0.06 * fade + 1,
					alpha: 0.55 * fade,
				},
			];
		}
	}
}
