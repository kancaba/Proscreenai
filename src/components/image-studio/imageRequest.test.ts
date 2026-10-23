import { describe, it, expect } from "vitest";
import { inferImageFormat, inferImageMode } from "./imageRequest";
import { imageArtifactPaths } from "../../lib/agent/imageArtifacts";
describe("single prompt image requests", () => {
	it("infers explicit social formats and keeps unspecified canvas", () => {
		expect(inferImageFormat("Instagram post oluştur", 100, 100)).toEqual({
			width: 1080,
			height: 1350,
		});
		expect(inferImageFormat("9:16 story", 100, 100)).toEqual({ width: 1080, height: 1920 });
		expect(inferImageFormat("ürün görseli", 1200, 800)).toEqual({ width: 1200, height: 800 });
	});
	it("distinguishes referenced editing from a new campaign", () => {
		expect(inferImageMode("Rengini değiştir", true, false)).toBe("edit");
		expect(inferImageMode("Bu ürün için kampanya oluştur", true, false)).toBe("generate");
		expect(inferImageMode("Daha sade olsun", true, true)).toBe("edit");
	});
	it("collects artifact hints without accepting them as trusted files", () => {
		expect(
			imageArtifactPaths({
				item: { type: "image_generation", output_file: "/tmp/job/result.png" },
			}),
		).toEqual(["/tmp/job/result.png"]);
		expect(imageArtifactPaths({ text: "![result](/tmp/job/blue.png)" })).toEqual([
			"/tmp/job/blue.png",
		]);
		expect(imageArtifactPaths({ data: "not an image" })).toEqual([]);
	});
});
