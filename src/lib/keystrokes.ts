/*
 * Keyboard shortcuts pressed while recording (⌘K, Ctrl+S …), shown as a small badge in the video.
 * Only presses with Cmd, or Ctrl without Alt, are recorded: plain typing and characters typed with
 * Option or AltGr (such as @) never are, so passwords and text stay out of the recording data.
 * The preview and the export draw the badge with the same function.
 */

export interface RecordedShortcut {
	/** Recording time, ms. */
	timeMs: number;
	/** The key with the modifiers, e.g. "K", "Enter", "ArrowLeft". */
	key: string;
	meta: boolean;
	ctrl: boolean;
	alt: boolean;
	shift: boolean;
}

export type KeystrokePosition =
	| "top-left"
	| "top-center"
	| "top-right"
	| "bottom-left"
	| "bottom-center"
	| "bottom-right";
export type KeystrokeSize = "small" | "medium" | "large";

export interface KeystrokeSettings {
	enabled: boolean;
	position: KeystrokePosition;
	size: KeystrokeSize;
}

export const KEYSTROKE_POSITIONS: KeystrokePosition[] = [
	"top-left",
	"top-center",
	"top-right",
	"bottom-left",
	"bottom-center",
	"bottom-right",
];
export const KEYSTROKE_SIZES: KeystrokeSize[] = ["small", "medium", "large"];
export const DEFAULT_KEYSTROKE_SETTINGS: KeystrokeSettings = {
	enabled: false,
	position: "bottom-right",
	size: "medium",
};

/** How long a shortcut stays on screen. */
export const KEYSTROKE_HOLD_MS = 1300;
const FADE_IN_MS = 120;
const FADE_OUT_MS = 250;
const MAX_SHORTCUTS = 20_000;

/** uiohook key codes (physical keys) of the keys a shortcut can end with. */
export const SHORTCUT_KEY_NAMES: Record<number, string> = {
	14: "Backspace",
	15: "Tab",
	28: "Enter",
	1: "Escape",
	57: "Space",
	3657: "PageUp",
	3665: "PageDown",
	3663: "End",
	3655: "Home",
	57419: "ArrowLeft",
	57416: "ArrowUp",
	57421: "ArrowRight",
	57424: "ArrowDown",
	3667: "Delete",
	11: "0",
	2: "1",
	3: "2",
	4: "3",
	5: "4",
	6: "5",
	7: "6",
	8: "7",
	9: "8",
	10: "9",
	30: "A",
	48: "B",
	46: "C",
	32: "D",
	18: "E",
	33: "F",
	34: "G",
	35: "H",
	23: "I",
	36: "J",
	37: "K",
	38: "L",
	50: "M",
	49: "N",
	24: "O",
	25: "P",
	16: "Q",
	19: "R",
	31: "S",
	20: "T",
	22: "U",
	47: "V",
	17: "W",
	45: "X",
	21: "Y",
	44: "Z",
	59: "F1",
	60: "F2",
	61: "F3",
	62: "F4",
	63: "F5",
	64: "F6",
	65: "F7",
	66: "F8",
	67: "F9",
	68: "F10",
	87: "F11",
	88: "F12",
	39: "Semicolon",
	13: "Equal",
	51: "Comma",
	12: "Minus",
	52: "Period",
	53: "Slash",
	41: "Backquote",
	26: "BracketLeft",
	43: "Backslash",
	27: "BracketRight",
	40: "Quote",
};
const KEY_NAMES = new Set(Object.values(SHORTCUT_KEY_NAMES));

/** The shortcut for a key press, or null when it is typing, a lone modifier or an unknown key. */
export function shortcutFromKeyEvent(
	event: {
		keycode?: number;
		metaKey?: boolean;
		ctrlKey?: boolean;
		altKey?: boolean;
		shiftKey?: boolean;
	},
	timeMs: number,
): RecordedShortcut | null {
	const meta = !!event.metaKey;
	const ctrl = !!event.ctrlKey;
	const alt = !!event.altKey;
	// Ctrl+Alt is AltGr on Windows keyboards, which types characters.
	if (!meta && !(ctrl && !alt)) return null;
	const key = typeof event.keycode === "number" ? SHORTCUT_KEY_NAMES[event.keycode] : undefined;
	if (!key || !Number.isFinite(timeMs) || timeMs < 0) return null;
	return { timeMs: Math.round(timeMs), key, meta, ctrl, alt, shift: !!event.shiftKey };
}

/** Shortcuts read from a telemetry file; anything malformed is dropped. */
export function normalizeShortcuts(value: unknown): RecordedShortcut[] {
	if (!Array.isArray(value)) return [];
	const shortcuts = value.flatMap((item): RecordedShortcut[] => {
		const x = (item ?? {}) as Partial<RecordedShortcut>;
		if (typeof x.timeMs !== "number" || !Number.isFinite(x.timeMs) || x.timeMs < 0) return [];
		if (typeof x.key !== "string" || !KEY_NAMES.has(x.key)) return [];
		const meta = x.meta === true;
		const ctrl = x.ctrl === true;
		const alt = x.alt === true;
		if (!meta && !(ctrl && !alt)) return [];
		return [{ timeMs: Math.round(x.timeMs), key: x.key, meta, ctrl, alt, shift: x.shift === true }];
	});
	return shortcuts.sort((a, b) => a.timeMs - b.timeMs).slice(0, MAX_SHORTCUTS);
}

export function normalizeKeystrokeSettings(value: unknown): KeystrokeSettings {
	const x = (value ?? {}) as Partial<KeystrokeSettings>;
	return {
		enabled: x.enabled === true,
		position: KEYSTROKE_POSITIONS.includes(x.position as KeystrokePosition)
			? (x.position as KeystrokePosition)
			: DEFAULT_KEYSTROKE_SETTINGS.position,
		size: KEYSTROKE_SIZES.includes(x.size as KeystrokeSize)
			? (x.size as KeystrokeSize)
			: DEFAULT_KEYSTROKE_SETTINGS.size,
	};
}

const MAC_KEYS: Record<string, string> = {
	Backspace: "⌫",
	Tab: "⇥",
	Enter: "↩",
	Escape: "esc",
	Space: "Space",
	PageUp: "⇞",
	PageDown: "⇟",
	End: "↘",
	Home: "↖",
	ArrowLeft: "←",
	ArrowUp: "↑",
	ArrowRight: "→",
	ArrowDown: "↓",
	Delete: "⌦",
};
const OTHER_KEYS: Record<string, string> = {
	Backspace: "Backspace",
	Tab: "Tab",
	Enter: "Enter",
	Escape: "Esc",
	Space: "Space",
	PageUp: "PgUp",
	PageDown: "PgDn",
	End: "End",
	Home: "Home",
	ArrowLeft: "←",
	ArrowUp: "↑",
	ArrowRight: "→",
	ArrowDown: "↓",
	Delete: "Del",
};
const PUNCTUATION: Record<string, string> = {
	Semicolon: ";",
	Equal: "=",
	Comma: ",",
	Minus: "-",
	Period: ".",
	Slash: "/",
	Backquote: "`",
	BracketLeft: "[",
	Backslash: "\\",
	BracketRight: "]",
	Quote: "'",
};

/** The keycaps to draw, in the platform's usual order (⌃⌥⇧⌘ on a Mac). */
export function shortcutKeycaps(shortcut: RecordedShortcut, mac: boolean): string[] {
	const key =
		PUNCTUATION[shortcut.key] ?? (mac ? MAC_KEYS : OTHER_KEYS)[shortcut.key] ?? shortcut.key;
	if (mac) {
		return [
			...(shortcut.ctrl ? ["⌃"] : []),
			...(shortcut.alt ? ["⌥"] : []),
			...(shortcut.shift ? ["⇧"] : []),
			...(shortcut.meta ? ["⌘"] : []),
			key,
		];
	}
	return [
		...(shortcut.ctrl ? ["Ctrl"] : []),
		...(shortcut.meta ? ["Win"] : []),
		...(shortcut.alt ? ["Alt"] : []),
		...(shortcut.shift ? ["Shift"] : []),
		key,
	];
}

const sameCombo = (a: RecordedShortcut, b: RecordedShortcut) =>
	a.key === b.key &&
	a.meta === b.meta &&
	a.ctrl === b.ctrl &&
	a.alt === b.alt &&
	a.shift === b.shift;

export interface ShownShortcut {
	shortcut: RecordedShortcut;
	/** Presses of the same shortcut in a row, e.g. ⌘Z ×3. */
	count: number;
	opacity: number;
	/** 0.92 → 1 as it appears. */
	scale: number;
}

/** The shortcut on screen at `timeMs` (sorted shortcuts), or null. */
export function shownShortcut(shortcuts: RecordedShortcut[], timeMs: number): ShownShortcut | null {
	let low = 0;
	let high = shortcuts.length - 1;
	let index = -1;
	while (low <= high) {
		const middle = (low + high) >> 1;
		if (shortcuts[middle].timeMs <= timeMs) {
			index = middle;
			low = middle + 1;
		} else high = middle - 1;
	}
	if (index < 0) return null;
	const shortcut = shortcuts[index];
	const age = timeMs - shortcut.timeMs;
	if (age > KEYSTROKE_HOLD_MS) return null;
	let count = 1;
	for (let i = index - 1; i >= 0; i--) {
		const previous = shortcuts[i];
		if (
			!sameCombo(previous, shortcut) ||
			shortcuts[i + 1].timeMs - previous.timeMs > KEYSTROKE_HOLD_MS
		)
			break;
		count++;
	}
	// A repeat keeps the badge in place instead of popping it again.
	const appear = count > 1 ? 1 : Math.min(1, age / FADE_IN_MS);
	const opacity = Math.min(appear, Math.min(1, (KEYSTROKE_HOLD_MS - age) / FADE_OUT_MS));
	return { shortcut, count, opacity: Math.max(0, opacity), scale: 0.92 + 0.08 * appear };
}

const SIZE_FACTOR: Record<KeystrokeSize, number> = { small: 0.042, medium: 0.056, large: 0.074 };

/** Draws the badge for `shown` on a canvas the size of the output frame. */
export function drawKeystrokeBadge(
	ctx: CanvasRenderingContext2D,
	shown: ShownShortcut,
	settings: KeystrokeSettings,
	width: number,
	height: number,
	mac: boolean,
) {
	if (shown.opacity <= 0 || width <= 0 || height <= 0) return;
	const base = Math.min(width, height);
	const capHeight = Math.max(14, base * SIZE_FACTOR[settings.size]);
	const font = capHeight * 0.48;
	const gap = capHeight * 0.18;
	const pad = capHeight * 0.22;
	const margin = base * 0.035;
	const caps = shortcutKeycaps(shown.shortcut, mac);
	const fontStack = `600 ${font}px -apple-system, "SF Pro Text", "Segoe UI", Inter, sans-serif`;
	ctx.save();
	ctx.font = fontStack;
	const capWidths = caps.map((cap) =>
		Math.max(capHeight, ctx.measureText(cap).width + capHeight * 0.55),
	);
	const countText = shown.count > 1 ? `×${shown.count}` : "";
	const countWidth = countText ? ctx.measureText(countText).width + gap : 0;
	const boxWidth =
		capWidths.reduce((sum, w) => sum + w, 0) + gap * (caps.length - 1) + pad * 2 + countWidth;
	const boxHeight = capHeight + pad * 2;
	const [vertical, horizontal] = settings.position.split("-") as [
		"top" | "bottom",
		"left" | "center" | "right",
	];
	const x =
		horizontal === "left"
			? margin
			: horizontal === "right"
				? width - margin - boxWidth
				: (width - boxWidth) / 2;
	const y = vertical === "top" ? margin : height - margin - boxHeight;
	ctx.globalAlpha *= shown.opacity;
	ctx.translate(x + boxWidth / 2, y + boxHeight / 2);
	ctx.scale(shown.scale, shown.scale);
	ctx.translate(-boxWidth / 2, -boxHeight / 2);
	ctx.shadowColor = "rgba(0,0,0,0.35)";
	ctx.shadowBlur = capHeight * 0.5;
	ctx.shadowOffsetY = capHeight * 0.08;
	ctx.fillStyle = "rgba(17,17,22,0.82)";
	ctx.beginPath();
	ctx.roundRect(0, 0, boxWidth, boxHeight, capHeight * 0.38);
	ctx.fill();
	ctx.shadowColor = "transparent";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	let left = pad;
	caps.forEach((cap, index) => {
		const capWidth = capWidths[index];
		ctx.fillStyle = "rgba(255,255,255,0.13)";
		ctx.beginPath();
		ctx.roundRect(left, pad, capWidth, capHeight, capHeight * 0.24);
		ctx.fill();
		ctx.strokeStyle = "rgba(255,255,255,0.16)";
		ctx.lineWidth = Math.max(1, capHeight * 0.03);
		ctx.stroke();
		ctx.fillStyle = "#ffffff";
		ctx.fillText(cap, left + capWidth / 2, pad + capHeight / 2 + font * 0.04);
		left += capWidth + gap;
	});
	if (countText) {
		ctx.fillStyle = "rgba(255,255,255,0.7)";
		ctx.textAlign = "left";
		ctx.fillText(countText, left, pad + capHeight / 2 + font * 0.04);
	}
	ctx.restore();
}

/** Whether keycaps use Mac symbols here. */
export const isMacPlatform = () =>
	typeof navigator !== "undefined" && /mac/i.test(navigator.platform || navigator.userAgent);
