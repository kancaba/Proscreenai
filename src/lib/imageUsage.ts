export type ImageUsage = {
	provider: "codex" | "gemini" | "byteplus";
	scope: "agent" | "request";
	model?: string;
	generatedImages?: number;
	estimatedCostUSD?: number;
	priceDate?: string;
	priceSource?: string;
	inputTokens?: number;
	outputTokens?: number;
	cachedTokens?: number;
	reasoningTokens?: number;
	totalTokens?: number;
};
const count = (v: unknown) =>
	typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : undefined;
export function geminiUsage(wire: unknown): ImageUsage | undefined {
	const m = (wire as { usageMetadata?: Record<string, unknown> } | null)?.usageMetadata;
	if (!m) return;
	const inputTokens = count(m.promptTokenCount),
		outputTokens = count(m.candidatesTokenCount),
		cachedTokens = count(m.cachedContentTokenCount),
		reasoningTokens = count(m.thoughtsTokenCount),
		reported = count(m.totalTokenCount);
	if (inputTokens === undefined && outputTokens === undefined && reported === undefined) return;
	return {
		provider: "gemini",
		scope: "request",
		inputTokens,
		outputTokens,
		cachedTokens,
		reasoningTokens,
		totalTokens:
			reported ??
			(inputTokens !== undefined && outputTokens !== undefined
				? inputTokens + outputTokens + (reasoningTokens ?? 0)
				: undefined),
	};
}
export function addAgentUsage(
	previous: ImageUsage | undefined,
	e: { inputTokens: number; outputTokens: number; cachedTokens: number },
): ImageUsage {
	const inputTokens = (previous?.inputTokens ?? 0) + e.inputTokens,
		outputTokens = (previous?.outputTokens ?? 0) + e.outputTokens;
	return {
		provider: "codex",
		scope: "agent",
		inputTokens,
		outputTokens,
		cachedTokens: (previous?.cachedTokens ?? 0) + e.cachedTokens,
		totalTokens: inputTokens + outputTokens,
	};
}
export type ImageRunMetadata = {
	requestedResolution?:
		| import("./imageGenerationSettings").ImageResolution
		| import("./byteplusSettings").ByteplusSize;
	actualWidth?: number;
	actualHeight?: number;
	usage?: ImageUsage;
	durationMs?: number;
	provider?: "codex" | "gemini" | "byteplus";
	/** The poster template filled from the request ("Kusursuz poster yapısı"). */
	posterPrompt?: string;
};
