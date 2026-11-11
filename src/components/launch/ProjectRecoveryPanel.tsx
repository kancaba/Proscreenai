import { useEffect, useState } from "react";
import { ArchiveRestore, FileClock, RefreshCw } from "lucide-react";
import { useI18n, useScopedT } from "@/contexts/I18nContext";
type Entry = Awaited<ReturnType<Window["electronAPI"]["listProjectRecovery"]>>[number];
export function ProjectRecoveryPanel({ onOpen, initiallyExpanded = true }: { onOpen: () => Promise<void>; initiallyExpanded?: boolean }) {
	const { locale } = useI18n();
	const t = useScopedT("launch");
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
					setError(t("projectRecoveryPanel.listError", "Could not read recovery entries."));
			});
		const focus = () => setRefresh((n) => n + 1);
		window.addEventListener("focus", focus);
		return () => {
			active = false;
			window.removeEventListener("focus", focus);
		};
	}, [refresh, t]);
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
				e instanceof Error
					? e.message
					: t("projectRecoveryPanel.openError", "Could not open recovery."),
			);
		} finally {
			setBusy(null);
		}
	}
	if (!entries.length && !error) return null;
	const drafts = entries.filter((e) => e.kind === "draft").length;
	return (
		<section className="studio-recovery" aria-label={t("projectRecoveryPanel.ariaLabel", "Project recovery")}>
			<details open={(initiallyExpanded && drafts > 0) || !!error}>
				<summary>
					<ArchiveRestore size={17} />
					<strong>{t("projectRecoveryPanel.title", "Drafts and backups")}</strong>
					<span>
						{drafts
							? t("projectRecoveryPanel.draftCount", "{{count}} drafts", { count: drafts })
							: t("projectRecoveryPanel.backupCount", "{{count}} backups", { count: entries.length })}
					</span>
				</summary>
				<p>
					{t(
						"projectRecoveryPanel.hint",
						"Recovery opens a copy and preserves the original project.",
					)}
				</p>
				{error && (
					<p role="alert" className="studio-error">
						{error}
						<button
							aria-label={t("projectRecoveryPanel.refresh", "Refresh recovery list")}
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
										? t("projectRecoveryPanel.automaticDraft", "Automatic draft")
										: t("projectRecoveryPanel.previousSave", "Previous save")}{" "}
									· {new Date(entry.updatedAt).toLocaleString(locale)}
								</small>
							</div>
							<button disabled={!!busy} onClick={() => void open(entry)}>
								{busy === entry.id
									? t("projectRecoveryPanel.opening", "Opening…")
									: t("projectRecoveryPanel.recoverCopy", "Recover copy")}
							</button>
						</div>
					))}
				</div>
			</details>
		</section>
	);
}
