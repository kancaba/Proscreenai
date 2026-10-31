import { describe, expect, it } from "vitest";
import {
	cleanFilledPoster,
	POSTER_METHOD_DIRECTIVE,
	posterFillInstruction,
	withFilledPoster,
	withPosterMethod,
} from "./posterPromptMethod";

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

describe("filling the template from the request", () => {
	it("asks for the canvas's real aspect and keeps the request last", () => {
		const instruction = posterFillInstruction('29 Ekim afişi, başlık: "ileri"', 1080, 1350);
		expect(instruction).toContain("Vertical 4:5 aspect ratio");
		expect(instruction.trim().endsWith('29 Ekim afişi, başlık: "ileri"')).toBe(true);
		expect(posterFillInstruction("x", 1920, 1080)).toContain("Horizontal 16:9");
	});

	it("takes the filled prompt out of fences and preambles, and rejects partial answers", () => {
		const filled =
			"A minimalist poster.\nCONCEPT: a flame becomes a sunrise.\nNEGATIVE: no watermark.";
		expect(cleanFilledPoster(`Here it is:\n\`\`\`\n${filled}\n\`\`\``)).toBe(filled);
		expect(cleanFilledPoster("CONCEPT: only half")).toBeUndefined();
		expect(cleanFilledPoster(`${filled}${"x".repeat(7000)}`)).toBeUndefined();
	});

	it("sends the user's words first and the filled template after them", () => {
		const prompt = withFilledPoster("isteğim", "CONCEPT: c\nNEGATIVE: n");
		expect(prompt.startsWith("isteğim")).toBe(true);
		expect(prompt.endsWith("CONCEPT: c\nNEGATIVE: n")).toBe(true);
	});
});
