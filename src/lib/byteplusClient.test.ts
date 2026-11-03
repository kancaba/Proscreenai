import { describe, expect, it } from "vitest";
import {
	ByteplusRequestError,
	boundedBytes,
	byteplusPayload,
	downloadByteplusImage,
	requestByteplusImage,
	validateByteplusImageUrl,
} from "../../electron/byteplusClient";
import {
	BYTEPLUS_MODELS,
	byteplusEstimate,
	DEFAULT_BYTEPLUS_OPTIONS,
	isByteplusOptions,
} from "./byteplusSettings";

const input = () => ({
	prompt: "Ürünümü koru",
	references: [] as string[],
	width: 1080,
	height: 1350,
	mode: "generate" as const,
	options: { ...DEFAULT_BYTEPLUS_OPTIONS, visibleText: "İndirim\nŞimdi Keşfet" },
});
const imageUrl = "https://images.tos-ap-southeast-1.volces.com/result.png?signature=test";
describe("BytePlus API contract", () => {
	it("prepares one Flash image, preserves literal Turkish copy and reference roles", () => {
		const body = byteplusPayload({
			...input(),
			mode: "edit",
			referenceNames: ["product: Paket", "logo: İmza"],
			references: ["data:image/png;base64,YQ==", "data:image/png;base64,Yg=="],
		});
		expect(body.model).toBe(DEFAULT_BYTEPLUS_OPTIONS.model);
		expect(body.size).toBe("1.5K");
		expect(body.watermark).toBe(false);
		expect(
			byteplusPayload({ ...input(), options: { ...input().options, watermark: true } }).watermark,
		).toBe(true);
		expect(body).not.toHaveProperty("sequential_image_generation");
		expect(body).not.toHaveProperty("n");
		expect(body.image).toEqual(["data:image/png;base64,YQ==", "data:image/png;base64,Yg=="]);
		expect(body.prompt).toContain("Edit the FIRST");
		expect(body.prompt).toContain("product: Paket");
		expect(body.prompt).toContain(JSON.stringify("İndirim\nŞimdi Keşfet"));
		expect(body.prompt).toContain("1080:1350");
	});
	it("rejects unsupported sizes, missing edit references and remote inputs before network", () => {
		expect(() => byteplusPayload({ ...input(), mode: "edit" })).toThrow();
		expect(isByteplusOptions({ ...DEFAULT_BYTEPLUS_OPTIONS, size: "4K" })).toBe(false);
		expect(() =>
			byteplusPayload({ ...input(), references: ["https://example.com/ref.png"] }),
		).toThrow();
		expect(() => byteplusPayload({ ...input(), width: 8192, height: 16 })).toThrow();
		expect(isByteplusOptions({ ...DEFAULT_BYTEPLUS_OPTIONS, budgetUSD: NaN })).toBe(false);
	});
	it("disables sequential generation for Lite and reserves the correct Pro cost", () => {
		const body = byteplusPayload({
			...input(),
			options: { ...DEFAULT_BYTEPLUS_OPTIONS, model: "seedream-5-0-lite-260128", size: "4K" },
		});
		expect(body.sequential_image_generation).toBe("disabled");
		expect(byteplusEstimate("dola-seedream-5-0-pro-260628", "2K", 3)).toBeCloseTo(0.096);
		expect(byteplusEstimate("dola-seedream-5-0-pro-260628", "2K", 3, 2_000_000)).toBeCloseTo(0.051);
		expect(Object.keys(BYTEPLUS_MODELS)).toHaveLength(3);
	});
	it("sends credentials only to the API and downloads separately without authorization", async () => {
		const calls: { url: string; init?: RequestInit }[] = [];
		const fetcher = (async (url, init) => {
			calls.push({ url: String(url), init });
			return String(url).includes("/images/generations")
				? new Response(
						JSON.stringify({
							model: DEFAULT_BYTEPLUS_OPTIONS.model,
							data: [{ url: imageUrl }],
							usage: { generated_images: 1, total_tokens: 1024 },
						}),
					)
				: new Response("png-bytes", { headers: { "Content-Type": "image/png" } });
		}) as typeof fetch;
		const receipt = await requestByteplusImage(
			"fake-secret",
			input(),
			new AbortController().signal,
			fetcher,
		);
		await downloadByteplusImage(receipt.url, new AbortController().signal, fetcher);
		expect(calls).toHaveLength(2);
		expect(calls[0].init?.headers).toHaveProperty("Authorization", "Bearer fake-secret");
		expect(calls[0].init?.body).not.toContain("fake-secret");
		expect(calls[1].init?.headers).toBeUndefined();
		expect(calls[1].init?.redirect).toBe("error");
	});
	it("never retries a failed request and redacts server errors", async () => {
		let calls = 0;
		const fetcher = (async () => {
			calls++;
			return new Response('{"error":{"message":"fake-secret"}}', { status: 403 });
		}) as typeof fetch;
		try {
			await requestByteplusImage("fake-secret", input(), new AbortController().signal, fetcher);
			throw Error("Expected error");
		} catch (e) {
			expect(e).toBeInstanceOf(ByteplusRequestError);
			expect((e as ByteplusRequestError).uncertain).toBe(false);
			expect(String(e)).not.toContain("fake-secret");
		}
		expect(calls).toBe(1);
	});
	it("marks transport errors, invalid success responses and server failures as uncertain", async () => {
		for (const fetcher of [
			async () => {
				throw Error("secret");
			},
			async () => new Response("{}"),
			async () => new Response("bad", { status: 500 }),
		]) {
			await expect(
				requestByteplusImage(
					"secret",
					input(),
					new AbortController().signal,
					fetcher as typeof fetch,
				),
			).rejects.toMatchObject({ uncertain: true });
		}
	});
	it("blocks private output hosts, redirects, oversized streaming responses and expired downloads", async () => {
		for (const url of [
			"http://127.0.0.1/x",
			"https://localhost/x",
			"https://volces.com.evil.test/x",
			"https://user:secret@volces.com/x",
			"https://volces.com:8080/x",
		])
			expect(() => validateByteplusImageUrl(url)).toThrow();
		await expect(boundedBytes(new Response("abcd"), 3)).rejects.toThrow("boyut");
		await expect(
			downloadByteplusImage(
				imageUrl,
				new AbortController().signal,
				(async () => new Response("expired", { status: 403 })) as typeof fetch,
			),
		).rejects.toThrow("Yeni üretim");
	});
});
