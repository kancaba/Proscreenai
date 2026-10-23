import { fetchPublicResource } from "./imageReferencePage";
import type { WebsiteBrand, WebsiteLogo } from "../src/lib/brandWebsiteTypes";
export function normalizeBrandUrl(value: string) {
	const input = value.trim();
	if (!input || input.length > 2048) throw Error("Geçerli bir site adresi girin.");
	const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(input) ? input : `https://${input}`);
	if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
		throw Error("HTTP/HTTPS site adresi girin.");
	url.hash = "";
	return url.href;
}
function decode(s: string) {
	return s
		.replace(/&amp;/gi, "&")
		.replace(/&quot;/gi, '"')
		.replace(/&#39;|&apos;/gi, "'")
		.replace(/&lt;/gi, "<")
		.replace(/&gt;/gi, ">")
		.replace(/&nbsp;/gi, " ")
		.replace(/&#(x[0-9a-f]+|\d+);/gi, (_m, n) => {
			const v = n[0] === "x" ? parseInt(n.slice(1), 16) : Number(n);
			return v > 0 && v <= 0x10ffff ? String.fromCodePoint(v) : "";
		});
}
function attrs(tag: string) {
	const out: Record<string, string> = {};
	for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))
		out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4]);
	return out;
}
function resolveUrl(raw: string, base: string) {
	try {
		const u = new URL(raw, base);
		return ["http:", "https:"].includes(u.protocol) && !u.username && !u.password ? u.href : null;
	} catch {
		return null;
	}
}
export function websiteColors(css: string) {
	const scores = new Map<string, number>();
	// Prefer named brand/theme tokens and actual foreground/background declarations over arbitrary numbers in scripts.
	for (const m of css.matchAll(
		/(?:--[\w-]+|(?:background(?:-color)?|color|fill|stroke|border-color))\s*:\s*([^;}]+)/gi,
	)) {
		const weight = /brand|primary|accent|theme|secondary/i.test(m[0]) ? 8 : 1;
		for (const hex of m[1].matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})(?![0-9a-f])/gi)) {
			let c = hex[1].toUpperCase();
			if (c.length === 3) c = [...c].map((v) => v + v).join("");
			scores.set("#" + c, (scores.get("#" + c) || 0) + weight);
		}
		for (const rgb of m[1].matchAll(/rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/gi)) {
			const parts = rgb.slice(1, 4).map(Number);
			if (parts.some((v) => v > 255)) continue;
			const c =
				"#" +
				parts
					.map((n) => n.toString(16).padStart(2, "0"))
					.join("")
					.toUpperCase();
			scores.set(c, (scores.get(c) || 0) + weight);
		}
	}
	return [...scores]
		.sort((a, b) => b[1] - a[1])
		.map(([c]) => c)
		.slice(0, 8);
}
export function parseBrandWebsite(html: string, base: string) {
	const meta: Record<string, string> = {},
		candidates: { url: string; kind: "logo" | "icon"; score: number }[] = [],
		styles: string[] = [];
	for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
		const a = attrs(m[0]);
		meta[(a.property || a.name || "").toLowerCase()] = a.content || "";
	}
	for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
		const a = attrs(m[0]),
			raw = a.src || a["data-src"] || "",
			hint = [raw, a.alt, a.class, a.id].join(" ");
		if (!/logo|brand|logotype/i.test(hint)) continue;
		const url = resolveUrl(raw, base);
		if (url)
			candidates.push({
				url,
				kind: "logo",
				score:
					(/logo/i.test(a.alt || "") ? 10 : 0) +
					(/logo/i.test(raw) ? 8 : 0) +
					(/header|navbar/i.test(html.slice(Math.max(0, m.index! - 800), m.index)) ? 4 : 0),
			});
	}
	for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
		const a = attrs(m[0]),
			url = resolveUrl(a.href || "", base);
		if (!url) continue;
		if (/stylesheet/i.test(a.rel || "")) styles.push(url);
		if (/(?:^|\s)(?:icon|apple-touch-icon|shortcut)(?:\s|$)/i.test(a.rel || ""))
			candidates.push({ url, kind: "icon", score: -5 });
	}
	let text = decode(
		html
			.replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
			.replace(/<[^>]*>/g, " "),
	)
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 12000);
	const inline = [...html.matchAll(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi)]
		.filter(
			(m) =>
				/logo|brand/i.test(m[0].slice(0, 600)) ||
				/<(?:a|div|span)\b[^>]*(?:logo|brand)[^>]*>\s*$/i.test(
					html.slice(Math.max(0, m.index! - 500), m.index),
				),
		)
		.slice(0, 2)
		.map((m) => m[0]);
	const title =
		meta["og:site_name"] ||
		decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "")
			.replace(/<[^>]*>/g, "")
			.trim();
	const css =
		[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join("\n") +
		"\n" +
		[...html.matchAll(/\bstyle\s*=\s*["']([^"']*)["']/gi)].map((m) => m[1]).join("\n");
	if (meta["theme-color"]) text = `Theme color: ${meta["theme-color"]}\n${text}`;
	return {
		title: title.slice(0, 300),
		description: (meta.description || meta["og:description"] || "").slice(0, 2000),
		text,
		candidates: candidates
			.sort((a, b) => b.score - a.score)
			.filter((a, i, all) => all.findIndex((b) => b.url === a.url) === i)
			.slice(0, 6),
		styles: [...new Set(styles)].slice(0, 3),
		inline,
		css: css + `\n--theme-color: ${meta["theme-color"] || ""};`,
	};
}
export async function readBrandWebsite(input: string): Promise<WebsiteBrand> {
	const normalized = normalizeBrandUrl(input),
		home = new URL("/", normalized).href,
		warnings: string[] = [];
	const response = await fetchPublicResource(home);
	if (!/text\/html/i.test(response.type)) throw Error("Ana sayfa HTML olarak okunamadı.");
	const parsed = parseBrandWebsite(response.body.toString("utf8"), response.url);
	let css = parsed.css;
	const sheets = await Promise.allSettled(
		parsed.styles.map((url) => fetchPublicResource(url, 384 * 1024)),
	);
	for (const result of sheets)
		if (result.status === "fulfilled" && /text\/css|text\/plain/i.test(result.value.type))
			css += "\n" + result.value.body.toString("utf8");
		else warnings.push("Bir stil dosyası okunamadı; palet eksik olabilir.");
	const colors = websiteColors(css),
		fonts = [
			...new Set(
				[...css.matchAll(/font-family\s*:\s*([^;}]+)/gi)]
					.map((m) => m[1].trim().replace(/["']/g, "").split(",")[0].trim())
					.filter(
						(f) =>
							!/[{}<>]|url\(|var\(/i.test(f) &&
							!/^(inherit|initial|sans-serif|serif|monospace|system-ui|ui-[\w-]+)$/i.test(f),
					)
					.map((f) => f.slice(0, 160)),
			),
		].slice(0, 5);
	const logos: WebsiteLogo[] = parsed.inline.map((svg, i) => ({
		name: `Site logosu ${i + 1}.svg`,
		url: response.url + "#inline-logo-" + i,
		mime: "image/svg+xml",
		data: "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64"),
		kind: "logo",
	}));
	const downloads = await Promise.allSettled(
		parsed.candidates.slice(0, 4).map(async (c) => {
			const r = await fetchPublicResource(c.url, 2 * 1024 * 1024);
			const mime = r.type;
			if (
				![
					"image/svg+xml",
					"image/png",
					"image/jpeg",
					"image/webp",
					"image/x-icon",
					"image/vnd.microsoft.icon",
				].includes(mime)
			)
				throw Error("Desteklenmeyen logo biçimi.");
			if (/icon/.test(mime) && mime !== "image/svg+xml") throw Error("ICO simgesi atlandı.");
			return {
				name: `${c.kind === "logo" ? "Site logosu" : "Site simgesi"}.${mime === "image/svg+xml" ? "svg" : mime.split("/")[1]}`,
				url: r.url,
				mime,
				data: `data:${mime};base64,${r.body.toString("base64")}`,
				kind: c.kind,
			};
		}),
	);
	for (const r of downloads)
		if (r.status === "fulfilled" && !logos.some((l) => l.data === r.value.data))
			logos.push(r.value);
	if (!logos.length)
		warnings.push("İndirilebilir SVG/PNG logo bulunamadı; elle logo ekleyebilirsin.");
	if (!colors.length) warnings.push("CSS içinde renk paleti bulunamadı; elle tamamlayabilirsin.");
	return {
		url: response.url,
		title: parsed.title,
		description: parsed.description,
		text: parsed.text,
		colors,
		fonts,
		logos: logos.filter((l, i, all) => all.findIndex((v) => v.data === l.data) === i).slice(0, 4),
		warnings,
	};
}
