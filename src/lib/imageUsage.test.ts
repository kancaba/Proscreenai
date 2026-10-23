import { describe, it, expect } from "vitest";
import { geminiUsage, addAgentUsage } from "./imageUsage";
import { generateGeminiImage } from "../../electron/geminiClient";
describe("image usage reporting", () => {
	it("does not invent missing provider usage", () => {
		expect(geminiUsage({})).toBeUndefined();
		expect(
			geminiUsage({ usageMetadata: { promptTokenCount: -2, totalTokenCount: NaN } }),
		).toBeUndefined();
	});
	it("keeps reported total and cached input is never added again", () => {
		expect(
			geminiUsage({
				usageMetadata: {
					promptTokenCount: 100,
					candidatesTokenCount: 50,
					cachedContentTokenCount: 80,
					thoughtsTokenCount: 20,
					totalTokenCount: 170,
				},
			}),
		).toEqual({
			provider: "gemini",
			scope: "request",
			inputTokens: 100,
			outputTokens: 50,
			cachedTokens: 80,
			reasoningTokens: 20,
			totalTokens: 170,
		});
	});
	it("only computes total when both input and output are reported", () => {
		expect(geminiUsage({ usageMetadata: { promptTokenCount: 100 } })?.totalTokens).toBeUndefined();
		expect(
			geminiUsage({
				usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50, thoughtsTokenCount: 20 },
			})?.totalTokens,
		).toBe(170);
	});
	it("accumulates CLI turn usage without double-counting cache", () => {
		const a = addAgentUsage(undefined, { inputTokens: 1000, outputTokens: 50, cachedTokens: 800 });
		const b = addAgentUsage(a, { inputTokens: 2000, outputTokens: 100, cachedTokens: 1700 });
		expect(b).toEqual({
			provider: "codex",
			scope: "agent",
			inputTokens: 3000,
			outputTokens: 150,
			cachedTokens: 2500,
			totalTokens: 3150,
		});
	});
	it("captures usage even if Gemini returns no image", async () => {
		let usage;
		const wire = {
			usageMetadata: { promptTokenCount: 8, candidatesTokenCount: 3, totalTokenCount: 11 },
			candidates: [{ content: { parts: [{ text: "No image" }] } }],
		};
		await expect(
			generateGeminiImage(
				"test",
				{ prompt: "test", references: [], width: 100, height: 100, mode: "generate" },
				new AbortController().signal,
				(async () => new Response(JSON.stringify(wire))) as typeof fetch,
				(u) => {
					usage = u;
				},
			),
		).rejects.toThrow();
		expect(usage).toMatchObject({ totalTokens: 11 });
	});
});
