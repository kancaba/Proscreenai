import {
	CLICK_EFFECT_STYLES,
	CURSOR_STYLES,
	type ClickEffectStyle,
	type CursorEffects,
	type CursorStyle,
	EFFECT_COLORS,
} from "@/lib/cursorEffects";

const CLICK_LABELS: Record<ClickEffectStyle, [string, string]> = {
	off: ["Kapalı", "Off"],
	ripple: ["Dalga", "Ripple"],
	pulse: ["Nabız", "Pulse"],
	burst: ["Patlama", "Burst"],
	warp: ["Şok dalgası", "Warp"],
};
const CURSOR_LABELS: Record<CursorStyle, [string, string]> = {
	system: ["Sistem", "System"],
	halo: ["Hale", "Halo"],
	dot: ["Nokta", "Dot"],
	ring: ["Halka", "Ring"],
};

function Swatches({
	value,
	onChange,
	label,
	testId,
}: {
	value: string;
	onChange: (color: string) => void;
	label: string;
	testId: string;
}) {
	return (
		<div role="radiogroup" aria-label={label} className="flex items-center gap-1">
			{EFFECT_COLORS.map((color) => (
				<button
					key={color}
					type="button"
					role="radio"
					aria-checked={value === color}
					aria-label={color}
					data-testid={`${testId}-${color.slice(1)}`}
					onClick={() => onChange(color)}
					className={`h-4 w-4 rounded-full border ${value === color ? "border-white ring-2 ring-violet-300/60" : "border-white/20"}`}
					style={{ background: color }}
				/>
			))}
			<input
				type="color"
				aria-label={label}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				className="h-4 w-5 cursor-pointer rounded border-0 bg-transparent p-0"
			/>
		</div>
	);
}

/** Click effects (ripple, pulse, burst, warp) and cursor styles; each can be turned off. */
export function CursorEffectsPanel({
	effects,
	onChange,
	hasClicks,
	tr,
}: {
	effects: CursorEffects;
	onChange: (effects: CursorEffects) => void;
	/** Whether the recording has clicks to show effects on. */
	hasClicks: boolean;
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
			data-testid="cursor-effects"
		>
			<span className="text-[11px] font-medium text-slate-200">
				{tr ? "Tıklama efekti" : "Click effect"}
			</span>
			<div
				role="radiogroup"
				aria-label={tr ? "Tıklama efekti" : "Click effect"}
				className="mt-2 flex flex-wrap gap-1"
			>
				{CLICK_EFFECT_STYLES.map((style) => (
					<button
						key={style}
						type="button"
						role="radio"
						aria-checked={effects.click === style}
						data-testid={`click-effect-${style}`}
						onClick={() => onChange({ ...effects, click: style })}
						className={choice(effects.click === style)}
					>
						{label(CLICK_LABELS[style])}
					</button>
				))}
			</div>
			{effects.click !== "off" && (
				<>
					<div className="mt-2 flex items-center justify-between gap-2">
						<span className="text-[10px] text-slate-400">{tr ? "Renk" : "Colour"}</span>
						<Swatches
							value={effects.clickColor}
							onChange={(clickColor) => onChange({ ...effects, clickColor })}
							label={tr ? "Tıklama efekti rengi" : "Click effect colour"}
							testId="click-color"
						/>
					</div>
					<label className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-400">
						{tr ? "Boyut" : "Size"}
						<input
							type="range"
							min={0.5}
							max={2}
							step={0.1}
							value={effects.clickSize}
							aria-label={tr ? "Tıklama efekti boyutu" : "Click effect size"}
							onChange={(event) => onChange({ ...effects, clickSize: Number(event.target.value) })}
							className="w-28 accent-violet-300"
						/>
					</label>
				</>
			)}
			<span className="mt-3 block text-[11px] font-medium text-slate-200">
				{tr ? "İmleç stili" : "Cursor style"}
			</span>
			<div
				role="radiogroup"
				aria-label={tr ? "İmleç stili" : "Cursor style"}
				className="mt-2 flex flex-wrap gap-1"
			>
				{CURSOR_STYLES.map((style) => (
					<button
						key={style}
						type="button"
						role="radio"
						aria-checked={effects.cursor === style}
						data-testid={`cursor-style-${style}`}
						onClick={() => onChange({ ...effects, cursor: style })}
						className={choice(effects.cursor === style)}
					>
						{label(CURSOR_LABELS[style])}
					</button>
				))}
			</div>
			{effects.cursor !== "system" && (
				<div className="mt-2 flex items-center justify-between gap-2">
					<span className="text-[10px] text-slate-400">{tr ? "Renk" : "Colour"}</span>
					<Swatches
						value={effects.cursorColor}
						onChange={(cursorColor) => onChange({ ...effects, cursorColor })}
						label={tr ? "İmleç rengi" : "Cursor colour"}
						testId="cursor-color"
					/>
				</div>
			)}
			<p className="mt-2 text-[9px] leading-snug text-slate-500">
				{hasClicks
					? tr
						? "Efektler kayıttaki tıklamalarda görünür; önizleme ve dışa aktarım aynıdır. İmleç gizliyse görünmez."
						: "Effects play on the recorded clicks; the preview and the export match. Hidden when the cursor is hidden."
					: tr
						? "Bu kayıtta tıklama bilgisi yok; efektler tıklama izlenen kayıtlarda görünür."
						: "This recording has no click data; effects play on recordings with click tracking."}
			</p>
		</div>
	);
}
