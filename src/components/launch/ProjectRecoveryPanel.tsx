import { useEffect, useState } from "react";
import { ArchiveRestore, FileClock, RefreshCw } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
type Entry = Awaited<ReturnType<Window["electronAPI"]["listProjectRecovery"]>>[number];
export function ProjectRecoveryPanel({ onOpen, initiallyExpanded = true }: { onOpen: () => Promise<void>; initiallyExpanded?: boolean }) {
	const { locale } = useI18n();
	const tr = locale === "tr";
	const [entries, setEntries] = useState<Entry[]>([]);
	const [error, setError] = useState("");
	const [busy, setBusy] = useState<string | null>(null);
	const [refresh, setRefresh] = useState(0);
	useEffect(() => {
		let active = true;
		void window.electronAPI
			.listProjectRecovery()
			.then((list) => {
				if (active) {
					setEntries(list);
					setError("");
				}
			})
			.catch(() => {
				if (active)
					setError(tr ? "Kurtarma listesi okunamadı." : "Could not read recovery entries.");
			});
		const focus = () => setRefresh((n) => n + 1);
		window.addEventListener("focus", focus);
		return () => {
			active = false;
			window.removeEventListener("focus", focus);
		};
	}, [refresh, tr]);
	async function open(entry: Entry) {
		if (busy) return;
		setBusy(entry.id);
		setError("");
		try {
			const result = await window.electronAPI.openProjectRecovery(entry.id);
			if (!result.success) throw Error(result.message);
			await onOpen();
		} catch (e) {
			setError(
				e instanceof Error ? e.message : tr ? "Kurtarma açılamadı." : "Could not open recovery.",
			);
		} finally {
			setBusy(null);
		}
	}
	if (!entries.length && !error) return null;
	const drafts = entries.filter((e) => e.kind === "draft").length;
	return (
		<section className="studio-recovery" aria-label={tr ? "Proje kurtarma" : "Project recovery"}>
			<details open={(initiallyExpanded && drafts > 0) || !!error}>
				<summary>
					<ArchiveRestore size={17} />
					<strong>{tr ? "Taslaklar ve yedekler" : "Drafts and backups"}</strong>
					<span>
						{drafts
							? `${drafts} ${tr ? "otomatik taslak" : "drafts"}`
							: `${entries.length} ${tr ? "yedek" : "backups"}`}
					</span>
				</summary>
				<p>
					{tr
						? "Kurtarılan çalışma yeni bir kopya olarak açılır. Özgün projeniz değişmez."
						: "Recovery opens a copy and preserves the original project."}
				</p>
				{error && (
					<p role="alert" className="studio-error">
						{error}
						<button
							aria-label={tr ? "Kurtarma listesini yenile" : "Refresh recovery list"}
							onClick={() => setRefresh((n) => n + 1)}
						>
							<RefreshCw size={14} />
						</button>
					</p>
				)}
				<div className="studio-recovery-list">
					{entries.map((entry) => (
						<div key={entry.id} className="studio-recovery-entry">
							<FileClock size={17} />
							<div>
								<strong title={entry.projectPath || entry.name}>{entry.name}</strong>
								<small>
									{entry.kind === "draft"
										? tr
											? "Otomatik taslak"
											: "Automatic draft"
										: tr
											? "Önceki kayıt"
											: "Previous save"}{" "}
									· {new Date(entry.updatedAt).toLocaleString(locale)}
								</small>
							</div>
							<button disabled={!!busy} onClick={() => void open(entry)}>
								{busy === entry.id
									? tr
										? "Açılıyor…"
										: "Opening…"
									: tr
										? "Kopyayı kurtar"
										: "Recover copy"}
							</button>
						</div>
					))}
				</div>
			</details>
		</section>
	);
}
