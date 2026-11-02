import { useEffect, useRef, useState } from "react";
import {
	DEFAULT_REMINDERS,
	fromLocalInput,
	REMINDER_OPTIONS,
	SHARE_PLATFORMS,
	type SharePlatform,
	type SharePost,
	toLocalInput,
} from "../../lib/shareCalendar";
import type { Creation } from "./brand";

/** Small preview kept with the calendar entry so notifications can show it without the gallery. */
async function thumbnail(src: string) {
	const image = new Image();
	image.src = src;
	await image.decode();
	const scale = Math.min(1, 256 / Math.max(image.naturalWidth, image.naturalHeight)),
		canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
	canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
	canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
	return canvas.toDataURL("image/jpeg", 0.8);
}

function tomorrowAtTen() {
	const d = new Date();
	d.setDate(d.getDate() + 1);
	d.setHours(10, 0, 0, 0);
	return d.getTime();
}

export function ScheduleDialog({
	creation,
	initial,
	onSave,
	onDelete,
	onClose,
}: {
	creation?: Creation;
	initial?: SharePost;
	onSave: (post: SharePost) => Promise<void>;
	onDelete?: () => Promise<void>;
	onClose: () => void;
}) {
	const dialog = useRef<HTMLDialogElement>(null),
		[when, setWhen] = useState(() => toLocalInput(initial?.scheduledAt ?? tomorrowAtTen())),
		[platforms, setPlatforms] = useState<SharePlatform[]>(initial?.platforms ?? ["linkedin"]),
		[caption, setCaption] = useState(initial?.caption ?? ""),
		[reminders, setReminders] = useState<number[]>(initial?.reminders ?? DEFAULT_REMINDERS),
		[confirmDelete, setConfirmDelete] = useState(false),
		[busy, setBusy] = useState(false),
		[error, setError] = useState("");
	useEffect(() => {
		dialog.current?.showModal();
	}, []);
	const toggle = <T,>(list: T[], value: T) =>
		list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
	async function save() {
		const scheduledAt = fromLocalInput(when);
		if (!Number.isFinite(scheduledAt)) return setError("Geçerli bir tarih ve saat seç.");
		setBusy(true);
		setError("");
		try {
			const preview = creation
				? await thumbnail(creation.src).catch(() => initial?.thumbnail)
				: initial?.thumbnail;
			const now = Date.now();
			await onSave({
				id: initial?.id ?? crypto.randomUUID(),
				creationId: initial?.creationId ?? creation?.id ?? "",
				title: (creation?.prompt || creation?.name || initial?.title || "Görsel").slice(0, 80),
				...(preview ? { thumbnail: preview } : {}),
				scheduledAt,
				platforms,
				caption,
				reminders,
				sentReminders: [],
				status: initial?.status ?? "planned",
				...(initial?.sharedAt ? { sharedAt: initial.sharedAt } : {}),
				createdAt: initial?.createdAt ?? now,
				updatedAt: now,
			});
		} catch (e) {
			setError(e instanceof Error ? e.message : String(e));
			setBusy(false);
		}
	}
	const image = creation?.src ?? initial?.thumbnail;
	return (
		<dialog
			ref={dialog}
			className="creative-brand-dialog share-schedule-dialog"
			aria-label={initial ? "Paylaşımı düzenle" : "Takvime ekle"}
			onCancel={(e) => {
				e.preventDefault();
				if (!busy) onClose();
			}}
		>
			<header>
				<div>
					<small>PAYLAŞIM TAKVİMİ</small>
					<h2>{initial ? "Paylaşımı düzenle" : "Takvime ekle"}</h2>
				</div>
				<button aria-label="Pencereyi kapat" disabled={busy} onClick={onClose}>
					×
				</button>
			</header>
			<div className="brand-dialog-scroll share-schedule-body">
				{image ? (
					<img src={image} alt="" />
				) : (
					<div className="share-missing">Görsel bulunamadı</div>
				)}
				<div className="brand-fields share-schedule-fields">
					<label>
						Paylaşım zamanı
						<input
							type="datetime-local"
							aria-label="Paylaşım zamanı"
							value={when}
							onChange={(e) => setWhen(e.target.value)}
						/>
					</label>
					<fieldset>
						<legend>Platformlar</legend>
						{SHARE_PLATFORMS.map((p) => (
							<label key={p.id} className="share-chip">
								<input
									type="checkbox"
									checked={platforms.includes(p.id)}
									onChange={() => setPlatforms((old) => toggle(old, p.id))}
								/>
								{p.label}
							</label>
						))}
					</fieldset>
					<label className="share-wide">
						Paylaşım metni
						<textarea
							aria-label="Paylaşım metni"
							rows={5}
							maxLength={5000}
							placeholder="Gönderide kullanacağın metin, etiketler, bağlantı…"
							value={caption}
							onChange={(e) => setCaption(e.target.value)}
						/>
					</label>
					<fieldset className="share-wide">
						<legend>Hatırlatmalar</legend>
						{REMINDER_OPTIONS.map((r) => (
							<label key={r.minutes} className="share-chip">
								<input
									type="checkbox"
									checked={reminders.includes(r.minutes)}
									onChange={() => setReminders((old) => toggle(old, r.minutes))}
								/>
								{r.label}
							</label>
						))}
						<small>
							Uygulama tepsideyken masaüstü bildirimi gelir. Tamamen kapalıysa kaçırılanlar sonraki
							açılışta gösterilir.
						</small>
					</fieldset>
				</div>
				{error && (
					<p role="alert" className="creative-warning">
						{error}
					</p>
				)}
			</div>
			<footer>
				{onDelete &&
					(confirmDelete ? (
						<div className="creative-delete-confirm">
							<p>Bu paylaşım takvimden silinsin mi? Görsel galeride kalır.</p>
							<button
								className="creative-danger"
								disabled={busy}
								onClick={async () => {
									setBusy(true);
									try {
										await onDelete();
									} catch (e) {
										setError(String(e));
										setBusy(false);
									}
								}}
							>
								Takvimden sil
							</button>
							<button disabled={busy} onClick={() => setConfirmDelete(false)}>
								Vazgeç
							</button>
						</div>
					) : (
						<button
							className="creative-danger"
							disabled={busy}
							onClick={() => setConfirmDelete(true)}
						>
							Sil
						</button>
					))}
				<button disabled={busy} onClick={onClose}>
					Vazgeç
				</button>
				<button className="creative-primary" disabled={busy} onClick={() => void save()}>
					{initial ? "Değişiklikleri kaydet" : "Takvime ekle"}
				</button>
			</footer>
		</dialog>
	);
}
