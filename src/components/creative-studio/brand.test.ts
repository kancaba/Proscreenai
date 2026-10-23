import { describe, it, expect } from "vitest";
import { emptyBrand, brandContext, brandReferences, parseBrandDraft } from "./brand";
describe("persistent brand identity", () => {
	it("does not invent identities", () => {
		const b = emptyBrand();
		expect(b.name).toBe("");
		expect(b.assets).toEqual([]);
		expect(b.colors).toBe("");
	});
	it("inherits brand logo and prioritizes selected product", () => {
		const b = emptyBrand();
		b.name = "Mersel";
		b.assets = [{ id: "logo", name: "logo", role: "logo", src: "brand" }];
		const p = {
			id: "f",
			name: "Finsel",
			description: "Finance",
			assets: [{ id: "p", name: "Product", role: "product" as const, src: "product" }],
		};
		expect(brandReferences(b, p).map((a) => a.src)).toEqual(["product", "brand"]);
		expect(brandContext(b, p)).toContain("Finsel");
		expect(brandContext()).toBe("");
	});
	it("removes duplicate reference bytes", () => {
		const b = emptyBrand();
		b.assets = [
			{ id: "a", name: "a", role: "logo", src: "same" },
			{ id: "b", name: "b", role: "style", src: "same" },
		];
		expect(brandReferences(b)).toHaveLength(1);
	});
	it("AI extraction only accepts editable known string fields", () => {
		expect(
			parseBrandDraft(
				'```json\n{"name":"Mersel","colors":"#123456","assets":["bad"],"id":"replace"}\n```',
			),
		).toEqual({ name: "Mersel", colors: "#123456" });
		expect(() => parseBrandDraft("an invented profile")).toThrow();
		expect(() => parseBrandDraft("[]")).toThrow();
		expect(() => parseBrandDraft('{"colors":"red"}')).toThrow();
	});
});
