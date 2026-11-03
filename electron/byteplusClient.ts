import { type ByteplusInput, byteplusPayload } from "../src/lib/byteplusPayload";
import { BYTEPLUS_MODELS, BYTEPLUS_WRITERS } from "../src/lib/byteplusSettings";
import {
	BYTEPLUS_CHAT_ENDPOINT,
	parseSeedreamWriting,
	type SeedreamWriterInput,
	seedreamWriterPayload,
} from "../src/lib/byteplusWriter";

export { byteplusPayload } from "../src/lib/byteplusPayload";
export const BYTEPLUS_ENDPOINT =
	"https://ark.ap-southeast.bytepluses.com/api/v3/images/generations";
export class ByteplusRequestError extends Error {
	constructor(
		message: string,
		readonly uncertain: boolean,
	) {
		super(message);
	}
}
export function byteplusError(status: number) {
	if (status === 401 || status === 403)
		return "ModelArk API anahtarı veya model erişimi reddedildi. ECS AK/SK yerine ModelArk API anahtarını kontrol edin.";
	if (status === 429) return "BytePlus kota veya hız sınırına ulaşıldı. Otomatik tekrar yapılmadı.";
	if (status === 404)
		return "Seçilen Seedream modeli bu hesapta veya bölgede bulunamadı. Başka modele otomatik geçilmedi.";
	if (status === 400 || status === 422)
		return "BytePlus isteği reddetti. Model erişimini, boyutu, referansları ve içerik kurallarını kontrol edin.";
	return "BytePlus yanıtı alınamadı. İstek sonucu belirsiz olabilir; otomatik tekrar yapılmadı.";
}
/** Bounded reads also cover responses without a Content-Length header. */
export async function boundedBytes(response: Response, limit: number) {
	if (Number(response.headers.get("content-length")) > limit)
		throw Error("BytePlus yanıtı boyut sınırını aşıyor.");
	if (!response.body) throw Error("BytePlus boş yanıt döndürdü.");
	const reader = response.body.getReader(),
		chunks: Uint8Array[] = [];
	let size = 0;
	try {
		while (true) {
			const part = await reader.read();
			if (part.done) break;
			size += part.value.byteLength;
			if (size > limit) throw Error("BytePlus yanıtı boyut sınırını aşıyor.");
			chunks.push(part.value);
		}
	} finally {
		await reader.cancel().catch(() => {
			/* The stream may already have closed. */
		});
	}
	return Buffer.concat(chunks);
}
export function validateByteplusImageUrl(value: unknown): string {
	if (typeof value !== "string" || value.length > 16000) throw Error("Geçersiz çıktı adresi.");
	const url = new URL(value);
	const domains = [
		"bytepluses.com",
		"volces.com",
		"bytepluscdn.com",
		"byteoversea.com",
		"ibytedtos.com",
	];
	if (
		url.protocol !== "https:" ||
		url.username ||
		url.password ||
		(url.port && url.port !== "443") ||
		!domains.some((d) => url.hostname === d || url.hostname.endsWith(`.${d}`))
	)
		throw Error("Görsel adresi güvenilir BytePlus depolama alanında değil.");
	return url.href;
}
export type ByteplusReceipt = {
	url: string;
	model: string;
	usage: { generated_images: number; output_tokens?: number; total_tokens?: number };
	size?: string;
};
export async function requestByteplusImage(
	key: string,
	input: ByteplusInput,
	signal: AbortSignal,
	fetcher: typeof fetch = fetch,
): Promise<ByteplusReceipt> {
	const payload = byteplusPayload(input);
	let response: Response;
	try {
		response = await fetcher(BYTEPLUS_ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
			body: JSON.stringify(payload),
			signal,
			redirect: "error",
		});
	} catch {
		throw new ByteplusRequestError(
			"BytePlus bağlantısı kesildi veya zaman aşımına uğradı. Üretim sonucu belirsiz; yeniden gönderilmedi.",
			true,
		);
	}
	if (!response.ok) {
		await response.body?.cancel().catch(() => {
			/* The stream may already have closed. */
		});
		throw new ByteplusRequestError(
			byteplusError(response.status),
			response.status >= 500 || response.status === 408,
		);
	}
	try {
		const wire = JSON.parse((await boundedBytes(response, 2 * 1024 * 1024)).toString("utf8"));
		if (!Array.isArray(wire.data) || wire.data.length !== 1 || wire.data[0].error)
			throw Error("Missing image");
		const count = wire.usage?.generated_images;
		if (count !== undefined && count !== 1) throw Error("Unexpected image count");
		const token = (n: unknown) =>
			typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : undefined;
		return {
			url: validateByteplusImageUrl(wire.data[0].url),
			model:
				typeof wire.model === "string"
					? wire.model.slice(0, 200)
					: BYTEPLUS_MODELS[input.options.model].name,
			size: typeof wire.data[0].size === "string" ? wire.data[0].size.slice(0, 40) : undefined,
			usage: {
				generated_images: 1,
				output_tokens: token(wire.usage?.output_tokens),
				total_tokens: token(wire.usage?.total_tokens),
			},
		};
	} catch {
		throw new ByteplusRequestError(
			"BytePlus geçerli tek görsel yanıtı döndürmedi. Sonuç belirsiz; yeniden üretim yapılmadı.",
			true,
		);
	}
}
export async function downloadByteplusImage(
	url: string,
	signal: AbortSignal,
	fetcher: typeof fetch = fetch,
) {
	try {
		const response = await fetcher(validateByteplusImageUrl(url), { signal, redirect: "error" });
		if (
			!response.ok ||
			!/^image\/(png|jpeg|webp)(?:;|$)/i.test(response.headers.get("content-type") || "")
		) {
			await response.body?.cancel().catch(() => {
				/* The stream may already have closed. */
			});
			throw Error("Image unavailable");
		}
		return await boundedBytes(response, 48 * 1024 * 1024);
	} catch {
		throw Error(
			"Üretilen görsel indirilemedi. Yeni üretim yerine 'Sonucu kurtar' ile indirmeyi tekrar deneyin; bağlantı 24 saat geçerlidir.",
		);
	}
}
/** Asks a ModelArk text model to prepare Seedream's prompt and copy; returns it with its token use. */
export async function requestByteplusWriting(
	key: string,
	input: SeedreamWriterInput,
	signal: AbortSignal,
	fetcher: typeof fetch = fetch,
) {
	let response: Response;
	try {
		response = await fetcher(BYTEPLUS_CHAT_ENDPOINT, {
			method: "POST",
			headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
			body: JSON.stringify(seedreamWriterPayload(input)),
			signal,
			redirect: "error",
		});
	} catch {
		throw new ByteplusRequestError("Prompt yazarına bağlanılamadı veya zaman aşımına uğradı.", true);
	}
	if (!response.ok) {
		await response.body?.cancel().catch(() => {
			/* The stream may already have closed. */
		});
		throw new ByteplusRequestError(
			response.status === 404
				? `${BYTEPLUS_WRITERS[input.writer].name} bu hesapta açık değil. ModelArk konsolunda modeli etkinleştirin veya prompt yazarını değiştirin.`
				: byteplusError(response.status),
			response.status >= 500 || response.status === 408,
		);
	}
	let wire: {
		choices?: { message?: { content?: unknown } }[];
		usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
	};
	try {
		wire = JSON.parse((await boundedBytes(response, 2 * 1024 * 1024)).toString("utf8"));
	} catch {
		throw new ByteplusRequestError("Prompt yazarı okunabilir bir yanıt döndürmedi.", false);
	}
	const token = (n: unknown) => (typeof n === "number" && Number.isSafeInteger(n) && n >= 0 ? n : 0);
	const content = wire.choices?.[0]?.message?.content;
	return {
		writing: typeof content === "string" ? parseSeedreamWriting(content) : undefined,
		inputTokens: token(wire.usage?.prompt_tokens),
		outputTokens: token(wire.usage?.completion_tokens),
	};
}
