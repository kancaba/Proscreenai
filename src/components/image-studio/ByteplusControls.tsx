import { ShieldCheck } from "lucide-react";
import { ConnectionKeyField } from "./ConnectionKeyField";
import "./byteplus.css";
import { useState } from "react";
import {
	BYTEPLUS_MODELS,
	BYTEPLUS_PRICE_DATE,
	BYTEPLUS_PRICE_SOURCE,
	type ByteplusLedger,
	type ByteplusModel,
	type ByteplusOptions,
	type ByteplusSize,
	byteplusEstimate,
	POSTER_TYPES,
	type PosterType,
} from "../../lib/byteplusSettings";
export function ByteplusControls({
	options,
	onChange,
	busy,
	references,
	ledger,
	onRefresh,
	onRecover,
	onPreview,
	keyReady,
	onSettings,
}: {
	options: ByteplusOptions;
	onChange: (options: ByteplusOptions) => void;
	busy: boolean;
	references: number;
	ledger?: ByteplusLedger;
	onRefresh: () => void;
	onRecover: (id: string) => void;
	onPreview: () => void;
	keyReady: boolean;
	onSettings: () => void;
}) {
	const cost = byteplusEstimate(options.model, options.size, references);
	return (
		<div className="byteplus-controls">
			<div className="byteplus-fields">
				<label>
					Model
					<select
						aria-label="Seedream modeli"
						value={options.model}
						disabled={busy}
						onChange={(e) => {
							const model = e.target.value as ByteplusModel;
							onChange({ ...options, model, size: BYTEPLUS_MODELS[model].defaultSize });
						}}
					>
						{Object.entries(BYTEPLUS_MODELS).map(([id, model]) => (
							<option key={id} value={id}>
								{model.name}
							</option>
						))}
					</select>
				</label>
				<label>
					Çözünürlük
					<select
						aria-label="Seedream çözünürlüğü"
						value={options.size}
						disabled={busy}
						onChange={(e) => onChange({ ...options, size: e.target.value as ByteplusSize })}
					>
						{BYTEPLUS_MODELS[options.model].sizes.map((size) => (
							<option key={size}>{size}</option>
						))}
					</select>
				</label>
				<label>
					Tasarım türü
					<select
						aria-label="Poster türü"
						value={options.posterType}
						disabled={busy}
						onChange={(e) => onChange({ ...options, posterType: e.target.value as PosterType })}
					>
						{Object.entries(POSTER_TYPES).map(([id, item]) => (
							<option key={id} value={id}>
								{item.name}
							</option>
						))}
					</select>
				</label>
			</div>
			<label className="byteplus-copy">
				Görselde aynen yazılacak metin
				<textarea
					aria-label="Posterde kullanılacak metin"
					value={options.visibleText}
					maxLength={2000}
					rows={2}
					disabled={busy}
					placeholder={"Örn. Yeni Koleksiyon\nTarzını Keşfet"}
					onChange={(e) => onChange({ ...options, visibleText: e.target.value })}
				/>
			</label>
			<div className="byteplus-budget">
				<label>
					Yerel toplam harcama sınırı (USD)
					<input
						aria-label="BytePlus harcama sınırı USD"
						type="number"
						min="0"
						max="10000"
						step="0.01"
						value={options.budgetUSD}
						disabled={busy}
						onChange={(e) => {
							const value = Number(e.target.value);
							if (Number.isFinite(value))
								onChange({ ...options, budgetUSD: Math.max(0, Math.min(10000, value)) });
						}}
					/>
				</label>
				<label className="byteplus-watermark">
					<input
						aria-label="Seedream filigranı"
						type="checkbox"
						checked={options.watermark}
						disabled={busy}
						onChange={(e) => onChange({ ...options, watermark: e.target.checked })}
					/>{" "}
					AI filigranı
				</label>
			</div>
			<div className="byteplus-cost" role="status">
				<strong>1 görsel · Tahmini ${cost.toFixed(3)} USD</strong>
				<span>
					{ledger
						? `Bu cihazda kullanılan/ayrılan: $${ledger.reservedUSD.toFixed(3)} USD`
						: "Yerel kullanım yüklenmedi; üretim öncesi yeniden kontrol edilir."}
				</span>
			</div>
			<p className="image-hint">
				Sınır bu cihazdaki BytePlus kayıtları içindir; hesap bakiyesi veya deneme kredisi değildir.
				Belirsiz istekler de sınıra dahildir. Fiyat tahmini: {BYTEPLUS_PRICE_DATE}.{" "}
				<a href={BYTEPLUS_PRICE_SOURCE} target="_blank" rel="noreferrer">
					Fiyat kaynağı
				</a>
			</p>
			<div className="byteplus-buttons">
				<button type="button" disabled={busy} onClick={onSettings}>
					{keyReady ? "API bağlantısını yönet" : "ModelArk API anahtarı ekle"}
				</button>
				<button type="button" disabled={busy} onClick={onPreview}>
					API isteğini önizle · ücretsiz
				</button>
			</div>
			<details className="byteplus-history">
				<summary>Kayıtlı API sonuçları</summary>
				<button type="button" disabled={busy} onClick={onRefresh}>
					Kayıtları yenile
				</button>
				{ledger?.jobs.length ? (
					ledger.jobs.map((job) => (
						<div className="byteplus-job" key={job.id}>
							<span>
								{new Date(job.createdAt).toLocaleString("tr-TR")} ·{" "}
								{BYTEPLUS_MODELS[job.model].name}
								<small>
									{job.state === "complete"
										? "Kaydedildi"
										: job.state === "received"
											? "İndirilmeyi bekliyor"
											: job.state === "failed"
												? "Reddedildi"
												: "Sonuç belirsiz"}{" "}
									· ${job.estimatedCostUSD.toFixed(3)}
								</small>
							</span>
							{job.canRecover && (
								<button type="button" disabled={busy} onClick={() => onRecover(job.id)}>
									{job.state === "complete" ? "Galeriye al" : "Sonucu kurtar"}
								</button>
							)}
						</div>
					))
				) : (
					<p className="image-hint">Henüz kayıtlı üretim yok.</p>
				)}
				<p className="image-hint">
					Bu düğmeler yeni üretim yapmaz. İndirme bağlantıları 24 saat geçerlidir; tamamlanan
					dosyalar bu cihazdan alınır.
				</p>
			</details>
		</div>
	);
}
export function ByteplusConnection({
	ready,
	persistent,
	busy,
	onSaved,
	onStatus,
}: {
	ready: boolean;
	persistent: boolean;
	busy: boolean;
	onSaved: (status: { configured: boolean; persistent: boolean }) => void;
	onStatus: (message: string) => void;
}) {
	const [key, setKey] = useState(""),
		[saving, setSaving] = useState(false),
		[message, setMessage] = useState("");
	async function change(clear: boolean) {
		setSaving(true);
		try {
			const result = clear
				? await window.electronAPI.byteplusClearKey()
				: await window.electronAPI.byteplusSaveKey(key);
			onSaved(result);
			setKey("");
			const text = clear
				? "ModelArk anahtarı kaldırıldı."
				: "ModelArk anahtarı kaydedildi. Kaydetme işlemi üretim çağrısı yapmadı.";
			setMessage(text);
			onStatus(text);
		} catch {
			setMessage(
				"Anahtar kaydedilemedi. Geçerli ModelArk API anahtarını ve güvenli depolamayı kontrol edin.",
			);
		} finally {
			setSaving(false);
		}
	}
	return (
		<section className="byteplus-connection connection-provider-panel">
			<div className="connection-provider-title">
				<h4>BytePlus · ModelArk</h4>
				<span className={`connection-badge ${ready ? "is-connected" : ""}`}>
					{ready ? "Anahtar kayıtlı" : "Kurulum gerekli"}
				</span>
			</div>
			<p>Seedream ile görsel üretmek için ModelArk API anahtarını bağla.</p>
			<ConnectionKeyField
				label="ModelArk API anahtarı"
				value={key}
				onChange={setKey}
				disabled={busy || saving}
				placeholder={ready ? "Değiştirmek için yeni anahtar" : "API anahtarını yapıştır"}
			/>
			<a
				className="connection-key-link"
				href="https://ai.byteplus.com/ark/region:ap-southeast-1/apikey"
				target="_blank"
				rel="noreferrer"
			>
				ModelArk konsolundan anahtar al ↗
			</a>
			<div className="connection-form-actions">
				<button
					type="button"
					className="connection-save"
					disabled={busy || saving || !key.trim()}
					onClick={() => void change(false)}
				>
					{saving ? "Kaydediliyor…" : "ModelArk anahtarını kaydet"}
				</button>
				{ready && (
					<button
						type="button"
						className="connection-remove"
						disabled={busy || saving}
						onClick={() => void change(true)}
					>
						ModelArk anahtarını kaldır
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
			{message && (
				<p className="connection-message" role="status">
					{message}
				</p>
			)}
		</section>
	);
}
