import type { WebsiteBrand } from "../../lib/brandWebsiteTypes";
import { useEffect, useRef, useState } from "react";
import { emptyBrand, parseBrandDraft, type Brand, type BrandAsset } from "./brand";
import brandGuide from "./skill/marka-kimligi.md?raw";
import { readStudioImage } from "../image-studio/importImage";
type SitePreview = WebsiteBrand & { candidates: (BrandAsset & { kind: "logo" | "icon" })[] };
export function BrandDialog({
	initial,
	onSave,
	onClose,
	onDelete,
}: {
	initial?: Brand;
	onSave: (b: Brand) => Promise<void>;
	onClose: () => void;
	onDelete?: () => Promise<void>;
}) {
	const [deleteRequested, setDeleteRequested] = useState(false);
	const [brand, setBrand] = useState<Brand>(() => structuredClone(initial || emptyBrand())),
		[status, setStatus] = useState(""),
		[site, setSite] = useState<SitePreview>(),
		[busy, setBusy] = useState(false),
		[productId, setProductId] = useState(""),
		[role, setRole] = useState<BrandAsset["role"]>("logo");
	const dialog = useRef<HTMLDialogElement>(null),
		files = useRef<HTMLInputElement>(null),
		job = useRef<string | null>(null),
		alive = useRef(true);
	useEffect(() => {
		alive.current = true;
		dialog.current?.showModal();
		return () => {
			alive.current = false;
			if (job.current) void window.electronAPI.imageStudioCancel(job.current);
		};
	}, []);
	const product = brand.products.find((p) => p.id === productId);
	function field(key: keyof Brand, value: string) {
		setBrand((b) => ({ ...b, [key]: value }));
	}
	async function add(files: File[]) {
		try {
			const added: BrandAsset[] = [];
			for (const f of files) {
				if (added.length + (product?.assets.length || brand.assets.length) >= 12) break;
				const image = await readStudioImage(f);
				added.push({ id: crypto.randomUUID(), name: f.name, src: image.src, role });
			}
			setBrand((b) =>
				productId
					? {
							...b,
							products: b.products.map((p) =>
								p.id === productId ? { ...p, assets: [...p.assets, ...added] } : p,
							),
						}
					: { ...b, assets: [...b.assets, ...added] },
			);
		} catch (e) {
			setStatus(String(e));
		}
	}
	async function scanSite(): Promise<SitePreview | undefined> {
		setBusy(true);
		setStatus("Ana sayfa, renkler ve logo adayları okunuyor…");
		try {
			const response = await window.electronAPI.imageStudioBrandWebsite(brand.website);
			if (!alive.current) return;
			if (!response.success || !response.data) throw Error(response.error || "Site okunamadı.");
			const data = response.data,
				candidates: SitePreview["candidates"] = [],
				warnings = [...data.warnings];
			for (const logo of data.logos) {
				try {
					const bytes = Uint8Array.from(atob(logo.data.split(",")[1]), (c) => c.charCodeAt(0));
					const image = await readStudioImage(new File([bytes], logo.name, { type: logo.mime }));
					candidates.push({
						id: crypto.randomUUID(),
						name: logo.name,
						src: image.src,
						originalSrc: image.originalSrc,
						originalMime: logo.mime,
						sourceUrl: logo.url,
						role: "logo",
						kind: logo.kind,
					});
				} catch {
					warnings.push("Bir logo güvenli olarak açılamadı; aday listesinden çıkarıldı.");
				}
			}
			if (!alive.current) return;
			const next = { ...data, warnings, candidates };
			setSite(next);
			setBrand((b) => ({
				...b,
				website: data.url,
				websiteText: data.text,
				name: b.name || data.title,
				description: b.description || data.description || data.text.slice(0, 1200),
				colors: b.colors || data.colors.slice(0, 5).join(" · "),
				fonts: b.fonts || data.fonts.join(" · "),
			}));
			setStatus(
				"Ana sayfa bilgileri alındı; dolu alanların korundu. Logo adaylarından uygun olanı ekle, renkleri incele ve kaydet.",
			);
			return next;
		} catch (e) {
			if (alive.current) setStatus(String(e));
		} finally {
			if (alive.current) setBusy(false);
		}
	}
	async function extract() {
		const source = brand.website
			? site?.url === brand.website
				? site
				: await scanSite()
			: undefined;
		if (brand.website && !source) return;
		setBusy(true);
		setStatus("Codex bağlantı ve referanslardan incelenebilir bir kimlik taslağı çıkarıyor…");
		const id = crypto.randomUUID();
		job.current = id;
		try {
			const result = await window.electronAPI.imageStudioRun({
				requestId: id,
				mode: "prompt",
				purpose: "brand",
				tool: "codex",
				auto: !source,
				references: brand.assets.slice(0, 4).map((a) => a.src),
				prompt: `Brand profile guide:\n${brandGuide}\nExtract a brand identity draft from these user supplied sources. Website: ${source?.url || brand.website}\nHomepage text: ${source?.text.slice(0, 6000) || ""}\nObserved CSS colors: ${source?.colors.join(", ") || ""}\nObserved fonts: ${source?.fonts.join(", ") || ""}\nExisting notes: ${brand.description.slice(0, 1500)}\nName: ${brand.name.slice(0, 300)}`,
			});
			if (!alive.current) return;
			if (!result.success || !result.prompt) throw Error(result.error || "Taslak alınamadı.");
			const draft = parseBrandDraft(result.prompt);
			setBrand((b) => {
				const next = { ...b };
				for (const key of [
					"name",
					"description",
					"colors",
					"fonts",
					"tone",
					"style",
					"avoid",
				] as const)
					if (!next[key] && draft[key]) next[key] = draft[key]!;
				return next;
			});
			setStatus(
				"AI taslağı hazır; dolu alanların korundu. Çıkarımlar yaklaşık olabilir. Site logo ve renk adaylarını da kontrol edip Kaydet ile onayla.",
			);
		} catch (e) {
			if (alive.current) setStatus(String(e));
		} finally {
			job.current = null;
			if (alive.current) setBusy(false);
		}
	}
	return (
		<dialog
			ref={dialog}
			className="creative-brand-dialog"
			onCancel={(e) => {
				e.preventDefault();
				if (!busy) onClose();
			}}
		>
			<header>
				<div>
					<small>KALICI MARKA KÜTÜPHANESİ</small>
					<h2>{initial ? "Marka kimliğini düzenle" : "Yeni bir marka ekle"}</h2>
				</div>
				<button aria-label="Kapat" disabled={busy} onClick={onClose}>
					×
				</button>
			</header>
			<div className="brand-dialog-scroll">
				<p>Bir kez tanımla, her üretimde kullan. Ürünler marka kimliğini ve logolarını devralır.</p>
				<div className="brand-import">
					<label>
						Web sitesi
						<input
							aria-label="Marka web sitesi"
							placeholder="https://markan.com"
							value={brand.website}
							onChange={(e) => field("website", e.target.value)}
						/>
					</label>
					<button disabled={busy || !brand.website.trim()} onClick={() => void scanSite()}>
						↗ Siteden bilgileri getir
					</button>
					<button
						disabled={busy || (!brand.website && !brand.assets.length && !brand.description)}
						onClick={() => void extract()}
					>
						✦ Codex ile kimliği çıkar
					</button>
					<small>
						Site taraması AI gerektirmez. Kimlik çıkarma seçilirse ana sayfa bilgileri ve ilk 4
						görsel Codex’e gönderilir.
					</small>
				</div>
				{site && (
					<section className="brand-site-preview" aria-label="Siteden bulunan kimlik">
						<header>
							<div>
								<small>ANA SAYFADAN BULUNDU</small>
								<h3>{site.title || site.url}</h3>
							</div>
							<a href={site.url} target="_blank" rel="noreferrer">
								Kaynak ↗
							</a>
						</header>
						<p>{site.description}</p>
						<div className="brand-site-palette">
							{site.colors.map((color) => (
								<button
									key={color}
									type="button"
									title="Palete ekle"
									disabled={busy}
									onClick={() =>
										setBrand((b) => ({
											...b,
											colors: b.colors.includes(color)
												? b.colors
												: [b.colors, color].filter(Boolean).join(" · "),
										}))
									}
								>
									<i style={{ background: color }} />
									{color}
								</button>
							))}
						</div>
						<small>
							Renkler CSS kullanımlarından çıkarılır; kurumsal paletin kesin karşılığı olmayabilir.
						</small>
						<div className="brand-site-logos">
							{site.candidates.map((a) => (
								<article key={a.id}>
									<img src={a.src} alt={a.name} />
									<small>
										{a.kind === "icon" ? "Site simgesi · logo olmayabilir" : "Logo adayı"} ·{" "}
										{a.originalMime === "image/svg+xml" ? "SVG" : "PNG / raster"}
									</small>
									<button
										disabled={
											busy || brand.assets.some((b) => b.src === a.src) || brand.assets.length >= 12
										}
										onClick={() => setBrand((b) => ({ ...b, assets: [...b.assets, { ...a }] }))}
									>
										{brand.assets.some((b) => b.src === a.src)
											? "✓ Eklendi"
											: "＋ Marka logosu olarak ekle"}
									</button>
									<a href={a.originalSrc || a.src} download={a.name}>
										Dosyayı indir ↓
									</a>
								</article>
							))}
						</div>
						<details>
							<summary>Ana sayfadan okunan detaylar</summary>
							<p className="brand-site-text">{site.text}</p>
						</details>
						{site.warnings.map((w, i) => (
							<p key={i} className="creative-warning">
								{w}
							</p>
						))}
					</section>
				)}
				<div className="brand-fields">
					{(
						[
							["name", "Marka adı"],
							["description", "Marka / hedef kitle"],
							["colors", "Renkler (HEX)"],
							["fonts", "Tipografi"],
							["tone", "İletişim tonu"],
							["style", "Görsel dil / tarz kilidi"],
							["avoid", "Kaçınılacaklar"],
						] as const
					).map(([key, label]) => (
						<label key={key}>
							{label}
							<input
								aria-label={label}
								maxLength={4000}
								value={brand[key]}
								onChange={(e) => field(key, e.target.value)}
							/>
						</label>
					))}
				</div>
				<section className="brand-products">
					<h3>Ürün ailesi</h3>
					<div className="brand-product-list">
						<button className={!productId ? "selected" : ""} onClick={() => setProductId("")}>
							Marka kimliği
						</button>
						{brand.products.map((p) => (
							<button
								key={p.id}
								className={productId === p.id ? "selected" : ""}
								onClick={() => setProductId(p.id)}
							>
								{p.name || "Yeni ürün"}
							</button>
						))}
						<button
							onClick={() => {
								const p = { id: crypto.randomUUID(), name: "", description: "", assets: [] };
								setBrand((b) => ({ ...b, products: [...b.products, p] }));
								setProductId(p.id);
							}}
						>
							＋ Ürün
						</button>
					</div>
					{product && (
						<div className="brand-fields">
							<label>
								Ürün adı
								<input
									aria-label="Ürün adı"
									value={product.name}
									onChange={(e) =>
										setBrand((b) => ({
											...b,
											products: b.products.map((p) =>
												p.id === productId ? { ...p, name: e.target.value } : p,
											),
										}))
									}
								/>
							</label>
							<label>
								Ürün bilgileri
								<input
									aria-label="Ürün bilgileri"
									value={product.description}
									onChange={(e) =>
										setBrand((b) => ({
											...b,
											products: b.products.map((p) =>
												p.id === productId ? { ...p, description: e.target.value } : p,
											),
										}))
									}
								/>
							</label>
						</div>
					)}
				</section>
				<h3>{product ? `${product.name || "Ürün"} görselleri` : "Logo ve kimlik görselleri"}</h3>
				<div className="brand-assets">
					{(product?.assets || brand.assets).map((a) => (
						<div key={a.id}>
							<img src={a.src} alt={a.name} />
							<small>
								{a.role} · {a.name}
							</small>
							<button
								aria-label={`${a.name} kaldır`}
								onClick={() =>
									setBrand((b) =>
										productId
											? {
													...b,
													products: b.products.map((p) =>
														p.id === productId
															? { ...p, assets: p.assets.filter((v) => v.id !== a.id) }
															: p,
													),
												}
											: { ...b, assets: b.assets.filter((v) => v.id !== a.id) },
									)
								}
							>
								×
							</button>
						</div>
					))}
				</div>
				<div className="brand-product-list">
					<select
						aria-label="Referans rolü"
						value={role}
						onChange={(e) => setRole(e.target.value as BrandAsset["role"])}
					>
						<option value="logo">Logo</option>
						<option value="product">Ürün</option>
						<option value="style">Kimlik / tarz</option>
					</select>
					<button onClick={() => files.current?.click()}>＋ Dosya ekle</button>
				</div>
				<small>
					PNG, JPG, WebP veya SVG. PDF kılavuzunun ilgili sayfalarını görsel olarak ekleyebilirsin.
				</small>
				<input
					hidden
					ref={files}
					type="file"
					multiple
					accept="image/png,image/jpeg,image/webp,image/svg+xml"
					onChange={(e) => {
						void add([...(e.target.files || [])]);
						e.target.value = "";
					}}
				/>
				<p role="status">{status}</p>
			</div>
			<footer>
				{onDelete && !deleteRequested && <button className="creative-danger" disabled={busy} onClick={() => setDeleteRequested(true)}>Markayı sil</button>}
				{onDelete && deleteRequested && <div role="alert" className="creative-delete-confirm"><p><strong>{brand.name}</strong> ve ürünleri marka listesinden kaldırılacak. Galerideki görseller korunur; Silinen markalar’dan geri yükleyebilirsin.</p><button disabled={busy} onClick={() => setDeleteRequested(false)}>Silmekten vazgeç</button><button className="creative-danger" disabled={busy} onClick={async () => { setBusy(true); try { await onDelete(); onClose(); } catch(e) { setStatus(String(e)); setBusy(false); } }}>Markayı silmeyi onayla</button></div>}
				<button disabled={busy} onClick={onClose}>
					Vazgeç
				</button>
				<button
					className="creative-primary"
					disabled={busy || !brand.name.trim() || brand.products.some((p) => !p.name.trim())}
					onClick={async () => {
						setBusy(true);
						try {
							await onSave({ ...brand, name: brand.name.trim(), updatedAt: Date.now() });
							onClose();
						} catch (e) {
							setStatus(String(e));
							setBusy(false);
						}
					}}
				>
					Markayı kaydet
				</button>
			</footer>
		</dialog>
	);
}
