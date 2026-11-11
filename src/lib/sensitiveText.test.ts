import { describe, expect, it } from "vitest";
import {
	findSensitive,
	isCardNumber,
	isIban,
	isTckn,
	isVkn,
	maskSensitive,
	type OcrLine,
	type SensitiveHit,
	suggestBlurs,
} from "./sensitiveText";

/** A line of text as the recogniser returns it: words with boxes, left to right. */
function line(text: string, y = 0.2, x = 0.05): OcrLine {
	let left = x;
	const words = text.split(" ").map((word) => {
		const w = word.length * 0.009;
		const box = { text: word, x: left, y, w, h: 0.03 };
		left += w + 0.006;
		return box;
	});
	return { text, words };
}

const kinds = (lines: OcrLine[]) => findSensitive(lines).map((hit) => [hit.kind, hit.text]);

describe("check digits", () => {
	it("accepts real numbers and rejects look-alikes", () => {
		expect(isTckn("10000000146")).toBe(true);
		expect(isTckn("10000000147")).toBe(false);
		expect(isVkn("1234567808")).toBe(true);
		// A test number without a valid check digit; still found next to its "VKN" label.
		expect(isVkn("1234567801")).toBe(false);
		expect(isIban("TR33 0006 1005 1978 6457 8413 26")).toBe(true);
		expect(isIban("TR33 0006 1005 1978 6457 8413 27")).toBe(false);
		expect(isCardNumber("4111 1111 1111 1111")).toBe(true);
		expect(isCardNumber("4111 1111 1111 1112")).toBe(false);
		expect(isCardNumber("0000 0000 0000 0000")).toBe(false);
	});
});

describe("finding private details on a frame", () => {
	it("finds e-mails, phones, ID and tax numbers, IBANs, cards and keys", () => {
		expect(
			kinds([
				line("Alıcı: ahmet.yilmaz@mersel.io Tel: +90 532 123 45 67"),
				line("VKN 1234567801 TCKN 10000000146", 0.3),
				line("IBAN TR33 0006 1005 1978 6457 8413 26", 0.4),
				line("Kart 4111 1111 1111 1111 Token sk-live-9fA3kQ7xP2mL8vR4tZ1wY6bN", 0.5),
				line("Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N", 0.6),
			]),
		).toEqual([
			["email", "ahmet.yilmaz@mersel.io"],
			["phone", "+90 532 123 45 67"],
			["tckn", "10000000146"],
			["vkn", "1234567801"],
			["iban", "TR33 0006 1005 1978 6457 8413 26"],
			["card", "4111 1111 1111 1111"],
			["secret", "sk-live-9fA3kQ7xP2mL8vR4tZ1wY6bN"],
			["secret", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N"],
		]);
	});

	it("leaves amounts, dates, document numbers and ordinary text alone", () => {
		expect(
			kinds([
				line("Tutar 145,08 TRY Belge No MUB2026000000002"),
				line("05-11-2026 13:47:38 Temel Fatura Satış", 0.3),
				line("Kalan Kontör 199.999.990 Sayfa 50 / sayfa", 0.4),
				line("Fatura Oluştur Giden Kutusu Excel Rapor Listesi", 0.5),
				line("Sipariş 2026110512 adet 3", 0.6),
			]),
		).toEqual([]);
	});

	it("accepts a 10 or 11 digit number without check digits after its label", () => {
		expect(kinds([line("Vergi No: 1111111111")])).toEqual([["vkn", "1111111111"]]);
		expect(kinds([line("Ref 1111111111")])).toEqual([]);
	});

	it("covers only the detail's words, with a small margin", () => {
		const [hit] = findSensitive([line("Alıcı: ahmet@mersel.io bilgisi")]);
		const words = line("Alıcı: ahmet@mersel.io bilgisi").words;
		expect(hit.rect.x).toBeLessThan(words[1].x);
		expect(hit.rect.x).toBeGreaterThan(words[0].x + words[0].w - 0.01);
		expect(hit.rect.x + hit.rect.width).toBeLessThan(words[2].x + 0.005);
		expect(hit.rect.y).toBeLessThan(0.2);
	});
});

describe("blur suggestions over time", () => {
	const hit = (text: string, x = 0.1): SensitiveHit => ({
		kind: "email",
		text,
		rect: { x, y: 0.2, width: 0.2, height: 0.04 },
	});

	it("joins the frames showing the same detail and ignores one misread frame", () => {
		const frames = [0, 1000, 2000, 3000, 4000, 5000].map((timeMs) => ({
			timeMs,
			hits: timeMs === 2000 ? [] : timeMs <= 3000 ? [hit("a@b.io")] : [],
		}));
		const suggestions = suggestBlurs(frames, 1000, 6000);
		expect(suggestions).toHaveLength(1);
		expect(suggestions[0]).toMatchObject({
			id: "sensitive-1",
			kind: "email",
			text: "a@b.io",
			startMs: 0,
			endMs: 4000,
		});
		expect(suggestions[0].rect.width).toBeCloseTo(0.2);
		expect(suggestions[0].rect.height).toBeCloseTo(0.04);
	});

	it("starts a new suggestion when the detail moves or comes back later", () => {
		const frames = [
			{ timeMs: 0, hits: [hit("a@b.io")] },
			{ timeMs: 1000, hits: [hit("a@b.io", 0.5)] },
			{ timeMs: 6000, hits: [hit("a@b.io", 0.5)] },
		];
		const suggestions = suggestBlurs(frames, 1000, 7000);
		expect(suggestions.map((item) => [item.rect.x, item.startMs, item.endMs])).toEqual([
			[0.1, 0, 1000],
			[0.5, 0, 2000],
			[0.5, 5000, 7000],
		]);
	});

	it("hides most of the detail in the list", () => {
		expect(maskSensitive({ kind: "email", text: "ahmet@mersel.io" })).toBe("a•••@mersel.io");
		expect(maskSensitive({ kind: "card", text: "4111 1111 1111 1111" })).toBe("•••• 1111");
		expect(maskSensitive({ kind: "secret", text: "sk-live-abcdef123" })).toBe("sk-liv•••");
	});
});
