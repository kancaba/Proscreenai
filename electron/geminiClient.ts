import { geminiUsage, type ImageUsage } from "../src/lib/imageUsage";
import type { ImageResolution } from "../src/lib/imageGenerationSettings";
export const NANO_BANANA_MODEL = "gemini-3.1-flash-image";
export type GeminiInput = {
	prompt: string;
	references: string[];
	width: number;
	height: number;
	mode: "generate" | "edit";
	imageSize?: ImageResolution;
};
export function nearestAspect(width: number, height: number) {
	const ratios = ["1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
	return ratios.reduce((best, r) => {
		const [a, b] = r.split(":").map(Number),
			[c, d] = best.split(":").map(Number);
		return Math.abs(Math.log(width / height / (a / b))) <
			Math.abs(Math.log(width / height / (c / d)))
			? r
			: best;
	}, "1:1");
}
export function geminiPayload(input: GeminiInput) {
	return {
		contents: [
			{
				role: "user",
				parts: [
					{
						text: `${input.mode === "edit" ? "Edit the first attached source image. Preserve everything except the requested changes." : "Create one finished high-quality image. Infer the brand palette, lighting, composition and visual style from the brief and references."} Preserve real product geometry, labels and logo fidelity. Never invent prices, claims or certification. Visible text must use the user’s exact words, including Turkish characters. Return the finished IMAGE, not a description or prompt.\nUSER REQUEST:\n${input.prompt}`,
					},
					...input.references.map((ref) => {
						const match = ref.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
						if (!match || ref.length > 28 * 1024 * 1024)
							throw Error("Referans görseli geçersiz veya çok büyük.");
						return { inlineData: { mimeType: match[1], data: match[2] } };
					}),
				],
			},
		],
		generationConfig: {
			responseModalities: ["TEXT", "IMAGE"],
			imageConfig: { aspectRatio: nearestAspect(input.width, input.height), imageSize: input.imageSize ?? "1K" },
		},
	};
}
export function geminiError(status: number, wire: unknown) {
	const e = (wire as { error?: { status?: string; message?: string } })?.error;
	const message = e?.message ?? "";
	if (/leaked/i.test(message))
		return "Gemini anahtarı Google tarafından ifşa edilmiş olarak engellenmiş. Google AI Studio’da yeni anahtar oluşturup ayarlara ekleyin.";
	if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid/i.test(message))
		return "Gemini anahtarı veya bu model için erişim reddedildi. Anahtarın Gemini API erişimini kontrol edin.";
	if (status === 429)
		return "Gemini kota/hız sınırına ulaşıldı. Projenin faturalandırma ve model kotasını kontrol edin; daha sonra tekrar deneyin.";
	if (status === 404)
		return "Nano Banana modeli bu API hesabında bulunamadı veya erişime açık değil.";
	if (status === 400)
		return "Gemini görsel isteğini kabul etmedi. Anahtarın türünü, proje yetkilerini ve referansları kontrol edin.";
	return `Gemini isteği tamamlanamadı (${status}). Tekrar deneyebilirsiniz.`;
}
export function geminiImage(wire: unknown) {
	const w = wire as {
		promptFeedback?: { blockReason?: string };
		candidates?: {
			finishReason?: string;
			content?: {
				parts?: {
					inlineData?: { data?: string; mimeType?: string };
					inline_data?: { data?: string; mime_type?: string };
					text?: string;
					thought?: boolean;
				}[];
			};
		}[];
	};
	if (w.promptFeedback?.blockReason)
		throw Error("Gemini bu isteği içerik politikası nedeniyle engelledi. İsteğinizi düzenleyin.");
	for (const candidate of w.candidates ?? [])
		for (const part of candidate.content?.parts ?? []) {
			if (part.thought) continue;
			const image =
				part.inlineData ??
				(part.inline_data
					? { data: part.inline_data.data, mimeType: part.inline_data.mime_type }
					: undefined);
			if (
				image?.data &&
				/^image\/(png|jpeg|webp)$/.test(image.mimeType ?? "") &&
				/^[A-Za-z0-9+/=]+$/.test(image.data)
			)
				return `data:${image.mimeType};base64,${image.data}`;
		}
	throw Error(
		"Gemini bu istekte görsel döndürmedi. İsteği farklı ifade edin veya referans görsel ekleyin.",
	);
}
export async function generateGeminiImage(
	key: string,
	input: GeminiInput,
	signal: AbortSignal,
	fetcher: typeof fetch = fetch,
	onUsage?: (usage: ImageUsage) => void,
) {
	const response = await fetcher(
		`https://generativelanguage.googleapis.com/v1beta/models/${NANO_BANANA_MODEL}:generateContent`,
		{
			method: "POST",
			headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
			body: JSON.stringify(geminiPayload(input)),
			signal,
			redirect: "error",
		},
	);
	const reader = response.body?.getReader();
	if (!reader) throw Error("Gemini boş yanıt verdi.");
	const chunks: Uint8Array[] = [];
	let bytes = 0;
	while (true) {
		const r = await reader.read();
		if (r.done) break;
		bytes += r.value.byteLength;
		if (bytes > 50 * 1024 * 1024) {
			await reader.cancel();
			throw Error("Gemini yanıtı çok büyük.");
		}
		chunks.push(r.value);
	}
	let wire: unknown;
	try {
		wire = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		throw Error("Gemini yanıtı okunamadı.");
	}
	if (!response.ok) throw Error(geminiError(response.status, wire));
	const usage = geminiUsage(wire);
	if (usage) onUsage?.(usage);
	return geminiImage(wire);
}
