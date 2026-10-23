import { UsageDetails } from "./UsageDetails";
import { ImageLightbox } from "./ImageLightbox";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { AIStudioPanel } from "../image-studio/AIStudioPanel";
import {
	emptyDocument,
	newLayer,
	type ImageBrief,
	type ImageDocument,
	type Layer,
} from "../image-studio/document";
import { loadImageDraft, saveImageProject } from "../image-studio/storage";
import { readStudioImage } from "../image-studio/importImage";
import { brandContext, brandReferences, type Brand, type Creation } from "./brand";
import { listBrands, listCreations, saveBrand, saveCreation, setBrandArchived } from "./database";
import { BrandDialog } from "./BrandDialog";
import { imageSkillContext } from "../../lib/imageGenerationSettings";
import "./creative-studio.css";
const Editor = lazy(() => import("../image-studio/ImageStudio"));
const formats = [
	["auto", "İstekten anla", 1080, 1080],
	["square", "Kare · 1:1", 1080, 1080],
	["portrait", "Instagram · 4:5", 1080, 1350],
	["story", "Story / Reels · 9:16", 1080, 1920],
	["wide", "Yatay · 16:9", 1920, 1080],
] as const;
export default function CreativeStudio({ onHome, initialCreationId, initialGallery = false }: { onHome: () => void; initialCreationId?: string; initialGallery?: boolean }) {
	const [page, setPage] = useState<"create" | "brands" | "gallery">(initialCreationId || initialGallery ? "gallery" : "create"),
		[brands, setBrands] = useState<Brand[]>([]),
		[deletedBrands, setDeletedBrands] = useState<Brand[]>([]),
		[creations, setCreations] = useState<Creation[]>([]),
		[brandId, setBrandId] = useState(""),
		[productId, setProductId] = useState(""),
		[format, setFormat] = useState("auto"),
		[settings, setSettings] = useState<ImageBrief>(),
		[extra, setExtra] = useState<Layer[]>([]),
		[editing, setEditing] = useState<ImageDocument>(),
		[brandDialog, setBrandDialog] = useState<Brand | null | undefined>(),
		[message, setMessage] = useState(""),
		[ready, setReady] = useState(false),
		[busy, setBusy] = useState(false),
		[search, setSearch] = useState(""),
		[previewId, setPreviewId] = useState<string | undefined>(initialCreationId);
	const brand = brands.find((b) => b.id === brandId),
		product = brand?.products.find((p) => p.id === productId),
		allRefs = brandReferences(brand, product),
		refs = allRefs.slice(0, 4),
		selectedFormat = formats.find((f) => f[0] === format) || formats[0];
	const refLayers: Layer[] = refs.map((a) => ({
		...newLayer("image"),
		id: a.id,
		name: `${a.role}: ${a.name}`,
		src: a.src,
		imageRole: "overlay",
	}));
	const promptSettings = useRef(settings);
	promptSettings.current = settings;
	useEffect(() => {
		let alive = true;
		Promise.all([listBrands(), listCreations()])
			.then(([b, c]) => {
				if (alive) {
					setBrands(b.filter(brand => !brand.deletedAt));
					setDeletedBrands(b.filter(brand => !!brand.deletedAt));
					setCreations(c.sort((a, b) => b.createdAt - a.createdAt));
					setReady(true);
				}
			})
			.catch((e) => {
				if (alive) setMessage(`Kütüphane açılamadı: ${e}`);
			});
		return () => {
			alive = false;
		};
	}, []);
	async function importFile(file: File) {
		const image = await readStudioImage(file),
			layer = {
				...newLayer("image"),
				src: image.src,
				name: file.name,
				imageRole: "overlay" as const,
			};
		setExtra((old) => [...old, layer]);
		return layer;
	}
	async function edit(c?: Creation) {
		try {
			const old = await loadImageDraft();
			if (old?.layers.length) await saveImageProject(old, `backup-${crypto.randomUUID()}`);
			if (!c) {
				setEditing(old || emptyDocument());
				return;
			}
			const image = new Image();
			image.src = c.src;
			await image.decode();
			const doc = emptyDocument();
			doc.width = image.naturalWidth;
			doc.height = image.naturalHeight;
			doc.name = c.name;
			doc.layers = [
				{
					...newLayer("image"),
					x: 0,
					y: 0,
					width: doc.width,
					height: doc.height,
					src: c.src,
					name: c.name,
					imageRole: "artwork",
				},
			];
			setEditing(doc);
		} catch (e) {
			setMessage(String(e));
		}
	}
	function chooseBrand(id: string) {
		setBrandId(id);
		setProductId("");
		setExtra([]);
		setSettings((s) => (s ? { ...s, refs: [] } : s));
	}
	const visible = creations.filter(
		(c) =>
			(!brandId || c.brandId === brandId) &&
			(!productId || c.productId === productId) &&
			`${c.prompt} ${c.name}`.toLocaleLowerCase("tr").includes(search.toLocaleLowerCase("tr")),
	);
	if (editing)
		return (
			<Suspense fallback={<div>Katmanlı editör açılıyor…</div>}>
				<Editor initialDocument={editing} onHome={onHome} onBack={() => setEditing(undefined)} />
			</Suspense>
		);
	return (
		<main className="creative-studio">
			<header className="creative-top">
				<button disabled={busy} onClick={onHome}>← Ana ekran</button>
				<button className="creative-wordmark" disabled={busy} onClick={onHome}>
					◈ <strong>Pro Screen AI</strong>
					<span>Görsel Stüdyo</span>
				</button>
				<nav aria-label="Görsel stüdyo bölümleri">
					{(
						[
							["create", "✦ Oluştur"],
							["brands", "◈ Markalar"],
							["gallery", "▦ Galeri"],
						] as const
					).map(([id, title]) => (
						<button
							key={id}
							className={page === id ? "active" : ""}
							disabled={busy}
							onClick={() => setPage(id)}
						>
							{title}
						</button>
					))}
				</nav>
				<button disabled={busy} onClick={() => void edit()}>
					Katmanlı editör ↗
				</button>
			</header>
			<div className="creative-body">
				<aside className="creative-sidebar">
					<small>ÇALIŞMA ALANI</small>
					<h2>Fikirden görsele.</h2>
					<button
						disabled={busy}
						className={`creative-free ${!brandId ? "selected" : ""}`}
						onClick={() => chooseBrand("")}
					>
						✧ Serbest üretim<span>Bir markaya bağlı olmadan keşfet</span>
					</button>
					<div className="creative-section-heading">
						<small>MARKALARIN</small>
						<button disabled={busy} aria-label="Yeni marka" onClick={() => setBrandDialog(null)}>
							＋
						</button>
					</div>
					{brands.length === 0 ? (
						<p className="creative-muted">
							Kimliğini bir kez tanımla. Sonraki işlerde markan seni hatırlasın.
						</p>
					) : (
						brands.map((b) => (
							<div
								key={b.id}
								className={`creative-brand-row ${brandId === b.id ? "selected" : ""}`}
							>
								<button disabled={busy} onClick={() => chooseBrand(b.id)}>
									{b.assets.find((a) => a.role === "logo") ? (
										<img src={b.assets.find((a) => a.role === "logo")!.src} alt="" />
									) : (
										<span className="brand-monogram">{b.name.slice(0, 2)}</span>
									)}
									<span>
										{b.name}
										<small>{b.products.length} ürün</small>
									</span>
								</button>
								<button
									disabled={busy}
									aria-label={`${b.name} düzenle`}
									onClick={() => setBrandDialog(b)}
								>
									•••
								</button>
							</div>
						))
					)}
					{brand && (
						<label className="creative-product">
							Ürün
							<select
								disabled={busy}
								aria-label="Seçili ürün"
								value={productId}
								onChange={(e) => {
									setProductId(e.target.value);
									setExtra([]);
									setSettings((s) => (s ? { ...s, refs: [] } : s));
								}}
							>
								<option value="">Marka genelinde</option>
								{brand.products.map((p) => (
									<option key={p.id} value={p.id}>
										{p.name}
									</option>
								))}
							</select>
						</label>
					)}
					<div className="creative-side-bottom">
						<span>● Yerel marka kütüphanesi</span>
						<small>
							Markalar ve sonuçlar bu bilgisayarda saklanır. Yalnız seçilen kimlik, üretim sırasında
							AI aracına gönderilir.
						</small>
					</div>
				</aside>
				<section className="creative-workspace">
					{page === "brands" ? (
						<>
							<div className="creative-title">
								<div>
									<small>KİMLİĞİNİ BİR KEZ TANIMLA</small>
									<h1>Bir marka. Sonsuz fikir.</h1>
									<p>Logolar, ürünler ve görsel dil aynı yerde.</p>
								</div>
								<button className="creative-primary" onClick={() => setBrandDialog(null)}>
									＋ Marka oluştur
								</button>
							</div>
							<div className="creative-brand-grid">
								{brands.map((b) => (
									<button
										className="creative-brand-card"
										key={b.id}
										onClick={() => setBrandDialog(b)}
									>
										<div className="creative-swatches">
											{b.colors
												.match(/#[0-9a-f]{6}\b/gi)
												?.slice(0, 5)
												.map((color, i) => <i key={i} style={{ background: color }} />) || <i />}
										</div>
										<h2>{b.name}</h2>
										<p>{b.description || "Kimliğini tamamla, üretime başla."}</p>
										<small>
											{b.products.map((p) => p.name).join(" · ") || "Ürün ekleyebilirsin"}
										</small>
										<span>Kimliği düzenle ↗</span>
									</button>
								))}
								<button
									className="creative-brand-card creative-add-card"
									onClick={() => setBrandDialog(null)}
								>
									<b>＋</b>
									<h2>Yeni bir dünya kur</h2>
									<p>Elle tanımla veya logo ve bağlantıdan AI ile çıkar.</p>
								</button>
							</div>
							{deletedBrands.length > 0 && <details className="creative-brand-trash"><summary>Silinen markalar ({deletedBrands.length})</summary><p>Silinen marka ve ürünleri geri getirebilirsin. Üretilmiş görseller galeride korunur.</p>{deletedBrands.map(b => <div key={b.id}><span>{b.name}</span><button onClick={async () => { try { const restored = await setBrandArchived(b.id, false); setDeletedBrands(old => old.filter(x => x.id !== b.id)); setBrands(old => [restored, ...old.filter(x => x.id !== restored.id)]); setMessage(`${b.name} geri yüklendi.`); } catch(e) { setMessage(String(e)); } }}>Geri yükle</button></div>)}</details>}
						</>
					) : (
						<>
							<div className="creative-title">
								<div>
									<small>
										{brand
											? `${brand.name}${product ? " / " + product.name : ""}`
											: "SINIRLARIN DIŞINDA DÜŞÜN"}
									</small>
									<h1>
										{page === "gallery"
											? "Ürettiklerin. Hepsi burada."
											: brand
												? `${product?.name || brand.name} için sırada ne var?`
												: "Aklındaki fikre bir görünüm ver."}
									</h1>
									<p>
										{brand
											? "Seçili kimlik ve referanslar isteğine otomatik eklenir."
											: "Tek bir istekle başla. Bir kampanya, bir ürün, yepyeni bir fikir."}
									</p>
								</div>
								{page === "gallery" && (
									<input
										aria-label="Galeride ara"
										placeholder="Ürettiklerinde ara…"
										value={search}
										onChange={(e) => setSearch(e.target.value)}
									/>
								)}
							</div>
							{page === "create" && (
								<div className="creative-generation">

									{allRefs.length > 4 && (
										<p className="creative-warning">
											Kimlikte {allRefs.length} referans var. Ürün önceliğiyle ilk 4 referans
											seçildi; aşağıdan kontrol edebilirsin.
										</p>
									)}
									<AIStudioPanel
										key={`${brandId}:${productId}`}
										gallery
										toolbar={
									<div className="creative-context">
										<span>
											✦ {brand ? brand.name : "Serbest üretim"}
											{product ? " → " + product.name : ""}
										</span>
										<select
											aria-label="Çıktı oranı"
											value={format}
											disabled={busy}
											onChange={(e) => setFormat(e.target.value)}
										>
											{formats.map((f) => (
												<option key={f[0]} value={f[0]}>
													{f[1]}
												</option>
											))}
										</select>
									</div>
										}
										fixedFormat={format !== "auto"}
										context={`${brandContext(brand, product)}\nPROMPT GUIDE FROM BRAND STUDIO SKILL:\n${imageSkillContext(/dekupe|şeffaf|transparent|cutout/i.test(settings?.brief || ""))}`}
										settings={settings}
										onSettings={setSettings}
										layers={[...extra, ...refLayers]}
										width={selectedFormat[2]}
										height={selectedFormat[3]}
										onImport={importFile}
										onBusy={setBusy}
										onResult={(src, name, _canvas, metadata) => {
											const image = new Image();
											image.src = src;
											void image
												.decode()
												.then(async () => {
													const c: Creation = {
														...metadata,
														id: crypto.randomUUID(),
														name,
														src,
														prompt: promptSettings.current?.brief || "",
														brandId,
														productId,
														createdAt: Date.now(),
														width: image.naturalWidth,
														height: image.naturalHeight,
													};
													try {
														await saveCreation(c);
														setCreations((old) => [c, ...old]);
														setPage("gallery");
													} catch (e) {
														setCreations((old) => [c, ...old]);
														setPage("gallery");
														setMessage(
															`Görsel hazır ancak diske kaydedilemedi. İndir ile sakla. ${e}`,
														);
													}
												})
												.catch((e) => setMessage(String(e)));
										}}
									/>
								</div>
							)}
							{page === "create" &&
								/dekupe|şeffaf|transparent|cutout/i.test(settings?.brief || "") && (
									<p className="creative-warning">
										Dekupe için ürün görselini referans olarak ekle. Motor gerçek alfa kanalı
										üretmeyebilir; dama deseni şeffaflık değildir. Çıktının arka planını indirdikten
										sonra kontrol et.
									</p>
								)}
							<div className="creative-results-heading">
								<h2>{page === "gallery" ? "Galeri" : "Son çalışmaların"}</h2>
								<span>{visible.length} görsel</span>
							</div>
							{!visible.length ? (
								<div className="creative-empty">
									<div className="creative-orbit">✦</div>
									<h2>
										{ready ? "Bir sonraki güzel fikir burada başlayacak." : "Kütüphanen açılıyor…"}
									</h2>
									<p>
										Ürettiğin görseller kendi oranlarında burada görünür.
										<br />
										Düzenle dediğinde yazı, logo ve katmanlarla devam edersin.
									</p>
									<div>
										<span>LinkedIn kampanyası</span>
										<span>9:16 sosyal medya</span>
										<span>Ürün dekupe</span>
									</div>
								</div>
							) : (
								<div className="creative-gallery">
									{visible.map((c) => (
										<article className="creative-result" key={c.id}>
											<button
												className="creative-image-open"
												aria-label={`${c.name} büyük görüntüle`}
												onClick={() => setPreviewId(c.id)}
											>
												<img src={c.src} alt={c.prompt || c.name} loading="lazy" />
												<span>⤢ Büyüt</span>
											</button>
											<div>
												<small>
													{brands.find((b) => b.id === c.brandId)?.name || deletedBrands.find(b => b.id === c.brandId)?.name || "Serbest üretim"} ·{" "}
													{c.width} × {c.height}{c.requestedResolution ? ` · Hedef ${c.requestedResolution}` : ""}
												</small>
												<p>{c.prompt || c.name}</p>
												<UsageDetails usage={c.usage} durationMs={c.durationMs} />
												<footer>
													<button disabled={busy} onClick={() => void edit(c)}>
														Düzenle ↗
													</button>
													<a href={c.src} download={`screenmovie-${c.id}.png`}>
														İndir ↓
													</a>
													<button
														disabled={busy}
														onClick={() => {
															chooseBrand(brands.some(b => b.id === c.brandId) ? c.brandId : "");
															setProductId(brands.some(b => b.id === c.brandId) ? c.productId : "");
															setExtra([{ ...newLayer("image"), src: c.src, name: "AI referans" }]);
															setPage("create");
														}}
													>
														Referans al
													</button>
												</footer>
											</div>
										</article>
									))}
								</div>
							)}
						</>
					)}
					{message && (
						<p role="status" className="creative-warning">
							{message}
						</p>
					)}
				</section>
			</div>
			{previewId && visible.find((c) => c.id === previewId) && (
				<ImageLightbox
					creation={visible.find((c) => c.id === previewId)!}
					busy={busy}
					onClose={() => setPreviewId(undefined)}
					onEdit={() => {
						const c = visible.find((c) => c.id === previewId);
						setPreviewId(undefined);
						if (c) void edit(c);
					}}
					onNavigate={(direction) => {
						const index = visible.findIndex((c) => c.id === previewId);
						setPreviewId(visible[(index + direction + visible.length) % visible.length]?.id);
					}}
				/>
			)}
			{brandDialog !== undefined && (
				<BrandDialog
					initial={brandDialog || undefined}
					onClose={() => setBrandDialog(undefined)}
					onDelete={brandDialog ? async () => {
						const removed = await setBrandArchived(brandDialog.id, true);
						setBrands(old => old.filter(b => b.id !== removed.id));
						setDeletedBrands(old => [removed, ...old.filter(b => b.id !== removed.id)]);
						if (brandId === removed.id) chooseBrand("");
						setMessage(`${removed.name} silindi. Markalar bölümündeki Silinen markalar alanından geri yükleyebilirsin.`);
					} : undefined}
					onSave={async (b) => {
						await saveBrand(b);
						setBrands((old) => [b, ...old.filter((v) => v.id !== b.id)]);
						chooseBrand(b.id);
					}}
				/>
			)}
		</main>
	);
}
