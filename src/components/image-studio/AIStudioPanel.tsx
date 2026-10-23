import { IMAGE_RESOLUTIONS, type ImageResolution } from "../../lib/imageGenerationSettings";
import type { ImageRunMetadata } from "../../lib/imageUsage";
import { GenerationProgress } from "../creative-studio/GenerationProgress";
import { UsageDetails } from "../creative-studio/UsageDetails";
import { useEffect, useLayoutEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Layer, ImageBrief } from "./document";
import { inferImageFormat, inferImageMode } from "./imageRequest";
export function AIStudioPanel({
	layers,
	width,
	height,
	onResult,
	settings,
	onSettings,
	onImport,
	context = "",
	gallery = false,
	fixedFormat = false,
	onBusy,
	toolbar,
}: {
	toolbar?: ReactNode;
	context?: string;
	gallery?: boolean;
	fixedFormat?: boolean;
	onBusy?: (busy: boolean) => void;
	layers: Layer[];
	width: number;
	height: number;
	onResult: (
		src: string,
		name: string,
		canvas?: { width: number; height: number },
		metadata?: ImageRunMetadata,
	) => void;
	settings?: ImageBrief;
	onSettings: (settings: ImageBrief) => void;
	onImport: (file: File) => Promise<Layer | undefined>;
}) {
	const [requestText, setRequestText] = useState(settings?.brief || settings?.prompt || ""),
		[provider, setProvider] = useState<"gemini" | "codex">(settings?.provider ?? "gemini"),
		[mode, setMode] = useState<"auto" | "generate" | "edit">("auto"),
		[imageSize, setImageSize] = useState<ImageResolution>(settings?.imageSize ?? "1K"),
		[refs, setRefs] = useState<string[]>(
			settings?.refs.length
				? settings.refs
				: layers
						.filter((l) => l.kind === "image" && l.visible)
						.slice(0, 4)
						.map((l) => l.id),
		),
		[status, setStatus] = useState(""),
		[phase, setPhase] = useState("preparing"),
		[startedAt, setStartedAt] = useState(0),
		[lastRun, setLastRun] = useState<ImageRunMetadata>(),
		[liveUsage, setLiveUsage] = useState<ImageRunMetadata["usage"]>(),
		[busy, setBusy] = useState(false),
		[keyReady, setKeyReady] = useState(false),
		[persistent, setPersistent] = useState(true),
		[key, setKey] = useState(""),
		[savingKey, setSavingKey] = useState(false),
		[codexReady, setCodexReady] = useState(false);
	const promptId = useId();
	const requestInput = useRef<HTMLTextAreaElement>(null);
	useLayoutEffect(() => {
		const el = requestInput.current;
		if (!el || busy) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(380, Math.max(gallery ? 180 : 220, el.scrollHeight))}px`;
	}, [requestText, gallery, busy]);
	const fileInput = useRef<HTMLInputElement>(null),
		dialog = useRef<HTMLDialogElement>(null),
		activeRequest = useRef<string | null>(null),
		mounted = useRef(true),
		seen = useRef(new Set(layers.map((l) => l.id))),
		settingsCallback = useRef(onSettings),
		chosen = useRef(!!settings?.provider);
	settingsCallback.current = onSettings;
	useEffect(() => {
		settingsCallback.current({
			...settings,
			brand: settings?.brand ?? "",
			palette: settings?.palette ?? "",
			style: settings?.style ?? "",
			copy: settings?.copy ?? "",
			pageUrl: settings?.pageUrl ?? "",
			pageText: settings?.pageText ?? "",
			brief: requestText,
			prompt: requestText,
			refs,
			provider,
			imageSize,
		});
	}, [requestText, refs, provider, imageSize]);
	useEffect(() => {
		setRefs((old) => {
			const added = layers.filter(
				(l) => !seen.current.has(l.id) && l.kind === "image" && l.visible,
			);
			layers.forEach((l) => seen.current.add(l.id));
			const remaining = old.filter((id) =>
				layers.some((l) => l.id === id && (l.imageRole !== "artwork" || l.visible)),
			);
			const next = [...new Set([...added.map((l) => l.id), ...remaining])].slice(0, 4);
			return next.join() === old.join() ? old : next;
		});
	}, [layers]);
	async function refresh() {
		try {
			const keyStatus = await window.electronAPI.geminiKeyStatus();
			if (!mounted.current) return;
			setKeyReady(keyStatus.configured);
			setPersistent(keyStatus.persistent);
			if (!chosen.current) setProvider(keyStatus.configured ? "gemini" : "codex");
			const caps = await window.electronAPI.imageStudioCapabilities();
			if (mounted.current)
				setCodexReady(
					caps.imageGeneration && caps.tools.some((t) => t.id === "codex" && t.status === "ready"),
				);
		} catch (e) {
			if (mounted.current) setStatus(e instanceof Error ? e.message : String(e));
		}
	}
	useEffect(() => {
		mounted.current = true;
		void refresh();
		return () => {
			mounted.current = false;
			if (activeRequest.current) void window.electronAPI.imageStudioCancel(activeRequest.current);
		};
	}, []);
	useEffect(
		() =>
			window.electronAPI.onImageStudioProgress((e) => {
				if (e.requestId === activeRequest.current) {
					if (e.usage) setLiveUsage(e.usage);
					if (e.stage !== "usage") {
						setStatus(e.detail || e.stage);
						if (e.stage !== "message") setPhase(e.stage);
					}
				}
			}),
		[],
	);
	async function addFiles(files: File[]) {
		for (const file of files.slice(0, Math.max(0, 4 - refs.length))) {
			const layer = await onImport(file);
			if (layer && mounted.current) setRefs((old) => [...new Set([...old, layer.id])].slice(0, 4));
		}
	}
	async function generate() {
		if (busy) return;
		if (!requestText.trim()) {
			setStatus("Ne oluşturmak istediğini yaz.");
			return;
		}
		if (provider === "gemini" && !keyReady) {
			dialog.current?.showModal();
			return;
		}
		if (provider === "codex" && !codexReady) {
			setStatus("Codex oturumunu kontrol edin veya Nano Banana seçin.");
			return;
		}
		const references = refs
				.map((id) => layers.find((l) => l.id === id))
				.filter((l): l is Layer => !!l?.src),
			resolved =
				mode === "auto"
					? inferImageMode(
							requestText,
							!!references.length,
							references[0]?.name.startsWith("AI ") ?? false,
						)
					: mode;
		if (resolved === "edit" && !references.length) {
			setStatus("Düzenlemek için bir görsel ekle veya tuvalden seç.");
			return;
		}
		const target = fixedFormat ? { width, height } : inferImageFormat(requestText, width, height),
			id = crypto.randomUUID();
		activeRequest.current = id;
		setBusy(true);
		setStartedAt(Date.now());
		setPhase("preparing");
		setLastRun(undefined);
		setLiveUsage(undefined);
		onBusy?.(true);
		setStatus("İsteğin hazırlanıyor…");
		try {
			const result = await window.electronAPI.imageStudioRun({
				requestId: id,
				mode: resolved,
				tool: provider,
				prompt:
					(context ? context.slice(0, 6000) + "\nUSER REQUEST:\n" : "") +
					requestText +
					`\nComposition aspect ratio: ${target.width}:${target.height}. Native resolution preset: ${imageSize}. Preserve this aspect ratio; do not upscale to simulate native detail.`,
				references: references.map((l) => l.src!),
				width: target.width,
				height: target.height,
				imageSize,
				auto: true,
			});
			if (!mounted.current) return;
			setLastRun({ usage: result.usage, durationMs: result.durationMs, provider: result.provider, requestedResolution: result.requestedResolution ?? imageSize });
			if (!result.success) throw Error(result.error || "Görsel üretilemedi.");
			if (!result.image) throw Error("Görsel dosyası dönmedi.");
			onResult(
				result.image,
				`AI ${resolved === "edit" ? "düzenleme" : "üretim"} · ${new Date().toLocaleTimeString("tr-TR")}`,
				target,
				{ usage: result.usage, durationMs: result.durationMs, provider: result.provider, requestedResolution: result.requestedResolution ?? imageSize },
			);
			setStatus(
				gallery
					? "Hazır. Görsel galeriye eklendi. İstersen Düzenle ile katmanlı editörde açabilirsin."
					: "Hazır. Görsel tuvalde; üzerine yazı ve logo ekleyebilir veya yeni bir düzeltme yazabilirsin.",
			);
		} catch (e) {
			if (mounted.current) setStatus(e instanceof Error ? e.message : String(e));
		} finally {
			activeRequest.current = null;
			if (mounted.current) {
				setBusy(false);
				onBusy?.(false);
			}
		}
	}
	const images = layers.filter((l) => l.kind === "image" && l.src),
		latest = images.find((l) => l.imageRole === "artwork" && l.visible),
		history = images.filter((l) => l.name.startsWith("AI "));
	return (
		<section className={`image-ai-panel image-ai-simple ${busy ? "is-generating" : ""}`}>
			<h2>✦ AI ile tasarla</h2>
			<p className="image-ai-intro">
				Ne istediğini yaz. Marka, tarz ve kompozisyonu görsellerinden ve isteğinden çıkaralım.
			</p>
			<div className="image-ai-toolbar">
				{toolbar}
			<div className="image-ai-engine">
				<select
					aria-label="Görsel üretim aracı"
					value={provider}
					disabled={busy}
					onChange={(e) => {
						chosen.current = true;
						setProvider(e.target.value as "gemini" | "codex");
					}}
				>
					<option value="gemini">Nano Banana · Gemini</option>
					<option value="codex">Codex · ChatGPT</option>
				</select>
				<select className="image-resolution-select" aria-label="Üretim çözünürlüğü" value={imageSize} disabled={busy} onChange={e => setImageSize(e.target.value as ImageResolution)}>
					{IMAGE_RESOLUTIONS.map(size => <option key={size} value={size}>{size} · {size === "1K" ? "Standart" : size === "2K" ? "Yüksek" : "En yüksek"}</option>)}
				</select>
				<button
					aria-label="AI bağlantı ayarları"
					title="Bağlantı ayarları"
					onClick={() => dialog.current?.showModal()}
				>
					⚙
				</button>
			</div>
			</div>
			{busy && <GenerationProgress stage={phase} detail={status} startedAt={startedAt} />}
			<label className="image-prompt-label" htmlFor={promptId}>
				<span>Fikrini anlat</span><small>AI ile yeni bir şey yarat.</small>
			</label>
			<textarea
				id={promptId}
				ref={requestInput}
				className="image-ai-request"
				aria-label="Görsel isteği"
				placeholder="Örn. Ürünüm için sade bir Instagram kampanyası. Yumuşak ışık, sıcak tonlar ve güçlü bir başlık…"
				rows={gallery ? 3 : 8}
				maxLength={context ? 8500 : 12000}
				value={requestText}
				disabled={busy}
				onChange={(e) => setRequestText(e.target.value)}
				onKeyDown={(e) => {
					if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !e.nativeEvent.isComposing) {
						e.preventDefault();
						void generate();
					}
				}}
				onPaste={(e) => {
					const files = [...e.clipboardData.files];
					if (files.length) {
						e.preventDefault();
						void addFiles(files);
					}
				}}
			/>
			<div className="image-prompt-meta"><span>Ürün bağlantısı yapıştırabilir, görsel veya logo ekleyebilirsin.</span><span>{requestText.length.toLocaleString("tr-TR")} / {context ? "8.500" : "12.000"}</span></div>
			<div className="image-ai-attachments">
				{refs.map((id, i) => {
					const l = layers.find((l) => l.id === id);
					return l?.src ? (
						<div key={id}>
							<img src={l.src} alt={`Referans ${i + 1}: ${l.name}`} />
							<span>{i === 0 ? "Ana görsel" : l.name}</span>
							<button
								aria-label={`${l.name} referansı kaldır`}
								disabled={busy}
								onClick={() => setRefs((old) => old.filter((x) => x !== id))}
							>
								×
							</button>
						</div>
					) : null;
				})}
			</div>
			<div className="image-ai-actions">
			<div className="image-pair">
				<button disabled={busy || refs.length >= 4} onClick={() => fileInput.current?.click()}>
					＋ Görsel / logo ekle
				</button>
				{latest && !refs.includes(latest.id) && (
					<button disabled={busy} onClick={() => setRefs((old) => [latest.id, ...old].slice(0, 4))}>
						Tuvaldeki görseli kullan
					</button>
				)}
			</div>
			<button
				className="image-primary image-ai-generate"
				disabled={busy || !requestText.trim()}
				title="Oluştur · ⌘ / Ctrl + Enter"
				onClick={() => void generate()}
			>
				{busy ? "Oluşturuluyor…" : mode === "edit" ? "Görseli düzenle" : "✦ Oluştur"}
			</button>
			</div>
			{busy && (
				<button
					onClick={() => {
						setStatus("İptal ediliyor…");
						if (activeRequest.current)
							void window.electronAPI.imageStudioCancel(activeRequest.current);
					}}
				>
					İptal et
				</button>
			)}

			{busy && liveUsage && <UsageDetails usage={liveUsage} />}
			{!busy && lastRun && <UsageDetails usage={lastRun.usage} durationMs={lastRun.durationMs} />}
			<p role="status" className="image-ai-status" aria-live="polite">
				{!busy ? status : ""}
			</p>
			<small className="image-hint">
				{provider === "gemini"
					? "İstek ve seçilen görseller Google Gemini’ye gönderilir. Gemini API kotan kullanılır."
					: "İstek ve seçilen görseller Codex’e gönderilir. Mevcut hesap limitlerin kullanılır."}
			</small>
			<small className="image-resolution-hint">{provider === "codex" ? "Codex’te çözünürlük hedef olarak iletilir; gerçek boyut galeride gösterilir. Token toplamı oturum ve önbelleği de içerir." : "Çözünürlük doğrudan Gemini’ye iletilir. Daha yüksek çözünürlük süreyi ve tüketimi artırabilir."}</small>
			<details className="image-ai-options">
				<summary>Diğer seçenekler</summary>
				<label>
					İşlem
					<select
						aria-label="Görsel işlem türü"
						value={mode}
						onChange={(e) => setMode(e.target.value as typeof mode)}
					>
						<option value="auto">Otomatik anla</option>
						<option value="generate">Yeni görsel oluştur</option>
						<option value="edit">Mevcut görseli düzenle</option>
					</select>
				</label>
				<p className="image-hint">
					Oranı isteğinde belirtmezsen varsayılan ölçü ({width} × {height}) kullanılır. En fazla
					dört referans ekleyebilirsin.
				</p>
				{images
					.filter((l) => !refs.includes(l.id))
					.map((l) => (
						<button
							key={l.id}
							disabled={refs.length >= 4 || busy}
							onClick={() => setRefs((old) => [...old, l.id].slice(0, 4))}
						>
							{l.name} · referans ekle
						</button>
					))}
			</details>
			{gallery && !busy && !requestText.trim() && <div className="image-prompt-starters" aria-label="İstek fikirleri"><span>Bir yerden başla</span>{[
				["Ürün çekimi", "Ürün görselimi koruyarak premium bir stüdyo çekimi oluştur. Sade fon, yumuşak ışık ve doğal gölgeler kullan."],
				["Sosyal medya", "Markam için Instagram'da paylaşılacak 4:5 bir kampanya görseli oluştur. Güçlü bir kompozisyon ve okunaklı Türkçe başlık kullan."],
				["Arka planı değiştir", "Referans görseldeki ürünü ve logoyu koru. Arka planı sade, sıcak tonlarda bir stüdyo ortamıyla değiştir."],
			].map(([label, prompt]) => <button key={label} onClick={() => { setRequestText(prompt); requestInput.current?.focus(); }}>{label} ↗</button>)}</div>}
			{history.length > 1 && (
				<details>
					<summary>Önce / sonra</summary>
					<div className="image-compare">
						{history.slice(0, 2).map((l) => (
							<figure key={l.id}>
								<img src={l.src} alt={l.name} />
								<figcaption>{l.name}</figcaption>
							</figure>
						))}
					</div>
				</details>
			)}
			<input
				hidden
				ref={fileInput}
				type="file"
				accept="image/png,image/jpeg,image/webp,image/svg+xml"
				multiple
				onChange={(e) => {
					void addFiles([...(e.target.files ?? [])]);
					e.target.value = "";
				}}
			/>
			<dialog ref={dialog} className="image-ai-settings">
				<header>
					<h3>AI bağlantı ayarları</h3>
					<button aria-label="AI ayarlarını kapat" onClick={() => dialog.current?.close()}>
						×
					</button>
				</header>
				<h4>Nano Banana · Gemini</h4>
				<p>
					{keyReady
						? "Anahtar kayıtlı. Yeniden girmen gerekmiyor."
						: "Gemini API anahtarını bir kez ekle."}
				</p>
				<input
					type="password"
					aria-label="Gemini API anahtarı"
					autoComplete="off"
					spellCheck={false}
					placeholder={keyReady ? "Değiştirmek için yeni anahtar" : "Gemini API anahtarı"}
					value={key}
					onChange={(e) => setKey(e.target.value)}
				/>
				{key && (
					<button
						disabled={savingKey}
						onClick={async () => {
							setSavingKey(true);
							try {
								const r = await window.electronAPI.geminiSaveKey(key);
								setKey("");
								setKeyReady(r.configured);
								setPersistent(r.persistent);
								setProvider("gemini");
								chosen.current = true;
								setStatus("Gemini anahtarı kaydedildi. İsteğini yazıp Oluştur’a basabilirsin.");
							} catch (e) {
								setStatus(e instanceof Error ? e.message : String(e));
							} finally {
								setSavingKey(false);
							}
						}}
					>
						{savingKey ? "Kaydediliyor…" : "Anahtarı kaydet"}
					</button>
				)}
				{keyReady && (
					<button
						onClick={async () => {
							await window.electronAPI.geminiClearKey();
							setKeyReady(false);
							setStatus("Gemini anahtarı kaldırıldı.");
						}}
					>
						Anahtarı kaldır
					</button>
				)}
				<p className="image-hint">
					{persistent
						? "Anahtar işletim sistemi şifrelemesiyle bu bilgisayarda tutulur; proje dosyasına yazılmaz."
						: "Güvenli depolama yok; anahtar yalnız bu oturum boyunca tutulur."}
				</p>
				<h4>Codex</h4>
				<p>
					{codexReady
						? "Codex görsel aracı hazır."
						: "Codex kurulum ve oturum durumunu kontrol edin."}
				</p>
				<button onClick={() => void refresh()}>Bağlantıları kontrol et</button>
				<button className="image-primary" onClick={() => dialog.current?.close()}>
					Tamam
				</button>
			</dialog>
		</section>
	);
}
