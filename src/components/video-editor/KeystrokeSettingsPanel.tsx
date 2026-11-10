import { Switch } from "@/components/ui/switch";
import {
	KEYSTROKE_POSITIONS,
	KEYSTROKE_SIZES,
	type KeystrokePosition,
	type KeystrokeSettings,
	type KeystrokeSize,
} from "@/lib/keystrokes";

const POSITION_LABELS: Record<KeystrokePosition, [string, string]> = {
	"top-left": ["Sol üst", "Top left"],
	"top-center": ["Üst orta", "Top centre"],
	"top-right": ["Sağ üst", "Top right"],
	"bottom-left": ["Sol alt", "Bottom left"],
	"bottom-center": ["Alt orta", "Bottom centre"],
	"bottom-right": ["Sağ alt", "Bottom right"],
};
const SIZE_LABELS: Record<KeystrokeSize, [string, string]> = {
	small: ["Küçük", "Small"],
	medium: ["Orta", "Medium"],
	large: ["Büyük", "Large"],
};

/** Shows the shortcuts pressed while recording (⌘K, Ctrl+S) in a corner of the video. */
export function KeystrokeSettingsPanel({
	settings,
	onChange,
	shortcutCount,
	tr,
}: {
	settings: KeystrokeSettings;
	onChange: (settings: KeystrokeSettings) => void;
	/** Shortcuts recorded for this video. */
	shortcutCount: number;
	tr: boolean;
}) {
	const label = (pair: [string, string]) => (tr ? pair[0] : pair[1]);
	const choice = (active: boolean) =>
		active
			? "rounded bg-violet-300/25 px-2 py-1 text-[10px] text-violet-100"
			: "rounded px-2 py-1 text-[10px] text-slate-400 hover:bg-white/10";
	return (
		<div
			className="mb-4 rounded-lg border border-white/5 bg-white/5 p-2.5"
			data-testid="keystroke-settings"
		>
			<div className="flex items-center justify-between gap-2">
				<span className="text-[11px] font-medium text-slate-200">
					{tr ? "Kısayol göstergesi" : "Shortcut badge"}
				</span>
				<Switch
					aria-label={tr ? "Kısayolları videoda göster" : "Show shortcuts in the video"}
					data-testid="keystroke-toggle"
					checked={settings.enabled}
					onCheckedChange={(enabled) => onChange({ ...settings, enabled })}
					className="data-[state=checked]:bg-[#2563EB] scale-90"
				/>
			</div>
			<p className="mt-1.5 text-[9px] leading-snug text-slate-500">
				{shortcutCount > 0
					? tr
						? `Bu kayıtta ${shortcutCount} kısayol var. Yalnızca ⌘ veya Ctrl ile basılanlar gösterilir; yazdığın metin kaydedilmez.`
						: `${shortcutCount} shortcuts in this recording. Only presses with ⌘ or Ctrl are shown; typed text is never recorded.`
					: tr
						? "Bu kayıtta kısayol yok. Yeni kayıtlarda ⌘ veya Ctrl ile basılan kısayollar kaydedilir; yazdığın metin kaydedilmez."
						: "No shortcuts in this recording. New recordings keep shortcuts pressed with ⌘ or Ctrl; typed text is never recorded."}
			</p>
			{settings.enabled && (
				<>
					<div className="mt-2.5 flex items-start justify-between gap-2">
						<span className="pt-1 text-[10px] text-slate-400">{tr ? "Konum" : "Position"}</span>
						<div
							role="radiogroup"
							aria-label={tr ? "Kısayol göstergesi konumu" : "Shortcut badge position"}
							className="grid grid-cols-3 gap-1"
						>
							{KEYSTROKE_POSITIONS.map((position) => (
								<button
									key={position}
									type="button"
									role="radio"
									aria-checked={settings.position === position}
									aria-label={label(POSITION_LABELS[position])}
									title={label(POSITION_LABELS[position])}
									data-testid={`keystroke-position-${position}`}
									onClick={() => onChange({ ...settings, position })}
									className={`relative h-7 w-10 rounded border ${settings.position === position ? "border-violet-300/70 bg-violet-300/20" : "border-white/10 bg-black/20 hover:bg-white/10"}`}
								>
									<span
										className={`absolute h-1.5 w-3 rounded-sm ${settings.position === position ? "bg-violet-100" : "bg-slate-500"} ${position.startsWith("top") ? "top-1" : "bottom-1"} ${position.endsWith("left") ? "left-1" : position.endsWith("right") ? "right-1" : "left-1/2 -translate-x-1/2"}`}
									/>
								</button>
							))}
						</div>
					</div>
					<div className="mt-2 flex items-center justify-between gap-2">
						<span className="text-[10px] text-slate-400">{tr ? "Boyut" : "Size"}</span>
						<div
							role="radiogroup"
							aria-label={tr ? "Kısayol göstergesi boyutu" : "Shortcut badge size"}
							className="flex gap-1"
						>
							{KEYSTROKE_SIZES.map((size) => (
								<button
									key={size}
									type="button"
									role="radio"
									aria-checked={settings.size === size}
									data-testid={`keystroke-size-${size}`}
									onClick={() => onChange({ ...settings, size })}
									className={choice(settings.size === size)}
								>
									{label(SIZE_LABELS[size])}
								</button>
							))}
						</div>
					</div>
				</>
			)}
		</div>
	);
}
