import { describe, it, expect } from "vitest";
import { wrapLines, snap } from "./layout";
import { parseDocument, emptyDocument, newLayer } from "./document";
describe("image layout and transforms", () => {
	it("wraps paragraphs and long tokens to fit the actual measured width", () => {
		const lines = wrapLines("Merhaba dünya\nUzunKelimeBurada", 6, (s) => s.length);
		expect(lines).toEqual(["Merhab", "a", "dünya", "UzunKe", "limeBu", "rada"]);
		expect(lines.every((s) => s.length <= 6)).toBe(true);
	});
	it("snaps within the zoom-adjusted threshold only", () => {
		expect(snap(102, [0, 100, 200], 4)).toBe(100);
		expect(snap(107, [0, 100, 200], 4)).toBe(107);
	});
	it("rejects crops outside the source image and invalid typography", () => {
		const d = emptyDocument(),
			l = newLayer("text");
		d.layers = [l];
		l.crop = { x: 900, y: 0, width: 500, height: 1000 };
		expect(() => parseDocument(d)).toThrow();
		delete l.crop;
		l.lineHeight = 99;
		expect(() => parseDocument(d)).toThrow();
	});
});

describe("non destructive generated artwork", () => {
	it("replaces the visible base without covering text or logos", async () => {
		const { insertArtwork } = await import("./document");
		const base = { ...newLayer("image"), imageRole: "artwork" as const },
			logo = { ...newLayer("image"), imageRole: "overlay" as const },
			text = newLayer("text");
		const d = { ...emptyDocument(), layers: [base, logo, text] };
		const next = insertArtwork(d, newLayer("image"));
		expect(next.layers[0].imageRole).toBe("artwork");
		expect(next.layers[1].visible).toBe(false);
		expect(next.layers[2].visible).toBe(true);
		expect(next.layers[3]).toEqual(text);
		expect(d.layers[0].visible).toBe(true);
	});
});
