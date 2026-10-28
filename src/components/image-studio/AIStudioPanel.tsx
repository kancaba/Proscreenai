import "./connection-settings.css";
import { KeyRound, RefreshCw, ShieldCheck, X } from "lucide-react";
import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { byteplusPayload } from "../../lib/byteplusPayload";
import {
	type ByteplusLedger,
	DEFAULT_BYTEPLUS_OPTIONS,
	isByteplusOptions,
} from "../../lib/byteplusSettings";
import { IMAGE_RESOLUTIONS, type ImageResolution } from "../../lib/imageGenerationSettings";
import type { ImageRunMetadata } from "../../lib/imageUsage";
import { GenerationProgress } from "../creative-studio/GenerationProgress";
import { UsageDetails } from "../creative-studio/UsageDetails";
import { ByteplusConnection, ByteplusControls } from "./ByteplusControls";
import { ConnectionKeyField } from "./ConnectionKeyField";
import type { ImageBrief, Layer } from "./document";
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
		[provider, setProvider] = useState<"gemini" | "codex" | "byteplus">(
			settings?.provider ?? "gemini",
		),
		[byteplus, setByteplus] = useState(
			isByteplusOptions(settings?.byteplus) ? settings.byteplus : DEFAULT_BYTEPLUS_OPTIONS,
		),
		[byteplusKey, setByteplusKey] = useState({ configured: false, persistent: true }),
		[ledger, setLedger] = useState<ByteplusLedger>(),
		[preview, setPreview] = useState(""),
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
		[settingsProvider, setSettingsProvider] = useState<"byteplus" | "gemini" | "codex">("byteplus"),
		[connectionMessage, setConnectionMessage] = useState(""),
		[codexReady, setCodexReady] = useState(false);
	const promptId = useId();
	const connectionTitleId = useId();
	const requestInput = useRef<HTMLTextAreaElement>(null);
	useLayoutEffect(() => {
		const el = requestInput.current;
		if (!el || busy) return;
		el.style.height = "auto";
		el.style.height = `${Math.min(380, Math.max(gallery ? 180 : 220, el.scrollHeight))}px`;
	}, [requestText, gallery, busy]);
	const fileInput = useRef<HTMLInputElement>(null),
		dialog = useRef<HTMLDialogElement>(null),
		previewDialog = useRef<HTMLDialogElement>(null),
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
			byteplus,
		});
	}, [requestText, refs, provider, imageSize, byteplus]);
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
	function openConnections() {
		setSettingsProvider(provider);
		setConnectionMessage("");
		dialog.current?.showModal();
	}
	async function refreshByteplus() {
		try {
			const [keyStatus, nextLedger] = await Promise.all([
				window.electronAPI.byteplusKeyStatus(),
				window.electronAPI.byteplusLedger(),
			]);
			if (mounted.current) {
				setByteplusKey(keyStatus);
				setLedger(nextLedger);
			}
		} catch {
			if (mounted.current)
				setStatus(
					"BytePlus kayıtları okunamadı. Üretim öncesi yerel bütçe yeniden kontrol edilir.",
				);
		}
	}
	async function refresh() {
		void refreshByteplus();
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
	function previewByteplus() {
		try {
			const references = refs
				.map((id) => layers.find((l) => l.id === id))
				.filter((l): l is Layer => !!l?.src);
			const target = fixedFormat ? { width, height } : inferImageFormat(requestText, width, height);
			const resolved =
				mode === "auto"
					? inferImageMode(
							requestText,
							!!references.length,
							references[0]?.name.startsWith("AI ") ?? false,
						)
					: mode;
			const body = byteplusPayload({
				prompt: (context ? context.slice(0, 6000) + "\nUSER REQUEST:\n" : "") + requestText,
				references: references.map((l) => l.src!),
				referenceNames: references.map((l) => l.name.slice(0, 200)),
				width: target.width,
				height: target.height,
				mode: resolved,
				options: byteplus,
			});
			setPreview(
				JSON.stringify(
					{
						...body,
						...(body.image
							? {
									image: body.image.map(
										(_image, i) => `[Referans ${i + 1}: ${references[i].name}]`,
									),
								}
							: {}),
					},
					null,
					2,
				),
			);
			previewDialog.current?.showModal();
		} catch (e) {
			setStatus(e instanceof Error ? e.message : "İstek önizlenemedi.");
		}
	}
	async function recoverByteplus(id: string) {
		if (busy || activeRequest.current) return;
		activeRequest.current = id;
		setBusy(true);
		onBusy?.(true);
		setStartedAt(Date.now());
		setPhase("receiving");
		setStatus("Kayıtlı görsel alınıyor; yeni üretim yapılmıyor…");
		try {
			const result = await window.electronAPI.byteplusRecover(id);
			if (!mounted.current) return;
			if (!result.success || !result.image)
				throw Error(result.error || "Kayıtlı görsel alınamadı.");
			setLastRun(result);
			onResult(
				result.image,
				`AI kurtarılan · ${new Date().toLocaleTimeString("tr-TR")}`,
				{ width: result.actualWidth || width, height: result.actualHeight || height },
				result,
			);
			setStatus("Kayıtlı görsel galeriye/tuvale eklendi. Yeni üretim yapılmadı.");
		} catch (e) {
			if (mounted.current) setStatus(e instanceof Error ? e.message : "Sonuç alınamadı.");
		} finally {
			activeRequest.current = null;
			if (mounted.current) {
				setBusy(false);
				onBusy?.(false);
				void refreshByteplus();
			}
		}
	}
	async function generate() {
		if (busy || activeRequest.current) return;
		if (!requestText.trim()) {
			setStatus("Ne oluşturmak istediğini yaz.");
			return;
		}
		if (
			(provider === "gemini" && !keyReady) ||
			(provider === "byteplus" && !byteplusKey.configured)
		) {
			openConnections();
			return;
		}
		if (provider === "codex" && !codexReady) {
			setStatus("Codex oturumunu kontrol edin veya başka bir sağlayıcı seçin.");
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
					(provider === "byteplus"
						? ""
						: `\nComposition aspect ratio: ${target.width}:${target.height}. Native resolution preset: ${imageSize}. Preserve this aspect ratio; do not upscale to simulate native detail.`),
				references: references.map((l) => l.src!),
				referenceNames: references.map((l) => l.name.slice(0, 200)),
				...(provider === "byteplus" ? { byteplus } : {}),
				width: target.width,
				height: target.height,
				imageSize,
				auto: true,
			});
			if (!mounted.current) return;
			setLastRun({
				usage: result.usage,
				durationMs: result.durationMs,
				provider: result.provider,
				requestedResolution: result.requestedResolution ?? imageSize,
				actualWidth: result.actualWidth,
				actualHeight: result.actualHeight,
			});
			if (!result.success) throw Error(result.error || "Görsel üretilemedi.");
			if (!result.image) throw Error("Görsel dosyası dönmedi.");
			onResult(
				result.image,
				`AI ${resolved === "edit" ? "düzenleme" : "üretim"} · ${new Date().toLocaleTimeString("tr-TR")}`,
				target,
				{
					usage: result.usage,
					durationMs: result.durationMs,
					provider: result.provider,
					requestedResolution: result.requestedResolution ?? imageSize,
					actualWidth: result.actualWidth,
					actualHeight: result.actualHeight,
				},
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
				if (provider === "byteplus") void refreshByteplus();
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
							setProvider(e.target.value as "gemini" | "codex" | "byteplus");
						}}
					>
						<option value="gemini">Nano Banana · Gemini</option>
						<option value="codex">Codex · ChatGPT</option>
						<option value="byteplus">BytePlus · Seedream API</option>
					</select>
					{provider !== "byteplus" && (
						<select
							className="image-resolution-select"
							aria-label="Üretim çözünürlüğü"
							value={imageSize}
							disabled={busy}
							onChange={(e) => setImageSize(e.target.value as ImageResolution)}
						>
							{IMAGE_RESOLUTIONS.map((size) => (
								<option key={size} value={size}>
									{size} · {size === "1K" ? "Standart" : size === "2K" ? "Yüksek" : "En yüksek"}
								</option>
							))}
						</select>
					)}
					<button
						aria-label="AI bağlantı ayarları"
						title="Bağlantı ayarları"
						onClick={openConnections}
					>
						⚙
					</button>
				</div>
			</div>
			{provider === "byteplus" && (
				<ByteplusControls
					options={byteplus}
					onChange={setByteplus}
					busy={busy}
					references={refs.length}
					ledger={ledger}
					onRefresh={() => void refreshByteplus()}
					onRecover={(id) => void recoverByteplus(id)}
					onPreview={previewByteplus}
					keyReady={byteplusKey.configured}
					onSettings={openConnections}
				/>
			)}
			{busy && <GenerationProgress stage={phase} detail={status} startedAt={startedAt} />}
			<label className="image-prompt-label" htmlFor={promptId}>
				<span>Fikrini anlat</span>
				<small>AI ile yeni bir şey yarat.</small>
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
			<div className="image-prompt-meta">
				<span>Ürün bağlantısı yapıştırabilir, görsel veya logo ekleyebilirsin.</span>
				<span>
					{requestText.length.toLocaleString("tr-TR")} / {context ? "8.500" : "12.000"}
				</span>
			</div>
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
						<button
							disabled={busy}
							onClick={() => setRefs((old) => [latest.id, ...old].slice(0, 4))}
						>
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
			{busy && provider !== "byteplus" && (
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
				{provider === "byteplus"
					? "İstek ve referanslar BytePlus ModelArk API’ye gönderilir. Gönderilen ücretli isteğin durması garanti edilemez; ekran kapansa da dönen sonuç bu cihazda saklanır."
					: provider === "gemini"
						? "İstek ve seçilen görseller Google Gemini’ye gönderilir. Gemini API kotan kullanılır."
						: "İstek ve seçilen görseller Codex’e gönderilir. Mevcut hesap limitlerin kullanılır."}
			</small>
			<small className="image-resolution-hint">
				{provider === "byteplus"
					? "Ücret görsel tarifesine göre tahmin edilir. Gerçek çıktı boyutu ve kullanım sonuçta gösterilir. Otomatik tekrar üretim yapılmaz."
					: provider === "codex"
						? "Codex’te çözünürlük hedef olarak iletilir; gerçek boyut galeride gösterilir. Token toplamı oturum ve önbelleği de içerir."
						: "Çözünürlük doğrudan Gemini’ye iletilir. Daha yüksek çözünürlük süreyi ve tüketimi artırabilir."}
			</small>
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
			{gallery && !busy && !requestText.trim() && (
				<div className="image-prompt-starters" aria-label="İstek fikirleri">
					<span>Bir yerden başla</span>
					{[
						[
							"Ürün çekimi",
							"Ürün görselimi koruyarak premium bir stüdyo çekimi oluştur. Sade fon, yumuşak ışık ve doğal gölgeler kullan.",
						],
						[
							"Sosyal medya",
							"Markam için Instagram'da paylaşılacak 4:5 bir kampanya görseli oluştur. Güçlü bir kompozisyon ve okunaklı Türkçe başlık kullan.",
						],
						[
							"Arka planı değiştir",
							"Referans görseldeki ürünü ve logoyu koru. Arka planı sade, sıcak tonlarda bir stüdyo ortamıyla değiştir.",
						],
					].map(([label, prompt]) => (
						<button
							key={label}
							onClick={() => {
								setRequestText(prompt);
								requestInput.current?.focus();
							}}
						>
							{label} ↗
						</button>
					))}
				</div>
			)}
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
			<dialog ref={previewDialog} className="image-ai-settings byteplus-preview">
				<header>
					<h3>Seedream API isteği · önizleme</h3>
					<button
						aria-label="API önizlemesini kapat"
						onClick={() => previewDialog.current?.close()}
					>
						×
					</button>
				</header>
				<p>
					API çağrısı yapılmadı. Referansların içeriği ve anahtar gösterilmez. Brief'teki web
					bağlantılarının ürün bilgileri üretim sırasında eklenebilir.
				</p>
				<pre>{preview}</pre>
				<button onClick={() => previewDialog.current?.close()}>Kapat</button>
			</dialog>
			<dialog ref={dialog} className="studio-connection-dialog" aria-labelledby={connectionTitleId}>
				<header className="connection-header">
					<div className="connection-heading">
						<span className="connection-heading-icon">
							<KeyRound size={19} aria-hidden="true" />
						</span>
						<div>
							<h3 id={connectionTitleId}>AI bağlantı ayarları</h3>
							<p>Görsel üretim araçlarını yönet.</p>
						</div>
					</div>
					<button
						type="button"
						className="connection-close"
						aria-label="AI ayarlarını kapat"
						onClick={() => dialog.current?.close()}
					>
						<X size={18} />
					</button>
				</header>
				<div className="connection-provider-switch" role="group" aria-label="Bağlantı sağlayıcısı">
					{(
						[
							["byteplus", "BytePlus", "BP"],
							["gemini", "Gemini", "G"],
							["codex", "Codex", "C"],
						] as const
					).map(([id, label, icon]) => (
						<button
							type="button"
							key={id}
							aria-pressed={settingsProvider === id}
							onClick={() => {
								setSettingsProvider(id);
								setConnectionMessage("");
							}}
						>
							<span aria-hidden="true">{icon}</span>
							{label}
							<i
								className={
									(
										id === "byteplus"
											? byteplusKey.configured
											: id === "gemini"
												? keyReady
												: codexReady
									)
										? "is-connected"
										: ""
								}
								aria-label={
									(
										id === "byteplus"
											? byteplusKey.configured
											: id === "gemini"
												? keyReady
												: codexReady
									)
										? "Yapılandırılmış"
										: "Bağlı değil"
								}
							/>
						</button>
					))}
				</div>
				<div className="connection-body">
					{settingsProvider === "byteplus" && (
						<ByteplusConnection
							ready={byteplusKey.configured}
							persistent={byteplusKey.persistent}
							busy={busy}
							onSaved={(next) => {
								setByteplusKey(next);
								if (next.configured) {
									setProvider("byteplus");
									chosen.current = true;
								}
							}}
							onStatus={setStatus}
						/>
					)}
					{settingsProvider === "gemini" && (
						<section className="connection-provider-panel">
							<div className="connection-provider-title">
								<h4>Nano Banana · Gemini</h4>
								<span className={`connection-badge ${keyReady ? "is-connected" : ""}`}>
									{keyReady ? "Anahtar kayıtlı" : "Kurulum gerekli"}
								</span>
							</div>
							<p>Google Gemini hesabının API anahtarıyla görsel oluştur.</p>
							<ConnectionKeyField
								label="Gemini API anahtarı"
								value={key}
								onChange={setKey}
								disabled={busy || savingKey}
								placeholder={keyReady ? "Değiştirmek için yeni anahtar" : "API anahtarını yapıştır"}
							/>
							<div className="connection-form-actions">
								<button
									type="button"
									className="connection-save"
									disabled={busy || savingKey || !key.trim()}
									onClick={async () => {
										setSavingKey(true);
										try {
											const r = await window.electronAPI.geminiSaveKey(key);
											setKey("");
											setKeyReady(r.configured);
											setPersistent(r.persistent);
											setProvider("gemini");
											chosen.current = true;
											setConnectionMessage("Gemini anahtarı kaydedildi.");
											setStatus("Gemini anahtarı kaydedildi.");
										} catch {
											setConnectionMessage("Anahtar kaydedilemedi. API anahtarını kontrol et.");
										} finally {
											setSavingKey(false);
										}
									}}
								>
									{savingKey ? "Kaydediliyor…" : "Anahtarı kaydet"}
								</button>
								{keyReady && (
									<button
										type="button"
										className="connection-remove"
										disabled={busy || savingKey}
										onClick={async () => {
											setSavingKey(true);
											try {
												await window.electronAPI.geminiClearKey();
												setKeyReady(false);
												setKey("");
												setConnectionMessage("Gemini anahtarı kaldırıldı.");
											} catch {
												setConnectionMessage("Anahtar kaldırılamadı. Tekrar dene.");
											} finally {
												setSavingKey(false);
											}
										}}
									>
										Anahtarı kaldır
									</button>
								)}
							</div>
							<div className="connection-security">
								<ShieldCheck size={16} aria-hidden="true" />
								<p>
									{persistent
										? "Bu cihazda şifrelenerek saklanır. Proje dosyasına eklenmez."
										: "Güvenli depolama yok. Anahtar yalnızca bu oturumda tutulur."}
								</p>
							</div>
						</section>
					)}
					{settingsProvider === "codex" && (
						<section className="connection-provider-panel">
							<div className="connection-provider-title">
								<h4>Codex · ChatGPT</h4>
								<span className={`connection-badge ${codexReady ? "is-connected" : ""}`}>
									{codexReady ? "Hazır" : "Bağlantı gerekli"}
								</span>
							</div>
							<p>Bu bilgisayardaki Codex oturumunu kullanır. Ayrı bir API anahtarı gerekmez.</p>
							<div className="connection-codex-state">
								<span className={`connection-state-dot ${codexReady ? "is-connected" : ""}`} />
								<div>
									<strong>{codexReady ? "Görsel aracı hazır" : "Codex oturumu bulunamadı"}</strong>
									<p>
										{codexReady
											? "Mevcut hesap limitlerinle üretim yapabilirsin."
											: "Codex kurulumunu ve oturumunu kontrol et, ardından bağlantıları yenile."}
									</p>
								</div>
							</div>
						</section>
					)}
					{connectionMessage && (
						<p className="connection-message" role="status">
							{connectionMessage}
						</p>
					)}
				</div>
				<footer className="connection-footer">
					<button
						type="button"
						className="connection-refresh"
						disabled={busy || savingKey}
						onClick={() => {
							void refresh();
							setConnectionMessage("Bağlantı bilgileri yenileniyor; görsel üretilmez.");
						}}
					>
						<RefreshCw size={14} aria-hidden="true" />
						Bağlantıları kontrol et
					</button>
					<button type="button" className="connection-done" onClick={() => dialog.current?.close()}>
						Tamam
					</button>
				</footer>
			</dialog>
		</section>
	);
}
