export type Layer = {
	id: string;
	kind: "text" | "image" | "rect" | "ellipse" | "arrow";
	name: string;
	x: number;
	y: number;
	width: number;
	height: number;
	rotation: number;
	opacity: number;
	visible: boolean;
	locked: boolean;
	color: string;
	text: string;
	font: string;
	fontSize: number;
	src?: string;
	imageRole?: "artwork" | "overlay";
	bold?: boolean;
	italic?: boolean;
	underline?: boolean;
	align?: "left" | "center" | "right";
	lineHeight?: number;
	letterSpacing?: number;
	strokeWidth?: number;
	strokeColor?: string;
	shadow?: boolean;
	cornerRadius?: number;
	flipX?: boolean;
	flipY?: boolean;
	aspectLock?: boolean;
	mask?: "rect" | "ellipse";
	crop?: { x: number; y: number; width: number; height: number };
};
export type ImageBrief = {
	imageSize?: import("../../lib/imageGenerationSettings").ImageResolution;
	provider?: "gemini" | "codex";
	styleLocked?: boolean;
	styleVersion?: number;
	brand: string;
	palette: string;
	style: string;
	brief: string;
	copy: string;
	prompt: string;
	pageUrl: string;
	pageText: string;
	refs: string[];
};
export type ImageDocument = {
	version: 1;
	ai?: ImageBrief;
	name: string;
	width: number;
	height: number;
	background: string;
	transparent?: boolean;
	layers: Layer[];
};
export const emptyDocument = (): ImageDocument => ({
	version: 1,
	name: "Yeni tasarım",
	width: 1080,
	height: 1080,
	background: "#f3eee7",
	layers: [],
});
export function newLayer(kind: Layer["kind"]): Layer {
	return {
		id: crypto.randomUUID(),
		kind,
		name: { text: "Yazı", image: "Görsel", rect: "Dikdörtgen", ellipse: "Daire", arrow: "Ok" }[
			kind
		],
		x: 120,
		y: 120,
		width: kind === "text" ? 600 : 300,
		height: kind === "text" ? 180 : 300,
		rotation: 0,
		opacity: 1,
		visible: true,
		locked: false,
		color: "#292331",
		text: "Hikâyeni tasarla.",
		font: "Arial",
		fontSize: 64,
	};
}
export function parseDocument(value: unknown): ImageDocument {
	const d = value as ImageDocument;
	if (
		!d ||
		(d.transparent !== undefined && typeof d.transparent !== "boolean") ||
		d.version !== 1 ||
		typeof d.name !== "string" ||
		!Number.isFinite(d.width) ||
		!Number.isFinite(d.height) ||
		d.width < 16 ||
		d.height < 16 ||
		d.width > 8192 ||
		d.height > 8192 ||
		!/^#[a-f\d]{6}$/i.test(d.background) ||
		!Array.isArray(d.layers) ||
		d.layers.length > 300
	)
		throw Error("Geçersiz görsel projesi");
	if (d.ai) {
		if (d.ai.provider !== undefined && !["gemini", "codex"].includes(d.ai.provider))
			throw Error("Geçersiz görsel aracı");
		if (
			(d.ai.styleLocked !== undefined && typeof d.ai.styleLocked !== "boolean") ||
			(d.ai.styleVersion !== undefined &&
				(!Number.isInteger(d.ai.styleVersion) || d.ai.styleVersion < 1))
		)
			throw Error("Geçersiz tarz sürümü");
		if (
			typeof d.ai !== "object" ||
			!Array.isArray(d.ai.refs) ||
			d.ai.refs.some((id) => typeof id !== "string") ||
			d.ai.refs.length > 4 ||
			["brand", "palette", "style", "brief", "copy", "prompt", "pageUrl", "pageText"].some(
				(k) =>
					typeof d.ai![k as keyof ImageBrief] !== "string" ||
					String(d.ai![k as keyof ImageBrief]).length > 30000,
			)
		)
			throw Error("Geçersiz brief");
		if (d.ai.imageSize !== undefined && !["1K", "2K", "4K"].includes(d.ai.imageSize)) throw Error("Geçersiz çözünürlük");
	}
	const ids = new Set<string>();
	for (const l of d.layers) {
		if (
			!l ||
			typeof l.id !== "string" ||
			ids.has(l.id) ||
			!["text", "image", "rect", "ellipse", "arrow"].includes(l.kind) ||
			![l.x, l.y, l.width, l.height, l.rotation, l.opacity, l.fontSize].every(Number.isFinite) ||
			l.width < 1 ||
			l.height < 1 ||
			l.width > 32768 ||
			l.height > 32768 ||
			l.opacity < 0 ||
			l.opacity > 1 ||
			l.fontSize < 1 ||
			l.fontSize > 2048 ||
			![l.name, l.text, l.font, l.color].every((v) => typeof v === "string") ||
			!/^#[a-f\d]{6}$/i.test(l.color) ||
			[l.locked, l.visible].some((v) => typeof v !== "boolean") ||
			(l.kind === "image" &&
				(typeof l.src !== "string" || !/^data:image\/(png|jpeg|webp);base64,/.test(l.src)))
		)
			throw Error("Geçersiz katman");
		for (const k of [
			"bold",
			"italic",
			"underline",
			"shadow",
			"flipX",
			"flipY",
			"aspectLock",
		] as const)
			if (l[k] !== undefined && typeof l[k] !== "boolean") throw Error("Geçersiz stil");
		if (l.align !== undefined && !["left", "center", "right"].includes(l.align))
			throw Error("Geçersiz hizalama");
		for (const [k, min, max] of [
			["lineHeight", 0.7, 4],
			["letterSpacing", -10, 100],
			["strokeWidth", 0, 100],
			["cornerRadius", 0, 1000],
		] as const)
			if (l[k] !== undefined && (!Number.isFinite(l[k]) || l[k]! < min || l[k]! > max))
				throw Error("Geçersiz stil ölçüsü");
		if (l.strokeColor !== undefined && !/^#[a-f\d]{6}$/i.test(l.strokeColor))
			throw Error("Geçersiz kontur");
		if (l.mask !== undefined && !["rect", "ellipse"].includes(l.mask))
			throw Error("Geçersiz maske");
		if (
			l.crop &&
			(![l.crop.x, l.crop.y, l.crop.width, l.crop.height].every(Number.isFinite) ||
				l.crop.x < 0 ||
				l.crop.y < 0 ||
				l.crop.width < 1 ||
				l.crop.height < 1 ||
				l.crop.x + l.crop.width > 1000 ||
				l.crop.y + l.crop.height > 1000)
		)
			throw Error("Geçersiz kırpma");
		if (l.imageRole !== undefined && !["artwork", "overlay"].includes(l.imageRole))
			throw Error("Geçersiz görsel rolü");
		ids.add(l.id);
	}
	return d;
}

export function insertArtwork(doc: ImageDocument, layer: Layer): ImageDocument {
	return {
		...doc,
		layers: [
			{ ...layer, imageRole: "artwork" },
			...doc.layers.map((l) => (l.imageRole === "artwork" ? { ...l, visible: false } : l)),
		],
	};
}
