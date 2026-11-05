import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AnnotationSettingsPanel } from "./AnnotationSettingsPanel";
import { renderAnnotations } from "@/lib/exporter/annotationRenderer";
import { DEFAULT_ANNOTATION_STYLE, DEFAULT_FIGURE_DATA, type AnnotationRegion } from "./types";
import { getAnnotationText, getAnnotationImage } from "./annotationText";

async function paint(annotation: AnnotationRegion, width: number, height: number) {
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Canvas unavailable");
	await renderAnnotations(ctx, [annotation], width, height, 0, Math.max(0.2, width / 960));
	return canvas;
}

export function SequenceGraphicDialog({
	initial,
	width,
	height,
	tr,
	close,
	save,
}: {
	initial?: AnnotationRegion;
	width: number;
	height: number;
	tr: boolean;
	close: () => void;
	save: (data: ArrayBuffer, annotation: AnnotationRegion) => Promise<void>;
}) {
	const [item, setItem] = useState<AnnotationRegion>(
		() =>
			initial ?? {
				id: crypto.randomUUID(),
				startMs: 0,
				endMs: 3000,
				zIndex: 1,
				type: "text",
				content: "",
				textContent: "",
				position: { x: 50, y: 50 },
				size: { width: 75, height: 35 },
				style: { ...DEFAULT_ANNOTATION_STYLE },
				figureData: { ...DEFAULT_FIGURE_DATA },
			},
	);
	const canvas = useRef<HTMLCanvasElement>(null);
	const [busy, setBusy] = useState(false),
		[error, setError] = useState("");
	useEffect(() => {
		let live = true;
		const w = Math.min(640, width),
			h = Math.max(1, Math.round((w * height) / width));
		void paint(item, w, h)
			.then((frame) => {
				if (!live || !canvas.current) return;
				canvas.current.width = w;
				canvas.current.height = h;
				canvas.current.getContext("2d")?.drawImage(frame, 0, 0);
			})
			.catch((e) => {
				if (live) setError(String(e));
			});
		return () => {
			live = false;
		};
	}, [item, width, height]);
	async function apply() {
		setBusy(true);
		try {
			const frame = await paint(item, width, height);
			const blob = await new Promise<Blob>((resolve, reject) =>
				frame.toBlob((b) => (b ? resolve(b) : reject(Error("PNG failed"))), "image/png"),
			);
			await save(await blob.arrayBuffer(), item);
		} catch (e) {
			setError(String(e));
		} finally {
			setBusy(false);
		}
	}
	const empty =
		item.type === "text"
			? !getAnnotationText(item).trim()
			: item.type === "image"
				? !getAnnotationImage(item)
				: false;
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !busy) close();
			}}
		>
			<DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto bg-[#181a21] text-white">
				<DialogHeader>
					<DialogTitle>{tr ? "Yazı ve görsel katmanı" : "Titles and graphics"}</DialogTitle>
				</DialogHeader>
				<div className="grid min-h-0 grid-cols-2 gap-3">
					<canvas ref={canvas} className="w-full self-start bg-[#30323c]" />
					<div className="max-h-[60vh] overflow-y-auto">
						<AnnotationSettingsPanel
							annotation={item}
							onContentChange={(content) =>
								setItem((old) => ({
									...old,
									content,
									...(old.type === "text" ? { textContent: content } : { imageContent: content }),
								}))
							}
							onTypeChange={(type) =>
								setItem((old) => ({
									...old,
									type,
									content:
										type === "text"
											? getAnnotationText(old)
											: type === "image"
												? getAnnotationImage(old)
												: "",
								}))
							}
							onFigureDataChange={(figureData) => setItem((old) => ({ ...old, figureData }))}
							onStyleChange={(style) =>
								setItem((old) => ({ ...old, style: { ...old.style, ...style } }))
							}
							onDelete={close}
						/>
					</div>
				</div>
				{error && <p role="alert">{error}</p>}
				<div className="flex justify-end gap-3">
					<button onClick={close} disabled={busy}>
						{tr ? "Vazgeç" : "Cancel"}
					</button>
					<button
						data-testid="save-sequence-graphic"
						className="rounded bg-blue-700 px-3 py-2"
						disabled={empty || busy}
						onClick={apply}
					>
						{tr ? "Katmanı uygula" : "Apply layer"}
					</button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
