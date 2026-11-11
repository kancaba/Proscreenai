/*
 * Finds private details in text read from video frames (e-mail addresses, phone numbers, Turkish
 * ID and tax numbers, IBANs, card numbers, API keys and tokens) and turns what stays on screen
 * into blur suggestions. Numbers are checked with their check digits where they have them, so
 * amounts, document numbers and dates are not suggested.
 */

export interface OcrWord {
	text: string;
	/** Fractions (0–1) of the frame, from its top-left corner. */
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface OcrLine {
	text: string;
	words: OcrWord[];
}

export type SensitiveKind = "email" | "phone" | "tckn" | "vkn" | "iban" | "card" | "secret";

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface SensitiveHit {
	kind: SensitiveKind;
	text: string;
	rect: Rect;
}

export interface SensitiveSuggestion extends SensitiveHit {
	id: string;
	startMs: number;
	endMs: number;
}

const digitsOf = (text: string) => text.replace(/\D/g, "");

/** Turkish ID number: 11 digits with two check digits. */
export function isTckn(value: string): boolean {
	const d = digitsOf(value);
	if (!/^[1-9]\d{10}$/.test(d)) return false;
	const n = d.split("").map(Number);
	const odd = n[0] + n[2] + n[4] + n[6] + n[8];
	const even = n[1] + n[3] + n[5] + n[7];
	if ((((odd * 7 - even) % 10) + 10) % 10 !== n[9]) return false;
	return n.slice(0, 10).reduce((sum, digit) => sum + digit, 0) % 10 === n[10];
}

/** Turkish tax number: 10 digits with a check digit. */
export function isVkn(value: string): boolean {
	const d = digitsOf(value);
	if (!/^\d{10}$/.test(d)) return false;
	let sum = 0;
	for (let i = 0; i < 9; i++) {
		const step = (Number(d[i]) + 9 - i) % 10;
		let weighted = (step * 2 ** (9 - i)) % 9;
		if (step !== 0 && weighted === 0) weighted = 9;
		sum += weighted;
	}
	return (10 - (sum % 10)) % 10 === Number(d[9]);
}

/** Card number: 13–19 digits passing the Luhn check. */
export function isCardNumber(value: string): boolean {
	const d = digitsOf(value);
	if (d.length < 13 || d.length > 19 || /^(\d)\1+$/.test(d)) return false;
	let sum = 0;
	for (let i = 0; i < d.length; i++) {
		let digit = Number(d[d.length - 1 - i]);
		if (i % 2 === 1) {
			digit *= 2;
			if (digit > 9) digit -= 9;
		}
		sum += digit;
	}
	return sum % 10 === 0;
}

/** IBAN with a valid mod-97 check. */
export function isIban(value: string): boolean {
	const compact = value.replace(/\s/g, "").toUpperCase();
	if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(compact)) return false;
	if (compact.startsWith("TR") && compact.length !== 26) return false;
	const moved = compact.slice(4) + compact.slice(0, 4);
	let remainder = 0;
	for (const char of moved) {
		const code = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
		for (const digit of code) remainder = (remainder * 10 + Number(digit)) % 97;
	}
	return remainder === 1;
}

/** A long run of letters and digits that looks generated (an API key or token), not a word or a number. */
function looksLikeSecret(token: string): boolean {
	if (token.length < 24 || /\s/.test(token)) return false;
	if (!/[a-z]/.test(token) || !/[A-Z]/.test(token) || !/\d/.test(token)) return false;
	return new Set(token).size >= 14;
}

interface Rule {
	kind: SensitiveKind;
	pattern: RegExp;
	accept?: (match: string, before: string) => boolean;
}

const KEYWORD_VKN = /(vkn|vergi\s*(no|numaras)|v\.k\.n)/i;
const KEYWORD_TCKN = /(tckn|tc\s*kimlik|t\.c\.|kimlik\s*no)/i;

const RULES: Rule[] = [
	{ kind: "email", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g },
	{
		kind: "iban",
		pattern: /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b/g,
		accept: (match) => isIban(match),
	},
	{ kind: "card", pattern: /\b\d(?:[ -]?\d){12,18}\b/g, accept: (match) => isCardNumber(match) },
	{
		kind: "secret",
		pattern:
			/\b(?:(?:sk|pk|rk)[-_](?:live|test|proj)[-_][A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{30,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,})/g,
	},
	{ kind: "secret", pattern: /[A-Za-z0-9_\-+/=]{24,}/g, accept: (match) => looksLikeSecret(match) },
	{
		kind: "tckn",
		pattern: /\b[1-9]\d{10}\b/g,
		accept: (match, before) => isTckn(match) || KEYWORD_TCKN.test(before),
	},
	{
		kind: "vkn",
		pattern: /\b\d{10}\b/g,
		accept: (match, before) => isVkn(match) || KEYWORD_VKN.test(before),
	},
	{
		kind: "phone",
		pattern: /(?:\+\d{1,3}[\s.-]?)?\(?0?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}\b/g,
		accept: (match) => {
			const d = digitsOf(match);
			// A Turkish mobile or landline (5xx, 2xx–4xx), with or without the country code.
			const local =
				d.startsWith("90") && d.length === 12
					? d.slice(2)
					: d.startsWith("0") && d.length === 11
						? d.slice(1)
						: d;
			return (
				local.length === 10 &&
				/^[2-5]/.test(local) &&
				(match.trim().startsWith("+") || /[\s.()-]/.test(match) || d.startsWith("0"))
			);
		},
	},
];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** The rectangle around some words, with a small margin so the edges of letters are covered too. */
function cover(words: OcrWord[]): Rect {
	const left = Math.min(...words.map((word) => word.x));
	const top = Math.min(...words.map((word) => word.y));
	const right = Math.max(...words.map((word) => word.x + word.w));
	const bottom = Math.max(...words.map((word) => word.y + word.h));
	const height = bottom - top;
	// About half a space at the sides, so the label before ("Tel:") stays readable.
	const padX = 0.003;
	const padY = height * 0.25;
	const x = clamp01(left - padX);
	const y = clamp01(top - padY);
	return { x, y, width: clamp01(right + padX) - x, height: clamp01(bottom + padY) - y };
}

/** Private details in the lines of one frame, each with the rectangle that covers it. */
export function findSensitive(lines: OcrLine[]): SensitiveHit[] {
	const hits: SensitiveHit[] = [];
	for (const line of lines) {
		if (line.words.length === 0) continue;
		// The words joined by single spaces, remembering where each word starts.
		const starts: number[] = [];
		let text = "";
		for (const word of line.words) {
			if (text) text += " ";
			starts.push(text.length);
			text += word.text;
		}
		const taken: Array<[number, number]> = [];
		for (const rule of RULES) {
			for (const match of text.matchAll(rule.pattern)) {
				const start = match.index ?? 0;
				const end = start + match[0].length;
				if (taken.some(([a, b]) => start < b && end > a)) continue;
				if (rule.accept && !rule.accept(match[0], text.slice(Math.max(0, start - 24), start)))
					continue;
				const words = line.words.filter(
					(word, i) => starts[i] < end && starts[i] + word.text.length > start,
				);
				if (words.length === 0) continue;
				taken.push([start, end]);
				hits.push({ kind: rule.kind, text: match[0].trim(), rect: cover(words) });
			}
		}
	}
	return hits;
}

const keyOf = (hit: SensitiveHit) => `${hit.kind}:${hit.text.replace(/\s/g, "").toLowerCase()}`;
const centerDistance = (a: Rect, b: Rect) =>
	Math.hypot(a.x + a.width / 2 - (b.x + b.width / 2), a.y + a.height / 2 - (b.y + b.height / 2));
const union = (a: Rect, b: Rect): Rect => {
	const x = Math.min(a.x, b.x);
	const y = Math.min(a.y, b.y);
	return {
		x,
		y,
		width: Math.max(a.x + a.width, b.x + b.width) - x,
		height: Math.max(a.y + a.height, b.y + b.height) - y,
	};
};

/**
 * Blur suggestions from the hits of frames read every `intervalMs`: the same detail in about the
 * same place on following frames is one suggestion for that whole time. One frame without it
 * (a misread) does not end it; moving elsewhere (scrolling) starts a new one.
 */
export function suggestBlurs(
	frames: Array<{ timeMs: number; hits: SensitiveHit[] }>,
	intervalMs: number,
	durationMs: number,
): SensitiveSuggestion[] {
	const open: Array<SensitiveHit & { key: string; first: number; last: number }> = [];
	const done: Array<SensitiveHit & { first: number; last: number }> = [];
	const sorted = [...frames].sort((a, b) => a.timeMs - b.timeMs);
	for (const frame of sorted) {
		for (let i = open.length - 1; i >= 0; i--) {
			if (frame.timeMs - open[i].last > intervalMs * 2 + 1) done.push(...open.splice(i, 1));
		}
		for (const hit of frame.hits) {
			const key = keyOf(hit);
			const same = open.find(
				(item) =>
					item.key === key &&
					item.last < frame.timeMs &&
					centerDistance(item.rect, hit.rect) < 0.03,
			);
			if (same) {
				same.last = frame.timeMs;
				same.rect = union(same.rect, hit.rect);
			} else {
				open.push({ ...hit, key, first: frame.timeMs, last: frame.timeMs });
			}
		}
	}
	done.push(...open);
	return done
		.sort((a, b) => a.first - b.first || a.rect.y - b.rect.y)
		.map((item, index) => ({
			id: `sensitive-${index + 1}`,
			kind: item.kind,
			text: item.text,
			rect: item.rect,
			// It appeared after the frame before and left before the frame after: cover both gaps,
			// since a little extra blur is better than a moment of the detail showing.
			startMs: Math.max(0, Math.round(item.first - intervalMs)),
			endMs: Math.min(durationMs, Math.round(item.last + intervalMs)),
		}))
		.filter((item) => item.endMs > item.startMs);
}

/** The detail with most of it hidden, for the list the user picks from. */
export function maskSensitive(hit: Pick<SensitiveHit, "kind" | "text">): string {
	if (hit.kind === "email") {
		const [name, domain] = hit.text.split("@");
		return `${name.slice(0, 1)}•••@${domain}`;
	}
	if (hit.kind === "secret") return `${hit.text.slice(0, 6)}•••`;
	const digits = digitsOf(hit.text);
	return `•••• ${digits.slice(-4) || hit.text.slice(-4)}`;
}
