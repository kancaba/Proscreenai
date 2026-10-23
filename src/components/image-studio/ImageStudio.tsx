import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import {
	emptyDocument,
	newLayer,
	parseDocument,
	insertArtwork,
	type ImageDocument,
	type Layer,
} from "./document";
import { LayerArtwork } from "./LayerArtwork";
import { LayerControls } from "./LayerControls";
import { AIStudioPanel } from "./AIStudioPanel";
import { readStudioImage } from "./importImage";
import { snap } from "./layout";
import {
	saveImageDraft,
	loadImageDraft,
	saveImageProject,
	listImageProjects,
	deleteImageProject,
	type SavedImage,
} from "./storage";
import "./image-studio.css";

const DRAFT = "screenmovie-image-draft-v1";
function download(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export default function ImageStudio({
	onHome,
	onBack,
	initialDocument,
}: {
	onHome: () => void;
	onBack?: () => void;
	initialDocument?: ImageDocument;
}) {
	const [doc, setDoc] = useState<ImageDocument>(() => {
		if (initialDocument) return initialDocument;
		try {
			return parseDocument(JSON.parse(localStorage.getItem(DRAFT) || "null"));
		} catch {
			return emptyDocument();
		}
	});
	const [tab, setTab] = useState<"edit" | "ai" | "library">("edit");
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [library, setLibrary] = useState<SavedImage[]>([]);
	const [ready, setReady] = useState(false);
	const readyRef = useRef(false);
	const projectId = useRef<string>(crypto.randomUUID());
	const [selected, setSelected] = useState<string | null>(null),
		[fonts, setFonts] = useState([
			"Arial",
			"Helvetica",
			"Georgia",
			"Times New Roman",
			"Verdana",
			"Courier New",
		]),
		[message, setMessage] = useState(""),
		[zoom, setZoom] = useState(45),
		[format, setFormat] = useState("png"),
		[busy, setBusy] = useState(false);
	const history = useRef<ImageDocument[]>([]),
		future = useRef<ImageDocument[]>([]),
		svg = useRef<SVGSVGElement>(null),
		importInput = useRef<HTMLInputElement>(null),
		projectInput = useRef<HTMLInputElement>(null);
	const drag = useRef<{
		x: number;
		y: number;
		layer: Layer;
		doc: ImageDocument;
		mode: "move" | "resize";
		ids: string[];
	} | null>(null);
	const docRef = useRef(doc);
	docRef.current = doc;
	const savedRef = useRef<Promise<void>>(Promise.resolve());
	function saveDraft(current: ImageDocument) {
		const result = savedRef.current.catch(() => {}).then(() => saveImageDraft(current));
		savedRef.current = result;
		return result;
	}
	useEffect(() => {
		let alive = true;
		loadImageDraft()
			.then((d) => {
				if (alive && d && !initialDocument) setDoc(d);
			})
			.catch(() => setMessage("Görsel taslağı okunamadı; dosyadan açabilirsiniz."))
			.finally(() => {
				if (alive) {
					readyRef.current = true;
					setReady(true);
				}
			});
		return () => {
			alive = false;
		};
	}, []);
	useEffect(
		() => () => {
			if (readyRef.current) void saveDraft(docRef.current).catch(() => {});
		},
		[],
	);
	function selectLayer(id: string | null, add = false) {
		setSelected(id);
		setSelectedIds((old) =>
			id ? (add ? (old.includes(id) ? old.filter((x) => x !== id) : [...old, id]) : [id]) : [],
		);
	}
	const active = doc.layers.find((l) => l.id === selected);
	function commit(next: ImageDocument) {
		if (next.layers.length > 300) {
			setMessage("En fazla 300 katman kullanılabilir.");
			return;
		}
		history.current.push(doc);
		if (history.current.length > 60) history.current.shift();
		future.current = [];
		setDoc(next);
	}
	function patch(changes: Partial<Layer>) {
		if (active?.aspectLock && changes.width !== undefined && changes.height === undefined)
			changes.height = (changes.width * active.height) / active.width;
		if (active?.aspectLock && changes.height !== undefined && changes.width === undefined)
			changes.width = (changes.height * active.width) / active.height;
		if (active && !active.locked)
			commit({
				...doc,
				layers: doc.layers.map((l) => (l.id === selected ? { ...l, ...changes } : l)),
			});
	}
	function undo() {
		const prev = history.current.pop();
		if (prev) {
			future.current.push(doc);
			setDoc(prev);
		}
	}
	function redo() {
		const next = future.current.pop();
		if (next) {
			history.current.push(doc);
			setDoc(next);
		}
	}
	function add(kind: Layer["kind"]) {
		const l = newLayer(kind);
		commit({ ...doc, layers: [...doc.layers, l] });
		selectLayer(l.id);
	}
	useEffect(() => {
		if (!ready) return;
		const timer = setTimeout(() => {
			void saveDraft(doc).catch(() =>
				setMessage("Taslak kaydedilemedi. Projeyi dosyaya kaydedin."),
			);
		}, 700);
		return () => clearTimeout(timer);
	}, [doc, ready]);

	useEffect(() => {
		const listener = (e: KeyboardEvent) => {
			if ((e.target as HTMLElement)?.closest("input,textarea,select,[contenteditable]")) return;
			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
				e.preventDefault();
				e.shiftKey ? redo() : undo();
			} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a") {
				e.preventDefault();
				setSelectedIds(doc.layers.map((l) => l.id));
				setSelected(doc.layers[doc.layers.length - 1]?.id ?? null);
			} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "d" && selectedIds.length) {
				e.preventDefault();
				const copies = doc.layers
					.filter((l) => selectedIds.includes(l.id) && !l.locked)
					.map((l) => ({
						...l,
						id: crypto.randomUUID(),
						x: l.x + 20,
						y: l.y + 20,
						name: l.name + " kopya",
					}));
				commit({ ...doc, layers: [...doc.layers, ...copies] });
				setSelectedIds(copies.map((l) => l.id));
				setSelected(copies[copies.length - 1]?.id ?? null);
			} else if (
				["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key) &&
				active &&
				!active.locked
			) {
				e.preventDefault();
				const step = e.shiftKey ? 10 : 1,
					dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0,
					dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
				commit({
					...doc,
					layers: doc.layers.map((l) =>
						(selectedIds.length ? selectedIds : [selected]).includes(l.id) && !l.locked
							? { ...l, x: l.x + dx, y: l.y + dy }
							: l,
					),
				});
			} else if ((e.key === "Delete" || e.key === "Backspace") && active && !active.locked) {
				e.preventDefault();
				commit({
					...doc,
					layers: doc.layers.filter(
						(l) => !(selectedIds.length ? selectedIds : [selected]).includes(l.id) || l.locked,
					),
				});
				selectLayer(null);
			}
		};
		window.addEventListener("keydown", listener);
		return () => window.removeEventListener("keydown", listener);
	});
	async function importImage(file?: File) {
		if (!file) return;
		try {
			const image = await readStudioImage(file);
			const src = image.src;
			const l = newLayer("image");
			l.src = src;
			l.name = file.name;
			l.width = Math.min(image.width, doc.width * 0.8);
			l.height = (l.width * image.height) / image.width;
			const current = docRef.current;
			l.imageRole = current.layers.some((l) => l.kind === "image") ? "overlay" : "artwork";
			history.current.push(current);
			future.current = [];
			setDoc({ ...current, layers: [...current.layers, l] });
			selectLayer(l.id);
			return l;
		} catch (e) {
			setMessage(String(e));
		}
	}
	async function loadFonts() {
		try {
			const api = window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> };
			if (!api.queryLocalFonts)
				throw Error("Bu ortam yerel font listesini sunmuyor. Font aile adını elle yazabilirsiniz.");
			const found = await api.queryLocalFonts();
			setFonts([...new Set(found.map((f) => f.family))].sort());
			setMessage(`${new Set(found.map((f) => f.family)).size} yerel font bulundu.`);
		} catch (e) {
			setMessage(String(e));
		}
	}
	function start(e: ReactPointerEvent, l: Layer, mode: "move" | "resize") {
		e.stopPropagation();
		const ids =
			e.shiftKey || e.metaKey || e.ctrlKey
				? [...new Set([...selectedIds, l.id])]
				: selectedIds.includes(l.id)
					? selectedIds
					: [l.id];
		setSelected(l.id);
		setSelectedIds(ids);
		if (l.locked) return;
		const matrix = svg.current?.getScreenCTM();
		if (!matrix) return;
		const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
		drag.current = { x: p.x, y: p.y, layer: { ...l }, doc, mode, ids };
		svg.current?.setPointerCapture(e.pointerId);
	}
	function move(e: ReactPointerEvent) {
		const d = drag.current,
			matrix = svg.current?.getScreenCTM();
		if (!d || !matrix) return;
		const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(matrix.inverse());
		const dx = p.x - d.x,
			dy = p.y - d.y;
		let change: Partial<Layer>;
		if (d.mode === "move")
			change = {
				x: snap(
					d.layer.x + dx,
					[0, (doc.width - d.layer.width) / 2, doc.width - d.layer.width],
					(6 * 100) / zoom,
				),
				y: snap(
					d.layer.y + dy,
					[0, (doc.height - d.layer.height) / 2, doc.height - d.layer.height],
					(6 * 100) / zoom,
				),
			};
		else {
			const r = (d.layer.rotation * Math.PI) / 180;
			change = {
				width: Math.max(16, d.layer.width + dx * Math.cos(r) + dy * Math.sin(r)),
				height: Math.max(16, d.layer.height - dx * Math.sin(r) + dy * Math.cos(r)),
			};
		}
		if (d.mode === "resize" && d.layer.aspectLock) {
			change.height = ((change.width ?? d.layer.width) * d.layer.height) / d.layer.width;
		}
		setDoc({
			...d.doc,
			layers: d.doc.layers.map((l) =>
				l.id === d.layer.id
					? { ...l, ...change }
					: d.mode === "move" && d.ids.includes(l.id) && !l.locked
						? {
								...l,
								x: l.x + (change.x ?? d.layer.x) - d.layer.x,
								y: l.y + (change.y ?? d.layer.y) - d.layer.y,
							}
						: l,
			),
		});
	}
	function finish() {
		if (drag.current) {
			history.current.push(drag.current.doc);
			future.current = [];
			drag.current = null;
		}
	}
	async function exportImage() {
		if (!svg.current) return;
		setBusy(true);
		setMessage("Görsel hazırlanıyor…");
		try {
			await document.fonts.ready;
			const clone = svg.current.cloneNode(true) as SVGSVGElement;
			clone.querySelectorAll("[data-selection]").forEach((n) => n.remove());
			clone.setAttribute("width", String(doc.width));
			clone.setAttribute("height", String(doc.height));
			const xml = new XMLSerializer().serializeToString(clone),
				url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml" }));
			try {
				const image = new Image();
				image.src = url;
				await image.decode();
				const canvas = document.createElement("canvas");
				canvas.width = doc.width;
				canvas.height = doc.height;
				const ctx = canvas.getContext("2d");
				if (!ctx) throw Error("Çıktı hazırlanamadı");
				if (format === "jpeg") {
					ctx.fillStyle = doc.background;
					ctx.fillRect(0, 0, doc.width, doc.height);
				}
				ctx.drawImage(image, 0, 0);
				const blob = await new Promise<Blob>((resolve, reject) =>
					canvas.toBlob(
						(b) => (b ? resolve(b) : reject(Error("Çıktı üretilemedi"))),
						`image/${format}`,
						0.95,
					),
				);
				if (blob.type !== `image/${format}`) throw Error("Bu çıktı biçimi desteklenmiyor");
				download(
					blob,
					`${doc.name.replace(/[<>:"/\\|?*]/g, "-")}.${format === "jpeg" ? "jpg" : format}`,
				);
				setMessage("Görsel dışa aktarıldı.");
			} finally {
				URL.revokeObjectURL(url);
			}
		} catch (e) {
			setMessage(String(e));
		} finally {
			setBusy(false);
		}
	}
	if (!ready)
		return (
			<main className="image-studio">
				<p role="status">Görsel çalışma alanı yükleniyor…</p>
			</main>
		);
	return (
		<main className="image-studio">
			<header>
				<button
					onClick={async () => {
						try {
							await saveDraft(doc);
						} catch {
							setMessage("Taslak kaydedilemedi. Ana ekrana dönmeden önce Kaydet ile dosyaya alın.");
							return;
						}
						onHome();
					}}
				>
					← Ana ekran
				</button>
				{onBack && <button onClick={async () => {
					try { await saveDraft(doc); onBack(); }
					catch { setMessage("Taslak kaydedilemedi. Önce Kaydet ile dosyaya alın."); }
				}}>← Görsel Stüdyo</button>}
				<span className="image-wordmark">✦ Görsel Stüdyo</span>
				<input
					aria-label="Tasarım adı"
					value={doc.name}
					onChange={(e) => commit({ ...doc, name: e.target.value })}
				/>
				<button onClick={undo} disabled={!history.current.length}>
					Geri al
				</button>
				<button onClick={redo} disabled={!future.current.length}>
					İleri al
				</button>
				<button onClick={() => projectInput.current?.click()}>Proje aç</button>
				<button
					onClick={() =>
						download(
							new Blob([JSON.stringify(doc)], { type: "application/json" }),
							`${doc.name}.screenimage`,
						)
					}
				>
					Kaydet
				</button>
				<select
					aria-label="Çıktı biçimi"
					value={format}
					onChange={(e) => setFormat(e.target.value)}
				>
					<option value="png">PNG</option>
					<option value="jpeg">JPEG</option>
					<option value="webp">WebP</option>
				</select>
				<button className="image-primary" disabled={busy} onClick={() => void exportImage()}>
					Dışa aktar
				</button>
			</header>
			<div className="image-tabs">
				<button aria-pressed={tab === "edit"} onClick={() => setTab("edit")}>
					Düzenle
				</button>
				<button aria-pressed={tab === "ai"} onClick={() => setTab("ai")}>
					✦ Marka & AI
				</button>
				<button
					aria-pressed={tab === "library"}
					onClick={() => {
						setTab("library");
						void listImageProjects()
							.then(setLibrary)
							.catch((e) => setMessage(String(e)));
					}}
				>
					Görsel projeleri
				</button>
				<span>
					{selectedIds.length > 1
						? `${selectedIds.length} katman seçili · birlikte taşıyabilirsin`
						: ""}
				</span>
				<button onClick={() => selectLayer(null)}>Tuval ayarları</button>
			</div>
			<div className="image-layout">
				<aside className="image-tools">
					<h2>Oluştur</h2>
					<button onClick={() => add("text")}>T · Yazı</button>
					<button onClick={() => importInput.current?.click()}>▧ · Görsel / logo</button>
					<button onClick={() => add("rect")}>□ · Dikdörtgen</button>
					<button onClick={() => add("ellipse")}>○ · Daire</button>
					<button onClick={() => add("arrow")}>↗ · Ok / işaret</button>
					<h2>
						Katmanlar <small>{doc.layers.length}</small>
					</h2>
					<div className="image-layer-list">
						{[...doc.layers].reverse().map((l) => (
							<div key={l.id} className={selectedIds.includes(l.id) ? "selected" : ""}>
								<button onClick={(e) => selectLayer(l.id, e.shiftKey || e.metaKey || e.ctrlKey)}>
									{l.name}
								</button>
								<button
									aria-label={`${l.name} görünürlük`}
									onClick={() =>
										commit({
											...doc,
											layers: doc.layers.map((x) =>
												x.id === l.id ? { ...x, visible: !x.visible } : x,
											),
										})
									}
								>
									{l.visible ? "●" : "○"}
								</button>
								<button
									aria-label={`${l.name} kilit`}
									onClick={() =>
										commit({
											...doc,
											layers: doc.layers.map((x) =>
												x.id === l.id ? { ...x, locked: !x.locked } : x,
											),
										})
									}
								>
									{l.locked ? "▣" : "◇"}
								</button>
							</div>
						))}
					</div>
					<p className="image-hint">
						Katmanı seç, sürükle veya köşesinden boyutlandır. ⌘/Ctrl Z · Geri al
					</p>
				</aside>
				<section className="image-workspace">
					<div className="image-canvas-bar">
						<span>
							{doc.width} × {doc.height}
						</span>
						<label>
							Yakınlaştır{" "}
							<input
								aria-label="Yakınlaştır"
								type="range"
								min="10"
								max="100"
								value={zoom}
								onChange={(e) => setZoom(+e.target.value)}
							/>
							{zoom}%
						</label>
					</div>
					<div className="image-canvas-scroll">
						<svg
							ref={svg}
							xmlns="http://www.w3.org/2000/svg"
							width={(doc.width * zoom) / 100}
							height={(doc.height * zoom) / 100}
							viewBox={`0 0 ${doc.width} ${doc.height}`}
							role="img"
							aria-label="Görsel tuvali"
							onPointerDown={() => selectLayer(null)}
							onPointerMove={move}
							onPointerUp={finish}
							onPointerCancel={finish}
						>
							{!doc.transparent && (
								<rect width={doc.width} height={doc.height} fill={doc.background} />
							)}
							{doc.layers
								.filter((l) => l.visible)
								.map((l) => (
									<g
										key={l.id}
										opacity={l.opacity}
										transform={`translate(${l.x} ${l.y}) rotate(${l.rotation} ${l.width / 2} ${l.height / 2})`}
										onPointerDown={(e) => start(e, l, "move")}
										style={{ cursor: l.locked ? "default" : "move" }}
									>
										<LayerArtwork layer={l} />
										{(selectedIds.includes(l.id) || selected === l.id) && (
											<g data-selection="true">
												<rect
													width={l.width}
													height={l.height}
													fill="transparent"
													stroke="#8b5cf6"
													strokeWidth={(2 * 100) / zoom}
												/>
												{!l.locked && (
													<rect
														x={l.width - (9 * 100) / zoom}
														y={l.height - (9 * 100) / zoom}
														width={(14 * 100) / zoom}
														height={(14 * 100) / zoom}
														fill="#8b5cf6"
														style={{ cursor: "nwse-resize" }}
														onPointerDown={(e) => start(e, l, "resize")}
													/>
												)}
											</g>
										)}
									</g>
								))}
						</svg>
					</div>
					<footer role="status">{message || "Yerel çalışma alanı · Otomatik taslak açık"}</footer>
				</section>
				<aside className="image-inspector">
					<div hidden={tab !== "ai"}>
						<AIStudioPanel
							onImport={importImage}
							key={projectId.current}
							settings={doc.ai}
							onSettings={(ai) => setDoc((current) => ({ ...current, ai }))}
							layers={doc.layers}
							width={doc.width}
							height={doc.height}
							onResult={(src, name, canvas) => {
								const current = docRef.current;
								if (current.layers.length >= 300) {
									setMessage("Katman sınırına ulaşıldı; görseli eklemeden önce bir katman silin.");
									return;
								}
								const layer = newLayer("image");
								layer.src = src;
								layer.name = name;
								layer.x = 0;
								layer.y = 0;
								layer.width = canvas?.width ?? current.width;
								layer.height = canvas?.height ?? current.height;
								history.current.push(current);
								future.current = [];
								setDoc(
									insertArtwork(
										{
											...current,
											width: canvas?.width ?? current.width,
											height: canvas?.height ?? current.height,
										},
										layer,
									),
								);
								selectLayer(layer.id);
							}}
						/>
					</div>
					<div hidden={tab !== "library"}>
						<h2>Görsel projeleri</h2>
						<button
							onClick={async () => {
								try {
									await saveImageProject(doc, projectId.current);
									setLibrary(await listImageProjects());
									setMessage("Görsel kütüphanesine kaydedildi.");
								} catch (e) {
									setMessage(String(e));
								}
							}}
						>
							Kütüphaneye kaydet
						</button>
						{library.map((p) => (
							<div className="image-library-entry" key={p.id}>
								<button
									onClick={() => {
										commit(parseDocument(p.document));
										projectId.current = p.id;
										selectLayer(null);
										setTab("edit");
									}}
								>
									{p.name}
									<small>{new Date(p.updatedAt).toLocaleString("tr-TR")}</small>
								</button>
								<button
									aria-label={`${p.name} projeyi kaldır`}
									onClick={async () => {
										if (confirm("Bu kayıt kütüphaneden kaldırılsın mı?")) {
											await deleteImageProject(p.id);
											setLibrary(await listImageProjects());
										}
									}}
								>
									×
								</button>
							</div>
						))}
					</div>
					<div hidden={tab !== "edit"}>
						<h2>{active ? "Katman özellikleri" : "Tuval ayarları"}</h2>
						{active && <LayerControls layer={active} doc={doc} patch={patch} />}
						{active ? (
							<>
								<label>
									Katman adı
									<input
										value={active.name}
										onChange={(e) => patch({ name: e.target.value })}
										disabled={active.locked}
									/>
								</label>
								{active.kind === "text" && (
									<>
										<label>
											Metin
											<textarea
												rows={4}
												aria-label="Görsel metni"
												value={active.text}
												onChange={(e) => patch({ text: e.target.value })}
												disabled={active.locked}
											/>
										</label>
										<button onClick={() => void loadFonts()}>Bilgisayardaki fontları getir</button>
										<label>
											Font
											<input
												list="image-fonts"
												value={active.font}
												onChange={(e) => patch({ font: e.target.value })}
												disabled={active.locked}
											/>
											<datalist id="image-fonts">
												{fonts.map((f) => (
													<option key={f} value={f} />
												))}
											</datalist>
										</label>
									</>
								)}
								{(
									[
										"x",
										"y",
										"width",
										"height",
										"rotation",
										...(active.kind === "text" ? ["fontSize"] : []),
									] as const
								).map((key) => (
									<label key={key}>
										{
											{
												x: "X",
												y: "Y",
												width: "Genişlik",
												height: "Yükseklik",
												rotation: "Döndürme",
												fontSize: "Yazı boyutu",
											}[key]
										}
										<input
											type="number"
											value={Math.round(active[key as keyof Layer] as number)}
											disabled={active.locked}
											onChange={(e) => {
												const n = Number(e.target.value);
												if (Number.isFinite(n))
													patch({
														[key]: ["width", "height", "fontSize"].includes(key)
															? Math.max(1, Math.min(key === "fontSize" ? 2048 : 8192, n))
															: n,
													});
											}}
										/>
									</label>
								))}
								<label>
									Renk
									<input
										type="color"
										value={active.color}
										onChange={(e) => patch({ color: e.target.value })}
										disabled={active.locked}
									/>
								</label>
								<label>
									Opaklık
									<input
										type="range"
										min="0"
										max="1"
										step=".01"
										value={active.opacity}
										onChange={(e) => patch({ opacity: +e.target.value })}
										disabled={active.locked}
									/>
								</label>
								<div className="image-pair">
									<button
										disabled={active.locked}
										onClick={() => {
											const layers = [...doc.layers],
												i = layers.findIndex((l) => l.id === selected);
											if (i < layers.length - 1) {
												[layers[i], layers[i + 1]] = [layers[i + 1], layers[i]];
												commit({ ...doc, layers });
											}
										}}
									>
										Öne getir
									</button>
									<button
										disabled={active.locked}
										onClick={() => {
											const layers = [...doc.layers],
												i = layers.findIndex((l) => l.id === selected);
											if (i > 0) {
												[layers[i], layers[i - 1]] = [layers[i - 1], layers[i]];
												commit({ ...doc, layers });
											}
										}}
									>
										Arkaya al
									</button>
								</div>
								<button
									disabled={active.locked}
									onClick={() => {
										const l = {
											...active,
											id: crypto.randomUUID(),
											x: active.x + 25,
											y: active.y + 25,
											name: active.name + " kopya",
										};
										commit({ ...doc, layers: [...doc.layers, l] });
										selectLayer(l.id);
									}}
								>
									Çoğalt
								</button>
								<button
									disabled={active.locked}
									onClick={() => {
										commit({
											...doc,
											layers: doc.layers.filter(
												(l) =>
													!(selectedIds.length ? selectedIds : [selected]).includes(l.id) ||
													l.locked,
											),
										});
										selectLayer(null);
									}}
								>
									Katmanı sil
								</button>
							</>
						) : (
							<>
								<label>
									Hazır boyut
									<select
										onChange={(e) => {
											const [width, height] = e.target.value.split("x").map(Number);
											commit({ ...doc, width, height });
										}}
										value={`${doc.width}x${doc.height}`}
									>
										<option value="1080x1080">Kare · 1080 × 1080</option>
										<option value="1080x1350">Gönderi · 4:5</option>
										<option value="1080x1920">Story · 9:16</option>
										<option value="1920x1080">Yatay · 16:9</option>
										<option value={`${doc.width}x${doc.height}`}>Mevcut boyut</option>
									</select>
								</label>
								{(["width", "height"] as const).map((k) => (
									<label key={k}>
										{k === "width" ? "Genişlik" : "Yükseklik"}
										<input
											type="number"
											min="16"
											max="8192"
											value={doc[k]}
											onChange={(e) =>
												commit({ ...doc, [k]: Math.max(16, Math.min(8192, +e.target.value || 16)) })
											}
										/>
									</label>
								))}
								<label className="image-checkbox">
									<input
										type="checkbox"
										checked={!!doc.transparent}
										onChange={(e) => commit({ ...doc, transparent: e.target.checked })}
									/>
									Şeffaf arka plan (PNG/WebP)
								</label>
								<label>
									Arka plan
									<input
										type="color"
										value={doc.background}
										onChange={(e) => commit({ ...doc, background: e.target.value })}
									/>
								</label>
								<button
									onClick={() => {
										if (
											confirm(
												"Mevcut taslağın yerine boş tasarım açılsın mı? Önce Kaydet ile dosyaya alabilirsiniz.",
											)
										) {
											projectId.current = crypto.randomUUID();
											commit(emptyDocument());
											selectLayer(null);
										}
									}}
								>
									Yeni boş tuval
								</button>
							</>
						)}
					</div>
				</aside>
			</div>
			<input
				hidden
				type="file"
				ref={importInput}
				accept="image/png,image/jpeg,image/webp,image/svg+xml"
				onChange={(e) => {
					void importImage(e.target.files?.[0]);
					e.target.value = "";
				}}
			/>
			<input
				hidden
				type="file"
				ref={projectInput}
				accept=".screenimage"
				onChange={async (e) => {
					const f = e.target.files?.[0];
					e.target.value = "";
					if (!f) return;
					try {
						if (f.size > 80 * 1024 * 1024) throw Error("Proje çok büyük");
						const next = parseDocument(JSON.parse(await f.text()));
						projectId.current = crypto.randomUUID();
						commit(next);
						selectLayer(null);
						setMessage("Görsel projesi açıldı.");
					} catch (err) {
						setMessage(String(err));
					}
				}}
			/>
		</main>
	);
}
