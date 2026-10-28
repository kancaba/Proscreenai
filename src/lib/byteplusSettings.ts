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
};
export const DEFAULT_BYTEPLUS_OPTIONS: ByteplusOptions = {
	model: DEFAULT_BYTEPLUS_MODEL,
	size: "1.5K",
	posterType: "free",
	visibleText: "",
	watermark: true,
	budgetUSD: 1,
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
		x.budgetUSD <= 10000
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
};
export type ByteplusLedger = { reservedUSD: number; jobs: ByteplusJobSummary[] };
