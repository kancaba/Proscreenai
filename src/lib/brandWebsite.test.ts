import { describe, it, expect, vi } from "vitest";
import {
	normalizeBrandUrl,
	parseBrandWebsite,
	websiteColors,
	readBrandWebsite,
} from "../../electron/brandWebsite";
import { fetchPublicResource } from "../../electron/imageReferencePage";
vi.mock("../../electron/imageReferencePage", () => ({ fetchPublicResource: vi.fn() }));
describe("website brand discovery", () => {
	it("accepts bare domains and rejects active schemes/credentials", () => {
		expect(normalizeBrandUrl(" mersel.io ")).toBe("https://mersel.io/");
		expect(normalizeBrandUrl("https://example.com/products#section")).toBe(
			"https://example.com/products",
		);
		for (const input of [
			"javascript:alert(1)",
			"file:///etc/passwd",
			"https://user:secret@example.com",
		])
			expect(() => normalizeBrandUrl(input)).toThrow();
	});
	it("reads metadata and homepage text without script instructions", () => {
		const p = parseBrandWebsite(
			`<title>Fallback</title><meta content="Example &amp; Brand" property="og:site_name"><meta name=description content='Products and services'><script>secret()</script><style>body{color:#abc}</style><h1>Useful details</h1>`,
			"https://example.com/",
		);
		expect(p.title).toBe("Example & Brand");
		expect(p.description).toBe("Products and services");
		expect(p.text).toContain("Useful details");
		expect(p.text).not.toContain("secret()");
	});
	it("ranks actual logo candidates before icons and resolves relative CDN links", () => {
		const p = parseBrandWebsite(
			`<link rel="icon" href="/icon.svg"><link href="/style.css" rel="stylesheet"><img src="/product.png"><img class="brand-logo" src="//cdn.example.com/logo.svg" alt="Brand logo">`,
			"https://example.com/",
		);
		expect(p.candidates[0].url).toBe("https://cdn.example.com/logo.svg");
		expect(p.candidates[0].kind).toBe("logo");
		expect(p.candidates[1].kind).toBe("icon");
		expect(p.styles).toEqual(["https://example.com/style.css"]);
	});
	it("extracts logo-like inline SVG without treating every decorative icon as a logo", () => {
		const p = parseBrandWebsite(
			'<svg class="brand-logo"><path fill="#aaa"/></svg><div>unrelated content</div><svg><circle/></svg>',
			"https://example.com",
		);
		expect(p.inline).toHaveLength(1);
	});
	it("prioritizes brand tokens, expands shorthand and reads RGB colors", () => {
		const colors = websiteColors(
			"--primary:#aBc;body{color:rgb(12, 34, 56);background:#ffffff}/* #987654 */",
		);
		expect(colors[0]).toBe("#AABBCC");
		expect(colors).toContain("#0C2238");
		expect(colors).not.toContain("#987654");
	});
	it("reads root homepage, downloads actual logo, and deduplicates inline assets", async () => {
		const svg = '<svg class="brand-logo"><path/></svg>';
		vi.mocked(fetchPublicResource).mockImplementation(async (url) => ({
			url,
			type: url.endsWith(".css") ? "text/css" : url.endsWith(".png") ? "image/png" : "text/html",
			body: Buffer.from(
				url.endsWith(".css")
					? '--primary:#123456;body{font-family:"Example Sans",sans-serif}'
					: url.endsWith(".png")
						? "PNG"
						: `<title>Brand</title>${svg}${svg}<link rel="stylesheet" href="/main.css"><img alt="Logo" src="/logo.png">`,
			),
		}));
		const p = await readBrandWebsite("example.com/product");
		expect(fetchPublicResource).toHaveBeenCalledWith("https://example.com/");
		expect(p.logos).toHaveLength(2);
		expect(p.colors).toContain("#123456");
		expect(p.fonts).toEqual(["Example Sans"]);
		expect(p.logos[1].data).toBe("data:image/png;base64,UE5H");
	});
	it("keeps useful page data when stylesheet or logo downloads fail", async () => {
		vi.mocked(fetchPublicResource).mockImplementation(async (url) => {
			if (url.endsWith("/"))
				return {
					url,
					type: "text/html",
					body: Buffer.from(
						'<title>Brand</title><link rel="stylesheet" href="/bad.css"><img alt="Logo" src="/bad.png">',
					),
				};
			throw Error("Blocked");
		});
		const p = await readBrandWebsite("example.com");
		expect(p.title).toBe("Brand");
		expect(p.warnings.length).toBeGreaterThan(0);
		expect(p.logos).toEqual([]);
	});
});
