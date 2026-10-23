/** File hints emitted by the image tool or its final message. Callers MUST validate scope, freshness and image bytes. */
export function imageArtifactPaths(value: unknown): string[] {
	const found = new Set<string>();
	function visit(v: unknown, depth: number) {
		if (depth > 12) return;
		if (typeof v === "string" && v.length < 32000) {
			for (const match of v.matchAll(
				/(?:\/~|~\/|\/)[^\n\r"<>|]*?\.(?:png|jpe?g|webp)(?=[\s)\]"'`]|$)/gi,
			)) {
				const candidate = match[0].trim();
				if (candidate.startsWith("/")) found.add(candidate);
			}
		} else if (Array.isArray(v)) v.slice(0, 100).forEach((x) => visit(x, depth + 1));
		else if (v && typeof v === "object")
			Object.values(v)
				.slice(0, 100)
				.forEach((x) => visit(x, depth + 1));
	}
	visit(value, 0);
	return [...found];
}
