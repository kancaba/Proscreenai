import { LoaderCircle, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { maskSensitive, type SensitiveKind, type SensitiveSuggestion } from "@/lib/sensitiveText";
import type { BlurRegion } from "./blurRegions";

const KIND_LABELS: Record<SensitiveKind, [string, string]> = {
	email: ["E-posta", "E-mail"],
	phone: ["Telefon", "Phone"],
	tckn: ["TC kimlik no", "ID number"],
	vkn: ["Vergi no", "Tax number"],
	iban: ["IBAN", "IBAN"],
	card: ["Kart numarası", "Card number"],
	secret: ["Anahtar / token", "Key / token"],
};

const seconds = (ms: number) =>
	`${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

/** Whether an existing blur already hides this suggestion. */
function alreadyBlurred(suggestion: SensitiveSuggestion, blurs: BlurRegion[]) {
	return blurs.some((blur) => {
		if (blur.startMs > suggestion.startMs || blur.endMs < suggestion.endMs) return false;
		const a = blur.rect;
		const b = suggestion.rect;
		return (
			a.x <= b.x + 0.005 &&
			a.y <= b.y + 0.005 &&
			a.x + a.width >= b.x + b.width - 0.005 &&
			a.y + a.height >= b.y + b.height - 0.005
		);
	});
}

type Scan =
	| { status: "scanning"; fraction: number }
	| { status: "done"; suggestions: SensitiveSuggestion[]; frames: number }
	| { status: "error"; message: string };

/**
 * Reads the text on the recording's frames on this Mac, lists the private details it finds and
 * turns the chosen ones into blur areas.
 */
export function SensitiveScanDialog({
	open,
	onOpenChange,
	videoPath,
	durationMs,
	blurs,
	onApply,
	onSeek,
	tr,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	videoPath: string;
	durationMs: number;
	blurs: BlurRegion[];
	onApply: (suggestions: SensitiveSuggestion[]) => void;
	onSeek: (ms: number) => void;
	tr: boolean;
}) {
	const [scan, setScan] = useState<Scan>({ status: "scanning", fraction: 0 });
	const [chosen, setChosen] = useState<Set<string>>(new Set());
	const requestRef = useRef<string | null>(null);
	const blursRef = useRef(blurs);
	blursRef.current = blurs;

	useEffect(() => {
		if (!open || !videoPath || durationMs <= 0) return;
		const requestId = `scan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		requestRef.current = requestId;
		setScan({ status: "scanning", fraction: 0 });
		const stopProgress = window.electronAPI.onSensitiveScanProgress((progress) => {
			if (progress.requestId === requestId)
				setScan({ status: "scanning", fraction: progress.fraction });
		});
		void window.electronAPI
			.scanSensitiveText({ videoPath, durationMs, requestId })
			.then((result) => {
				if (requestRef.current !== requestId) return;
				requestRef.current = null;
				if (result.success) {
					const fresh = result.suggestions.filter(
						(item) => !alreadyBlurred(item, blursRef.current),
					);
					setScan({ status: "done", suggestions: fresh, frames: result.frames });
					setChosen(new Set(fresh.map((item) => item.id)));
				} else if (!result.cancelled) {
					setScan({ status: "error", message: result.message ?? "" });
				}
			});
		return () => {
			stopProgress();
			if (requestRef.current === requestId) {
				requestRef.current = null;
				void window.electronAPI.cancelSensitiveScan(requestId);
			}
		};
	}, [open, videoPath, durationMs]);

	const label = (pair: [string, string]) => (tr ? pair[0] : pair[1]);
	const toggle = (id: string) =>
		setChosen((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				data-testid="sensitive-scan"
				className="max-h-[85vh] max-w-lg overflow-y-auto border-white/10 bg-[#141419] text-slate-200"
			>
				<DialogTitle className="flex items-center gap-2 text-base">
					<ShieldCheck className="h-4 w-4 text-cyan-300" />
					{tr ? "Hassas bilgileri bul" : "Find private details"}
				</DialogTitle>
				<DialogDescription className="text-xs text-slate-400">
					{tr
						? "Videodaki yazılar bu Mac'te okunur; hiçbir şey gönderilmez. E-posta, telefon, TC kimlik ve vergi numarası, IBAN, kart numarası ve anahtarlar aranır."
						: "The text in the video is read on this Mac; nothing is sent anywhere. Looks for e-mails, phone, ID and tax numbers, IBANs, card numbers and keys."}
				</DialogDescription>

				{scan.status === "scanning" && (
					<div className="space-y-2 py-2" role="status">
						<div className="flex items-center gap-2 text-xs text-slate-300">
							<LoaderCircle className="h-3.5 w-3.5 animate-spin" />
							{scan.fraction < 0.1
								? tr
									? "Kareler hazırlanıyor…"
									: "Preparing frames…"
								: tr
									? "Yazılar okunuyor…"
									: "Reading the text…"}
							<span className="ml-auto tabular-nums">{Math.round(scan.fraction * 100)}%</span>
						</div>
						<div className="h-1.5 overflow-hidden rounded bg-white/10">
							<div
								className="h-full bg-cyan-300/80 transition-all"
								style={{ width: `${Math.round(scan.fraction * 100)}%` }}
							/>
						</div>
						<p className="text-[11px] text-slate-400">
							{tr
								? "İlk tarama, Mac'in metin tanıma modelini hazırlarken biraz uzun sürebilir."
								: "The first scan can take longer while the Mac prepares its text recognition."}
						</p>
					</div>
				)}

				{scan.status === "error" && (
					<p role="alert" className="rounded bg-red-500/10 p-2 text-xs text-red-200">
						{tr ? "Tarama yapılamadı." : "The scan failed."} {scan.message}
					</p>
				)}

				{scan.status === "done" && scan.suggestions.length === 0 && (
					<p data-testid="sensitive-none" className="rounded bg-white/5 p-3 text-xs text-slate-300">
						{tr
							? `${scan.frames} kare tarandı; bulanıklaştırılmamış hassas bilgi bulunamadı. İsimler gibi kalıbı olmayan bilgiler için AI sekmesindeki “Hassas bilgileri gizle” görevini kullanabilirsin.`
							: `${scan.frames} frames scanned; no private details left unblurred. For details without a pattern, such as names, use the “Hide private info” task in the AI tab.`}
					</p>
				)}

				{(scan.status === "error" || (scan.status === "done" && scan.suggestions.length === 0)) && (
					<div className="flex justify-end pt-1">
						<button
							type="button"
							onClick={() => onOpenChange(false)}
							className="rounded-md border border-white/10 px-3 py-1.5 text-xs hover:bg-white/10"
						>
							{tr ? "Kapat" : "Close"}
						</button>
					</div>
				)}

				{scan.status === "done" && scan.suggestions.length > 0 && (
					<>
						<div className="flex items-center justify-between text-[11px] text-slate-400">
							<span>
								{tr ? `${scan.suggestions.length} öneri` : `${scan.suggestions.length} suggestions`}
							</span>
							<span className="flex gap-1">
								<button
									type="button"
									onClick={() => setChosen(new Set(scan.suggestions.map((item) => item.id)))}
									className="rounded px-1.5 py-0.5 hover:bg-white/10 hover:text-slate-200"
								>
									{tr ? "Hepsi" : "All"}
								</button>
								<button
									type="button"
									onClick={() => setChosen(new Set())}
									className="rounded px-1.5 py-0.5 hover:bg-white/10 hover:text-slate-200"
								>
									{tr ? "Hiçbiri" : "None"}
								</button>
							</span>
						</div>
						<ul className="space-y-1" data-testid="sensitive-list">
							{scan.suggestions.map((item) => (
								<li
									key={item.id}
									className="flex items-center gap-2 rounded bg-white/5 px-2 py-1.5 text-xs"
								>
									<input
										type="checkbox"
										aria-label={`${label(KIND_LABELS[item.kind])} ${maskSensitive(item)}`}
										checked={chosen.has(item.id)}
										onChange={() => toggle(item.id)}
									/>
									<span className="w-24 shrink-0 text-[10px] text-cyan-200">
										{label(KIND_LABELS[item.kind])}
									</span>
									<span className="min-w-0 flex-1 truncate font-mono text-[11px]">
										{maskSensitive(item)}
									</span>
									<button
										type="button"
										onClick={() => onSeek(item.startMs)}
										title={tr ? "Bu ana git" : "Go to this moment"}
										className="shrink-0 tabular-nums text-[10px] text-slate-400 hover:text-white"
									>
										{seconds(item.startMs)}–{seconds(item.endMs)}
									</button>
								</li>
							))}
						</ul>
						<div className="flex gap-2 pt-1">
							<button
								type="button"
								data-testid="sensitive-apply"
								disabled={chosen.size === 0}
								onClick={() => {
									onApply(scan.suggestions.filter((item) => chosen.has(item.id)));
									onOpenChange(false);
								}}
								className="flex-1 rounded-md bg-cyan-500/80 px-3 py-1.5 text-xs font-medium text-white hover:bg-cyan-500 disabled:opacity-40"
							>
								{tr ? `Bulanıklaştır (${chosen.size})` : `Blur (${chosen.size})`}
							</button>
							<button
								type="button"
								onClick={() => onOpenChange(false)}
								className="rounded-md border border-white/10 px-3 py-1.5 text-xs hover:bg-white/10"
							>
								{tr ? "Kapat" : "Close"}
							</button>
						</div>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
