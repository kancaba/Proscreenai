import { describe, expect, it } from "vitest";
import { emptyDocument, newLayer, parseDocument } from "./document";
describe("image project validation", () => {
	it("roundtrips a standalone layered document", () => {
		const d = emptyDocument();
		d.layers.push(newLayer("text"));
		expect(parseDocument(JSON.parse(JSON.stringify(d)))).toEqual(d);
	});
	it("rejects remote image sources and duplicate layer identities", () => {
		const d = emptyDocument(),
			l = newLayer("image");
		l.src = "https://example.com/image.png";
		d.layers = [l];
		expect(() => parseDocument(d)).toThrow();
		l.kind = "text";
		d.layers = [l, { ...l }];
		expect(() => parseDocument(d)).toThrow();
	});
	it("rejects unsafe canvas dimensions and non finite transforms", () => {
		expect(() => parseDocument({ ...emptyDocument(), width: 99999 })).toThrow();
		const d = emptyDocument();
		d.layers = [{ ...newLayer("text"), rotation: NaN }];
		expect(() => parseDocument(d)).toThrow();
	});
});
