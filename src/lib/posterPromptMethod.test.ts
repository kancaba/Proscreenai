import { describe, expect, it } from "vitest";
import { POSTER_METHOD_DIRECTIVE, withPosterMethod } from "./posterPromptMethod";

describe("withPosterMethod", () => {
	it("leaves the prompt untouched when off", () => {
		expect(withPosterMethod("29 Ekim afişi", false)).toBe("29 Ekim afişi");
	});

	it("puts the planning rules before the brief and keeps the brief verbatim", () => {
		const prompt = withPosterMethod('HEADLINE: "yarın" + "cumhuriyet"', true);
		expect(prompt.startsWith(POSTER_METHOD_DIRECTIVE)).toBe(true);
		expect(prompt.endsWith('HEADLINE: "yarın" + "cumhuriyet"')).toBe(true);
	});

	it("leaves room for a full brief under the run limit", () => {
		expect(withPosterMethod("x".repeat(14500), true).length).toBeLessThanOrEqual(20000);
	});
});
