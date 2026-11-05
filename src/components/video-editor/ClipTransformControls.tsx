import { DEFAULT_TRANSFORM, type ClipTransform } from "@/lib/sequence";

export function ClipTransformControls({
	value = DEFAULT_TRANSFORM,
	onChange,
	tr,
}: {
	value?: ClipTransform;
	onChange: (next: ClipTransform) => void;
	tr: boolean;
}) {
	const fields = [
		["scale", tr ? "Boyut" : "Size", 10, 200],
		["x", "X", 0, 100],
		["y", "Y", 0, 100],
		["opacity", tr ? "Opaklık" : "Opacity", 0, 100],
	] as const;
	return (
		<details className="seq-transform">
			<summary>{tr ? "Yerleşim" : "Transform"}</summary>
			<div>
				{fields.map(([field, label, min, max]) => (
					<label key={field}>
						{label} (%)
						<input
							type="number"
							key={value[field]}
							min={min}
							max={max}
							step={1}
							defaultValue={Math.round(value[field] * 100)}
							onKeyDown={(e) => {
								if (e.key === "Enter") e.currentTarget.blur();
							}}
							onBlur={(e) => {
								const n = e.currentTarget.valueAsNumber;
								if (Number.isFinite(n) && n >= min && n <= max && n !== value[field] * 100)
									onChange({ ...value, [field]: n / 100 });
							}}
						/>
					</label>
				))}
				<button onClick={() => onChange({ ...value, turns: (value.turns + 1) % 4 })}>
					{tr ? "90° döndür" : "Rotate 90°"}
				</button>
				<button aria-pressed={value.flip} onClick={() => onChange({ ...value, flip: !value.flip })}>
					{tr ? "Aynala" : "Mirror"}
				</button>
				<button onClick={() => onChange({ ...value, scale: 0.32, x: 0.8, y: 0.8 })}>
					{tr ? "Köşeye yerleştir" : "Picture in picture"}
				</button>
				<button onClick={() => onChange(DEFAULT_TRANSFORM)}>{tr ? "Sıfırla" : "Reset"}</button>
			</div>
		</details>
	);
}
