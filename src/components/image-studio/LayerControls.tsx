import type { Layer, ImageDocument } from "./document";
export function LayerControls({
	layer: l,
	doc,
	patch,
}: {
	layer: Layer;
	doc: ImageDocument;
	patch: (p: Partial<Layer>) => void;
}) {
	return (
		<details className="image-advanced">
			<summary>Gelişmiş düzenleme</summary>
			<fieldset disabled={l.locked}>
				<legend>Stil ve yerleşim</legend>
				<label className="image-checkbox">
					<input
						type="checkbox"
						checked={!!l.aspectLock}
						onChange={(e) => patch({ aspectLock: e.target.checked })}
					/>
					Oranı koru
				</label>
				<div className="image-pair">
					<button onClick={() => patch({ flipX: !l.flipX })}>Yatay çevir</button>
					<button onClick={() => patch({ flipY: !l.flipY })}>Dikey çevir</button>
				</div>
				<label>
					Tuvale hizala
					<select
						defaultValue=""
						onChange={(e) => {
							const v = e.target.value;
							patch(
								v === "left"
									? { x: 0 }
									: v === "center"
										? { x: (doc.width - l.width) / 2 }
										: v === "right"
											? { x: doc.width - l.width }
											: v === "top"
												? { y: 0 }
												: v === "middle"
													? { y: (doc.height - l.height) / 2 }
													: { y: doc.height - l.height },
							);
							e.target.value = "";
						}}
					>
						<option value="" disabled>
							Hizalama seç…
						</option>
						<option value="left">Sol</option>
						<option value="center">Yatay merkez</option>
						<option value="right">Sağ</option>
						<option value="top">Üst</option>
						<option value="middle">Dikey merkez</option>
						<option value="bottom">Alt</option>
					</select>
				</label>
				<label className="image-checkbox">
					<input
						type="checkbox"
						checked={!!l.shadow}
						onChange={(e) => patch({ shadow: e.target.checked })}
					/>
					Gölge
				</label>
				{l.kind === "text" && (
					<>
						<div className="image-pair">
							<button aria-pressed={!!l.bold} onClick={() => patch({ bold: !l.bold })}>
								<b>Kalın</b>
							</button>
							<button aria-pressed={!!l.italic} onClick={() => patch({ italic: !l.italic })}>
								<i>İtalik</i>
							</button>
							<button
								aria-pressed={!!l.underline}
								onClick={() => patch({ underline: !l.underline })}
							>
								<u>Altı çizili</u>
							</button>
						</div>
						<label>
							Metin hizası
							<select
								value={l.align ?? "left"}
								onChange={(e) => patch({ align: e.target.value as Layer["align"] })}
							>
								<option value="left">Sol</option>
								<option value="center">Orta</option>
								<option value="right">Sağ</option>
							</select>
						</label>
						<label>
							Satır aralığı
							<input
								type="number"
								min=".7"
								max="4"
								step=".1"
								value={l.lineHeight ?? 1.25}
								onChange={(e) =>
									patch({ lineHeight: Math.max(0.7, Math.min(4, +e.target.value || 1.25)) })
								}
							/>
						</label>
						<label>
							Harf aralığı
							<input
								type="number"
								min="-10"
								max="100"
								value={l.letterSpacing ?? 0}
								onChange={(e) =>
									patch({ letterSpacing: Math.max(-10, Math.min(100, +e.target.value || 0)) })
								}
							/>
						</label>
					</>
				)}
				{l.kind !== "image" && (
					<>
						<label>
							Kontur kalınlığı
							<input
								type="number"
								min="0"
								max="100"
								value={l.strokeWidth ?? 0}
								onChange={(e) =>
									patch({ strokeWidth: Math.max(0, Math.min(100, +e.target.value || 0)) })
								}
							/>
						</label>
						<label>
							Kontur rengi
							<input
								type="color"
								value={l.strokeColor ?? "#ffffff"}
								onChange={(e) => patch({ strokeColor: e.target.value })}
							/>
						</label>
					</>
				)}
				{l.kind === "rect" && (
					<label>
						Köşe yuvarlama
						<input
							type="number"
							value={l.cornerRadius ?? 0}
							min="0"
							max="1000"
							onChange={(e) =>
								patch({ cornerRadius: Math.max(0, Math.min(1000, +e.target.value || 0)) })
							}
						/>
					</label>
				)}
				{l.kind === "image" && (
					<>
						<label>
							Görsel rolü
							<select
								value={l.imageRole ?? "overlay"}
								onChange={(e) => patch({ imageRole: e.target.value as Layer["imageRole"] })}
							>
								<option value="artwork">Ana görsel</option>
								<option value="overlay">Logo / üst katman</option>
							</select>
						</label>
						<label>
							Maske
							<select
								value={l.mask ?? "rect"}
								onChange={(e) => patch({ mask: e.target.value as Layer["mask"] })}
							>
								<option value="rect">Dikdörtgen</option>
								<option value="ellipse">Yuvarlak</option>
							</select>
						</label>
						<p className="image-hint">Kaynak kırpma yüzdesi. Orijinal görsel korunur.</p>
						{(["x", "y", "width", "height"] as const).map((k) => (
							<label key={k}>
								Kırpma {k}
								<input
									type="number"
									min={k === "width" || k === "height" ? 1 : 0}
									max="100"
									value={(l.crop?.[k] ?? (k === "width" || k === "height" ? 1000 : 0)) / 10}
									onChange={(e) => {
										const crop = { x: 0, y: 0, width: 1000, height: 1000, ...l.crop },
											value = Math.max(
												k === "width" || k === "height" ? 10 : 0,
												Math.min(1000, (+e.target.value || 0) * 10),
											);
										crop[k] = value;
										crop.x = Math.min(crop.x, 1000 - crop.width);
										crop.y = Math.min(crop.y, 1000 - crop.height);
										patch({ crop });
									}}
								/>
							</label>
						))}
						<button onClick={() => patch({ crop: undefined })}>Kırpmayı sıfırla</button>
					</>
				)}
			</fieldset>
		</details>
	);
}
