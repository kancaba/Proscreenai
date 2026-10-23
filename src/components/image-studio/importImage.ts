export async function readStudioImage(file: File) {
	if (
		file.size > 20 * 1024 * 1024 ||
		!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(file.type)
	)
		throw Error("PNG, JPEG, WebP veya SVG seçin (en fazla 20 MB).");
	let src: string;
	if (file.type === "image/svg+xml") {
		if (file.size > 2 * 1024 * 1024) throw Error("SVG en fazla 2 MB olabilir.");
		const text = await file.text();
		if (/<!DOCTYPE|<!ENTITY/i.test(text))
			throw Error("SVG dış tanım içeriyor. PNG olarak ekleyin.");
		const parsed = new DOMParser().parseFromString(text, "image/svg+xml");
		if (
			parsed.querySelector("parsererror") ||
			parsed.documentElement.localName !== "svg" ||
			/@import/i.test(text) ||
			[...text.matchAll(/url\(([^)]*)\)/gi)].some(
				(m) =>
					!m[1]
						.trim()
						.replace(/^["']|["']$/g, "")
						.startsWith("#"),
			)
		)
			throw Error("SVG geçersiz veya dış kaynak içeriyor. PNG olarak ekleyin.");
		for (const node of [...parsed.querySelectorAll("*")]) {
			if (
				[
					"script",
					"foreignObject",
					"iframe",
					"object",
					"embed",
					"audio",
					"video",
					"animate",
					"set",
				].includes(node.localName)
			)
				throw Error("SVG etkin içerik barındırıyor. PNG olarak ekleyin.");
			for (const attr of [...node.attributes]) {
				if (
					/^on/i.test(attr.name) ||
					(/(?:^|:)href$/i.test(attr.name) &&
						!/^#|^data:image\/(?:png|jpeg|webp);base64,/.test(attr.value))
				)
					throw Error("SVG dış veya etkin içerik barındırıyor.");
			}
		}
		src =
			"data:image/svg+xml;base64," +
			btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(parsed))));
	} else
		src = await new Promise<string>((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(String(reader.result));
			reader.onerror = () => reject(Error("Görsel okunamadı."));
			reader.readAsDataURL(file);
		});
	const originalSrc = src;
	const image = new Image();
	image.src = src;
	await image.decode();
	if (!image.width || !image.height || image.width * image.height > 40_000_000)
		throw Error("Görsel en fazla 40 megapiksel olabilir.");
	if (file.type === "image/svg+xml") {
		const canvas = document.createElement("canvas");
		canvas.width = image.width;
		canvas.height = image.height;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw Error("SVG dönüştürülemedi");
		ctx.drawImage(image, 0, 0);
		src = canvas.toDataURL("image/png");
	}
	return { src, originalSrc, width: image.width, height: image.height };
}
