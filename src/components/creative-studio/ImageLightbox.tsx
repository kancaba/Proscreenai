import { useEffect, useRef, useState } from "react";
import type { Creation } from "./brand";
import { UsageDetails } from "./UsageDetails";
export function ImageLightbox({
	creation,
	onClose,
	onNavigate,
	onEdit,
	busy,
}: {
	creation: Creation;
	onClose: () => void;
	onNavigate: (direction: number) => void;
	onEdit: () => void;
	busy: boolean;
}) {
	const dialog = useRef<HTMLDialogElement>(null),
		[zoom, setZoom] = useState(0);
	useEffect(() => {
		dialog.current?.showModal();
	}, []);
	useEffect(() => setZoom(0), [creation.id]);
	return (
		<dialog
			className="creative-lightbox"
			ref={dialog}
			aria-label="Büyük görsel önizlemesi"
			onCancel={(e) => {
				e.preventDefault();
				onClose();
			}}
			onKeyDown={(e) => {
				// Keep native select navigation and scrolling independent of gallery navigation.
				if ((e.target as HTMLElement).closest("select, input, textarea, [contenteditable]")) return;
				if (e.key === "ArrowRight") {
					e.preventDefault();
					onNavigate(1);
				}
				if (e.key === "ArrowLeft") {
					e.preventDefault();
					onNavigate(-1);
				}
			}}
		>
			<header>
				<div>
					<strong>Görsel önizleme</strong>
					<small>
						{creation.width} × {creation.height}
					</small>
				</div>
				<div className="lightbox-tools">
					<button aria-label="Önceki görsel" onClick={() => onNavigate(-1)}>
						←
					</button>
					<button aria-label="Sonraki görsel" onClick={() => onNavigate(1)}>
						→
					</button>
					<select
						aria-label="Önizleme yakınlaştırma"
						value={zoom}
						onChange={(e) => setZoom(Number(e.target.value))}
					>
						<option value={0}>Ekrana sığdır</option>
						<option value={1}>%100</option>
						<option value={2}>%200</option>
					</select>
					<a href={creation.src} download={`screenmovie-${creation.id}.png`}>
						İndir ↓
					</a>
					<button disabled={busy} onClick={onEdit}>
						Düzenle ↗
					</button>
					<button autoFocus aria-label="Önizlemeyi kapat" onClick={onClose}>
						×
					</button>
				</div>
			</header>
			<div className={`lightbox-image ${zoom ? "actual-size" : ""}`}>
				<img
					src={creation.src}
					alt={creation.prompt || creation.name}
					style={
						zoom ? { width: creation.width * zoom, maxWidth: "none", maxHeight: "none" } : undefined
					}
				/>
			</div>
			<footer>
				<p>{creation.prompt || creation.name}</p>
				<UsageDetails usage={creation.usage} durationMs={creation.durationMs} />
			</footer>
		</dialog>
	);
}
