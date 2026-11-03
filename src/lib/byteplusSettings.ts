export const BYTEPLUS_MODELS = {
	"dola-seedream-5-0-flash-260915": {
		name: "Seedream 5.0 Flash",
		sizes: ["1K", "1.5K", "2K"],
		defaultSize: "1.5K",
		price: 0.018,
	},
	"seedream-5-0-lite-260128": {
		name: "Seedream 5.0 Lite",
		sizes: ["2K", "3K", "4K"],
		defaultSize: "2K",
		price: 0.035,
	},
	"dola-seedream-5-0-pro-260628": {
		name: "Seedream 5.0 Pro",
		sizes: ["1K", "1.5K", "2K"],
		defaultSize: "1.5K",
		price: 0.045,
	},
} as const;
export type ByteplusModel = keyof typeof BYTEPLUS_MODELS;
/**
 * Text models on the same ModelArk key that turn a request into Seedream's prompt and write the
 * short copy it must render (Seedream draws text well, but cannot decide what it should say).
 * Both read reference images. Prices per million tokens, from the pricing page.
 */
export const BYTEPLUS_WRITERS = {
	"dola-seed-2-1-turbo-260628": {
		name: "Seed 2.1 Turbo",
		note: "önerilen · ByteDance",
		inputPerM: 0.5,
		outputPerM: 2.5,
	},
	"glm-5-3-flash-260828": {
		name: "GLM-5.3 Flash",
		note: "daha ucuz",
		inputPerM: 0.15,
		outputPerM: 0.5,
	},
} as const;
export type ByteplusWriter = keyof typeof BYTEPLUS_WRITERS;
export const DEFAULT_BYTEPLUS_WRITER: ByteplusWriter = "dola-seed-2-1-turbo-260628";
/** Reserved before a prompt is written; the real cost from its token use replaces it. */
export const BYTEPLUS_WRITER_RESERVE_USD = 0.02;
export function isByteplusWriter(value: unknown): value is ByteplusWriter {
	return typeof value === "string" && Object.keys(BYTEPLUS_WRITERS).includes(value);
}
/** Cost of a written prompt from its token use. */
export function byteplusWriterCost(writer: ByteplusWriter, inputTokens: number, outputTokens: number) {
	const price = BYTEPLUS_WRITERS[writer];
	return Math.round(((inputTokens * price.inputPerM + outputTokens * price.outputPerM) / 1e6) * 1e6) / 1e6;
}
/** Who writes the prompt; settings saved before writers existed get the default. */
export function byteplusWriterOf(options: ByteplusOptions): ByteplusWriter | null {
	if (options.writer === "off") return null;
	return isByteplusWriter(options.writer) ? options.writer : DEFAULT_BYTEPLUS_WRITER;
}
export type ByteplusSize = "1K" | "1.5K" | "2K" | "3K" | "4K";
export const DEFAULT_BYTEPLUS_MODEL: ByteplusModel = "dola-seedream-5-0-flash-260915";
export const BYTEPLUS_PRICE_DATE = "2026-10-27";
export const BYTEPLUS_PRICE_SOURCE = "https://docs.byteplus.com/en/docs/modelark/model-pricing";
export function isByteplusModel(value: unknown): value is ByteplusModel {
	return typeof value === "string" && Object.keys(BYTEPLUS_MODELS).includes(value);
}
export function isByteplusSize(model: ByteplusModel, size: unknown): size is ByteplusSize {
	return (
		typeof size === "string" && (BYTEPLUS_MODELS[model].sizes as readonly string[]).includes(size)
	);
}
/** Conservative reservation for Pro: the actual pixel tier is checked after generation. */
export function byteplusEstimate(
	model: ByteplusModel,
	size: ByteplusSize,
	references: number,
	pixels?: number,
) {
	if (model !== "dola-seedream-5-0-pro-260628") return BYTEPLUS_MODELS[model].price;
	return (
		(pixels !== undefined ? (pixels > 2_610_000 ? 0.09 : 0.045) : size === "2K" ? 0.09 : 0.045) +
		Math.max(0, references - 1) * 0.003
	);
}
export const POSTER_TYPES = {
	free: { name: "Serbest tasarım", rule: "Follow the user's composition and intended purpose." },
	product: {
		name: "Ürün tanıtımı",
		rule: "Create a product advertising poster. Make the product the focal point, use a clear headline hierarchy and generous whitespace. Do not add unprovided copy.",
	},
	sale: {
		name: "Kampanya / indirim",
		rule: "Create a promotional poster. Prioritize the supplied offer and call to action. Use prices, dates, discounts and conditions ONLY when explicitly supplied; never invent them.",
	},
	event: {
		name: "Etkinlik afişi",
		rule: "Create an event poster. Prioritize the supplied title, then supplied date and venue. Never invent an event date, location or sponsor.",
	},
} as const;
export type PosterType = keyof typeof POSTER_TYPES;
export type ByteplusOptions = {
	model: ByteplusModel;
	size: ByteplusSize;
	posterType: PosterType;
	visibleText: string;
	watermark: boolean;
	budgetUSD: number;
	/** Text model that prepares the prompt and copy, or "off" to send the request as written. */
	writer?: ByteplusWriter | "off";
};
export const DEFAULT_BYTEPLUS_OPTIONS: ByteplusOptions = {
	model: DEFAULT_BYTEPLUS_MODEL,
	size: "1.5K",
	posterType: "free",
	visibleText: "",
	watermark: true,
	budgetUSD: 1,
	writer: DEFAULT_BYTEPLUS_WRITER,
};
export function isByteplusOptions(value: unknown): value is ByteplusOptions {
	if (!value || typeof value !== "object") return false;
	const x = value as ByteplusOptions;
	return (
		isByteplusModel(x.model) &&
		isByteplusSize(x.model, x.size) &&
		Object.keys(POSTER_TYPES).includes(x.posterType) &&
		typeof x.visibleText === "string" &&
		x.visibleText.length <= 2000 &&
		typeof x.watermark === "boolean" &&
		Number.isFinite(x.budgetUSD) &&
		x.budgetUSD >= 0 &&
		x.budgetUSD <= 10000 &&
		(x.writer === undefined || x.writer === "off" || isByteplusWriter(x.writer))
	);
}
export type ByteplusJobSummary = {
	id: string;
	state: "submitted" | "received" | "complete" | "failed" | "uncertain";
	model: ByteplusModel;
	size: ByteplusSize;
	estimatedCostUSD: number;
	createdAt: number;
	canRecover: boolean;
	/** Set for a prompt written by a text model rather than an image. */
	writer?: ByteplusWriter;
};
export type ByteplusLedger = { reservedUSD: number; jobs: ByteplusJobSummary[] };
