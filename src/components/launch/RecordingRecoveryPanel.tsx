import { useEffect, useState } from "react";
import { ArchiveRestore, RefreshCw, LoaderCircle } from "lucide-react";
import { useI18n, useScopedT } from "@/contexts/I18nContext";
type Entry = Awaited<ReturnType<Window["electronAPI"]["listRecordingRecovery"]>>[number];
export function RecordingRecoveryPanel({ onOpen }: { onOpen: () => Promise<void> }) {
	const { locale } = useI18n();
	const t = useScopedT("launch");
	const [entries, setEntries] = useState<Entry[]>([]);
	const [busy, setBusy] = useState<string | null>(null);
	const [error, setError] = useState("");
	const [refreshToken, setRefreshToken] = useState(0);
	const [expanded, setExpanded] = useState(true);
	useEffect(() => {
		let mounted = true;
		const refresh = () => {
			void window.electronAPI
				.listRecordingRecovery()
				.then((list) => {
					if (mounted) {
						setEntries(list);
						setError("");
					}
				})
				.catch(() => {
					if (mounted)
						setError(
							t("recordingRecoveryPanel.listError", "Could not read interrupted recordings."),
						);
				});
		};
		refresh();
		window.addEventListener("focus", refresh);
		return () => {
			mounted = false;
			window.removeEventListener("focus", refresh);
		};
	}, [t, refreshToken]);
	async function recover(entry: Entry) {
		if (busy) return;
		setBusy(entry.id);
		setError("");
		try {
			const result = await window.electronAPI.recoverRecording(entry.id);
			if (!result.success) throw Error(result.message);
			setEntries((items) => items.filter((item) => item.id !== entry.id));
			await onOpen();
		} catch (e) {
			setError(e instanceof Error ? e.message : t("recordingRecoveryPanel.recoverFailed", "Recovery failed"));
		} finally {
			setBusy(null);
		}
	}
	if (!entries.length && !error) return null;
	return (
		<section
			className="studio-recovery"
			aria-label={t("recordingRecoveryPanel.ariaLabel", "Recording recovery")}
			data-testid="recording-recovery"
		>
			<details open={expanded} onToggle={(event) => setExpanded(event.currentTarget.open)}>
				<summary>
					<ArchiveRestore size={17} />
					<strong>{t("recordingRecoveryPanel.title", "Interrupted recordings")}</strong>
					<span>{entries.length}</span>
				</summary>
				<p>
					{t(
						"recordingRecoveryPanel.hint",
						"Recover saved video and audio into a new file. The unfinished tail may be missing; raw files are preserved.",
					)}
				</p>
				{error && (
					<p role="alert" className="studio-error">
						{error}
						<button
							disabled={!!busy}
							onClick={() => setRefreshToken((value) => value + 1)}
							aria-label={t("recordingRecoveryPanel.refresh", "Refresh list")}
						>
							<RefreshCw size={14} />
						</button>
					</p>
				)}
				<div className="studio-recovery-list">
					{entries.map((entry) => (
						<div className="studio-recovery-entry" key={entry.id}>
							<ArchiveRestore size={17} />
							<div>
								<strong title={entry.name}>{entry.name}</strong>
								<small>
									{new Date(entry.startedAt).toLocaleString(locale)} ·{" "}
									{(entry.bytes / 1024 / 1024).toFixed(1)} MB
								</small>
							</div>
							<button
								disabled={!!busy}
								aria-busy={busy === entry.id}
								onClick={() => void recover(entry)}
							>
								{busy === entry.id && (
									<LoaderCircle size={14} className="studio-recovery-spinner" />
								)}
								{busy === entry.id
									? t("recordingRecoveryPanel.recovering", "Processing…")
									: t("recordingRecoveryPanel.recover", "Recover recording")}
							</button>
						</div>
					))}
				</div>
			</details>
		</section>
	);
}
