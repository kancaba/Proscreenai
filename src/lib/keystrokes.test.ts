import { describe, expect, it } from "vitest";
import {
	KEYSTROKE_HOLD_MS,
	normalizeKeystrokeSettings,
	normalizeShortcuts,
	type RecordedShortcut,
	shortcutFromKeyEvent,
	shortcutKeycaps,
	shownShortcut,
} from "./keystrokes";

const K = 37;
const Q = 16;
const META_KEY = 3675;

const at = (timeMs: number, key = "K", meta = true): RecordedShortcut => ({
	timeMs,
	key,
	meta,
	ctrl: !meta,
	alt: false,
	shift: false,
});

describe("recording shortcuts", () => {
	it("keeps presses with Cmd, or Ctrl without Alt, and never plain typing", () => {
		expect(shortcutFromKeyEvent({ keycode: K, metaKey: true }, 1200.4)).toEqual({
			timeMs: 1200,
			key: "K",
			meta: true,
			ctrl: false,
			alt: false,
			shift: false,
		});
		expect(shortcutFromKeyEvent({ keycode: K, ctrlKey: true, shiftKey: true }, 5)?.shift).toBe(
			true,
		);
		// Typing, Option-typed characters (⌥Q = @ on a Turkish Mac) and AltGr (Ctrl+Alt) are not kept.
		expect(shortcutFromKeyEvent({ keycode: K }, 5)).toBeNull();
		expect(shortcutFromKeyEvent({ keycode: K, shiftKey: true }, 5)).toBeNull();
		expect(shortcutFromKeyEvent({ keycode: Q, altKey: true }, 5)).toBeNull();
		expect(shortcutFromKeyEvent({ keycode: Q, ctrlKey: true, altKey: true }, 5)).toBeNull();
		// A modifier on its own is not a shortcut.
		expect(shortcutFromKeyEvent({ keycode: META_KEY, metaKey: true }, 5)).toBeNull();
	});

	it("reads saved shortcuts, dropping anything that is not a shortcut", () => {
		expect(
			normalizeShortcuts([
				at(900),
				{ ...at(100), key: "NotAKey" },
				{ ...at(200), meta: false, ctrl: false },
				{ ...at(300), meta: false, ctrl: true, alt: true },
				at(-1),
				"x",
				at(400, "S", false),
			]),
		).toEqual([at(400, "S", false), at(900)]);
		expect(normalizeShortcuts(null)).toEqual([]);
	});

	it("starts off and falls back to valid settings", () => {
		expect(normalizeKeystrokeSettings(undefined)).toEqual({
			enabled: false,
			position: "bottom-right",
			size: "medium",
		});
		expect(
			normalizeKeystrokeSettings({ enabled: true, position: "top-left", size: "huge" }),
		).toEqual({
			enabled: true,
			position: "top-left",
			size: "medium",
		});
	});
});

describe("showing shortcuts", () => {
	it("writes keycaps the platform's way", () => {
		const all = { ...at(0, "Comma"), ctrl: true, alt: true, shift: true };
		expect(shortcutKeycaps(all, true)).toEqual(["⌃", "⌥", "⇧", "⌘", ","]);
		expect(shortcutKeycaps(at(0, "Enter", false), false)).toEqual(["Ctrl", "Enter"]);
		expect(shortcutKeycaps(at(0, "ArrowLeft"), true)).toEqual(["⌘", "←"]);
	});

	it("shows a shortcut for a while, then hides it", () => {
		const list = [at(1000), at(5000, "S")];
		expect(shownShortcut(list, 999)).toBeNull();
		expect(shownShortcut(list, 1000)?.opacity).toBe(0);
		expect(shownShortcut(list, 1600)).toMatchObject({
			shortcut: { key: "K" },
			count: 1,
			opacity: 1,
			scale: 1,
		});
		expect(shownShortcut(list, 1000 + KEYSTROKE_HOLD_MS + 1)).toBeNull();
		expect(shownShortcut(list, 5200)?.shortcut.key).toBe("S");
	});

	it("counts the same shortcut pressed again and again", () => {
		const undo = [at(0, "Z"), at(400, "Z"), at(800, "Z"), at(3000, "Z")];
		expect(shownShortcut(undo, 900)).toMatchObject({ count: 3, opacity: 1 });
		// A long pause starts a new count.
		expect(shownShortcut(undo, 3100)?.count).toBe(1);
		// A different shortcut in between starts a new count too.
		expect(shownShortcut([at(0, "Z"), at(200, "Y"), at(400, "Z")], 500)?.count).toBe(1);
	});
});
