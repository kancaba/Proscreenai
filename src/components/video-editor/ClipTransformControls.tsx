import { useScopedT } from "@/contexts/I18nContext";
import { DEFAULT_TRANSFORM, type ClipTransform } from "@/lib/sequence";

export function ClipTransformControls({
	value = DEFAULT_TRANSFORM,
	onChange,
}: {
	value?: ClipTransform;
	onChange: (next: ClipTransform) => void;
}) {
	const t = useScopedT("editor");
	const fields = [
		["scale", t("clipTransformControls.size", "Size"), 10, 200],
		["x", "X", 0, 100],
		["y", "Y", 0, 100],
		["opacity", t("clipTransformControls.opacity", "Opacity"), 0, 100],
	] as const;
	return (
		<details className="seq-transform">
			<summary>{t("clipTransformControls.transform", "Transform")}</summary>
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
					{t("clipTransformControls.rotate90", "Rotate 90°")}
				</button>
				<button aria-pressed={value.flip} onClick={() => onChange({ ...value, flip: !value.flip })}>
					{t("clipTransformControls.mirror", "Mirror")}
				</button>
				<button onClick={() => onChange({ ...value, scale: 0.32, x: 0.8, y: 0.8 })}>
					{t("clipTransformControls.pictureInPicture", "Picture in picture")}
				</button>
				<button onClick={() => onChange(DEFAULT_TRANSFORM)}>{t("clipTransformControls.reset", "Reset")}</button>
			</div>
		</details>
	);
}
