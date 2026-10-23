import { Columns3, Focus, Grid2X2, MonitorPlay, RectangleHorizontal } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
import { ASPECT_RATIOS, VIDEO_FORMAT_PRESETS, type AspectRatio } from "@/utils/aspectRatioUtils";

export function PreviewWorkspaceBar({
	ratio,
	onRatioChange,
	guides,
	onGuidesChange,
	focus,
	onFocusChange,
	inspector,
	onInspectorChange,
}: {
	ratio: AspectRatio;
	onRatioChange: (r: AspectRatio) => void;
	guides: boolean;
	onGuidesChange: () => void;
	focus: boolean;
	onFocusChange: () => void;
	inspector: boolean;
	onInspectorChange: () => void;
}) {
	const { locale } = useI18n();
	const tr = locale === "tr";
	return (
		<div className="workspace-scene-bar">
			<div className="workspace-scene-title">
				<MonitorPlay size={15} />
				<span>{tr ? "Sahne" : "Canvas"}</span>
				<i />
				<small>{tr ? "ÖNİZLEME" : "PREVIEW"}</small>
			</div>
			<div className="workspace-scene-actions">
				<label className="workspace-ratio">
					<RectangleHorizontal size={14} />
					<select
						aria-label={tr ? "Sahne boyutu" : "Canvas aspect ratio"}
						value={ratio}
						onChange={(e) => onRatioChange(e.target.value as AspectRatio)}
					>
						<optgroup label={tr ? "En-boy oranı" : "Aspect ratio"}>
							{ASPECT_RATIOS.map((r) => (
								<option key={r} value={r}>
									{r === "native" ? (tr ? "Kaynak boyutu" : "Source") : r}
								</option>
							))}
							{!(ASPECT_RATIOS as readonly string[]).includes(ratio) && (
								<option value={ratio}>{ratio}</option>
							)}
						</optgroup>
						<optgroup label={tr ? "Sosyal medya" : "Social media"}>
							{VIDEO_FORMAT_PRESETS.map((p) => (
								<option key={p.label} value={p.ratio}>
									{p.label} · {p.ratio}
								</option>
							))}
						</optgroup>
					</select>
				</label>
				<button
					type="button"
					aria-label={tr ? "Hizalama kılavuzları" : "Composition guides"}
					aria-pressed={guides}
					title={
						tr ? "Hizalama kılavuzları · videoya eklenmez" : "Composition guides · preview only"
					}
					onClick={onGuidesChange}
				>
					<Grid2X2 size={15} />
				</button>
				<button
					type="button"
					aria-label={tr ? "Ayar panelini göster/gizle" : "Toggle inspector"}
					aria-pressed={inspector && !focus}
					title={tr ? "Ayar panelini göster/gizle" : "Toggle inspector"}
					onClick={onInspectorChange}
					disabled={focus}
				>
					<Columns3 size={15} />
				</button>
				<button
					type="button"
					className="workspace-focus-button"
					aria-label={tr ? "Odak modu" : "Focus mode"}
					aria-pressed={focus}
					title={tr ? "Sadece videoya odaklan" : "Focus on the preview"}
					onClick={onFocusChange}
				>
					<Focus size={15} />
					<span>{focus ? (tr ? "Kurguya dön" : "Back to edit") : tr ? "Odak" : "Focus"}</span>
				</button>
			</div>
		</div>
	);
}
