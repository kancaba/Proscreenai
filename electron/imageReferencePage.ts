import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import net from "node:net";
export function publicAddress(ip: string) {
	if (net.isIP(ip) === 4) {
		const a = ip.split(".").map(Number);
		return !(
			a[0] === 0 ||
			a[0] === 10 ||
			a[0] === 127 ||
			a[0] >= 224 ||
			(a[0] === 169 && a[1] === 254) ||
			(a[0] === 172 && a[1] >= 16 && a[1] <= 31) ||
			(a[0] === 192 && a[1] === 168) ||
			(a[0] === 100 && a[1] >= 64 && a[1] <= 127) ||
			(a[0] === 198 && (a[1] === 18 || a[1] === 19))
		);
	}
	if (net.isIP(ip) === 6) return /^2[0-9a-f]{3}:/i.test(ip) && !/^2001:(db8|0:|2:)/i.test(ip);
	return false;
}
export async function fetchPublicResource(
	input: string,
	maxBytes = 1024 * 1024,
	redirects = 0,
): Promise<{ url: string; type: string; body: Buffer }> {
	const url = new URL(input);
	if (
		!["https:", "http:"].includes(url.protocol) ||
		url.username ||
		url.password ||
		(url.port && url.port !== "443" && url.port !== "80") ||
		redirects > 3
	)
		throw Error("Herkese açık bir HTTP/HTTPS sayfası girin.");
	const records = await dns.lookup(url.hostname, { all: true });
	if (!records.length || records.some((r) => !publicAddress(r.address)))
		throw Error("Yerel/özel ağ adresleri okunamaz.");
	const record = records[0];
	const response = await new Promise<{
		status: number;
		location?: string;
		type: string;
		body: Buffer;
	}>((resolve, reject) => {
		const req = (url.protocol === "https:" ? https : http).get(
			url,
			{
				family: record.family,
				lookup: (_host, _options, callback) => callback(null, record.address, record.family),
				headers: {
					"User-Agent": "Pro Screen AI/0.1 Reference Reader",
					Accept: "text/html,text/plain,text/css,image/svg+xml,image/png,image/jpeg,image/webp",
				},
			},
			(res) => {
				const chunks: Buffer[] = [];
				let size = 0;
				res.on("data", (chunk: Buffer) => {
					size += chunk.length;
					if (size > maxBytes) {
						req.destroy(Error("Sayfa çok büyük."));
						return;
					}
					chunks.push(chunk);
				});
				res.on("error", reject);
				res.on("end", () =>
					resolve({
						status: res.statusCode ?? 0,
						location: res.headers.location,
						type: String(res.headers["content-type"]),
						body: Buffer.concat(chunks),
					}),
				);
			},
		);
		const deadline = setTimeout(() => req.destroy(Error("Kaynak zaman aşımına uğradı.")), 20000);
		req.on("close", () => clearTimeout(deadline));
		req.setTimeout(15000, () => req.destroy(Error("Sayfa yanıt vermedi.")));
		req.on("error", reject);
	});
	if ([301, 302, 303, 307, 308].includes(response.status) && response.location)
		return fetchPublicResource(new URL(response.location, url).href, maxBytes, redirects + 1);
	if (response.status < 200 || response.status >= 300) throw Error("Kaynak alınamadı.");
	return {
		url: url.href,
		type: response.type.split(";")[0].trim().toLowerCase(),
		body: response.body,
	};
}
export async function readReferencePage(input: string): Promise<{ url: string; text: string }> {
	const response = await fetchPublicResource(input);
	if (!/(text\/html|text\/plain)/i.test(response.type)) throw Error("Sayfanın metni alınamadı.");
	const url = new URL(response.url);
	const text = response.body
		.toString("utf8")
		.replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
		.replace(/<[^>]*>/g, " ")
		.replace(/&nbsp;|&#160;/g, " ")
		.replace(/&amp;/g, "&")
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/\s+/g, " ")
		.trim()
		.slice(0, 12000);
	return { url: url.href, text };
}
