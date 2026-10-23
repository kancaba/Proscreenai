import type { DraftState } from '@/hooks/useProjectDraft';
import {
	ArrowUpRight,
	Check,
	Circle,
	Clapperboard,
	Keyboard,
	Mic,
	Gauge,
	Redo2,
	Save,
	Scissors,
	Sparkles,
	Type,
	Undo2,
	ZoomIn,
} from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";
export type EditorTool = "zoom" | "trim" | "speed" | "text";
export function EditorToolbar({
	onAdd,
	onVoiceover,
	onShortcuts,
	onAiCaptions,
	onUndo,
	onRedo,
	canUndo,
	canRedo,
	onSave,
	onExport,
	disabled,
	name,
	dirty,
	draftState,
	onRetryDraft,
}: {
	onAdd: (tool: EditorTool) => void;
	onVoiceover: () => void;
	onShortcuts: () => void;
	onAiCaptions: () => void;
	onUndo: () => void;
	onRedo: () => void;
	canUndo: boolean;
	canRedo: boolean;
	onSave: () => void;
	onExport: () => void;
	disabled: boolean;
	name: string;
	dirty: boolean;
	draftState?: DraftState;
	onRetryDraft?: () => void;
}) {
	const { locale } = useI18n();
	const tr = locale === "tr";
	const tools = [
		{ id: "zoom", icon: ZoomIn, label: "Zoom", key: "Z" },
		{ id: "trim", icon: Scissors, label: tr ? "Kes" : "Trim", key: "C" },
		{ id: "speed", icon: Gauge, label: tr ? "Hız" : "Speed", key: "S" },
		{ id: "text", icon: Type, label: tr ? "Metin" : "Text", key: "A" },
	] as const;
	return (
		<div
			className="workspace-toolbar"
			role="toolbar"
			aria-label={tr ? "Düzenleme araçları" : "Editing tools"}
		>
			<div className="workspace-project">
				<span className="workspace-project-icon">
					<Clapperboard size={18} />
				</span>
				<div>
					<strong title={name}>{name.replace(/\.screenmovie$/, "")}</strong>
					<small
						title={
							tr
								? "Dosya durumunu kontrol etmek için Kaydet’i kullanın"
								: "Use Save to persist your edits"
						}
					>
						{dirty ? (
							<>
								<Circle size={6} fill="currentColor" />
								{tr ? "Kaydedilmemiş değişiklik" : "Unsaved changes"}
							</>
						) : (
							<>
								<Check size={10} />
								{tr ? "Değişiklik yok" : "No pending changes"}
							</>
						)}
					</small>
					{draftState && draftState !== 'idle' && <span role="status" data-testid="draft-status" className={`workspace-draft-status ${draftState === 'error' ? 'workspace-draft-error' : ''}`}>{draftState === 'saved' ? (tr ? 'Taslak korumaya alındı' : 'Draft protected') : draftState === 'error' ? <button type="button" onClick={onRetryDraft}>{tr ? 'Taslak kaydedilemedi · Yeniden dene' : 'Draft failed · Retry'}</button> : (tr ? 'Taslak kaydediliyor…' : 'Saving draft…')}</span>}
				</div>
			</div>
			<div className="workspace-tool-groups">
				<div className="workspace-tool-group workspace-history">
					<button
						type="button"
						onClick={onUndo}
						disabled={!canUndo || disabled}
						aria-label={tr ? "Geri al" : "Undo"}
						title="⌘Z"
					>
						<Undo2 size={16} />
					</button>
					<button
						type="button"
						onClick={onRedo}
						disabled={!canRedo || disabled}
						aria-label={tr ? "İleri al" : "Redo"}
						title="⇧⌘Z"
					>
						<Redo2 size={16} />
					</button>
				</div>
				<div className="workspace-tool-group">
					{tools.map(({ id, icon: Icon, label, key }) => (
						<button
							type="button"
							key={id}
							data-testid={`tool-${id}`}
							disabled={disabled}
							onClick={() => onAdd(id)}
							title={`${label} (${key})`}
						>
							<Icon size={16} />
							<span>{label}</span>
							<kbd>{key}</kbd>
						</button>
					))}
				</div>
				<div className="workspace-tool-group workspace-ai-tools">
					<button
						type="button"
						disabled={disabled}
						onClick={onAiCaptions}
						title={tr ? "AI video yazıları" : "AI captions"}
					>
						<Sparkles size={15} />
						<span>{tr ? "AI yazıları" : "AI captions"}</span>
					</button>
					<button
						type="button"
						disabled={disabled}
						onClick={onVoiceover}
						title={tr ? "AI seslendirme" : "AI voiceover"}
						aria-label={tr ? "Seslendir" : "Voiceover"}
					>
						<Mic size={15} />
					</button>
				</div>
			</div>
			<div className="workspace-file-actions">
				<button
					type="button"
					className="workspace-shortcuts"
					onClick={onShortcuts}
					aria-label={tr ? "Klavye kısayolları" : "Keyboard shortcuts"}
					title="? · Kısayollar"
				>
					<Keyboard size={16} />
				</button>
				<button
					type="button"
					onClick={onSave}
					disabled={disabled}
					aria-label={tr ? "Kaydet" : "Save"}
					title={tr ? "Projeyi kaydet" : "Save project"}
				>
					<Save size={16} />
				</button>
				<button type="button" className="workspace-export" onClick={onExport} disabled={disabled}>
					{tr ? "Dışa aktar" : "Export"}
					<ArrowUpRight size={16} />
				</button>
			</div>
		</div>
	);
}
